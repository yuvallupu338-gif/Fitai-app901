/*
 * onboarding.js — six steps, then the dashboard (§42).
 *
 * The design rule: every step either changes what the app will do, or is cut.
 * A "how did you hear about us" step is why people abandon onboarding, and a
 * step whose answer is never used again is a lie about being listened to.
 *
 * So: name (used in the greeting), area (picks the tree), level (skips
 * material you already have), time (sets both mission intensity and the
 * programme's pace), and the goal in the learner's own words — which the goal
 * engine resolves into an ordered plan. Five questions, each with a visible
 * consequence, and the last one shows you its consequence as you type.
 *
 * The level answer is the one worth explaining. Claiming "intermediate" does
 * not hand out levels — it seeds the prerequisite skills at a level that makes
 * the tree usable, so an experienced learner is not made to sit a quiz on what
 * a browser is. They can still be wrong about themselves, and the graded
 * activities will find that out; what this avoids is making everyone start
 * from zero regardless of what they already know.
 */

import { h, clear, announce } from '../core/dom.js';
import { icon, brandMark } from './icons.js';
import * as store from '../core/store.js';
import * as session from '../core/session.js';
import { go } from '../core/router.js';
import * as catalog from '../data/catalog.js';
import { buildProgramme } from '../domain/goals.js';
import { applyAttempt } from '../domain/progress.js';
import { INTENSITY } from '../domain/missions.js';
import { pathTo } from '../domain/graph.js';

export function renderOnboarding(host) {
  const answers = {
    name: store.get()?.name || '',
    treeId: null,
    level: 'beginner',
    minutes: 20,
    targetSkillId: null,
    goalText: '',
  };

  let step = 0;
  const shell = h('div.onboard');
  const card = h('div.onboard-card');
  shell.appendChild(card);

  const STEPS = [welcome, whoAreYou, whatArea, whatLevel, howMuchTime, whatGoal];

  function draw() {
    clear(card);
    card.appendChild(h('div.steps', ...STEPS.map((_, i) => h('i', {
      class: i === step ? 'on' : i < step ? 'done' : '',
    }))));
    STEPS[step](card, answers, { next, back, finish });
  }

  function next() { step = Math.min(STEPS.length - 1, step + 1); draw(); }
  function back() { step = Math.max(0, step - 1); draw(); }

  function finish() {
    commit(answers);
    go('dashboard');
  }

  clear(host);
  host.appendChild(shell);
  draw();
}

/* ------------------------------------------------------------------ *
 * Steps
 * ------------------------------------------------------------------ */

function welcome(card, answers, nav) {
  card.appendChild(h('div.stack.loose',
    h('div', { style: { color: 'var(--lime)' } }, brandMark(40)),
    h('div',
      h('h1', 'SkillTree'),
      h('p', { style: { color: 'var(--bone-dim)', marginTop: 'var(--s3)', fontSize: '15px' } },
        'A skill tree for real abilities. Nodes unlock when you meet their requirements — a quiz you passed, a challenge whose tests went green, a standard you can actually hit.'),
      h('p', { style: { color: 'var(--bone-dimmer)', fontSize: '14px' } },
        'Nothing here unlocks because you pressed "done".')),
    h('button.btn.primary.big.wide', { 'data-autofocus': '', onclick: nav.next }, 'Set up')));
}

function whoAreYou(card, answers, nav) {
  const input = h('input.input', {
    type: 'text',
    value: answers.name,
    placeholder: 'Your name',
    'aria-label': 'Your name',
    oninput: (e) => { answers.name = e.target.value; },
    onkeydown: (e) => { if (e.key === 'Enter') nav.next(); },
  });

  card.appendChild(h('div.stack.loose',
    h('div',
      h('h1', 'What should we call you?'),
      h('p', { style: { color: 'var(--bone-dim)', marginTop: 'var(--s2)' } }, 'Only used to greet you. It stays on this device.')),
    input,
    h('div.row', { style: { gap: 'var(--s2)' } },
      h('button.btn', { onclick: nav.back }, 'Back'),
      h('button.btn.primary.wide', { onclick: nav.next }, 'Continue'))));

  window.requestAnimationFrame(() => input.focus());
}

function whatArea(card, answers, nav) {
  const trees = catalog.allTrees();
  if (!answers.treeId) answers.treeId = trees[0].id;

  const list = h('div.stack.tight', ...trees.map((tree) => h('button.pick', {
    'aria-pressed': String(answers.treeId === tree.id),
    onclick: () => { answers.treeId = tree.id; answers.targetSkillId = null; redraw(); },
  },
  h('span.pick-mark'),
  h('span.pick-body', tree.name, h('small', tree.tagline)))));

  function redraw() {
    for (const btn of list.children) btn.setAttribute('aria-pressed', 'false');
    const idx = trees.findIndex((t) => t.id === answers.treeId);
    if (idx >= 0) list.children[idx].setAttribute('aria-pressed', 'true');
  }

  card.appendChild(h('div.stack.loose',
    h('div',
      h('h1', 'What do you want to get better at?'),
      h('p', { style: { color: 'var(--bone-dim)', marginTop: 'var(--s2)' } },
        'Pick one to start. You can work on all of them, and you can generate your own tree later.')),
    list,
    h('div.row', { style: { gap: 'var(--s2)' } },
      h('button.btn', { onclick: nav.back }, 'Back'),
      h('button.btn.primary.wide', { onclick: nav.next }, 'Continue'))));
}

function whatLevel(card, answers, nav) {
  const options = [
    { key: 'beginner', label: 'New to this', blurb: 'Start at the roots.' },
    { key: 'some', label: 'Some experience', blurb: 'Skip the very basics.' },
    { key: 'intermediate', label: 'Comfortable already', blurb: 'Open up the middle of the tree.' },
  ];

  const list = h('div.stack.tight', ...options.map((o) => h('button.pick', {
    'aria-pressed': String(answers.level === o.key),
    onclick: () => {
      answers.level = o.key;
      for (const btn of list.children) btn.setAttribute('aria-pressed', 'false');
      list.children[options.indexOf(o)].setAttribute('aria-pressed', 'true');
    },
  },
  h('span.pick-mark'),
  h('span.pick-body', o.label, h('small', o.blurb)))));

  card.appendChild(h('div.stack.loose',
    h('div',
      h('h1', 'Where are you starting from?'),
      h('p', { style: { color: 'var(--bone-dim)', marginTop: 'var(--s2)' } },
        'This opens up part of the tree so you are not made to re-learn the basics. The graded activities will still tell you the truth.')),
    list,
    h('div.row', { style: { gap: 'var(--s2)' } },
      h('button.btn', { onclick: nav.back }, 'Back'),
      h('button.btn.primary.wide', { onclick: nav.next }, 'Continue'))));
}

function howMuchTime(card, answers, nav) {
  const options = [
    { minutes: 10, label: '10 minutes a day', intensity: 'light' },
    { minutes: 20, label: '20 minutes a day', intensity: 'normal' },
    { minutes: 45, label: '45 minutes a day', intensity: 'intensive' },
  ];

  const list = h('div.stack.tight', ...options.map((o) => h('button.pick', {
    'aria-pressed': String(answers.minutes === o.minutes),
    onclick: () => {
      answers.minutes = o.minutes;
      for (const btn of list.children) btn.setAttribute('aria-pressed', 'false');
      list.children[options.indexOf(o)].setAttribute('aria-pressed', 'true');
    },
  },
  h('span.pick-mark'),
  h('span.pick-body', o.label, h('small', INTENSITY[o.intensity].blurb)))));

  card.appendChild(h('div.stack.loose',
    h('div',
      h('h1', 'How much time do you have?'),
      h('p', { style: { color: 'var(--bone-dim)', marginTop: 'var(--s2)' } },
        'Sets how many things land on your list each day. Changeable in Settings.')),
    list,
    h('div.row', { style: { gap: 'var(--s2)' } },
      h('button.btn', { onclick: nav.back }, 'Back'),
      h('button.btn.primary.wide', { onclick: nav.next }, 'Continue'))));
}

function whatGoal(card, answers, nav) {
  /*
   * A written goal, not a menu.
   *
   * The earlier version offered the five deepest nodes of the chosen tree and
   * called it a goal. That is the app's vocabulary, not the learner's — nobody
   * arrives wanting "Full Stack Developer", they arrive wanting to build
   * websites for people who will pay them. Taking the sentence they would
   * actually say and resolving it to skills is the whole point of the goal
   * engine, and this is where it earns its place.
   */
  const tree = catalog.getTree(answers.treeId);

  const suggestions = {
    web: ['Become a frontend developer', 'Open a web design business', 'Build and ship my own app'],
    math: ['Get comfortable with calculus', 'Stop being afraid of algebra', 'Understand statistics properly'],
    calisthenics: ['Do a muscle-up', 'Hold a handstand', 'Get a front lever'],
    business: ['Open a web design business', 'Get my first paying client', 'Go full-time freelance'],
  }[answers.treeId] || [];

  const preview = h('div');

  const input = h('input.input', {
    type: 'text',
    value: answers.goalText,
    placeholder: 'e.g. open a web design business',
    'aria-label': 'What do you want to be able to do?',
    oninput: (e) => { answers.goalText = e.target.value; showPreview(); },
    onkeydown: (e) => { if (e.key === 'Enter' && answers.goalText.trim().length > 2) nav.finish(); },
  });

  /* Live feedback while typing: seeing "27 skills, about 2 years at 20 min a
   * day" before committing is the difference between a goal and a wish. */
  let pending = null;
  function showPreview() {
    window.clearTimeout(pending);
    pending = window.setTimeout(() => {
      clear(preview);
      const text = answers.goalText.trim();
      if (text.length < 3) return;

      const programme = buildProgramme({
        catalog,
        state: store.get() || { skills: {} },
        goalText: text,
        minutesPerDay: answers.minutes,
      });

      if (!programme.ok) {
        preview.appendChild(h('div.notice.warn', icon('info', { size: 16 }),
          h('span', 'Nothing built in covers that yet — you can still continue, and generate a tree for it from Explore.')));
        return;
      }

      preview.appendChild(h('div.notice', icon('target', { size: 16 }),
        h('span', `${programme.totalSteps} skills, about ${programme.remainingHours} hours — roughly ${programme.weeks} weeks at ${answers.minutes} minutes a day. Ending at ${programme.targets.map((t) => t.name).join(' and ')}.`)));
    }, 250);
  }

  card.appendChild(h('div.stack.loose',
    h('div',
      h('h1', 'What are you aiming at?'),
      h('p', { style: { color: 'var(--bone-dim)', marginTop: 'var(--s2)' } },
        'In your own words — the thing you want to be true, not a skill name. The app works out which skills that needs and in what order.')),
    input,
    preview,
    suggestions.length
      ? h('div.row.wrap', { style: { gap: 'var(--s2)' } },
        ...suggestions.map((text) => h('button.chip', {
          onclick: () => { answers.goalText = text; input.value = text; showPreview(); },
        }, text)))
      : null,
    h('div.row', { style: { gap: 'var(--s2)' } },
      h('button.btn', { onclick: nav.back }, 'Back'),
      h('button.btn.primary.wide', {
        onclick: () => {
          if (!answers.goalText.trim()) answers.goalText = suggestions[0] || tree.name;
          nav.finish();
        },
      }, 'Build my plan'))));

  window.requestAnimationFrame(() => input.focus());
}

/* ------------------------------------------------------------------ *
 * Commit
 * ------------------------------------------------------------------ */

/*
 * Turn the answers into state.
 *
 * The experience seeding runs real attempts through `applyAttempt` rather than
 * writing skill records directly. That matters: it means the seeded progress
 * carries an XP ledger, mastery derived from actual scores, and the same
 * unlock consequences a learner would have earned — so a self-declared
 * intermediate has a coherent history rather than a set of numbers that no
 * sequence of events could have produced.
 */
function commit(answers) {
  const index = catalog.getIndex(answers.treeId);
  const intensity = answers.minutes <= 10 ? 'light' : answers.minutes >= 45 ? 'intensive' : 'normal';

  store.update((profile) => {
    const goalText = answers.goalText.trim();

    /* Resolve the written goal to a destination so the tree screen's goal path
     * lights up too. If nothing matches, the plan is still stored — Explore can
     * generate a tree for it, and the plan screen says so. */
    const programme = goalText
      ? buildProgramme({ catalog, state: profile, goalText, minutesPerDay: answers.minutes })
      : { ok: false };

    let next = {
      ...profile,
      name: answers.name.trim(),
      onboarded: true,
      settings: { ...profile.settings, intensity },
      plan: goalText ? { goalText, createdAt: Date.now(), minutesPerDay: answers.minutes } : null,
      goal: programme.ok
        ? {
          treeId: programme.targets[0].treeId,
          targetSkillId: programme.targets[0].skillId,
          text: goalText,
          createdAt: Date.now(),
        }
        : null,
    };

    const depth = answers.level === 'intermediate' ? 3 : answers.level === 'some' ? 1 : 0;
    if (depth > 0) {
      const seedIds = shallowSkills(index, depth);
      const now = Date.now();

      seedIds.forEach((skillId, i) => {
        const skill = index.byId.get(skillId);
        const graded = (skill.activities || []).filter((a) => a.kind !== 'learn');
        /* Spread the seeded attempts backwards over recent weeks so the
         * consistency and retention components of mastery have something
         * plausible to read, rather than fifty attempts at the same instant. */
        const at = now - (seedIds.length - i) * 36e5 * 12;

        for (const activity of (skill.activities || []).slice(0, 2)) {
          const applied = applyAttempt(next, index, {
            skillId,
            activityId: activity.id,
            kind: activity.kind,
            score: graded.length ? 82 : null,
            passed: true,
            id: `seed:${activity.id}`,
          }, at);
          next = applied.state;
        }
      });
    }

    return next;
  });

  announce('Setup complete');
}

/*
 * The skills at or below a given depth — the "basics" an experienced learner
 * can be credited with. Uses the graph rather than a hand-listed set, so it
 * stays correct when a tree changes.
 */
function shallowSkills(index, maxDepth) {
  const depth = new Map();
  const visit = (id) => {
    if (depth.has(id)) return depth.get(id);
    const reqs = index.byId.get(id).requires || [];
    const d = reqs.length ? Math.max(...reqs.map((r) => visit(r.skillId) + 1)) : 0;
    depth.set(id, d);
    return d;
  };
  for (const skill of index.tree.skills) visit(skill.id);

  return index.tree.skills
    .filter((s) => depth.get(s.id) < maxDepth)
    .sort((a, b) => depth.get(a.id) - depth.get(b.id))
    .map((s) => s.id);
}
