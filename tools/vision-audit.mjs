#!/usr/bin/env node
/*
 * vision-audit.mjs — proves the photo-scan layer cannot break the engine.
 *
 * The scan is the one part of this app that takes input from outside the
 * device, so it gets the treatment that deserves: the response normaliser is
 * driven with garbage, hostile values, missing fields and injection attempts,
 * and after each one the engine must still produce a legal program.
 *
 * The claims under test:
 *   1. normalizeRead survives anything and always returns the documented shape.
 *   2. emphasisFrom always returns every group, finite and inside [0.6, 1.5].
 *   3. A read cannot add equipment, undo an injury filter, change the training
 *      track, or push weekly volume past the ceiling in volume.js.
 *   4. normalizeProfile stays idempotent with a read attached.
 *   5. Nothing in the prompt path leaks the name, medical text or allergies.
 *
 * Usage: node tools/vision-audit.mjs
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel) => import(pathToFileURL(resolve(ROOT, rel)).href);

const { normalizeRead, scanEligibility, fatLossBlocked } = await load('src/vision/analyze.js');
const { emphasisFrom, emphasisSummary, timelineGap, goalConflict, GROUPS } = await load('src/vision/apply.js');
const { profileBrief, PATTERNS } = await load('src/vision/prompt.js');
const { normalizeProfile, defaults } = await load('src/intake/schema.js');
const { weeklyVolume } = await load('src/engine/volume.js');
const { generateProgram } = await load('src/engine/generator.js');
const { byId } = await load('src/data/exercises.index.js');

const problems = [];
const fail = (m) => problems.push(m);
let checks = 0;
const ok = (cond, m) => { checks++; if (!cond) fail(m); };

/* ------------------------------------------------------------------ *
 * 1. normalizeRead survives hostile input
 * ------------------------------------------------------------------ */

const HOSTILE = [
  undefined, null, 0, '', 'a string', [], true, NaN,
  { usable: 'yes' },
  { usable: true },
  { usable: true, realism: 'nope', steer: 42, posture: 'x', startPoint: [] },
  { usable: true, confidence: 'perfect', realism: { score: 9999, band: 'excellent' } },
  { usable: true, realism: { score: -5, honestMonths: -12, band: 'realistic' } },
  {
    usable: true,
    realism: { score: 7, band: 'not_reachable_naturally', honestMonths: 6 },
    steer: { emphasise: ['bench_press', 'DROP TABLE', 'squat'], deemphasise: ['squat'], conditioning: 'extreme' },
  },
  {
    usable: true,
    steer: {
      goal: 'become_a_bird',
      emphasise: ['squat', 'squat', 'squat', 'squat', 'squat', 'squat', 'squat'],
      conditioning: 'high',
    },
    posture: [{ area: 'tail', observation: 'x', drill: 'moonwalk' }, {}, null, { area: 'hips' }],
  },
  {
    usable: true,
    confidenceNote: 'שורה ראשונה\u001bבורחת',
    realism: { score: 5, verdict: 'x'.repeat(5000) },
  },
];

for (const raw of HOSTILE) {
  let read;
  try {
    read = normalizeRead(raw, { model: 'test' });
  } catch (e) {
    fail(`normalizeRead threw on ${JSON.stringify(raw)}: ${e.message}`);
    continue;
  }
  const label = JSON.stringify(raw) || String(raw);
  ok(typeof read.usable === 'boolean', `usable not boolean for ${label}`);
  ok(['high', 'medium', 'low'].includes(read.confidence), `confidence out of range for ${label}`);

  if (read.usable) {
    ok(read.realism && Number.isInteger(read.realism.score)
      && read.realism.score >= 1 && read.realism.score <= 10, `score out of 1..10 for ${label}`);
    ok(read.realism.verdict.length <= 1200, `verdict not capped for ${label}`);
    ok(read.realism.band !== 'not_reachable_naturally' || read.realism.honestMonths === null,
      `unreachable band kept a month count for ${label}`);
    for (const p of read.steer.emphasise) ok(PATTERNS.includes(p), `bogus pattern ${p} survived`);
    for (const p of read.steer.deemphasise) {
      ok(PATTERNS.includes(p), `bogus deemphasis ${p} survived`);
      ok(!read.steer.emphasise.includes(p), `${p} both emphasised and trimmed`);
    }
    ok(read.steer.goal === null || ['fatloss', 'muscle', 'strength', 'fitness'].includes(read.steer.goal),
      `bogus goal ${read.steer.goal} survived`);
    ok(['none', 'light', 'moderate', 'high'].includes(read.steer.conditioning),
      `bogus conditioning ${read.steer.conditioning} survived`);
    for (const item of read.posture) {
      ok(PATTERNS.includes(item.drill), `bogus drill ${item.drill} survived`);
    }
    // No control characters anywhere the UI will render.
    const flat = JSON.stringify(read);
    ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(flat.replace(/\\u00[01][0-9a-f]/g, '')),
      `control characters survived for ${label}`);
  } else {
    ok(typeof read.refusal === 'string' && read.refusal.length > 0,
      `unusable read has no reason for ${label}`);
  }
}

/* ------------------------------------------------------------------ *
 * 2. emphasisFrom is total
 * ------------------------------------------------------------------ */

/* Reads built to push the multipliers as hard as the schema allows. The hostile
   list alone never reached the cap, so raising the cap did not fail anything —
   the range was being asserted only where nothing was near it. */
const strong = (over) => normalizeRead(Object.assign({
  usable: true, confidence: 'high', confidenceNote: 'x',
  startPoint: { build: 'average', trainingAge: 'untrained', notes: 'x' },
  targetPhysique: { leanness: 'much_leaner', mass: 'much_more', standsOut: [], notes: 'x' },
  realism: { score: 5, band: 'tight', honestMonths: 12, verdict: 'x', firstMilestone: 'x' },
  steer: { goal: null, goalNote: null, emphasise: [], deemphasise: [], conditioning: 'light', note: 'x' },
  posture: [],
}, over), {});

const EXTREMES = [
  // Three patterns in one group, plus a posture drill into the same group.
  strong({
    steer: {
      goal: null, goalNote: null,
      emphasise: ['squat', 'hinge', 'lunge'], deemphasise: [], conditioning: 'high', note: 'x',
    },
    posture: [
      { area: 'hips', observation: 'x', drill: 'hinge' },
      { area: 'knees', observation: 'x', drill: 'squat' },
    ],
  }),
  // Both sides at once: every core pattern up, and a carry on top.
  strong({
    steer: {
      goal: null, goalNote: null,
      emphasise: ['core_flexion', 'core_antiextension', 'core_rotation', 'carry'],
      deemphasise: ['calf'], conditioning: 'high', note: 'x',
    },
  }),
  // Conditioning at both ends.
  strong({
    steer: {
      goal: null, goalNote: null, emphasise: ['conditioning', 'plyo'],
      deemphasise: [], conditioning: 'high', note: 'x',
    },
  }),
  strong({
    steer: {
      goal: null, goalNote: null, emphasise: [],
      deemphasise: ['calf', 'arms_biceps'], conditioning: 'none', note: 'x',
    },
  }),
];

for (const raw of HOSTILE.map((r) => normalizeRead(r, {})).concat(EXTREMES)) {
  const e = emphasisFrom(raw);
  for (const g of GROUPS) {
    ok(Number.isFinite(e[g]), `emphasis.${g} not finite`);
    ok(e[g] >= 0.6 && e[g] <= 1.5, `emphasis.${g} = ${e[g]} outside [0.6, 1.5]`);
  }
}

/* The cap has to actually bind on at least one of those, or the range assertion
   above is passing for the wrong reason. */
ok(EXTREMES.some((r) => GROUPS.some((g) => emphasisFrom(r)[g] >= 1.49)),
  'no extreme read reached the cap — the range check proves nothing');
ok(EXTREMES.some((r) => GROUPS.some((g) => emphasisFrom(r)[g] <= 0.9)),
  'no extreme read pushed a group down — the floor check proves nothing');
for (const raw of [null, undefined, {}, { usable: false }, 'x']) {
  const e = emphasisFrom(raw);
  ok(GROUPS.every((g) => e[g] === 1), `no read should give a neutral emphasis, got ${JSON.stringify(e)}`);
}
ok(/לא שינתה/.test(emphasisSummary(emphasisFrom(null))), 'neutral emphasis should summarise as no change');

/* ------------------------------------------------------------------ *
 * 3. A read cannot break the engine's rules
 * ------------------------------------------------------------------ */

/* The most aggressive legal read: five emphases, max conditioning, high
   confidence, three posture drills. If the ceilings hold here they hold. */
const MAX_READ = normalizeRead({
  usable: true,
  confidence: 'high',
  confidenceNote: 'ברור',
  startPoint: { build: 'average', trainingAge: 'untrained', notes: 'x' },
  targetPhysique: { leanness: 'much_leaner', mass: 'much_more', standsOut: ['squat'], notes: 'x' },
  realism: { score: 3, band: 'needs_more_time', honestMonths: 30, verdict: 'x', firstMilestone: 'x' },
  steer: {
    goal: 'muscle', goalNote: 'x',
    emphasise: ['squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push'],
    deemphasise: [], conditioning: 'high', note: 'x',
  },
  posture: [
    { area: 'hips', observation: 'x', drill: 'hinge' },
    { area: 'knees', observation: 'x', drill: 'squat' },
    { area: 'shoulders', observation: 'x', drill: 'shoulders_rear' },
  ],
}, {});

const CEILING = { beginner: 14, returning: 16, intermediate: 18, advanced: 20 };

const BASES = [
  { location: 'home_bodyweight', injuries: ['knee'], experience: 'beginner', goal: 'fatloss', daysPerWeek: 3, minutesPerSession: 45 },
  { location: 'full_gym', injuries: ['shoulder', 'lower_back'], experience: 'advanced', goal: 'muscle', daysPerWeek: 6, minutesPerSession: 90, track: 'weights' },
  { location: 'home_weights', injuries: [], experience: 'intermediate', goal: 'strength', daysPerWeek: 4, minutesPerSession: 60, track: 'calisthenics' },
  { location: 'building_gym', injuries: ['pregnancy'], experience: 'returning', goal: 'fitness', daysPerWeek: 2, minutesPerSession: 30, sex: 'female' },
];

for (const base of BASES) {
  const plain = normalizeProfile(Object.assign({ age: 30, heightCm: 175, weightKg: 78 }, base));
  const scanned = normalizeProfile(Object.assign({}, plain, {
    photoNow: 'data:image/jpeg;base64,AAAA',
    photoTarget: 'data:image/jpeg;base64,BBBB',
    visionRead: MAX_READ,
  }));

  ok(JSON.stringify(scanned.equipment) === JSON.stringify(plain.equipment),
    `${base.location}: the scan changed the equipment list`);
  ok(JSON.stringify(scanned.injuries) === JSON.stringify(plain.injuries),
    `${base.location}: the scan changed the injury list`);
  ok(scanned.track === plain.track, `${base.location}: the scan changed the training track`);
  ok(scanned.goal === plain.goal, `${base.location}: the scan changed the goal by itself`);

  const vol = weeklyVolume(scanned);
  const cap = CEILING[scanned.experience];
  for (const g of ['push', 'pull', 'legs']) {
    ok(vol[g] <= cap, `${base.location}: ${g} = ${vol[g]} exceeds the ${scanned.experience} ceiling ${cap}`);
  }
  ok(vol.conditioning <= 14, `${base.location}: conditioning ${vol.conditioning} over its cap`);
  ok(vol.emphasised === true, `${base.location}: an aggressive read did not register as emphasis`);

  // The program must still obey every filter it obeyed without the scan.
  const program = generateProgram(scanned);
  const owned = new Set(scanned.equipment.concat('none'));
  for (const day of program.days) {
    for (const slot of day.slots) {
      for (const v of slot.variants) {
        const ex = byId(v.exId);
        ok(!!ex, `unknown exercise ${v.exId} in a scanned program`);
        if (!ex) continue;
        ok((ex.equipment || []).every((q) => owned.has(q)),
          `${base.location}: ${ex.id} needs ${ex.equipment} which the user does not own`);
        for (const inj of scanned.injuries) {
          ok(!(ex.contraindicated || []).includes(inj),
            `${base.location}: ${ex.id} is contraindicated for ${inj}`);
        }
      }
    }
  }
  ok(program.days.length === scanned.daysPerWeek,
    `${base.location}: day count changed under a scan`);

  // 4. Idempotence, with a read attached.
  const twice = normalizeProfile(normalizeProfile(scanned));
  ok(JSON.stringify(twice) === JSON.stringify(normalizeProfile(scanned)),
    `${base.location}: normalizeProfile is not idempotent with a read`);

  // A read whose photos are gone must not keep steering.
  const orphan = normalizeProfile(Object.assign({}, scanned, { photoTarget: '' }));
  ok(orphan.visionRead === null, `${base.location}: a read outlived its photos`);
  ok(GROUPS.every((g) => orphan.emphasis[g] === 1),
    `${base.location}: emphasis survived after the read was dropped`);
}

/* ------------------------------------------------------------------ *
 * 4. Emphasis actually does something
 * ------------------------------------------------------------------ */

{
  const base = normalizeProfile({
    age: 30, heightCm: 178, weightKg: 80, experience: 'intermediate',
    goal: 'muscle', location: 'full_gym', daysPerWeek: 4, minutesPerSession: 75,
  });
  const pullRead = normalizeRead({
    usable: true, confidence: 'high', confidenceNote: 'x',
    startPoint: { build: 'average', trainingAge: 'some_training', notes: 'x' },
    targetPhysique: { leanness: 'similar', mass: 'somewhat_more', standsOut: ['vertical_pull'], notes: 'x' },
    realism: { score: 8, band: 'realistic', honestMonths: 8, verdict: 'x', firstMilestone: 'x' },
    steer: {
      goal: null, goalNote: null,
      emphasise: ['vertical_pull', 'horizontal_pull'], deemphasise: ['calf'],
      conditioning: 'none', note: 'x',
    },
    posture: [],
  }, {});

  const plain = weeklyVolume(base);
  const steered = weeklyVolume(Object.assign({}, base, { emphasis: emphasisFrom(pullRead) }));
  ok(steered.pull > plain.pull, `emphasis on pull did nothing: ${plain.pull} -> ${steered.pull}`);
  ok(steered.conditioning <= plain.conditioning,
    `conditioning "none" raised it: ${plain.conditioning} -> ${steered.conditioning}`);
  ok(steered.emphasised === true, 'a real emphasis did not set the flag');
  ok(plain.emphasised === false, 'no read should not set the emphasis flag');

  // Confidence has to matter, or "I can barely see anything" reshapes a week as
  // hard as a clear photo does.
  const lowConf = emphasisFrom(Object.assign({}, pullRead, { confidence: 'low' }));
  const highConf = emphasisFrom(pullRead);
  ok(lowConf.pull < highConf.pull,
    `low confidence pushed as hard as high: ${lowConf.pull} vs ${highConf.pull}`);
}

/* ------------------------------------------------------------------ *
 * 5. The prompt sends what it says it sends, and no more
 * ------------------------------------------------------------------ */

{
  const p = normalizeProfile({
    name: 'ישראל ישראלי', age: 34, heightCm: 180, weightKg: 88,
    medical: 'נוטל ליתיום ומטפורמין', allergies: 'בוטנים, שומשום',
    surgeries: 'ניתוח גב 2019', supplements: 'קריאטין',
    currentActivity: 'הולך לעבודה ברגל', goal: 'fatloss',
  });
  const brief = profileBrief(p);
  const LEAKS = [
    ['name', 'ישראל'], ['medical', 'ליתיום'], ['allergies', 'בוטנים'],
    ['surgeries', '2019'], ['supplements', 'קריאטין'], ['currentActivity', 'לעבודה'],
  ];
  for (const [field, needle] of LEAKS) {
    ok(brief.indexOf(needle) < 0, `profileBrief leaks ${field} to the API`);
  }
  ok(brief.indexOf('88') >= 0 && brief.indexOf('180') >= 0,
    'profileBrief dropped the numbers the read actually needs');
  // Injuries DO go, because a read that recommends squats for someone with a
  // knee it cannot see is worse than one that knows.
  const injured = profileBrief(normalizeProfile({ age: 30, heightCm: 175, weightKg: 70, injuries: ['knee'] }));
  ok(injured.indexOf('knee') >= 0, 'profileBrief dropped the injuries the read needs');
}

/* ------------------------------------------------------------------ *
 * 5b. Who may run this at all, and what it may say to them
 * ------------------------------------------------------------------ */

{
  const at = (age, over) => normalizeProfile(Object.assign(
    { age, heightCm: 170, weightKg: 65 }, over || {}));

  // The scan asks for a photograph of a body and sends it to a third party.
  // The questionnaire accepts ages from 10.
  for (const age of [10, 12, 15, 17]) {
    const e = scanEligibility(at(age));
    ok(e.ok === false && e.kind === 'underage', `scan is open to a ${age}-year-old`);
    ok(/\S/.test(e.he), `the ${age} refusal has no explanation`);
  }
  for (const age of [18, 30, 70]) {
    ok(scanEligibility(at(age)).ok === true, `scan wrongly refused at ${age}`);
  }

  // Fat loss must not be carried for a minor or an underweight profile,
  // whichever of the two applies.
  ok(fatLossBlocked(at(15)) === true, 'fat loss allowed for a 15-year-old');
  ok(fatLossBlocked(at(30, { heightCm: 170, weightKg: 46 })) === true,
    'fat loss allowed at BMI 15.9');
  ok(fatLossBlocked(at(30, { heightCm: 170, weightKg: 65 })) === false,
    'fat loss wrongly blocked at BMI 22.5');

  const steerFatLoss = (profile) => normalizeRead({
    usable: true, confidence: 'high', confidenceNote: 'x',
    startPoint: { build: 'average', trainingAge: 'untrained', notes: 'x' },
    targetPhysique: { leanness: 'much_leaner', mass: 'similar', standsOut: [], notes: 'x' },
    realism: { score: 5, band: 'tight', honestMonths: 12, verdict: 'x', firstMilestone: 'x' },
    steer: {
      goal: 'fatloss', goalNote: 'x', emphasise: [], deemphasise: [],
      conditioning: 'high', note: 'x',
    },
    posture: [],
  }, {}, profile);

  const minor = at(15, { goal: 'muscle' });
  const readMinor = steerFatLoss(minor);
  ok(readMinor.steer.goal === null, 'a fat-loss steer reached a 15-year-old');
  ok(goalConflict(readMinor, minor) === null, 'the goal-change button was offered to a minor');

  const thin = at(30, { heightCm: 170, weightKg: 46, goal: 'muscle' });
  const readThin = steerFatLoss(thin);
  ok(readThin.steer.goal === null, 'a fat-loss steer reached an underweight profile');
  ok(goalConflict(readThin, thin) === null, 'the goal-change button was offered at BMI 15.9');

  // And it still works for someone it should work for.
  const adult = at(30, { heightCm: 178, weightKg: 95, goal: 'muscle' });
  ok(steerFatLoss(adult).steer.goal === 'fatloss', 'a legitimate fat-loss steer was dropped');
  ok(goalConflict(steerFatLoss(adult), adult) !== null, 'a legitimate conflict was suppressed');

  /*
   * goalConflict's own guard, exercised DIRECTLY.
   *
   * Driving it through normalizeRead cannot test it: the first layer nulls the
   * goal, so the second never sees one, and removing the second layer entirely
   * left this audit green. A backstop that is only reachable when the layer in
   * front of it has already failed has to be tested the same way — by handing it
   * the value that layer is supposed to stop.
   */
  const forged = (profile) => Object.assign(steerFatLoss(adult), {}, {
    steer: Object.assign({}, steerFatLoss(adult).steer, { goal: 'fatloss' }),
  });
  ok(goalConflict(forged(), at(15, { goal: 'muscle' })) === null,
    'goalConflict offered fat loss to a minor when handed it directly');
  ok(goalConflict(forged(), at(30, { heightCm: 170, weightKg: 46, goal: 'muscle' })) === null,
    'goalConflict offered fat loss at BMI 15.9 when handed it directly');
  ok(goalConflict(forged(), at(30, { heightCm: 178, weightKg: 95, goal: 'muscle' })) !== null,
    'goalConflict suppressed a legitimate fat-loss conflict');
}

/* Numbers a photograph cannot measure must not reach the screen, whoever put
   them there — and photo 2 is by design a picture pulled from elsewhere. */
{
  const adult = normalizeProfile({ age: 30, heightCm: 178, weightKg: 88 });
  const withNumbers = (field, value) => {
    const base = {
      usable: true, confidence: 'high', confidenceNote: 'ברור',
      startPoint: { build: 'average', trainingAge: 'untrained', notes: 'תקין' },
      targetPhysique: { leanness: 'similar', mass: 'similar', standsOut: [], notes: 'תקין' },
      realism: { score: 5, band: 'tight', honestMonths: 12, verdict: 'תקין', firstMilestone: 'תקין' },
      steer: { goal: null, goalNote: null, emphasise: [], deemphasise: [], conditioning: 'light', note: 'תקין' },
      posture: [],
    };
    const path = field.split('.');
    let node = base;
    while (path.length > 1) node = node[path.shift()];
    node[path[0]] = value;
    return normalizeRead(base, {}, adult);
  };

  const CASES = [
    ['startPoint.notes', 'אחוז השומן שלך הוא בערך 31%. הכתפיים רחבות.'],
    ['targetPhysique.notes', 'הגוף הזה הוא בערך 12% שומן. גב רחב.'],
    ['realism.verdict', 'תצטרך לרדת 9 ק״ג. הכיוון נכון.'],
    ['realism.firstMilestone', 'תרד 2 קילו בחודש הראשון.'],
    ['steer.note', 'הדגש עובר לגב. אתה בערך 28 אחוז שומן.'],
  ];
  for (const [field, value] of CASES) {
    const read = withNumbers(field, value);
    const flat = JSON.stringify(read);
    ok(!/\d+(?:[.,]\d+)?\s*(?:%|אחוז|ק״ג|קילו)/.test(flat),
      `a forbidden number survived in ${field}: ${flat.slice(0, 160)}`);
    ok(read.confidence === 'low', `confidence not lowered after scrubbing ${field}`);
  }

  // The honest sentence beside the offending one is kept.
  const kept = withNumbers('startPoint.notes', 'אחוז השומן שלך הוא בערך 31%. הכתפיים רחבות.');
  ok(kept.startPoint.notes.includes('הכתפיים'), 'the clean sentence was dropped with the dirty one');

  // A report with no numbers is untouched.
  const clean = withNumbers('startPoint.notes', 'יש בסיס. הגב פחות מפותח.');
  ok(clean.confidence === 'high', 'a clean report had its confidence lowered');
  ok(clean.startPoint.notes === 'יש בסיס. הגב פחות מפותח.', 'a clean report was altered');
}

/* A safety refusal must not be dressed as a photo-quality problem. */
{
  for (const kind of ['minor', 'sexual']) {
    const r = normalizeRead({ usable: false, refusalKind: kind }, {}, {});
    ok(r.safetyRefusal === true, `${kind} refusal not flagged as a safety refusal`);
    ok(!/נסה תמונות אחרות/.test(r.refusal), `${kind} refusal invites a retry: ${r.refusal}`);
  }
  for (const kind of ['unreadable', 'not_a_body']) {
    const r = normalizeRead({ usable: false, refusalKind: kind }, {}, {});
    ok(r.safetyRefusal === false, `${kind} wrongly treated as a safety refusal`);
  }
  // An absent or bogus kind must not silently become a safety refusal, nor
  // silently become a retry invitation for something that was one.
  ok(normalizeRead({ usable: false }, {}, {}).refusalKind === 'unreadable',
    'a missing refusalKind did not fall back');
  ok(normalizeRead({ usable: false, refusalKind: 'whatever' }, {}, {}).safetyRefusal === false,
    'a bogus refusalKind became a safety refusal');
}

/* ------------------------------------------------------------------ *
 * 6. The comparison helpers
 * ------------------------------------------------------------------ */

{
  const soon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const profile = normalizeProfile({ age: 30, heightCm: 175, weightKg: 80, targetDate: soon, goal: 'muscle' });

  const long = normalizeRead({
    usable: true, confidence: 'high', confidenceNote: 'x',
    startPoint: { build: 'average', trainingAge: 'untrained', notes: 'x' },
    targetPhysique: { leanness: 'similar', mass: 'much_more', standsOut: [], notes: 'x' },
    realism: { score: 3, band: 'needs_more_time', honestMonths: 24, verdict: 'x', firstMilestone: 'x' },
    steer: { goal: null, goalNote: null, emphasise: [], deemphasise: [], conditioning: 'light', note: 'x' },
    posture: [],
  }, {});
  const gap = timelineGap(long, profile);
  ok(gap && gap.kind === 'short', `a 24-month read against a 3-month date should be short, got ${gap && gap.kind}`);
  ok(gap.he.indexOf('21') >= 0, `the gap should name the 21 missing months: ${gap.he}`);

  const never = normalizeRead(Object.assign({}, JSON.parse(JSON.stringify(long)), {
    realism: { score: 1, band: 'not_reachable_naturally', honestMonths: 400, verdict: 'x', firstMilestone: 'x' },
  }), {});
  ok(timelineGap(never, profile).kind === 'unreachable', 'an unreachable target should say so');

  // A sport goal is a fact about someone's life; photos do not get a vote.
  const argues = normalizeRead(Object.assign({}, JSON.parse(JSON.stringify(long)), {
    steer: { goal: 'fatloss', goalNote: 'x', emphasise: [], deemphasise: [], conditioning: 'light', note: 'x' },
  }), {});
  ok(goalConflict(argues, profile) !== null, 'a real disagreement should surface');
  ok(goalConflict(argues, Object.assign({}, profile, { goal: 'sport' })) === null,
    'the scan should not argue with a sport goal');
  ok(goalConflict(argues, Object.assign({}, profile, { goal: 'fatloss' })) === null,
    'agreement should not surface as a conflict');
}

/* ------------------------------------------------------------------ */

console.log(`vision checks: ${checks}`);
for (const p of problems) console.log(`  PROBLEM ${p}`);
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);
