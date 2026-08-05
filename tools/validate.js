#!/usr/bin/env node
/*
 * validate.js — cross-checks the data + engine modules against docs/CONTRACTS.md.
 * Run with: node tools/validate.js
 * Exits non-zero on any error. Warnings do not fail the build.
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
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

/* Pose fields measured in degrees, where a difference of a full turn is the
   same frame. Positions are not — 50 and 410 are two different places. */
const ANGLE_KEYS = new Set(['spine', 'head', 'footL', 'footR']);

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

/* ---------------- the refusal chips ---------------- */

/*
 * Every chip the "exercises I will not do" question offers must actually remove
 * something. Two of them never had: the terms were בורפי and הנדסטנד while the
 * library says ברפי and עמידת ידיים, so ticking either did nothing and the user
 * was then prescribed the exact movement they had refused. A refusal that
 * silently fails is worse than not asking.
 */
{
  const schema = await load('src/intake/schema.js');
  const registry = await load('src/data/exercises.index.js');
  if (schema && registry && schema.STEPS) {
    const limits = schema.STEPS.find((st) => st.id === 'limits');
    const field = limits && limits.fields.find((f) => f.key === 'avoid');
    const seen = new Set();
    if (!field) {
      err('the limits step has no avoid field');
    } else {
      for (const [track, location] of [
        ['calisthenics', 'full_gym'], ['weights', 'full_gym'],
        ['mixed', 'full_gym'], ['calisthenics', 'home_bodyweight'],
        ['mixed', 'home_weights'],
      ]) {
        const base = schema.normalizeProfile({
          track, location, age: 25, heightCm: 175, weightKg: 75, experience: 'advanced',
        });
        const offered = typeof field.options === 'function' ? field.options(base) : field.options;
        const before = registry.candidates(base, {}).length;
        for (const o of offered) {
          const after = registry.candidates(
            schema.normalizeProfile(Object.assign({}, base, { avoid: [o.value] })), {},
          ).length;
          if (before - after <= 0) {
            err(`avoid chip "${o.label}" removes nothing for ${track}/${location} — the term matches no exercise`);
          }
        }
        if (!offered.length) err(`no avoid chips offered for ${track}/${location}`);
        for (const o of offered) seen.add(o.value);
      }
      // A term that matches nothing does not show up as a dead chip — it shows
      // up as no chip, in every configuration, which hides the authoring
      // mistake instead of surfacing it. So the DECLARED list is checked too.
      for (const o of (schema.AVOID_OPTIONS || [])) {
        if (!seen.has(o.value)) {
          err(`avoid chip "${o.label}" (${o.value}) is never offered anywhere — its term matches no exercise in any track`);
        }
      }
    }
  }
}

/*
 * Every option a step offers must describe equipment that step's own answers
 * say the user has.
 *
 * The questionnaire asks where you train, seeds a kit from that, and then asks
 * how you want to train — all on one screen. The track descriptions were a
 * fixed list, so someone answering "בית עם משקולות" (dumbbells, bands, a mat)
 * was offered a track called "מכונות ומשקולות" described as "מוט, משקולות,
 * מכונות ופולי". Three of those four did not exist for them, two lines under
 * their own answer. Nothing downstream broke — the generator already filters by
 * equipment — which is exactly why it survived: the only symptom was the
 * questionnaire contradicting itself, and no test read the prose.
 */
async function checkOptionsMatchKit(schema, err) {
  const HE = {
    machines: ['מכונות'], cable: ['פולי'], barbell: ['מוט '],
    dip_bars: ['מקבילים'], rings: ['טבעות'],
    // Added after the first fix named bands to a building gym that has none —
    // the replacement wording repeated the defect one layer down, and the
    // check could not see it because its vocabulary stopped at the heavy gear.
    bands: ['גומיות'], kettlebell: ['קטלבל'], treadmill: ['הליכון'],
  };
  const GEAR_IDS = new Set(['pullup_bar', 'dip_bars', 'rings', 'bands', 'dumbbells', 'barbell',
    'kettlebell', 'bench', 'box', 'machines', 'cable', 'trx', 'jump_rope', 'mat',
    'treadmill', 'bike', 'rower']);
  const LOCATIONS = ['full_gym', 'building_gym', 'home_weights', 'home_bodyweight'];
  const steps = schema.STEPS || schema.steps || [];

  for (const loc of LOCATIONS) {
    const p = schema.normalizeProfile(Object.assign(schema.defaults(), { location: loc }));
    const kit = new Set(p.equipment || []);

    for (const step of steps) {
      for (const f of (step.fields || [])) {
        if (typeof f.showIf === 'function' && !f.showIf(p)) continue;
        const opts = typeof f.options === 'function' ? f.options(p) : f.options;
        if (!Array.isArray(opts)) continue;

        // Skip the fields whose options ARE the vocabulary: "what do you
        // actually have" has to be able to offer a barbell to someone who does
        // not have one yet — that is the question. Likewise the avoid chips
        // name movements, not the asker's kit. The defect is a field that
        // describes how you will TRAIN using gear you have already said you
        // lack, so only fields whose values are not gear ids are checked.
        const isGearVocabulary = opts.some((o) => GEAR_IDS.has(o.value));
        if (isGearVocabulary || f.key === 'avoid') continue;

        // And skip the fields that ESTABLISH the kit rather than describe
        // training with it. "חדר כושר מלא" has to be able to say it has
        // machines and a cable stack — describing the places you are choosing
        // between is the entire question — and "יש מכונות ופולי" is how you
        // answer whether your building gym has any. A yes/no field is asking
        // about the world; a field that sets the kit defines it. It is the
        // fields DOWNSTREAM of those answers that must not contradict them.
        const asksAboutTheWorld = opts.some((o) => typeof o.value === 'boolean');
        if (asksAboutTheWorld || f.key === 'location') continue;

        for (const o of opts) {
          const text = `${o.label || ''} ${o.desc || ''}`;
          for (const gear of Object.keys(HE)) {
            if (kit.has(gear)) continue;
            for (const word of HE[gear]) {
              if (text.indexOf(word) >= 0) {
                err(`${loc}: option "${o.label}" on field ${f.key} names ${gear} `
                  + `("${word.trim()}") but this location's kit is [${[...kit].join(', ')}]`);
              }
            }
          }
        }
      }
    }
  }
}

try {
  const schema = await load('src/intake/schema.js');
  if (schema && schema.normalizeProfile && schema.defaults) {
    await checkOptionsMatchKit(schema, err);
  }
} catch (e) { err(`option/kit check could not run: ${e.message}`); }

/*
 * The age thresholds must come from one place.
 *
 * They were spelled out as bare numbers in six files and drifted: the nutrition
 * tab told a thirteen-year-old not to weigh weekly and said why, while the
 * tracking tab in the same plan opened with "one weigh-in a week" and gave them
 * the button. Both were written honestly; neither knew about the other. So any
 * NEW literal age comparison outside age.js is refused here — the point is not
 * that 16 is right, it is that there must be exactly one 16.
 *
 * The engine files that still compare ages directly are listed as known: they
 * encode dosing curves rather than policy (how fast to add load at 15, not
 * whether to). They are allowed to stay, but not to grow.
 */
{
  const ALLOWED = new Set([
    'src/engine/age.js',
    'src/engine/generator.js',      // level cap + rep-range dosing
    'src/engine/progression.js',    // load-jump and intensity curves
    'src/engine/targets.js',        // its own fat-loss refusal, older than age.js
    'src/engine/volume.js',         // recovery curve: 65 / 55 / 15 is dosing, not policy
    'src/vision/analyze.js',        // scan gate, states its own constant
  ]);
  const AGE_CMP = /\bage\s*[<>]=?\s*(\d{1,2})\b|\bage\)\s*[<>]=?\s*(\d{1,2})\b/g;
  const walk = (dir) => {
    for (const f of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${f.name}`;
      if (f.isDirectory()) { walk(rel); continue; }
      if (!/\.js$/.test(f.name)) continue;
      if (ALLOWED.has(rel)) continue;
      const src = readFileSync(resolve(ROOT, rel), 'utf8');
      let m;
      AGE_CMP.lastIndex = 0;
      while ((m = AGE_CMP.exec(src))) {
        const n = Number(m[1] || m[2]);
        if (n >= 10 && n <= 25) {
          err(`${rel} compares age against ${n} directly — import the rule from `
            + `src/engine/age.js instead, so two screens cannot disagree about the same person`);
        }
      }
    }
  };
  try { walk('src'); } catch (e) { err(`age-policy check could not run: ${e.message}`); }
}

/*
 * A track must keep the promise its own description makes.
 *
 * The calisthenics option tells the user "progression by leverage and not by
 * weight". matchesTrack returned true for core, conditioning and mobility
 * patterns BEFORE it looked at equipment, so a cable crunch and a cable wood
 * chop were shipped inside calisthenics plans — the exact loading the track
 * said it left out. Neutrality was meant to say a plank belongs on either
 * track, not that a plank may bring a cable stack.
 */
{
  const LOADED = ['dumbbells', 'barbell', 'kettlebell', 'machines', 'cable'];
  try {
    const idx = await load('src/data/exercises.index.js');
    const offenders = idx.EXERCISES.filter((e) => idx.matchesTrack(e, 'calisthenics')
      && (e.equipment || []).some((q) => LOADED.includes(q)));
    for (const e of offenders.slice(0, 6)) {
      err(`${e.id} (${e.nameEn}) needs ${e.equipment.join('+')} but passes the calisthenics `
        + `track filter — that track promises progression by leverage, not load`);
    }
    if (offenders.length > 6) err(`...and ${offenders.length - 6} more loaded exercises in calisthenics`);
  } catch (e) { err(`track-purity check could not run: ${e.message}`); }
}

/*
 * No day may spend three slots on one movement pattern.
 *
 * A split names one pull pattern for a given day, so when the pull group earned
 * two slots there the second had nowhere to go and repeated it — producing a
 * pull-up, a wide-grip pull-up and a chin-up as three separate exercises, nine
 * sets of one movement, the assisted regression prescribed next to the full
 * version it exists to replace. Two of a pattern is defensible (heavy then
 * volume); three is the allocator giving up.
 */
{
  try {
    const gen = await load('src/engine/generator.js');
    const schema = await load('src/intake/schema.js');
    const idx = await load('src/data/exercises.index.js');
    let worst = 0, worstAt = '';
    for (const track of ['calisthenics', 'weights', 'mixed']) {
      for (const location of ['full_gym', 'building_gym', 'home_weights', 'home_bodyweight']) {
        for (const experience of ['beginner', 'intermediate', 'advanced']) {
          for (const daysPerWeek of [3, 4, 5]) {
            const p = schema.normalizeProfile(Object.assign(schema.defaults(), {
              age: 30, heightCm: 178, weightKg: 76, goal: 'muscle',
              experience, daysPerWeek, minutesPerSession: 60, location, track,
            }));
            for (const d of gen.generateProgram(p).days) {
              const count = {};
              for (const slot of d.slots) {
                const ex = idx.byId(slot.variants[0].exId);
                if (!ex) continue;
                count[ex.pattern] = (count[ex.pattern] || 0) + 1;
                if (count[ex.pattern] > worst) {
                  worst = count[ex.pattern];
                  worstAt = `${track}/${location}/${experience}/${daysPerWeek}d "${d.title}" ${ex.pattern}`;
                }
              }
            }
          }
        }
      }
    }
    if (worst >= 3) err(`a day spends ${worst} slots on one pattern — ${worstAt}`);
  } catch (e) { err(`pattern-repeat check could not run: ${e.message}`); }
}

/* ---------------- clips ---------------- */

const clipFiles = existsSync(resolve(ROOT, 'src/data'))
  ? readdirSync(resolve(ROOT, 'src/data')).filter((f) => /^clips\..+\.js$/.test(f) && f !== 'clips.index.js')
  : [];

const allClips = new Map();   // the shared library, keyed by clip id
const exClips = new Map();    // clips.x*.js — the per-exercise overrides, keyed by EXERCISE id

for (const f of clipFiles) {
  const mod = await load(`src/data/${f}`);
  if (!mod) continue;
  // The x-batches live in their own namespace: a clip keyed by an exercise id
  // is MEANT to shadow the shared clip of the same name, so a collision across
  // the two namespaces is the feature, not a duplicate.
  const perExercise = /^clips\.x\d+\.js$/.test(f);
  const bucket = perExercise ? exClips : allClips;
  for (const val of Object.values(mod)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    for (const [id, c] of Object.entries(val)) {
      if (!c || typeof c !== 'object' || !Array.isArray(c.keys)) continue;
      const at = `${f}:${id}`;
      if (bucket.has(id)) err(`${at}: duplicate clip id within ${perExercise ? 'the per-exercise batches' : 'the shared library'}`);
      if (perExercise && !allEx.has(id)) err(`${at}: per-exercise clip keyed "${id}", which is not an exercise id`);
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
      // Compared as WRITTEN this is wrong: a full arm circle ends at 276 degrees
      // where it began at -84 — the same frame, a different number, and no way
      // to express it as one object without the arm unwinding on the seam.
      // clip-audit.mjs solves both frames and compares joints; here, without the
      // rig loaded, an angle difference that is a whole number of turns is the
      // cheap version of the same test.
      const sameFrame = (a, b) => {
        const ka = Object.keys(a);
        const kb = Object.keys(b);
        if (ka.length !== kb.length) return false;
        for (const k of ka) {
          const va = a[k];
          const vb = b[k];
          if (typeof va === 'number' && typeof vb === 'number') {
            if (ANGLE_KEYS.has(k) ? (va - vb) % 360 !== 0 : va !== vb) return false;
          } else if (Array.isArray(va) && Array.isArray(vb)) {
            if (va.length !== vb.length) return false;
            if (va.some((v, i) => (v - vb[i]) % 360 !== 0)) return false;
          } else if (JSON.stringify(va) !== JSON.stringify(vb)) {
            return false;
          }
        }
        return true;
      };
      if (c.loop !== false && !sameFrame(c.keys[0].pose, c.keys[c.keys.length - 1].pose)) {
        warn(`${at}: t:0 and t:1 poses differ — loop will jump`);
      }
      bucket.set(id, c);
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

// Animation coverage: how many exercises have a clip of their own versus one
// borrowed from a sibling or the generic pattern fallback.
let ownClip = 0;
let borrowed = 0;
try {
  const idx = await load('src/data/clips.index.js');
  if (idx && idx.BY_EXERCISE) {
    for (const e of allEx.values()) {
      if (idx.BY_EXERCISE[e.id]) ownClip++;
      else borrowed++;
    }
  }
} catch (e) { /* index not loadable yet */ }

console.log(`exercises: ${allEx.size}   clips: ${allClips.size}`);
if (ownClip + borrowed) {
  const pct = Math.round((ownClip / (ownClip + borrowed)) * 100);
  console.log(`animation coverage: ${ownClip} own, ${borrowed} borrowed (${pct}% bespoke)`);
}
for (const w of warnings) console.log(`  warn  ${w}`);
for (const e of errors) console.log(`  ERROR ${e}`);
console.log(errors.length ? `\n${errors.length} error(s)` : '\nOK');
process.exit(errors.length ? 1 : 0);
