# TomorrowAI — module contracts

Single source of truth for every module in `tomorrow/`. **Read this fully before
writing code.** If a module violates a shape here, integration breaks. When in
doubt, follow this document over your own judgement.

TomorrowAI is not a to-do list. It learns how the user actually functions,
analyses the next day before it starts, predicts load, energy, focus and risk,
and offers concrete changes that can make tomorrow better. Every product, UX and
engineering decision reinforces that.

---

## 0. Ground rules

- **Vanilla ES modules.** No build step, no npm packages, no framework, no JSX,
  no TypeScript. Files load directly in the browser via `<script type="module">`.
  This matches the rest of the repository and keeps GitHub Pages working.
- **Every file must parse under `node --check`** and every `src/engine/**`,
  `src/core/time.js`, `src/core/fmt.js`, `src/storage/**` and `src/data/**` file
  must be importable by Node 22 with **no DOM access at module top level**. The
  validator imports them directly.
- **Relative paths only.** Never a leading `/`. Pages serves this from a
  subpath.
- **Hebrew UI copy, RTL.** All user-facing strings are Hebrew. Code identifiers,
  comments, keys and enum tokens are English. The product name `TomorrowAI`
  stays Latin.
- **No `innerHTML` with interpolated data.** Use `h()` from `src/core/dom.js`.
  Inline SVG built by `h()`-like helpers is fine; never string-concatenate user
  text into markup.
- Named exports only, exactly as specified. **No default exports.**
- Prefer plain data over cleverness. These modules are read by humans.

### Determinism — the hard rule

Everything under `src/engine/` is **pure**. Given the same input it returns the
same output, forever.

- No `Math.random()`. No `Date.now()`. No `new Date()` with no argument.
- Anything that needs the current time takes it as an explicit argument.
- No mutation of any argument. Clone before you change.
- No `localStorage`, no `window`, no `document`.

`tools/tomorrow-validate.mjs` runs every engine entry point twice on the same
input and fails the build if any byte of the JSON differs.

### Prediction, not magic — the copy rule

The app never claims to know the future. Every prediction is phrased as an
estimate, a probability or a likely scenario, and carries a confidence.

- Wrong: `מחר תהיה עייף ב-14:00.`
- Right: `לפי הימים האחרונים שלך, צפויה ירידה באנרגיה סביב 14:00.`

Copy that states a prediction as fact is a bug. Hedging words belong in the
string itself (`צפוי`, `סביר`, `נוטה`, `לפי הדפוס שלך`), not in a tooltip.

---

## 1. Time and dates

`src/core/time.js` owns every date and time operation. **No other module parses
or formats a date by hand.**

Two representations, and only two:

- **DateKey** — `'YYYY-MM-DD'`, a calendar day in the user's local timezone.
- **Minutes** — an integer, minutes from local midnight of that DateKey.
  `450` is 07:30. Values **may exceed 1439** and may be **negative**: a bedtime
  of 00:30 belonging to the night that ends on this date is `-1410`... no —
  see `sleepWindow()` below. Minutes on a schedule item are `0..1439`.

```js
export function todayKey(now) -> DateKey          // now: Date — required
export function addDays(key, n) -> DateKey
export function diffDays(a, b) -> Number          // a - b, in whole days
export function dayOfWeek(key) -> 0..6            // 0 = Sunday
export function isWeekend(key, weekStart) -> Boolean
export function parseKey(key) -> {y, m, d}        // throws on malformed input
export function isValidKey(key) -> Boolean
export function keyToDate(key, minutes) -> Date   // local Date at that instant
export function nowMinutes(now) -> Number         // 0..1439 local
export function clampMinutes(m) -> 0..1439
export function toMinutes(hhmm) -> Number|null    // '07:30' -> 450, tolerant, null if unparseable
export function fromMinutes(m) -> 'HH:MM'         // wraps at 24h, always 2-digit
export function snap(m, step) -> Number           // round to nearest `step` minutes
export function overlaps(aStart, aDur, bStart, bDur) -> Boolean
export function weekKeys(key, weekStart) -> [DateKey]   // the 7 days of that week
```

### Sleep spans midnight — one function decides

```js
export function sleepWindow(bedMinutes, wakeMinutes) -> { start, end, minutes }
```

`bedMinutes` and `wakeMinutes` are both `0..1439` clock readings. The night is
the one that **ends** on the forecast date. Returned `start` is expressed
relative to that date's midnight and is therefore **negative** for an evening
bedtime: 23:15 → `start = -45`. A bedtime of 00:30 → `start = 30`. `end` is
`wakeMinutes`. `minutes = end - start`, always positive.

Anything under 3h or over 14h is out of range; callers clamp for scoring but
`sleepWindow` reports the honest number.

### Timezone

The app runs in the browser's local timezone. `profile.timezone` stores the
IANA name from `Intl.DateTimeFormat().resolvedOptions().timeZone` for future
sync, and is never used to shift a calculation in the MVP. Do not implement
timezone conversion.

---

## 2. Formatting

`src/core/fmt.js`. Pure, Node-importable, Hebrew output.

```js
export function time(m, format) -> String     // format: '24h' | '12h'
export function duration(mins) -> String      // 95 -> '1 שעה 35 דק׳'; 45 -> '45 דק׳'
export function durationShort(mins) -> String // 95 -> '1:35'
export function range(start, dur, format) -> String   // '10:00–11:00' (en dash)
export function dayName(key) -> String        // 'ראשון'
export function dayShort(key) -> String       // 'א׳'
export function dateLabel(key, now) -> String // 'מחר' | 'היום' | 'אתמול' | 'יום שלישי, 3 בספטמבר'
export function relDay(key, now) -> String    // 'מחר' | 'בעוד 3 ימים' | 'לפני יומיים'
export function pct(n) -> String              // '84%'
export function signed(n) -> String           // '+8' | '−3' (real minus sign)
export function scoreLabel(score) -> String   // see §5
export function num(n) -> String              // integer, Hebrew-safe
```

### RTL and signed numbers

A leading `+` or `−` is a bidi-neutral character and detaches from its digits
inside a Hebrew paragraph: `+8` renders as `8+`. Any signed number rendered
inside Hebrew prose **must** be wrapped by `signedNum()` from `src/core/dom.js`,
which emits `<span dir="ltr">`. Ranges (`8–12`, `10:00–11:00`) must **not** be
wrapped — they read correctly right-to-left as-is, and forcing LTR is the bug.

---

## 3. Domain model

### 3.1 Profile

```js
Profile = {
  name: String,                  // may be ''
  wakeTime: Number,              // 0..1439, usual wake
  bedTime: Number,               // 0..1439, usual bedtime
  priorities: [String],          // 'work'|'school'|'fitness'|'sleep'|'focus'|'projects'|'freetime'|'habits'
  focusPreference: 'morning'|'afternoon'|'evening'|'unsure',
  weekStart: 0|1,                // 0 = Sunday
  timeFormat: '24h'|'12h',
  theme: 'dark'|'light',
  reduceMotion: Boolean,         // user override on top of the media query
  notifications: { evening: Boolean, morning: Boolean, eveningAt: Number, morningAt: Number },
  timezone: String,              // IANA, informational only
  createdAt: String              // ISO
}
```

### 3.2 Item — one thing in a day

A single type covers tasks and events. `kind` discriminates; `locked` decides
whether the scheduler may move it.

```js
Item = {
  id: String,                    // 'itm_' + base36, unique
  kind: 'task'|'event',
  type: 'task'|'event'|'workout'|'study'|'meeting'|'break'|'sleep'|'custom',
  title: String,                 // non-empty after trim — enforced at the edge
  notes: String,                 // '' when absent
  date: DateKey,
  start: Number|null,            // 0..1439; null = unscheduled (tasks only)
  duration: Number,              // planned minutes, 5..600
  locked: Boolean,               // true = the scheduler must not move it

  category: 'work'|'study'|'fitness'|'personal'|'errand'|'social'|'health'|'other',
  priority: 'low'|'medium'|'high'|'critical',
  deadline: DateKey|null,
  estimatedDuration: Number,     // what the user typed; `duration` may be the learned estimate
  actualDuration: Number|null,   // filled on completion
  difficulty: 1|2|3|4|5,
  energyRequirement: 'low'|'medium'|'high',
  focusRequirement: 'low'|'medium'|'high',
  preferredTime: 'morning'|'afternoon'|'evening'|'any',
  status: 'planned'|'done'|'skipped',
  isTop: Boolean,                // one of the ≤3 "most important tomorrow"

  createdAt: String,             // ISO
  completedAt: String|null       // ISO
}
```

Rules:

- `kind: 'event'` defaults `locked: true`, `priority: 'high'`, and always has a
  `start`. An event with `start === null` is invalid.
- `type: 'sleep'` items are never created. Sleep lives in `DayPlan`.
- `estimatedDuration` is what the user believes. `duration` is what the app
  schedules, which after learning may be larger. Never overwrite
  `estimatedDuration`.

### 3.3 DayPlan — the frame of one day

```js
DayPlan = {
  date: DateKey,
  wake: Number,                  // 0..1439
  bedtime: Number,               // 0..1439, the bedtime of the night BEFORE `date`
  nextBedtime: Number,           // 0..1439, when they plan to sleep at the END of `date`
  eveningState: { energy: 1..5, mood: 1..5, stress: 1..5 } | null,
  topPriorities: [String],       // ≤3 Item ids
  preparedAt: String|null,       // ISO — set when the evening ritual completes
  appliedPlanId: String|null     // id of the last applied optimisation, for undo
}
```

`bedtime` + `wake` feed `sleepWindow()` and give the night's length.
`nextBedtime` is what the "sleep 45 minutes earlier" recommendation moves and
what closes the day's timeline.

### 3.4 DayRecord — what actually happened

```js
DayRecord = {
  date: DateKey,
  forecast: ForecastSnapshot|null,   // frozen at the moment the day was prepared
  morning: { energy: 1..5, mood: 1..5, sleepQuality: 1..5, at: String } | null,
  checkpoints: [ { minute: Number, energy: 1..5, at: String } ],
  actual: {
    dayScore: Number|null,           // 0..100, computed by accuracy.js
    completed: Number, planned: Number,
    focusMinutes: Number,
    sleepMinutes: Number|null
  } | null,
  review: { tags: [String], note: String, at: String } | null,
  accuracy: { overall: Number, energy: Number|null, duration: Number|null,
              completion: Number|null } | null
}
```

`review.tags` ⊂ `'more_tired'`, `'more_energetic'`, `'tasks_longer'`,
`'tasks_shorter'`, `'unexpected_event'`, `'accurate'`.

`ForecastSnapshot` is a `Forecast` (§6) with the curves downsampled to hourly
and `timeline` dropped — history must not grow without bound.

### 3.5 LearningProfile

```js
LearningProfile = {
  samples: {                     // how many observations back each field
    days: Number, mornings: Number, durations: Number,
    completions: Number, reviews: Number
  },
  averageWakeTime: Number|null,
  averageSleepDuration: Number|null,
  averageSleepQuality: Number|null,
  morningEnergy: Number|null,    // 0..100
  afternoonEnergy: Number|null,
  eveningEnergy: Number|null,
  focusPeakHour: Number|null,    // 0..23
  energyPeakHour: Number|null,
  bestDayOfWeek: Number|null,    // 0..6
  lowestEnergyDay: Number|null,
  averageTaskCompletionRate: Number|null,     // 0..1
  averageEstimationError: Number|null,        // ratio: 1.4 = takes 40% longer than estimated
  estimationErrorByCategory: { [category]: { ratio: Number, n: Number } },
  procrastinationRate: Number|null,           // 0..1
  preferredTaskDuration: Number|null,         // minutes
  breakEffectiveness: Number|null,            // 0..1
  sleepEnergyCorrelation: Number|null,        // -1..1
  sleepFocusCorrelation: Number|null,
  workloadStressCorrelation: Number|null,
  consistency: Number,                        // 0..1, how repeatable the user is
  updatedAt: String|null
}
```

Every numeric field is `null` until there is at least one observation. `null`
means "no personal signal" and the engine falls back to the default model — it
never means zero.

---

## 4. Storage

### 4.1 Root document

One key: `tomorrowai.v1`.

```js
Root = {
  schemaVersion: 1,
  user: { id: String, createdAt: String, onboarded: Boolean, demo: Boolean },
  profile: Profile,
  items: { [id]: Item },
  days:   { [DateKey]: DayPlan },
  records:{ [DateKey]: DayRecord },
  learning: LearningProfile,
  feedback: [ { at: String, kind: String, payload: Object } ],
  chat: [ { role: 'user'|'ai', text: String, at: String } ],
  settings: { firstRun: Boolean, lastSeenDate: DateKey|null },
  ui: { view: String, historyRange: 7|30|90|365, scheduleMode: 'day'|'week' }
}
```

### 4.2 Adapter

`src/storage/adapter.js` — swappable so Supabase/Firebase/an API can replace it.

```js
export const LocalStorageAdapter = { name, available() -> Boolean,
  read(key) -> Object|null, write(key, value) -> Boolean,
  remove(key) -> Boolean }
export const MemoryAdapter = { ...same shape }
export function pickAdapter() -> adapter     // LocalStorage if it truly works, else Memory
export function persists() -> Boolean        // false when nothing survives a reload
```

`persists()` must be honest. The UI says so before the user spends a minute on
the evening ritual they are about to lose.

### 4.3 Migration

`src/storage/migrate.js`

```js
export const SCHEMA_VERSION = 1
export function migrate(raw, nowIso) -> Root  // never throws; unreadable input -> fresh Root
```

`nowIso` is optional and exists so the storage layer can be made deterministic
for the validator. A first-run document has no other source for its own creation
time, so this is the single place in `src/storage/` allowed to read the system
clock, and only when a caller does not supply one.

Stored data that is corrupt, from the future, or not a TomorrowAI document at
all returns a fresh `Root` rather than crashing the app.

### 4.4 Schema and factories

`src/storage/schema.js` — pure, Node-importable.

```js
export function emptyRoot(nowIso) -> Root
export function defaultProfile(nowIso) -> Profile
export function emptyLearning() -> LearningProfile
export function makeItem(patch, nowIso) -> Item        // fills every field, validates
export function makeDayPlan(date, profile) -> DayPlan
export function makeRecord(date) -> DayRecord
export function normalizeRoot(raw, nowIso) -> Root     // total: any input -> valid Root
export function validateItem(patch) -> [String]        // Hebrew problems, [] when fine
```

`validateItem` catches: empty title, duration ≤ 0 or > 600, end past midnight,
start outside 0..1439, deadline before today, malformed date.

### 4.5 Store

`src/core/store.js` — state + pub/sub over the adapter. Browser side only.

```js
export function get() -> Root
export function set(patch) -> Root           // patch object or (root) => patch
export function update(fn) -> Root           // mutate in place, then persist
export function subscribe(fn) -> unsubscribe
export function reset()
export function persists() -> Boolean
export function exportJson() -> String
export function importJson(text) -> Root     // throws on a file that is not a backup
```

Plus typed helpers, all of which persist and emit:

```js
export function itemsOn(date) -> [Item]            // sorted by start, unscheduled last
export function putItem(patch) -> Item
export function patchItem(id, patch) -> Item|null
export function removeItem(id) -> Boolean
export function dayPlan(date) -> DayPlan           // creates from profile if absent
export function putDayPlan(date, patch) -> DayPlan
export function record(date) -> DayRecord
export function putRecord(date, patch) -> DayRecord
export function pushFeedback(kind, payload)
```

---

## 5. Scoring — `src/engine/scoring.js`

```js
export const FACTORS = [ { key, label, weight, hint } ]   // exactly the six below
export function scoreDay(input) -> ScoreResult
```

Six factors, weights summing to 1:

| key | label (he) | weight |
|---|---|---|
| `sleep` | שינה | 0.22 |
| `balance` | איזון היום | 0.20 |
| `focus` | התאמת ריכוז | 0.18 |
| `goals` | קידום מטרות | 0.15 |
| `free` | זמן פנוי | 0.13 |
| `risk` | סיכון | 0.12 |

```js
ScoreResult = {
  score: Number,                 // 0..100, integer
  label: String,                 // Hebrew band
  band: 'low'|'fair'|'good'|'great',
  factors: [ {
    key, label, score,           // 0..100 integer
    weight, detail,              // Hebrew one-liner, e.g. '7 שעות 35 דק׳ מתוכננות'
    direction: 'up'|'down'|'flat',   // vs the user's own average
    contribution: Number         // weight * score, for the breakdown
  } ],
  reasons: { up: [String], down: [String] }   // 2..4 each, Hebrew, for "למה 74?"
}
```

Bands: `< 55` `'יום מאתגר'` (low), `55..69` `'יום סביר'` (fair),
`70..84` `'יום טוב'` (good), `≥ 85` `'יום טוב מאוד'` (great).

The raw formula is never shown to the user. `reasons` is.

Each factor score is a documented, monotonic function of the inputs. No
lookup-table magic numbers without a comment saying where they came from.

---

## 6. Prediction engine — `src/engine/predict.js`

The one entry point the UI calls.

```js
export function forecast(input) -> Forecast
```

```js
ForecastInput = {
  date: DateKey,
  profile: Profile,
  plan: DayPlan,
  items: [Item],                 // items on `date` only
  learning: LearningProfile,
  history: [DayRecord],          // most recent first, may be []
  now: Date,                     // injected; used only for "is this today"
  morning: DayRecord['morning']  // null before the check-in
}
```

```js
Forecast = {
  date, score, label, band,
  factors: [...],                          // from scoreDay
  reasons: { up, down },
  energy: Curve, focus: Curve,
  focusWindows: [ { start, end, score, confidence } ],   // best first, ≤3
  energyPeak: { minute, value }, energyDip: { minute, value },
  focusPeak: { minute, value },
  risks: [ Risk ],                         // sorted by severity then score
  timeline: [ TimelineEntry ],
  confidence: Confidence,
  recommendation: Recommendation|null,     // the single highest-impact change
  insights: [ Insight ],                   // ≤3 relevant to this day
  totals: { loadMinutes, freeMinutes, sleepMinutes, awakeMinutes,
            taskCount, doneCount, topCount },
  meta: { personalWeight: Number, samples: Number, generatedFor: DateKey }
}

Curve = {
  step: 15,                                // minutes between samples
  from: Number, to: Number,                // absolute minutes, may exceed 1439
  points: [ { minute, value, confidence } ],   // value 0..100
  hourly: [ { hour, value } ]              // for compact display
}
```

`forecast()` must return byte-identical JSON for identical input. It is
memoised by the UI, never recomputed inside a render.

### 6.1 Energy — `src/engine/energy.js`

```js
export function energyCurve(ctx) -> Curve
export function energyAt(ctx, minute) -> Number
```

Composed, in this order, each documented in the file:

1. **Circadian base** — a smooth wake-to-bed shape: a rise over the first
   ~3h after waking, a broad late-morning plateau, a post-lunch trough around
   6.5–7.5h after waking, a modest late-afternoon rebound, then a decline into
   the evening that steepens near bedtime.
2. **Sleep debt** — a shortfall against the user's own need (learned, default
   8h) lowers the whole curve and deepens the trough. 6h ≈ −12, 5h ≈ −20.
3. **Accumulated load** — demanding items already finished by `minute` push the
   curve down; the effect decays. Breaks and free gaps recover it, scaled by
   `learning.breakEffectiveness`.
4. **Workouts** — a dip during and for ~45m after, then a small lift.
5. **Evening state** — `plan.eveningState.stress`/`energy` shifts the level.
6. **Morning check-in** — once it exists, it anchors the curve at wake and the
   rest re-levels toward it. This is what "your energy is lower than predicted"
   means.
7. **Personal blend** — `learning.morningEnergy/afternoonEnergy/eveningEnergy`
   and `energyPeakHour` are blended in by `personalWeight` (§8).

### 6.2 Focus — `src/engine/focus.js`

```js
export function focusCurve(ctx, energy) -> Curve
export function bestWindows(focus, opts) -> [ { start, end, score, confidence } ]
```

Focus is **not** energy. It is derived from energy but shaped by its own terms:

- a chronotype curve from `profile.focusPreference` and, once learned,
  `learning.focusPeakHour`, which overrides it as `personalWeight` rises;
- a warm-up cost in the first ~40 minutes after waking, which energy does not
  have;
- decay with continuous time-on-task, reset by breaks;
- a penalty for fragmentation — many short gaps between locked events;
- a penalty near a hard deadline only if stress is high; a small lift otherwise.

`bestWindows` returns contiguous runs of at least `opts.minMinutes` (default 45)
above a threshold, merged, capped at 3, best first, each with the mean
confidence of its samples.

### 6.3 Risk — `src/engine/risk.js`

```js
export const RISK_KEYS = ['overload','conflict','low_energy','procrastination','no_free_time','sleep']
export function assessRisks(ctx) -> [Risk]

Risk = {
  key, severity: 'low'|'medium'|'high',
  score: Number,                 // 0..100, drives ordering and the `risk` factor
  title: String,                 // Hebrew, calm — 'עומס אפשרי אחר הצהריים'
  reason: String,                // Hebrew — what in the data caused it
  suggestion: String,            // Hebrew — one concrete action
  window: { start, end }|null,   // when it applies, for the timeline
  itemIds: [String]
}
```

Language is calm. Never `סכנה!`. Prefer `ייתכן עומס`, `החלק הזה של היום עשוי
להרגיש צפוף`.

### 6.4 Confidence — `src/engine/confidence.js`

```js
export function assess(learning, history, ctx) -> Confidence

Confidence = {
  overall: Number,               // 0..100
  level: 'learning'|'low'|'medium'|'high',
  parts: { history, consistency, recency, accuracy, completeness },   // each 0..100
  reasons: [String],             // Hebrew, why it is where it is
  learningMode: Boolean          // true while overall < 45 or samples < 3
}
```

Confidence **must not** rise on day count alone. Inconsistent data holds it
down. Never present accuracy or confidence above what the data supports.

### 6.5 Timeline

```js
TimelineEntry = {
  minute: Number, kind: 'wake'|'item'|'gap'|'peak'|'dip'|'risk'|'sleep',
  title: String, detail: String,   // Hebrew
  itemId: String|null, energy: Number|null, tone: 'plain'|'good'|'warn'
}
```

Sorted by minute. Peaks, dips and risk markers are interleaved with items so the
day reads top to bottom.

---

## 7. Scheduler — `src/engine/scheduler.js`

```js
export function freeSlots(items, plan, opts) -> [ { start, end, minutes } ]
export function suggestSlot(item, ctx) -> { start, score, reason, confidence }|null
export function place(items, item, ctx) -> { items, placed }   // returns NEW arrays
export function conflicts(items) -> [ { a, b, minutes } ]
export function validatePlacement(items, item) -> [String]     // Hebrew problems
```

Rules, all enforced by the validator:

1. Never create an overlap with a locked item.
2. Never stack demanding items with no break: leave a **buffer of ≥10 minutes**
   between two items, and ≥15 when both are `energyRequirement: 'high'`.
3. A `focusRequirement: 'high'` item goes in a high-focus window when one is
   free; only fall back to a worse slot if none is.
4. Respect locked events and deadlines absolutely.
5. Keep free time: never fill the day past 80% of the awake window.
6. Never schedule inside the sleep window or before `wake + 20`.
7. Account for a 10-minute transition after any item of `type: 'meeting'`,
   `'workout'` or `'event'`.

`suggestSlot` explains itself: `reason` is a Hebrew sentence naming the actual
cause (`'חופף לחלון הריכוז החזק ביותר שלך'`).

---

## 8. Learning — `src/engine/learning.js`

```js
export function updateLearning(learning, records, items, opts) -> LearningProfile
export function personalWeight(learning) -> Number    // 0..0.8
export function estimateDuration(item, learning) -> { minutes, ratio, basis, confidence }
export function ema(prev, next, alpha) -> Number
export function recencyWeights(n, halfLife) -> [Number]
```

- **Recency weighting.** New data outweighs old. Use an exponential moving
  average with a half-life of ~7 observations. A pattern that changed last week
  must win over one from last month.
- **The blend moves.** `personalWeight(learning) = base * (0.6 + 0.4 * consistency)`
  where `base = min(0.8, n / (n + 9))` and `n = learning.samples.days`. That
  gives roughly 10% personal on day 1, ~44% at 7 days, ~77% at 30 — the shape
  §25 of the brief asks for — while inconsistent data holds it back.
- **Duration learning is the headline.** `estimateDuration` returns the minutes
  the app should actually schedule. With ≥3 comparable samples in the same
  category it applies the learned ratio; `basis` says which
  (`'category'|'global'|'default'`). This must visibly change the schedule —
  the validator asserts it.

---

## 9. Optimiser — `src/engine/optimize.js`

```js
export function improve(ctx, opts) -> Improvement|null

Improvement = {
  id: String,                      // deterministic hash of the change list
  before: { score, factors }, after: { score, factors },
  delta: Number,
  changes: [ Change ],
  reasons: [String],               // Hebrew — why this is better
  items: [Item],                   // the full resulting item list
  plan: DayPlan                    // the resulting plan (bedtime may move)
}

Change = {
  kind: 'move'|'bedtime'|'break'|'defer'|'shorten'|'swap',
  itemId: String|null,
  from: Number|null, to: Number|null,
  label: String                    // Hebrew — 'הפרויקט עבר ל-18:30'
}
```

Deterministic greedy search:

- Candidate moves come from a fixed, ordered generator: bedtime earlier in
  15-minute steps up to 60; each unlocked item to each free slot on a 15-minute
  grid; insert a 15/20/30-minute break in the densest run; defer the
  lowest-priority item to the next day; shorten an over-long item to its learned
  duration.
- Score every candidate with the real `forecast()`. Take the best. Repeat up to
  **4 accepted changes** or until no candidate gains ≥1 point.
- Ties break by candidate order, never by iteration order of an object.
- Return `null` when nothing improves the day — and the UI must then say so
  honestly rather than inventing a change.

**The score improvement must come from a real change to the data.** A change
list that does not reproduce the `after` score when applied is a bug the
validator catches.

### 9.1 Primary recommendation

```js
export function primaryRecommendation(ctx) -> Recommendation|null

Recommendation = {
  key: String, title: String,      // Hebrew — 'ללכת לישון 45 דקות מוקדם יותר'
  detail: String,                  // Hebrew — why
  from: Number, to: Number,        // the projected score move
  change: Change, confidence: Number
}
```

The single highest-impact change, computed from the same candidate set. This is
one of the most prominent things in the product.

---

## 10. What-if — `src/engine/simulate.js`

```js
export const SCENARIO_CHIPS = [ { key, label, apply } ]   // §20 of the brief
export function simulate(ctx, mutations) -> Scenario

Mutation =
  | { kind: 'bedtime', minutes }        // absolute new bedtime
  | { kind: 'wake', minutes }
  | { kind: 'move', itemId, start }
  | { kind: 'duration', itemId, minutes }
  | { kind: 'priority', itemId, priority }
  | { kind: 'remove', itemId }
  | { kind: 'add', item }

Scenario = {
  base: Forecast, next: Forecast,
  diff: { score, energy, focus, load, free },   // signed numbers
  mutations: [Mutation],
  summary: [String]                             // Hebrew lines describing the diff
}
```

`simulate` **clones** everything. It must be impossible for a scenario to reach
the store. The UI keeps scenario state in its own module-level object, and the
validator asserts the store is untouched after a simulation.

---

## 11. Insights — `src/engine/insights.js`

```js
export function findInsights(learning, records, items) -> [Insight]

Insight = {
  key: String, text: String,       // Hebrew, one sentence, concrete
  evidence: String,                // Hebrew — 'על סמך 12 ימים דומים'
  samples: Number,
  strength: 'early'|'emerging'|'strong',
  metric: String|null, delta: Number|null
}
```

Sample gates, enforced: `3..4` → `early`, `5..9` → `emerging`, `≥10` → `strong`.
**Fewer than 3 samples produces no insight at all.** Never infer a pattern from
one day. Every insight names its evidence in the UI.

---

## 12. Accuracy — `src/engine/accuracy.js`

```js
export function scoreActualDay(record, items, plan) -> Number      // 0..100
export function compare(record) -> {
  predicted: Number, actual: Number, accuracy: Number|null,
  parts: { energy, duration, completion, focus },   // each Number|null
  note: String                                      // Hebrew
}
export function rollingAccuracy(records, n) -> Number|null
```

`accuracy` is `null` — not `0`, not an optimistic guess — when there is nothing
to compare. The UI shows `—` and says why. Never display 95% accuracy without
the samples behind it.

---

## 13. Explanations — `src/engine/explain.js`

```js
export function explainScore(forecast) -> [String]
export function explainFactor(factor, forecast) -> String
export function explainDay(forecast) -> String         // the 1–2 sentence summary
export function explainRisk(risk) -> String
export function explainChange(change, forecast) -> String
```

Template-driven, from real numbers. Short, calm, human, never dramatic, never
judgemental. Two sentences at most. Example of the register:

> `הבוקר שלך נראה חזק, אבל אחר הצהריים עמוס מהרגיל. העברה של משימה אחת לאחרי 18:00 ושינה חצי שעה מוקדם יותר משפרות את התחזית.`

---

## 14. Natural language — `src/engine/nlp.js`

```js
export function parseQuickAdd(text, ctx) -> ParseResult

ParseResult = {
  ok: Boolean,
  item: Partial<Item>|null,
  matched: { date, time, duration, type, title },   // which parts were understood
  confidence: Number,
  note: String                                     // Hebrew — what it could not read
}
```

A real, honest parser. Hebrew and digits: `מחר ב-17:00 יש לי אימון של שעה`
→ `{ type:'workout', date:tomorrow, start:1020, duration:60 }`. It recognises
relative days (`היום`, `מחר`, `מחרתיים`, weekday names), clock times
(`17:00`, `5 אחה"צ`, `בשמונה וחצי`), durations (`שעה`, `שעה וחצי`, `45 דקות`),
and type words (`אימון`, `פגישה`, `שיעור`, `ללמוד`, `הפסקה`).

When it cannot read a part it says so in `note` and leaves the field `null` for
the user to fill. **It never guesses silently**, and the UI always shows the
parsed result for confirmation before saving.

---

## 15. Chat — `src/engine/chat.js`

There is no model API connected. Do not pretend there is.

```js
export const CHAT_MODE = 'local'                  // the UI shows this
export function answer(question, context) -> { text, kind, followups: [String] }
export const SUGGESTIONS = [String]               // the example questions from §32
```

`answer` is a rule-based intent matcher over the live forecast: how tomorrow
looks, the highest-impact change, when to do the hardest task, why the score
moved, what happens if bedtime changes, whether the day is overloaded, find an
hour for a project. It answers from real numbers in `context`.

The chat UI states plainly that answers come from the local engine, and the file
exposes an adapter seam so a real model can be added later:

```js
export function setAdapter(fn)     // fn(question, context) -> Promise<{text}>
```

No fake latency, no fake streaming, no invented "thinking" for a call that is
not happening.

---

## 16. UI

### 16.1 Shell

`src/ui/shell.js` owns navigation and mounting. Five destinations, in this
order, mobile bottom bar / desktop sidebar:

`tomorrow` (מחר) · `schedule` (לוח) · `chat` (AI) · `insights` (תובנות) ·
`profile` (פרופיל)

Views are modules exporting `render(root, ctx) -> void`. A view never reaches
into another view's DOM. Re-render is scoped: a forecast update repaints the
cards that changed, not the shell.

### 16.2 Home order — fixed

1. Header — `ערב טוב, <name>` + `הנה איך מחר שלך נראה כרגע`
2. Tomorrow Score hero (ring + band + one-line subtext + `שפר את מחר` CTA)
3. Primary recommendation
4. Energy + focus preview
5. Key risks
6. Tomorrow timeline
7. Improve Tomorrow entry
8. Additional insights

Do not add a ninth card. Do not build a wall of widgets.

### 16.3 The five-second test

The home screen answers, without scrolling past the fold on a 390px phone:
how does tomorrow look, what is the most important thing, where is the problem,
when will I be sharpest, and what one change would help.

### 16.4 Charts — `src/ui/chart.js`

Hand-built inline SVG. No chart library.

```js
export function lineChart(opts) -> SVGElement      // energy/focus, with bands
export function ring(opts) -> SVGElement           // the score dial
export function sparkline(opts) -> SVGElement      // history rows
export function barRow(opts) -> HTMLElement        // factor bars
```

Charts must scale to their container (`viewBox` + `preserveAspectRatio`), never
overflow, and stay readable at 375px. Axis labels thin out on narrow screens
rather than overlapping.

### 16.5 Motion

Animate only where it carries meaning: the score counting from old to new, the
what-if curve morphing, the schedule settling after Apply, and the evening
ritual's analysis steps. Everything respects `prefers-reduced-motion` and the
profile override — when reduced, the end state appears immediately.

### 16.6 No dead buttons

Every control either works or is visibly marked `בקרוב` and is not clickable.
A button that looks live and does nothing is a bug.

### 16.7 Empty and error states

Every list has an empty state that explains what to do next and offers the
action. Every failure path — no free slot, invalid time, overlapping event,
empty title, broken stored data, no history — shows a calm Hebrew message and
leaves the app usable. The app must not crash.

### 16.8 Accessibility

Real `<button>` elements, labels on every input, visible focus rings, keyboard
reachable everything, `aria-live` for score and forecast updates, contrast at
WCAG AA for body text, and reduced-motion support.

---

## 17. Design

Dark by default. Calm, intelligent, spacious, premium — a personal intelligence
app, not a dashboard.

```
--bg: #080B12   --surface: #10151F   --surface-2: #151C29
--primary: electric indigo/blue     accent gradient indigo → blue → faint violet
--text: off-white   --text-dim: cool gray
--good: muted green   --warn: soft amber   --risk: muted coral
```

Radius 18–24px, generous spacing, a soft border, minimal glow, no glassmorphism
everywhere. One type scale — display for the score, medium-bold for section
titles, readable body, small muted meta. Fonts come from the repo's existing
embedded set (`../src/styles/fonts.css`): Assistant for body, Secular One for
display, IBM Plex Mono for numerals.

Breakpoints that must be clean: 375, 390, 430, 768, 1024, 1440. No horizontal
scroll anywhere, ever.

---

## 18. Demo mode

`src/data/demo.js`

```js
export function demoRoot(nowIso, now) -> Root
```

A complete, internally consistent world: a user with ~24 days of history whose
data actually produces the numbers shown. If sleep risk is high, sleep quality
is not simultaneously excellent. The learned duration ratio in the demo must be
derived from the demo's own logged actuals — the validator recomputes it.

Demo history must contain a real, discoverable pattern so the Insights screen
has something true to say on first open.

---

## 19. Verification

`tools/tomorrow-validate.mjs` — pure Node, no browser. Fails the build on:

- any engine module that imports the DOM or is not importable;
- non-determinism: every engine entry point called twice, JSON compared;
- store mutation during `simulate()`;
- an `Improvement` whose `changes` do not reproduce its `after` score;
- scheduler invariants (§7) violated by `place()` or `suggestSlot()`;
- duration learning that does not move the estimate after 3 samples;
- insights below the sample gate; confidence rising on count alone;
- accuracy reported with no data behind it;
- demo data whose derived numbers disagree with its own history.

`tools/tomorrow-smoke.mjs` — Playwright against the real page. Walks onboarding,
the evening ritual, Improve → Apply → Undo, What-If → Cancel/Apply, quick add,
morning check-in, end-of-day review, every view, a reload with data intact, and
the six viewport widths asserting no horizontal scroll and no clipped text.

---

## 20. Test hooks

The browser test drives the real app, so it needs stable handles that survive a
redesign. Every UI module tags its load-bearing elements with `data-t="<name>"`.
These are part of the contract: renaming one breaks `tools/tomorrow-smoke.mjs`.

| `data-t` | what it must be |
|---|---|
| `nav-tomorrow` `nav-schedule` `nav-chat` `nav-insights` `nav-profile` | the five navigation buttons |
| `view-<name>` | the mounted root of each view, same five names |
| `score` | the element whose text is the Tomorrow Score number |
| `score-label` | the band label next to it |
| `score-why` | the control that opens the score breakdown |
| `factor-<key>` | one row per score factor, key from §5 |
| `recommendation` | the primary recommendation card |
| `energy-chart` `focus-chart` | the two curve charts |
| `focus-window` | the best-focus-window readout |
| `risk` | each risk card |
| `timeline` | the timeline container; `timeline-entry` for each row |
| `improve` | the Improve Tomorrow CTA |
| `improve-apply` `improve-keep` `improve-undo` | the three outcomes |
| `whatif` | the What-If entry point |
| `whatif-chip` | each quick scenario chip |
| `whatif-apply` `whatif-cancel` | the two outcomes |
| `whatif-score-base` `whatif-score-next` | the two scores in the comparison |
| `ritual` | the evening ritual container; `ritual-next` `ritual-back` to move |
| `ritual-step-<n>` | the five ritual screens, 1-indexed |
| `bedtime` | the bedtime input in the ritual and in the profile |
| `quickadd` | the floating add button |
| `quickadd-nl` | the natural-language input |
| `quickadd-parsed` | where the parse result is shown for confirmation |
| `quickadd-save` | saves the new item |
| `item` | each schedule row; `item-edit` `item-delete` inside it |
| `item-title` `item-start` `item-duration` | the editor's fields |
| `morning` `morning-submit` `morning-skip` | the morning check-in |
| `review` `review-submit` | the end-of-day review |
| `insight` | each insight card |
| `history-range` | the 7/30/90/365 selector |
| `week-day` | each day in the week forecast |
| `chat-input` `chat-send` `chat-message` | the chat |
| `onboarding` `onboarding-next` | the onboarding flow |
| `demo-start` | the "try the demo" entry |
| `empty` | any empty state |
| `toast` | the transient confirmation |

Buttons must be real `<button>` elements so a click test and a keyboard user
reach the same thing.
