/* clips.x04.js — bespoke per-exercise animations. Keys are EXERCISE IDS.
 *
 * Bodyweight horizontal pulling. These all drive the elbows behind the torso,
 * so what tells them apart is BODY ANGLE: the more horizontal you are, the
 * harder it gets. That progression — bar high and body upright, down to feet
 * elevated and body level — IS the family, so the hanging rows share one
 * geometry with the angle as the variable.
 */

import { repKeys } from '../core/anim.js';

const clip = (o) => Object.assign({ duration: 3000, hero: 0, ease: 'inOut', props: [] }, o);

/*
 * Hanging under a bar. `lean` is the body angle above horizontal: 40 is a
 * near-upright beginner row, 4 is feet-elevated and brutal. `reach` is how far
 * the shoulder sits below the hands, which is what the pull actually changes.
 * The feet stay pinned and the body rotates about them, as it really does.
 */
function row(lean, barX, barY, reach, footY) {
  const r = (lean * Math.PI) / 180;
  const sx = barX;
  const sy = barY + reach;
  const px = sx - 22.88 * Math.cos(r);
  const py = sy + 22.88 * Math.sin(r);
  const fx = px - 30.4 * Math.cos(r);
  const fy = Math.min(footY, py + 30.4 * Math.sin(r));
  return {
    x: px, y: py, spine: lean, head: lean + 6,
    handL: { x: barX - 3, y: barY, bend: 1 },
    handR: { x: barX + 3, y: barY, bend: 1 },
    footPtL: { x: fx, y: fy, bend: -1 },
    footPtR: { x: fx + 3, y: fy, bend: -1 },
    footL: lean + 58, footR: lean + 58,
  };
}

const INCLINE_LOW = row(40, 66, 46, 23.4, 87.5);
const INCLINE_HIGH = row(46, 66, 46, 13, 87.5);
const AUSSIE_LOW = row(17, 66, 50, 23.4, 87.5);
const AUSSIE_HIGH = row(24, 66, 50, 13, 87.5);
const ELEV_LOW = row(4, 66, 52, 23.4, 74);
const ELEV_HIGH = row(11, 66, 52, 13, 74);
const TABLE_LOW = row(12, 62, 56, 23.4, 87.5);
const TABLE_HIGH = row(19, 62, 56, 13, 87.5);

/* Prone on the floor: nothing supports the arms, so the raise is small and the
   chest lifts with it — a completely different silhouette from a hanging row. */
/* The rest position lays the arms ON the mat. At [-16,-20]/[-22,-26] they hung
   below a shoulder that is already 81.6 down the frame, and both hands ended up
   three units under the floor — the audit's old tolerance let anything above
   y 92 through, and a hand at 91 is unmistakably buried. */
const PRONE_DOWN = {
  x: 42, y: 84, spine: 6, head: 16,
  armL: [-9, -13], armR: [-12, -17],
  legL: [182, 182], legR: [184, 184], footL: 96, footR: 96,
};
const PRONE_Y = Object.assign({}, PRONE_DOWN, { y: 83, spine: 12, head: 24, armL: [26, 30], armR: [20, 24] });
const PRONE_T = Object.assign({}, PRONE_DOWN, { y: 83, spine: 12, head: 24, armL: [-2, 2], armR: [-8, -4] });
const PRONE_W = Object.assign({}, PRONE_DOWN, { y: 83, spine: 12, head: 24, armL: [-40, 60], armR: [-46, 54] });

const SUPER_DOWN = Object.assign({}, PRONE_DOWN, { y: 85, spine: 2, head: 10, armL: [2, -2], armR: [-4, -8] });
const SUPER_UP = Object.assign({}, PRONE_DOWN, {
  y: 80.5, spine: 22, head: 34, armL: [176, 26], armR: [170, 20],
});

/* Bent-over band row: a hinge held still while only the arms work. */
const BENT_HOLD = {
  x: 48, y: 62, spine: 26, head: 18,
  footPtL: { x: 49, y: 87.5, bend: 1 }, footPtR: { x: 52, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};
const BENT_DOWN = Object.assign({}, BENT_HOLD, { armL: [-84, -88], armR: [-96, -92] });
const BENT_UP = Object.assign({}, BENT_HOLD, { armL: [-146, -66], armR: [-152, -72] });

/* Isometric: a towel round a post. The pull is real, the joint barely moves. */
const ISO_A = Object.assign({}, BENT_HOLD, { spine: 34, head: 26, armL: [-30, -26], armR: [-36, -32] });
const ISO_B = Object.assign({}, BENT_HOLD, { spine: 32, head: 24, armL: [-34, -30], armR: [-40, -36] });

export const X04_CLIPS = {
  incline_aussie_row: clip({
    id: 'incline_aussie_row', duration: 2900,
    props: [{ type: 'bar', x: 66, y: 46, w: 26 }],
    keys: repKeys(INCLINE_LOW, INCLINE_HIGH, INCLINE_HIGH, { mode: 'lift', lag: 1.2 }),
  }),

  aussie_row: clip({
    id: 'aussie_row', duration: 3000,
    props: [{ type: 'bar', x: 66, y: 50, w: 26 }],
    keys: repKeys(AUSSIE_LOW, AUSSIE_HIGH, AUSSIE_HIGH, { mode: 'lift', lag: 1.2 }),
  }),

  feet_elevated_aussie_row: clip({
    id: 'feet_elevated_aussie_row', duration: 3200,
    props: [{ type: 'bar', x: 66, y: 52, w: 26 }, { type: 'box', x: 12, y: 74, w: 20, h: 14 }],
    keys: repKeys(ELEV_LOW, ELEV_HIGH, ELEV_HIGH, { mode: 'lift', lag: 1.2 }),
  }),

  table_row: clip({
    id: 'table_row', duration: 3000,
    props: [{ type: 'bench', x: 62, y: 56, w: 34, h: 4 }],
    keys: repKeys(TABLE_LOW, TABLE_HIGH, TABLE_HIGH, { mode: 'lift', lag: 1.2 }),
  }),

  prone_ytw_raise: clip({
    id: 'prone_ytw_raise', duration: 4200, hero: 0.25,
    props: [{ type: 'mat', x: 44, w: 60 }],
    keys: [
      { t: 0, pose: PRONE_DOWN }, { t: 0.25, pose: PRONE_Y },
      { t: 0.5, pose: PRONE_T }, { t: 0.75, pose: PRONE_W },
      { t: 1, pose: PRONE_DOWN },
    ],
  }),

  superman_row: clip({
    id: 'superman_row', duration: 3000,
    props: [{ type: 'mat', x: 44, w: 60 }],
    keys: repKeys(SUPER_DOWN, SUPER_UP, SUPER_UP, { mode: 'lift' }),
  }),

  band_bent_over_row: clip({
    id: 'band_bent_over_row', duration: 2900,
    props: [{ type: 'band', x0: 50, y0: 87.5, x1: 58, y1: 66, sag: 2 }],
    keys: repKeys(BENT_DOWN, BENT_UP, BENT_UP, { mode: 'lift' }),
  }),

  towel_row_iso: clip({
    id: 'towel_row_iso', duration: 4000, hero: 0.5,
    props: [{ type: 'wall', x: 84, y0: 10, y1: 88 }, { type: 'band', x0: 82, y0: 58, x1: 66, y1: 60, sag: 1 }],
    keys: [{ t: 0, pose: ISO_A }, { t: 0.5, pose: ISO_B }, { t: 1, pose: ISO_A }],
  }),
};
