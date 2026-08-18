/*
 * input.js — keyboard, mouse and touch, normalised into one small state
 * object the player controller reads each frame.
 *
 * Mouse look uses pointer lock, which is the only way to get a first-person
 * camera that does not stop at the edge of the window. Touch gets a two-thumb
 * scheme: the left half of the screen is a virtual stick that appears wherever
 * you put your thumb down, the right half is look. That is the layout every
 * mobile shooter converged on, and fighting it helps nobody.
 */

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.moveX = 0;
    this.moveZ = 0;
    this.locked = false;
    this.sensitivity = 0.0022;
    this.invertY = false;
    this.pressed = new Set();     /* edge-triggered, cleared every frame */
    this.touch = { move: null, look: null };
    this.enabled = true;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      const code = e.code;
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
      /* Space and the arrows scroll the page; nothing here wants that. */
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => { this.keys.delete(e.code); };
    this._onBlur = () => { this.keys.clear(); };

    this._onMouseMove = (e) => {
      if (!this.locked) return;
      /*
       * Clamped, because `movementX` is not always a mouse movement. Browsers
       * deliver one enormous value on the first event after pointer lock is
       * acquired — the jump from wherever the cursor was to the centre of the
       * canvas — and this game re-acquires the lock on every level load and
       * every click back into the window. Unclamped, a single one of those
       * spun the view by whatever fraction of the screen the pointer had been
       * away from centre, which reads as being thrown across the room.
       *
       * 180px is far more than a hand moves between two mouse events at any
       * polling rate, so nothing an actual mouse does is affected.
       */
      const MAX_STEP = 180;
      const dx = Math.max(-MAX_STEP, Math.min(MAX_STEP, e.movementX || 0));
      const dy = Math.max(-MAX_STEP, Math.min(MAX_STEP, e.movementY || 0));
      this.lookX += dx * this.sensitivity;
      this.lookY += dy * this.sensitivity * (this.invertY ? -1 : 1);
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
    /*
     * No single touch event may turn the view more than this. A drag is
     * reported as a stream of small deltas, so a real thumb never comes
     * anywhere near it; only a delta measured against a stale anchor does.
     * 90px is about 0.45rad — a firm flick, and nothing worse.
     */
    const MAX_STEP = 90;

    c.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const left = t.clientX < half();
        /*
         * Re-anchor first. Identifiers get reused, and a touch whose `touchend`
         * never arrived leaves its slot occupied with the position the finger
         * was last at. Without this the next touchmove for that id measures
         * from wherever the old finger was to wherever the new one is and
         * applies the difference in a single frame.
         */
        if (this.touch.move && this.touch.move.id === t.identifier) {
          this.touch.move = null;
        }
        if (this.touch.look && this.touch.look.id === t.identifier) {
          this.touch.look = null;
        }
        if (left && !this.touch.move) {
          this.touch.move = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
        } else if (!left && !this.touch.look) {
          this.touch.look = { id: t.identifier, px: t.clientX, py: t.clientY };
        }
      }
      e.preventDefault();
    }, { passive: false });

    c.addEventListener('touchmove', (e) => {
      /* The guard `touchstart` has always had, which this handler did not.
       * Nothing currently clears `enabled`, so today this changes no
       * behaviour — it is here so that the first thing which does cannot
       * reintroduce the stale-anchor bug above through this door. */
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const m = this.touch.move;
        if (m && m.id === t.identifier) {
          m.x = Math.max(-1, Math.min(1, (t.clientX - m.ox) / 52));
          m.y = Math.max(-1, Math.min(1, (t.clientY - m.oy) / 52));
        }
        const l = this.touch.look;
        if (l && l.id === t.identifier) {
          const dx = Math.max(-MAX_STEP, Math.min(MAX_STEP, t.clientX - l.px));
          const dy = Math.max(-MAX_STEP, Math.min(MAX_STEP, t.clientY - l.py));
          this.lookX += dx * 0.005;
          this.lookY += dy * 0.005;
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
   * Virtual keys
   *
   * The on-screen buttons do not get their own code path — they press the
   * same keys the keyboard does. That is the whole reason the phone build
   * works: everything downstream (player.js, main.js) reads `hit('KeyE')`
   * and neither knows nor cares whether a thumb or a keyboard sent it.
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
  endFrame() {
    this.pressed.clear();
    this.lookX = 0;
    this.lookY = 0;
  }

  /* Movement axes in the range [-1,1]: forward is +Z of the intent vector,
   * which the player controller rotates by the yaw. */
  axes() {
    let x = 0, z = 0;
    if (this.down('KeyW', 'ArrowUp')) z += 1;
    if (this.down('KeyS', 'ArrowDown')) z -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    const m = this.touch.move;
    if (m) {
      /* Dead zone, rescaled so the usable range still reaches 1.0. Without it
       * a thumb resting on the glass drifts the player slowly across the room,
       * which on a level built out of identical rooms is genuinely disorienting. */
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
