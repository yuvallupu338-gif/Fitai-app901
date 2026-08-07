/* clips.x05.js — bespoke per-exercise animations. Keys are EXERCISE IDS.
 *
 * Loaded horizontal pulling. Unlike the bodyweight rows, the body here mostly
 * holds still and the LOAD travels, so the identifying features are the torso
 * position that supports it (bent over, chest on a bench, seated at a stack)
 * and whether one arm works or two.
 */

import { repKeys } from '../core/anim.js';

const clip = (o) => Object.assign({ duration: 3000, hero: 0, ease: 'inOut', props: [] }, o);

/* Bent over, hinged and held: the torso is a platform, not part of the lift. */
const bent = (over) => Object.assign({
  x: 48, y: 62, spine: 22, head: 14,
  footPtL: { x: 49, y: 87.5, bend: 1 }, footPtR: { x: 52, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
}, over);

const DB_BENT_DOWN = bent({ armL: [-84, -88], armR: [-96, -92], load: 'dumbbell' });
const DB_BENT_UP = bent({ armL: [-148, -62], armR: [-154, -68], load: 'dumbbell' });

/* Barbell: both hands on one bar so the arms travel together, and the torso is
   held a touch higher because the load sits further from the hips. */
const BB_BENT_DOWN = bent({ spine: 28, head: 20, armL: [-88, -90], armR: [-92, -90], load: 'barbell' });
const BB_BENT_UP = bent({ spine: 30, head: 22, armL: [-150, -66], armR: [-154, -70], load: 'barbell' });

/* Chest supported: the bench carries the torso, so nothing but the arms moves.
   That total stillness is the whole selling point of the variation. */
const CHEST_SUP = (over) => Object.assign({
  x: 40, y: 64, spine: 20, head: 12,
  legL: [-150, -156], legR: [-154, -160], footL: -40, footR: -40,
}, over);
const CHEST_DOWN = CHEST_SUP({ armL: [-84, -88], armR: [-96, -92], load: 'dumbbell' });
const CHEST_UP = CHEST_SUP({ armL: [-146, -60], armR: [-152, -66], load: 'dumbbell' });

/* Seated at a stack: torso upright, elbows drive straight back. */
const seated = (over) => Object.assign({
  x: 40, y: 70, spine: 84, head: 82,
  legL: [-4, -84], legR: [-8, -88], footL: 4, footR: 4,
}, over);
const CABLE_ROW_OUT = seated({ spine: 74, head: 72, armL: [-10, -6], armR: [-16, -12] });
const CABLE_ROW_IN = seated({ spine: 92, head: 90, armL: [-166, -170], armR: [-172, -176] });

/* One arm at a time: the torso rotates toward the working side, and only one
   arm moves — a mirrored pair would read as the two-handed version. */
const CABLE_ONE_OUT = seated({ spine: 76, head: 74, armL: [-88, -92], armR: [-14, -10] });
const CABLE_ONE_IN = seated({ spine: 94, head: 92, armL: [-88, -92], armR: [-170, -174] });

const MACHINE_OUT = seated({ x: 36, spine: 80, head: 78, armL: [-8, -4], armR: [-14, -10] });
const MACHINE_IN = seated({ x: 36, spine: 88, head: 86, armL: [-164, -168], armR: [-170, -174] });

/* Rings and straps: the body leans back and travels, like the bodyweight rows,
   but the archer version loads one side at a time. */
function lean(pelvisX, pelvisY, spine, handAx, handAy, handBx, handBy, feetX) {
  return {
    x: pelvisX, y: pelvisY, spine, head: spine + 6,
    handL: { x: handAx, y: handAy, bend: 1 },
    handR: { x: handBx, y: handBy, bend: 1 },
    footPtL: { x: feetX, y: 87.5, bend: -1 },
    footPtR: { x: feetX + 3, y: 87.5, bend: -1 },
    footL: spine + 58, footR: spine + 58,
  };
}

const TRX_OUT = lean(38, 70, 18, 60, 52, 66, 52, 12);
const TRX_IN = lean(44, 64, 25, 60, 52, 66, 52, 12);
const ARCHER_OUT = lean(38, 70, 18, 58, 50, 66, 50, 12);
const ARCHER_IN = lean(43, 65, 24, 44, 44, 66, 50, 12);

export const X05_CLIPS = {
  db_bent_row: clip({
    id: 'db_bent_row', duration: 2900,
    keys: repKeys(DB_BENT_DOWN, DB_BENT_UP, DB_BENT_UP, { mode: 'lift' }),
  }),

  bent_row: clip({
    id: 'bent_row', duration: 3000,
    keys: repKeys(BB_BENT_DOWN, BB_BENT_UP, BB_BENT_UP, { mode: 'lift' }),
  }),

  db_chest_supported_row: clip({
    id: 'db_chest_supported_row', duration: 3100,
    props: [{ type: 'bench', x: 46, y: 66, w: 40, h: 5 }],
    keys: repKeys(CHEST_DOWN, CHEST_UP, CHEST_UP, { mode: 'lift' }),
  }),

  cable_row: clip({
    id: 'cable_row', duration: 3000,
    props: [
      { type: 'machine', x: 84, y: 50, w: 14, h: 38 },
      { type: 'bench', x: 42, y: 76, w: 40, h: 4, legs: false },
      { type: 'band', x0: 80, y0: 62, x1: 58, y1: 62, sag: 0 },
    ],
    keys: repKeys(CABLE_ROW_OUT, CABLE_ROW_IN, CABLE_ROW_IN, { mode: 'lift' }),
  }),

  cable_single_arm_row: clip({
    id: 'cable_single_arm_row', duration: 3100,
    props: [
      { type: 'machine', x: 84, y: 50, w: 14, h: 38 },
      { type: 'bench', x: 42, y: 76, w: 40, h: 4, legs: false },
      { type: 'band', x0: 80, y0: 60, x1: 58, y1: 60, sag: 0 },
    ],
    keys: repKeys(CABLE_ONE_OUT, CABLE_ONE_IN, CABLE_ONE_IN, { mode: 'lift' }),
  }),

  machine_row: clip({
    id: 'machine_row', duration: 3000,
    props: [
      { type: 'machine', x: 76, y: 44, w: 22, h: 44 },
      { type: 'bench', x: 34, y: 76, w: 26, h: 5 },
    ],
    keys: repKeys(MACHINE_OUT, MACHINE_IN, MACHINE_IN, { mode: 'lift' }),
  }),

  trx_row: clip({
    id: 'trx_row', duration: 3000,
    props: [
      { type: 'band', x0: 60, y0: 8, x1: 60, y1: 52, sag: 0 },
      { type: 'band', x0: 66, y0: 8, x1: 66, y1: 52, sag: 0 },
    ],
    keys: repKeys(TRX_OUT, TRX_IN, TRX_IN, { mode: 'lift', lag: 1.2 }),
  }),

  archer_row: clip({
    id: 'archer_row', duration: 3400,
    props: [{ type: 'rings', x: 62, y: 50, w: 10, y0: 6 }],
    keys: repKeys(ARCHER_OUT, ARCHER_IN, ARCHER_IN, { mode: 'lift', lag: 1.2 }),
  }),
};
