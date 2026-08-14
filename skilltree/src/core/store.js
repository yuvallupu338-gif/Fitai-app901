/*
 * store.js — persistent state, one localStorage key, a tiny pub/sub.
 *
 * Two things here are worth knowing before reading further.
 *
 * 1. Storage can refuse. Private browsing, a full quota, some file:// contexts.
 *    When it does we keep working from an in-memory copy, because refusing to
 *    run helps nobody — but we record that fact so the UI can say so. The app
 *    tells the learner their progress is saved on this device; if that stops
 *    being true, saying it anyway is the kind of lie that costs someone a
 *    fortnight of work. `persists()` is how the interface finds out.
 *
 * 2. Profiles are local. There is no server (see the README), so an "account"
 *    here is a named profile on this device. Several can coexist and be
 *    switched between, each with its own progress. That is genuinely useful —
 *    it is how the demo profile lives alongside a real one — and it is not
 *    authentication, which the UI states plainly rather than implying.
 */

const KEY = 'skilltree.v1';

const memory = { data: null };
let storageWorks = true;

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* Corrupt JSON is treated as absent rather than fatal: a single bad write
     * should cost the session, not lock the learner out of the app forever. */
  }
  return memory.data;
}

function write(data) {
  memory.data = data;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    storageWorks = false;
    return false;
  }
}

/* Probed once at load, before the first real write, because the warning
 * belongs in front of the onboarding rather than after it. Cleans up its own
 * key so it cannot disturb stored data. */
(function probeStorage() {
  try {
    const probe = `${KEY}.probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    storageWorks = true;
  } catch {
    storageWorks = false;
  }
}());

export function persists() {
  return storageWorks;
}

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

export function emptyProfile(name = '', id = null) {
  return {
    id: id || `p_${Math.random().toString(36).slice(2, 10)}`,
    name,
    createdAt: Date.now(),
    onboarded: false,
    /* Per-skill records, keyed by skill id. See domain/progress.js. */
    skills: {},
    /* The XP ledger — the source of truth for every total in the app. */
    xpEvents: [],
    achievements: {},
    streak: { current: 0, longest: 0, lastDay: null },
    goal: null,
    /* The goal in the learner's own words. The programme itself is derived
     * from live progress on every render rather than stored, so it cannot go
     * stale the moment something is completed. */
    plan: null,
    missions: null,
    analytics: [],
    settings: {
      theme: 'dark',
      intensity: 'normal',
      aiRecommendations: true,
      leaderboard: false,
      reducedMotion: false,
    },
  };
}

function emptyRoot() {
  return { version: 1, activeProfileId: null, profiles: {}, trees: {} };
}

/*
 * Migration on read rather than on write.
 *
 * Stored state predates any field added later, and every consumer would
 * otherwise need a `|| []` guard forever. Normalising once on load keeps that
 * defensiveness in one place — and means a profile written by an older build
 * opens rather than throwing.
 */
function normalise(root) {
  if (!root || typeof root !== 'object') return emptyRoot();
  const out = {
    version: 1,
    activeProfileId: root.activeProfileId || null,
    profiles: {},
    trees: (root.trees && typeof root.trees === 'object') ? root.trees : {},
  };

  for (const [id, profile] of Object.entries(root.profiles || {})) {
    const base = emptyProfile(profile.name, id);
    out.profiles[id] = {
      ...base,
      ...profile,
      id,
      skills: profile.skills || {},
      xpEvents: Array.isArray(profile.xpEvents) ? profile.xpEvents : [],
      achievements: profile.achievements || {},
      streak: profile.streak || base.streak,
      analytics: Array.isArray(profile.analytics) ? profile.analytics : [],
      settings: { ...base.settings, ...(profile.settings || {}) },
    };
  }

  if (out.activeProfileId && !out.profiles[out.activeProfileId]) out.activeProfileId = null;
  return out;
}

let root = normalise(read());

/* ------------------------------------------------------------------ *
 * Generated trees
 * ------------------------------------------------------------------ */

/*
 * A generated tree is content, not progress, so it lives beside the profiles
 * rather than inside one — two profiles on the same device share a catalogue,
 * the same way they share the seeded trees.
 *
 * It has to be stored at all because the catalogue is an in-memory Map. A tree
 * accepted from the generator was registered there and nowhere else, so a
 * reload lost it — while the attempts made against its skills stayed in the
 * profile, pointing at skill ids nothing could resolve. The learner saw XP and
 * a streak they could not trace to anything, and the tree they had built their
 * goal around was simply gone.
 */
export function savedTrees() {
  return Object.values(root.trees || {});
}

export function saveTree(tree) {
  if (!tree || !tree.id) return false;
  root = { ...root, trees: { ...root.trees, [tree.id]: tree } };
  return write(root);
}

export function forgetTree(id) {
  if (!root.trees || !root.trees[id]) return false;
  const trees = { ...root.trees };
  delete trees[id];
  root = { ...root, trees };
  write(root);
  emit();
  return true;
}

/* ------------------------------------------------------------------ *
 * Subscription
 * ------------------------------------------------------------------ */

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of [...listeners]) {
    try {
      fn(currentProfile());
    } catch (err) {
      /* One broken subscriber must not stop the others from repainting. */
      console.error('store subscriber failed', err);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Profiles
 * ------------------------------------------------------------------ */

export function listProfiles() {
  return Object.values(root.profiles).sort((a, b) => a.createdAt - b.createdAt);
}

export function currentProfile() {
  if (!root.activeProfileId) return null;
  return root.profiles[root.activeProfileId] || null;
}

export function createProfile(name) {
  const profile = emptyProfile(name);
  root = { ...root, activeProfileId: profile.id, profiles: { ...root.profiles, [profile.id]: profile } };
  write(root);
  emit();
  return profile;
}

export function switchProfile(id) {
  if (!root.profiles[id]) return false;
  root = { ...root, activeProfileId: id };
  write(root);
  emit();
  return true;
}

export function deleteProfile(id) {
  if (!root.profiles[id]) return false;
  const profiles = { ...root.profiles };
  delete profiles[id];
  const remaining = Object.keys(profiles);
  root = {
    ...root,
    profiles,
    activeProfileId: root.activeProfileId === id ? (remaining[0] || null) : root.activeProfileId,
  };
  write(root);
  emit();
  return true;
}

/* ------------------------------------------------------------------ *
 * Reading and writing the active profile
 * ------------------------------------------------------------------ */

export function get() {
  return currentProfile();
}

/**
 * Replace the active profile with the result of `fn(profile)`.
 *
 * The single write path. Everything that changes learner state — an attempt,
 * a setting, a goal — funnels through here, which is what makes persistence
 * and repaint automatic rather than something each caller has to remember.
 */
export function update(fn) {
  const profile = currentProfile();
  if (!profile) return null;

  const next = fn(profile);
  if (!next || next === profile) return profile;

  root = { ...root, profiles: { ...root.profiles, [profile.id]: next } };
  write(root);
  emit();
  return next;
}

export function patch(changes) {
  return update((profile) => ({ ...profile, ...changes }));
}

export function patchSettings(changes) {
  return update((profile) => ({ ...profile, settings: { ...profile.settings, ...changes } }));
}

/* ------------------------------------------------------------------ *
 * Backup and restore
 * ------------------------------------------------------------------ */

/*
 * There is no server, so this is the only way a learner can move their
 * progress to another device or keep a backup. Without it, "your data is on
 * this device" quietly means "your data is one cleared cache from gone".
 */
export function exportJson() {
  const profile = currentProfile();
  if (!profile) return '{}';

  /*
   * Generated trees ride along, or the backup is a list of skill ids the
   * receiving device cannot resolve. Only the ones this profile actually
   * touched — the point is a self-contained backup, not a copy of the whole
   * device's catalogue. Each saved tree lists its own skills, so this needs no
   * help from the catalogue module.
   */
  const touched = new Set(Object.keys(profile.skills || {}));
  if (profile.goal?.targetSkillId) touched.add(profile.goal.targetSkillId);
  const trees = savedTrees().filter((tree) => tree.id === profile.goal?.treeId
    || (tree.skills || []).some((skill) => touched.has(skill.id)));

  return JSON.stringify({
    kind: 'skilltree.profile',
    version: 1,
    profile,
    ...(trees.length ? { trees } : {}),
  }, null, 2);
}

export function importJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  const incoming = parsed && parsed.profile ? parsed.profile : parsed;
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.xpEvents)) {
    return { ok: false, error: 'That does not look like a SkillTree export.' };
  }

  /*
   * Imported under a fresh id so an import can never silently overwrite the
   * profile the learner is currently using — and put through `normalise`,
   * which every profile read from storage already goes through.
   *
   * Spreading the incoming object straight over `emptyProfile` let an explicit
   * `"skills": null` overwrite the default `{}`, and the dashboard then threw
   * on the next render. A reload recovered it, because load normalises; import
   * did not.
   */
  const id = `p_${Math.random().toString(36).slice(2, 10)}`;
  const merged = { ...emptyProfile(incoming.name || 'Imported'), ...incoming, id };
  const normalised = normalise({ version: 1, activeProfileId: id, profiles: { [id]: merged } });
  const profile = normalised.profiles[id];

  /* Trees the export carried. Stored, but not registered here — the caller
   * registers them, because registration validates the graph and this module
   * has no business deciding what to do with a tree that fails. */
  const trees = { ...root.trees };
  const carried = [];
  for (const tree of Array.isArray(parsed.trees) ? parsed.trees : []) {
    if (tree && tree.id && Array.isArray(tree.skills)) { trees[tree.id] = tree; carried.push(tree); }
  }

  root = {
    ...root,
    activeProfileId: profile.id,
    profiles: { ...root.profiles, [profile.id]: profile },
    trees,
  };
  write(root);
  emit();
  return { ok: true, profile, trees: carried };
}

/** Wipe everything. Used by Settings, and by the smoke test between runs. */
export function resetAll() {
  root = emptyRoot();
  try { window.localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  memory.data = null;
  emit();
}
