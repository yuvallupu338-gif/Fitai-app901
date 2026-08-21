/*
 * tokenizer.js — the vocabulary. Two of them, now.
 *
 * **By character** is what this started as and is still the best way to watch a
 * model learn: every character its own token, so you see it discover the
 * alphabet, then spacing, then the shape of a line, in that order, in the first
 * minute. It is also the cheapest — a vocabulary of 139 makes a small output
 * layer — which is why the page still trains this way by default.
 *
 * **By word** is what it takes to be understood. A character model spends most
 * of its capacity on spelling: learning that ם usually follows של, that a ו is
 * likely after מ. Nothing it learns there is about meaning, and with a window
 * of twelve characters — two Hebrew words — there is no room left for meaning
 * anyway. Give it whole words as tokens and the spelling comes free, the same
 * window covers four times as much text, and what it writes is made of words
 * that exist.
 *
 * The word vocabulary is a hybrid and has to be: the common words, plus every
 * character. Anything outside the word list is spelled out rather than becoming
 * an <unk>, so the model can still write any string — a name it has never seen,
 * a number, a line of code — and pays the character price only there. Words
 * carry their leading space, the way every real subword tokenizer does it,
 * because otherwise half the stream is spaces.
 *
 * Both produce the same thing: a list of token strings, and a map from string
 * to id. Nothing downstream knows the difference — model.js has never assumed
 * its tokens were single characters.
 *
 * Text is walked by code point rather than by UTF-16 unit, so an emoji is one
 * token and not a pair of broken halves.
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

/* A run of letters, digits or underscores — the thing a word tokenizer treats
 * as one unit. Everything else (spaces, punctuation, newlines) stands alone. */
const WORDISH = /[\p{L}\p{N}_]/u;

/**
 * Split text the way the word vocabulary counts and encodes it.
 *
 * A word takes the single space in front of it with it, so " מים" is one token.
 * Without that, every other token in the stream is a space and the compression
 * — the entire point — is halved.
 */
export function splitWords(text) {
  const parts = [];
  let word = '';
  let spaces = 0;

  /* Spaces that are not the one belonging to a word are tokens of their own.
   * Getting this wrong is not a rounding error: the first version merged *any*
   * run of spaces into the following word, which deleted every level of
   * indentation in the code corpus — 4% of the text, silently, and exactly the
   * 4% that teaches a model what code looks like. */
  const emitSpaces = (keepOneForWord) => {
    const emit = keepOneForWord ? spaces - 1 : spaces;
    for (let i = 0; i < emit; i++) parts.push(' ');
    spaces = 0;
  };

  const emitWord = () => {
    if (!word) return;
    if (spaces > 0) { emitSpaces(true); parts.push(` ${word}`); }
    else parts.push(word);
    word = '';
  };

  for (const ch of text) {
    if (WORDISH.test(ch)) { word += ch; continue; }
    emitWord();
    if (ch === ' ') { spaces++; continue; }
    emitSpaces(false);
    parts.push(ch);
  }
  emitWord();
  emitSpaces(false);
  return parts;
}

/**
 * A vocabulary of the commonest words plus every character.
 *
 * `maxWords` is the dial that matters. Every word added is a column in the
 * output matrix — at hidden 192 that is 192 weights each — so the vocabulary
 * is most of the model's size, and doubling it does not double what it knows:
 * word frequencies have a long tail, and the two thousandth word appears a
 * handful of times in a million characters, which is not enough to learn from.
 */
export function buildWordVocab(text, { maxWords = 1500, minCount = 3 } = {}) {
  const counts = new Map();
  for (const part of splitWords(text)) {
    const bare = part.trim();
    if (bare.length > 1 && WORDISH.test(bare[0])) counts.set(part, (counts.get(part) || 0) + 1);
  }

  const words = [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, maxWords)
    .map(([w]) => w);

  /* Characters first, so a character keeps a low id whichever vocabulary is in
   * use, and the two are easier to read side by side. */
  const characters = [...new Set(text)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const tokens = [...new Set([...characters, ...words])];
  const stoi = new Map(tokens.map((t, i) => [t, i]));

  const streamLength = encode(text, stoi, { words: true }).length;
  return {
    chars: tokens,
    stoi,
    words: words.length,
    characters: characters.length,
    /* How many characters one token is worth — the compression, and the reason
     * the same window suddenly covers more text. */
    charactersPerToken: [...text].length / Math.max(1, streamLength),
  };
}

/** Text to token ids. Anything outside the vocabulary is skipped or spelled. */
export function encode(text, stoi, { words = false } = {}) {
  const out = [];
  if (!words) {
    for (const ch of text) {
      const id = stoi.get(ch);
      if (id !== undefined) out.push(id);
    }
    return Int32Array.from(out);
  }

  /* Word first, characters as the fallback. Note the fallback also has to
   * handle the leading space the word carried: " מיטוכונדריה" is not in the
   * list, so it becomes a space token followed by its letters. */
  for (const part of splitWords(text)) {
    const id = stoi.get(part);
    if (id !== undefined) { out.push(id); continue; }
    for (const ch of part) {
      const fallback = stoi.get(ch);
      if (fallback !== undefined) out.push(fallback);
    }
  }
  return Int32Array.from(out);
}

/** Token ids back to text. Works for both vocabularies — a token is a string. */
export function decode(tokens, chars) {
  let s = '';
  for (let i = 0; i < tokens.length; i++) s += chars[tokens[i]] ?? '';
  return s;
}

/** True when a vocabulary holds anything longer than one character. */
export const isWordVocab = (chars) => chars.some((t) => [...t].length > 1);

/**
 * Build a vocabulary and the encoder that goes with it, together.
 *
 * The two have to match — a word vocabulary read one character at a time gives
 * a stream of letter ids and a model that learns nothing — and keeping them in
 * one object is how that stops being something every caller has to remember.
 */
export function buildCodec(text, { tokens = 'char', maxWords = 1500, minCount = 1, wordMinCount = 3 } = {}) {
  if (tokens === 'word') {
    /* `wordMinCount` is separate from `minCount` on purpose: the first governs
     * how often a word must appear to earn a place in the vocabulary, the
     * second how often a character must. They answer different questions and a
     * short text needs the first lowered without touching the second. */
    const vocab = buildWordVocab(text, { maxWords, minCount: wordMinCount });
    return { ...vocab, tokens: 'word', encode: (s) => encode(s, vocab.stoi, { words: true }) };
  }
  const vocab = buildVocab(text, { minCount });
  return { ...vocab, tokens: 'char', words: 0, characters: vocab.chars.length, charactersPerToken: 1,
    encode: (s) => encode(s, vocab.stoi) };
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
