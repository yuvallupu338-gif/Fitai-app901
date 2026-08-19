/*
 * demo.js — a complete, believable month of somebody's life.
 *
 * The demo exists so a first-time visitor can see what the app is for before
 * they have given it anything. That only works if the numbers agree with each
 * other: a high sleep risk next to an excellent sleep score reads as a mock-up,
 * and once one figure is obviously decorative none of the others are believed.
 *
 * So nothing here is a hand-typed headline. The history is generated first —
 * twenty-four days of nights, tasks, how long they really took and whether they
 * got done — and every derived number the app then shows is computed from it by
 * the same engine that runs on real data. The learning profile is literally
 * updateLearning() over these records. The validator recomputes it and fails the
 * build if the stored copy has drifted, which is the only way to keep a demo
 * honest as the engine changes underneath it.
 *
 * Two patterns are deliberately planted in the history, because a demo with no
 * discoverable pattern makes the Insights screen look broken:
 *
 *   1. Work started before 11:00 gets finished; work parked after 20:30 mostly
 *      does not. This is the single most useful thing the app can notice about
 *      a person, and it is the brief's own example.
 *   2. Study tasks run about a third longer than Alex estimates. Not a rounding
 *      error, not a wild one — the size of miss a real person makes and never
 *      quite corrects for.
 *
 * They are planted as behaviour, not as conclusions. The detectors in
 * insights.js have to find them the same way they would find them in a real
 * user, and if a detector regresses the demo goes quiet rather than lying.
 */

import { addDays, todayKey, dayOfWeek } from '../core/time.js';
import { emptyRoot } from '../storage/schema.js';
import { updateLearning } from '../engine/learning.js';

/*
 * A seeded generator, so the demo is the same demo every time.
 *
 * Math.random() is banned across this codebase and would be wrong here for a
 * second reason: two people comparing notes about the demo, or one person
 * reloading it, must see the same history. This is a plain linear congruential
 * generator with the constants from Numerical Recipes — not good randomness,
 * but the requirement is repeatability, not unpredictability.
 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

function item(over) {
  return Object.assign({
    id: 'itm_x', kind: 'task', type: 'task', title: '', notes: '',
    date: '', start: null, duration: 30, locked: false,
    category: 'other', priority: 'medium', deadline: null,
    estimatedDuration: 30, actualDuration: null, difficulty: 3,
    energyRequirement: 'medium', focusRequirement: 'medium', preferredTime: 'any',
    status: 'planned', isTop: false, createdAt: '', completedAt: null,
  }, over);
}

/* The recurring shape of Alex's week. School most days, training three times,
 * and the homework that piles up behind both. */
const STUDY_TASKS = [
  { title: 'שיעורי בית במתמטיקה', est: 45, focus: 'high', energy: 'medium', diff: 4 },
  { title: 'תרגול לאנגלית', est: 30, focus: 'medium', energy: 'low', diff: 2 },
  { title: 'לקרוא לספרות', est: 40, focus: 'high', energy: 'low', diff: 3 },
  { title: 'סיכום היסטוריה', est: 35, focus: 'medium', energy: 'medium', diff: 3 },
  { title: 'עבודה בפיזיקה', est: 60, focus: 'high', energy: 'high', diff: 5 },
];

const HOME_TASKS = [
  { title: 'לסדר את החדר', est: 25, focus: 'low', energy: 'low', diff: 1 },
  { title: 'קניות', est: 40, focus: 'low', energy: 'medium', diff: 2 },
  { title: 'לענות להודעות', est: 15, focus: 'low', energy: 'low', diff: 1 },
];

/*
 * How long a task really took.
 *
 * Study work overruns by about a third; chores land close to the estimate. The
 * noise is deliberately small — a person's bias is consistent, which is exactly
 * why it is learnable and why "you tend to need about 35% longer than you think"
 * is a true and useful sentence rather than an average of chaos.
 */
function actualFor(r, category, estimate) {
  const bias = category === 'study' ? 1.35 : 1.06;
  const noise = (r() - 0.5) * 0.18;
  return Math.max(5, Math.round((estimate * (bias + noise)) / 5) * 5);
}

/*
 * Whether it got done, decided by when it was put.
 *
 * This is the planted pattern, and it is planted as a probability rather than a
 * rule so the history looks like a person's rather than a lookup table. Morning
 * work almost always happens; late-evening work is a coin flip that lands badly.
 */
function completed(r, start) {
  if (start === null) return r() < 0.35;
  if (start < 11 * 60) return r() < 0.92;
  if (start < 17 * 60) return r() < 0.78;
  if (start < 20.5 * 60) return r() < 0.66;
  return r() < 0.42;
}

/* Short nights cost energy the next morning. The correlation is real in the
 * data so sleepEnergyCorrelation has something true to find. */
function morningFor(r, sleepMinutes) {
  const base = (sleepMinutes - 300) / 90;              // ~1 at 6h30, ~3 at 9h
  const energy = Math.max(1, Math.min(5, Math.round(base + (r() - 0.5))));
  const quality = Math.max(1, Math.min(5, Math.round(base + 0.3 + (r() - 0.5) * 0.8)));
  const mood = Math.max(1, Math.min(5, Math.round((energy + quality) / 2 + (r() - 0.5) * 0.6)));
  return { energy, mood, quality };
}

/**
 * A full TomorrowAI world: a profile, a month behind it and a real day ahead.
 *
 * `now` fixes which calendar days the history lands on, so the demo is always
 * "the last few weeks" rather than a fixed stretch of 2026 that ages badly.
 */
export function demoRoot(nowIso, now) {
  const root = emptyRoot(nowIso);
  const today = todayKey(now);
  const r = rng(20260903);

  root.user.demo = true;
  root.user.onboarded = true;
  root.profile = Object.assign({}, root.profile, {
    name: 'אלכס',
    wakeTime: 420,
    bedTime: 1400,
    priorities: ['school', 'fitness', 'focus'],
    focusPreference: 'morning',
    createdAt: nowIso,
  });
  root.settings.firstRun = false;

  /* ---------------------------------------------------------- history */

  const HISTORY = 24;
  for (let back = HISTORY; back >= 1; back--) {
    const date = addDays(today, -back);
    const dow = dayOfWeek(date);
    const schoolDay = dow >= 0 && dow <= 4;          // Sunday to Thursday
    const trainDay = dow === 0 || dow === 2 || dow === 4;

    /*
     * Bedtime drifts later across the week and snaps back at the weekend, which
     * is what gives bestDayOfWeek and lowestEnergyDay something real to sit on.
     */
    const drift = schoolDay ? dow * 8 : -25;
    const bedtime = 1380 + drift + between(r, -15, 20);
    const wake = schoolDay ? 415 + between(r, -8, 10) : 500 + between(r, -20, 30);
    const sleepMinutes = wake - (bedtime - 1440);
    const m = morningFor(r, sleepMinutes);

    const dayItems = [];
    let n = 0;
    const mk = (over) => {
      const it = item(Object.assign({ id: `itm_h${back}_${n++}`, date, createdAt: nowIso }, over));
      dayItems.push(it);
      return it;
    };

    if (schoolDay) {
      mk({ kind: 'event', type: 'event', title: 'בית ספר', start: 480, duration: 300,
        locked: true, priority: 'high', category: 'study', focusRequirement: 'medium',
        energyRequirement: 'medium', status: 'done', completedAt: nowIso, actualDuration: 300 });
    }
    if (trainDay) {
      mk({ kind: 'event', type: 'workout', title: 'אימון', start: 1020, duration: 60,
        locked: true, priority: 'high', category: 'fitness', energyRequirement: 'high',
        focusRequirement: 'low', status: 'done', completedAt: nowIso, actualDuration: 60 });
    }

    const taskCount = between(r, 2, 4);
    for (let k = 0; k < taskCount; k++) {
      const isStudy = r() < 0.7;
      const spec = isStudy ? pick(r, STUDY_TASKS) : pick(r, HOME_TASKS);
      const category = isStudy ? 'study' : 'personal';
      /*
       * Where the task lands. Alex means to work in the morning and mostly
       * ends up working in the evening, which is precisely the habit the
       * insight is going to point out.
       */
      const slot = r();
      const start = slot < 0.22 ? between(r, 8, 10) * 60 + 30 * between(r, 0, 1)
        : slot < 0.55 ? between(r, 14, 16) * 60 + 30 * between(r, 0, 1)
          : between(r, 20, 22) * 60 + 30 * between(r, 0, 1);

      const done = completed(r, start);
      const actual = done ? actualFor(r, category, spec.est) : null;
      mk({
        title: spec.title, start, duration: spec.est, estimatedDuration: spec.est,
        actualDuration: actual, difficulty: spec.diff, category,
        focusRequirement: spec.focus, energyRequirement: spec.energy,
        priority: isStudy ? (spec.diff >= 4 ? 'high' : 'medium') : 'low',
        status: done ? 'done' : 'skipped',
        completedAt: done ? nowIso : null,
        isTop: isStudy && spec.diff >= 4 && k === 0,
      });
    }

    for (const it of dayItems) root.items[it.id] = it;

    const tasks = dayItems.filter((i) => i.kind === 'task');
    const doneCount = tasks.filter((i) => i.status === 'done').length;
    const focusMinutes = tasks
      .filter((i) => i.status === 'done' && i.focusRequirement !== 'low')
      .reduce((a, i) => a + (i.actualDuration || i.duration), 0);

    root.days[date] = {
      date, wake, bedtime, nextBedtime: bedtime,
      eveningState: { energy: m.energy, mood: m.mood, stress: 6 - m.mood },
      topPriorities: tasks.filter((i) => i.isTop).map((i) => i.id),
      preparedAt: nowIso, appliedPlanId: null,
    };

    /*
     * The score that was predicted that evening, and the one the day earned.
     * They are close but not equal, because a forecast that were always right
     * would make the accuracy screen meaningless and a demo that claims 98%
     * accuracy is the exact thing the brief says not to build.
     */
    const rate = tasks.length ? doneCount / tasks.length : 1;
    const dayScore = Math.round(Math.max(30, Math.min(96,
      40 + rate * 35 + (sleepMinutes - 400) / 12 + (m.energy - 3) * 3)));
    const predicted = Math.max(30, Math.min(96, dayScore + between(r, -9, 9)));

    root.records[date] = {
      date,
      forecast: { date, score: predicted, label: '', band: '', factors: [], energy: { hourly: [] },
        focus: { hourly: [] }, focusWindows: [], risks: [],
        confidence: { overall: 60, level: 'medium' },
        totals: { loadMinutes: 0, freeMinutes: 0, sleepMinutes, awakeMinutes: 0,
          taskCount: tasks.length, doneCount, topCount: 0 } },
      morning: { energy: m.energy, mood: m.mood, sleepQuality: m.quality, at: nowIso },
      checkpoints: [],
      actual: { dayScore, completed: doneCount, planned: tasks.length, focusMinutes, sleepMinutes },
      review: { tags: rate < 0.6 ? ['tasks_longer'] : ['accurate'], note: '', at: nowIso },
      accuracy: null,
    };
  }

  /* ---------------------------------------------------- today and tomorrow */

  const tomorrow = addDays(today, 1);

  /*
   * A real Wednesday, not a showroom. School, training, two pieces of work that
   * genuinely matter, and one that does not. The project sits late in the
   * afternoon on purpose — it is the highest-focus thing on the day placed at
   * the hour Alex's own history says is weakest, so "Improve Tomorrow" has
   * something true to find rather than a cosmetic shuffle to perform.
   */
  const T = [
    item({ id: 'itm_t0', date: tomorrow, kind: 'event', type: 'event', title: 'בית ספר',
      start: 480, duration: 300, locked: true, priority: 'high', category: 'study',
      focusRequirement: 'medium', energyRequirement: 'medium', createdAt: nowIso }),
    item({ id: 'itm_t1', date: tomorrow, type: 'break', title: 'צהריים ומנוחה',
      start: 795, duration: 45, category: 'personal', priority: 'low',
      focusRequirement: 'low', energyRequirement: 'low', difficulty: 1,
      estimatedDuration: 45, createdAt: nowIso }),
    item({ id: 'itm_t2', date: tomorrow, title: 'שיעורי בית במתמטיקה',
      start: 870, duration: 45, estimatedDuration: 45, category: 'study',
      focusRequirement: 'high', energyRequirement: 'medium', difficulty: 4,
      priority: 'high', isTop: true, createdAt: nowIso }),
    item({ id: 'itm_t3', date: tomorrow, title: 'עבודה בפיזיקה',
      start: 930, duration: 60, estimatedDuration: 60, category: 'study',
      focusRequirement: 'high', energyRequirement: 'high', difficulty: 5,
      priority: 'critical', isTop: true, deadline: addDays(today, 3), createdAt: nowIso }),
    item({ id: 'itm_t4', date: tomorrow, kind: 'event', type: 'workout', title: 'אימון',
      start: 1020, duration: 60, locked: true, priority: 'high', category: 'fitness',
      energyRequirement: 'high', focusRequirement: 'low', createdAt: nowIso }),
    item({ id: 'itm_t5', date: tomorrow, title: 'תרגול לאנגלית',
      start: 1230, duration: 30, estimatedDuration: 30, category: 'study',
      focusRequirement: 'medium', energyRequirement: 'low', difficulty: 2,
      priority: 'medium', createdAt: nowIso }),
    item({ id: 'itm_t6', date: tomorrow, title: 'לסדר את החדר',
      start: null, duration: 25, estimatedDuration: 25, category: 'personal',
      focusRequirement: 'low', energyRequirement: 'low', difficulty: 1,
      priority: 'low', createdAt: nowIso }),
  ];
  for (const it of T) root.items[it.id] = it;

  root.days[tomorrow] = {
    date: tomorrow, wake: 420, bedtime: 1400, nextBedtime: 1400,
    eveningState: { energy: 3, mood: 4, stress: 3 },
    topPriorities: ['itm_t2', 'itm_t3'],
    preparedAt: nowIso, appliedPlanId: null,
  };

  root.days[today] = {
    date: today, wake: 425, bedtime: 1395, nextBedtime: 1400,
    eveningState: null, topPriorities: [], preparedAt: null, appliedPlanId: null,
  };

  /* ---------------------------------------------------------- learning */

  /*
   * Computed, never typed. This is the line that keeps the demo honest: the
   * profile the app shows is the profile its own history produces, so a change
   * to the learning model updates the demo automatically instead of quietly
   * making it a lie.
   */
  root.learning = updateLearning(root.learning, recordsNewestFirst(root), Object.values(root.items), {});
  root.ui = Object.assign({}, root.ui, { view: 'tomorrow' });

  return root;
}

function recordsNewestFirst(root) {
  return Object.values(root.records).sort((a, b) => (a.date < b.date ? 1 : -1));
}
