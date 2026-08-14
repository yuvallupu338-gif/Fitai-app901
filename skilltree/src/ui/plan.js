/*
 * plan.js — the goal screen: write what you want, get a programme.
 *
 * The design problem here is that honest estimates are discouraging. "Open a
 * web design business" at half an hour a day genuinely is a couple of years,
 * and a screen whose headline is "125 weeks" is a screen people close.
 *
 * The answer is not to lie about the number. It is to lead with the part that
 * is actionable — the next thing, and the first milestone — and put the full
 * horizon where someone can find it, next to the lever that changes it (their
 * daily time). So: what to do this week, then the phases, then the total with
 * its assumption stated.
 */

import { h, clear, num } from '../core/dom.js';
import { icon } from './icons.js';
import * as session from '../core/session.js';
import * as store from '../core/store.js';
import * as catalog from '../data/catalog.js';
import { go } from '../core/router.js';
import { openSkill } from './skillpanel.js';
import { buildProgramme, thisWeek } from '../domain/goals.js';
import { nextActivityFor } from '../domain/missions.js';
import { STATUS } from '../domain/unlock.js';
import { hasAnyKey } from '../ai/provider.js';

const EXAMPLES = [
  'Open a web design business',
  'Become a frontend developer',
  'Do a muscle-up',
  'Get comfortable with calculus',
];

export function renderPlan(host) {
  const profile = session.freshProfile();
  const page = h('div.wrap.stack.loose');

  page.appendChild(h('div.page-head',
    h('div',
      h('h1', 'Your goal'),
      h('p', 'Say what you want to be able to do. The app works out which skills that needs, in what order, and how long it takes at your pace.'))));

  const body = h('div.stack.loose');
  page.appendChild(body);

  clear(host);
  host.appendChild(page);

  if (profile.plan?.goalText) drawProgramme(body, profile, host);
  else drawGoalForm(body, profile, host);
}

/* ------------------------------------------------------------------ *
 * Asking
 * ------------------------------------------------------------------ */

function drawGoalForm(host, profile, screenHost) {
  clear(host);

  const input = h('input.input', {
    type: 'text',
    placeholder: 'e.g. open a web design business',
    'aria-label': 'What do you want to be able to do?',
    'data-autofocus': '',
    onkeydown: (e) => { if (e.key === 'Enter') submit(); },
  });

  const feedback = h('div');

  function submit() {
    const text = input.value.trim();
    if (text.length < 3) {
      clear(feedback);
      feedback.appendChild(h('div.notice.warn', icon('alert', { size: 16 }),
        h('span', 'Say a bit more — a few words about what you want to be able to do.')));
      return;
    }
    setGoal(text, screenHost);
  }

  host.appendChild(h('div.card.feature',
    h('div.eyebrow', 'Start here'),
    h('h2', 'What do you want to be able to do?'),
    h('p', { style: { color: 'var(--bone-dim)', margin: 'var(--s2) 0 var(--s4)' } },
      'In your own words. Not a skill — the thing you want to be true.'),
    h('div.row.wrap', { style: { gap: 'var(--s2)' } },
      input,
      h('button.btn.primary', { onclick: submit }, 'Build my plan')),
    feedback,
    h('div.row.wrap', { style: { gap: 'var(--s2)', marginTop: 'var(--s4)' } },
      h('span.card-note', 'For example:'),
      ...EXAMPLES.map((example) => h('button.chip', {
        onclick: () => { input.value = example; submit(); },
      }, example)))));
}

function setGoal(text, screenHost) {
  const profile = session.freshProfile();
  const programme = buildProgramme({
    catalog,
    state: profile,
    goalText: text,
    minutesPerDay: profile.plan?.minutesPerDay || minutesFromIntensity(profile),
  });

  if (!programme.ok) {
    /* Honest failure with the one real way forward, rather than a shrug. */
    const host = screenHost.querySelector('.wrap .stack.loose') || screenHost;
    const notice = h('div.card', h('div.stack',
      h('h3', `Nothing in the app covers "${text}" yet`),
      h('p', { style: { color: 'var(--bone-dim)' } },
        hasAnyKey()
          ? 'The built-in trees do not reach that. You can generate a tree for it, then set it as your goal.'
          : 'The built-in trees cover programming, mathematics, calisthenics and freelance business. You can generate a tree for anything else with an AI key, or try wording it differently.'),
      h('div.row.wrap', { style: { gap: 'var(--s2)' } },
        h('button.btn.primary', { onclick: () => go('explore') }, 'Generate a tree for it'),
        h('button.btn', { onclick: () => renderPlan(screenHost) }, 'Try different words'))));
    clear(host);
    host.appendChild(notice);
    return;
  }

  /* The goal is stored, not the programme: it is derived from live progress,
   * so caching it would go stale the moment anything is completed. The primary
   * target also becomes the tree-screen goal, so the existing goal path lights
   * up without a second concept. */
  store.update((p) => ({
    ...p,
    plan: { goalText: text, createdAt: Date.now(), minutesPerDay: p.plan?.minutesPerDay || minutesFromIntensity(p) },
    goal: {
      treeId: programme.targets[0].treeId,
      targetSkillId: programme.targets[0].skillId,
      text,
      createdAt: Date.now(),
    },
  }));

  renderPlan(screenHost);
}

function minutesFromIntensity(profile) {
  return { light: 10, normal: 20, intensive: 45 }[profile.settings?.intensity || 'normal'] || 20;
}

/* ------------------------------------------------------------------ *
 * Showing
 * ------------------------------------------------------------------ */

function drawProgramme(host, profile, screenHost) {
  clear(host);

  const minutesPerDay = profile.plan.minutesPerDay || minutesFromIntensity(profile);
  const programme = buildProgramme({
    catalog,
    state: profile,
    goalText: profile.plan.goalText,
    minutesPerDay,
  });

  if (!programme.ok) {
    host.appendChild(h('div.card', h('div.empty',
      icon('alert', { size: 28 }),
      h('h3', 'That goal no longer maps to anything'),
      h('p', 'The trees it referred to may have changed.'),
      h('button.btn.primary', { onclick: () => clearGoal(screenHost) }, 'Set a new goal'))));
    return;
  }

  const week = thisWeek(programme, nextActivityFor, profile, 3);
  const pct = programme.totalSteps ? Math.round((programme.doneSteps / programme.totalSteps) * 100) : 0;

  /* ---- the goal itself ---- */
  host.appendChild(h('div.card.feature',
    h('div.row.between', { style: { alignItems: 'flex-start', gap: 'var(--s3)' } },
      h('div',
        h('div.eyebrow', 'Goal'),
        h('h2', profile.plan.goalText)),
      h('button.btn.ghost.small', { onclick: () => clearGoal(screenHost) }, 'Change')),

    h('div.row.wrap', { style: { gap: 'var(--s2)', marginTop: 'var(--s3)' } },
      ...programme.targets.map((t) => h('button.chip.on', {
        onclick: () => openSkill(t.skillId, { onChange: () => renderPlan(screenHost) }),
      }, t.name))),

    h('div.bar.tall', { style: { marginTop: 'var(--s4)' } },
      h('i', { style: { width: `${pct}%` } })),
    h('div.row.between', { style: { marginTop: 'var(--s2)', fontSize: '12px', color: 'var(--bone-dimmer)' } },
      h('span.num', `${programme.doneSteps} of ${programme.totalSteps} skills`),
      h('span.num', `${pct}%`))));

  /* ---- what to do now ---- */
  if (week.length) {
    host.appendChild(h('div.card',
      h('div.card-head',
        h('span.card-title', 'Do this next'),
        h('span.card-note', 'The first open steps on the path')),
      h('div.list', ...week.map((step) => h('button.list-item', {
        onclick: () => go(`activity/${step.activity.id}`),
      },
      h('span', { style: { color: 'var(--lime)', display: 'flex' }, 'aria-hidden': 'true' }, icon('play', { size: 15 })),
      h('div.grow',
        h('div.title', step.skill.name),
        h('div.sub', step.activity.title)),
      h('span.chip', `~${step.hours}h`))))));
  } else if (programme.doneSteps === programme.totalSteps) {
    host.appendChild(h('div.card', h('div.empty',
      icon('star', { size: 28 }),
      h('h3', 'You have reached it'),
      h('p', `Every skill on the path to "${profile.plan.goalText}" is complete.`),
      h('button.btn.primary', { onclick: () => clearGoal(screenHost) }, 'Set a new goal'))));
  }

  /* ---- the estimate, with its assumption stated ---- */
  const finish = new Date(programme.finishesAt);
  host.appendChild(h('div.card',
    h('div.card-head',
      h('span.card-title', 'How long'),
      h('span.card-note', `at ${minutesPerDay} min a day`)),
    h('div.grid.cols-3.stats', { style: { gap: 'var(--s3)' } },
      h('div.card.quiet', h('div.stat', h('span.k', 'Remaining'), h('span.v', num(programme.remainingHours), h('small', ' h')))),
      h('div.card.quiet', h('div.stat', h('span.k', 'At your pace'), h('span.v', horizon(programme.weeks)))),
      h('div.card.quiet', h('div.stat', h('span.k', 'On track for'),
        h('span.v', { style: { fontSize: '17px' } },
          finish.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))))),

    /* The lever that changes the number, right beside it. */
    h('div', { style: { marginTop: 'var(--s4)' } },
      h('div.card-note', { style: { marginBottom: 'var(--s2)' } }, 'Change your daily time and the plan re-times itself:'),
      h('div.row.wrap', { style: { gap: 'var(--s2)' } },
        ...[10, 20, 30, 45, 60].map((mins) => h('button.chip', {
          class: mins === minutesPerDay ? 'on' : '',
          onclick: () => {
            store.update((p) => ({ ...p, plan: { ...p.plan, minutesPerDay: mins } }));
            renderPlan(screenHost);
          },
        }, `${mins} min`)))),

    h('div.card-note', { style: { marginTop: 'var(--s3)' } },
      'Estimates come from each skill\'s own hour range, reduced by how far into it you already are. They are a projection, not a promise.')));

  /* ---- the phases ---- */
  for (const phase of programme.phases) {
    host.appendChild(h('div.card',
      h('div.card-head',
        h('span.card-title', phase.title),
        h('span.card-note', phase.blurb)),
      h('div.list', ...phase.steps.map((step) => stepRow(step, screenHost)))));
  }

  /* ---- where it came from ---- */
  host.appendChild(h('div.notice',
    icon('info', { size: 16 }),
    h('span', programme.intents.length
      ? `Read as: ${programme.intents.map((i) => i.label).join(', ')}. Spanning ${programme.trees.map((id) => catalog.getTree(id)?.name).filter(Boolean).join(' and ')}.`
      : `Matched on: ${programme.terms.join(', ')}. Spanning ${programme.trees.map((id) => catalog.getTree(id)?.name).filter(Boolean).join(' and ')}.`)));
}

function stepRow(step, screenHost) {
  const locked = step.status === STATUS.LOCKED;

  return h('button.list-item', {
    onclick: () => openSkill(step.skillId, { onChange: () => renderPlan(screenHost) }),
  },
  h('span', {
    style: { color: step.done ? 'var(--lime)' : 'var(--bone-dimmer)', display: 'flex' },
    'aria-hidden': 'true',
  }, icon(step.done ? 'check' : locked ? 'lock' : 'play', { size: 15 })),

  h('div.grow',
    h('div.title', {
      style: step.done ? { color: 'var(--bone-dim)' } : {},
    }, step.skill.name),
    h('div.sub', step.tree.name + (step.isTarget ? ' · destination' : ''))),

  step.done
    ? h('span.chip.on', `Lv.${step.level}`)
    : h('span.chip', `~${step.hours}h`));
}

/*
 * Weeks are a poor unit past about three months — "125 weeks" is a number
 * nobody converts. Past that, say it the way a person would.
 */
function horizon(weeks) {
  if (weeks <= 1) return 'this week';
  if (weeks < 9) return `${weeks} weeks`;
  const months = Math.round(weeks / 4.35);
  if (months < 18) return `${months} months`;
  const years = Math.round((months / 12) * 10) / 10;
  return `${years} years`;
}

function clearGoal(screenHost) {
  store.update((p) => ({ ...p, plan: null }));
  renderPlan(screenHost);
}
