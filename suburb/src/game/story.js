/*
 * story.js — everything the game says, and the one thing it never says.
 *
 * The plot is never narrated. It is in twelve objects lying around Pine Court
 * — six diary pages, three tapes, three photographs — and in what the
 * neighbours say in daylight without knowing they are saying it. A player who
 * picks up nothing finishes all seven nights and gets an ending that means
 * nothing to them; a player who reads everything gets the same ending and it
 * lands. That is the deal, and the game does not hedge it.
 *
 * Nothing here explains the mechanics either. Every rule of the night is a
 * fact about one October night in 2001, and the game lets the player put the
 * two together on their own — except in CONNECTIONS, which is the archive
 * page that opens after the seventh night and is allowed to say it out loud
 * because by then there is nothing left to spoil.
 *
 * The daytime dialogue is doing a second job: the clues the night's puzzles
 * need are in it. That is why these are functions of the layout rather than a
 * table of strings — tonight's code and this week's doll ages are decided in
 * layout.js, and the neighbour has to know them.
 *
 * The cutscenes are all arrays of beats of one shape, { speaker, text, ms },
 * including the ones that are a single line. One shape means the cutscene
 * player is a loop and nothing else, and it means the 22:30 note or the 3:29
 * wake can grow a second beat later without anybody touching code.
 */

/* ------------------------------------------------------------------ *
 * Things you can find
 *
 * Her handwriting from 1994 to the second of October 2001, three tapes, three
 * photographs, and one page at the back in a different hand. They are in
 * order here because the archive lists them in this order; in the world they
 * are scattered over the street by slot, so no two saves tell it in the same
 * sequence and the arc has to survive being read backwards.
 * ------------------------------------------------------------------ */

export const COLLECTIBLES = [
  {
    id: 'j1', kind: 'journal', title: 'יומן — 12 בספטמבר 1994',
    text: 'עברנו. הבית קטן מהתמונות, אבל הרחוב שקט ואין בו כמעט מכוניות, '
      + 'ובשביל זה עברנו. לשכן מ-16 יש דגל אדום קטן על המרפסת. '
      + 'שאלתי אותו בשביל מה. הוא אמר "קישוט" והמשיך להשקות.',
  },
  {
    id: 'j2', kind: 'journal', title: 'יומן — 2 במאי',
    text: 'הוא לא נרדם בלי השיר. המצאתי אותו בבית החולים כי לא זכרתי אף שיר '
      + 'ערש שלם, ומאז אין דרך חזרה. שמונה תווים. הוא כבר מזהה אותם כשאני רק '
      + 'מתחילה, ואם אני מדלגת על הרביעי הוא פוקח עיניים.',
  },
  {
    id: 't1', kind: 'tape', title: 'קלטת VHS — "יום הולדת 6"',
    text: 'מצלמת יד. מדשאה, שולחן, בלונים. אישה בשמלה בהירה מדליקה שש נרות '
      + 'ושרה. הקול לא נקלט — רק שריקה של רוח על המיקרופון, שמונה תווים '
      + 'ארוכים. ילד מכבה, כולם מוחאים כפיים, והוא מסתכל למצלמה ולא אליה.',
  },
  {
    id: 'p1', kind: 'photo', title: 'תצלום — ארבעה צעצועים על מדשאה',
    text: 'דובי, כובע אדום, כדור וספר עומדים בשורה על דשא מכוסח, מצולמים '
      + 'מגובה של ילד. לפני כל אחד מהם מונחת לוחית קטנה עם גיל, בכתב יד של '
      + 'מבוגר. הם עדיין עומדים באחת החצרות ברחוב הזה. לא באותו סדר.',
  },
  {
    id: 'j3', kind: 'journal', title: 'יומן — 19 בספטמבר',
    text: 'הערפל עולה מהגן אחרי חצות ונשאר עד הבוקר. הוא נעצר בגובה החזה, ככה '
      + 'שרואים את הפנסים ולא רואים את הכביש. אדם מתעורר ממנו בבהלה. '
      + 'אתמול מצאתי אותו עומד ליד דלת הכניסה עם הנעליים ביד.',
  },
  {
    id: 'j4', kind: 'journal', title: 'יומן — 26 בספטמבר',
    text: 'שאלתי את בוב מ-16 למה הוא משקה את הדשא בשלוש לפנות בוקר. הוא אמר '
      + '"כדי שלא יישרף", וחייך. הלילה היו תשע מעלות. כולם ברחוב הזה ערים '
      + 'בשעה הזאת, ואף אחד לא אומר את זה בקול.',
  },
  {
    id: 'j5', kind: 'journal', title: 'יומן — 2 באוקטובר 2001',
    text: 'הוא יצא שוב אתמול בלילה. עד הגן, יחף. אם זה יקרה עוד פעם אני לא '
      + 'ארוץ אחריו — כשרצתי הוא נבהל ונכנס עמוק יותר לתוך הערפל. אני אשרוק. '
      + 'את השיר הוא מכיר גם כשהוא לא רואה כלום.',
  },
  {
    id: 't2', kind: 'tape', title: 'קלטת VHS — ללא תווית',
    text: 'שלושים שניות של תקרה. מישהו הניח את המצלמה על השולחן ושכח לכבות '
      + 'אותה. שומעים דלת. שומעים אותה קוראת בשם, פעמיים; בפעם השנייה הקול '
      + 'כבר מבחוץ. אחר כך שריקה, שמונה תווים, ועוד פעם, ועוד פעם — רחוק '
      + 'יותר בכל פעם. הכלב לא מפסיק לנבוח עד סוף הקלטת.',
  },
  {
    id: 't3', kind: 'tape', title: 'קלטת VHS — מצלמת אבטחה, הצומת',
    text: 'השעה בפינה למטה. ב-3:34 אישה חוצה את הכביש מימין לשמאל, לאט, '
      + 'ועוצרת באמצע כי משהו קורא לה מכיוון אחר. ב-3:35 הערפל מגיע לצומת '
      + 'והתמונה נעשית לבנה לגמרי. כשהיא חוזרת להיות אפורה, הכביש ריק. '
      + 'בהמשך אותה קלטת, שלושה ימים אחר כך, עוברים בצומת אנשים עם פנסים, '
      + 'אחד אחרי השני. בסוף השורה הולך ילד קטן שאף אחד לא מחזיק לו את היד, '
      + 'ובידו משהו אדום.',
  },
  {
    /*
     * The fuse cabinet. The lock in the park is four switches with a strip of
     * red tape on one of them, and this is the only thing in the game that
     * says where the tape came from — so the photograph has to show a switch
     * with red tape on it and the back of it has to be in her handwriting.
     * The cabinet in the photograph is the one in the hall of number 21; the
     * one in the park has the same mark on it, and nothing anywhere says why.
     */
    id: 'p2', kind: 'photo', title: 'תצלום — לילה של סערה',
    text: 'ילד בפיג׳מה עומד במסדרון עם פנס ביד ומחייך רחב מדי לתמונה. '
      + 'מאחוריו ארון החשמל פתוח, ועל אחד המפסקים סרט דביק אדום. '
      + 'מאחורי התצלום, בכתב היד שלה: "כדי שלא יפחד מהחושך."',
  },
  {
    id: 'p3', kind: 'photo', title: 'תצלום — אבן קטנה',
    text: 'אבן נמוכה בקצה הרחוב, ועליה שם — אוולין מארלו — ושני תאריכים, '
      + '1967 ו-2001. על האדמה לפניה מונח דגל נייר אדום על מקל גלידה, דהוי '
      + 'כמעט ללבן. מאחורי התצלום, בכתב יד של ילד: "שתדעי איפה הבית."',
  },
  {
    id: 'j6', kind: 'journal', title: 'יומן — הדף האחרון',
    text: 'כתב יד אחר. עט אחר. אין תאריך. "אני עדיין שומע את השיר כל לילה, '
      + 'וכל לילה הוא יוצא לי לא נכון — שמונה תווים ואני נתקע ברביעי. '
      + 'היא יוצאת ב-3:30 כי אז היא יצאה. כשאני עומד בלי לזוז היא לא רואה '
      + 'אותי, כי היא מחפשת מישהו שרץ. אני מצטער שרצתי."',
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
 * The layout owns tonight's numbers, and layout.js is a moving target. A
 * neighbour who has to say a number out loud must come out vague when the
 * field is missing rather than say "undefined" or throw in the middle of a
 * conversation — a crash here costs the player the clue and the afternoon.
 */
function say(value, fallback) {
  return value === undefined || value === null || value === '' ? fallback
    : String(value);
}

/*
 * What a neighbour says, in order, one line per press of E. The first line is
 * a person being pleasant and the last lines carry the clues, which is what
 * makes the clues worth pressing for. Houses with two things to give end on
 * the one that is harder to find out any other way.
 *
 * One press is one subtitle and main.js gives a subtitle six seconds, so a
 * line that carries two facts is written as two lines. Six seconds is about
 * twenty words of Hebrew; the half of a sentence that does not fit is a clue
 * the player was told and never got to read.
 *
 * These people are empty faces keeping a routine going. They are friendly,
 * they are helpful, and every one of them is a beat away from noticing that
 * they do not know why they are doing any of it.
 */
export function neighbourLines(house, layout, night) {
  const p = layout?.puzzles || {};
  const who = house?.occupant?.name || 'השכן';
  /*
   * The trait is layout.js's one-line sketch of the person and it is written
   * about them, not by them — "waters his lawn at odd hours and smiles", "his
   * back fence leans on the park". Inside the quotation marks it came out as
   * a man introducing himself in the third person, so it stands outside them,
   * as the line of description it always was.
   */
  const trait = house?.occupant?.trait;
  const base = [`${who}: "בוקר טוב."${trait ? ` ${trait}.` : ''}`];
  /* `house` itself is optional for the same reason case 17 exists: a bad
   * houseId reaching this far should cost a line of dialogue, not the
   * afternoon. An unknown number falls through to the default branch. */
  switch (house?.number) {
    case 11: {
      /*
       * The order is a fact about the toys' ages and the ages are not written
       * on the toys — they are on three plaques in number 13's garden, which
       * is a different garden in the dark with a woman in it. So the man who
       * owned them recites the plaques from memory, word for word, and a
       * player who did the afternoon walk never has to read them at 3:33.
       *
       * The clue strings already carry their own quotation marks, so they go
       * in as they are rather than being quoted again — and one per press,
       * not all three in one line. A subtitle is on screen for six seconds
       * and three plaques joined into one sentence ran off the end of it,
       * which loses the ages, which is the only thing this house is for.
       */
      const dolls = p.dolls || {};
      const plaques = Array.isArray(dolls.clues) ? dolls.clues : [];
      return base.concat([
        /* His trait is already on the line above, in the third person, so he
         * does not open by saying it again in the first. */
        '"מה שנתלה על הגדר האחורית שלי בלילה נשאר שם עד הבוקר, '
          + 'ואף אחד לא מוריד."',
        '"הצעצועים בגינה של 13 היו של הבת שלי. אני חושב שהייתה לי בת."',
        /* The dolls stand at 13 but the lock they open is the flag on this
         * man's own back fence — there is no gate at 13 to speak of, and the
         * line used to say there was. */
        '"אם משהו נתקע לי על הגדר ואי אפשר להוריד אותו — תעמיד אותם לפי גיל, '
          + 'מהמבוגר לצעיר. לא לפי גובה. לפי גיל."',
        plaques.length
          ? '"מה שכתוב על הלוחיות אני יודע בעל פה."'
          : '"מה שכתוב על הלוחיות בגינה עדיין קריא, אם מתכופפים."',
      ], plaques);
    }
    case 12: {
      /*
       * The chain on his gate wants the number of white hedge panels, and
       * there really are that many out there — a player who does not trust
       * him can count them, at 3:33, standing still in the open. That is the
       * whole trade the afternoon is for, so the number is said out loud.
       */
      const panels = say(p.hedges?.answer, '47');
      return base.concat([
        '"ארגזים ליד המוסך, כן. אני כל הזמן אומר שאפנה אותם."',
        '"מצד שני, פעם ילד עלה עליהם עד לגג ולא ידעתי איך להוריד אותו."',
        '"הסולם שבגן הוא שלי. הוא צורח כשגוררים אותו — '
          + 'תגרור אותו רק כשמשהו אחר עושה רעש."',
        `"השער נעול בשרשרת עם קוד, והקוד הוא כמה משוכות לבנות יש לי: `
          + `${panels}. צבעתי אותן לבד וספרתי פעמיים."`,
      ]);
    }
    case 13: {
      /*
       * How many notes the radio is playing is the layout's number, and a
       * person says it as a word rather than as a digit. It is only said at
       * all while it is still four: a neighbour who counts them out loud and
       * gets it wrong is worse than a neighbour who does not count.
       */
      const heard = p.radio?.notes?.length || p.radio?.digits;
      const count = heard === 4 ? 'ארבעה תווים, ועוד פעם אותם תווים'
        : 'את אותם תווים שוב ושוב';
      return base.concat([
        '"הצעצועים על הדשא לא שלי. הם היו כאן לפני, בדיוק ככה. '
          + 'תשאל ב-11, הוא זוכר עליהם דברים."',
        '"המכונית נעולה בקודן מאז שעברנו, ואף אחד לא זוכר מי נעל אותה."',
        /* The radio plays the four notes over and over; the neighbour hands
         * over the way to turn notes into digits and nothing else, because
         * the notes themselves are audible from the driveway. */
        `"הרדיו בפנים דולק כל היום ומנגן ${count}."`,
        '"על מגן השמש יש מדבקה של פסנתר, והקלידים הלבנים ממוספרים מ-C. '
          + 'משם מקבלים את הקוד."',
      ]);
    }
    case 14: {
      /*
       * The arithmetic belongs to the layout, because the layout is what the
       * lock actually checks. If it changes the rule it can put the new
       * sentence on `puzzles.code.rule` and this line says that instead — a
       * neighbour reciting a rule the keypad no longer uses is the worst
       * failure this file has, since it looks like the player is bad at
       * arithmetic.
       *
       * Today there is no such field, so the sentence below is the fallback
       * and the fallback is house minus three times two, written out. That is
       * exactly the thing that goes stale without anybody noticing, so it is
       * tried against the answer the keypad is actually holding before it is
       * said out loud, and when the two disagree she stops reciting and points
       * at the engraving, which is on the lid and cannot be out of date.
       */
      const code = p.code || {};
      const fits = String((code.houseNumber - 3) * 2) === String(code.answer);
      const rule = say(code.rule, fits ? 'מספר הבית שלי, פחות שלוש, כפול שתיים' : '');
      return base.concat([
        '"התיבה נעולה, כן. הבן שלי שם את הקוד כשהיה בן עשר."',
        /* "That is engraved on the box", not "the number is engraved on the
         * box": the layout is allowed to replace the rule with one that is
         * not about the house number at all. */
        rule
          ? `"הוא אמר: ${rule}. זה חרוט על התיבה, אם לא שכחת לקרוא."`
          : '"מה שהוא אמר חרוט על המכסה עצמו. אני כבר לא זוכרת את זה בעל פה."',
      ]);
    }
    case 15:
      return base.concat([
        '"הכלב נובח על כל דבר, סליחה מראש. הוא לא היה ככה פעם."',
        '"מאז הערפל ההוא הוא לא מפסיק. כמה שנים זה כבר?"',
        '"אם אתה חייב להיכנס לחצר האחורית — יש לו עצם."',
        '"הבעלים הקודמים של 13 קברו אותה מתחת למרפסת שלהם, והוא לא שכח איפה. '
          + 'כלב לא שוכח דברים כאלה."',
      ]);
    case 16:
      /* Bob. He is the only one who says the night out loud, in daylight, in
       * the same tone he uses for the lawn. */
      return base.concat([
        night >= 4
          ? '"אתה נראה עייף. זה עובר. לכולם זה עובר."'
          /* Not "second week already?": the opening is his first week in the
           * street and the first night is the night after it. */
          : '"נו? אמרתי לך שתתרגל."',
        '"החור בדשא — אני חפרתי אותו. אני לא זוכר בשביל מה, אבל אני חפרתי."',
        '"שלוש תיבות נגינה של אמא שלי. שתיים מהן מנגנות את השיר לא נכון, '
          + 'בתו הרביעי."',
        /* Bob is the only person in daylight who mentions the night, and he
         * does it in the voice he uses for the lawn. He does not say what the
         * right version is, because the player has heard the wrong one for
         * three nights and will know it when it stops. */
        '"אחת מנגנת אותו כמו שהוא. אתה תדע להבדיל."',
      ]);
    case 17:
      /*
       * Nobody has lived here for twenty years, so nobody stands in this
       * garden in the afternoon and this branch should never run. It is here
       * because a person with the wrong houseId did run it once, and a crash
       * in the middle of a conversation is worse than a line nobody hears.
       * The clue for this house is in number 18's mouth, across the road.
       */
      return ['הבית הזה ריק. אין עם מי לדבר.'];
    case 18: {
      /*
       * The fuse cabinet at the edge of the park, which is the one lock with
       * nothing on it to read: the strip of red tape is in a photograph and
       * the cabinet in the world is a closed metal box with four identical
       * switches in it. Without this sentence that night is a one-in-four
       * guess, and a wrong switch is a buzzer loud enough to bring her.
       *
       * The layout rewires the cabinet every night, so the number is read off
       * the puzzle rather than written here, and a missing one leaves the
       * couple saying only that somebody marked one of them once.
       */
      const sw = p.panel?.answer;
      const which = Number.isInteger(sw) ? `מפסק ${sw + 1}` : '';
      return base.concat([
        '"הפחים בסמטה, כן. שלושה, קשורים זה לזה בשרשרת, '
          + 'ואף אחד לא זוכר למה."',
        '"הסדר שלהם? מה שקוראים, אחר כך מה ששותים, אחר כך מה שמצלצל. '
          + 'ככה זה תמיד היה."',
        /* 17 is on the other side of the road and two plots along, not next
         * door — the numbers run opposite ways on the two sides. */
        '"הבית הריק בצד השני של הכביש, 17 — אל תיכנס לשם בלילה. '
          + 'גם לא ביום, אם אפשר."',
        /* The mirror lock is a sentence written on the glass, not a code —
         * "the flag is under board 3 on the porch" — so the neighbour has to
         * describe writing rather than digits. These two follow the line
         * about number 17 because both of them say "his" and mean it. */
        '"מישהו כתב משפט שלם על חלון המטבח שלו מבפנים, לפני הרבה שנים. '
          + 'מהחצר זה נראה הפוך."',
        '"יש שם מראה ישנה שעונה על הגדר האחורית. משם קוראים אותו נכון."',
        which
          ? `"בארון החשמל בקצה הגן ארבעה מפסקים. המשאבה של המזרקה על ${which}."`
          : '"בארון החשמל בקצה הגן ארבעה מפסקים, ואחד מהם מפעיל את המזרקה."',
        '"מישהו הדביק עליו פעם סרט אדום. מי שהדביק אותו כבר לא גר כאן."',
      ]);
    }
    case 21:
      /*
       * Adam's own house. He can press E on it in the afternoon like on
       * anything else, and the answer has to be his own voice, because there
       * is nobody else in this garden and there never was.
       */
      return [
        'הבית שלך. שבוע.',
        'על השידה עומד שעון מעורר שאתה לא זוכר שכיוונת.',
        'הדלת הזאת היא הקו. מה שעובר אותה לפני 3:35 נמצא בבית.',
      ];
    default:
      return base.concat([
        night >= 4
          ? '"אתה נראה עייף. גם אני לא ישן טוב לאחרונה. אף אחד לא."'
          : '"אם אתה צריך משהו — אנחנו כאן. תמיד היינו כאן."',
        '"הדגל? קישוט. אל תשאל."',
      ]);
  }
}

/* ------------------------------------------------------------------ *
 * The cutscenes
 *
 * Beats, not paragraphs: { speaker, text, ms }, where speaker is 'bob',
 * 'adam' or null for description and for Adam's own thoughts. `ms` is how
 * long the beat holds, and it is content rather than pacing metadata — the
 * two-second silence in the opening is the whole joke of the scene and it has
 * to actually last two seconds.
 * ------------------------------------------------------------------ */

/* 19:00, the first evening. Nothing happens in it. That is the point: every
 * strange thing in the scene is a thing a friendly man says over a fence. */
export const OPENING = [
  { speaker: null, text: '19:00. שבוע ראשון באורנים 21. מעבר לגדר מישהו משקה '
    + 'דשא שכבר רטוב.', ms: 4200 },
  { speaker: 'bob', text: 'ערב טוב, אדם! שבוע ראשון בשכונה, איך מרגיש?',
    ms: 3600 },
  { speaker: 'adam', text: 'שקט. כמעט... מדי.', ms: 2800 },
  { speaker: null, text: 'החיוך לא זז.', ms: 1600 },
  { speaker: 'bob', text: 'תתרגל. כולם מתרגלים.', ms: 3000 },
  { speaker: null, text: 'על המרפסת שלו, על מקל, דגל אדום קטן.', ms: 3000 },
  { speaker: 'adam', text: 'בוב... מה הדגל הזה?', ms: 2600 },
  /* Two seconds, and the beat says two seconds, so it lasts two seconds. */
  { speaker: null, text: 'שתי שניות. אותו חיוך.', ms: 2000 },
  { speaker: 'bob', text: 'קישוט.', ms: 2400 },
  { speaker: null, text: 'הוא ממשיך להשקות. המים כבר מגיעים למדרכה.',
    ms: 3600 },
];

/* 22:30. The photograph is the only thing in the game that was not there a
 * moment ago, and nobody ever mentions it again. */
export const TABLE_NOTE = [
  { speaker: null, text: '22:30. על שולחן המטבח מונח תצלום ישן שלא היה שם '
    + 'בבוקר.', ms: 4000 },
  { speaker: null, text: 'אישה מחזיקה ילד. הפנים שלה מרוחות — לא בצילום, '
    + 'בנייר עצמו, כאילו מישהו העביר עליהן אצבע הרבה מאוד פעמים.', ms: 5200 },
  { speaker: null, text: 'מתחת לתצלום פתק, בכתב יד של ילד: '
    + '"תחזיר את הדגל הביתה."', ms: 4400 },
  { speaker: 'adam', text: 'אני לא זוכר שקניתי את זה.', ms: 3000 },
];

/*
 * 00:00, over black. Twenty seconds, and the four beats add up to exactly
 * twenty, because this is the only place in the entire game where the lullaby
 * is heard the way it really was — warm, in the right order, eight notes that
 * do not stumble on the fourth. Everything the player hears from 3:30 onwards
 * is this, remembered by someone who blames himself.
 *
 * The silence at the end is seven seconds and it is meant to be too long.
 */
export const DREAM = [
  { speaker: null, text: 'צחוק של ילד. קרוב מאוד.', ms: 4000 },
  { speaker: null, text: 'שריקה, רחוקה. שמונה תווים, חמים, בסדר הנכון.',
    ms: 7000 },
  { speaker: null, text: 'צפירה של מכונית.', ms: 2000 },
  { speaker: null, text: 'שקט.', ms: 7000 },
];

/* 3:29. One minute early, every night, with no alarm and no noise. */
export const WAKE = [
  { speaker: null, text: '3:29. אין רעש. אין סיבה.', ms: 2600 },
  { speaker: 'adam', text: 'למה אני ער?', ms: 2600 },
];

/*
 * 3:32 on the first night, the first time she is on screen. She does nothing,
 * and the beats are ordered so that the player has already decided she is a
 * statue before the last one.
 */
export const FIRST_SIGHT = [
  { speaker: null, text: 'בקצה הרחוב עומדת אישה.', ms: 3000 },
  { speaker: null, text: 'היא לא זזה. הכתפיים לא זזות, השמלה לא זזה, '
    + 'האור על השמלה לא זז.', ms: 4600 },
  { speaker: null, text: 'רק הראש מסתובב.', ms: 3800 },
];

/* 7:00. The same two lines every morning, and the last one is the same
 * promise every morning, which is what makes it a threat. */
export const MORNING = [
  { speaker: null, text: '7:00. שמש. ממטרה. בוב מעבר לגדר.', ms: 3000 },
  { speaker: 'bob', text: 'בוקר טוב, אדם! ישנת טוב?', ms: 3000 },
  { speaker: 'adam', text: 'כן. מצוין.', ms: 2200 },
  { speaker: 'bob', text: 'טוב. הלילה יהיה עוד יותר טוב.', ms: 3600 },
];

/* ------------------------------------------------------------------ *
 * The nights
 * ------------------------------------------------------------------ */

/* Shown once when a night begins, over the black. Seven lines, and they are
 * the only place the game speaks in its own voice. */
export const NIGHT_INTRO = [
  'הלילה הראשון. שלוש וחצי, ומישהי שורקת ברחוב שאין בו אף אחד.',
  'שוב. אותה שעה, אותה מנגינה — רק מהר יותר, כאילו מישהו דוחק בה.',
  'השכנים עומדים בגינות שלהם בחושך. הם ישנים. אל תעיר אותם.',
  'הלילה היא התחילה ב-3:28. שתי דקות שאין בהן דגל ואין מה לעשות בהן '
    + 'חוץ מלהתחבא.',
  'הדגל לא נשאר במקום יותר מדקה. שום דבר כאן לא נשאר, חוץ ממנה.',
  'כל הדלתות בשכונה פתוחות הלילה. גם היא יודעת.',
  'הלילה השביעי. היא כבר לא מחפשת אותך. היא יודעת בדיוק איפה אתה, '
    + 'והיא באה לאט.',
];

/*
 * What the screen says when the night resets. Deliberately short and never
 * jokey: this screen is the punishment and it should be over fast.
 *
 * main.js takes one of these by the attempt count rather than by what
 * happened, so none of them may claim a fact the game has not checked. They
 * used to: one said the dog had barked and one said the flag was in your hand,
 * on nights with no dog and no flag. What is left is either always true — the
 * whistle really is cut mid-note when she sees you, and nowhere else — or a
 * rule of the world, which is true whichever of the five ways it went.
 */
export const CAUGHT_LINES = [
  'השריקה נפסקה באמצע תו.',
  'היא הסתובבה כי זזת. רק בגלל זה.',
  'זזת, והדבר היחיד שהיא יודעת לראות זה ילד שרץ.',
  'אדום נראה מרחוק. גם בלילה. במיוחד בלילה.',
  'היא הולכת אל הרעש. כל רעש.',
];

/* The other way to lose, and the whistle ends differently: at 3:35 it finishes
 * the phrase and stops on its own, which is the whole difference between being
 * too slow and being seen. */
export const TIMEOUT_LINES = [
  '3:35. השריקה נגמרה לבד, והדגל לא בבית.',
  'השעה עברה. הרחוב שקט שוב, כאילו לא קרה כלום. ככה זה היה גם אז.',
];

/* ------------------------------------------------------------------ *
 * The end
 * ------------------------------------------------------------------ */

/*
 * Four paragraphs, and the indices are load-bearing: main.js shows REVEAL[1]
 * on its own as a subtitle while the player is still walking, and puts
 * REVEAL[3] above the two buttons of the last choice. So [1] has to stand
 * alone without the rest, and [3] has to be the paragraph that makes taking
 * the flag or leaving it mean something — without telling the player which
 * one is the good one, because neither is.
 */
export const REVEAL = [
  /* Not "the seventh one was on a small stone at the end of the road": the
   * seventh site is whichever of the ten the save drew, and it is as likely
   * to be a bin in an alley as anything else. The stone is where the flag
   * came from, which is a fact about all seven of them and stays true
   * wherever the player happens to be standing when they read this. */
  'שבעה דגלים, שבעה לילות, וכולם אותו דגל אחד: דגל נייר על מקל גלידה, '
    + 'שמישהו השאיר פעם על אבן קטנה בקצה הרחוב.',
  'על האבן שם, אוולין מארלו, ושני תאריכים. השני מהם היה לפני עשרים שנה, '
    + 'והיא הייתה אז בת שלושים וארבע. היא עדיין בת שלושים וארבע.',
  'השכונה הזאת היא לילה אחד שחוזר על עצמו עשרים שנה, ואתה לא גר בה — '
    + 'אתה בנית אותה. השכנים מחייכים כל בוקר כי ביקשת שמישהו יגיד לך '
    + 'בוקר טוב, ולא ביקשת יותר מזה.',
  'האישה שיוצאת כל לילה ב-3:30 היא אמא שלך, והיא יצאה לחפש ילד שברח מהבית '
    + 'בערפל. השריקה היא שיר הערש שהיא המציאה לך, כמו שאתה זוכר אותו עכשיו. '
    + 'היא אף פעם לא רדפה אחריך. היא קראה לך. '
    + 'והדגל למרגלות האבן הוא דגל הנייר שהשארת לה שם כשהיית בן שש, '
    + 'שתדע איפה הבית.',
];

/*
 * The two endings, and the labels are the two buttons — so both titles are
 * infinitives, because a button that says "you left it" is telling the player
 * what they already did instead of offering them a choice.
 */
export const ENDINGS = {
  take: {
    title: 'לקחת את הדגל',
    /* "You picked it up", not "you picked it up off the stone": the last
     * flag is wherever the save put it, and the ending is read standing
     * there. */
    text: 'הרמת אותו והוא היה נייר, וכבד בערך כמו שנייר כבד. '
      + 'השריקה לא נפסקה באמצע תו הפעם — היא הגיעה לתו השמיני וגמרה אותו. '
      + 'היא עמדה בקצה הרחוב בלי לזוז, ואז לא עמדה שם. '
      + 'בבוקר יש שמש, והדגלים בכל השכונה מורמים עד למעלה, '
      + 'ואין ברחוב אף אחד שיראה את זה, וזה בסדר.',
    note: 'הסוף שבו אתה סולח לעצמך.',
  },
  leave: {
    title: 'להשאיר אותו שם',
    text: 'לא הרמת. חזרת הביתה, נכנסת למיטה, וב-3:29 היית ער בלי סיבה. '
      + 'זה בסדר. יש עוד לילה, ועוד אחד, ואתה כבר יודע איפה כל הגדרות. '
      + 'המדשאות מטופחות והשכנים מחייכים ואף אחד לא מדבר על הדגלים, '
      + 'ואתה היחיד שיודע למה.',
    note: 'הסוף שבו הכל נשאר בדיוק כמו שהיה.',
  },
};

/*
 * The archive page that opens after the seventh night: what each rule of the
 * game actually was. It is the one place the game explains itself, and it is
 * behind the ending on purpose — read before the seventh night it would turn
 * every mechanic into a puzzle about the plot instead of a thing you do in
 * the dark with two minutes left.
 */
export const CONNECTIONS = [
  {
    thing: 'השעה 3:30',
    meaning: 'הרגע שבו היא יצאה לחפש אותו. חמש הדקות הן חמש הדקות שהיו לה, '
      + 'ואי אפשר לקצר אותן ואי אפשר להאריך אותן.',
  },
  {
    thing: 'השריקה',
    meaning: 'שיר הערש שהיא המציאה לו בבית החולים. שמונה תווים. '
      + 'היא שרקה אותם באותו לילה כדי שיוכל למצוא אותה בחושך. '
      + 'ככה הוא זוכר אותם עכשיו.',
  },
  {
    thing: 'הדגל האדום',
    meaning: 'דגל נייר שילד בן שש הכין והניח למרגלות האבן. '
      + '"שתדעי איפה הבית." כל לילה הוא מחזיר אותו הביתה בשבילה.',
  },
  {
    thing: 'לעמוד בלי לזוז',
    meaning: 'היא מחפשת ילד שרץ. ילד שעומד היא לא רואה, וזאת הסיבה היחידה '
      + 'שאפשר לשרוד את הלילה הזה.',
  },
  {
    thing: 'ארבע הבובות בגינה',
    meaning: 'הצעצועים שלו מהתצלום. הוא מסדר אותם לפי גיל כי ככה היא '
      + 'לימדה אותו לספור.',
  },
  {
    thing: 'הכלב שנובח בחצר',
    meaning: 'כלב המשפחה. הוא נבח באותו לילה ולא הפסיק, וגם בקלטת שומעים '
      + 'אותו עד הסוף.',
  },
  {
    thing: 'הסרט האדום על מפסק החשמל',
    meaning: 'היא סימנה אותו בסערה, כדי שאדם לא יפחד מהחושך אם יצטרך '
      + 'למצוא אותו לבד.',
  },
  {
    thing: 'השכנים',
    meaning: 'פנים ריקות ששומרות על השגרה כדי שהוא לא ישתגע. '
      + 'לכן הם תמיד בגינה, ולכן הם אף פעם לא מדברים על הדגל.',
  },
];
