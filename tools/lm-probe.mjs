#!/usr/bin/env node
/*
 * lm-probe.mjs — what a model writes, measured.
 *
 * Loss says how surprised a model is by text it did not write. It says nothing
 * about the text it does write, and the two come apart in ways that matter for
 * a model this small: a tenth of a nat can be spent learning that the space
 * character is common, or learning to close a bracket, and only one of those is
 * visible when you read the output.
 *
 * So: generate from the model, and count things that are true or false rather
 * than pleasant or unpleasant. Brackets that close. Quotes that pair. Words that
 * exist. Whether a Hebrew prompt stays in Hebrew. Whether it has fallen into a
 * loop. Whether a line it wrote is a line it memorised.
 *
 * None of these is a score. They are a description, and their use is to give
 * whoever is tuning the model something to aim at that is not the loss.
 *
 * Usage:
 *   node tools/lm-probe.mjs lm/src/models/laken.js
 *   node tools/lm-probe.mjs a.json b.json --temp 0.8 --json
 *
 *   --corpus NAME   the text to compare against  (default: both)
 *   --samples N     how many passages            (default: 12)
 *   --length N      characters per passage       (default: 500)
 *   --temp F        sampling temperature         (default: 0.8)
 *   --topk N        candidates kept per character, 0 for all (default: 12)
 *   --seed N        which passages               (default: 5)
 *   --json          machine-readable, for an agent to read
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { deserialize, generate } from '../lm/src/model.js';
import { reply } from '../lm/src/talk.js';
import { drawing, vector, safeSvg } from '../lm/src/picture.js';
import { corpusById } from '../lm/src/corpora/index.js';
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
      console.error(`lm-probe: --${name} needs a number`);
      process.exit(2);
    }
    return n;
  }
  return missing ? true : v;
};

const FLAGGED = new Set(['--corpus', '--samples', '--length', '--temp', '--topk', '--seed']);
const files = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !FLAGGED.has(all[i - 1]));

const opts = {
  corpus: arg('corpus', 'both'),
  samples: arg('samples', 12),
  length: arg('length', 500),
  temp: arg('temp', 0.8),
  topk: arg('topk', 12),
  seed: arg('seed', 5),
  json: process.argv.includes('--json'),
};

if (!files.length) {
  console.error('usage: node tools/lm-probe.mjs <model.json|model.js> [more…] [--temp 0.8] [--json]');
  process.exit(2);
}

const HEBREW = /[֐-׿]/;
const LATIN = /[A-Za-z]/;

/* Prompts chosen so each one has an unambiguous right answer about what should
 * follow it — Hebrew after Hebrew, code after code — which is what makes
 * stickiness measurable rather than a matter of taste. */
const PROMPTS = [
  { id: 'hebrew', text: 'ש: כמה', script: HEBREW },
  { id: 'answer', text: 'ת: ', script: HEBREW },
  { id: 'function', text: 'function ', script: LATIN },
  { id: 'python', text: 'def ', script: LATIN },
  { id: 'css', text: '.card {', script: LATIN },
  { id: 'cold', text: '', script: null },
];

const text = await corpusById(opts.corpus).load();

/* The dictionary a generated word is checked against: every word the corpus
 * itself uses. A model that invents Hebrew-looking words scores zero here, and
 * that is the intended reading — this measures copying real words, not fluency,
 * and a small model has no way to do the second without the first. */
const words = (s) => s.split(/[^\p{L}\p{N}_]+/u).filter((w) => w.length >= 2);
const corpusWords = new Set(words(text));
const corpusLines = new Set(text.split('\n').map((l) => l.trim()).filter((l) => l.length >= 8));
const corpusLineLength = text.split('\n').reduce((n, l) => n + l.length, 0) / text.split('\n').length;

const PAIRS = { ')': '(', ']': '[', '}': '{' };
const OPENS = new Set(['(', '[', '{']);

function brackets(s) {
  const stack = [];
  let closed = 0;
  let stray = 0;
  for (const ch of s) {
    if (OPENS.has(ch)) stack.push(ch);
    else if (PAIRS[ch]) {
      if (stack.length && stack[stack.length - 1] === PAIRS[ch]) { stack.pop(); closed++; }
      else stray++;
    }
  }
  return { closed, stray, dangling: stack.length };
}

/** Windows of this length that had already appeared earlier in the passage. */
function repetition(s, window = 24) {
  if (s.length <= window) return 0;
  const seen = new Set();
  let repeats = 0;
  let total = 0;
  for (let i = 0; i + window <= s.length; i += 4) {
    const w = s.slice(i, i + window);
    total++;
    if (seen.has(w)) repeats++;
    else seen.add(w);
  }
  return total ? repeats / total : 0;
}

async function load(path) {
  const abs = resolve(ROOT, path);
  const raw = abs.endsWith('.js')
    ? (await import(pathToFileURL(abs))).default
    : JSON.parse(await readFile(abs, 'utf8'));
  const { model, meta } = deserialize(raw);
  return { name: basename(path), model, meta };
}

const reports = [];

for (const file of files) {
  const { name, model, meta } = await load(file);
  const passages = [];

  for (let i = 0; i < opts.samples; i++) {
    const prompt = PROMPTS[i % PROMPTS.length];
    const body = generate(model, {
      prompt: prompt.text,
      length: opts.length,
      temperature: opts.temp,
      topK: opts.topk,
      rng: makeRng(opts.seed + i * 101),
    });
    passages.push({ prompt, body });
  }

  const all = passages.map((p) => p.body).join('\n');
  const b = brackets(all);
  const generated = words(all);
  const known = generated.filter((w) => corpusWords.has(w));
  const heWords = generated.filter((w) => HEBREW.test(w));
  const heKnown = heWords.filter((w) => corpusWords.has(w));
  const enWords = generated.filter((w) => LATIN.test(w));
  const enKnown = enWords.filter((w) => corpusWords.has(w));

  const lines = all.split('\n').filter((l) => l.trim().length >= 8);
  const memorised = lines.filter((l) => corpusLines.has(l.trim()));

  /* Stickiness: of the letters that follow a prompt, how many are in the script
   * the prompt was written in. Letters only — punctuation, digits and spaces
   * belong to both and would flatter every model equally. */
  const stick = {};
  for (const p of PROMPTS) {
    if (!p.script) continue;
    const mine = passages.filter((x) => x.prompt.id === p.id);
    if (!mine.length) continue;
    let letters = 0, right = 0;
    for (const m of mine) {
      for (const ch of m.body) {
        if (!/\p{L}/u.test(ch)) continue;
        letters++;
        if (p.script.test(ch)) right++;
      }
    }
    stick[p.id] = letters ? right / letters : null;
  }

  const quoteLines = all.split('\n').filter((l) => /["']/.test(l));
  const balancedQuotes = quoteLines.filter((l) => {
    const d = (l.match(/"/g) || []).length;
    const s = (l.match(/'/g) || []).length;
    return d % 2 === 0 && s % 2 === 0;
  });

  /* The three things the page now offers besides writing: answering, drawing in
   * characters, drawing in SVG. Each is a completion in a shape the corpus
   * teaches, so each either works or does not, and the fraction that works is
   * the number worth printing. */
  const QUESTIONS = ['שלום', 'מה שלומך', 'כמה חלבון ביום', 'מה זה משתנה', 'איך מתחילים להתאמן', 'מה אתה יודע לעשות', 'תסביר לי', 'למה'];
  const answered = QUESTIONS.map((q, i) => reply(model, q, {
    temperature: opts.temp, topK: opts.topk, rng: makeRng(opts.seed + 977 + i),
  }));
  const chat = {
    asked: QUESTIONS.length,
    replied: answered.filter((a) => a.text.length > 0).length,
    /* An answer that ends where the next question begins is one the model chose
     * to end. One that runs into the character limit is one it did not. */
    ended: answered.filter((a) => a.reason === 'turn').length,
    meanLength: answered.reduce((n, a) => n + a.text.length, 0) / QUESTIONS.length,
    sample: (answered.find((a) => a.text) || { text: '' }).text.slice(0, 60),
  };

  const SUBJECTS = ['חתול', 'כלב', 'בית', 'עץ', 'שמש', 'לב', 'פרח', 'ציפור'];
  const drawn = SUBJECTS.map((subject, i) => drawing(model, subject, {
    generate, temperature: opts.temp, topK: opts.topk || 10, rng: makeRng(opts.seed + 313 + i),
  }));
  /* A drawing is at least two lines, none of them longer than the corpus allows
   * — a model that has not learned the shape runs on past the blank line and
   * writes a paragraph. */
  const looksDrawn = drawn.filter((d) => {
    const rows = d.split('\n').filter((l) => l.trim());
    return rows.length >= 2 && rows.every((l) => l.length <= 44);
  });

  const vectors = SUBJECTS.map((subject, i) => vector(model, subject, {
    generate, temperature: opts.temp, topK: opts.topk || 8, rng: makeRng(opts.seed + 611 + i),
  }));
  const renderable = vectors.filter((v) => safeSvg(v) !== null);

  reports.push({
    chat,
    drawings: { tried: SUBJECTS.length, shaped: looksDrawn.length, sample: (looksDrawn[0] || drawn[0] || '').split('\n').slice(0, 4).join(' ⏎ ').slice(0, 70) },
    vectors: { tried: SUBJECTS.length, renderable: renderable.length, sample: (renderable[0] || vectors[0] || '').slice(0, 70) },
    name,
    steps: meta.steps ?? null,
    characters: all.length,
    brackets: {
      closed: b.closed,
      stray: b.stray,
      dangling: b.dangling,
      /* Of every closing bracket it wrote, the share that had something to
       * close. The interesting failure is a `}` that closes nothing. */
      soundClosers: b.closed + b.stray ? b.closed / (b.closed + b.stray) : null,
    },
    quotes: { lines: quoteLines.length, balanced: balancedQuotes.length,
      rate: quoteLines.length ? balancedQuotes.length / quoteLines.length : null },
    words: {
      total: generated.length,
      real: known.length,
      rate: generated.length ? known.length / generated.length : 0,
      hebrewRate: heWords.length ? heKnown.length / heWords.length : null,
      latinRate: enWords.length ? enKnown.length / enWords.length : null,
    },
    lines: {
      count: lines.length,
      meanLength: lines.reduce((n, l) => n + l.length, 0) / Math.max(1, lines.length),
      corpusMeanLength: corpusLineLength,
      memorisedRate: lines.length ? memorised.length / lines.length : 0,
    },
    stickiness: stick,
    repetition: repetition(all),
    sample: passages[0].body.slice(0, 120),
  });
}

if (opts.json) {
  console.log(JSON.stringify({
    corpus: `corpus:${opts.corpus}`,
    settings: { samples: opts.samples, length: opts.length, temperature: opts.temp, topK: opts.topk, seed: opts.seed },
    reports,
  }, null, 2));
} else {
  const pct = (v) => (v === null || v === undefined ? '   —' : `${(v * 100).toFixed(1)}%`);
  console.log(`${opts.samples} passages of ${opts.length} characters each, temperature ${opts.temp}, top-k ${opts.topk || 'off'}\n`);
  for (const r of reports) {
    console.log(`${r.name}${r.steps ? ` · ${r.steps.toLocaleString()} steps` : ''}`);
    console.log(`  closing brackets that closed something   ${pct(r.brackets.soundClosers)}   (${r.brackets.stray} stray, ${r.brackets.dangling} left open)`);
    console.log(`  lines with balanced quotes               ${pct(r.quotes.rate)}   (of ${r.quotes.lines} lines with a quote)`);
    console.log(`  words that exist in the corpus           ${pct(r.words.rate)}   (Hebrew ${pct(r.words.hebrewRate)}, Latin ${pct(r.words.latinRate)}, ${r.words.total} words)`);
    console.log(`  lines copied whole from the corpus       ${pct(r.lines.memorisedRate)}   (${r.lines.count} lines, mean ${r.lines.meanLength.toFixed(1)} against the corpus's ${r.lines.corpusMeanLength.toFixed(1)})`);
    console.log(`  stays in the prompt's alphabet           Hebrew ${pct(r.stickiness.hebrew)} · code ${pct(r.stickiness.function)}`);
    console.log(`  passages looping on themselves           ${pct(r.repetition)}`);
    console.log(`  questions it answered at all             ${r.chat.replied}/${r.chat.asked}   (${r.chat.ended} ended on their own, mean ${Math.round(r.chat.meanLength)} characters)`);
    console.log(`  drawings shaped like drawings            ${r.drawings.shaped}/${r.drawings.tried}   ${JSON.stringify(r.drawings.sample)}`);
    console.log(`  SVG a browser would render               ${r.vectors.renderable}/${r.vectors.tried}   ${JSON.stringify(r.vectors.sample.slice(0, 46))}`);
    console.log(`  first passage: ${JSON.stringify(r.sample.slice(0, 90))}\n`);
  }
}
