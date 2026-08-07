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
  /*
   * Three ways to write the same mistake, and comments are not one of them.
   *
   * The pattern only caught `age < 16`. `16 > p.age` reads identically to a
   * human and slipped straight through, and so did the thing somebody actually
   * writes when they are being tidy — `const KID = 16` followed by
   * `age < KID`, which is the literal moved one line up.
   *
   * Comments are stripped first. This check fired on the sentence in
   * exercises.index.js describing the very bug it exists to prevent, which is
   * the most annoying possible false positive: it punishes writing down what
   * went wrong.
   */
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  const AGE_CMP = /\bage\s*[<>]=?\s*(\d{1,2})\b|\bage\)\s*[<>]=?\s*(\d{1,2})\b/g;
  const AGE_REVERSED = /\b(\d{1,2})\s*[<>]=?\s*[A-Za-z_$][\w$]*\.?age\b/g;
  const AGE_CONST = /\b(?:const|let|var)\s+[A-Z_][A-Z0-9_]*\s*=\s*(\d{1,2})\s*;?[^\n]*/g;

  const walk = (dir) => {
    for (const f of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${f.name}`;
      if (f.isDirectory()) { walk(rel); continue; }
      if (!/\.js$/.test(f.name)) continue;
      if (ALLOWED.has(rel)) continue;
      const src = stripComments(readFileSync(resolve(ROOT, rel), 'utf8'));
      const flag = (n, how) => {
        if (n >= 10 && n <= 25) {
          err(`${rel} ${how} ${n} directly — import the rule from `
            + `src/engine/age.js instead, so two screens cannot disagree about the same person`);
        }
      };
      let m;
      for (const [re, how] of [[AGE_CMP, 'compares age against'], [AGE_REVERSED, 'compares age against']]) {
        re.lastIndex = 0;
        while ((m = re.exec(src))) flag(Number(m[1] || m[2]), how);
      }
      // A named constant only counts when the file also tests an age against it.
      AGE_CONST.lastIndex = 0;
      while ((m = AGE_CONST.exec(src))) {
        const name = m[0].match(/\b(?:const|let|var)\s+([A-Z_][A-Z0-9_]*)/)[1];
        if (new RegExp(`\\bage\\s*[<>]=?\\s*${name}\\b|\\b${name}\\s*[<>]=?\\s*[A-Za-z_$][\\w$]*\\.?age\\b`).test(src)) {
          flag(Number(m[1]), `holds an age threshold in a local constant (${name} =)`);
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

/*
 * Rest-day tasks must respect the same limits the training does.
 *
 * They are the one part of the week that is not built by the generator, so none
 * of the exercise filters touch them: an injury the plan carefully worked
 * around all week must not reappear as "jump rope for ten minutes" on Tuesday.
 * Nor may a task ask for equipment the profile does not have, and nor may a
 * week fill every rest day — a plan with something on all seven days is a plan
 * nobody keeps.
 */
{
  try {
    const rd = await load('src/engine/restday.js');
    const schema = await load('src/intake/schema.js');
    const INJURIES = ['knee', 'ankle', 'hip', 'lower_back', 'shoulder', 'elbow', 'wrist'];
    for (const goal of ['fatloss', 'muscle', 'strength', 'fitness', 'sport']) {
      for (const injury of [null].concat(INJURIES)) {
        for (const location of ['full_gym', 'home_bodyweight']) {
          const p = schema.normalizeProfile(Object.assign(schema.defaults(), {
            age: 30, heightCm: 178, weightKg: 76, goal, experience: 'intermediate',
            daysPerWeek: 3, minutesPerSession: 60, location,
            injuries: injury ? [injury] : [],
          }));
          const restIdx = [0, 1, 2, 3];
          const tasks = rd.restDayTasks(p, restIdx);
          const owned = new Set(p.equipment || []);
          const byId = new Map(rd.TASKS.map((t) => [t.id, t]));
          for (const t of tasks) {
            const def = byId.get(t.id);
            if (!def) { err(`rest task ${t.id} is not in the catalogue`); continue; }
            /*
             * Stated here rather than read off def.hurts.
             *
             * allowed() filters with exactly that field, so asking it whether a
             * task is safe could only confirm restday.js agrees with itself:
             * emptying every hurts list left this check green while a
             * knee-injured trainee's rest week came back "walk 3km, skip rope
             * ten minutes, cycle twenty". The age half of the same block got
             * this right — it names jump_rope_10 and stairs_10 itself — and the
             * injury half did not.
             */
            const HURTS = {
              // Landing, loaded knee flexion, and changing direction at speed.
              knee: ['jump_rope_10', 'stairs_10', 'walk_hills', 'ball_game'],
              ankle: ['jump_rope_10', 'walk_hills', 'ball_game'],
              hip: ['walk_hills', 'ball_game'],
              lower_back: ['jump_rope_10', 'carry_walk'],
              shoulder: ['swim_20'],
            };
            if (injury && (HURTS[injury] || []).indexOf(t.id) >= 0) {
              err(`${goal}/${injury}: rest task "${def.title}" loads a declared ${injury} `
                + `on a recovery day, which the whole week was built to avoid`);
            }
            for (const q of def.needs) {
              if (!owned.has(q)) err(`${goal}/${location}: rest task "${def.title}" needs ${q}, which this profile lacks`);
            }
          }
          if (tasks.length > restIdx.length) err(`${goal}: more rest tasks than rest days`);
          const hard = tasks.filter((t) => t.load === 'moderate').length;
          if (hard > 1) err(`${goal}/${injury || 'none'}: ${hard} demanding rest-day tasks in one week — rest days are for resting`);
          const ids = new Set(tasks.map((t) => t.id));
          if (ids.size !== tasks.length) err(`${goal}: the same rest task appears twice in one week`);
        }
      }
    }
  } catch (e) { err(`rest-day check could not run: ${e.message}`); }
}

/*
 * This is a calisthenics app. Nothing may hand the user loaded equipment.
 *
 * The track is forced in normalizeProfile rather than asked, so the failure mode
 * is not a wrong answer — it is a seed list, an option chip or an imported
 * profile quietly reintroducing dumbbells, and the generator happily using them
 * because matchesTrack was never the thing that stopped it.
 */
{
  const LOADED = ['dumbbells', 'barbell', 'kettlebell', 'machines', 'cable'];
  try {
    const schema = await load('src/intake/schema.js');
    const gen = await load('src/engine/generator.js');
    const idx = await load('src/data/exercises.index.js');
    const LOCATIONS = ['full_gym', 'building_gym', 'home_weights', 'home_bodyweight'];

    for (const location of LOCATIONS) {
      const p = schema.normalizeProfile(Object.assign(schema.defaults(), {
        age: 30, heightCm: 178, weightKg: 76, location,
      }));
      if (p.track !== 'calisthenics') err(`${location}: normalizeProfile produced track "${p.track}"`);
      for (const q of p.equipment || []) {
        if (LOADED.includes(q)) err(`${location}: the seeded kit includes ${q}, which this app never uses`);
      }
    }

    // An imported profile that claims another track must be coerced, not honoured.
    const smuggled = schema.normalizeProfile(Object.assign(schema.defaults(), {
      age: 30, heightCm: 178, weightKg: 76, location: 'full_gym',
      track: 'weights', equipment: ['barbell', 'machines', 'cable', 'dumbbells'],
    }));
    if (smuggled.track !== 'calisthenics') err('an imported profile kept a non-calisthenics track');
    for (const q of smuggled.equipment || []) {
      if (LOADED.includes(q)) err(`an imported profile kept ${q} in its equipment list`);
    }

    // And no generated programme may contain a loaded exercise.
    for (const location of LOCATIONS) {
      for (const experience of ['beginner', 'intermediate', 'advanced']) {
        const p = schema.normalizeProfile(Object.assign(schema.defaults(), {
          age: 30, heightCm: 178, weightKg: 76, location, experience,
          daysPerWeek: 4, minutesPerSession: 60, goal: 'muscle',
        }));
        for (const d of gen.generateProgram(p).days) {
          for (const slot of d.slots) {
            for (const v of slot.variants) {
              const ex = idx.byId(v.exId);
              if (!ex) continue;
              const bad = (ex.equipment || []).filter((q) => LOADED.includes(q));
              if (bad.length) {
                err(`${location}/${experience}: "${ex.nameEn}" needs ${bad.join('+')} in a calisthenics-only app`);
              }
            }
          }
        }
      }
    }

    // The questionnaire must not offer loaded gear either.
    for (const step of schema.STEPS || []) {
      for (const f of step.fields || []) {
        const opts = typeof f.options === 'function' ? f.options(schema.defaults()) : f.options;
        if (!Array.isArray(opts)) continue;
        for (const o of opts) {
          if (LOADED.includes(o.value)) err(`the ${f.key} question still offers "${o.label}"`);
        }
      }
    }
  } catch (e) { err(`calisthenics-only check could not run: ${e.message}`); }
}

/*
 * The logo has to actually be a logo.
 *
 * It is a base64 data URI in a source file, which is the one kind of asset that
 * can rot silently: a truncated paste still parses as a string, still imports,
 * still renders as an <img> — just a broken one, and only on somebody else's
 * screen. So its shape is checked here rather than trusted.
 *
 * The size ceiling is the real point. The bundle is under a megabyte and this is
 * one image; the 640x640 plate it was cut from was 531KB on its own, which would
 * have been more than half the app.
 */
{
  try {
    const brand = await load('src/core/brand.js');
    const uri = brand.LOGO;
    if (typeof uri !== 'string' || !uri) {
      err('src/core/brand.js does not export a LOGO string');
    } else {
      const m = /^data:image\/(webp|png|jpeg|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(uri);
      if (!m) {
        err('LOGO is not a well-formed base64 image data URI — a truncated paste still '
          + 'imports fine and only fails on screen');
      } else {
        const bytes = Buffer.from(m[2], 'base64');
        const kb = Math.round(bytes.length / 1024);
        if (kb > 90) err(`the logo is ${kb}KB — too heavy for a bundle this size; re-cut it smaller`);
        if (bytes.length < 2000) err(`the logo is only ${bytes.length} bytes — that is a truncated asset`);
        // Magic bytes: the declared type must be the actual type.
        const head = bytes.slice(0, 12).toString('latin1');
        if (m[1] === 'webp' && !(head.startsWith('RIFF') && head.indexOf('WEBP') === 8)) {
          err('LOGO claims image/webp but the bytes are not a WebP');
        }
        if (m[1] === 'png' && bytes[1] !== 0x50) err('LOGO claims image/png but the bytes are not a PNG');
      }
    }
  } catch (e) { err(`logo check could not run: ${e.message}`); }
}

/*
 * The cool-down has to respect an injury too, and still be a cool-down.
 *
 * It runs through the same candidate filter as everything else, so it looked
 * safe — but the three stretches it reaches for first carried no
 * contraindications, so the filter had nothing to remove and every trainee got
 * the identical four lines. A guarded knee was being sent into a deep squat hold
 * and onto its knee for a hip-flexor stretch.
 *
 * Both halves are checked: nothing contraindicated survives, AND the list does
 * not collapse to a breathing drill once the filtering starts working.
 */
{
  try {
    const gen = await load('src/engine/generator.js');
    const schema = await load('src/intake/schema.js');
    const idx = await load('src/data/exercises.index.js');
    const byName = new Map(idx.EXERCISES.map((e) => [e.name, e]));

    /*
     * Stated here rather than read from the exercise's own contraindications,
     * because reading them would make this circular: deleting a tag would make
     * the filter and the check agree that nothing is wrong. These are claims
     * about the movements themselves — a deep squat is full knee flexion and
     * full ankle dorsiflexion, kneeling puts bodyweight on the front of the
     * knee, child's pose is deep knee flexion plus end-range shoulder overhead.
     */
    const MUST_NOT = {
      deep_squat_hold: ['knee', 'ankle'],
      hip_flexor_stretch_kneeling: ['knee', 'hip'],
      childs_pose_reach: ['knee', 'shoulder'],
      passive_bar_hang: ['shoulder'],
    };
    const SETS = [[], ['knee'], ['ankle'], ['hip'], ['shoulder'], ['lower_back'],
      ['knee', 'shoulder'], ['knee', 'ankle', 'hip', 'shoulder', 'lower_back']];

    for (const injuries of SETS) {
      const p = schema.normalizeProfile(Object.assign(schema.defaults(), {
        age: 30, heightCm: 178, weightKg: 76, goal: 'muscle', experience: 'intermediate',
        daysPerWeek: 4, minutesPerSession: 60, location: 'full_gym', injuries,
      }));
      const cd = gen.generateProgram(p).cooldown || [];
      const label = injuries.join('+') || 'no injuries';

      if (cd.length < 3) {
        err(`${label}: the cool-down is down to ${cd.length} item(s) — filtering must not `
          + `leave someone with nothing but a breathing drill`);
      }
      for (const item of cd) {
        const ex = byName.get(item.name);
        if (!ex) continue;   // the closing breath is not an exercise
        const banned = MUST_NOT[ex.id] || [];
        const clash = banned.filter((c) => injuries.includes(c));
        if (clash.length) {
          err(`${label}: the cool-down includes "${ex.name}", which loads ${clash.join('+')}`);
        }
      }
    }
  } catch (e) { err(`cool-down check could not run: ${e.message}`); }
}

/*
 * A growing body is not judged by adult muscle-gain rates.
 *
 * The goal assessment prices weight gain off GAIN_CEILING, which describes what
 * an adult builds from training. A thirteen-year-old at 48kg aiming for 60 in a
 * year came out "unrealistic", with the plan telling him the extra would be fat
 * — while that trajectory is close to ordinary development. Growth adds mass
 * whether or not anybody trains.
 *
 * Checked in both directions, because the easy over-correction is to hand
 * teenagers a licence: growth must NOT loosen fat loss, and it must be gone by
 * the twenties.
 */
{
  try {
    const tg = await load('src/engine/targets.js');
    const schema = await load('src/intake/schema.js');
    const future = (weeks) => {
      const d = new Date();
      d.setDate(d.getDate() + weeks * 7);
      return d.toISOString().slice(0, 10);
    };
    const mk = (over) => schema.normalizeProfile(Object.assign(schema.defaults(), {
      sex: 'male', heightCm: 166, weightKg: 48, goal: 'muscle',
      experience: 'beginner', commitment: 4, targetDate: future(56),
    }, over));

    // 48 -> 60 in a year is normal development at 13, and not at 25.
    const teen = tg.assessGoal(mk({ age: 13, targetWeightKg: 60 }));
    if (!teen.realistic) {
      err('a 13-year-old going 48kg -> 60kg in a year is judged unrealistic — that is '
        + 'ordinary growth being priced as adult muscle gain');
    }
    if (/הגוף לא בונה שריר מהר יותר מזה/.test(teen.verdict)) {
      err('the goal verdict tells a growing teenager his body cannot add that mass');
    }

    const adult = tg.assessGoal(mk({ age: 25, targetWeightKg: 60 }));
    if (adult.realistic) {
      err('a 25-year-old going 48kg -> 60kg in a year is judged realistic — the growth '
        + 'allowance must not reach adults');
    }

    // The allowance must not make losing weight easier for a minor.
    const teenLoss = tg.assessGoal(mk({ age: 13, weightKg: 60, targetWeightKg: 50 }));
    if (teenLoss.realistic) {
      err('under-18 fat loss is being called realistic — growth must never loosen that');
    }

    const age = await load('src/engine/age.js');
    if (age.growthAllowanceKgPerWeek({ age: 25 }) !== 0) err('growth allowance leaks into adults');
    if (age.growthAllowanceKgPerWeek({ age: 9 }) !== 0) err('growth allowance applies below the intake floor');
    if (!(age.growthAllowanceKgPerWeek({ age: 13 }) > age.growthAllowanceKgPerWeek({ age: 18 }))) {
      err('the growth allowance does not taper with age');
    }
  } catch (e) { err(`growth-allowance check could not run: ${e.message}`); }
}

/*
 * Age has to reach the output, not just the arithmetic.
 *
 * Both defects here were the same shape: a rule existed and something later
 * erased it.
 *
 * volume.js reduces the weekly target for age, sleep and stress — and then the
 * "spend the spare time" step scaled whatever survived back up to a flat share
 * of the clock. At 4x60 an eighty-year-old beginner and a twenty-five-year-old
 * both came out at 63 sets, so the only thing deciding was the calendar.
 *
 * restday.js filtered its tasks by injury and equipment and not by age, so an
 * eighty-two-year-old with no injuries ticked was handed ten minutes of jump
 * rope — a hundred landings and a balance demand, on a recovery day.
 */
{
  try {
    const v = await load('src/engine/volume.js');
    const rd = await load('src/engine/restday.js');
    const schema = await load('src/intake/schema.js');
    const mk = (over) => schema.normalizeProfile(Object.assign(schema.defaults(), {
      heightCm: 172, weightKg: 62, goal: 'muscle', experience: 'beginner',
      daysPerWeek: 4, minutesPerSession: 60, sleepHours: 7, stress: 3,
    }, over));

    // Recovery must survive the time cap.
    const young = v.weeklyVolume(mk({ age: 25 })).total;
    const old = v.weeklyVolume(mk({ age: 80 })).total;
    if (old >= young) {
      err(`an 80-year-old is prescribed ${old} sets against a 25-year-old's ${young} — `
        + `the recovery factors are being erased by the fill-to-capacity step`);
    }
    const slept = v.weeklyVolume(mk({ age: 25, sleepHours: 9 })).total;
    const tired = v.weeklyVolume(mk({ age: 25, sleepHours: 5 })).total;
    if (tired >= slept) err(`5 hours of sleep yields ${tired} sets and 9 hours ${slept} — sleep is not reaching the plan`);
    const calm = v.weeklyVolume(mk({ age: 25, stress: 1 })).total;
    const fried = v.weeklyVolume(mk({ age: 25, stress: 5 })).total;
    if (fried >= calm) err(`stress 5 yields ${fried} sets and stress 1 ${calm} — stress is not reaching the plan`);

    // Rest-day tasks must respect age, and must not run out because of it.
    const IMPACT = ['jump_rope_10', 'stairs_10'];
    for (const age of [12, 25, 55, 62, 70, 82, 90]) {
      const p = mk({ age, goal: 'fitness', location: 'full_gym' });
      const tasks = rd.restDayTasks(p, [1, 3, 5, 6]);
      if (!tasks.length) err(`age ${age}: no rest-day task at all`);
      if (age >= 70) {
        for (const t of tasks) {
          if (IMPACT.includes(t.id)) {
            err(`age ${age}: rest-day task "${t.title}" is impact work on a recovery day`);
          }
        }
      }
    }
  } catch (e) { err(`age-reaches-output check could not run: ${e.message}`); }
}

/*
 * The warm-up and the cool-down have to know how old the trainee is.
 *
 * They were the last part of the plan that did not. Every other engine bent for
 * age — volume, session length, calories, exercise selection, rest-day tasks —
 * and these two handed out the identical four drills and the identical four
 * stretches from 12 to 90, because the only filter they had was injury and a
 * healthy 78-year-old ticks no boxes.
 *
 * The drills below are named here, not read from demands.js, and that is the
 * whole point. A check that asks the same table the generator asks can only ever
 * confirm the two agree: delete jumping_jack's entry and the drill starts
 * appearing in an 85-year-old's warm-up while the check reports everything is
 * fine. So the unsafe cases are restated independently, and the two descriptions
 * have to keep matching on their own.
 */
{
  try {
    const g = await load('src/engine/generator.js');
    const schema = await load('src/intake/schema.js');
    const dm = await load('src/data/demands.js');
    const ix = await load('src/data/exercises.index.js');

    const mk = (over) => schema.normalizeProfile(Object.assign(schema.defaults(), {
      sex: 'male', heightCm: 175, weightKg: 74, goal: 'muscle', experience: 'beginner',
      daysPerWeek: 3, minutesPerSession: 45, location: 'home_weights',
    }, over));
    const plan = (over) => g.generateProgram(mk(over));

    /* Restated independently of demands.js. */
    const LEAVES_THE_GROUND = ['jumping_jack', 'jog', 'high_knees', 'pogo_hop', 'jump_rope'];
    const ONE_LEG_UNSUPPORTED = ['toy_soldier', 'standing_knee_to_elbow'];
    const NEEDS_THE_FLOOR = [
      'childs_pose_reach', 'hip_flexor_stretch_kneeling', 'cat_cow', 'bird_dog', 'dead_bug',
      'hip_switch_90_90', 'glute_bridge', 'glute_bridge_activation', 'thoracic_rotation',
      'quadruped_scap_pushup', 'scap_pushup', 'wrist_prep', 'prone_w_raise', 'prone_ytw_raise',
      'prone_lat_pull_slide', 'worlds_greatest_stretch', 'deep_squat_hold',
    ];
    const HANGS_FROM_THE_HANDS = ['dead_hang', 'passive_bar_hang', 'scap_pull'];

    const ids = (list) => (list || []).map((x) => x.id).filter(Boolean);

    for (const age of [62, 70, 82, 90]) {
      const p = plan({ age });
      for (const id of ids(p.warmup)) {
        if (LEAVES_THE_GROUND.includes(id)) err(`age ${age}: the warm-up opens with "${id}", which leaves the ground`);
        if (ONE_LEG_UNSUPPORTED.includes(id)) err(`age ${age}: the warm-up includes "${id}" — one leg with nothing to hold`);
      }
    }

    // A beginner past the line should not be warming up by hanging their bodyweight.
    for (const age of [70, 85]) {
      for (const id of ids(plan({ age }).warmup)) {
        if (HANGS_FROM_THE_HANDS.includes(id)) err(`age ${age}: a beginner's warm-up includes "${id}" — full bodyweight through two hands`);
      }
    }
    // ...but somebody who trains keeps it, or the rule is about age rather than capacity.
    {
      const kept = ids(plan({ age: 68, experience: 'advanced' }).warmup).some((id) => HANGS_FROM_THE_HANDS.includes(id));
      if (!kept) err('an advanced 68-year-old lost their hanging drills — the rule is meant to be about capacity, not birthdays');
    }

    // Never a warm-up or a cool-down made entirely of getting down to the floor.
    for (const age of [66, 75, 90]) {
      const p = plan({ age });
      if (!ids(p.warmup).some((id) => !NEEDS_THE_FLOOR.includes(id))) {
        err(`age ${age}: every drill in the warm-up needs getting down to the floor`);
      }
      const stretches = ids(p.cooldown).filter((id) => id !== 'seated_breathing');
      if (stretches.length && !stretches.some((id) => !NEEDS_THE_FLOOR.includes(id))) {
        err(`age ${age}: every cool-down stretch needs getting down to the floor`);
      }
    }

    // The regression that started this: two very different bodies, one warm-up.
    {
      const young = ids(plan({ age: 14 }).warmup).join(',');
      const mid = ids(plan({ age: 30 }).warmup).join(',');
      const old = ids(plan({ age: 82 }).warmup).join(',');
      if (young === old) err(`a 14-year-old and an 82-year-old get the identical warm-up: ${old || '(empty)'}`);
      if (mid === old) err(`a 30-year-old and an 82-year-old get the identical warm-up: ${old || '(empty)'}`);
    }

    // A trainee who can jump should be given something that raises a pulse.
    for (const age of [14, 25, 40]) {
      const lead = ids(plan({ age }).warmup)[0];
      if (lead && !LEAVES_THE_GROUND.includes(lead)) {
        err(`age ${age}: the warm-up opens with "${lead}" — nothing here raises a heart rate before training`);
      }
    }

    // Stretch holds should lengthen with age, not stay on one number for everybody.
    {
      const secs = (age) => {
        const c = plan({ age }).cooldown.find((x) => /שנ׳$/.test(x.prescription || ''));
        return c ? parseInt(c.prescription, 10) : null;
      };
      const a = secs(14); const b = secs(30); const c = secs(80);
      if (a === null || b === null || c === null) err('cool-down stretches carry no hold length at all');
      else if (!(a < b && b < c)) err(`cool-down holds do not lengthen with age: 14->${a}s, 30->${b}s, 80->${c}s`);
    }

    // Nobody ends up with an empty warm-up because a filter removed everything.
    for (const age of [12, 25, 60, 75, 90]) {
      const p = plan({ age });
      if ((p.warmup || []).length < 3) err(`age ${age}: warm-up is down to ${(p.warmup || []).length} drills`);
      if ((p.cooldown || []).length < 2) err(`age ${age}: cool-down is down to ${(p.cooldown || []).length} items`);
    }

    /*
     * Coverage of the table itself. This one does read demands.js, which is
     * fine — it is not judging whether a drill is safe, it is checking that
     * somebody looked at every drill, so a new one cannot inherit "standing,
     * fine for a ninety-year-old" by being forgotten.
     */
    {
      const all = ix.ALL_EXERCISES || ix.EXERCISES || [];
      const warm = all.filter((e) => (e.tags || []).indexOf('warmup') >= 0).map((e) => e.id);
      const classified = new Set(Object.keys(dm.DEMANDS).concat(dm.PLAIN_STANDING));
      const missing = warm.filter((id) => !classified.has(id));
      if (missing.length) err(`warm-up drills with no demands entry: ${missing.join(', ')}`);
      const stray = Array.from(classified).filter((id) => warm.indexOf(id) < 0);
      if (stray.length) err(`demands.js classifies drills that are not warm-up drills: ${stray.join(', ')}`);
      const both = dm.PLAIN_STANDING.filter((id) => dm.DEMANDS[id]);
      if (both.length) err(`drills listed as plain standing and as demanding: ${both.join(', ')}`);
    }
  } catch (e) { err(`warm-up/cool-down age check could not run: ${e.message}`); }
}

/*
 * The numbers a trainee reports have to change what they are given.
 *
 * They did not. Declaring 0 push-ups and declaring 60 produced byte-identical
 * programmes, because selection read only the experience tier — and that ladder
 * has no rung between "under 3 months" and "a year or more", so nine months of
 * honest training leaves nothing truthful to tick. A fifteen-year-old who had
 * worked up to 33 push-ups was opened on knee push-ups.
 *
 * Two things are asserted, and the second matters more than the first. The
 * numbers must move the prescription; and no number, however large, may move it
 * past the age ceiling or through an injury filter. A trainee typing 80 in a box
 * is the easiest input in the app to overstate, honestly or otherwise.
 */
{
  try {
    const schema = await load('src/intake/schema.js');
    const gen = await load('src/engine/generator.js');
    const registry = await load('src/data/exercises.index.js');
    const bench = await load('src/engine/benchmarks.js');

    const mk = (over) => schema.normalizeProfile(Object.assign(schema.defaults(), {
      age: 30, sex: 'male', heightCm: 175, weightKg: 72, goal: 'muscle',
      experience: 'beginner', daysPerWeek: 4, minutesPerSession: 60,
      location: 'home_weights', equipment: ['bands', 'mat', 'pullup_bar', 'rings'],
    }, over));

    const levelsFor = (p, patterns) => {
      const out = [];
      for (const day of gen.generateProgram(p).days) {
        for (const slot of day.slots) {
          const v = (slot.variants || [])[0];
          if (!v) continue;
          const ex = registry.byId(v.exId);
          if (ex && patterns.includes(ex.pattern)) out.push(ex.level);
        }
      }
      return out;
    };

    // 1. The same tier, different numbers, must not produce the same work.
    const weak = levelsFor(mk({ bm_pushups: 0, bm_pullups: 0 }), ['horizontal_push', 'vertical_push']);
    const strong = levelsFor(mk({ bm_pushups: 60, bm_pullups: 20 }), ['horizontal_push', 'vertical_push']);
    if (!weak.length || !strong.length) {
      err('the benchmark check found no pushing slots to compare');
    } else if (Math.max(...strong) <= Math.max(...weak)) {
      err(`declaring 60 push-ups yields level ${Math.max(...strong)} and declaring 0 yields `
        + `${Math.max(...weak)} — the numbers the questionnaire asks for are not reaching selection`);
    }

    // 2. And no claimed number may lift a minor past the age ceiling.
    for (const age of [12, 14, 15, 16, 30]) {
      const p = mk({ age, bm_pushups: 200, bm_pullups: 100, bm_dips: 100, bm_plankSec: 600 });
      const ceiling = registry.levelCeiling(p);
      const all = levelsFor(p, ['horizontal_push', 'vertical_push', 'vertical_pull',
        'horizontal_pull', 'squat', 'hinge', 'core_flexion', 'core_antiextension']);
      if (all.length && Math.max(...all) > ceiling) {
        err(`age ${age}: claiming 200 push-ups produced a level ${Math.max(...all)} exercise `
          + `against a ceiling of ${ceiling} — a text field is not a reason to raise a growth-plate limit`);
      }
    }

    // 3. Nor through an injury filter.
    {
      const p = mk({ injuries: ['shoulder'], bm_pushups: 200, bm_pullups: 100 });
      for (const day of gen.generateProgram(p).days) {
        for (const slot of day.slots) {
          const v = (slot.variants || [])[0];
          if (!v) continue;
          const ex = registry.byId(v.exId);
          if (!ex || !(ex.contraindications || []).includes('shoulder')) continue;
          const clean = registry.candidates(p, { pattern: ex.pattern });
          if (clean.length) {
            err(`claiming 200 push-ups produced ${ex.id}, which loads a declared shoulder, `
              + `while ${clean.length} clean option(s) existed`);
          }
        }
      }
    }

    // 4. Skipping the questions and answering 0 are different answers.
    if (bench.demonstratedLevel(mk({}), 'horizontal_push') !== null) {
      err('an unanswered benchmark reads as evidence — skipping the question should fall back to the tier');
    }
    if (bench.demonstratedLevel(mk({ bm_pushups: 0 }), 'horizontal_push') === null) {
      err('answering 0 reads as no answer — a declared zero is evidence too');
    }
  } catch (e) { err(`benchmark-driven selection check could not run: ${e.message}`); }
}

/*
 * The four-week re-test cycle.
 *
 * Reading the declared numbers fixed one bug and created a slower one: whatever
 * somebody could do on the day they signed up now decided their exercise levels
 * forever. A beginner's push-ups roughly double in two months, so by week eight
 * the plan is built on a number that stopped being true — and it is wrong in the
 * direction nobody complains about, because too easy just feels like an easy week.
 *
 * Asserted here, in the order they can fail:
 *
 *   The clock fires. Not due on day 27, due on day 28. A cadence constant that
 *   nothing compares against is a comment.
 *
 *   Nobody is nagged for a measurement they declined. Skipping the questions at
 *   intake must not produce a prompt at week four.
 *
 *   Profiles that predate the stamp are asked. Every existing user has four
 *   numbers and no benchmarksAt; unknown age is not fresh, and returning "not
 *   due" there would mean they are never asked again.
 *
 *   And the end-to-end claim, which is the whole point: accepting new numbers
 *   must change what gets prescribed. A re-test that writes a field the
 *   generator never re-reads is the original bug with extra steps.
 */
{
  try {
    const schema = await load('src/intake/schema.js');
    const bench = await load('src/engine/benchmarks.js');
    const gen = await load('src/engine/generator.js');
    const registry = await load('src/data/exercises.index.js');

    const DAY = 24 * 60 * 60 * 1000;
    /*
     * Anchored to the real clock, not to a fixed date. normalizeProfile clears
     * a stamp in the future, and it asks the wall clock rather than the `now`
     * these functions are handed — a hard-coded anchor makes "30 days from the
     * anchor" mean past or future depending on when the suite happens to run.
     * All the arithmetic below is relative, so this stays deterministic.
     */
    const NOW = Date.now();
    const agoDays = (n) => new Date(NOW - n * DAY).toISOString();

    const mk = (over) => schema.normalizeProfile(Object.assign(schema.defaults(), {
      age: 30, sex: 'male', heightCm: 175, weightKg: 72, goal: 'muscle',
      experience: 'beginner', daysPerWeek: 4, minutesPerSession: 60,
      location: 'home_weights', equipment: ['bands', 'mat', 'pullup_bar', 'rings'],
    }, over));

    const N = bench.RETEST_DAYS;
    if (!Number.isInteger(N) || N < 7 || N > 120) {
      err(`RETEST_DAYS is ${N} — a re-test cadence outside 7..120 days is not a cadence`);
    }

    // 1. The clock fires on the day it says it does, and not before.
    const fresh = mk({ bm_pushups: 12, benchmarksAt: agoDays(N - 1) });
    const stale = mk({ bm_pushups: 12, benchmarksAt: agoDays(N) });
    if (bench.retestDue(fresh, NOW)) {
      err(`a re-test came due after ${N - 1} days, one day early against RETEST_DAYS=${N}`);
    }
    if (!bench.retestDue(stale, NOW)) {
      err(`a re-test did not come due after ${N} days — RETEST_DAYS=${N} is not being compared against`);
    }
    if (bench.daysUntilRetest(fresh, NOW) !== 1) {
      err(`daysUntilRetest said ${bench.daysUntilRetest(fresh, NOW)} with one day to go`);
    }
    if (bench.daysUntilRetest(stale, NOW) !== null) {
      err('daysUntilRetest returned a countdown for a re-test that is already due');
    }

    // 2. Nobody who skipped the questions is asked to re-take them.
    for (const days of [0, N, N * 4]) {
      const skipped = mk({ benchmarksAt: agoDays(days) });
      if (bench.retestDue(skipped, NOW)) {
        err(`a profile that declared no numbers was asked to re-test after ${days} days`);
      }
    }

    // 3. Numbers with no stamp are of unknown age, and unknown is not fresh.
    if (!bench.retestDue(mk({ bm_pushups: 12, benchmarksAt: null }), NOW)) {
      err('a profile with benchmarks and no benchmarksAt is never due — every profile built '
        + 'before the cycle existed is in exactly that state and would never be asked again');
    }

    // 4. A malformed or future stamp must not survive normalizeProfile: it would
    //    make the re-test either permanently due or permanently not.
    for (const bad of ['not a date', '', agoDays(-30)]) {
      const got = mk({ bm_pushups: 12, benchmarksAt: bad }).benchmarksAt;
      if (got !== null) err(`normalizeProfile kept benchmarksAt=${JSON.stringify(bad)} as ${got}`);
    }

    // 5. "Not now" has to actually stop the asking, and has to wear off.
    const S = bench.RETEST_SNOOZE_DAYS;
    if (bench.snoozeExpired(agoDays(S - 1), NOW)) {
      err(`a "not now" expired after ${S - 1} days against RETEST_SNOOZE_DAYS=${S} — declining does nothing`);
    }
    if (!bench.snoozeExpired(agoDays(S), NOW)) {
      err(`a "not now" still holds after ${S} days — declining once silences the re-test forever`);
    }
    if (!bench.snoozeExpired(null, NOW)) err('never having declined reads as a live snooze');
    if (!bench.snoozeExpired(agoDays(-5), NOW)) {
      err('a snooze stamped in the future holds — a wrong clock or an edited backup silences the prompt');
    }

    // 6. The delta is honest in both directions: it reports a real move, and it
    //    reports nothing when the numbers are better but still on the same rung.
    const before = mk({ bm_pushups: 12 });
    const jumped = bench.retestDelta(before, { pushups: 40 });
    if (!jumped.some((m) => m.pattern === 'horizontal_push' && m.to > m.from)) {
      err('going from 12 to 40 push-ups reported no change to horizontal_push');
    }
    if (bench.retestDelta(before, { pushups: 13 }).length) {
      err('12 to 13 push-ups reported a level change — one rep is not a new rung, and rebuilding '
        + 'the week to say so punishes measuring');
    }
    if (bench.retestDelta(before, { pushups: 12 }).length) {
      err('re-declaring the same number reported a change');
    }

    /*
     * And it has to report a fall, with from/to the right way round.
     *
     * A re-test after an illness, an injury or a bad month comes back lower.
     * That is the case the cycle exists for as much as the good one — the plan
     * should start from where the trainee actually is — and the tracking tab
     * reads from/to to decide whether to say "עלית" or "ירדת". Reporting a drop
     * as a rise would have the app congratulating somebody on losing ground.
     */
    {
      const strong = mk({ bm_pushups: 40 });
      const fell = bench.retestDelta(strong, { pushups: 12 });
      const hp = fell.find((m) => m.pattern === 'horizontal_push');
      if (!hp) err('dropping from 40 to 12 push-ups reported no change to horizontal_push');
      else if (!(hp.to < hp.from)) {
        err(`dropping from 40 to 12 push-ups reported ${hp.from} -> ${hp.to}, which is not a fall`);
      }
      // A first-ever reading is from:null, not from:0 — the screen groups it
      // with the rises, and 0 would read as "you were at level 0".
      const firstEver = bench.retestDelta(mk({}), { pushups: 25 });
      if (!firstEver.length) err('a first-ever benchmark reported no change at all');
      else if (firstEver.some((m) => m.from !== null)) {
        err('a pattern with no previous evidence reported a numeric "from" — null and a level '
          + 'are different claims and the screen tells them apart');
      }
    }

    // 7. End to end: the new numbers must reach the prescription.
    const levelsFor = (p) => {
      const out = [];
      for (const day of gen.generateProgram(p).days) {
        for (const slot of day.slots) {
          const v = (slot.variants || [])[0];
          if (!v) continue;
          const ex = registry.byId(v.exId);
          if (ex && ex.pattern === 'horizontal_push') out.push(ex.level);
        }
      }
      return out;
    };
    const wasAt = levelsFor(before);
    const nowAt = levelsFor(Object.assign({}, before, {
      benchmarks: Object.assign({}, before.benchmarks, { pushups: 40 }),
      benchmarksAt: agoDays(0),
    }));
    if (!wasAt.length || !nowAt.length) {
      err('the re-test check found no pushing slots to compare');
    } else if (Math.max(...nowAt) <= Math.max(...wasAt)) {
      err(`a re-test from 12 to 40 push-ups left the hardest pushing exercise at level `
        + `${Math.max(...nowAt)} — accepting the new numbers changes nothing that gets trained`);
    }
  } catch (e) { err(`re-test cycle check could not run: ${e.message}`); }
}

/*
 * A backup restore must not accept a file that is not a backup.
 *
 * importJson was JSON.parse then Object.assign over the empty state, so
 * {"hello":"world"} merged cleanly, wrote itself to localStorage and reloaded
 * the page — profile, programme, every tick, every logged set and the whole
 * weight history gone, from the button that sounds like the safe one.
 *
 * And a real backup's profile was never re-normalised, so age 9 survived. The
 * comment in age.js says everything downstream clamps so an imported profile
 * cannot smuggle an age the plan was never designed around; that was true of
 * the questionnaire and false of the one path where somebody types the number.
 */
{
  try {
    const age = await load('src/engine/age.js');
    // store.js touches window.localStorage at import time.
    const g = globalThis;
    const hadWindow = 'window' in g;
    if (!hadWindow) {
      const mem = {};
      g.window = {
        localStorage: {
          getItem: (k) => (k in mem ? mem[k] : null),
          setItem: (k, v) => { mem[k] = String(v); },
          removeItem: (k) => { delete mem[k]; },
        },
      };
    }
    const store = await load('src/core/store.js');
    if (!store) throw new Error('store.js did not load');

    store.set({
      stage: 'plan',
      profile: { age: 30, heightCm: 175, weightKg: 75 },
      program: { days: [] },
      weights: [{ date: '2026-01-01', kg: 80 }],
    });
    const before = JSON.stringify(store.get());

    for (const junk of ['{"hello":"world"}', '[1,2,3]', '"a string"', 'null', '42', '{}']) {
      let accepted = false;
      try { store.importJson(junk); accepted = true; } catch (e) { /* refused, as it should be */ }
      if (accepted) err(`importJson accepted ${junk} — restoring a non-backup wipes the trainee's history`);
    }
    if (JSON.stringify(store.get()) !== before) {
      err('a refused import still changed the stored state — the refusal is not atomic');
    }

    // A real backup must have its profile put through normalizeProfile.
    for (const smuggled of [9, 3, 200, null, '  ']) {
      store.importJson(JSON.stringify({
        version: 1, stage: 'plan', program: { days: [] },
        profile: { age: smuggled, heightCm: 170, weightKg: 60, goal: 'muscle' },
      }));
      const got = store.get().profile.age;
      if (!(got >= age.MIN_AGE && got <= age.MAX_AGE)) {
        err(`importJson let age ${JSON.stringify(smuggled)} through as ${got} — outside `
          + `${age.MIN_AGE}-${age.MAX_AGE}, which every engine downstream assumes`);
      }
    }
    if (!hadWindow) delete g.window;
  } catch (e) { err(`backup-restore check could not run: ${e.message}`); }
}

/*
 * "This is too easy" must not hand back something dangerous.
 *
 * The control steps an exercise up a rung. It took the next variant in the
 * slot, sorted by level, and never asked how far that jumped. For a trainee
 * with bands and a pull-up bar the squat variants are level 1, 2 and 5 — the
 * middle rungs need a plyo box and suspension straps and are filtered out by
 * equipment — so pressing it on a banded squat returned a pistol squat. Three
 * levels, onto one leg, for somebody the plan had on two.
 *
 * Checked against generated programmes rather than against the ladder in the
 * data, because the defect was in what survived the equipment filter, not in
 * how the exercises were written. A hole in a ladder is invisible until you
 * stand on the rung below it with the wrong kit.
 */
{
  try {
    const schema = await load('src/intake/schema.js');
    const gen = await load('src/engine/generator.js');
    const adjust = await load('src/engine/adjust.js');
    const registry = await load('src/data/exercises.index.js');

    const KITS = [
      ['home_bodyweight', []],
      ['home_bands', ['bands', 'mat']],
      ['home_weights', ['bands', 'mat', 'pullup_bar']],
      ['gym_basic', ['pullup_bar', 'dip_bars', 'rings', 'mat']],
      ['full_gym', ['pullup_bar', 'dip_bars', 'rings', 'bands', 'mat', 'box']],
    ];
    let steps = 0;
    // One line per hole, not one per profile that walks into it.
    const holes = new Set();
    for (const [location, equipment] of KITS) {
      for (const experience of ['beginner', 'returning', 'intermediate', 'advanced']) {
        for (const age of [12, 16, 30, 70]) {
          const p = schema.normalizeProfile(Object.assign(schema.defaults(), {
            age, sex: 'male', heightCm: 175, weightKg: 72, goal: 'muscle',
            experience, daysPerWeek: 3, minutesPerSession: 45, location, equipment,
          }));
          const program = gen.generateProgram(p);
          for (const day of program.days) {
            for (const slot of day.slots) {
              const v = (slot.variants || [])[0];
              if (!v) continue;
              const cur = registry.byId(v.exId);
              if (!cur) continue;
              for (const dir of [1, -1]) {
                const next = adjust.stepDifficulty(p, slot, v.exId, dir);
                if (!next) continue;
                const to = registry.byId(next.id || next.exId);
                if (!to) { err('stepDifficulty returned something with no exercise behind it'); continue; }
                steps++;

                /*
                 * The rule is "nearest rung", not a fixed distance.
                 *
                 * A first attempt asserted at most one level per press, and it
                 * failed 62 times on the way down — level 4 to level 2 across
                 * three patterns that simply have no level 3 in them. Those
                 * steps were right: the nearest thing that exists is the best
                 * answer available, and a check that calls it wrong is a check
                 * that has to be argued with rather than believed.
                 *
                 * So it asks whether a rung was stepped over: anything the
                 * registry could have offered, strictly between where the
                 * trainee is and where the press landed them. That is what the
                 * leapfrog bug actually was, and it is true regardless of how
                 * the ladders are shaped.
                 */
                const pool = registry.candidates(p, { pattern: cur.pattern, maxLevel: 5 });
                const between = pool.filter((e) => (dir > 0
                  ? e.level > cur.level && e.level < to.level
                  : e.level < cur.level && e.level > to.level));
                if (between.length) {
                  err(`${location}/${experience}/age ${age}: ${dir > 0 ? '"קל לי"' : '"קשה לי"'} on `
                    + `${cur.id} (level ${cur.level}) jumped to ${to.id} (level ${to.level}), stepping over `
                    + `${between[0].id} at level ${between[0].level}`);
                }

                /*
                 * A hole in a ladder is not a code defect, but it is why the
                 * squat sent somebody from a banded squat to a pistol, so it is
                 * worth saying out loud rather than discovering from a plan.
                 */
                if (dir > 0 && to.level - cur.level > 1) {
                  holes.add(`${cur.pattern}: nothing between ${cur.id} (level ${cur.level}) and `
                    + `${to.id} (level ${to.level}) — "קל לי" moves ${to.level - cur.level} levels at once`);
                }

                // Stepping must never introduce kit the trainee lacks.
                const owned = new Set(p.equipment.concat(['none']));
                if (!(to.equipment || []).every((q) => owned.has(q))) {
                  err(`${location}: stepping ${cur.id} produced ${to.id}, which needs ${to.equipment}`);
                }
              }
            }
          }
        }
      }
    }
    for (const hole of holes) warn(hole);
    if (steps < 200) err(`the difficulty-step check only exercised ${steps} steps`);
  } catch (e) { err(`difficulty-step check could not run: ${e.message}`); }
}

/*
 * A week has to fit the clock it was given, and a blank age is not a child.
 *
 * Both of these came out of a code review on the pull request, and both were
 * real.
 *
 * The floors: push, pull and legs carry a floor of 3 sets and core 2, so a week
 * keeping all four owes 11 sets before anything is decided. The time capacity is
 * worked out separately and nothing compared them — two 20-minute strength
 * sessions afford 8.1 sets and the plan came out at 11.
 *
 * The age: age.js says in as many words that an unknown age is treated as an
 * adult, and its own ageOf() did Number(p.age) and checked isFinite. Number(null)
 * is 0 and 0 is finite, so a profile with no age was read as a child by every
 * gate in the file at once — no calorie target, no weigh-in, fat loss refused,
 * scan off.
 *
 * The minutes-per-set table is restated here rather than imported, for the same
 * reason the warm-up drills are: a check that reads the engine's own pace can
 * only confirm the engine agrees with itself.
 */
{
  try {
    const v = await load('src/engine/volume.js');
    const age = await load('src/engine/age.js');
    const targets = await load('src/engine/targets.js');
    const schema = await load('src/intake/schema.js');

    const PACE = { strength: 3.2, muscle: 2.6, fatloss: 2.0, fitness: 2.1, sport: 2.2 };
    const GROUPS = ['push', 'pull', 'legs', 'core', 'arms', 'shoulders', 'calves', 'conditioning'];
    const KEEP = ['push', 'pull', 'legs', 'core'];

    // Whole sets rounded one group at a time can miss the fractional capacity by
    // a set or two; that is the rounding, not the bound coming off.
    const ROUNDING = 2;

    let checked = 0;
    for (const goal of Object.keys(PACE)) {
      for (const minutes of [20, 25, 30, 45, 60, 75, 90]) {
        for (const days of [2, 3, 4, 5, 6]) {
          for (const experience of ['beginner', 'advanced']) {
            const p = schema.normalizeProfile(Object.assign(schema.defaults(), {
              age: 30, sex: 'male', heightCm: 175, weightKg: 75,
              goal, experience, daysPerWeek: days, minutesPerSession: minutes,
              location: 'home_weights',
            }));
            /*
             * The budget is worked out here, not read from sessionBudget().
             *
             * It used to call it — the same function weeklyVolume() uses to
             * decide the capacity — so the check could only ever confirm the two
             * agreed. Inflating sessionBudget's own output by 2.5x left the
             * suite green while a 30-minute session was handed 15.7 working sets
             * at 150 seconds of rest, with the note calling it "within the 10–20
             * effective sets range".
             *
             * The shares below are restated from volume.js on purpose, the same
             * way PACE is. If somebody retunes one, this fails until they have
             * decided the other on purpose too.
             */
            const warmupMin = Math.max(5, Math.min(12, Math.round(minutes * 0.15)));
            const finisherShare = (goal === 'fatloss' || goal === 'fitness' || goal === 'sport') ? 0.09 : 0.05;
            const finisherMin = Math.max(2, Math.min(8, Math.round(minutes * finisherShare)));
            const mainMin = Math.max(10, minutes - warmupMin - finisherMin);
            const goalAdj = goal === 'strength' ? -1 : (goal === 'fatloss' ? 1 : 0);
            const maxSlots = Math.max(3, Math.min(11, Math.round(2.2 + 0.085 * minutes + goalAdj)));
            const vol = v.weeklyVolume(p);
            const capacity = Math.min(mainMin / PACE[goal], maxSlots * 3.0) * days;
            checked++;

            if (vol.total > capacity + ROUNDING) {
              err(`${goal} ${minutes}min x${days} (${experience}): ${vol.total} sets against a `
                + `capacity of ${capacity.toFixed(1)} — the week does not fit the clock it was given`);
            }
            for (const g of GROUPS) {
              if (!Number.isInteger(vol[g])) {
                err(`${goal} ${minutes}min x${days}: ${g} came out at ${vol[g]} sets — not a whole number`);
              }
            }
            /*
             * No movement pattern reduced to a token.
             *
             * This asserted >= 1 and had no margin: delete every floor and the
             * week still came back above it, so the assertion held while the
             * thing it was thought to guard was gone. Raised to volume.js's own
             * stated line — "under 3 sets a week is not training, it is
             * decoration", which is what the floors were set to.
             *
             * Worth writing down what measuring it showed: across every
             * questionnaire-reachable configuration the minimum is push 4, pull
             * 4, legs 5, core 2 — with the floors and with every floor deleted,
             * identically. The weights carry it, and survivors()' floors bind
             * only at the 20-25 minute sessions that arrive on an imported
             * profile, which is exactly where feasibleFloors then scales them
             * back down.
             *
             * So no mutation of the floors can move a real user's plan, and this
             * check is not evidence that they work. It asserts the property that
             * matters — the pattern is trained, not gestured at — and is
             * deliberately indifferent to which mechanism delivers it.
             */
            for (const g of KEEP) {
              const min = g === 'core' ? 2 : 3;
              if (vol[g] >= min) continue;
              /*
               * Asserted where the app offers the configuration, reported where
               * it merely accepts one. The questionnaire's shortest session is
               * 30 minutes; 20 and 25 arrive only on an imported profile, and at
               * two 20-minute sessions the clock affords about 8 sets against
               * four patterns that want 11. Something has to be under the line
               * there, and scaling the floors down is the least bad of the
               * options — the alternative is dropping a movement pattern
               * entirely.
               *
               * Failing the build for it would be asserting a policy the
               * arithmetic cannot meet. Staying silent would be pretending the
               * week is fine. So it says so and moves on.
               */
              if (minutes >= 30) {
                err(`${goal} ${minutes}min x${days}: ${g} has ${vol[g]} sets, under the ${min} `
                  + `that volume.js calls the line between training and decoration`);
              } else {
                warn(`${goal} ${minutes}min x${days}: ${g} gets ${vol[g]} sets — under the ${min} `
                  + `volume.js calls training, but the clock affords no more. Not reachable from the questionnaire.`);
              }
            }
          }
        }
      }
    }
    if (checked < 200) err(`the volume-fits-the-clock check only ran ${checked} profiles`);

    /* A profile with no age is an adult, at every gate, however the blank looks. */
    const asked = {
      'isMinor': (p) => age.isMinor(p),
      'withholdsPhotoScan': (p) => age.withholdsPhotoScan(p),
      'withholdsFatLoss': (p) => age.withholdsFatLoss(p),
      'withholdsBodyNumbers': (p) => age.withholdsBodyNumbers(p),
      'withholdsHeavyLoad': (p) => age.withholdsHeavyLoad(p),
      'hidesBodyReading': (p) => age.hidesBodyReading(p),
      'stillDeveloping': (p) => age.stillDeveloping(p),
    };
    for (const blank of [null, undefined, '', '   ', 'abc', NaN]) {
      const p = { age: blank, sex: 'male', heightCm: 175, weightKg: 75 };
      for (const name of Object.keys(asked)) {
        if (asked[name](p)) {
          err(`age.js: a profile with age ${JSON.stringify(blank)} answers true to ${name}() — `
            + `the file says an unknown age is treated as an adult`);
        }
      }
      if (age.growthAllowanceKgPerWeek(p) !== 0) {
        err(`age.js: a profile with age ${JSON.stringify(blank)} is given a growth allowance`);
      }
    }
    // ...and the goal assessment agrees, since it is the surface that showed it.
    for (const blank of [null, undefined, '']) {
      const p = Object.assign(schema.defaults(), {
        age: blank, sex: 'male', heightCm: 175, weightKg: 80,
        goal: 'fatloss', targetWeightKg: 72,
      });
      const verdict = targets.assessGoal(p);
      if (/הגוף עוד גדל/.test(verdict.verdict || '')) {
        err(`assessGoal refuses fat loss for a profile with age ${JSON.stringify(blank)} on the `
          + `grounds that the body is still growing`);
      }
    }
    // The gates must still fire for someone who actually is young.
    {
      const kid = { age: 13, sex: 'male', heightCm: 155, weightKg: 42 };
      if (!age.isMinor(kid) || !age.withholdsFatLoss(kid) || !age.withholdsPhotoScan(kid)) {
        err('the age gates stopped firing for a 13-year-old — the blank-age fix went too far');
      }
    }
  } catch (e) { err(`volume-capacity / blank-age check could not run: ${e.message}`); }
}

/*
 * The age bounds come from one place, and hold at every layer.
 *
 * The floor was a bare 10 in six files — the questionnaire's min, its validate,
 * normalizeProfile's clamp, two engines and the free-text parser. Moving the app
 * to 12 meant changing all six, and a seventh written later would have
 * disagreed silently: the field would refuse 11 while the engine happily planned
 * for it.
 *
 * Checked at the three layers that can each let an age through on their own —
 * what the form accepts, what normalizeProfile stores, and what the free-text
 * parser extracts.
 */
{
  try {
    const age = await load('src/engine/age.js');
    const schema = await load('src/intake/schema.js');
    const MIN = age.MIN_AGE;
    const MAX = age.MAX_AGE;
    if (!(MIN >= 12 && MIN < MAX && MAX <= 120)) err(`age bounds look wrong: ${MIN}-${MAX}`);

    let field = null;
    for (const step of schema.STEPS || []) {
      for (const f of step.fields || []) if (f.key === 'age') field = f;
    }
    if (!field) { err('the questionnaire has no age field'); }
    else {
      if (field.min !== MIN || field.max !== MAX) {
        err(`the age field accepts ${field.min}-${field.max} but the rule is ${MIN}-${MAX}`);
      }
      for (const bad of [MIN - 1, MAX + 1]) {
        if (!field.validate(bad)) err(`the age field accepts ${bad}, outside ${MIN}-${MAX}`);
      }
      for (const good of [MIN, MAX]) {
        if (field.validate(good)) err(`the age field rejects ${good}, which is inside ${MIN}-${MAX}`);
      }
    }

    // normalizeProfile is the last line: an imported profile must be clamped.
    for (const bad of [3, MIN - 1, MAX + 1, 200]) {
      const got = schema.normalizeProfile(Object.assign(schema.defaults(), { age: bad })).age;
      if (got < MIN || got > MAX) {
        err(`normalizeProfile let age ${bad} through as ${got} — an imported profile can `
          + `smuggle an age the plan was never designed around`);
      }
    }
  } catch (e) { err(`age-bounds check could not run: ${e.message}`); }
}

/* ---------------- report ---------------- */

console.log(`exercises: ${allEx.size}`);
for (const w of warnings) console.log(`  warn  ${w}`);
for (const e of errors) console.log(`  ERROR ${e}`);
console.log(errors.length ? `\n${errors.length} error(s)` : '\nOK');
process.exit(errors.length ? 1 : 0);
