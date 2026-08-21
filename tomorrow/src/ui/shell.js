/*
 * shell.js — the frame every screen is mounted into.
 *
 * Five destinations, one mount point, and a navigation bar that is a bottom bar
 * on a phone and a sidebar on a desktop. The shell knows nothing about what a
 * view contains; a view knows nothing about the shell beyond the context object
 * it is handed. That line is what keeps a change to the home screen from
 * breaking the schedule, and it is worth defending — the last thing this app
 * needs is a view reaching across to repaint another one.
 *
 * Rendering is scoped on purpose. A forecast changing repaints the cards that
 * read it, not the chrome around them: rebuilding the whole tree on every store
 * write loses scroll position, closes open sheets, and makes a fast app feel
 * like a page reload.
 */

import {
  h, clear, qs, announce, reduceMotion, openLayer, closeLayer, isTopLayer,
} from '../core/dom.js';

export const DESTINATIONS = [
  { key: 'tomorrow', label: 'מחר', glyph: 'M12 3v2M12 19v2M3 12h2M19 12h2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { key: 'schedule', label: 'לוח', glyph: 'M4 6h16M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 2v4M16 2v4M8 12h8M8 16h5' },
  { key: 'chat', label: 'AI', glyph: 'M20 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3zM9 10h6M9 13h4' },
  { key: 'insights', label: 'תובנות', glyph: 'M4 19h16M7 16V9M12 16V5M17 16v-6' },
  { key: 'profile', label: 'פרופיל', glyph: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0' },
];

let mount = null;
let navBar = null;
let toastHost = null;
let current = null;
let views = {};

function icon(path) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.7');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', path);
  s.appendChild(p);
  return s;
}

/**
 * Build the frame once. Everything after this is a swap of the mount point.
 *
 * `onNavigate` is passed in rather than imported so the shell has no opinion
 * about where state lives — app.js owns that, and this file stays a layout.
 */
export function build(host, registry, onNavigate) {
  views = registry;

  const nav = h('nav.shell-nav', { 'aria-label': 'ניווט ראשי' },
    DESTINATIONS.map((d) => h('button.nav-btn', {
      type: 'button',
      'data-t': `nav-${d.key}`,
      'data-key': d.key,
      'aria-label': d.label,
      onclick: () => onNavigate(d.key),
    }, icon(d.glyph), h('span', { text: d.label }))));

  mount = h('main.shell-main', { id: 'view-host', tabindex: '-1' });
  toastHost = h('div.toasts', { 'aria-live': 'polite', 'aria-atomic': 'false' });
  navBar = nav;

  /*
   * index.html already carries the .shell class on #app, so the frame is built
   * into the host rather than wrapped in another one. A second .shell would
   * nest two min-height:100dvh boxes and put the bottom nav's fixed position in
   * a containing block nobody expected.
   */
  clear(host);
  host.appendChild(nav);
  host.appendChild(mount);
  host.appendChild(toastHost);
  return { mount, nav };
}

/** Swap the mounted view. Re-selecting the current one re-renders it in place. */
export function show(key, ctx) {
  const view = views[key];
  if (!view) return;
  const same = current === key;
  current = key;

  for (const b of navBar.querySelectorAll('.nav-btn')) {
    const on = b.dataset.key === key;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  }

  clear(mount);
  const root = h('section', { 'data-t': `view-${key}`, class: `view view-${key}` });
  mount.appendChild(root);
  view.render(root, ctx);

  /*
   * Moving between screens should put a keyboard user at the top of the new one
   * and leave a mouse user's scroll alone. Focusing the host does both — it is
   * tabindex="-1" so it takes focus without joining the tab order.
   */
  if (!same) {
    mount.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    mount.focus({ preventScroll: true });
  }
}

export function currentView() {
  return current;
}

/** Repaint only the mounted view — used when the forecast changes underneath it. */
export function refresh(ctx) {
  if (current) show(current, ctx);
}

/*
 * A transient confirmation.
 *
 * It is announced to screen readers through the live region rather than by
 * moving focus, because a toast interrupting whatever the user is typing to
 * tell them a task was saved is worse than not telling them at all.
 */
export function toast(message, tone) {
  if (!toastHost) return;
  const node = h('div.toast', { 'data-t': 'toast', class: tone ? `toast ${tone}` : 'toast' },
    h('span', { text: message }));
  toastHost.appendChild(node);
  announce(message);

  const life = reduceMotion.matches ? 2600 : 3000;
  window.setTimeout(() => {
    node.classList.add('out');
    window.setTimeout(() => node.remove(), reduceMotion.matches ? 0 : 260);
  }, life);
}

/**
 * A full-screen flow that covers the shell — onboarding, the evening ritual,
 * the morning check-in, the end-of-day review.
 *
 * Not a sheet: these are the moments where the app has one question and wants
 * the whole screen for it, and layering them over a visible home screen makes
 * both harder to read. Returns close().
 */
export function flow(render, opts) {
  const o = opts || {};
  const host = h('div.flow', { 'data-t': o.testId || null, role: 'dialog', 'aria-modal': 'true',
    'aria-label': o.label || '' });
  const prev = document.activeElement;
  let entry = null;

  function close() {
    if (!host.isConnected) return;
    document.removeEventListener('keydown', onKey);
    host.remove();
    closeLayer(entry);
    document.body.classList.remove('flow-open');
    if (prev && prev.focus) prev.focus();
    if (o.onClose) o.onClose();
  }

  function onKey(e) {
    /*
     * A flow can have a sheet open on top of it — the ritual's "add something"
     * opens the item editor — and only the top layer may answer the keyboard.
     * Both handlers sit on the document, so without this one Escape closed the
     * editor and the whole ritual with it.
     */
    if (!isTopLayer(entry)) return;
    if (e.key === 'Escape' && o.dismissible !== false) { close(); return; }
    if (e.key !== 'Tab') return;
    const f = Array.from(host.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  document.addEventListener('keydown', onKey);
  document.body.classList.add('flow-open');
  document.body.appendChild(host);
  entry = openLayer(host);
  render(host, close);

  const target = qs('input,button,select,textarea', host);
  if (target) target.focus();
  return close;
}
