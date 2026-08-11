/*
 * sparks.mind.js — creativity, learning, resilience and gratitude.
 *
 * This is the half of the library where it is easiest to write something that
 * sounds good and does nothing, so the bar is higher: a thought only earns its
 * place if the action line under it is something you could be seen doing.
 *
 * The resilience entries carry most of the `safe: true` flags in the library.
 * That is deliberate — a fragile day still gets a spark, and it should come
 * from the area that was written for exactly that day rather than from a
 * watered-down productivity tip.
 */

export const SPARKS_MIND = [
  /* -------------------------------------------------------------- creativity */
  {
    id: 'cre_bad_on_purpose', type: 'tip', category: 'creativity', size: 'micro', tone: 'humorous',
    topics: ['creativity', 'writing', 'starting'],
    title: 'כתוב גרוע בכוונה',
    body: 'עריכה קלה מהתחלה. טיוטה גרועה היא חומר גלם; דף ריק הוא לא.',
    action: 'כתוב פסקה גרועה במכוון. תערוך אחר כך.',
    expansion: 'הכוונה לכתוב גרוע מבטלת את השופט הפנימי, כי אי אפשר להיכשל במשימה שהמטרה שלה היא להיכשל.',
    easier: 'משפט אחד גרוע.',
  },
  {
    id: 'cre_ten_titles', type: 'action', category: 'creativity', size: 'standard', tone: 'direct',
    topics: ['creativity', 'ideation'],
    title: 'עשר כותרות גרועות',
    body: 'הרעיונות הגרועים תופסים את המקום שחוסם את הטובים. תוציא אותם.',
    action: 'כתוב 10 כותרות גרועות לרעיון שמעסיק אותך.',
    expansion: 'הרעיון הטוב כמעט תמיד מגיע בין השביעי לעשירי, אחרי שנגמרו המובנים מאליהם.',
    easier: 'חמש. עדיין גרועות.',
  },
  {
    id: 'cre_one_photo', type: 'action', category: 'creativity', size: 'micro', tone: 'gentle',
    topics: ['creativity', 'noticing'], safe: true,
    title: 'צילום אחד',
    body: 'אתה עובר ליד אותו דבר כל יום ולא הסתכלת עליו אף פעם.',
    action: 'צלם דבר אחד שאתה עובר לידו תמיד ולא שמת לב אליו.',
  },
  {
    id: 'cre_no_purpose', type: 'action', category: 'creativity', size: 'stretch', tone: 'gentle',
    topics: ['creativity', 'writing'],
    title: 'עשרים דקות בלי מטרה',
    body: 'לא כל דבר שאתה עושה צריך להיות טוב, ובטח שלא צריך שמישהו יראה אותו.',
    action: 'צור משהו 20 דקות בלי כוונה להראות לאף אחד.',
    easier: 'עשר דקות. אותו כלל.',
  },
  {
    id: 'cre_steal_shape', type: 'tip', category: 'creativity', size: 'standard', tone: 'practical',
    topics: ['creativity', 'learning', 'ideation'],
    title: 'גנוב מבנה, לא תוכן',
    body: 'קח משהו שאתה אוהב ותשאל איך הוא בנוי — לא מה הוא אומר.',
    action: 'בחר דבר אחד שאהבת השבוע ורשום את המבנה שלו בשלוש שורות.',
  },
  {
    id: 'cre_constraint', type: 'tip', category: 'creativity', size: 'micro', tone: 'stoic',
    topics: ['creativity', 'ideation'],
    title: 'הגבלה אחת',
    body: 'חופש מוחלט משתק. מגבלה אחת פותחת.',
    action: 'קח משימה תקועה והוסף לה מגבלה: חצי מהזמן, או חצי מהמילים.',
  },
  {
    id: 'cre_walk_idea', type: 'action', category: 'creativity', size: 'micro', tone: 'practical',
    topics: ['ideation', 'writing'], safe: true,
    title: 'רעיון אחד על הנייר',
    body: 'הראש הוא מקום נוראי לאחסון. הוא מקום מצוין לעיבוד.',
    action: 'כתוב רעיון אחד שמסתובב לך — גם אם הוא גרוע. במיוחד אם.',
  },

  /* ---------------------------------------------------------------- learning */
  {
    id: 'lea_active_recall', type: 'tip', category: 'learning', size: 'standard', tone: 'practical',
    topics: ['learning', 'memory'],
    title: 'לכתוב מהזיכרון',
    body: 'לקרוא שוב מרגיש כמו למידה. לכתוב מהזיכרון הוא הלמידה עצמה.',
    action: 'סגור את החומר וכתוב מה זכרת. הפער הוא המקום ללמוד בו.',
    expansion: 'התחושה שהחומר מוכר היא לא ידיעה שלו. השליפה מהזיכרון היא מה שמקבע, וזו גם הסיבה שהיא מרגישה קשה יותר.',
    easier: 'שלוש נקודות בלבד.',
  },
  {
    id: 'lea_five_source', type: 'action', category: 'learning', size: 'standard', tone: 'direct',
    topics: ['learning', 'focus', 'curiosity'],
    title: 'חמש דקות של מקור',
    body: 'קראת עשרים סיכומים של דבר שלא קראת.',
    action: 'קרא 5 דקות ממקור אחד. סגור הכל חוץ ממנו.',
  },
  {
    id: 'lea_teach_it', type: 'action', category: 'learning', size: 'stretch', tone: 'practical',
    topics: ['learning', 'writing', 'memory'],
    title: 'ללמד כדי להבין',
    body: 'אם אתה לא יכול להסביר את זה פשוט, עוד לא הבנת.',
    action: 'הסבר בכתב, ב-15 דקות, דבר שלמדת השבוע — כאילו לחבר.',
    easier: 'פסקה אחת במקום עמוד.',
  },
  {
    id: 'lea_one_question', type: 'action', category: 'learning', size: 'micro', tone: 'gentle',
    topics: ['curiosity', 'learning'],
    title: 'שאלה אחת פתוחה',
    body: 'סקרנות היא לא תכונה. היא הרגל של לשאול לפני שממשיכים.',
    action: 'רשום שאלה אחת שעלתה לך היום ולא בדקת.',
  },
  {
    id: 'lea_wrong_thing', type: 'quote', category: 'learning', size: 'micro', tone: 'stoic',
    topics: ['learning', 'resilience'],
    title: 'טעות היא מידע',
    body: 'הדבר היחיד שטעות עולה זה הזמן שלוקח להודות בה.',
    action: 'רשום דבר אחד שטעית בו החודש ומה הוא לימד.',
  },
  {
    id: 'lea_reread_note', type: 'tip', category: 'learning', size: 'micro', tone: 'practical',
    topics: ['learning', 'memory'],
    title: 'הערה שלא חזרת אליה',
    body: 'סימנת משהו כי הוא היה חשוב, ומאז לא פתחת.',
    action: 'פתח הערה ישנה אחת וקרא אותה עד הסוף.',
  },

  /* -------------------------------------------------------------- resilience */
  {
    id: 'res_control_two', type: 'quote', category: 'resilience', size: 'micro', tone: 'stoic',
    topics: ['resilience', 'control'],
    title: 'מה שבידיים שלך היום',
    body: 'רוב המתח נולד מניסיון לנהל דברים שלא בשליטתך.',
    action: 'כתוב שני דברים שאתה שולט בהם היום. סגור את הרשימה.',
    expansion: 'לסגור את הרשימה זו ההוראה האמיתית. רשימה פתוחה מזמינה עוד סעיף, ואיתו חוזר כל מה שלא בידיים שלך.',
  },
  {
    id: 'res_paper_dump', type: 'action', category: 'resilience', size: 'standard', tone: 'gentle',
    topics: ['resilience', 'writing', 'self-compassion'],
    title: 'פריקה על נייר',
    body: 'מחשבה שנכתבה תופסת פחות מקום ממחשבה שמסתובבת.',
    action: 'כתוב שלוש דקות ברצף מה מטריד. אל תעצור לתקן. אחר כך סגור.',
    expansion: 'אף אחד לא יקרא את זה, כולל אתה. המטרה היא לא הטקסט אלא מה שנשאר בחוץ אחריו.',
    easier: 'דקה אחת. שלוש שורות.',
  },
  {
    id: 'res_day_not_failed', type: 'quote', category: 'resilience', size: 'micro', tone: 'humorous',
    topics: ['resilience', 'self-compassion'],
    title: 'היום שלך לא נכשל',
    body: 'הוא בסך הכל לא הלך לפי הדמיון שלך.',
    action: 'הגדר מחדש מה ייחשב "מספיק טוב" לשארית היום.',
  },
  {
    id: 'res_what_worked', type: 'action', category: 'resilience', size: 'micro', tone: 'gentle',
    topics: ['self-compassion', 'noticing'], safe: true,
    title: 'מה כן עבד',
    body: 'המוח סורק אוטומטית מה נכשל. את מה שהצליח צריך לחפש בכוונה.',
    action: 'מנה דבר אחד שעבד היום. בקול או בכתב.',
  },
  {
    id: 'res_not_stuck', type: 'quote', category: 'resilience', size: 'micro', tone: 'stoic',
    topics: ['resilience', 'starting'],
    title: 'אתה לא תקוע',
    body: 'אתה פשוט לא יודע את הצעד הבא. "תקוע" זו הרגשה; "לא יודע מה הצעד" זו בעיה שאפשר לפתור.',
    action: 'כתוב את הצעד הבא בפועל. אחד. הקטן ביותר שאתה יכול.',
  },
  {
    id: 'res_10_10_10', type: 'tip', category: 'resilience', size: 'standard', tone: 'practical',
    topics: ['resilience', 'control', 'priorities'],
    title: 'כלל 10/10/10',
    body: 'איך תרגיש עם ההחלטה הזו בעוד 10 דקות, 10 חודשים, 10 שנים.',
    action: 'הרץ את זה על החלטה אחת שתקועה אצלך.',
  },
  {
    id: 'res_friend_voice', type: 'tip', category: 'resilience', size: 'micro', tone: 'gentle',
    topics: ['self-compassion', 'resilience'], safe: true,
    title: 'מה היית אומר לחבר',
    body: 'המשפט שאתה אומר לעצמך עכשיו — לא היית אומר אותו לאף אחד אחר.',
    action: 'נסח מחדש את המשפט הזה כאילו הוא מיועד לחבר.',
  },
  {
    id: 'res_enough_today', type: 'quote', category: 'resilience', size: 'micro', tone: 'gentle',
    topics: ['self-compassion', 'self-care', 'basics'], safe: true,
    title: 'זה מספיק להיום',
    body: 'יש ימים שהמדד הוא לא כמה עשית אלא שלא ויתרת על עצמך.',
    action: 'בחר דבר אחד קטן שכן תעשה, וקרא לזה יום.',
  },

  /* --------------------------------------------------------------- gratitude */
  {
    id: 'gra_unsaid_thanks', type: 'action', category: 'gratitude', size: 'micro', tone: 'gentle',
    topics: ['gratitude', 'relationships', 'connection'], safe: true,
    title: 'תודה שלא נאמרה',
    body: 'יש מישהו שעזר לך החודש ולא ידע שזה עזר.',
    action: 'כתוב לו הודעה קצרה. שורה אחת מספיקה.',
    expansion: 'לומר למה בדיוק אתה מודה הופך את זה מנימוס לדבר שנשאר אצלו. משפט אחד ספציפי מנצח פסקה כללית.',
  },
  {
    id: 'gra_what_worked_first', type: 'quote', category: 'gratitude', size: 'micro', tone: 'practical',
    topics: ['gratitude', 'noticing'], safe: true,
    title: 'קודם "מה עבד"',
    body: 'שאל "מה עבד?" לפני "מה לא?". הסדר משנה יותר מהתשובה.',
    action: 'רשום דבר אחד שעבד היום, לפני שאתה בודק מה לא.',
  },
  {
    id: 'gra_ordinary', type: 'action', category: 'gratitude', size: 'micro', tone: 'gentle',
    topics: ['gratitude', 'noticing'], safe: true,
    title: 'משהו רגיל לגמרי',
    body: 'לא הדברים הגדולים. הכיסא הנוח, הקפה החם, השקט של שבע בבוקר.',
    action: 'שים לב לדבר רגיל אחד שהיה טוב. אל תכתוב אותו — רק שים לב.',
  },
  {
    id: 'gra_thank_specific', type: 'tip', category: 'gratitude', size: 'micro', tone: 'practical',
    topics: ['gratitude', 'relationships'], safe: true,
    title: 'תודה ספציפית',
    body: '"תודה על הכל" לא נשאר אצל אף אחד. "תודה שענית לי ביום שלישי" נשאר.',
    action: 'אמור תודה אחת עם פרט אחד מדויק בתוכה.',
  },
  {
    id: 'gra_photo_back', type: 'action', category: 'gratitude', size: 'standard', tone: 'gentle',
    topics: ['gratitude', 'noticing', 'family'],
    title: 'שנה אחורה',
    body: 'הראש זוכר את מה שחסר. הטלפון זוכר את מה שהיה.',
    action: 'פתח תמונות מלפני שנה והסתכל 3 דקות.',
  },
];
