/*
 * store.js — the run in progress and the best week so far, on this device only.
 *
 * Nothing here is sent anywhere. The whole game state is plain data by
 * construction (see sim/state.js), so saving is JSON.stringify and resuming is
 * the reverse — including the random number generator's position, so a night
 * reloaded halfway through carries on being the same night rather than
 * rerolling what was about to come through the kitchen wall.
 *
 * The key is namespaced because this origin is shared with two FitAI apps and
 * a Backrooms build, and localStorage is per-origin rather than per-path.
 */

import { toSave, fromSave } from '../sim/state.js';

const KEY = 'villa.v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    /* Private mode, or a full jar. A game that cannot save is still a game. */
  }
}

export function saveRun(state) {
  const data = read();
  data.run = toSave(state);
  write(data);
}

export function loadRun() {
  const data = read();
  if (!data.run) return null;
  try {
    return fromSave(data.run);
  } catch (e) {
    return null;
  }
}

export function clearRun() {
  const data = read();
  delete data.run;
  write(data);
}

export function hasRun() {
  return !!read().run;
}

/* The only score this game keeps: the furthest night reached, and whether the
 * week has ever been finished. */
export function recordOutcome(state) {
  const data = read();
  data.best = Math.max(data.best || 0, state.stats.nightsSurvived);
  if (state.phase === 'won') data.won = true;
  delete data.run;
  write(data);
}

export function best() {
  const data = read();
  return { nights: data.best || 0, won: !!data.won };
}

export function prefs() {
  const data = read();
  return Object.assign({ muted: false, mode: 'map', speed: 1 }, data.prefs);
}

export function setPrefs(next) {
  const data = read();
  data.prefs = Object.assign(prefs(), next);
  write(data);
}
