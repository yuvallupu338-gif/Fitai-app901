/*
 * adapter.js — where a document goes, and whether it actually gets there.
 *
 * The store talks to one of these and to nothing else, so replacing
 * localStorage with Supabase, Firebase or an API is a matter of writing a
 * fourth object with the same four methods and returning it from
 * pickAdapter(). Values are handed over as plain objects; serialising them is
 * the adapter's business, not the caller's.
 *
 * Nothing here touches the DOM at module level. The probe, the choice of
 * adapter and every read all happen on first use instead, because
 * tools/tomorrow-validate.mjs imports this file in Node where there is no
 * window and a top-level `window.localStorage` would throw before the first
 * test ran. In the browser, store.js calls pickAdapter() as it initialises,
 * which is still before the user has answered a single question — which is the
 * point.
 */

const PROBE_KEY = 'tomorrowai.probe';

/*
 * Whether this device is actually keeping anything.
 *
 * FitAI's store.js learned this one the hard way and left the note: its
 * write() had always returned false when localStorage refused — private
 * browsing, a full quota, file:// on some browsers — and every call site
 * ignored it. The app then behaved perfectly for a whole session while telling
 * the user, in four separate places, that their plan was saved on the device.
 * One reload and the questionnaire came back empty.
 *
 * Falling back to memory is right: the session still works, and refusing to
 * run would help nobody. Claiming it is saved is not. TomorrowAI has the same
 * exposure and worse — the evening ritual is ten minutes of the user's
 * attention and it happens at the end of a day, when they have the least
 * patience for doing it twice. So this flag records the truth, it is probed
 * before the first question rather than discovered at the first write, and it
 * flips the moment a real write throws.
 */
let works = true;
let probed = false;
let chosen = null;

/*
 * Reading `window.localStorage` is itself allowed to throw — Safari with
 * cookies blocked does exactly that — so the guard has to wrap the property
 * access and not just its result.
 */
function ref() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

/*
 * Asked once, by writing and removing a scratch key of its own. A key of its
 * own rather than the real one so that a probe can never disturb a stored
 * document, and a write rather than a feature check because the failures that
 * matter — quota, private mode — all pass a feature check and then throw on
 * the way in.
 */
function ensureProbed() {
  if (probed) return;
  probed = true;
  const ls = ref();
  if (!ls) {
    works = false;
    return;
  }
  try {
    ls.setItem(PROBE_KEY, '1');
    ls.removeItem(PROBE_KEY);
  } catch (e) {
    works = false;
  }
}

function revive(payload) {
  if (typeof payload !== 'string') return null;
  try {
    return JSON.parse(payload);
  } catch (e) {
    // Stored text that is not JSON is not recoverable here. Reporting it as
    // absent hands the decision to migrate(), which knows how to start fresh.
    return null;
  }
}

/*
 * The last value written this session, kept alongside localStorage.
 *
 * Without it, a write that hit quota leaves the next read returning whatever
 * was stored before the failure — so the app forgets what the user just typed
 * the moment anything re-reads the document, which looks like data loss while
 * they are still sitting in front of it. With it, the session stays coherent
 * and persists() is the only thing that says the truth about the reload.
 */
const shadow = new Map();

export const LocalStorageAdapter = {
  name: 'localStorage',

  available() {
    ensureProbed();
    return works;
  },

  read(key) {
    ensureProbed();
    if (shadow.has(key)) return revive(shadow.get(key));
    const ls = ref();
    if (!ls) return null;
    try {
      return revive(ls.getItem(key));
    } catch (e) {
      return null;
    }
  },

  write(key, value) {
    ensureProbed();
    let payload;
    try {
      payload = JSON.stringify(value);
    } catch (e) {
      /*
       * A value that will not serialise is a bug in the caller — a cycle, a
       * function on a plain object — not a device that has stopped keeping
       * things. Flipping `works` here would put a warning about private
       * browsing in front of a user whose browser is perfectly fine.
       */
      return false;
    }
    shadow.set(key, payload);
    const ls = ref();
    if (!ls) {
      works = false;
      return false;
    }
    try {
      ls.setItem(key, payload);
      return true;
    } catch (e) {
      works = false;
      return false;
    }
  },

  remove(key) {
    ensureProbed();
    shadow.delete(key);
    const ls = ref();
    if (!ls) return false;
    try {
      ls.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  },
};

const cells = new Map();

/*
 * The same four methods over a Map, for private browsing, for file://, for
 * Node, and for tests.
 *
 * It stores the serialised string rather than the object it was handed, which
 * is the whole reason it is a stand-in and not an alias. Keeping the reference
 * would let a later mutation of the app's state appear inside "storage" by
 * itself, so a bug that localStorage exposes on the next reload — a Date that
 * comes back as a string, a Map that comes back as {} — stays invisible in
 * exactly the mode where nobody is watching for it.
 */
export const MemoryAdapter = {
  name: 'memory',

  available() {
    return true;
  },

  read(key) {
    return revive(cells.get(key));
  },

  write(key, value) {
    let payload;
    try {
      payload = JSON.stringify(value);
    } catch (e) {
      return false;
    }
    cells.set(key, payload);
    return true;
  },

  remove(key) {
    cells.delete(key);
    return true;
  },
};

/*
 * Decided once and then held, because store.js keeps the reference it is given
 * and swapping the object underneath it mid-session would mean half a
 * document in one place and half in the other. A localStorage that starts
 * working and then fails keeps its adapter — the writes go nowhere, the shadow
 * keeps the session honest, and persists() reports it.
 */
export function pickAdapter() {
  if (!chosen) {
    ensureProbed();
    chosen = works ? LocalStorageAdapter : MemoryAdapter;
  }
  return chosen;
}

/** False when nothing typed into this app will survive a reload. */
export function persists() {
  return pickAdapter() === LocalStorageAdapter && works;
}
