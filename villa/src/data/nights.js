/*
 * nights.js — the seven nights, as data.
 *
 * Every number here is derived from the formulas in config.js rather than
 * typed in, so the balance table in the documents, the game, and the three
 * engine ports cannot drift apart: there is one derivation and everything
 * reads it. `difficulty` and `note` are the only authored fields, and neither
 * is read by the simulation — they are what the day-preparation screen tells
 * the player before the sun goes down.
 */

import {
  GAME_CONFIG, regularCount, hiddenCount, threatCount, breachRate, nightSeconds,
} from './config.js';

const NOTES = [
  { difficulty: 'קל',
    note: 'ארבעה פתחים, שני חדרים, ואף פתח מסתורי. הלילה הזה נועד ללמד — יש זמן לחסום הכול ועדיין לשבת.' },
  { difficulty: 'קל עד בינוני',
    note: 'הפתח המסתורי הראשון. הוא יודיע על עצמו ברעש לפני שהוא מתעורר.' },
  { difficulty: 'בינוני',
    note: 'המטבח נכנס לתמונה. אי אפשר יותר לראות את כל הפתחים מאותו מקום.' },
  { difficulty: 'בינוני עד גבוה',
    note: 'הלילה הראשון שבו אין מספיק קרשים לכל הפתחים. מכאן זו החלטה, לא רשימה.' },
  { difficulty: 'גבוה',
    note: 'שלושה פתחים מסתוריים ושישה חדרים. זה הלילה שבו כדאי לשקול את השכן בפעם הראשונה.' },
  { difficulty: 'גבוה מאוד',
    note: 'הבית כולו תחת לחץ. סקוץ׳ טייפ הופך מחיזוק להשהיה.' },
  { difficulty: 'קיצוני',
    note: 'חמישה־עשר פתחים, מחציתם לא היו כאן אתמול. שמור את הקריאה השנייה לכאן.' },
];

/*
 * Built on demand rather than frozen into an array at import time. That is not
 * fussiness: the balance sweeps in tools/villa-sim.mjs work by writing a
 * candidate table into GAME_CONFIG and replaying the reference policy against
 * it, and a table computed once when the module first loaded silently ignores
 * every one of them — which it did, and produced four identical results for
 * four very different budgets before anyone noticed.
 */
export function nightData(night) {
  const n = Math.min(Math.max(night, 1), GAME_CONFIG.NIGHTS_TOTAL);
  const i = n - 1;
  const regular = regularCount(n);
  const hidden = hiddenCount(n);
  return {
    night: n,
    regular,
    hidden,
    total: regular + hidden,
    threats: threatCount(n),
    breachRate: breachRate(n),
    seconds: nightSeconds(n),
    supply: {
      tape: GAME_CONFIG.SUPPLY_TAPE[i],
      planks: GAME_CONFIG.SUPPLY_PLANKS[i],
      nails: GAME_CONFIG.SUPPLY_NAILS[i],
    },
    difficulty: NOTES[i].difficulty,
    note: NOTES[i].note,
  };
}

/* The whole table, for the balance document, the preparation screen and the
 * tests. A fresh array each call, for the same reason. */
export function allNights() {
  return Array.from({ length: GAME_CONFIG.NIGHTS_TOTAL }, (_, i) => nightData(i + 1));
}
