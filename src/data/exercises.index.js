/*
 * exercises.index.js — the exercise registry and the ONE filter every
 * consumer must use. The generator must not re-implement filtering.
 */

import { PUSH } from './exercises.push.js';
import { PULL } from './exercises.pull.js';
import { LEGS } from './exercises.legs.js';
import { CORE } from './exercises.core.js';

export const EXERCISES = [].concat(PUSH, PULL, LEGS, CORE);

export const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function byId(id) {
  return BY_ID.get(id) || null;
}

export function byPattern(pattern) {
  return EXERCISES.filter((e) => e.pattern === pattern);
}

/** Equipment the profile can actually use. `none` is always available. */
export function hasEquipment(profile, needed) {
  const owned = new Set(['none'].concat(profile.equipment || []));
  return (needed || []).every((q) => owned.has(q));
}

/** True when the exercise stresses something the user is hurt in. */
export function conflictsInjury(profile, ex) {
  const inj = new Set(profile.injuries || []);
  return (ex.contraindications || []).some((c) => inj.has(c));
}

/**
 * True when the user explicitly refused this movement.
 *
 * A refusal may carry several terms separated by "|", because a movement family
 * is not always one word: dips are called both מקבילים and דיפס in this library,
 * and a single substring cannot reach both.
 */
export function isAvoided(profile, ex) {
  const list = (profile.avoid || [])
    .flatMap((s) => String(s).toLowerCase().split('|'))
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) return false;
  const hay = `${ex.name} ${ex.nameEn}`.toLowerCase();
  return list.some((a) => hay.includes(a) || a.includes(ex.nameEn.toLowerCase()));
}

/*
 * Training track. Two people with the same gym and the same goal often want
 * completely different sessions: one wants to master their own bodyweight, the
 * other wants to move iron. This is a preference about HOW to train, separate
 * from what equipment happens to be available.
 */
const CALISTHENIC_EQUIPMENT = new Set([
  'none', 'pullup_bar', 'dip_bars', 'rings', 'bands', 'box', 'bench', 'mat', 'trx', 'jump_rope',
]);
const LOADED_EQUIPMENT = new Set(['dumbbells', 'barbell', 'kettlebell', 'machines', 'cable']);

/* Core, mobility and conditioning stay bodyweight on either track — nobody
   wants a machine substitute for a plank. */
const TRACK_NEUTRAL_PATTERNS = new Set([
  'core_flexion', 'core_antiextension', 'core_rotation', 'mobility', 'conditioning', 'plyo', 'carry',
]);

export function matchesTrack(ex, track) {
  if (!track || track === 'mixed') return true;
  if (TRACK_NEUTRAL_PATTERNS.has(ex.pattern)) return true;
  const eq = ex.equipment || [];
  if (track === 'calisthenics') return eq.every((q) => CALISTHENIC_EQUIPMENT.has(q));
  if (track === 'weights') return eq.some((q) => LOADED_EQUIPMENT.has(q));
  return true;
}

/** Difficulty ceiling implied by experience — keeps novices off level 5 skills. */
export function levelCap(profile) {
  switch (profile.experience) {
    case 'beginner': return 2;
    case 'returning': return 3;
    case 'intermediate': return 4;
    default: return 5;
  }
}

/**
 * The canonical candidate query.
 *
 *   candidates(profile, { pattern, muscle, tag, maxLevel, allowInjuryRisk })
 *
 * Returns exercises sorted easiest → hardest. Filters, in order:
 *   1. pattern / muscle / tag match (all optional)
 *   2. equipment the profile owns
 *   3. not explicitly avoided
 *   4. level <= maxLevel (defaults to levelCap(profile) + 1)
 *   5. no injury conflict — unless allowInjuryRisk is true
 */
export function candidates(profile, opts) {
  const o = opts || {};
  const cap = o.maxLevel !== undefined ? o.maxLevel : levelCap(profile) + 1;
  return EXERCISES
    .filter((e) => (!o.pattern || e.pattern === o.pattern))
    .filter((e) => (!o.patterns || o.patterns.includes(e.pattern)))
    .filter((e) => (!o.muscle || e.muscles.primary.includes(o.muscle)))
    .filter((e) => (!o.tag || (e.tags || []).includes(o.tag)))
    .filter((e) => hasEquipment(profile, e.equipment))
    .filter((e) => (o.ignoreTrack ? true : matchesTrack(e, profile.track)))
    .filter((e) => !isAvoided(profile, e))
    .filter((e) => e.level <= cap)
    .filter((e) => (o.allowInjuryRisk ? true : !conflictsInjury(profile, e)))
    .sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
}

/**
 * Same as candidates(), but never returns empty for a pattern that exists in
 * the DB: it progressively relaxes level cap, then injury filter. When the
 * injury filter had to be dropped, `risky` is true and the caller MUST add a
 * caution note.
 */
export function candidatesOrFallback(profile, opts) {
  let list = candidates(profile, opts);
  if (list.length) return { list, risky: false };
  // Relax the track preference before anything else — a preference should
  // yield long before a level ceiling, and far before an injury rule.
  list = candidates(profile, Object.assign({}, opts, { ignoreTrack: true }));
  if (list.length) return { list, risky: false };
  list = candidates(profile, Object.assign({}, opts, { ignoreTrack: true, maxLevel: 5 }));
  if (list.length) return { list, risky: false };
  list = candidates(profile, Object.assign({}, opts, { ignoreTrack: true, maxLevel: 5, allowInjuryRisk: true }));
  return { list, risky: list.length > 0 };
}

/** Stable non-cryptographic hash — use this instead of Math.random(). */
export function hashProfile(profile) {
  const s = JSON.stringify([
    profile.age, profile.sex, profile.heightCm, profile.weightKg, profile.goal,
    profile.experience, profile.daysPerWeek, profile.minutesPerSession,
    profile.location, (profile.equipment || []).slice().sort(),
    (profile.injuries || []).slice().sort(), profile.targetDate,
  ]);
  let hMix = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hMix ^= s.charCodeAt(i);
    hMix = Math.imul(hMix, 16777619);
  }
  return hMix >>> 0;
}

/** Deterministic rotation — picks a starting offset from the profile hash. */
export function rotate(list, seed) {
  if (!list.length) return list;
  const k = seed % list.length;
  return list.slice(k).concat(list.slice(0, k));
}
