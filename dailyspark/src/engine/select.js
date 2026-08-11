/*
 * select.js — putting one spark in front of one person.
 *
 * The pipeline from the spec, minus the layers that need a server:
 *
 *   library → hard filters → bandit ranking + diversity → framing → safety
 *
 * The order matters and is not negotiable. Filters run before ranking so that
 * no score can promote a blocked topic or an unsafe item on a fragile day.
 * Safety runs last, after framing, because framing is the only step that
 * assembles text at runtime and therefore the only step that can introduce
 * something a human never approved.
 *
 * Everything here is deterministic given (state, day, random draws). The random
 * draws are the Thompson samples, which is the one place chance belongs: it is
 * how the app finds out what works for someone instead of assuming.
 */

import { LIBRARY, sparkById, STARTER_ARC } from '../data/sparks.index.js';
import { BUDGETS, categoryLabel, goalLabel, isFragile, moodOf, GOALS } from '../data/taxonomy.js';
import { dayKey, partOfDay, shiftKey } from '../core/day.js';
import * as store from '../core/store.js';
import { profileVector, cosine, learnTopics, zeros, topMatchingTopics } from './vector.js';
import * as bandit from './bandit.js';
import { allowedForMood } from './safety.js';
import { frame } from './framing.js';

/* How many days back the "don't repeat something similar" rule looks, and how
 * similar is too similar. 0.86 was picked against the real library: below it,
 * two genuinely different movement sparks start getting blocked. */
const SIMILARITY_WINDOW_DAYS = 90;
const SIMILARITY_CEILING = 0.86;

/*
 * How much of the library the no-repeat rule holds back.
 *
 * This started as "never repeat within 365 days", which is the right rule for
 * the eight-thousand-item library the product is designed around and the wrong
 * one for the library that actually ships. A sixty-day simulation showed why:
 * with eighty sparks, a year-long embargo means the eligible pool is empty
 * inside three months, every day falls through to the relaxation ladder, and
 * the ranker's learned preferences stop mattering because there is nothing left
 * to choose between. Personalisation quietly dies of a freshness rule.
 *
 * Holding back the most recent 70% instead keeps repeats as far apart as the
 * library can afford — with eighty items that is about eight weeks — while
 * always leaving a real choice for the ranker to make. It scales on its own as
 * the library grows: at eight hundred sparks this is a 560-day window and the
 * original intent is restored without changing a line.
 */
const REPEAT_FRACTION = 0.7;

/* Diversity penalty over the recent window, MMR-style. */
const DIVERSITY_WINDOW_DAYS = 14;
const DIVERSITY_WEIGHT = 0.35;

/* Per-occurrence penalty for the candidate's category appearing in the last
 * five deliveries. 0.09 is enough to break a run of three without ever
 * outvoting a strong learned preference on its own. */
const RUN_WEIGHT = 0.09;

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

function budgetFor(minutes) {
  return BUDGETS.find((b) => b.minutes === minutes) || BUDGETS[1];
}

/*
 * What the engine knows about right now.
 *
 * Energy comes from the mood check-in when there is one and from the profile's
 * typical energy when there is not. Skipping the check-in is a supported path,
 * not a degraded one — the app must never require a person to report their
 * feelings in order to work.
 */
export function buildContext(state, opts) {
  const o = opts || {};
  const day = o.day || dayKey();
  const entry = state.days[day] || {};
  const mood = o.mood !== undefined ? o.mood : (entry.mood || null);
  const moodDef = moodOf(mood);

  const behaviour = state.topics;
  const interactions = (state.model && state.model.updates) || 0;
  const userVec = profileVector(state.profile, behaviour, interactions);

  return {
    day,
    part: partOfDay(),
    tone: state.profile.tone,
    mood,
    fragile: isFragile(mood),
    energy: o.energy !== undefined ? o.energy
      /* "יותר מדי היום" sets a three-day floor on size. Applied here rather
       * than at the filter so it shows up in the ranker's energy-fit feature
       * too, and lifts by itself without anyone having to undo it. */
      : Math.min(entry.energy || (moodDef ? moodDef.energy : 3),
        isSoftened(state) ? 1 : 5),
    budgetMinutes: state.profile.budgetMinutes,
    streak: state.streak.current,
    userVec,
    interactions,
  };
}

/* ------------------------------------------------------------------ *
 * Hard filters
 * ------------------------------------------------------------------ */

/*
 * The candidate pool.
 *
 * Every rule in here is a veto. If this returns nothing the caller relaxes the
 * rules in a fixed order (see `pool()`), rather than any single rule being
 * softened here — that keeps "which constraint did we give up" visible instead
 * of spread across the filter.
 */
function filterPool(state, ctx, opts) {
  const o = opts || {};
  const allowedSizes = budgetFor(ctx.budgetMinutes).allows;
  const blocked = new Set(state.profile.blocked || []);
  /* `seen` is oldest-first, so the tail is the recent embargo and anything
   * older has aged out and may come round again. */
  const embargo = Math.floor(LIBRARY.length * REPEAT_FRACTION);
  const seen = new Set(o.ignoreSeen ? [] : state.seen.slice(-embargo));
  const exclude = new Set(o.exclude || []);
  const interests = state.profile.interests || {};

  const recent = recentSparks(state, SIMILARITY_WINDOW_DAYS);

  return LIBRARY.filter((s) => {
    if (exclude.has(s.id)) return false;
    if (seen.has(s.id)) return false;
    if (blocked.has(s.category)) return false;
    if (!o.ignoreBudget && !allowedSizes.includes(s.size)) return false;
    if (!allowedForMood(s, ctx.mood)) return false;
    /* Interest 0 means "not this area", and unlike a low rank that is a
     * statement, so it is enforced here. */
    if (!o.ignoreInterests && interests[s.category] === 0) return false;
    if (o.type && s.type !== o.type) return false;
    if (o.size && s.size !== o.size) return false;
    if (o.freshCategory && recent.some((r) => r.category === s.category)) return false;

    if (!o.ignoreSimilarity) {
      for (const r of recent) {
        if (cosine(Array.from(s.vector), Array.from(r.vector)) > SIMILARITY_CEILING) return false;
      }
    }
    return true;
  });
}

/*
 * Sparks delivered in the last `days` days, newest first.
 *
 * Sorted rather than trusting insertion order: after a backup restore the keys
 * come back in whatever order the JSON had, and the run-length penalty below
 * reads "the last five" off the front of this list.
 */
function recentSparks(state, days) {
  const from = shiftKey(dayKey(), -days);
  return Object.keys(state.days)
    .filter((key) => key >= from)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => sparkById(state.days[key].sparkId))
    .filter(Boolean);
}

/*
 * Get a usable pool, giving up constraints in a defined order.
 *
 * A person with a narrow profile and a year of history will eventually exhaust
 * the strict pool, and "no spark today" is not an acceptable outcome. The order
 * below gives up the cheapest thing first: novelty of *phrasing* before novelty
 * of *item*, and the safety rules never at all — `allowedForMood` is not in
 * this list and cannot be relaxed.
 */
function pool(state, ctx, opts) {
  const relaxations = [
    {},
    { ignoreSimilarity: true },
    { ignoreSimilarity: true, ignoreInterests: true },
    { ignoreSimilarity: true, ignoreInterests: true, ignoreSeen: true },
  ];
  for (const relax of relaxations) {
    const found = filterPool(state, ctx, Object.assign({}, opts, relax));
    if (found.length) return { list: found, relaxed: relax };
  }
  /* Last resort: safe items only, ignoring everything else. On a fragile day
   * this is the evergreen set; on an ordinary day it is still a real spark. */
  const safe = LIBRARY.filter((s) => allowedForMood(s, ctx.mood));
  return { list: safe.length ? safe : LIBRARY.slice(), relaxed: { fallback: true } };
}

/* ------------------------------------------------------------------ *
 * Ranking
 * ------------------------------------------------------------------ */

function goalMatch(state, spark) {
  let best = 0;
  let label = null;
  for (const key of state.profile.goals || []) {
    const goal = GOALS.find((g) => g.key === key);
    if (!goal) continue;
    const overlap = goal.topics.filter((t) => spark.topics.includes(t)).length;
    if (!overlap) continue;
    const score = overlap / goal.topics.length;
    if (score > best) { best = score; label = goalLabel(key); }
  }
  return { score: best, label };
}

/*
 * Score and pick.
 *
 * Thompson sampling supplies the exploration; the diversity term supplies the
 * variety that sampling alone does not guarantee (a confident model will
 * happily serve the same category for eleven days, each pick locally correct).
 * The two together are what stops the app becoming narrow without making it
 * random.
 */
function rank(state, ctx, list) {
  const model = bandit.hydrate(state.model);
  const recentList = recentSparks(state, DIVERSITY_WINDOW_DAYS);
  const recent = recentList.map((s) => Array.from(s.vector));
  const recentCategories = new Set(recentList.map((s) => s.category));

  const scored = list.map((spark) => {
    const vec = Array.from(spark.vector);
    const topicSim = Math.max(0, cosine(ctx.userVec, vec));
    const goal = goalMatch(state, spark);

    /* Novelty here is about the *area*, not the item — the item is already
     * guaranteed unseen by the filter. Something from a category the person has
     * not met recently is worth a small push, because the alternative is a
     * model that never learns what it never tries. */
    const seenCategory = recentCategories.has(spark.category);

    const x = bandit.features(spark, {
      part: ctx.part,
      tone: ctx.tone,
      topicSim,
      goalAlign: goal.score,
      energy: ctx.energy,
      novelty: seenCategory ? 0 : 1,
    });

    let score = bandit.sampleScore(model, x);

    let maxSim = 0;
    for (const r of recent) maxSim = Math.max(maxSim, cosine(vec, r));
    score -= DIVERSITY_WEIGHT * maxSim;

    /*
     * A separate, blunter penalty for the same *area* several days running.
     *
     * The cosine term above cannot do this job: two focus sparks about
     * different things — closing tabs and a distraction pad — share almost no
     * topics, so it sees variety where a reader sees "focus again". Once the
     * ranker becomes confident about someone's favourite area, that reads as a
     * rut. Counting the last five deliveries by category catches it directly.
     */
    let runPenalty = 0;
    for (let i = 0; i < Math.min(5, recentList.length); i += 1) {
      if (recentList[i].category === spark.category) runPenalty += RUN_WEIGHT;
    }
    score -= runPenalty;

    return { spark, score, x, topicSim, goal, isNewCategory: !seenCategory };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

/*
 * Which day of the opening arc we are on, or null once it is over.
 *
 * Counted from the number of days actually delivered rather than from the
 * calendar, so someone who installs the app and comes back a week later still
 * gets day two of the arc rather than being dropped into the middle of a
 * sequence they never saw.
 */
function arcSlot(state) {
  const delivered = Object.keys(state.days).length;
  if (delivered >= STARTER_ARC.length) return null;
  return STARTER_ARC[delivered];
}

/** Which category the model currently likes most — used for "why this". */
function learnedCategory(state) {
  const model = bandit.hydrate(state.model);
  if (model.updates < 6) return null;
  let best = null;
  let bestValue = 0.15;                 // must be a real preference, not noise
  const probe = { part: 'morning', tone: state.profile.tone, topicSim: 0, goalAlign: 0, energy: 3 };
  for (const spark of LIBRARY) {
    const x = bandit.features(spark, probe);
    const p = bandit.predict(model, x);
    if (p > bestValue) { bestValue = p; best = spark.category; }
  }
  return best;
}

/*
 * Choose today's spark and return it framed and ready to render.
 *
 * Does not write anything — `ensureToday` owns persistence. Keeping selection
 * side-effect free is what lets the reroll path and the preview in settings run
 * it without touching the day's record.
 */
export function selectSpark(state, opts) {
  const o = opts || {};
  const ctx = buildContext(state, o);
  const arc = o.ignoreArc ? null : arcSlot(state);

  const constraints = {};
  if (arc) {
    if (arc.type) constraints.type = arc.type;
    if (arc.size) constraints.size = arc.size;
    if (arc.freshCategory) constraints.freshCategory = true;
  }
  if (o.exclude) constraints.exclude = o.exclude;

  let chosen = rank(state, ctx, pool(state, ctx, constraints).list)[0];
  /* The arc is a preference, not a promise: if its shape leaves nothing, drop
   * it rather than dropping the day. */
  if (!chosen) chosen = rank(state, ctx, pool(state, ctx, { exclude: o.exclude }).list)[0];
  if (!chosen) return null;

  const goal = chosen.goal;
  const framed = frame(chosen.spark, {
    tone: ctx.tone,
    part: ctx.part,
    mood: ctx.mood,
    energy: ctx.energy,
    streak: ctx.streak,
    budgetMinutes: ctx.budgetMinutes,
    goalLabel: goal.score >= 0.34 ? goal.label : null,
    learnedCategory: learnedCategory(state),
    categoryLabel: categoryLabel(chosen.spark.category),
    isNewCategory: chosen.isNewCategory,
  });

  return {
    spark: chosen.spark,
    framed,
    score: chosen.score,
    topics: topMatchingTopics(ctx.userVec, Array.from(chosen.spark.vector), 2),
    context: {
      part: ctx.part, mood: ctx.mood, energy: ctx.energy, tone: ctx.tone,
    },
  };
}

/*
 * The day's record, created on first read.
 *
 * Once written, the choice is fixed for the day. Re-rolling replaces it
 * explicitly; simply reopening the app must not, or the app becomes a slot
 * machine and the daily-item promise means nothing.
 */
export function ensureToday() {
  const state = store.get();
  const key = dayKey();
  const existing = state.days[key];
  if (existing && existing.sparkId && sparkById(existing.sparkId)) return existing;

  const picked = selectSpark(state, { day: key });
  if (!picked) return null;

  store.putDay(key, {
    sparkId: picked.spark.id,
    title: picked.framed.title,
    body: picked.framed.body,
    action: picked.framed.action,
    why: picked.framed.why,
    framed: picked.framed.framed,
    status: 'delivered',
    deliveredAt: Date.now(),
    mood: (state.days[key] || {}).mood || null,
    energy: (state.days[key] || {}).energy || null,
    context: picked.context,
    saved: false,
    rerolls: 0,
    note: '',
  });
  store.markSeen(picked.spark.id);
  return store.dayEntry(key);
}

/*
 * Replace today's spark.
 *
 * The rejected item is recorded as a negative signal before the replacement is
 * chosen, so the new pick already reflects the refusal. `reason` comes from the
 * "not for me" sheet and steers the correction — this is the loop that turns a
 * dismissal into a better tomorrow instead of just a blank card.
 */
export function reroll(reason) {
  const key = dayKey();
  const before = store.dayEntry(key);
  if (!before) return ensureToday();

  applyFeedback(reason ? 'rejected' : 'rerolled', { reason, silent: true });

  const state = store.get();
  const exclude = [before.sparkId];

  /* "Too much for me today" is about size, not subject — so the replacement is
   * forced smaller rather than merely re-ranked. Nothing else in the pipeline
   * expresses "same idea, less of it". */
  const opts = { day: key, exclude, ignoreArc: true };
  if (reason === 'too_much') opts.energy = 1;

  const picked = selectSpark(state, opts);
  if (!picked) return before;

  store.putDay(key, {
    sparkId: picked.spark.id,
    title: picked.framed.title,
    body: picked.framed.body,
    action: picked.framed.action,
    why: picked.framed.why,
    framed: picked.framed.framed,
    status: 'delivered',
    deliveredAt: Date.now(),
    context: picked.context,
    saved: false,
    rerolls: (before.rerolls || 0) + 1,
  });
  store.markSeen(picked.spark.id);
  return store.dayEntry(key);
}

/* ------------------------------------------------------------------ *
 * Learning
 * ------------------------------------------------------------------ */

/*
 * Fold one interaction back into both models.
 *
 * Two updates, not one, because they answer different questions. The bandit
 * learns the *shape* that works (this person acts on short tips in the
 * morning); the topic vector learns the *subject* that works (this person acts
 * on anything about movement). Either alone produces a recognisable failure —
 * shape-only becomes tonally right and thematically random, subject-only
 * becomes thematically right and always the wrong size.
 */
export function applyFeedback(signal, opts) {
  const o = opts || {};
  const key = o.day || dayKey();
  const state = store.get();
  const entry = state.days[key];
  if (!entry) return;
  const spark = sparkById(entry.sparkId);
  if (!spark) return;

  const ctx = buildContext(state, { day: key });
  const goal = goalMatch(state, spark);
  const x = bandit.features(spark, {
    part: (entry.context && entry.context.part) || ctx.part,
    tone: ctx.tone,
    topicSim: Math.max(0, cosine(ctx.userVec, Array.from(spark.vector))),
    goalAlign: goal.score,
    energy: entry.energy || ctx.energy,
    novelty: 1,
  });

  const model = bandit.hydrate(state.model);
  bandit.learn(model, x, bandit.rewardOf(signal));

  const topics = learnTopics(state.topics || zeros(), Array.from(spark.vector),
    bandit.signedReward(signal));

  store.update((s) => {
    s.model = { mu: model.mu, sigma: model.sigma, updates: model.updates };
    s.topics = topics;

    /*
     * "Not for me" carries a reason, and each reason corrects something
     * different. Without this the four buttons would be one button with extra
     * steps — which is exactly how most apps ship a feedback menu.
     */
    if (signal === 'rejected' && o.reason) {
      if (o.reason === 'irrelevant') {
        const cur = s.profile.interests[spark.category];
        if (cur > 0) s.profile.interests[spark.category] = cur - 1;
      } else if (o.reason === 'too_much') {
        /* Three days of smaller sizes, then it lifts on its own. A permanent
         * downgrade from one bad day would be the app over-learning a mood. */
        s.profile.softenUntil = shiftKey(key, 3);
      } else if (o.reason === 'wrong_tone') {
        s.profile.toneQuestioned = (s.profile.toneQuestioned || 0) + 1;
      }
    }
  });
}

/** Has the user asked for smaller sparks recently? Consumed by buildContext. */
export function isSoftened(state) {
  return !!(state.profile.softenUntil && dayKey() <= state.profile.softenUntil);
}
