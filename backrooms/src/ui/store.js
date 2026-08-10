/*
 * store.js — settings and progress, on the device only.
 *
 * Nothing here is sent anywhere. Progress is the set of level numbers that
 * have been stood in, plus the deepest one reached, which is the only score
 * this game has.
 */

const KEY = 'backrooms.v1';

const DEFAULTS = {
  settings: {
    sensitivity: 1,
    renderScale: 1,
    textureSize: 256,
    shadowLights: 2,
    bloom: true,
    vhs: false,
    invertY: false,
    muted: false,
    entities: true,
  },
  visited: [],
  deepest: 0,
  current: null,
};

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    cache = {
      settings: Object.assign({}, DEFAULTS.settings, parsed.settings || {}),
      visited: Array.isArray(parsed.visited) ? parsed.visited : [],
      deepest: parsed.deepest || 0,
      current: typeof parsed.current === 'number' ? parsed.current : null,
    };
  } catch {
    /* Private browsing, a full quota, a corrupted entry — all the same
     * outcome: play with defaults rather than refuse to start. */
    cache = JSON.parse(JSON.stringify(DEFAULTS));
  }
  return cache;
}

export function save() {
  if (!cache) return;
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* ignore */ }
}

export function settings() { return load().settings; }

export function visit(id) {
  const s = load();
  if (!s.visited.includes(id)) s.visited.push(id);
  if (id > s.deepest) s.deepest = id;
  s.current = id;
  save();
}

export function reset() {
  cache = JSON.parse(JSON.stringify(DEFAULTS));
  save();
}
