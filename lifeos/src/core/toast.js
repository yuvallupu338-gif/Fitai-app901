/*
 * toast.js — transient confirmations, and the undo that makes destructive
 * actions safe to take quickly.
 *
 * UNDO IS NOT A NICETY HERE, IT IS THE PERMISSION SLIP.
 *
 * The planner moves four tasks to tomorrow in one click. A confirmation dialog
 * before that would make replanning something people stop doing; no way back
 * afterwards would make it something they are afraid of. A toast with an undo
 * is what lets the action be one click AND reversible, and it is why the
 * planner is allowed to apply changes directly rather than only propose them.
 *
 * The timer pauses on hover and on focus, because a toast that vanishes while
 * someone is moving the mouse towards its undo button has offered nothing.
 */

import { h, clear, announce } from './dom.js';
import { icon } from './icons.js';

const DEFAULT_MS = 6000;
const UNDO_MS = 9000;

let host = null;

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = h('div.toasts', { role: 'region', 'aria-label': 'הודעות' });
  document.body.appendChild(host);
  return host;
}

function dismiss(el) {
  if (!el.parentNode) return;
  el.classList.add('toast-out');
  const remove = () => el.remove();
  el.addEventListener('animationend', remove, { once: true });
  /* Belt and braces: with reduced motion the animation is ~0ms and may not
   * fire an animationend at all in every engine. */
  setTimeout(remove, 400);
}

function build(opts) {
  const el = h('div.toast', {
    class: opts.tone === 'risk' ? 'toast-risk' : null,
    role: opts.tone === 'risk' ? 'alert' : 'status',
  });

  if (opts.tone === 'risk') el.appendChild(icon('alert', { size: 17 }));
  else if (opts.tone === 'ok') el.appendChild(icon('check', { size: 17 }));

  el.appendChild(h('span.toast-text', opts.text));

  let timer = null;
  let remaining = opts.duration || (opts.action ? UNDO_MS : DEFAULT_MS);
  let startedAt = 0;

  function stopTimer() {
    if (timer) { clearTimeout(timer); timer = null; remaining -= Date.now() - startedAt; }
  }
  function startTimer() {
    if (timer || remaining <= 0) return;
    startedAt = Date.now();
    timer = setTimeout(() => dismiss(el), remaining);
  }

  if (opts.action) {
    el.appendChild(h('button.toast-action', {
      type: 'button',
      onclick: () => {
        stopTimer();
        dismiss(el);
        opts.action.onClick();
      },
    }, opts.action.label));
  }

  el.appendChild(h('button.btn-icon', {
    type: 'button',
    'aria-label': 'סגירה',
    style: { width: '26px', height: '26px' },
    onclick: () => { stopTimer(); dismiss(el); },
  }, icon('x', { size: 14 })));

  el.addEventListener('mouseenter', stopTimer);
  el.addEventListener('mouseleave', startTimer);
  el.addEventListener('focusin', stopTimer);
  el.addEventListener('focusout', startTimer);

  startTimer();
  return el;
}

export function toast(text, opts) {
  const o = opts || {};
  const el = build(Object.assign({ text }, o));
  const parent = ensureHost();
  parent.appendChild(el);
  /* Three at a time. A planner that reports every change individually would
   * otherwise stack a column taller than the phone. */
  const all = Array.from(parent.children);
  if (all.length > 3) dismiss(all[0]);
  announce(text);
  return () => dismiss(el);
}

export function toastOk(text, opts) {
  return toast(text, Object.assign({ tone: 'ok' }, opts));
}

export function toastError(text, opts) {
  return toast(text, Object.assign({ tone: 'risk' }, opts));
}

/**
 * Confirm an action that has already happened, with a way back.
 * `onUndo` must fully reverse it — the caller captured whatever state it needs
 * before acting, because by the time this runs the change is on disk.
 */
export function toastUndo(text, onUndo, undoLabel) {
  return toast(text, {
    action: { label: undoLabel || 'ביטול', onClick: onUndo },
    duration: UNDO_MS,
  });
}

export function clearToasts() {
  if (host) clear(host);
}
