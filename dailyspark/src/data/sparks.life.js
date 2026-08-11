/*
 * sparks.life.js — relationships, sleep, money and courage.
 *
 * Two of these areas are the ones a daily-inspiration app is most likely to get
 * wrong, so they carry extra constraints:
 *
 *   money  — never a specific financial instruction. Every entry here is about
 *            attention and decisions, not about what to buy or sell. Nothing in
 *            this category is marked `safe`, because a fragile day is not the
 *            day to open a bank app.
 *   sleep  — no medical claims and no promises about sleep quality. The entries
 *            are about the hours *before* bed, which is the part a person can
 *            actually act on.
 */

export const SPARKS_LIFE = [
  /* ----------------------------------------------------------- relationships */
  {
    id: 'rel_one_line', type: 'action', category: 'relationships', size: 'micro', tone: 'gentle',
    topics: ['relationships', 'connection'], safe: true,
    title: 'שורה אחת',
    body: 'רוב הקשרים לא נגמרים בריב. הם נגמרים בשקט.',
    action: 'שלח למישהו: "חשבתי עליך היום". בלי הקדמה ובלי בקשה.',
    expansion: 'בלי בקשה זה החלק שעושה את ההבדל. הודעה שאין בה מה שרוצים ממישהו מתקבלת אחרת לגמרי.',
  },
  {
    id: 'rel_question_not_fix', type: 'tip', category: 'relationships', size: 'micro', tone: 'practical',
    topics: ['listening', 'relationships'], safe: true,
    title: 'שאלה במקום פתרון',
    body: 'כשמישהו מספר משהו קשה, הדחף הראשון הוא לפתור. זה כמעט אף פעם לא מה שהוא רצה.',
    action: 'בשיחה הקרובה שאל: "מה הכי מעסיק אותך בזה?"',
    expansion: 'עצה מסיימת שיחה; שאלה מאריכה אותה. אם באמת רוצים עצה — מבקשים.',
  },
  {
    id: 'rel_three_min_call', type: 'action', category: 'relationships', size: 'standard', tone: 'direct',
    topics: ['connection', 'relationships'],
    title: 'שיחה של שלוש דקות',
    body: 'הודעה נוחה יותר. שיחה נשארת.',
    action: 'התקשר למישהו במקום לכתוב. תפתח ב"יש לי 3 דקות".',
    easier: 'הודעה קולית של חצי דקה.',
  },
  {
    id: 'rel_thought_of_you', type: 'quote', category: 'relationships', size: 'micro', tone: 'gentle',
    topics: ['relationships', 'connection'], safe: true,
    title: 'מי שחשבת עליו השבוע',
    body: 'הוא עדיין שם. הוא פשוט לא יודע שחשבת עליו.',
    action: 'שלח הודעה של שורה אחת. לא צריך תירוץ.',
  },
  {
    id: 'rel_full_attention', type: 'action', category: 'relationships', size: 'standard', tone: 'practical',
    topics: ['listening', 'attention', 'family'],
    title: 'חמש דקות של קשב מלא',
    body: 'נוכחות היא לא כמות זמן. היא איכות של חמש דקות.',
    action: 'תן למישהו 5 דקות בלי טלפון ובלי לחשוב על התשובה שלך.',
  },
  {
    id: 'rel_repair', type: 'tip', category: 'relationships', size: 'micro', tone: 'gentle',
    topics: ['relationships', 'self-compassion'],
    title: 'תיקון קטן',
    body: 'לא צריך לפתור את הכל. צריך להגיד "זה יצא לי לא טוב אתמול".',
    action: 'שלח משפט תיקון אחד למי שמגיע לו.',
  },
  {
    id: 'rel_ask_how_really', type: 'action', category: 'relationships', size: 'micro', tone: 'direct',
    topics: ['listening', 'connection'],
    title: 'לשאול פעם שנייה',
    body: '"מה נשמע?" מקבל "בסדר". השאלה השנייה מקבלת תשובה.',
    action: 'שאל מישהו "מה נשמע?", ואז שאל שוב באמת.',
  },

  /* ------------------------------------------------------------------- sleep */
  {
    id: 'sle_evening_starts', type: 'quote', category: 'sleep', size: 'micro', tone: 'practical',
    topics: ['sleep', 'evening'], safe: true,
    title: 'הלילה מתחיל בשש',
    body: 'רוב מה שקובע איך תישן קורה לפני שנכנסים למיטה.',
    action: 'קבע עכשיו תזכורת ל-21:30: לכבות את המסך הראשי.',
  },
  {
    id: 'sle_light_window', type: 'tip', category: 'sleep', size: 'micro', tone: 'practical',
    topics: ['sleep', 'morning', 'energy'], safe: true,
    title: 'חלון האור',
    body: 'אור טבעי בשעה הראשונה של היום מסייע לכיול השעון הביולוגי.',
    action: 'קבע: מחר הקפה הראשון ליד החלון או בחוץ.',
  },
  {
    id: 'sle_charge_outside', type: 'action', category: 'sleep', size: 'micro', tone: 'direct',
    topics: ['sleep', 'digital', 'evening'],
    title: 'המטען בחדר אחר',
    body: 'אם הטלפון נטען ליד המיטה, הוא הדבר הראשון והאחרון שאתה רואה.',
    action: 'העבר את המטען לחדר אחר. עכשיו, לא בערב.',
    easier: 'רק לצד השני של החדר.',
  },
  {
    id: 'sle_wind_down', type: 'action', category: 'sleep', size: 'standard', tone: 'gentle',
    topics: ['sleep', 'evening', 'calm'],
    title: 'עשר דקות של ירידה',
    body: 'הגוף לא עובר מפעילות לשינה בלחיצה. הוא צריך מדרגה.',
    action: 'הערב: 10 דקות בלי מסך לפני המיטה. אור נמוך, ספר או כלום.',
    easier: 'חמש דקות. גם זה מדרגה.',
  },
  {
    id: 'sle_tomorrow_list', type: 'tip', category: 'sleep', size: 'micro', tone: 'practical',
    topics: ['sleep', 'evening', 'order'], safe: true,
    title: 'רשימת מחר, הערב',
    body: 'רוב מה שמסתובב בראש בלילה זה דברים שהראש מפחד לשכוח.',
    action: 'כתוב שלושה דברים למחר לפני שאתה נכנס למיטה.',
  },
  {
    id: 'sle_same_hour', type: 'tip', category: 'sleep', size: 'micro', tone: 'stoic',
    topics: ['sleep', 'morning'],
    title: 'שעת קימה קבועה',
    body: 'שעת הקימה מייצבת את הלילה יותר משעת השינה.',
    action: 'קבע שעת קימה אחת לשבוע הקרוב, גם לסופ"ש.',
  },

  /* ------------------------------------------------------------------- money */
  {
    id: 'mon_one_sub', type: 'action', category: 'money', size: 'standard', tone: 'direct',
    topics: ['money', 'spending'],
    title: 'מנוי אחד',
    body: 'הכסף שנעלם בשקט הוא הכסף שאף פעם לא בדקת.',
    action: 'פתח את רשימת המנויים ובטל אחד שלא נגעת בו חודשיים.',
    expansion: 'לא צריך לעבור על כולם. אחד היום, אחד בעוד חודש — זה מנצח רשימה שלמה שלא תיפתח אף פעם.',
  },
  {
    id: 'mon_72h', type: 'tip', category: 'money', size: 'micro', tone: 'practical',
    topics: ['money', 'spending'],
    title: 'כלל 72 השעות',
    body: 'לפני קנייה לא הכרחית מעל סכום שתקבע — המתן 72 שעות. רוב הדחפים לא שורדים.',
    action: 'קבע עכשיו את הסכום שלך. מספר אחד.',
  },
  {
    id: 'mon_one_category', type: 'action', category: 'money', size: 'standard', tone: 'stoic',
    topics: ['money', 'spending', 'noticing'],
    title: 'קטגוריה אחת',
    body: 'תקציב הוא לא הגבלה. הוא החלטה שקיבלת פעם אחת, מראש.',
    action: 'בחר קטגוריה אחת והסתכל כמה יצא בה החודש. רק להסתכל.',
    easier: 'רק את השבוע האחרון.',
  },
  {
    id: 'mon_auto_one', type: 'tip', category: 'money', size: 'micro', tone: 'practical',
    topics: ['money'],
    title: 'החלטה אחת אוטומטית',
    body: 'החלטה שחוזרת כל חודש עדיף שתקרה פעם אחת.',
    action: 'הפוך פעולה כספית אחת שאתה עושה ידנית להוראת קבע.',
  },

  /* ----------------------------------------------------------------- courage */
  {
    id: 'cou_what_to_drop', type: 'quote', category: 'courage', size: 'micro', tone: 'direct',
    topics: ['priorities', 'courage'],
    title: 'לא זמן. בחירה',
    body: 'לוח מלא הוא לא סימן לחשיבות. הוא סימן שלא בחרת.',
    action: 'מחק פריט אחד מהיום. אחד מספיק.',
    expansion: 'למחוק זה לא לדחות. פריט שנדחה חוזר מחר עם ריבית.',
  },
  {
    id: 'cou_send_it', type: 'action', category: 'courage', size: 'micro', tone: 'direct',
    topics: ['courage', 'starting'],
    title: 'ההודעה שלא שלחת',
    body: 'היא יושבת בטיוטות כבר שלושה ימים ולא משתפרת שם.',
    action: 'שלח אותה. או מחק אותה. אל תשאיר אותה פתוחה.',
  },
  {
    id: 'cou_ask', type: 'action', category: 'courage', size: 'standard', tone: 'practical',
    topics: ['courage', 'boundaries', 'connection'],
    title: 'לבקש דבר אחד',
    body: 'רוב הדברים שלא קיבלת זה דברים שלא ביקשת.',
    action: 'בקש היום דבר אחד קטן שאתה בדרך כלל לא מבקש.',
  },
  {
    id: 'cou_no_once', type: 'tip', category: 'courage', size: 'micro', tone: 'stoic',
    topics: ['boundaries', 'priorities'],
    title: '"לא" בלי הסבר',
    body: 'הסבר ארוך הופך סירוב למשא ומתן.',
    action: 'סרב היום לדבר אחד במשפט אחד, בלי לפרט למה.',
  },
  {
    id: 'cou_start_before_ready', type: 'quote', category: 'courage', size: 'micro', tone: 'stoic',
    topics: ['starting', 'courage', 'procrastination'],
    title: 'תתחיל לפני שאתה מוכן',
    body: 'התחושה שאתה מוכן מגיעה באמצע, אף פעם לא בהתחלה.',
    action: 'עשה את הצעד הראשון בדבר שאתה מחכה איתו. רק הראשון.',
  },
  {
    id: 'cou_one_hard_thing', type: 'action', category: 'courage', size: 'stretch', tone: 'direct',
    topics: ['courage', 'starting', 'priorities'],
    title: 'הדבר שנדחה שבועיים',
    body: 'הוא לא יהיה קל יותר בשבוע הבא. הוא רק ייקח עוד מקום בראש.',
    action: 'הקדש לו 15 דקות עכשיו. לא לסיים — רק להתחיל.',
    easier: 'חמש דקות. רק לפתוח ולהסתכל.',
  },
  {
    id: 'cou_say_the_thing', type: 'action', category: 'courage', size: 'micro', tone: 'gentle',
    topics: ['courage', 'connection', 'boundaries'],
    title: 'להגיד את זה בקול',
    body: 'הדבר שאתה חוזר עליו בראש מול אדם אחד — הוא לא ישמע אותו משם.',
    action: 'אמור משפט אחד שדחית. משפט, לא שיחה.',
  },
];
