/*
 * people.js — who walks up to the counter.
 *
 * Names, colouring, personalities and everything they say.
 *
 * Hebrew is grammatically gendered, so every line that addresses the player or
 * describes the customer exists twice and is picked by the customer's own
 * gender. Writing one set and hoping is the shortcut that makes half the
 * customers sound like a badly translated menu, and it is very visible in a
 * game where the dialogue is most of the character.
 */

/*
 * Skin tones. Six depths across three undertones, spanning the range the
 * foundation ramp has to serve — and the audit measures exactly that: every one
 * of these has to have a shade within a barely-visible distance of it, or the
 * shade-matching mechanic is unwinnable for whoever walks in wearing it.
 *
 * `tone` is the undertone the match is judged against, and it is the mistake a
 * counter actually makes: a cool customer in a warm base goes orange, a warm
 * customer in a cool base goes grey. The three are only about ten degrees of
 * hue apart — skin lives in a narrow band — which is why the game asks the
 * player to look rather than to read a label.
 */
export const SKIN_TONES = [
  { hex: '#f9d5c8', he: 'פורצלן ורדרד', tone: 'cool' },
  { hex: '#f6d7c4', he: 'פורצלן ניטרלי', tone: 'neutral' },
  { hex: '#f1d9c2', he: 'פורצלן זהוב', tone: 'warm' },
  { hex: '#e7b6a3', he: 'שנהב ורדרד', tone: 'cool' },
  { hex: '#e2b99f', he: 'שנהב ניטרלי', tone: 'neutral' },
  { hex: '#dcbb9b', he: 'שנהב זהוב', tone: 'warm' },
  { hex: '#d19982', he: 'חול ורדרד', tone: 'cool' },
  { hex: '#cc9c7d', he: 'חול ניטרלי', tone: 'neutral' },
  { hex: '#c59f78', he: 'חול זהוב', tone: 'warm' },
  { hex: '#b67b63', he: 'דבש ורדרד', tone: 'cool' },
  { hex: '#b07e5d', he: 'דבש ניטרלי', tone: 'neutral' },
  { hex: '#a98158', he: 'דבש זהוב', tone: 'warm' },
  { hex: '#935d47', he: 'ערמון ורדרד', tone: 'cool' },
  { hex: '#8e6041', he: 'ערמון ניטרלי', tone: 'neutral' },
  { hex: '#87643d', he: 'ערמון זהוב', tone: 'warm' },
  { hex: '#6e4331', he: 'אבוני ורדרד', tone: 'cool' },
  { hex: '#6a452c', he: 'אבוני ניטרלי', tone: 'neutral' },
  { hex: '#654828', he: 'אבוני זהוב', tone: 'warm' },
];

export const HAIR_COLORS = [
  { hex: '#1b1614', he: 'שחור' },
  { hex: '#2e2119', he: 'חום כהה' },
  { hex: '#4a3222', he: 'ערמוני' },
  { hex: '#6b4a2c', he: 'חום בהיר' },
  { hex: '#8f6b3a', he: 'דבש' },
  { hex: '#b89257', he: 'בלונד' },
  { hex: '#d8bd8a', he: 'בלונד פלטינה' },
  { hex: '#8a3a2a', he: 'ג׳ינג׳י' },
  { hex: '#6d4b6b', he: 'סגלגל' },
  { hex: '#9aa0a8', he: 'אפור כסוף' },
];

export const EYE_COLORS = [
  { hex: '#4a3018', he: 'חום' },
  { hex: '#2c1c10', he: 'חום כהה' },
  { hex: '#6b6035', he: 'דבש' },
  { hex: '#4d6b52', he: 'ירוק' },
  { hex: '#3f6480', he: 'כחול' },
  { hex: '#6a7a80', he: 'אפור' },
];

export const GARMENT_COLORS = [
  '#2b2f3a', '#5c3a4a', '#1f3d3a', '#6b5230', '#3c3c46',
  '#7a4a52', '#26404f', '#4b4032', '#5a5560', '#833f4a',
];

export const NAMES = [
  { he: 'נועה', g: 'f' }, { he: 'שירה', g: 'f' }, { he: 'תמר', g: 'f' },
  { he: 'יעל', g: 'f' }, { he: 'מיכל', g: 'f' }, { he: 'רות', g: 'f' },
  { he: 'אביגיל', g: 'f' }, { he: 'ליאן', g: 'f' }, { he: 'הדס', g: 'f' },
  { he: 'סיון', g: 'f' }, { he: 'אורטל', g: 'f' }, { he: 'דנה', g: 'f' },
  { he: 'מרים', g: 'f' }, { he: 'רוני', g: 'f' }, { he: 'שקד', g: 'f' },
  { he: 'ג׳ומאנה', g: 'f' }, { he: 'לינוי', g: 'f' }, { he: 'אסתר', g: 'f' },
  { he: 'נטלי', g: 'f' }, { he: 'איילת', g: 'f' }, { he: 'ורד', g: 'f' },
  { he: 'עידו', g: 'm' }, { he: 'איתי', g: 'm' }, { he: 'יונתן', g: 'm' },
  { he: 'עומר', g: 'm' }, { he: 'אליאס', g: 'm' }, { he: 'רן', g: 'm' },
];

/*
 * Personalities. `patience` is how long they will sit before they start
 * getting restless, `tip` scales what they leave, `picky` scales how hard the
 * scoring judges a near miss, and `talk` is how often they say something
 * unprompted.
 */
export const PERSONAS = {
  easy: {
    id: 'easy', he: 'זורמת', patience: 1.35, tip: 1.0, picky: 0.75, talk: 0.5,
    tell: 'מרוצה כמעט מהכל — אבל עדיין יש לה העדפה.',
  },
  exact: {
    id: 'exact', he: 'יודעת בדיוק', patience: 0.85, tip: 1.25, picky: 1.35, talk: 0.9,
    tell: 'תגיד לך בדיוק מה לא בסדר. תקשיב.',
  },
  shy: {
    id: 'shy', he: 'ביישנית', patience: 1.1, tip: 0.9, picky: 1.0, talk: 0.25,
    tell: 'כמעט לא מדברת. הפנים שלה כן.',
  },
  rush: {
    id: 'rush', he: 'ממהרת', patience: 0.6, tip: 1.15, picky: 0.9, talk: 0.7,
    tell: 'מסתכלת בשעון. תסיים מהר.',
  },
  regular: {
    id: 'regular', he: 'לקוחה קבועה', patience: 1.5, tip: 1.35, picky: 1.1, talk: 0.8,
    tell: 'הייתה כאן. זוכרת מה אהבה בפעם שעברה.',
  },
};

export const PERSONA_NAMES = Object.keys(PERSONAS);

/* ------------------------------------------------------------------ *
 * Dialogue
 * ------------------------------------------------------------------ */

const L = (f, m) => ({ f, m });

export const LINES = {
  greet: [
    L('היי, יש לך רגע? אני צריכה משהו.', 'היי, יש לך רגע? אני צריך משהו.'),
    L('שלום. קיבלתי המלצה עלייך.', 'שלום. קיבלתי המלצה עליך.'),
    L('אני יושבת? מעולה.', 'אני יושב? מעולה.'),
    L('בוקר טוב. בואי נתחיל.', 'בוקר טוב. בוא נתחיל.'),
    L('אני סומכת עלייך, אבל יש לי דעה.', 'אני סומך עליך, אבל יש לי דעה.'),
  ],
  love: [
    L('אוי, זה. את זה אני אוהבת.', 'אוי, זה. את זה אני אוהב.'),
    L('רגע — מה זה היה? זה מושלם.', 'רגע — מה זה היה? זה מושלם.'),
    L('בדיוק ככה. בדיוק.', 'בדיוק ככה. בדיוק.'),
    L('אני קונה את זה. איך קוראים לו?', 'אני קונה את זה. איך קוראים לו?'),
    L('זה הגוון. אל תיגעי בזה יותר.', 'זה הגוון. אל תיגע בזה יותר.'),
  ],
  hate: [
    L('אמ… זה לא. זה ממש לא.', 'אמ… זה לא. זה ממש לא.'),
    L('אפשר להוריד את זה?', 'אפשר להוריד את זה?'),
    L('ביקשתי משהו אחר לגמרי.', 'ביקשתי משהו אחר לגמרי.'),
    L('זה מייבש לי את הפנים רק מלהסתכל.', 'זה מייבש לי את הפנים רק מלהסתכל.'),
    L('לא. תנסי שוב.', 'לא. תנסה שוב.'),
  ],
  wrongShade: [
    L('הגוון הזה בולע אותי.', 'הגוון הזה בולע אותי.'),
    L('זה כתום עליי. תמיד כתום עליי.', 'זה כתום עליי. תמיד כתום עליי.'),
    L('זה בהיר מדי — רואים לי קו בלסת.', 'זה בהיר מדי — רואים לי קו בלסת.'),
    L('זה כהה. אני לא כזאת כהה.', 'זה כהה. אני לא כזה כהה.'),
  ],
  impatient: [
    L('סליחה, כמה זמן זה עוד ייקח?', 'סליחה, כמה זמן זה עוד ייקח?'),
    L('אני צריכה לצאת בקרוב…', 'אני צריך לצאת בקרוב…'),
    L('אנחנו מתקדמות?', 'אנחנו מתקדמים?'),
  ],
  happyEnd: [
    L('וואו. אני נראית מעולה.', 'וואו. אני נראה מעולה.'),
    L('זה בדיוק מה שביקשתי. תודה.', 'זה בדיוק מה שביקשתי. תודה.'),
    L('אני חוזרת אלייך. בטוח.', 'אני חוזר אליך. בטוח.'),
  ],
  okEnd: [
    L('טוב. זה בסדר.', 'טוב. זה בסדר.'),
    L('אני אסתדר עם זה.', 'אני אסתדר עם זה.'),
    L('תודה. אני אתרגל.', 'תודה. אני אתרגל.'),
  ],
  badEnd: [
    L('זה… לא מה שדמיינתי.', 'זה… לא מה שדמיינתי.'),
    L('אני אשטוף את זה בבית.', 'אני אשטוף את זה בבית.'),
    L('לא נורא. תודה בכל זאת.', 'לא נורא. תודה בכל זאת.'),
  ],
  markRight: [
    L('כן! זה בדיוק מה שאהבתי. איך ידעת?', 'כן! זה בדיוק מה שאהבתי. איך ידעת?'),
    L('רשמת נכון. אני אבוא לקחת עוד.', 'רשמת נכון. אני אבוא לקחת עוד.'),
  ],
  markWrong: [
    L('דווקא לא. אהבתי משהו אחר.', 'דווקא לא. אהבתי משהו אחר.'),
    L('לא ממש. אבל תודה שניסית.', 'לא ממש. אבל תודה שניסית.'),
  ],
  returning: [
    L('חזרתי! אני רוצה בדיוק מה שעשית לי בפעם שעברה.',
      'חזרתי! אני רוצה בדיוק מה שעשית לי בפעם שעברה.'),
    L('שוב אני. את זוכרת מה אהבתי?', 'שוב אני. אתה זוכר מה אהבתי?'),
  ],
};

/* Pick the right grammatical form. Everything that speaks goes through here. */
export function say(line, gender) {
  return gender === 'm' ? line.m : line.f;
}
