/*
 * analyze.js — run the read, then distrust the answer.
 *
 * Everything coming back from the API is treated as untrusted input, because
 * that is what it is: a model's output, shaped partly by two images a stranger
 * could have written text onto. The API validates the response against the tool
 * schema, which is a real check, but it is not this app's check. So every field
 * is re-checked here against the same closed enums, every string is trimmed and
 * length-capped, every unknown pattern is dropped, and anything missing falls
 * back to a value that means "no opinion" rather than to a default that would
 * quietly steer the plan.
 *
 * The result of that is a simple guarantee: no response, however wrong or
 * hostile, can make the app produce a program it would not otherwise be able to
 * produce. The worst a bad read can do is shift weekly volume between groups,
 * inside the ceilings volume.js already enforces.
 */

import { callTool, imageBlock, dataUrlBytes, AiError, choiceFor } from '../ai/client.js';
import { PHOTO_SCAN_FROM, withholdsPhotoScan } from '../engine/age.js';
import { fatLossHold } from '../engine/holds.js';
import { SYSTEM, TOOL, PATTERNS, buildMessage } from './prompt.js';

const PATTERN_SET = new Set(PATTERNS);

/* Two 768px JPEGs are well under this. The check exists so a hand-edited
   profile cannot try to push ten megabytes through a phone connection. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/*
 * Who may run this at all.
 *
 * The scan asks for a photograph of a body in tight clothing and sends it to a
 * third party. That is the whole argument for the gate — and the app already
 * KNOWS the age, so leaving the decision to a model guessing from the picture
 * was choosing the least reliable instrument available over the answer sitting
 * in the profile.
 *
 * The threshold comes from age.js now. It was a local `const MIN_SCAN_AGE = 18`
 * beside a local `Number.isFinite(age) && age < 18`, which is the same rule
 * written twice and, worse, written differently: Number(null) is 0 and 0 is
 * finite, so a profile with no age was refused here while the questionnaire
 * showed it the photo fields. Conservative, and still two files disagreeing
 * about the same person. The comment above the gates in age.js — an unknown age
 * is treated as an adult — is the policy; this file was quietly voting against
 * it.
 *
 * The sentence claiming "the questionnaire accepts ages from 10" went with it.
 * It has been 12 since the app moved, and a stale number in a safety comment is
 * how the next person gets the threshold wrong.
 */

/**
 * True when a fat-loss steer must not be shown, whoever suggested it.
 *
 * This used to re-derive the answer from age and BMI, which is two of the four
 * reasons the app has for refusing a deficit. The other two are the medical
 * ones, and they are the reasons the refusal exists at all: measured, a profile
 * declaring pregnancy — by chip or in free text — and a profile declaring a
 * history of anorexia were both offered a one-tap button changing their goal to
 * fat loss, with the model's own argument for it underneath. The engine went on
 * refusing the deficit downstream, so the app's position was that she may not
 * have it and may be invited to ask.
 *
 * holds.js exists so there is one home for every refusal to run a deficit, and
 * a second copy of a safety rule is a copy that will drift. It drifted here
 * within one cycle of being written.
 */
export function fatLossBlocked(profile) {
  return fatLossHold(profile) !== null;
}

/**
 * Whether the scan may run for this profile. Exported so the UI can say no
 * before the photos are even chosen, rather than after they are uploaded.
 */
export function scanEligibility(profile) {
  if (withholdsPhotoScan(profile)) {
    return {
      ok: false,
      kind: 'underage',
      he: `סריקת התמונות פתוחה מגיל ${PHOTO_SCAN_FROM}. `
        + 'זה לא קשור לתוכנית — היא נבנית לך במלואה בלי הסריקה, בדיוק כמו לכל אחד אחר.',
    };
  }
  return { ok: true, kind: null, he: '' };
}

const BUILDS = ['lean', 'average', 'carrying_weight', 'muscular', 'unclear'];
const TRAINING_AGES = ['untrained', 'some_training', 'clearly_trained', 'unclear'];
const LEANNESS = ['much_leaner', 'somewhat_leaner', 'similar', 'less_lean', 'unclear'];
const MASS = ['much_more', 'somewhat_more', 'similar', 'less', 'unclear'];
const BANDS = ['realistic', 'tight', 'needs_more_time', 'not_reachable_naturally'];
const GOALS = ['fatloss', 'muscle', 'strength', 'fitness'];
/* 'unchanged' is not an amount of cardio, it is the absence of an opinion about
   cardio, and the enum has to carry one: the other four all move the weekly
   conditioning block, so without it every usable scan moved cardio whether or
   not the photos said anything about it. It is also the fallback, because a
   missing or unrecognised answer is exactly the case where there is no opinion —
   falling back to 'light' (x0.8) meant a scan that never mentioned cardio cut
   it, and in a muscle or strength plan, where the block is two or three sets to
   begin with, cut it below the floor in volume.js and deleted it. */
const CONDITIONING = ['unchanged', 'none', 'light', 'moderate', 'high'];
const AREAS = ['shoulders', 'upper_back', 'lower_back', 'hips', 'knees', 'ankles', 'neck'];
/* Why a read was refused. 'unreadable' and 'not_a_body' are quality problems and
   retrying with better photos is the right advice. 'minor' and 'sexual' are
   safety refusals, and telling someone to try other photos is telling them how
   to get around one. */
const REFUSAL_KINDS = ['unreadable', 'not_a_body', 'minor', 'sexual'];
const CONFIDENCE = ['high', 'medium', 'low'];

/* ------------------------------------------------------------------ *
 * Coercion helpers
 * ------------------------------------------------------------------ */

function oneOf(value, allowed, fallback) {
  return allowed.indexOf(value) >= 0 ? value : fallback;
}

/* Control characters, minus the newline and tab a paragraph legitimately uses. */
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Trimmed, length-capped, and stripped of the control characters that would
    let a response break the layout it is rendered into. */
function text(value, max) {
  const s = String(value === null || value === undefined ? '' : value)
    .replace(CONTROL_RE, '')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/*
 * The prompt forbids stating a body-fat percentage or a weight as though it were
 * measured. That was a request to the model with nothing behind it, and it is
 * the single output class the prompt itself calls out as harmful — so it is also
 * the one worth enforcing rather than asking for.
 *
 * A sentence carrying such a number is dropped rather than edited: a half-fixed
 * sentence reads as authored, and a response that broke a hard rule deserves
 * less trust, not quiet repair. `scrub` reports whether it fired so the caller
 * can lower confidence.
 */
const FORBIDDEN_NUMBER = /\d+(?:[.,]\d+)?\s*(?:%|אחוז|ק״ג|קילו|kg|kilo)/i;

function scrub(value, max) {
  const raw = text(value, max);
  if (!raw || !FORBIDDEN_NUMBER.test(raw)) return { text: raw, hit: false };
  const kept = raw
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => !FORBIDDEN_NUMBER.test(sentence))
    .join(' ')
    .trim();
  return { text: kept, hit: true };
}

function intIn(value, lo, hi, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function patternList(value, max) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const v of value) {
    if (PATTERN_SET.has(v) && out.indexOf(v) < 0) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * normalizeRead
 * ------------------------------------------------------------------ */

/**
 * Turns whatever came back into the fixed shape the rest of the app consumes.
 * Exported because it is pure, and the tests drive it directly with hostile
 * input rather than through a network call.
 */
export function normalizeRead(raw, meta, profile) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const noFatLoss = fatLossBlocked(profile);
  let scrubbed = false;
  const clean = (v, max) => {
    const got = scrub(v, max);
    if (got.hit) scrubbed = true;
    return got.text;
  };

  const out = {
    v: 1,
    at: (meta && meta.at) || new Date().toISOString(),
    model: (meta && meta.model) || '',
    usable: r.usable === true,
    refusal: text(r.refusal, 400) || null,
    refusalKind: oneOf(r.refusalKind, REFUSAL_KINDS, 'unreadable'),
    // A safety refusal must not be presented as a photo-quality problem, and
    // must not leave the same two pictures one retry away from passing.
    safetyRefusal: false,
    confidence: oneOf(r.confidence, CONFIDENCE, 'low'),
    confidenceNote: text(r.confidenceNote, 400),
    startPoint: null,
    targetPhysique: null,
    realism: null,
    steer: null,
    posture: [],
  };

  if (!out.usable) {
    out.safetyRefusal = out.refusalKind === 'minor' || out.refusalKind === 'sexual';
    if (!out.refusal) {
      out.refusal = out.safetyRefusal
        ? 'לא אנתח את התמונות האלה.'
        : 'לא הצלחתי לקרוא את התמונות האלה. נסה תמונות אחרות.';
    }
    return out;
  }

  const sp = r.startPoint && typeof r.startPoint === 'object' ? r.startPoint : {};
  out.startPoint = {
    build: oneOf(sp.build, BUILDS, 'unclear'),
    trainingAge: oneOf(sp.trainingAge, TRAINING_AGES, 'unclear'),
    notes: clean(sp.notes, 700),
  };

  const tp = r.targetPhysique && typeof r.targetPhysique === 'object' ? r.targetPhysique : {};
  out.targetPhysique = {
    leanness: oneOf(tp.leanness, LEANNESS, 'unclear'),
    mass: oneOf(tp.mass, MASS, 'unclear'),
    standsOut: patternList(tp.standsOut, 5),
    notes: clean(tp.notes, 700),
  };

  const re = r.realism && typeof r.realism === 'object' ? r.realism : {};
  const band = oneOf(re.band, BANDS, 'tight');
  out.realism = {
    score: intIn(re.score, 1, 10, 5),
    band,
    // "Not reachable naturally" and a number of months are contradictory. When
    // the model sends both, the band wins — the whole point of that band is
    // that there is no honest date to give.
    honestMonths: band === 'not_reachable_naturally' ? null : intIn(re.honestMonths, 1, 240, null),
    verdict: clean(re.verdict, 1200),
    firstMilestone: clean(re.firstMilestone, 300),
  };

  const st = r.steer && typeof r.steer === 'object' ? r.steer : {};
  const emphasise = patternList(st.emphasise, 5);
  out.steer = {
    // A fat-loss steer is dropped here rather than hidden later, so the value
    // never exists to be rendered, stored or acted on.
    goal: noFatLoss && st.goal === 'fatloss' ? null : oneOf(st.goal, GOALS, null),
    goalNote: text(st.goalNote, 400) || null,
    emphasise,
    // A pattern cannot be both emphasised and trimmed; emphasis wins.
    deemphasise: patternList(st.deemphasise, 2).filter((x) => emphasise.indexOf(x) < 0),
    conditioning: oneOf(st.conditioning, CONDITIONING, 'unchanged'),
    note: clean(st.note, 700),
  };
  if (!out.steer.goal) out.steer.goalNote = null;

  if (Array.isArray(r.posture)) {
    for (const item of r.posture.slice(0, 3)) {
      if (!item || typeof item !== 'object') continue;
      const area = oneOf(item.area, AREAS, null);
      const observation = clean(item.observation, 300);
      if (!area || !observation) continue;
      out.posture.push({
        area,
        observation,
        drill: PATTERN_SET.has(item.drill) ? item.drill : 'mobility',
      });
    }
  }

  if (scrubbed) {
    out.confidence = 'low';
    out.confidenceNote = (`${out.confidenceNote} `
      + 'חלק מהתשובה כלל מספרים שתמונה לא יכולה למדוד, והוסר.').trim();
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * analyze
 * ------------------------------------------------------------------ */

/**
 * Reads the two photos on the profile and returns a normalised read.
 *
 * @param {Object} profile   needs photoNow, photoTarget and the basic numbers
 * @param {Object} [opts]    { signal, model }
 */
export async function analyze(profile, opts) {
  const p = profile || {};
  const o = opts || {};

  // First, ahead of every other check. Who may run this does not depend on which
  // provider is configured, and answering a fourteen-year-old with "no vision
  // model selected" is both untrue and an invitation to go and select one.
  const eligible = scanEligibility(p);
  if (!eligible.ok) throw new AiError(eligible.kind, eligible.he);

  // The image block is provider-shaped, so the provider has to be resolved
  // before the photos can even be packed.
  const chosen = choiceFor('vision');
  const provider = chosen.provider;
  if (!provider || !provider.vision) {
    throw new AiError('no_vision',
      'לא נבחר מודל ראייה. הסריקה קוראת תמונות ודורשת ספק שמקבל אותן.');
  }

  const now = imageBlock(p.photoNow, provider);
  const target = imageBlock(p.photoTarget, provider);
  if (!now || !target) {
    throw new AiError('missing_photos',
      'צריך שתי תמונות — אחת שלך היום ואחת של הגוף שאתה מכוון אליו.');
  }

  const bytes = dataUrlBytes(p.photoNow) + dataUrlBytes(p.photoTarget);
  if (bytes > MAX_IMAGE_BYTES) {
    throw new AiError('too_big', 'התמונות כבדות מדי. בחר תמונות קטנות יותר.');
  }

  const model = o.model || chosen.model;
  const input = await callTool({
    job: 'vision',
    system: SYSTEM,
    messages: buildMessage(p, now, target),
    tool: { name: TOOL.name, description: TOOL.description, schema: TOOL.input_schema },
    maxTokens: 2500,
    provider: provider.id,
    model,
    signal: o.signal,
  });

  return normalizeRead(input, { model, at: new Date().toISOString() }, p);
}

/* Exported for the same reason PATTERNS is exported from prompt.js: so the audit
   can check a read against the enum itself instead of against a copy of it that
   silently goes stale the next time a value is added. */
export { CONDITIONING };

export { AiError };
/* Kept as an alias: scan.js and the audits have always caught VisionError. */
export { AiError as VisionError };
