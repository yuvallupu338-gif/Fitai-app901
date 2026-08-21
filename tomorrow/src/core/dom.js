/*
 * dom.js — element helpers. No framework, no build step.
 *
 * Carried over from the FitAI app in this repo and cut down to what TomorrowAI
 * actually needs. The photo downscaler is gone; nothing here stores an image.
 * Two things are new. svg() exists because every chart in this app is drawn by
 * hand and h() cannot make an SVG node — createElement('circle') produces an
 * unknown HTML element that renders as nothing, which costs an afternoon to
 * see. sheet() exists because every editor here opens from the bottom edge on
 * a phone, and a second copy of a focus trap drifts from the first.
 *
 * Nothing in this file touches the document at module level. The validator
 * imports the whole tree in plain Node, and a stray top-level document.body
 * would take the UI layer down with it.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * h('div.card', {attrs}, ...children)
 * Tag supports `tag.class.class#id` shorthand. Children may be nodes,
 * strings (inserted as TEXT, never HTML), arrays, or null.
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
      else if (k === 'style') setStyle(node, v);
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

/*
 * Styles go through the CSSOM, never through setAttribute.
 *
 * The page ships a Content-Security-Policy with no 'unsafe-inline' in
 * style-src, and a style attribute written by setAttribute is exactly the
 * thing that blocks: the attribute is dropped, the rule never applies, and
 * nothing in the console points at the line that wrote it. Assigning to
 * node.style — either property by property or through cssText — is a CSSOM
 * write, which the policy does not police. The FitAI helper only handled the
 * object form and quietly fell through to setAttribute for a string, so
 * `{style: 'width:40%'}` worked in a page with a loose policy and silently did
 * nothing here.
 *
 * The `html` key from the original is deliberately not carried over. Contracts
 * §0 forbids innerHTML with interpolated data, and a helper that offers it is
 * an invitation.
 */
function setStyle(node, v) {
  if (typeof v === 'string') node.style.cssText = v;
  else if (v && typeof v === 'object') Object.assign(node.style, v);
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

/*
 * The same shorthand as h(), in the SVG namespace.
 *
 * Charts are inline SVG built node by node, which needs createElementNS: an
 * element made by createElement('path') carries the XHTML namespace, sits in
 * the tree looking correct in the inspector, and draws nothing at all. This is
 * the only difference that matters, so the signature and the child handling
 * are identical to h() and the two can be nested freely.
 *
 * Two details differ under the surface. className on an SVG element is a
 * read-only SVGAnimatedString, so classes go through classList and the class
 * attribute. And attribute names keep their case here — setAttribute is
 * lower-casing on an HTML element but exact on an SVG one, which is what lets
 * viewBox, preserveAspectRatio and gradientUnits survive.
 *
 * A bare spec defaults to a <g>, not a <div>: inside an <svg> root a group is
 * the only thing a nameless container can usefully be.
 */
export function svg(spec, attrs, ...children) {
  const m = /^([a-zA-Z0-9-]+)?((?:[.#][\w-]+)*)$/.exec(spec);
  const tag = (m && m[1]) || 'g';
  const node = document.createElementNS(SVG_NS, tag);
  if (m && m[2]) {
    for (const token of m[2].match(/[.#][\w-]+/g) || []) {
      if (token[0] === '.') node.classList.add(token.slice(1));
      else node.setAttribute('id', token.slice(1));
    }
  }
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.setAttribute('class', [node.getAttribute('class'), v].filter(Boolean).join(' '));
      else if (k === 'style') setStyle(node, v);
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

/*
 * How many overlays are stacked right now.
 *
 * modal() and sheet() both freeze the page behind them by setting overflow on
 * <body>, and each used to clear it again in its own close(). Open the item
 * editor as a sheet, press delete, confirm in the modal that opens on top of
 * it, and the page underneath started scrolling again while the sheet was
 * still up — the inner layer closed and unlocked a lock the outer layer still
 * needed. Counting the layers means the lock lifts when the last one goes.
 */
let openOverlays = 0;

/*
 * Every layer sits above the one that opened it.
 *
 * The z-indexes used to live in the stylesheet as fixed numbers, and they were
 * in the wrong order: a full-screen flow was 70 and a sheet was 60, so the
 * evening ritual's "add something" button opened the item editor *underneath*
 * the ritual. The sheet was there in the DOM, focused, keyboard-operable and
 * completely invisible — which is the worst kind of dead button, because
 * nothing about it looks broken.
 *
 * A stack fixes it for good rather than for now. Whatever opens last is on top,
 * so a sheet over a flow works, a confirm modal over that sheet works, and
 * nobody has to remember a number when they add the next kind of overlay.
 *
 * Escape reads the same stack, and only the topmost layer answers to it. Both
 * handlers used to be on the document at once, so one press closed the sheet
 * *and* the ritual behind it.
 */
const LAYER_BASE = 70;
const LAYER_STEP = 10;
const layers = [];

function pushLayer(node) {
  const entry = { node };
  layers.push(entry);
  node.style.zIndex = String(LAYER_BASE + layers.length * LAYER_STEP);
  return entry;
}

function popLayer(entry) {
  const at = layers.indexOf(entry);
  if (at >= 0) layers.splice(at, 1);
}

/** True when this layer is the one the user is actually looking at. */
export function isTopLayer(entry) {
  return layers.length > 0 && layers[layers.length - 1] === entry;
}

/** Register a full-screen flow in the same stack the sheets use. */
export function openLayer(node) {
  const entry = pushLayer(node);
  openOverlays += 1;
  document.body.style.overflow = 'hidden';
  return entry;
}

/** Release a layer. The scroll lock lifts only when the last one goes. */
export function closeLayer(entry) {
  popLayer(entry);
  openOverlays = Math.max(0, openOverlays - 1);
  if (openOverlays === 0) document.body.style.overflow = '';
}

/*
 * The shared body of modal() and sheet(): trap Tab inside the box, close on
 * Escape or a click on the backdrop itself, restore the focus that was there
 * before, and hand back a close() the caller can also call directly.
 *
 * The two differ only in class name and in what the CSS then does with it —
 * one is centred, one rises from the bottom edge on a phone — so they share
 * everything here. A second implementation of a focus trap is a second set of
 * keyboard bugs.
 */
function overlay(kind, box, opts) {
  const o = opts || {};
  const back = h(`div.${kind}-back`, { onclick: (e) => { if (e.target === back) close(); } }, box);
  const prev = document.activeElement;
  let entry = null;

  function onKey(e) {
    // Only the topmost layer answers the keyboard. Without this, Escape inside
    // a sheet opened from a flow closed both of them at once.
    if (!isTopLayer(entry)) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const f = qsa('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', box)
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function close() {
    // Escape lands on the document, a backdrop click on the backdrop, and the
    // sheet's own close button on itself. Two of them can arrive for one
    // gesture, and onClose saving a draft twice is not free.
    if (!back.isConnected) return;
    document.removeEventListener('keydown', onKey);
    back.remove();
    closeLayer(entry);
    if (prev && prev.focus) prev.focus();
    if (o.onClose) o.onClose();
  }

  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  entry = openLayer(back);
  const target = qs('button,input,select,textarea', box);
  if (target) {
    target.focus();
  } else {
    box.setAttribute('tabindex', '-1');
    box.focus();
  }
  return close;
}

/** Focus-trapped, escape-closable overlay. Returns a close() function. */
export function modal(content, opts) {
  const o = opts || {};
  const box = h('div.modal-box', { role: 'dialog', 'aria-modal': 'true', 'aria-label': o.label || '' }, content);
  return overlay('modal', box, o);
}

let sheetId = 0;

/*
 * A bottom sheet on a phone, a centred dialog from 1024px up.
 *
 * Every editor in this app opens through here: the item editor, the time
 * pickers, the what-if panel, the score breakdown. On a 390px screen a dialog
 * pinned to the middle of the viewport puts its fields under the thumb's blind
 * spot and its buttons behind the keyboard; rising from the bottom edge puts
 * them where the hand already is. On a desktop the same content centred is
 * simply a dialog, and the difference is one media query in components.css
 * rather than two components here.
 *
 * There is no drag-to-dismiss and no grab handle. A handle that does not drag
 * is a promise the sheet does not keep, and a drag that dismisses would also
 * have to not fight the sheet's own scrolling, the sliders inside it and the
 * on-screen keyboard. The backdrop, Escape and a real close button cover the
 * same ground and are reachable without a pointer.
 */
export function sheet(content, opts) {
  const o = opts || {};
  const attrs = { role: 'dialog', 'aria-modal': 'true' };
  let head = null;

  if (o.title) {
    sheetId += 1;
    const id = `sheet-title-${sheetId}`;
    attrs['aria-labelledby'] = id;
    head = h('header.sheet-head', h('h2.sheet-title', { id }, o.title), closeButton());
  } else {
    attrs['aria-label'] = o.label || '';
    head = h('header.sheet-head', h('span.sheet-title'), closeButton());
  }

  const box = h('div.sheet-box', attrs, head, h('div.sheet-body', content));
  const close = overlay('sheet', box, o);
  return close;

  function closeButton() {
    return h('button.btn.icon.sheet-close', { type: 'button', 'aria-label': 'סגירה', onclick: () => close() },
      svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
        svg('path', { d: 'M6 6 L18 18 M18 6 L6 18', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' })));
  }
}

/*
 * A number that carries a sign, kept together in an RTL paragraph.
 *
 * Digits render left-to-right inside Hebrew text, which is right — "76" is
 * always "76". A leading + or − is not a digit though; it is a neutral, and in
 * an RTL run it gets pulled to the far side of the digits it belongs to. So
 * "−1.5 שעות" displays as "1.5−" and "+30" as "30+": the sign detaches from its
 * own number and lands where a reader has no reason to attach it back.
 *
 * Ranges do NOT need this and must not be wrapped in it. "8–12" displays as
 * "12–8", and that is correct — a Hebrew reader scans right-to-left, meets 8
 * first and 12 second, and reads "8 to 12". Both numbers stay intact. Forcing
 * that to LTR would be the actual bug. Same for a time range: "10:00–11:00".
 *
 * The FitAI app in this repo worked this out first, for its rest clock, and
 * fixed it in place. Contracts §2 makes it a rule rather than a discovery:
 * every signed number in Hebrew prose goes through here, no range does.
 */
export function signedNum(text) {
  return h('span', { dir: 'ltr' }, String(text));
}

/*
 * Whether the reader has asked the system for less movement.
 *
 * Exported as the live MediaQueryList rather than a boolean, because the
 * answer changes while the app is open — iOS toggles it with the accessibility
 * shortcut mid-session — and a view that read a snapshot at import time would
 * keep animating a score ring for somebody who just asked it to stop. Views
 * read `.matches` and, where it matters, listen for 'change'.
 *
 * This is the system preference only. The profile carries its own
 * `reduceMotion` override on top of it, and the two are ORed by whoever is
 * deciding: the setting exists precisely for people whose OS is not set that
 * way but who still want the app still. app.js mirrors the combined answer
 * onto <html data-motion="reduced"> so the CSS can honour it too.
 *
 * The guard is for Node. The validator imports this file with no window at
 * all, and a MediaQueryList-shaped stand-in keeps that from throwing.
 */
export const reduceMotion = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

let liveRegion = null;

/*
 * Announce a message to screen readers without moving focus.
 *
 * The clear-then-set with a gap between them is not a stylistic tic: a live
 * region whose text is replaced with a similar string in the same tick is
 * often not re-announced at all, and the score changing from 71 to 74 is
 * exactly that case. Emptying it first makes the next write a new
 * announcement.
 */
export function announce(msg) {
  if (!liveRegion) {
    liveRegion = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = '';
  setTimeout(() => { liveRegion.textContent = msg; }, 30);
}
