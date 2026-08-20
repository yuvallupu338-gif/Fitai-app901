/*
 * input.js — keyboard, mouse and thumbs.
 *
 * Pointer lock for the mouse, a stick and buttons for a phone, and one shared
 * key table so that every action has exactly one implementation regardless of
 * which of the three it arrived from. The on-screen controls dispatch the same
 * key codes the keyboard does; nothing downstream knows the difference.
 *
 * The awkward part of a first-person game on a touch screen is that the left
 * thumb has to steer and the right thumb has to look, and neither of them can
 * be given a fixed position on screen without being wrong for somebody's
 * hands. So the stick appears wherever the left thumb lands.
 */

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = Object.create(null);
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.sensitivity = 1;
    this.invertY = false;

    /* Touch: one finger steering, one looking, tracked by identifier because
     * they arrive and leave independently. */
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { active: false, id: null, x: 0, y: 0 };
    this.taps = [];

    this._bind();
  }

  _bind() {
    const c = this.canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      /* Space scrolls a page and Tab leaves it; neither is wanted mid-night. */
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
    });
    c.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });

    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const left = e.clientX < window.innerWidth * 0.45;
      if (left && !this.stick.active) {
        this.stick = { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      } else if (!this.look.active) {
        this.look = { active: true, id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') return;
      if (this.stick.active && e.pointerId === this.stick.id) {
        const dx = e.clientX - this.stick.ox;
        const dy = e.clientY - this.stick.oy;
        const len = Math.hypot(dx, dy) || 1;
        const max = 56;
        const k = Math.min(1, len / max) / len;
        this.stick.x = dx * k;
        this.stick.y = dy * k;
      } else if (this.look.active && e.pointerId === this.look.id) {
        this.mouseDX += (e.clientX - this.look.x) * 1.4;
        this.mouseDY += (e.clientY - this.look.y) * 1.4;
        this.look.moved += Math.abs(e.clientX - this.look.x) + Math.abs(e.clientY - this.look.y);
        this.look.x = e.clientX;
        this.look.y = e.clientY;
      }
    });
    const end = (e) => {
      if (this.stick.active && e.pointerId === this.stick.id) {
        this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
      }
      if (this.look.active && e.pointerId === this.look.id) {
        /* A tap that never moved is an interact, not a look. */
        if (this.look.moved < 12) this.taps.push('interact');
        this.look = { active: false, id: null, x: 0, y: 0 };
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  requestLock() {
    if (this.canvas.requestPointerLock) this.canvas.requestPointerLock();
  }

  /* Called once per frame; returns the look delta in radians and clears it. */
  takeLook() {
    const s = 0.0022 * this.sensitivity;
    const dx = this.mouseDX * s;
    const dy = this.mouseDY * s * (this.invertY ? -1 : 1);
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  /* -1..1 on each axis, from whichever of the three inputs is being used. */
  move() {
    let x = 0, z = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) z -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) z += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) x -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) x += 1;
    if (this.stick.active) {
      x += this.stick.x / 56;
      z += this.stick.y / 56;
    }
    const len = Math.hypot(x, z);
    return len > 1 ? { x: x / len, z: z / len } : { x, z };
  }

  get running() { return !!(this.keys.ShiftLeft || this.keys.ShiftRight); }

  /* One-shot presses, drained by the caller so a held key fires once. */
  takeTaps() {
    const out = this.taps;
    this.taps = [];
    return out;
  }

  press(code) { this.taps.push(code); }
}
