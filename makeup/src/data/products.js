/*
 * products.js — the shop's catalogue.
 *
 * A product is a *line*, not a colour: "מאט אינטנס" is one lipstick with eight
 * shades in it, the way a counter actually stocks. That shape is what the whole
 * game turns on — the customer has an opinion about the line (she wants a matte
 * lipstick, not a gloss) and a separate opinion about the shade (that red is
 * too orange for her), and the card at the till asks the player to tell those
 * two apart.
 *
 * Every product carries what the renderer needs to draw it on a face and what
 * the scoring needs to judge it:
 *
 *   zone      where on the face it belongs
 *   finish    matte / satin / dewy / gloss / shimmer / metallic
 *   shimmer   how much glitter goes into the finish buffer
 *   opacity   how fast it builds under the brush
 *   family    the colour family of a shade, which is what a request names
 *
 * Prices are in shekels and roughly track a real counter, because the till at
 * the end of a customer is real money and a lipstick that costs nine shekels
 * makes the whole shift feel like play money.
 */

import { rgbToHex, labToRgb } from '../core/color.js';

/* ------------------------------------------------------------------ *
 * Shade ramps
 * ------------------------------------------------------------------ */

/*
 * Complexion shades are generated rather than typed out, from a small model of
 * what skin actually looks like in L*a*b*.
 *
 * The naive version of this — interpolate between a light hex and a dark one —
 * produces a range that is far too grey through the middle, because skin is at
 * its most chromatic around the middle of its depth range and a straight line
 * between two endpoints runs under that arc. The result is a shop that stocks
 * nothing for anybody in the middle of the range, which the audit catches by
 * measuring every skin tone in the game against every shade in the range.
 *
 * So: lightness falls linearly, chroma rises and falls with depth, and the
 * three undertone rows are three hue angles. Skin occupies a surprisingly
 * narrow band of hue — roughly 48 to 77 degrees — and "warm" and "cool" are a
 * few degrees apart inside it, not opposite sides of a wheel.
 */
const TONE_HUE = { cool: 51, neutral: 59, warm: 68 };

const DEPTH_LABELS = ['10', '20', '30', '40', '50', '60', '70', '80'];
const TONE_LABELS = { cool: 'C', neutral: 'N', warm: 'W' };
const TONE_HE = { cool: 'קריר', neutral: 'ניטרלי', warm: 'חמים' };
const DEPTH_HE = [
  'פורצלן', 'שנהב', 'חול', 'דבש', 'קרמל', 'ערמון', 'מוקה', 'הבנה',
];

function complexionShades(prefix) {
  const out = [];
  for (const tone of ['cool', 'neutral', 'warm']) {
    const hue = (TONE_HUE[tone] * Math.PI) / 180;
    for (let d = 0; d < DEPTH_LABELS.length; d++) {
      const k = d / (DEPTH_LABELS.length - 1);
      const L = 91 - 68 * k;
      const C = 14 + 8 * k + 14.3 * Math.sin(Math.PI * k);
      const hex = rgbToHex(labToRgb([L, C * Math.cos(hue), C * Math.sin(hue)]));
      out.push({
        id: `${prefix}-${TONE_LABELS[tone]}${DEPTH_LABELS[d]}`,
        he: `${TONE_LABELS[tone]}${DEPTH_LABELS[d]} ${DEPTH_HE[d]}`,
        note: TONE_HE[tone],
        hex,
        family: 'complexion',
        tone,
        depth: d,
      });
    }
  }
  return out;
}

const shade = (id, he, hex, family) => ({ id, he, hex, family });

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export const CATEGORIES = {
  prep: { he: 'הכנה', zone: 'skin', order: 0 },
  foundation: { he: 'מייק אפ', zone: 'skin', order: 1 },
  concealer: { he: 'קונסילר', zone: 'underEye', order: 2 },
  powder: { he: 'פודרה', zone: 'skin', order: 3 },
  contour: { he: 'קונטור', zone: 'contour', order: 4 },
  blush: { he: 'סומק', zone: 'cheek', order: 5 },
  highlighter: { he: 'הארה', zone: 'glow', order: 6 },
  brow: { he: 'גבות', zone: 'brow', order: 7 },
  eyeshadow: { he: 'צלליות', zone: 'lid', order: 8 },
  liner: { he: 'אייליינר', zone: 'lash', order: 9 },
  mascara: { he: 'מסקרה', zone: 'lash', order: 10 },
  lipstick: { he: 'שפתון', zone: 'lip', order: 11 },
  gloss: { he: 'ליפ גלוס', zone: 'lip', order: 12 },
  /* The remover's working area is the whole face. It is a zone like any other
   * so that a wipe can be driven over an area; the brush skips zone clipping
   * for anything that erases, so it still takes off whatever it passes over. */
  tool: { he: 'כלים', zone: 'skin', order: 13 },
};

export const FINISH_HE = {
  matte: 'מאט',
  satin: 'סאטן',
  dewy: 'זוהר',
  gloss: 'גלוס',
  shimmer: 'נצנץ',
  metallic: 'מטאלי',
  clean: 'ניקוי',
};

export const FAMILY_HE = {
  complexion: 'גוון עור',
  nude: 'עירום',
  rose: 'ורוד',
  coral: 'אלמוג',
  red: 'אדום',
  berry: 'פטל',
  plum: 'שזיף',
  brown: 'חום',
  bronze: 'ברונזה',
  gold: 'זהב',
  champagne: 'שמפניה',
  taupe: 'טאופ',
  smoke: 'עשן',
  green: 'ירוק',
  blue: 'כחול',
  peach: 'אפרסק',
  pink: 'ורוד בהיר',
  clear: 'שקוף',
  black: 'שחור',
};

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ */

export const PRODUCTS = [
  {
    id: 'primer', he: 'פריימר משיי', en: 'Silk Primer', cat: 'prep',
    finish: 'satin', shimmer: 0, opacity: 0.30, tintStrength: 0.15, price: 89, pack: 'pump',
    tint: [0.94, 0.90, 0.92],
    blurb: 'מחליק את העור לפני הכל. לא נראה — מרגישים.',
    shades: [shade('primer-clear', 'שקוף', '#f7eee9', 'clear')],
    prep: true,
  },
  {
    id: 'found-matte', he: 'מאט לאסט 24', en: 'Matte Last 24', cat: 'foundation',
    finish: 'matte', shimmer: 0, opacity: 0.55, price: 139, pack: 'pump',
    tint: [0.25, 0.24, 0.28],
    blurb: 'כיסוי מלא, גימור מאט. מחזיק משמרת שלמה.',
    shades: complexionShades('FM'),
  },
  {
    id: 'found-dewy', he: 'גלואו דרופס', en: 'Glow Drops', cat: 'foundation',
    finish: 'dewy', shimmer: 0.12, opacity: 0.42, price: 149, pack: 'dropper',
    tint: [0.96, 0.86, 0.72],
    blurb: 'כיסוי בינוני עם ברק בריא. לעור יבש.',
    shades: complexionShades('FD'),
  },
  {
    id: 'concealer', he: 'קונסילר מאיר', en: 'Bright Concealer', cat: 'concealer',
    finish: 'satin', shimmer: 0.05, opacity: 0.62, price: 79, pack: 'dropper',
    tint: [0.98, 0.92, 0.84],
    blurb: 'מכסה עיגולים ומאיר את מרכז הפנים.',
    shades: complexionShades('CN').filter((_, i) => i % 2 === 0),
  },
  {
    id: 'powder', he: 'פודרה שקופה', en: 'Set & Blur', cat: 'powder',
    finish: 'matte', shimmer: 0, opacity: 0.25, powder: 1, tintStrength: 0.35, price: 95, pack: 'compact',
    tint: [0.93, 0.90, 0.88],
    blurb: 'מקבעת. מורידה ברק — גם כשרוצים ברק, אז בזהירות.',
    shades: [
      shade('pw-trans', 'שקופה', '#f0e6dd', 'clear'),
      shade('pw-honey', 'דבש', '#e0bd97', 'complexion'),
      shade('pw-cocoa', 'קקאו', '#a97c5a', 'complexion'),
    ],
  },
  {
    id: 'contour', he: 'קונטור פיסול', en: 'Sculpt Stick', cat: 'contour',
    finish: 'matte', shimmer: 0, opacity: 0.34, price: 89, pack: 'bullet',
    tint: [0.55, 0.40, 0.32],
    blurb: 'צל קר מתחת לעצם הלחי. לא ברונזר.',
    shades: [
      shade('ct-ash', 'אפרפר', '#9c7a63', 'taupe'),
      shade('ct-mid', 'ערמון', '#8a5f45', 'brown'),
      shade('ct-deep', 'אספרסו', '#5d3a28', 'brown'),
    ],
  },
  {
    id: 'bronzer', he: 'ברונזר שמש', en: 'Sun Bronze', cat: 'contour',
    finish: 'satin', shimmer: 0.18, opacity: 0.30, price: 92, pack: 'compact',
    tint: [0.80, 0.55, 0.35],
    blurb: 'חום חמים לפנים. נותן צבע, לא צל.',
    shades: [
      shade('bz-light', 'חוף', '#c98f63', 'bronze'),
      shade('bz-deep', 'טרקוטה', '#a4633c', 'bronze'),
    ],
  },
  {
    id: 'blush-powder', he: 'סומק פודרה', en: 'Powder Blush', cat: 'blush',
    finish: 'matte', shimmer: 0, opacity: 0.32, price: 74, pack: 'compact',
    tint: [0.93, 0.62, 0.66],
    blurb: 'קלאסי, מט, נשלט. קל לבנות בשכבות.',
    shades: [
      shade('bp-peach', 'אפרסק', '#f0a281', 'peach'),
      shade('bp-rose', 'ורד', '#e2807f', 'rose'),
      shade('bp-berry', 'פטל', '#c05f74', 'berry'),
      shade('bp-brick', 'טרקוטה', '#c2705a', 'coral'),
    ],
  },
  {
    id: 'blush-cream', he: 'סומק קרמי', en: 'Cream Blush', cat: 'blush',
    finish: 'dewy', shimmer: 0.10, opacity: 0.28, price: 86, pack: 'jar',
    tint: [0.95, 0.55, 0.60],
    blurb: 'נמס בעור, גימור לח. אוהב עור יבש.',
    shades: [
      shade('bc-nude', 'עירום ורדרד', '#e59b90', 'nude'),
      shade('bc-pink', 'ורוד חי', '#ec7b93', 'pink'),
      shade('bc-plum', 'שזיף', '#a85c74', 'plum'),
    ],
  },
  {
    id: 'highlighter', he: 'הארה נוזלית', en: 'Liquid Glow', cat: 'highlighter',
    finish: 'shimmer', shimmer: 0.85, opacity: 0.30, tintStrength: 0.55, price: 98, pack: 'dropper',
    tint: [0.98, 0.90, 0.78],
    blurb: 'טיפה על עצם הלחי. יותר מזה — זה כבר דיסקו.',
    shades: [
      shade('hl-champ', 'שמפניה', '#f6e2c0', 'champagne'),
      shade('hl-gold', 'זהב', '#f2cd86', 'gold'),
      shade('hl-rose', 'רוז גולד', '#f0bfa6', 'rose'),
      shade('hl-ice', 'כפור', '#e2ecf6', 'clear'),
    ],
  },
  {
    id: 'brow', he: 'עיפרון גבות', en: 'Brow Define', cat: 'brow',
    finish: 'matte', shimmer: 0, opacity: 0.45, price: 62, pack: 'bullet',
    tint: [0.35, 0.26, 0.20],
    blurb: 'משלים חורים ומאריך את הזנב. שערה־שערה.',
    shades: [
      shade('br-blonde', 'בלונד', '#a9855f', 'brown'),
      shade('br-taupe', 'טאופ', '#7d6552', 'taupe'),
      shade('br-brown', 'חום', '#5c4432', 'brown'),
      shade('br-ebony', 'הבנה', '#33261e', 'black'),
    ],
  },
  {
    id: 'shadow-matte', he: 'פלטת מאט', en: 'Matte Palette', cat: 'eyeshadow',
    finish: 'matte', shimmer: 0, opacity: 0.34, price: 165, pack: 'compact',
    tint: [0.62, 0.48, 0.44],
    blurb: 'תשע מנות מט. הבסיס של כל מבט מעושן.',
    shades: [
      shade('sm-bone', 'עצם', '#e8d5c4', 'nude'),
      shade('sm-taupe', 'טאופ', '#9c8574', 'taupe'),
      shade('sm-cocoa', 'קקאו', '#7a5240', 'brown'),
      shade('sm-brick', 'לבנה', '#a05a45', 'coral'),
      shade('sm-plum', 'שזיף', '#6d4054', 'plum'),
      shade('sm-charcoal', 'פחם', '#3d3641', 'smoke'),
    ],
  },
  {
    id: 'shadow-shimmer', he: 'פלטת נצנץ', en: 'Shimmer Palette', cat: 'eyeshadow',
    finish: 'shimmer', shimmer: 0.75, opacity: 0.34, price: 175, pack: 'compact',
    tint: [0.90, 0.76, 0.55],
    blurb: 'רפלקטים אמיתיים. תופס אור מכל זווית.',
    shades: [
      shade('ss-champ', 'שמפניה', '#f0dcae', 'champagne'),
      shade('ss-gold', 'זהב עתיק', '#d5a55c', 'gold'),
      shade('ss-bronze', 'ברונזה', '#b57a45', 'bronze'),
      shade('ss-copper', 'נחושת', '#b9673f', 'bronze'),
      shade('ss-emerald', 'אמרלד', '#3f7a63', 'green'),
      shade('ss-sapphire', 'ספיר', '#3d5a8c', 'blue'),
    ],
  },
  {
    id: 'liner', he: 'אייליינר נוזלי', en: 'Liquid Liner', cat: 'liner',
    finish: 'matte', shimmer: 0, opacity: 0.80, price: 68, pack: 'mascara',
    tint: [0.15, 0.14, 0.16],
    blurb: 'קו דק לאורך הריסים. או וינג, אם היד יציבה.',
    shades: [
      shade('ln-black', 'שחור', '#131218', 'black'),
      shade('ln-brown', 'חום כהה', '#3b2a20', 'brown'),
      shade('ln-plum', 'שזיף', '#4a2540', 'plum'),
      shade('ln-teal', 'טורקיז', '#1d5560', 'blue'),
    ],
  },
  {
    id: 'mascara', he: 'מסקרה ווליום', en: 'Volume Lash', cat: 'mascara',
    finish: 'matte', shimmer: 0, opacity: 0.85, lash: 1.0, price: 84, pack: 'mascara',
    tint: [0.12, 0.11, 0.13],
    blurb: 'מעבה ומרים. שתי שכבות ולא יותר.',
    shades: [
      shade('ms-black', 'שחור', '#101014', 'black'),
      shade('ms-brown', 'חום', '#38271d', 'brown'),
    ],
  },
  {
    id: 'lip-matte', he: 'מאט אינטנס', en: 'Intense Matte', cat: 'lipstick',
    finish: 'matte', shimmer: 0, opacity: 0.78, price: 96, pack: 'bullet',
    tint: [0.72, 0.18, 0.24],
    blurb: 'פיגמנט מלא, אפס ברק. לא זז.',
    shades: [
      shade('lm-nude', 'עירום', '#c78b7a', 'nude'),
      shade('lm-rose', 'ורד יבש', '#b96b70', 'rose'),
      shade('lm-coral', 'אלמוג', '#d75f4c', 'coral'),
      shade('lm-red', 'אדום קלאסי', '#b81f2b', 'red'),
      shade('lm-cherry', 'דובדבן', '#96182f', 'red'),
      shade('lm-berry', 'פטל', '#8e2846', 'berry'),
      shade('lm-plum', 'שזיף', '#6b2740', 'plum'),
      shade('lm-brown', 'שוקו', '#7d4536', 'brown'),
    ],
  },
  {
    id: 'lip-satin', he: 'סאטן קרם', en: 'Satin Cream', cat: 'lipstick',
    finish: 'satin', shimmer: 0.05, opacity: 0.68, price: 88, pack: 'bullet',
    tint: [0.86, 0.42, 0.48],
    blurb: 'צבע מלא עם ברק עדין. נוח לשפתיים יבשות.',
    shades: [
      shade('ls-nude', 'עירום חמים', '#cf9382', 'nude'),
      shade('ls-pink', 'ורוד בייבי', '#e28ba0', 'pink'),
      shade('ls-rose', 'ורד', '#c4707c', 'rose'),
      shade('ls-coral', 'אלמוג רך', '#e07260', 'coral'),
      shade('ls-red', 'אדום סאטן', '#c62f3c', 'red'),
      shade('ls-berry', 'פטל בשל', '#9c3a55', 'berry'),
    ],
  },
  {
    id: 'lip-liquid', he: 'ליקוויד מאט', en: 'Liquid Matte', cat: 'lipstick',
    finish: 'matte', shimmer: 0, opacity: 0.92, price: 104, pack: 'mascara',
    tint: [0.55, 0.12, 0.20],
    blurb: 'הכי עמיד שיש. מייבש קצת — זה המחיר.',
    shades: [
      shade('ll-mauve', 'מוב', '#a1616f', 'rose'),
      shade('ll-brick', 'לבנה', '#a63f33', 'coral'),
      shade('ll-red', 'אדום דם', '#8e1220', 'red'),
      shade('ll-plum', 'שזיף כהה', '#5a2038', 'plum'),
      shade('ll-espresso', 'אספרסו', '#5f3229', 'brown'),
    ],
  },
  {
    id: 'lip-metal', he: 'מטאל שיין', en: 'Metal Shine', cat: 'lipstick',
    finish: 'metallic', shimmer: 0.65, opacity: 0.72, price: 112, pack: 'bullet',
    tint: [0.86, 0.55, 0.42],
    blurb: 'רפלקט מתכתי. על מסלול זה מדהים, במשרד פחות.',
    shades: [
      shade('lx-rosegold', 'רוז גולד', '#d4907e', 'rose'),
      shade('lx-copper', 'נחושת', '#b56a44', 'bronze'),
      shade('lx-ruby', 'רובי', '#a41f3c', 'red'),
      shade('lx-violet', 'סגול מתכתי', '#6c3a72', 'plum'),
    ],
  },
  {
    id: 'gloss', he: 'ליפ גלוס זכוכית', en: 'Glass Gloss', cat: 'gloss',
    finish: 'gloss', shimmer: 0.25, opacity: 0.40, tintStrength: 0.50, price: 72, pack: 'mascara',
    tint: [0.95, 0.72, 0.75],
    blurb: 'שכבת זכוכית. מעל שפתון או לבד.',
    shades: [
      shade('gl-clear', 'שקוף', '#f6e4e2', 'clear'),
      shade('gl-pink', 'ורוד', '#f0a3ad', 'pink'),
      shade('gl-peach', 'אפרסק', '#f3ab8a', 'peach'),
      shade('gl-berry', 'פטל', '#c25f7d', 'berry'),
    ],
  },
  {
    id: 'wipe', he: 'מגבון מסיר', en: 'Remover', cat: 'tool',
    finish: 'clean', shimmer: 0, opacity: 1, price: 0, pack: 'jar',
    tint: [0.85, 0.90, 0.92], erase: true,
    blurb: 'מוחק מה שלא יצא. חינם — וגם עולה זמן.',
    shades: [shade('wipe', 'מגבון', '#e8f1f4', 'clear')],
  },
];

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

const BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));

export function product(id) {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`no such product: ${id}`);
  return p;
}

export function productShade(productId, shadeId) {
  const p = product(productId);
  const s = p.shades.find((x) => x.id === shadeId) || p.shades[0];
  return { product: p, shade: s };
}

export function byCategory(cat) {
  return PRODUCTS.filter((p) => p.cat === cat);
}

/* The zone on the face a product goes to. Kept on the category rather than the
 * product so a new lipstick cannot be added with the wrong target. */
export function zoneOf(p) {
  return CATEGORIES[p.cat].zone;
}

export function itemKey(item) {
  return `${item.product.id}:${item.shade.id}`;
}

export function itemName(item) {
  if (item.product.shades.length === 1) return item.product.he;
  return `${item.product.he} · ${item.shade.he}`;
}
