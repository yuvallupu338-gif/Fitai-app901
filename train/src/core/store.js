/*
 * store.js — everything that survives closing the tab.
 *
 * Three separate keys on purpose. Settings must never be lost by finishing a
 * run, the profile (endings, achievements, codex, Nightmare unlock) must never
 * be lost by starting one, and the save is the only thing a "new game" is
 * allowed to destroy.
 *
 * localStorage can throw — private browsing, a full quota, a file:// origin in
 * some browsers — and a horror game that refuses to start because it could not
 * write a volume slider is a worse bug than a forgotten volume slider. Every
 * access is guarded and falls back to an in-memory shim.
 */

const PREFIX = 'lasttrain.';
const memory = new Map();

let backend = (() => {
  try {
    const probe = `${PREFIX}__probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
})();

function read(key) {
  if (backend) {
    try { return backend.getItem(PREFIX + key); } catch { backend = null; }
  }
  return memory.has(PREFIX + key) ? memory.get(PREFIX + key) : null;
}

function write(key, value) {
  memory.set(PREFIX + key, value);
  if (backend) {
    try { backend.setItem(PREFIX + key, value); return true; } catch { backend = null; }
  }
  return false;
}

function drop(key) {
  memory.delete(PREFIX + key);
  if (backend) {
    try { backend.removeItem(PREFIX + key); } catch { backend = null; }
  }
}

export function loadJSON(key, fallback) {
  const raw = read(key);
  if (raw == null) return structuredCopy(fallback);
  try {
    const parsed = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object') return structuredCopy(fallback);
    return parsed;
  } catch {
    return structuredCopy(fallback);
  }
}

export function saveJSON(key, value) {
  try { return write(key, JSON.stringify(value)); } catch { return false; }
}

export function removeKey(key) { drop(key); }

function structuredCopy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/* ---- settings ------------------------------------------------------- */

export const DEFAULT_SETTINGS = {
  volumeMaster: 0.85,
  volumeAmbient: 0.9,
  volumeSfx: 0.9,
  volumeVoice: 1,
  sensitivity: 0.0022,
  invertY: false,
  fov: 72,
  brightness: 1.22,
  contrast: 1.3,
  sharpen: 0.5,
  antialias: true,
  subtitles: true,
  subtitleSize: 1,
  soundCaptions: true,
  headBob: 1,
  quality: 'high',          // low | medium | high | ultra
  reflections: true,
  bloom: true,
  grain: 0.65,
  chromatic: 0.5,
  vignette: 0.7,
  resolutionScale: 1,
  crosshair: true,
  speechVoice: 'synthetic', // synthetic | system
  invertMouseX: false,
};

/* Quality presets only touch the knobs the player has not pinned themselves;
   they are applied by the settings screen, not read implicitly at draw time,
   so what a player sets by hand always wins. */
export const QUALITY_PRESETS = {
  low: { reflections: false, bloom: false, grain: 0.4, chromatic: 0, resolutionScale: 0.75, antialias: false, sharpen: 0.35 },
  medium: { reflections: false, bloom: true, grain: 0.55, chromatic: 0.35, resolutionScale: 1, antialias: true, sharpen: 0.5 },
  high: { reflections: true, bloom: true, grain: 0.65, chromatic: 0.5, resolutionScale: 1, antialias: true, sharpen: 0.5 },
  ultra: { reflections: true, bloom: true, grain: 0.65, chromatic: 0.5, resolutionScale: 1.5, antialias: true, sharpen: 0.6 },
};

export function loadSettings() {
  const raw = loadJSON('settings', {});
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (raw[key] === undefined) continue;
    const def = DEFAULT_SETTINGS[key];
    const val = raw[key];
    if (typeof def === 'number' && typeof val === 'number' && Number.isFinite(val)) out[key] = val;
    else if (typeof def === 'boolean' && typeof val === 'boolean') out[key] = val;
    else if (typeof def === 'string' && typeof val === 'string') out[key] = val;
  }
  return out;
}

export function saveSettings(settings) { saveJSON('settings', settings); }

/* ---- profile -------------------------------------------------------- */

export const DEFAULT_PROFILE = {
  endings: {},          // id -> { firstSeen, count }
  achievements: {},     // id -> timestamp
  codex: {},            // clue id -> timestamp first found
  runsCompleted: 0,
  nightmareUnlocked: false,
  nightmareCompleted: false,
  version: 1,
};

export function loadProfile() {
  const p = loadJSON('profile', DEFAULT_PROFILE);
  return {
    ...DEFAULT_PROFILE,
    ...p,
    endings: p.endings && typeof p.endings === 'object' ? p.endings : {},
    achievements: p.achievements && typeof p.achievements === 'object' ? p.achievements : {},
    codex: p.codex && typeof p.codex === 'object' ? p.codex : {},
  };
}

export function saveProfile(profile) { saveJSON('profile', profile); }

/* ---- run save ------------------------------------------------------- */

export function loadSave() { return loadJSON('save', null); }
export function writeSave(data) { saveJSON('save', data); }
export function clearSave() { removeKey('save'); }
export function hasSave() { return read('save') != null; }
