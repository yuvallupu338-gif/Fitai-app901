/*
 * dom.js — the three element helpers this game needs.
 *
 * A local copy rather than an import from the plan app's src/core/dom.js, for
 * the same reason backrooms/ keeps its own of everything: each app on this
 * origin is self-contained, so one of them can be deleted, moved or rebuilt
 * without the other two noticing.
 *
 * `h` never takes markup. Every string that reaches the page goes through
 * createTextNode, which is what keeps opening names and event text — the only
 * strings in this game that vary — incapable of being anything but text.
 */

export function h(spec, attrs, ...kids) {
  const m = /^([a-zA-Z0-9-]+)?((?:[.#][\w-]+)*)$/.exec(spec);
  const node = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const tok of m[2].match(/[.#][\w-]+/g) || []) {
      if (tok[0] === '.') node.classList.add(tok.slice(1));
      else node.id = tok.slice(1);
    }
  }
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
  } else if (attrs !== null && attrs !== undefined) {
    kids.unshift(attrs);
  }
  add(node, kids);
  return node;
}

/* Same, in the SVG namespace. createElement makes an HTMLUnknownElement that
 * renders as nothing at all inside an <svg>, which is a silent failure and a
 * genuinely confusing hour if you have not hit it before. */
export function s(tag, attrs, ...kids) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
  }
  add(node, kids);
  return node;
}

function add(node, kids) {
  for (const c of kids) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) add(node, c);
    else if (c instanceof Node) node.appendChild(c);
    else node.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function qs(sel, root) {
  return (root || document).querySelector(sel);
}

/* mm:ss, for a clock that is counting towards sunrise. */
export function clock(seconds) {
  const t = Math.max(0, Math.round(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
