import { getLanguage } from './localization';

export interface LocalizedText {
  he: string;
  en: string;
}

export function localized(text: LocalizedText): string {
  return getLanguage() === 'en' ? text.en : text.he;
}

/* ------------------------------------------------------------------ */
/* Objectives                                                          */
/* ------------------------------------------------------------------ */

export const OBJECTIVES: Record<string, LocalizedText> = {
  p_enter: { he: 'היכנס לבניין ברחוב הרקפת 12', en: 'Enter the building at 12 Rakefet St.' },
  p_power: { he: 'מצא את ארון החשמל בלובי', en: 'Find the electrical cabinet in the lobby' },
  p_elevator: { he: 'היכנס למעלית', en: 'Step into the elevator' },
  p_press: { he: 'לחץ על קומת הקרקע', en: 'Press the ground floor button' },

  c1_look: { he: 'בדוק את המסדרון', en: 'Survey the corridor' },
  c1_fuse: { he: 'מצא נתיך למעלית', en: 'Find a fuse for the elevator' },
  c1_panel: { he: 'החזר חשמל בלוח שבמסדרון', en: 'Restore power at the corridor panel' },
  c1_return: { he: 'חזור למעלית', en: 'Return to the elevator' },

  c2_switch: { he: 'הפעל את המתג בדירה 01', en: 'Trip the switch inside apartment 01' },
  c2_return: { he: 'חזור למעלית — המערכת מקליטה', en: 'Return to the elevator — you are being recorded' },
  c2_wait: {
    he: 'עמוד ליד השער בזמן שהחיקוי מפעיל את המתג',
    en: 'Wait at the shutter while the mimic trips the switch',
  },
  c2_lever: { he: 'משוך את ידית האיפוס בקצה המסדרון', en: 'Pull the reset lever at the end of the corridor' },

  c3_apartment: { he: 'היכנס לדירה 03', en: 'Enter apartment 03' },
  c3_clocks: { he: 'כוון את ארבעת השעונים', en: 'Set the four clocks' },
  c3_service: { he: 'היכנס לחדר השירות', en: 'Enter the service room' },

  c4_kids: { he: 'היכנס לדירה 02', en: 'Enter apartment 02' },
  c4_toys: { he: 'שחזר את סדר הצלילים', en: 'Reproduce the order of the sounds' },
  c4_key: { he: 'קח את מפתח הבקרה', en: 'Take the control key' },

  c5_door: { he: 'מצא את הדלת הנסתרת במסדרון', en: 'Find the hidden door in the corridor' },
  c5_run: { he: 'רוץ. אל תעצור', en: 'Run. Do not stop' },
  c5_choose: { he: 'בחר מה לעשות עם המערכת', en: 'Decide what to do with the system' },
};

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export interface NoteDef {
  id: string;
  title: LocalizedText;
  body: LocalizedText;
}

export const NOTES: Record<string, NoteDef> = {
  note_board: {
    id: 'note_board',
    title: { he: 'לוח מודעות — ועד הבית', en: 'Notice board — building committee' },
    body: {
      he: 'לתשומת לב הדיירים:\nהמעלית תושבת לצורך בדיקה בין 23:00 ל־01:00.\nנא לא להשתמש במדרגות הדרומיות. הן סגורות.\n\nאין לרדת מתחת לקומת הקרקע.',
      en: 'Residents:\nThe lift will be out of service for inspection between 23:00 and 01:00.\nPlease do not use the south stairwell. It is closed.\n\nDo not go below the ground floor.',
    },
  },
  note_cabinet: {
    id: 'note_cabinet',
    title: { he: 'מדבקה על ארון החשמל', en: 'Sticker on the cabinet' },
    body: {
      he: 'מעגל 4 — מעלית.\nהנתיך נשרף שוב. לקחתי אחד מהמסדרון.\nאם המעלית עוצרת מתחת לקרקע — אל תצא ממנה.',
      en: 'Circuit 4 — lift.\nThe fuse blew again. I took one from the corridor.\nIf the lift stops below ground — do not step out.',
    },
  },
  note_floor: {
    id: 'note_floor',
    title: { he: 'פתק מקומט', en: 'Crumpled note' },
    body: {
      he: 'קומה 0 אינה קומה.\nאל תתייחס אליה כאל מקום.',
      en: 'Floor 0 is not a floor.\nDo not treat it as a place.',
    },
  },
  note_mirror: {
    id: 'note_mirror',
    title: { he: 'פתק מאחורי התמונה', en: 'Note behind the picture' },
    body: {
      he: 'אם ראית את עצמך במסדרון, חכה עד שהוא יעבור.\nהוא לא עוקף. הוא ממשיך.',
      en: 'If you saw yourself in the corridor, wait until it passes.\nIt does not go around. It goes on.',
    },
  },
  note_switch: {
    id: 'note_switch',
    title: { he: 'פתק ליד המתג', en: 'Note by the switch' },
    body: {
      he: 'השער נסגר מהר מדי בשביל אדם אחד.\nהוא נבנה לשניים.\nיש לך שניים. אתה פשוט לא נמצא בשניהם באותו זמן.',
      en: 'The shutter closes too fast for one person.\nIt was built for two.\nYou have two. You are simply not in both at once.',
    },
  },
  note_system: {
    id: 'note_system',
    title: { he: 'דף מתוך תיק תחזוקה', en: 'Page from a maintenance file' },
    body: {
      he: 'המערכת אינה מקליטה וידאו.\nהיא מקליטה החלטות.',
      en: 'The system does not record video.\nIt records decisions.',
    },
  },
  note_report: {
    id: 'note_report',
    title: { he: 'דוח קריאה', en: 'Service report' },
    body: {
      he: 'קריאה 0317 — נפתחה 23:47.\nכתובת: הרקפת 12.\nטכנאי: —\n\nהערה: אין טכנאי בשם המופיע בדוח.',
      en: 'Call 0317 — opened 23:47.\nAddress: 12 Rakefet St.\nTechnician: —\n\nNote: no technician exists by the name on this report.',
    },
  },
  note_order: {
    id: 'note_order',
    title: { he: 'פתק על המקרר', en: 'Note on the fridge' },
    body: {
      he: 'הם עוצרים באותה שעה, אבל לא באותו רגע.\nכוון אותם לפי הסדר שבו הגעת:\nהקריאה. המספר. השנים. הרגע.',
      en: 'They stop at the same hour, but not the same moment.\nSet them in the order you arrived:\nThe call. The number. The years. The moment.',
    },
  },
  note_clock_hour: {
    id: 'note_clock_hour',
    title: { he: 'שובר על השולחן', en: 'Stub on the table' },
    body: {
      he: 'קריאת שירות נפתחה: 23:47.\nזמן הגעה משוער: 00:05.\nזמן הגעה בפועל: לא נרשם.',
      en: 'Service call opened: 23:47.\nEstimated arrival: 00:05.\nActual arrival: not recorded.',
    },
  },
  note_clock_number: {
    id: 'note_clock_number',
    title: { he: 'כתובת על הקיר', en: 'Writing on the wall' },
    body: {
      he: '0317\n0317\n0317\n\nזו לא קריאה. זו שעה.',
      en: '0317\n0317\n0317\n\nIt is not a call. It is an hour.',
    },
  },
  note_clock_last: {
    id: 'note_clock_last',
    title: { he: 'פתק בתוך שעון', en: 'Note inside a clock' },
    body: {
      he: 'האחרון כבר יודע.\nאל תיגע בו.',
      en: 'The last one already knows.\nDo not touch it.',
    },
  },
  note_toys: {
    id: 'note_toys',
    title: { he: 'ציור ילדים', en: "Child's drawing" },
    body: {
      he: 'ציירתי את הסדר כדי לא לשכוח.\nהוא מתחיל בלעדיי ואני מסיים.\nאם אני מסיים מאוחר מדי, הוא מתחיל שוב.',
      en: 'I drew the order so I would not forget.\nIt starts without me and I finish it.\nIf I finish too late, it starts again.',
    },
  },
  note_experiment: {
    id: 'note_experiment',
    title: { he: 'מסמך בחדר הבקרה', en: 'Document in the control room' },
    body: {
      he: 'הניסוי הצליח.\nהעותק מאמין שהוא הגיע מבחוץ.',
      en: 'The experiment succeeded.\nThe copy believes it came from outside.',
    },
  },
  note_versions: {
    id: 'note_versions',
    title: { he: 'רשימת קריאות שירות', en: 'List of service calls' },
    body: {
      he: '0311 — נסגרה.\n0312 — נסגרה.\n0313 — נסגרה.\n0314 — נסגרה.\n0315 — נסגרה.\n0316 — נסגרה.\n0317 — פתוחה.\n\nלכולן אותה כתובת. לכולן אותו טכנאי.',
      en: '0311 — closed.\n0312 — closed.\n0313 — closed.\n0314 — closed.\n0315 — closed.\n0316 — closed.\n0317 — open.\n\nSame address. Same technician.',
    },
  },
};

/* ------------------------------------------------------------------ */
/* Photographs                                                         */
/* ------------------------------------------------------------------ */

export interface PhotoDef {
  id: string;
  /** Which polaroid artwork to generate. */
  kind: number;
  /** Handwriting on the white border — kept short, it is drawn on the print. */
  caption: LocalizedText;
  title: LocalizedText;
  body: LocalizedText;
}

/**
 * Five instant photos hidden across Floor 0, left by whoever was called out
 * here before. They are entirely optional; finding all five develops a sixth.
 */
export const PHOTOS: PhotoDef[] = [
  {
    id: 'photo_1',
    kind: 0,
    caption: { he: 'ביקור ראשון', en: 'first visit' },
    title: { he: 'תצלום — המסדרון', en: 'Photograph — the corridor' },
    body: {
      he: 'צילום מיידי, מטושטש בקצוות.\nמסדרון ריק, מצולם מתוך המעלית.\n\nעל השוליים הלבנים כתוב בעט: „ביקור ראשון”.\nהתאריך מחוק.',
      en: 'An instant photo, soft at the edges.\nAn empty corridor, shot from inside the lift.\n\nWritten on the white border in pen: "first visit".\nThe date is rubbed out.',
    },
  },
  {
    id: 'photo_2',
    kind: 1,
    caption: { he: 'היא נשארה פתוחה', en: 'it stayed open' },
    title: { he: 'תצלום — דלת', en: 'Photograph — a door' },
    body: {
      he: 'דלת דירה פתוחה אל חושך גמור.\nאין פלאש בפנים. אין רצפה שנראית.\n\nעל השוליים: „היא נשארה פתוחה”.\nמתחת, בכתב אחר: „לא על ידי”.',
      en: 'An apartment door open onto complete darkness.\nNo flash inside. No floor visible.\n\nOn the border: "it stayed open".\nBeneath it, in a different hand: "not by me".',
    },
  },
  {
    id: 'photo_3',
    kind: 2,
    caption: { he: 'ירדתי לבד', en: 'i rode down alone' },
    title: { he: 'תצלום — המעלית', en: 'Photograph — the lift' },
    body: {
      he: 'תא המעלית, דלתות פתוחות, ריק.\n\nעל השוליים: „ירדתי לבד”.\nהצג בתמונה מראה 0, אבל התמונה צולמה מתוך התא —\nכלומר מישהו החזיק את המצלמה מבחוץ.',
      en: 'The lift car, doors open, empty.\n\nOn the border: "i rode down alone".\nThe display in the shot reads 0, but the picture was taken from inside the car —\nwhich means somebody held the camera outside it.',
    },
  },
  {
    id: 'photo_4',
    kind: 3,
    caption: { he: 'הם ציירו אותי', en: 'they drew me' },
    title: { he: 'תצלום — חדר הילדים', en: "Photograph — the children's room" },
    body: {
      he: 'קיר מכוסה ציורים.\n\nעל השוליים: „הם ציירו אותי”.\nבתצלום יש שישה ציורים. בחדר יש שישה.\nהם לא אותם ציורים.',
      en: 'A wall covered in drawings.\n\nOn the border: "they drew me".\nThere are six drawings in the photograph. There are six in the room.\nThey are not the same six.',
    },
  },
  {
    id: 'photo_5',
    kind: 4,
    caption: { he: 'הוא חיכה', en: 'it waited' },
    title: { he: 'תצלום — קצה המסדרון', en: 'Photograph — the far end' },
    body: {
      he: 'דמות עומדת בקצה המסדרון, גבה למצלמה.\n\nעל השוליים: „הוא חיכה”.\nהתמונה חדה. הדמות לא זזה בזמן החשיפה.\nאף אחד לא עומד כל כך בשקט.',
      en: 'A figure at the far end of the corridor, back to the camera.\n\nOn the border: "it waited".\nThe photo is sharp. The figure did not move during the exposure.\nNobody stands that still.',
    },
  },
];

export const PHOTO_BONUS: PhotoDef = {
  id: 'photo_6',
  kind: 5,
  caption: { he: 'מי צילם', en: 'who took these' },
  title: { he: 'תצלום — הצלם', en: 'Photograph — the photographer' },
  body: {
    he: 'חמישה תצלומים, ואף אחד מהם לא צולם על ידי מי שכתב עליהם.\nהשישי פותח את זה.\n\nבמסדרון עומדת דמות עם מצלמה, מכוונת קדימה.\nאין לה פנים. יש לה את המדים שלך.\n\nהמצלמה מכוונת בדיוק למקום שבו אתה עומד עכשיו.',
    en: 'Five photographs, and not one was taken by the person who wrote on them.\nThe sixth explains that.\n\nA figure stands in the corridor with a camera, aimed forward.\nIt has no face. It is wearing your uniform.\n\nThe camera is pointed exactly where you are standing now.',
  },
};

/* ------------------------------------------------------------------ */
/* Tapes                                                               */
/* ------------------------------------------------------------------ */

export interface TapeLine {
  at: number;
  text: LocalizedText;
}

export interface TapeDef {
  id: string;
  title: LocalizedText;
  duration: number;
  lines: TapeLine[];
}

export const TAPES: Record<string, TapeDef> = {
  tape_1: {
    id: 'tape_1',
    title: { he: 'קלטת 1', en: 'Tape 1' },
    duration: 10,
    lines: [
      {
        at: 0.4,
        text: {
          he: 'בדיקה ראשונה. המעלית נעצרת מתחת לקומת הקרקע,',
          en: 'First inspection. The lift stops below the ground floor,',
        },
      },
      {
        at: 4.6,
        text: {
          he: 'אבל לפי מד המרחק היא לא ירדה בכלל.',
          en: 'but according to the encoder it never descended at all.',
        },
      },
    ],
  },
  tape_2: {
    id: 'tape_2',
    title: { he: 'קלטת 2', en: 'Tape 2' },
    duration: 11,
    lines: [
      {
        at: 0.4,
        text: {
          he: 'אני שומע צעדים שחוזרים על המסלול שלי.',
          en: 'I hear footsteps repeating my route.',
        },
      },
      {
        at: 4.8,
        text: {
          he: 'הם תמיד מתחילים בדיוק דקה אחרי שאני נכנס.',
          en: 'They always start exactly one minute after I step in.',
        },
      },
    ],
  },
  tape_3: {
    id: 'tape_3',
    title: { he: 'קלטת 3', en: 'Tape 3' },
    duration: 11,
    lines: [
      {
        at: 0.4,
        text: {
          he: 'הוא פתח את הדלת לפני שנגעתי במתג.',
          en: 'It opened the door before I touched the switch.',
        },
      },
      {
        at: 5.0,
        text: {
          he: 'אני חושב שהוא כבר יודע מה אני עומד לעשות.',
          en: 'I think it already knows what I am about to do.',
        },
      },
    ],
  },
  tape_4: {
    id: 'tape_4',
    title: { he: 'קלטת 4', en: 'Tape 4' },
    duration: 11,
    lines: [
      {
        at: 0.4,
        text: {
          he: 'מצאתי את כרטיס העובד שלי בחדר הבקרה.',
          en: 'I found my own employee card in the control room.',
        },
      },
      {
        at: 5.0,
        text: {
          he: 'התאריך עליו מלפני שמונה שנים.',
          en: 'It is dated eight years ago.',
        },
      },
    ],
  },
  tape_5: {
    id: 'tape_5',
    title: { he: 'קלטת 5', en: 'Tape 5' },
    duration: 10,
    lines: [
      {
        at: 0.5,
        text: {
          he: 'מי שמקשיב לזה אינו אני.',
          en: 'Whoever is listening to this is not me.',
        },
      },
      {
        at: 4.6,
        text: {
          he: 'אבל כנראה שהוא חושב שכן.',
          en: 'But he probably thinks he is.',
        },
      },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* One-off lines                                                       */
/* ------------------------------------------------------------------ */

export const LINES: Record<string, LocalizedText> = {
  intro_dispatch_1: {
    he: '23:47 — קריאת שירות מספר 0317.',
    en: '23:47 — service call number 0317.',
  },
  intro_dispatch_2: {
    he: 'מעלית תקועה בבניין ברחוב הרקפת 12.',
    en: 'Lift stuck in the building at 12 Rakefet Street.',
  },
  intro_dispatch_3: {
    he: 'אין לכודים. נדרשת בדיקה.',
    en: 'Nobody trapped. Inspection required.',
  },
  tutorial_move: { he: 'WASD — תנועה', en: 'WASD — move' },
  tutorial_look: { he: 'הזז את העכבר כדי להסתכל', en: 'Move the mouse to look' },
  tutorial_interact: { he: 'E — אינטראקציה', en: 'E — interact' },
  tutorial_touch_move: { he: 'גרור בצד שמאל כדי לזוז', en: 'Drag on the left to move' },
  tutorial_touch_look: { he: 'גרור בצד ימין כדי להסתכל', en: 'Drag on the right to look' },

  elevator_no_power: { he: 'לוח הכפתורים כבוי.', en: 'The button panel is dead.' },
  elevator_power_on: { he: 'המעלית קיבלה חשמל.', en: 'The lift has power.' },
  elevator_display_zero: { he: 'על הצג מופיע 0.', en: 'The display reads 0.' },
  arrive_floor_zero: {
    he: 'הדלת נפתחת. זה לא קומת הקרקע.',
    en: 'The doors open. This is not the ground floor.',
  },

  c1_intro: { he: 'המסדרון ריק. משהו כאן לא נכון.', en: 'The corridor is empty. Something is off.' },
  c1_fuse_found: { he: 'נתיך. מתאים למעגל 4.', en: 'A fuse. Fits circuit 4.' },
  c1_power_restored: { he: 'החשמל חזר.', en: 'Power restored.' },

  c2_mimic_seen: { he: 'מישהו הולך במסדרון. באותו מסלול שלי.', en: 'Someone is walking my route.' },
  c2_mimic_looked: { he: 'הוא הסתובב.', en: 'It turned its head.' },
  c2_shutter: { he: 'השער נסגר מהר מדי.', en: 'The shutter closes too fast.' },
  c2_shutter_open: { he: 'המתג הופעל. עכשיו.', en: 'The switch tripped. Now.' },
  c2_lever_done: { he: 'המעלית מגיבה שוב.', en: 'The lift responds again.' },

  c3_tv_live: { he: 'הטלוויזיה מציגה את המסדרון.', en: 'The television shows the corridor.' },
  c3_tv_ahead: { he: 'המסך מקדים אותי בשתי שניות.', en: 'The screen is two seconds ahead of me.' },
  c3_clocks_all: { he: 'כל השעונים עומדים על 00:17.', en: 'Every clock is stopped at 00:17.' },
  c3_clock_locked: {
    he: 'השעון הזה נעל. נשארו {0}.',
    en: 'That one locked. {0} to go.',
  },
  c3_clock_ok: { he: 'משהו השתחרר.', en: 'Something released.' },
  c3_solved: { he: 'דלת השירות נפתחה.', en: 'The service door opened.' },

  c4_drawings: { he: 'הציורים מתארים דברים שעוד לא עשיתי.', en: 'The drawings show things I have not done yet.' },
  c4_toys_start: { he: 'הוא מתחיל את הסדר.', en: 'It is starting the sequence.' },
  c4_toys_your_turn: { he: 'עכשיו אני. שלושה.', en: 'My turn. Three of them.' },
  c4_toys_fail: { he: 'לא זה. הוא מנגן לי שוב.', en: 'Not that one. It plays them again.' },
  c4_toys_slow: { he: 'איחרתי. הוא חוזר על זה.', en: 'Too slow. It repeats them.' },
  c4_toys_solved: { he: 'הארון נפתח.', en: 'The cabinet opened.' },

  c5_hidden: { he: 'הקיר כאן חלול.', en: 'The wall here is hollow.' },
  c5_chase: { he: 'הוא לא מחקה יותר.', en: 'It is not copying any more.' },
  c5_safe: { he: 'הדלת נסגרה מאחוריי.', en: 'The door closed behind me.' },
  c5_reveal_1: {
    he: 'הטכנאי המקורי נכנס לכאן לפני שמונה שנים.',
    en: 'The original technician came in here eight years ago.',
  },
  c5_reveal_2: {
    he: 'המערכת שחזרה אותו מתוך ההקלטות של התנועות שלו.',
    en: 'The system rebuilt him from recordings of his movements.',
  },
  c5_reveal_3: {
    he: 'אני אחת הגרסאות. הוא הגרסה הבאה.',
    en: 'I am one of the versions. It is the next one.',
  },

  ending1_a: { he: 'קריאת השירות נסגרה בהצלחה.', en: 'The service call was closed successfully.' },
  ending1_b: { he: 'טכנאי חדש נשלח לכתובת.', en: 'A new technician has been dispatched to the address.' },
  ending2_a: { he: 'בפעם הראשונה, המעלית לא חזרה.', en: 'For the first time, the lift did not come back.' },
  ending3_a: {
    he: 'לא נמצא תיעוד לכך שמישהו נכנס לבניין.',
    en: 'No record was found of anyone entering the building.',
  },

  ending_photos: {
    he: 'חמישה תצלומים, ואחד שצולם ממקום שאיש לא עמד בו.',
    en: 'Five photographs, and one taken from somewhere nobody stood.',
  },

  ending1_choice: { he: 'הפעל את המעלית וצא מהבניין', en: 'Start the lift and leave the building' },
  ending2_choice: { he: 'השבת את מערכת ההקלטה וסגור את המעלית', en: 'Shut down the recorder and seal the lift' },
  ending3_choice: { he: 'מחק את כל ההקלטות', en: 'Erase every recording' },

  hint_clocks_1: {
    he: 'רמז: הפתקים בדירה מציינים ארבע שעות. הסדר כתוב על המקרר.',
    en: 'Hint: the notes name four times. The order is on the fridge.',
  },
  hint_clocks_2: {
    he: 'רמז: 23:47, 03:17, 08:00, ואחד שאין לגעת בו.',
    en: 'Hint: 23:47, 03:17, 08:00, and one you must not touch.',
  },
  hint_clocks_3: {
    he: 'רמז אחרון: 1 — 23:47. 2 — 03:17. 3 — 08:00. 4 — 00:17. שעון שנעל מסתמן בירוק.',
    en: 'Last hint: 1 — 23:47. 2 — 03:17. 3 — 08:00. 4 — 00:17. A locked clock turns green.',
  },
  hint_shutter: {
    he: 'רמז: אתה לא צריך להגיע למתג. מישהו כבר הולך אליו.',
    en: 'Hint: you do not need to reach the switch. Someone is already walking to it.',
  },
  hint_shutter_2: {
    he: 'רמז אחרון: הפעל את המתג, סע במעלית וחזור — ואז חכה ליד השער עצמו.',
    en: 'Last hint: trip the switch, ride the lift and come back — then wait at the shutter itself.',
  },
  hint_toys: {
    he: 'רמז: הצפה בציור על הקיר. הוא מנגן שלושה, אתה מנגן שלושה.',
    en: 'Hint: read the drawing. It plays three, you play three.',
  },
};

export function line(key: string): string {
  const entry = LINES[key];
  return entry ? localized(entry) : key;
}

export function objective(key: string): string {
  const entry = OBJECTIVES[key];
  return entry ? localized(entry) : key;
}
