/*
 * harness.mjs — the browser globals the app expects, in node.
 *
 * The engines are pure and need none of this. The services need storage and a
 * session, and stubbing those is what lets the interesting tests — user
 * isolation, the core loop end to end, ownership on every read — run in a
 * plain `node --test` with no browser and no DOM library.
 *
 * localStorage is a Map with the same throwing behaviour as the real thing
 * when a quota is exceeded, because store.js has a code path for that and an
 * untested fallback is a fallback that does not work.
 */

class MemoryStorage {
  constructor(limitBytes) {
    this.map = new Map();
    this.limit = limitBytes || Infinity;
  }

  get length() { return this.map.size; }

  key(i) { return Array.from(this.map.keys())[i] ?? null; }

  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }

  setItem(k, v) {
    const value = String(v);
    let total = value.length;
    for (const [key, existing] of this.map) {
      if (key !== k) total += key.length + existing.length;
    }
    if (total > this.limit) {
      const error = new Error('QuotaExceededError');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.map.set(k, value);
  }

  removeItem(k) { this.map.delete(k); }

  clear() { this.map.clear(); }
}

export function installBrowser(opts) {
  const o = opts || {};
  const storage = new MemoryStorage(o.limitBytes);

  globalThis.window = {
    localStorage: storage,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    location: { hash: '', pathname: '/', search: '' },
    history: { replaceState() {} },
    scrollTo() {},
  };
  globalThis.localStorage = storage;

  /* Node 22 has webcrypto on globalThis.crypto, which is what session.js wants
   * for PBKDF2. Asserting it rather than polyfilling: a node without it would
   * silently exercise the weak fallback and the test would be measuring the
   * wrong code. */
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('this node has no WebCrypto; the auth tests would test the fallback instead');
  }

  return storage;
}

export function resetBrowser() {
  if (globalThis.window && globalThis.window.localStorage) {
    globalThis.window.localStorage.clear();
  }
}

/** A fresh app, signed in, with the module caches cleared. */
export async function freshApp(opts) {
  const o = opts || {};
  installBrowser(o);

  const store = await import('../src/core/store.js');
  const session = await import('../src/core/session.js');
  const db = await import('../src/core/db.js');
  const core = await import('../src/services/core.js');

  store.dropEverything();
  db.unload();

  const user = await session.signUp({
    displayName: o.displayName || 'בודק',
    email: o.email || 'test@example.com',
    password: o.password || 'password123',
  });

  db.load();
  core.invalidate();

  return { user, store, session, db, core };
}

/** Sign in a second account on the same device, for the isolation tests. */
export async function addAccount(email, name) {
  const session = await import('../src/core/session.js');
  const db = await import('../src/core/db.js');
  const core = await import('../src/services/core.js');

  const user = await session.signUp({
    displayName: name || 'שני',
    email,
    password: 'password123',
  });
  db.unload();
  db.load();
  core.invalidate();
  return user;
}

export async function switchTo(email) {
  const session = await import('../src/core/session.js');
  const db = await import('../src/core/db.js');
  const core = await import('../src/services/core.js');

  const user = await session.signIn(email, 'password123');
  db.unload();
  db.load();
  core.invalidate();
  return user;
}

/* A fixed clock, so a test that says "today" means the same day whenever it
 * runs. Restores itself. */
export function freezeToday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  /* Noon UTC, which is inside the same civil day in Asia/Jerusalem whatever
   * the offset is — a midnight-based fake would land on the previous day for
   * half the year. */
  const fixed = Date.UTC(y, m - 1, d, 12, 0, 0);
  const realNow = Date.now;
  Date.now = () => fixed;
  return () => { Date.now = realNow; };
}

export { MemoryStorage };
