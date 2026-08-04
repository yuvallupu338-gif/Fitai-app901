/* clips.x07.js — bespoke per-exercise animations. Keys are EXERCISE IDS.
 *
 * Curls all bend the same joint, so the elbow angle alone cannot tell them
 * apart. What actually distinguishes them is SUPPORT and IMPLEMENT: where the
 * upper arm is anchored and what the hands are holding. An incline curl hangs
 * the arm behind the torso, a concentration curl braces the elbow on a thigh,
 * a ring curl leans the whole body back. Those are the differences drawn here.
 */

import { p, STAND, SEATED } from '../core/poses.js';

const clip = (o) => Object.assign({ duration: 2800, hero: 0, ease: 'inOut', props: [] }, o);

/* Body leaning back under a bar, ring or strap: the BODY curls, not the load. */
function leanBack(pelvisX, pelvisY, spine, hx, hy, feetX) {
  return {
    x: pelvisX, y: pelvisY, spine, head: spine - 6,
    handL: { x: hx - 3, y: hy, bend: 1 }, handR: { x: hx + 3, y: hy, bend: 1 },
    footPtL: { x: feetX, y: 87.5, bend: -1 }, footPtR: { x: feetX + 3, y: 87.5, bend: -1 },
    footL: 12, footR: 12,
  };
}

/* Standing, arms at the sides. */
const armsDown = (over) => p(STAND, Object.assign({ armL: [-84, -88], armR: [-96, -92] }, over));

const CURL_DOWN = armsDown({ load: 'dumbbell' });
const CURL_MID = p(STAND, { armL: [-85, -18], armR: [-97, -12], load: 'dumbbell' });
const CURL_UP = p(STAND, { armL: [-86, 46], armR: [-98, 52], load: 'dumbbell' });

/* Hammer: neutral grip, elbow pinned tighter, and the hand stops lower — the
   forearm never rotates up as far as it does under a supinated grip. */
const HAM_DOWN = p(STAND, { armL: [-88, -90], armR: [-92, -90], load: 'dumbbell' });
const HAM_MID = p(STAND, { armL: [-89, -34], armR: [-91, -30], load: 'dumbbell' });
const HAM_UP = p(STAND, { armL: [-90, 24], armR: [-92, 28], load: 'dumbbell' });

/* Barbell: both hands on one bar so they travel together, and the torso rocks
   back a touch under the load. */
const BB_DOWN = p(STAND, { armL: [-88, -90], armR: [-92, -90], load: 'barbell' });
const BB_UP = p(STAND, { spine: 93, armL: [-88, 40], armR: [-92, 44], load: 'barbell' });
const EZ_DOWN = p(STAND, { armL: [-90, -86], armR: [-90, -94], load: 'barbell' });
const EZ_UP = p(STAND, { spine: 91, armL: [-92, 30], armR: [-88, 36], load: 'barbell' });

const ISO_TOWEL_A = p(STAND, { armL: [-84, -6], armR: [-96, -2] });
const ISO_TOWEL_B = p(STAND, { y: 57.6, spine: 89, armL: [-83, -2], armR: [-95, 2] });
const ISO_DOOR_A = p(STAND, { armL: [-52, 8], armR: [-58, 12] });
const ISO_DOOR_B = p(STAND, { spine: 88, armL: [-50, 12], armR: [-56, 16] });

const BAR_LOW = leanBack(38, 66, 36, 50, 52, 74);
const BAR_HIGH = leanBack(44, 60, 40, 50, 52, 74);
const RING_LOW = leanBack(36, 68, 30, 52, 50, 70);
const RING_HIGH = leanBack(43, 61, 34, 52, 50, 70);
const TRX_LOW = leanBack(34, 70, 26, 54, 46, 68);
const TRX_HIGH = leanBack(42, 62, 32, 54, 46, 68);

const BAND_DOWN = armsDown({});
const BAND_MID = p(STAND, { armL: [-86, 30], armR: [-98, 36] });
const BAND_UP = p(STAND, { armL: [-86, 44], armR: [-98, 50] });

const INCLINE_DOWN = {
  x: 40, y: 62, spine: 58, head: 62,
  armL: [-96, -94], armR: [-100, -98], load: 'dumbbell',
  legL: [-30, -66], legR: [-34, -70], footL: 6, footR: 6,
};
const INCLINE_UP = Object.assign({}, INCLINE_DOWN, { armL: [-96, 30], armR: [-100, 34] });

const CONC_DOWN = p(SEATED, { x: 46, y: 68, spine: 62, head: 54, armL: [-70, -84], armR: [-64, -88], load: 'dumbbell' });
const CONC_UP = p(SEATED, { x: 46, y: 68, spine: 62, head: 54, armL: [-70, 12], armR: [-64, 18], load: 'dumbbell' });

const CABLE_DOWN = p(STAND, { x: 44, armL: [-84, -70], armR: [-96, -66] });
const CABLE_MID = p(STAND, { x: 44, armL: [-86, 34], armR: [-98, 40] });
const CABLE_UP = p(STAND, { x: 44, armL: [-86, 44], armR: [-98, 50] });

const MACH_DOWN = p(SEATED, { x: 40, y: 68, spine: 80, head: 76, armL: [-40, -46], armR: [-36, -50] });
const MACH_UP = p(SEATED, { x: 40, y: 68, spine: 80, head: 76, armL: [-40, 26], armR: [-36, 22] });

export const X07_CLIPS = {
  /* Isometrics: the joint barely moves, so animate strain rather than range. */
  towel_curl_iso: clip({
    id: 'towel_curl_iso', duration: 4000, hero: 0.5,
    props: [{ type: 'band', x0: 44, y0: 87, x1: 47, y1: 58, sag: 1 }],
    keys: [{ t: 0, pose: ISO_TOWEL_A }, { t: 0.5, pose: ISO_TOWEL_B }, { t: 1, pose: ISO_TOWEL_A }],
  }),

  doorframe_biceps_curl: clip({
    id: 'doorframe_biceps_curl', duration: 4000, hero: 0.5,
    props: [{ type: 'wall', x: 76, y0: 8, y1: 88 }],
    keys: [{ t: 0, pose: ISO_DOOR_A }, { t: 0.5, pose: ISO_DOOR_B }, { t: 1, pose: ISO_DOOR_A }],
  }),

  /* Bodyweight: the BODY travels, the implement stays put. */
  bodyweight_curl_bar: clip({
    id: 'bodyweight_curl_bar', duration: 3200,
    props: [{ type: 'bar', x: 50, y: 52, w: 34 }],
    keys: [{ t: 0, pose: BAR_LOW }, { t: 0.45, pose: BAR_HIGH }, { t: 0.6, pose: BAR_HIGH }, { t: 1, pose: BAR_LOW }],
  }),

  ring_curl: clip({
    id: 'ring_curl', duration: 3200,
    props: [{ type: 'rings', x: 52, y: 50, w: 8, y0: 6 }],
    keys: [{ t: 0, pose: RING_LOW }, { t: 0.45, pose: RING_HIGH }, { t: 0.62, pose: RING_HIGH }, { t: 1, pose: RING_LOW }],
  }),

  trx_biceps_curl: clip({
    id: 'trx_biceps_curl', duration: 3200,
    props: [
      { type: 'band', x0: 52, y0: 8, x1: 51, y1: 46, sag: 0 },
      { type: 'band', x0: 58, y0: 8, x1: 57, y1: 46, sag: 0 },
    ],
    keys: [{ t: 0, pose: TRX_LOW }, { t: 0.45, pose: TRX_HIGH }, { t: 0.6, pose: TRX_HIGH }, { t: 1, pose: TRX_LOW }],
  }),

  band_biceps_curl: clip({
    id: 'band_biceps_curl', duration: 2900,
    props: [{ type: 'band', x0: 49, y0: 87.5, x1: 52, y1: 57, sag: 3 }],
    keys: [
      { t: 0, pose: BAND_DOWN }, { t: 0.45, pose: BAND_MID },
      { t: 0.6, pose: BAND_UP }, { t: 1, pose: BAND_DOWN },
    ],
  }),

  /* Free weights. */
  biceps_curl: clip({
    id: 'biceps_curl',
    keys: [
      { t: 0, pose: CURL_DOWN }, { t: 0.3, pose: CURL_MID }, { t: 0.5, pose: CURL_UP },
      { t: 0.8, pose: CURL_MID }, { t: 1, pose: CURL_DOWN },
    ],
  }),

  hammer_curl: clip({
    id: 'hammer_curl', duration: 2700,
    keys: [
      { t: 0, pose: HAM_DOWN }, { t: 0.32, pose: HAM_MID }, { t: 0.5, pose: HAM_UP },
      { t: 0.8, pose: HAM_MID }, { t: 1, pose: HAM_DOWN },
    ],
  }),

  bb_curl: clip({
    id: 'bb_curl', duration: 2900,
    keys: [{ t: 0, pose: BB_DOWN }, { t: 0.45, pose: BB_UP }, { t: 0.58, pose: BB_UP }, { t: 1, pose: BB_DOWN }],
  }),

  ez_curl: clip({
    id: 'ez_curl', duration: 3000,
    keys: [{ t: 0, pose: EZ_DOWN }, { t: 0.45, pose: EZ_UP }, { t: 0.62, pose: EZ_UP }, { t: 1, pose: EZ_DOWN }],
  }),

  /* Supported: the giveaway is the body position, not the arm. */
  incline_db_curl: clip({
    id: 'incline_db_curl', duration: 3200,
    props: [{ type: 'bench', x: 46, y: 62, w: 34, h: 5 }],
    keys: [{ t: 0, pose: INCLINE_DOWN }, { t: 0.5, pose: INCLINE_UP }, { t: 1, pose: INCLINE_DOWN }],
  }),

  concentration_curl: clip({
    id: 'concentration_curl', duration: 3200,
    props: [{ type: 'bench', x: 46, y: 70, w: 28, h: 5 }],
    keys: [{ t: 0, pose: CONC_DOWN }, { t: 0.5, pose: CONC_UP }, { t: 1, pose: CONC_DOWN }],
  }),

  /* Machines: the prop does the identifying. */
  cable_curl: clip({
    id: 'cable_curl', duration: 2900,
    props: [
      { type: 'machine', x: 84, y: 44, w: 14, h: 44 },
      { type: 'band', x0: 80, y0: 50, x1: 58, y1: 57, sag: 1 },
    ],
    keys: [
      { t: 0, pose: CABLE_DOWN }, { t: 0.45, pose: CABLE_MID },
      { t: 0.6, pose: CABLE_UP }, { t: 1, pose: CABLE_DOWN },
    ],
  }),

  machine_curl: clip({
    id: 'machine_curl', duration: 3000,
    props: [
      { type: 'machine', x: 64, y: 52, w: 24, h: 36 },
      { type: 'bench', x: 38, y: 70, w: 24, h: 5 },
    ],
    keys: [{ t: 0, pose: MACH_DOWN }, { t: 0.5, pose: MACH_UP }, { t: 1, pose: MACH_DOWN }],
  }),
};
