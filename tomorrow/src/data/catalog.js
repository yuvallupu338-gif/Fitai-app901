/*
 * catalog.js — every enum token in the domain model, once, with the Hebrew
 * the user reads and the icon the UI draws.
 *
 * Tokens are English and live in the stored data; labels are Hebrew and live
 * only here. The rule this file exists to hold is that no view ever writes a
 * Hebrew label for a token itself. Two screens disagreeing about whether
 * `errand` reads "סידורים" or "מטלות" is the kind of bug nobody files and
 * everybody notices, and renaming a label afterwards means grepping Hebrew
 * across the UI to find every copy. Ask labelOf() instead.
 *
 * `glyph` is the `d` of one SVG path on a `0 0 24 24` viewBox, drawn to be
 * stroked — no fill, round caps and joins — so a single definition reads at
 * 16px in a chip and at 28px in a card without a second asset. A path string
 * rather than a built <svg> element is deliberate: src/data/** is imported by
 * the Node validator, which has no document to build elements with, and a
 * string survives that import where an element would not.
 *
 * `short` is the label with the noun it belongs to removed, for chips in a
 * column that is 390px wide on a phone. For most lists it is simply the label.
 * Energy and focus carry their noun in `label` because "גבוהה" standing alone
 * says nothing about which of the two levels it is describing.
 */

/*
 * A few glyphs are genuinely the same drawing in two lists — the same
 * briefcase means work whether it is the category on an item or the area the
 * user picked in onboarding. Naming them keeps the two in step: an icon set
 * where "work" is drawn two slightly different ways is a set that looks
 * home-made.
 */
const GLYPH_BRIEFCASE = 'M3 8h18v11H3z M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8 M3 13h18';
const GLYPH_CAP = 'M2 9l10-4.5L22 9l-10 4.5z M6.5 11.2V16c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-4.8';
const GLYPH_DUMBBELL = 'M3 10v4 M6.5 7v10 M17.5 7v10 M21 10v4 M6.5 12h11';
const GLYPH_MOON = 'M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z';
const GLYPH_TARGET = 'M12 20.5a8.5 8.5 0 1 1 0-17 8.5 8.5 0 0 1 0 17z M12 16.25a4.25 4.25 0 1 1 0-8.5 4.25 4.25 0 0 1 0 8.5z';

/** Item.type — what kind of thing this is, for the icon and the copy. */
export const ITEM_TYPES = [
  { token: 'task', label: 'משימה', short: 'משימה', glyph: 'M5 4h14v16H5z M8.5 12l2.5 2.5 4.5-5' },
  { token: 'event', label: 'אירוע', short: 'אירוע', glyph: 'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5' },
  { token: 'workout', label: 'אימון', short: 'אימון', glyph: GLYPH_DUMBBELL },
  { token: 'study', label: 'למידה', short: 'למידה', glyph: 'M4 5h5.5A2.5 2.5 0 0 1 12 7.5V20a2.5 2.5 0 0 0-2.5-2.5H4z M20 5h-5.5A2.5 2.5 0 0 0 12 7.5V20a2.5 2.5 0 0 1 2.5-2.5H20z' },
  { token: 'meeting', label: 'פגישה', short: 'פגישה', glyph: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16.5 6a3.5 3.5 0 0 1 0 7 M18 14.5a5.5 5.5 0 0 1 3.5 5.5' },
  { token: 'break', label: 'הפסקה', short: 'הפסקה', glyph: 'M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M17 10h1.5a2.5 2.5 0 0 1 0 5H17 M8 2v3 M12 2v3' },
  // Kept in the catalog because the timeline draws a sleep block, but no Item
  // is ever created with it — sleep is a property of the day (§3.3), and
  // makeItem turns this token into 'custom' if stored data claims otherwise.
  { token: 'sleep', label: 'שינה', short: 'שינה', glyph: GLYPH_MOON },
  { token: 'custom', label: 'אחר', short: 'אחר', glyph: 'M12 3.5l2.3 5.7 5.7 2.3-5.7 2.3L12 19.5l-2.3-5.7L4 11.5l5.7-2.3z' },
];

/** Item.category — what part of life it belongs to. Duration learning is per category. */
export const CATEGORIES = [
  { token: 'work', label: 'עבודה', short: 'עבודה', glyph: GLYPH_BRIEFCASE },
  { token: 'study', label: 'לימודים', short: 'לימודים', glyph: GLYPH_CAP },
  { token: 'fitness', label: 'כושר', short: 'כושר', glyph: 'M13.5 5.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z M10.5 22l2-6-3-2.5 1-5.5 3 3.5 3.5 1 M5.5 13l4-4 M12.5 16l3.5 1.5 1 4.5' },
  { token: 'personal', label: 'אישי', short: 'אישי', glyph: 'M12 12.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5z M3.5 21a8.5 8.5 0 0 1 17 0' },
  { token: 'errand', label: 'סידורים', short: 'סידורים', glyph: 'M5 7.5h14l-1.2 12.5H6.2z M9 7.5V5.5a3 3 0 0 1 6 0v2' },
  { token: 'social', label: 'חברתי', short: 'חברתי', glyph: 'M3 5h13v8.5H7.5L3 17z M19 9.5h2v10l-3.5-3H10v-3' },
  { token: 'health', label: 'בריאות', short: 'בריאות', glyph: 'M12 20.5S3.5 15 3.5 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8.5 2.5c0 5.5-8.5 11-8.5 11z M4.5 12.5h3.5l1.5-3 2.5 6 1.5-3h5' },
  { token: 'other', label: 'אחר', short: 'אחר', glyph: 'M6 12h.01 M12 12h.01 M18 12h.01' },
];

/*
 * Item.priority. The first three are bars that grow, which reads as a scale.
 * Critical breaks the pattern on purpose: it is not one notch above high, it
 * is the thing the whole day bends around, and an icon that looked like the
 * next bar along would let it pass unnoticed in a list.
 */
export const PRIORITIES = [
  { token: 'low', label: 'נמוכה', short: 'נמוכה', glyph: 'M5 16.5h3.5V20H5z' },
  { token: 'medium', label: 'בינונית', short: 'בינונית', glyph: 'M5 16.5h3.5V20H5z M10.25 12.5h3.5V20h-3.5z' },
  { token: 'high', label: 'גבוהה', short: 'גבוהה', glyph: 'M5 16.5h3.5V20H5z M10.25 12.5h3.5V20h-3.5z M15.5 8.5H19V20h-3.5z' },
  { token: 'critical', label: 'קריטית', short: 'קריטית', glyph: 'M12 3.5l9.5 17H2.5z M12 10v4.5 M12 17.5h.01' },
];

/** Item.energyRequirement — how much of the tank this asks for. */
export const ENERGY_LEVELS = [
  { token: 'low', label: 'אנרגיה נמוכה', short: 'נמוכה', glyph: 'M2.5 8h14.5v8H2.5z M20 11v2 M4.5 10h2.5v4H4.5z' },
  { token: 'medium', label: 'אנרגיה בינונית', short: 'בינונית', glyph: 'M2.5 8h14.5v8H2.5z M20 11v2 M4.5 10h6.5v4H4.5z' },
  { token: 'high', label: 'אנרגיה גבוהה', short: 'גבוהה', glyph: 'M2.5 8h14.5v8H2.5z M20 11v2 M4.5 10h10.5v4H4.5z' },
];

/** Item.focusRequirement — how much uninterrupted attention this asks for. */
export const FOCUS_LEVELS = [
  { token: 'low', label: 'ריכוז נמוך', short: 'נמוך', glyph: 'M12 20.5a8.5 8.5 0 1 1 0-17 8.5 8.5 0 0 1 0 17z' },
  { token: 'medium', label: 'ריכוז בינוני', short: 'בינוני', glyph: GLYPH_TARGET },
  { token: 'high', label: 'ריכוז גבוה', short: 'גבוה', glyph: GLYPH_TARGET + ' M12 12h.01' },
];

/*
 * Item.preferredTime. Sunrise and sunset are the same drawing apart from the
 * arrow through the sun: up for morning, down for evening. Two crescents or
 * two suns would have been prettier and unreadable at 16px.
 */
export const PREFERRED_TIMES = [
  { token: 'morning', label: 'בוקר', short: 'בוקר', glyph: 'M3 19h18 M7.5 19a4.5 4.5 0 0 1 9 0 M12 3v5 M9.5 5.5L12 3l2.5 2.5 M4.5 11l1.5 1.5 M19.5 11L18 12.5' },
  { token: 'afternoon', label: 'אחר הצהריים', short: 'צהריים', glyph: 'M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z M12 2v2.5 M12 19.5V22 M2 12h2.5 M19.5 12H22 M5 5l1.75 1.75 M17.25 17.25L19 19 M19 5l-1.75 1.75 M6.75 17.25L5 19' },
  { token: 'evening', label: 'ערב', short: 'ערב', glyph: 'M3 19h18 M7.5 19a4.5 4.5 0 0 1 9 0 M12 3v5 M9.5 5.5L12 8l2.5-2.5 M4.5 11l1.5 1.5 M19.5 11L18 12.5' },
  { token: 'any', label: 'לא משנה', short: 'גמיש', glyph: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z M12 7v5.5l3.5 2' },
];

/*
 * Profile.priorities — what the user said matters, asked once during
 * onboarding. These are areas of life, not item categories, which is why the
 * list is not CATEGORIES: nobody files a task under "sleep" or "focus", but
 * plenty of people want the day arranged around them.
 */
export const PRIORITY_AREAS = [
  { token: 'work', label: 'עבודה', short: 'עבודה', glyph: GLYPH_BRIEFCASE },
  { token: 'school', label: 'לימודים', short: 'לימודים', glyph: GLYPH_CAP },
  { token: 'fitness', label: 'כושר', short: 'כושר', glyph: GLYPH_DUMBBELL },
  { token: 'sleep', label: 'שינה', short: 'שינה', glyph: GLYPH_MOON },
  { token: 'focus', label: 'ריכוז', short: 'ריכוז', glyph: GLYPH_TARGET },
  { token: 'projects', label: 'פרויקטים אישיים', short: 'פרויקטים', glyph: 'M4 4h7v7H4z M13 4h7v4.5h-7z M13 11h7v9h-7z M4 13.5h7V20H4z' },
  { token: 'freetime', label: 'זמן פנוי', short: 'זמן פנוי', glyph: 'M3.5 13.5a2 2 0 0 1 4 0V16h9v-2.5a2 2 0 0 1 4 0V20h-17z M6 13V9a2.5 2.5 0 0 1 2.5-2.5h7A2.5 2.5 0 0 1 18 9v4' },
  { token: 'habits', label: 'הרגלים', short: 'הרגלים', glyph: 'M17 4.5l3 3-3 3 M20 7.5H9A4.5 4.5 0 0 0 9 16.5h.5 M7 19.5l-3-3 3-3 M4 16.5h11a4.5 4.5 0 0 0 0-9h-.5' },
];

/*
 * DayRecord.review.tags — the end-of-day question, answered with a tap.
 *
 * The full labels are first-person sentences because that is how the question
 * is asked ("איך היה היום?") and a bare adjective under it reads like a
 * grade. `short` is what a history row has space for.
 */
export const REVIEW_TAGS = [
  { token: 'more_tired', label: 'הייתי עייף יותר מהצפוי', short: 'עייף יותר', glyph: 'M12 4v13 M7 12.5l5 5 5-5' },
  { token: 'more_energetic', label: 'הייתה לי יותר אנרגיה מהצפוי', short: 'אנרגטי יותר', glyph: 'M12 20V7 M7 11.5l5-5 5 5' },
  { token: 'tasks_longer', label: 'המשימות לקחו יותר זמן', short: 'לקח יותר זמן', glyph: 'M2 12h20 M6.5 7.5L2 12l4.5 4.5 M17.5 7.5L22 12l-4.5 4.5' },
  { token: 'tasks_shorter', label: 'המשימות לקחו פחות זמן', short: 'לקח פחות זמן', glyph: 'M2 12h20 M7 7.5L11.5 12 7 16.5 M17 7.5L12.5 12l4.5 4.5' },
  { token: 'unexpected_event', label: 'קרה משהו לא צפוי', short: 'לא צפוי', glyph: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z M12 7.5v5.5 M12 16.5h.01' },
  { token: 'accurate', label: 'התחזית הייתה מדויקת', short: 'מדויק', glyph: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z M8 12l2.75 2.75L16.5 9' },
];

/** The entry for a token, or null. Every other lookup is built on this one. */
export function optionOf(list, token) {
  if (!Array.isArray(list)) return null;
  for (const option of list) {
    if (option && option.token === token) return option;
  }
  return null;
}

/*
 * The Hebrew for a token.
 *
 * An unknown token comes back as itself rather than as an empty string. It
 * should be impossible — normalizeRoot() coerces every enum field to a token
 * in these lists before the UI sees it — so if one ever surfaces, the cause is
 * data that drifted ahead of this file, and a screen showing `errand_urgent`
 * in Latin letters is a bug report. A blank chip is a mystery.
 */
export function labelOf(list, token) {
  const option = optionOf(list, token);
  return option ? option.label : String(token === null || token === undefined ? '' : token);
}

/** The label with its noun trimmed, for narrow chips. Same fallback as labelOf. */
export function shortOf(list, token) {
  const option = optionOf(list, token);
  return option ? option.short : labelOf(list, token);
}

/** The SVG path `d` for a token, or '' so a caller can skip drawing the icon. */
export function glyphOf(list, token) {
  const option = optionOf(list, token);
  return option ? option.glyph : '';
}

/** Just the tokens, in catalog order — for building a picker or a default. */
export function tokensOf(list) {
  return Array.isArray(list) ? list.map((option) => option.token) : [];
}

/** Whether a value is one of this list's tokens. Used by the schema to coerce. */
export function isToken(list, token) {
  return optionOf(list, token) !== null;
}
