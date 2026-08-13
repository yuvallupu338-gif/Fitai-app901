/* rooms.js — the one moving part in each still, and the pre-filled booking. */

import { qs, qsa, reduced } from './dom.js';

export function initRooms() {
  lightStills();
  prefillFromCards();
}

/* Each still holds a single light: a beam, a lamp passing the shelves, the
   handwheel, a reflection crossing the glass. It runs once while someone is
   looking at that card, and never when the reader has asked for less motion. */
function lightStills() {
  for (const card of qsa('.room')) {
    const still = qs('.still', card);
    if (!still) continue;

    const lit = () => { if (!reduced()) still.classList.add('is-lit'); };
    const dark = () => still.classList.remove('is-lit');

    card.addEventListener('pointerenter', lit);
    card.addEventListener('pointerleave', dark);
    card.addEventListener('focusin', lit);
    card.addEventListener('focusout', (e) => {
      if (!card.contains(e.relatedTarget)) dark();
    });
  }
}

function prefillFromCards() {
  const select = qs('[data-room-select]');
  if (!select) return;

  for (const link of qsa('a[data-room]')) {
    link.addEventListener('click', () => {
      select.value = link.dataset.room;
      select.closest('.field')?.classList.remove('is-bad');
      select.removeAttribute('aria-invalid');
      select.classList.remove('is-flash');
      /* Restarting the highlight needs the class to have actually left the
         element for a frame, or the animation just carries on unchanged. */
      requestAnimationFrame(() => select.classList.add('is-flash'));
      /* The anchor does the scrolling; focus lands on the field that changed,
         so a keyboard reader arrives at the thing they just chose. */
      setTimeout(() => select.focus({ preventScroll: true }), 90);
    });
  }
}
