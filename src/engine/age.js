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

/*
 * Below this, part of the change between two photographs is not the training.
 *
 * Frame width, chest depth and muscle mass keep developing into the early
 * twenties, and the photo scan opens at 18 — so its verdict, which is phrased in
 * months of work, was charging the programme for what finishing growing
 * delivers. 23 is deliberately conservative; the app only ever says the
 * direction, never an amount, because a photograph cannot tell you how much is
 * left.
 */
export const STILL_DEVELOPING_UNTIL = 23;

/** True when some of a body-composition goal will close without training. */
export function stillDeveloping(profile) {
  const a = ageOf(profile);
  return a !== null && a >= 10 && a < STILL_DEVELOPING_UNTIL;
}

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

/**
 * True when a photo reading must steer the plan without ever being displayed.
 *
 * The realism verdict — is this target reachable by this date — is still shown,
 * because that is a judgement about a goal and a calendar. What is withheld is
 * the description of the body itself: how lean it is, how much mass it carries,
 * what stands out, what the posture is doing. Those exist to aim the programme
 * and they do that work whether or not anybody reads them.
 *
 * A thirteen-year-old has no use for a paragraph analysing their own torso, and
 * handing them one is how an app that meant to help teaches somebody to inspect
 * themselves. The plan is built from it identically either way.
 */
export function hidesBodyReading(profile) {
  return isMinor(profile);
}

/*
 * How much weight a body still adds on its own, in kg per week, before any
 * training is counted.
 *
 * Adolescent boys gain roughly 4-9 kg a year through the growth spurt, from
 * height, skeletal mass and organ mass — none of it produced by a programme.
 * The figure here is the conservative end of that, and it tapers to nothing by
 * the time the skeleton is done.
 *
 * It exists because the goal assessment prices weight gain off adult
 * training-driven muscle rates. Against those a thirteen-year-old planning to go
 * from 48kg to 60kg in a year is "unrealistic" and is told the extra will be
 * fat — when in fact that is close to ordinary development.
 */
export function growthAllowanceKgPerWeek(profile) {
  const a = ageOf(profile);
  if (a === null || a < 10) return 0;
  if (a <= 15) return 0.09;            // through the spurt
  if (a >= 20) return 0;               // skeleton is done
  return 0.09 * ((20 - a) / 5);        // taper across 16-19
}
