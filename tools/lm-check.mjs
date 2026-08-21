#!/usr/bin/env node
/*
 * lm-check.mjs — proves the language model in lm/ is doing the arithmetic it
 * claims to be doing. Run with: node tools/lm-check.mjs
 * Exits non-zero on any failure.
 *
 * The centre of this file is the gradient check. Everything else about a
 * trainer can look right while the gradients are wrong: the loss still falls,
 * because a wrong gradient with the right sign is still downhill, and the
 * samples still improve, so the bug survives every eyeball test and shows up
 * only as a model that plateaus higher than it should. So each weight is
 * nudged by hand in both directions, the loss is measured at each end, and the
 * slope that comes out is compared against what backward() computed. They have
 * to agree to seven significant digits — or, for a gradient too small for the
 * difference quotient to resolve at all, to within 1e-10 absolute. Either way
 * the margin is five orders of magnitude above the errors a real bug makes.
 *
 * The rest covers what the gradient check cannot see: that batches line up with
 * the text, that validation is really held out, that a model survives a trip
 * through JSON unchanged, and that a model file from a stranger cannot talk the
 * loader into an allocation or an out-of-bounds read.
 */

import {
  createModel, createTrainer, createGrads, createWorkspace,
  forward, softmaxLoss, backward, generate, serialize, deserialize,
  paramCount, LIMITS, FORMAT,
} from '../lm/src/model.js';
import {
  buildVocab, buildCodec, isWordVocab, encode, decode, splitData, makeBatcher, fixedBatch, pickPad, positions,
} from '../lm/src/tokenizer.js';
import { buildCorpus } from '../lm/src/corpus.js';
import { makeRng } from '../lm/src/rng.js';

const failures = [];
const notes = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };
const near = (a, b, tol, msg) => check(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

/* ------------------------------------------------------------------ *
 * 1. The vocabulary
 * ------------------------------------------------------------------ */

{
  const text = 'שלום עולם\nמתח 3×8 🏋️\nשלום';
  const { chars, stoi, dropped } = buildVocab(text);
  check(decode(encode(text, stoi), chars) === text, 'encode/decode does not round-trip');
  check(dropped === 0, 'characters dropped from a vocabulary with no minimum');

  const sorted = [...chars].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  check(chars.every((c, i) => c === sorted[i]), 'vocabulary is not in code point order');
  check(new Set(chars).size === chars.length, 'vocabulary has duplicates');

  const again = buildVocab(text);
  check(again.chars.join('') === chars.join(''), 'vocabulary is not deterministic');

  check(decode(encode('שלוםQQ€', stoi), chars) === 'שלום', 'unknown characters are not skipped');

  const rare = buildVocab(text, { minCount: 2 });
  check(!rare.stoi.has('🏋'), 'a once-seen character survived minCount 2');
  check(rare.dropped > 0, 'minCount dropped nothing and reported nothing');
  check(rare.stoi.has('ש'), 'a repeated character was dropped by minCount 2');

  const capped = buildVocab('abcdefghij', { maxSize: 4 });
  check(capped.chars.length === 4, 'maxSize was not enforced');

  check(pickPad(['a', '\n', 'b']) === 1, 'pad is not the newline when there is one');
  check(pickPad(['a', ' ', 'b']) === 1, 'pad is not the space when there is no newline');
  check(pickPad(['a', 'b']) === 0, 'pad has no fallback');
}

/* ------------------------------------------------------------------ *
 * 1b. The word vocabulary
 *
 * A tokenizer that loses characters is the worst kind of bug here, because
 * nothing downstream can see it: training proceeds, the loss falls, and the
 * model has simply learned a text nobody wrote. The first version of this one
 * merged any run of spaces into the following word, which deleted every level
 * of indentation in the code corpus — four percent of the text, and exactly
 * the four percent that carries what code looks like.
 *
 * So the property asserted here is the strongest one available: encode, decode,
 * and demand the original back, character for character, on text that contains
 * every hazard — indentation, blank lines, tabs, punctuation runs, a word that
 * is not in the vocabulary, and both alphabets.
 * ------------------------------------------------------------------ */

{
  const text = [
    'ש: כמה מים לשתות ביום?',
    'ת: בערך שני ליטר, ומיטוכונדריה לא קשורה.',
    '',
    'function chunk(list, size) {',
    '  if (!Array.isArray(list)) {',
    '\t\treturn [];',
    '  }',
    '  return list;   // three spaces, then a comment',
    '}',
    '',
    '[חתול]',
    ' /\\_/\\',
    '( o.o )',
  ].join('\n');

  /* wordMinCount 1 because this passage is short: a word here appears once or
   * twice, and the point of the check is the round trip, not the frequency
   * cut-off. */
  const codec = buildCodec(text, { tokens: 'word', maxWords: 40, wordMinCount: 1 });
  const ids = codec.encode(text);
  check(decode(ids, codec.chars) === text, 'the word tokenizer does not round-trip — it is losing characters');
  check(codec.chars.length > 40, 'the word vocabulary lost its character fallback');
  check(isWordVocab(codec.chars), 'the word vocabulary reports itself as characters');
  check(!isWordVocab(buildCodec(text).chars), 'the character vocabulary reports itself as words');
  check(ids.length < [...text].length, 'the word vocabulary compressed nothing');

  /* Every token has to be spellable — a token nobody can write is a token the
   * model can emit and the page cannot render. */
  check(codec.chars.every((t) => typeof t === 'string' && t.length > 0 && t.length <= LIMITS.token),
    'a token is empty or longer than the format allows');

  /* A word out of the list is spelled, not dropped and not turned into a
   * stand-in nobody asked for. */
  const rare = buildCodec('אבג מיטוכונדריה אבג אבג', { tokens: 'word', maxWords: 1, wordMinCount: 2 });
  check(decode(rare.encode('מיטוכונדריה'), rare.chars) === 'מיטוכונדריה',
    'a word outside the vocabulary is not spelled out');

  notes.push(`word tokenizer: ${codec.chars.length} tokens, ${codec.charactersPerToken.toFixed(2)} characters each, round trip exact`);
}

/* ------------------------------------------------------------------ *
 * 2. Batches, and the held-out split
 *
 * A window that does not sit where it claims to sit is the quietest possible
 * bug: the model still learns something, just not the thing you asked for.
 * ------------------------------------------------------------------ */

{
  const data = Int32Array.from({ length: 200 }, (_, i) => i % 7);
  const C = 5;
  const fill = makeBatcher(data, { context: C, rng: makeRng(11) });
  const xs = new Int32Array(32 * C), ys = new Int32Array(32);
  fill(xs, ys, 32);

  let aligned = true;
  for (let b = 0; b < 32; b++) {
    /* Find where this window sits in the stream, then demand the target is the
     * very next character — not merely a character that also appears there. */
    const want = [...xs.slice(b * C, b * C + C)];
    let found = -1;
    for (let i = 0; i + C < data.length; i++) {
      let hit = true;
      for (let c = 0; c < C; c++) if (data[i + c] !== want[c]) { hit = false; break; }
      if (hit && data[i + C] === ys[b]) { found = i; break; }
    }
    if (found < 0) aligned = false;
  }
  check(aligned, 'a batch window does not match the stream it came from');

  const { train, val } = splitData(data, { valFraction: 0.1, context: C });
  check(train.length + val.length === data.length, 'the split loses characters');
  check(val.length === data.length - train.length, 'the split overlaps');
  check(val[0] === data[train.length], 'validation does not start where training ends');

  const short = splitData(Int32Array.from([1, 2, 3, 4, 5, 6]), { valFraction: 0.5, context: 5 });
  check(short.val.length === 0, 'a text too short to validate still reported a validation set');
  check(short.train.length === 6, 'a short text lost characters to a validation set it cannot fill');

  check(positions(data, C) === data.length - C, 'position count is wrong');

  const fixedA = fixedBatch(data, { context: C, count: 16, seedRng: makeRng(5) });
  const fixedB = fixedBatch(data, { context: C, count: 16, seedRng: makeRng(5) });
  check(fixedA.xs.every((v, i) => v === fixedB.xs[i]), 'the evaluation batch is not fixed across calls');
}

/* ------------------------------------------------------------------ *
 * 3. Initialisation
 * ------------------------------------------------------------------ */

{
  const chars = 'abcdefghijklmnop'.split('');
  const model = createModel({ chars, context: 4, embed: 8, hidden: 32, seed: 2 });
  const ws = createWorkspace(model, 64);
  const rng = makeRng(3);
  const xs = Int32Array.from({ length: 64 * 4 }, () => Math.floor(rng() * chars.length));
  const ys = Int32Array.from({ length: 64 }, () => Math.floor(rng() * chars.length));
  forward(model, ws, xs, 64);
  const loss = softmaxLoss(model, ws, ys, 64);
  near(loss, Math.log(chars.length), 0.05, 'a fresh model does not start at ln(V)');
  notes.push(`fresh loss ${loss.toFixed(4)} against ln(V) ${Math.log(chars.length).toFixed(4)}`);

  check(paramCount(model) === model.E.length + model.W1.length + model.b1.length
    + model.W2.length + model.b2.length, 'paramCount disagrees with the tensors');

  /* Hidden units that start saturated cannot learn: 1 - tanh(x)^2 is zero out
   * there, so no gradient reaches the layer below them. */
  let saturated = 0;
  for (let i = 0; i < 64 * model.hidden; i++) if (Math.abs(ws.h[i]) > 0.99) saturated++;
  const frac = saturated / (64 * model.hidden);
  check(frac < 0.05, `${(frac * 100).toFixed(1)}% of hidden units start saturated`);
  notes.push(`saturated at init ${(frac * 100).toFixed(2)}%`);
}

/* ------------------------------------------------------------------ *
 * 4. The gradient check
 * ------------------------------------------------------------------ */

function gradCheck({ context, embed, hidden, vocab, batch, seed, repeats }) {
  const chars = Array.from({ length: vocab }, (_, i) => String.fromCharCode(97 + i));
  const model = createModel({ chars, context, embed, hidden, seed });
  const rng = makeRng(seed + 100);

  const xs = new Int32Array(batch * context);
  const ys = new Int32Array(batch);
  for (let b = 0; b < batch; b++) {
    for (let c = 0; c < context; c++) {
      /* `repeats` forces the same character into a window more than once, which
       * is the case that separates an accumulating embedding gradient from one
       * that overwrites. Random windows hit it eventually; this hits it every
       * time. */
      xs[b * context + c] = repeats ? (b % vocab) : Math.floor(rng() * vocab);
    }
    ys[b] = Math.floor(rng() * vocab);
  }

  const ws = createWorkspace(model, batch);
  const grads = createGrads(model);
  forward(model, ws, xs, batch);
  softmaxLoss(model, ws, ys, batch);
  backward(model, ws, grads, xs, ys, batch);

  const lossAt = () => {
    forward(model, ws, xs, batch);
    return softmaxLoss(model, ws, ys, batch);
  };

  /* eps is a compromise between two errors that pull in opposite directions:
   * too large and the central difference measures the curve rather than the
   * slope, too small and (up - down) is two nearly equal doubles subtracting to
   * noise. At 1e-4 both sit around 1e-9 relative, which is why the ceiling
   * below can be 1e-7 and mean something. */
  /* eps is a compromise between two errors that pull in opposite directions:
   * too large and the central difference measures the curve rather than the
   * slope, too small and (up - down) is two nearly equal doubles subtracting to
   * noise. 1e-4 puts both around 1e-9 relative.
   *
   * The tolerance has an absolute floor under it for the same reason. A loss
   * near 2.7 carries a few times 1e-16 of representation error, and the
   * subtraction divides that by 2e-4, so nothing below about 1e-11 in the
   * quotient is signal — a weight whose true gradient is 3e-5 would fail a pure
   * relative test on that noise alone while backward() is perfectly correct.
   * 1e-10 sits an order above the noise and five orders below the error any
   * real bug produces: a dropped accumulation, a transposed matrix or a missing
   * term is wrong by something the size of the gradient itself. */
  const eps = 1e-4;
  let worst = 0, worstAt = '';
  for (const name of ['E', 'W1', 'b1', 'W2', 'b2']) {
    const p = model[name];
    const g = grads[name];
    const samples = Math.min(p.length, 60);
    for (let s = 0; s < samples; s++) {
      const i = Math.floor(rng() * p.length);
      const keep = p[i];
      p[i] = keep + eps; const up = lossAt();
      p[i] = keep - eps; const down = lossAt();
      p[i] = keep;
      const numeric = (up - down) / (2 * eps);
      const analytic = g[i];
      const tol = Math.max(1e-7 * (Math.abs(numeric) + Math.abs(analytic)), 1e-10);
      const ratio = Math.abs(numeric - analytic) / tol;
      if (ratio > worst) { worst = ratio; worstAt = `${name}[${i}] analytic ${analytic} numeric ${numeric}`; }
    }
  }
  return { worst, worstAt };
}

for (const cfg of [
  { context: 3, embed: 5, hidden: 7, vocab: 9, batch: 4, seed: 1, repeats: false },
  { context: 1, embed: 4, hidden: 3, vocab: 5, batch: 2, seed: 2, repeats: false },
  { context: 6, embed: 3, hidden: 11, vocab: 13, batch: 8, seed: 3, repeats: true },
]) {
  const { worst, worstAt } = gradCheck(cfg);
  const label = `C=${cfg.context} D=${cfg.embed} H=${cfg.hidden} V=${cfg.vocab}${cfg.repeats ? ' repeated context' : ''}`;
  check(worst < 1, `gradients disagree with the loss surface (${label}): ${worstAt}`);
  notes.push(`gradient check ${label}: worst error ${(worst * 100).toFixed(1)}% of tolerance`);
}

/* ------------------------------------------------------------------ *
 * 5. The clip, and the gradient norm the page reports
 * ------------------------------------------------------------------ */

{
  const chars = 'abcdefgh'.split('');
  const make = (clip) => createTrainer(
    createModel({ chars, context: 3, embed: 6, hidden: 12, seed: 4 }),
    { batch: 8, lr: 0.02, clip },
  );
  const rng = makeRng(9);
  const xs = Int32Array.from({ length: 24 }, () => Math.floor(rng() * 8));
  const ys = Int32Array.from({ length: 8 }, () => Math.floor(rng() * 8));

  /* The norm the trainer reports must be the norm of the real gradients, not
   * of whatever was left in the buffers from the step before. */
  const model = createModel({ chars, context: 3, embed: 6, hidden: 12, seed: 4 });
  const ws = createWorkspace(model, 8);
  const g = createGrads(model);
  forward(model, ws, xs, 8);
  softmaxLoss(model, ws, ys, 8);
  backward(model, ws, g, xs, ys, 8);
  let sum = 0;
  for (const t of ['E', 'W1', 'b1', 'W2', 'b2']) for (let i = 0; i < g[t].length; i++) sum += g[t][i] * g[t][i];
  const reference = Math.sqrt(sum);

  const loose = make(0);
  loose.step(xs, ys, 8);
  near(loose.lastNorm, reference, 1e-12, 'the reported gradient norm is not the gradient norm');
  check(loose.lastClipped === false, 'a step under the ceiling reported itself clipped');

  const tight = make(1e-4);
  tight.step(xs, ys, 8);
  check(tight.lastClipped === true, 'a step over the ceiling did not report itself clipped');

  /* Adam divides by its own estimate of the gradient scale, so scaling every
   * gradient down by four orders of magnitude lands the first step in nearly
   * the same place. That is not the clip failing — it is the property that
   * makes the clip almost free, and the reason the comment in model.js says
   * the clip is there for the moment estimates rather than for the step. If a
   * later change to the optimiser breaks the invariance, it gets caught here. */
  const stepDelta = (clip) => {
    const before = createModel({ chars, context: 3, embed: 6, hidden: 12, seed: 4 });
    const kept = Float64Array.from(before.W2);
    const t = createTrainer(before, { batch: 8, lr: 0.02, clip });
    t.step(xs, ys, 8);
    let max = 0;
    for (let i = 0; i < kept.length; i++) max = Math.max(max, Math.abs(before.W2[i] - kept[i]));
    return max;
  };
  const ratio = stepDelta(1e-4) / stepDelta(0);
  check(ratio > 0.8 && ratio < 1.25, `clipping changed the size of a single Adam step by ${ratio.toFixed(2)}x`);
  notes.push(`gradient norm ${reference.toFixed(4)}; a 1e-4 clip changes the step by ${((ratio - 1) * 100).toFixed(1)}%`);
}

/* ------------------------------------------------------------------ *
 * 5b. Adam's bias correction
 *
 * A review agent noticed that this whole file passed with the bias correction
 * deleted, which is fair: every other check here measures where training ends
 * up, and Adam without its correction still gets there — a little differently,
 * a little later, and never in a way that shows up as a failure.
 *
 * The first step is where it is visible, and it has an exact answer. Adam's
 * moments both start at zero, so after one step m = (1-β1)g and v = (1-β2)g².
 * Dividing each by its own bias term recovers g and g², and the update becomes
 * lr · g/|g| — every weight with a gradient moves by exactly the learning rate,
 * whatever the gradient was. Leave the correction out and the same ratio is
 * 0.1/√0.001 = 3.16, so every weight moves by 3.16 times the rate instead.
 * ------------------------------------------------------------------ */

{
  const chars = 'abcdefgh'.split('');
  const rng = makeRng(4);
  const xs = Int32Array.from({ length: 8 * 3 }, () => Math.floor(rng() * 8));
  const ys = Int32Array.from({ length: 8 }, () => Math.floor(rng() * 8));
  const lr = 0.01;

  const model = createModel({ chars, context: 3, embed: 6, hidden: 12, seed: 4 });
  const before = Float64Array.from(model.W2);
  /* No clip and no decay: both would scale the step and blur the reading. W2 is
   * the tensor to watch because every one of its weights gets a gradient from
   * every row of the batch — an embedding row for a character the batch never
   * used would sit still and mean nothing. */
  createTrainer(model, { batch: 8, lr, clip: 0, weightDecay: 0 }).step(xs, ys, 8);

  const moved = [];
  for (let i = 0; i < model.W2.length; i++) moved.push(Math.abs(model.W2[i] - before[i]));
  moved.sort((a, b) => a - b);
  const median = moved[Math.floor(moved.length / 2)];

  check(moved[0] > 0, 'the first step moved no weight at all');
  near(median / lr, 1, 0.001, 'the first Adam step is not one learning rate — the bias correction is wrong or missing');
  near(moved[moved.length - 1] / lr, 1, 0.001, 'the largest first step is not one learning rate');
  notes.push(`first Adam step: every weight moved ${(median / lr).toFixed(6)} learning rates (3.16 without bias correction)`);
}

/* ------------------------------------------------------------------ *
 * 6. It actually learns
 * ------------------------------------------------------------------ */

{
  /* Memorising one short pattern is the lowest bar there is, and a trainer that
   * cannot clear it is broken no matter what its loss curve does on real text. */
  const text = 'abcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabc';
  const { chars, stoi } = buildVocab(text);
  const data = encode(text, stoi);
  const model = createModel({ chars, context: 3, embed: 8, hidden: 32, seed: 1 });
  const trainer = createTrainer(model, { batch: 16, lr: 0.05 });
  const fill = makeBatcher(data, { context: 3, rng: makeRng(2) });
  const xs = new Int32Array(16 * 3), ys = new Int32Array(16);
  let loss = NaN;
  for (let i = 0; i < 400; i++) { fill(xs, ys, 16); loss = trainer.step(xs, ys, 16); }
  check(loss < 0.02, `a model that cannot memorise "abc" repeated (loss ${loss})`);
  const out = generate(model, { prompt: 'abc', length: 30, temperature: 0.2, rng: makeRng(3) });
  check(/^(abc)+/.test(out), `memorised the pattern but cannot reproduce it: ${JSON.stringify(out)}`);
  notes.push(`memorisation loss ${loss.toExponential(2)}, sample ${JSON.stringify(out.slice(0, 12))}`);
}

{
  const corpus = buildCorpus({ sessions: 60 });
  const { chars, stoi } = buildVocab(corpus);
  const data = encode(corpus, stoi);
  const { train, val } = splitData(data, { valFraction: 0.1, context: 8 });
  const model = createModel({ chars, context: 8, embed: 16, hidden: 96, seed: 1, padToken: pickPad(chars) });
  const trainer = createTrainer(model, { batch: 64, lr: 0.02 });
  const fill = makeBatcher(train, { context: 8, rng: makeRng(4) });
  const xs = new Int32Array(64 * 8), ys = new Int32Array(64);

  const evalSet = fixedBatch(val, { context: 8, count: 512, seedRng: makeRng(6) });
  const before = trainer.evaluate(evalSet.xs, evalSet.ys, evalSet.count);

  let last = NaN;
  for (let i = 0; i < 600; i++) { fill(xs, ys, 64); last = trainer.step(xs, ys, 64); }
  const after = trainer.evaluate(evalSet.xs, evalSet.ys, evalSet.count);

  check(Number.isFinite(last) && Number.isFinite(after), 'training produced a non-finite loss');
  check(after < before - 0.8, `600 steps barely moved the held-out loss (${before.toFixed(3)} to ${after.toFixed(3)})`);
  check(after < 1.9, `held-out loss is too high after 600 steps: ${after.toFixed(3)}`);
  notes.push(`held-out loss ${before.toFixed(3)} to ${after.toFixed(3)} in 600 steps`);

  /* Same seed, same numbers. Without this the loss curve means nothing across
   * runs and no change to this code could ever be measured. */
  const rerun = () => {
    const m2 = createModel({ chars, context: 8, embed: 16, hidden: 96, seed: 1, padToken: pickPad(chars) });
    const t2 = createTrainer(m2, { batch: 32, lr: 0.02 });
    const f2 = makeBatcher(train, { context: 8, rng: makeRng(4) });
    const x2 = new Int32Array(32 * 8), y2 = new Int32Array(32);
    const losses = [];
    for (let i = 0; i < 20; i++) { f2(x2, y2, 32); losses.push(t2.step(x2, y2, 32)); }
    return losses;
  };
  const a = rerun(), b = rerun();
  check(a.every((v, i) => v === b[i]), 'two runs with the same seed produced different losses');

  /* A round trip through the file format must change nothing that can be
   * measured: same loss on the same batch, same text from the same seed. */
  const file = JSON.parse(JSON.stringify(serialize(model, { note: 'check' })));
  const { model: loaded, meta } = deserialize(file);
  const t3 = createTrainer(loaded, { batch: 64 });
  const reloaded = t3.evaluate(evalSet.xs, evalSet.ys, evalSet.count);
  near(reloaded, after, 2e-3, 'a saved model does not evaluate the same after loading');
  check(meta.note === 'check', 'meta did not survive the round trip');
  const textA = generate(model, { prompt: 'שבוע', length: 80, temperature: 0.8, rng: makeRng(8) });
  const textB = generate(loaded, { prompt: 'שבוע', length: 80, temperature: 0.8, rng: makeRng(8) });
  check(textA === textB, 'a saved model writes different text after loading');
  notes.push(`sample: ${JSON.stringify(textA.slice(0, 60))}`);

  /* Sampling must stay inside the vocabulary, and inside top-k. */
  const free = generate(model, { length: 500, temperature: 1.2, rng: makeRng(12) });
  check([...free].every((ch) => stoi.has(ch)), 'generation emitted a character outside the vocabulary');

  const greedy = generate(model, { prompt: 'הערה', length: 40, temperature: 0.01, topK: 1, rng: makeRng(13) });
  const greedyAgain = generate(model, { prompt: 'הערה', length: 40, temperature: 0.01, topK: 1, rng: makeRng(99) });
  check(greedy === greedyAgain, 'top-k of 1 is not deterministic, so it is not taking the argmax');
  notes.push(`greedy: ${JSON.stringify(greedy.slice(0, 40))}`);

  /* top-k is the one part of sampling with real bookkeeping in it — a partial
   * selection sort over the probability vector — so it gets checked against the
   * distribution itself rather than against the look of the output. Replay the
   * generated text one character at a time, and demand each character was among
   * the k the model rated highest given everything before it. */
  const topSet = (ctx, k) => {
    const w = createWorkspace(model, 1);
    forward(model, w, ctx, 1);
    const order = [...Array(model.vocabSize).keys()].sort((a, b) => w.logits[b] - w.logits[a]);
    return new Set(order.slice(0, k));
  };
  for (const k of [1, 3, 8]) {
    const prompt = 'שבוע 3';
    const text = generate(model, { prompt, length: 120, temperature: 2.5, topK: k, rng: makeRng(14 + k) });
    const ctx = new Int32Array(model.context).fill(model.padToken);
    const push = (tok) => { ctx.copyWithin(0, 1); ctx[model.context - 1] = tok; };
    for (const ch of prompt) if (stoi.has(ch)) push(stoi.get(ch));
    let outside = 0;
    for (const ch of text) {
      if (!topSet(ctx, k).has(stoi.get(ch))) outside++;
      push(stoi.get(ch));
    }
    check(outside === 0, `top-k ${k} emitted ${outside} characters from outside the top ${k}`);
  }

  /* Temperature had no assertion behind it at all until a review agent said so,
   * and it is the control people reach for first.
   *
   * What it does is divide the logits before the softmax, so the distribution
   * the sampler is handed flattens as it rises. That is measurable exactly —
   * one context, no randomness, the entropy of the distribution itself — which
   * is a far sharper test than looking at the text: the output's own character
   * entropy barely moves, because a model that has learned the shape of a line
   * writes varied-looking characters at any temperature.
   *
   * The second check is on generate() rather than on the arithmetic: pushed
   * near zero it must collapse into repeating itself, which is the behaviour
   * the page's own note promises and the arithmetic above cannot demonstrate. */
  {
    const ws = createWorkspace(model, 1);
    const ctx = new Int32Array(model.context).fill(model.padToken);
    const seed = encode('הערה: ה', stoi);
    for (let i = 0; i < seed.length && i < model.context; i++) ctx[model.context - 1 - i] = seed[seed.length - 1 - i];
    forward(model, ws, ctx, 1);
    const logits = Array.from(ws.logits.slice(0, model.vocabSize));

    const entropyAt = (t) => {
      const scaled = logits.map((l) => l / t);
      const max = Math.max(...scaled);
      const exp = scaled.map((l) => Math.exp(l - max));
      const sum = exp.reduce((a, b) => a + b, 0);
      return exp.reduce((h, e) => { const p = e / sum; return h - (p > 0 ? p * Math.log(p) : 0); }, 0);
    };

    const ladder = [0.3, 0.7, 1.0, 1.5].map((t) => ({ t, h: entropyAt(t) }));
    for (let i = 1; i < ladder.length; i++) {
      check(ladder[i].h > ladder[i - 1].h,
        `temperature ${ladder[i].t} does not flatten the distribution more than ${ladder[i - 1].t}: `
        + `${ladder[i].h.toFixed(4)} against ${ladder[i - 1].h.toFixed(4)} nats`);
    }
    check(ladder[3].h - ladder[0].h > 0.5, 'the whole temperature range barely moves the distribution');

    /* And on generate() itself: cold sampling must reach for fewer different
     * characters than hot sampling.
     *
     * Two more tempting assertions were written here first and both were wrong,
     * for the same reason — they were claims about this particular model
     * dressed up as claims about temperature.
     *
     * That cold output looks repetitive: greedy decoding only has to repeat
     * once a context recurs, and a model whose cycle is longer than the sample
     * never does. And that a temperature near zero is the argmax, so two random
     * streams must agree: that holds only when the gap between the top logits
     * is large next to the temperature. The shipped model's gap is about one
     * nat, so at 0.02 it is argmax and the two streams do agree. The small model
     * trained inside this file has gaps of a few hundredths, where dividing by
     * 0.02 leaves the runner-up a third of the probability — and it samples,
     * correctly, exactly as the arithmetic says it should. */
    const at = (t, seed) => generate(model, { length: 1500, temperature: t, topK: 0, rng: makeRng(seed) });
    const chars0 = new Set(at(0.05, 1)).size;
    const chars15 = new Set(at(1.5, 1)).size;
    check(chars0 < chars15, `cold sampling used ${chars0} characters and hot used ${chars15}`);
    notes.push(`temperature: ${ladder.map((l) => `${l.t}→${l.h.toFixed(2)}`).join(' ')} nats at one context; `
      + `${chars0} characters used near zero against ${chars15} at 1.5`);
  }

  /* An absurd learning rate must leave a live trainer behind, not NaN weights.
   * This is the setting a curious user reaches for within about a minute. */
  const wild = createTrainer(createModel({ chars, context: 4, embed: 8, hidden: 32, seed: 5 }), { batch: 32, lr: 1 });
  const f4 = makeBatcher(train, { context: 4, rng: makeRng(15) });
  const x4 = new Int32Array(32 * 4), y4 = new Int32Array(32);
  let wildLoss = NaN;
  for (let i = 0; i < 200; i++) { f4(x4, y4, 32); wildLoss = wild.step(x4, y4, 32); }
  check(Number.isFinite(wildLoss), `a learning rate of 1 produced ${wildLoss}`);
  notes.push(`lr 1.0 survives 200 steps at loss ${wildLoss.toFixed(3)}`);
}

/* ------------------------------------------------------------------ *
 * 7. Loading a file someone else wrote
 *
 * The import button takes a JSON file off a stranger's disk and builds arrays
 * from the numbers in it. Every one of these used to be a way to make the page
 * allocate, or read past an array, on the strength of a field nobody checked.
 * ------------------------------------------------------------------ */

{
  const good = serialize(createModel({ chars: ['a', 'b', 'c'], context: 2, embed: 3, hidden: 4, seed: 1 }));
  const clone = () => JSON.parse(JSON.stringify(good));
  const rejects = (mutate, why) => {
    const file = clone();
    mutate(file);
    let threw = false;
    try { deserialize(file); } catch { threw = true; }
    check(threw, `a bad model file was accepted: ${why}`);
  };

  check(deserialize(clone()).model.vocabSize === 3, 'a valid model file was rejected');
  check(good.format === FORMAT, 'serialize wrote the wrong format tag');

  rejects((f) => { f.format = 'gpt-5'; }, 'wrong format tag');
  rejects((f) => { delete f.weights; }, 'no weights');
  rejects((f) => { f.weights.W1 = f.weights.W1.slice(1); }, 'a weight array one short');
  rejects((f) => { f.weights.W1.push(0); }, 'a weight array one long');
  rejects((f) => { f.weights.b2[0] = 'x'; }, 'a weight that is a string');
  rejects((f) => { f.weights.E[2] = NaN; }, 'a weight that is NaN');
  rejects((f) => { f.weights.E[2] = null; }, 'a weight that is null');
  rejects((f) => { f.hidden = 1e9; }, 'a hidden size that would allocate gigabytes');
  rejects((f) => { f.context = LIMITS.context + 1; }, 'a context past the ceiling');
  rejects((f) => { f.embed = -4; }, 'a negative embedding size');
  rejects((f) => { f.hidden = 4.5; }, 'a fractional hidden size');
  rejects((f) => { f.chars = ['a']; }, 'a one-character vocabulary');
  rejects((f) => { f.chars = ['a', 'a', 'b']; }, 'a vocabulary with duplicates');
  rejects((f) => { f.chars = ['a', 'b', 7]; }, 'a vocabulary holding a number');
  rejects((f) => { f.chars = ['a', 'b', 'x'.repeat(200)]; }, 'a vocabulary entry that is a paragraph');
  rejects((f) => { f.chars = 'abc'; }, 'a vocabulary that is a string');

  /* A pad token pointing outside the vocabulary would index past the embedding
   * table on the first generated character. It is clamped rather than refused,
   * because a file that is otherwise sound should still open. */
  const padded = clone();
  padded.padToken = 999;
  const { model: m } = deserialize(padded);
  check(m.padToken === 0, 'an out-of-range pad token was not clamped');
  check(generate(m, { length: 5, rng: makeRng(1) }).length === 5, 'generation broke on a clamped pad');
}

/* ------------------------------------------------------------------ */

if (notes.length) {
  console.log('lm-check notes:');
  for (const n of notes) console.log(`  · ${n}`);
}
if (failures.length) {
  console.error(`\nlm-check: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\nlm-check: all checks passed`);
