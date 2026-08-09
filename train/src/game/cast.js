/*
 * cast.js — the passengers, and the arcs they move along.
 *
 * Six recurring people plus whoever happens to be riding. Their arcs are
 * written as a list of states keyed by station index, and the rule for all of
 * them is the same: a passenger never changes while the player can see them.
 * The crowd hands the director a queue of pending changes and the director
 * spends it whenever the player looks away.
 *
 * The reader is the model for the rest. He reads a newspaper. Then he reads a
 * newspaper upside down. Then he is not reading. Then he is not there. Then he
 * is in the carriage ahead, and the player walked the whole length of the
 * train to get there and did not pass him.
 */

import { mat4, compose, damp, clamp, angleDelta } from '../core/math.js';
import { CAR, carCenterZ, seatSlot } from '../world/dims.js';
import { HEAD_ANCHOR, HEAD_BIAS, SITTING_POSES } from '../world/passengers.js';

export const CAST = [
  {
    id: 'reader',
    label: 'the man with the newspaper',
    body: 'average',
    head: 'cap',
    glasses: true,
    colors: { coat: [0.20, 0.21, 0.24], legs: [0.16, 0.16, 0.19], shoes: [0.07, 0.07, 0.08], hair: [0.18, 0.16, 0.15], skin: [0.76, 0.62, 0.53] },
    arc: {
      0: { car: 1, seat: 12, pose: 'sitRead' },
      1: { car: 1, seat: 12, pose: 'sitRead', upsideDown: true },
      2: { car: 1, seat: 12, pose: 'sitStare', watch: 1 },
      3: { present: false },
      4: { car: 3, seat: 41, pose: 'sitStare', watch: 0.7 },
      5: { car: 3, seat: 41, pose: 'sit', watch: 0.2 },
      6: { present: false },
    },
  },
  {
    id: 'worker',
    label: 'the one who has been awake too long',
    body: 'slim',
    head: 'short',
    colors: { coat: [0.15, 0.18, 0.26], legs: [0.13, 0.13, 0.15], shoes: [0.08, 0.07, 0.07], hair: [0.10, 0.09, 0.09], skin: [0.72, 0.58, 0.50] },
    arc: {
      0: { car: 1, seat: 30, pose: 'sitSlump' },
      1: { car: 1, seat: 30, pose: 'sitSlump' },
      2: { car: 1, seat: 29, pose: 'sitSlump' },
      3: { car: 1, seat: 28, pose: 'sit', watch: 0.3 },
      4: { present: false },
      5: { present: false },
      6: { present: false },
    },
  },
  {
    id: 'elder',
    label: 'the elderly passenger',
    body: 'small',
    head: 'scarf',
    glasses: true,
    colors: { coat: [0.30, 0.24, 0.18], legs: [0.20, 0.18, 0.16], shoes: [0.10, 0.09, 0.08], hair: [0.72, 0.71, 0.70], gear: [0.42, 0.20, 0.22], skin: [0.80, 0.68, 0.60] },
    arc: {
      0: { car: 2, seat: 6, pose: 'sitHandsFolded' },
      1: { car: 2, seat: 6, pose: 'sitHandsFolded' },
      2: { car: 2, seat: 48, pose: 'sitHandsFolded', watch: 0.4 },
      3: { car: 2, seat: 48, pose: 'sitStare', watch: 1 },
      4: { present: false },
      5: { car: 2, seat: 6, pose: 'sitHandsFolded', watch: 0.5 },
      6: { present: false },
    },
  },
  {
    id: 'student',
    label: 'the one with the headphones',
    body: 'slim',
    head: 'headphones',
    colors: { coat: [0.24, 0.26, 0.28], legs: [0.14, 0.16, 0.22], shoes: [0.60, 0.60, 0.62], hair: [0.13, 0.11, 0.10], gear: [0.08, 0.08, 0.09], skin: [0.74, 0.60, 0.52] },
    arc: {
      0: { car: 2, seat: 35, pose: 'sitPhone' },
      1: { car: 2, seat: 35, pose: 'sitPhone' },
      2: { car: 2, seat: 35, pose: 'sitPhone' },
      3: { car: 2, seat: 35, pose: 'sitStare', watch: 0.8 },
      4: { car: 2, seat: 35, pose: 'sitStare', watch: 1 },
      5: { present: false },
      6: { present: false },
    },
  },
  {
    id: 'sleeper',
    label: 'the one who is asleep',
    body: 'heavy',
    head: 'long',
    colors: { coat: [0.22, 0.26, 0.20], legs: [0.15, 0.15, 0.16], shoes: [0.09, 0.09, 0.10], hair: [0.24, 0.18, 0.14], skin: [0.78, 0.63, 0.55] },
    arc: {
      0: { car: 3, seat: 17, pose: 'sitSlump' },
      1: { car: 3, seat: 17, pose: 'sitSlump' },
      2: { car: 3, seat: 17, pose: 'sitSlump' },
      3: { car: 3, seat: 17, pose: 'sitSlump' },
      4: { car: 3, seat: 17, pose: 'sitSlump' },
      5: { present: false },
      6: { present: false },
    },
  },
  {
    id: 'stranger',
    label: 'the passenger at the far end',
    body: 'tall',
    head: 'hood',
    colors: {
      coat: [0.08, 0.08, 0.10], legs: [0.07, 0.07, 0.08], shoes: [0.05, 0.05, 0.06],
      hair: [0.05, 0.05, 0.06], skin: [0.26, 0.24, 0.24],
    },
    /* Always at the far end of whichever car the player boarded, always in the
       last seat, and never asleep. */
    arc: {
      0: { car: 1, seat: 26, pose: 'sit', watch: 0.15 },
      1: { car: 1, seat: 26, pose: 'sit', watch: 0.25 },
      2: { car: 1, seat: 26, pose: 'sit', watch: 0.35 },
      3: { car: 1, seat: 26, pose: 'sit', watch: 0.5 },
      4: { car: 1, seat: 26, pose: 'sit', watch: 0.7 },
      5: { car: 1, seat: 26, pose: 'sit', watch: 0.85 },
      6: { car: 1, seat: 26, pose: 'sitStare', watch: 1 },
    },
    talkable: true,
  },
];

/* Extras: nameless, and they behave. They exist so that the carriage feels
   used at the start and conspicuously unused later. */
export const EXTRA_APPEARANCES = [
  { body: 'average', head: 'short', colors: { coat: [0.26, 0.22, 0.28], legs: [0.14, 0.14, 0.16], shoes: [0.08, 0.08, 0.09], hair: [0.16, 0.12, 0.10], skin: [0.76, 0.62, 0.54] } },
  { body: 'heavy', head: 'cap', glasses: true, colors: { coat: [0.16, 0.22, 0.24], legs: [0.17, 0.17, 0.18], shoes: [0.09, 0.09, 0.10], hair: [0.12, 0.10, 0.09], skin: [0.70, 0.56, 0.48] } },
  { body: 'slim', head: 'long', colors: { coat: [0.30, 0.18, 0.20], legs: [0.13, 0.14, 0.17], shoes: [0.10, 0.10, 0.11], hair: [0.30, 0.22, 0.16], skin: [0.79, 0.65, 0.57] } },
  { body: 'tall', head: 'bald', glasses: true, colors: { coat: [0.18, 0.19, 0.19], legs: [0.12, 0.12, 0.13], shoes: [0.07, 0.07, 0.08], hair: [0.30, 0.28, 0.26], skin: [0.72, 0.59, 0.52] } },
  { body: 'small', head: 'hood', colors: { coat: [0.14, 0.16, 0.22], legs: [0.12, 0.12, 0.14], shoes: [0.08, 0.08, 0.09], hair: [0.10, 0.09, 0.09], skin: [0.75, 0.61, 0.53] } },
  { body: 'average', head: 'scarf', colors: { coat: [0.22, 0.20, 0.16], legs: [0.15, 0.14, 0.13], shoes: [0.09, 0.08, 0.08], hair: [0.20, 0.16, 0.13], gear: [0.24, 0.30, 0.34], skin: [0.77, 0.63, 0.55] } },
];

/* How many nameless passengers are aboard at each stop. It only goes down. */
export const EXTRA_COUNTS = [5, 4, 2, 1, 0, 0, 0];

export class Passenger {
  constructor(def, meshes, materials) {
    this.def = def;
    this.id = def.id;
    this.meshes = meshes;
    this.materials = materials;

    this.present = true;
    this.car = 1;
    this.seat = 0;
    this.pose = 'sit';
    this.watch = 0;          // 0 never looks up, 1 does not look away
    this.upsideDown = false;
    this.standing = false;
    this.customPos = null;   // overrides the seat, in train space
    this.faceKey = 'face';

    this.yaw = 0;
    this.headYaw = 0;
    this.headPitch = 0;
    this.targetHeadYaw = 0;
    this.targetHeadPitch = 0;
    this.blink = 0;
    this.nextBlink = 1 + Math.random() * 4;
    this.phase = Math.random() * Math.PI * 2;

    this.bodyNode = { mesh: null, matrix: mat4(), overrides: {}, visible: true, reflect: false };
    this.headNode = { mesh: null, matrix: mat4(), overrides: {}, visible: true, reflect: false };
    this.shadowNode = { mesh: meshes.shadow, matrix: mat4(), overrides: {}, visible: true, reflect: false };
    this._applyColors();
  }

  _applyColors() {
    const c = this.def.colors || {};
    const set = (node, key, color) => {
      const base = this.materials[key];
      if (base) node.overrides[key] = { ...base, color };
    };
    for (const key of ['coat', 'legs', 'shoes']) if (c[key]) set(this.bodyNode, key, c[key]);
    for (const key of ['hair', 'gear']) if (c[key]) set(this.headNode, key, c[key]);
    if (c.skin) {
      /* Only one group in the whole figure wears the face — the head's `skin`.
         Hands, neck, jaw, nose and ears are `skinPlain` and have to be tinted
         to match it, or a passenger ends up with a head one colour and a pair
         of hands another. */
      set(this.headNode, 'skin', c.skin);
      set(this.headNode, 'skinPlain', c.skin);
      set(this.bodyNode, 'skinPlain', c.skin);
    }
  }

  setState(state) {
    if (!state) return;
    if (state.present !== undefined) this.present = state.present;
    if (state.car !== undefined) this.car = state.car;
    if (state.seat !== undefined) this.seat = state.seat;
    if (state.pose !== undefined) this.pose = state.pose;
    if (state.watch !== undefined) this.watch = state.watch;
    if (state.upsideDown !== undefined) this.upsideDown = state.upsideDown;
    if (state.standing !== undefined) this.standing = state.standing;
    if (state.customPos !== undefined) this.customPos = state.customPos;
    if (state.face !== undefined) this.faceKey = state.face;
  }

  /* Where this passenger is, in train space. */
  position() {
    if (this.customPos) return this.customPos;
    const slot = seatSlot(this.seat);
    return [slot.x, 0, carCenterZ(this.car) + slot.z];
  }

  baseYaw() {
    if (this.customPos) return this.customYaw ?? 0;
    return seatSlot(this.seat).facing;
  }

  update(dt, time, camera, opts = {}) {
    const sitting = SITTING_POSES.has(this.pose);
    const body = this.meshes.body(this.def.body, this.pose);
    const head = this.meshes.head(this.def.head, this.def.glasses);
    this.bodyNode.mesh = body;
    this.headNode.mesh = head;

    const visible = this.present && (opts.visible !== false);
    this.bodyNode.visible = visible;
    this.headNode.visible = visible;
    this.shadowNode.visible = visible && sitting === false ? true : visible;
    if (!visible) return;

    const pos = this.position();
    this.yaw = this.baseYaw();

    /* Breathing, as a two-centimetre rise. It is under the threshold of
       noticing and over the threshold of caring. */
    const breath = Math.sin(time * (sitting ? 0.9 : 1.15) + this.phase) * 0.008;
    const sway = (opts.sway || 0) * (sitting ? 0.35 : 0.9);

    compose(this.bodyNode.matrix,
      pos[0] + sway * 0.4, pos[1] + breath, pos[2],
      this.yaw, 0, sway * 0.10, 1, 1, 1);

    /* Head. `watch` is how much of the time this passenger spends looking at
       the player rather than at nothing. */
    const anchor = HEAD_ANCHOR[this.pose] || HEAD_ANCHOR.sit;
    const hx = pos[0] + Math.sin(this.yaw) * anchor[2] + sway * 0.5;
    const hy = pos[1] + anchor[1] + breath;
    const hz = pos[2] + Math.cos(this.yaw) * anchor[2];

    if (this.watch > 0 && camera) {
      const dx = camera.position[0] - hx;
      const dy = camera.position[1] - hy;
      const dz = camera.position[2] - hz;
      const dist = Math.hypot(dx, dy, dz);
      const want = Math.atan2(dx, dz);
      const wantPitch = Math.asin(clamp(dy / Math.max(dist, 0.01), -1, 1));
      /* A neck only turns so far. Past that they would have to move, and if
         they moved the player would see it. */
      const limited = clamp(angleDelta(this.yaw, want), -1.25, 1.25);
      const engagement = this.watch * clamp(1 - (dist - 2) / 12, 0.15, 1);
      this.targetHeadYaw = limited * engagement;
      this.targetHeadPitch = clamp(wantPitch, -0.4, 0.45) * engagement;
    } else {
      const idle = Math.sin(time * 0.23 + this.phase) * 0.10;
      this.targetHeadYaw = idle;
      this.targetHeadPitch = (HEAD_BIAS[this.pose] ?? 0);
    }

    const rate = this.watch > 0.6 ? 1.6 : 2.6;
    this.headYaw = damp(this.headYaw, this.targetHeadYaw, rate, dt);
    this.headPitch = damp(this.headPitch, this.targetHeadPitch + (this.watch > 0 ? (HEAD_BIAS[this.pose] ?? 0) * 0.3 : 0), rate, dt);

    compose(this.headNode.matrix, hx, hy, hz,
      this.yaw + this.headYaw, this.headPitch, sway * 0.06, 1, 1, 1);

    /* Blinking, by swapping the face texture for four frames' worth of time.
       The one who is staring does not blink. */
    this.nextBlink -= dt;
    if (this.blink > 0) {
      this.blink -= dt;
    } else if (this.nextBlink <= 0 && this.watch < 0.95) {
      this.blink = 0.12;
      this.nextBlink = 2.5 + Math.random() * 5;
    }
    const face = this.blink > 0 ? 'faceClosed' : (this.watch > 0.75 ? 'faceStare' : this.faceKey);
    const skinBase = this.headNode.overrides.skin || this.materials.skin;
    if (skinBase.map !== face) this.headNode.overrides.skin = { ...skinBase, map: face };

    if (this.upsideDown) {
      this.bodyNode.overrides.prop = { ...this.materials.prop, uvScale: [-1, -1], uvOffset: [1, 1] };
    } else if (this.bodyNode.overrides.prop) {
      delete this.bodyNode.overrides.prop;
    }

    const shadowSize = sitting ? 0.85 : 0.7;
    compose(this.shadowNode.matrix, pos[0], 0.012, pos[2] + (sitting ? 0.16 : 0), 0, 0, 0,
      shadowSize, 1, shadowSize);
  }

  nodes(out) {
    if (!this.present) return out;
    out.push(this.shadowNode, this.bodyNode, this.headNode);
    return out;
  }
}
