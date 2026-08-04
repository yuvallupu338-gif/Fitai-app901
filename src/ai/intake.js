/*
 * intake.js — turn a paragraph into answers.
 *
 * The questionnaire is nine steps, and nine steps is the single biggest reason
 * someone opens this app and does not finish. Most people can describe their
 * situation in four sentences — "I'm 34, I have dumbbells at home, my left
 * shoulder hurts on overhead stuff, three evenings a week, want to lose the
 * belly by summer" — and every one of those clauses is an answer to a question
 * further down the form.
 *
 * This is the job a text model is genuinely good at, and it is a job that needs
 * no eyes, which matters because the vendors are not interchangeable: the photo
 * scan needs a model that can see, and this one does not.
 *
 * WHAT COMES BACK IS A PATCH, NOT A PROFILE.
 *
 * The model proposes values for fields it actually heard. Everything else is
 * left alone. The patch is then filtered here against the same closed enums the
 * questionnaire uses, and handed to normalizeProfile, which clamps every number
 * and drops every unknown token — the same path a hand-typed answer takes. So
 * the worst a wrong or hostile response can do is fill the form with a legal
 * answer the user can see and correct, which is exactly what the review step
 * exists for. It cannot write a field the form does not have, and it cannot put
 * a value in one that the form would reject.
 */

import { callTool, AiError } from './client.js';
import { EQUIPMENT_OPTIONS, INJURY_OPTIONS, DIET_OPTIONS } from '../intake/schema.js';

const EQUIPMENT = EQUIPMENT_OPTIONS.map((o) => o.value);
const INJURIES = INJURY_OPTIONS.map((o) => o.value);
const DIETS = DIET_OPTIONS.map((o) => o.value);

const GOALS = ['fatloss', 'muscle', 'strength', 'fitness', 'sport'];
const EXPERIENCE = ['beginner', 'returning', 'intermediate', 'advanced'];
const LOCATIONS = ['full_gym', 'building_gym', 'home_weights', 'home_bodyweight'];
const TRACKS = ['calisthenics', 'weights', 'mixed'];
const SEXES = ['male', 'female', 'other'];
const TIMES = ['morning', 'noon', 'evening'];

export const SYSTEM = `You read a person's own description of their training situation and fill
in the questionnaire they were about to answer by hand. The app is Hebrew and
so is the user's text.

Fill ONLY what they actually said or clearly implied. Leaving a field out is
always correct and always safe — the questionnaire will ask for it, with its
own default, exactly as it would have anyway. Guessing is not safe: a wrong
answer looks identical to a right one on the review screen, so the user will
scroll past it.

Some specifics that decide most cases:

  * "I train at home with dumbbells" is location home_weights, not a full gym.
    A gym in an apartment building is building_gym: a few dumbbells, maybe a
    treadmill, not a rack. Nothing at all is home_bodyweight.
  * Equipment they NAME goes in the equipment list even if the location already
    implies it. Equipment they do not name does not.
  * Any pain, injury, surgery or "I have to be careful with X" maps to the
    injuries list if there is a matching area. If they describe a limitation
    with no matching area, put it in the notes field instead of forcing it.
  * Exercises they refuse — "I don't do burpees", "running is out" — go in
    avoid, as the plain Hebrew word they used.
  * Days per week is what they say they will REALLY do, not an aspiration. If
    they give a range, take the lower number.
  * Do not infer sex from grammar alone unless it is unambiguous, and never
    infer age, height or weight from anything other than a number they gave.
  * A target weight is only a target weight if they named one. "I want to lose
    weight" is a goal, not a number.

Never invent a medical detail, an allergy, or a number. If they mention a
medical condition, copy what they said into medical rather than interpreting
it. You are transcribing into a form, not diagnosing.`;

export const TOOL = {
  name: 'fill_intake',
  description:
    'Fill in the fields the user actually described. Omit every field they did not mention.',
  schema: {
    type: 'object',
    properties: {
      age: { type: 'integer', minimum: 10, maximum: 90 },
      sex: { type: 'string', enum: SEXES },
      heightCm: { type: 'integer', minimum: 120, maximum: 220 },
      weightKg: { type: 'number', minimum: 25, maximum: 250 },

      experience: { type: 'string', enum: EXPERIENCE },
      goal: { type: 'string', enum: GOALS },
      sport: { type: 'string', description: 'Only when goal is sport: the sport, in Hebrew.' },
      targetWeightKg: {
        type: 'number', minimum: 25, maximum: 250,
        description: 'Only when they named a target weight.',
      },

      daysPerWeek: { type: 'integer', minimum: 2, maximum: 6 },
      minutesPerSession: { type: 'integer', enum: [30, 45, 60, 75, 90] },
      timeOfDay: { type: 'string', enum: TIMES },

      location: { type: 'string', enum: LOCATIONS },
      track: { type: 'string', enum: TRACKS },
      equipment: {
        type: 'array', items: { type: 'string', enum: EQUIPMENT },
        description: 'Only equipment they named.',
      },

      injuries: {
        type: 'array', items: { type: 'string', enum: INJURIES },
        description: 'Areas they said hurt, are injured, or need care.',
      },
      avoid: {
        type: 'array', items: { type: 'string' },
        description: 'Exercises they refuse, in the Hebrew words they used.',
      },
      medical: { type: 'string', description: 'Their own words about a condition or medication.' },

      sleepHours: { type: 'number', minimum: 4, maximum: 12 },
      stress: { type: 'integer', minimum: 1, maximum: 5 },
      commitment: { type: 'integer', minimum: 1, maximum: 5 },

      withPartner: { type: 'boolean' },
      wantsNutrition: { type: 'boolean' },
      mealsPerDay: { type: 'integer', minimum: 3, maximum: 6 },
      diet: { type: 'array', items: { type: 'string', enum: DIETS } },
      allergies: { type: 'string', description: 'Their own words. Never inferred.' },

      understood: {
        type: 'string',
        description:
          'One or two Hebrew sentences saying what you took from their text. Shown to the '
          + 'user so they can see what was filled in before they review the form.',
      },
      missing: {
        type: 'array', items: { type: 'string' },
        description:
          'Up to four short Hebrew phrases naming what they did NOT say and the form still '
          + 'needs — so they know what to look for rather than being surprised by a default.',
      },
    },
    required: ['understood'],
  },
};

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function text(value, max) {
  const s = String(value === null || value === undefined ? '' : value)
    .replace(CONTROL_RE, '')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function numIn(value, lo, hi) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n < lo || n > hi ? undefined : n;
}

function intIn(value, lo, hi) {
  const n = numIn(value, lo, hi);
  return n === undefined ? undefined : Math.round(n);
}

function oneOf(value, allowed) {
  return allowed.indexOf(value) >= 0 ? value : undefined;
}

function subsetOf(value, allowed, max) {
  if (!Array.isArray(value)) return undefined;
  const out = [];
  for (const v of value) {
    if (allowed.indexOf(v) >= 0 && out.indexOf(v) < 0) out.push(v);
    if (out.length >= max) break;
  }
  return out.length ? out : undefined;
}

/**
 * The proposed patch, with every field either legal or absent.
 *
 * Pure, and exported so the audit can drive it with hostile input rather than
 * through a network call. `set` records which keys survived, which is what the
 * UI highlights — a field the model claimed but that did not survive filtering
 * must not be shown as filled.
 */
export function normalizePatch(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const patch = {};
  const put = (k, v) => { if (v !== undefined && v !== '') patch[k] = v; };

  put('age', intIn(r.age, 10, 90));
  put('sex', oneOf(r.sex, SEXES));
  put('heightCm', intIn(r.heightCm, 120, 220));
  put('weightKg', numIn(r.weightKg, 25, 250));

  put('experience', oneOf(r.experience, EXPERIENCE));
  put('goal', oneOf(r.goal, GOALS));
  // A sport name without the sport goal would be dropped by normalizeProfile
  // anyway; keeping them together stops the review screen showing a stray value.
  if (patch.goal === 'sport') put('sport', text(r.sport, 60));
  put('targetWeightKg', numIn(r.targetWeightKg, 25, 250));

  put('daysPerWeek', intIn(r.daysPerWeek, 2, 6));
  put('minutesPerSession', oneOf(intIn(r.minutesPerSession, 20, 120), [30, 45, 60, 75, 90]));
  put('timeOfDay', oneOf(r.timeOfDay, TIMES));

  put('location', oneOf(r.location, LOCATIONS));
  put('track', oneOf(r.track, TRACKS));
  put('equipment', subsetOf(r.equipment, EQUIPMENT, EQUIPMENT.length));

  put('injuries', subsetOf(r.injuries, INJURIES, INJURIES.length));
  if (Array.isArray(r.avoid)) {
    const avoid = r.avoid.map((v) => text(v, 40)).filter(Boolean).slice(0, 10);
    if (avoid.length) patch.avoid = avoid;
  }
  put('medical', text(r.medical, 400));

  put('sleepHours', numIn(r.sleepHours, 4, 12));
  put('stress', intIn(r.stress, 1, 5));
  put('commitment', intIn(r.commitment, 1, 5));

  if (typeof r.withPartner === 'boolean') patch.withPartner = r.withPartner;
  if (typeof r.wantsNutrition === 'boolean') patch.wantsNutrition = r.wantsNutrition;
  put('mealsPerDay', intIn(r.mealsPerDay, 3, 6));
  put('diet', subsetOf(r.diet, DIETS, DIETS.length));
  put('allergies', text(r.allergies, 200));

  const missing = Array.isArray(r.missing)
    ? r.missing.map((m) => text(m, 60)).filter(Boolean).slice(0, 4)
    : [];

  return {
    patch,
    set: Object.keys(patch),
    understood: text(r.understood, 400),
    missing,
  };
}

/* ------------------------------------------------------------------ *
 * The call
 * ------------------------------------------------------------------ */

const MAX_INPUT = 4000;

/**
 * Reads a free-text description and returns { patch, set, understood, missing }.
 *
 * @param {string} description  the user's own words
 * @param {Object} [opts]       { signal }
 */
export async function readIntake(description, opts) {
  const o = opts || {};
  const body = text(description, MAX_INPUT);
  if (body.length < 12) {
    throw new AiError('too_short',
      'כתוב קצת יותר — גיל, איפה אתה מתאמן, כמה פעמים בשבוע, ומה המטרה.');
  }

  const input = await callTool({
    job: 'text',
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `זה מה שהמשתמש כתב על עצמו:\n\n${body}\n\n`
        + 'מלא את השאלון לפי מה שהוא באמת אמר. מה שהוא לא אמר — אל תמלא.',
    }],
    tool: TOOL,
    maxTokens: 1500,
    signal: o.signal,
  });

  return normalizePatch(input);
}

export { AiError };
