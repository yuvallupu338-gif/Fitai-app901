/*
 * story.js — everything the game says, and the one thing it never says.
 *
 * The plot is never narrated. It is in twelve objects lying around the
 * neighbourhood — a diary, some tapes, some photographs, a receipt — and in
 * what the neighbours say in daylight without knowing they are saying it. A
 * player who picks up nothing finishes all seven nights and gets an ending
 * that makes no sense to them; a player who reads everything gets the same
 * ending and it lands. That is the deal, and the game does not hedge it.
 *
 * The daytime dialogue is doing a second job as well: the clues the night's
 * puzzles need are in it. That is why these are functions of the layout rather
 * than a table of strings — tonight's code, tonight's gnome ages and the key
 * the music boxes are in all change, and the neighbour has to know them.
 */

/* ------------------------------------------------------------------ *
 * Things you can find
 * ------------------------------------------------------------------ */

export const COLLECTIBLES = [
  {
    id: 'j1', kind: 'journal', title: 'יומן — 14 באפריל',
    text: 'עברנו. הבית קטן מהתמונות אבל הרחוב שקט, ויש דגל קטן על עמוד מול '
      + 'כל בית. שאלתי את השכנה בשביל מה. היא אמרה "זה מהעירייה" והמשיכה לגזום.',
  },
  {
    id: 'j2', kind: 'journal', title: 'יומן — 2 במאי',
    text: 'הוא לא נרדם בלי השיר. שמונה תווים, אותם שמונה תווים, כל ערב. '
      + 'אמרתי לו שאם ישן לבד אקנה לו אופניים. הוא אמר שהוא מעדיף את השיר.',
  },
  {
    id: 't1', kind: 'tape', title: 'קלטת VHS — "יום הולדת 6"',
    text: 'מצלמת יד. מדשאה, שולחן, בלונים. אישה בשמלה לבנה מדליקה נרות ושרה — '
      + 'הקול לא נשמע בקלטת, רק שריקה קלה של הרוח על המיקרופון. '
      + 'ילד מכבה. כולם מוחאים כפיים. ברקע, על העמוד, הדגל למעלה.',
  },
  {
    id: 'p1', kind: 'photo', title: 'תצלום — שלושה אנשים ומכונית',
    text: 'גבר, אישה, ילד קטן מול סטיישן חום. על הגב, בעט: "אורנים 5, יולי". '
      + 'זה הבית שאתה גר בו.',
  },
  {
    id: 'j3', kind: 'journal', title: 'יומן — 19 באוגוסט',
    text: 'הרחוב הזה מוזר איתי. שואלים מה שלומי בקול גבוה מדי. '
      + 'גברת שוורץ אמרה לי היום "את מסתדרת יפה, בהתחשב". בהתחשב במה.',
  },
  {
    id: 't2', kind: 'tape', title: 'קלטת VHS — ללא תווית',
    text: 'שלושים שניות של תקרה. מישהו הניח את המצלמה על השולחן ושכח. '
      + 'שומעים דלת. שומעים אותה קוראת לו בשם פעמיים. '
      + 'בפעם השנייה היא כבר לא בבית — הקול בא מבחוץ, מהרחוב.',
  },
  {
    id: 'j4', kind: 'journal', title: 'יומן — 3 בספטמבר',
    text: 'הוא רץ אחרי הכדור. אני צעקתי. אני עדיין צועקת, בכל פעם שאני '
      + 'עוצמת עיניים. הרופא אמר שהוא לא הרגיש. הרופא לא היה שם.',
  },
  {
    id: 'p2', kind: 'photo', title: 'תצלום — דגל על עמוד',
    text: 'צילום מטושטש של עמוד עם דגל אדום קטן, מונמך לחצי התורן. '
      + 'מאחור נראים עוד עמודים, לאורך כל הרחוב. כולם מונמכים.',
  },
  {
    id: 'j5', kind: 'journal', title: 'יומן — 21 בספטמבר',
    text: 'השכנים אמרו שזה מה שעושים כאן. שמורידים את הדגל למשך שבעה לילות '
      + 'ואז מרימים אותו בחזרה, ואז ממשיכים. שאלתי מה קורה אם לא מרימים. '
      + 'אף אחד לא ענה לי.',
  },
  {
    id: 't3', kind: 'tape', title: 'קלטת VHS — 3:31',
    text: 'מצלמת אבטחה מהמכולת. השעה בפינה. אישה בשמלה לבנה עוברת בכביש '
      + 'לאט מאוד, מימין לשמאל. היא לא הולכת בדיוק. '
      + 'בשנייה 41 היא עוצרת מול המצלמה ומסתובבת אליה.',
  },
  {
    id: 'j6', kind: 'journal', title: 'יומן — ללא תאריך',
    text: 'לא הרמתי אותו. בלילה השביעי לא יצאתי מהבית. '
      + 'מאז אני שורקת לו כל לילה ב-3:30 והוא לא בא. '
      + 'אני יודעת שהוא איפשהו כאן. אני רואה אותו לפעמים בין הבתים.',
  },
  {
    id: 'p3', kind: 'photo', title: 'תצלום — מצבה',
    text: 'אבן קטנה, שם מטושטש, שני תאריכים קרובים מדי זה לזה. '
      + 'על האדמה לפניה מונח דגל אדום קטן על מקל. '
      + 'זה הדגל. אותו דגל.',
  },
];

/* Which object is at a given hiding place. The slot comes from the layout, so
 * a save's twelve objects are spread over its own street in its own order, and
 * two players comparing notes find them in different houses. */
export function collectibleFor(slot) {
  return COLLECTIBLES[Math.abs(slot | 0) % COLLECTIBLES.length];
}

/* ------------------------------------------------------------------ *
 * Daylight
 * ------------------------------------------------------------------ */

/*
 * What a neighbour says, in order, one line per press. The last line of each
 * is the one carrying the clue; everything before it is a person being
 * pleasant, which is what makes the clue worth waiting for.
 */
export function neighbourLines(house, layout, night) {
  const p = layout.puzzles;
  const base = [
    `${house.occupant.name}: "בוקר טוב. ${house.occupant.trait}."`,
  ];
  switch (house.number) {
    case 9:
      return base.concat([
        '"התיבה? נעולה, כן. הבן שלי שם את הקוד כשהיה בן עשר."',
        `"הוא אמר: המספר של הבית שלי, פחות שלוש, כפול שתיים. `
          + `זה כתוב על התיבה, אם לא שכחת לקרוא."`,
      ]);
    case 3:
      return base.concat([
        '"שלוש תיבות נגינה על הדשא, כן. של סבתא שלי."',
        '"שתיים מהן מזייפות. תקשיב לשריקה בלילה ותשווה — '
          + 'רק אחת מהן באותו סולם. תמיד הייתה רק אחת."',
      ]);
    case 6: {
      /* Sorted, because the line claims to be sorted. Reading the ages out in
       * the order the objects happen to sit in is not a clue, it is a lie the
       * player only finds out about in the dark. */
      const g = p.gnomes.items.slice().sort((a, b) => a.age - b.age)
        .map((x) => `${x.name} בן ${x.age}`).join(', ');
      return base.concat([
        '"הגמדים? הם היו של הבעלים הקודמים. אנחנו לא מזיזים אותם."',
        `"מי שכן צריך לדעת את הסדר. מהצעיר לזקן: ${g}. `
          + 'זה כתוב על הבסיסים, אבל בלילה לא תראה כלום."',
      ]);
    }
    /*
     * The clue about the abandoned house is given by its neighbour, not by
     * the house itself: nobody lives at number 11, so nobody stands in its
     * garden in the daylight, and a clue in a mouth that never appears is a
     * puzzle with no solution.
     */
    case 7:
      return base.concat([
        '"הבית הנטוש ליד? אל תיכנס לשם."',
        '"מישהו כתב מספר על החלון מבפנים, לפני הרבה שנים. '
          + 'מהחצר זה נראה הפוך. יש מראה ישנה נשענת על הגדר האחורית — '
          + 'משם קוראים אותו נכון."',
      ]);
    case 1:
      return base.concat([
        '"הכלב נובח על כל דבר. סליחה מראש."',
        '"אם אתה עובר שם בלילה — תתכופף. הוא לא רואה נמוך."',
      ]);
    case 12:
      return base.concat([
        '"ארגזים ליד המוסך, כן. אני כל הזמן אומר שאפנה אותם."',
        '"מצד שני, פעם ילד עלה עליהם עד לגג ולא ידעתי איך להוריד אותו."',
      ]);
    default:
      return base.concat([
        night >= 4
          ? '"אתה נראה עייף. גם אני לא ישן טוב לאחרונה."'
          : '"אם אתה צריך משהו — אנחנו כאן. תמיד היינו כאן."',
        '"הדגל? זה מהעירייה. אל תשאל."',
      ]);
  }
}

/* ------------------------------------------------------------------ *
 * The nights
 * ------------------------------------------------------------------ */

/* Shown once when a night begins, over the black. Seven lines, and they are
 * the only place the game speaks in its own voice. */
export const NIGHT_INTRO = [
  'הלילה הראשון. אתה מתעורר כי משהו שורק.',
  'שוב. אותה שעה, אותה מנגינה. היא מהירה יותר הלילה.',
  'בגינות עומדים אנשים. הם לא זזים. הם ישנים.',
  'היום היא התחילה מוקדם. שתי דקות שאין לך מה לעשות בהן חוץ מלהתחבא.',
  'הדגל לא נשאר במקום אחד יותר מדקה. שום דבר כאן לא נשאר.',
  'כל הדלתות פתוחות. גם היא יודעת.',
  'הלילה השביעי. היא כבר לא מחפשת אותך — היא יודעת בדיוק איפה אתה.',
];

/* What the screen says when the night resets. Deliberately short and never
 * jokey: this screen is the punishment and it should be over fast. */
export const CAUGHT_LINES = [
  'השריקה נפסקה באמצע תו.',
  'היא הסתובבה. זה כל מה שקרה.',
  'לא זזת מספיק מהר.',
  'היא ראתה את הדגל לפני שראתה אותך.',
  'מישהו בגינה צרח, והיא באה.',
];

export const TIMEOUT_LINES = [
  '3:35. השריקה נגמרה, והדגל לא בבית.',
  'השעה עברה. הרחוב שקט שוב, כאילו כלום.',
];

/* ------------------------------------------------------------------ *
 * The end
 * ------------------------------------------------------------------ */

export const REVEAL = [
  'שבעה דגלים. שבעה לילות.',
  'הדגל האחרון לא היה על עמוד ולא בתיבה. הוא היה על אבן קטנה '
    + 'בקצה הרחוב, ועליה שם — שם שאתה מכיר, כי הוא שלך.',
  'השכונה הזאת היא לילה אחד שחוזר על עצמו כבר עשרים שנה, '
    + 'ואתה לא גר בה. אתה זכור בה.',
  'האישה בשמלה הלבנה היא אמא שלך. השריקה היא השיר שהיא שרה לך לפני השינה. '
    + 'היא לא רדפה אחריך. היא קראה לך.',
];

export const ENDINGS = {
  take: {
    title: 'לקחת את הדגל',
    text: 'הרמת אותו מהאבן והוא היה קל בצורה מגוחכת. '
      + 'השריקה נפסקה — לא באמצע תו הפעם, אלא בסוף. '
      + 'היא עמדה בקצה הרחוב בלי לזוז, ואז לא עמדה שם. '
      + 'בבוקר יש שמש והדגלים בכל השכונה מורמים עד למעלה, '
      + 'ואין אף אחד ברחוב שיראה את זה.',
    note: 'הסוף שבו מישהו נותן לה ללכת.',
  },
  leave: {
    title: 'השארת אותו',
    text: 'לא הרמת. חזרת הביתה, נכנסת למיטה, וב-3:30 היא התחילה לשרוק. '
      + 'זה בסדר. יש עוד לילה, ועוד אחד. '
      + 'המדשאות מטופחות והשכנים מחייכים ואף אחד לא מדבר על הדגלים, '
      + 'ואתה כבר יודע למה.',
    note: 'הסוף שבו נשארים.',
  },
};
