/*
 * tokenizer.js — the vocabulary, one token per character.
 *
 * A real model tokenises into sub-words, so "התאמנתי" costs it two or three
 * steps instead of seven. This one does not: every character is its own token,
 * which is the dumbest scheme that still works and the only one you can read
 * off the screen. It costs the model a shorter effective memory — eight
 * characters of context is barely two Hebrew words — and it buys the thing
 * that makes the toy worth having: you can watch it learn the alphabet, then
 * spelling, then spacing, in that order, in the first minute.
 *
 * Text is walked by code point rather than by UTF-16 unit, so an emoji is one
 * token and not a pair of broken halves. Hebrew niqqud stay separate marks,
 * which the model has to learn to place — it never manages, and that is part
 * of the fun.
 */

/**
 * Collect the character set of a text.
 * Rare characters can be dropped: one stray Cyrillic letter in a Hebrew file
 * buys a column in every weight matrix and a token the model can never learn
 * to use.
 */
export function buildVocab(text, { minCount = 1, maxSize = 512 } = {}) {
  const counts = new Map();
  for (const ch of text) counts.set(ch, (counts.get(ch) || 0) + 1);

  let kept = [...counts.entries()].filter(([, n]) => n >= minCount);
  const rare = counts.size - kept.length;

  let trimmed = 0;
  if (kept.length > maxSize) {
    kept.sort((a, b) => b[1] - a[1]);
    trimmed = kept.length - maxSize;
    kept = kept.slice(0, maxSize);
  }

  /* Sorted by code point, so the same text always yields the same token ids
   * and a model file stays comparable across runs. */
  const chars = kept.map(([ch]) => ch).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const stoi = new Map(chars.map((ch, i) => [ch, i]));
  return { chars, stoi, counts, dropped: rare + trimmed };
}

/** Text to token ids. Characters outside the vocabulary are skipped. */
export function encode(text, stoi) {
  const out = [];
  for (const ch of text) {
    const id = stoi.get(ch);
    if (id !== undefined) out.push(id);
  }
  return Int32Array.from(out);
}

/** Token ids back to text. */
export function decode(tokens, chars) {
  let s = '';
  for (let i = 0; i < tokens.length; i++) s += chars[tokens[i]] ?? '';
  return s;
}

/**
 * The character the model starts from with nothing to go on.
 * A newline is the honest choice where the text has any: whatever follows one
 * is, by definition, how this text begins a line. Failing that, a space.
 */
export function pickPad(chars) {
  const nl = chars.indexOf('\n');
  if (nl >= 0) return nl;
  const sp = chars.indexOf(' ');
  return sp >= 0 ? sp : 0;
}

/**
 * Split the stream into a training part and a held-out part.
 *
 * The tail is held out rather than a random scatter of positions: neighbouring
 * windows overlap by all but one character, so a random split would leave the
 * validation set quoting text the model trained on, and the gap between the two
 * losses — the only number here that tells you whether it learned anything or
 * just memorised — would read as zero forever.
 */
export function splitData(data, { valFraction = 0.1, context = 8 } = {}) {
  const n = data.length;
  let cut = Math.floor(n * (1 - valFraction));
  /* Validation needs at least one full window plus its target to be worth
   * anything; a short text keeps all of itself for training instead. */
  if (n - cut < context + 2) cut = n;
  return { train: data.subarray(0, cut), val: data.subarray(cut) };
}

/** How many (context, next character) pairs a stream holds. */
export const positions = (data, context) => Math.max(0, data.length - context);

/**
 * A batch sampler over one stream.
 * Draws independent random windows rather than walking the text in order: with
 * ordered batches, every step of an epoch sees one narrow slice of the writing
 * and the loss curve turns into a map of the document instead of the model.
 */
export function makeBatcher(data, { context, rng }) {
  const span = positions(data, context);
  if (span <= 0) throw new Error('tokenizer: the text is shorter than one context window');
  return function fill(xs, ys, batch) {
    for (let b = 0; b < batch; b++) {
      const i = Math.floor(rng() * span);
      for (let c = 0; c < context; c++) xs[b * context + c] = data[i + c];
      ys[b] = data[i + context];
    }
    return batch;
  };
}

/**
 * A fixed set of batches for evaluation.
 * Validation loss compared against a different random draw each time is noise
 * with a trend in it; the same windows every time make the curve mean what it
 * looks like it means.
 */
export function fixedBatch(data, { context, count, seedRng }) {
  const span = positions(data, context);
  const n = Math.max(0, Math.min(count, span));
  const xs = new Int32Array(n * context);
  const ys = new Int32Array(n);
  for (let b = 0; b < n; b++) {
    const i = Math.floor(seedRng() * span);
    for (let c = 0; c < context; c++) xs[b * context + c] = data[i + c];
    ys[b] = data[i + context];
  }
  return { xs, ys, count: n };
}
