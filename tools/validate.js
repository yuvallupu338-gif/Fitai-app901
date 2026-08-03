#!/usr/bin/env node
/*
 * validate.js — cross-checks the data + engine modules against docs/CONTRACTS.md.
 * Run with: node tools/validate.js
 * Exits non-zero on any error. Warnings do not fail the build.
 */

import { readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const PATTERNS = new Set(['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull',
  'squat', 'hinge', 'lunge', 'core_flexion', 'core_antiextension', 'core_rotation', 'calf',
  'arms_biceps', 'arms_triceps', 'shoulders_lateral', 'shoulders_rear', 'carry',
  'conditioning', 'mobility', 'plyo']);

const MUSCLES = new Set(['chest', 'back', 'lats', 'traps', 'shoulders', 'rear_delts', 'biceps',
  'triceps', 'forearms', 'core', 'obliques', 'lower_back', 'glutes', 'quads', 'hamstrings',
  'calves', 'hip_flexors', 'adductors', 'full_body']);

const EQUIPMENT = new Set(['none', 'pullup_bar', 'dip_bars', 'rings', 'bands', 'dumbbells',
  'barbell', 'kettlebell', 'bench', 'box', 'machines', 'cable', 'trx', 'jump_rope', 'mat',
  'sled', 'treadmill', 'bike', 'rower']);

const INJURIES = new Set(['lower_back', 'upper_back', 'neck', 'shoulder', 'elbow', 'wrist',
  'hip', 'knee', 'ankle', 'hernia', 'pregnancy', 'heart', 'asthma']);

async function load(rel) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) return null;
  try {
    return await import(pathToFileURL(abs).href);
  } catch (e) {
    err(`${rel}: import failed — ${e.message}`);
    return null;
  }
}

function isStr(v) { return typeof v === 'string' && v.length > 0; }
function isArrOf(v, fn) { return Array.isArray(v) && v.every(fn); }

/* ---------------- exercises ---------------- */

const exFiles = existsSync(resolve(ROOT, 'src/data'))
  ? readdirSync(resolve(ROOT, 'src/data')).filter((f) => /^exercises\..+\.js$/.test(f) && f !== 'exercises.index.js')
  : [];

const allEx = new Map();

for (const f of exFiles) {
  const mod = await load(`src/data/${f}`);
  if (!mod) continue;
  const lists = Object.values(mod).filter(Array.isArray);
  if (!lists.length) { err(`src/data/${f}: exports no array`); continue; }
  for (const list of lists) {
    for (const [i, e] of list.entries()) {
      const at = `${f}[${i}]${e && e.id ? ` id=${e.id}` : ''}`;
      if (!e || typeof e !== 'object') { err(`${at}: not an object`); continue; }
      if (!isStr(e.id) || !/^[a-z0-9_]+$/.test(e.id)) err(`${at}: bad id`);
      if (allEx.has(e.id)) err(`${at}: duplicate id (also in ${allEx.get(e.id)._file})`);
      if (!isStr(e.name)) err(`${at}: missing Hebrew name`);
      if (!isStr(e.nameEn)) err(`${at}: missing nameEn`);
      if (!PATTERNS.has(e.pattern)) err(`${at}: bad pattern "${e.pattern}"`);
      if (!e.muscles || !isArrOf(e.muscles.primary, (m) => MUSCLES.has(m))) err(`${at}: bad muscles.primary`);
      if (e.muscles && e.muscles.secondary && !isArrOf(e.muscles.secondary, (m) => MUSCLES.has(m))) err(`${at}: bad muscles.secondary`);
      if (!isArrOf(e.equipment, (q) => EQUIPMENT.has(q))) err(`${at}: bad equipment ${JSON.stringify(e.equipment)}`);
      if (!(e.level >= 1 && e.level <= 5)) err(`${at}: bad level`);
      if (!['reps', 'time', 'distance'].includes(e.unit)) err(`${at}: bad unit`);
      if (typeof e.unilateral !== 'boolean') err(`${at}: unilateral must be boolean`);
      if (!isArrOf(e.contraindications || [], (c) => INJURIES.has(c))) err(`${at}: bad contraindications`);
      if (!isArrOf(e.cues, isStr) || !e.cues.length) err(`${at}: needs at least one cue`);
      if (!isStr(e.anim)) err(`${at}: missing anim`);
      if (!Array.isArray(e.tags)) err(`${at}: tags must be an array`);
      if (e.id) { e._file = f; allEx.set(e.id, e); }
    }
  }
}

for (const e of allEx.values()) {
  for (const k of ['regressionOf', 'progressionTo']) {
    if (e[k] && !allEx.has(e[k])) err(`${e.id}: ${k} -> "${e[k]}" does not exist`);
  }
}

// Every pattern the split can ask for must actually be fillable, including for
// someone with no equipment at all.
const OWNER = 'push file owns horizontal_push/vertical_push/arms_triceps/shoulders_lateral/shoulders_rear; '
  + 'pull file owns horizontal_pull/vertical_pull/arms_biceps; '
  + 'legs file owns squat/hinge/lunge/calf/plyo; '
  + 'core file owns core_flexion/core_antiextension/core_rotation/carry/conditioning/mobility';

if (allEx.size) {
  for (const pat of PATTERNS) {
    const inPattern = Array.from(allEx.values()).filter((e) => e.pattern === pat);
    if (!inPattern.length) {
      err(`no exercises for pattern "${pat}" — the split can request it and the generator will starve (${OWNER})`);
      continue;
    }
    if (inPattern.length < 3) warn(`only ${inPattern.length} exercise(s) for pattern "${pat}"`);
    const bodyweight = inPattern.filter((e) => e.equipment.every((q) => q === 'none' || q === 'mat'));
    if (!bodyweight.length && pat !== 'carry') {
      warn(`pattern "${pat}" has no equipment-free option — home_bodyweight profiles cannot train it`);
    }
  }
  const warmup = Array.from(allEx.values()).filter((e) => (e.tags || []).includes('warmup'));
  if (warmup.length < 10) err(`only ${warmup.length} exercises tagged 'warmup' — the generator needs at least 10 to build warm-ups (core file owns mobility)`);
}

/* ---------------- clips ---------------- */

const clipFiles = existsSync(resolve(ROOT, 'src/data'))
  ? readdirSync(resolve(ROOT, 'src/data')).filter((f) => /^clips\..+\.js$/.test(f) && f !== 'clips.index.js')
  : [];

const allClips = new Map();

for (const f of clipFiles) {
  const mod = await load(`src/data/${f}`);
  if (!mod) continue;
  for (const val of Object.values(mod)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    for (const [id, c] of Object.entries(val)) {
      if (!c || typeof c !== 'object' || !Array.isArray(c.keys)) continue;
      const at = `${f}:${id}`;
      if (allClips.has(id)) err(`${at}: duplicate clip id`);
      if (!(c.duration > 200)) err(`${at}: duration must be > 200ms`);
      if (!c.keys.length) { err(`${at}: no keys`); continue; }
      if (c.keys[0].t !== 0) err(`${at}: first key must be t:0`);
      if (c.keys[c.keys.length - 1].t !== 1) err(`${at}: last key must be t:1`);
      for (let i = 1; i < c.keys.length; i++) {
        if (!(c.keys[i].t > c.keys[i - 1].t)) err(`${at}: key ${i} t not ascending`);
      }
      for (const [i, k] of c.keys.entries()) {
        if (!k.pose || typeof k.pose !== 'object') { err(`${at}: key ${i} has no pose`); continue; }
        for (const [pk, pv] of Object.entries(k.pose)) {
          if (typeof pv === 'number' && !isFinite(pv)) err(`${at}: key ${i} field ${pk} is not finite`);
          if (Array.isArray(pv) && (pv.length !== 2 || pv.some((n) => typeof n !== 'number' || !isFinite(n)))) {
            err(`${at}: key ${i} field ${pk} must be [num,num]`);
          }
          if (pv && typeof pv === 'object' && !Array.isArray(pv) && (typeof pv.x !== 'number' || typeof pv.y !== 'number')) {
            err(`${at}: key ${i} IK target ${pk} needs numeric x,y`);
          }
        }
      }
      const first = JSON.stringify(c.keys[0].pose);
      const last = JSON.stringify(c.keys[c.keys.length - 1].pose);
      if (c.loop !== false && first !== last) warn(`${at}: t:0 and t:1 poses differ — loop will jump`);
      allClips.set(id, c);
    }
  }
}

for (const e of allEx.values()) {
  if (!allClips.has(e.anim) && !PATTERNS.has(e.anim)) {
    err(`${e.id}: anim "${e.anim}" is neither a clip id nor a pattern name`);
  }
}

for (const pat of PATTERNS) {
  if (!allClips.has(pat)) err(`missing generic fallback clip for pattern "${pat}"`);
}

/* ---------------- engine ---------------- */

const REQUIRED = {
  'src/engine/volume.js': ['weeklyVolume', 'splitFor', 'sessionBudget'],
  'src/engine/generator.js': ['generateProgram'],
  'src/engine/progression.js': ['buildPhases', 'progressionModel', 'projectTargets', 'weeklyPlanNote'],
  'src/engine/targets.js': ['assessGoal', 'facts'],
  'src/engine/nutrition.js': ['nutritionPlan'],
  'src/intake/schema.js': ['STEPS', 'defaults', 'validateStep', 'normalizeProfile', 'summarize'],
};

for (const [file, names] of Object.entries(REQUIRED)) {
  const mod = await load(file);
  if (!mod) { err(`${file}: missing`); continue; }
  for (const n of names) if (!(n in mod)) err(`${file}: missing export "${n}"`);
}

/* ---------------- end-to-end smoke ---------------- */

const schema = await load('src/intake/schema.js');
const gen = await load('src/engine/generator.js');
const nut = await load('src/engine/nutrition.js');

if (schema && gen && typeof schema.defaults === 'function' && typeof gen.generateProgram === 'function') {
  const CASES = [
    { label: 'teen bodyweight', over: { age: 13, sex: 'male', heightCm: 166, weightKg: 48, goal: 'muscle', location: 'home_bodyweight', equipment: ['none', 'pullup_bar', 'mat'], daysPerWeek: 3, minutesPerSession: 75 } },
    { label: 'gym fatloss knee', over: { age: 34, sex: 'female', heightCm: 168, weightKg: 78, goal: 'fatloss', location: 'full_gym', daysPerWeek: 4, minutesPerSession: 60, injuries: ['knee'] } },
    { label: 'minimal home 2d', over: { age: 52, sex: 'male', heightCm: 175, weightKg: 92, goal: 'fitness', location: 'home_bodyweight', equipment: ['none'], daysPerWeek: 2, minutesPerSession: 30, injuries: ['lower_back', 'shoulder', 'knee'] } },
    { label: 'strength 6d', over: { age: 26, sex: 'male', heightCm: 182, weightKg: 84, goal: 'strength', experience: 'advanced', location: 'full_gym', daysPerWeek: 6, minutesPerSession: 90 } },
  ];

  for (const c of CASES) {
    try {
      const profile = schema.normalizeProfile(Object.assign(schema.defaults(), c.over));
      const prog = gen.generateProgram(profile);
      if (!prog || !Array.isArray(prog.days) || !prog.days.length) { err(`smoke "${c.label}": no days`); continue; }
      if (prog.days.length !== profile.daysPerWeek) err(`smoke "${c.label}": ${prog.days.length} days, expected ${profile.daysPerWeek}`);
      const seenKeys = new Set();
      for (const d of prog.days) {
        if (!d.slots || !d.slots.length) err(`smoke "${c.label}": day ${d.id} has no slots`);
        for (const s of d.slots || []) {
          const dk = `${d.id}:${s.key}`;
          if (seenKeys.has(dk)) err(`smoke "${c.label}": duplicate slot key ${dk}`);
          seenKeys.add(dk);
          if (!s.variants || !s.variants.length) { err(`smoke "${c.label}": ${dk} has no variants`); continue; }
          for (const v of s.variants) {
            const ex = allEx.get(v.exId);
            if (!ex) { err(`smoke "${c.label}": ${dk} unknown exId ${v.exId}`); continue; }
            const missing = ex.equipment.filter((q) => q !== 'none' && !profile.equipment.includes(q));
            if (missing.length) err(`smoke "${c.label}": ${dk} ${v.exId} needs ${missing.join(',')} which the profile lacks`);
            const bad = (ex.contraindications || []).filter((x) => profile.injuries.includes(x));
            if (bad.length && !String(v.note || '').startsWith('⚠︎')) {
              err(`smoke "${c.label}": ${dk} ${v.exId} hits injury ${bad.join(',')} without a caution note`);
            }
            if (!isStr(v.sets) && typeof v.sets !== 'number') err(`smoke "${c.label}": ${dk} ${v.exId} bad sets`);
            if (!isStr(v.reps)) err(`smoke "${c.label}": ${dk} ${v.exId} bad reps`);
          }
        }
      }
      // determinism
      const again = gen.generateProgram(profile);
      if (JSON.stringify(again) !== JSON.stringify(prog)) err(`smoke "${c.label}": generateProgram is not deterministic`);

      if (nut && typeof nut.nutritionPlan === 'function') {
        const np = nut.nutritionPlan(profile);
        if (!np || !Array.isArray(np.meals) || !np.meals.length) err(`smoke "${c.label}": nutritionPlan has no meals`);
        for (const m of np.meals || []) {
          if (!m.variants || m.variants.length < 4) err(`smoke "${c.label}": meal ${m.slot} has < 4 variants`);
        }
        if (profile.age < 16 && np.strategy !== null) err(`smoke "${c.label}": under-16 must have strategy null`);
      }
    } catch (e) {
      err(`smoke "${c.label}": threw — ${e.message}`);
    }
  }
}

/* ---------------- report ---------------- */

console.log(`exercises: ${allEx.size}   clips: ${allClips.size}`);
for (const w of warnings) console.log(`  warn  ${w}`);
for (const e of errors) console.log(`  ERROR ${e}`);
console.log(errors.length ? `\n${errors.length} error(s)` : '\nOK');
process.exit(errors.length ? 1 : 0);
