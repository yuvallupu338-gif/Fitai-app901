/*
 * passengers.js — the people.
 *
 * Built as posed meshes rather than a skeleton. A passenger on a late train
 * does one of about eight things, holds it for minutes at a time, and changes
 * between them when you are not looking — which is the mechanic — so an
 * animation system would spend its whole budget interpolating between poses
 * the player is specifically not supposed to see it interpolate between.
 *
 * The head is the exception and is its own node, because the head is the
 * entire performance: a passenger who is reading and a passenger who is
 * looking directly at you are the same body with fifteen degrees of neck
 * between them.
 *
 * Faces stay under-drawn on purpose. See textures.js.
 */

import { Builder } from '../render/mesh.js';
import { makeCanvas } from '../render/textures.js';

export const BODY_TYPES = {
  slim: { scale: 1.0, width: 0.86, belly: 0.9, shoulder: 0.98 },
  average: { scale: 1.0, width: 1.0, belly: 1.0, shoulder: 1.0 },
  heavy: { scale: 0.98, width: 1.22, belly: 1.35, shoulder: 1.08 },
  small: { scale: 0.88, width: 0.94, belly: 0.95, shoulder: 0.92 },
  tall: { scale: 1.09, width: 0.95, belly: 0.92, shoulder: 1.04 },
};

export const POSES = [
  'sit', 'sitSlump', 'sitRead', 'sitPhone', 'sitStare', 'sitHandsFolded',
  'stand', 'standHold', 'standStill',
];

export const HEAD_STYLES = ['short', 'long', 'bald', 'cap', 'hood', 'headphones', 'scarf'];

/* Where the head node sits relative to the body's origin, per pose. */
export const HEAD_ANCHOR = {
  sit: [0, 1.19, 0.03],
  sitSlump: [0, 1.10, 0.14],
  sitRead: [0, 1.18, 0.05],
  sitPhone: [0, 1.16, 0.07],
  sitStare: [0, 1.21, 0.02],
  sitHandsFolded: [0, 1.19, 0.03],
  stand: [0, 1.62, 0.0],
  standHold: [0, 1.62, 0.0],
  standStill: [0, 1.63, 0.0],
};

/* Extra neck pitch baked into a pose. A slumped passenger's head hangs even
   when the game is not asking it to look anywhere. */
export const HEAD_BIAS = {
  sit: -0.08,
  sitSlump: 0.62,
  sitRead: 0.34,
  sitPhone: 0.52,
  sitStare: 0.0,
  sitHandsFolded: 0.06,
  stand: -0.02,
  standHold: 0.0,
  standStill: 0.0,
};

export const SITTING_POSES = new Set(['sit', 'sitSlump', 'sitRead', 'sitPhone', 'sitStare', 'sitHandsFolded']);

/* ---- geometry helpers ------------------------------------------------ */

/* A tapered cylinder between two points, in whatever frame the builder is
   currently in. Every limb in the game is one of these. */
function limb(b, from, to, r0, r1, segments = 10) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-5) return;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)));
  b.push();
  b.translate((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  b.rotateY(yaw);
  b.rotateX(pitch);
  b.cylinder(r1, r0, len, segments, { caps: true, tiles: 1, tilesV: 1 });
  b.pop();
}

function joint(b, at, r, segs = 10) {
  b.push();
  b.translate(at[0], at[1], at[2]);
  b.sphere(r, segs, Math.max(6, Math.round(segs * 0.7)));
  b.pop();
}

/*
 * Baked occlusion for a body, in the same spirit as the carriage's: entirely
 * faked, and the single cheapest thing that stops a figure reading as a set of
 * pale shapes stuck together. Under the chin, inside the arms, under the lap
 * and along anything facing the floor.
 */
function bodyAO(sitting, hipY, chestY) {
  return (x, y, z, nx, ny, nz) => {
    let ao = 1;
    /* Down-facing surfaces see the floor and not much else. */
    if (ny < -0.15) ao *= 0.68 + 0.32 * (1 + ny);
    /* The trough between the arms and the ribs. */
    const inner = Math.max(0, 0.20 - Math.abs(x));
    if (y > hipY && y < chestY) ao *= 1 - inner * 0.9;
    /* Under the chin, where a collar is. */
    const throat = 1 - Math.min(1, Math.abs(y - chestY) / 0.16);
    if (throat > 0 && Math.abs(x) < 0.09 && z > -0.02) ao *= 1 - throat * 0.34;
    /* The lap, and the shadow a seated body casts into its own knees. */
    if (sitting && y < hipY + 0.10 && z > 0.05) ao *= 0.78;
    if (sitting && Math.abs(x) < 0.09 && y < hipY + 0.06) ao *= 0.74;
    /* Backs sit against a seat back. */
    if (z < -0.06) ao *= 0.86;
    /* Everything below the knee is in the well under the bench. */
    ao *= 0.74 + 0.26 * Math.min(1, y / 0.55);
    return Math.max(0.30, Math.min(1, ao));
  };
}

/*
 * A shoe. Four pieces: a sole that runs the whole length, an upper over the
 * middle of it, a lower toe box and a heel counter behind. A single box in
 * dark leather reads as a brick, and a seated passenger puts both of them
 * squarely in the aisle at eye level for anyone standing up.
 */
function shoe(b, x, y, z, W, S) {
  b.push();
  b.translate(x, y, z);
  /* Sole, proud of the upper on every side. */
  b.push();
  b.translate(0, -0.024 * S, 0);
  b.roundedBox(0.106 * W, 0.020 * S, 0.250 * S, 0.010, { tiles: 3 });
  b.pop();
  /* The upper over the instep, tallest at the back. */
  b.push();
  b.translate(0, 0.006 * S, -0.020 * S);
  b.roundedBox(0.098 * W, 0.052 * S, 0.150 * S, 0.022, { tiles: 3 });
  b.pop();
  /* Toe: lower and narrower, so the shoe tapers to a front instead of ending
     in a wall. */
  b.push();
  b.translate(0, -0.006 * S, 0.088 * S);
  b.roundedBox(0.084 * W, 0.034 * S, 0.090 * S, 0.016, { tiles: 3 });
  b.pop();
  /* Heel counter and the block under it. */
  b.push();
  b.translate(0, 0.020 * S, -0.088 * S);
  b.roundedBox(0.092 * W, 0.058 * S, 0.078 * S, 0.020, { tiles: 3 });
  b.pop();
  b.push();
  b.translate(0, -0.036 * S, -0.082 * S);
  b.box(0.090 * W, 0.020 * S, 0.070 * S, { tiles: 3 });
  b.pop();
  b.pop();
}

/*
 * Builds one body in one pose. Origin is on the floor between the feet, +Z is
 * the direction the passenger faces.
 *
 * The numbers are a seated adult on a 0.44m cushion: knees a shade higher than
 * the hips, feet slightly forward, shoulders 0.50m above the seat. Everything
 * else hangs off those.
 */
export function buildBody(gl, materials, typeKey, pose, opts = {}) {
  const type = BODY_TYPES[typeKey] || BODY_TYPES.average;
  const b = new Builder();
  b.ao = 1;
  const S = type.scale;
  const W = type.width;

  const sitting = SITTING_POSES.has(pose);
  const seatY = 0.44 * S;
  const hipY = sitting ? seatY + 0.06 * S : 0.92 * S;
  const shoulderY = sitting ? seatY + 0.50 * S : 1.42 * S;
  b.aoFn = bodyAO(sitting, hipY, shoulderY);
  const shoulderX = 0.185 * W * type.shoulder;
  const hipX = 0.10 * W;

  /* --- legs --- */
  b.material('legs');
  if (sitting) {
    const kneeZ = 0.40 * S;
    const kneeY = hipY + 0.015 * S;
    const ankleZ = kneeZ + (pose === 'sitSlump' ? 0.24 : 0.10) * S;
    for (const s of [-1, 1]) {
      const hip = [s * hipX, hipY, 0.02];
      const knee = [s * (hipX + 0.02), kneeY, kneeZ];
      const ankle = [s * (hipX + 0.03), 0.075 * S, ankleZ];
      limb(b, hip, knee, 0.108 * W, 0.080 * W);
      limb(b, knee, ankle, 0.074 * W, 0.056 * W);
      joint(b, knee, 0.076 * W);
      joint(b, hip, 0.098 * W);
      b.material('shoes');
      shoe(b, s * (hipX + 0.03), 0.040 * S, ankleZ + 0.055 * S, W, S);
      b.material('legs');
    }
  } else {
    for (const s of [-1, 1]) {
      const hip = [s * hipX, hipY, 0];
      const knee = [s * (hipX + 0.005), 0.48 * S, 0.015 * S];
      const ankle = [s * (hipX + 0.01), 0.085 * S, 0];
      limb(b, hip, knee, 0.110 * W, 0.077 * W);
      limb(b, knee, ankle, 0.072 * W, 0.054 * W);
      joint(b, knee, 0.074 * W);
      b.material('shoes');
      shoe(b, s * (hipX + 0.01), 0.040 * S, 0.048 * S, W, S);
      b.material('legs');
    }
  }

  /* --- torso --- */
  b.material('coat');
  const lean = pose === 'sitSlump' ? 0.30 : pose === 'sitRead' ? 0.12 : sitting ? 0.10 : 0.02;
  const chestZ = Math.sin(lean) * (shoulderY - hipY);
  const chest = [0, shoulderY - Math.abs(chestZ) * 0.1, chestZ * (sitting ? -0.6 : -0.4)];

  b.push();
  b.translate(0, (hipY + chest[1]) / 2, (chest[2]) / 2);
  b.rotateX(-lean * 0.9);
  b.roundedBox(0.335 * W * type.shoulder, (chest[1] - hipY) * 1.10, 0.225 * W * type.belly, 0.045, { tiles: 2 });
  b.pop();
  /* Shoulders. Two caps and a bar rather than a slab: the silhouette of a
     shoulder is the one part of a seated figure the eye checks. */
  b.push();
  b.translate(0, chest[1] - 0.035 * S, chest[2]);
  b.roundedBox(shoulderX * 2 + 0.02 * W, 0.135 * S, 0.215 * W, 0.05, { tiles: 2 });
  b.pop();
  for (const s of [-1, 1]) {
    b.push();
    b.translate(s * shoulderX, chest[1] - 0.045 * S, chest[2]);
    b.scale(1, 0.85, 0.9);
    b.sphere(0.082 * W, 10, 8);
    b.pop();
  }
  /* Hips */
  b.push();
  b.translate(0, hipY + 0.015 * S, sitting ? -0.04 : 0);
  b.roundedBox(0.30 * W, 0.165 * S, 0.24 * W * type.belly, 0.04, { tiles: 2 });
  b.pop();

  /* The front of the coat: a seam down the middle, two lapels folded back off
     it, and three buttons. Flat-fronted outerwear is the thing that most makes
     a low-polygon figure look like a mannequin, and none of this costs more
     than a few dozen triangles. */
  const frontZ = chest[2] + 0.118 * W * type.belly;
  const torsoH = chest[1] - hipY;
  b.push();
  b.translate(0, hipY + torsoH * 0.5, frontZ);
  b.rotateX(-lean * 0.9);
  b.box(0.014 * W, torsoH * 1.02, 0.014, { tiles: 4 });
  b.pop();
  for (const s of [-1, 1]) {
    b.push();
    b.translate(s * 0.062 * W, chest[1] - 0.115 * S, frontZ + 0.004);
    b.rotateZ(s * 0.30);
    b.rotateY(s * 0.20);
    b.box(0.085 * W, 0.24 * S, 0.012, { tiles: 3 });
    b.pop();
    /* Pocket flap. */
    b.push();
    b.translate(s * 0.098 * W, hipY + torsoH * 0.26, frontZ - 0.004);
    b.box(0.088 * W, 0.036 * S, 0.010, { tiles: 3 });
    b.pop();
  }
  b.material('spectacleFrame');
  for (let i = 0; i < 3; i++) {
    b.push();
    b.translate(0, chest[1] - (0.20 + i * 0.115) * S, frontZ + 0.010);
    b.rotateX(Math.PI / 2);
    b.cylinder(0.011 * W, 0.011 * W, 0.006, 8, { caps: true });
    b.pop();
  }
  b.material('coat');

  /*
   * The cut of the coat, which is the cheapest silhouette difference there is
   * and the reason six passengers used to look like one passenger six times.
   */
  const cut = opts.cut || 'long';
  if (cut === 'long') {
    /* Skirts of an overcoat, over the hips and down. On a seated figure it
       spreads across the cushion; standing, it falls to mid-thigh. */
    const dropY = sitting ? hipY - 0.04 * S : hipY - 0.24 * S;
    b.push();
    b.translate(0, (hipY + dropY) / 2, (sitting ? -0.02 : 0));
    b.roundedBox(0.34 * W, hipY - dropY + 0.10 * S, 0.28 * W * type.belly, 0.04, { tiles: 2 });
    b.pop();
  } else if (cut === 'puffer') {
    /* Quilting: bands round the torso, each a shade proud of the one below. */
    const bands = 4;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const y = hipY + (chest[1] - hipY) * (0.12 + t * 0.74);
      const bulge = 1 + 0.045 * Math.sin(t * Math.PI);
      b.push();
      b.translate(0, y, chest[2] * 0.4);
      b.rotateX(-lean * 0.6);
      b.roundedBox(0.352 * W * type.shoulder * bulge, 0.115 * S,
        0.245 * W * type.belly * bulge, 0.045, { tiles: 2 });
      b.pop();
    }
  }

  /* --- collar and neck --- */
  b.push();
  b.translate(0, chest[1] + 0.005 * S, chest[2]);
  b.rotateX(Math.PI / 2);
  b.cylinder(0.078 * W, 0.086 * W, 0.055 * S, 12, { caps: false });
  b.pop();

  /* The neck runs well up into the head. It used to stop 18mm short of the
     underside of the skull, and a head that does not touch its own body reads
     as floating however good everything else is. */
  b.material('skinPlain');
  limb(b, [0, chest[1] - 0.03 * S, chest[2] - 0.005],
    [0, chest[1] + 0.21 * S, chest[2] + 0.012], 0.060 * W, 0.046 * W, 12);

  /* --- arms --- */
  const arms = ARM_POSES[pose] || ARM_POSES.sit;
  for (const s of [-1, 1]) {
    const shoulder = [s * shoulderX, chest[1] - 0.045 * S, chest[2]];
    const elbow = [
      s * (shoulderX + arms.elbow[0]),
      chest[1] + arms.elbow[1] * S,
      chest[2] + arms.elbow[2] * S,
    ];
    const wrist = [
      s * (shoulderX + arms.wrist[0]),
      chest[1] + arms.wrist[1] * S,
      chest[2] + arms.wrist[2] * S,
    ];
    b.material('coat');
    limb(b, shoulder, elbow, 0.078 * W, 0.064 * W);
    limb(b, elbow, wrist, 0.062 * W, 0.050 * W);
    joint(b, elbow, 0.060 * W);
    /* A cuff, so the sleeve ends somewhere instead of dissolving. */
    joint(b, [
      wrist[0] + (elbow[0] - wrist[0]) * 0.13,
      wrist[1] + (elbow[1] - wrist[1]) * 0.13,
      wrist[2] + (elbow[2] - wrist[2]) * 0.13,
    ], 0.053 * W);
    b.material('skinPlain');
    /* Hand: a flattened block with a thumb, which at two metres is the
       difference between an arm and a tube. */
    const hand = [
      wrist[0] + (wrist[0] - elbow[0]) * 0.30,
      wrist[1] + (wrist[1] - elbow[1]) * 0.30,
      wrist[2] + (wrist[2] - elbow[2]) * 0.30,
    ];
    joint(b, wrist, 0.046 * W);
    b.push();
    b.translate(hand[0], hand[1], hand[2]);
    b.rotateY(s * 0.22);
    b.rotateX(0.18);
    /* Palm, then a narrower block of fingers angled off it, then a thumb.
       Three shapes and a hand stops being a mitten. */
    b.roundedBox(0.046 * W, 0.078 * S, 0.062 * S, 0.014, { tiles: 3 });
    b.push();
    b.translate(0, -0.006 * S, 0.052 * S);
    b.rotateX(0.30);
    b.roundedBox(0.040 * W, 0.062 * S, 0.055 * S, 0.014, { tiles: 3 });
    b.pop();
    b.push();
    b.translate(s * 0.028 * W, -0.004 * S, 0.020 * S);
    b.rotateZ(-s * 0.5);
    b.roundedBox(0.022 * W, 0.048 * S, 0.026 * S, 0.008, { tiles: 3 });
    b.pop();
    b.pop();
  }

  /* --- what they are holding --- */
  if (pose === 'sitRead') {
    /* Held, not brandished. At 0.44 x 0.40 and dead white this was a
       billboard bolted to the passenger's chest, and it hid the whole
       performance behind it. */
    b.material('prop');
    b.push();
    b.translate(0, chest[1] - 0.115 * S, chest[2] + 0.235 * S);
    b.rotateX(-0.62);
    b.rotateZ(0.05);
    b.box(0.285, 0.235, 0.004, { tiles: 1 });
    b.pop();
    b.push();
    b.translate(0, chest[1] - 0.112 * S, chest[2] + 0.228 * S);
    b.rotateX(-0.62);
    b.rotateZ(-0.04);
    b.box(0.265, 0.215, 0.004, { tiles: 1 });
    b.pop();
  } else if (pose === 'sitPhone') {
    b.material('screen');
    b.push();
    b.translate(0, chest[1] - 0.20 * S, chest[2] + 0.26 * S);
    b.rotateX(-1.15);
    b.box(0.075, 0.15, 0.008, { tiles: 1 });
    b.pop();
  }

  const mesh = b.build(gl, materials);
  mesh.pose = pose;
  mesh.bodyType = typeKey;
  return mesh;
}

/* Elbow and wrist offsets from the shoulder, per pose. Signs on X are applied
   by the caller so the two arms mirror. */
const ARM_POSES = {
  sit: { elbow: [0.035, -0.24, 0.02], wrist: [-0.02, -0.40, 0.20] },
  sitHandsFolded: { elbow: [0.035, -0.24, 0.03], wrist: [-0.10, -0.38, 0.16] },
  sitSlump: { elbow: [0.04, -0.26, -0.02], wrist: [0.02, -0.44, 0.10] },
  sitRead: { elbow: [0.06, -0.20, 0.14], wrist: [-0.02, -0.06, 0.30] },
  sitPhone: { elbow: [0.045, -0.22, 0.06], wrist: [-0.05, -0.22, 0.26] },
  sitStare: { elbow: [0.03, -0.25, 0.02], wrist: [0.00, -0.42, 0.26] },
  stand: { elbow: [0.025, -0.27, 0.01], wrist: [0.00, -0.52, 0.05] },
  standHold: { elbow: [0.03, -0.10, 0.03], wrist: [-0.02, 0.20, 0.02] },
  standStill: { elbow: [0.02, -0.28, 0.0], wrist: [0.0, -0.54, 0.0] },
};

/*
 * A head. Two groups — skin (which carries the face texture) and hair — so a
 * passenger's expression can be swapped by pointing the skin group's map at a
 * different face without rebuilding anything.
 */
/*
 * The profile of a skull, by latitude. v = 0 is the crown and v = 1 the chin.
 *
 * A head is not a ball, and a ball is what every passenger had. The cranium is
 * the widest part and sits high; below the cheekbones it narrows fast to a
 * chin about half the width, and the chin comes forward as it goes. The face
 * texture is unaffected — the eyes stay at v = 0.40, in the full-width part,
 * and the mouth at v = 0.62, on the taper, which is where a mouth is.
 */
export function skullProfile(v) {
  let r;
  if (v < 0.26) r = 0.80 + 0.20 * (v / 0.26);                       // crown
  else if (v < 0.52) r = 1;                                          // cranium
  else r = 1 - 0.46 * Math.pow((v - 0.52) / 0.48, 1.35);             // jaw to chin
  const z = v > 0.52 ? Math.pow((v - 0.52) / 0.48, 1.6) * 0.020 : 0; // chin forward
  return { r, z };
}

export function buildHead(gl, materials, style, opts = {}) {
  const b = new Builder();
  b.ao = 1;
  /* Occlusion for a head: the underside of the jaw, the back of the neck and
     the sockets around the eyes, all of which a bare sphere lacks entirely. */
  b.aoFn = (x, y, z) => {
    let ao = 1;
    if (y < -0.03) ao *= 0.74 + 0.26 * Math.min(1, (y + 0.13) / 0.10);   // under the jaw
    if (z < -0.02) ao *= 0.90;                                            // back of the skull
    return Math.max(0.45, Math.min(1, ao));
  };

  /* The one sphere that wears the face. */
  b.material('skin');
  b.push();
  b.sphere(0.098, 30, 24, { scaleZ: 1.06, scaleY: 1.14, profile: skullProfile });
  b.pop();

  b.material('skinPlain');
  /*
   * Jaw and nose, and nothing else.
   *
   * These have to stay *inside* the head sphere everywhere except at the
   * silhouette, because the head sphere is the only part of a passenger that
   * wears the face. A brow ridge lived here briefly and stuck two centimetres
   * out in front at eye height, across the full width of the skull — so every
   * passenger in the game had a blank white head, and it looked for all the
   * world like a texture that had failed to load.
   */
  /* The jaw is in the profile now; only the nose is left. */
  b.push();
  b.translate(0, -0.012, 0.092);
  b.scale(0.30, 0.52, 0.50);
  b.sphere(0.040, 10, 8);
  b.pop();
  /* Ears, which matter only because their absence is noticeable in profile. */
  for (const s of [-1, 1]) {
    b.push();
    b.translate(s * 0.094, -0.004, -0.006);
    b.scale(0.38, 1, 0.72);
    b.sphere(0.032, 9, 7);
    b.pop();
  }

  /*
   * Hair, hats and hoods, all built to one rule: nothing may sit closer to the
   * camera than the head sphere anywhere in the face region, because the head
   * sphere is the only part of a passenger wearing a face. A cap dome that
   * reaches down past the eyes, or a peak at eye height rather than brow
   * height, does not shade a face — it deletes it.
   *
   * The head sphere is radius 0.098 with 1.14 on Y and 1.06 on Z, so its front
   * is at z = 0.104 at eye level (y = 0.035) and its widest is x = 0.098.
   * Every number below is checked against those two.
   */
  b.material('hair');
  switch (style) {
    case 'bald':
      break;
    case 'long':
      /* A mass at the back and a crown, rather than a dome over everything. */
      b.push();
      b.translate(0, 0.010, -0.040);
      b.sphere(0.105, 18, 13, { scaleY: 1.06, scaleZ: 0.85 });
      b.pop();
      b.push();
      b.translate(0, 0.055, -0.010);
      b.sphere(0.100, 18, 12, { scaleY: 0.70 });
      b.pop();
      /* Fall of hair down the back and past the jaw on both sides. */
      b.push();
      b.translate(0, -0.095, -0.052);
      b.scale(1, 1, 0.62);
      b.sphere(0.098, 14, 11, { scaleY: 1.5 });
      b.pop();
      for (const s of [-1, 1]) {
        b.push();
        b.translate(s * 0.082, -0.055, -0.012);
        b.scale(0.55, 1.5, 0.85);
        b.sphere(0.052, 10, 8);
        b.pop();
      }
      /* A fringe, so the hairline is not a bald curve. */
      b.push();
      b.translate(0, 0.052, 0.058);
      b.scale(1, 0.42, 0.55);
      b.sphere(0.095, 14, 10);
      b.pop();
      break;
    case 'cap':
      /* Crown sat high with a fast taper, so its edge is at the hairline. */
      b.push();
      b.translate(0, 0.062, -0.004);
      b.sphere(0.104, 20, 12, { scaleY: 0.55 });
      b.pop();
      /* Peak at brow height. Anything lower is a blindfold. */
      b.push();
      b.translate(0, 0.050, 0.098);
      b.rotateX(0.18);
      b.box(0.170, 0.012, 0.080, { tiles: 3 });
      b.pop();
      /* The seam band round the base, tucked just inside the skull. */
      b.push();
      b.translate(0, 0.046, -0.004);
      b.rotateX(Math.PI / 2);
      b.cylinder(0.101, 0.101, 0.020, 18, { caps: false });
      b.pop();
      break;
    case 'hood':
      /* Pulled back off the face, so there is a face in there to not quite
         see. A hood centred on the head simply replaces it with a larger
         head. */
      b.push();
      b.translate(0, 0.014, -0.052);
      b.sphere(0.134, 20, 14, { scaleY: 1.06, scaleZ: 0.95 });
      b.pop();
      /* The rim of the opening. */
      b.push();
      b.translate(0, 0.014, 0.036);
      b.rotateX(-0.14);
      b.rotateZ(Math.PI / 2);
      b.cylinder(0.106, 0.106, 0.026, 20, { caps: false });
      b.pop();
      break;
    case 'headphones':
      b.push();
      b.translate(0, 0.050, -0.010);
      b.sphere(0.101, 18, 12, { scaleY: 0.78 });
      b.pop();
      b.material('gear');
      for (const s of [-1, 1]) {
        b.push();
        b.translate(s * 0.104, 0.0, -0.006);
        b.rotateZ(Math.PI / 2);
        b.cylinder(0.040, 0.040, 0.030, 12, { caps: true });
        b.pop();
      }
      b.push();
      b.translate(0, 0.096, -0.010);
      b.rotateZ(Math.PI / 2);
      b.cylinder(0.012, 0.012, 0.20, 8, { caps: true });
      b.pop();
      break;
    case 'scarf':
      b.push();
      b.translate(0, 0.046, -0.010);
      b.sphere(0.100, 18, 12, { scaleY: 0.86 });
      b.pop();
      b.material('gear');
      b.push();
      b.translate(0, -0.115, 0);
      b.rotateX(Math.PI / 2);
      b.cylinder(0.098, 0.098, 0.09, 12, { caps: false });
      b.pop();
      break;
    default: /* short */
      b.push();
      b.translate(0, 0.050, -0.014);
      b.sphere(0.103, 20, 14, { scaleY: 0.80, scaleZ: 1.00 });
      b.pop();
      /* Three clumps, so the crown is not a moulded shell. They sit above and
         behind the hairline, where nothing can reach the face. */
      for (const [cx, cy, cz, cr] of [[-0.042, 0.086, -0.030, 0.036],
        [0.038, 0.092, -0.014, 0.030], [0.004, 0.074, -0.062, 0.034]]) {
        b.push();
        b.translate(cx, cy, cz);
        b.scale(1, 0.62, 1);
        b.sphere(cr, 9, 7);
        b.pop();
      }
      /* Sideburns, out at the ears where nothing can be in front of a face. */
      for (const s of [-1, 1]) {
        b.push();
        b.translate(s * 0.086, -0.026, -0.002);
        b.scale(0.30, 1.0, 0.55);
        b.sphere(0.042, 9, 7);
        b.pop();
      }
      break;
  }

  /* Spectacles. A strong silhouette cue at the distance passengers are
     usually seen from, and the fastest way to tell two of them apart. */
  if (opts.glasses) {
    b.material('spectacleFrame');
    for (const s of [-1, 1]) {
      b.push();
      b.translate(s * 0.036, 0.010, 0.088);
      b.rotateX(Math.PI / 2);
      b.cylinder(0.030, 0.030, 0.006, 14, { caps: false });
      b.pop();
    }
    b.push();
    b.translate(0, 0.010, 0.098);
    b.box(0.020, 0.005, 0.005, { tiles: 1 });
    b.pop();
    for (const s of [-1, 1]) {
      b.push();
      b.translate(s * 0.076, 0.012, 0.040);
      b.rotateY(s * 0.9);
      b.box(0.075, 0.005, 0.005, { tiles: 1 });
      b.pop();
    }
    b.material('spectacle');
    for (const s of [-1, 1]) {
      b.push();
      b.translate(s * 0.036, 0.010, 0.086);
      b.panel(0.055, 0.048, { doubleSided: true });
      b.pop();
    }
  }

  const mesh = b.build(gl, materials);
  mesh.style = style;
  mesh.glasses = Boolean(opts.glasses);
  return mesh;
}

/*
 * A contact shadow. Cheap, wrong, and the single biggest thing keeping a
 * passenger from looking like they are hovering two centimetres off the seat.
 */
export function blobShadowTexture() {
  const S = 128;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.30)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvas;
}

export function buildShadowQuad(gl, materials) {
  const b = new Builder();
  b.ao = 1;
  b.material('shadow');
  b.push();
  b.rotateX(-Math.PI / 2);
  b.panel(1, 1);
  b.pop();
  return b.build(gl, materials);
}

/*
 * Caches the pose/head meshes, built on first use. A run touches maybe a
 * dozen combinations out of the forty-odd possible, and building them all up
 * front costs half a second of load for meshes nobody sees.
 */
export class PassengerMeshCache {
  constructor(gl, materials) {
    this.gl = gl;
    this.materials = materials;
    this.bodies = new Map();
    this.heads = new Map();
    this.shadow = buildShadowQuad(gl, materials);
  }

  body(type, pose, cut = 'long') {
    const key = `${type}/${pose}/${cut}`;
    let mesh = this.bodies.get(key);
    if (!mesh) {
      mesh = buildBody(this.gl, this.materials, type, pose, { cut });
      this.bodies.set(key, mesh);
    }
    return mesh;
  }

  head(style, glasses = false) {
    const key = `${style}${glasses ? '+glasses' : ''}`;
    let mesh = this.heads.get(key);
    if (!mesh) {
      mesh = buildHead(this.gl, this.materials, style, { glasses });
      this.heads.set(key, mesh);
    }
    return mesh;
  }

  dispose() {
    for (const m of this.bodies.values()) m.dispose();
    for (const m of this.heads.values()) m.dispose();
    this.shadow.dispose();
  }
}
