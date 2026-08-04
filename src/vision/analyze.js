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

import { callTool, imageBlock, dataUrlBytes, VisionError, loadModel } from './client.js';
import { SYSTEM, TOOL, PATTERNS, buildMessage } from './prompt.js';

const PATTERN_SET = new Set(PATTERNS);

/* Two 768px JPEGs are well under this. The check exists so a hand-edited
   profile cannot try to push ten megabytes through a phone connection. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const BUILDS = ['lean', 'average', 'carrying_weight', 'muscular', 'unclear'];
const TRAINING_AGES = ['untrained', 'some_training', 'clearly_trained', 'unclear'];
const LEANNESS = ['much_leaner', 'somewhat_leaner', 'similar', 'less_lean', 'unclear'];
const MASS = ['much_more', 'somewhat_more', 'similar', 'less', 'unclear'];
const BANDS = ['realistic', 'tight', 'needs_more_time', 'not_reachable_naturally'];
const GOALS = ['fatloss', 'muscle', 'strength', 'fitness'];
const CONDITIONING = ['none', 'light', 'moderate', 'high'];
const AREAS = ['shoulders', 'upper_back', 'lower_back', 'hips', 'knees', 'ankles', 'neck'];
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
export function normalizeRead(raw, meta) {
  const r = raw && typeof raw === 'object' ? raw : {};

  const out = {
    v: 1,
    at: (meta && meta.at) || new Date().toISOString(),
    model: (meta && meta.model) || '',
    usable: r.usable === true,
    refusal: text(r.refusal, 400) || null,
    confidence: oneOf(r.confidence, CONFIDENCE, 'low'),
    confidenceNote: text(r.confidenceNote, 400),
    startPoint: null,
    targetPhysique: null,
    realism: null,
    steer: null,
    posture: [],
  };

  if (!out.usable) {
    if (!out.refusal) out.refusal = 'לא הצלחתי לקרוא את התמונות האלה. נסה תמונות אחרות.';
    return out;
  }

  const sp = r.startPoint && typeof r.startPoint === 'object' ? r.startPoint : {};
  out.startPoint = {
    build: oneOf(sp.build, BUILDS, 'unclear'),
    trainingAge: oneOf(sp.trainingAge, TRAINING_AGES, 'unclear'),
    notes: text(sp.notes, 700),
  };

  const tp = r.targetPhysique && typeof r.targetPhysique === 'object' ? r.targetPhysique : {};
  out.targetPhysique = {
    leanness: oneOf(tp.leanness, LEANNESS, 'unclear'),
    mass: oneOf(tp.mass, MASS, 'unclear'),
    standsOut: patternList(tp.standsOut, 5),
    notes: text(tp.notes, 700),
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
    verdict: text(re.verdict, 1200),
    firstMilestone: text(re.firstMilestone, 300),
  };

  const st = r.steer && typeof r.steer === 'object' ? r.steer : {};
  const emphasise = patternList(st.emphasise, 5);
  out.steer = {
    goal: oneOf(st.goal, GOALS, null),
    goalNote: text(st.goalNote, 400) || null,
    emphasise,
    // A pattern cannot be both emphasised and trimmed; emphasis wins.
    deemphasise: patternList(st.deemphasise, 2).filter((x) => emphasise.indexOf(x) < 0),
    conditioning: oneOf(st.conditioning, CONDITIONING, 'light'),
    note: text(st.note, 700),
  };
  if (!out.steer.goal) out.steer.goalNote = null;

  if (Array.isArray(r.posture)) {
    for (const item of r.posture.slice(0, 3)) {
      if (!item || typeof item !== 'object') continue;
      const area = oneOf(item.area, AREAS, null);
      const observation = text(item.observation, 300);
      if (!area || !observation) continue;
      out.posture.push({
        area,
        observation,
        drill: PATTERN_SET.has(item.drill) ? item.drill : 'mobility',
      });
    }
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

  const now = imageBlock(p.photoNow);
  const target = imageBlock(p.photoTarget);
  if (!now || !target) {
    throw new VisionError('missing_photos',
      'צריך שתי תמונות — אחת שלך היום ואחת של הגוף שאתה מכוון אליו.');
  }

  const bytes = dataUrlBytes(p.photoNow) + dataUrlBytes(p.photoTarget);
  if (bytes > MAX_IMAGE_BYTES) {
    throw new VisionError('too_big', 'התמונות כבדות מדי. בחר תמונות קטנות יותר.');
  }

  const model = o.model || loadModel();
  const input = await callTool({
    system: SYSTEM,
    messages: buildMessage(p, now, target),
    tool: TOOL,
    maxTokens: 2500,
    model,
    signal: o.signal,
  });

  return normalizeRead(input, { model, at: new Date().toISOString() });
}

export { VisionError };
