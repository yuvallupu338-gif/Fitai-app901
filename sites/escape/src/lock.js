/* lock.js — the four-dial brass lock.
 *
 * The code is 4-2-7-9 and every digit of it is printed somewhere else on this
 * page. There is no submit button: a real lock opens the moment the last wheel
 * lands, and checking on every change is what makes the last dial feel like it
 * is doing something.
 *
 * The reel carries three copies of 0–9 and lives in the middle one, so 9 → 0
 * rolls forward over the seam instead of spinning backwards through eight
 * digits. After the wheel settles it is re-seated in the middle band with the
 * transition off, which is invisible and keeps the index from running away.
 */

import { qs, qsa, reduced } from './dom.js';

const CODE = [4, 2, 7, 9];
const COUPON = 'ENIGMA10';
const KEY = 'enigma.solved';
const BAND = 10;
const SETTLE = 900;
const RESEAT = 460;

const saved = {
  read() {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  },
  write() {
    /* Private windows throw on write. Losing the prize on reload is a smaller
       failure than a page that stops working. */
    try { localStorage.setItem(KEY, '1'); } catch { /* no store, no memory */ }
  },
};

export function initLock() {
  const lock = qs('[data-lock]');
  if (!lock) return;

  const msg = qs('[data-lock-msg]');
  const hint = qs('[data-lock-hint]');
  const coupon = qs('[data-coupon]');
  const badge = qs('[data-lock-badge]');
  const field = qs('[data-coupon-field]');

  let solved = false;
  let wrongs = 0;
  let settleTimer = 0;

  const dials = qsa('.dial__win', lock).map((win) => makeDial(win, () => check()));

  for (const btn of qsa('.dial__step', lock)) {
    btn.addEventListener('click', () => {
      dials[Number(btn.dataset.dialFor)]?.step(Number(btn.dataset.dialStep));
    });
  }

  const say = (text, tone) => {
    msg.textContent = text;
    msg.classList.toggle('is-warn', tone === 'warn');
    msg.classList.toggle('is-win', tone === 'win');
  };

  const opened = (announce) => {
    solved = true;
    clearTimeout(settleTimer);
    lock.classList.add('is-open');
    badge.hidden = false;
    coupon.hidden = false;
    hint.hidden = true;
    for (const dial of dials) dial.freeze();
    if (field && !field.value) field.value = COUPON;
    if (announce) {
      say(`הקוד נכון, המנעול נפתח. הקופון ${COUPON} שווה עשרה אחוז הנחה, והוא כבר ממתין בטופס ההזמנה.`, 'win');
      saved.write();
    } else {
      say('', null);
    }
  };

  const check = () => {
    if (solved) return;
    if (dials.every((dial, i) => dial.value() === CODE[i])) { opened(true); return; }

    clearTimeout(settleTimer);
    if (!dials.every((dial) => dial.touched())) { say('', null); return; }

    /* Nothing is said mid-spin. A wrong attempt is someone stopping on four
       digits and looking at them — that is when a nudge is useful, and it is
       also the only fair way to count attempts. */
    settleTimer = setTimeout(() => {
      wrongs += 1;
      say('לא הצירוף הזה. כל ארבע התשובות כתובות בעמוד למעלה.', 'warn');
      if (wrongs >= 2) hint.hidden = false;
    }, SETTLE);
  };

  hint.addEventListener('click', () => {
    const rooms = qsa('.room');
    for (const room of rooms) room.classList.add('is-marked');
    setTimeout(() => { for (const room of rooms) room.classList.remove('is-marked'); }, 3400);
  });

  if (saved.read()) {
    dials.forEach((dial, i) => dial.set(CODE[i], true));
    opened(false);
  }
}

function makeDial(win, onChange) {
  const reel = qs('[data-reel]', win);
  const digits = [...reel.children];
  /* Two more bands, cloned from the markup rather than written into it: the
     page has to read as a lock showing 0 with no JS at all. */
  reel.append(...digits.map((d) => d.cloneNode(true)));
  reel.append(...digits.map((d) => d.cloneNode(true)));

  let index = BAND;
  let moved = false;
  let frozen = false;
  let reseat = 0;

  const place = (next, instant) => {
    index = next;
    if (instant) reel.classList.add('is-instant');
    reel.style.setProperty('--i', String(index));
    if (instant) {
      void reel.offsetHeight;
      reel.classList.remove('is-instant');
    }
    win.setAttribute('aria-valuenow', String(value()));
  };

  const value = () => ((Math.round(index) % BAND) + BAND) % BAND;

  const settle = () => {
    clearTimeout(reseat);
    reseat = setTimeout(() => {
      if (index >= BAND && index < BAND * 2) return;
      place(BAND + value(), true);
    }, reduced() ? 0 : RESEAT);
  };

  const commit = (next) => {
    if (frozen) return;
    place(next, false);
    moved = true;
    settle();
    onChange();
  };

  /* Direct entry picks the nearest of the three bands, so typing 8 while the
     wheel sits on 9 turns it one notch and not nine. */
  const nearest = (digit) => {
    const options = [digit, digit + BAND, digit + BAND * 2];
    return options.reduce((best, o) => (Math.abs(o - index) < Math.abs(best - index) ? o : best), options[0]);
  };

  let dragging = false;
  let startY = 0;
  let startIndex = 0;
  let cell = 0;

  win.addEventListener('pointerdown', (e) => {
    if (frozen) return;
    dragging = true;
    startY = e.clientY;
    startIndex = index;
    cell = win.getBoundingClientRect().height || 1;
    win.setPointerCapture(e.pointerId);
    win.classList.add('is-dragging');
    reel.classList.add('is-instant');
  });

  win.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    reel.style.setProperty('--i', String(startIndex - (e.clientY - startY) / cell));
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    if (win.hasPointerCapture(e.pointerId)) win.releasePointerCapture(e.pointerId);
    win.classList.remove('is-dragging');
    reel.classList.remove('is-instant');
    commit(Math.round(startIndex - (e.clientY - startY) / cell));
  };
  win.addEventListener('pointerup', endDrag);
  win.addEventListener('pointercancel', endDrag);

  win.addEventListener('keydown', (e) => {
    if (frozen) return;
    let next = null;
    if (e.key === 'ArrowUp' || e.key === 'PageUp') next = index + 1;
    else if (e.key === 'ArrowDown' || e.key === 'PageDown') next = index - 1;
    else if (e.key === 'Home') next = BAND;
    else if (e.key === 'End') next = BAND + 9;
    else if (/^[0-9]$/.test(e.key)) next = nearest(Number(e.key));
    if (next === null) return;
    e.preventDefault();
    commit(next);
  });

  place(index, true);

  return {
    value,
    touched: () => moved,
    step: (by) => commit(index + by),
    set: (digit, silent) => {
      place(BAND + digit, true);
      moved = true;
      if (!silent) onChange();
    },
    freeze: () => {
      frozen = true;
      win.setAttribute('aria-disabled', 'true');
      for (const btn of qsa('.dial__step', win.closest('.dial'))) btn.disabled = true;
    },
  };
}
