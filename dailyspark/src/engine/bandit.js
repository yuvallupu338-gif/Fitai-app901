/*
 * bandit.js — the ranker.
 *
 * A per-user Bayesian logistic model over hand-built features, sampled with
 * Thompson sampling. Chosen over anything deeper for four reasons that all
 * matter more here than model capacity:
 *
 *   1. It works on day one. There is no cold-start pool of other users to
 *      borrow from — everything is local — so a model that needs thousands of
 *      rows before it beats a constant is not a model, it is a delay.
 *   2. Exploration is the point, not a side effect. The app's job is to find
 *      out what works for one person, and Thompson sampling explores in
 *      proportion to how uncertain it actually is, which beats a fixed epsilon
 *      that keeps testing things it already settled.
 *   3. It is inspectable. `explain()` below is what makes "למה קיבלת את זה"
 *      an honest sentence rather than a plausible-sounding one.
 *   4. It updates in constant time on a phone, with a diagonal covariance and
 *      no matrix inversion.
 *
 * The features are deliberately coarse. With a few hundred interactions per
 * user over a year, a wider feature vector would mean every weight stays at its
 * prior and the whole thing degenerates into random selection.
 */

import { CATEGORY_KEYS, SIZE_KEYS } from '../data/taxonomy.js';

const TYPES = ['quote', 'action', 'tip'];
const PARTS = ['morning', 'midday', 'evening'];

/*
 * Feature layout. Appending is safe; re-ordering invalidates every stored
 * model, which is why the offsets are computed rather than written out.
 */
const F = (() => {
  let at = 0;
  const take = (n) => { const start = at; at += n; return start; };
  const layout = {
    bias: take(1),
    category: take(CATEGORY_KEYS.length),   // 12
    type: take(TYPES.length),               // 3
    size: take(SIZE_KEYS.length),           // 3
    typeByPart: take(TYPES.length * PARTS.length), // 9 — "tips land in the morning"
    toneMatch: take(1),
    topicSim: take(1),
    goalAlign: take(1),
    energyFit: take(1),
    novelty: take(1),
  };
  layout.length = at;
  return layout;
})();

export const FEATURE_COUNT = F.length;

/*
 * Priors.
 *
 * mu starts at zero (no opinion) except the bias, which starts slightly
 * positive: the honest prior is that a person who opened the app is somewhat
 * likely to act on a reasonable suggestion. sigma starts high so the first
 * dozen days explore widely — this is the mechanism behind the opening arc's
 * "probe" behaviour, expressed as uncertainty rather than as a special case.
 */
export function freshModel() {
  const mu = new Array(FEATURE_COUNT).fill(0);
  const sigma = new Array(FEATURE_COUNT).fill(0.9);
  mu[F.bias] = 0.4;
  sigma[F.bias] = 0.3;
  return { mu, sigma, updates: 0 };
}

export function hydrate(stored) {
  if (!stored || !Array.isArray(stored.mu) || stored.mu.length !== FEATURE_COUNT) {
    /* Length mismatch means the feature layout changed between releases.
     * Starting over is correct and cheap: the behavioural topic vector, which
     * holds the slower and more valuable half of what was learned, is stored
     * separately and survives. */
    return freshModel();
  }
  return {
    mu: stored.mu.slice(),
    sigma: (stored.sigma || []).length === FEATURE_COUNT
      ? stored.sigma.slice() : new Array(FEATURE_COUNT).fill(0.9),
    updates: stored.updates || 0,
  };
}

/** Build the feature vector for one candidate in one context. */
export function features(spark, ctx) {
  const x = new Array(FEATURE_COUNT).fill(0);
  x[F.bias] = 1;

  const ci = CATEGORY_KEYS.indexOf(spark.category);
  if (ci >= 0) x[F.category + ci] = 1;

  const ti = TYPES.indexOf(spark.type);
  if (ti >= 0) x[F.type + ti] = 1;

  const si = SIZE_KEYS.indexOf(spark.size);
  if (si >= 0) x[F.size + si] = 1;

  const pi = PARTS.indexOf(ctx.part);
  if (ti >= 0 && pi >= 0) x[F.typeByPart + ti * PARTS.length + pi] = 1;

  x[F.toneMatch] = spark.tone === ctx.tone ? 1 : 0;
  x[F.topicSim] = ctx.topicSim || 0;
  x[F.goalAlign] = ctx.goalAlign || 0;

  /* How well the size matches the energy on hand. 1 when the spark is at or
   * below what the person has, falling off when it asks for more. */
  const need = { micro: 1, standard: 3, stretch: 4 }[spark.size] || 3;
  x[F.energyFit] = need <= ctx.energy ? 1 : Math.max(0, 1 - (need - ctx.energy) * 0.5);

  x[F.novelty] = ctx.novelty === undefined ? 1 : ctx.novelty;
  return x;
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

export function predict(model, x) {
  let z = 0;
  for (let i = 0; i < x.length; i += 1) z += model.mu[i] * x[i];
  return sigmoid(z);
}

/*
 * Box–Muller, because Math.random() alone cannot give a normal deviate and
 * Thompson sampling needs one per feature per candidate.
 */
function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/*
 * One Thompson draw: sample a weight vector from the posterior and score with
 * it. Sampling once per *candidate* rather than once per round is intentional —
 * it decorrelates the draws so a single unlucky sample cannot suppress a whole
 * category for the day.
 */
export function sampleScore(model, x) {
  let z = 0;
  for (let i = 0; i < x.length; i += 1) {
    if (!x[i]) continue;
    z += (model.mu[i] + model.sigma[i] * gauss()) * x[i];
  }
  return sigmoid(z);
}

/*
 * Online update, Laplace-style.
 *
 * The gradient step moves mu toward the observed reward; sigma shrinks only for
 * the features that were actually present, which is what keeps uncertainty high
 * for categories the person has never been offered. The shrink is bounded below
 * so the model never becomes so certain that it stops exploring entirely — a
 * person's life changes, and a model with zero variance cannot notice.
 */
export function learn(model, x, reward) {
  const p = predict(model, x);
  const err = reward - p;
  for (let i = 0; i < x.length; i += 1) {
    if (!x[i]) continue;
    const step = model.sigma[i] * model.sigma[i];
    model.mu[i] += step * err * x[i];
    model.sigma[i] = Math.max(0.12, model.sigma[i] * (1 - 0.06 * Math.abs(x[i])));
  }
  model.updates += 1;
  return model;
}

/*
 * Which features pushed this candidate up, in plain terms.
 *
 * Used by the card's "why this" line and by the debug view. Only positive
 * contributions are reported: telling someone their spark won partly because it
 * is *not* a quote is true and useless.
 */
export function explain(model, x) {
  const parts = [];
  const push = (label, value) => { if (value > 0.02) parts.push({ label, value }); };

  const ci = x.slice(F.category, F.category + CATEGORY_KEYS.length).indexOf(1);
  if (ci >= 0) push(`category:${CATEGORY_KEYS[ci]}`, model.mu[F.category + ci] * 1);

  const ti = x.slice(F.type, F.type + TYPES.length).indexOf(1);
  if (ti >= 0) push(`type:${TYPES[ti]}`, model.mu[F.type + ti]);

  const si = x.slice(F.size, F.size + SIZE_KEYS.length).indexOf(1);
  if (si >= 0) push(`size:${SIZE_KEYS[si]}`, model.mu[F.size + si]);

  push('tone', model.mu[F.toneMatch] * x[F.toneMatch]);
  push('topics', model.mu[F.topicSim] * x[F.topicSim]);
  push('goal', model.mu[F.goalAlign] * x[F.goalAlign]);
  parts.sort((a, b) => b.value - a.value);
  return parts;
}

/* ------------------------------------------------------------------ *
 * Reward
 * ------------------------------------------------------------------ */

/*
 * Signal weights, straight from the spec.
 *
 * Completion is the only +1 because it is the only event that means the person
 * actually did something. Opening and lingering are worth a little; asking for
 * a different spark is worth negative, because a reroll is a rejection that was
 * too polite to say so.
 */
export const SIGNALS = {
  completed: 1.0,
  saved: 0.6,
  shared: 0.55,
  note_added: 0.5,
  timer_used: 0.45,
  expanded: 0.25,
  dwell: 0.2,
  deferred: -0.15,
  ignored: -0.25,
  rerolled: -0.35,
  rejected: -1.0,
};

/** Map a signal to the [0,1] target the logistic model is trained against. */
export function rewardOf(signal) {
  const raw = SIGNALS[signal];
  if (raw === undefined) return 0.5;
  return (raw + 1) / 2;
}

/** The signed value, for the topic vector — which does want a direction. */
export function signedReward(signal) {
  const raw = SIGNALS[signal];
  return raw === undefined ? 0 : raw;
}

/* ------------------------------------------------------------------ *
 * Send-time bandit
 * ------------------------------------------------------------------ */

/*
 * Six candidate notification slots, as Beta posteriors.
 *
 * Separate from the content model because the question is different and the
 * evidence is much sparser — one observation per day at most. A Beta-Bernoulli
 * bandit is the right size for it, and the reward is deliberately not "did they
 * open it": opening at 07:30 and doing nothing is worth less than opening at
 * 12:30 and acting.
 */
export const SLOTS = [
  { hour: 6, minute: 30 },
  { hour: 7, minute: 30 },
  { hour: 8, minute: 30 },
  { hour: 12, minute: 30 },
  { hour: 17, minute: 30 },
  { hour: 20, minute: 30 },
];

export function freshSendTime() {
  return { alpha: SLOTS.map(() => 1), beta: SLOTS.map(() => 1), lastSlot: null };
}

/* Sampling from Beta via two Gammas is overkill for six arms; this uses the
 * standard ratio-of-uniforms-free trick of averaging uniforms, which is close
 * enough for a choice that is re-made every day and self-corrects. */
function betaSample(a, b) {
  const x = gammaSample(a);
  const y = gammaSample(b);
  return x / (x + y || 1);
}

function gammaSample(k) {
  /* Marsaglia–Tsang, valid for k >= 1; all our k start at 1 and only grow. */
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 64; i += 1) {
    const z = gauss();
    const v = (1 + c * z) ** 3;
    if (v <= 0) continue;
    const u = Math.random();
    if (Math.log(u) < 0.5 * z * z + d - d * v + d * Math.log(v)) return d * v;
  }
  return d;
}

export function pickSlot(sendTime, prefer) {
  const st = sendTime && Array.isArray(sendTime.alpha) && sendTime.alpha.length === SLOTS.length
    ? sendTime : freshSendTime();
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < SLOTS.length; i += 1) {
    let s = betaSample(st.alpha[i], st.beta[i]);
    /* A stated preference is a strong prior, not a veto — if someone said 08:00
     * but only ever acts in the evening, the evening should eventually win. */
    if (prefer !== undefined && Math.abs(SLOTS[i].hour - prefer) <= 1) s += 0.25;
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}

export function learnSlot(sendTime, slot, outcome) {
  const st = sendTime && Array.isArray(sendTime.alpha) && sendTime.alpha.length === SLOTS.length
    ? sendTime : freshSendTime();
  /* acted > opened > ignored. Fractional updates keep one good day from
   * locking the schedule. */
  const gain = { acted: 1.0, opened: 0.5, ignored: 0 }[outcome] || 0;
  st.alpha[slot] += gain;
  st.beta[slot] += 1 - gain;
  return st;
}
