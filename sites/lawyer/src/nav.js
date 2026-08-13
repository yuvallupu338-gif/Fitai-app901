import { $, $$ } from './dom.js';

const MOBILE = '(max-width: 759px)';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function header() {
  const head = $('.site-head');
  if (!head) return;

  let queued = false;
  const sync = () => {
    queued = false;
    head.classList.toggle('is-scrolled', window.scrollY > 6);
  };
  addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  }, { passive: true });
  sync();
}

export function drawer() {
  const root = $('#drawer');
  const open = $('[data-drawer-open]');
  if (!root || !open) return;
  const panel = $('.drawer__panel', root);
  const wide = matchMedia('(min-width: 900px)');

  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const items = $$(FOCUSABLE, panel);
    if (!items.length) return;
    const edge = e.shiftKey ? items[0] : items[items.length - 1];
    if (document.activeElement !== edge) return;
    e.preventDefault();
    (e.shiftKey ? items[items.length - 1] : items[0]).focus();
  };

  function show() {
    root.hidden = false;
    open.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('is-locked');
    document.addEventListener('keydown', onKey);
    ($(FOCUSABLE, panel) || panel).focus();
  }

  function close({ refocus = true } = {}) {
    if (root.hidden) return;
    root.hidden = true;
    open.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('is-locked');
    document.removeEventListener('keydown', onKey);
    if (refocus) open.focus();
  }

  open.addEventListener('click', show);
  for (const btn of $$('[data-drawer-close]', root)) btn.addEventListener('click', () => close());
  // A link in the drawer is a jump down the page; leaving the panel open over
  // the destination is the classic version of this bug.
  for (const a of $$('a[href^="#"]', panel)) a.addEventListener('click', () => close({ refocus: false }));
  wide.addEventListener('change', (e) => { if (e.matches) close({ refocus: false }); });
}

/* The bar exists to keep the phone one tap away while the sections that carry
 * it are off screen — so it hides against both of them, not just the hero.
 * Over the closing band it was stacking a second gold WhatsApp button a
 * finger's width under the one already on the page. */
export function callbar() {
  const bar = $('[data-callbar]');
  const zones = [$('.hero'), $('#contact')].filter(Boolean);
  if (!bar || !zones.length || !('IntersectionObserver' in window)) return;

  const showing = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) showing.add(e.target);
      else showing.delete(e.target);
    }
    bar.classList.toggle('is-on', showing.size === 0);
  }, { threshold: 0 });

  for (const z of zones) io.observe(z);
}

/* On a phone the hero's first button is a tap away from a dialled call, and
 * scrolling someone in pain to a form they can see anyway is worse. */
export function heroCta() {
  const cta = $('[data-hero-cta]');
  if (!cta) return;
  const small = matchMedia(MOBILE);
  const sync = () => cta.setAttribute('href', small.matches ? 'tel:036100420' : '#lead');
  small.addEventListener('change', sync);
  sync();
}

/* An in-page link that lands on a form should leave the cursor in the form,
 * not somewhere above it. */
export function focusTargets() {
  for (const link of $$('[data-focus]')) {
    link.addEventListener('click', () => {
      if (!(link.getAttribute('href') || '').startsWith('#')) return;
      const field = document.getElementById(link.dataset.focus);
      if (!field) return;
      setTimeout(() => field.focus({ preventScroll: true }), 460);
    });
  }
}
