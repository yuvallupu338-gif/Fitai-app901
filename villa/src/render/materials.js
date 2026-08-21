/*
 * materials.js — what every surface in the villa is made of.
 *
 * One flat table, in the order the array texture layers are uploaded, so a
 * material's index *is* its layer. `buildVilla` and the prop builders look
 * indices up by name through `MATERIAL_INDEX`, which means nothing anywhere
 * hard-codes a number.
 *
 * The palette is doing deliberate work. Everything the house is finished in
 * sits in a narrow band of warm greys and browns so that the three things the
 * player has to find in a hurry — bare timber, tape, and whatever is coming
 * through — read instantly against it. The rooms differ by warmth rather than
 * by hue: the kitchen and the equipment room are cold and the living spaces
 * are warm, which is enough to know which end of the house you are in from a
 * glance at a wall.
 */

export const MATERIALS = [
  /* --- floors --- */
  { name: 'oakLiving',  kind: 'oak',      color: '#6b4a30', bump: 1.5, boards: 8, lengths: 3, wear: 0.35, seed: 11 },
  { name: 'oakHall',    kind: 'oak',      color: '#5f4229', bump: 1.6, boards: 5, lengths: 4, wear: 0.55, seed: 12 },
  { name: 'oakBed',     kind: 'oak',      color: '#71523a', bump: 1.4, boards: 8, lengths: 3, wear: 0.22, seed: 13 },
  { name: 'tileEntry',  kind: 'tile',     color: '#8d8579', bump: 1.1, tiles: 5, grout: [0.26, 0.25, 0.23], seed: 21 },
  { name: 'tileKitchen', kind: 'tile',    color: '#a9a49a', bump: 1.1, tiles: 7, grout: [0.30, 0.30, 0.28], seed: 22 },
  { name: 'concreteFloor', kind: 'concrete', color: '#6a6862', bump: 1.3, seed: 31 },

  /* --- walls --- */
  { name: 'plasterWarm', kind: 'plaster', color: '#a3907a', bump: 0.8, age: 0.35, seed: 41 },
  { name: 'plasterCold', kind: 'plaster', color: '#8e9490', bump: 0.8, age: 0.30, seed: 42 },
  { name: 'plasterBare', kind: 'plaster', color: '#7d7a72', bump: 1.0, age: 0.55, seed: 43 },
  { name: 'wallpaperLiving', kind: 'wallpaper', color: '#7c7061', bump: 0.7, strips: 4, stripe: 4, damp: 0.18, seed: 51 },
  { name: 'wallpaperBed',    kind: 'wallpaper', color: '#736659', bump: 0.7, strips: 3, stripe: 3, damp: 0.10, seed: 52 },

  /* --- ceiling --- */
  /* Low bump and a coarse stipple. A ceiling is nearly always seen at a
   * grazing angle, where a fine high-contrast height field aliases into
   * sparkle no amount of mip filtering removes. */
  { name: 'ceilingWhite', kind: 'ceiling', color: '#b9b4a8', bump: 0.55, density: 34, stain: 0.35, seed: 61 },

  /* --- the things that matter --- */
  /* Raw pine against every finished surface in the house. It is meant to look
   * wrong, because a boarded window is wrong. */
  { name: 'timberPlank', kind: 'timber',  color: '#c39a63', bump: 2.4, seed: 71 },
  { name: 'tapeStrip',   kind: 'tape',    color: '#cfc4a4', bump: 1.2, cutout: true, seed: 72 },

  /* --- fittings --- */
  { name: 'doorPaint',  kind: 'door',     color: '#6e6a60', bump: 1.2, seed: 81 },
  { name: 'glass',      kind: 'glass',    color: '#0b1016', bump: 0.5, seed: 82 },
  { name: 'night',      kind: 'night',    color: '#05070c', bump: 0.2, seed: 83 },
  { name: 'brickOuter', kind: 'brick',    color: '#6d4a3c', bump: 2.0, seed: 84 },
  { name: 'metalDark',  kind: 'metal',    color: '#5a5d61', bump: 1.0, gloss: 0.30, rust: 0.22, seed: 85 },
  { name: 'metalPale',  kind: 'metal',    color: '#9aa0a4', bump: 0.8, gloss: 0.22, rust: 0.05, seed: 86 },
  { name: 'lampShade',  kind: 'metal',    color: '#d8c49a', bump: 0.6, gloss: 0.5, rust: 0, seed: 87 },
  { name: 'gunMetal',   kind: 'metal',    color: '#33373c', bump: 0.7, gloss: 0.52, rust: 0.10, seed: 88 },
  { name: 'gunStock',   kind: 'oak',      color: '#3d2818', bump: 1.0, boards: 1, lengths: 1, wear: 0.45, seed: 89 },
  { name: 'muzzleFlash', kind: 'glow',    color: '#ffd089', bump: 0.1, cutout: true, seed: 90 },
  { name: 'hand',       kind: 'fabric',   color: '#63503f', bump: 1.0, weave: 190, seed: 95 },
  { name: 'sleeve',     kind: 'fabric',   color: '#3a3d42', bump: 1.3, weave: 90, seed: 96 },
  /* Trim. Painted a shade off the walls everywhere, so a room reads as built
   * rather than as an extruded rectangle. */
  { name: 'trim',       kind: 'door',     color: '#8e887c', bump: 0.9, seed: 97 },

  /* --- furniture --- */
  { name: 'woodDark',   kind: 'oak',      color: '#4a3527', bump: 1.2, boards: 3, lengths: 2, wear: 0.2, gloss: true, seed: 91 },
  { name: 'woodPale',   kind: 'oak',      color: '#8a7050', bump: 1.2, boards: 4, lengths: 2, wear: 0.3, seed: 92 },
  { name: 'fabricSofa', kind: 'fabric',   color: '#5c4a3e', bump: 1.6, weave: 140, seed: 93 },
  { name: 'fabricBed',  kind: 'fabric',   color: '#8f8778', bump: 1.4, weave: 110, seed: 94 },
];

export const MATERIAL_INDEX = Object.fromEntries(MATERIALS.map((m, i) => [m.name, i]));

/* Which materials are drawn in the cut-out pass. Only the tape, which needs to
 * be a strip with feathered edges rather than a rectangle of plastic. */
export const CUTOUT_MATERIALS = new Set(['tapeStrip']);
