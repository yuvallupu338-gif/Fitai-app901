/* dom.js — minimal element helpers. No framework, no build step. */

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
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
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

/** Focus-trapped, escape-closable overlay. Returns a close() function. */
export function modal(content, opts) {
  const o = opts || {};
  const box = h('div.modal-box', { role: 'dialog', 'aria-modal': 'true', 'aria-label': o.label || '' }, content);
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) close(); } }, box);
  const prev = document.activeElement;

  function onKey(e) {
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
    document.removeEventListener('keydown', onKey);
    back.remove();
    document.body.style.overflow = '';
    if (prev && prev.focus) prev.focus();
    if (o.onClose) o.onClose();
  }

  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  document.body.style.overflow = 'hidden';
  const target = qs('button,input,select,textarea', box);
  if (target) {
    target.focus();
  } else {
    box.setAttribute('tabindex', '-1');
    box.focus();
  }
  return close;
}

/**
 * Reads an image file and returns a downscaled JPEG data URL.
 *
 * Phone photos are several megabytes and localStorage holds about five in
 * total, so storing an original would break the app on the second picture.
 * Lives here rather than in the wizard because the scan screen picks photos too,
 * and two copies of a resize routine drift.
 */
export function shrinkImage(file, maxPx, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
    img.src = url;
  });
}

let liveRegion = null;
/** Announce a message to screen readers without moving focus. */
/*
 * A number that carries a sign, kept together in an RTL paragraph.
 *
 * Digits render left-to-right inside Hebrew text, which is right — "76" is
 * always "76". A leading + or − is not a digit though; it is a neutral, and in
 * an RTL run it gets pulled to the far side of the digits it belongs to. So
 * "-1.5 ק״ג" displays as "1.5-" and "+30" as "30+": the sign detaches from its
 * own number and lands where a reader has no reason to attach it back.
 *
 * Ranges do NOT need this and must not be wrapped in it. "8–12" displays as
 * "12–8", and that is correct — a Hebrew reader scans right-to-left, meets 8
 * first and 12 second, and reads "8 to 12". Both numbers stay intact. Forcing
 * that to LTR would be the actual bug.
 *
 * timer.js worked this out first, for the rest clock, and fixed it in place.
 * This is the same fix with a name, so the next signed number gets it too.
 */
export function signedNum(text) {
  return h('span', { dir: 'ltr' }, String(text));
}

/*
 * Whether the reader has asked the system for less movement.
 *
 * It lives here rather than in anim.js, where it was, because of what importing
 * it costs. anim.js pulls in rig.js for the skeleton and poses.js for the easing
 * table, so the rest timer — which wanted this to decide between repainting four
 * times a second and once — was dragging 1,159 lines of inverse kinematics into
 * every build to ask a media query a question.
 *
 * anim.js reads it from here now, so there is still one of it.
 */
export const reduceMotion = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

export function announce(msg) {
  if (!liveRegion) {
    liveRegion = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = '';
  setTimeout(() => { liveRegion.textContent = msg; }, 30);
}
