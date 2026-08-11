/*
 * sparks.body.js — the library for the four "outer" areas: movement, focus,
 * mindfulness and order.
 *
 * Every entry is written to one rule, and the rule is the product: a reader has
 * to be able to answer "what exactly do I do in the next minute?" from the
 * `action` line alone. Anything that only produces a feeling was cut.
 *
 * Field notes:
 *   safe  — may be delivered on a fragile day (מוצף / שטוח / עייף). Absent means
 *           no. safety.js will not hand out an unsafe spark to a fragile mood
 *           even if the ranker loves it, so this flag is a real gate and not a
 *           hint. Only genuinely un-arguable, un-demanding items carry it.
 *   easier— the smaller version offered on the detail screen. It exists so that
 *           "I can't do that" has an answer other than skipping.
 */

export const SPARKS_BODY = [
  /* ---------------------------------------------------------------- movement */
  {
    id: 'mov_back60', type: 'action', category: 'movement', size: 'micro', tone: 'practical',
    topics: ['movement', 'posture', 'energy'], safe: true,
    title: 'שישים שניות של גב',
    body: 'הגב שלך היה מכופף כבר שעתיים. הוא לא צריך אימון, הוא צריך תזכורת.',
    action: 'עמוד, הרם ידיים מעל הראש, והישאר שם 60 שניות.',
    expansion: 'שרירי היציבה נכנסים לעייפות סטטית אחרי ישיבה ממושכת. מתיחה קצרה מאפסת את השעון הזה, וזו הסיבה שהיא עובדת גם כשהיא קצרה מכדי להיחשב אימון.',
    easier: 'אם אתה לא יכול לעמוד — גלגל את הכתפיים עשר פעמים אחורה.',
  },
  {
    id: 'mov_5nohead', type: 'action', category: 'movement', size: 'standard', tone: 'gentle',
    topics: ['movement', 'outdoors', 'attention'],
    title: 'חמש דקות בלי אוזניות',
    body: 'הליכה קצרה מנקה את הראש יותר מאשר עוד חמש דקות מול המסך.',
    action: 'צא החוצה ל-5 דקות. תספור חמישה דברים שאתה שומע.',
    expansion: 'הספירה היא לא תרגיל קשב — היא תירוץ לא להביא את רשימת המשימות איתך החוצה.',
    easier: 'גם מרפסת או חלון פתוח נחשבים.',
  },
  {
    id: 'mov_walkq', type: 'action', category: 'movement', size: 'stretch', tone: 'direct',
    topics: ['movement', 'outdoors', 'ideation'],
    title: 'הליכה עם שאלה',
    body: 'תנועה פותרת בעיות שישיבה רק מסובבת במעגל.',
    action: 'לך 15 דקות עם שאלה פתוחה אחת בראש. בסוף כתוב שורה.',
    expansion: 'השורה בסוף היא החלק החשוב. בלעדיה ההליכה הייתה נעימה, ומחר לא תזכור מה עלה בה.',
    easier: 'שבע דקות מספיקות. השאלה חשובה יותר מהאורך.',
  },
  {
    id: 'mov_stairs', type: 'action', category: 'movement', size: 'micro', tone: 'humorous',
    topics: ['movement', 'energy'],
    title: 'קומה אחת',
    body: 'המעלית תמיד תהיה שם. היא מאוד סבלנית.',
    action: 'עלה קומה אחת במדרגות היום. אחת.',
    easier: 'רד קומה אחת. גם זה נחשב.',
  },
  {
    id: 'mov_reset', type: 'action', category: 'movement', size: 'micro', tone: 'gentle',
    topics: ['movement', 'self-care'], safe: true,
    title: 'לצאת ולחזור',
    body: 'אין יעד ואין מרחק.',
    action: 'צא מהדלת ותחזור. זה נחשב.',
    expansion: 'ביום שבו כלום לא מסתדר, הדבר היחיד שצריך לשמור עליו הוא שהדפוס לא נשבר. המרחק לא משנה.',
    easier: 'פתח חלון ועמוד לידו דקה.',
  },
  {
    id: 'mov_shake', type: 'action', category: 'movement', size: 'micro', tone: 'practical',
    topics: ['movement', 'energy'], safe: true,
    title: 'לנער את הידיים',
    body: 'המתח נאסף בכפות הידיים ובלסת לפני שהוא מגיע לראש.',
    action: 'נער את הידיים 20 שניות, ואז שחרר את הלסת.',
    easier: 'רק את הכתפיים. שלוש פעמים למעלה ולמטה.',
  },
  {
    id: 'mov_10min_out', type: 'action', category: 'movement', size: 'stretch', tone: 'stoic',
    topics: ['movement', 'outdoors', 'resilience'],
    title: 'מזג האוויר הוא לא הסיבה',
    body: 'רוב הימים שלא יצאת בהם לא היו קרים מדי. הם היו סתם ימים.',
    action: 'לך 12 דקות בחוץ, בלי לבדוק קודם מה מזג האוויר.',
    easier: 'חמש דקות. עדיין בחוץ.',
  },
  {
    id: 'mov_desk_set', type: 'tip', category: 'movement', size: 'micro', tone: 'practical',
    topics: ['posture', 'movement'], safe: true,
    title: 'גובה המסך',
    body: 'אם השורה העליונה במסך נמוכה מהעיניים שלך, הצוואר מחזיק את הראש כל היום.',
    action: 'הרם את המסך עד שהשורה העליונה בגובה העיניים. ספר מתחת נחשב.',
  },

  /* ------------------------------------------------------------------- focus */
  {
    id: 'foc_two_min', type: 'quote', category: 'focus', size: 'micro', tone: 'direct',
    topics: ['focus', 'procrastination', 'starting'],
    title: 'אתה לא צריך מוטיבציה',
    body: 'מוטיבציה מגיעה אחרי ההתחלה, לא לפניה. זה הסדר שכולם מבלבלים.',
    action: 'בחר משימה אחת ותן לה שתי דקות. מותר להפסיק אחר כך.',
    expansion: 'ההיתר להפסיק הוא מה שמאפשר להתחיל. ברוב המקרים לא תשתמש בו — אבל בלעדיו לא היית מתחיל בכלל.',
    easier: 'דקה אחת. אותו כלל.',
  },
  {
    id: 'foc_two_rule', type: 'tip', category: 'focus', size: 'micro', tone: 'practical',
    topics: ['productivity', 'focus'], safe: true,
    title: 'כלל שתי הדקות',
    body: 'אם משימה לוקחת פחות משתי דקות, עשה אותה עכשיו במקום לרשום אותה. הרישום עולה יותר מהביצוע.',
    action: 'מצא היום משימה כזו אחת ובצע במקום לרשום.',
    expansion: 'לרשום משימה זה לכתוב אותה, לקרוא אותה שוב מחר, להחליט מתי, ואז לעשות אותה. ארבעה צעדים במקום אחד.',
  },
  {
    id: 'foc_close3', type: 'action', category: 'focus', size: 'micro', tone: 'humorous',
    topics: ['digital', 'focus'],
    title: 'סגור שלוש',
    body: 'כל לשונית פתוחה היא החלטה שדחית.',
    action: 'סגור שלוש לשוניות. בלי לקרוא אותן קודם.',
    easier: 'אחת. הכי ישנה.',
  },
  {
    id: 'foc_phone_room', type: 'quote', category: 'focus', size: 'standard', tone: 'humorous',
    topics: ['digital', 'attention'],
    title: 'הטלפון לא מפריע לך',
    body: 'אף אחד לא נכנס לאינסטגרם בטעות שמונה פעמים ביום.',
    action: 'שים את הטלפון בחדר אחר ל-20 דקות.',
    expansion: 'המרחק עושה את העבודה, לא כוח הרצון. חדר אחר מוסיף שבע שניות של מאמץ, וזה מספיק.',
    easier: 'מגירה סגורה באותו חדר.',
  },
  {
    id: 'foc_body_double', type: 'tip', category: 'focus', size: 'standard', tone: 'practical',
    topics: ['focus', 'productivity', 'connection'],
    title: 'התחייבות של הודעה אחת',
    body: 'אמירה למישהו שאתה מתחיל עכשיו מעלה את הסיכוי שתסיים — גם אם הוא לא עונה.',
    action: 'שלח למישהו "מתחיל עכשיו 25 דקות" והפעל טיימר.',
    expansion: 'זה עובד גם מול אדם שלא קרא את ההודעה, כי ההתחייבות נוצרה ברגע ששלחת אותה.',
  },
  {
    id: 'foc_distraction_pad', type: 'tip', category: 'focus', size: 'micro', tone: 'practical',
    topics: ['focus', 'attention'], safe: true,
    title: 'תיבת הסחות',
    body: 'כל מחשבה מסיחה שנכתבת מפסיקה לחזור. זה כל הטריק.',
    action: 'הכן פתק ליד המחשב. כל מחשבה שקופצת — כתוב והמשך.',
  },
  {
    id: 'foc_hardest_first', type: 'action', category: 'focus', size: 'standard', tone: 'direct',
    topics: ['procrastination', 'starting', 'priorities'],
    title: 'המשימה שנמנעת ממנה',
    body: 'אתה יודע איזו. היא בראש שלך מאז אתמול.',
    action: 'קבע טיימר ל-4 דקות ותתחיל בה. מותר לעצור בסוף.',
    easier: 'רק פתח את הקובץ או את השיחה. אל תעשה כלום מעבר.',
  },
  {
    id: 'foc_one_tab', type: 'action', category: 'focus', size: 'stretch', tone: 'stoic',
    topics: ['focus', 'digital', 'productivity'],
    title: 'חלון אחד, חמש עשרה דקות',
    body: 'ריכוז הוא לא תכונה. הוא סביבה.',
    action: 'סגור הכל חוץ מדבר אחד ועבוד עליו 15 דקות.',
    easier: 'שבע דקות. אותו חלון יחיד.',
  },

  /* ------------------------------------------------------------- mindfulness */
  {
    id: 'min_three_breaths', type: 'action', category: 'mindfulness', size: 'micro', tone: 'gentle',
    topics: ['breathing', 'calm'], safe: true,
    title: 'שלוש נשימות',
    body: 'לא צריך עשר דקות. צריך שלוש נשימות שבאמת שמת לב אליהן.',
    action: '4 שניות פנימה, 6 שניות החוצה. שלוש פעמים.',
    expansion: 'הנשיפה ארוכה מהשאיפה בכוונה — היא זו שמאטה את הדופק. יחס ולא מספר, כך שאפשר להתאים למה שנוח.',
    easier: 'נשימה אחת. איטית.',
  },
  {
    id: 'min_notice_calm', type: 'quote', category: 'mindfulness', size: 'micro', tone: 'gentle',
    topics: ['attention', 'calm'], safe: true,
    title: 'לא להירגע. לשים לב',
    body: 'רגיעה היא תוצאה. תשומת לב היא פעולה — ורק אחת מהן תלויה בך עכשיו.',
    action: 'שים לב לשלושה צלילים סביבך. בלי לשנות כלום.',
  },
  {
    id: 'min_water', type: 'action', category: 'mindfulness', size: 'micro', tone: 'gentle',
    topics: ['self-care', 'basics'], safe: true,
    title: 'כוס מים',
    body: 'יש ימים שהניצוץ הוא לא אתגר. הוא רק תזכורת שדואגים לך.',
    action: 'שים כוס מים לידך ושתה אותה. זה הכל.',
    expansion: 'אין מה להוסיף. ביום כזה זה מספיק.',
  },
  {
    id: 'min_five_senses', type: 'action', category: 'mindfulness', size: 'micro', tone: 'gentle',
    topics: ['attention', 'calm', 'noticing'], safe: true,
    title: 'חמישה דברים',
    body: 'כשהראש רץ קדימה, החושים תמיד נשארים כאן.',
    action: 'מנה חמישה דברים שאתה רואה וארבעה שאתה שומע.',
    easier: 'רק החמישה שאתה רואה.',
  },
  {
    id: 'min_one_thing', type: 'action', category: 'mindfulness', size: 'standard', tone: 'practical',
    topics: ['attention', 'noticing'],
    title: 'דבר אחד בכל פעם',
    body: 'הארוחה, ההליכה, השיחה — בחר אחת ותעשה רק אותה.',
    action: 'בפעולה הבאה שלך, אל תעשה שום דבר במקביל. חמש דקות.',
  },
  {
    id: 'min_jaw', type: 'tip', category: 'mindfulness', size: 'micro', tone: 'practical',
    topics: ['calm', 'self-care'], safe: true,
    title: 'הלסת והכתפיים',
    body: 'שני מקומות מחזיקים מתח בלי שתשים לב. שניהם משתחררים בפקודה.',
    action: 'שחרר את הלסת, הורד את הכתפיים. עכשיו.',
  },
  {
    id: 'min_no_phone_meal', type: 'action', category: 'mindfulness', size: 'stretch', tone: 'direct',
    topics: ['attention', 'digital', 'family'],
    title: 'ארוחה בלי טלפון',
    body: 'עשרים דקות שבהן אתה יודע מה אכלת.',
    action: 'הנח את הטלפון בחדר אחר לארוחה הבאה. שים לב מתי היד מחפשת.',
    easier: 'רק להפוך אותו על הפנים ולהשתיק.',
  },

  /* ------------------------------------------------------------------- order */
  {
    id: 'ord_one_surface', type: 'action', category: 'order', size: 'micro', tone: 'practical',
    topics: ['order', 'environment'], safe: true,
    title: 'משטח אחד',
    body: 'סדר מלא הוא פרויקט. משטח אחד הוא דקה.',
    action: 'נקה משטח אחד שאתה רואה עכשיו. עצור כשהוא נקי.',
    expansion: 'לעצור כשהמשטח נקי זה חלק מההוראה. סדר שמתחיל להתפשט הופך לערב שלם ואחריו לשבועיים של הימנעות.',
  },
  {
    id: 'ord_one_drawer', type: 'action', category: 'order', size: 'standard', tone: 'direct',
    topics: ['order', 'decluttering'],
    title: 'מגירה אחת',
    body: 'בחירה קטנה מספיק כדי שלא תתווכח איתה.',
    action: 'בחר מגירה אחת. הוצא הכל. החזר רק מה שאתה משתמש בו.',
    easier: 'חצי מגירה. או תא אחד בארנק.',
  },
  {
    id: 'ord_home_for_one', type: 'tip', category: 'order', size: 'micro', tone: 'practical',
    topics: ['order', 'environment'], safe: true,
    title: 'מקום קבוע לדבר אחד',
    body: 'בחר את החפץ שאתה מחפש הכי הרבה, וקבע לו מקום. חפץ אחד בלבד.',
    action: 'מפתחות? אוזניות? קבע לו מקום עכשיו ושים אותו שם.',
  },
  {
    id: 'ord_later_box', type: 'action', category: 'order', size: 'stretch', tone: 'gentle',
    topics: ['order', 'decluttering', 'environment'],
    title: 'קופסת ה"אחר כך"',
    body: 'רוב הבלגן הוא לא לכלוך. הוא דברים שאין להם מקום.',
    action: 'אסוף ל-15 דקות לקופסה אחת כל מה שאין לו מקום. תחליט מחר.',
    easier: 'רק חדר אחד, ורק מה שעל הרצפה.',
  },
  {
    id: 'ord_tomorrow_out', type: 'action', category: 'order', size: 'micro', tone: 'practical',
    topics: ['order', 'morning', 'sleep'], safe: true,
    title: 'הכנה למחר',
    body: 'בוקר טוב מתחיל בערב שלפניו, בהחלטה אחת שכבר קיבלת.',
    action: 'הוצא עכשיו את מה שתצטרך בבוקר והנח על הכיסא.',
  },
  {
    id: 'ord_inbox_five', type: 'action', category: 'order', size: 'standard', tone: 'stoic',
    topics: ['order', 'digital', 'productivity'],
    title: 'חמישה מיילים',
    body: 'תיבה מלאה היא לא עומס עבודה. היא ערימה של החלטות שלא קיבלת.',
    action: 'טפל בחמישה מיילים. מחק, השב או ארכב — בלי לקרוא את השאר.',
    easier: 'שלושה. הכי ישנים.',
  },
  {
    id: 'ord_photo_ten', type: 'action', category: 'order', size: 'micro', tone: 'humorous',
    topics: ['digital', 'decluttering'],
    title: 'עשר תמונות',
    body: 'יש לך ארבעה צילומי מסך של אותה כתובת.',
    action: 'מחק עשר תמונות מהטלפון. יש שם לפחות עשר.',
  },
];
