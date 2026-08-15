/*
 * dom.js — element construction and the overlay primitives.
 *
 * No framework. h() builds elements, render functions return elements, and a
 * screen re-renders by replacing its own subtree. That is enough for an app
 * this size, and it means there is no reconciliation to reason about when a
 * planner recomputes a day.
 *
 * The one rule that matters: text goes in as text. h() sets textContent for
 * strings and never parses markup, so a task title someone pasted from a web
 * page is a task title and not an injection. The single `html:` escape hatch
 * exists for the icon set, whose paths are constants in this repository.
 */

import { icon } from './icons.js';
import { t } from './i18n.js';

/**
 * h('div.card', {attrs}, ...children)
 * Tag supports `tag.class.class#id`. Children may be nodes, strings, arrays,
 * or null/false (skipped, so `cond && h(...)` works inline).
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
      else if (k === 'data' && typeof v === 'object') Object.assign(node.dataset, v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
  } else if (attrs !== null && attrs !== undefined && attrs !== false) {
    children.unshift(attrs);
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === '') continue;
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

export function replace(node, ...children) {
  clear(node);
  append(node, children);
  return node;
}

export function qs(sel, root) { return (root || document).querySelector(sel); }
export function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

/* ------------------------------------------------------------------ *
 * Bidirectional text
 * ------------------------------------------------------------------ */

/**
 * A run that must render left-to-right inside Hebrew: a clock time, a
 * duration, a signed number, a version string.
 *
 * The reason is not that digits render backwards — they do not. It is that a
 * neutral character adjacent to digits (a colon, a plus, a minus, a slash)
 * takes its direction from the surrounding paragraph, so "17:30" in an RTL run
 * is fine but "-1.5" renders as "1.5-" and "+30" as "30+", with the sign
 * detached from its number and moved to the side a reader will not attach it
 * back from.
 *
 * A RANGE MUST NOT USE THIS. "8–12" inside Hebrew renders with 12 on the left
 * and 8 on the right, which is correct: an RTL reader meets 8 first and reads
 * "8 to 12". Forcing the range LTR reverses the reading order and is the bug,
 * not the fix.
 */
export function ltr(text) {
  return h('span.num', { dir: 'ltr' }, String(text));
}

/** A time of day. Same isolation, with the class that gives tabular figures. */
export function clockText(text) {
  return h('span.num', { dir: 'ltr' }, String(text));
}

/* ------------------------------------------------------------------ *
 * Announcements
 * ------------------------------------------------------------------ */

let liveRegion = null;

/** Tell a screen reader something happened, without moving focus. */
export function announce(msg, assertive) {
  if (!liveRegion) {
    liveRegion = h('div.sr-only', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.appendChild(liveRegion);
  }
  liveRegion.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  /* Cleared first: setting the same text twice is not a change, and a live
   * region only announces changes. */
  liveRegion.textContent = '';
  setTimeout(() => { liveRegion.textContent = msg; }, 30);
}

export const reduceMotion = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

/* ------------------------------------------------------------------ *
 * Focus management
 * ------------------------------------------------------------------ */

const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),'
  + 'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(root) {
  return qsa(FOCUSABLE, root).filter((n) => n.offsetParent !== null || n === document.activeElement);
}

/**
 * A modal overlay. On phones the same markup lands as a bottom sheet — that is
 * a stylesheet decision, not a second component, so there is one focus trap
 * and one escape handler rather than two that drift.
 *
 * Returns close().
 */
export function overlay(content, opts) {
  const o = opts || {};
  const box = h('div.modal' + (o.wide ? '.modal-wide' : ''), {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': o.label || '',
  }, content);

  const scrim = h('div.scrim', {
    onclick: (e) => { if (e.target === scrim && o.dismissable !== false) close('scrim'); },
  }, box);

  const previous = document.activeElement;
  let closed = false;

  function onKey(e) {
    if (e.key === 'Escape' && o.dismissable !== false) {
      e.stopPropagation();
      close('escape');
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables(box);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function close(reason) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    scrim.remove();
    document.body.style.overflow = '';
    if (previous && previous.focus && document.contains(previous)) previous.focus();
    if (o.onClose) o.onClose(reason);
  }

  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(scrim);
  document.body.style.overflow = 'hidden';

  /*
   * Focus the first thing somebody would actually want to type in.
   *
   * The obvious version — the first focusable element — is wrong here, and
   * wrong in a way that is invisible to whoever writes the dialog and
   * infuriating to whoever uses one. The head's close button comes first in
   * DOM order, so every dialog with a text field opened with focus on the X:
   * type a character and nothing happens, press Enter and the dialog shuts.
   *
   * So: a field first, any control second, and the box itself last — an
   * announcement-only dialog still has to move focus in, or a screen reader
   * stays behind on the page underneath.
   */
  const target = o.initialFocus
    ? qs(o.initialFocus, box)
    : qs('input:not([type=hidden]),textarea,select', box) || qs('button', box);
  if (target) target.focus();
  else { box.setAttribute('tabindex', '-1'); box.focus(); }

  return close;
}

/** Overlay with the standard head / body / foot furniture. */
export function dialog(opts) {
  const o = opts || {};
  let close = () => {};
  const foot = o.actions && o.actions.length
    ? h('div.modal-foot', o.actions.map((a) => h('button.btn', {
      class: a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : 'btn-secondary',
      type: 'button',
      onclick: () => {
        /* The handler decides whether the dialog survives: returning false
         * keeps it open, which is what a failed validation needs. */
        if (a.onClick && a.onClick() === false) return;
        close();
      },
    }, a.label)))
    : null;

  const body = h('div.modal-body', o.body);

  close = overlay([
    h('div.modal-head',
      h('div',
        h('h2.modal-title', { id: 'dlg-title' }, o.title),
        o.note ? h('p.tiny.quiet', { style: { marginBlockStart: '4px' } }, o.note) : null),
      o.dismissable === false ? null : h('button.btn-icon', {
        type: 'button',
        'aria-label': t('common.close'),
        onclick: () => close(),
      }, icon('x'))),
    body,
    foot,
  ], { label: o.title, wide: o.wide, dismissable: o.dismissable, onClose: o.onClose, initialFocus: o.initialFocus });

  return { close: () => close(), body };
}

/** Destructive confirmation. Resolves true only on the destructive button. */
export function confirmDestructive(opts) {
  return new Promise((resolve) => {
    let decided = false;
    const d = dialog({
      title: opts.title,
      body: opts.note ? h('p.muted', opts.note) : null,
      actions: [
        { label: opts.cancelLabel || t('common.cancel'), onClick: () => { decided = true; resolve(false); } },
        {
          label: opts.confirmLabel || t('common.delete'),
          kind: 'danger',
          onClick: () => { decided = true; resolve(true); },
        },
      ],
      onClose: () => { if (!decided) resolve(false); },
    });
    return d;
  });
}

/* ------------------------------------------------------------------ *
 * Popup menu, anchored on the inline axis
 * ------------------------------------------------------------------ */

export function popupMenu(anchor, items, opts) {
  const o = opts || {};
  const menu = h('div.menu', { role: 'menu' });

  for (const item of items) {
    if (item === null || item === undefined || item === false) continue;
    if (item.separator) { menu.appendChild(h('div.menu-sep')); continue; }
    if (item.label && !item.onClick) { menu.appendChild(h('div.menu-label', item.label)); continue; }
    menu.appendChild(h('button.menu-item', {
      class: item.danger ? 'menu-item-risk' : null,
      type: 'button',
      role: 'menuitem',
      onclick: () => { close(); item.onClick(); },
    }, item.icon ? icon(item.icon) : null, h('span.grow', item.label)));
  }

  function onDocClick(e) { if (!menu.contains(e.target) && e.target !== anchor) close(); }
  function onKey(e) {
    if (e.key === 'Escape') { close(); anchor.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const f = focusables(menu);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    const nextIndex = e.key === 'ArrowDown'
      ? (i + 1) % f.length
      : (i <= 0 ? f.length - 1 : i - 1);
    f[nextIndex].focus();
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', close, true);
    menu.remove();
    if (o.onClose) o.onClose();
  }

  document.body.appendChild(menu);
  position();

  function position() {
    const r = anchor.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const rtl = (document.documentElement.getAttribute('dir') || 'rtl') === 'rtl';
    menu.style.position = 'fixed';

    /* Anchor to the inline-start edge in RTL (which is the right side of the
     * button) and flip when there is no room, in whichever direction "no room"
     * turns out to be. */
    let left = rtl ? r.right - m.width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - m.width - 8));

    const below = r.bottom + 6;
    const top = below + m.height > window.innerHeight - 8
      ? Math.max(8, r.top - m.height - 6)
      : below;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  setTimeout(() => {
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    const f = focusables(menu);
    if (f.length) f[0].focus();
  }, 0);

  return close;
}

/* ------------------------------------------------------------------ *
 * Small shared pieces
 * ------------------------------------------------------------------ */

export function emptyState(opts) {
  return h('div.empty',
    opts.icon ? h('div.empty-art', icon(opts.icon, { size: 34, weight: 1.4 })) : null,
    h('p.empty-title', opts.title),
    opts.note ? h('p.empty-note', opts.note) : null,
    opts.action
      ? h('div', { style: { marginBlockStart: '18px' } },
        h('button.btn.btn-secondary', { type: 'button', onclick: opts.action.onClick }, opts.action.label))
      : null);
}

export function skeletonLines(n) {
  return h('div.card.card-pad',
    Array.from({ length: n || 3 }, () => h('div.skeleton.sk-line')));
}

export function sectionHead(title, right) {
  return h('div.section-head',
    h('h2.section-title', title),
    right || null);
}

/** A labelled form field. */
export function field(opts) {
  const id = opts.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  const control = opts.control;
  control.id = id;
  if (opts.error) control.setAttribute('aria-invalid', 'true');
  const hintId = opts.hint || opts.error ? `${id}-hint` : null;
  if (hintId) control.setAttribute('aria-describedby', hintId);
  return h('div.field',
    h('label.field-label', { for: id }, opts.label,
      opts.optional ? h('span.quiet', { style: { fontWeight: '400' } }, ` · ${t('common.optional')}`) : null),
    control,
    opts.error
      ? h('p.field-error', { id: hintId, role: 'alert' }, opts.error)
      : opts.hint ? h('p.field-hint', { id: hintId }, opts.hint) : null);
}

/** A checkbox rendered as a button, so its checked state is one attribute. */
export function checkbox(checked, opts) {
  const o = opts || {};
  return h('button.tcheck', {
    type: 'button',
    role: 'checkbox',
    'aria-checked': checked ? 'true' : 'false',
    'aria-disabled': o.disabled ? 'true' : null,
    'aria-label': o.label,
    title: o.title || null,
    onclick: (e) => {
      e.stopPropagation();
      if (o.disabled) { if (o.onBlocked) o.onBlocked(); return; }
      if (o.onChange) o.onChange(!checked);
    },
  }, icon('check', { weight: 3 }));
}

/** A switch row for settings. */
export function switchRow(opts) {
  const sw = h('button.switch', {
    type: 'button',
    role: 'switch',
    'aria-checked': opts.checked ? 'true' : 'false',
    'aria-label': opts.label,
    onclick: () => {
      const next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', next ? 'true' : 'false');
      opts.onChange(next);
    },
  });
  return h('div.switch-row',
    h('div.grow',
      h('div.switch-label', opts.label),
      opts.note ? h('div.switch-note', opts.note) : null),
    sw);
}

/** A horizontal set of single-choice chips. */
export function chipGroup(opts) {
  const group = h('div.row.wrap-flex', { role: 'radiogroup', 'aria-label': opts.label });
  let current = opts.value;
  for (const opt of opts.options) {
    const btn = h('button.chip.chip-select', {
      type: 'button',
      role: 'radio',
      'aria-checked': opt.value === current ? 'true' : 'false',
      'aria-pressed': opt.value === current ? 'true' : 'false',
      title: opt.note || null,
      onclick: () => {
        current = opt.value;
        qsa('button', group).forEach((b) => {
          const on = b.dataset.value === String(opt.value);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        opts.onChange(opt.value);
      },
      data: { value: String(opt.value) },
    }, opt.label);
    group.appendChild(btn);
  }
  return group;
}

/** A progress bar with an accessible value. */
export function progressBar(pct, opts) {
  const o = opts || {};
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return h('div.bar' + (o.small ? '.bar-sm' : ''), {
    role: 'progressbar',
    'aria-valuenow': clamped,
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-label': o.label || '',
  }, h('div.bar-fill', {
    class: o.tone === 'warn' ? 'bar-fill-warn' : o.tone === 'risk' ? 'bar-fill-risk' : null,
    style: { width: `${clamped}%` },
  }));
}

/** Scroll an element into view only if it is actually out of view. */
export function scrollIntoViewIfNeeded(el, container) {
  if (!el || !container) return;
  const e = el.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  if (e.top < c.top) el.scrollIntoView({ block: 'nearest' });
  else if (e.bottom > c.bottom) el.scrollIntoView({ block: 'nearest' });
}
