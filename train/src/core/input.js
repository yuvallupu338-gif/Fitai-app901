/*
 * input.js — keyboard, mouse look and pointer lock.
 *
 * Mouse movement is accumulated into a delta that the player controller drains
 * once per frame, rather than being applied inside the event handler. A fast
 * mouse fires many `mousemove` events between two frames and applying each one
 * immediately makes the camera integrate motion the renderer never sees; the
 * accumulator makes look speed independent of event rate.
 */

export const ACTIONS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  interact: ['KeyE', 'Enter'],
  slow: ['ShiftLeft', 'ShiftRight'],
  journal: ['KeyJ', 'Tab'],
  pause: ['Escape'],
  back2: ['KeyQ'],
};

export class Input {
  constructor(target) {
    this.target = target;
    this.keys = new Set();
    this.pressedThisFrame = new Set();
    this.releasedThisFrame = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.locked = false;
    this.enabled = true;
    this.onLockChange = null;
    this.onEscape = null;

    this._onKeyDown = (e) => {
      /* Escape is checked before anything else. It is the only way out of the
         pause menu by keyboard, and the settings page is made entirely of the
         focusable controls the text-entry guard below is written to protect —
         so guarding first meant that touching any slider disabled Escape. */
      if (e.code === 'Escape') {
        if (this.onEscape) this.onEscape();
        return;
      }
      /* Otherwise let the browser have the keystroke while a control has
         focus; stealing Space or the arrow keys from a slider is maddening. */
      if (isTextEntry(e.target)) return;
      if (e.repeat) return;
      if (!this.enabled) return;
      if (SWALLOW.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedThisFrame.add(e.code);
      this.keys.add(e.code);
    };

    this._onKeyUp = (e) => {
      if (isTextEntry(e.target)) return;
      this.keys.delete(e.code);
      this.releasedThisFrame.add(e.code);
    };

    this._onMouseMove = (e) => {
      if (!this.locked || !this.enabled) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };

    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
    };
    this._onMouseUp = (e) => { if (e.button === 0) this.mouseDown = false; };

    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) this.keys.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    };

    this._onBlur = () => { this.keys.clear(); this.mouseDown = false; };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }

  requestLock() {
    if (this.locked) return;
    const p = this.target.requestPointerLock?.();
    /* Chrome returns a promise that rejects if the lock was requested too soon
       after a previous exit. Swallowing it keeps the console clean; the player
       simply clicks again. */
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  releaseLock() {
    if (document.pointerLockElement === this.target) document.exitPointerLock?.();
  }

  down(action) {
    const codes = ACTIONS[action] || [action];
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  pressed(action) {
    const codes = ACTIONS[action] || [action];
    for (const c of codes) if (this.pressedThisFrame.has(c)) return true;
    return false;
  }

  /* Drains the accumulated look delta. Returns radians already scaled by
     sensitivity so callers never touch the raw pixel numbers. */
  takeLook(sensitivity, invertX, invertY) {
    const dx = this.mouseDX * sensitivity * (invertX ? -1 : 1);
    const dy = this.mouseDY * sensitivity * (invertY ? -1 : 1);
    this.mouseDX = 0;
    this.mouseDY = 0;
    return [dx, dy];
  }

  takeClick() {
    const c = this.mouseClicked;
    this.mouseClicked = false;
    return c;
  }

  endFrame() {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
  }
}

const SWALLOW = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function isTextEntry(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
