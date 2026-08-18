/**
 * Small DOM helpers shared by both pages.
 *
 * Everything a customer types reaches the page through `el()` or `.textContent`
 * and never through innerHTML, so a name containing angle brackets stays a name.
 * The Content-Security-Policy on both pages would stop an injected script from
 * running anyway; this is the layer that stops it from being written at all.
 */

export const qs = (sel, root = document) => root.querySelector(sel)
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel))

/**
 * Builds an element. `props` sets properties (className, textContent, value…),
 * except keys starting with 'data-' or 'aria-', which become attributes, and
 * keys starting with 'on', which become listeners.
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value)
    } else if (key.startsWith('data-') || key.startsWith('aria-') || key === 'role') {
      node.setAttribute(key, value)
    } else {
      node[key] = value
    }
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

export function clear(node) {
  while (node.firstChild) node.firstChild.remove()
}

/** Replaces a node's contents in one go. */
export function render(node, children) {
  clear(node)
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

/* -------------------------------------------------------------------- icons */

const ICON_PATHS = {
  scissors: 'M6 3l12 12M6 21L18 9M8 6.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM8 17.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  phone: 'M5 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L15 13l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 3 5.2 2 2 0 0 1 5 3z',
  pin: 'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  check: 'M4 12.5l5 5L20 6.5',
  close: 'M6 6l12 12M18 6L6 18',
  arrow: 'M15 5l-7 7 7 7',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z',
  search: 'M20 20l-4.2-4.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z',
  whatsapp: 'M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2zm5 13.6c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-3-.8s-3.3-3-3.4-3.2c-.1-.2-.9-1.2-.9-2.3s.6-1.6.8-1.8c.2-.2.4-.3.6-.3h.4c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.5l-.4.5c-.1.1-.3.3-.1.6.1.3.6 1.1 1.3 1.7.9.8 1.6 1 1.9 1.2.2.1.4 0 .5-.1l.7-.8c.2-.2.3-.2.5-.1l1.6.8c.2.1.4.2.4.3v.5z',
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM17.5 6a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z',
  download: 'M12 3v12m0 0l-4-4m4 4l4-4M4 19h16',
  upload: 'M12 21V9m0 0L8 13m4-4l4 4M4 5h16',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13',
  plus: 'M12 5v14M5 12h14',
  logout: 'M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h9',
  wallet: 'M3 7a2 2 0 0 1 2-2h11v2M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H3M17 13.5h.01',
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** An inline SVG icon. Built node by node — no innerHTML, no sprite fetch. */
export function icon(name, { size = 20, className = 'icon' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', size)
  svg.setAttribute('height', size)
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.7')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('class', className)

  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', ICON_PATHS[name] ?? '')
  if (name === 'whatsapp' || name === 'instagram') {
    path.setAttribute('fill', 'currentColor')
    path.setAttribute('stroke', 'none')
  }
  svg.append(path)
  return svg
}

/* ------------------------------------------------------------------- phones */

/** Digits only, with a +972 / 00972 prefix folded back to a leading 0. */
export function normalizePhone(input) {
  let digits = String(input ?? '').replace(/[^\d+]/g, '')
  digits = digits.replace(/^\+?972/, '0').replace(/^00972/, '0')
  return digits.replace(/\D/g, '')
}

/** Israeli mobile (05X) or landline (0X). */
export function isValidPhone(input) {
  const p = normalizePhone(input)
  return /^05\d{8}$/.test(p) || /^0[23489]\d{7}$/.test(p)
}

/** '0501234567' → '050-123-4567' */
export function formatPhone(input) {
  const p = normalizePhone(input)
  if (/^05\d{8}$/.test(p)) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`
  if (/^0[23489]\d{7}$/.test(p)) return `${p.slice(0, 2)}-${p.slice(2, 5)}-${p.slice(5)}`
  return String(input ?? '')
}

/** '0501234567' → '972501234567', the form wa.me expects. */
export function toE164Digits(input) {
  const p = normalizePhone(input)
  return p.startsWith('0') ? `972${p.slice(1)}` : p
}

/* ------------------------------------------------------------------ counting
 * Hebrew does not say "1 תורים". Every count printed in the UI goes through
 * here so the singular reads like something a person would write. */

export function plural(count, one, many) {
  return count === 1 ? one : `${count} ${many}`
}

/* ------------------------------------------------------------------- toast */

let toastTimer = null

/** A brief status message, announced to screen readers as well as shown. */
export function toast(message, { tone = 'info' } = {}) {
  let host = qs('#toast')
  if (!host) {
    host = el('div', { id: 'toast', className: 'toast', role: 'status', 'aria-live': 'polite' })
    document.body.append(host)
  }
  host.className = `toast toast--${tone} is-visible`
  host.textContent = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => host.classList.remove('is-visible'), 4000)
}

/* --------------------------------------------------------------- focus trap */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Keeps Tab inside `container` until the returned function is called, and
 * restores focus to wherever it was. Used by the lightbox and the admin dialogs.
 */
export function trapFocus(container, onEscape) {
  const previous = document.activeElement

  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onEscape?.()
      return
    }
    if (e.key !== 'Tab') return
    const items = qsa(FOCUSABLE, container).filter((n) => n.offsetParent !== null)
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  document.addEventListener('keydown', onKeydown)
  return () => {
    document.removeEventListener('keydown', onKeydown)
    if (previous instanceof HTMLElement) previous.focus()
  }
}

/* ------------------------------------------------------------------ reveals */

/** Fades sections in as they scroll into view, unless the visitor opted out. */
export function observeReveals(root = document) {
  const targets = qsa('[data-reveal]', root)
  if (!targets.length) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    targets.forEach((t) => t.classList.add('is-revealed'))
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-revealed')
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
  )
  targets.forEach((t) => observer.observe(t))
}

/* ------------------------------------------------------------------ downloads
 * The `download` attribute makes this a save, not a navigation, so the strict
 * Content-Security-Policy on both pages does not need loosening for it. The URL
 * is revoked on the next tick, once the browser has taken the bytes. */

export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const link = el('a', { href: url, download: filename, hidden: true })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
