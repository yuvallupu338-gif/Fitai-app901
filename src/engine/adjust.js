/*
 * adjust.js — autoregulation. "This is too easy" / "this is too hard".
 *
 * The generator picks a starting difficulty from the intake answers, but the
 * only person who knows whether a set was actually hard is the one doing it.
 * These two moves let the plan follow that feedback instead of waiting for the
 * next block.
 *
 * Difficulty steps in this order, so the swap stays inside the same job:
 *   1. another variant already in the slot, one rung up or down
 *   2. the exercise's own progression chain (progressionTo / regressionOf)
 *   3. the nearest exercise in the same movement pattern at a different level
 *
 * Every candidate still goes through the registry filter, so a harder option
 * can never introduce equipment the user lacks or load an injury they declared.
 */

import { byId, candidates } from '../data/exercises.index.js';

/**
 * @param {Object} profile
 * @param {Object} slot     the program slot (for its variant list)
 * @param {String} currentExId
 * @param {Number} dir      +1 harder, -1 easier
 * @returns {Object|null}   the exercise to move to, or null if there is nowhere to go
 */
export function stepDifficulty(profile, slot, currentExId, dir) {
  const cur = byId(currentExId);
  if (!cur) return null;

  const pool = candidates(profile, { pattern: cur.pattern, maxLevel: 5 });
  const reachable = new Set(pool.map((e) => e.id));

  // 1. within the slot's own variants
  const inSlot = (slot.variants || [])
    .map((v) => byId(v.exId))
    .filter(Boolean)
    .sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
  /*
   * The slot's own variants come first, because staying inside the slot the
   * generator chose keeps the day coherent — but only to an adjacent rung.
   * inSlot is sorted by level and this took inSlot[at + dir] with nothing
   * checking how far that jumped.
   *
   * Being accurate about what this bound is worth: on its own, nothing. The
   * real defect was that "קל לי" on a banded squat returned a pistol squat —
   * three levels, onto one leg — and adding this guard did not change that by
   * a single rung. Rejecting the in-slot neighbour just falls through to step
   * 3, which ranks the whole pattern by nearest level, and for a trainee with
   * bands and a bar the nearest squat above level 2 *was* the pistol: the
   * level-3 and level-4 rungs need a plyo box and suspension straps and the
   * equipment filter had removed them. What fixed it was adding two rungs that
   * need no equipment.
   *
   * It stays because it is the direct expression of the rule validate.js
   * enforces — a press moves to the nearest rung that exists, never over one —
   * and because a slot whose variants skip a level the pattern does have is a
   * shape the data can take again. It is a guard, not the cure, and the
   * comment should not have claimed otherwise.
   */
  const at = inSlot.findIndex((e) => e.id === currentExId);
  if (at >= 0) {
    const neighbour = inSlot[at + dir];
    if (neighbour && neighbour.level !== cur.level
      && Math.abs(neighbour.level - cur.level) <= 1) return neighbour;
  }

  // 2. the exercise's own chain — the most meaningful step, when it exists
  const chainId = dir > 0 ? cur.progressionTo : cur.regressionOf;
  if (chainId && reachable.has(chainId)) return byId(chainId);

  // 3. nearest level in the same pattern
  const ranked = pool
    .filter((e) => e.id !== currentExId && (dir > 0 ? e.level > cur.level : e.level < cur.level))
    .sort((a, b) => (dir > 0 ? a.level - b.level : b.level - a.level) || a.id.localeCompare(b.id));
  return ranked[0] || null;
}

/** True when there is anywhere to go in that direction. */
export function canStep(profile, slot, currentExId, dir) {
  return !!stepDifficulty(profile, slot, currentExId, dir);
}

/**
 * Builds a prescription for the replacement, keeping the slot's job — same
 * sets, same rest — and adapting the parts that belong to the exercise itself.
 * Reps move with difficulty: a harder movement at the same rep count is a much
 * bigger jump than the user asked for.
 */
export function prescribeSwap(base, ex, dir, fromLevel) {
  const reps = shiftReps(base.reps, base.unit, ex.unit, dir);
  // Some patterns have no rung between here and the next real progression —
  // bodyweight squats jump straight from a tempo squat to a pistol. Say so
  // rather than let the jump ambush someone mid-set.
  const jump = typeof fromLevel === 'number' ? Math.abs(ex.level - fromLevel) : 0;
  const bigJump = dir > 0 && jump >= 2;
  return {
    exId: ex.id,
    name: ex.name,
    nameEn: ex.nameEn,
    sets: base.sets,
    reps,
    rest: base.rest,
    tempo: null,
    level: ex.level,
    unit: ex.unit,
    unilateral: !!ex.unilateral,
    note: dir > 0
      ? (bigJump
        ? `⚠︎ קפיצה גדולה — אין שלב ביניים בציוד שיש לך. נסה כמה חזרות בזהירות; אם זה לא נקי, חזור אחורה.`
        : `הועלה בקושי לבקשתך. אם הטכניקה מתחילה להישבר — חזור אחורה, זה לא כישלון.`)
      : `הורד בקושי לבקשתך. עשה אותו נקי, ותעלה כשהוא מרגיש קל.`,
    muscles: (ex.muscles.primary || []).slice(),
  };
}

/* A harder movement earns fewer reps, an easier one a few more. Ranges stay
   ranges; single numbers stay single numbers. */
function shiftReps(reps, fromUnit, toUnit, dir) {
  const text = String(reps || '');
  if (fromUnit !== toUnit) return toUnit === 'time' ? '20–30 שניות' : '8–12 חזרות';

  const nums = text.match(/\d+/g);
  if (!nums || !nums.length) return text;

  const factor = dir > 0 ? 0.7 : 1.3;
  let i = 0;
  return text.replace(/\d+/g, () => {
    const v = Number(nums[i++]);
    const out = Math.max(1, Math.round(v * factor));
    return String(out);
  });
}
