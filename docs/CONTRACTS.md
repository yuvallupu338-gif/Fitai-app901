# FitAI — module contracts

Single source of truth for every module. **Read this fully before writing code.**
If your module violates a shape here, integration breaks. When in doubt, follow
this document over your own judgement.

## Ground rules

- **Vanilla ES modules.** No build step, no npm packages, no framework, no JSX,
  no TypeScript. Files are loaded directly by the browser via `<script type="module">`.
- **Every file must parse under `node --check`** and must be importable by Node 22
  (`node --input-type=module -e "import('./file.js')"`). No DOM access at module
  top level — data modules must be pure data + pure functions.
- **Hebrew UI copy, RTL.** All user-facing strings are Hebrew. Code identifiers,
  comments and keys are English.
- **No `innerHTML` with interpolated user data.** Use `textContent` or `h()` from
  `src/core/dom.js`.
- Use `export const NAME = ...` named exports exactly as specified. No default exports.
- Prefer plain data over cleverness. These modules are read by humans.

---

## 1. Profile

Produced by the intake wizard, consumed by every engine module.

```js
{
  name: String,                 // may be ''
  age: Number,                  // 10..90
  sex: 'male' | 'female' | 'other',
  heightCm: Number,
  weightKg: Number,

  experience: 'beginner' | 'returning' | 'intermediate' | 'advanced',
  //   beginner     — never trained or < 3 months
  //   returning    — trained before, back after a break
  //   intermediate — 1+ year continuous
  //   advanced     — 3+ years continuous, knows their numbers

  goal: 'fatloss' | 'muscle' | 'strength' | 'fitness' | 'sport',
  sport: String | null,         // set only when goal === 'sport'
  targetDate: 'YYYY-MM-DD',
  targetWeightKg: Number | null,

  daysPerWeek: Number,          // 2..6
  minutesPerSession: Number,    // 20..120
  trainingDays: [Number],       // day indices, 0 = Sunday .. 6 = Saturday
  timeOfDay: 'morning' | 'noon' | 'evening',

  location: 'full_gym' | 'building_gym' | 'home_weights' | 'home_bodyweight',
  gymMachines: Boolean,         // meaningful when location is a gym
  equipment: [String],          // see EQUIPMENT below

  injuries: [String],           // see INJURY TAGS below
  surgeries: String,
  medical: String,
  avoid: [String],              // free-text exercise names the user refuses

  currentActivity: String,
  benchmarks: {                 // any field may be null
    pushups: Number|null, pullups: Number|null, plankSec: Number|null,
    squatKg: Number|null, benchKg: Number|null, deadliftKg: Number|null
  },
  sleepHours: Number,           // 4..12
  stress: Number,               // 1 (calm) .. 5 (fried)

  wantsNutrition: Boolean,
  mealsPerDay: Number,          // 3..6
  whoCooks: 'self' | 'family' | 'partner' | 'outside',
  diet: [String],               // 'vegetarian','vegan','kosher','halal','gluten_free','lactose_free','none'
  allergies: String,
  supplements: String
}
```

### EQUIPMENT tokens

`none`, `pullup_bar`, `dip_bars`, `rings`, `bands`, `dumbbells`, `barbell`,
`kettlebell`, `bench`, `box`, `machines`, `cable`, `trx`, `jump_rope`, `mat`,
`sled`, `treadmill`, `bike`, `rower`.

`none` is implicit — every profile can do bodyweight-on-the-floor work.

### INJURY TAGS

`lower_back`, `upper_back`, `neck`, `shoulder`, `elbow`, `wrist`, `hip`,
`knee`, `ankle`, `hernia`, `pregnancy`, `heart`, `asthma`.

---

## 2. Exercise

Every exercise object, in every `src/data/exercises.*.js` file:

```js
{
  id: 'db_bench_press',         // snake_case, globally unique, ASCII
  name: 'לחיצת חזה עם משקולות', // Hebrew
  nameEn: 'Dumbbell Bench Press',
  pattern: String,              // see PATTERNS
  muscles: { primary: [String], secondary: [String] },   // see MUSCLES
  equipment: [String],          // ALL of these are required to perform it
  level: 1|2|3|4|5,             // 1 = anyone, 5 = advanced only
  unit: 'reps' | 'time' | 'distance',
  unilateral: Boolean,          // true if prescribed "per side"
  contraindications: [String],  // INJURY TAGS this exercise stresses
  cues: [String],               // 1..3 short Hebrew coaching cues
  regressionOf: String|null,    // id of the harder variant, if any
  progressionTo: String|null,   // id of the next harder variant, if any
  tags: [String]                // free: 'compound','isolation','explosive','skill','warmup','finisher','cardio'
}
```

A drill tagged `warmup` needs one thing more: an entry in `src/data/demands.js`,
either under `DEMANDS` with what it asks of a body beyond injury — `impact`,
`floor`, `deep_knee`, `hang`, `balance` — or in `PLAIN_STANDING` if it asks
nothing. `contraindications` says whether a movement hurts a part that already
hurts; it says nothing about whether a healthy seventy-eight-year-old should be
doing it, which is what the generator needs in order to build a warm-up that
suits an age. `validate.js` requires every warm-up drill to appear in one list or
the other, so "fine for anybody" is a decision somebody made rather than the
default a new drill falls into by nobody looking.

### PATTERNS

`horizontal_push`, `vertical_push`, `horizontal_pull`, `vertical_pull`,
`squat`, `hinge`, `lunge`, `core_flexion`, `core_antiextension`,
`core_rotation`, `calf`, `arms_biceps`, `arms_triceps`, `shoulders_lateral`,
`shoulders_rear`, `carry`, `conditioning`, `mobility`, `plyo`.

### MUSCLES

`chest`, `back`, `lats`, `traps`, `shoulders`, `rear_delts`, `biceps`,
`triceps`, `forearms`, `core`, `obliques`, `lower_back`, `glutes`, `quads`,
`hamstrings`, `calves`, `hip_flexors`, `adductors`, `full_body`.

### Exercise DB rules

1. **IDs are unique across ALL files.** Prefix with equipment where ambiguous
   (`db_row`, `bb_row`, `cable_row`, `ring_row`).
2. Cover the full equipment ladder for each pattern: bodyweight-only → bands →
   dumbbells → barbell → machine/cable → rings.
3. For each pattern include at least 3 genuine **level 1–2** options so a
   `home_bodyweight` beginner with injuries still gets a full session.
4. `contraindications` must be honest and specific. Overhead press →
   `['shoulder']`. Barbell back squat → `['knee','lower_back']`. Do not tag
   everything with everything, or the filter starves.
5. `regressionOf` / `progressionTo` must reference real ids in the same family.
6. Cues are short and imperative Hebrew: `'גב ישר'`, `'מרפקים צמודים לגוף'`.

---

## 3. Engine modules

### `src/engine/volume.js`

```js
export function weeklyVolume(profile) -> {
  push: Number, pull: Number, legs: Number, core: Number,
  arms: Number, shoulders: Number, calves: Number, conditioning: Number,
  total: Number, note: String    // Hebrew, one sentence explaining the allocation
}
```
Sets per week per group. Respect the 10–20 effective-sets window, scale by
experience, `daysPerWeek`, `minutesPerSession`, sleep and stress, and bias by goal.

```js
export function splitFor(profile) -> {
  name: String,                  // Hebrew, e.g. 'פול־באדי ×3'
  rationale: String,             // Hebrew, one sentence
  days: [ { id, title, focus, patterns: [String], emphasis: [String] } ]
}
```
`days.length === profile.daysPerWeek`. `id` is stable and ASCII (`upper`, `lower`,
`fbA`, `push`, `pull`, `legs`, ...). `patterns` lists the movement patterns that
session must cover, in the order they should be trained.

```js
export function sessionBudget(profile) -> { warmupMin, mainMin, finisherMin, maxSlots }
```

### `src/engine/generator.js`

```js
export function generateProgram(profile) -> Program
```

```js
Program = {
  meta: {
    splitName, rationale, daysPerWeek, minutesPerSession,
    weeksTotal: Number, generatedAt: 'YYYY-MM-DD'
  },
  volume: <weeklyVolume() result>,
  warmup: [ { name, prescription, note } ],     // Hebrew
  cooldown: [ { name, prescription, note } ],
  days: [ Day ],
  notes: [String]                              // Hebrew caveats/reminders
}

Day = {
  id: String,                  // matches splitFor().days[].id
  dayIndex: Number,            // 0..6, from profile.trainingDays
  title: String,               // Hebrew
  focus: String,               // Hebrew, one sentence
  durationMin: Number,
  slots: [ Slot ]
}

Slot = {
  key: String,                 // stable per day, e.g. 's1' — used for done/pick keys
  role: 'skill'|'main'|'secondary'|'accessory'|'core'|'finisher',
  variants: [ Prescription ]   // 2..4 interchangeable options, same job, sorted easy→hard
}

Prescription = {
  exId, name, nameEn, sets, reps, rest, tempo|null, level, unit, unilateral,
  note: String,                // Hebrew — one line of why/how
  muscles: [String]
}
```

Hard requirements:
- Never emit an exercise whose `equipment` isn't satisfied by the profile.
- Never emit an exercise whose `contraindications` intersect `profile.injuries`,
  **unless** no alternative exists for a required pattern — in which case pick the
  lowest-level option and prepend `'⚠︎ '` plus a Hebrew caution to its `note`.
- Never emit an exercise whose name matches an entry in `profile.avoid`
  (case-insensitive substring, both Hebrew and English names).
- `sets` across a week must land within ±15% of `weeklyVolume()` per group.
- Session slot count must fit `sessionBudget().maxSlots`.
- Deterministic: same profile in → same program out. **No `Math.random()`.**
  Use a seeded shuffle keyed off a hash of the profile if you need variety.
- Every `variants` array is non-empty.

### `src/engine/progression.js`

```js
export function buildPhases(profile) -> [ { weeks: [start, end], title, desc } ]
export function progressionModel(profile) -> {
  chain: [String],             // Hebrew ladder, e.g. ['עוד חזרות','עוד סט',...]
  rule: String,                // Hebrew, the double-progression rule in one line
  deloadEveryWeeks: Number,
  loadJumpKg: Number,
  cards: [ { k, title, body } ]   // Hebrew info cards
}
export function projectTargets(profile) -> [ { label, today, target } ]  // Hebrew table rows
export function weeklyPlanNote(profile, week) -> String                  // Hebrew, per-week nudge
```

### `src/engine/targets.js`

```js
export function assessGoal(profile) -> {
  weeks: Number,
  kgDelta: Number,             // signed, target − current
  ratePerWeekKg: Number,
  realistic: Boolean,
  verdict: String,             // Hebrew — honest, kind, specific
  suggestedTargetKg: Number|null,
  suggestedDate: 'YYYY-MM-DD'|null,
  milestones: [ { date, label, weightKg } ]
}
export function facts(profile) -> [ { label, value } ]   // header chips: weight, target, height, sleep, session length
```
Be honest. 1% bodyweight/week fat loss and ~0.25–0.5%/week gain for a novice are
the ceilings. If a target needs more, `realistic:false` and a concrete
alternative in `suggestedTargetKg` / `suggestedDate`.

### `src/engine/nutrition.js`

```js
export function nutritionPlan(profile) -> {
  strategy: {
    bmr, tdee, kcal, proteinG, carbsG, fatG,
    deltaKcal: Number,          // signed vs maintenance
    basis: String               // Hebrew: which formula, which activity factor
  } | null,                     // null when profile.age < 16 — habits, not numbers
  plate: [ { k, title, body } ],
  meals: [ Meal ],
  eatingOut: [ { where, pick } ],
  checkins: [ { k, title, body } ],
  warnings: [String]
}

Meal = {
  time: 'HH:MM', slot: String, job: String,
  trainingOnly: Boolean,        // hidden on rest days
  variants: [ { n: String, i: String } ]   // n = name, i = ingredient line
}
```
- `meals.length === profile.mealsPerDay` (plus at most one training-only meal).
- **≥ 4 variants per meal.** Every variant must respect `profile.diet` and avoid
  `profile.allergies`.
- Under 16: `strategy` is `null` and `warnings` must include the no-creatine /
  no-protein-powder / parent-and-doctor line.

### `src/intake/schema.js`

```js
export const STEPS = [ Step ]
Step = { id, title, subtitle, fields: [Field], optional?: Boolean }
Field = {
  key, label, help, type, unit, placeholder, required,
  options: [ { value, label, desc } ],   // for choice/multi
  min, max, step,                        // for number/scale
  showIf: (profile) => Boolean,
  validate: (value, profile) => String|null   // Hebrew error, null = ok
}
```
`type` ∈ `'number' | 'text' | 'textarea' | 'choice' | 'multi' | 'date' | 'days' | 'scale' | 'toggle' | 'chips'`.

```js
export function defaults() -> profile          // every key present, sane values
export function validateStep(stepIndex, profile) -> { ok, errors: { key: msg } }
export function normalizeProfile(profile) -> profile   // coerce types, clamp ranges, derive equipment from location
export function summarize(profile) -> [ { label, value } ]   // Hebrew review screen
```

`normalizeProfile` owns the location→equipment defaults:
- `full_gym` → everything except `sled`
- `building_gym` → `dumbbells, bench, treadmill, bike, mat` (+ `machines` if `gymMachines`)
- `home_weights` → `dumbbells, bands, mat` (+ whatever the user ticked)
- `home_bodyweight` → `none, mat` (+ whatever the user ticked)

Steps must cover, in order: basics → experience → goal + target date →
availability → equipment/location → limitations → current state → nutrition (optional).

---

## 4. Style

Design tokens live in `src/styles/tokens.css` and mirror the reference document:
night `#0E1520`, steel `#182435`, line `#2C3D57`, chalk `#EAF0F8`,
dim `#8298B4`, amber `#FFB13C`, cyan `#56D9CE`.
Fonts: `Secular One` (display), `Assistant` (body), `IBM Plex Mono` (numbers).
Do not introduce new colours in engine or data modules — they emit data, not markup.

## 5. Self-check before you finish

```
node --check <your-file>
node --input-type=module -e "import('./<your-file>').then(m=>console.log(Object.keys(m)))"
```
Then run `node tools/validate.js` if it exists — it cross-checks ids, equipment
tokens, injury tags, warm-up demands and required exports.
