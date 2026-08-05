/*
 * age.js — every place the app treats a young trainee differently, and why.
 *
 * These rules were previously spelled out as bare numbers in six files, and they
 * drifted apart the moment two surfaces disagreed about the same person. The
 * nutrition tab told a thirteen-year-old, in as many words, not to weigh
 * themselves weekly because they are still growing — and the tracking tab, in
 * the same plan, opened with "one weigh-in a week, same day, in the morning"
 * and gave them a button for it. Both were written honestly. Neither knew about
 * the other.
 *
 * So the thresholds live here, once, each with the reason attached. A number
 * without its reason is a number somebody will "tidy up" later.
 *
 * Pure arithmetic over a profile: no DOM, no imports, no side effects.
 */

/*
 * Below this, the app does not put a number on food or on the body.
 *
 * A targeted deficit during growth costs height and bone density, and the habit
 * of weekly self-weighing is itself the harm at this age — it teaches a child to
 * read a rising number, which is exactly what growth looks like, as failure. The
 * two halves are one rule and they have to move together.
 */
export const BODY_NUMBERS_FROM = 16;

/*
 * Below this the app will not build a deficit, whatever the goal chip says.
 * Higher than the rule above because "no calorie target" and "no fat loss" are
 * different claims: a seventeen-year-old can be given a maintenance figure and
 * taught to eat to it; they should still not be dieting.
 */
export const FAT_LOSS_FROM = 18;

/*
 * Below this the photo scan does not run at all. It asks for a photograph of a
 * body in tight clothing and sends it to a third party — the argument is about
 * the picture, not about the training, so it is the strictest line in the file.
 */
export const PHOTO_SCAN_FROM = 18;

/*
 * Below this, top-end loading is held back: growth plates are open, and the
 * limiting factor is connective tissue rather than muscle. This does not stop
 * anyone training hard, it stops the plan chasing a one-rep max.
 */
export const HEAVY_LOAD_FROM = 16;

/*
 * The general "this is a minor and the app says so out loud" line, used for
 * headings and for the non-negotiable warnings (parental consent, a doctor's
 * sign-off, no creatine or protein powder). Shares the number with FAT_LOSS_FROM
 * and is kept separate anyway, because the two would be edited for different
 * reasons and a shared constant would make one silently follow the other.
 */
export const ADULT_FROM = 18;

function ageOf(profile) {
  const n = Number(profile && profile.age);
  return Number.isFinite(n) ? n : null;
}

/*
 * Each of these answers one question, and the UI is expected to ask rather than
 * compare ages itself. An unknown age is treated as an adult: the questionnaire
 * requires it, so a missing value means an imported or hand-edited profile, and
 * silently applying child rules to an adult who never answered would be its own
 * kind of wrong.
 */

/** No calorie targets, no macro split, no weekly weigh-in, no body-fat talk. */
export function withholdsBodyNumbers(profile) {
  const a = ageOf(profile);
  return a !== null && a < BODY_NUMBERS_FROM;
}

/** True when a deficit must not be built, whatever the goal says. */
export function withholdsFatLoss(profile) {
  const a = ageOf(profile);
  return a !== null && a < FAT_LOSS_FROM;
}

/** True when the photo scan must not run. */
export function withholdsPhotoScan(profile) {
  const a = ageOf(profile);
  return a !== null && a < PHOTO_SCAN_FROM;
}

/** True when the plan should stay off maximal loads. */
export function withholdsHeavyLoad(profile) {
  const a = ageOf(profile);
  return a !== null && a < HEAVY_LOAD_FROM;
}

/** True when the app should speak to this trainee as a minor. */
export function isMinor(profile) {
  const a = ageOf(profile);
  return a !== null && a < ADULT_FROM;
}
