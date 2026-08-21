#!/usr/bin/env node
/*
 * lm-eval.mjs — scores trained models against each other on the same text, at
 * the same places in it.
 *
 * The number tools/lm-train.mjs prints at the end of a run cannot be compared
 * across runs, and that is not a flaw in the trainer: its held-out windows are
 * drawn from a span that is the tail minus the context length, so the same seed
 * lands on different characters for a model with a window of 8 and one with a
 * window of 16. Two agents tuning the same model would each come back with a
 * smaller number and no way to tell who had actually done better.
 *
 * This reads the same passage of held-out text with every model and measures
 * the total surprise, then divides by the characters that passage holds. Bits
 * per character is the one number that survives every difference between the
 * models being compared: a word model is surprised once per word and a
 * character model once per letter, but a passage has a fixed number of
 * characters in it either way, and the model that predicts the passage better
 * spends fewer bits on it. It is also the number the compression literature has
 * used for fifty years, for the same reason.
 *
 * Usage:
 *   node tools/lm-eval.mjs a.json b.json                 # leaderboard
 *   node tools/lm-eval.mjs lm/src/models/laken.js --corpus both
 *   node tools/lm-eval.mjs a.json --positions 8192 --json
 *
 *   --corpus NAME   log · code · general · both  (default: both)
 *   --in FILE       a text file instead of a named corpus
 *   --positions N   characters to score          (default: 4096)
 *   --seed N        which characters             (default: 7)
 *   --val F         held-out fraction, matching the trainer (default: 0.1)
 *   --json          machine-readable, for an agent to read
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { deserialize, createWorkspace, forward, softmaxLoss, paramCount, LIMITS } from '../lm/src/model.js';
import { buildCodec, encode, isWordVocab } from '../lm/src/tokenizer.js';
import { corpusById, CORPORA } from '../lm/src/corpora/index.js';
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
      console.error(`lm-eval: --${name} needs a number`);
      process.exit(2);
    }
    return n;
  }
  return missing ? true : v;
};

const FLAGS = new Set(['corpus', 'in', 'positions', 'seed', 'val', 'json', 'force']);
const files = process.argv.slice(2).filter((a, i, all) => {
  if (a.startsWith('--')) return false;
  const before = all[i - 1];
  return !(before && before.startsWith('--') && FLAGS.has(before.slice(2)) && before !== '--json' && before !== '--force');
});

const opts = {
  corpus: arg('corpus', 'both'),
  in: arg('in', ''),
  positions: arg('positions', 4096),
  seed: arg('seed', 7),
  val: arg('val', 0.1),
  json: process.argv.includes('--json'),
  force: process.argv.includes('--force'),
};

if (!files.length) {
  console.error('usage: node tools/lm-eval.mjs <model.json|model.js> [more…] [--corpus both] [--positions 4096]');
  console.error(`corpora: ${CORPORA.filter((c) => c.load).map((c) => c.id).join(', ')}`);
  process.exit(2);
}

/** A model file, whether it is JSON on disk or one of the generated modules. */
async function load(path) {
  const abs = resolve(ROOT, path);
  const raw = abs.endsWith('.js')
    ? (await import(pathToFileURL(abs))).default
    : JSON.parse(await readFile(abs, 'utf8'));
  const { model, meta } = deserialize(raw);
  return { name: basename(path), path, model, meta };
}

const entries = [];
for (const f of files) {
  try {
    entries.push(await load(f));
  } catch (err) {
    console.error(`${f}: ${err.message}`);
    process.exit(1);
  }
}

const text = opts.in
  ? await readFile(resolve(ROOT, opts.in), 'utf8')
  : await corpusById(opts.corpus).load();

/* The held-out tail, as text rather than as tokens — every model cuts it into
 * its own tokens below. Capped so a large corpus does not make this a training
 * run in its own right. */
const characters = [...text];
const cut = Math.floor(characters.length * (1 - opts.val));
const tail = characters.slice(cut).join('');
const passage = tail.length > 160000 ? tail.slice(0, 160000) : tail;

if (passage.length < 2000) {
  console.error('the held-out tail is too short to score anything');
  process.exit(1);
}

/**
 * Total surprise over the passage, in bits per character.
 *
 * Every token after the first `context` of them is scored, with its own model's
 * history behind it. The divisor is the characters those tokens actually spell,
 * not the passage length: a vocabulary that cannot represent some character
 * drops it, and dividing by characters it never predicted would hand that model
 * a discount for the parts it cannot read. `coverage` reports how much of the
 * passage each model could represent at all.
 */
function score(model, chunk = 256) {
  const C = model.context;
  const stream = encode(passage, model.stoi, { words: model.wordy });
  if (stream.length <= C + 1) return null;

  let spelled = 0;
  for (let i = 0; i < stream.length; i++) spelled += [...model.chars[stream[i]]].length;

  const ws = createWorkspace(model, chunk);
  const xs = new Int32Array(chunk * C);
  const ys = new Int32Array(chunk);
  let nats = 0;
  let scored = 0;
  let predictedCharacters = 0;

  for (let start = C; start < stream.length; start += chunk) {
    const n = Math.min(chunk, stream.length - start);
    for (let b = 0; b < n; b++) {
      const at = start + b;
      for (let c = 0; c < C; c++) xs[b * C + c] = stream[at - C + c];
      ys[b] = stream[at];
      predictedCharacters += [...model.chars[stream[at]]].length;
    }
    forward(model, ws, xs, n);
    nats += softmaxLoss(model, ws, ys, n) * n;
    scored += n;
  }

  return {
    natsPerToken: nats / scored,
    bitsPerCharacter: nats / Math.LN2 / predictedCharacters,
    natsPerCharacter: nats / predictedCharacters,
    tokens: stream.length,
    charactersPerToken: spelled / stream.length,
    coverage: spelled / [...passage].length,
  };
}

const results = entries.map((e) => {
  const started = Date.now();
  const s = score(e.model);
  if (!s) {
    console.error(`${e.name}: its vocabulary cannot read enough of this text to be scored`);
    process.exit(1);
  }
  return {
    name: e.name,
    path: e.path,
    loss: s.natsPerCharacter,
    bits: s.bitsPerCharacter,
    perplexity: Math.exp(s.natsPerCharacter),
    natsPerToken: s.natsPerToken,
    tokens: e.model.wordy ? 'word' : 'char',
    vocabulary: e.model.chars.length,
    charactersPerToken: s.charactersPerToken,
    coverage: s.coverage,
    parameters: paramCount(e.model),
    context: e.model.context,
    embed: e.model.embed,
    hidden: e.model.hidden,
    steps: e.meta.steps ?? null,
    lr: e.meta.lr ?? null,
    batch: e.meta.batch ?? null,
    source: e.meta.source ?? null,
    ms: Date.now() - started,
  };
});

results.sort((a, b) => a.loss - b.loss);

if (opts.json) {
  console.log(JSON.stringify({
    corpus: opts.in || `corpus:${opts.corpus}`,
    characters: text.length,
    passage: passage.length,
    metric: 'bits per character on held-out text',
    results,
  }, null, 2));
} else {
  const source = opts.in || `corpus:${opts.corpus}`;
  console.log(`${source}: ${text.length.toLocaleString()} characters`);
  console.log(`scoring the same held-out passage of ${passage.length.toLocaleString()} characters with each model\n`);
  const width = Math.max(...results.map((r) => r.name.length), 5);
  console.log(`${'model'.padEnd(width)}   bits/ch   nats/ch   params    tokens   vocab   ch/token   steps`);
  for (const r of results) {
    console.log(
      `${r.name.padEnd(width)}   ${r.bits.toFixed(3).padStart(7)}   ${r.loss.toFixed(3).padStart(7)}   `
      + `${String(r.parameters.toLocaleString()).padStart(8)}   ${r.tokens.padStart(6)}   ${String(r.vocabulary).padStart(5)}   `
      + `${r.charactersPerToken.toFixed(2).padStart(8)}   ${r.steps === null ? '—' : r.steps.toLocaleString()}`,
    );
    if (r.coverage < 0.999) {
      console.log(`${' '.repeat(width)}   ⚠ its vocabulary covers only ${(r.coverage * 100).toFixed(1)}% of the passage`);
    }
  }
  if (results.length > 1) {
    const [best] = results;
    const worst = results[results.length - 1];
    console.log(`\n${best.name} wins by ${(worst.bits - best.bits).toFixed(3)} bits per character over ${worst.name}`);
  }
}
