#!/usr/bin/env node
/*
 * tomorrow-validate.mjs — cross-checks TomorrowAI against tomorrow/CONTRACTS.md.
 *
 * Run with: node tools/tomorrow-validate.mjs
 * Exits non-zero on any error. Warnings do not fail the build.
 *
 * This file was written against the contract before the modules existed, which
 * is the point: it tests what the app promised rather than what it happened to
 * do. When a check here disagrees with a module, the contract decides which one
 * is wrong.
 *
 * The whole engine is required to be pure, so everything below runs in plain
 * Node with no DOM and no browser. A module that cannot be imported here has
 * already broken the rule that matters most.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = resolve(ROOT, 'tomorrow');

const errors = [];
const warnings = [];
const passed = [];

const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const ok = (m) => passed.push(m);
const check = (cond, m) => { if (cond) ok(m); else err(m); };

async function load(rel) {
  const abs = resolve(APP, rel);
  if (!existsSync(abs)) { err(`${rel}: missing`); return null; }
  try {
    return await import(pathToFileURL(abs).href);
  } catch (e) {
    err(`${rel}: import failed — ${e.message}`);
    return null;
  }
}

/** Deep clone that also serves as the determinism fingerprint. */
function fingerprint(v) {
  return JSON.stringify(v, (k, val) => {
    if (typeof val === 'number' && !Number.isFinite(val)) return `__nonfinite:${String(val)}`;
    return val;
  });
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

/* ------------------------------------------------------------------ *
 * 0. Purity — nothing in the engine may reach for the clock, a random
 *    number or the DOM. Source-level, because an impure call can hide
 *    behind a branch that a single test run never takes.
 * ------------------------------------------------------------------ */

const PURE_DIRS = ['src/engine', 'src/storage', 'src/data'];
const PURE_EXTRA = ['src/core/time.js', 'src/core/fmt.js'];

const BANNED = [
  [/\bMath\s*\.\s*random\s*\(/, 'Math.random()'],
  [/\bDate\s*\.\s*now\s*\(/, 'Date.now()'],
  [/\bnew\s+Date\s*\(\s*\)/, 'new Date() with no argument'],
  [/\bdocument\s*\./, 'document'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bperformance\s*\.\s*now\s*\(/, 'performance.now()'],
];

function sourceFiles() {
  const out = [];
  for (const d of PURE_DIRS) {
    const abs = resolve(APP, d);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) if (f.endsWith('.js')) out.push(`${d}/${f}`);
  }
  for (const f of PURE_EXTRA) if (existsSync(resolve(APP, f))) out.push(f);
  return out;
}

const sources = sourceFiles();
check(sources.length > 0, 'purity: found engine/storage/data sources to scan');

for (const rel of sources) {
  const src = readFileSync(resolve(APP, rel), 'utf8');
  // adapter.js is the one file allowed to name localStorage and window — it is
  // the seam. It must still guard every touch so the module imports in Node,
  // which the import check below proves.
  const isAdapter = rel.endsWith('storage/adapter.js');
  /*
   * migrate() is the one place a clock read is honest. A document being created
   * for the first time has no other source for its own creation time — there is
   * nothing in the input to read it from. It takes nowIso and only falls back to
   * the system clock when a caller does not pass one, which is why the validator
   * and demo mode can both stay deterministic while the app still stamps a real
   * date on a real first run.
   */
  const isMigrate = rel.endsWith('storage/migrate.js');
  for (const [re, name] of BANNED) {
    if (isAdapter && (name === 'localStorage' || name === 'document')) continue;
    if (isMigrate && name === 'new Date() with no argument') continue;
    // Strip comments and string literals before matching, so prose about
    // Math.random() does not fail the file that explains why it is banned.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/`(?:\\.|[^`\\])*`/g, '``');
    if (re.test(code)) err(`purity: ${rel} uses ${name} — engine modules are pure (CONTRACTS §0)`);
  }
  if (/export\s+default/.test(src)) err(`${rel}: default export — the contract says named exports only`);
}
ok('purity: source scan complete');

/* ------------------------------------------------------------------ *
 * 1. Time
 * ------------------------------------------------------------------ */

const time = await load('src/core/time.js');
if (time) {
  const need = ['todayKey', 'addDays', 'diffDays', 'dayOfWeek', 'parseKey', 'isValidKey',
    'nowMinutes', 'clampMinutes', 'toMinutes', 'fromMinutes', 'snap', 'overlaps',
    'sleepWindow', 'weekKeys'];
  for (const n of need) if (typeof time[n] !== 'function') err(`time.js: missing export ${n}()`);

  if (time.toMinutes) {
    check(time.toMinutes('07:30') === 450, 'time: toMinutes("07:30") === 450');
    check(time.toMinutes('7:30') === 450, 'time: toMinutes tolerates a missing leading zero');
    check(time.toMinutes('nonsense') === null, 'time: toMinutes returns null, not NaN, on junk');
    check(time.toMinutes('') === null, 'time: toMinutes returns null on empty input');
  }
  if (time.fromMinutes) {
    check(time.fromMinutes(450) === '07:30', 'time: fromMinutes(450) === "07:30"');
    check(time.fromMinutes(1470) === '00:30', 'time: fromMinutes wraps past midnight');
    check(time.fromMinutes(0) === '00:00', 'time: fromMinutes(0) === "00:00"');
  }
  if (time.sleepWindow) {
    const evening = time.sleepWindow(23 * 60 + 15, 7 * 60 + 30);
    check(evening && evening.start === -45,
      `time: an evening bedtime starts before midnight (got ${evening && evening.start}, want -45)`);
    check(evening && evening.minutes === 495,
      `time: 23:15 to 07:30 is 8h15 (got ${evening && evening.minutes})`);
    const past = time.sleepWindow(30, 7 * 60 + 30);
    check(past && past.start === 30 && past.minutes === 420,
      'time: an after-midnight bedtime starts after midnight');
    const all = [[1380, 360], [0, 480], [1439, 400], [720, 900]];
    check(all.every(([b, w]) => time.sleepWindow(b, w).minutes > 0),
      'time: sleepWindow.minutes is always positive');
  }
  if (time.addDays && time.diffDays) {
    check(time.addDays('2028-02-28', 1) === '2028-02-29', 'time: addDays crosses into a leap day');
    check(time.addDays('2026-02-28', 1) === '2026-03-01', 'time: addDays knows 2026 is not a leap year');
    check(time.addDays('2026-12-31', 1) === '2027-01-01', 'time: addDays crosses a year');
    check(time.diffDays('2026-03-30', '2026-03-27') === 3, 'time: diffDays across a DST boundary');
    check(time.addDays('2026-03-28', 1) === '2026-03-29', 'time: addDays across a DST boundary');
  }
  if (time.isValidKey) {
    check(time.isValidKey('2026-01-05') === true, 'time: isValidKey accepts a real key');
    check(time.isValidKey('2026-13-05') === false, 'time: isValidKey rejects month 13');
    check(time.isValidKey('nope') === false, 'time: isValidKey rejects junk');
  }
  if (time.overlaps) {
    check(time.overlaps(600, 60, 630, 60) === true, 'time: overlaps detects a real overlap');
    check(time.overlaps(600, 60, 660, 60) === false, 'time: touching blocks do not overlap');
  }
}

/* ------------------------------------------------------------------ *
 * 2. Formatting
 * ------------------------------------------------------------------ */

const fmt = await load('src/core/fmt.js');
if (fmt) {
  for (const n of ['time', 'duration', 'range', 'dayName', 'dateLabel', 'pct', 'signed', 'scoreLabel'])
    if (typeof fmt[n] !== 'function') err(`fmt.js: missing export ${n}()`);
  if (fmt.duration) {
    check(/45/.test(fmt.duration(45)), 'fmt: duration(45) mentions 45');
    check(fmt.duration(0).length > 0, 'fmt: duration(0) returns something');
    const h95 = fmt.duration(95);
    check(/1/.test(h95) && /35/.test(h95), `fmt: duration(95) reads as 1h35 (got "${h95}")`);
  }
  if (fmt.signed) {
    check(fmt.signed(8).includes('+'), 'fmt: signed(8) carries a plus');
    check(fmt.signed(-3).includes('\u2212'),
      'fmt: signed(-3) uses the real minus sign U+2212, not a hyphen');
  }
  if (fmt.scoreLabel) {
    const bands = [40, 60, 76, 90].map((s) => fmt.scoreLabel(s));
    check(new Set(bands).size === 4, `fmt: the four score bands read differently (got ${JSON.stringify(bands)})`);
  }
}

/* ------------------------------------------------------------------ *
 * 3. Schema, storage, migration
 * ------------------------------------------------------------------ */

const NOW_ISO = '2026-09-02T20:30:00.000Z';
const NOW = new Date(NOW_ISO);
const TODAY = '2026-09-02';
const TOMORROW = '2026-09-03';

const schema = await load('src/storage/schema.js');
let root = null;
if (schema) {
  for (const n of ['emptyRoot', 'defaultProfile', 'emptyLearning', 'makeItem', 'makeDayPlan',
    'makeRecord', 'normalizeRoot', 'validateItem'])
    if (typeof schema[n] !== 'function') err(`schema.js: missing export ${n}()`);

  if (schema.emptyRoot) {
    root = schema.emptyRoot(NOW_ISO);
    for (const k of ['schemaVersion', 'user', 'profile', 'items', 'days', 'records', 'learning',
      'feedback', 'chat', 'settings', 'ui'])
      check(k in root, `schema: emptyRoot has "${k}"`);
    check(root.schemaVersion === 1, 'schema: emptyRoot is schemaVersion 1');
  }

  if (schema.normalizeRoot) {
    const junk = [null, undefined, 42, 'hello', [], { hello: 'world' },
      { items: 'not a map' }, { items: { a: null, b: 5 } }, { profile: [] },
      { days: { 'not-a-date': {} } }, { learning: 'nope' }];
    let survived = 0;
    for (const j of junk) {
      try {
        const r = schema.normalizeRoot(j, NOW_ISO);
        if (r && typeof r === 'object' && r.profile && r.items && typeof r.items === 'object') survived++;
        else err(`schema: normalizeRoot(${JSON.stringify(j)}) returned something unusable`);
      } catch (e) {
        err(`schema: normalizeRoot(${JSON.stringify(j)}) threw — it must be total (${e.message})`);
      }
    }
    check(survived === junk.length, 'schema: normalizeRoot survives every kind of junk');
  }

  if (schema.makeItem) {
    const a = schema.makeItem({ title: 'שיעורי בית', date: TOMORROW, start: 900, duration: 45 }, NOW_ISO);
    const b = schema.makeItem({ title: 'שיעורי בית', date: TOMORROW, start: 900, duration: 45 }, NOW_ISO);
    check(!!a.id && a.id.startsWith('itm_'), 'schema: makeItem mints an itm_ id');
    check(a.id !== b.id, 'schema: two items made from identical input still get distinct ids');
    for (const k of ['kind', 'type', 'title', 'notes', 'date', 'start', 'duration', 'locked',
      'category', 'priority', 'deadline', 'estimatedDuration', 'actualDuration', 'difficulty',
      'energyRequirement', 'focusRequirement', 'preferredTime', 'status', 'isTop', 'createdAt',
      'completedAt'])
      check(k in a, `schema: makeItem fills "${k}"`);
    check(a.estimatedDuration === 45, 'schema: makeItem records what the user estimated');
    const ev = schema.makeItem({ kind: 'event', title: 'בית ספר', date: TOMORROW, start: 480, duration: 300 }, NOW_ISO);
    check(ev.locked === true, 'schema: an event defaults to locked');
  }

  if (schema.validateItem) {
    check(schema.validateItem({ title: '  ', date: TOMORROW, duration: 30 }).length > 0,
      'schema: validateItem rejects a blank title');
    check(schema.validateItem({ title: 'x', date: TOMORROW, duration: 0 }).length > 0,
      'schema: validateItem rejects a zero duration');
    check(schema.validateItem({ title: 'x', date: TOMORROW, start: 1400, duration: 120 }).length > 0,
      'schema: validateItem rejects an item running past midnight');
    check(schema.validateItem({ title: 'x', date: 'bad-date', duration: 30 }).length > 0,
      'schema: validateItem rejects a malformed date');
    check(schema.validateItem({ title: 'x', date: TOMORROW, start: 600, duration: 30 }).length === 0,
      'schema: validateItem passes a well-formed item');
  }
}

const adapter = await load('src/storage/adapter.js');
if (adapter) {
  check(!!adapter.MemoryAdapter, 'adapter: MemoryAdapter exists');
  check(!!adapter.LocalStorageAdapter, 'adapter: LocalStorageAdapter exists');
  check(typeof adapter.pickAdapter === 'function', 'adapter: pickAdapter() exists');
  if (adapter.MemoryAdapter) {
    const m = adapter.MemoryAdapter;
    m.write('t.probe', { a: 1 });
    check(m.read('t.probe') && m.read('t.probe').a === 1, 'adapter: MemoryAdapter round-trips a value');
    m.remove('t.probe');
    check(m.read('t.probe') === null, 'adapter: MemoryAdapter removes, and reads back null');
  }
  if (adapter.LocalStorageAdapter) {
    // In Node there is no localStorage. The adapter must say so calmly rather
    // than throwing at import or on the first call.
    let threw = false;
    try { adapter.LocalStorageAdapter.read('anything'); } catch (e) { threw = true; }
    check(!threw, 'adapter: LocalStorageAdapter does not throw where localStorage is absent');
    check(adapter.LocalStorageAdapter.available() === false,
      'adapter: LocalStorageAdapter reports itself unavailable in Node');
  }
}

const migrate = await load('src/storage/migrate.js');
if (migrate) {
  check(migrate.SCHEMA_VERSION === 1, 'migrate: SCHEMA_VERSION is 1');
  const cases = [null, 'garbage', { schemaVersion: 99 }, { schemaVersion: 1 }, [], { hello: 1 }];
  let fine = 0;
  for (const c of cases) {
    try {
      const r = migrate.migrate(c);
      if (r && r.schemaVersion === 1 && r.profile) fine++;
      else err(`migrate: migrate(${JSON.stringify(c)}) did not return a usable Root`);
    } catch (e) { err(`migrate: migrate(${JSON.stringify(c)}) threw — ${e.message}`); }
  }
  check(fine === cases.length, 'migrate: never throws, always lands on a valid Root');
  const stamped = migrate.migrate(null, NOW_ISO);
  check(stamped.user.createdAt === NOW_ISO,
    'migrate: an injected clock is used, so the storage layer can be made deterministic');
  check(fingerprint(migrate.migrate(null, NOW_ISO)) === fingerprint(stamped),
    'migrate: with the clock injected it is deterministic');
}

const catalog = await load('src/data/catalog.js');
if (catalog) {
  for (const n of ['ITEM_TYPES', 'CATEGORIES', 'PRIORITIES', 'PRIORITY_AREAS', 'REVIEW_TAGS'])
    check(Array.isArray(catalog[n]) && catalog[n].length > 0, `catalog: ${n} is a non-empty list`);
  if (Array.isArray(catalog.PRIORITIES))
    check(catalog.PRIORITIES.length === 4, 'catalog: exactly four priorities (low/medium/high/critical)');
}

/* ------------------------------------------------------------------ *
 * 4. Fixtures
 *
 * One ordinary Tuesday for a student: school in the morning, a workout at
 * five, homework and a project to place, and a night of just under eight
 * hours. Every engine check below runs against this or a variation of it, so
 * a change in one module that breaks another shows up as a diff in a number
 * somebody can actually reason about.
 * ------------------------------------------------------------------ */

function mkItem(over) {
  return Object.assign({
    id: `itm_${(mkItem.n = (mkItem.n || 0) + 1).toString(36)}`,
    kind: 'task', type: 'task', title: 'משימה', notes: '',
    date: TOMORROW, start: null, duration: 60, locked: false,
    category: 'study', priority: 'medium', deadline: null,
    estimatedDuration: 60, actualDuration: null, difficulty: 3,
    energyRequirement: 'medium', focusRequirement: 'medium', preferredTime: 'any',
    status: 'planned', isTop: false, createdAt: NOW_ISO, completedAt: null,
  }, over);
}

const FIX_ITEMS = [
  mkItem({ kind: 'event', type: 'event', title: 'בית ספר', start: 480, duration: 300, locked: true, priority: 'high', category: 'study' }),
  mkItem({ title: 'שיעורי בית במתמטיקה', start: 870, duration: 60, focusRequirement: 'high', energyRequirement: 'medium', priority: 'high', isTop: true }),
  mkItem({ title: 'עבודה על הפרויקט', start: 945, duration: 90, focusRequirement: 'high', energyRequirement: 'high', priority: 'critical', isTop: true, deadline: '2026-09-05' }),
  mkItem({ kind: 'event', type: 'workout', title: 'אימון', start: 1080, duration: 60, locked: true, category: 'fitness', energyRequirement: 'high' }),
  mkItem({ title: 'לסדר את החדר', start: null, duration: 30, focusRequirement: 'low', energyRequirement: 'low', priority: 'low', category: 'personal' }),
];

function fixProfile(over) {
  return Object.assign({
    name: 'אלכס', wakeTime: 450, bedTime: 1395,
    priorities: ['school', 'fitness', 'focus'], focusPreference: 'morning',
    weekStart: 0, timeFormat: '24h', theme: 'dark', reduceMotion: false,
    notifications: { evening: true, morning: true, eveningAt: 1260, morningAt: 450 },
    timezone: 'Asia/Jerusalem', createdAt: NOW_ISO,
  }, over);
}

function fixPlan(over) {
  return Object.assign({
    date: TOMORROW, wake: 420, bedtime: 1410, nextBedtime: 1410,
    eveningState: { energy: 3, mood: 3, stress: 3 },
    topPriorities: [FIX_ITEMS[1].id, FIX_ITEMS[2].id],
    preparedAt: NOW_ISO, appliedPlanId: null,
  }, over);
}

function fixLearning(over) {
  const base = schema && schema.emptyLearning ? schema.emptyLearning() : { samples: {} };
  return Object.assign(clone(base), over || {});
}

function fixInput(over) {
  return Object.assign({
    date: TOMORROW, profile: fixProfile(), plan: fixPlan(), items: clone(FIX_ITEMS),
    learning: fixLearning(), history: [], now: NOW, morning: null,
  }, over || {});
}

/* ------------------------------------------------------------------ *
 * 5. The prediction engine
 * ------------------------------------------------------------------ */

const predict = await load('src/engine/predict.js');
let base = null;

if (predict && typeof predict.forecast === 'function') {
  try {
    base = predict.forecast(fixInput());
  } catch (e) {
    err(`predict: forecast() threw on the fixture day — ${e.message}\n${e.stack}`);
  }
}

if (base) {
  for (const k of ['date', 'score', 'label', 'band', 'factors', 'reasons', 'energy', 'focus',
    'focusWindows', 'energyPeak', 'focusPeak', 'risks', 'timeline', 'confidence',
    'recommendation', 'insights', 'totals', 'meta'])
    check(k in base, `forecast: returns "${k}"`);

  check(Number.isInteger(base.score) && base.score >= 0 && base.score <= 100,
    `forecast: score is an integer in 0..100 (got ${base.score})`);
  check(['low', 'fair', 'good', 'great'].includes(base.band),
    `forecast: band is one of the four (got ${base.band})`);

  /* Determinism — the rule the whole engine rests on. */
  const again = predict.forecast(fixInput());
  check(fingerprint(base) === fingerprint(again),
    'forecast: identical input produces byte-identical output');

  /* And it must not have eaten its own arguments. */
  const inp = fixInput();
  const before = fingerprint(inp);
  predict.forecast(inp);
  check(fingerprint(inp) === before, 'forecast: does not mutate its input');

  /* Curves */
  for (const name of ['energy', 'focus']) {
    const c = base[name];
    if (!c || !Array.isArray(c.points)) { err(`forecast: ${name} curve has no points`); continue; }
    check(c.step === 15, `forecast: ${name} curve steps 15 minutes (got ${c.step})`);
    check(c.points.length > 8, `forecast: ${name} curve has a real number of samples (${c.points.length})`);
    check(c.points.every((p) => p.value >= 0 && p.value <= 100),
      `forecast: every ${name} sample is inside 0..100`);
    check(c.points.every((p) => typeof p.confidence === 'number'),
      `forecast: every ${name} sample carries a confidence`);
    const sorted = c.points.every((p, i) => i === 0 || p.minute > c.points[i - 1].minute);
    check(sorted, `forecast: ${name} samples are in ascending time order`);
    let worst = 0;
    for (let i = 1; i < c.points.length; i++)
      worst = Math.max(worst, Math.abs(c.points[i].value - c.points[i - 1].value));
    check(worst <= 14, `forecast: the ${name} curve is continuous — largest step ${worst.toFixed(1)} points (want <= 14)`);
    check(Array.isArray(c.hourly) && c.hourly.length > 0, `forecast: ${name} curve has an hourly aggregation`);
    check(c.from >= 0 && c.to > c.from, `forecast: ${name} curve spans a real window`);
  }

  /* Focus is not energy. If they were the same curve the product has no §10. */
  const eVals = base.energy.points.map((p) => p.value);
  const fVals = base.focus.points.map((p) => p.value);
  const sameLength = eVals.length === fVals.length;
  check(sameLength, 'forecast: energy and focus are sampled on the same grid');
  if (sameLength) {
    const maxDiff = Math.max(...eVals.map((v, i) => Math.abs(v - fVals[i])));
    check(maxDiff >= 5, `forecast: focus is genuinely a different curve from energy (max gap ${maxDiff.toFixed(1)})`);
  }

  /* Sleep is monotone: a shorter night is never a better day, anywhere. */
  const short = predict.forecast(fixInput({ plan: fixPlan({ bedtime: 120 }) }));    // 02:00 -> 07:00
  const long = predict.forecast(fixInput({ plan: fixPlan({ bedtime: 1350 }) }));   // 22:30 -> 07:00
  check(short.score < long.score,
    `forecast: five hours of sleep scores below eight and a half (${short.score} vs ${long.score})`);
  if (short.energy && long.energy && short.energy.points.length === long.energy.points.length) {
    const everywhere = short.energy.points.every((p, i) => p.value <= long.energy.points[i].value + 0.001);
    check(everywhere, 'forecast: a shorter night never raises the energy curve at any point in the day');
  }

  /*
   * The afternoon trough the brief asks for, 6.5-7.5h after waking.
   *
   * Measured on a bare day. On a real one the deepest point is often the hour
   * after a workout, which is correct behaviour and a different claim — this is
   * about the circadian shape underneath, so the confounders come out.
   */
  const wake = 420;
  const bareDay = predict.forecast(fixInput({ items: [], plan: fixPlan({ topPriorities: [] }) }));
  const troughIn = (f) => f.energy.points
    .filter((p) => p.minute > wake + 120 && p.minute < wake + 720)
    .reduce((a, b) => (b.value < a.value ? b : a));
  const trough = troughIn(bareDay);
  check(trough.minute >= wake + 330 && trough.minute <= wake + 480,
    `forecast: the post-lunch dip lands 6.5-7.5h after waking (got ${((trough.minute - wake) / 60).toFixed(1)}h)`);

  /* And it is deeper on a short night, which is the claim that makes the dip
   * worth modelling rather than drawing. */
  const troughShort = troughIn(predict.forecast(fixInput({ items: [], plan: fixPlan({ bedtime: 120, topPriorities: [] }) })));
  check(troughShort.value < trough.value - 8,
    `forecast: the dip deepens on a short night (${trough.value.toFixed(1)} rested vs ${troughShort.value.toFixed(1)} tired)`);

  /* The reported dip is the afternoon one, not the last sample before bed. */
  check(base.energyDip.minute >= wake + 180 && base.energyDip.minute <= wake + 660,
    `forecast: the reported dip sits in the day rather than at bedtime (${base.energyDip.minute - wake} min after waking)`);

  /* Focus windows */
  check(Array.isArray(base.focusWindows) && base.focusWindows.length <= 3,
    'forecast: at most three focus windows');
  for (const w of base.focusWindows || []) {
    check(w.end > w.start, 'forecast: a focus window ends after it starts');
    check(w.end - w.start >= 45, `forecast: a focus window is at least 45 minutes (got ${w.end - w.start})`);
    check(w.start >= 420 && w.end <= 1440 + 120, 'forecast: a focus window sits inside the waking day');
  }
  const ws = (base.focusWindows || []).slice().sort((a, b) => a.start - b.start);
  check(ws.every((w, i) => i === 0 || w.start >= ws[i - 1].end),
    'forecast: focus windows do not overlap each other');

  /* Chronotype actually moves the peak. */
  const morn = predict.forecast(fixInput({ profile: fixProfile({ focusPreference: 'morning' }) }));
  const eve = predict.forecast(fixInput({ profile: fixProfile({ focusPreference: 'evening' }) }));
  check(morn.focusPeak.minute < eve.focusPeak.minute,
    `forecast: a morning person peaks earlier than an evening person (${morn.focusPeak.minute} vs ${eve.focusPeak.minute})`);

  /* Factors */
  check(Array.isArray(base.factors) && base.factors.length === 6,
    `forecast: exactly six score factors (got ${base.factors && base.factors.length})`);
  const keys = (base.factors || []).map((f) => f.key).sort();
  check(fingerprint(keys) === fingerprint(['balance', 'focus', 'free', 'goals', 'risk', 'sleep']),
    `forecast: the six factor keys are the ones the contract names (got ${keys.join(',')})`);
  const wsum = (base.factors || []).reduce((a, f) => a + f.weight, 0);
  check(Math.abs(wsum - 1) < 1e-6, `forecast: factor weights sum to 1 (got ${wsum})`);
  for (const f of base.factors || []) {
    check(Number.isInteger(f.score) && f.score >= 0 && f.score <= 100,
      `forecast: factor ${f.key} scores an integer 0..100 (got ${f.score})`);
    check(typeof f.detail === 'string' && f.detail.length > 0,
      `forecast: factor ${f.key} explains itself`);
    check(['up', 'down', 'flat'].includes(f.direction),
      `forecast: factor ${f.key} has a real direction`);
  }
  /* With no history there is nothing to compare against, so nothing may claim
     to have moved. This is the "no fake data" rule in its smallest form. */
  check((base.factors || []).every((f) => f.direction === 'flat'),
    'forecast: with no history, no factor claims a direction');

  check(Array.isArray(base.reasons.up) && Array.isArray(base.reasons.down),
    'forecast: reasons has both directions');
  check(base.reasons.up.length + base.reasons.down.length >= 2,
    'forecast: "why this score" says at least two things');

  /* Risks */
  for (const r of base.risks || []) {
    for (const k of ['key', 'severity', 'score', 'title', 'reason', 'suggestion'])
      check(k in r, `risk ${r.key}: has "${k}"`);
    check(['low', 'medium', 'high'].includes(r.severity), `risk ${r.key}: severity is one of three`);
    check(r.suggestion && r.suggestion.length > 4, `risk ${r.key}: suggests something concrete`);
    check(!/סכנה|אזהרה!|!!/.test(r.title + r.reason),
      `risk ${r.key}: keeps the calm register the brief asks for`);
  }
  const sev = { high: 3, medium: 2, low: 1 };
  check((base.risks || []).every((r, i, a) => i === 0 || sev[a[i - 1].severity] >= sev[r.severity]),
    'forecast: risks are ordered worst first');

  /* An obviously overloaded day must actually raise a risk. */
  const packed = clone(FIX_ITEMS).concat([
    mkItem({ title: 'מטלה א', start: 780, duration: 60, energyRequirement: 'high', focusRequirement: 'high' }),
    mkItem({ title: 'מטלה ב', start: 845, duration: 60, energyRequirement: 'high', focusRequirement: 'high' }),
    mkItem({ title: 'מטלה ג', start: 910, duration: 55, energyRequirement: 'high', focusRequirement: 'high' }),
  ]);
  const heavy = predict.forecast(fixInput({ items: packed }));
  check((heavy.risks || []).some((r) => r.key === 'overload'),
    'forecast: a genuinely packed afternoon raises an overload risk');
  check(heavy.score < base.score, 'forecast: packing the day lowers the score');

  /* Two items on top of each other is a conflict, always. */
  const clash = clone(FIX_ITEMS).concat([mkItem({ title: 'התנגשות', start: 1090, duration: 60 })]);
  check((predict.forecast(fixInput({ items: clash })).risks || []).some((r) => r.key === 'conflict'),
    'forecast: overlapping items raise a conflict risk');

  /* Timeline */
  check(Array.isArray(base.timeline) && base.timeline.length > 0, 'forecast: builds a timeline');
  check((base.timeline || []).every((t, i, a) => i === 0 || a[i - 1].minute <= t.minute),
    'forecast: the timeline is in time order');
  const kinds = new Set((base.timeline || []).map((t) => t.kind));
  check(kinds.has('wake') && kinds.has('item'), 'forecast: the timeline includes waking and the day\'s items');

  /* Confidence */
  const c = base.confidence;
  check(c && typeof c.overall === 'number' && c.overall >= 0 && c.overall <= 100,
    'forecast: confidence is 0..100');
  check(c && ['learning', 'low', 'medium', 'high'].includes(c.level), 'forecast: confidence has a level');
  check(c && c.learningMode === true,
    'forecast: a brand new user with no history is in learning mode');
  check(c && c.overall < 50,
    `forecast: a brand new user does not get a confident forecast (got ${c && c.overall})`);
  check(c && Array.isArray(c.reasons) && c.reasons.length > 0,
    'forecast: confidence says why it is where it is');

  /* Totals */
  const t = base.totals;
  check(t && t.loadMinutes > 0 && t.freeMinutes >= 0, 'forecast: totals count load and free time');
  check(t && t.sleepMinutes === 450, `forecast: totals report the night correctly (got ${t && t.sleepMinutes})`);
  check(t && t.awakeMinutes > 0 && t.freeMinutes <= t.awakeMinutes,
    'forecast: free time cannot exceed the waking day');

  /* Insights are gated on evidence, and there is none yet. */
  check(Array.isArray(base.insights) && base.insights.length === 0,
    `forecast: a first-time user is told no patterns yet, not invented ones (got ${base.insights && base.insights.length})`);

  check(base.meta && typeof base.meta.personalWeight === 'number',
    'forecast: meta reports how personal the model currently is');
  check(base.meta && base.meta.personalWeight < 0.2,
    `forecast: with no history the model is nearly all defaults (got ${base.meta && base.meta.personalWeight})`);
}

/* ------------------------------------------------------------------ *
 * 6. Scheduler invariants — contract §7, one check per rule
 * ------------------------------------------------------------------ */

const sched = await load('src/engine/scheduler.js');
if (sched && base) {
  const ctx = Object.assign(fixInput(), {
    energy: base.energy, focus: base.focus, focusWindows: base.focusWindows,
  });

  if (typeof sched.freeSlots === 'function') {
    const slots = sched.freeSlots(clone(FIX_ITEMS), fixPlan(), {});
    check(Array.isArray(slots), 'scheduler: freeSlots returns a list');
    check(slots.every((s) => s.end > s.start && s.minutes === s.end - s.start),
      'scheduler: every free slot is internally consistent');
    check(slots.every((s) => s.start >= 420 + 20), 'scheduler: rule 6 — nothing before wake + 20');
    check(slots.every((s) => s.end <= 1410), 'scheduler: rule 6 — nothing inside the sleep window');
    const scheduled = FIX_ITEMS.filter((i) => i.start !== null);
    const clashes = slots.filter((s) => scheduled.some((i) => s.start < i.start + i.duration && i.start < s.end));
    check(clashes.length === 0, 'scheduler: rule 1 — a free slot never sits on top of a scheduled item');
  }

  if (typeof sched.conflicts === 'function') {
    const pair = clone(FIX_ITEMS).concat([mkItem({ title: 'חופף', start: 1090, duration: 60 })]);
    const found = sched.conflicts(pair);
    check(found.length >= 1, 'scheduler: conflicts finds an overlapping pair');
    check(found.every((c) => c.minutes > 0), 'scheduler: a conflict reports how many minutes overlap');
    check(sched.conflicts(clone(FIX_ITEMS)).length === 0,
      'scheduler: the fixture day has no conflicts of its own');
  }

  if (typeof sched.suggestSlot === 'function') {
    const hard = mkItem({ title: 'ללמוד למבחן', duration: 60, focusRequirement: 'high', energyRequirement: 'medium', start: null });
    const s = sched.suggestSlot(hard, ctx);
    if (s === null) {
      warn('scheduler: suggestSlot found nowhere for a 60-minute focus task on the fixture day');
    } else {
      check(typeof s.start === 'number' && s.start % 15 === 0,
        `scheduler: a suggestion lands on the 15-minute grid (got ${s.start})`);
      check(typeof s.reason === 'string' && s.reason.length > 4,
        'scheduler: a suggestion explains itself in words');
      const sc = clone(FIX_ITEMS).filter((i) => i.start !== null);
      check(!sc.some((i) => s.start < i.start + i.duration && i.start < s.start + hard.duration),
        'scheduler: rule 1 — a suggestion never overlaps an existing item');
      const gaps = sc.map((i) => (s.start >= i.start + i.duration ? s.start - (i.start + i.duration)
        : (i.start >= s.start + hard.duration ? i.start - (s.start + hard.duration) : 0)));
      check(gaps.every((g) => g === 0 || g >= 10),
        `scheduler: rule 2 — a suggestion leaves at least a 10-minute buffer (gaps ${gaps.join(',')})`);
      check(s.start >= 440 && s.start + hard.duration <= 1410,
        'scheduler: rule 6 — a suggestion stays inside the waking day');
      /*
       * Rule 3 is conditional: a high-focus task goes in a high-focus window
       * *when one is free*. On the fixture day school covers the morning, so
       * the test has to establish that a window was actually available before
       * it can call an afternoon slot a violation.
       */
      const busy = clone(FIX_ITEMS).filter((i) => i.start !== null);
      const freeWindow = (base.focusWindows || []).find((w) => {
        for (let t = w.start; t + hard.duration <= w.end; t += 15) {
          if (!busy.some((i) => t < i.start + i.duration && i.start < t + hard.duration)) return true;
        }
        return false;
      });
      if (freeWindow) {
        check(s.start >= freeWindow.start - 30 && s.start < freeWindow.end,
          `scheduler: rule 3 — a free focus window was available and the suggestion used it (slot ${s.start}, window ${freeWindow.start}-${freeWindow.end})`);
      } else {
        ok('scheduler: rule 3 — no focus window was free, so the fallback slot is correct');
      }
    }
    /* A day with no room must say so rather than inventing a slot. */
    const full = [mkItem({ kind: 'event', title: 'כל היום', start: 445, duration: 940, locked: true })];
    const none = sched.suggestSlot(mkItem({ duration: 90, start: null }),
      Object.assign({}, ctx, { items: full }));
    check(none === null, 'scheduler: a full day returns null rather than a bad slot');
  }

  if (typeof sched.place === 'function') {
    const input = clone(FIX_ITEMS);
    const snapshot = fingerprint(input);
    sched.place(input, mkItem({ title: 'חדש', duration: 30, start: null }), ctx);
    check(fingerprint(input) === snapshot, 'scheduler: place() does not mutate the array it was given');
  }
}

/* ------------------------------------------------------------------ *
 * 7. Learning — the feature the product is named for
 * ------------------------------------------------------------------ */

const learn = await load('src/engine/learning.js');
if (learn) {
  for (const n of ['updateLearning', 'personalWeight', 'estimateDuration', 'ema', 'recencyWeights'])
    if (typeof learn[n] !== 'function') err(`learning.js: missing export ${n}()`);

  if (learn.personalWeight && schema) {
    const at = (days, consistency) => learn.personalWeight(fixLearning({
      samples: Object.assign(clone(schema.emptyLearning().samples), { days }), consistency,
    }));
    const d1 = at(1, 1), d7 = at(7, 1), d30 = at(30, 1);
    check(d1 < d7 && d7 < d30, 'learning: the personal model gains ground as days accumulate');
    check(d1 < 0.25, `learning: day one is mostly defaults (got ${d1.toFixed(2)})`);
    check(d7 > 0.3 && d7 < 0.6, `learning: a week in it is roughly half personal (got ${d7.toFixed(2)})`);
    check(d30 > 0.6, `learning: a month in it is mostly personal (got ${d30.toFixed(2)})`);
    check(at(30, 0.1) < at(30, 1),
      'learning: inconsistent data holds the personal model back even after a month');
    check(d30 <= 0.8, 'learning: the personal model never fully replaces the defaults');
  }

  if (learn.recencyWeights) {
    const w = learn.recencyWeights(10, 7);
    check(Array.isArray(w) && w.length === 10, 'learning: recencyWeights returns one weight per observation');
    check(w[0] > w[9], 'learning: recent observations weigh more than old ones');
    check(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-6, 'learning: recency weights sum to 1');
  }

  /* The headline: three days of a 30-minute estimate taking about 48 minutes
     must move the next estimate. This is what makes the app more than a form. */
  if (learn.estimateDuration) {
    const naive = fixLearning();
    const item = mkItem({ title: 'שיעורי בית', estimatedDuration: 30, duration: 30, category: 'study' });
    const before = learn.estimateDuration(item, naive);
    check(before.minutes === 30, `learning: with no history the estimate is the user's own (got ${before.minutes})`);
    check(before.basis === 'default', `learning: and it says so (basis "${before.basis}")`);

    const taught = fixLearning({
      samples: Object.assign(clone(schema.emptyLearning().samples), { days: 3, durations: 3 }),
      averageEstimationError: 1.6,
      estimationErrorByCategory: { study: { ratio: 1.6, n: 3 } },
      consistency: 0.8,
    });
    const after = learn.estimateDuration(item, taught);
    check(after.minutes > before.minutes,
      `learning: three long sessions push the next estimate up (${before.minutes} -> ${after.minutes})`);
    check(after.minutes >= 40,
      `learning: the estimate moves materially toward what actually happens (got ${after.minutes}, want >= 40)`);
    check(after.basis === 'category',
      `learning: and it names the evidence it used (basis "${after.basis}")`);
    const thin = fixLearning({
      samples: Object.assign(clone(schema.emptyLearning().samples), { days: 2, durations: 2 }),
      estimationErrorByCategory: { study: { ratio: 1.6, n: 2 } },
      averageEstimationError: 1.6, consistency: 0.8,
    });
    check(learn.estimateDuration(item, thin).basis !== 'category',
      'learning: two samples are not enough to claim a category pattern');
  }
}

const conf = await load('src/engine/confidence.js');
if (conf && typeof conf.assess === 'function' && schema) {
  const mkRecords = (n, spread) => Array.from({ length: n }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    forecast: { score: 70 }, morning: { energy: 3, mood: 3, sleepQuality: 3, at: NOW_ISO },
    checkpoints: [], actual: { dayScore: 70 + (i % 2 ? spread : -spread), completed: 3, planned: 4, focusMinutes: 90, sleepMinutes: 480 },
    review: null, accuracy: { overall: 80, energy: 80, duration: 80, completion: 80 },
  }));

  const steady = conf.assess(fixLearning({
    samples: Object.assign(clone(schema.emptyLearning().samples), { days: 20 }), consistency: 0.9,
  }), mkRecords(20, 2), fixInput());
  const noisy = conf.assess(fixLearning({
    samples: Object.assign(clone(schema.emptyLearning().samples), { days: 20 }), consistency: 0.05,
  }), mkRecords(20, 40), fixInput());

  check(noisy.overall < steady.overall,
    `confidence: twenty inconsistent days beat twenty steady ones on nothing (${noisy.overall} vs ${steady.overall})`);
  check(noisy.overall < 55,
    `confidence: it does NOT rise on day count alone — that is the rule (got ${noisy.overall})`);
  const fresh = conf.assess(fixLearning(), [], fixInput());
  check(fresh.learningMode === true, 'confidence: a new user is in learning mode');
  check(fresh.overall < steady.overall, 'confidence: a new user is less certain than a settled one');
  for (const p of ['history', 'consistency', 'recency', 'accuracy', 'completeness'])
    check(p in (steady.parts || {}), `confidence: reports the "${p}" part`);
}

/* ------------------------------------------------------------------ *
 * 8. Insights — evidence gates
 * ------------------------------------------------------------------ */

const ins = await load('src/engine/insights.js');
if (ins && typeof ins.findInsights === 'function') {
  const day = (i, done, planned) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    forecast: { score: 72 },
    morning: { energy: 3, mood: 3, sleepQuality: 3, at: NOW_ISO },
    checkpoints: [],
    actual: { dayScore: 70, completed: done, planned, focusMinutes: 100, sleepMinutes: 450 },
    review: null, accuracy: null,
  });

  check(ins.findInsights(fixLearning(), [], []).length === 0,
    'insights: no history produces no insights at all');
  check(ins.findInsights(fixLearning(), [day(0, 1, 4), day(1, 1, 4)], []).length === 0,
    'insights: two days is below the gate — nothing is claimed');

  const many = Array.from({ length: 14 }, (_, i) => day(i, i % 3 === 0 ? 1 : 4, 4));
  const found = ins.findInsights(fixLearning({
    samples: Object.assign(clone(schema.emptyLearning().samples), { days: 14, completions: 14 }),
    averageTaskCompletionRate: 0.7, averageEstimationError: 1.35,
    estimationErrorByCategory: { study: { ratio: 1.35, n: 11 } },
    morningEnergy: 74, afternoonEnergy: 58, eveningEnergy: 61,
    focusPeakHour: 10, energyPeakHour: 11, consistency: 0.7,
  }), many, clone(FIX_ITEMS));

  check(Array.isArray(found), 'insights: returns a list');
  for (const i of found) {
    for (const k of ['key', 'text', 'evidence', 'samples', 'strength'])
      check(k in i, `insight ${i.key}: has "${k}"`);
    check(i.samples >= 3, `insight ${i.key}: never claims a pattern from fewer than 3 samples (got ${i.samples})`);
    const want = i.samples >= 10 ? 'strong' : i.samples >= 5 ? 'emerging' : 'early';
    check(i.strength === want,
      `insight ${i.key}: ${i.samples} samples is "${want}", not "${i.strength}"`);
    check(/\d/.test(i.text), `insight ${i.key}: says a real number, not a vague feeling`);
    check(/\d/.test(i.evidence), `insight ${i.key}: names how much evidence is behind it`);
  }
  check(new Set(found.map((i) => i.key)).size === found.length, 'insights: no duplicate keys');
}

/* ------------------------------------------------------------------ *
 * 9. Accuracy — never claim more than the data supports
 * ------------------------------------------------------------------ */

const acc = await load('src/engine/accuracy.js');
if (acc && typeof acc.compare === 'function' && schema) {
  const empty = schema.makeRecord ? schema.makeRecord(TODAY) : { date: TODAY, forecast: null, morning: null, checkpoints: [], actual: null, review: null, accuracy: null };
  const r = acc.compare(empty);
  check(r.accuracy === null, `accuracy: nothing to compare returns null, not 0 (got ${r.accuracy})`);
  for (const p of ['energy', 'duration', 'completion', 'focus'])
    check(r.parts[p] === null, `accuracy: the "${p}" part is null with no data`);
  check(typeof r.note === 'string' && r.note.length > 0, 'accuracy: says in words that there is not enough data');

  const real = {
    date: TODAY,
    forecast: { score: 82, energy: { hourly: [{ hour: 8, value: 70 }, { hour: 14, value: 58 }] } },
    morning: { energy: 3, mood: 3, sleepQuality: 3, at: NOW_ISO },
    checkpoints: [{ minute: 840, energy: 3, at: NOW_ISO }],
    actual: { dayScore: 76, completed: 3, planned: 4, focusMinutes: 120, sleepMinutes: 450 },
    review: { tags: ['tasks_longer'], note: '', at: NOW_ISO }, accuracy: null,
  };
  const r2 = acc.compare(real);
  check(typeof r2.accuracy === 'number' && r2.accuracy >= 0 && r2.accuracy <= 100,
    `accuracy: a real day compares to a percentage (got ${r2.accuracy})`);
  check(r2.predicted === 82 && r2.actual === 76, 'accuracy: reports both numbers it compared');
  check(acc.rollingAccuracy([empty, empty], 7) === null,
    'accuracy: a rolling window over empty records is null, not a flattering average');
}

/* ------------------------------------------------------------------ *
 * 10. The optimiser — a better score must come from a real change
 * ------------------------------------------------------------------ */

const opt = await load('src/engine/optimize.js');
if (opt && typeof opt.improve === 'function' && predict) {
  /* A deliberately bad day: everything stacked into the late afternoon on a
     short night, with the hardest task in the worst place. There is obvious
     room to improve, so returning null here would be a bug. */
  const bad = [
    mkItem({ kind: 'event', type: 'event', title: 'בית ספר', start: 480, duration: 300, locked: true }),
    mkItem({ title: 'שיעורי בית', start: 840, duration: 60, focusRequirement: 'high', energyRequirement: 'high', priority: 'high' }),
    mkItem({ title: 'פרויקט', start: 900, duration: 90, focusRequirement: 'high', energyRequirement: 'high', priority: 'critical' }),
    mkItem({ title: 'קריאה', start: 990, duration: 60, focusRequirement: 'high', energyRequirement: 'medium', priority: 'medium' }),
    mkItem({ kind: 'event', type: 'workout', title: 'אימון', start: 1050, duration: 60, locked: true, energyRequirement: 'high' }),
  ];
  const badInput = fixInput({ items: bad, plan: fixPlan({ bedtime: 60, nextBedtime: 60, topPriorities: [bad[2].id] }) });
  const badScore = predict.forecast(badInput).score;

  let imp = null;
  try { imp = opt.improve(badInput, {}); } catch (e) { err(`optimize: improve() threw — ${e.message}\n${e.stack}`); }

  check(imp !== null, `optimize: finds something to improve on a deliberately bad day (score ${badScore})`);
  if (imp) {
    check(imp.delta > 0, `optimize: the improvement is positive (delta ${imp.delta})`);
    check(imp.after.score > imp.before.score, 'optimize: after beats before');
    check(imp.before.score === badScore,
      `optimize: "before" is the score the day actually has (${imp.before.score} vs ${badScore})`);
    check(Array.isArray(imp.changes) && imp.changes.length > 0,
      'optimize: an improvement lists the changes behind it');
    check(imp.changes.length <= 4, `optimize: at most four accepted changes (got ${imp.changes.length})`);
    check(imp.changes.every((c) => typeof c.label === 'string' && c.label.length > 3),
      'optimize: every change describes itself in words');
    check(Array.isArray(imp.reasons) && imp.reasons.length > 0, 'optimize: says why the day is better');

    /* The rule from brief §18. Re-forecast the returned plan and items: the
       promised score has to be the score they actually produce. A number that
       does not reproduce is a number the app made up. */
    const replay = predict.forecast(fixInput({
      items: imp.items, plan: imp.plan, date: TOMORROW,
    }));
    check(replay.score === imp.after.score,
      `optimize: the promised score is the one the changed day really scores (${imp.after.score} promised, ${replay.score} actual)`);

    /* And it must not have edited the day it was given. */
    const orig = fingerprint(badInput);
    opt.improve(fixInput({ items: bad, plan: fixPlan({ bedtime: 60, nextBedtime: 60, topPriorities: [bad[2].id] }) }), {});
    check(fingerprint(badInput) === orig, 'optimize: improve() leaves the real day untouched');

    const twice = opt.improve(badInput, {});
    check(fingerprint(twice) === fingerprint(imp), 'optimize: the same day yields the same improvement every time');
    check(imp.id === twice.id, 'optimize: the improvement id is stable');

    /* No overlaps may be introduced. */
    if (sched && sched.conflicts)
      check(sched.conflicts(imp.items).length === 0, 'optimize: the improved day has no overlapping items');
  }

  /*
   * The optimiser may not improve a day by cancelling it.
   *
   * An empty day has no overload, no conflicts, no bad placements and all the
   * free time there is, so "defer everything" is a degenerate optimum sitting
   * right there in the search space. The browser test found it doing exactly
   * that on a one-task day.
   */
  {
    const solo = [mkItem({ title: 'ללמוד למבחן', start: 600, duration: 120, focusRequirement: 'high' })];
    const result = opt.improve(fixInput({ items: solo, plan: fixPlan({ topPriorities: [] }) }), {});
    if (result) {
      check(result.items.filter((i) => i.kind === 'task').length >= 1,
        'optimize: a day with one task is never improved by removing it');
      check(!result.changes.some((c) => c.kind === 'defer'),
        'optimize: nothing is deferred off a day that is not full');
    } else ok('optimize: a one-task day is left alone');

    /* And on a genuinely stuffed day, deferring is allowed again. */
    const stuffed = Array.from({ length: 6 }, (_, i) => mkItem({
      title: `מטלה ${i + 1}`, start: 480 + i * 90, duration: 80,
      energyRequirement: 'high', focusRequirement: 'high',
      priority: i === 0 ? 'low' : 'medium',
    }));
    const full = opt.improve(fixInput({ items: stuffed, plan: fixPlan({ topPriorities: [] }) }), {});
    check(full !== null, 'optimize: a stuffed day has something to fix');
    if (full) {
      check(full.items.filter((i) => i.kind === 'task' && i.type !== 'break').length >= 4,
        `optimize: even a stuffed day keeps most of its work (${full.items.length} items left)`);
    }
  }

  /* An already-good day should not be handed a fake improvement. */
  if (typeof opt.improve === 'function') {
    const lean = [mkItem({ kind: 'event', title: 'פגישה', start: 600, duration: 60, locked: true })];
    const good = opt.improve(fixInput({
      items: lean, plan: fixPlan({ bedtime: 1320, nextBedtime: 1320, topPriorities: [] }),
    }), {});
    if (good) {
      const rep = predict.forecast(fixInput({ items: good.items, plan: good.plan }));
      check(rep.score === good.after.score, 'optimize: even a small gain reproduces exactly');
    } else ok('optimize: an already-clean day honestly returns null');
  }

  if (typeof opt.primaryRecommendation === 'function') {
    const rec = opt.primaryRecommendation(badInput);
    check(rec !== null, 'optimize: the bad day gets a highest-impact recommendation');
    if (rec) {
      check(typeof rec.title === 'string' && rec.title.length > 3, 'optimize: the recommendation has a title');
      check(rec.to > rec.from, `optimize: the recommendation projects a real gain (${rec.from} -> ${rec.to})`);
      check(rec.from === badScore, 'optimize: it projects from the day\'s real score');
    }
  }
}

/* ------------------------------------------------------------------ *
 * 11. What-if — a scenario may never touch anything real
 * ------------------------------------------------------------------ */

const sim = await load('src/engine/simulate.js');
if (sim && typeof sim.simulate === 'function') {
  const input = fixInput();
  const snapshot = fingerprint(input);
  const sc = sim.simulate(input, [{ kind: 'bedtime', minutes: 1365 }]);   // 45 minutes earlier

  check(fingerprint(input) === snapshot,
    'what-if: simulating leaves every byte of the real day alone');
  check(sc.base && sc.next, 'what-if: a scenario carries both the original and the alternative');
  check(sc.next.score !== sc.base.score || sc.diff.score === 0,
    'what-if: a change that matters shows up in the score');
  check(sc.next.score > sc.base.score,
    `what-if: 45 minutes more sleep is a better day (${sc.base.score} -> ${sc.next.score})`);
  check(sc.diff && typeof sc.diff.score === 'number', 'what-if: reports the signed differences');
  check(sc.diff.score === sc.next.score - sc.base.score, 'what-if: the reported delta is the real delta');
  check(Array.isArray(sc.summary) && sc.summary.length > 0, 'what-if: describes the difference in words');

  const removed = sim.simulate(input, [{ kind: 'remove', itemId: FIX_ITEMS[4].id }]);
  check(removed.next.totals.taskCount < removed.base.totals.taskCount,
    'what-if: removing a task removes it from the alternative day only');
  check(fingerprint(input) === snapshot, 'what-if: and still nothing real moved');

  const twice = sim.simulate(fixInput(), [{ kind: 'bedtime', minutes: 1365 }]);
  check(fingerprint(twice.next.score) === fingerprint(sc.next.score),
    'what-if: the same scenario gives the same answer every time');

  check(Array.isArray(sim.SCENARIO_CHIPS) && sim.SCENARIO_CHIPS.length >= 5,
    'what-if: the quick scenario chips from the brief exist');
  for (const chip of sim.SCENARIO_CHIPS || []) {
    check(typeof chip.label === 'string' && chip.label.length > 0, `what-if: chip ${chip.key} has a label`);
    check(typeof chip.apply === 'function', `what-if: chip ${chip.key} produces mutations`);
    const muts = chip.apply(fixInput());
    check(Array.isArray(muts), `what-if: chip ${chip.key} returns a mutation list`);
    if (muts.length) {
      const out = sim.simulate(fixInput(), muts);
      check(typeof out.next.score === 'number', `what-if: chip ${chip.key} produces a real forecast`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 12. Natural language
 * ------------------------------------------------------------------ */

const nlp = await load('src/engine/nlp.js');
if (nlp && typeof nlp.parseQuickAdd === 'function') {
  const ctx = { today: TODAY, now: NOW, profile: fixProfile() };
  const r = nlp.parseQuickAdd('מחר ב-17:00 יש לי אימון של שעה', ctx);
  check(r.ok === true, 'nlp: reads the brief\'s own example sentence');
  if (r.item) {
    check(r.item.start === 1020, `nlp: 17:00 is minute 1020 (got ${r.item.start})`);
    check(r.item.duration === 60, `nlp: "של שעה" is 60 minutes (got ${r.item.duration})`);
    check(r.item.type === 'workout', `nlp: "אימון" is a workout (got ${r.item.type})`);
    check(r.item.date === TOMORROW, `nlp: "מחר" is tomorrow (got ${r.item.date})`);
    check(!/מחר|17:00|שעה/.test(r.item.title || ''),
      `nlp: the parsed parts are stripped out of the title (got "${r.item.title}")`);
  }
  const half = nlp.parseQuickAdd('פגישה עם דנה מחר בשעה 9 וחצי', ctx);
  check(half.item && half.item.start === 570, `nlp: "9 וחצי" is 09:30 (got ${half.item && half.item.start})`);
  const bare = nlp.parseQuickAdd('לקרוא ספר', ctx);
  check(bare.ok === true && bare.item && bare.item.start === null,
    'nlp: a sentence with no time yields an unscheduled task rather than a guess');
  check(bare.matched && bare.matched.time === false, 'nlp: and it reports that it read no time');
  check(typeof bare.note === 'string', 'nlp: says what it could not read');
  const junk = nlp.parseQuickAdd('   ', ctx);
  check(junk.ok === false, 'nlp: empty input is not ok');
  check(fingerprint(nlp.parseQuickAdd('מחר ב-17:00 יש לי אימון של שעה', ctx)) === fingerprint(r),
    'nlp: parsing is deterministic');
}

/* ------------------------------------------------------------------ *
 * 13. Chat — answers from the local engine, and honest about it
 * ------------------------------------------------------------------ */

const chat = await load('src/engine/chat.js');
if (chat && typeof chat.answer === 'function' && base) {
  check(chat.CHAT_MODE === 'local', 'chat: declares itself as the local engine');
  check(Array.isArray(chat.SUGGESTIONS) && chat.SUGGESTIONS.length >= 5, 'chat: offers example questions');
  const cctx = { forecast: base, profile: fixProfile(), plan: fixPlan(), items: clone(FIX_ITEMS),
    learning: fixLearning(), insights: [], history: [] };
  for (const q of chat.SUGGESTIONS || []) {
    const a = chat.answer(q, cctx);
    check(a && typeof a.text === 'string' && a.text.length > 10,
      `chat: answers its own suggested question "${q}"`);
  }
  const a1 = chat.answer('איך מחר נראה?', cctx);
  check(a1.text.includes(String(base.score)), 'chat: an answer about tomorrow quotes the real score');
  const a2 = chat.answer('מתי כדאי לי לעשות את המשימה הקשה ביותר?', cctx);
  check(a2.text.length > 10, 'chat: answers when to do the hardest task');
  const unknown = chat.answer('מה מזג האוויר בפריז', cctx);
  check(unknown && unknown.text.length > 0, 'chat: says something useful even off-topic rather than crashing');
  check(fingerprint(chat.answer('איך מחר נראה?', cctx)) === fingerprint(a1), 'chat: answers deterministically');
}

/* ------------------------------------------------------------------ *
 * 14. Explanations
 * ------------------------------------------------------------------ */

const explain = await load('src/engine/explain.js');
if (explain && base) {
  for (const n of ['explainScore', 'explainFactor', 'explainDay', 'explainRisk', 'explainChange'])
    if (typeof explain[n] !== 'function') err(`explain.js: missing export ${n}()`);
  if (explain.explainDay) {
    const d = explain.explainDay(base);
    check(typeof d === 'string' && d.length > 20, 'explain: the day summary is a real sentence');
    check(d.split(/[.!?]/).filter((s) => s.trim()).length <= 3,
      `explain: the summary stays to two or three sentences (got "${d}")`);
    check(!/!/.test(d), 'explain: no exclamation marks — the register is calm');
  }
  if (explain.explainScore) {
    const lines = explain.explainScore(base);
    check(Array.isArray(lines) && lines.length > 0, 'explain: "why this score" returns lines');
  }
  if (explain.explainFactor)
    for (const f of base.factors || [])
      check(explain.explainFactor(f, base).length > 5, `explain: factor ${f.key} explains itself`);
}

/* ------------------------------------------------------------------ *
 * 15. Demo data must agree with itself
 * ------------------------------------------------------------------ */

const demo = await load('src/data/demo.js');
if (demo && typeof demo.demoRoot === 'function') {
  let d = null;
  try { d = demo.demoRoot(NOW_ISO, NOW); } catch (e) { err(`demo: demoRoot threw — ${e.message}`); }
  if (d) {
    check(d.schemaVersion === 1, 'demo: is a valid Root');
    check(d.user && d.user.demo === true, 'demo: is flagged as demo data');
    check(d.profile && d.profile.name, 'demo: has a named user');
    const days = Object.keys(d.records || {}).length;
    check(days >= 14, `demo: carries enough history to have something true to say (${days} days)`);
    const items = Object.values(d.items || {});
    check(items.length >= 6, `demo: tomorrow has a real day in it (${items.length} items)`);
    const tomorrowKey = time ? time.addDays(time.todayKey(NOW), 1) : null;
    if (tomorrowKey) {
      check(items.some((i) => i.date === tomorrowKey), 'demo: there are items on tomorrow specifically');
      check(!!(d.days || {})[tomorrowKey], 'demo: tomorrow has a plan');
    }
    if (schema && schema.normalizeRoot)
      check(fingerprint(schema.normalizeRoot(clone(d), NOW_ISO).schemaVersion) === '1',
        'demo: survives normalisation unchanged');

    /* The demo's learned numbers must come from the demo's own logged days,
       not from a hand-typed constant that happens to look plausible. */
    if (learn && learn.updateLearning) {
      const recomputed = learn.updateLearning(schema.emptyLearning(),
        Object.values(d.records), Object.values(d.items), {});
      const claimed = d.learning || {};
      for (const f of ['averageTaskCompletionRate', 'averageEstimationError']) {
        if (claimed[f] === null || recomputed[f] === null) continue;
        const gap = Math.abs(claimed[f] - recomputed[f]);
        check(gap < 0.15,
          `demo: the stored ${f} (${claimed[f]}) matches what its own history produces (${recomputed[f]})`);
      }
    }
    /* Internal coherence — the brief's §60 rule. */
    if (predict && time) {
      const tk = time.addDays(time.todayKey(NOW), 1);
      const f = predict.forecast({
        date: tk, profile: d.profile, plan: d.days[tk],
        items: Object.values(d.items).filter((i) => i.date === tk),
        learning: d.learning, history: Object.values(d.records).reverse(),
        now: NOW, morning: null,
      });
      const sleepRisk = (f.risks || []).find((r) => r.key === 'sleep');
      const sleepFactor = (f.factors || []).find((x) => x.key === 'sleep');
      if (sleepRisk && sleepRisk.severity === 'high' && sleepFactor)
        check(sleepFactor.score < 60,
          'demo: a high sleep risk is not shown next to an excellent sleep score');
      check(f.insights.length > 0,
        'demo: the demo user has at least one true pattern for the insights screen');
      check(f.confidence.overall > 40,
        `demo: after weeks of history the forecast is more than a guess (got ${f.confidence.overall})`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 16. UI surface — the parts a browser test cannot reach cheaply
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 15b. The import graph
 *
 * Every relative import must point at a file that exists and name something
 * that file actually exports. Node only finds these when the module is loaded,
 * so a typo in a screen nobody opened during the browser test would otherwise
 * ship. This walks every file instead.
 * ------------------------------------------------------------------ */

function walkJs(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    try {
      if (readdirSync(full).length >= 0) { out.push(...walkJs(full)); continue; }
    } catch (e) { /* not a directory */ }
    if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

function exportsOf(file) {
  const src = readFileSync(file, 'utf8');
  const out = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const n of m[1].split(',')) out.add(n.trim().split(/\s+as\s+/).pop());
  }
  return out;
}

{
  const files = walkJs(resolve(APP, 'src'));
  check(files.length > 20, `imports: found the app's modules to walk (${files.length})`);
  let broken = 0;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(APP, file);
    for (const m of src.matchAll(/import\s*(?:\*\s*as\s*[A-Za-z0-9_$]+|\{([^}]*)\})\s*from\s*['"]([^'"]+)['"]/g)) {
      const spec = m[2];
      if (!spec.startsWith('.')) continue;
      const target = resolve(file, '..', spec);
      if (!existsSync(target)) { err(`imports: ${rel} imports "${spec}", which does not exist`); broken++; continue; }
      if (!m[1]) continue;
      const ex = exportsOf(target);
      for (const raw of m[1].split(',')) {
        const n = raw.trim().split(/\s+as\s+/)[0].trim();
        if (n && !ex.has(n)) {
          err(`imports: ${relative(APP, target)} does not export "${n}" (wanted by ${rel})`);
          broken++;
        }
      }
    }
  }
  check(broken === 0, 'imports: every relative import resolves to a real export');
}

const UI_DIR = resolve(APP, 'src/ui');
if (existsSync(UI_DIR)) {
  const files = readdirSync(UI_DIR).filter((f) => f.endsWith('.js'));
  check(files.length > 0, 'ui: there are view modules');
  for (const f of files) {
    const src = readFileSync(resolve(UI_DIR, f), 'utf8');
    if (/\.innerHTML\s*=/.test(src) && !/innerHTML\s*=\s*''/.test(src))
      warn(`ui/${f}: assigns innerHTML — use h() unless it is provably a constant`);
    if (/export\s+default/.test(src)) err(`ui/${f}: default export`);
    /* A Hebrew string is the tell for user-facing copy; a file full of it that
       never imports the DOM helper is building markup some other way. */
    if (/[֐-׿]/.test(src) && !/from '\.\.\/core\/dom\.js'/.test(src) && !/catalog\.js/.test(src))
      warn(`ui/${f}: has Hebrew copy but does not import the DOM helper`);
  }
  const app = resolve(APP, 'src/app.js');
  check(existsSync(app), 'ui: src/app.js is the entry point');
}

const html = resolve(APP, 'index.html');
if (existsSync(html)) {
  const src = readFileSync(html, 'utf8');
  check(/dir="rtl"/.test(src), 'html: the page is RTL');
  check(/lang="he"/.test(src), 'html: the page declares Hebrew');
  check(/Content-Security-Policy/.test(src), 'html: carries a CSP');
  check(!/'unsafe-inline'/.test(src), 'html: the CSP has no unsafe-inline');
  check(/connect-src 'none'/.test(src), 'html: this app talks to nobody, and says so');
  check(!/(href|src)="\//.test(src), 'html: every path is relative, so Pages can serve it from a subpath');
  check(/<noscript/.test(src), 'html: says something without JavaScript');
  for (const m of src.match(/(?:href|src)="([^"]+)"/g) || []) {
    const p = m.slice(m.indexOf('"') + 1, -1);
    if (p.startsWith('data:') || p.startsWith('http')) continue;
    check(existsSync(resolve(APP, p)), `html: ${p} exists`);
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(4, ' ');
console.log(`\n${pad(passed.length)} checks passed`);
if (warnings.length) {
  console.log(`\n${pad(warnings.length)} warnings:`);
  for (const w of warnings) console.log(`  ~ ${w}`);
}
if (errors.length) {
  console.log(`\n${pad(errors.length)} ERRORS:`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log('');
  process.exit(1);
}
console.log('\nTomorrowAI matches its contract.\n');
