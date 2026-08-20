/*
 * store.js — the save, on the device only.
 *
 * Nothing here is sent anywhere. What is worth keeping between sessions is
 * small: which night you are on, how many flags you have brought home, which
 * of the twelve objects you have read, and the seed — because the seed is the
 * neighbourhood. Two players with the same seed have the same street, the same
 * garage on the same side, the same gnomes; that is what makes it possible to
 * say "it is in the mailbox at number 9" and be right.
 */

const KEY = 'suburb.v1';

const DEFAULTS = {
  settings: {
    sensitivity: 1,
    renderScale: 1,
    textureSize: 256,
    shadows: 2,
    bloom: true,
    invertY: false,
    muted: false,
    guide: true,
    scares: true,
  },
  seed: 0,
  night: 1,
  flags: 0,
  found: [],
  cleared: [],      /* nights brought home, so the night list can tick them */
  ending: null,
  attempts: 0,
};

let cache = null;

/*
 * First-run quality, chosen from the device rather than from hope. A phone
 * rendering at its native pixel ratio with two shadow-casting lights is a
 * slideshow, and a player whose first thirty seconds run at twelve frames a
 * second does not stay long enough to find the settings screen.
 */
function deviceDefaults() {
  const coarse = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(pointer: coarse)').matches;
  const small = typeof window !== 'undefined'
    && Math.min(window.innerWidth, window.innerHeight) < 520;
  if (!coarse && !small) return {};
  return { renderScale: 0.7, textureSize: 128, shadows: 1 };
}

/* A neighbourhood per save. Generated once, from the clock, and then never
 * again — this is the only place in the game a real random number is used, and
 * it is used exactly once. */
function newSeed() {
  return ((Date.now() ^ (Math.random() * 0xffffffff)) | 0) >>> 0;
}

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    cache = {
      settings: Object.assign({}, DEFAULTS.settings,
        raw ? {} : deviceDefaults(), parsed.settings || {}),
      seed: parsed.seed || newSeed(),
      night: Math.min(7, Math.max(1, parsed.night || 1)),
      flags: parsed.flags || 0,
      found: Array.isArray(parsed.found) ? parsed.found : [],
      cleared: Array.isArray(parsed.cleared) ? parsed.cleared : [],
      ending: parsed.ending || null,
      attempts: parsed.attempts || 0,
    };
    if (!raw) save();
  } catch {
    /* Private browsing, a full quota, a corrupted entry — all the same
     * outcome: play with defaults rather than refuse to start. */
    cache = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), { seed: newSeed() });
  }
  return cache;
}

export function save() {
  if (!cache) return;
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* ignore */ }
}

export function settings() { return load().settings; }

export function clearNight(n) {
  const s = load();
  if (!s.cleared.includes(n)) {
    s.cleared.push(n);
    s.flags = s.cleared.length;
  }
  s.night = Math.min(7, Math.max(s.night, n + 1));
  save();
}

export function failNight() {
  const s = load();
  s.attempts++;
  save();
}

export function findObject(id) {
  const s = load();
  if (s.found.includes(id)) return false;
  s.found.push(id);
  save();
  return true;
}

export function setEnding(which) {
  const s = load();
  s.ending = which;
  save();
}

export function reset() {
  cache = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), { seed: newSeed() });
  save();
}
