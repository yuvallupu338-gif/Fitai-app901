/*
 * palettes.js — every colour in the game, and the trick that makes eight
 * worlds' worth of tilesets out of one set of drawings.
 *
 * The 1985 machine could only hold four background palettes at a time, so the
 * underground, the castle and the overworld are literally the same brick
 * drawing with three different sets of colours poked into it. That constraint
 * turned out to be a feature: the tilesets stay coherent, and a new world is
 * five hex values rather than a new sheet of art.
 *
 * So art is authored once in slot letters, not colours:
 *
 *   a  highlight (the lit top edge)
 *   b  base
 *   c  shade
 *   d  outline / darkest
 *   e  accent (white-ish detail — the ? on a block, snow on a ledge)
 *
 * and a theme is just a mapping of those five letters. Sprites that must keep
 * their identity across every world — a Goomba is brown everywhere — carry
 * their own named palette instead.
 *
 * The values are NES-accurate where the NES had an opinion. That palette is a
 * fixed 64-colour table burned into the PPU, and using anything else is the
 * fastest way to make a picture that is pixel-perfect in shape still look
 * wrong.
 */

/* ------------------------------------------------------------------ *
 * The hardware palette, for the entries this game actually uses.
 * ------------------------------------------------------------------ */
export const NES = {
  black: '#000000', white: '#FCFCFC', gray: '#BCBCBC', dgray: '#7C7C7C', ddgray: '#3C3C3C',
  sky: '#5C94FC', deepBlue: '#0058F8', navy: '#0000BC', midnight: '#101840',
  cyan: '#3CBCFC', ice: '#BCE0FC', teal: '#00A8A8',
  red: '#D82800', orange: '#E45C10', amber: '#FC9838', sand: '#FCD8A8', tan: '#F8B078',
  brown: '#8C3800', dbrown: '#503000', skin: '#FCB07C',
  green: '#00A800', lgreen: '#B8F818', dgreen: '#006000', olive: '#588800',
  yellow: '#F8D800', gold: '#FCE0A8', pink: '#F878F8', purple: '#6844FC',
};

/* ------------------------------------------------------------------ *
 * Tileset themes. `bg` is the colour the screen is cleared to; `ground`
 * picks which of the four ground drawings the theme builds its floor from.
 * ------------------------------------------------------------------ */
export const THEMES = {
  overworld: {
    bg: '#5C94FC', ground: 'soil', scenery: 'day',
    a: '#FCA85C', b: '#E45C10', c: '#A83800', d: '#000000', e: '#FCFCFC',
    hill: '#00A800', hillLight: '#80D010', cloud: '#FCFCFC', bush: '#00A800',
  },
  underground: {
    bg: '#000000', ground: 'soil', scenery: 'none',
    a: '#BCECFC', b: '#3CBCFC', c: '#0070A8', d: '#000000', e: '#FCFCFC',
    hill: '#0070A8', hillLight: '#3CBCFC', cloud: '#3CBCFC', bush: '#0070A8',
  },
  water: {
    bg: '#2038EC', ground: 'coral', scenery: 'sea',
    a: '#BCECFC', b: '#3CBCFC', c: '#0058A8', d: '#000000', e: '#FCFCFC',
    hill: '#00A800', hillLight: '#80D010', cloud: '#3CBCFC', bush: '#00A800',
  },
  castle: {
    bg: '#000000', ground: 'stone', scenery: 'none',
    a: '#BCBCBC', b: '#7C7C7C', c: '#3C3C3C', d: '#000000', e: '#FCFCFC',
    hill: '#7C7C7C', hillLight: '#BCBCBC', cloud: '#BCBCBC', bush: '#7C7C7C',
  },
  sky: {
    bg: '#78B8FC', ground: 'soil', scenery: 'clouds',
    a: '#FCFCFC', b: '#BCDCFC', c: '#6888C8', d: '#000000', e: '#FCFCFC',
    hill: '#FCFCFC', hillLight: '#FCFCFC', cloud: '#FCFCFC', bush: '#BCDCFC',
  },
  snow: {
    bg: '#A8D8FC', ground: 'snow', scenery: 'winter',
    a: '#FCFCFC', b: '#A8C0E0', c: '#5878A8', d: '#000000', e: '#FCFCFC',
    hill: '#FCFCFC', hillLight: '#FCFCFC', cloud: '#FCFCFC', bush: '#C8E8FC',
  },
  desert: {
    bg: '#FCD8A8', ground: 'sand', scenery: 'desert',
    a: '#FCE8B8', b: '#E0A860', c: '#A06820', d: '#000000', e: '#FCFCFC',
    hill: '#E0A860', hillLight: '#FCE0A8', cloud: '#FCFCFC', bush: '#88A828',
  },
  night: {
    bg: '#101840', ground: 'soil', scenery: 'night',
    a: '#8898C0', b: '#4C5880', c: '#282C48', d: '#000000', e: '#BCC8E0',
    hill: '#204020', hillLight: '#386838', cloud: '#4C5880', bush: '#204020',
  },
  forest: {
    bg: '#1C7038', ground: 'soil', scenery: 'forest',
    a: '#C8B078', b: '#8C6030', c: '#503000', d: '#000000', e: '#FCFCFC',
    hill: '#005800', hillLight: '#00A800', cloud: '#B8F818', bush: '#00A800',
  },
  volcano: {
    bg: '#280000', ground: 'stone', scenery: 'none',
    a: '#FC9838', b: '#A83800', c: '#500000', d: '#000000', e: '#FCE0A8',
    hill: '#500000', hillLight: '#A83800', cloud: '#A83800', bush: '#500000',
  },
};

export const THEME_NAMES = Object.keys(THEMES);

/* ------------------------------------------------------------------ *
 * Sprite palettes. Letters here are mnemonic rather than positional,
 * because a Goomba's brown is a Goomba's brown and never gets remapped.
 * ------------------------------------------------------------------ */
export const SPRITE_PAL = {
  /* The player, in his three states. Three colours plus transparent, the way
     a hardware sprite had to be — the moustache, the overalls, the hair and
     the shoes are all one dark brown for exactly that reason. */
  mario: { r: '#D82800', s: '#FCB07C', d: '#7C3800', w: '#FCFCFC' },
  fire: { r: '#FCFCFC', s: '#FCB07C', d: '#D82800', w: '#FCFCFC' },
  star1: { r: '#FCFCFC', s: '#FCE0A8', d: '#D82800', w: '#FCFCFC' },
  star2: { r: '#F8D800', s: '#FCB07C', d: '#00A800', w: '#FCFCFC' },
  star3: { r: '#00A800', s: '#BCE0FC', d: '#0058F8', w: '#FCFCFC' },

  goomba: { r: '#8C3800', s: '#FCE0A8', d: '#000000', w: '#FCFCFC' },
  goombaBlue: { r: '#0058F8', s: '#BCE0FC', d: '#000000', w: '#FCFCFC' },
  goombaGray: { r: '#7C7C7C', s: '#FCFCFC', d: '#000000', w: '#FCFCFC' },

  koopa: { r: '#00A800', s: '#FCE0A8', d: '#000000', w: '#FCFCFC', y: '#F8D800' },
  koopaRed: { r: '#D82800', s: '#FCE0A8', d: '#000000', w: '#FCFCFC', y: '#F8D800' },
  koopaBlue: { r: '#0058F8', s: '#BCE0FC', d: '#000000', w: '#FCFCFC', y: '#3CBCFC' },
  buzzy: { r: '#282840', s: '#7C7C7C', d: '#000000', w: '#FCFCFC', y: '#0058F8' },

  piranha: { r: '#00A800', s: '#FCFCFC', d: '#000000', w: '#D82800', y: '#B8F818' },
  piranhaRed: { r: '#D82800', s: '#FCFCFC', d: '#000000', w: '#F8D800', y: '#FC9838' },

  cheep: { r: '#D82800', s: '#FCE0A8', d: '#000000', w: '#FCFCFC', y: '#F8D800' },
  cheepGray: { r: '#7C7C7C', s: '#BCE0FC', d: '#000000', w: '#FCFCFC', y: '#3CBCFC' },
  blooper: { r: '#FCFCFC', s: '#BCE0FC', d: '#000000', w: '#FCFCFC', y: '#7C7C7C' },

  hammerbro: { r: '#00A800', s: '#FCE0A8', d: '#000000', w: '#FCFCFC', y: '#F8D800' },
  hammer: { r: '#FCE0A8', s: '#8C3800', d: '#000000', w: '#FCFCFC' },
  lakitu: { r: '#00A800', s: '#FCE0A8', d: '#000000', w: '#FCFCFC', y: '#FCFCFC' },
  spiny: { r: '#D82800', s: '#F8D800', d: '#000000', w: '#FCFCFC', y: '#00A800' },
  bullet: { r: '#000000', s: '#FCFCFC', d: '#3C3C3C', w: '#FCFCFC' },
  podoboo: { r: '#D82800', s: '#FC9838', d: '#000000', w: '#F8D800' },

  boss: { r: '#00A800', s: '#FCE0A8', d: '#000000', w: '#FCFCFC', y: '#F8D800' },
  bossAngry: { r: '#D82800', s: '#FCE0A8', d: '#000000', w: '#FCFCFC', y: '#FC9838' },

  coin: { r: '#F8D800', s: '#FCE0A8', d: '#8C3800', w: '#FCFCFC' },
  mushroom: { r: '#D82800', s: '#FCE0A8', d: '#000000', w: '#FCFCFC' },
  oneUp: { r: '#00A800', s: '#FCE0A8', d: '#000000', w: '#FCFCFC' },
  flower1: { r: '#D82800', s: '#F8D800', d: '#00A800', w: '#FCFCFC' },
  flower2: { r: '#FC9838', s: '#FCFCFC', d: '#00A800', w: '#F8D800' },
  flower3: { r: '#F8D800', s: '#D82800', d: '#00A800', w: '#FCFCFC' },
  flower4: { r: '#FCFCFC', s: '#FC9838', d: '#00A800', w: '#D82800' },
  starItem1: { r: '#F8D800', s: '#FCFCFC', d: '#000000', w: '#FCFCFC' },
  starItem2: { r: '#FCFCFC', s: '#F8D800', d: '#000000', w: '#FCFCFC' },
  starItem3: { r: '#FC9838', s: '#FCE0A8', d: '#000000', w: '#FCFCFC' },

  fire: { r: '#FCFCFC', s: '#FCB07C', d: '#D82800', w: '#FCFCFC' },
  fireball: { r: '#FC9838', s: '#FCE0A8', d: '#D82800', w: '#FCFCFC' },
  spring: { r: '#00A800', s: '#B8F818', d: '#000000', w: '#FCFCFC' },
  axe: { r: '#FCE0A8', s: '#7C7C7C', d: '#000000', w: '#FCFCFC' },
};

/* Palette cycles, indexed by frame. Star power and the fire flower both work
   by rotating through a few palettes rather than by drawing new art. */
export const CYCLE = {
  star: ['star1', 'star2', 'star3', 'star2'],
  flower: ['flower1', 'flower2', 'flower3', 'flower4'],
  starItem: ['starItem1', 'starItem2', 'starItem3', 'starItem2'],
};
