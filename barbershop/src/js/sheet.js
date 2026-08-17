/**
 * The one modal the admin page uses, for adding a booking and for confirming
 * anything destructive. Focus is trapped while it is open and returned to
 * whatever opened it on close.
 */

import { el, render, icon, qs, trapFocus } from './ui.js'

let release = null

/**
 * Opens the sheet. `build(close)` returns the body; `actions(close)` returns the
 * buttons along the bottom. Returns the close function.
 */
export function openSheet({ title, build, actions }) {
  const sheet = qs('#sheet')
  const card = qs('#sheetCard')

  const close = () => {
    sheet.hidden = true
    document.body.style.overflow = ''
    release?.()
    release = null
  }

  render(card, [
    el('div', { className: 'sheet__head' }, [
      el('h2', { className: 'sheet__title', id: 'sheetTitle', textContent: title }),
      el('button', {
        type: 'button',
        className: 'icon-btn',
        'aria-label': 'סגירה',
        onclick: close,
      }, icon('close', { size: 20 })),
    ]),
    build(close),
    actions ? el('div', { className: 'sheet__actions' }, actions(close)) : null,
  ])

  sheet.hidden = false
  document.body.style.overflow = 'hidden'
  release = trapFocus(sheet, close)

  sheet.onclick = (e) => {
    if (e.target === sheet) close()
  }

  // Land focus on the first thing worth typing in, not on the close button.
  const first = card.querySelector('input, select, textarea')
  ;(first ?? card.querySelector('button')).focus()

  return close
}

/** A yes/no sheet. Calls `onConfirm` only if the barber says yes. */
export function confirmSheet({ title, message, confirmLabel = 'כן, למחוק', onConfirm }) {
  openSheet({
    title,
    build: () => el('p', { className: 'field__hint', textContent: message }),
    actions: (close) => [
      el('button', { type: 'button', className: 'btn btn--ghost', textContent: 'ביטול', onclick: close }),
      el('button', {
        type: 'button',
        className: 'btn btn--danger',
        textContent: confirmLabel,
        onclick: () => {
          close()
          onConfirm()
        },
      }),
    ],
  })
}
