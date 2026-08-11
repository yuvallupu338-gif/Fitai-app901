/*
 * safety.js — the gate every spark passes through before it is delivered.
 *
 * Two jobs, and they are different in kind.
 *
 * The first is the fragile-mood rule. When someone reports being overwhelmed,
 * flat or exhausted, the candidate pool is cut to micro-sized, gently-toned,
 * explicitly-marked-safe items and the challenge lexicon is banned. This is a
 * hard filter rather than a ranking penalty on purpose: a bad day is exactly
 * when a "crush it today" card does the most damage, and a soft preference is
 * one unlucky sample away from letting one through.
 *
 * The second is the content check on generated or reframed text. The framing
 * layer rewrites copy, and a rewrite is exactly where a medical claim or a
 * shaming imperative can appear in text a human reviewed in its original form.
 * Anything that fails is not shown; the caller falls back to the unframed
 * spark, and if that fails too, to an evergreen item.
 *
 * Everything here fails closed. An uncertain result is a block.
 */

import { isFragile } from '../data/taxonomy.js';

/*
 * The challenge lexicon — words that turn a suggestion into a demand.
 *
 * Banned outright on fragile days. Written as substrings because Hebrew
 * inflects: "תכבוש", "כובש", "לכבוש" all have to be caught by one entry.
 */
const CHALLENGE = [
  'כבוש', 'לכבוש', 'תתגבר', 'להתגבר', 'בלי תירוצים', 'תירוצים',
  'תתאמץ', 'להתאמץ', 'תילחם', 'להילחם', 'תדחוף', 'לדחוף את עצמך',
  'אין זמן ל', 'תפסיק להתעצל', 'עצלן', 'חלש', 'תוכיח',
  'אתגר את עצמך', 'צא מאזור הנוחות', 'בלי רחמים',
];

/*
 * Claims we do not make, ever — not on good days either.
 *
 * The app is not a clinician and must not read like one. This list is short
 * because it is a backstop: the library was written not to need it, and the
 * point of running it on every delivery is to catch the case where a rewrite
 * introduced something the original did not say.
 */
const MEDICAL = [
  'מרפא', 'ריפוי', 'מונע מחל', 'מוריד לחץ דם', 'מוריד קורטיזול', 'קורטיזול',
  'דיכאון', 'חרדה קלינית', 'מאובחן', 'אבחנה', 'תרופ', 'מינון', 'תוסף',
  'יריד במשקל', 'לרזות', 'קלוריות', 'דיאט', 'שריפת שומן', 'צום ממושך',
];

/* Superlative promises. "This will change your life" is the exact register the
 * product is built against. */
const OVERPROMISE = [
  'ישנה את חייך', 'לשנות את החיים', 'תוך שבוע תהיה', 'מובטח לך',
  'הסוד ל', 'הדרך היחידה', 'כל מה שצריך זה',
];

/* Clichés. Not dangerous, just the thing that makes an inspiration app feel
 * like every other inspiration app. Caught here so the framing layer cannot
 * reintroduce one while "warming up" a line. */
const CLICHE = [
  'השמיים הם הגבול', 'תאמין בעצמך', 'כל יום הוא הזדמנות חדשה',
  'הכל בראש שלך', 'אם תרצה תוכל', 'החיים יפים', 'תחשוב חיובי',
];

function containsAny(text, list) {
  const t = String(text || '');
  return list.find((w) => t.includes(w)) || null;
}

/*
 * May this spark be delivered to someone in this mood?
 *
 * Note that the answer depends only on the spark and the mood — not on the
 * ranker's opinion of it. That separation is the whole safety property: no
 * score can promote an item past this function.
 */
export function allowedForMood(spark, moodKey) {
  if (!moodKey || !isFragile(moodKey)) return true;
  if (!spark.safe) return false;
  if (spark.size !== 'micro') return false;
  if (spark.tone !== 'gentle' && spark.tone !== 'practical') return false;
  if (containsAny(`${spark.title} ${spark.body} ${spark.action}`, CHALLENGE)) return false;
  /* Areas that are fine on an ordinary day and wrong on a hard one. Money means
   * opening a bank app; courage means being told to do the thing you are
   * avoiding, which on a flat day is not encouragement. */
  if (['money', 'courage', 'learning'].includes(spark.category)) return false;
  return true;
}

/** Length limits, mirrored from the library's own contract. */
const LIMITS = { title: 42, body: 220, action: 90 };

/*
 * Check a piece of copy that is about to be shown.
 *
 * Returns { ok: true } or { ok: false, check, hit } — the check name goes into
 * the counter shown in settings, because a gate nobody can observe is a gate
 * nobody will notice has broken.
 */
export function checkCopy(copy, opts) {
  const o = opts || {};
  for (const field of ['title', 'body', 'action']) {
    const value = copy[field];
    if (!value || !String(value).trim()) return { ok: false, check: 'empty', hit: field };
    if (String(value).length > LIMITS[field]) return { ok: false, check: 'length', hit: field };
  }

  const all = `${copy.title} ${copy.body} ${copy.action}`;

  const med = containsAny(all, MEDICAL);
  if (med) return { ok: false, check: 'medical', hit: med };

  const over = containsAny(all, OVERPROMISE);
  if (over) return { ok: false, check: 'overpromise', hit: over };

  const cliche = containsAny(all, CLICHE);
  if (cliche) return { ok: false, check: 'cliche', hit: cliche };

  if (o.fragile) {
    const ch = containsAny(all, CHALLENGE);
    if (ch) return { ok: false, check: 'challenge_on_fragile', hit: ch };
    /* Exclamation marks are volume. On a hard day the app should not raise its
     * voice, and this is the cheapest possible way to enforce that. */
    if (all.includes('!')) return { ok: false, check: 'exclamation_on_fragile', hit: '!' };
  }

  return { ok: true };
}

/*
 * The support card trigger.
 *
 * Deliberately conservative: five fragile check-ins out of the last seven days.
 * A lower threshold would fire on an ordinary rough week, and a card that shows
 * up when it is not needed is a card that gets dismissed unread when it is.
 *
 * This never diagnoses and never mentions what was observed. It offers phone
 * numbers and gets out of the way.
 */
export function shouldOfferSupport(recentMoods) {
  const last7 = (recentMoods || []).slice(-7);
  if (last7.length < 5) return false;
  const fragile = last7.filter((m) => isFragile(m)).length;
  return fragile >= 5;
}

/* Cooling-off between offers, in days. */
export const SUPPORT_COOLDOWN_DAYS = 14;

/*
 * Local help lines. Israel first because that is the launch locale; the last
 * entry is the international directory so the card is never empty for someone
 * abroad. Kept as data so it can be corrected without touching logic — these
 * numbers change, and a stale one is worse than none.
 */
export const HELPLINES = [
  { name: 'ער"ן — עזרה ראשונה נפשית', detail: '1201', href: 'tel:1201' },
  { name: 'סה"ר — סיוע והקשבה ברשת', detail: 'צ׳אט מקוון', href: 'https://www.sahar.org.il' },
  { name: 'נט"ל', detail: '1-800-363-363', href: 'tel:1800363363' },
  { name: 'מדריך בינלאומי', detail: 'findahelpline.com', href: 'https://findahelpline.com' },
];
