/*
 * input.js — keyboard, mouse and touch, normalised into one small state object
 * the player controller reads each frame.
 *
 * Mouse look uses pointer lock, which is the only way to get a first-person
 * camera that does not stop at the edge of the window. Touch gets the
 * two-thumb scheme every mobile shooter converged on: the left half of the
 * screen is a stick that appears wherever the thumb lands, the right half is
 * look.
 *
 * The on-screen buttons do not get their own code path — they press the same
 * keys the keyboard does. That is the whole reason the phone build works:
 * everything downstream reads `hit('KeyE')` and neither knows nor cares
 * whether a thumb or a keyboard sent it.
 */

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.locked = false;
    this.sensitivity = 0.0022;
    this.invertY = false;
    this.pressed = new Set();     /* edge-triggered, cleared every frame     */
    this.touch = { move: null, look: null };
    this.enabled = true;
    /* How long the movement keys have been untouched. The whistler's blind
     * spot depends on the player being genuinely still, and "still" has to
     * mean "not steering" as well as "not moving", or you can drift to a stop
     * against a wall and count as frozen while you are still pushing. */
    this.idle = 0;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      const code = e.code;
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => { this.keys.delete(e.code); };
    this._onBlur = () => { this.keys.clear(); };

    this._onMouseMove = (e) => {
      if (!this.locked) return;
      this.lookX += e.movementX * this.sensitivity;
      this.lookY += e.movementY * this.sensitivity * (this.invertY ? -1 : 1);
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.onUnlock) this.onUnlock();
    };
    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.pressed.add('Mouse0');
      if (e.button === 2) this.pressed.add('Mouse2');
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.bindTouch();
  }

  bindTouch() {
    const c = this.canvas;
    const half = () => window.innerWidth / 2;

    c.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const left = t.clientX < half();
        if (left && !this.touch.move) {
          this.touch.move = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
        } else if (!left && !this.touch.look) {
          this.touch.look = { id: t.identifier, px: t.clientX, py: t.clientY };
        }
      }
      e.preventDefault();
    }, { passive: false });

    c.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const m = this.touch.move;
        if (m && m.id === t.identifier) {
          m.x = Math.max(-1, Math.min(1, (t.clientX - m.ox) / 52));
          m.y = Math.max(-1, Math.min(1, (t.clientY - m.oy) / 52));
        }
        const l = this.touch.look;
        if (l && l.id === t.identifier) {
          this.lookX += (t.clientX - l.px) * 0.005;
          this.lookY += (t.clientY - l.py) * 0.005 * (this.invertY ? -1 : 1);
          l.px = t.clientX;
          l.py = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.move && this.touch.move.id === t.identifier) this.touch.move = null;
        if (this.touch.look && this.touch.look.id === t.identifier) this.touch.look = null;
      }
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);
  }

  requestLock() {
    if (this.canvas.requestPointerLock) this.canvas.requestPointerLock();
  }
  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }

  /* ---------------------------------------------------------------- *
   * Virtual keys, pressed by the on-screen buttons
   * ---------------------------------------------------------------- */

  tap(code) {
    if (!this.enabled) return;
    this.pressed.add(code);
  }

  hold(code, on) {
    if (!this.enabled) return;
    if (on) {
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }

  toggle(code) {
    const on = !this.keys.has(code);
    this.hold(code, on);
    return on;
  }

  /* Called once per frame, after the player has read everything. */
  endFrame(dt = 0) {
    const [x, z] = this.axes();
    const steering = Math.abs(this.lookX) > 0.0005 || Math.abs(this.lookY) > 0.0005;
    this.idle = (x === 0 && z === 0 && !steering) ? this.idle + dt : 0;
    this.pressed.clear();
    this.lookX = 0;
    this.lookY = 0;
  }

  /* Movement axes in [-1,1]. Forward is +Z of the intent vector, which the
   * player controller rotates by the yaw. */
  axes() {
    let x = 0, z = 0;
    if (this.down('KeyW', 'ArrowUp')) z += 1;
    if (this.down('KeyS', 'ArrowDown')) z -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    const m = this.touch.move;
    if (m) {
      /* Dead zone, rescaled so the usable range still reaches 1.0. Without it
       * a thumb resting on the glass walks the player slowly across a lawn,
       * which in a game about not being seen is a way to lose without ever
       * knowing you were moving. */
      const dz = 0.16;
      const mag = Math.hypot(m.x, m.y);
      if (mag > dz) {
        const k = ((mag - dz) / (1 - dz)) / mag;
        x += m.x * k;
        z -= m.y * k;
      }
    }
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return [x, z];
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
