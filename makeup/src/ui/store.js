/*
 * store.js — the save file.
 *
 * One key in localStorage, versioned. A save that cannot be parsed, or that
 * comes from a version this build does not understand, is discarded rather than
 * repaired: the whole save is a day number and a list of names, and a player
 * who loses it loses ten minutes, while a half-migrated one produces bugs that
 * look like the game is broken.
 */

const KEY = 'bella.save.v1';
const SETTINGS_KEY = 'bella.settings.v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    /* Private browsing, a full quota, or storage disabled entirely. The game
     * runs fine without a save and says nothing about it — a modal about
     * localStorage in the middle of a customer helps nobody. */
    return false;
  }
}

export function loadSave() { return read(KEY, null); }
export function saveGame(data) { return write(KEY, data); }
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}

export const DEFAULT_SETTINGS = {
  scale: 1,
  texture: 1024,
  paint: 1024,
  bloom: true,
  sound: true,
  assist: 0.7,
  hints: true,
};

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) };
}

export function saveSettings(s) { return write(SETTINGS_KEY, s); }

/*
 * The first run has to pick a quality level before anything has been rendered,
 * so it guesses from the device. A phone that turns out to be fast can be
 * turned up in settings; a phone that starts at desktop settings shows a black
 * screen for six seconds and gets closed.
 */
export function guessQuality() {
  const mobile = typeof navigator !== 'undefined'
    && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const small = typeof window !== 'undefined'
    && Math.min(window.innerWidth || 1280, window.innerHeight || 720) < 520;

  if (mobile || cores <= 4 || small) {
    return { scale: 0.72, texture: 512, paint: 512, bloom: !small };
  }
  return { scale: 1, texture: 1024, paint: 1024, bloom: true };
}
