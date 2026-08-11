/*
 * journeys.js — multi-day arcs.
 *
 * A journey is written as a sequence of *constraints*, not as a fixed list of
 * spark ids. Each day says "something from sleep, micro-sized" and the ordinary
 * selector picks the actual item.
 *
 * That indirection is the whole design, and it buys three things a hard-coded
 * playlist cannot:
 *
 *   - The journey still respects everything else. A blocked topic, a one-minute
 *     budget, a fragile mood — all of it still applies, because the same filter
 *     chain runs. A fixed id list would have to either ignore those or
 *     re-implement them.
 *   - Two people on the same journey do not get identical days, and the same
 *     person can run it twice a year without repeating.
 *   - Adding sparks improves every existing journey for free.
 *
 * The cost is that a journey cannot depend on a specific piece of text on a
 * specific day. That is the right trade for this product: the arc is about the
 * shape of a fortnight, not about one perfect sentence on day nine.
 */

/*
 * Journeys never push on a bad day.
 *
 * When the mood check-in is fragile the day is served from the ordinary safe
 * pool and the journey simply does not advance (see select.js). It waits. A
 * fourteen-day programme that demands day six from someone who is barely
 * holding together is the thing that makes people quit programmes — and then
 * quit the app that ran them.
 */

export const JOURNEYS = [
  {
    slug: 'sleep7',
    title: 'שבוע של לילות טובים יותר',
    subtitle: 'שבעה ערבים, כל אחד עם שינוי אחד קטן.',
    days: 7,
    effort: 1,
    steps: [
      { category: 'sleep', size: 'micro' },
      { category: 'sleep', size: 'micro' },
      { category: 'order', size: 'micro' },
      { category: 'sleep', size: 'standard' },
      { category: 'mindfulness', size: 'micro' },
      { category: 'sleep', size: 'micro' },
      { category: 'sleep', size: 'standard' },
    ],
  },
  {
    slug: 'phone14',
    title: 'שבועיים פחות טלפון',
    subtitle: 'לא לגמול. רק להחזיר את ההחלטה אליך.',
    days: 14,
    effort: 2,
    steps: [
      { category: 'focus', size: 'micro' },
      { category: 'mindfulness', size: 'micro' },
      { category: 'focus', size: 'micro' },
      { category: 'order', size: 'micro' },
      { category: 'focus', size: 'standard' },
      { category: 'mindfulness', size: 'micro' },
      { category: 'relationships', size: 'micro' },
      { category: 'focus', size: 'micro' },
      { category: 'sleep', size: 'micro' },
      { category: 'focus', size: 'standard' },
      { category: 'mindfulness', size: 'standard' },
      { category: 'focus', size: 'micro' },
      { category: 'creativity', size: 'standard' },
      { category: 'focus', size: 'stretch' },
    ],
  },
  {
    slug: 'write14',
    title: 'לחזור לכתוב',
    subtitle: 'ארבעה עשר ימים של להתחיל, לא של להצליח.',
    days: 14,
    effort: 2,
    steps: [
      { category: 'creativity', size: 'micro' },
      { category: 'creativity', size: 'micro' },
      { category: 'focus', size: 'micro' },
      { category: 'creativity', size: 'standard' },
      { category: 'creativity', size: 'micro' },
      { category: 'learning', size: 'standard' },
      { category: 'creativity', size: 'standard' },
      { category: 'resilience', size: 'micro' },
      { category: 'creativity', size: 'micro' },
      { category: 'creativity', size: 'standard' },
      { category: 'focus', size: 'standard' },
      { category: 'creativity', size: 'micro' },
      { category: 'courage', size: 'micro' },
      { category: 'creativity', size: 'stretch' },
    ],
  },
  {
    slug: 'move7',
    title: 'שבוע של תנועה',
    subtitle: 'בלי חדר כושר ובלי בגדים מיוחדים.',
    days: 7,
    effort: 2,
    steps: [
      { category: 'movement', size: 'micro' },
      { category: 'movement', size: 'micro' },
      { category: 'movement', size: 'standard' },
      { category: 'mindfulness', size: 'micro' },
      { category: 'movement', size: 'standard' },
      { category: 'movement', size: 'micro' },
      { category: 'movement', size: 'stretch' },
    ],
  },
  {
    slug: 'calm7',
    title: 'שבוע רגוע יותר',
    subtitle: 'לא להירגע. לשים לב.',
    days: 7,
    effort: 1,
    steps: [
      { category: 'mindfulness', size: 'micro' },
      { category: 'mindfulness', size: 'micro' },
      { category: 'resilience', size: 'micro' },
      { category: 'mindfulness', size: 'standard' },
      { category: 'gratitude', size: 'micro' },
      { category: 'mindfulness', size: 'micro' },
      { category: 'mindfulness', size: 'standard' },
    ],
  },
  {
    slug: 'people7',
    title: 'לחזור לאנשים',
    subtitle: 'שבעה קשרים שנשחקו בשקט.',
    days: 7,
    effort: 1,
    steps: [
      { category: 'relationships', size: 'micro' },
      { category: 'gratitude', size: 'micro' },
      { category: 'relationships', size: 'micro' },
      { category: 'relationships', size: 'standard' },
      { category: 'courage', size: 'micro' },
      { category: 'relationships', size: 'micro' },
      { category: 'relationships', size: 'standard' },
    ],
  },
  {
    slug: 'restart7',
    title: 'חזרה אחרי הפסקה',
    subtitle: 'הכל מיקרו. בכוונה.',
    days: 7,
    effort: 1,
    gentle: true,
    steps: [
      { category: 'resilience', size: 'micro' },
      { category: 'movement', size: 'micro' },
      { category: 'order', size: 'micro' },
      { category: 'gratitude', size: 'micro' },
      { category: 'mindfulness', size: 'micro' },
      { category: 'resilience', size: 'micro' },
      { category: 'movement', size: 'micro' },
    ],
  },
  {
    slug: 'order14',
    title: 'שבועיים של סדר',
    subtitle: 'מגירה אחת ביום. לא בית.',
    days: 14,
    effort: 2,
    steps: [
      { category: 'order', size: 'micro' },
      { category: 'order', size: 'micro' },
      { category: 'order', size: 'standard' },
      { category: 'order', size: 'micro' },
      { category: 'money', size: 'micro' },
      { category: 'order', size: 'standard' },
      { category: 'order', size: 'micro' },
      { category: 'focus', size: 'micro' },
      { category: 'order', size: 'standard' },
      { category: 'order', size: 'micro' },
      { category: 'order', size: 'standard' },
      { category: 'money', size: 'standard' },
      { category: 'order', size: 'micro' },
      { category: 'order', size: 'stretch' },
    ],
  },
];

export function journeyBySlug(slug) {
  return JOURNEYS.find((j) => j.slug === slug) || null;
}

export const EFFORT_LABEL = { 1: 'קל', 2: 'בינוני', 3: 'תובעני' };
