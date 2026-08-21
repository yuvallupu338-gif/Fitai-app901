#!/usr/bin/env node
/*
 * lm-train.mjs — trains the model in lm/ from the command line and writes a
 * model file the page can open.
 *
 * The browser trainer is the one to watch; this is the one to leave running.
 * Same code underneath — it imports the same model.js the page does, so a file
 * trained here loads there and writes the same text — but with no frame budget
 * to respect it runs several times faster, and it can be pointed at a file too
 * large to paste into a textarea.
 *
 * Usage:
 *   node tools/lm-train.mjs                                   # the built-in corpus
 *   node tools/lm-train.mjs --corpus code --steps 20000       # what the 75 code agents wrote
 *   node tools/lm-train.mjs --in book.txt --out lm/book.json --steps 20000
 *   node tools/lm-train.mjs --in book.txt --ctx 12 --hidden 256 --lr 0.01
 *
 *   --corpus NAME  log · code · general · both  (default: log)
 *   --in FILE      a text file, which overrides --corpus
 *   --out FILE     where to write the model    (default: lm/model.json)
 *                  a path ending in .js is written as an ES module instead of
 *                  JSON, which is how the page loads a trained model without a
 *                  network request it is not allowed to make
 *   --steps N      optimiser steps             (default: 6000)
 *   --ctx N        characters of context       (default: 8)
 *   --emb N        embedding size              (default: 24)
 *   --hidden N     hidden units                (default: 128)
 *   --batch N      windows per step            (default: 64)
 *   --lr F         learning rate               (default: 0.02)
 *   --decay F      final learning rate as a fraction of --lr (default: 0.1)
 *   --warmup N     steps spent ramping the rate up from zero (default: 0)
 *   --weight-decay F   pull weights towards zero each step  (default: 0)
 *   --clip F       gradient norm ceiling       (default: 5)
 *   --seed N       everything random           (default: 1)
 *   --val F        fraction held out           (default: 0.1)
 *   --every N      steps between report lines  (default: 250)
 *   --min-count N  drop characters rarer than this (default: 1)
 *   --quiet        no samples, just the numbers
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createModel, createTrainer, generate, serialize, paramCount } from '../lm/src/model.js';
import { buildVocab, encode, splitData, makeBatcher, fixedBatch, pickPad, positions } from '../lm/src/tokenizer.js';
/* The same catalogue the page's picker reads, so `--corpus code` here and "קוד"
 * there are the same characters in the same order, and a loss from one run is
 * comparable with a loss from the other. */
import { CORPORA, corpusById } from '../lm/src/corpora/index.js';
import { makeRng } from '../lm/src/rng.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  /* A flag with no value used to come back as `true`, and `true` is not a
   * number, so the numeric guard skipped it — then arithmetic quietly turned it
   * into 1. `--lr` on its own trained at a learning rate of 1 and said nothing
   * about it; the model came out at a held-out loss of 32 against 4.9 for
   * random guessing. A numeric option with nothing after it is a mistake, and
   * is treated as one. */
  const missing = v === undefined || v.startsWith('--');
  if (typeof fallback === 'number') {
    const n = missing ? NaN : Number(v);
    if (!Number.isFinite(n)) {
      console.error(`lm-train: --${name} needs a number`);
      process.exit(2);
    }
    return n;
  }
  return missing ? true : v;
};

const opts = {
  in: arg('in', ''),
  corpus: arg('corpus', 'log'),
  out: arg('out', 'lm/model.json'),
  steps: arg('steps', 6000),
  ctx: arg('ctx', 8),
  emb: arg('emb', 24),
  hidden: arg('hidden', 128),
  batch: arg('batch', 64),
  lr: arg('lr', 0.02),
  decay: arg('decay', 0.1),
  warmup: arg('warmup', 0),
  weightDecay: arg('weight-decay', 0),
  clip: arg('clip', 5),
  seed: arg('seed', 1),
  val: arg('val', 0.1),
  every: arg('every', 250),
  minCount: arg('min-count', 1),
  quiet: process.argv.includes('--quiet'),
};

if (!opts.in && !CORPORA.some((c) => c.id === opts.corpus && c.load)) {
  console.error(`lm-train: --corpus must be one of ${CORPORA.filter((c) => c.load).map((c) => c.id).join(', ')}`);
  process.exit(2);
}

const text = opts.in
  ? await readFile(resolve(ROOT, opts.in), 'utf8')
  : await corpusById(opts.corpus).load();

const source = opts.in ? basename(opts.in) : `corpus:${opts.corpus}`;
const { chars, stoi, dropped } = buildVocab(text, { minCount: opts.minCount });
const data = encode(text, stoi);
const { train, val } = splitData(data, { valFraction: opts.val, context: opts.ctx });

if (positions(train, opts.ctx) <= 0) {
  console.error(`lm-train: ${source} is shorter than one context window`);
  process.exit(2);
}

const model = createModel({
  chars, context: opts.ctx, embed: opts.emb, hidden: opts.hidden,
  seed: opts.seed, padToken: pickPad(chars),
});
const trainer = createTrainer(model, {
  batch: opts.batch, lr: opts.lr, weightDecay: opts.weightDecay, clip: opts.clip,
});
const fill = makeBatcher(train, { context: opts.ctx, rng: makeRng(opts.seed + 1) });
const xs = new Int32Array(opts.batch * opts.ctx);
const ys = new Int32Array(opts.batch);
const evalSet = fixedBatch(val, { context: opts.ctx, count: 2048, seedRng: makeRng(opts.seed + 2) });

/* Two different numbers, and the one that used to be printed alone is the less
 * important of the two. `dropped` counts vocabulary entries that did not make
 * the cut; what matters to whoever reads the loss afterwards is how much of the
 * text went with them, because every dropped character is deleted from the
 * stream — the model is then scored on a text nobody chose. */
const sourceLength = [...text].length;
const removed = sourceLength - data.length;
const removedShare = sourceLength ? removed / sourceLength : 0;
console.log(`text     ${source}: ${text.length.toLocaleString()} characters, ${chars.length} in the vocabulary`
  + (dropped ? ` (${dropped} rare characters dropped, taking ${removed.toLocaleString()} positions — ${(removedShare * 100).toFixed(2)}% of the text)` : ''));
if (removedShare > 0.02) {
  console.log('         ⚠ that is a large share of the text: the loss below is for what is left of it, not for what you passed in');
}
console.log(`split    ${train.length.toLocaleString()} training, ${val.length.toLocaleString()} held out`);
console.log(`model    context ${opts.ctx} · embed ${opts.emb} · hidden ${opts.hidden} · ${paramCount(model).toLocaleString()} parameters`);
console.log(`run      ${opts.steps.toLocaleString()} steps · batch ${opts.batch} · lr ${opts.lr} decaying to ${(opts.lr * opts.decay).toPrecision(2)}`
  + (opts.warmup ? ` · warm-up ${opts.warmup}` : '')
  + (opts.weightDecay ? ` · weight decay ${opts.weightDecay}` : '')
  + (opts.clip !== 5 ? ` · clip ${opts.clip}` : '') + '\n');

/* Linear decay to a floor, with an optional ramp at the front.
 *
 * The decay is the part that always pays: the last few hundred steps of a run
 * at full rate bounce around a minimum they cannot settle into, and the same
 * steps at a tenth of the rate are worth roughly another thousand.
 *
 * The warm-up is there because Adam's second-moment estimate starts at zero and
 * is worthless for its first few dozen steps, so the first updates are taken
 * with a step size chosen by almost no evidence. Ramping in from zero costs
 * those steps and can save a run at a high rate. It is off by default because
 * at the rates this trains at, it usually changes nothing. */
const lrAt = (step) => {
  const decayed = opts.lr * (1 + (opts.decay - 1) * (step / Math.max(1, opts.steps)));
  return opts.warmup > 0 ? decayed * Math.min(1, step / opts.warmup) : decayed;
};

const started = Date.now();
let recent = 0, recentN = 0;

for (let step = 1; step <= opts.steps; step++) {
  fill(xs, ys, opts.batch);
  const loss = trainer.step(xs, ys, opts.batch, lrAt(step));
  recent += loss; recentN += 1;

  if (step % opts.every === 0 || step === opts.steps) {
    const held = evalSet.count ? trainer.evaluate(evalSet.xs, evalSet.ys, evalSet.count) : NaN;
    const rate = step / ((Date.now() - started) / 1000);
    console.log(
      `step ${String(step).padStart(6)}  train ${(recent / recentN).toFixed(4)}` +
      `  held-out ${Number.isFinite(held) ? held.toFixed(4) : '   —  '}` +
      `  |grad| ${trainer.lastNorm.toFixed(3)}  ${rate.toFixed(0)}/s`,
    );
    recent = 0; recentN = 0;

    if (!opts.quiet && (step % (opts.every * 8) === 0 || step === opts.steps)) {
      const sample = generate(model, { length: 220, temperature: 0.8, topK: 12, rng: makeRng(step) })
        .replace(/\n/g, ' ⏎ ');
      console.log(`\n  ${sample}\n`);
    }
  }
  if (!Number.isFinite(trainer.lastLoss)) {
    console.error(`\nlm-train: the loss stopped being a number at step ${step}. Lower --lr and try again.`);
    process.exit(1);
  }
}

const held = evalSet.count ? trainer.evaluate(evalSet.xs, evalSet.ys, evalSet.count) : NaN;
const file = serialize(model, {
  source,
  characters: text.length,
  steps: opts.steps,
  batch: opts.batch,
  lr: opts.lr,
  context: opts.ctx,
  embed: opts.emb,
  hidden: opts.hidden,
  warmup: opts.warmup || undefined,
  weightDecay: opts.weightDecay || undefined,
  clip: opts.clip !== 5 ? opts.clip : undefined,
  heldOutLoss: Number.isFinite(held) ? +held.toFixed(4) : null,
  trainedAt: new Date().toISOString(),
});

const outPath = resolve(ROOT, opts.out);
const json = JSON.stringify(file);

/* Two ways out. A .json file is what the page's file picker reads and what you
 * would send someone. A .js file is the same object as a module, which is the
 * only shape the page can load on its own: it runs under connect-src 'none' and
 * cannot fetch anything, but importing a module is script-src, and that is
 * 'self'. */
if (opts.out.endsWith('.js')) {
  /* Alongside the model, a manifest small enough to import on first paint. The
   * page needs to say what the trained model is — how long it trained, on what,
   * how large the download will be — before anyone decides to spend the
   * megabyte on it, and reading that out of the model itself would mean loading
   * the model to find out whether to load the model. */
  await writeFile(join(dirname(outPath), 'manifest.js'), `/* manifest.js — GENERATED by tools/lm-train.mjs. Do not edit by hand.
 *
 * What the trained model in this directory is, without loading it.
 */

export const MODEL = ${JSON.stringify({
    file: basename(opts.out),
    source: file.meta.source,
    characters: file.meta.characters,
    steps: file.meta.steps,
    heldOutLoss: file.meta.heldOutLoss,
    vocab: file.chars.length,
    context: file.context,
    embed: file.embed,
    hidden: file.hidden,
    bytes: json.length,
    trainedAt: file.meta.trainedAt,
  }, null, 2)};
`);

  await writeFile(outPath, `/* ${basename(opts.out)} — GENERATED by tools/lm-train.mjs. Do not edit by hand.
 *
 * A trained model as a module: ${file.meta.steps.toLocaleString()} steps on ${file.meta.source},
 * held-out loss ${file.meta.heldOutLoss}, ${file.chars.length} characters in its vocabulary.
 * Imported on demand by lm/src/main.js, never on first paint — it is ${(json.length / 1048576).toFixed(1)} MB.
 */

export default ${json};
`);
} else {
  await writeFile(outPath, json);
}

console.log(`\nwrote ${opts.out} — ${(json.length / 1024 / 1024).toFixed(2)} MB, held-out loss ${Number.isFinite(held) ? held.toFixed(4) : 'n/a'}`);
console.log(opts.out.endsWith('.js')
  ? 'the page imports it when someone presses "טען את המודל המאומן"'
  : 'open it with "טען מודל מקובץ" in lm/index.html');
