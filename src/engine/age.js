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
 * The youngest and oldest the app is built for.
 *
 * 12 rather than 10: below that a structured programme is not the right tool
 * regardless of how it is worded — training is play, PE and a club, and the
 * questionnaire's whole frame (a goal, a target date, a weekly split) does not
 * fit a ten-year-old. Everything downstream clamps to these, so a hand-edited
 * or imported profile cannot smuggle an age the plan was never designed around.
 *
 * They live here with the policy thresholds because they were the same bug
 * waiting to happen: the floor was written as a bare 10 in six files, and a
 * seventh would have disagreed the moment anybody changed one of them.
 */
export const MIN_AGE = 12;
export const MAX_AGE = 90;

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

/*
 * Where recovery between sessions measurably slows.
 *
 * These two were bare numbers inside the volume model's recovery factor, which
 * is precisely the shape of bug this file exists to stop: the warm-up needed a
 * line for "this body takes longer to be ready" and would otherwise have
 * invented a second one, leaving the app believing recovery slows at 65 in one
 * engine and 68 in another for the same person.
 *
 * They are not a verdict on anybody. Everything above them still trains; the
 * plan just stops assuming a session can be walked into cold.
 */
export const SLOWER_RECOVERY_FROM = 55;
export const MUCH_SLOWER_RECOVERY_FROM = 65;

/*
 * Where the plan stops choosing impact for somebody.
 *
 * Not the joints — the landing. Skipping, jogging on the spot and jumping jacks
 * are all decelerations, and deceleration is a balance task before it is a knee
 * task. This is the same line the rest-day tasks already drew for skipping rope,
 * and it is shared with them deliberately: two surfaces that both decide whether
 * to make somebody jump should not disagree about when to stop.
 *
 * Nothing here forbids jumping. It stops a generated plan from opening with it
 * for a trainee who never asked to jump and cannot see why it appeared.
 */
export const IMPACT_EASES_FROM = 60;

/*
 * Where a warm-up stops being allowed to consist entirely of floor work.
 *
 * Getting down to the floor and back up is a movement in its own right, and for
 * a trainee who finds it hard it is the hardest thing in the session — done
 * eight times, before the training has started. The rule is not that the floor
 * is banned: floor drills are the good ones and they stay. It is that a standing
 * alternative must exist, so a warm-up is never a wall a session cannot get past.
 */
export const STANDING_OPTION_FROM = MUCH_SLOWER_RECOVERY_FROM;

/*
 * Below this a body is ready quickly, and a long warm-up costs the session.
 *
 * A thirteen-year-old is warm after three minutes of movement; spending seven on
 * it out of a forty-five minute session buys nothing and takes the time straight
 * out of the training. Shares its number with HEAVY_LOAD_FROM and is kept
 * separate for the same reason ADULT_FROM is: they would be edited for different
 * reasons, and one silently following the other is the bug, not the tidy-up.
 */
export const WARMS_FAST_UNTIL = 16;

/** True when the plan should not choose jumping or running for somebody. */
export function easesImpact(profile) {
  const a = ageOf(profile);
  return a !== null && a >= IMPACT_EASES_FROM;
}

/** True when the warm-up must offer something that is not done on the floor. */
export function needsStandingOption(profile) {
  const a = ageOf(profile);
  return a !== null && a >= STANDING_OPTION_FROM;
}

/** True when tissue needs longer to be ready, so the warm-up earns more time. */
export function needsLongerWarmup(profile) {
  const a = ageOf(profile);
  return a !== null && a >= SLOWER_RECOVERY_FROM;
}

/** True when a body warms quickly and a long warm-up is time taken from training. */
export function warmsFast(profile) {
  const a = ageOf(profile);
  return a !== null && a >= MIN_AGE && a < WARMS_FAST_UNTIL;
}

/**
 * How long to hold a cool-down stretch, in seconds.
 *
 * Shorter holds do less as tissue gets stiffer with age, and the cool-down is
 * the one place in the session where spending another twenty seconds costs
 * nothing. The young end is not shortened for safety — it is shortened because a
 * thirteen-year-old will not hold a stretch for fifty seconds, and printing a
 * number nobody follows is worse than printing one they do.
 */
export function stretchHoldSeconds(profile) {
  const a = ageOf(profile);
  if (a === null) return 40;
  if (a < WARMS_FAST_UNTIL) return 25;
  if (a >= MUCH_SLOWER_RECOVERY_FROM) return 50;
  if (a >= SLOWER_RECOVERY_FROM) return 45;
  return 40;
}

/** True when some of a body-composition goal will close without training. */
export function stillDeveloping(profile) {
  const a = ageOf(profile);
  return a !== null && a >= MIN_AGE && a < STILL_DEVELOPING_UNTIL;
}

/*
 * The age on a profile, or null when there isn't one.
 *
 * The blank check comes before the conversion, and that ordering is the whole
 * function. Number(null) is 0, Number('') is 0, and 0 is a perfectly finite
 * number — so `Number.isFinite(Number(p.age))` answers "yes, this profile has
 * an age" for a profile with no age at all, and every gate below then reads
 * that zero as a child.
 *
 * A profile with a blank age got the treatment built for a twelve-year-old: no
 * calorie target, no weigh-in, fat loss refused on the grounds that the body is
 * still growing, and the photo scan turned off. The comment under these
 * functions has always said an unknown age is treated as an adult. It was
 * describing an intention the arithmetic did not carry out.
 */
function ageOf(profile) {
  const raw = profile && profile.age;
  if (raw === null || raw === undefined) return null;
  // Whitespace converts to 0 as readily as an empty string does: Number('   ')
  // is 0, so a field somebody typed a space into reads as a newborn.
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const n = Number(raw);
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
  if (a === null || a < MIN_AGE) return 0;
  if (a <= 15) return 0.09;            // through the spurt
  if (a >= 20) return 0;               // skeleton is done
  return 0.09 * ((20 - a) / 5);        // taper across 16-19
}
