/*
 * simulate.js — the What If sandbox.
 *
 * One rule, and everything here exists to keep it: a scenario cannot touch
 * anything real. The user is going to drag their bedtime around and delete
 * tomorrow's hardest task just to see what happens, and none of that may reach
 * the store until they press Apply. So simulate() deep-clones its input before
 * it changes a single field, and the validator fingerprints the caller's object
 * before and after to prove nothing leaked.
 *
 * The alternative day is scored by the same forecast() as the real one. There
 * is no separate "preview" model that could drift from the thing it previews —
 * if the sandbox says 86, applying the change gives 86.
 */

import { forecast } from './predict.js';
import { fromMinutes } from '../core/time.js';
import { duration as fmtDuration, signed } from '../core/fmt.js';

const PRIORITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 };
const EFFORT = { low: 0, medium: 1, high: 2 };

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/* Move a clock reading by some minutes, wrapping at midnight in both
 * directions. 00:15 minus half an hour is 23:45, not minus fifteen. */
function shiftClock(minutes, delta) {
  return ((minutes + delta) % 1440 + 1440) % 1440;
}

/*
 * Apply one edit to a cloned day.
 *
 * Unknown mutation kinds are ignored rather than thrown on. A scenario is
 * exploratory by nature and half of it arriving is better than a blank screen —
 * but silence would be worse than either, so simulate() reports back which
 * mutations it actually understood.
 */
function apply(day, mutation) {
  switch (mutation.kind) {
    /*
     * `bedtime` is the night that ends on this date — the one that feeds the
     * day's energy curve, and therefore the one "what if I slept earlier"
     * means while looking at tomorrow. `endOfDay` moves the other end, which
     * changes how much of tomorrow evening is available rather than how
     * rested tomorrow starts.
     */
    case 'bedtime':
      day.plan.bedtime = mutation.minutes;
      return true;
    case 'endOfDay':
      day.plan.nextBedtime = mutation.minutes;
      return true;
    case 'wake':
      day.plan.wake = mutation.minutes;
      return true;
    case 'move': {
      const it = day.items.find((i) => i.id === mutation.itemId);
      if (!it) return false;
      it.start = mutation.start;
      return true;
    }
    case 'duration': {
      const it = day.items.find((i) => i.id === mutation.itemId);
      if (!it) return false;
      it.duration = Math.max(5, mutation.minutes);
      return true;
    }
    case 'priority': {
      const it = day.items.find((i) => i.id === mutation.itemId);
      if (!it) return false;
      it.priority = mutation.priority;
      return true;
    }
    case 'remove': {
      const at = day.items.findIndex((i) => i.id === mutation.itemId);
      if (at < 0) return false;
      day.items.splice(at, 1);
      // A removed task cannot stay on the list of tomorrow's important things,
      // or the goals factor keeps scoring something that is no longer there.
      const top = day.plan.topPriorities.indexOf(mutation.itemId);
      if (top >= 0) day.plan.topPriorities.splice(top, 1);
      return true;
    }
    case 'add':
      day.items.push(clone(mutation.item));
      return true;
    default:
      return false;
  }
}

/**
 * The day as it is, the day as it would be, and the difference between them.
 */
export function simulate(input, mutations) {
  const muts = Array.isArray(mutations) ? mutations : [];
  const base = forecast(Object.assign({}, input));

  const day = { items: clone(input.items), plan: clone(input.plan) };
  const understood = [];
  for (const m of muts) if (apply(day, m)) understood.push(m);

  const next = forecast(Object.assign({}, input, {
    items: day.items, plan: day.plan,
  }));

  const diff = {
    score: next.score - base.score,
    energy: Math.round(mean(next.energy) - mean(base.energy)),
    focus: Math.round(mean(next.focus) - mean(base.focus)),
    load: next.totals.loadMinutes - base.totals.loadMinutes,
    free: next.totals.freeMinutes - base.totals.freeMinutes,
    sleep: next.totals.sleepMinutes - base.totals.sleepMinutes,
  };

  return { base, next, diff, mutations: understood, summary: summarize(base, next, diff) };
}

function mean(curve) {
  if (!curve.points.length) return 0;
  return curve.points.reduce((a, p) => a + p.value, 0) / curve.points.length;
}

/*
 * The difference in words.
 *
 * Only the parts that moved enough to be worth a line. A scenario that shifts
 * average focus by half a point has not really changed anything, and listing it
 * teaches the user to distrust the ones that have.
 */
function summarize(base, next, diff) {
  const out = [];
  if (diff.score !== 0) out.push(`ציון מחר ${base.score} ← ${next.score}`);
  if (Math.abs(diff.energy) >= 2) out.push(`אנרגיה ממוצעת ${signed(diff.energy)}`);
  if (Math.abs(diff.focus) >= 2) out.push(`ריכוז ממוצע ${signed(diff.focus)}`);
  // Read as a length of time, not as a count of minutes. "+2 שעות 45 דק׳" is
  // something somebody can picture; "+165 דק׳" is arithmetic homework.
  if (Math.abs(diff.free) >= 15) {
    out.push(`זמן פנוי ${diff.free > 0 ? '+' : '−'}${fmtDuration(Math.abs(Math.round(diff.free)))}`);
  }
  if (Math.abs(diff.sleep) >= 15) {
    out.push(`שינה ${diff.sleep > 0 ? '+' : '−'}${fmtDuration(Math.abs(Math.round(diff.sleep)))}`);
  }

  const wasOverload = base.risks.find((r) => r.key === 'overload');
  const isOverload = next.risks.find((r) => r.key === 'overload');
  if (wasOverload && !isOverload) out.push('העומס אחר הצהריים יורד מהתחזית');
  else if (!wasOverload && isOverload) out.push('נוצר עומס שלא היה קודם');
  else if (wasOverload && isOverload && isOverload.score < wasOverload.score - 8) {
    const drop = Math.round((1 - isOverload.score / wasOverload.score) * 100);
    out.push(`עומס ${signed(-drop)}%`);
  }

  if (!out.length) out.push('התחזית כמעט לא זזה מהשינוי הזה');
  return out;
}

/* ------------------------------------------------------------------ *
 * Quick scenarios
 *
 * The chips along the top of the sandbox. Each one turns the day it is given
 * into a mutation list, or into an empty one when it does not apply — a chip
 * with nothing to do returns [] and the interface disables it rather than
 * offering a button that changes nothing.
 * ------------------------------------------------------------------ */

export const SCENARIO_CHIPS = [
  {
    key: 'sleep30',
    label: 'לישון חצי שעה מוקדם יותר',
    apply: (input) => [{ kind: 'bedtime', minutes: shiftClock(input.plan.bedtime, -30) }],
  },
  {
    key: 'sleep60',
    label: 'לישון שעה מוקדם יותר',
    apply: (input) => [{ kind: 'bedtime', minutes: shiftClock(input.plan.bedtime, -60) }],
  },
  {
    key: 'earlier',
    label: 'להתחיל את היום מוקדם יותר',
    apply: (input) => [{ kind: 'wake', minutes: Math.max(4 * 60, input.plan.wake - 45) }],
  },
  {
    key: 'hardest',
    label: 'להזיז את המשימה הקשה ביותר',
    /*
     * "Hardest" is the one that asks the most of a head, not the one that takes
     * longest: focus first, then energy, then difficulty. Moving a long easy
     * task changes the shape of the day without changing what it costs.
     */
    apply: (input) => {
      const pool = input.items.filter((i) => !i.locked && i.start !== null && i.status === 'planned');
      if (!pool.length) return [];
      const hardest = pool.slice().sort((a, b) => {
        const ea = EFFORT[a.focusRequirement] * 2 + EFFORT[a.energyRequirement] + a.difficulty / 5;
        const eb = EFFORT[b.focusRequirement] * 2 + EFFORT[b.energyRequirement] + b.difficulty / 5;
        return eb - ea || (a.id < b.id ? -1 : 1);
      })[0];
      const peak = input.plan.wake + 200;
      return [{ kind: 'move', itemId: hardest.id, start: Math.round(peak / 15) * 15 }];
    },
  },
  {
    key: 'break20',
    label: 'להוסיף הפסקה של 20 דקות',
    apply: (input) => {
      const busy = input.items.filter((i) => i.start !== null).sort((a, b) => a.start - b.start);
      if (busy.length < 2) return [];
      let at = null;
      for (let i = 0; i < busy.length - 1; i++) {
        const gap = busy[i + 1].start - (busy[i].start + busy[i].duration);
        if (gap >= 0 && gap < 20) { at = busy[i].start + busy[i].duration; break; }
      }
      if (at === null) return [];
      return [{
        kind: 'add',
        item: {
          id: `itm_sim_brk${at}`, kind: 'task', type: 'break', title: 'הפסקה', notes: '',
          date: input.date, start: at, duration: 20, locked: false,
          category: 'personal', priority: 'low', deadline: null,
          estimatedDuration: 20, actualDuration: null, difficulty: 1,
          energyRequirement: 'low', focusRequirement: 'low', preferredTime: 'any',
          status: 'planned', isTop: false, createdAt: busy[0].createdAt, completedAt: null,
        },
      }];
    },
  },
  {
    key: 'dropLowest',
    label: 'להוריד את המשימה הכי פחות דחופה',
    apply: (input) => {
      const pool = input.items
        .filter((i) => !i.locked && !i.isTop && i.status === 'planned' && i.type !== 'break')
        .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.id < b.id ? -1 : 1));
      if (!pool.length) return [];
      return [{ kind: 'remove', itemId: pool[0].id }];
    },
  },
];

/** A one-line description of a mutation, for the list of pending changes. */
export function describe(mutation, items) {
  const named = (id) => {
    const it = (items || []).find((i) => i.id === id);
    return it ? `"${it.title}"` : 'המשימה';
  };
  switch (mutation.kind) {
    case 'bedtime': return `שינה הלילה ב-${fromMinutes(mutation.minutes)}`;
    case 'endOfDay': return `סיום היום ב-${fromMinutes(mutation.minutes)}`;
    case 'wake': return `קימה ב-${fromMinutes(mutation.minutes)}`;
    case 'move': return `${named(mutation.itemId)} ל-${fromMinutes(mutation.start)}`;
    case 'duration': return `${named(mutation.itemId)} — ${fmtDuration(mutation.minutes)}`;
    case 'priority': return `${named(mutation.itemId)} — עדיפות ${mutation.priority}`;
    case 'remove': return `בלי ${named(mutation.itemId)}`;
    case 'add': return `בתוספת "${mutation.item.title}"`;
    default: return '';
  }
}
