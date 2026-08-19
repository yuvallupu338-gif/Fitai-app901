/*
 * focus.js — how clear the user's head is expected to be, quarter hour by
 * quarter hour, and where the two or three best stretches of the day are.
 *
 * The whole reason this file is not three lines of `energy * 0.9` is that being
 * energetic and being able to think are different states, and everybody has
 * lived the difference. Ten minutes out of bed you are rested and useless. Four
 * hours into an unbroken run of meetings you are not tired, you are just done
 * reading anything carefully. An afternoon cut into six twenty-minute pieces by
 * calendar events leaves the tank full and nothing worth pouring it into. A
 * focus curve that only rescaled energy would say all three of those days were
 * fine, and the one screen this app is built around — when should I do the hard
 * thing — would be wrong on exactly the days it matters.
 *
 * So energy is the raw material and nothing more. Half of it carries through,
 * on top of a floor, and five terms with their own shapes do the rest. Each is
 * its own function below with its own note about where its numbers came from,
 * because the day somebody disagrees with the curve they need to be able to
 * find the term to argue with.
 *
 * Pure, like everything in src/engine/. No clock, no randomness, no argument is
 * written to. The validator runs the forecast twice on one input and compares
 * the JSON byte for byte, and both curves go into it.
 */

import { diffDays, isValidKey } from '../core/time.js';
import { personalWeight } from './learning.js';

const STEP = 15;
const DAY = 1440;
const NOON = 720;

/*
 * How much of the energy curve survives into focus, and what is left when none
 * of it does.
 *
 * A share of 0.5 over a floor of 30 maps an energy of 0..100 onto 30..80, which
 * leaves room above and below for the shaping terms to land inside 0..100
 * without every sample slamming into a clamp. It also means a flat energy curve
 * still produces a focus curve with a shape, which is the point: the chronotype,
 * the warm-up and the time-on-task decay do not ask energy's permission.
 */
const ENERGY_SHARE = 0.5;
const FOCUS_FLOOR = 30;

/* What to assume when there is no energy curve to read — mid-scale, no claim. */
const NEUTRAL_ENERGY = 60;
const NEUTRAL_CONFIDENCE = 50;

/* ------------------------------------------------------------------ *
 * The five shaping terms
 * ------------------------------------------------------------------ */

/*
 * Where the day's natural clarity sits for each stated preference, as a clock
 * reading.
 *
 * 09:30 for a morning person and 20:30 for an evening one are deliberately not
 * symmetric around noon. A self-described morning person means the stretch
 * after breakfast and before lunch; a self-described evening person means after
 * the day's obligations are over, which is later than the mirror image would
 * put it. Afternoon is 15:00, past the post-lunch trough rather than in it.
 */
const STATED_PEAK = { morning: 570, afternoon: 900, evening: 1230 };

/*
 * How far the chronotype swings the curve. A stated preference is worth 15
 * points either side; 'unsure' is worth 8, because the user told us nothing and
 * a flat-ish default is more honest than a guess with confidence. A learned
 * peak is worth 18 — it is the only one of the three that came from watching.
 */
const STATED_AMPLITUDE = 15;
const UNSURE_AMPLITUDE = 8;
const LEARNED_AMPLITUDE = 18;

/* Where 'unsure' puts its peak: three and a half hours after waking. */
const UNSURE_OFFSET = 210;

/*
 * Which hour of the day the user actually thinks best in, and how hard to
 * believe it over what they said about themselves.
 *
 * The blend between the stated peak and the learned one is linear on the clock
 * and deliberately not the shortest way round the circle. Both peaks sit inside
 * the waking day in every case that matters, so the straight line between them
 * passes through hours the user is awake for; going the short way round would
 * let a 22:00 stated peak and an 08:00 learned one meet at 03:00, and hand
 * somebody a recommendation to do their hardest work in the middle of the night.
 *
 * personalWeight is 0 until there is history, so on day one the stated
 * preference is the whole answer and a focusPeakHour that somehow exists
 * changes nothing at all. §8 takes it to roughly 0.44 after a week and 0.77
 * after a month, which is where the learned hour ends up doing most of the
 * talking.
 */
function chronotype(profile, learning, weight, wake) {
  const preference = profile && profile.focusPreference;
  const stated = STATED_PEAK[preference];
  const statedPeak = stated === undefined ? wake + UNSURE_OFFSET : stated;
  const statedAmplitude = stated === undefined ? UNSURE_AMPLITUDE : STATED_AMPLITUDE;

  const hour = learning ? learning.focusPeakHour : null;
  if (!Number.isFinite(hour)) {
    return { peak: statedPeak, amplitude: statedAmplitude };
  }
  // The middle of the learned hour, not its start: focusPeakHour 10 means the
  // hour of ten o'clock, whose centre is 10:30.
  const learnedPeak = hour * 60 + 30;
  return {
    peak: statedPeak + (learnedPeak - statedPeak) * weight,
    amplitude: statedAmplitude + (LEARNED_AMPLITUDE - statedAmplitude) * weight,
  };
}

/*
 * The chronotype swing itself: a single cosine over twenty-four hours, highest
 * at the peak and lowest twelve hours away from it.
 *
 * One cosine rather than a bell with a width to tune, because a chronotype is
 * not a spike — it is the slow tilt of a whole day. It also guarantees exactly
 * one maximum and one minimum, which is what makes "morning preference peaks in
 * the morning half" a property of the term and not an accident of the numbers
 * around it.
 */
function chronotypeTerm(minute, peak, amplitude) {
  return amplitude * Math.cos((2 * Math.PI * (minute - peak)) / DAY);
}

/*
 * Sleep inertia — the first forty minutes, which energy does not pay for and
 * focus does.
 *
 * Energy climbs from the moment of waking; the circadian rise in energy.js
 * starts at wake and goes up. Attention does not. There is a stretch after
 * waking where the body is willing and reading a paragraph twice is normal, and
 * a curve without this term recommends the user's sharpest hour of the day
 * starting eight minutes after the alarm. Twenty-two points is enough to push
 * that window later without pretending the user is unconscious.
 *
 * Half a cosine rather than a straight line so the recovery is steep in the
 * middle and flat at both ends, which is how it feels and, more usefully, means
 * the term does not put a corner in the curve at minute forty.
 */
const WARMUP_MINUTES = 40;
const WARMUP_DEPTH = 22;

function warmupTerm(minute, wake) {
  const since = minute - wake;
  if (since < 0 || since >= WARMUP_MINUTES) return 0;
  return -WARMUP_DEPTH * 0.5 * (1 + Math.cos((Math.PI * since) / WARMUP_MINUTES));
}

/*
 * Time on task — how long the user has been going without a real break by this
 * point in the day.
 *
 * The first ninety minutes are free. That is roughly one honest block of work,
 * and charging for it would mean the model never lets anybody concentrate. Past
 * that the cost grows and flattens: an exponential with a two-hour constant, so
 * four unbroken hours costs about eleven points and six costs about sixteen,
 * and no amount of sitting there costs more than eighteen. A term that grew
 * without bound would make a long day score worse than a physically impossible
 * one.
 */
const TOT_GRACE = 90;
const TOT_TAU = 120;
const TOT_DEPTH = 18;

function timeOnTaskTerm(runMinutes) {
  const over = runMinutes - TOT_GRACE;
  if (over <= 0) return 0;
  return -TOT_DEPTH * (1 - Math.exp(-over / TOT_TAU));
}

/*
 * Fragmentation — the afternoon that is technically half empty and entirely
 * unusable.
 *
 * Four locked events with twenty-five minutes between each is two and a half
 * free hours on paper. In practice none of it is worth starting anything in,
 * and the cost is not confined to the gaps themselves: knowing the next thing
 * is in twenty minutes changes how the surrounding hour is spent too. So each
 * short gap lowers a wide neighbourhood around itself, with a linear falloff
 * out to three and a half hours, and the penalties add up until they hit the
 * cap. Several gaps in one afternoon therefore drag the whole afternoon down
 * while leaving a clear morning alone, which is the shape of the real problem.
 *
 * Locked is the property that matters rather than kind: an event the scheduler
 * cannot move is what makes the gap around it fixed. An unlocked task sitting
 * in the same place is a gap the optimiser can close.
 */
const FRAG_MIN_GAP = 5;
const FRAG_MAX_GAP = 45;
const FRAG_REACH = 210;
const FRAG_PER_GAP = 6;
const FRAG_CAP = 14;

function fragmentationTerm(minute, gapCentres) {
  let weight = 0;
  for (const centre of gapCentres) {
    const distance = Math.abs(centre - minute);
    if (distance < FRAG_REACH) weight += 1 - distance / FRAG_REACH;
  }
  return -Math.min(FRAG_CAP, weight * FRAG_PER_GAP);
}

/*
 * A deadline landing today, which cuts both ways.
 *
 * Something due tonight normally sharpens the day — the work is obvious, the
 * choosing is over, and focus is easier to find. That is the small lift. Under
 * real stress the same deadline stops helping and starts costing: the attention
 * goes to the deadline rather than to the task, and the last hours are worse
 * than the first. The evening check-in is the only place the app knows about
 * stress, so a day with no check-in gets the lift, which is the more common
 * case and the less dramatic mistake to make.
 *
 * Either way the term ramps in quadratically across the waking window instead
 * of applying flatly, because a deadline at the end of the day has nothing to
 * say about breakfast.
 */
const DEADLINE_PENALTY = 8;
const DEADLINE_LIFT = 4;
const HIGH_STRESS = 4;

function deadlineTerm(minute, pressure, from, span) {
  if (pressure === 0 || span <= 0) return 0;
  const elapsed = Math.min(1, Math.max(0, (minute - from) / span));
  return pressure * elapsed * elapsed;
}

/* ------------------------------------------------------------------ *
 * Reading the day
 * ------------------------------------------------------------------ */

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/*
 * A bedtime as a point on this day's number line rather than a clock reading.
 * predict.js has the same three lines and they must agree, but focus.js cannot
 * import predict.js — predict.js imports this file, and a cycle between the
 * forecast and one of its models is not worth a saved function.
 */
function bedtimeAbs(minutes) {
  return minutes >= NOON ? minutes : minutes + DAY;
}

/*
 * The stretches of the day the user is engaged, merged and then chained.
 *
 * Two items back to back with five minutes between them are one long haul, not
 * two fresh starts, so anything under twenty minutes apart joins the same
 * chain. Breaks are excluded outright: a scheduled break is the opposite of
 * time on task, and counting it as work would make the app penalise the one
 * thing it keeps recommending.
 */
const CHAIN_GAP = 20;

function taskChains(items) {
  const spans = items
    .filter((i) => i && i.start !== null && Number.isFinite(i.start)
      && Number.isFinite(i.duration) && i.duration > 0
      && i.type !== 'break' && i.status !== 'skipped')
    .map((i) => ({ start: i.start, end: i.start + i.duration }))
    .sort((a, b) => (a.start - b.start) || (a.end - b.end));

  const chains = [];
  for (const span of spans) {
    const last = chains[chains.length - 1];
    if (last && span.start - last.end < CHAIN_GAP) last.end = Math.max(last.end, span.end);
    else chains.push({ start: span.start, end: span.end });
  }
  return chains;
}

/*
 * How long a break has to be before the head is genuinely clear again.
 *
 * learning.breakEffectiveness is the observed answer, 0..1, and it scales this
 * directly: somebody whose breaks work is back after three quarters of an hour,
 * somebody whose breaks are really just a different screen needs three. The
 * default of 0.7 puts a full clear at a little over an hour, which is what a
 * lunch away from the desk looks like, and the floor stops a learned zero from
 * producing a recovery time longer than the day.
 *
 * An earlier version cleared in half an hour and let the model claim that
 * thirty minutes off wiped out five unbroken hours. Breaks help, and this file
 * exists partly to prove they do, but not that much.
 */
const RECOVERY_BASE = 45;
const DEFAULT_BREAK_EFFECT = 0.7;
const MIN_BREAK_EFFECT = 0.25;

function recoveryMinutes(learning) {
  const observed = learning ? learning.breakEffectiveness : null;
  const effect = Number.isFinite(observed) ? clamp(observed, 0, 1) : DEFAULT_BREAK_EFFECT;
  return RECOVERY_BASE / Math.max(MIN_BREAK_EFFECT, effect);
}

function fade(run, idle, recovery) {
  if (idle >= recovery) return 0;
  return run * (1 - idle / recovery);
}

/*
 * Minutes of unbroken engagement at `minute`, with breaks discounting rather
 * than erasing what came before.
 *
 * A twenty-five minute coffee after four hours does not hand back a fresh
 * morning, and a model where any gap resets the counter to zero would let the
 * user chop a punishing day into pieces and score it as easy. So a gap fades
 * the accumulated run in proportion to how much of a full recovery it was, and
 * only a gap at least that long clears it completely.
 */
function onTaskRun(minute, chains, recovery) {
  let run = 0;
  let previousEnd = null;
  for (const chain of chains) {
    if (minute <= chain.start) break;
    if (previousEnd !== null) run = fade(run, chain.start - previousEnd, recovery);
    run += Math.min(minute, chain.end) - chain.start;
    previousEnd = chain.end;
  }
  if (previousEnd !== null && minute > previousEnd) {
    run = fade(run, minute - previousEnd, recovery);
  }
  return run;
}

/** The midpoints of every unusably short gap between two locked items. */
function shortGapCentres(items) {
  const locked = items
    .filter((i) => i && i.locked && i.start !== null && Number.isFinite(i.start)
      && Number.isFinite(i.duration) && i.duration > 0 && i.status !== 'skipped')
    .map((i) => ({ start: i.start, end: i.start + i.duration }))
    .sort((a, b) => (a.start - b.start) || (a.end - b.end));

  const centres = [];
  let reach = null;
  for (const span of locked) {
    if (reach !== null) {
      const gap = span.start - reach;
      if (gap >= FRAG_MIN_GAP && gap <= FRAG_MAX_GAP) centres.push(reach + gap / 2);
    }
    reach = reach === null ? span.end : Math.max(reach, span.end);
  }
  return centres;
}

/*
 * The signed strength of today's deadline pressure, before it is ramped across
 * the day. Two or more things due is as much as this term will admit to; past
 * that the overload risk in risk.js is the honest place for it to show up.
 */
function deadlinePressure(items, date, plan) {
  let due = 0;
  for (const item of items) {
    if (!item || item.status === 'done' || item.status === 'skipped') continue;
    if (!item.deadline || !isValidKey(item.deadline) || !isValidKey(date)) continue;
    if (diffDays(item.deadline, date) <= 0) due += 1;
  }
  if (due === 0) return 0;

  const load = Math.min(1, due / 2);
  const state = plan && plan.eveningState;
  const stressed = state && Number.isFinite(state.stress) && state.stress >= HIGH_STRESS;
  return (stressed ? -DEADLINE_PENALTY : DEADLINE_LIFT) * load;
}

/* ------------------------------------------------------------------ *
 * Confidence
 * ------------------------------------------------------------------ */

/*
 * Focus is always a little less certain than the energy it was built from.
 *
 * Energy has a physiology behind it that is roughly the same for everybody.
 * Focus has a chronotype the user typed into an onboarding screen, and people
 * are famously wrong about their own. So the energy curve's confidence is
 * discounted, and the discount shrinks as personalWeight rises and the app is
 * working from what it watched rather than from what it was told. 'unsure'
 * costs a little more on top, because there it was not even told.
 *
 * Only personalWeight and the stated preference are read here, deliberately.
 * Letting a learned focusPeakHour raise the confidence would mean the curve
 * changed at personalWeight 0, where §8 says the learned value has no vote yet.
 */
const TRUST_BASE = 0.72;
const TRUST_GAIN = 0.23;
const TRUST_MAX_WEIGHT = 0.8;
const UNSURE_TRUST_COST = 0.08;

function focusTrust(profile, weight) {
  const gain = TRUST_GAIN * clamp(weight / TRUST_MAX_WEIGHT, 0, 1);
  const unsure = !profile || STATED_PEAK[profile.focusPreference] === undefined;
  return TRUST_BASE + gain - (unsure ? UNSURE_TRUST_COST : 0);
}

/* ------------------------------------------------------------------ *
 * The curve
 * ------------------------------------------------------------------ */

/*
 * The sample minutes, taken from the energy curve whenever there is one.
 *
 * The home screen draws both curves on one set of axes and the whole point of
 * that chart is the gap between them, so the two must be sampled at the same
 * minutes — a focus curve on its own grid would show a phantom lead or lag
 * everywhere the grids disagreed. Only when there is no energy curve at all
 * does this build a grid of its own from the plan.
 */
function sampleGrid(energy, plan) {
  const points = energy && Array.isArray(energy.points) ? energy.points : [];
  if (points.length) {
    return {
      from: Number.isFinite(energy.from) ? energy.from : points[0].minute,
      to: Number.isFinite(energy.to) ? energy.to : points[points.length - 1].minute,
      minutes: points.map((p) => p.minute),
    };
  }
  const from = plan && Number.isFinite(plan.wake) ? plan.wake : 420;
  const to = plan && Number.isFinite(plan.nextBedtime) ? bedtimeAbs(plan.nextBedtime) : 1380;
  const minutes = [];
  for (let m = from; m <= to; m += STEP) minutes.push(m);
  return { from, to, minutes: minutes.length ? minutes : [from] };
}

/** Nearest-sample lookup into the energy curve, for grids that do not line up. */
function energyReader(energy) {
  const points = energy && Array.isArray(energy.points) ? energy.points : [];
  const byMinute = new Map();
  for (const p of points) byMinute.set(p.minute, p);
  return (minute) => {
    if (byMinute.has(minute)) return byMinute.get(minute);
    let best = null;
    for (const p of points) {
      if (best === null || Math.abs(p.minute - minute) < Math.abs(best.minute - minute)) best = p;
    }
    return best;
  };
}

/*
 * The hourly summary, which is what a DayRecord keeps once the day is over.
 *
 * Each hour is the mean of the samples that fall in it rather than the sample
 * on the hour, so an hour containing a sharp dip reports the dip. Hours are
 * emitted in the order the day runs through them, which for a curve that
 * crosses midnight means 23 is followed by 0.
 */
function hourlyOf(points) {
  const order = [];
  const sums = new Map();
  for (const p of points) {
    const hour = Math.floor(p.minute / 60) % 24;
    if (!sums.has(hour)) {
      sums.set(hour, { total: 0, n: 0 });
      order.push(hour);
    }
    const bucket = sums.get(hour);
    bucket.total += p.value;
    bucket.n += 1;
  }
  return order.map((hour) => {
    const bucket = sums.get(hour);
    return { hour, value: Math.round(bucket.total / bucket.n) };
  });
}

/**
 * The focus curve for one day: `ctx` is the forecast context, `energy` is the
 * Curve energy.js already produced for the same day.
 *
 * Returns the same Curve shape as energy — step 15, absolute minutes that may
 * run past 1439, a value and a confidence on every point, and an hourly
 * summary — so anything that can draw one can draw the other.
 */
export function focusCurve(ctx, energy) {
  const profile = (ctx && ctx.profile) || {};
  const plan = (ctx && ctx.plan) || {};
  const learning = (ctx && ctx.learning) || null;
  const items = (ctx && Array.isArray(ctx.items)) ? ctx.items : [];

  /*
   * predict.js has already computed the blend and puts it on the context, but
   * this function is also called on its own by the validator and by tests, and
   * a curve that silently used a personal weight of undefined would look
   * plausible and be wrong.
   */
  const raw = ctx && Number.isFinite(ctx.personalWeight)
    ? ctx.personalWeight
    : personalWeight(learning);
  const weight = clamp(Number.isFinite(raw) ? raw : 0, 0, TRUST_MAX_WEIGHT);

  const wake = Number.isFinite(plan.wake) ? plan.wake : 420;
  const grid = sampleGrid(energy, plan);
  const span = Math.max(0, grid.to - grid.from);

  const shape = chronotype(profile, learning, weight, wake);
  const chains = taskChains(items);
  const recovery = recoveryMinutes(learning);
  const gapCentres = shortGapCentres(items);
  const pressure = deadlinePressure(items, ctx && ctx.date, plan);
  const trust = focusTrust(profile, weight);
  const readEnergy = energyReader(energy);

  const points = grid.minutes.map((minute) => {
    const source = readEnergy(minute);
    const level = source && Number.isFinite(source.value) ? source.value : NEUTRAL_ENERGY;
    const certainty = source && Number.isFinite(source.confidence)
      ? source.confidence
      : NEUTRAL_CONFIDENCE;

    const value = FOCUS_FLOOR + ENERGY_SHARE * level
      + chronotypeTerm(minute, shape.peak, shape.amplitude)
      + warmupTerm(minute, wake)
      + timeOnTaskTerm(onTaskRun(minute, chains, recovery))
      + fragmentationTerm(minute, gapCentres)
      + deadlineTerm(minute, pressure, grid.from, span);

    return {
      minute,
      value: Math.round(clamp(value, 0, 100)),
      confidence: Math.round(clamp(certainty * trust, 0, 100)),
    };
  });

  return { step: STEP, from: grid.from, to: grid.to, points, hourly: hourlyOf(points) };
}

/* ------------------------------------------------------------------ *
 * Best windows
 * ------------------------------------------------------------------ */

/*
 * Where the bar sits, and how long a good stretch is allowed to be.
 *
 * The threshold is relative to the day rather than a fixed number, because a
 * day that never gets above 60 still has a best part of it and the user still
 * has to put the hard task somewhere. Forty per cent of the way from the day's
 * mean to its peak picks out the genuinely better stretches on a varied day and
 * quietly gives up on a flat one, which is the honest outcome there.
 *
 * A single sample dipping under the bar is not two windows, so runs separated
 * by less than half an hour are merged. And nothing longer than three hours is
 * called a focus window: the chat says "your strongest focus is between X and
 * Y", and an X and Y nine hours apart is not an answer to anything. A longer
 * qualifying run is trimmed to its own best three hours.
 */
const THRESHOLD_SHARE = 0.4;
const MERGE_GAP = 30;
const MAX_WINDOW = 180;
const DEFAULT_MIN_MINUTES = 45;

function meanOf(points, key) {
  let total = 0;
  for (const p of points) total += p[key];
  return points.length ? total / points.length : 0;
}

/*
 * The longest a window may be, applied by sliding over the run and keeping the
 * best-scoring stretch. Ties keep the earlier stretch, so the answer does not
 * move between two renders of the same day.
 */
function trimToBest(run, size) {
  if (run.length <= size) return run;
  let best = run.slice(0, size);
  let bestScore = meanOf(best, 'value');
  for (let i = 1; i + size <= run.length; i += 1) {
    const candidate = run.slice(i, i + size);
    const score = meanOf(candidate, 'value');
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The best two or three stretches of the focus curve, best first.
 *
 * `opts` takes `minMinutes` (default 45), an optional explicit `threshold`, and
 * the `plan` whose wake and bedtime bound the answer. It also accepts the day's
 * `items` and does not read them: whether a window is already occupied is the
 * scheduler's question, and the density of the day has already reached this
 * curve through the time-on-task and fragmentation terms. A window the user is
 * busy in is still the truth about when they will think best.
 */
export function bestWindows(focus, opts) {
  const o = opts || {};
  const points = focus && Array.isArray(focus.points) ? focus.points : [];
  if (!points.length) return [];

  const step = Number.isFinite(focus.step) && focus.step > 0 ? focus.step : STEP;
  const minMinutes = Number.isFinite(o.minMinutes) ? o.minMinutes : DEFAULT_MIN_MINUTES;

  /*
   * A sample at minute m stands for the quarter hour starting at m, so a window
   * may not include the sample whose quarter hour runs past bedtime. Waking and
   * bedtime come from the plan when it is there and from the curve's own ends
   * when it is not; both are already in absolute minutes.
   */
  const plan = o.plan || null;
  let from = Number.isFinite(focus.from) ? focus.from : points[0].minute;
  let to = Number.isFinite(focus.to) ? focus.to : points[points.length - 1].minute + step;
  if (plan && Number.isFinite(plan.wake)) from = Math.max(from, plan.wake);
  if (plan && Number.isFinite(plan.nextBedtime)) to = Math.min(to, bedtimeAbs(plan.nextBedtime));

  const usable = points
    .filter((p) => p.minute >= from && p.minute + step <= to)
    .sort((a, b) => a.minute - b.minute);
  if (!usable.length) return [];

  const mean = meanOf(usable, 'value');
  const peak = usable.reduce((hi, p) => (p.value > hi ? p.value : hi), usable[0].value);
  const threshold = Number.isFinite(o.threshold)
    ? o.threshold
    : mean + THRESHOLD_SHARE * (peak - mean);

  const runs = [];
  let current = null;
  for (const p of usable) {
    const contiguous = current && p.minute - current[current.length - 1].minute === step;
    if (p.value >= threshold && contiguous) current.push(p);
    else if (p.value >= threshold) {
      current = [p];
      runs.push(current);
    } else {
      current = null;
    }
  }

  // Merge across a short dip, filling the gap back in so the mean over the
  // merged window is the mean of everything inside it and not only of its
  // better halves.
  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    const gap = last ? run[0].minute - (last[last.length - 1].minute + step) : Infinity;
    if (last && gap < MERGE_GAP) {
      for (const p of usable) {
        if (p.minute > last[last.length - 1].minute && p.minute < run[0].minute) last.push(p);
      }
      for (const p of run) last.push(p);
    } else {
      merged.push(run.slice());
    }
  }

  const size = Math.max(1, Math.floor(MAX_WINDOW / step));
  const candidates = merged
    .map((run) => trimToBest(run, size))
    .filter((run) => run.length * step >= minMinutes)
    .map((run) => ({
      start: run[0].minute,
      end: run[run.length - 1].minute + step,
      score: Math.round(meanOf(run, 'value')),
      confidence: Math.round(meanOf(run, 'confidence')),
    }))
    .sort((a, b) => (b.score - a.score) || (a.start - b.start));

  /*
   * Disjoint by construction — the runs came from separate stretches of one
   * curve — but the check is here anyway. The trimming and merging above are
   * the kind of code that grows a case, and two overlapping "best windows" on
   * the timeline is a bug a user would notice long before a test did.
   */
  const out = [];
  for (const w of candidates) {
    if (out.length >= 3) break;
    if (out.some((kept) => w.start < kept.end && kept.start < w.end)) continue;
    out.push(w);
  }
  return out;
}
