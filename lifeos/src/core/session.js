/*
 * session.js — accounts, sign-in, and the one place a user id comes from.
 *
 * WHAT THIS BUYS, AND WHAT IT HONESTLY DOES NOT.
 *
 * The specification asks for server-side authorization and for a user id that
 * is never trusted from the client. Half of that is achievable here and half
 * is not, and it is worth being exact about which half.
 *
 * Achievable, and implemented: every read and write in this app resolves its
 * owner through currentUserId() below, and db.js refuses any operation whose
 * record does not belong to that id. No service function accepts a userId
 * argument, so there is no parameter for a caller to lie in. Two accounts on
 * one browser cannot see each other's data through the app's API, and the
 * ownership check is a real check with real tests behind it.
 *
 * Not achievable, and not claimed: this is a static site with no server. The
 * data lives in localStorage, so anyone with the device and a devtools console
 * can read all of it regardless of who is signed in. A password here separates
 * profiles; it does not protect them. The sign-in screen says so in Hebrew and
 * the README says so at length, because the difference decides what a person
 * should be willing to type into a note.
 *
 * The password is still hashed rather than stored, and still salted and
 * stretched, for the reason that always applies: people reuse passwords, and a
 * plaintext one sitting in localStorage is a gift to anything that manages to
 * read the origin. PBKDF2-SHA256 at 210,000 iterations is the current OWASP
 * floor and costs a fifth of a second on a phone, which is affordable once per
 * sign-in.
 */

import * as store from './store.js';
import { emit, EV } from './bus.js';

const ITERATIONS = 210000;
const KEY_BITS = 256;

/* ------------------------------------------------------------------ *
 * Hashing
 * ------------------------------------------------------------------ */

function subtle() {
  return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
}

function toBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function randomBytes(n) {
  const out = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(out);
  else for (let i = 0; i < n; i += 1) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/*
 * The fallback, used only when WebCrypto is absent — which in practice means
 * the single-file build opened straight off a disk in a browser that does not
 * treat file:// as a secure context.
 *
 * It is a stretched FNV-style mix, and it is genuinely weaker than PBKDF2: it
 * is not memory-hard and a GPU would chew through it. It is here so the app
 * opens at all in that situation rather than refusing to sign anyone in, and
 * the record stores which algorithm produced it so a later sign-in on a proper
 * origin can tell the two apart instead of silently comparing across them.
 */
function weakDerive(password, salt) {
  const text = `${salt}::${password}`;
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let round = 0; round < 20000; round += 1) {
    for (let i = 0; i < text.length; i += 1) {
      a ^= text.charCodeAt(i) + round;
      a = Math.imul(a, 0x01000193) >>> 0;
      b = (b + Math.imul(a ^ b, 0x85ebca6b)) >>> 0;
    }
  }
  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    out[i] = (a >>> (i % 4) * 8) & 0xff;
    out[i + 8] = (b >>> (i % 4) * 8) & 0xff;
  }
  return toBase64(out);
}

async function derive(password, saltB64, algo) {
  if (algo === 'weak' || !subtle()) {
    return { hash: weakDerive(password, saltB64), algo: 'weak' };
  }
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    key,
    KEY_BITS,
  );
  return { hash: toBase64(new Uint8Array(bits)), algo: 'pbkdf2-sha256' };
}

/* Constant-time-ish comparison. The threat model here does not include timing
 * attacks — the attacker who can time this can also just read the hash — but
 * writing the loop correctly costs nothing and stops the habit from leaking
 * into code where it matters. */
function equalStrings(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i += 1) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

/* ------------------------------------------------------------------ *
 * Account records
 * ------------------------------------------------------------------ */

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function listAccounts() {
  return store.readAccounts().map((a) => ({
    id: a.id,
    email: a.email,
    displayName: a.displayName,
    createdAt: a.createdAt,
    isDemo: !!a.isDemo,
  }));
}

export function accountExists(email) {
  const target = normaliseEmail(email);
  return store.readAccounts().some((a) => a.email === target);
}

function newId() {
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const AUTH_ERRORS = {
  EMAIL_TAKEN: 'email_taken',
  EMAIL_INVALID: 'email_invalid',
  NAME_REQUIRED: 'name_required',
  PASSWORD_SHORT: 'password_short',
  BAD_CREDENTIALS: 'bad_credentials',
};

export function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normaliseEmail(email));
}

/**
 * Create an account and sign it in.
 * Throws a string from AUTH_ERRORS so the caller maps to a Hebrew message.
 */
export async function signUp(opts) {
  const email = normaliseEmail(opts.email);
  const displayName = String(opts.displayName || '').trim();
  const password = String(opts.password || '');

  if (!displayName) throw new Error(AUTH_ERRORS.NAME_REQUIRED);
  if (!looksLikeEmail(email)) throw new Error(AUTH_ERRORS.EMAIL_INVALID);
  if (password.length < 8) throw new Error(AUTH_ERRORS.PASSWORD_SHORT);
  if (accountExists(email)) throw new Error(AUTH_ERRORS.EMAIL_TAKEN);

  const saltB64 = toBase64(randomBytes(16));
  const { hash, algo } = await derive(password, saltB64);

  const account = {
    id: newId(),
    email,
    displayName,
    salt: saltB64,
    hash,
    algo,
    iterations: algo === 'weak' ? 0 : ITERATIONS,
    createdAt: Date.now(),
    isDemo: !!opts.isDemo,
  };

  const accounts = store.readAccounts();
  accounts.push(account);
  store.writeAccounts(accounts);

  setActive(account.id);
  return publicAccount(account);
}

export async function signIn(email, password) {
  const target = normaliseEmail(email);
  const account = store.readAccounts().find((a) => a.email === target);

  /* The password is derived even when no account matched, so that a wrong
   * address and a wrong password take the same length of time and return the
   * same message. */
  const { hash } = await derive(
    String(password || ''),
    account ? account.salt : toBase64(randomBytes(16)),
    account ? account.algo : undefined,
  );

  if (!account || !equalStrings(hash, account.hash)) {
    throw new Error(AUTH_ERRORS.BAD_CREDENTIALS);
  }

  setActive(account.id);
  return publicAccount(account);
}

/** Sign in to a device-local account without a password. Demo accounts only. */
export function signInDemo(userId) {
  const account = store.readAccounts().find((a) => a.id === userId && a.isDemo);
  if (!account) throw new Error(AUTH_ERRORS.BAD_CREDENTIALS);
  setActive(account.id);
  return publicAccount(account);
}

export function signOut() {
  store.writeSession(null);
  active = null;
  emit(EV.SESSION_CHANGED, null);
}

function publicAccount(a) {
  return { id: a.id, email: a.email, displayName: a.displayName, createdAt: a.createdAt, isDemo: !!a.isDemo };
}

/* ------------------------------------------------------------------ *
 * The active session
 * ------------------------------------------------------------------ */

let active = null;

function setActive(userId) {
  store.writeSession({ userId, since: Date.now() });
  active = userId;
  emit(EV.SESSION_CHANGED, currentUser());
}

/** Read the stored pointer once at boot; after that it is in memory. */
export function restore() {
  const s = store.readSession();
  if (!s) { active = null; return null; }
  const account = store.readAccounts().find((a) => a.id === s.userId);
  if (!account) {
    /* Pointer to an account that no longer exists — deleted in another tab, or
     * a half-cleared storage. Drop it rather than run authenticated as nobody. */
    store.writeSession(null);
    active = null;
    return null;
  }
  active = account.id;
  return publicAccount(account);
}

/**
 * THE ONLY SOURCE OF A USER ID IN THIS APPLICATION.
 *
 * Services do not take a userId parameter. This is what makes "never trust the
 * client's user id" a structural property rather than a rule people remember.
 */
export function currentUserId() {
  return active;
}

export function currentUser() {
  if (!active) return null;
  const account = store.readAccounts().find((a) => a.id === active);
  return account ? publicAccount(account) : null;
}

export function isSignedIn() {
  return !!active;
}

export function requireUserId() {
  if (!active) throw new Error('not_signed_in');
  return active;
}

/* ------------------------------------------------------------------ *
 * Account maintenance
 * ------------------------------------------------------------------ */

export function renameAccount(displayName) {
  const id = requireUserId();
  const accounts = store.readAccounts();
  const account = accounts.find((a) => a.id === id);
  if (!account) return null;
  account.displayName = String(displayName || '').trim() || account.displayName;
  store.writeAccounts(accounts);
  emit(EV.SESSION_CHANGED, publicAccount(account));
  return publicAccount(account);
}

export function deleteCurrentAccount() {
  const id = requireUserId();
  store.dropData(id);
  store.writeAccounts(store.readAccounts().filter((a) => a.id !== id));
  signOut();
}
