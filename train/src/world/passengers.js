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
function limb(b, from, to, r0, r1, segments = 7) {
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

function joint(b, at, r) {
  b.push();
  b.translate(at[0], at[1], at[2]);
  b.sphere(r, 8, 6);
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
export function buildBody(gl, materials, typeKey, pose) {
  const type = BODY_TYPES[typeKey] || BODY_TYPES.average;
  const b = new Builder();
  b.ao = 0.92;
  const S = type.scale;
  const W = type.width;

  const sitting = SITTING_POSES.has(pose);
  const seatY = 0.44 * S;
  const hipY = sitting ? seatY + 0.06 * S : 0.92 * S;
  const shoulderY = sitting ? seatY + 0.50 * S : 1.42 * S;
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
      limb(b, hip, knee, 0.105 * W, 0.078 * W);
      limb(b, knee, ankle, 0.072 * W, 0.055 * W);
      joint(b, knee, 0.072 * W);
      b.material('shoes');
      b.push();
      b.translate(s * (hipX + 0.03), 0.038 * S, ankleZ + 0.06 * S);
      b.box(0.10 * W, 0.075 * S, 0.25 * S, { tiles: 3 });
      b.pop();
      b.material('legs');
    }
  } else {
    for (const s of [-1, 1]) {
      const hip = [s * hipX, hipY, 0];
      const knee = [s * (hipX + 0.005), 0.48 * S, 0.015 * S];
      const ankle = [s * (hipX + 0.01), 0.085 * S, 0];
      limb(b, hip, knee, 0.108 * W, 0.075 * W);
      limb(b, knee, ankle, 0.070 * W, 0.052 * W);
      joint(b, knee, 0.070 * W);
      b.material('shoes');
      b.push();
      b.translate(s * (hipX + 0.01), 0.042 * S, 0.045 * S);
      b.box(0.10 * W, 0.084 * S, 0.26 * S, { tiles: 3 });
      b.pop();
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
  b.box(0.34 * W * type.shoulder, (chest[1] - hipY) * 1.10, 0.23 * W * type.belly, { tiles: 2 });
  b.pop();
  /* Shoulders: a slab across the top so the coat reads as a coat. */
  b.push();
  b.translate(0, chest[1] - 0.03 * S, chest[2]);
  b.box(shoulderX * 2 + 0.09 * W, 0.13 * S, 0.22 * W, { tiles: 2 });
  b.pop();
  /* Hips */
  b.push();
  b.translate(0, hipY + 0.015 * S, sitting ? -0.04 : 0);
  b.box(0.30 * W, 0.16 * S, 0.24 * W * type.belly, { tiles: 2 });
  b.pop();

  /* --- neck --- */
  b.material('skin');
  limb(b, [0, chest[1] - 0.02 * S, chest[2]], [0, chest[1] + 0.10 * S, chest[2] + 0.01], 0.052 * W, 0.048 * W, 8);

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
    limb(b, shoulder, elbow, 0.075 * W, 0.062 * W);
    limb(b, elbow, wrist, 0.060 * W, 0.048 * W);
    joint(b, elbow, 0.058 * W);
    b.material('skin');
    joint(b, wrist, 0.050 * W);
  }

  /* --- what they are holding --- */
  if (pose === 'sitRead') {
    b.material('prop');
    b.push();
    b.translate(0, chest[1] + 0.02 * S, chest[2] + 0.30 * S);
    b.rotateX(-0.32);
    b.box(0.44, 0.40, 0.006, { tiles: 1 });
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
export function buildHead(gl, materials, style) {
  const b = new Builder();
  b.ao = 0.95;

  b.material('skin');
  b.push();
  b.sphere(0.098, 16, 12, { scaleZ: 1.06, scaleY: 1.14 });
  b.pop();
  /* Ears, which matter only because their absence is noticeable in profile. */
  for (const s of [-1, 1]) {
    b.push();
    b.translate(s * 0.096, 0.0, -0.008);
    b.scale(0.4, 1, 0.75);
    b.sphere(0.030, 7, 5);
    b.pop();
  }

  b.material('hair');
  switch (style) {
    case 'bald':
      break;
    case 'long':
      b.push();
      b.translate(0, 0.008, -0.012);
      b.sphere(0.104, 14, 10, { scaleY: 1.14, scaleZ: 1.04 });
      b.pop();
      b.push();
      b.translate(0, -0.10, -0.055);
      b.box(0.19, 0.22, 0.10, { tiles: 3 });
      b.pop();
      break;
    case 'cap':
      b.push();
      b.translate(0, 0.045, -0.005);
      b.sphere(0.104, 14, 8, { scaleY: 0.62 });
      b.pop();
      b.push();
      b.translate(0, 0.028, 0.098);
      b.box(0.17, 0.014, 0.09, { tiles: 3 });
      b.pop();
      break;
    case 'hood':
      b.push();
      b.translate(0, 0.012, -0.030);
      b.sphere(0.132, 14, 10, { scaleY: 1.10, scaleZ: 1.10 });
      b.pop();
      break;
    case 'headphones':
      b.push();
      b.translate(0, 0.035, -0.006);
      b.sphere(0.101, 14, 9, { scaleY: 0.98 });
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
      b.translate(0, 0.030, -0.008);
      b.sphere(0.103, 14, 9, { scaleY: 1.02 });
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
      b.translate(0, 0.020, -0.008);
      b.sphere(0.102, 14, 9, { scaleY: 1.02, scaleZ: 1.03 });
      b.pop();
      break;
  }

  const mesh = b.build(gl, materials);
  mesh.style = style;
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

  body(type, pose) {
    const key = `${type}/${pose}`;
    let mesh = this.bodies.get(key);
    if (!mesh) {
      mesh = buildBody(this.gl, this.materials, type, pose);
      this.bodies.set(key, mesh);
    }
    return mesh;
  }

  head(style) {
    let mesh = this.heads.get(style);
    if (!mesh) {
      mesh = buildHead(this.gl, this.materials, style);
      this.heads.set(style, mesh);
    }
    return mesh;
  }

  dispose() {
    for (const m of this.bodies.values()) m.dispose();
    for (const m of this.heads.values()) m.dispose();
    this.shadow.dispose();
  }
}
