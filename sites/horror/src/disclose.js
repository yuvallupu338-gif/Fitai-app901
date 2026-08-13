import { $, $$, on } from './dom.js';

function setOpen(item, button, open) {
  item.classList.toggle('is-open', open);
  button.setAttribute('aria-expanded', String(open));
}

/* Everything on this page ships expanded so it reads with scripting off. The
   priming class holds the transition still for one frame while that default
   is reversed, otherwise the page opens with eight panels folding shut. */
function prime(container) {
  container.classList.add('is-priming');
  requestAnimationFrame(() => requestAnimationFrame(() => container.classList.remove('is-priming')));
}

function bindRooms() {
  const rooms = $('.rooms');
  if (!rooms) return;
  prime(rooms);

  for (const button of $$('.disc', rooms)) {
    const item = button.closest('.room');
    if (!item) continue;
    setOpen(item, button, false);
    on(button, 'click', () => setOpen(item, button, button.getAttribute('aria-expanded') !== 'true'));
  }
}

function bindFaq() {
  const acc = $('#acc');
  if (!acc) return;
  prime(acc);

  const items = $$('.acc__i', acc);
  items.forEach((item, i) => {
    const button = $('.acc__b', item);
    if (!button) return;
    setOpen(item, button, i === 0);

    on(button, 'click', () => {
      const next = button.getAttribute('aria-expanded') !== 'true';
      for (const other of items) {
        if (other === item) continue;
        const otherButton = $('.acc__b', other);
        if (otherButton) setOpen(other, otherButton, false);
      }
      setOpen(item, button, next);
    });
  });
}

/* The bars lift on hover and on focus in CSS. The click is for touch, where
   neither of those ever happens. */
function bindRedactions() {
  for (const bar of $$('.rd')) on(bar, 'click', () => bar.classList.toggle('is-open'));
}

export function initDisclosures() {
  bindRooms();
  bindFaq();
  bindRedactions();
}
