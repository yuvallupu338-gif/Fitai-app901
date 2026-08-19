/*
 * energy.js — how much the user is likely to have in the tank, quarter hour by
 * quarter hour, from waking to the end of the day.
 *
 * The shape is a deliberately simplified two-process model of alertness. One
 * process is circadian: a rise out of grogginess through the morning, a broad
 * late-morning plateau, a dip in the early afternoon, a modest rebound before
 * evening. The other is homeostatic — sleep pressure — which climbs the longer
 * someone has been awake and is only partly paid off by a short night.
 * Everything else in this file is a correction laid on top of those two: what
 * the day asks of them, what a workout costs and then gives back, what they
 * said last night, what they said this morning, and what the app has actually
 * learned about this person.
 *
 * It is a simplification and neither this file nor the copy above it should
 * pretend otherwise. The published curves it is modelled on are population
 * averages with enormous individual spread, and no model of a person built
 * from a bedtime and a task list is going to be right about an afternoon.
 * That is why every point carries a confidence, why the personal layer exists
 * at all, and why §0 of the contract requires the UI to say `צפוי` and never
 * `יהיה`. Where a constant below was fitted to a number the contract names
 * rather than derived from anything, the comment says so and says to what.
 *
 * Pure, like everything under src/engine/: no clock, no randomness, no DOM,
 * and no argument is ever written to. The validator runs it twice on one input
 * and compares the JSON byte for byte.
 */

import { sleepWindow } from '../core/time.js';
import { personalWeight } from './learning.js';

/* The contract fixes the published sample spacing at 15 minutes (§6). */
const STEP = 15;

/*
 * The fatigue layer is integrated forward in time, so it needs a finer grid
 * than the one it publishes. A 25-minute break between two tasks falls
 * entirely between two 15-minute samples, and integrating on the coarse grid
 * would miss it — the schedule would contain a real rest that the curve never
 * saw. Five minutes is the smallest unit anything in the data can have:
 * schema.js clamps a duration up to five, so nothing can hide below it.
 */
const INNER_STEP = 5;

const DAY = 1440;
const NOON = 720;

/* ------------------------------------------------------------------ *
 * Small shapes
 * ------------------------------------------------------------------ */

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/*
 * A ramp from 0 to 1 with zero slope at both ends.
 *
 * Every transition in this file uses it instead of a straight line. The result
 * is drawn as a line chart a hundred pixels tall, and a corner in a curve is
 * indistinguishable from a bug in the data — the eye reads a kink as an event
 * that happened, and here there is no event, only the end of a ramp.
 */
function smoothstep(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/* A bump of height 1 centred on `center`, used for the afternoon trough and
 * the late-afternoon rebound. Gaussian rather than a raised cosine only
 * because it has no edges to line up. */
function bell(x, center, width) {
  const d = (x - center) / width;
  return Math.exp(-0.5 * d * d);
}

/*
 * One decimal place on every published value.
 *
 * Not a display choice — forecast JSON is compared byte for byte by the
 * validator and stored in every DayRecord, and a curve of sixty-four
 * seventeen-digit floats is both larger and harder to read in a diff than it
 * has any reason to be. A tenth of a point is well below anything the chart or
 * a person can resolve.
 */
function round1(n) {
  return Math.round(n * 10) / 10;
}

/* A 1..5 self-report, with the neutral answer standing in for a missing one.
 * Absent is not the same as bad: a day with no evening check-in should look
 * like an ordinary day, not like a terrible one. */
function report(n) {
  const v = Number(n);
  return Number.isFinite(v) ? clamp(v, 1, 5) : 3;
}

/* A learned field as a number, or null. `null` is "no signal yet" and is never
 * zero (§3.5) — every caller below branches on it rather than doing arithmetic
 * with it. */
function learned(value) {
  const v = Number(value);
  if (value === null || value === undefined || !Number.isFinite(v)) return null;
  return v;
}

/*
 * The end of the day as a point on this day's number line rather than a clock
 * reading: 23:00 stays 1380, and 00:30 becomes 1470 because it belongs to the
 * small hours after this date, not to the morning before it. The split is noon,
 * the same place sleepWindow() splits a night.
 *
 * predict.js exports exactly this function, and importing it from here would
 * close a cycle — predict.js imports energyCurve. Two copies of a two-line rule
 * is the smaller problem, as long as it is written down that the rule lives in
 * three places now: sleepWindow(), predict.bedtimeAbs() and here.
 */
function bedtimeAbs(minutes) {
  return minutes >= NOON ? minutes : minutes + DAY;
}

/* ------------------------------------------------------------------ *
 * Layer 1 — the circadian shape
 * ------------------------------------------------------------------ */

/*
 * The default day, in points on the 0..100 scale, as a function of minutes
 * since waking.
 *
 * CEILING is where the curve would sit with no sleep inertia, no pressure and
 * no dip — it is a ceiling and not a peak, and nothing ever reaches it. What is
 * subtracted from it is the model:
 *
 * - inertia: sleep inertia is worth roughly a third of the scale on waking and
 *   is gone within two to three hours, which is why nobody should schedule the
 *   hardest thing of the day at 07:15.
 * - pressure: the homeostatic process, rising steadily with time awake. 0.028
 *   a minute is 27 points over a sixteen-hour day, which is what puts a normal
 *   evening below a normal morning without any other term being involved.
 * - trough: the post-lunch dip, centred seven hours after waking with a
 *   ninety-minute spread. The contract asks for 6.5–7.5h and the curve's actual
 *   minimum lands near 7.1h, because the pressure slope drags the low point a
 *   little past the centre of the bump.
 * - rebound: the late-afternoon recovery, ten hours in. Modest on purpose — it
 *   never climbs back to the late-morning plateau.
 * - windDown: the evening fall, steepening as it goes. Anchored to time awake
 *   rather than to the planned bedtime, which matters for the optimiser: a
 *   bedtime-anchored wind-down would mean that choosing to sleep an hour
 *   earlier made the user tireder at 20:00, which is not how fatigue works and
 *   would have made every "go to bed earlier" suggestion score worse than it
 *   should.
 */
const CEILING = 92;
const INERTIA = 36;
const INERTIA_MINUTES = 180;
const PRESSURE_PER_MINUTE = 0.028;
const TROUGH_AT = 420;
const TROUGH_WIDTH = 85;
const TROUGH_DEPTH = 12;
const REBOUND_AT = 600;
const REBOUND_WIDTH = 150;
const REBOUND = 4;
const WINDDOWN_FROM = 780;
const WINDDOWN_SPAN = 240;
const WINDDOWN = 14;

/* Where this shape peaks, about three hours after waking. Used only to work
 * out how far a learned peak hour is asking the curve to move. */
const MODEL_PEAK_AT = 175;

function windDownAt(sinceWake) {
  const u = (sinceWake - WINDDOWN_FROM) / WINDDOWN_SPAN;
  if (u <= 0) return 0;
  /*
   * Past the span the tangent continues instead of flattening off. The whole
   * point of this term is that the last hour before bed falls away faster than
   * the one before it, and a curve that levels out at seventeen hours awake
   * says the opposite. The ceiling stops a twenty-two-hour day from driving the
   * curve through the floor on this term alone.
   */
  return WINDDOWN * (u <= 1 ? u * u : Math.min(2, 1 + 2 * (u - 1)));
}

function circadianBase(sinceWake, troughDepth) {
  const inertia = INERTIA * (1 - smoothstep(sinceWake / INERTIA_MINUTES));
  const pressure = PRESSURE_PER_MINUTE * Math.max(0, sinceWake);
  const trough = troughDepth * bell(sinceWake, TROUGH_AT, TROUGH_WIDTH);
  const rebound = REBOUND * bell(sinceWake, REBOUND_AT, REBOUND_WIDTH);
  return CEILING - inertia - pressure - trough + rebound - windDownAt(sinceWake);
}

/* ------------------------------------------------------------------ *
 * Layer 2 — sleep debt
 * ------------------------------------------------------------------ */

/*
 * A short night, as a level drop plus a deeper afternoon.
 *
 * The need is learned where there is a learned average and eight hours where
 * there is not. Somebody's habitual sleep is a rough stand-in for what they
 * need — it is what they choose when nothing stops them — but only a rough one,
 * because a chronically short sleeper's average is a symptom and not a
 * requirement. Clamping it to 6.5–9h keeps the model from concluding that a
 * person who sleeps five hours a night needs five hours a night, which would
 * make their debt zero and the whole layer silent for exactly the user it
 * matters most to.
 *
 * SLEEP_LINEAR and SLEEP_QUADRATIC are fitted, not derived: §6.1 gives two
 * anchor points, 6h ≈ −12 and 5h ≈ −20 against an eight-hour need, and these
 * are the two coefficients that pass through both. The curve between them bends
 * the right way — the third missing hour costs more than the second.
 *
 * A long night is worth a little, capped at three points. It has to be worth
 * something rather than nothing, or the curve would be flat above the need and
 * "less sleep never yields a higher curve" would only be true by accident.
 *
 * This is returned as a separate term rather than folded into the shape so
 * that the personal blend below cannot interact with it. Blending toward a
 * learned level at three anchors, on a base that already carried the sleep
 * drop, could in principle raise one part of the curve when sleep got shorter.
 * Keeping the two apart makes the monotonicity structural instead of something
 * that has to be re-checked every time a constant moves.
 */
const DEFAULT_SLEEP_NEED = 480;
const NEED_FLOOR = 390;
const NEED_CEILING = 540;
const SLEEP_MIN = 180;
const SLEEP_MAX = 840;
const SLEEP_LINEAR = 4.67;
const SLEEP_QUADRATIC = 0.67;
const SLEEP_DROP_MAX = 34;
const SURPLUS_PER_HOUR = 0.6;
const SURPLUS_MAX = 3;
const TROUGH_PER_DEBT_HOUR = 2.6;
const TROUGH_EXTRA_MAX = 9;

function sleepEffect(ctx) {
  const night = sleepWindow(ctx.plan.bedtime, ctx.plan.wake);
  /* sleepWindow() reports the honest number and leaves the clamping to its
   * callers (§1). A nineteen-hour night is a data problem, not a superpower. */
  const slept = clamp(night.minutes, SLEEP_MIN, SLEEP_MAX);
  const average = learned(ctx.learning && ctx.learning.averageSleepDuration);
  const need = average === null ? DEFAULT_SLEEP_NEED : clamp(average, NEED_FLOOR, NEED_CEILING);
  const debt = Math.max(0, need - slept) / 60;
  const surplus = Math.max(0, slept - need) / 60;
  return {
    level: Math.min(SURPLUS_MAX, SURPLUS_PER_HOUR * surplus)
      - Math.min(SLEEP_DROP_MAX, SLEEP_LINEAR * debt + SLEEP_QUADRATIC * debt * debt),
    trough: Math.min(TROUGH_EXTRA_MAX, TROUGH_PER_DEBT_HOUR * debt),
  };
}

function sleepTerm(sinceWake, effect) {
  return effect.level - effect.trough * bell(sinceWake, TROUGH_AT, TROUGH_WIDTH);
}

/* ------------------------------------------------------------------ *
 * Layer 3 — accumulated load
 * ------------------------------------------------------------------ */

/*
 * What the day itself costs, as a running balance rather than a list of
 * penalties.
 *
 * Fatigue is integrated forward from waking: demanding work adds to it minute
 * by minute while the item is running, and rest lets it relax back toward
 * zero. Two things fall out of that which a per-item penalty could not give.
 *
 * The first is continuity. The obvious implementation — subtract a fixed
 * penalty from every sample after a demanding item ends — puts a cliff in the
 * curve at the item's last minute. On a fifteen-minute grid that is a
 * ten-point vertical drop between two neighbouring points, and the chart draws
 * it as a broken axis. Accumulating the cost across the item's own duration
 * puts the same total in the same place with no step in it, and is closer to
 * what happens anyway: a two-hour meeting does not cost anything until it is
 * over and then cost everything at once.
 *
 * The second is that rest becomes a real thing with a rate instead of a bonus
 * with a size. A gap recovers energy for as long as it lasts, an explicitly
 * scheduled break recovers slightly faster than idle time — a deliberate rest
 * is not the same as a hole in the calendar — and both are scaled by
 * learning.breakEffectiveness once the app has measured whether this person's
 * breaks actually work. That scaling is what lets the optimiser's "insert a
 * break" candidate earn its score honestly instead of by fiat.
 *
 * RESERVE lets the balance go slightly negative during a break, so a rest
 * taken before any fatigue has built up still shows as a small lift rather than
 * as nothing at all. FATIGUE_MAX is where the model stops having anything
 * useful to say: past twenty-two points of accumulated load the honest output
 * is not a lower number, it is risk.js saying the day is overloaded.
 */
const DEMAND_PER_HOUR = 9;
const DEMAND_HOURS_MAX = 2.5;
const ENERGY_COST = { low: 0.45, medium: 0.75, high: 1 };
const DRAIN_RATE_MAX = 0.25;
const FATIGUE_MAX = 22;
const RESERVE = 4;
const REST_HALF_LIFE = 38;
const BUSY_HALF_LIFE = 400;
const IDLE_EFFECT = 0.85;
const DEFAULT_BREAK_EFFECT = 0.55;

/*
 * The items that have a position in the day. An unscheduled task costs nothing
 * until it is placed — which is also what makes the optimiser's placements show
 * up in the curve at all — and a skipped one never happened.
 *
 * Sorted by start, then by id, before anything is summed. Floating-point
 * addition is not associative, so two logically identical item lists in
 * different orders would otherwise produce curves that differ in the last
 * decimal place, and the validator compares forecast JSON byte for byte.
 */
function scheduledItems(ctx) {
  return (ctx.items || [])
    .filter((i) => i && i.start !== null && i.start !== undefined
      && i.status !== 'skipped' && Number(i.duration) > 0)
    .slice()
    .sort((a, b) => (a.start !== b.start ? a.start - b.start : (a.id < b.id ? -1 : 1)));
}

function covers(item, minute) {
  return minute >= item.start && minute < item.start + item.duration;
}

/*
 * What one item asks of the user. Difficulty and the energy requirement are
 * what the user said about it, and length is the multiplier — three hours of
 * anything costs more than twenty minutes of it. The length factor stops at
 * two and a half hours because past that the item is really several things and
 * scaling on would let one badly entered row flatten the whole afternoon.
 */
function itemDemand(item) {
  const hours = Math.min(DEMAND_HOURS_MAX, Number(item.duration) / 60);
  const hard = 0.55 + 0.45 * ((clamp(Number(item.difficulty) || 3, 1, 5) - 1) / 4);
  const cost = ENERGY_COST[item.energyRequirement] || ENERGY_COST.medium;
  return DEMAND_PER_HOUR * cost * hard * hours;
}

function drainRate(item) {
  return itemDemand(item) / Math.max(1, Number(item.duration));
}

/* How well this person's breaks work, on a 0.35..1 scale. With nothing learned
 * it sits at the middle of that range: rest helps, and how much is exactly what
 * the app has not measured yet. The floor is not zero because a break restores
 * something even for the user whose logged breaks never seem to. */
function breakEffect(learning) {
  const measured = learned(learning && learning.breakEffectiveness);
  return 0.35 + 0.65 * (measured === null ? DEFAULT_BREAK_EFFECT : clamp(measured, 0, 1));
}

/*
 * The fatigue balance at each of `minutes`, integrated on the inner grid.
 *
 * Drain is explicit and rest is exact: the relaxation toward the resting target
 * is an exponential solved over the step rather than a slope multiplied by it,
 * so the result does not depend on how the step happens to divide and cannot
 * overshoot on a long one.
 *
 * Workouts occupy time here but do not drain — they have their own layer, and
 * counting them twice made a morning run read like a morning of meetings.
 */
function fatigueSeries(ctx, items, minutes) {
  const load = items.filter((i) => i.type !== 'workout' && i.type !== 'break');
  const busyToo = items.filter((i) => i.type === 'workout');
  const rests = items.filter((i) => i.type === 'break');
  const effect = breakEffect(ctx.learning);
  const out = [];
  let balance = 0;
  let at = minutes.length ? minutes[0] : 0;

  for (const minute of minutes) {
    while (at < minute) {
      const dt = Math.min(INNER_STEP, minute - at);
      let drain = 0;
      for (const item of load) if (covers(item, at)) drain += drainRate(item);
      let resting = false;
      for (const item of rests) if (covers(item, at)) resting = true;
      let busy = drain > 0;
      if (!busy) for (const item of busyToo) if (covers(item, at)) busy = true;

      const rate = busy
        ? Math.LN2 / BUSY_HALF_LIFE
        : (Math.LN2 / REST_HALF_LIFE) * effect * (resting ? 1 : IDLE_EFFECT);
      const target = !busy && resting ? -RESERVE : 0;
      const drained = balance + Math.min(DRAIN_RATE_MAX, drain) * dt;
      balance = clamp(drained + (target - drained) * (1 - Math.exp(-rate * dt)), -RESERVE, FATIGUE_MAX);
      at += dt;
    }
    out.push(balance);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Layer 4 — workouts
 * ------------------------------------------------------------------ */

/*
 * A workout costs first and pays later.
 *
 * The dip deepens across the session itself and is mostly gone within about
 * forty-five minutes of the last set; a smaller lift then takes over and fades
 * across the rest of the evening. Both scale with length, within reason — a
 * twenty-minute walk is not half a session and a three-hour ride is not three
 * of them.
 *
 * The dip builds over the session's own length rather than over a fixed
 * warm-up, for two reasons. It is closer to what happens — the tired part of a
 * long run is the end of it — and it bounds how fast the curve can move: the
 * whole cost is spread over the whole session however long that is, so a short
 * intense block cannot put a cliff in the chart. DIP_FLOOR keeps a fifteen
 * minute session from spending its entire cost in one sample.
 *
 * The ordering is the whole reason this is its own layer instead of a heavier
 * entry in the load balance. Someone reading the curve should be able to see
 * that the hour after training is a bad place for the hardest task of the day
 * and that the two hours after that are a good one, and a fatigue term that
 * only ever decays cannot say that.
 *
 * The sum is capped because two overlapping workouts is a thing the data
 * permits — a conflict risk.js will report — and three of them should not be
 * allowed to drive an afternoon to the floor between two samples.
 */
const WORKOUT_DIP = 8;
const WORKOUT_DIP_FLOOR = 30;
const WORKOUT_DIP_OUT = 60;
const WORKOUT_LIFT = 3;
const WORKOUT_LIFT_IN = 60;
const WORKOUT_LIFT_FADE = 240;
const WORKOUT_TOTAL_DIP = 14;
const WORKOUT_TOTAL_LIFT = 6;

function workoutEffect(minute, workouts) {
  let total = 0;
  for (const w of workouts) {
    const end = w.start + w.duration;
    const scale = clamp(w.duration / 60, 0.6, 1.2);
    const rampIn = smoothstep((minute - w.start) / Math.max(WORKOUT_DIP_FLOOR, w.duration));
    const rampOut = minute <= end ? 1 : 1 - smoothstep((minute - end) / WORKOUT_DIP_OUT);
    total -= WORKOUT_DIP * scale * rampIn * rampOut;
    if (minute > end) {
      const fade = Math.exp(-Math.max(0, minute - end - WORKOUT_LIFT_IN) / WORKOUT_LIFT_FADE);
      total += WORKOUT_LIFT * scale * smoothstep((minute - end) / WORKOUT_LIFT_IN) * fade;
    }
  }
  return clamp(total, -WORKOUT_TOTAL_DIP, WORKOUT_TOTAL_LIFT);
}

/* ------------------------------------------------------------------ *
 * Layer 5 — last night's state
 * ------------------------------------------------------------------ */

/*
 * The evening ritual asks how the day went before it plans the next one, and
 * the answer moves the whole level rather than any part of the shape. Someone
 * who ends a day stressed and empty starts the next one lower, all day, and
 * that is a level, not a dip.
 *
 * §6.1 names energy and stress, and mood is deliberately left out even though
 * the ritual collects it: it is the field of the three that says the least
 * about tomorrow's capacity, and three small shifts stacked on one another
 * would let a bad evening move the curve further than the evidence supports.
 * Mood is used by risk.js and by the copy instead.
 */
const EVENING_ENERGY_SHIFT = 2.5;
const EVENING_STRESS_SHIFT = 2;

function eveningShift(plan) {
  const state = plan.eveningState;
  if (!state) return 0;
  return (report(state.energy) - 3) * EVENING_ENERGY_SHIFT
    - (report(state.stress) - 3) * EVENING_STRESS_SHIFT;
}

/* ------------------------------------------------------------------ *
 * Layer 6 — the morning check-in
 * ------------------------------------------------------------------ */

/*
 * Once the user has said how they actually woke up, the curve re-levels toward
 * it: the full correction at wake, fading toward the model's own shape across
 * the morning and never quite disappearing.
 *
 * The check-in is read as a correction and not as a measurement on the 0..100
 * scale, because that is what it is. A tap on "4 out of 5" is a statement about
 * this person's own normal, and mapping five buttons onto a hundred points
 * would put more precision into the number than the question can carry. So the
 * report shifts the model rather than replacing it, and the sleep-quality
 * answer joins in at a third of the weight — it is direct evidence about the
 * night that layer 2 only inferred from a bedtime and a wake time.
 *
 * The floor is what "your energy is lower than predicted" means later in the
 * afternoon. A morning that started badly still counts at 17:00, but by then
 * the day's own shape has more to say about it than the tap did.
 */
const MORNING_ENERGY_STEP = 7;
const MORNING_QUALITY_STEP = 2.5;
const MORNING_FLOOR = 0.3;
const MORNING_FADE = 240;

function morningDelta(ctx) {
  const morning = ctx.morning;
  if (!morning) return 0;
  return (report(morning.energy) - 3) * MORNING_ENERGY_STEP
    + (report(morning.sleepQuality) - 3) * MORNING_QUALITY_STEP;
}

function morningWeight(sinceWake) {
  return MORNING_FLOOR + (1 - MORNING_FLOOR) * Math.exp(-Math.max(0, sinceWake) / MORNING_FADE);
}

/* ------------------------------------------------------------------ *
 * Layer 7 — the personal blend
 * ------------------------------------------------------------------ */

/*
 * What the app has learned about this person specifically, mixed in by
 * personalWeight (§8) — roughly a tenth on day one, about half after a week.
 *
 * The learned levels are three numbers — morning, afternoon, evening — and each
 * one is an average over its whole part of the day, not a reading at any
 * particular minute. So each is compared against the default shape's own
 * average over the same stretch, and the difference, times `weight`, becomes a
 * correction held flat across that block and interpolated between block
 * centres. Comparing against a single instant instead was the first version and
 * it over-corrected badly at the edges: an anchor placed at 09:30, where the
 * default shape is near its peak, produced a correction that then got applied
 * unchanged at 07:30, where the shape is thirty points lower, and a user whose
 * learned morning level was 55 came out at 43 an hour after waking.
 *
 * What the block form preserves is everything the three numbers do not know:
 * the grogginess on waking, the afternoon dip, the wind-down before bed.
 * Replacing the shape with three levels would flatten all of it and hand back a
 * curve that is smoother, more personal and much less useful.
 *
 * The correction is measured against the default shape and not against the
 * finished curve, so a learned afternoon level cannot quietly cancel out the
 * sleep debt, the day's load or a workout — all of which are about tomorrow in
 * particular, and none of which a long-run average knows anything about.
 *
 * Both the level correction and the shift are capped. Neither cap is caution
 * for its own sake: §6.1 asks for the afternoon trough to land 6.5–7.5h after
 * waking, and an uncapped blend towards levels learned from a couple of weeks
 * of check-ins can move the low point of the day out of the afternoon
 * altogether. Twelve points and forty-five minutes are enough for the curve to
 * visibly become this person's, and little enough that it stays a day.
 */
const BLOCK_MORNING_END = 720;
const BLOCK_AFTERNOON_END = 1020;
const CORRECTION_MAX = 12;
const PEAK_SHIFT_MAX = 45;

/*
 * predict.js works personalWeight out once per forecast and hands it down on
 * ctx. Recomputing it here would be a second opinion on the same number, and
 * the day somebody changes the formula in learning.js the energy curve and the
 * meta block on the forecast would start disagreeing about how personal the
 * app currently is. It is still imported, so a ctx built by hand — the
 * validator's, or another engine module's — gets the real answer rather than a
 * default.
 */
function weightOf(ctx) {
  const given = Number(ctx.personalWeight);
  if (Number.isFinite(given)) return clamp(given, 0, 0.8);
  return personalWeight(ctx.learning);
}

function peakShift(ctx, weight, wake) {
  const hour = learned(ctx.learning && ctx.learning.energyPeakHour);
  if (hour === null) return 0;
  const wanted = clamp(hour, 0, 23) * 60 + 30 - (wake + MODEL_PEAK_AT);
  return clamp(wanted, -PEAK_SHIFT_MAX, PEAK_SHIFT_MAX) * weight;
}

/* One block's correction, or null when the day does not reach into that block
 * or nothing has been learned about it. A day that starts at 18:00 has no
 * morning for a learned morning level to describe. */
function blockDelta(level, weight, from, to, wake, shift) {
  if (level === null || to <= from) return null;
  let sum = 0;
  let n = 0;
  for (let m = from; m <= to; m += STEP) {
    sum += circadianBase(m - wake - shift, TROUGH_DEPTH);
    n += 1;
  }
  const delta = weight * (clamp(level, 0, 100) - sum / n);
  return { minute: (from + to) / 2, delta: clamp(delta, -CORRECTION_MAX, CORRECTION_MAX) };
}

function anchorDeltas(ctx, weight, wake, shift, end) {
  const learning = ctx.learning || {};
  const blocks = [
    [learned(learning.morningEnergy), wake, Math.min(end, BLOCK_MORNING_END)],
    [learned(learning.afternoonEnergy), Math.max(wake, BLOCK_MORNING_END), Math.min(end, BLOCK_AFTERNOON_END)],
    [learned(learning.eveningEnergy), Math.max(wake, BLOCK_AFTERNOON_END), end],
  ];
  const out = [];
  for (const [level, from, to] of blocks) {
    const anchor = blockDelta(level, weight, from, to, wake, shift);
    if (anchor) out.push(anchor);
  }
  return out;
}

/*
 * Outside the outermost block centres the correction holds flat rather than
 * falling back to zero. A learned evening level should still mean something at
 * 23:00, and letting the correction fade out after the middle of the evening
 * would put a slope in the curve that describes where the blocks were cut
 * rather than anything about the user.
 */
function correctionAt(minute, anchors) {
  if (!anchors.length) return 0;
  const last = anchors[anchors.length - 1];
  if (minute <= anchors[0].minute) return anchors[0].delta;
  if (minute >= last.minute) return last.delta;
  for (let i = 1; i < anchors.length; i += 1) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (minute <= b.minute) {
      return a.delta + (b.delta - a.delta) * smoothstep((minute - a.minute) / (b.minute - a.minute));
    }
  }
  return last.delta;
}

/* ------------------------------------------------------------------ *
 * Confidence
 * ------------------------------------------------------------------ */

/*
 * How much the model believes its own number at each point.
 *
 * Two things raise it. Evidence: a morning check-in, or the evening state, or a
 * learned level for that part of the day, each with a reach of a couple of
 * hours either side. And the personal weight, which is how much of the curve
 * came from this user at all rather than from a population average.
 *
 * One thing lowers it: distance into the day. The late evening depends on
 * everything that happens before it — whether the afternoon ran over, whether
 * the workout happened — and none of that is known when the forecast is built.
 *
 * The ceiling is 95 and never 100. §6.4 is explicit that the app must not
 * present confidence above what the data supports, and no amount of history
 * supports certainty about an afternoon that has not happened.
 */
const CONF_BASE = 28;
const CONF_EVIDENCE = 52;
const CONF_PERSONAL = 22;
const CONF_HORIZON = 10;
const CONF_MAX = 95;
const EVIDENCE_REACH = 150;

function evidenceAnchors(ctx, weight, anchors) {
  const out = [];
  /* Waking is where the day is best known: either the user has just reported
   * how they feel, or they told us last night how the previous one ended, or —
   * failing both — it is at least the one minute of the day whose position in
   * the shape is not a guess. */
  let strength = 0.25;
  if (ctx.plan.eveningState) strength = 0.55;
  if (ctx.morning) strength = 1;
  out.push({ minute: ctx.plan.wake, strength });
  for (const anchor of anchors) out.push({ minute: anchor.minute, strength: weight });
  return out;
}

function confidenceAt(minute, wake, span, weight, evidence) {
  let best = 0;
  for (const anchor of evidence) {
    const near = anchor.strength * Math.exp(-Math.abs(minute - anchor.minute) / EVIDENCE_REACH);
    if (near > best) best = near;
  }
  const horizon = CONF_HORIZON * ((minute - wake) / span);
  return Math.round(clamp(CONF_BASE + CONF_EVIDENCE * best + CONF_PERSONAL * weight - horizon, 0, CONF_MAX));
}

/* ------------------------------------------------------------------ *
 * The curve
 * ------------------------------------------------------------------ */

/*
 * The sample minutes, from waking to the end of the day inclusive.
 *
 * A wake time that is not on the quarter hour leaves the last step short rather
 * than dropping the end of the day: the curve has to reach the planned bedtime
 * because the timeline draws a marker there and reads its energy off this
 * curve, and a chart that stops eleven minutes before its own last row looks
 * broken in a way nobody can explain.
 */
function gridOf(from, to) {
  const out = [];
  for (let m = from; m < to; m += STEP) out.push(m);
  out.push(to);
  return out;
}

/*
 * The hourly summary, for the places too small to draw sixty-four points — the
 * week strip, and the snapshot each DayRecord keeps of what was predicted.
 *
 * Buckets are built in the order the samples come rather than by sorting on the
 * hour, so a day that ends after midnight reads 22, 23, 0 and not 0, 22, 23.
 * The same clock hour can appear twice for a user awake across a whole day; the
 * chart draws them in order and that is the honest sequence.
 */
function hourlyOf(points) {
  const buckets = [];
  let open = null;
  for (const point of points) {
    const hour = Math.floor(point.minute / 60);
    if (!open || open.hour !== hour) {
      open = { hour, sum: 0, n: 0 };
      buckets.push(open);
    }
    open.sum += point.value;
    open.n += 1;
  }
  return buckets.map((b) => ({ hour: ((b.hour % 24) + 24) % 24, value: Math.round(b.sum / b.n) }));
}

/**
 * The day's energy curve: `{ step, from, to, points, hourly }` as §6 defines
 * it, running from `plan.wake` to `plan.nextBedtime` in absolute minutes.
 *
 * The seven layers are added in one expression on purpose. Each of them is a
 * small function above with its own reasoning, and the composition is the part
 * that has to stay readable — when a curve comes out wrong the first question
 * is which layer said so, and this is where that is answered.
 */
export function energyCurve(ctx) {
  const plan = ctx.plan;
  const from = plan.wake;
  /*
   * A plan whose bedtime lands before its wake time is broken data, not a
   * zero-length day. An hour of curve keeps the chart, the timeline and the
   * peak search all working on something, and the honest short day is far
   * easier to notice and report than an empty array would be.
   */
  const to = Math.max(from + 60, bedtimeAbs(plan.nextBedtime));
  const span = Math.max(1, to - from);
  const minutes = gridOf(from, to);

  const weight = weightOf(ctx);
  const shift = peakShift(ctx, weight, from);
  const sleep = sleepEffect(ctx);
  const anchors = anchorDeltas(ctx, weight, from, shift, to);
  const evidence = evidenceAnchors(ctx, weight, anchors);
  const items = scheduledItems(ctx);
  const workouts = items.filter((i) => i.type === 'workout');
  const fatigue = fatigueSeries(ctx, items, minutes);
  const evening = eveningShift(plan);
  const morning = morningDelta(ctx);

  const points = minutes.map((minute, i) => {
    const sinceWake = minute - from - shift;
    const value = circadianBase(sinceWake, TROUGH_DEPTH)
      + sleepTerm(sinceWake, sleep)
      + correctionAt(minute, anchors)
      - fatigue[i]
      + workoutEffect(minute, workouts)
      + evening
      + morning * morningWeight(minute - from);
    return {
      minute,
      value: round1(clamp(value, 0, 100)),
      confidence: confidenceAt(minute, from, span, weight, evidence),
    };
  });

  return { step: STEP, from, to, points, hourly: hourlyOf(points) };
}

/**
 * The curve read at one minute, interpolated between the two samples around it.
 *
 * It builds the whole curve to answer, which is deliberate: the fatigue layer
 * is an integral from waking, so there is no shortcut to a single point that is
 * also guaranteed to agree with the point the chart drew. Anything that needs
 * more than a handful of readings — the scheduler scoring a hundred candidate
 * slots, the optimiser scoring a hundred candidate days — should call
 * energyCurve() once and read the points, not call this in a loop.
 *
 * Outside the day it clamps to the ends rather than extrapolating. There is no
 * honest answer for 03:00 on a curve that starts at 07:00, and a made-up one
 * would end up in a suggestion.
 */
export function energyAt(ctx, minute) {
  const points = energyCurve(ctx).points;
  const at = Number(minute);
  if (!Number.isFinite(at) || at <= points[0].minute) return points[0].value;
  const last = points[points.length - 1];
  if (at >= last.minute) return last.value;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (at <= b.minute) {
      const t = (at - a.minute) / (b.minute - a.minute);
      return round1(a.value + (b.value - a.value) * t);
    }
  }
  return last.value;
}
