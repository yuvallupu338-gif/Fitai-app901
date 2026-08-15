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
  /* The shop's surfaces. Separate from `face` on purpose: a wall four metres
   * away and a cheekbone forty centimetres away do not want the same budget,
   * and generating the room at face resolution is seconds of boot for detail
   * nobody can see. */
  texture: 512,
  face: 1024,
  paint: 1024,
  bloom: true,
  sound: true,
  assist: 0.7,
  hints: true,
};

/*
 * Defaults, then whatever the device guess says, then anything the player has
 * actually changed. The order matters: reading the stored settings on top of
 * the bare defaults and *then* applying the guess means the guess never
 * applies, because the defaults are a complete object and shadow it — which is
 * how the phone path quietly stopped working the first time round.
 */
export function loadSettings(guess = {}) {
  return { ...DEFAULT_SETTINGS, ...guess, ...read(SETTINGS_KEY, {}) };
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
    return { scale: 0.72, texture: 256, face: 512, paint: 512, bloom: !small };
  }
  return { scale: 1, texture: 512, face: 1024, paint: 1024, bloom: true };
}
