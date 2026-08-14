/*
 * dom.js — element helpers. No framework, no build step.
 *
 * Shares its `h()` shape with the FitAI app next door so the two are readable
 * by the same person, but this app is self-contained (like backrooms/) and
 * carries its own copy rather than reaching across the repo.
 *
 * The one rule worth restating: `h` inserts strings as text, never as markup.
 * Skill names, goal text and AI-generated content all flow through here, and
 * an interpolated innerHTML anywhere in that path is an injection hole.
 */

/**
 * h('div.card', {attrs}, ...children)
 * Tag supports `tag.class.class#id` shorthand. Children may be nodes, strings
 * (inserted as TEXT), arrays, or null.
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
      else if (k === 'data' && typeof v === 'object') Object.assign(node.dataset, v);
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

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

/* SVG needs its own namespace; createElement('svg') produces an inert HTML
 * element that renders as nothing, which is a genuinely baffling ten minutes
 * the first time it happens. */
export function svg(spec, attrs, ...children) {
  const m = /^([a-zA-Z0-9-]+)?((?:[.#][\w-]+)*)$/.exec(spec);
  const node = document.createElementNS('http://www.w3.org/2000/svg', (m && m[1]) || 'svg');
  if (m && m[2]) {
    for (const token of m[2].match(/[.#][\w-]+/g) || []) {
      if (token[0] === '.') node.classList.add(token.slice(1));
      else node.setAttribute('id', token.slice(1));
    }
  }
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node)) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const reduceMotion = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

/**
 * Announce something to assistive technology without showing it visually.
 *
 * XP awards, unlocks and level-ups are all communicated with animation and
 * colour; without this they are communicated to sighted users only.
 */
let liveRegion = null;

/*
 * Created up front rather than on first use.
 *
 * A live region has to be in the document *before* text is put into it —
 * screen readers watch existing regions for mutations, and one that is
 * inserted already containing its message is frequently not announced at all.
 * Creating it lazily therefore loses the first announcement of the session,
 * which is the +XP on someone's very first activity. Called from the shell at
 * start-up; `announce` still guards in case it is used before that.
 */
export function ensureLiveRegion() {
  if (!liveRegion || !liveRegion.isConnected) {
    liveRegion = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.appendChild(liveRegion);
  }
  return liveRegion;
}

export function announce(message) {
  ensureLiveRegion();
  /* Cleared first: setting the same text twice in a row is not a change, and
   * screen readers will not re-announce it. */
  liveRegion.textContent = '';
  window.setTimeout(() => { liveRegion.textContent = message; }, 60);
}

/**
 * A modal on desktop, a bottom sheet on a phone.
 *
 * Same call site, different presentation — §68 asks for the mobile experience
 * to be designed rather than scaled down, and the skill detail panel is where
 * that matters most. Which one appears is decided by a CSS class here and the
 * layout in components.css, so there is one focus-trap implementation rather
 * than two.
 */
export function sheet(content, opts = {}) {
  const previouslyFocused = document.activeElement;

  const panel = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label || 'Details' },
    h('button.sheet-close', {
      'aria-label': 'Close',
      onclick: () => close(),
    }, '×'),
    content);

  const backdrop = h('div.sheet-backdrop', { onclick: (e) => { if (e.target === backdrop) close(); } }, panel);

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;

    /* Focus trap. Without it, tabbing past the last control lands on the page
     * behind the sheet — which for a screen reader user means the dialog has
     * silently stopped existing. */
    const focusable = qsa(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      panel,
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', onHashChange);
    backdrop.classList.add('closing');
    const done = () => {
      backdrop.remove();
      document.body.classList.remove('sheet-open');

      /*
       * Run the caller's onClose FIRST, then restore focus.
       *
       * The other order looked right and was not: every caller's onClose
       * re-renders the screen behind the dialog, which destroys the element
       * that was just focused, and the browser drops focus to <body>. A
       * keyboard user was returned to the top of the document every time they
       * closed a skill.
       *
       * After the re-render the original node is usually gone, so we re-find
       * it by what identifies it rather than by reference.
       */
      const marker = previouslyFocused && previouslyFocused.dataset
        ? previouslyFocused.dataset.skill : null;

      if (opts.onClose) opts.onClose();

      const target = (previouslyFocused && previouslyFocused.isConnected)
        ? previouslyFocused
        : (marker ? document.querySelector(`[data-skill="${CSS.escape(marker)}"]`) : null);

      if (target && target.focus) target.focus();
      else if (opts.focusFallback) {
        const fallback = document.querySelector(opts.focusFallback);
        if (fallback && fallback.focus) fallback.focus();
      }
    };
    if (reduceMotion) done();
    else window.setTimeout(done, 180);
  }

  /*
   * A route change closes the sheet.
   *
   * Back is the natural way to dismiss a modal, and pressing it left the
   * backdrop mounted over whatever screen the router then drew: the dashboard
   * rendered underneath, `body.sheet-open` stayed set, and the backdrop was
   * the topmost element everywhere on the page — every nav link, tab and card
   * unclickable, with nothing visible to dismiss. The app was simply stuck.
   *
   * This listens to `hashchange` rather than taking the router as a dependency,
   * because core/dom.js sits below the router and a modal outliving its screen
   * is a browser-level concern, not a routing decision.
   */
  function onHashChange() { close(); }

  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', onHashChange);
  document.body.classList.add('sheet-open');
  document.body.appendChild(backdrop);

  /* Focus the first real control, not the close button — landing on "close"
   * makes the fastest keyboard action dismissing what you just opened. */
  window.requestAnimationFrame(() => {
    const target = qs('[data-autofocus]', panel)
      || qsa('button:not(.sheet-close), a[href], input, textarea, select', panel)[0]
      || panel;
    if (target.focus) target.focus();
  });

  return { close, panel };
}

/** Format a number with thousands separators, without pulling in Intl per call. */
const numberFormat = new Intl.NumberFormat('en-GB');
export function num(n) {
  return numberFormat.format(Math.round(Number(n) || 0));
}

/** "3 days ago", "just now" — short, and never a bare timestamp. */
export function ago(ms, now = Date.now()) {
  if (!ms) return 'never';
  const seconds = Math.max(0, (now - ms) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}
