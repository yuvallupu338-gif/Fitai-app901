#!/usr/bin/env node
/*
 * ai-audit.mjs — proves the provider layer and the free-text intake reader
 * cannot break the questionnaire.
 *
 * The photo scan has its own audit; this one covers what was added alongside a
 * second vendor:
 *
 *   1. A text-only provider is never offered for a job that needs eyes, and
 *      cannot be selected into one by a hand-edited setting.
 *   2. Each vendor's request is built in that vendor's shape — Anthropic takes
 *      system as a field and returns a parsed object, the OpenAI-compatible one
 *      takes system as a message and returns arguments as a STRING that can be
 *      malformed.
 *   3. normalizePatch survives anything and emits only fields the form has,
 *      with values the form would accept.
 *   4. A patch, however hostile, still produces a legal program: no equipment
 *      the user does not own, no exercise contraindicated for a declared injury.
 *
 * Usage: node tools/ai-audit.mjs
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel) => import(pathToFileURL(resolve(ROOT, rel)).href);

const { PROVIDERS, providerById, providersFor, modelsFor } = await load('src/ai/providers.js');
const { normalizePatch, TOOL: INTAKE_TOOL } = await load('src/ai/intake.js');
const { imageBlock, choiceFor } = await load('src/ai/client.js');
const { normalizeProfile, EQUIPMENT_OPTIONS, INJURY_OPTIONS } = await load('src/intake/schema.js');
const { generateProgram } = await load('src/engine/generator.js');
const { byId } = await load('src/data/exercises.index.js');

const problems = [];
let checks = 0;
const ok = (cond, m) => { checks++; if (!cond) problems.push(m); };

/* ------------------------------------------------------------------ *
 * 1. Vision is a capability, not a preference
 * ------------------------------------------------------------------ */

ok(PROVIDERS.length >= 2, 'the point of this layer is more than one provider');
ok(PROVIDERS.some((p) => !p.vision), 'no text-only provider present — the filter is untested');

for (const p of providersFor('vision')) {
  ok(p.vision === true, `${p.id} is offered for vision but cannot see`);
  ok(typeof p.image === 'function', `${p.id} is offered for vision but has no image format`);
  for (const m of modelsFor(p, 'vision')) {
    ok(m.vision === true, `${p.id}/${m.value} is offered for vision but the model cannot see`);
  }
}
ok(providersFor('text').length >= providersFor('vision').length,
  'the text job should accept at least as many providers as the vision job');

for (const p of PROVIDERS) {
  ok(/^https:\/\//.test(p.endpoint), `${p.id} endpoint is not https`);
  ok(p.models.length > 0, `${p.id} has no models`);
  // A text-only provider must have no way to encode an image at all, so a bug
  // upstream cannot quietly send one and get a confusing 400 back.
  if (!p.vision) {
    ok(p.image === null, `${p.id} is text-only but exposes an image encoder`);
    ok(imageBlock('data:image/jpeg;base64,AAAA', p) === null,
      `${p.id} is text-only but produced an image block`);
    ok(modelsFor(p, 'vision').length === 0, `${p.id} offers models for a job it cannot do`);
  }
}

/* A stored choice pointing a text-only provider at the vision job must be
   discarded, not honoured. Simulated by driving the same guard directly. */
{
  const textOnly = PROVIDERS.find((p) => !p.vision);
  const allowed = providersFor('vision');
  // Guarded: when a provider wrongly claims vision there is no text-only one
  // left, and the audit has to report that rather than throw on the way.
  ok(!!textOnly, 'no text-only provider to test the vision filter with');
  if (textOnly) {
    ok(!allowed.some((p) => p.id === textOnly.id),
      'a text-only provider survived the vision filter');
  }
  // No localStorage in node, so choiceFor falls back — which must still be legal.
  const fallback = choiceFor('vision');
  ok(fallback.provider && fallback.provider.vision === true,
    'the vision fallback provider cannot see');
  ok(modelsFor(fallback.provider, 'vision').some((m) => m.value === fallback.model),
    'the vision fallback model is not one of that provider\'s vision models');
  const textChoice = choiceFor('text');
  ok(!!textChoice.provider && !!textChoice.model, 'the text job has no usable fallback');
}

/* ------------------------------------------------------------------ *
 * 2. Each vendor's request shape
 * ------------------------------------------------------------------ */

const REQ = {
  model: 'test-model',
  maxTokens: 500,
  system: 'SYSTEM TEXT',
  messages: [{ role: 'user', content: 'hello' }],
  tool: { name: 'do_thing', description: 'd', schema: { type: 'object', properties: {} } },
};

{
  const a = providerById('anthropic');
  const body = a.body(REQ);
  ok(body.system === 'SYSTEM TEXT', 'anthropic: system must be a top-level field');
  ok(body.messages.length === 1, 'anthropic: system must not be pushed into messages');
  ok(body.tools[0].input_schema && !body.tools[0].parameters,
    'anthropic: the schema field is input_schema');
  ok(body.tool_choice.type === 'tool' && body.tool_choice.name === 'do_thing',
    'anthropic: tool_choice shape wrong');
  const got = a.extract({
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', name: 'do_thing', input: { a: 1 } }],
  }, 'do_thing');
  ok(got.ok && got.input.a === 1, 'anthropic: failed to extract a tool call');
  ok(a.extract({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'no' }] }, 'do_thing').ok === false,
    'anthropic: a text-only reply was read as a tool call');
  ok(a.headers('KEY')['anthropic-dangerous-direct-browser-access'] === 'true',
    'anthropic: the browser-access header is required and missing');
  ok(a.headers('KEY')['x-api-key'] === 'KEY', 'anthropic: key must be x-api-key');
}

{
  const d = providerById('deepseek');
  const body = d.body(REQ);
  ok(body.system === undefined, 'openai-compatible: system must not be a top-level field');
  ok(body.messages[0].role === 'system' && body.messages[0].content === 'SYSTEM TEXT',
    'openai-compatible: system must be the first message');
  ok(body.messages.length === 2, 'openai-compatible: the user message was lost');
  ok(body.tools[0].type === 'function' && body.tools[0].function.parameters,
    'openai-compatible: the schema field is function.parameters');
  ok(body.tool_choice.function.name === 'do_thing', 'openai-compatible: tool_choice shape wrong');
  ok(d.headers('KEY').authorization === 'Bearer KEY', 'openai-compatible: key must be a bearer token');

  const good = d.extract({
    choices: [{ message: { tool_calls: [{ function: { name: 'do_thing', arguments: '{"a":1}' } }] } }],
  }, 'do_thing');
  ok(good.ok && good.input.a === 1, 'openai-compatible: failed to extract a tool call');

  // The arguments are a string, so a 200 can still carry unparseable content.
  const bad = d.extract({
    choices: [{ message: { tool_calls: [{ function: { name: 'do_thing', arguments: '{oops' } }] } }],
  }, 'do_thing');
  ok(bad.ok === false && bad.stop === 'bad_arguments',
    'openai-compatible: malformed JSON arguments were not caught');
  ok(d.extract({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] }, 'do_thing').ok === false,
    'openai-compatible: a prose reply was read as a tool call');
  ok(d.extract({}, 'do_thing').ok === false, 'openai-compatible: an empty body was read as a tool call');
}

/* ------------------------------------------------------------------ *
 * 3. normalizePatch is total
 * ------------------------------------------------------------------ */

const EQUIPMENT = new Set(EQUIPMENT_OPTIONS.map((o) => o.value));
const INJURIES = new Set(INJURY_OPTIONS.map((o) => o.value));
const FIELDS = new Set(Object.keys(INTAKE_TOOL.schema.properties)
  .filter((k) => k !== 'understood' && k !== 'missing'));

const HOSTILE = [
  undefined, null, 0, '', 'a string', [], true, NaN,
  {},
  { understood: 'x' },
  { age: 4, heightCm: 900, weightKg: -60, sleepHours: 40, stress: 99, commitment: 0 },
  { age: '34', heightCm: '178', weightKg: '88.5' },
  { goal: 'become_a_bird', sex: 'yes', experience: 'godlike', location: 'the_moon', track: 'jazz' },
  { equipment: ['barbell', 'lightsaber', 'barbell'], injuries: ['knee', 'soul'], diet: ['vegan', 'air'] },
  { avoid: ['ריצה', '', null, 'x'.repeat(500)], medical: 'y'.repeat(5000), allergies: 'z'.repeat(5000) },
  { sport: 'כדורסל' },                                   // sport with no sport goal
  { goal: 'sport', sport: 'כדורסל' },
  { minutesPerSession: 37, daysPerWeek: 99, mealsPerDay: 1 },
  { withPartner: 'yes', wantsNutrition: 1 },
  { understood: 'שורה ראשונה\u001bבורחת', missing: ['a', 'b', 'c', 'd', 'e', 'f'] },
  { __proto__: { polluted: true }, age: 30 },
  { constructor: 'x', prototype: 'y', age: 30 },
];

for (const raw of HOSTILE) {
  let out;
  try {
    out = normalizePatch(raw);
  } catch (e) {
    problems.push(`normalizePatch threw on ${JSON.stringify(raw)}: ${e.message}`);
    continue;
  }
  const label = JSON.stringify(raw) || String(raw);
  ok(out && typeof out.patch === 'object', `no patch object for ${label}`);
  ok(Array.isArray(out.set), `no set list for ${label}`);
  ok(Array.isArray(out.missing) && out.missing.length <= 4, `missing not capped for ${label}`);
  ok(typeof out.understood === 'string', `understood not a string for ${label}`);
  ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(JSON.stringify(out).replace(/\\u00[01][0-9a-f]/g, '')),
    `control characters survived for ${label}`);

  for (const k of Object.keys(out.patch)) {
    ok(FIELDS.has(k), `patch invented the field "${k}" for ${label}`);
  }
  ok(out.set.length === Object.keys(out.patch).length, `set and patch disagree for ${label}`);
  for (const k of out.set) ok(k in out.patch, `set names "${k}" which is not in the patch`);

  const p = out.patch;
  if ('age' in p) ok(p.age >= 10 && p.age <= 90, `age ${p.age} out of range`);
  if ('heightCm' in p) ok(p.heightCm >= 120 && p.heightCm <= 220, `height ${p.heightCm} out of range`);
  if ('weightKg' in p) ok(p.weightKg >= 25 && p.weightKg <= 250, `weight ${p.weightKg} out of range`);
  if ('daysPerWeek' in p) ok(p.daysPerWeek >= 2 && p.daysPerWeek <= 6, `days ${p.daysPerWeek} out of range`);
  if ('minutesPerSession' in p) {
    ok([30, 45, 60, 75, 90].includes(p.minutesPerSession), `minutes ${p.minutesPerSession} not an option`);
  }
  if ('equipment' in p) for (const q of p.equipment) ok(EQUIPMENT.has(q), `bogus equipment ${q}`);
  if ('injuries' in p) for (const i of p.injuries) ok(INJURIES.has(i), `bogus injury ${i}`);
  if ('medical' in p) ok(p.medical.length <= 400, 'medical not capped');
  if ('allergies' in p) ok(p.allergies.length <= 200, 'allergies not capped');
  if ('avoid' in p) ok(p.avoid.every((a) => a.length <= 40), 'avoid entries not capped');
  // A sport name is meaningless without the sport goal, and would be dropped
  // downstream — so it must not appear as a filled field.
  if ('sport' in p) ok(p.goal === 'sport', 'sport survived without the sport goal');
}

ok(normalizePatch({ age: 30 }).set.includes('age'), 'a legal field did not survive');
ok(!normalizePatch({ age: 30 }).set.includes('goal'), 'an absent field was invented');
ok(Object.keys(normalizePatch({}).patch).length === 0, 'an empty response produced a non-empty patch');
ok(({}).polluted === undefined, 'prototype pollution reached Object.prototype');

/* ------------------------------------------------------------------ *
 * 4. A patch cannot produce an illegal program
 * ------------------------------------------------------------------ */

const BASES = [
  { location: 'home_bodyweight', injuries: ['knee'], experience: 'beginner', goal: 'fatloss' },
  { location: 'full_gym', injuries: ['shoulder', 'lower_back'], experience: 'advanced', goal: 'muscle' },
  { location: 'home_weights', injuries: [], experience: 'intermediate', goal: 'strength' },
];

const PATCHES = HOSTILE.map((r) => normalizePatch(r).patch).filter((p) => Object.keys(p).length);

for (const base of BASES) {
  const start = normalizeProfile(Object.assign({ age: 30, heightCm: 175, weightKg: 78 }, base));
  for (const patch of PATCHES) {
    // Exactly what the wizard does: merge, then normalise, then generate.
    const merged = normalizeProfile(Object.assign({}, start, patch));
    let program;
    try {
      program = generateProgram(merged);
    } catch (e) {
      problems.push(`generateProgram threw for ${base.location} + ${JSON.stringify(patch)}: ${e.message}`);
      continue;
    }
    checks++;
    const owned = new Set(merged.equipment.concat('none'));
    for (const day of program.days) {
      for (const slot of day.slots) {
        for (const v of slot.variants) {
          const ex = byId(v.exId);
          if (!ex) { problems.push(`unknown exercise ${v.exId}`); continue; }
          if (!(ex.equipment || []).every((q) => owned.has(q))) {
            problems.push(`${base.location}: ${ex.id} needs ${ex.equipment}, user owns ${[...owned]}`);
          }
          for (const inj of merged.injuries) {
            if ((ex.contraindicated || []).includes(inj)) {
              problems.push(`${base.location}: ${ex.id} is contraindicated for ${inj}`);
            }
          }
        }
      }
    }
    ok(program.days.length === merged.daysPerWeek, `${base.location}: day count wrong after a patch`);
    const twice = normalizeProfile(merged);
    ok(JSON.stringify(twice) === JSON.stringify(merged),
      `${base.location}: normalizeProfile is not idempotent after a patch`);
  }
}

/* ------------------------------------------------------------------ */

console.log(`ai checks: ${checks}`);
for (const p of problems) console.log(`  PROBLEM ${p}`);
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);
