/* nav.js — the sticky header, the section marker, and the mobile drawer. */

import { qs, qsa, reduced } from './dom.js';

const STUCK_AT = 80;
const SECTIONS = ['#rooms', '#puzzle', '#how', '#reviews', '#book'];

export function initNav() {
  stickHeader();
  markSection();
  drawer();
}

function stickHeader() {
  const head = qs('[data-head]');
  if (!head) return;
  const sync = () => head.classList.toggle('is-stuck', window.scrollY > STUCK_AT);
  sync();
  addEventListener('scroll', sync, { passive: true });
}

/* Which section the reader is actually in, decided by a band across the middle
   of the viewport rather than by whatever crossed the top edge last. */
function markSection() {
  const links = new Map();
  for (const href of SECTIONS) {
    const link = qs(`.nav__list a[href="${href}"]`);
    const target = qs(href);
    if (link && target) links.set(target, link);
  }
  if (!links.size || !('IntersectionObserver' in window)) return;

  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    for (const link of links.values()) link.removeAttribute('aria-current');
    const first = [...links.keys()].find((el) => visible.has(el));
    if (first) links.get(first).setAttribute('aria-current', 'location');
  }, { rootMargin: '-48% 0px -48% 0px' });

  for (const target of links.keys()) io.observe(target);
}

function drawer() {
  const panel = qs('[data-drawer]');
  const toggle = qs('[data-drawer-toggle]');
  const close = qs('[data-drawer-close]');
  if (!panel || !toggle) return;

  const box = qs('.drawer__panel', panel);
  let opener = null;
  let hideTimer = 0;

  const focusables = () => qsa('a[href], button:not([disabled])', box)
    .filter((el) => el.offsetWidth || el.offsetHeight);

  const open = () => {
    clearTimeout(hideTimer);
    opener = document.activeElement;
    panel.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    toggle.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => panel.classList.add('is-open'));
    close.focus();
  };

  const shut = () => {
    if (panel.hidden) return;
    panel.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = '';
    (opener instanceof HTMLElement ? opener : toggle).focus();
    /* Wait out the slide before pulling it from the accessibility tree; with
       reduced motion there is nothing to wait for. */
    hideTimer = setTimeout(() => { panel.hidden = true; }, reduced() ? 0 : 340);
  };

  toggle.addEventListener('click', () => (panel.hidden ? open() : shut()));
  close.addEventListener('click', shut);
  panel.addEventListener('click', (e) => { if (e.target === panel) shut(); });
  for (const link of qsa('a[href^="#"]', box)) link.addEventListener('click', shut);

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { shut(); return; }
    if (e.key !== 'Tab') return;

    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* A drawer left open behind a desktop layout is a trap with no visible way
     out, because its own close button stops being rendered. */
  matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) shut(); });
}
