/**
 * The only place in the app that knows where bookings are kept.
 *
 * Today that is this browser's localStorage, which means a booking made on a
 * customer's phone lives on that phone and nowhere else — see the "מה המערכת
 * הזאת כן ולא עושה" section of the README. Every read and write in the rest of
 * the app goes through the functions below, so moving to a real backend is a
 * matter of reimplementing this file against fetch() and keeping the signatures.
 */

import { minutesOf } from './schedule.js'

const KEYS = {
  bookings: 'rmb.v1.bookings',
  blocks: 'rmb.v1.blocks',
}

export const STATUSES = ['pending', 'confirmed', 'done', 'cancelled']

export const STATUS_LABEL = {
  pending: 'ממתין לאישור',
  confirmed: 'מאושר',
  done: 'בוצע',
  cancelled: 'בוטל',
}

/* ------------------------------------------------------------------ backing */

/**
 * Safari in private mode, and any browser with storage blocked, throws on
 * localStorage access rather than returning null. Fall back to memory so the
 * booking flow still completes — `storageIsPersistent` lets the UI say so.
 */
function probeStorage() {
  try {
    const probe = '__rmb_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

const real = probeStorage()
const memory = new Map()

export const storageIsPersistent = real !== null

const backing = real ?? {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, v),
  removeItem: (k) => memory.delete(k),
}

function readList(key) {
  try {
    const parsed = JSON.parse(backing.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Corrupt or hand-edited JSON: start clean rather than break every page.
    return []
  }
}

function writeList(key, list) {
  backing.setItem(key, JSON.stringify(list))
  notify()
}

/* ------------------------------------------------------------- subscriptions */

const listeners = new Set()

function notify() {
  for (const fn of listeners) fn()
}

/** Calls `fn` after any change here, and after a change in another tab. */
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.bookings || e.key === KEYS.blocks) notify()
  })
}

/* -------------------------------------------------------------------- ids */

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/* --------------------------------------------------------------- bookings */

/** All bookings, oldest appointment first. */
export function listBookings() {
  return readList(KEYS.bookings).sort(
    (a, b) => a.date.localeCompare(b.date) || minutesOf(a.time) - minutesOf(b.time),
  )
}

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd

/**
 * Whether [time, time+durationMin) on `date` is clear of live bookings and blocks.
 * `ignoreId` lets a booking be moved without colliding with its own old slot.
 *
 * The booking form filters the times it offers, but two people can pick the same
 * slot in two tabs; this is the check that runs at write time.
 */
export function isSlotFree(date, time, durationMin, { ignoreId = null } = {}) {
  const start = minutesOf(time)
  if (!Number.isFinite(start) || !(durationMin > 0)) return false
  const end = start + durationMin

  const busyBookings = listBookings().filter(
    (b) => b.date === date && b.status !== 'cancelled' && b.id !== ignoreId,
  )
  if (busyBookings.some((b) => overlaps(start, end, minutesOf(b.time), minutesOf(b.time) + b.durationMin))) {
    return false
  }

  return !listBlocks()
    .filter((b) => b.date === date)
    .some((b) => overlaps(start, end, minutesOf(b.from), minutesOf(b.to)))
}

/**
 * Stores a booking and returns it. Throws when the slot was taken in the
 * meantime, so the caller can send the customer back to pick another time.
 */
export function addBooking(data) {
  const booking = {
    id: newId(),
    createdAt: new Date().toISOString(),
    name: String(data.name ?? '').trim(),
    phone: String(data.phone ?? '').trim(),
    serviceId: data.serviceId,
    date: data.date,
    time: data.time,
    durationMin: Number(data.durationMin),
    price: Number(data.price) || 0,
    notes: String(data.notes ?? '').trim(),
    status: STATUSES.includes(data.status) ? data.status : 'pending',
    source: data.source === 'admin' ? 'admin' : 'web',
  }

  if (!isSlotFree(booking.date, booking.time, booking.durationMin)) {
    throw new Error('SLOT_TAKEN')
  }

  writeList(KEYS.bookings, [...readList(KEYS.bookings), booking])
  return booking
}

/** Merges `patch` into one booking. Returns the updated record, or null. */
export function updateBooking(id, patch) {
  const list = readList(KEYS.bookings)
  const i = list.findIndex((b) => b.id === id)
  if (i === -1) return null
  const next = { ...list[i], ...patch, id: list[i].id }
  list[i] = next
  writeList(KEYS.bookings, list)
  return next
}

export function removeBooking(id) {
  writeList(
    KEYS.bookings,
    readList(KEYS.bookings).filter((b) => b.id !== id),
  )
}

/* ----------------------------------------------------------------- blocks */

/** Times the barber has taken off the board: a holiday, a break, an errand. */
export function listBlocks() {
  return readList(KEYS.blocks).sort(
    (a, b) => a.date.localeCompare(b.date) || minutesOf(a.from) - minutesOf(b.from),
  )
}

export function addBlock({ date, from = '00:00', to = '23:59', reason = '', groupId = null }) {
  const block = { id: newId(), date, from, to, reason: String(reason).trim(), groupId }
  writeList(KEYS.blocks, [...readList(KEYS.blocks), block])
  return block
}

/**
 * Blocks the same window on many dates at once, tagged with one groupId — this
 * is what "every Monday for the next three weeks" turns into. The group is what
 * the admin list shows and what a single "remove" button undoes.
 */
export function addBlockGroup({ dates, from = '00:00', to = '23:59', reason = '', repeat = null }) {
  const groupId = newId()
  const existing = readList(KEYS.blocks)
  const added = dates.map((date) => ({
    id: newId(),
    date,
    from,
    to,
    reason: String(reason).trim(),
    groupId,
    repeat, // e.g. { weekday: 1, weeks: 3 } — kept so the list can describe itself
  }))
  writeList(KEYS.blocks, [...existing, ...added])
  return { groupId, count: added.length }
}

export function removeBlock(id) {
  writeList(
    KEYS.blocks,
    readList(KEYS.blocks).filter((b) => b.id !== id),
  )
}

export function removeBlockGroup(groupId) {
  writeList(
    KEYS.blocks,
    readList(KEYS.blocks).filter((b) => b.groupId !== groupId),
  )
}

/**
 * Blocks folded into the rows the admin page lists: one row per recurring group,
 * one row per stand-alone block. Past-only groups are dropped, so the list stays
 * about what is still coming.
 */
export function listBlockRows(fromDate) {
  const live = listBlocks().filter((b) => !fromDate || b.date >= fromDate)
  const groups = new Map()
  const rows = []

  for (const block of live) {
    if (!block.groupId) {
      rows.push({ kind: 'single', id: block.id, ...block })
      continue
    }
    const row = groups.get(block.groupId)
    if (row) {
      row.dates.push(block.date)
    } else {
      const created = {
        kind: 'group',
        id: block.groupId,
        groupId: block.groupId,
        from: block.from,
        to: block.to,
        reason: block.reason,
        repeat: block.repeat,
        dates: [block.date],
      }
      groups.set(block.groupId, created)
      rows.push(created)
    }
  }

  return rows.sort((a, b) => {
    const aFirst = a.kind === 'group' ? a.dates[0] : a.date
    const bFirst = b.kind === 'group' ? b.dates[0] : b.date
    return aFirst.localeCompare(bFirst)
  })
}

/* ------------------------------------------------------------ export/import */

/** The whole dataset, for the admin page's backup button. */
export function exportAll() {
  return {
    format: 'ron-malka-barbershop',
    version: 1,
    exportedAt: new Date().toISOString(),
    bookings: listBookings(),
    blocks: listBlocks(),
  }
}

/**
 * Loads a previously exported file.
 *
 * `mode: 'merge'` keeps what is already here and adds records whose id is new —
 * the safe default, and what makes importing a colleague's export useful.
 * `mode: 'replace'` throws the current data away.
 */
export function importAll(payload, { mode = 'merge' } = {}) {
  if (!payload || payload.format !== 'ron-malka-barbershop') {
    throw new Error('BAD_FORMAT')
  }
  const incomingBookings = Array.isArray(payload.bookings) ? payload.bookings : []
  const incomingBlocks = Array.isArray(payload.blocks) ? payload.blocks : []

  const valid = (b) =>
    b && typeof b.id === 'string' && typeof b.date === 'string' && typeof b.time === 'string'

  if (mode === 'replace') {
    backing.setItem(KEYS.bookings, JSON.stringify(incomingBookings.filter(valid)))
    backing.setItem(KEYS.blocks, JSON.stringify(incomingBlocks.filter((b) => b && b.id && b.date)))
    notify()
    return { bookings: incomingBookings.length, blocks: incomingBlocks.length }
  }

  const bookings = readList(KEYS.bookings)
  const seenBookings = new Set(bookings.map((b) => b.id))
  const addedBookings = incomingBookings.filter((b) => valid(b) && !seenBookings.has(b.id))

  const blocks = readList(KEYS.blocks)
  const seenBlocks = new Set(blocks.map((b) => b.id))
  const addedBlocks = incomingBlocks.filter((b) => b?.id && b.date && !seenBlocks.has(b.id))

  backing.setItem(KEYS.bookings, JSON.stringify([...bookings, ...addedBookings]))
  backing.setItem(KEYS.blocks, JSON.stringify([...blocks, ...addedBlocks]))
  notify()
  return { bookings: addedBookings.length, blocks: addedBlocks.length }
}

/** Wipes both lists. The admin page asks twice before calling this. */
export function clearAll() {
  backing.removeItem(KEYS.bookings)
  backing.removeItem(KEYS.blocks)
  notify()
}
