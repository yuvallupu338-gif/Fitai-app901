/*
 * goals.js — "I want to open a web design business" → a programme.
 *
 * The app could already draw a path to a *node you picked from a list*. This
 * turns a goal written in a person's own words into an ordered plan across
 * every tree, with dates, and it does it without a model.
 *
 * That last part is the constraint that shaped the file. An AI-only version
 * would be three lines and would leave the headline feature of the app broken
 * for anyone without an API key (§80). So matching is a scored term search
 * over the catalogue — names, categories, descriptions and the "why" text —
 * plus a small set of intent rules for the goals people actually type. AI, when
 * present, only adds skills the catalogue genuinely lacks.
 *
 * Pure module: it takes a catalogue and a goal string, and returns a plan. No
 * storage, no DOM, and the clock arrives as an argument.
 */

import { statusOf, STATUS } from './unlock.js';
import { levelFor } from './levels.js';

/* Words that carry no signal about *what* someone wants to learn. Without this
 * "I want to learn to build a business" matches every skill containing "build". */
const STOP = new Set([
  'i', 'a', 'an', 'the', 'to', 'and', 'or', 'of', 'for', 'my', 'me', 'my own',
  'want', 'wants', 'wanting', 'would', 'like', 'love', 'need', 'get', 'getting',
  'become', 'becoming', 'be', 'being', 'make', 'making', 'do', 'doing', 'able',
  'learn', 'learning', 'study', 'studying', 'better', 'good', 'great', 'more',
  'start', 'starting', 'begin', 'how', 'can', 'with', 'in', 'on', 'at', 'as',
  'is', 'are', 'it', 'that', 'this', 'so', 'up', 'own', 'some', 'thing', 'things',
  'skills', 'skill', 'work', 'working', 'job', 'career', 'life', 'goal',
]);

/*
 * Intent rules.
 *
 * A term search alone misses the obvious: "open a web design business" contains
 * no word matching "Pricing" or "Contracts", yet those are exactly what the
 * person is missing. These map recognisable goals onto the skills that
 * actually constitute them.
 *
 * Deliberately small and readable. It is a lookup table of common intents, not
 * an attempt at language understanding — anything it does not recognise still
 * gets the term search, and the UI is honest about what it matched.
 */
const INTENTS = [
  {
    id: 'freelance_web',
    /* Every pattern must match for the rule to fire, so "web design" alone does
     * not drag in the whole business tree. */
    all: [/\b(web\w*|site\w*|design\w*|dev|develop\w*|frontend|digital)\b/, /\b(business\w*|freelanc\w*|agenc\w*|client\w*|self.?employ\w*|studio|compan\w*|sell\w*|money|income|paid|earn\w*|charge)\b/],
    label: 'Freelance web work',
    trees: ['web', 'business'],
    /* Order matters — see the anchor weighting in matchSkills. The business
     * milestone leads; enough front-end to actually deliver a site follows. */
    anchors: ['working_business', 'css_responsive'],
  },
  {
    id: 'freelance_any',
    all: [/\b(freelanc\w*|self.?employ\w*|own business|start a business|agenc\w*|client\w*)\b/],
    label: 'Working for yourself',
    trees: ['business'],
    anchors: ['working_business', 'first_client'],
  },
  {
    id: 'frontend',
    all: [/\b(frontend|front.end|web develop\w*|website\w*|react|css|html|ui develop\w*)\b/],
    label: 'Front-end development',
    trees: ['web'],
    anchors: ['react_routing', 'css_responsive'],
  },
  {
    id: 'fullstack',
    all: [/\b(full.?stack|backend|back.end|api|apis|server\w*|database\w*)\b/],
    label: 'Full-stack development',
    trees: ['web'],
    anchors: ['fullstack'],
  },
  {
    id: 'calisthenics',
    all: [/\b(muscle.?up\w*|pull.?up\w*|push.?up\w*|handstand\w*|lever|calisthenic\w*|bodyweight|stronger|fitness|fitter)\b/],
    label: 'Bodyweight strength',
    trees: ['calisthenics'],
    /* Only a general "get stronger" should reach the athlete milestone; a
     * goal naming one move is served by that move, which the term match
     * scores far higher. */
    anchors: ['calisthenics_athlete'],
  },
  {
    id: 'maths',
    all: [/\b(math\w*|calculus|algebra|statistic\w*|geometr\w*|trigonometr\w*)\b/],
    label: 'Mathematics',
    trees: ['math'],
    anchors: ['calculus_mastery'],
  },
];

export function tokenise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s+#.-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.\-]+|[.\-]+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/*
 * Crude but effective stemming: match on a prefix so "designing" hits "design"
 * and "businesses" hits "business". A real stemmer is not worth a dependency
 * here, and the failure mode of prefix matching — an occasional loose match —
 * is much kinder than missing the obvious one.
 */
function termHit(term, text) {
  if (!text) return false;
  const haystack = text.toLowerCase();
  if (haystack.includes(term)) return true;
  if (term.length > 4 && haystack.includes(term.slice(0, Math.max(4, term.length - 2)))) return true;
  return false;
}

/**
 * Score every skill in the catalogue against a goal.
 *
 * Weighted by where the term was found: a hit in the skill's name means far
 * more than a hit in a paragraph of its lesson description.
 */
export function matchSkills(goalText, catalog) {
  const terms = tokenise(goalText);
  if (!terms.length) return { matches: [], intents: [], terms };

  const raw = String(goalText || '').toLowerCase();
  const intents = INTENTS.filter((intent) => intent.all.every((re) => re.test(raw)));
  const intentTrees = new Set(intents.flatMap((i) => i.trees));

  /*
   * Anchor weight, by position and by how well-evidenced the intent is.
   *
   * An intent whose rules required two independent signals — "web design" AND
   * "business" — is a confident reading of a broad goal, and its destination
   * should outrank an incidental name match. Without that, "I want to build
   * websites for clients" produced a plan aimed at Choosing Clients and Client
   * Communication, because those skills happen to have "client" in the name,
   * while the actual destination scored lower.
   *
   * A single-signal intent stays modest, so a goal that names one specific
   * thing — "muscle up" — is still served by that thing rather than by the
   * tree's furthest milestone.
   */
  const anchorWeight = new Map();
  for (const intent of intents) {
    const confident = intent.all.length >= 2;
    const scale = confident ? [20, 11, 6] : [12, 7, 4];
    intent.anchors.forEach((id, i) => {
      const weight = scale[i] ?? 3;
      if ((anchorWeight.get(id) ?? 0) < weight) anchorWeight.set(id, weight);
    });
  }

  const matches = [];

  for (const tree of catalog.allTrees()) {
    for (const skill of tree.skills) {
      let score = 0;
      const why = [];

      for (const term of terms) {
        /* A hit in the name is the learner naming the thing. It has to
         * outrank everything else, or "I want to do a muscle up" produces a
         * plan whose destination is a front lever. */
        if (termHit(term, skill.name)) { score += 14; why.push(term); }
        else if (termHit(term, skill.category)) score += 4;
        else if (termHit(term, skill.description)) score += 2;
        else if (termHit(term, skill.why)) score += 1;
      }

      /* A recognised intent pulls in its whole tree, which is what makes
       * "open a web design business" reach Pricing and Contracts — words the
       * learner never typed but unmistakably needs. */
      if (intentTrees.has(tree.id)) score += 5;

      /* Anchors are ranked, not a flat set. A flat +14 for every anchor made
       * each intent produce three or four destinations, and a plan with four
       * destinations is four plans — it was returning 226-week programmes. */
      score += anchorWeight.get(skill.id) ?? 0;

      if (score > 0) matches.push({ skill, tree, score, terms: [...new Set(why)] });
    }
  }

  matches.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
  return { matches, intents, terms };
}

/*
 * Pick the destinations.
 *
 * A programme needs targets, not a list of forty loosely-related skills. The
 * highest-scoring skills are taken as destinations, and everything they depend
 * on comes along automatically — so choosing "A Working Business" quietly
 * includes pricing, proposals and contracts without them needing to score.
 *
 * Skills that are prerequisites of other chosen targets are dropped as
 * destinations, because a plan whose milestones are "HTML" and "React" reads
 * as two goals when it is one.
 */
export function chooseTargets(matches, catalog, limit = 3) {
  const chosen = [];
  if (!matches.length) return chosen;

  /*
   * Only destinations comparable to the strongest one.
   *
   * Taking the top N regardless of score was the bug that produced four-year
   * programmes: "open a web design business" acquired Web Performance and
   * Accessibility as destinations simply by being fourth and fifth in a long
   * list. A destination has to be nearly as good a match as the best one, or
   * it is not what the person asked for.
   */
  const floor = matches[0].score * 0.7;

  for (const match of matches) {
    if (chosen.length >= limit) break;
    if (match.score < floor) break;
    const index = catalog.getIndex(match.tree.id);
    if (!index) continue;

    const alreadyImplied = chosen.some((c) => {
      if (c.tree.id !== match.tree.id) return false;
      return catalog.ancestorsOf(index, c.skill.id).has(match.skill.id);
    });
    if (alreadyImplied) continue;

    /*
     * A lower-scoring skill that sits *beyond* an already-chosen destination
     * is skipped rather than replacing it.
     *
     * An earlier version promoted to the furthest milestone in the tree, on
     * the theory that it subsumed the smaller one. The effect was that "I want
     * to do a muscle up" produced a plan whose destination was Calisthenics
     * Athlete — 416 hours including handstands and front levers, neither of
     * which a muscle-up needs. If someone names a destination, that is the
     * destination.
     */
    const beyondAChosenTarget = chosen.some((c) => c.tree.id === match.tree.id
      && catalog.ancestorsOf(index, match.skill.id).has(c.skill.id));
    if (beyondAChosenTarget) continue;

    chosen.push(match);
  }

  return chosen;
}

/*
 * Weekly capacity, in hours.
 *
 * The onboarding asks for minutes per day, which is what people can estimate.
 * Multiplying by seven would produce a plan nobody meets, so this assumes
 * about five active days a week — matching how people actually behave, and
 * making the dates the plan produces defensible rather than optimistic.
 */
export function weeklyHours(minutesPerDay) {
  const minutes = Math.max(5, Number(minutesPerDay) || 20);
  return (minutes * 5) / 60;
}

/**
 * Build the programme.
 *
 * Returns ordered steps with cumulative hours and a projected week for each,
 * grouped into phases. Skills the learner has already completed are marked
 * done and contribute no remaining time — so a plan built by someone who
 * already knows HTML does not tell them to spend six hours on it.
 *
 * @param opts { catalog, state, goalText, minutesPerDay, now }
 */
export function buildProgramme(opts) {
  const { catalog, state, goalText } = opts;
  const now = opts.now ?? Date.now();
  const perWeek = weeklyHours(opts.minutesPerDay);

  const { matches, intents, terms } = matchSkills(goalText, catalog);
  if (!matches.length) {
    return { ok: false, reason: 'no_match', terms, goalText };
  }

  const targets = chooseTargets(matches, catalog);

  /* Collect every skill needed for every target, in dependency order. */
  const seen = new Set();
  const steps = [];

  for (const target of targets) {
    const index = catalog.getIndex(target.tree.id);
    const needed = catalog.pathTo(index, target.skill.id);

    for (const skillId of needed) {
      if (seen.has(skillId)) continue;
      seen.add(skillId);

      const skill = index.byId.get(skillId);
      const progress = state.skills[skillId];
      const status = statusOf(index, skillId, (id) => state.skills[id]);

      const level = progress
        ? levelFor({
          xp: progress.xp || 0,
          masteryScore: progress.masteryScore || 0,
          capacity: progress.capacity || 0,
          started: !!progress.startedAt,
        })
        : 0;

      /* Estimated hours remaining: the midpoint of the skill's range, reduced
       * by how far in the learner already is. Completed skills cost nothing. */
      const range = skill.estimatedHours || [2, 4];
      const midpoint = (range[0] + range[1]) / 2;
      const done = level >= 3;
      const remaining = done ? 0 : midpoint * (1 - Math.min(1, level / 3) * 0.6);

      steps.push({
        skillId,
        skill,
        tree: target.tree,
        treeId: target.tree.id,
        status,
        level,
        done,
        hours: Math.round(remaining * 10) / 10,
        isTarget: skillId === target.skill.id,
        targetFor: skillId === target.skill.id ? target.skill.name : null,
      });
    }
  }

  /* Cumulative time and a projected week per step. */
  let cumulative = 0;
  for (const step of steps) {
    cumulative += step.hours;
    step.cumulativeHours = Math.round(cumulative * 10) / 10;
    step.week = step.done ? 0 : Math.max(1, Math.ceil(cumulative / perWeek));
  }

  const remainingHours = Math.round(cumulative * 10) / 10;
  const weeks = Math.max(1, Math.ceil(remainingHours / perWeek));

  return {
    ok: true,
    goalText,
    terms,
    intents: intents.map((i) => ({ id: i.id, label: i.label })),
    targets: targets.map((t) => ({ skillId: t.skill.id, name: t.skill.name, treeId: t.tree.id, treeName: t.tree.name })),
    steps,
    phases: intoPhases(steps),
    totalSteps: steps.length,
    doneSteps: steps.filter((s) => s.done).length,
    remainingHours,
    weeks,
    perWeek: Math.round(perWeek * 10) / 10,
    finishesAt: now + weeks * 7 * 86400000,
    trees: [...new Set(steps.map((s) => s.treeId))],
  };
}

/*
 * Group the steps into phases.
 *
 * A flat list of thirty skills is a wall. Phases give the plan a shape a
 * person can hold — and the boundaries are meaningful rather than decorative:
 * everything already done, then what is open now, then what each remaining
 * target unlocks.
 */
function intoPhases(steps) {
  const phases = [];

  const done = steps.filter((s) => s.done);
  if (done.length) {
    phases.push({
      key: 'done',
      title: 'Already yours',
      blurb: 'Counted, and skipped in the estimate.',
      steps: done,
    });
  }

  const rest = steps.filter((s) => !s.done);
  if (!rest.length) return phases;

  /* Up to four steps you could start today. More than that is not a next
   * action, it is another list. */
  const openNow = rest.filter((s) => s.status !== STATUS.LOCKED).slice(0, 4);
  if (openNow.length) {
    phases.push({
      key: 'now',
      title: 'Start here',
      blurb: 'Open to you today.',
      steps: openNow,
    });
  }

  const later = rest.filter((s) => !openNow.includes(s));
  if (later.length) {
    /* Split the remainder in two so the far end reads as "later" rather than
     * as an equally urgent thirty-item list. */
    const half = Math.ceil(later.length / 2);
    phases.push({
      key: 'next',
      title: 'Then',
      blurb: 'Opens as the earlier steps land.',
      steps: later.slice(0, half),
    });
    if (later.length > half) {
      phases.push({
        key: 'later',
        title: 'Later',
        blurb: 'The far end of the plan.',
        steps: later.slice(half),
      });
    }
  }

  return phases;
}

/**
 * This week's work: the next few unfinished, unlocked steps, with the specific
 * activity to do in each. Keeps the plan actionable rather than admirable.
 */
export function thisWeek(programme, nextActivityFor, state, limit = 3) {
  if (!programme?.ok) return [];

  return programme.steps
    .filter((s) => !s.done && s.status !== STATUS.LOCKED)
    .slice(0, limit)
    .map((step) => ({
      ...step,
      activity: nextActivityFor(step.skill, state.skills[step.skillId]),
    }))
    .filter((s) => s.activity);
}
