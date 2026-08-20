/*
 * strings.js — every word the game says, in one place.
 *
 * Both front-ends read from here. The HUD and the text mode have to describe
 * the same event with the same word or the player learns two vocabularies for
 * one game, so neither of them writes copy of its own.
 *
 * Identifiers and comments are English, the copy is Hebrew, per the repo's
 * convention in docs/CONTRACTS.md.
 */

export const UI = {
  title: 'שבעה לילות בוילה',
  tagline: 'שבעה לילות. בית אחד. וכל לילה יש בו יותר פתחים מאתמול.',

  start: 'התחל לילה ראשון',
  resume: 'המשך',
  newGame: 'משחק חדש',
  howTo: 'איך משחקים',
  back: 'חזרה',
  pause: 'עצירה',
  quit: 'תפריט ראשי',
  retry: 'נסה שוב',
  modeHud: 'מצב מפה',
  modeText: 'מצב טקסט',

  night: 'לילה',
  of: 'מתוך',
  untilDawn: 'עד הבוקר',
  dayPrep: 'הכנות',
  prepLeft: 'זמן הכנה',
  location: 'מיקום',
  danger: 'סכנה',

  ammo: 'כדורים',
  tape: 'סקוץ׳ טייפ',
  planks: 'קרשים',
  nails: 'מסמרים',
  hammer: 'פטיש',
  callsLeft: 'קריאות לשכן',
  numberKnown: 'מספר השכן',
  numberYes: 'ידוע',
  numberNo: 'לא ידוע',

  openings: 'פתחים',
  hidden: 'מסתורי',
  neighborHere: 'השכן כאן',
  neighborComing: 'השכן בדרך',

  actionTape: 'סקוץ׳',
  actionPlank: 'קרש',
  actionRepair: 'תקן',
  actionShoot: 'ירה',
  actionSearch: 'חפש בחדר',
  actionDrawer: 'פתח מגירה',
  actionPhone: 'התקשר לשכן',
  actionGather: 'קח ציוד',
  actionWait: 'המתן',
  actionReady: 'סיים הכנות והתחל לילה',
};

/* One line per event kind. A function where the line needs a name in it. */
export const EVENTS = {
  night_start: (n) => `לילה ${n}. השמש שקעה.`,
  night_survived: (n) => `הבוקר עלה. שרדת את לילה ${n}.`,
  dawn_reload: (a) => `טענת את הרובה מחדש. ${a} כדורים.`,
  supply_restock: 'חדר הציוד מלא מחדש.',

  noise: (hint) => `${hint}.`,
  hidden_revealed: (name) => `מצאת אותו: ${name}.`,
  hidden_self_revealed: (name) => `זה כבר לא מסתתר — ${name}.`,
  hidden_appeared: (room) => `משהו נפתח ב${room}.`,
  hidden_gone: (name) => `${name} נסגר מעצמו. כאילו לא היה.`,

  under_pressure: (name) => `${name} תחת לחץ.`,
  critical: (name) => `${name} כמעט נפרץ!`,
  breached: (name) => `${name} נפרץ!`,
  resecured: (name) => `${name} מאובטח מחדש.`,

  tape_applied: (name) => `הדבקת סקוץ׳ טייפ על ${name}.`,
  tape_snapped: (name) => `הסקוץ׳ טייפ על ${name} נקרע.`,
  plank_applied: (name) => `קרשת את ${name}.`,
  plank_broke: (name) => `קרש על ${name} נשבר.`,
  repaired: (name) => `דחפת את ${name} בחזרה.`,

  shot: (name, left) => `ירית לעבר ${name}. נשארו ${left} כדורים.`,
  shot_repelled: (name) => `משהו נסוג מ${name}.`,
  shot_intruder: (left) => `ירית במה שנכנס. נשארו ${left} כדורים.`,
  shot_intruder_out: 'זה יצא החוצה.',
  no_ammo: 'המחסנית ריקה.',

  intruder_in: (room) => `משהו נכנס ל${room}.`,
  intruder_near: 'זה בחדר איתך.',

  drawer_searched: (left) => `חיטטת במגירה. ${left} עוד לא מצאת כלום.`,
  drawer_found: 'מתחת לנייר העיתון: פתק עם מספר טלפון. השכן.',
  drawer_empty: 'המגירה ריקה עכשיו.',

  phone_no_number: 'הרמת את השפופרת. אתה לא יודע לאן להתקשר.',
  phone_wrong_room: 'הטלפון היחיד בבית הוא בכניסה.',
  phone_no_calls: 'קראת לו פעמיים. הוא לא יענה שוב.',
  phone_dialing: 'חייגת. הוא אמר שהוא בא.',

  neighbor_arrived: 'השכן בדלת. הוא ניגש לדלתות.',
  neighbor_working: (name) => `השכן עובד על ${name}.`,
  neighbor_leaving_soon: 'השכן מסתכל בשעון. הוא הולך עוד מעט.',
  neighbor_left: 'השכן הלך.',

  gathered: (t, p, n) => `לקחת ${t} סקוץ׳, ${p} קרשים, ${n} מסמרים.`,
  supply_empty: 'חדר הציוד ריק.',
  moved: (room) => `אתה ב${room}.`,

  defenseless: 'אין לך במה להגן על עצמך.',
};

export const FAIL = {
  breach_limit: 'יותר מדי פתחים נפרצו בבת אחת. הבית כבר לא סגור.',
  danger_max: 'מד הסכנה הגיע לקצה.',
  caught: 'זה הגיע אליך.',
  main_breach: 'פתח מרכזי נפרץ ונשאר פתוח.',
  defenseless: 'נשארת בלי כדורים, בלי סקוץ׳ ובלי קרשים, ופתח כמעט נפרץ.',
};

export const OUTCOME = {
  victoryTitle: 'שרדת שבעה לילות',
  victoryText: 'ביום השמיני הבית שקט. אף אחד לא מסביר לך למה.',
  defeatTitle: 'לא שרדת את הלילה',
  nightReached: (n) => `הגעת ללילה ${n} מתוך 7.`,
};

/* The text front-end's own vocabulary. Kept beside the rest of the copy so
 * that a room renamed above cannot leave the parser matching the old name. */
export const PARSER = {
  prompt: '>',
  unknown: 'לא הבנתי. נסה: לך ל, בדוק, חפש, חסום, תקן, ירה, התקשר, המתן.',
  unknownTarget: (what) => `אין כאן ${what}.`,
  notHere: 'זה לא בחדר הזה.',
  needAdjacent: 'אי אפשר להגיע לשם מכאן.',
  noTape: 'אין לך סקוץ׳ טייפ.',
  noPlanks: 'אין לך קרשים.',
  noNails: 'אין לך מספיק מסמרים.',
  noHammer: 'אין לך פטיש.',
  cantTape: 'אי אפשר להדביק סקוץ׳ טייפ על זה.',
  alreadyMax: 'אי אפשר לחזק את זה יותר.',
  notRevealed: 'אתה שומע משהו, אבל לא רואה מה.',
  dayOnly: 'זה משהו ליום.',
  nightOnly: 'לא עכשיו.',
  help: [
    'פקודות:',
    '  לך ל <חדר>        — מעבר לחדר סמוך',
    '  בדוק <פתח/חדר>    — מה מצבו',
    '  חפש               — חיפוש בחדר הנוכחי',
    '  פתח מגירה         — רק בחדר השינה',
    '  חסום <פתח>        — סקוץ׳ טייפ',
    '  קרש <פתח>         — קרש + פטיש + שני מסמרים',
    '  תקן <פתח>         — דחיפה בחזרה, בלי חומרים',
    '  ירה <פתח>         — כדור אחד',
    '  התקשר             — רק מהכניסה, רק אם ידוע המספר',
    '  קח ציוד           — רק בחדר הציוד',
    '  המתן              — דקה עוברת',
    '  ציוד / פתחים / זמן — דוחות',
  ],
};
