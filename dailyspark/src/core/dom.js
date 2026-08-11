/*
 * dom.js — element helpers. Same shape as the one in the FitAI app next door,
 * trimmed to what this app uses and with the two additions it needs: haptics
 * and a sheet (the bottom-sheet pattern this UI leans on).
 *
 * Children are inserted as text, never as HTML. Spark bodies are data and one
 * day some of them will come from a server, so there is deliberately no path
 * here that turns a string into markup.
 */

export function h(spec, attrs, ...children) {
  const m = /^([a-zA-Z0-9-]+)?((?:[.#][\w-]+)*)$/.exec(spec);
  const tag = (m && m[1]) || 'div';
  const node = document.createElement(tag);
  if (m && m[2]) {
    for (const token of m[2].match(/[.#][\w-]+/g) || []) {
      if (token[0] === '.') node.classList.add(token.slice(1));
      else node.id = token.slice(1);
    }
  }
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = [node.className, v].filter(Boolean).join(' ');
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'text') node.textContent = v;
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
  } else if (attrs !== null && attrs !== undefined) {
    children.unshift(attrs);
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(node, c);
    else if (c instanceof Node) node.appendChild(c);
    else node.appendChild(document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function qs(sel, root) {
  return (root || document).querySelector(sel);
}

export function qsa(sel, root) {
  return Array.from((root || document).querySelectorAll(sel));
}

export const reduceMotion = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

/*
 * A short vibration keyed to meaning rather than to length.
 *
 * The daily loop is three taps long, and on a phone the difference between
 * "the tap registered" and "the tap did something" is almost entirely haptic.
 * Guarded because iOS Safari has no navigator.vibrate and calling it throws
 * nothing but also does nothing — the guard is so the call sites stay readable.
 */
const PATTERNS = { light: 10, select: [8], success: [12, 40, 18], warn: [24, 60, 24] };

export function haptic(kind) {
  if (reduceMotion.matches) return;
  try {
    if (navigator.vibrate) navigator.vibrate(PATTERNS[kind] || PATTERNS.light);
  } catch (e) { /* not available; the visual feedback still happened */ }
}

/*
 * Bottom sheet. Escape closes, the backdrop closes, focus is trapped and
 * returned. Returns close().
 *
 * The mood check-in, the reject-reason picker and the share card all use this,
 * so the focus handling lives in one place — three hand-rolled overlays is
 * three chances to strand a screen-reader user behind a backdrop.
 */
export function sheet(content, opts) {
  const o = opts || {};
  const box = h('div.sheet', {
    role: 'dialog', 'aria-modal': 'true', 'aria-label': o.label || '',
  }, o.title ? h('h2.sheet-title', o.title) : null, content);
  const back = h('div.sheet-back', {
    onclick: (e) => { if (e.target === back) close(); },
  }, box);
  const prev = document.activeElement;

  function focusables() {
    return qsa('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', box)
      .filter((n) => !n.disabled && n.offsetParent !== null);
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    back.classList.add('is-leaving');
    const done = () => back.remove();
    if (reduceMotion.matches) done(); else setTimeout(done, 180);
    document.body.style.overflow = '';
    if (prev && prev.focus) prev.focus();
    if (o.onClose) o.onClose();
  }

  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  document.body.style.overflow = 'hidden';
  const first = focusables()[0];
  if (first) first.focus();
  else { box.setAttribute('tabindex', '-1'); box.focus(); }
  return close;
}

let liveRegion = null;

/** Announce to screen readers without moving focus. */
export function announce(msg) {
  if (!liveRegion) {
    liveRegion = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = '';
  setTimeout(() => { liveRegion.textContent = msg; }, 30);
}

let toastTimer = null;

/** Brief, non-blocking confirmation. Never used for errors that need a decision. */
export function toast(msg) {
  let el = qs('.toast');
  if (!el) {
    el = h('div.toast', { role: 'status' });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

/*
 * Digits inside an RTL paragraph.
 *
 * Hebrew runs right-to-left but numbers do not, and a bare "+1" or "3/7" gets
 * its neutral character pulled to the wrong end of the digits — "1+" and "7/3".
 * Wrapping the whole token in an LTR span keeps it intact. Ranges like "8–12"
 * do NOT need this and must not use it: they read correctly as-is.
 */
export function ltr(text) {
  return h('span', { dir: 'ltr' }, String(text));
}
