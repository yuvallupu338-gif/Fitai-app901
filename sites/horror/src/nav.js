import { $, $$, on } from './dom.js';

const OPEN_LABEL = 'פתיחת התפריט';
const SHUT_LABEL = 'סגירת התפריט';

export function initDrawer() {
  const trigger = $('#burger');
  const drawer = $('#drawer');
  if (!trigger || !drawer) return;

  const panel = $('.drawer__panel', drawer);
  const wide = matchMedia('(min-width: 900px)');
  let returnTo = null;

  const inPanel = () => $$('a[href], button:not([disabled])', panel);

  function open() {
    if (!drawer.hidden) return;
    returnTo = document.activeElement;
    drawer.hidden = false;
    // One frame in the closed position, or the panel is already where it is
    // going when the transition starts and nothing slides.
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-label', SHUT_LABEL);
    document.documentElement.classList.add('is-locked');
    inPanel()[0]?.focus();
  }

  function close({ restore = true } = {}) {
    if (drawer.hidden) return;
    drawer.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', OPEN_LABEL);
    document.documentElement.classList.remove('is-locked');

    const settle = () => { if (!drawer.classList.contains('is-open')) drawer.hidden = true; };
    on(panel, 'transitionend', settle, { once: true });
    setTimeout(settle, 520);

    if (restore && returnTo instanceof HTMLElement) returnTo.focus();
    returnTo = null;
  }

  on(trigger, 'click', () => (drawer.hidden ? open() : close()));

  for (const el of $$('[data-close]', drawer)) on(el, 'click', () => close());
  for (const link of $$('a[href^="#"]', panel)) on(link, 'click', () => close({ restore: false }));

  on(drawer, 'keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;

    const list = inPanel();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Rotating a phone can widen past the breakpoint that put the drawer there
  // in the first place, which would leave a trapped focus ring on a panel
  // nobody can see.
  on(wide, 'change', (e) => { if (e.matches) close({ restore: false }); });
}
