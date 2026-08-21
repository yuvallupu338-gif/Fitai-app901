/*
 * whatif.js — the scenario sandbox.
 *
 * Everything in here happens to a copy. The mutation list below is the only
 * state this screen has, simulate() clones the day before touching it, and not
 * one line writes to the store until Apply. That separation is the feature: the
 * whole point of a sandbox is that you can drag your bedtime around and delete
 * tomorrow's hardest task without consequences, and an app that half-commits
 * those experiments is worse than one that never offered them.
 *
 * The comparison is deliberately two numbers side by side rather than one
 * number that changes. Watching 74 become 86 is a nice animation and a bad
 * explanation — you lose the thing you were comparing against.
 */

import { h } from '../core/dom.js';
import { patchItem, removeItem, putItem, putDayPlan } from '../core/store.js';
import { invalidate } from '../core/forecast.js';
import { fromMinutes, toMinutes } from '../core/time.js';
import { simulate, SCENARIO_CHIPS, describe } from '../engine/simulate.js';
import { lineChart, legend } from './chart.js';
import { icon, ICONS, delta } from './parts.js';

export function openWhatIf(ctx) {
  /*
   * The sandbox's entire state. Never persisted, never merged into the store,
   * discarded the moment the panel closes.
   *
   * Chip-driven and hand-made changes are kept apart so a chip can be switched
   * off again without guessing which mutations it contributed. They are
   * concatenated chips-first, because a later mutation of the same kind wins and
   * a bedtime the user typed themselves should beat one a chip suggested.
   */
  const chosen = new Map();
  let manualMuts = [];
  const mutationsNow = () => [].concat(...Array.from(chosen.values())).concat(manualMuts);

  return ctx.flow((host, close) => {
    const body = h('div.flow-body');
    host.appendChild(h('div.flow-inner', null,
      h('header.flow-head', null,
        h('div', null,
          h('h1.flow-title', { text: 'מה אם…' }),
          h('p.sub', { text: 'שנה משהו וראה איך התחזית זזה. הלוח האמיתי לא משתנה עד שתאשר.' })),
        h('button.btn.icon', {
          type: 'button', 'aria-label': 'סגירה', onclick: () => close(),
        }, icon('M6 6 L18 18 M18 6 L6 18', { weight: '2' }))),
      body));

    const paint = () => {
      const mutations = mutationsNow();
      const scenario = simulate(ctx.input, mutations);
      body.textContent = '';
      body.appendChild(comparison(ctx, scenario));
      body.appendChild(chips(ctx, chosen, paint));
      body.appendChild(manual(ctx, mutations, (next) => { manualMuts = next; paint(); }));
      body.appendChild(pending(ctx, mutations, chosen, manualMuts, (nextManual) => {
        manualMuts = nextManual; paint();
      }));
      body.appendChild(actions(ctx, scenario, mutations, close));
    };
    paint();
  }, { testId: 'whatif-panel', label: 'סימולטור תרחישים' });
}

/* ------------------------------------------------------------------ *
 * The comparison
 * ------------------------------------------------------------------ */

function comparison(ctx, scenario) {
  const { base, next, diff } = scenario;
  const fmt = ctx.profile.timeFormat;
  const changed = scenario.mutations.length > 0;

  return h('section.card.whatif-compare', null,
    h('div.compare', null,
      h('div.compare-box', null,
        h('span.compare-label', { text: 'המצב הנוכחי' }),
        h('span.compare-score', { 'data-t': 'whatif-score-base', text: String(base.score) })),
      icon(ICONS.chevron, { class: 'compare-arrow' }),
      h('div.compare-box', null,
        h('span.compare-label', { text: 'בתרחיש' }),
        h('span', {
          class: `compare-score ${!changed ? '' : diff.score > 0 ? 'good' : diff.score < 0 ? 'bad' : ''}`.trim(),
          'data-t': 'whatif-score-next', text: String(next.score),
        }))),

    lineChart({
      id: 'whatif',
      series: [
        { points: base.energy.points, variant: 'energy', fill: false, },
        { points: next.energy.points, variant: 'focus' },
      ],
      from: Math.min(base.energy.from, next.energy.from),
      to: Math.max(base.energy.to, next.energy.to),
      timeFormat: fmt,
      ariaLabel: 'השוואת עקומת האנרגיה בין המצב הנוכחי לתרחיש',
    }),
    legend([
      { variant: 'energy', label: 'כרגע' },
      { variant: 'focus', label: 'בתרחיש' },
    ]),

    h('ul.diff-list', null, scenario.summary.map((line) => h('li', { text: line }))),

    /* Four tracks rather than a wrapping row, for the same reason as the home
     * screen's stats: a wrapped value leaves its label behind. */
    changed ? h('div.statgrid.four', null,
      diffStat('אנרגיה', diff.energy),
      diffStat('ריכוז', diff.focus),
      diffStat('זמן פנוי', diff.free, 'דק׳'),
      diffStat('שינה', diff.sleep, 'דק׳')) : null);
}

function diffStat(label, value, suffix) {
  return h('div.stat', null,
    h('span.stat-value', null, delta(Math.round(value), suffix)),
    h('span.stat-label', { text: label }));
}

/* ------------------------------------------------------------------ *
 * Quick scenarios
 * ------------------------------------------------------------------ */

/*
 * A chip that would do nothing is disabled rather than hidden.
 *
 * "Add a 20-minute break" has nothing to do on a day with no back-to-back run,
 * and "drop the least urgent task" has nothing to do on a day of two locked
 * events. Hiding them makes the row of options change shape every time the day
 * does; disabling them, with the reason on the title, keeps the sandbox
 * predictable.
 */
function chips(ctx, chosen, onChange) {
  return h('section.stack.tight', null,
    h('h2.card-title', { text: 'תרחישים מהירים' }),
    h('div.chip-row', null, SCENARIO_CHIPS.map((chip) => {
      const produced = chip.apply(ctx.input);
      const active = chosen.has(chip.key);
      return h('button.chip', {
        type: 'button', 'data-t': 'whatif-chip',
        class: active ? 'chip is-on' : 'chip',
        disabled: produced.length === 0,
        title: produced.length === 0 ? 'אין מה לשנות ביום הזה' : '',
        'aria-pressed': active ? 'true' : 'false',
        onclick: () => {
          if (active) chosen.delete(chip.key);
          else chosen.set(chip.key, produced);
          onChange();
        },
      }, chip.label);
    })));
}

/* ------------------------------------------------------------------ *
 * Manual controls
 * ------------------------------------------------------------------ */

function manual(ctx, mutations, onChange) {
  const plan = ctx.plan;
  const currentBed = valueOf(mutations, 'bedtime', plan.bedtime);
  const currentEnd = valueOf(mutations, 'endOfDay', plan.nextBedtime);
  const currentWake = valueOf(mutations, 'wake', plan.wake);

  const replace = (kind, minutes) => onChange(
    mutations.filter((m) => m.kind !== kind).concat([{ kind, minutes }]));

  return h('section.card.stack', null,
    h('h2.card-title', { text: 'לשנות בעצמך' }),

    h('label.field', null,
      h('span.label', { text: 'שעת שינה הלילה' }),
      h('input.time-input', {
        type: 'time', 'data-t': 'bedtime', value: fromMinutes(currentBed),
        onchange: (e) => {
          const m = toMinutes(e.target.value);
          if (m !== null) replace('bedtime', m);
        },
      }),
      h('span.field-hint', { text: 'הלילה שלפני היום הזה — זה מה שמזין את עקומת האנרגיה.' })),

    h('label.field', null,
      h('span.label', { text: 'סיום היום' }),
      h('input.time-input', {
        type: 'time', value: fromMinutes(currentEnd),
        onchange: (e) => {
          const m = toMinutes(e.target.value);
          if (m !== null) replace('endOfDay', m);
        },
      })),

    h('label.field', null,
      h('span.label', { text: 'שעת קימה' }),
      h('input.time-input', {
        type: 'time', value: fromMinutes(currentWake),
        onchange: (e) => {
          const m = toMinutes(e.target.value);
          if (m !== null) replace('wake', m);
        },
      })),

    h('div.field', null,
      h('span.label', { text: 'משימות' }),
      ctx.input.items.filter((i) => !i.locked).length
        ? h('div.stack.tight', null, ctx.input.items.filter((i) => !i.locked).map((item) => {
          const removed = mutations.some((m) => m.kind === 'remove' && m.itemId === item.id);
          const start = valueOfItem(mutations, 'move', item.id, item.start);
          return h('div.row.whatif-item', { class: removed ? 'row whatif-item is-removed' : 'row whatif-item' },
            h('span.grow', { text: item.title }),
            h('input.time-input.small', {
              type: 'time', disabled: removed,
              value: start === null ? '' : fromMinutes(start),
              'aria-label': `שעת התחלה של ${item.title}`,
              onchange: (e) => {
                const m = toMinutes(e.target.value);
                if (m === null) return;
                onChange(mutations
                  .filter((x) => !(x.kind === 'move' && x.itemId === item.id))
                  .concat([{ kind: 'move', itemId: item.id, start: m }]));
              },
            }),
            h('button.btn.icon', {
              type: 'button',
              'aria-label': removed ? `להחזיר את ${item.title}` : `להוריד את ${item.title}`,
              onclick: () => {
                if (removed) onChange(mutations.filter((x) => !(x.kind === 'remove' && x.itemId === item.id)));
                else onChange(mutations.concat([{ kind: 'remove', itemId: item.id }]));
              },
            }, icon(removed ? ICONS.undo : ICONS.trash)));
        }))
        : h('p.meta', { text: 'אין מחר משימות שאפשר להזיז — רק אירועים נעולים.' })));
}

function valueOf(mutations, kind, fallback) {
  for (let i = mutations.length - 1; i >= 0; i--) if (mutations[i].kind === kind) return mutations[i].minutes;
  return fallback;
}

function valueOfItem(mutations, kind, itemId, fallback) {
  for (let i = mutations.length - 1; i >= 0; i--) {
    const m = mutations[i];
    if (m.kind === kind && m.itemId === itemId) return m.start;
  }
  return fallback;
}

/* ------------------------------------------------------------------ *
 * Pending changes and the two ways out
 * ------------------------------------------------------------------ */

/*
 * The running list of changes.
 *
 * Only the hand-made ones get a Remove button — a chip's contribution is
 * removed by switching the chip back off, and offering two ways to undo the
 * same thing is how the two lists end up disagreeing.
 */
function pending(ctx, mutations, chosen, manualMuts, onChangeManual) {
  if (!mutations.length) return h('div');
  const chipCount = mutations.length - manualMuts.length;
  return h('section.stack.tight', null,
    h('h2.card-title', { text: 'מה שינית' }),
    h('ul.change-list', null, mutations.map((m, i) => {
      const isManual = i >= chipCount;
      return h('li', null,
        h('span', { text: describe(m, ctx.input.items) }),
        isManual
          ? h('button.btn.quiet.small', {
            type: 'button', 'aria-label': 'לבטל את השינוי הזה',
            onclick: () => onChangeManual(manualMuts.filter((_, k) => k !== i - chipCount)),
          }, 'הסר')
          : h('span.meta', { text: 'תרחיש מהיר' }));
    })));
}

function actions(ctx, scenario, mutations, close) {
  return h('div.flow-actions', null,
    h('button.btn.primary', {
      type: 'button', 'data-t': 'whatif-apply', disabled: mutations.length === 0,
      onclick: () => { commit(ctx, mutations); close(); },
    }, icon(ICONS.check), mutations.length
      ? `להחיל על מחר (${scenario.next.score})`
      : 'להחיל על מחר'),
    h('button.btn.ghost', {
      type: 'button', 'data-t': 'whatif-cancel', onclick: () => close(),
    }, 'ביטול'));
}

/*
 * The one place in this file that writes anything.
 *
 * Mutations are replayed against the store in the order they were made, which
 * is the same order simulate() applied them to the clone. Anything else and the
 * day the user just approved is not the day they get.
 */
function commit(ctx, mutations) {
  for (const m of mutations) {
    switch (m.kind) {
      case 'bedtime': putDayPlan(ctx.date, { nextBedtime: m.minutes }); break;
      case 'wake': putDayPlan(ctx.date, { wake: m.minutes }); break;
      case 'move': patchItem(m.itemId, { start: m.start }); break;
      case 'duration': patchItem(m.itemId, { duration: m.minutes }); break;
      case 'priority': patchItem(m.itemId, { priority: m.priority }); break;
      case 'remove': removeItem(m.itemId); break;
      case 'add': putItem(m.item); break;
      default: break;
    }
  }
  invalidate();
  ctx.refresh();
  ctx.toast('התרחיש הוחל על מחר', 'good');
}
