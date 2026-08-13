/* The form under the hero says the details stay on this device. That line is
 * only worth printing if it is true, so this is the whole of the persistence
 * layer: one key, localStorage, no network anywhere in the file.
 */
const KEY = 'lavi.landing.v1';

export function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    // Private mode, a blocked origin, or corrupt JSON. The page forgets and
    // carries on; nothing here is worth an error for.
    return {};
  }
}

export function save(patch) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...load(), ...patch }));
  } catch {
    /* see above */
  }
}
