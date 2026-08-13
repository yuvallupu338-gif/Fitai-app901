import { $, on } from './dom.js';

const HOLD_MS = 2500;
const REVERT_MS = 12000;
const HOLD_LABEL = 'החזיקו כדי להדליק את האור';
const OFF_LABEL = 'כבו את האור';
const KEYS = new Set([' ', 'Spacebar', 'Enter']);

/* Hold for two and a half seconds and the building is exposed for what it is.
   The ring keeps filling for people who asked for less motion — it is not
   decoration, it is the only thing telling them how much longer to hold. */
export function initLights() {
  const button = $('#lights-hold');
  const panel = $('#lights-panel');
  const label = $('#lights-txt');
  const counter = $('#lights-count');
  if (!button || !panel || !label) return;

  const root = document.documentElement;
  let frame = 0;
  let began = 0;
  let revert = 0;
  let tick = 0;
  let lit = false;

  const setHold = (value) => button.style.setProperty('--hold', String(value));

  function stopHold() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!lit) setHold(0);
  }

  function step(now) {
    const progress = Math.min(1, (now - began) / HOLD_MS);
    setHold(progress.toFixed(3));
    if (progress < 1) { frame = requestAnimationFrame(step); return; }
    frame = 0;
    turnOn();
  }

  function startHold() {
    if (lit || frame) return;
    began = performance.now();
    frame = requestAnimationFrame(step);
  }

  function turnOn() {
    lit = true;
    setHold(1);
    root.dataset.lights = 'on';
    panel.hidden = false;
    label.textContent = OFF_LABEL;

    let left = REVERT_MS / 1000;
    if (counter) counter.textContent = String(left);
    clearInterval(tick);
    tick = setInterval(() => {
      left -= 1;
      if (counter) counter.textContent = String(Math.max(0, left));
      if (left <= 0) clearInterval(tick);
    }, 1000);

    clearTimeout(revert);
    revert = setTimeout(turnOff, REVERT_MS);
  }

  function turnOff() {
    lit = false;
    clearTimeout(revert);
    clearInterval(tick);
    root.removeAttribute('data-lights');
    panel.hidden = true;
    label.textContent = HOLD_LABEL;
    setHold(0);
  }

  on(button, 'pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (lit) { turnOff(); return; }
    startHold();
  });
  on(button, 'pointerup', stopHold);
  on(button, 'pointerleave', stopHold);
  on(button, 'pointercancel', stopHold);

  // preventDefault on keydown is what stops Space scrolling the page and stops
  // the browser synthesising a click on release, which would immediately undo
  // the hold that just succeeded.
  on(button, 'keydown', (e) => {
    if (!KEYS.has(e.key)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (lit) { turnOff(); return; }
    startHold();
  });
  on(button, 'keyup', (e) => { if (KEYS.has(e.key)) stopHold(); });
  on(button, 'blur', stopHold);
  on(button, 'click', (e) => e.preventDefault());
}
