/*
 * input.js — one six-button controller, whatever it is physically plugged into.
 *
 * The game only ever asks about six things: left, right, up, down, A (jump)
 * and B (run/fire), plus start. Keyboard, gamepad and the on-screen touch pad
 * all write into the same button table, so nothing downstream knows or cares
 * which one moved.
 *
 * `pressed()` is the edge and `held()` is the level. Jumping needs both — the
 * jump *starts* on the edge (so holding A through a landing does not bounce you
 * straight back up, exactly like the original) and its height is decided by the
 * level over the following frames. Edges are cleared once per simulation step,
 * not once per rendered frame, so a key tapped and released inside a single
 * slow frame is still seen.
 */

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyX: 'a', Space: 'a', KeyK: 'a', KeyC: 'a',
  KeyZ: 'b', ShiftLeft: 'b', ShiftRight: 'b', KeyJ: 'b',
  Enter: 'start', Escape: 'start', KeyP: 'start',
  KeyM: 'mute',
  KeyF: 'fullscreen',
};

const BUTTONS = ['left', 'right', 'up', 'down', 'a', 'b', 'start', 'mute', 'fullscreen'];

/*
 * Standard-gamepad layout. The face buttons are doubled up on purpose: on a
 * pad held the way this game wants, the bottom face button is jump and the
 * left one is run, but which physical button reports as index 0 varies enough
 * between pads and browsers that binding jump to two of them and run to two
 * of them is the difference between "it works" and "the buttons are swapped".
 *
 * 8 and 9 are select and start; both start the game, because half the pads in
 * the world label them the other way round.
 */
const PAD_BUTTONS = {
  0: 'a', 3: 'a',            // bottom + top face: jump
  1: 'b', 2: 'b',            // right + left face: run and fire
  4: 'b', 6: 'b',            // shoulders and triggers also run
  5: 'a', 7: 'a',
  8: 'start', 9: 'start',
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
};
/* Wide enough that a worn stick resting off-centre does not walk the player
   into a pit while nobody is touching it. */
const DEADZONE = 0.35;

export function createInput() {
  const down = Object.create(null);
  const edge = Object.create(null);
  const consumed = Object.create(null);
  let padIndex = null;

  for (const b of BUTTONS) { down[b] = false; edge[b] = false; }

  function set(button, isDown) {
    if (!button || down[button] === isDown) return;
    down[button] = isDown;
    if (isDown) edge[button] = true;
  }

  function onKey(e) {
    const button = KEYMAP[e.code];
    if (!button) return;
    /* The arrows and space scroll the page, and Enter re-triggers a focused
       button. Nothing the game binds should reach the document. */
    e.preventDefault();
    if (e.repeat) return;   // auto-repeat must not re-fire a jump edge
    trackedSet(button, e.type === 'keydown');
  }

  window.addEventListener('keydown', onKey, { passive: false });
  window.addEventListener('keyup', onKey, { passive: false });
  /* Losing focus mid-run used to leave a direction stuck down and walk the
     player into a pit while the tab was not even visible. */
  window.addEventListener('blur', () => {
    for (const b of BUTTONS) { down[b] = false; keyHeld[b] = false; }
  });
  let padName = '';
  window.addEventListener('gamepadconnected', (e) => {
    padIndex = e.gamepad.index;
    padName = e.gamepad.id || 'gamepad';
  });
  window.addEventListener('gamepaddisconnected', () => { padIndex = null; padName = ''; });

  function pollGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const pad = padIndex !== null ? pads[padIndex] : Array.prototype.find.call(pads, Boolean);
    if (!pad) return;
    padIndex = pad.index;
    if (!padName) padName = pad.id || 'gamepad';
    const want = Object.create(null);
    for (const i in PAD_BUTTONS) {
      if (pad.buttons[i] && pad.buttons[i].pressed) want[PAD_BUTTONS[i]] = true;
    }
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    if (ax < -DEADZONE) want.left = true;
    if (ax > DEADZONE) want.right = true;
    if (ay < -DEADZONE) want.up = true;
    if (ay > DEADZONE) want.down = true;
    for (const b of BUTTONS) {
      if (b === 'mute' || b === 'fullscreen') continue;
      /* Only let the pad *add* presses; a key already held must not be
         cancelled by a pad reporting its buttons at rest. */
      if (want[b]) set(b, true);
      else if (!keyHeld[b]) set(b, false);
    }
  }

  /* Keyboard and touch state is tracked separately from the merged table so
     the gamepad poll above can tell "nothing is pressed on the pad" apart
     from "nothing is pressed anywhere". */
  const keyHeld = Object.create(null);
  const rawSet = set;
  const trackedSet = (button, isDown) => {
    if (!button) return;
    keyHeld[button] = isDown;
    rawSet(button, isDown);
  };

  return {
    held: (b) => !!down[b],
    /* True once per press. Consumed on read so two screens cannot both act
       on the same tap on start. */
    pressed(b) {
      if (edge[b] && !consumed[b]) { consumed[b] = true; return true; }
      return false;
    },
    anyPressed() {
      return !!(edge.a || edge.b || edge.start || edge.up || edge.down || edge.left || edge.right);
    },
    /* Called at the end of every simulation step. */
    flush() {
      pollGamepad();
      for (const b of BUTTONS) { edge[b] = false; consumed[b] = false; }
    },
    /* The touch pad and any test harness drive the same door as the keys. */
    set: trackedSet,
    press(b) { trackedSet(b, true); },
    release(b) { trackedSet(b, false); },
    get gamepad() { return padIndex !== null; },
    get gamepadName() { return padName; },
  };
}

/* Wires the on-screen d-pad. Kept here rather than in main so that the rule
   "a touch that slides off a button releases it" lives next to the state it
   corrects — a stuck right button on a phone is a lost life. */
export function bindTouchPad(root, input) {
  if (!root) return false;
  const hasTouch = typeof window !== 'undefined'
    && ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);
  if (!hasTouch) return false;
  document.body.classList.add('touch');

  const buttons = Array.from(root.querySelectorAll('[data-key]'));
  for (const el of buttons) {
    const key = el.dataset.key;
    const press = (e) => { e.preventDefault(); el.classList.add('on'); input.press(key); };
    const release = (e) => { e.preventDefault(); el.classList.remove('on'); input.release(key); };
    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('touchend', release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
    el.addEventListener('mousedown', press);
    el.addEventListener('mouseup', release);
    el.addEventListener('mouseleave', release);
  }
  return true;
}
