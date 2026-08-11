/*
 * sparks.index.js — assembles the three library files into one checked table.
 *
 * The validation below runs at import time and throws. That is on purpose: a
 * spark with a typo'd category is not a cosmetic bug, it is an item the ranker
 * scores against a feature that does not exist and that no filter can exclude.
 * Failing loudly at load, in development, is much cheaper than a silent hole in
 * the candidate pool that only shows up as "the app keeps giving me the same
 * five things".
 */

import { SPARKS_BODY } from './sparks.body.js';
import { SPARKS_MIND } from './sparks.mind.js';
import { SPARKS_LIFE } from './sparks.life.js';
import { SPARKS_BODY2 } from './sparks.body2.js';
import { SPARKS_MIND2 } from './sparks.mind2.js';
import { SPARKS_LIFE2 } from './sparks.life2.js';
import { CATEGORY_KEYS, SIZE_KEYS, TONE_KEYS, TOPIC_INDEX, TOPICS, sizeOf } from './taxonomy.js';

const RAW = [].concat(SPARKS_BODY, SPARKS_MIND, SPARKS_LIFE,
  SPARKS_BODY2, SPARKS_MIND2, SPARKS_LIFE2);

/* Copy limits, straight from the spec. They are enforced here rather than
 * trusted, because the card layout is built around them: a 60-character title
 * wraps to three lines on a small phone and pushes the action line under the
 * fold, which is the one line that has to be visible. */
const LIMITS = { title: 42, body: 220, action: 90 };

function validate(list) {
  const ids = new Set();
  for (const s of list) {
    const where = `spark "${s.id || '(no id)'}"`;
    if (!s.id) throw new Error('a spark is missing an id');
    if (ids.has(s.id)) throw new Error(`${where}: duplicate id`);
    ids.add(s.id);

    if (!CATEGORY_KEYS.includes(s.category)) throw new Error(`${where}: unknown category "${s.category}"`);
    if (!SIZE_KEYS.includes(s.size)) throw new Error(`${where}: unknown size "${s.size}"`);
    if (!TONE_KEYS.includes(s.tone)) throw new Error(`${where}: unknown tone "${s.tone}"`);
    if (!['quote', 'action', 'tip'].includes(s.type)) throw new Error(`${where}: unknown type "${s.type}"`);

    if (!Array.isArray(s.topics) || !s.topics.length) throw new Error(`${where}: no topics`);
    for (const t of s.topics) {
      if (!(t in TOPIC_INDEX)) throw new Error(`${where}: unknown topic "${t}" — add it to TOPICS`);
    }

    for (const field of ['title', 'body', 'action']) {
      if (!s[field]) throw new Error(`${where}: missing ${field}`);
      if (s[field].length > LIMITS[field]) {
        throw new Error(`${where}: ${field} is ${s[field].length} chars, limit ${LIMITS[field]}`);
      }
    }

    /* A "safe" spark is one that may be handed to someone having a bad day. A
     * stretch-sized one never qualifies no matter what the author intended —
     * fifteen minutes of anything is a demand. */
    if (s.safe && s.size !== 'micro') {
      throw new Error(`${where}: marked safe but size is "${s.size}" — only micro may be safe`);
    }
  }
  return list;
}

/*
 * The topic vector for a spark.
 *
 * Unit-normalised so that an item tagged with two topics is not automatically
 * ranked below one tagged with five. Without the normalisation the ranker
 * quietly develops a taste for verbosely-tagged content, which is a property of
 * the tagging and not of the person.
 */
function topicVector(spark) {
  const v = new Float32Array(TOPICS.length);
  for (const t of spark.topics) v[TOPIC_INDEX[t]] = 1;
  let norm = 0;
  for (let i = 0; i < v.length; i += 1) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i += 1) v[i] /= norm;
  return v;
}

export const LIBRARY = validate(RAW).map((s) => Object.freeze(Object.assign({}, s, {
  seconds: s.seconds || sizeOf(s.size).seconds,
  safe: !!s.safe,
  vector: topicVector(s),
})));

const BY_ID = new Map(LIBRARY.map((s) => [s.id, s]));

export function sparkById(id) {
  return BY_ID.get(id) || null;
}

export function librarySize() {
  return LIBRARY.length;
}

/*
 * The opening arc — the first seven days.
 *
 * These days are not chosen by the ranker. With no interaction history the
 * ranker would exploit the onboarding answers and serve seven variations of one
 * theme, which teaches it nothing and reads as narrow. The arc instead probes
 * deliberately: an unarguable win on day one, then each of the three types, then
 * a larger size, then a second category — so that by day seven there is real
 * signal on type, size and breadth rather than seven confirmations of the same
 * guess.
 *
 * Each slot is a filter, not a fixed spark, so the arc still respects the
 * user's goals, blocked topics and time budget.
 */
export const STARTER_ARC = [
  { type: 'action', size: 'micro', note: 'ניצחון מובטח' },
  { type: 'tip', size: 'micro', note: 'האם כלים עובדים עליו' },
  { type: 'quote', size: 'micro', note: 'האם תוכן מחשבתי עובד עליו' },
  { type: 'action', size: 'standard', note: 'סבילות למידה גדולה יותר' },
  { type: 'action', size: 'micro', freshCategory: true, note: 'רוחב נושאי' },
  { type: 'tip', size: 'standard', note: 'עומק' },
  { type: null, size: null, note: 'ניצול ראשון של מה שנלמד' },
];
