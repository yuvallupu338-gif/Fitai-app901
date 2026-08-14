/*
 * learn.js — what the app can honestly say it has noticed.
 *
 * THE RULE THIS FILE ENFORCES: NO CLAIM WITHOUT ENOUGH OBSERVATIONS.
 *
 * "משימות תכנות לוקחות לך יותר זמן ממה שאתה מעריך" is a useful sentence after
 * twelve sessions and a lie after two. Every function here returns its sample
 * size alongside its finding, and returns `ok: false` below the threshold
 * rather than a weak version of the claim. The interface prints "מבוסס על 12
 * סשנים" next to the finding, so a person can weigh it themselves.
 *
 * This is also what §163 is about. Before there is data the app says "לפי
 * ההעדפות שהגדרת" — reporting back what it was told. It does not say "למדנו
 * שאתה" until it has actually learned something, because an app that claims
 * to know you on day one is an app you stop believing on day two.
 *
 * WHAT IS DELIBERATELY NOT HERE.
 *
 * No inference about mood, energy, focus capacity, or whether somebody is
 * struggling. The app asks about energy when it needs to know, and takes the
 * answer. Deriving a psychological state from click timing is both unreliable
 * and none of its business.
 */

import { addDays, today as todayIso, isoDay } from '../core/time.js';

const MIN_SESSIONS = 8;
const MIN_PER_BUCKET = 5;

/* ------------------------------------------------------------------ *
 * Estimate calibration
 * ------------------------------------------------------------------ */

/**
 * How the estimates compare to reality.
 *
 * Only sessions on tasks that were actually finished count. An unfinished task
 * with 20 minutes logged says nothing about how long it takes — it says
 * somebody worked on it for 20 minutes.
 *
 * The centre is the median ratio, not the mean. One afternoon where a task
 * estimated at 30 minutes took four hours would drag a mean far enough to make
 * every subsequent estimate useless, and that afternoon is not representative
 * of anything except that afternoon.
 */
export function estimateCalibration(opts) {
  const tasks = opts.tasks || [];
  const sessions = opts.focusSessions || [];

  const minutesByTask = new Map();
  for (const s of sessions) {
    if (!s.taskId || !s.actualMinutes) continue;
    minutesByTask.set(s.taskId, (minutesByTask.get(s.taskId) || 0) + s.actualMinutes);
  }

  const ratios = [];
  for (const task of tasks) {
    if (task.status !== 'done') continue;
    const estimated = task.estimatedMinutes || 0;
    const actual = minutesByTask.get(task.id) || task.actualMinutes || 0;
    if (estimated < 5 || actual < 3) continue;
    ratios.push({ ratio: actual / estimated, task, estimated, actual });
  }

  if (ratios.length < MIN_SESSIONS) {
    return { ok: false, sampleSize: ratios.length, needed: MIN_SESSIONS };
  }

  const sorted = ratios.slice().sort((a, b) => a.ratio - b.ratio);
  const median = sorted[Math.floor(sorted.length / 2)].ratio;

  /* A 15% band counts as accurate. Tighter than that and the app would report
   * a "finding" every time somebody rounded 25 up to 30. */
  const drift = median - 1;
  const verdict = Math.abs(drift) <= 0.15 ? 'accurate' : (drift > 0 ? 'over' : 'under');

  return {
    ok: true,
    sampleSize: ratios.length,
    median: Math.round(median * 100) / 100,
    driftPct: Math.round(Math.abs(drift) * 100),
    verdict,
    /* Applied to future estimates only when the app is asked for a suggested
     * duration; it never silently rewrites what a person typed. */
    suggestedMultiplier: verdict === 'accurate' ? 1 : Math.round(median * 10) / 10,
  };
}

/**
 * The same, split by area, which is where the interesting finding usually is:
 * estimates are fine for errands and badly off for anything that involves
 * writing code.
 */
export function calibrationByArea(opts) {
  const areas = opts.areas || [];
  const out = [];
  for (const area of areas) {
    const tasks = (opts.tasks || []).filter((t) => t.areaId === area.id);
    const result = estimateCalibration({ tasks, focusSessions: opts.focusSessions });
    if (result.ok && result.verdict !== 'accurate') {
      out.push(Object.assign({ area }, result));
    }
  }
  return out.sort((a, b) => b.driftPct - a.driftPct);
}

/* ------------------------------------------------------------------ *
 * Time of day
 * ------------------------------------------------------------------ */

const BUCKETS = [
  { key: 'morning', from: 5 * 60, to: 12 * 60 },
  { key: 'afternoon', from: 12 * 60, to: 17 * 60 },
  { key: 'evening', from: 17 * 60, to: 22 * 60 },
  { key: 'night', from: 22 * 60, to: 24 * 60 + 5 * 60 },
];

function bucketOf(minutes) {
  for (const b of BUCKETS) if (minutes >= b.from && minutes < b.to) return b.key;
  return 'night';
}

/**
 * When sessions actually go well.
 *
 * "Well" is measured by outcome — how often a session ends with "done" or
 * "progress" rather than "stuck" — and by how much of the planned time was
 * used. Both come from the question asked at the end of every session, which
 * is a person's own report rather than an inference from behaviour.
 */
export function productiveWindows(opts) {
  const sessions = (opts.focusSessions || []).filter((s) => s.endedAt && s.actualMinutes >= 5);
  if (sessions.length < MIN_SESSIONS) {
    return { ok: false, sampleSize: sessions.length, needed: MIN_SESSIONS };
  }

  const buckets = new Map();
  for (const s of sessions) {
    const startMinutes = s.startMinutes !== undefined && s.startMinutes !== null
      ? s.startMinutes
      : minutesOfInstant(s.startedAt);
    const key = bucketOf(startMinutes);
    const b = buckets.get(key) || { key, count: 0, good: 0, minutes: 0, completion: 0 };
    b.count += 1;
    b.minutes += s.actualMinutes;
    if (s.outcome === 'done' || s.outcome === 'progress') b.good += 1;
    b.completion += s.plannedMinutes > 0 ? Math.min(1.5, s.actualMinutes / s.plannedMinutes) : 1;
    buckets.set(key, b);
  }

  const scored = Array.from(buckets.values())
    .filter((b) => b.count >= MIN_PER_BUCKET)
    .map((b) => Object.assign(b, {
      successRate: b.good / b.count,
      avgCompletion: b.completion / b.count,
      score: (b.good / b.count) * 0.6 + Math.min(1, b.completion / b.count) * 0.4,
    }))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { ok: false, sampleSize: sessions.length, needed: MIN_PER_BUCKET };

  const best = scored[0];
  const worst = scored[scored.length - 1];

  return {
    ok: true,
    sampleSize: sessions.length,
    buckets: scored,
    best,
    /* Only worth reporting when the gap is real. Two buckets a few percent
     * apart is not a preference, it is a sample. */
    meaningful: scored.length > 1 && best.score - worst.score > 0.2,
  };
}

function minutesOfInstant(ms) {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/* ------------------------------------------------------------------ *
 * Postponement
 * ------------------------------------------------------------------ */

/** Tasks that keep getting pushed. §137 — five is the threshold. */
export function stuckTasks(tasks, threshold) {
  const limit = threshold || 5;
  return (tasks || [])
    .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
    .filter((t) => (t.postponeCount || 0) >= limit)
    .sort((a, b) => (b.postponeCount || 0) - (a.postponeCount || 0));
}

/**
 * Which day of the week the plan tends to fall apart on.
 * Wants four weeks before it will say anything.
 */
export function weekdayReliability(opts) {
  const activity = opts.activity || [];
  const from = addDays(opts.today || todayIso(), -28);

  const byDow = new Map();
  for (const e of activity) {
    if (e.type !== 'TASK_COMPLETED' && e.type !== 'TASK_RESCHEDULED') continue;
    const day = isoDay(e.at);
    if (day < from) continue;
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    const b = byDow.get(dow) || { dow, completed: 0, rescheduled: 0 };
    if (e.type === 'TASK_COMPLETED') b.completed += 1;
    else b.rescheduled += 1;
    byDow.set(dow, b);
  }

  const rows = Array.from(byDow.values()).filter((b) => b.completed + b.rescheduled >= 4);
  if (rows.length < 3) return { ok: false, sampleSize: rows.length };

  for (const r of rows) r.rate = r.completed / (r.completed + r.rescheduled);
  rows.sort((a, b) => a.rate - b.rate);

  return { ok: true, rows, worst: rows[0], best: rows[rows.length - 1] };
}

/* ------------------------------------------------------------------ *
 * Turning findings into memories
 * ------------------------------------------------------------------ */

/**
 * The findings worth remembering, as memory candidates.
 *
 * §66: store only what is useful later, durable, not a duplicate, not
 * transient, and confident enough. This function produces candidates and
 * memory.js decides — the split exists so the deduplication logic has one home
 * rather than being repeated per finding type.
 */
export function findingsToMemories(opts) {
  const out = [];

  const calibration = estimateCalibration(opts);
  if (calibration.ok && calibration.verdict !== 'accurate') {
    out.push({
      type: 'estimation',
      key: 'estimation.global',
      content: calibration.verdict === 'over'
        ? `משימות לוקחות לך בדרך כלל בערך ${calibration.driftPct}% יותר מההערכה הראשונית.`
        : `משימות לוקחות לך בדרך כלל בערך ${calibration.driftPct}% פחות מההערכה הראשונית.`,
      confidence: Math.min(90, 40 + calibration.sampleSize * 3),
      evidenceCount: calibration.sampleSize,
      source: 'observed',
    });
  }

  const areaCalibration = calibrationByArea(opts);
  for (const finding of areaCalibration.slice(0, 2)) {
    out.push({
      type: 'estimation',
      key: `estimation.area.${finding.area.id}`,
      content: finding.verdict === 'over'
        ? `משימות בתחום "${finding.area.title}" לוקחות לך יותר זמן ממה שאתה מעריך.`
        : `משימות בתחום "${finding.area.title}" לוקחות לך פחות זמן ממה שאתה מעריך.`,
      confidence: Math.min(85, 35 + finding.sampleSize * 4),
      evidenceCount: finding.sampleSize,
      source: 'observed',
    });
  }

  const windows = productiveWindows(opts);
  if (windows.ok && windows.meaningful) {
    const label = { morning: 'בבוקר', afternoon: 'אחר הצהריים', evening: 'בערב', night: 'בלילה' }[windows.best.key];
    out.push({
      type: 'workstyle',
      key: 'workstyle.window',
      content: `סשנים שמתחילים ${label} מסתיימים אצלך טוב יותר.`,
      confidence: Math.min(85, 35 + windows.sampleSize * 3),
      evidenceCount: windows.sampleSize,
      source: 'observed',
    });
  }

  return out;
}

export { MIN_SESSIONS };
