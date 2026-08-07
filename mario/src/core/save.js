/*
 * save.js — progress through a hundred levels, on the device.
 *
 * A hundred levels is far more than one sitting, so the run has to survive a
 * closed tab. What is worth keeping is small: how far the player has unlocked,
 * the best score, and per level whether it is cleared plus the best time and
 * coin count. That is a few kilobytes, well inside a localStorage quota, and
 * it is all the level-select screen needs to draw.
 *
 * Everything reads through defaults and every write is wrapped, because
 * localStorage throws rather than returns in private mode on some browsers,
 * and a save failure must cost the player a leaderboard entry, not the level
 * they are standing in.
 */

const KEY = 'supermario100.save.v1';

const BLANK = {
  unlocked: 1,      // highest level number the player may start
  highScore: 0,
  lives: null,      // a run in progress, if any
  current: 1,
  coinsTotal: 0,
  muted: false,
  scale: 0,         // 0 = fit the window
  levels: {},       // id -> { cleared, bestTime, coins, score }
};

let cache = null;

function read() {
  if (cache) return cache;
  cache = { ...BLANK, levels: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        cache = { ...BLANK, ...parsed, levels: parsed.levels || {} };
      }
    }
  } catch (e) {
    /* Corrupt or unreadable: start clean rather than refuse to boot. */
  }
  return cache;
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (e) { /* full or blocked — the session still plays */ }
}

export const save = {
  get all() { return read(); },

  get unlocked() { return read().unlocked; },
  get highScore() { return read().highScore; },
  get muted() { return !!read().muted; },
  get scale() { return read().scale | 0; },

  level(id) {
    return read().levels[id] || { cleared: false, bestTime: 0, coins: 0, score: 0 };
  },

  unlock(id) {
    const s = read();
    if (id > s.unlocked) { s.unlocked = Math.min(id, 100); write(); }
  },

  /* Called once at the flagpole. Only ever improves a record — replaying a
     level you already beat with a worse time must not erase the good one. */
  clear(id, { timeLeft, coins, score }) {
    const s = read();
    const prev = s.levels[id] || { cleared: false, bestTime: 0, coins: 0, score: 0 };
    s.levels[id] = {
      cleared: true,
      bestTime: Math.max(prev.bestTime, timeLeft | 0),
      coins: Math.max(prev.coins, coins | 0),
      score: Math.max(prev.score, score | 0),
    };
    if (id + 1 > s.unlocked) s.unlocked = Math.min(id + 1, 100);
    write();
  },

  recordScore(score) {
    const s = read();
    if (score > s.highScore) { s.highScore = score | 0; write(); }
  },

  setMuted(v) { const s = read(); s.muted = !!v; write(); },
  setScale(v) { const s = read(); s.scale = v | 0; write(); },

  /* Where the level-select screen puts the cursor when it opens. */
  setCurrent(id) { const s = read(); s.current = id | 0; write(); },
  get current() { return read().current || 1; },

  get clearedCount() {
    const l = read().levels;
    let n = 0;
    for (const k in l) if (l[k].cleared) n++;
    return n;
  },

  reset() {
    cache = { ...BLANK, levels: {} };
    write();
  },
};
