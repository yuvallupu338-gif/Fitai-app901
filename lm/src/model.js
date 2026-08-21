/*
 * model.js — the model, and the arithmetic that trains it.
 *
 * The whole thing is one idea: look at the last C characters, and guess the
 * next one. Each character in the window is looked up in an embedding table,
 * the C vectors are laid end to end, that goes through a single tanh layer, and
 * the output layer scores every character in the vocabulary. Softmax turns the
 * scores into probabilities, cross-entropy says how surprised the model was by
 * the character that actually came next, and backprop moves every weight a
 * little way against that surprise. Bengio 2003, minus twenty years.
 *
 * It is deliberately stupid. There is no attention, so it cannot refer back to
 * anything it wrote more than C characters ago; there is no recurrence, so it
 * has no state at all between steps; the window is fixed at build time and
 * padded with newlines at the start. What it can learn is local: which letters
 * follow which, where spaces go, that a line has a shape. That turns out to be
 * enough to produce text that looks like Hebrew from across the room and falls
 * apart the moment you read it, which is exactly the interesting failure.
 *
 * Everything is Float64Array. Float32 would halve the memory, but doubles are
 * what a JS number already is, so f32 storage costs a conversion on every read
 * and write, and — the reason that matters here — the numeric gradient check in
 * tools/lm-check.mjs can only resolve an error down to f32's own noise floor.
 * At these sizes the memory is irrelevant and the certainty is not.
 *
 * Matrices are row-major and the loops are ordered so the innermost index walks
 * contiguous memory — the summed-over index on the outside, accumulating into
 * the output row, rather than the textbook dot product per output unit. At the
 * default size that ordering is a wash (the dot product's register accumulator
 * roughly cancels its strided reads, and measured about a tenth faster); by the
 * time the sliders reach a 1536-wide input and 512 hidden units it is 2.4x,
 * because the other order walks down a column of a six megabyte matrix and
 * misses the cache on every element. So: the order that stays fast as the model
 * grows, at the cost of nothing at the size it starts.
 *
 * A step at the defaults takes about ten milliseconds — a hundred a second in a
 * browser tab, a little more from node.
 */

import { makeRng, fillGauss, sampleFrom } from './rng.js';

export const FORMAT = 'dumb-lm/1';

/* Ceilings, not recommendations. They exist so that a model file off a stranger's
 * disk cannot ask the page for a 40 GB allocation before anything has looked at
 * what is in it. */
export const LIMITS = {
  context: 64,
  embed: 256,
  hidden: 2048,
  vocab: 512,
  params: 25e6,
};

const int = (x) => Number.isInteger(x) && Number.isFinite(x);

/** How many weights a configuration would have. */
export function paramCount({ vocabSize, context, embed, hidden }) {
  return vocabSize * embed          // E
    + context * embed * hidden      // W1
    + hidden                        // b1
    + hidden * vocabSize            // W2
    + vocabSize;                    // b2
}

/**
 * A fresh model with random weights.
 *
 * The init scales are the part that looks arbitrary and is not. Embeddings are
 * drawn at 0.5, and W1 at (5/3)/sqrt(fan_in) — the standard tanh gain — which
 * together put the hidden pre-activations at a standard deviation just under
 * one: wide enough to use the curve of the tanh, not so wide that most units
 * start saturated with a gradient of nearly zero. W2 starts at a hundredth of
 * that, so the first logits are all nearly equal and the first loss is ln(V),
 * the loss of a model that knows nothing and admits it. Start it larger and the
 * first hundred steps are spent undoing confident nonsense.
 */
export function createModel({ chars, context = 8, embed = 24, hidden = 128, seed = 1, padToken = 0 }) {
  if (!Array.isArray(chars) || chars.length < 2) {
    throw new Error('model: the vocabulary needs at least two characters');
  }
  if (!int(context) || context < 1 || context > LIMITS.context) throw new Error('model: bad context');
  if (!int(embed) || embed < 1 || embed > LIMITS.embed) throw new Error('model: bad embed');
  if (!int(hidden) || hidden < 1 || hidden > LIMITS.hidden) throw new Error('model: bad hidden');
  if (chars.length > LIMITS.vocab) throw new Error('model: vocabulary too large');

  const V = chars.length;
  const inDim = context * embed;
  if (paramCount({ vocabSize: V, context, embed, hidden }) > LIMITS.params) {
    throw new Error('model: too many parameters');
  }

  const rng = makeRng(seed);
  const model = {
    format: FORMAT,
    chars: chars.slice(),
    stoi: new Map(chars.map((ch, i) => [ch, i])),
    vocabSize: V,
    context, embed, hidden, inDim, seed,
    padToken: padToken >= 0 && padToken < V ? padToken : 0,
    E: fillGauss(new Float64Array(V * embed), rng, 0.5),
    W1: fillGauss(new Float64Array(inDim * hidden), rng, (5 / 3) / Math.sqrt(inDim)),
    b1: new Float64Array(hidden),
    W2: fillGauss(new Float64Array(hidden * V), rng, 0.01),
    b2: new Float64Array(V),
  };
  return model;
}

/** Gradient buffers with the same shapes as the weights. */
export function createGrads(model) {
  return {
    E: new Float64Array(model.E.length),
    W1: new Float64Array(model.W1.length),
    b1: new Float64Array(model.b1.length),
    W2: new Float64Array(model.W2.length),
    b2: new Float64Array(model.b2.length),
  };
}

const TENSORS = ['E', 'W1', 'b1', 'W2', 'b2'];

function zeroGrads(g) {
  for (const t of TENSORS) g[t].fill(0);
}

/** Scratch space for a batch of a given size. Reused across steps. */
export function createWorkspace(model, batch) {
  const { inDim, hidden: H, vocabSize: V } = model;
  return {
    batch,
    emb: new Float64Array(batch * inDim),
    h: new Float64Array(batch * H),
    logits: new Float64Array(batch * V),
    probs: new Float64Array(batch * V),
    dh: new Float64Array(batch * H),
    dpre: new Float64Array(batch * H),
    demb: new Float64Array(batch * inDim),
  };
}

/**
 * Embeddings, hidden layer, logits — for `count` rows of `xs`.
 * `ws.h` holds tanh output, not the pre-activation: backprop through tanh needs
 * only 1 - h², so keeping the pre-activation would be a buffer for nothing.
 */
export function forward(model, ws, xs, count) {
  const { E, W1, b1, W2, b2, context: C, embed: D, hidden: H, vocabSize: V, inDim } = model;
  const { emb, h, logits } = ws;

  for (let b = 0; b < count; b++) {
    const base = b * inDim;
    for (let c = 0; c < C; c++) {
      const src = xs[b * C + c] * D;
      const dst = base + c * D;
      for (let d = 0; d < D; d++) emb[dst + d] = E[src + d];
    }

    const ho = b * H;
    for (let k = 0; k < H; k++) h[ho + k] = b1[k];
    for (let k = 0; k < inDim; k++) {
      const x = emb[base + k];
      if (x === 0) continue;
      const wo = k * H;
      for (let j = 0; j < H; j++) h[ho + j] += x * W1[wo + j];
    }
    for (let k = 0; k < H; k++) h[ho + k] = Math.tanh(h[ho + k]);

    const lo = b * V;
    for (let v = 0; v < V; v++) logits[lo + v] = b2[v];
    for (let k = 0; k < H; k++) {
      const a = h[ho + k];
      if (a === 0) continue;
      const wo = k * V;
      for (let v = 0; v < V; v++) logits[lo + v] += a * W2[wo + v];
    }
  }
  return ws;
}

/**
 * Softmax over the logits, and the mean negative log likelihood of `ys`.
 * The max is subtracted before exponentiating — without it a logit of 800 is
 * Infinity, the sum is Infinity, every probability is NaN and the run is over
 * with no message.
 */
export function softmaxLoss(model, ws, ys, count) {
  const { vocabSize: V } = model;
  const { logits, probs } = ws;
  let loss = 0;
  for (let b = 0; b < count; b++) {
    const lo = b * V;
    let max = -Infinity;
    for (let v = 0; v < V; v++) if (logits[lo + v] > max) max = logits[lo + v];
    let sum = 0;
    for (let v = 0; v < V; v++) {
      const e = Math.exp(logits[lo + v] - max);
      probs[lo + v] = e;
      sum += e;
    }
    const inv = 1 / sum;
    for (let v = 0; v < V; v++) probs[lo + v] *= inv;
    loss -= Math.log(Math.max(probs[lo + ys[b]], 1e-300));
  }
  return loss / count;
}

/**
 * Backprop. Assumes forward + softmaxLoss have just run over the same batch.
 * `ws.probs` is overwritten in place with the logit gradients — the derivative
 * of cross-entropy through softmax is exactly (p - onehot)/B, so allocating a
 * second buffer to hold it would be copying a number to subtract one from it.
 */
export function backward(model, ws, grads, xs, ys, count) {
  const { W1, W2, context: C, embed: D, hidden: H, vocabSize: V, inDim } = model;
  const { emb, h, probs, dh, dpre, demb } = ws;
  const scale = 1 / count;

  for (let b = 0; b < count; b++) {
    const lo = b * V, ho = b * H, base = b * inDim;

    for (let v = 0; v < V; v++) probs[lo + v] *= scale;
    probs[lo + ys[b]] -= scale;

    for (let v = 0; v < V; v++) grads.b2[v] += probs[lo + v];

    for (let k = 0; k < H; k++) {
      const a = h[ho + k];
      const wo = k * V;
      let acc = 0;
      for (let v = 0; v < V; v++) {
        const dl = probs[lo + v];
        grads.W2[wo + v] += a * dl;
        acc += dl * W2[wo + v];
      }
      dh[ho + k] = acc;
    }

    for (let k = 0; k < H; k++) {
      const a = h[ho + k];
      const d = dh[ho + k] * (1 - a * a);
      dpre[ho + k] = d;
      grads.b1[k] += d;
    }

    for (let k = 0; k < inDim; k++) {
      const x = emb[base + k];
      const wo = k * H;
      let acc = 0;
      for (let j = 0; j < H; j++) {
        const d = dpre[ho + j];
        grads.W1[wo + j] += x * d;
        acc += d * W1[wo + j];
      }
      demb[base + k] = acc;
    }

    /* Rows of E are gathered, so their gradients scatter back — and a character
     * that appears twice in one window must accumulate twice, not overwrite. */
    for (let c = 0; c < C; c++) {
      const dst = xs[b * C + c] * D;
      const src = base + c * D;
      for (let d = 0; d < D; d++) grads.E[dst + d] += demb[src + d];
    }
  }
  return grads;
}

function globalNorm(grads) {
  let sum = 0;
  for (const t of TENSORS) {
    const a = grads[t];
    for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
  }
  return Math.sqrt(sum);
}

function adamUpdate(p, g, m, v, { lr, beta1, beta2, eps, decay, t, clipScale }) {
  const bc1 = 1 - Math.pow(beta1, t);
  const bc2 = 1 - Math.pow(beta2, t);
  for (let i = 0; i < p.length; i++) {
    const gi = g[i] * clipScale;
    m[i] = beta1 * m[i] + (1 - beta1) * gi;
    v[i] = beta2 * v[i] + (1 - beta2) * gi * gi;
    p[i] -= lr * ((m[i] / bc1) / (Math.sqrt(v[i] / bc2) + eps) + decay * p[i]);
  }
}

/**
 * A trainer: the optimiser state, the scratch buffers, and one step.
 *
 * Adam rather than plain SGD, because the embedding table gets a gradient only
 * for the characters that turned up in the batch — with one global learning
 * rate the rare letters learn hundreds of times slower than the space bar.
 * Per-parameter step sizes are what make a rare character trainable at all.
 *
 * Gradients are clipped by global norm, which does less here than the same line
 * would in front of plain SGD: Adam divides by its own estimate of the gradient
 * scale, so scaling every gradient down barely moves a single step. What the
 * clip is actually for is the estimate itself. One freak batch — a stretch of
 * text unlike everything around it — writes its size into the second moment,
 * and the next few hundred steps are taken with a step size chosen for a batch
 * that will not come again. One extra pass over the gradients stops that.
 */
export function createTrainer(model, opts = {}) {
  const cfg = {
    batch: 64,
    lr: 0.02,
    beta1: 0.9,
    beta2: 0.999,
    eps: 1e-8,
    weightDecay: 0,
    clip: 5,
    ...opts,
  };
  const grads = createGrads(model);
  const m = createGrads(model);
  const v = createGrads(model);
  let ws = createWorkspace(model, cfg.batch);
  let steps = 0;
  /* Read by the page's stats line, and by the checks: the gradient norm is the
   * one number that says whether a run is about to go wrong before the loss
   * does. */
  const state = { lastNorm: 0, lastClipped: false, lastLoss: NaN };

  const space = (n) => {
    if (n > ws.batch) ws = createWorkspace(model, n);
    return ws;
  };

  return {
    config: cfg,
    get steps() { return steps; },
    get lastNorm() { return state.lastNorm; },
    get lastClipped() { return state.lastClipped; },
    get lastLoss() { return state.lastLoss; },

    /** One optimiser step over one batch. Returns its loss. */
    step(xs, ys, count = cfg.batch, lr = cfg.lr) {
      const w = space(count);
      zeroGrads(grads);
      forward(model, w, xs, count);
      const loss = softmaxLoss(model, w, ys, count);
      backward(model, w, grads, xs, ys, count);

      const norm = globalNorm(grads);
      const clipScale = (cfg.clip > 0 && norm > cfg.clip) ? cfg.clip / norm : 1;
      state.lastNorm = norm;
      state.lastClipped = clipScale < 1;
      state.lastLoss = loss;

      steps += 1;
      for (const t of TENSORS) {
        adamUpdate(model[t], grads[t], m[t], v[t], {
          lr, beta1: cfg.beta1, beta2: cfg.beta2, eps: cfg.eps,
          /* Decoupled decay, and never on the biases: shrinking a bias towards
           * zero is a prior that every character is equally likely, which is
           * the one thing the data always says is false. */
          decay: (t === 'b1' || t === 'b2') ? 0 : cfg.weightDecay,
          t: steps, clipScale,
        });
      }
      return loss;
    },

    /** Loss over a set of windows, in chunks, without touching the weights. */
    evaluate(xs, ys, count, chunk = 256) {
      if (!count) return NaN;
      let total = 0;
      for (let off = 0; off < count; off += chunk) {
        const n = Math.min(chunk, count - off);
        const w = space(n);
        forward(model, w, xs.subarray(off * model.context, (off + n) * model.context), n);
        total += softmaxLoss(model, w, ys.subarray(off, off + n), n) * n;
      }
      return total / count;
    },
  };
}

/**
 * Write text, one character at a time, each one fed back in as context.
 *
 * temperature divides the logits: below 1 the model repeats its safest guesses
 * and settles into loops, above 1 it reaches for characters it has barely seen
 * and the spelling collapses. topK cuts the tail off first — the long tail of a
 * softmax over 90 characters holds enough total probability that, left in, the
 * model draws from it every few characters and the text never coheres.
 */
export function generate(model, { prompt = '', length = 400, temperature = 0.9, topK = 0, rng = Math.random } = {}) {
  const { context: C, vocabSize: V, chars, stoi } = model;
  const ws = createWorkspace(model, 1);
  const ctx = new Int32Array(C).fill(model.padToken);

  const push = (tok) => {
    for (let i = 0; i < C - 1; i++) ctx[i] = ctx[i + 1];
    ctx[C - 1] = tok;
  };
  for (const ch of prompt) {
    const id = stoi.get(ch);
    if (id !== undefined) push(id);
  }

  const temp = Math.max(0.01, temperature);
  const k = topK > 0 ? Math.min(topK, V) : V;
  const probs = ws.probs;
  const idx = new Int32Array(V);
  let out = '';

  for (let i = 0; i < length; i++) {
    forward(model, ws, ctx, 1);
    const { logits } = ws;

    let max = -Infinity;
    for (let v = 0; v < V; v++) {
      logits[v] /= temp;
      if (logits[v] > max) max = logits[v];
    }
    let sum = 0;
    for (let v = 0; v < V; v++) { const e = Math.exp(logits[v] - max); probs[v] = e; sum += e; }
    for (let v = 0; v < V; v++) probs[v] /= sum;

    let pick;
    if (k < V) {
      for (let v = 0; v < V; v++) idx[v] = v;
      /* Partial selection sort: k passes over V, which beats sorting the whole
       * vector when k is the 10 or 40 anyone actually asks for. */
      let kept = 0;
      for (let a = 0; a < k; a++) {
        let best = a;
        for (let b = a + 1; b < V; b++) if (probs[idx[b]] > probs[idx[best]]) best = b;
        const t = idx[a]; idx[a] = idx[best]; idx[best] = t;
        kept += probs[idx[a]];
      }
      let r = rng() * kept;
      pick = idx[k - 1];
      for (let a = 0; a < k; a++) {
        r -= probs[idx[a]];
        if (r <= 0) { pick = idx[a]; break; }
      }
    } else {
      pick = sampleFrom(probs.subarray(0, V), rng);
    }

    out += chars[pick];
    push(pick);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The file format
 * ------------------------------------------------------------------ */

/**
 * A model as plain JSON: weights, vocabulary, shape.
 * Weights are rounded to six significant digits, which halves the file and is
 * still far finer than the difference a training step makes.
 */
export function serialize(model, meta = {}) {
  const pack = (a) => Array.from(a, (x) => +x.toPrecision(6));
  return {
    format: FORMAT,
    meta,
    chars: model.chars.slice(),
    context: model.context,
    embed: model.embed,
    hidden: model.hidden,
    padToken: model.padToken,
    seed: model.seed,
    weights: {
      E: pack(model.E), W1: pack(model.W1), b1: pack(model.b1),
      W2: pack(model.W2), b2: pack(model.b2),
    },
  };
}

/**
 * Read a model file back.
 *
 * This is the one place the app takes a structure it did not build — a file off
 * someone's disk — so every field is checked before a single array is allocated:
 * the shape against the limits above, then each weight array against the length
 * the shape implies, then every number for being a number. A file that lies
 * about its dimensions gets an error, not a page that allocates whatever the
 * dimensions multiply out to and then reads past the end of it.
 */
export function deserialize(json) {
  if (!json || typeof json !== 'object') throw new Error('not a model file');
  if (json.format !== FORMAT) throw new Error(`unknown format: ${String(json.format).slice(0, 32)}`);

  const chars = json.chars;
  if (!Array.isArray(chars) || chars.length < 2 || chars.length > LIMITS.vocab) {
    throw new Error('bad vocabulary');
  }
  for (const ch of chars) {
    if (typeof ch !== 'string' || ch.length === 0 || ch.length > 4) throw new Error('bad vocabulary entry');
  }
  if (new Set(chars).size !== chars.length) throw new Error('duplicate characters in the vocabulary');

  const { context, embed, hidden } = json;
  const model = createModel({
    chars,
    context, embed, hidden,
    seed: int(json.seed) ? json.seed : 1,
    padToken: int(json.padToken) ? json.padToken : 0,
  });

  const w = json.weights;
  if (!w || typeof w !== 'object') throw new Error('missing weights');
  for (const t of TENSORS) {
    const src = w[t];
    const dst = model[t];
    if (!Array.isArray(src) || src.length !== dst.length) {
      throw new Error(`weights.${t}: expected ${dst.length} numbers`);
    }
    for (let i = 0; i < src.length; i++) {
      const x = src[i];
      if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`weights.${t}: not a finite number at ${i}`);
      dst[i] = x;
    }
  }
  return { model, meta: json.meta && typeof json.meta === 'object' ? json.meta : {} };
}
