/*
 * forecast.js — the browser's cache in front of the prediction engine.
 *
 * forecast() is pure and reasonably cheap, but it is not free: it draws two
 * curves at fifteen-minute resolution, runs the risk pass, scores six factors
 * and then searches the candidate space for the highest-impact recommendation,
 * which is itself dozens of inner forecasts. Calling that from inside a render
 * is how a scroll starts to stutter, and every card on the home screen wants
 * the same answer.
 *
 * So it is computed once per meaningful change and handed around. "Meaningful"
 * is the interesting part: the signature below is deliberately built from the
 * things the engine actually reads, so editing a task on Thursday does not
 * invalidate Wednesday's forecast, and moving between screens does not
 * recompute anything at all.
 */

import { forecast as predictForecast } from '../engine/predict.js';
import { primaryRecommendation } from '../engine/optimize.js';
import { get, itemsOn, dayPlan, record, recentRecords } from './store.js';

const cache = new Map();

/*
 * A cheap fingerprint of everything the forecast depends on.
 *
 * Cheap matters: this runs on every render, so it must cost far less than the
 * work it is avoiding. Only the fields the engine reads are included — a task's
 * notes can change all day without moving a single number, and hashing them
 * would throw away the cache for nothing.
 */
function signatureOf(date, root, items, plan, morning) {
  const parts = [
    date,
    plan.wake, plan.bedtime, plan.nextBedtime,
    plan.topPriorities.join(','),
    plan.eveningState ? `${plan.eveningState.energy}/${plan.eveningState.mood}/${plan.eveningState.stress}` : '-',
    morning ? `${morning.energy}/${morning.mood}/${morning.sleepQuality}` : '-',
    root.learning.updatedAt || '-',
    root.learning.samples.days,
    root.profile.wakeTime, root.profile.bedTime, root.profile.focusPreference,
  ];
  for (const i of items) {
    parts.push(`${i.id}:${i.start}:${i.duration}:${i.status}:${i.priority}:${i.locked ? 1 : 0}:${i.energyRequirement}:${i.focusRequirement}:${i.isTop ? 1 : 0}:${i.type}:${i.deadline || '-'}`);
  }
  return parts.join('|');
}

/** The raw input the engine was given — the chat and the sandbox both re-run it. */
export function inputFor(date, now) {
  const root = get();
  const items = itemsOn(date);
  const plan = dayPlan(date);
  const rec = record(date);
  return {
    date,
    profile: root.profile,
    plan,
    items,
    learning: root.learning,
    history: recentRecords(90),
    now,
    morning: rec.morning,
  };
}

/**
 * The forecast for one day, computed at most once per change.
 *
 * `now` is passed through rather than read here, so the engine below stays a
 * function of its arguments and the whole thing remains testable in plain Node.
 */
export function forecastFor(date, now, opts) {
  const light = !!(opts && opts.light);
  const key = light ? `${date}:light` : date;
  const root = get();
  const items = itemsOn(date);
  const plan = dayPlan(date);
  const rec = record(date);
  const sig = signatureOf(date, root, items, plan, rec.morning);

  const hit = cache.get(key);
  if (hit && hit.sig === sig) return hit.value;

  const input = inputFor(date, now);
  const value = predictForecast(input);

  /*
   * The recommendation is attached here rather than inside forecast(), because
   * finding it means scoring candidate days and scoring a day means calling
   * forecast() — so asking the engine for it would make predict and optimize
   * import each other. This is the layer that legitimately knows both.
   *
   * The light variant skips it: the week view builds seven forecasts and the
   * history screen scrolls through ninety, and each recommendation costs a
   * small search over candidate days. Nothing on those screens shows one.
   */
  if (!light) value.recommendation = primaryRecommendation(input);

  cache.set(key, { sig, value, input });

  /*
   * The week view asks for seven days at once and history scrolls through
   * ninety. Without a bound this map is a slow leak that only shows up after a
   * long session, which is the worst kind.
   */
  if (cache.size > 40) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  return value;
}

/**
 * Seven days at a glance, for the week forecast.
 *
 * Light on purpose: the highest-impact recommendation costs dozens of inner
 * forecasts to find, and the week grid shows a score and a headline risk per
 * day, neither of which needs it. Asking for the full thing seven times over
 * turned opening the week view into a visible pause.
 */
export function weekForecast(dates, now) {
  return dates.map((d) => forecastFor(d, now, { light: true }));
}

/** Drop everything. Used after any write, and after import, reset or demo load. */
export function invalidate(date) {
  if (date) { cache.delete(date); cache.delete(`${date}:light`); }
  else cache.clear();
}
