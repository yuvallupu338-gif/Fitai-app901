/**
 * Dates, opening hours, and the one question the whole booking flow turns on:
 * which start times are still free for a service of a given length.
 *
 * Dates are handled as 'YYYY-MM-DD' strings and times as minutes past midnight,
 * both in the visitor's own timezone. Nothing here ever builds a Date from a
 * bare 'YYYY-MM-DD' string, because that parses as UTC and slides the day by
 * one in half the world.
 */

import { HOURS, BOOKING } from './config.js'
import { DAY_NAMES, MONTH_NAMES } from './config.js'

/* ------------------------------------------------------------------- date ids */

const pad = (n) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' for a Date, in local time. */
export function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A Date at local midnight of 'YYYY-MM-DD'. */
export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO() {
  return toISO(new Date())
}

export function addDays(iso, days) {
  const d = fromISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

/** true when `iso` looks like a real calendar date. */
export function isValidISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  return toISO(fromISO(iso)) === iso
}

/* ------------------------------------------------------------------- clock */

/** '14:30' → 870 */
export function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '')
  if (!m) return NaN
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return NaN
  return h * 60 + min
}

/** 870 → '14:30' */
export function toHHMM(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/* --------------------------------------------------------- opening hours */

/** The day's open windows as {from, to} in minutes. Empty means closed. */
export function windowsFor(iso) {
  if (BOOKING.closedDates.includes(iso)) return []
  const day = fromISO(iso).getDay()
  return (HOURS[day] ?? [])
    .map((w) => ({ from: minutesOf(w.from), to: minutesOf(w.to) }))
    .filter((w) => Number.isFinite(w.from) && Number.isFinite(w.to) && w.to > w.from)
}

export function isClosed(iso) {
  return windowsFor(iso).length === 0
}

/** The day's opening hours as one readable line, e.g. '09:00–14:00, 15:00–20:00'. */
export function hoursLabel(iso) {
  const windows = windowsFor(iso)
  if (!windows.length) return 'סגור'
  return windows.map((w) => `${toHHMM(w.from)}–${toHHMM(w.to)}`).join(', ')
}

/* ------------------------------------------------------------ availability */

/** Minutes past midnight that a booking or block occupies, as [start, end). */
function span(item) {
  if (item.time && item.durationMin != null) {
    const start = minutesOf(item.time)
    return [start, start + item.durationMin]
  }
  return [minutesOf(item.from), minutesOf(item.to)]
}

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd

/**
 * Start times still free on `iso` for a service lasting `durationMin`.
 *
 * A start time survives when the whole appointment fits inside one open window,
 * clears the lead time if the day is today, and overlaps neither an existing
 * live booking nor a block the barber set.
 */
export function availableSlots(iso, durationMin, bookings = [], blocks = []) {
  const windows = windowsFor(iso)
  if (!windows.length || !(durationMin > 0)) return []

  const taken = bookings
    .filter((b) => b.date === iso && b.status !== 'cancelled')
    .map(span)
  const blocked = blocks.filter((b) => b.date === iso).map(span)
  const busy = [...taken, ...blocked].filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e))

  const now = new Date()
  const earliest =
    iso === toISO(now) ? now.getHours() * 60 + now.getMinutes() + BOOKING.leadTimeMin : -Infinity

  const step = BOOKING.slotStepMin
  const slots = []
  for (const w of windows) {
    // Start on the grid, so a window opening at 08:30 still offers 08:30.
    for (let start = w.from; start + durationMin <= w.to; start += step) {
      if (start < earliest) continue
      if (busy.some(([s, e]) => overlaps(start, start + durationMin, s, e))) continue
      slots.push(toHHMM(start))
    }
  }
  return slots
}

/** The next `count` bookable dates from today, closed days included and flagged. */
export function upcomingDays(count = BOOKING.horizonDays) {
  const start = todayISO()
  return Array.from({ length: count }, (_, i) => {
    const iso = addDays(start, i)
    return { iso, date: fromISO(iso), closed: isClosed(iso) }
  })
}

/* -------------------------------------------------------------- formatting */

/** 'יום ראשון, 17 באוגוסט' */
export function formatDateHe(iso, { withYear = false } = {}) {
  const d = fromISO(iso)
  const base = `יום ${DAY_NAMES[d.getDay()]}, ${d.getDate()} ב${MONTH_NAMES[d.getMonth()]}`
  return withYear ? `${base} ${d.getFullYear()}` : base
}

/** 'היום' / 'מחר' / 'יום שלישי' — for a compact chip. */
export function relativeDayHe(iso) {
  const today = todayISO()
  if (iso === today) return 'היום'
  if (iso === addDays(today, 1)) return 'מחר'
  return `יום ${DAY_NAMES[fromISO(iso).getDay()]}`
}
