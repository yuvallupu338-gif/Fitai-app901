/*
 * onboarding.js — six steps, then the dashboard (§42).
 *
 * The design rule: every step either changes what the app will do, or is cut.
 * A "how did you hear about us" step is why people abandon onboarding, and a
 * step whose answer is never used again is a lie about being listened to.
 *
 * So: name (used in the greeting), area (picks the tree), level (skips
 * material you already have), time (sets mission intensity), goal (draws the
 * path through the tree). Five questions, each with a visible consequence.
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
import { allTrees, getIndex, getTree } from '../data/catalog.js';
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
  const trees = allTrees();
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
  const tree = getTree(answers.treeId);
  const index = getIndex(answers.treeId);

  /* Candidate goals are the deep nodes — the ones that require several
   * branches. Offering every skill as a goal would be a 33-item list where
   * most entries are waypoints rather than destinations. */
  const candidates = tree.skills
    .filter((s) => (s.requires || []).length >= 2 || s.category === 'Milestone')
    .sort((a, b) => (b.requires?.length || 0) - (a.requires?.length || 0))
    .slice(0, 5);

  if (!answers.targetSkillId && candidates.length) answers.targetSkillId = candidates[0].id;

  const list = h('div.stack.tight', ...candidates.map((skill) => {
    const steps = pathTo(index, skill.id).length;
    return h('button.pick', {
      'aria-pressed': String(answers.targetSkillId === skill.id),
      onclick: () => {
        answers.targetSkillId = skill.id;
        for (const btn of list.children) btn.setAttribute('aria-pressed', 'false');
        list.children[candidates.indexOf(skill)].setAttribute('aria-pressed', 'true');
      },
    },
    h('span.pick-mark'),
    h('span.pick-body', skill.name, h('small', `${steps} skills on the path · ${skill.description}`)));
  }));

  card.appendChild(h('div.stack.loose',
    h('div',
      h('h1', 'What are you aiming at?'),
      h('p', { style: { color: 'var(--bone-dim)', marginTop: 'var(--s2)' } },
        'This draws a path through the tree and shapes what gets recommended. You can change it any time.')),
    list,
    h('div.row', { style: { gap: 'var(--s2)' } },
      h('button.btn', { onclick: nav.back }, 'Back'),
      h('button.btn.primary.wide', { onclick: nav.finish }, 'Build my tree'))));
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
  const index = getIndex(answers.treeId);
  const intensity = answers.minutes <= 10 ? 'light' : answers.minutes >= 45 ? 'intensive' : 'normal';

  store.update((profile) => {
    let next = {
      ...profile,
      name: answers.name.trim(),
      onboarded: true,
      settings: { ...profile.settings, intensity },
      goal: answers.targetSkillId
        ? {
          treeId: answers.treeId,
          targetSkillId: answers.targetSkillId,
          text: index.byId.get(answers.targetSkillId)?.name || '',
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
