#!/usr/bin/env node
/*
 * lm-eval.mjs — scores trained models against each other on the same text, at
 * the same places in it.
 *
 * The number tools/lm-train.mjs prints at the end of a run cannot be compared
 * across runs, and that is not a flaw in the trainer: its held-out set is drawn
 * with a seed that includes the context length, so a model with a window of 8
 * and one with a window of 16 are examined on different characters. Two agents
 * tuning the same model would each come back with a smaller number and no way
 * to tell who had actually done better.
 *
 * This picks the positions once — a fixed sample of the held-out tail, far
 * enough in that every context length has real history behind it — and asks
 * each model to predict the same characters. What comes out is comparable by
 * construction, and it is the only number that should decide anything.
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
import { encode } from '../lm/src/tokenizer.js';
import { corpusById, CORPORA } from '../lm/src/corpora/index.js';
import { makeRng } from '../lm/src/rng.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return true;
  return typeof fallback === 'number' ? Number(v) : v;
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

/* Every model must read the text the same way, or the positions below name
 * different characters for different models and the comparison is a fiction.
 * Same alphabet, same order, or this stops. */
const alphabet = entries[0].model.chars.join('');
for (const e of entries) {
  if (e.model.chars.join('') !== alphabet && !opts.force) {
    console.error(`${e.name}: its vocabulary differs from ${entries[0].name}'s, so the two cannot be scored on the same characters.`);
    console.error('Train them on the same corpus, or pass --force to score them separately anyway.');
    process.exit(1);
  }
}

const data = encode(text, entries[0].model.stoi);
const cut = Math.floor(data.length * (1 - opts.val));

/* Positions live in the held-out tail, and never in its first stretch: a model
 * with a window of 24 needs 24 characters of history behind the character it is
 * asked about, and giving one model padding where another gets text would be
 * the same unfairness in a smaller place. */
const floorAt = cut + LIMITS.context;
if (data.length - floorAt < 64) {
  console.error('the held-out tail is too short to score anything');
  process.exit(1);
}

const rng = makeRng(opts.seed);
const span = data.length - floorAt;
const count = Math.min(opts.positions, span);
const positions = new Int32Array(count);
for (let i = 0; i < count; i++) positions[i] = floorAt + Math.floor(rng() * span);

/** Mean negative log likelihood over exactly those characters. */
function score(model, chunk = 256) {
  const C = model.context;
  const ws = createWorkspace(model, chunk);
  const xs = new Int32Array(chunk * C);
  const ys = new Int32Array(chunk);
  let total = 0;
  for (let off = 0; off < count; off += chunk) {
    const n = Math.min(chunk, count - off);
    for (let b = 0; b < n; b++) {
      const at = positions[off + b];
      for (let c = 0; c < C; c++) xs[b * C + c] = data[at - C + c];
      ys[b] = data[at];
    }
    forward(model, ws, xs, n);
    total += softmaxLoss(model, ws, ys, n) * n;
  }
  return total / count;
}

const results = entries.map((e) => {
  const started = Date.now();
  const loss = score(e.model);
  return {
    name: e.name,
    path: e.path,
    loss,
    bits: loss / Math.LN2,
    perplexity: Math.exp(loss),
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
    vocabulary: entries[0].model.chars.length,
    positions: count,
    seed: opts.seed,
    randomGuessing: Math.log(entries[0].model.chars.length),
    results,
  }, null, 2));
} else {
  const source = opts.in || `corpus:${opts.corpus}`;
  console.log(`${source}: ${text.length.toLocaleString()} characters, ${entries[0].model.chars.length} in the vocabulary`);
  console.log(`scoring the same ${count.toLocaleString()} held-out characters (seed ${opts.seed}); random guessing is ${Math.log(entries[0].model.chars.length).toFixed(4)}\n`);
  const width = Math.max(...results.map((r) => r.name.length), 5);
  console.log(`${'model'.padEnd(width)}   loss    bits/ch   perplexity  params    shape        steps`);
  for (const r of results) {
    console.log(
      `${r.name.padEnd(width)}   ${r.loss.toFixed(4)}  ${r.bits.toFixed(3)}     ${r.perplexity.toFixed(2).padStart(7)}   `
      + `${String(r.parameters.toLocaleString()).padStart(8)}  ${`${r.context}·${r.embed}·${r.hidden}`.padEnd(11)}  `
      + `${r.steps === null ? '—' : r.steps.toLocaleString()}`,
    );
  }
  if (results.length > 1) {
    const [best, ...rest] = results;
    const worst = rest[rest.length - 1];
    console.log(`\n${best.name} wins by ${(worst.loss - best.loss).toFixed(4)} nats over ${worst.name}`);
  }
}
