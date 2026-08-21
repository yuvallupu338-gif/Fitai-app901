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
 *   node tools/lm-train.mjs --in book.txt --out lm/book.json --steps 20000
 *   node tools/lm-train.mjs --in book.txt --ctx 12 --hidden 256 --lr 0.01
 *
 *   --in FILE      text to train on (default: the built-in training-log corpus)
 *   --out FILE     where to write the model    (default: lm/model.json)
 *   --steps N      optimiser steps             (default: 6000)
 *   --ctx N        characters of context       (default: 8)
 *   --emb N        embedding size              (default: 24)
 *   --hidden N     hidden units                (default: 128)
 *   --batch N      windows per step            (default: 64)
 *   --lr F         learning rate               (default: 0.02)
 *   --decay F      final learning rate as a fraction of --lr (default: 0.1)
 *   --seed N       everything random           (default: 1)
 *   --val F        fraction held out           (default: 0.1)
 *   --every N      steps between report lines  (default: 250)
 *   --min-count N  drop characters rarer than this (default: 1)
 *   --quiet        no samples, just the numbers
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createModel, createTrainer, generate, serialize, paramCount } from '../lm/src/model.js';
import { buildVocab, encode, splitData, makeBatcher, fixedBatch, pickPad, positions } from '../lm/src/tokenizer.js';
import { buildCorpus } from '../lm/src/corpus.js';
import { makeRng } from '../lm/src/rng.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return true;
  return typeof fallback === 'number' ? Number(v) : v;
}

const opts = {
  in: arg('in', ''),
  out: arg('out', 'lm/model.json'),
  steps: arg('steps', 6000),
  ctx: arg('ctx', 8),
  emb: arg('emb', 24),
  hidden: arg('hidden', 128),
  batch: arg('batch', 64),
  lr: arg('lr', 0.02),
  decay: arg('decay', 0.1),
  seed: arg('seed', 1),
  val: arg('val', 0.1),
  every: arg('every', 250),
  minCount: arg('min-count', 1),
  quiet: process.argv.includes('--quiet'),
};

for (const [k, v] of Object.entries(opts)) {
  if (typeof v === 'number' && !Number.isFinite(v)) {
    console.error(`lm-train: --${k} is not a number`);
    process.exit(2);
  }
}

const text = opts.in
  ? await readFile(resolve(ROOT, opts.in), 'utf8')
  : buildCorpus();

const source = opts.in ? basename(opts.in) : 'built-in corpus';
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
const trainer = createTrainer(model, { batch: opts.batch, lr: opts.lr });
const fill = makeBatcher(train, { context: opts.ctx, rng: makeRng(opts.seed + 1) });
const xs = new Int32Array(opts.batch * opts.ctx);
const ys = new Int32Array(opts.batch);
const evalSet = fixedBatch(val, { context: opts.ctx, count: 2048, seedRng: makeRng(opts.seed + 2) });

console.log(`text     ${source}: ${text.length.toLocaleString()} characters, ${chars.length} in the vocabulary${dropped ? ` (${dropped} dropped)` : ''}`);
console.log(`split    ${train.length.toLocaleString()} training, ${val.length.toLocaleString()} held out`);
console.log(`model    context ${opts.ctx} · embed ${opts.emb} · hidden ${opts.hidden} · ${paramCount(model).toLocaleString()} parameters`);
console.log(`run      ${opts.steps.toLocaleString()} steps · batch ${opts.batch} · lr ${opts.lr} decaying to ${(opts.lr * opts.decay).toPrecision(2)}\n`);

/* Linear decay to a floor. The last few hundred steps of a run at full rate
 * bounce around a minimum they cannot settle into; the same steps at a tenth of
 * the rate are worth roughly another thousand. */
const lrAt = (step) => opts.lr * (1 + (opts.decay - 1) * (step / Math.max(1, opts.steps)));

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
  heldOutLoss: Number.isFinite(held) ? +held.toFixed(4) : null,
  trainedAt: new Date().toISOString(),
});

const outPath = resolve(ROOT, opts.out);
await writeFile(outPath, JSON.stringify(file));
const bytes = JSON.stringify(file).length;
console.log(`\nwrote ${opts.out} — ${(bytes / 1024 / 1024).toFixed(2)} MB, held-out loss ${Number.isFinite(held) ? held.toFixed(4) : 'n/a'}`);
console.log('open it with "טען מודל" in lm/index.html');
