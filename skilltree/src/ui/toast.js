/*
 * toast.js — the moments (§64–66).
 *
 * Everything the progression engine reports flows through here: XP, skill
 * levels, unlocks, achievements, global levels. Two rules shape it.
 *
 * First, the announcements are derived from the events `applyAttempt` returned,
 * never re-derived by the UI. If the engine did not say a skill unlocked, no
 * toast claims one did.
 *
 * Second, a level-up interrupts and everything else does not. A modal for
 * every +10 XP would be intolerable by the fourth activity, so small things
 * are corner toasts that stack and expire, and only the rare, genuinely
 * significant moment takes the screen. Getting that ratio wrong is what makes
 * gamified apps exhausting.
 */

import { h, sheet, announce, reduceMotion } from '../core/dom.js';
import { icon } from './icons.js';

let layer = null;

function ensureLayer() {
  if (!layer || !layer.isConnected) {
    layer = h('div.toasts', { 'aria-live': 'polite', 'aria-atomic': 'false' });
    document.body.appendChild(layer);
  }
  return layer;
}

/**
 * A corner toast. `body` may contain elements, so an XP figure can be set in
 * the monospace face without the caller building the DOM.
 */
export function toast(body, opts = {}) {
  const el = h(`div.toast${opts.kind ? `.${opts.kind}` : ''}`,
    opts.icon ? icon(opts.icon, { size: 17 }) : null,
    h('span', body));

  ensureLayer().appendChild(el);

  const life = opts.duration ?? 3200;
  window.setTimeout(() => {
    el.classList.add('leaving');
    window.setTimeout(() => el.remove(), reduceMotion ? 0 : 220);
  }, life);

  return el;
}

/**
 * Render the engine's event list.
 *
 * Order matters: XP first because it is the immediate feedback for the action
 * just taken, then unlocks, then achievements, then the level-up modal last so
 * it lands on top of a screen that already shows the smaller consequences.
 */
export function announceEvents(events, badges = [], opts = {}) {
  const list = events || [];

  const xp = list.find((e) => e.type === 'xp');
  if (xp) {
    toast([h('b', `+${xp.amount} XP`)], { kind: 'xp', icon: 'bolt', duration: 2600 });
  }

  for (const e of list) {
    if (e.type === 'mastered') {
      toast([h('b', 'Mastered.'), ' ', opts.nameOf ? opts.nameOf(e.skillId) : ''], { icon: 'star', duration: 4000 });
    }
    if (e.type === 'skill_level' && e.to < 5) {
      toast([opts.nameOf ? opts.nameOf(e.skillId) : 'Skill', ' is now ', h('b', `level ${e.to}`)], { icon: 'trend' });
    }
    if (e.type === 'unlocked') {
      toast([h('b', e.name), ' unlocked.'], { icon: 'plus', duration: 4000 });
    }
  }

  for (const badge of badges || []) {
    toast([h('b', badge.name), ' — ', badge.description], { icon: 'award', duration: 4600 });
  }

  const levelUp = list.find((e) => e.type === 'global_level');
  if (levelUp) showLevelUp(levelUp, list);

  /* One combined line for assistive tech rather than five separate live
   * regions firing over each other. */
  const spoken = [];
  if (xp) spoken.push(`${xp.amount} XP earned`);
  for (const e of list) {
    if (e.type === 'unlocked') spoken.push(`${e.name} unlocked`);
    if (e.type === 'mastered') spoken.push('Skill mastered');
  }
  for (const b of badges || []) spoken.push(`Achievement: ${b.name}`);
  if (levelUp) spoken.push(`Level ${levelUp.to} reached`);
  if (spoken.length) announce(spoken.join('. '));
}

/**
 * The one interruption in the app (§65). Short, dismissible, no loop, and it
 * lists exactly what changed rather than a generic congratulation.
 */
export function showLevelUp(event, allEvents = []) {
  const unlocked = allEvents.filter((e) => e.type === 'unlocked');
  const mastered = allEvents.filter((e) => e.type === 'mastered');

  const lines = [];
  if (unlocked.length) {
    lines.push(unlocked.length === 1
      ? `${unlocked[0].name} unlocked`
      : `${unlocked.length} skills unlocked`);
  }
  if (mastered.length) lines.push(`${mastered.length === 1 ? 'A skill' : `${mastered.length} skills`} mastered`);

  const { close } = sheet(
    h('div.moment',
      h('div.moment-kicker', 'Level up'),
      h('div.moment-jump',
        h('span.from.num', String(event.from)),
        icon('arrow', { size: 22 }),
        h('span.to.num', String(event.to))),
      lines.length ? h('ul', ...lines.map((t) => h('li', t))) : null,
      h('div', { style: { marginTop: 'var(--s5)' } },
        h('button.btn.primary.big.wide', { 'data-autofocus': '', onclick: () => close() }, 'Continue'))),
    { label: `Level ${event.to} reached` },
  );
}

/**
 * The unlock moment for a skill opened outside an activity — used by the tree
 * when a gate opens after a goal change.
 */
export function showUnlocked(names) {
  if (!names.length) return;
  toast(names.length === 1
    ? [h('b', names[0]), ' unlocked.']
    : [h('b', `${names.length} skills`), ' unlocked.'], { icon: 'plus', duration: 4200 });
}

