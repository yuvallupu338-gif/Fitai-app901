/*
 * input.js — pointer to face.
 *
 * The only hard part of this game's input is that a drag has to mean two
 * different things: on the customer it is a brush stroke, anywhere else it is
 * the camera. Deciding by what was under the pointer when it went down — rather
 * than by a mode the player has to toggle — is what makes it possible to lean
 * in, tilt the head, and keep painting without touching a button.
 *
 * On a phone the same rule holds, with a second finger always meaning the
 * camera: one finger paints, two orbit and pinch.
 */

import { rayFromScreen, rayToObject, rayMesh, invert, mat4, clamp } from '../core/math.js';

export class Input {
  constructor(canvas, renderer, handlers) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.on = handlers;
    this.painting = false;
    this.orbiting = false;
    this.last = null;
    this.lastHit = null;
    this.pointers = new Map();
    this.pinchDist = 0;
    this._ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
    this._objRay = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
    this._hit = { u: 0, v: 0, t: 0, x: 0, y: 0, z: 0 };
    this._inv = mat4();
    this.enabled = true;

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', (e) => this._up(e));
    canvas.addEventListener('pointerleave', (e) => this._up(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.on.zoom(Math.sign(e.deltaY) * 0.06);
    }, { passive: false });
  }

  /*
   * Where a screen position lands on the customer, in face space.
   *
   * The head and the two lids are tested separately and the nearest wins. The
   * lids matter: they are in front of the eye and carry the same texture
   * coordinates as the skin behind them, so a stroke of eyeshadow on a closed
   * eye lands in exactly the place it would have landed on an open one.
   */
  pick(clientX, clientY) {
    const r = this.renderer;
    const c = r.customer;
    if (!c || !c.headMatrix) return null;

    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    rayFromScreen(this._ray, r.invViewProj, ndcX, ndcY);

    let best = null;
    const targets = [
      [c.head, c.headMatrix],
      [c.lidL, c.lidMatrixL],
      [c.lidR, c.lidMatrixR],
    ];
    for (const [mesh, matrix] of targets) {
      if (!mesh || !matrix) continue;
      invert(this._inv, matrix);
      rayToObject(this._objRay, this._ray, this._inv);
      if (!rayMesh(this._objRay, mesh, this._hit)) continue;
      /* `s` and `t` are face-space texture coordinates; `dist` is how far along
       * the ray the hit was, and is only used to pick the nearest surface.
       * `world` is where the customer's eyes should look — she follows the
       * brush, and a gaze that tracks the thing coming at your face is most of
       * why the head reads as alive. */
      if (!best || this._hit.t < best.dist) {
        const h = this._hit;
        best = {
          s: h.u,
          t: h.v,
          dist: h.t,
          world: [
            matrix[0] * h.x + matrix[4] * h.y + matrix[8] * h.z + matrix[12],
            matrix[1] * h.x + matrix[5] * h.y + matrix[9] * h.z + matrix[13],
            matrix[2] * h.x + matrix[6] * h.y + matrix[10] * h.z + matrix[14],
          ],
        };
      }
    }
    return best;
  }

  _down(e) {
    if (!this.enabled) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2) {
      /* A second finger cancels a stroke rather than continuing it — the first
       * finger has almost certainly moved by the time the second lands, and
       * leaving the brush down paints a streak across the face. */
      if (this.painting) { this.painting = false; this.on.paintEnd(); }
      this.orbiting = true;
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }

    const rightButton = e.button === 2 || e.button === 1;
    const hit = rightButton ? null : this.pick(e.clientX, e.clientY);
    this.last = { x: e.clientX, y: e.clientY, time: performance.now() };

    if (hit && !rightButton) {
      this.painting = true;
      this.lastHit = hit;
      this.on.paintStart(hit);
    } else {
      this.orbiting = true;
    }
  }

  _move(e) {
    if (!this.enabled) return;
    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (this.orbiting && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0) this.on.zoom((this.pinchDist - d) * 0.004);
      this.pinchDist = d;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.last) this.on.orbit(mid.x - this.last.x, mid.y - this.last.y);
      this.last = { x: mid.x, y: mid.y, time: performance.now() };
      return;
    }

    if (this.painting) {
      const hit = this.pick(e.clientX, e.clientY);
      const now = performance.now();
      const dt = Math.max(1, now - (this.last ? this.last.time : now));
      if (hit) {
        /* Speed feeds the brush: a slow stroke lays down more product and
         * sounds different. Measured in face-space units per second, which is
         * resolution independent. */
        const dist = this.lastHit
          ? Math.hypot(hit.s - this.lastHit.s, hit.t - this.lastHit.t) : 0;
        const speed = dist / (dt / 1000);
        this.on.paintMove(hit, this.lastHit, clamp(speed, 0, 4));
        this.lastHit = hit;
      } else {
        /* Ran off the face mid-stroke. Do not paint, but keep the stroke open
         * so coming back onto the cheek continues it. */
        this.lastHit = null;
      }
      this.last = { x: e.clientX, y: e.clientY, time: now };
      return;
    }

    if (this.orbiting && this.last) {
      this.on.orbit(e.clientX - this.last.x, e.clientY - this.last.y);
      this.last = { x: e.clientX, y: e.clientY, time: performance.now() };
      return;
    }

    if (this.on.hover) this.on.hover(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
  }

  _up(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) {
      if (this.painting) { this.painting = false; this.on.paintEnd(); }
      this.orbiting = false;
      this.last = null;
      this.lastHit = null;
      this.pinchDist = 0;
    }
  }
}
