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
  if (target) target.focus(); else box.setAttribute('tabindex', '-1'), box.focus();
  return close;
}

let liveRegion = null;
/** Announce a message to screen readers without moving focus. */
export function announce(msg) {
  if (!liveRegion) {
    liveRegion = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = '';
  setTimeout(() => { liveRegion.textContent = msg; }, 30);
}
