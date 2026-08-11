/*
 * taxonomy.js — the fixed vocabulary the whole app agrees on.
 *
 * Everything downstream keys off these lists: the onboarding chips, the profile
 * vector's dimensions, the bandit's feature layout, the retrieval filters and
 * the book's filter bar. They are here once so a new category is one edit and
 * not seven, and so the vector never silently changes length between a stored
 * profile and the code reading it.
 */

/* The twelve life areas a spark can belong to. Order is load-bearing: it is the
 * order of the category block in the bandit's feature vector, so appending is
 * safe and re-ordering would invalidate every stored model. Append only. */
export const CATEGORIES = [
  { key: 'movement', he: 'תנועה' },
  { key: 'focus', he: 'פוקוס' },
  { key: 'mindfulness', he: 'מיינדפולנס' },
  { key: 'creativity', he: 'יצירתיות' },
  { key: 'relationships', he: 'קשרים' },
  { key: 'order', he: 'סדר וארגון' },
  { key: 'learning', he: 'למידה' },
  { key: 'resilience', he: 'חוסן רגשי' },
  { key: 'gratitude', he: 'הכרת תודה' },
  { key: 'sleep', he: 'שינה ואנרגיה' },
  { key: 'money', he: 'כסף' },
  { key: 'courage', he: 'אומץ ויוזמה' },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

export function categoryLabel(key) {
  const c = CATEGORIES.find((x) => x.key === key);
  return c ? c.he : key;
}

/* Three kinds of spark. A thought reframes, an action is done, a tip is a
 * technique you can reuse. The split matters to the engine: some people act on
 * tips and skip quotes, and that is one of the first things the bandit learns. */
export const TYPES = [
  { key: 'quote', he: 'מחשבה' },
  { key: 'action', he: 'פעולה' },
  { key: 'tip', he: 'כלי' },
];

/*
 * Size is the app's real innovation, so it is a first-class dimension rather
 * than a tag: the same idea is delivered as sixty seconds or as fifteen minutes
 * depending on what the day can hold. `seconds` is what the built-in timer
 * counts and what the card advertises — an unstated time budget is the thing
 * that makes a suggestion easy to argue with.
 */
export const SIZES = [
  { key: 'micro', he: 'מיקרו', seconds: 60, maxEnergy: 1 },
  { key: 'standard', he: 'סטנדרט', seconds: 300, maxEnergy: 3 },
  { key: 'stretch', he: 'מתיחה', seconds: 900, maxEnergy: 4 },
];

export const SIZE_KEYS = SIZES.map((s) => s.key);

export function sizeOf(key) {
  return SIZES.find((s) => s.key === key) || SIZES[1];
}

/* The three time budgets offered in onboarding, and the largest size each one
 * allows. Someone who said "one minute" never sees a fifteen-minute walk. */
export const BUDGETS = [
  { minutes: 1, he: 'דקה', allows: ['micro'] },
  { minutes: 5, he: '5 דקות', allows: ['micro', 'standard'] },
  { minutes: 15, he: '15 דקות', allows: ['micro', 'standard', 'stretch'] },
];

export const TONES = [
  { key: 'gentle', he: 'עדין' },
  { key: 'direct', he: 'ישיר' },
  { key: 'humorous', he: 'הומוריסטי' },
  { key: 'stoic', he: 'סטואי' },
  { key: 'practical', he: 'פרקטי' },
];

export const TONE_KEYS = TONES.map((t) => t.key);

export function toneLabel(key) {
  const t = TONES.find((x) => x.key === key);
  return t ? t.he : key;
}

/*
 * Six moods, and — the part that actually does work — an `energy` ceiling and a
 * `fragile` flag on each.
 *
 * `fragile` is what enforces the anti-toxic-positivity rule. When it is set the
 * candidate pool is cut to micro-sized, gently-toned sparks and the challenge
 * lexicon is banned outright (safety.js). This is a hard filter and not a
 * ranking preference on purpose: a bad day is exactly when a "crush it today"
 * card does the most damage, and a soft preference would eventually let one
 * through.
 */
export const MOODS = [
  { key: 'energized', he: 'נמרץ', energy: 5, fragile: false },
  { key: 'calm', he: 'רגוע', energy: 4, fragile: false },
  { key: 'busy', he: 'עמוס', energy: 3, fragile: false },
  { key: 'tired', he: 'עייף', energy: 2, fragile: true },
  { key: 'overloaded', he: 'מוצף', energy: 1, fragile: true },
  { key: 'flat', he: 'שטוח', energy: 1, fragile: true },
];

export const MOOD_KEYS = MOODS.map((m) => m.key);

export function moodOf(key) {
  return MOODS.find((m) => m.key === key) || null;
}

export function isFragile(moodKey) {
  const m = moodOf(moodKey);
  return !!(m && m.fragile);
}

/*
 * The topic space.
 *
 * There is no embedding model in a static page, so semantic similarity is
 * computed in an explicit, hand-built topic space instead: every spark declares
 * its topics, the profile accumulates weights over the same axes, and cosine
 * similarity between the two is a real, inspectable number rather than a
 * pretend one. It is coarser than a learned embedding and it has one large
 * advantage here — "why this" can name the axis that matched.
 *
 * Append only, for the same reason as CATEGORIES: this is the vector's layout.
 */
export const TOPICS = [
  'movement', 'outdoors', 'posture', 'energy',
  'focus', 'procrastination', 'digital', 'productivity',
  'breathing', 'attention', 'calm',
  'creativity', 'writing', 'ideation',
  'relationships', 'connection', 'listening', 'family',
  'order', 'environment', 'decluttering',
  'learning', 'memory', 'curiosity',
  'resilience', 'control', 'self-compassion',
  'gratitude', 'noticing',
  'sleep', 'morning', 'evening',
  'money', 'spending',
  'courage', 'priorities', 'starting', 'boundaries',
  'self-care', 'basics',
];

export const TOPIC_INDEX = Object.fromEntries(TOPICS.map((t, i) => [t, i]));

/*
 * Goals the user picks in onboarding, each mapped onto the topic space.
 *
 * The mapping is what turns "I want to move more" into a retrievable direction
 * without asking the user to think in tags. A free-text goal falls back to
 * keyword matching over the same list (vector.js), so the two paths land in the
 * same space.
 */
export const GOALS = [
  { key: 'move_more', he: 'לזוז יותר', topics: ['movement', 'outdoors', 'energy'] },
  { key: 'less_screen', he: 'פחות מסכים', topics: ['digital', 'focus', 'attention'] },
  { key: 'focus_better', he: 'להתרכז טוב יותר', topics: ['focus', 'procrastination', 'productivity'] },
  { key: 'calmer', he: 'להיות רגוע יותר', topics: ['breathing', 'calm', 'attention'] },
  { key: 'sleep_better', he: 'לישון טוב יותר', topics: ['sleep', 'evening', 'energy'] },
  { key: 'create_more', he: 'ליצור יותר', topics: ['creativity', 'writing', 'ideation'] },
  { key: 'closer_people', he: 'להיות קרוב יותר לאנשים', topics: ['relationships', 'connection', 'listening'] },
  { key: 'more_order', he: 'יותר סדר', topics: ['order', 'environment', 'decluttering'] },
  { key: 'keep_learning', he: 'ללמוד כל הזמן', topics: ['learning', 'memory', 'curiosity'] },
  { key: 'be_kinder_to_self', he: 'להיות פחות קשה עם עצמי', topics: ['self-compassion', 'resilience', 'self-care'] },
  { key: 'spend_smarter', he: 'לנהל כסף טוב יותר', topics: ['money', 'spending'] },
  { key: 'start_things', he: 'להתחיל דברים שדחיתי', topics: ['starting', 'courage', 'procrastination'] },
];

export function goalLabel(key) {
  const g = GOALS.find((x) => x.key === key);
  return g ? g.he : key;
}

/* Interests are the categories themselves, weighted 0/1/2 — "לא" / "מעניין" /
 * "חשוב לי". Two levels of yes rather than one because a flat like/dislike
 * gives the ranker nothing to sort by once everything is liked. */
export const INTEREST_WEIGHTS = [
  { value: 2, he: 'חשוב לי' },
  { value: 1, he: 'מעניין' },
  { value: 0, he: 'לא' },
];

/* Reasons offered after "לא בשבילי". Each maps to a different correction, which
 * is the whole point of asking — a single thumbs-down cannot tell the engine
 * whether the topic was wrong or only the tone. */
export const REJECT_REASONS = [
  { key: 'irrelevant', he: 'לא רלוונטי' },
  { key: 'cliche', he: 'קלישאתי' },
  { key: 'too_much', he: 'יותר מדי היום' },
  { key: 'wrong_tone', he: 'לא הטון שלי' },
];
