/**
 * The lock on the admin page.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ READ THIS BEFORE TRUSTING IT WITH ANYTHING.                              │
 * │                                                                          │
 * │ This is a static site. There is no server, so this check runs on the      │
 * │ visitor's own machine, and anything that runs there can be changed there. │
 * │ What the code below does and does not buy you:                           │
 * │                                                                          │
 * │  ✓ The password is NOT in this repository. Only a PBKDF2-SHA256 digest    │
 * │    of it is, salted and stretched over 310,000 iterations, so reading the │
 * │    source does not reveal it and guessing it offline is expensive.        │
 * │  ✓ Someone who opens the page without the password sees the lock screen   │
 * │    and nothing else.                                                      │
 * │  ✗ Someone who opens developer tools can step past the check entirely.    │
 * │    No amount of client-side code can prevent that.                        │
 * │  ✗ The bookings themselves are not encrypted — they sit in this browser's │
 * │    localStorage, readable by anyone with the device unlocked.             │
 * │                                                                          │
 * │ In short: this keeps a curious customer out of Ron's diary. It does not   │
 * │ withstand an attacker. Real protection needs the check to happen on a     │
 * │ server — see the README for what that would take.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/* Generated once with Node's crypto.pbkdf2 and pasted here. To change the
 * password, run tools/set-password.mjs and replace these three values. */
const SALT_HEX = 'd36290056ac53f1defbe955ff0206db7'
const HASH_HEX = '5f5d80bf7bca373a977a62a2e8b01c6e7f5cef25c1610c75bfd0440214fdf662'
const ITERATIONS = 310000

const SESSION_KEY = 'rmb.v1.admin-session'
const SESSION_HOURS = 8

const ATTEMPTS_KEY = 'rmb.v1.admin-attempts'
const MAX_ATTEMPTS = 5
const COOLDOWN_MS = 60_000

/* ------------------------------------------------------------------- hashing */

const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16)))

async function derive(password) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(SALT_HEX), iterations: ITERATIONS },
    key,
    256,
  )
  return new Uint8Array(bits)
}

/** Compares every byte regardless of where the first mismatch is. */
function equalBytes(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/* ------------------------------------------------------------------ attempts */

function readAttempts() {
  try {
    return JSON.parse(sessionStorage.getItem(ATTEMPTS_KEY) ?? '') ?? { count: 0, until: 0 }
  } catch {
    return { count: 0, until: 0 }
  }
}

function writeAttempts(value) {
  try {
    sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(value))
  } catch {
    /* storage disabled — the throttle is a courtesy, not a control */
  }
}

/** Milliseconds left on the cooldown, or 0. */
export function cooldownLeft() {
  return Math.max(0, readAttempts().until - Date.now())
}

/* -------------------------------------------------------------------- session */

/** true while a successful unlock is still within its window. */
export function isUnlocked() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return false
    const { expiresAt } = JSON.parse(raw)
    if (typeof expiresAt !== 'number' || Date.now() > expiresAt) {
      sessionStorage.removeItem(SESSION_KEY)
      return false
    }
    return true
  } catch {
    return false
  }
}

function startSession() {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ expiresAt: Date.now() + SESSION_HOURS * 3600_000 }),
    )
  } catch {
    /* nothing to do: the page stays unlocked for this view only */
  }
}

export function lock() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export const sessionHours = SESSION_HOURS

/* ---------------------------------------------------------------------- verify */

/**
 * Checks a password and, on success, opens the session.
 * Returns { ok } or { ok: false, reason, waitMs?, left? }.
 */
export async function unlock(password) {
  const waitMs = cooldownLeft()
  if (waitMs > 0) return { ok: false, reason: 'cooldown', waitMs }

  if (!globalThis.crypto?.subtle) {
    // Web Crypto needs a secure context: https, or localhost during development.
    return { ok: false, reason: 'insecure-context' }
  }

  const ok = equalBytes(await derive(String(password ?? '')), hexToBytes(HASH_HEX))

  if (ok) {
    writeAttempts({ count: 0, until: 0 })
    startSession()
    return { ok: true }
  }

  const attempts = readAttempts()
  const count = attempts.count + 1
  const until = count >= MAX_ATTEMPTS ? Date.now() + COOLDOWN_MS : 0
  writeAttempts({ count: until ? 0 : count, until })

  return until
    ? { ok: false, reason: 'cooldown', waitMs: COOLDOWN_MS }
    : { ok: false, reason: 'wrong', left: MAX_ATTEMPTS - count }
}
