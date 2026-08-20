/*
 * items.js — the five things in the game, and nothing else.
 *
 * The spec is explicit that no further weapon is to appear, and this file is
 * where that would happen by accident, so it is worth saying here: the rifle
 * is the only weapon, and everything below it is a building material.
 */

export const ITEMS = {
  ammo: {
    id: 'ammo',
    name: 'כדורים',
    unit: 'כדורים',
    desc: 'הרובה מחזיק חמישה־עשר. בבוקר הוא חוזר לחמישה־עשר — לא מתווספים, חוזר.',
    consumable: true,
  },
  tape: {
    id: 'tape',
    name: 'סקוץ׳ טייפ',
    unit: 'גלילים',
    desc: 'חסימה מהירה וחלשה. מאטה פריצה, נשחקת תחת לחץ, ובסוף נקרעת.',
    consumable: true,
  },
  planks: {
    id: 'planks',
    name: 'קרשים',
    unit: 'קרשים',
    desc: 'חסימה איטית וחזקה. דורשת פטיש ומסמרים.',
    consumable: true,
  },
  nails: {
    id: 'nails',
    name: 'מסמרים',
    unit: 'מסמרים',
    desc: 'שני מסמרים לכל קרש. זה המשאב שנגמר ראשון.',
    consumable: true,
  },
  hammer: {
    id: 'hammer',
    name: 'פטיש',
    unit: '',
    desc: 'כלי רב־פעמי. בלעדיו אין קרשים — רק סקוץ׳ טייפ.',
    consumable: false,
  },
};

export const WEAPON = {
  id: 'rifle',
  name: 'הרובה',
  desc: 'לא חוסם כלום. עוצר, מרתיע ומאט — ורק חמישה־עשר כדורים ליום.',
};

/* The starting pack. The hammer is the only thing carried from the first
 * morning to the last, which is why it is here and not in the supply table. */
export function startingInventory(config) {
  return {
    ammo: config.GUN_AMMO_PER_DAY,
    tape: 0,
    planks: 0,
    nails: 0,
    hammer: true,
  };
}
