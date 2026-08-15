/*
 * looks.js — what customers ask for.
 *
 * A look is a list of wants and a list of things to avoid. A want names a
 * category, and optionally a finish and a colour family, and says how much of
 * the zone should end up covered. That is deliberately not "apply product X":
 * the customer says "a matte red lip", the shop stocks four matte reds, and
 * choosing between them is the game.
 *
 * `weight` is how much of the customer's opinion that one want is worth.
 * `avoid` is what makes a look a look rather than a checklist — the daytime
 * request is defined as much by the glitter that must not appear on it as by
 * the mascara that must.
 */

export const LOOKS = [
  {
    id: 'natural',
    he: 'טבעי ליום',
    brief: 'משהו קליל. שאראה כמו עצמי, רק אחרי שינה טובה.',
    pay: 120,
    difficulty: 1,
    wants: [
      { cat: 'foundation', finish: ['dewy', 'satin'], coverage: 0.55, weight: 1.3 },
      { cat: 'blush', family: ['peach', 'rose', 'nude', 'pink'], coverage: 0.45, weight: 1.0 },
      { cat: 'brow', coverage: 0.45, weight: 0.7 },
      { cat: 'mascara', coverage: 0.60, weight: 0.9 },
      { cat: 'lipstick', finish: ['satin'], family: ['nude', 'rose', 'peach'], coverage: 0.70, weight: 1.2 },
    ],
    avoid: [
      { cat: 'eyeshadow', finish: 'shimmer', why: 'נצנצים בעשר בבוקר זה הרבה' },
      { cat: 'lipstick', family: ['red', 'plum', 'berry'], why: 'כהה מדי ליום' },
      { cat: 'highlighter', why: 'אני לא רוצה לזהור, אני רוצה להיראות רגילה' },
    ],
  },
  {
    id: 'office',
    he: 'משרדי מוקפד',
    brief: 'יש לי מצגת להנהלה. מקצועי, לא צעקני.',
    pay: 150,
    difficulty: 2,
    wants: [
      { cat: 'foundation', finish: ['matte'], coverage: 0.70, weight: 1.2 },
      { cat: 'powder', coverage: 0.45, weight: 0.8 },
      { cat: 'brow', coverage: 0.60, weight: 1.0 },
      { cat: 'eyeshadow', finish: ['matte'], family: ['taupe', 'nude', 'brown'], coverage: 0.55, weight: 1.1 },
      { cat: 'mascara', coverage: 0.70, weight: 0.9 },
      { cat: 'lipstick', finish: ['matte', 'satin'], family: ['nude', 'rose', 'brown'], coverage: 0.75, weight: 1.1 },
    ],
    avoid: [
      { cat: 'gloss', why: 'גלוס נדבק לשיער באמצע משפט' },
      { cat: 'lipstick', finish: 'metallic', why: 'מתכתי בישיבה זה מוזר' },
    ],
  },
  {
    id: 'evening',
    he: 'ערב חגיגי',
    brief: 'חתונה של חברה. אני רוצה להיראות מדהים בלי לגנוב את ההצגה.',
    pay: 220,
    difficulty: 3,
    wants: [
      { cat: 'foundation', coverage: 0.80, weight: 1.1 },
      { cat: 'concealer', coverage: 0.55, weight: 0.8 },
      { cat: 'contour', coverage: 0.50, weight: 0.9 },
      { cat: 'blush', coverage: 0.50, weight: 0.8 },
      { cat: 'highlighter', coverage: 0.45, weight: 0.9 },
      { cat: 'eyeshadow', finish: ['shimmer'], family: ['champagne', 'bronze', 'gold'], coverage: 0.65, weight: 1.3 },
      { cat: 'liner', coverage: 0.60, weight: 1.0 },
      { cat: 'mascara', coverage: 0.80, weight: 1.0 },
      { cat: 'lipstick', finish: ['satin', 'matte'], family: ['rose', 'berry', 'nude'], coverage: 0.80, weight: 1.1 },
    ],
    avoid: [
      { cat: 'lipstick', family: ['red'], why: 'אדום זה של הכלה היום' },
    ],
  },
  {
    id: 'redcarpet',
    he: 'שפתיים אדומות',
    brief: 'אדום. מאט. חד. אני יודעת בדיוק מה אני רוצה.',
    pay: 200,
    difficulty: 3,
    wants: [
      { cat: 'foundation', finish: ['matte'], coverage: 0.80, weight: 1.0 },
      { cat: 'powder', coverage: 0.50, weight: 0.7 },
      { cat: 'brow', coverage: 0.60, weight: 0.8 },
      { cat: 'liner', coverage: 0.65, weight: 1.0 },
      { cat: 'mascara', coverage: 0.75, weight: 0.8 },
      { cat: 'lipstick', finish: ['matte'], family: ['red'], coverage: 0.90, weight: 2.2 },
    ],
    avoid: [
      { cat: 'gloss', why: 'גלוס על האדום הורס לי את הקו' },
      { cat: 'eyeshadow', finish: 'shimmer', why: 'העיניים צריכות להיות שקטות' },
    ],
  },
  {
    id: 'glam',
    he: 'גלאם נוצץ',
    brief: 'יש לי מסיבה. אני רוצה שיראו אותי מהצד השני של האולם.',
    pay: 260,
    difficulty: 4,
    wants: [
      { cat: 'foundation', coverage: 0.85, weight: 1.0 },
      { cat: 'concealer', coverage: 0.60, weight: 0.8 },
      { cat: 'contour', coverage: 0.60, weight: 1.0 },
      { cat: 'highlighter', coverage: 0.60, weight: 1.3 },
      { cat: 'eyeshadow', finish: ['shimmer'], coverage: 0.75, weight: 1.4 },
      { cat: 'liner', coverage: 0.70, weight: 1.1 },
      { cat: 'mascara', coverage: 0.85, weight: 1.0 },
      { cat: 'lipstick', finish: ['metallic', 'gloss', 'satin'], coverage: 0.85, weight: 1.2 },
    ],
    avoid: [],
  },
  {
    id: 'dewy',
    he: 'זוהר קוריאני',
    brief: 'עור. שיראו עור. כאילו שתיתי שלושה ליטר מים ביום.',
    pay: 180,
    difficulty: 3,
    wants: [
      { cat: 'prep', coverage: 0.55, weight: 0.9 },
      { cat: 'foundation', finish: ['dewy'], coverage: 0.55, weight: 1.6 },
      { cat: 'blush', finish: ['dewy'], family: ['peach', 'pink', 'nude'], coverage: 0.50, weight: 1.2 },
      { cat: 'highlighter', coverage: 0.50, weight: 1.1 },
      { cat: 'brow', coverage: 0.45, weight: 0.6 },
      { cat: 'gloss', coverage: 0.75, weight: 1.2 },
    ],
    avoid: [
      { cat: 'powder', why: 'פודרה הורגת בדיוק את מה שביקשתי' },
      { cat: 'foundation', finish: 'matte', why: 'מאט זה ההפך הגמור' },
    ],
  },
  {
    id: 'smokey',
    he: 'מבט מעושן',
    brief: 'עיניים כהות, שפתיים שקטות. דרמה אחת מספיקה.',
    pay: 210,
    difficulty: 4,
    wants: [
      { cat: 'foundation', coverage: 0.75, weight: 1.0 },
      { cat: 'eyeshadow', finish: ['matte'], family: ['smoke', 'brown', 'plum', 'taupe'], coverage: 0.80, weight: 1.8 },
      { cat: 'liner', coverage: 0.75, weight: 1.3 },
      { cat: 'mascara', coverage: 0.85, weight: 1.1 },
      { cat: 'brow', coverage: 0.55, weight: 0.7 },
      { cat: 'lipstick', family: ['nude', 'rose', 'brown'], coverage: 0.70, weight: 1.0 },
    ],
    avoid: [
      { cat: 'lipstick', family: ['red', 'berry'], why: 'גם עיניים וגם שפתיים? לא' },
      { cat: 'blush', coverage: 0.75, why: 'סומק חזק מעל עשן זה יותר מדי' },
    ],
  },
  {
    id: 'summer',
    he: 'ברונזה קיצית',
    brief: 'חוזרת מהים בעוד שעתיים. תעשי לי שזוף שלא ירד.',
    pay: 165,
    difficulty: 2,
    wants: [
      { cat: 'foundation', finish: ['dewy', 'satin'], coverage: 0.50, weight: 0.9 },
      { cat: 'contour', family: ['bronze'], coverage: 0.65, weight: 1.5 },
      { cat: 'blush', family: ['coral', 'peach'], coverage: 0.50, weight: 1.1 },
      { cat: 'highlighter', family: ['gold', 'champagne'], coverage: 0.45, weight: 0.9 },
      { cat: 'gloss', family: ['peach', 'clear', 'pink'], coverage: 0.70, weight: 1.0 },
    ],
    avoid: [
      { cat: 'lipstick', family: ['plum', 'berry'], why: 'כהה מדי לקיץ' },
    ],
  },
  {
    id: 'bridal',
    he: 'כלה',
    brief: 'אני מתחתנת בשש. אני צריכה שזה יחזיק עד שתיים בלילה ויצא טוב בתמונות.',
    pay: 320,
    difficulty: 5,
    wants: [
      { cat: 'prep', coverage: 0.60, weight: 1.0 },
      { cat: 'foundation', coverage: 0.85, weight: 1.4 },
      { cat: 'concealer', coverage: 0.70, weight: 1.1 },
      { cat: 'powder', coverage: 0.60, weight: 1.0 },
      { cat: 'contour', coverage: 0.55, weight: 0.9 },
      { cat: 'blush', family: ['rose', 'peach', 'nude'], coverage: 0.55, weight: 1.0 },
      { cat: 'highlighter', coverage: 0.45, weight: 0.9 },
      { cat: 'brow', coverage: 0.65, weight: 1.0 },
      { cat: 'eyeshadow', family: ['nude', 'champagne', 'taupe', 'bronze'], coverage: 0.70, weight: 1.3 },
      { cat: 'liner', coverage: 0.55, weight: 0.9 },
      { cat: 'mascara', coverage: 0.85, weight: 1.0 },
      { cat: 'lipstick', finish: ['satin', 'matte'], family: ['rose', 'nude'], coverage: 0.85, weight: 1.3 },
    ],
    avoid: [
      { cat: 'lipstick', family: ['red', 'plum'], why: 'לא בחתונה שלי' },
      { cat: 'eyeshadow', family: ['blue', 'green'], why: 'זה יישאר בתמונות לנצח' },
    ],
  },
  {
    id: 'teen',
    he: 'נעורים עדין',
    brief: 'זאת המסיבת סיום שלי. שיהיה יפה אבל שאמא לא תגיד שזה יותר מדי.',
    pay: 110,
    difficulty: 1,
    wants: [
      { cat: 'foundation', coverage: 0.40, weight: 0.8 },
      { cat: 'blush', family: ['pink', 'peach', 'rose'], coverage: 0.45, weight: 1.1 },
      { cat: 'mascara', coverage: 0.65, weight: 1.0 },
      { cat: 'gloss', coverage: 0.70, weight: 1.2 },
    ],
    avoid: [
      { cat: 'contour', why: 'קונטור בגיל שש עשרה זה תחפושת' },
      { cat: 'lipstick', finish: 'matte', family: ['red', 'plum', 'berry'], why: 'אמא תהרוג אותי' },
      { cat: 'foundation', coverage: 0.85, why: 'זה כבד מדי על הפנים שלי' },
    ],
  },
  {
    id: 'photo',
    he: 'צילומי סטודיו',
    brief: 'יש לי צילומים לפרופיל. המצלמה אוכלת חצי מהאיפור, אז תעשי חזק.',
    pay: 240,
    difficulty: 4,
    wants: [
      { cat: 'foundation', finish: ['matte'], coverage: 0.85, weight: 1.2 },
      { cat: 'concealer', coverage: 0.70, weight: 1.0 },
      { cat: 'powder', coverage: 0.65, weight: 1.2 },
      { cat: 'contour', coverage: 0.65, weight: 1.2 },
      { cat: 'brow', coverage: 0.70, weight: 1.1 },
      { cat: 'eyeshadow', finish: ['matte'], coverage: 0.70, weight: 1.0 },
      { cat: 'liner', coverage: 0.70, weight: 1.0 },
      { cat: 'mascara', coverage: 0.85, weight: 1.0 },
      { cat: 'lipstick', coverage: 0.85, weight: 1.0 },
    ],
    avoid: [
      { cat: 'highlighter', coverage: 0.70, why: 'הפלאש יהפוך את זה למראה' },
    ],
  },
  {
    id: 'date',
    he: 'דייט ראשון',
    brief: 'נפגשת עם מישהו בשמונה. שיראה אותי, לא את האיפור.',
    pay: 155,
    difficulty: 2,
    wants: [
      { cat: 'foundation', finish: ['satin', 'dewy'], coverage: 0.60, weight: 1.0 },
      { cat: 'blush', coverage: 0.55, weight: 1.1 },
      { cat: 'eyeshadow', family: ['nude', 'taupe', 'champagne', 'brown'], coverage: 0.55, weight: 1.0 },
      { cat: 'mascara', coverage: 0.75, weight: 1.0 },
      { cat: 'lipstick', finish: ['satin', 'gloss'], family: ['rose', 'nude', 'berry', 'pink'], coverage: 0.80, weight: 1.3 },
    ],
    avoid: [
      { cat: 'lipstick', finish: 'matte', family: ['red'], why: 'אני לא רוצה להיראות כאילו התאמצתי' },
    ],
  },
];

const BY_ID = new Map(LOOKS.map((l) => [l.id, l]));

export function look(id) {
  const l = BY_ID.get(id);
  if (!l) throw new Error(`no such look: ${id}`);
  return l;
}

/* Every category any look ever asks for. The audit uses it to prove the shop
 * actually stocks something for each one — a request nobody can fill is not a
 * hard level, it is a bug. */
export function requestedCategories() {
  const set = new Set();
  for (const l of LOOKS) for (const w of l.wants) set.add(w.cat);
  return [...set];
}
