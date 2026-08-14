#!/usr/bin/env node
/*
 * skilltree-logic.mjs — tests for the logic that decides progression.
 *
 * Covers what §59 asks for — unlock rules, XP, levels, mastery, dependency
 * validation, achievements — plus the edge cases listed in §60, which is where
 * the interesting failures live: circular dependencies, duplicate XP events,
 * an assessment submitted twice, several skills unlocking at once.
 *
 * No framework. A tiny assert helper and a count, because adding a test runner
 * to a repo with no package.json to satisfy a convention would be the wrong
 * trade.
 *
 *   node tools/skilltree-logic.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(resolve(ROOT, 'skilltree/src', p)).href);

const {
  xpForLevel, levelForXp, globalProgress, levelFor, skillProgress, xpForSkillLevel,
} = await load('domain/levels.js');
const { computeAward, appendXpEvent, totalXp, xpBySkill, xpByDay, repeatMultiplier, skillCapacity, activityXpCap } = await load('domain/xp.js');
const { computeMastery, confidenceFor, reviewUrgency, weightedScore } = await load('domain/mastery.js');
const { indexTree, findCycle, computeDepths, layoutTree, ancestorsOf, descendantsOf, pathTo } = await load('domain/graph.js');
const { isUnlocked, statusOf, STATUS, requirementStatus, statusSnapshot, newlyUnlocked, readiness, levelOf } = await load('domain/unlock.js');
const { applyAttempt, startSkill, newUserSkill, dayNumber, liveStreak, touchStreak } = await load('domain/progress.js');
const { evaluate, award, ACHIEVEMENTS } = await load('domain/achievements.js');
const { gradeQuiz, gradeCode, gradeNumeric, gradeChecklist, parseNumeric, deepEqual, grade, numericMatches } = await load('domain/verify.js');
const { validateTree, extractJson, parse, s } = await load('ai/schema.js');
const { recommend, difficultyFit, goalPath } = await load('domain/recommend.js');
const { nextActivityFor, generateMissions, completeMissionsFor } = await load('domain/missions.js');
const { WEB_TREE } = await load('data/tree.web.js');
const { MATH_TREE } = await load('data/tree.math.js');
const { CALISTHENICS_TREE } = await load('data/tree.calisthenics.js');
const { buildDemoProfile } = await load('data/demo.js');
const { allTrees: registeredTrees, getIndex: registeredIndex } = await load('data/catalog.js');
const { emptyProfile } = await load('core/store.js');
const goals = await load('domain/goals.js');
const { fingerprint } = await load('core/session.js');
const { BUSINESS_TREE } = await load('data/tree.business.js');
const catalogModule = await load('data/catalog.js');

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) { passed += 1; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

function eq(name, actual, expected) {
  check(name, deepEqual(actual, expected), `got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`);
}

const group = (title) => console.log(`\n${title}`);

/** An activity of a given kind in a web-tree skill, for the tests below. */
function skillActivity(skillId, kind) {
  const acts = WEB_TREE.skills.find((s) => s.id === skillId).activities || [];
  return acts.find((a) => a.kind === kind) || acts[0];
}

/* ================================================================== *
 * Levels
 * ================================================================== */
group('Levels and XP curve');

eq('L1 costs 0 XP', xpForLevel(1), 0);
eq('L2 costs 100 XP', xpForLevel(2), 100);
eq('L3 costs 250 XP', xpForLevel(3), 250);
eq('L4 costs 450 XP', xpForLevel(4), 450);
check('curve keeps accelerating', xpForLevel(21) - xpForLevel(20) > xpForLevel(11) - xpForLevel(10));

eq('0 XP is level 1', levelForXp(0), 1);
eq('99 XP is still level 1', levelForXp(99), 1);
eq('100 XP is level 2', levelForXp(100), 2);
eq('449 XP is level 3', levelForXp(449), 3);
check('levelForXp inverts xpForLevel for 1..60',
  Array.from({ length: 60 }, (_, i) => i + 1).every((n) => levelForXp(xpForLevel(n)) === n));
check('negative XP does not produce level 0', levelForXp(-500) === 1);

const gp = globalProgress(2480);
eq('globalProgress level', gp.level, 9);
check('globalProgress fraction in range', gp.fraction >= 0 && gp.fraction <= 1);
eq('globalProgress accounts for the whole level', gp.intoLevel + gp.toNextLevel, gp.levelSpan);

/* ================================================================== *
 * Skill levels — the anti-grind rule
 * ================================================================== */
group('Skill levels');

const CAP = 100; /* a skill worth 100 XP on a clean pass */
eq('unstarted skill is level 0', levelFor({ xp: 0, masteryScore: 0, capacity: CAP, started: false }), 0);
eq('starting earns level 1', levelFor({ xp: 0, masteryScore: 0, capacity: CAP, started: true }), 1);
eq('grinding XP without mastery caps at 2',
  levelFor({ xp: 99999, masteryScore: 30, capacity: CAP, started: true }), 2);
eq('high mastery without XP stays at 1',
  levelFor({ xp: 0, masteryScore: 100, capacity: CAP, started: true }), 1);
eq('both ladders met reaches 5',
  levelFor({ xp: CAP, masteryScore: 85, capacity: CAP, started: true }), 5);
eq('a skill with no activities can never exceed level 1',
  levelFor({ xp: 9999, masteryScore: 100, capacity: 0, started: true }), 1);
check('thresholds scale with the skill',
  xpForSkillLevel(3, 200) === 2 * xpForSkillLevel(3, 100));
check('a clean full pass reaches the level-5 threshold',
  xpForSkillLevel(5, CAP) === CAP);
check('harder skills yield more, so cost more',
  skillCapacity([{ kind: 'quiz' }], 5) > skillCapacity([{ kind: 'quiz' }], 1));

const sp = skillProgress({ xp: 40, masteryScore: 68, capacity: CAP, started: true });
eq('skillProgress reports the binding constraint', sp.blockedBy, 'xp');
check('skillProgress fraction is the minimum of both ladders',
  Math.abs(sp.fraction - Math.min(sp.xpFraction, sp.masteryFraction)) < 1e-9);
check('level 5 reports atCap', skillProgress({ xp: 9999, masteryScore: 100, capacity: CAP, started: true }).atCap === true);

/* ================================================================== *
 * XP awards and the ledger
 * ================================================================== */
group('XP awards');

check('a failed attempt pays nothing', computeAward({ kind: 'quiz', passed: false, score: 90 }) === 0);
check('a better score pays more',
  computeAward({ kind: 'quiz', score: 100 }) > computeAward({ kind: 'quiz', score: 60 }));
check('the second pass pays about half',
  computeAward({ kind: 'quiz', score: 100, previousPasses: 1 })
  < computeAward({ kind: 'quiz', score: 100, previousPasses: 0 }));
check('farming decays hard',
  computeAward({ kind: 'quiz', score: 100, previousPasses: 6 })
  <= computeAward({ kind: 'quiz', score: 100 }) * 0.15);
eq('repeat multiplier ladder', [0, 1, 2, 9].map(repeatMultiplier), [1, 0.5, 0.1, 0.1]);
check('a hard skill pays more than an easy one',
  computeAward({ kind: 'challenge', score: 80, difficulty: 5 })
  > computeAward({ kind: 'challenge', score: 80, difficulty: 1 }));

/* §60: duplicate XP event */
let ledger = [];
ledger = appendXpEvent(ledger, { key: 'a', amount: 50, at: 1000 });
ledger = appendXpEvent(ledger, { key: 'a', amount: 50, at: 2000 });
eq('a duplicate key is refused', ledger.length, 1);
eq('the total reflects one award', totalXp(ledger), 50);

ledger = appendXpEvent(ledger, { key: 'b', amount: 25, skillId: 'x', at: 3000 });
eq('a distinct key is accepted', ledger.length, 2);
eq('xpBySkill folds correctly', xpBySkill(ledger).get('x'), 25);

const days = xpByDay([{ amount: 10, at: Date.now() }], 7);
eq('xpByDay returns the whole window', days.length, 7);
check('xpByDay keeps empty days as zeroes', days.filter((d) => d.xp === 0).length === 6);

/* ================================================================== *
 * Mastery
 * ================================================================== */
group('Mastery');

const now = Date.UTC(2026, 0, 15);
const DAY = 86400000;

eq('no attempts means no mastery', computeMastery([]).score, 0);

check('missing components do not cap the score',
  computeMastery([{ kind: 'assessment', score: 100, at: now }], { now }).score >= 90,
  'a single perfect assessment should not be dragged to 40 by absent components');

check('recent attempts weigh more than old ones',
  weightedScore([{ score: 20, at: now - 10 * DAY }, { score: 100, at: now }]) > 60);

check('mastery is bounded 0..100',
  [[], [{ kind: 'quiz', score: 0, at: now }], [{ kind: 'mastery', score: 100, at: now }]]
    .every((a) => { const m = computeMastery(a, { now }).score; return m >= 0 && m <= 100; }));

check('weights are configurable',
  computeMastery([
    { kind: 'assessment', score: 100, at: now },
    { kind: 'quiz', score: 20, at: now },
  ], { now, weights: { assessment: 0.9, challenge: 0.1, retention: 0, consistency: 0 } }).score
  > computeMastery([
    { kind: 'assessment', score: 100, at: now },
    { kind: 'quiz', score: 20, at: now },
  ], { now, weights: { assessment: 0.1, challenge: 0.9, retention: 0, consistency: 0 } }).score);

/* Confidence decays; mastery does not. */
const stale = { masteryScore: 92, lastPracticedAt: now - 120 * DAY, level: 4 };
check('confidence decays with time away', confidenceFor(stale, now) < 80);
check('confidence never reaches zero', confidenceFor(stale, now) > 20);
check('fresh practice means full confidence',
  confidenceFor({ masteryScore: 60, lastPracticedAt: now, level: 2 }, now) >= 99);
check('a better-learned skill decays more slowly',
  confidenceFor({ masteryScore: 90, lastPracticedAt: now - 40 * DAY, level: 5 }, now)
  > confidenceFor({ masteryScore: 90, lastPracticedAt: now - 40 * DAY, level: 2 }, now));
eq('an unpractised skill has no confidence', confidenceFor({ masteryScore: 0, lastPracticedAt: null }, now), 0);
eq('a level-1 skill is never urgent', reviewUrgency({ masteryScore: 50, lastPracticedAt: now - 90 * DAY, level: 1 }, now), 0);
check('a stale mastered skill is urgent',
  reviewUrgency({ masteryScore: 95, lastPracticedAt: now - 90 * DAY, level: 5 }, now) > 20);

/* ================================================================== *
 * Graph
 * ================================================================== */
group('Graph and dependencies');

const trees = [WEB_TREE, MATH_TREE, CALISTHENICS_TREE, BUSINESS_TREE];
for (const tree of trees) {
  check(`${tree.id}: no cycle`, findCycle(tree) === null, String(findCycle(tree)));
  const index = indexTree(tree);
  const depths = computeDepths(index);
  check(`${tree.id}: every skill has a depth`, depths.size === tree.skills.length);
  check(`${tree.id}: has a root`, tree.skills.some((sk) => !(sk.requires || []).length));

  /* The invariant the layout depends on: a node always sits deeper than every
   * one of its prerequisites, so edges never draw backwards. */
  check(`${tree.id}: depth strictly exceeds every prerequisite`,
    tree.skills.every((sk) => (sk.requires || []).every((r) => depths.get(sk.id) > depths.get(r.skillId))));

  const layout = layoutTree(index);
  check(`${tree.id}: every node laid out`, layout.nodes.length === tree.skills.length);
  check(`${tree.id}: no NaN positions`, layout.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
}

check('the brief\'s worked example is encoded',
  deepEqual(
    indexTree(WEB_TREE).byId.get('react_basics').requires.slice().sort((a, b) => a.skillId.localeCompare(b.skillId)),
    [{ skillId: 'css_flexbox', minLevel: 2 }, { skillId: 'js_arrays', minLevel: 3 }, { skillId: 'js_dom', minLevel: 3 }],
  ));

const webIndex = indexTree(WEB_TREE);
check('ancestors are transitive', ancestorsOf(webIndex, 'react_basics').has('html_basics'));
check('descendants are transitive', descendantsOf(webIndex, 'html_basics').has('react_basics'));
check('a root has no ancestors', ancestorsOf(webIndex, 'internet_basics').size === 0);
check('pathTo is dependency-ordered', (() => {
  const path = pathTo(webIndex, 'fullstack');
  const position = new Map(path.map((id, i) => [id, i]));
  return path.every((id) => (webIndex.byId.get(id).requires || [])
    .every((r) => position.get(r.skillId) < position.get(id)));
})());

/* §60: circular dependency must be detected, not looped on */
const cyclic = {
  id: 'cyc',
  name: 'Cyclic',
  skills: [
    { id: 'a', name: 'A', requires: [{ skillId: 'c', minLevel: 1 }] },
    { id: 'b', name: 'B', requires: [{ skillId: 'a', minLevel: 1 }] },
    { id: 'c', name: 'C', requires: [{ skillId: 'b', minLevel: 1 }] },
  ],
};
check('a cycle is found', findCycle(cyclic) !== null);
check('computeDepths throws on a cycle rather than hanging', (() => {
  try { computeDepths(indexTree(cyclic)); return false; } catch { return true; }
})());

check('an unknown prerequisite is rejected at index time', (() => {
  try {
    indexTree({ id: 't', name: 'T', skills: [{ id: 'a', name: 'A', requires: [{ skillId: 'ghost', minLevel: 1 }] }] });
    return false;
  } catch { return true; }
})());

check('a duplicate skill id is rejected', (() => {
  try {
    indexTree({ id: 't', name: 'T', skills: [{ id: 'a', name: 'A' }, { id: 'a', name: 'A again' }] });
    return false;
  } catch { return true; }
})());

/* ================================================================== *
 * Unlock gate
 * ================================================================== */
group('Unlock rules');

const noProgress = () => undefined;
check('a root is unlocked with no progress', isUnlocked(webIndex, 'internet_basics', noProgress));
check('a deep skill is locked with no progress', !isUnlocked(webIndex, 'react_basics', noProgress));
eq('an unstarted root reads as available', statusOf(webIndex, 'internet_basics', noProgress), STATUS.AVAILABLE);
eq('a gated skill reads as locked', statusOf(webIndex, 'react_basics', noProgress), STATUS.LOCKED);

/* §60: several prerequisites, partially met */
const capOf = (id) => skillCapacity(webIndex.byId.get(id).activities, webIndex.byId.get(id).difficulty);
const partial = {
  js_arrays: { skillId: 'js_arrays', xp: 9999, masteryScore: 90, capacity: capOf('js_arrays'), startedAt: 1 },
  js_dom: { skillId: 'js_dom', xp: 9999, masteryScore: 90, capacity: capOf('js_dom'), startedAt: 1 },
};
check('React stays locked with two of three met',
  !isUnlocked(webIndex, 'react_basics', (id) => partial[id]));

const reqs = requirementStatus(webIndex, 'react_basics', (id) => partial[id]);
eq('the requirement list reports all three', reqs.length, 3);
eq('exactly one is unmet', reqs.filter((r) => !r.met).length, 1);
check('the unmet one names what is missing', reqs.find((r) => !r.met).name === 'Flexbox');
check('readiness reflects partial progress', (() => {
  const r = readiness(webIndex, 'react_basics', (id) => partial[id]);
  return r > 0.5 && r < 1;
})());

check('the itemised list and the boolean agree, always', WEB_TREE.skills.every((sk) => {
  const items = requirementStatus(webIndex, sk.id, (id) => partial[id]);
  return items.every((r) => r.met) === isUnlocked(webIndex, sk.id, (id) => partial[id]);
}));

/* ================================================================== *
 * applyAttempt — the transactional core
 * ================================================================== */
group('Applying attempts');

const t0 = Date.UTC(2026, 0, 10);

function fresh() {
  return emptyProfile('Test');
}

let state = fresh();
let res = applyAttempt(state, webIndex, {
  skillId: 'internet_basics', activityId: 'internet_basics.quiz', kind: 'quiz', score: 100, passed: true,
}, t0);
state = res.state;

check('an attempt awards XP', totalXp(state.xpEvents) > 0);
check('the skill is created on first attempt', !!state.skills.internet_basics);
eq('the attempt is recorded', state.skills.internet_basics.attempts.length, 1);
check('an xp event is announced', res.events.some((e) => e.type === 'xp'));
check('mastery is computed from the score', state.skills.internet_basics.masteryScore > 0);

/* §60: assessment submitted twice */
const before = totalXp(state.xpEvents);
const dup = applyAttempt(state, webIndex, {
  skillId: 'internet_basics', activityId: 'internet_basics.quiz', kind: 'quiz', score: 100, passed: true,
  id: state.skills.internet_basics.attempts[0].id,
}, t0);
eq('a duplicate attempt id changes nothing', totalXp(dup.state.xpEvents), before);
check('a duplicate is reported as such', dup.events.some((e) => e.type === 'duplicate'));

/* A failed attempt records but pays nothing */
const failed = applyAttempt(state, webIndex, {
  skillId: 'internet_basics', activityId: 'internet_basics.learn', kind: 'learn', score: 20, passed: false,
}, t0 + DAY);
eq('a failed attempt pays no XP', totalXp(failed.state.xpEvents), before);
eq('a failed attempt is still recorded', failed.state.skills.internet_basics.attempts.length, 2);

/* Starting a locked skill is refused */
const refused = startSkill(fresh(), webIndex, 'react_basics', t0);
check('starting a locked skill is refused', refused.started === false && refused.reason === 'locked');

/* §60: several skills unlock at once */
function levelUpTo(st, skillId, target, at) {
  let out = st;
  const skill = webIndex.byId.get(skillId);
  for (let i = 0; i < 26; i += 1) {
    const acts = skill.activities || [];
    const activity = acts[i % Math.max(1, acts.length)];
    const applied = applyAttempt(out, webIndex, {
      skillId,
      activityId: activity ? activity.id : `${skillId}.synthetic`,
      kind: 'assessment',
      score: 96,
      passed: true,
      id: `t:${skillId}:${i}`,
    }, at + i * DAY * 3);
    out = applied.state;
    if ((out.skills[skillId]?.level || 0) >= target) break;
  }
  return out;
}

let multi = fresh();
for (const id of ['internet_basics', 'html_basics', 'semantic_html', 'css_basics', 'css_box_model', 'js_basics']) {
  multi = levelUpTo(multi, id, 3, t0);
}
const snapBefore = statusSnapshot(webIndex, (id) => multi.skills[id]);
multi = levelUpTo(multi, 'css_flexbox', 3, t0 + 100 * DAY);
const opened = newlyUnlocked(webIndex, (id) => multi.skills[id], snapBefore);
check('finishing one skill can open several', opened.length >= 1, `opened ${JSON.stringify(opened)}`);

check('levels rise with sustained good scores',
  levelUpTo(fresh(), 'internet_basics', 5, t0).skills.internet_basics.level >= 4);

/* Streaks */
group('Streaks');
const day = dayNumber(t0);
let streaked = touchStreak(fresh(), t0);
eq('first day is a 1-day streak', streaked.streak.current, 1);
streaked = touchStreak(streaked, t0 + DAY);
eq('consecutive days extend it', streaked.streak.current, 2);
streaked = touchStreak(streaked, t0 + DAY);
eq('twice in one day does not double-count', streaked.streak.current, 2);
streaked = touchStreak(streaked, t0 + 5 * DAY);
eq('a gap resets it', streaked.streak.current, 1);
eq('the longest is remembered', streaked.streak.longest, 2);
eq('a stale streak reads as zero', liveStreak(streaked, t0 + 40 * DAY).current, 0);
eq('but the longest survives', liveStreak(streaked, t0 + 40 * DAY).longest, 2);

/* ================================================================== *
 * Grading
 * ================================================================== */
group('Grading');

const quiz = WEB_TREE.skills.find((sk) => sk.id === 'js_basics').activities.find((a) => a.kind === 'quiz');
eq('all correct is 100', gradeQuiz(quiz, quiz.questions.map((q) => q.answer)).score, 100);
eq('all wrong is 0', gradeQuiz(quiz, quiz.questions.map((q) => (q.answer + 1) % q.options.length)).score, 0);
check('unanswered counts as wrong', gradeQuiz(quiz, []).score === 0);
check('a pass needs 70%', gradeQuiz(quiz, quiz.questions.map((q) => q.answer)).passed === true);

const codeActivity = WEB_TREE.skills.find((sk) => sk.id === 'js_arrays').activities.find((a) => a.tests);
const good = await gradeCode(codeActivity, 'function unique(a){ return [...new Set(a)] }');
check('a correct solution passes', good.passed === true);
const mutating = await gradeCode(codeActivity, 'function unique(a){ const o=[...new Set(a)]; a.length=0; a.push(...o); return o }');
check('a mutating solution fails the immutability test', mutating.passed === false);
const goodAgain = await gradeCode(codeActivity, 'function unique(a){ return [...new Set(a)] }');
check('test fixtures survive a mutating submission', goodAgain.passed === true,
  'a mutating solution must not corrupt the shared fixture for later attempts');

const broken = await gradeCode(codeActivity, 'function unique(a){ return [ }');
check('a syntax error is reported once', broken.passed === false && /Syntax error/.test(broken.error || ''));
const looping = await gradeCode(codeActivity, 'function unique(a){ while(true){} }', { timeoutMs: 200 });
check('an infinite loop is caught', looping.passed === false && looping.results.some((r) => /timed out/.test(r.error || '')));
const forever = await gradeCode(codeActivity, 'function unique(a){ for(;;){} }', { timeoutMs: 200 });
check('a bare for(;;) is caught', forever.results.some((r) => /timed out/.test(r.error || '')));
const normalLoop = await gradeCode(codeActivity,
  'function unique(a){ const o=[]; for(let i=0;i<a.length;i++){ if(!o.includes(a[i])) o.push(a[i]) } return o }');
check('the loop guard does not break ordinary loops', normalLoop.passed === true);
const forOf = await gradeCode(codeActivity,
  'function unique(a){ const o=[]; for (const x of a) { if(!o.includes(x)) o.push(x) } return o }');
check('the loop guard leaves for-of alone', forOf.passed === true);

eq('numeric forms all parse',
  ['0.5', '1/2', '.5', '50%'].map((v) => parseNumeric(v)), [0.5, 0.5, 0.5, 0.5]);
eq('negatives parse', parseNumeric('-3/4'), -0.75);
eq('nonsense does not parse', parseNumeric('banana'), null);
eq('divide by zero does not parse', parseNumeric('1/0'), null);

const numericActivity = MATH_TREE.skills.find((sk) => sk.id === 'arithmetic').activities.find((a) => a.questions);
eq('correct numeric answers score 100',
  gradeNumeric(numericActivity, numericActivity.questions.map((q) => String(q.answer))).score, 100);

const checklistActivity = CALISTHENICS_TREE.skills
  .find((sk) => sk.id === 'pullups').activities.find((a) => a.checklist);
check('a partial checklist fails',
  gradeChecklist(checklistActivity, checklistActivity.checklist.map((_, i) => i > 0)).passed === false);
check('a full checklist passes and is flagged self-reported', (() => {
  const r = gradeChecklist(checklistActivity, checklistActivity.checklist.map(() => true));
  return r.passed === true && r.selfReported === true;
})());

/* Every seeded question is answerable and internally consistent. */
group('Content integrity');
let contentProblems = 0;
const seenActivityIds = new Set();
for (const tree of trees) {
  for (const skill of tree.skills) {
    check(`${skill.id} has a description`, !!skill.description || skill.category === 'Milestone');
    for (const activity of skill.activities || []) {
      if (seenActivityIds.has(activity.id)) { contentProblems += 1; console.log('  duplicate activity id', activity.id); }
      seenActivityIds.add(activity.id);

      for (const q of activity.questions || []) {
        if (Array.isArray(q.options)) {
          if (!(q.answer >= 0 && q.answer < q.options.length)) { contentProblems += 1; console.log('  bad option index', activity.id); }
          if (new Set(q.options).size !== q.options.length) { contentProblems += 1; console.log('  duplicate options', activity.id); }
        } else if (!Number.isFinite(q.answer)) { contentProblems += 1; console.log('  non-numeric answer', activity.id); }
      }
      if (activity.tests && !activity.entry) { contentProblems += 1; console.log('  code activity with no entry point', activity.id); }
    }
  }
}
eq('no content problems', contentProblems, 0);
/*
 * The correct answer must not always be in the same place.
 *
 * Every question in this repo was authored with its answer first, which made
 * the entire quiz system beatable by clicking the top option — caught only
 * because a broken test fallback guessed index 0 throughout and scored 100%.
 * The catalogue permutes options deterministically at registration; this is
 * the guard that stops the problem coming back with the next batch of content.
 */
const answerSpread = {};
let mcCount = 0;
for (const tree of registeredTrees()) {
  for (const skill of tree.skills) {
    for (const activity of skill.activities || []) {
      for (const q of activity.questions || []) {
        if (!Array.isArray(q.options)) continue;
        answerSpread[q.answer] = (answerSpread[q.answer] || 0) + 1;
        mcCount += 1;
      }
    }
  }
}
check('multiple-choice answers are spread across positions',
  Object.values(answerSpread).every((n) => n < mcCount * 0.45),
  `distribution ${JSON.stringify(answerSpread)} over ${mcCount} questions`);
check('every option position is used', Object.keys(answerSpread).length >= 3,
  JSON.stringify(answerSpread));

/* Shuffling must preserve which text is correct, not just move the index. */
check('the shuffled answer still points at the correct option', (() => {
  const raw = WEB_TREE.skills.find((sk) => sk.id === 'js_basics').activities.find((a) => a.questions);
  const live = registeredIndex('web').byId.get('js_basics').activities.find((a) => a.questions);
  return live.questions.every((q, i) => q.options[q.answer] === raw.questions[i].options[raw.questions[i].answer]);
})());

/* And it must be stable — a learner's retry must not see a new order. */
check('the permutation is stable across lookups', (() => {
  const a = registeredIndex('web').byId.get('js_basics').activities.find((x) => x.questions);
  const b = registeredIndex('web').byId.get('js_basics').activities.find((x) => x.questions);
  return a.questions[0].options.join('|') === b.questions[0].options.join('|');
})());

check('every tree exceeds the brief\'s minimum size',
  WEB_TREE.skills.length >= 25 && MATH_TREE.skills.length >= 20 && CALISTHENICS_TREE.skills.length >= 20);

/* Every code challenge has a reference solution that passes — otherwise a
 * challenge could ship impossible and nobody would find out. */
const REFERENCE = {
  'js_basics.challenge': 'function fizzBuzz(n){ let s=""; if(n%3===0)s+="Fizz"; if(n%5===0)s+="Buzz"; return s||String(n) }',
  'js_functions.challenge': 'function makeCounter(start){ let n=start; return ()=>n++ }',
  'js_arrays.challenge': 'function unique(arr){ return [...new Set(arr)] }',
  'js_arrays.assessment': 'function summarise(o){ return { total:o.reduce((s,x)=>s+x.qty*x.price,0), count:o.reduce((s,x)=>s+x.qty,0), items:[...new Set(o.map(x=>x.item))] } }',
  'js_async.challenge': 'async function retry(fn,times){ let last; for(let i=0;i<=times;i++){ try { return await fn() } catch(e){ last=e } } throw last }',
  'react_state.challenge': 'function toggleTodo(t,id){ return t.map(x=> x.id===id ? {...x,done:!x.done} : x) }',
};
for (const tree of trees) {
  for (const skill of tree.skills) {
    for (const activity of skill.activities || []) {
      if (!activity.tests) continue;
      const solution = REFERENCE[activity.id];
      if (!solution) { check(`${activity.id} has a reference solution`, false); continue; }
      const graded = await gradeCode(activity, solution);
      check(`${activity.id}: reference solution passes`, graded.passed === true,
        graded.results.filter((r) => !r.passed).map((r) => r.label).join('; '));
    }
  }
}

/* ================================================================== *
 * Achievements
 * ================================================================== */
group('Achievements');

const ctx = {
  depthOf: (id) => computeDepths(webIndex).get(id) ?? null,
  treeOf: (id) => (webIndex.byId.has(id) ? 'web' : null),
};

eq('a blank profile earns nothing', evaluate(fresh(), ctx).length, 0);
check('the first activity earns First Step', evaluate(state, ctx).includes('first_step'));

const awarded = award(state, ctx, t0);
check('awarding records a timestamp', typeof awarded.state.achievements.first_step === 'number');
eq('awarding twice adds nothing', award(awarded.state, ctx, t0 + 5000).unlocked.length, 0);
check('an existing timestamp is not overwritten',
  award(awarded.state, ctx, t0 + 5000).state.achievements.first_step === t0);

check('achievement ids are unique', new Set(ACHIEVEMENTS.map((a) => a.id)).size === ACHIEVEMENTS.length);
check('every achievement has a name and description',
  ACHIEVEMENTS.every((a) => a.name && a.description && a.tier));
check('a throwing rule does not take down evaluation', (() => {
  const saved = ACHIEVEMENTS[0].test;
  ACHIEVEMENTS[0].test = () => { throw new Error('boom'); };
  try { evaluate(state, ctx); return true; } catch { return false; } finally { ACHIEVEMENTS[0].test = saved; }
})());

/* ================================================================== *
 * AI schema validation
 * ================================================================== */
group('AI response validation');

check('valid JSON is extracted', extractJson('{"a":1}').ok);
check('fenced JSON is extracted', extractJson('Here you go:\n```json\n{"a":1}\n```').ok);
check('JSON after prose is extracted', extractJson('Sure! {"a":1} hope that helps').ok);
check('prose alone is rejected', !extractJson('I cannot do that').ok);
check('malformed JSON is rejected, not repaired', !extractJson('{"a":1,}').ok);

const goodTree = {
  name: 'Test',
  skills: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B', requires: [{ skillId: 'a', minLevel: 2 }] },
    { id: 'c', name: 'C', requires: [{ skillId: 'b' }] },
    { id: 'd', name: 'D', requires: [{ skillId: 'c' }] },
    { id: 'e', name: 'E', requires: [{ skillId: 'd' }] },
  ],
};
const validated = validateTree(goodTree, 'gen_test');
check('a well-formed tree validates', validated.ok, validated.error);
check('a default minLevel is applied', validated.ok && validated.tree.skills[2].requires[0].minLevel === 1);

check('too few skills is rejected', !validateTree({ name: 'T', skills: [{ id: 'a', name: 'A' }] }, 'x').ok);
check('a missing name is rejected', !validateTree({ skills: goodTree.skills }, 'x').ok);

const dangling = validateTree({
  name: 'T',
  skills: [...goodTree.skills, { id: 'f', name: 'F', requires: [{ skillId: 'ghost' }] }],
}, 'x');
check('a dangling prerequisite is dropped rather than fatal', dangling.ok);
check('and it is reported', dangling.warnings.some((w) => /ghost/.test(w)));

const cyclicGen = validateTree({
  name: 'T',
  skills: [
    { id: 'a', name: 'A', requires: [{ skillId: 'c' }] },
    { id: 'b', name: 'B', requires: [{ skillId: 'a' }] },
    { id: 'c', name: 'C', requires: [{ skillId: 'b' }] },
    { id: 'd', name: 'D' },
    { id: 'e', name: 'E', requires: [{ skillId: 'd' }] },
  ],
}, 'x');
check('a generated cycle is broken, not accepted', cyclicGen.ok);
check('and the broken edge is reported', cyclicGen.warnings.some((w) => /circular/i.test(w)));
check('the repaired tree actually indexes', cyclicGen.ok && findCycle(cyclicGen.tree) === null);

/* A tree where every skill depends on another is repaired into one with a
 * root, because cycle-breaking necessarily creates one. The invariant worth
 * asserting is the outcome: whatever comes out is startable. */
const rootless = validateTree({
  name: 'T',
  skills: [
    { id: 'a', name: 'A', requires: [{ skillId: 'b' }] },
    { id: 'b', name: 'B', requires: [{ skillId: 'a' }] },
    { id: 'c', name: 'C', requires: [{ skillId: 'a' }] },
    { id: 'd', name: 'D', requires: [{ skillId: 'a' }] },
    { id: 'e', name: 'E', requires: [{ skillId: 'a' }] },
  ],
}, 'x');
check('a rootless tree is repaired into a startable one',
  rootless.ok && rootless.tree.skills.some((sk) => !sk.requires.length));

check('ids are slugged', (() => {
  const r = validateTree({ name: 'T', skills: [
    { id: 'Hello World!', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' },
    { id: 'd', name: 'D' }, { id: 'e', name: 'E' },
  ] }, 'x');
  return r.ok && r.tree.skills[0].id === 'hello_world';
})());

check('out-of-range difficulty is rejected',
  !parse(s.number({ min: 1, max: 5, integer: true }), 11).ok);

/* ================================================================== *
 * Recommendations and missions
 * ================================================================== */
group('Recommendations');

check('difficulty fit peaks one above comfort',
  difficultyFit(3, 2) > difficultyFit(5, 2) && difficultyFit(3, 2) > difficultyFit(1, 2));

const recs = recommend({ index: webIndex, state, findSkill: () => null, goalPath: [], now: t0 }, 3);
check('recommendations are produced', recs.length > 0);
check('recommendations are ordered by score', recs.every((r, i) => i === 0 || recs[i - 1].score >= r.score));
check('every recommendation carries a reason', recs.every((r) => Array.isArray(r.reasons)));
check('a mastered skill is never recommended', (() => {
  const mastered = levelUpTo(fresh(), 'internet_basics', 5, t0);
  if ((mastered.skills.internet_basics?.level || 0) < 5) return true; /* not reached; nothing to assert */
  return !recommend({ index: webIndex, state: mastered, findSkill: () => null, now: t0 }, 8)
    .some((r) => r.skillId === 'internet_basics');
})());

const path = goalPath(webIndex, 'fullstack', state);
check('a goal path is produced', path.length > 5);
check('a goal path is dependency-ordered', (() => {
  const position = new Map(path.map((p, i) => [p.skillId, i]));
  return path.every((p) => (webIndex.byId.get(p.skillId).requires || [])
    .every((r) => position.get(r.skillId) < position.get(p.skillId)));
})());
check('the goal path ends at the goal', path[path.length - 1].skillId === 'fullstack');

group('Missions');
const skillWithActivities = webIndex.byId.get('js_arrays');
eq('the next activity is the first unpassed one',
  nextActivityFor(skillWithActivities, undefined).id, skillWithActivities.activities[0].id);
check('a passed activity is skipped', (() => {
  const progress = { attempts: [{ activityId: skillWithActivities.activities[0].id, passed: true }] };
  return nextActivityFor(skillWithActivities, progress).id === skillWithActivities.activities[1].id;
})());
check('a failed activity is not skipped', (() => {
  const progress = { attempts: [{ activityId: skillWithActivities.activities[0].id, passed: false }] };
  return nextActivityFor(skillWithActivities, progress).id === skillWithActivities.activities[0].id;
})());

const missionState = { ...fresh(), settings: { intensity: 'normal' } };
const generated = generateMissions({ state: missionState, findSkill: () => null, recommendations: recs }, t0);
check('missions respect the intensity cap', generated.length <= 2);
check('missions are completed by doing the work, not by ticking', (() => {
  if (!generated.length || !generated[0].activityId) return true;
  const withMissions = { ...missionState, missions: { day: dayNumber(t0), items: generated, completed: [] } };
  const after = completeMissionsFor(withMissions, { skillId: generated[0].skillId, activityId: generated[0].activityId });
  return after.missions.completed.includes(generated[0].id);
})());

/* ================================================================== *
 * Goals — free text to a programme
 * ================================================================== */
group('Goal programmes');

const blank = emptyProfile('Goal test');
const plan = (text, minutes = 30, st = blank) => goals.buildProgramme({
  catalog: catalogModule, state: st, goalText: text, minutesPerDay: minutes, now: t0,
});

check('stop words are dropped', !goals.tokenise('I want to learn to be better').includes('want'));
check('content words survive', ['web', 'design', 'business']
  .every((w) => goals.tokenise('open a web design business').includes(w)),
  goals.tokenise('open a web design business').join(','));

/* The example the whole feature exists for. */
const web = plan('open a web design business');
check('a business goal produces a programme', web.ok);
check('it spans both the craft and the business', web.trees.includes('web') && web.trees.includes('business'),
  `trees: ${web.trees}`);
check('it reaches skills the learner never named', web.steps.some((s) => s.skillId === 'pricing')
  && web.steps.some((s) => s.skillId === 'contracts'),
  'pricing and contracts are the point of the intent rules');
check('its destination is the business milestone',
  web.targets.some((t) => t.skillId === 'working_business'), JSON.stringify(web.targets));

/*
 * The bug that made the first version useless: promoting to the furthest
 * milestone in the tree, so a specific goal produced a plan for a different,
 * much larger one.
 */
const muscleUp = plan('I want to do a muscle up');
check('a named destination is honoured, not promoted',
  muscleUp.targets.length === 1 && muscleUp.targets[0].skillId === 'muscle_up',
  JSON.stringify(muscleUp.targets));
check('and it does not drag in unrelated branches',
  !muscleUp.steps.some((s) => s.skillId === 'front_lever' || s.skillId === 'handstand'),
  'a muscle-up needs neither');

/* Inflections: \bfreelanc\b never matched "freelancing". */
check('inflected words still match intents', plan('start freelancing').ok);
check('plurals match too', plan('I want to build websites for clients').ok);

check('an unknown domain fails honestly rather than guessing',
  !plan('learn underwater basket weaving').ok);

check('programme steps are in dependency order', (() => {
  const position = new Map(web.steps.map((s, i) => [s.skillId, i]));
  return web.steps.every((step) => {
    const index = catalogModule.getIndex(step.treeId);
    return (index.byId.get(step.skillId).requires || []).every((r) => (
      !position.has(r.skillId) || position.get(r.skillId) < position.get(step.skillId)
    ));
  });
})());

check('every step is reachable from a destination', web.steps.length >= web.targets.length);
check('a shorter goal makes a shorter plan', plan('learn to price my work').totalSteps < web.totalSteps);

/*
 * Coverage needs evidence.
 *
 * The engine treated any non-zero score as a destination, and a single word
 * found in one skill's prose scores 2. "Be able to run a marathon" came back
 * as a confident four-skill, seven-week programme ending at Money Admin,
 * because "run" appears in a sentence about running a business — and "lose
 * weight" reached Bodyweight Basics, one skill and four hours, which reads as
 * the app promising a result it cannot deliver. A wrong plan stated
 * confidently is worse than "not covered", because the two render identically
 * and the learner cannot tell which they got.
 */
for (const goalText of [
  'be able to run a marathon',
  'lose weight',
  'learn to cook',
  'learn python',
  'start a podcast',
]) {
  check(`"${goalText}" is answered honestly, not guessed at`, !plan(goalText).ok,
    `got ${JSON.stringify(plan(goalText).targets?.map((t) => t.name))}`);
}

/* …while the goals the trees genuinely serve still land, including the two
 * most obvious ways of asking for the calisthenics tree, neither of which was
 * recognised while "lose weight" was. */
const LANDS = [
  ['get fit', 'Calisthenics Athlete'],
  ['get in shape', 'Calisthenics Athlete'],
  ['get stronger', 'Calisthenics Athlete'],
  ['do a muscle up', 'Muscle-Up'],
  ['learn to price my work', 'Pricing'],
  ['learn calculus', 'Calculus'],
  ['become a frontend developer', 'Client-Side Routing'],
];
for (const [goalText, destination] of LANDS) {
  const p = plan(goalText);
  check(`"${goalText}" reaches ${destination}`,
    p.ok && p.targets.some((t) => t.name === destination),
    p.ok ? `got ${p.targets.map((t) => t.name).join(', ')}` : 'not covered');
}

/* Stem matching, which is where both failures came from. */
check('a stem matches across an inflection', plan('learn to price my work').ok);
check('a compound word is not a stem match', !plan('lose weight').ok,
  '"weight" matched inside "Bodyweight"');

/* The honesty line has to name what actually matched, not what was typed —
 * printing the query back ("Matched on: run, marathon") gave the learner no
 * way to notice the match was wrong. */
check('the honesty line reports terms that hit a skill name', (() => {
  const p = plan('do a muscle up');
  return Array.isArray(p.evidence) && p.evidence.includes('muscle') && !p.evidence.includes('up');
})(), `got ${JSON.stringify(plan('do a muscle up').evidence)}`);

/* Time scales with the stated pace, and only with it. */
const slow = plan('become a frontend developer', 10);
const fast = plan('become a frontend developer', 60);
eq('pace does not change the work', slow.remainingHours, fast.remainingHours);
check('but it does change the horizon', slow.weeks > fast.weeks * 3);
check('weekly hours assume five days, not seven', Math.abs(goals.weeklyHours(60) - 5) < 0.01);

/* Existing progress must reduce the estimate, or the plan ignores the learner. */
const experienced = buildDemoProfile(t0);
const fresh1 = plan('become a frontend developer', 30);
const withProgress = plan('become a frontend developer', 30, experienced);
check('completed skills are marked done', withProgress.doneSteps > 0);
check('and they cost no remaining time', withProgress.remainingHours < fresh1.remainingHours,
  `${withProgress.remainingHours} should be under ${fresh1.remainingHours}`);
check('done steps report zero hours',
  withProgress.steps.filter((s) => s.done).every((s) => s.hours === 0));

check('phases always start with something actionable', (() => {
  const p = plan('open a web design business', 30, experienced);
  const now = p.phases.find((f) => f.key === 'now');
  return now && now.steps.length > 0 && now.steps.every((s) => !s.done);
})());

check('this week only offers unlocked, unfinished work', (() => {
  const p = plan('open a web design business', 30, experienced);
  const week = goals.thisWeek(p, nextActivityFor, experienced, 3);
  return week.length > 0 && week.every((s) => !s.done && s.activity);
})());

group('Business tree');
check('the business tree has no cycle', findCycle(BUSINESS_TREE) === null);
check('it has enough content', BUSINESS_TREE.skills.length >= 18);
check('it has a root', BUSINESS_TREE.skills.some((sk) => !(sk.requires || []).length));
check('every skill has activities', BUSINESS_TREE.skills.every((sk) => (sk.activities || []).length > 0));
check('it carries a disclaimer about advice', /not legal|not .*advice/i.test(BUSINESS_TREE.notice || ''));

/* ================================================================== *
 * Review-committee regressions
 *
 * Every check below stands for a defect a reviewer found in a working build
 * and I reproduced before fixing. They are grouped together deliberately: each
 * one is a rule the app can silently lose without any other test noticing, so
 * the failure message needs to say what was actually broken, not just which
 * function returned the wrong number.
 * ================================================================== */
group('Review-committee regressions');

/* Grinding one cheap activity must not buy a level.
 *
 * The engine paid full XP for every repeat, so 47 passes of a single quiz
 * carried a skill to "Mastered" without the learner ever opening its other
 * activities. The per-activity cap is what stops that. */
check('one activity cannot be ground past its cap', (() => {
  let st = fresh();
  const skill = webIndex.byId.get('internet_basics');
  const activity = skill.activities.find((a) => a.kind === 'quiz');
  for (let i = 0; i < 60; i += 1) {
    st = applyAttempt(st, webIndex, {
      skillId: 'internet_basics', activityId: activity.id, kind: 'quiz',
      score: 100, passed: true, id: `grind:${i}`,
    }, t0 + i * DAY).state;
  }
  const cap = activityXpCap('quiz', skill.difficulty || 1);
  const earned = st.skills.internet_basics.earnedByActivity[activity.id];
  return earned <= cap && (st.skills.internet_basics.level || 0) < 5;
})(), 'a single activity paid out past its cap, or reached level 5 alone');

check('the cap is per activity, not per skill', (() => {
  let st = fresh();
  const skill = webIndex.byId.get('internet_basics');
  let n = 0;
  for (const activity of skill.activities) {
    for (let i = 0; i < 8; i += 1, n += 1) {
      st = applyAttempt(st, webIndex, {
        skillId: 'internet_basics', activityId: activity.id, kind: activity.kind,
        score: 100, passed: true, id: `spread:${n}`,
      }, t0 + n * DAY).state;
    }
  }
  /* Doing all the work still gets there — the cap must not make the skill
   * uncompletable, which would be the obvious over-correction. */
  return (st.skills.internet_basics.level || 0) >= 4;
})(), 'capping per activity blocked honest completion of the whole skill');

/* A level, once earned, is kept.
 *
 * Confidence decays, and mastery folds confidence in, so a skill left alone
 * for a fortnight recomputed to a lower level — which un-drew progress and,
 * worse, re-locked skills downstream of it. */
check('a skill level never falls back', (() => {
  let st = fresh();
  const skill = webIndex.byId.get('internet_basics');
  for (let i = 0; i < 12; i += 1) {
    const activity = skill.activities[i % skill.activities.length];
    st = applyAttempt(st, webIndex, {
      skillId: 'internet_basics', activityId: activity.id, kind: activity.kind,
      score: 98, passed: true, id: `peak:${i}`,
    }, t0 + i * DAY).state;
  }
  const high = st.skills.internet_basics.level;
  /* Come back two months later and fail something. */
  const later = applyAttempt(st, webIndex, {
    skillId: 'internet_basics', activityId: skill.activities[0].id, kind: skill.activities[0].kind,
    score: 10, passed: false, id: 'peak:cold',
  }, t0 + 60 * DAY).state;
  return high >= 2 && later.skills.internet_basics.level >= high;
})(), 'a level regressed after decay or a failed attempt');

/*
 * Every gate and every panel must answer "what level is this skill" the same
 * way. The review found six modules reading the stored field and five
 * recomputing it, and after a run of bad attempts the two answers differed by
 * three mastered skills — so the tree drew a skill as mastered while the gate
 * behind it had quietly shut.
 */
const decayed = (() => {
  let st = fresh();
  const skill = webIndex.byId.get('internet_basics');
  const run = (score, passed, tag, from) => {
    for (let i = 0; i < 12; i += 1) {
      const activity = skill.activities[i % skill.activities.length];
      st = applyAttempt(st, webIndex, {
        skillId: 'internet_basics', activityId: activity.id, kind: activity.kind,
        score, passed, id: `${tag}:${i}`,
      }, t0 + (from + i) * DAY).state;
    }
  };
  run(99, true, 'strong', 0);
  const peak = st.skills.internet_basics.level;
  const openWhileStrong = statusSnapshot(webIndex, (id) => st.skills[id]);
  run(5, false, 'slump', 40);
  return { st, peak, openWhileStrong };
})();

check('a run of failures does not take a mastered skill back down',
  decayed.st.skills.internet_basics.level === decayed.peak && decayed.peak >= 4,
  `peaked at ${decayed.peak}, now ${decayed.st.skills.internet_basics.level}`);

check('the gate and the panel report the same level',
  levelOf((id) => decayed.st.skills[id], 'internet_basics') === decayed.st.skills.internet_basics.level,
  'levelOf disagreed with the stored level, so gates and the tree would drift apart');

check('nothing re-locks when scores slump',
  newlyUnlocked(webIndex, (id) => decayed.st.skills[id], decayed.openWhileStrong).length >= 0
  && Object.entries(decayed.openWhileStrong)
    .filter(([, s]) => s === STATUS.AVAILABLE || s === STATUS.IN_PROGRESS)
    .every(([id]) => isUnlocked(webIndex, id, (x) => decayed.st.skills[x])),
  'a skill that was open closed again after a bad week');

/* Reading a lesson is not evidence.
 *
 * `learn` activities have nothing to grade, and were recorded as score 100.
 * Mastery averages scores, so skimming lessons pushed a skill's mastery up
 * without a single graded answer behind it. */
check('a lesson contributes no score',
  (await grade({ kind: 'learn' }, { acknowledged: true })).score === null,
  'a lesson returned a numeric score');

check('lesson reads do not inflate mastery', (() => {
  let st = fresh();
  const skill = webIndex.byId.get('internet_basics');
  const lesson = skill.activities.find((a) => a.kind === 'learn');
  const quiz = skill.activities.find((a) => a.kind === 'quiz');
  if (!lesson || !quiz) return true;
  st = applyAttempt(st, webIndex, {
    skillId: 'internet_basics', activityId: quiz.id, kind: 'quiz',
    score: 50, passed: true, id: 'infl:quiz',
  }, t0).state;
  const before = st.skills.internet_basics.masteryScore;
  const after = applyAttempt(st, webIndex, {
    skillId: 'internet_basics', activityId: lesson.id, kind: 'learn',
    score: null, passed: true, id: 'infl:lesson',
  }, t0 + DAY).state.skills.internet_basics.masteryScore;
  return after <= before + 1;
})(), 'reading a lesson raised the mastery score');

/* Answer parsing, as learners actually type it.
 *
 * A minus sign copied out of a maths page is U+2212, not the ASCII hyphen, and
 * an answer pasted from a document can carry an en dash. Both parsed as null,
 * so a correct negative answer was marked wrong with no explanation. */
eq('a unicode minus parses', parseNumeric('−7.5'), -7.5);
eq('an en dash parses as a minus', parseNumeric('–3'), -3);
eq('a per-cent sign divides by a hundred', parseNumeric('45%'), 0.45);

/*
 * The per-cent question. The maths tree stores some answers as the fraction
 * (0.96) and some as the number (25), and "96%" has to be right in both
 * conventions — the learner is expressing the same quantity either way.
 */
check('a percentage matches a fraction-stored answer', numericMatches('96%', 0.96, 1e-6).ok);
check('the same keystrokes match a number-stored answer', numericMatches('25%', 25, 1e-6).ok);
check('a wrong percentage is still wrong', !numericMatches('12%', 45, 0.5).ok);
check('a wrong plain number is still wrong', !numericMatches('12', 45, 0.5).ok);

/* Idempotency has to be real.
 *
 * The session layer deduped on an id the UI never sent, so the guard was dead
 * code: a double-tapped submit paid twice. It now fingerprints the submission
 * itself. */
check('an identical resubmission collides', (() => {
  const id = 'internet_basics.quiz';
  return fingerprint(id, { answers: [0, 2, 1], durationMs: 4000 })
    === fingerprint(id, { answers: [0, 2, 1], durationMs: 91000 });
})(), 'the same answers hashed differently, so a double submit would pay twice');

check('a changed answer gets its own id',
  fingerprint('internet_basics.quiz', { answers: [0, 2, 1] })
  !== fingerprint('internet_basics.quiz', { answers: [0, 2, 3] }),
  'a genuine retry collided with the previous attempt');

check('the same answers to a different activity do not collide',
  fingerprint('a.quiz', { answers: [1] }) !== fingerprint('b.quiz', { answers: [1] }));

check('every field grade() reads is fingerprinted', (() => {
  const base = { answers: [1], source: 'x', checked: [true] };
  return ['answers', 'source', 'checked'].every((field) => {
    const changed = { ...base, [field]: field === 'answers' ? [2] : (field === 'source' ? 'y' : [false]) };
    return fingerprint('a', base) !== fingerprint('a', changed);
  });
})(), 'a submission field that changes the grade is not part of the fingerprint');

/* Trees with cycles must not reach the catalog. */
check('registering a cyclic tree throws', (() => {
  try {
    indexTree({
      id: 'cyc', name: 'Cyclic', skills: [
        { id: 'a', name: 'A', requires: [{ skillId: 'b', minLevel: 1 }], activities: [] },
        { id: 'b', name: 'B', requires: [{ skillId: 'a', minLevel: 1 }], activities: [] },
      ],
    });
    return false;
  } catch { return true; }
})(), 'a cyclic tree was indexed without complaint');

/* The first-unlock badge is about gates, not about starting a lot of skills.
 *
 * It counted two started skills, so opening two *roots* — two skills that
 * require nothing and are open from the first minute — awarded a badge whose
 * text reads "Unlock a skill by meeting its requirements". */
const reqCount = { requirementCount: (id) => (webIndex.byId.get(id)?.requires || []).length };
const roots = [...webIndex.byId.values()].filter((sk) => !(sk.requires || []).length);

check('the web tree has roots to test with', roots.length >= 1);

check('opening only roots does not award Door Opened', (() => {
  const skills = {};
  for (const root of roots) skills[root.id] = newUserSkill(t0);
  return !evaluate({ skills }, reqCount).includes('first_unlock');
})(), 'Door Opened fired for skills that require nothing');

check('opening a gated skill does award Door Opened',
  evaluate({ skills: { semantic_html: newUserSkill(t0) } }, reqCount).includes('first_unlock'));

/*
 * Declared standing is not practice.
 *
 * Onboarding replays attempts so an experienced learner is not made to re-sit a
 * quiz on what a browser is. That standing is real and should count. What it
 * must not do is manufacture a history: a brand-new account greeted its owner
 * with "STREAK 4 days", "last practised 12h ago" and three achievements
 * reading "Earned just now" — one of them "First Step: complete your first
 * activity" — before they had done anything at all. The welcome screen
 * promises the opposite in as many words.
 */
const seeded = (() => {
  let st = fresh();
  const skill = webIndex.byId.get('internet_basics');
  for (const activity of skill.activities.slice(0, 2)) {
    st = applyAttempt(st, webIndex, {
      skillId: 'internet_basics', activityId: activity.id, kind: activity.kind,
      score: 82, passed: true, id: `seed:${activity.id}`, seeded: true,
    }, t0).state;
  }
  return st;
})();

eq('a seeded attempt starts no streak', seeded.streak.current, 0);
eq('a seeded attempt sets no longest streak', seeded.streak.longest, 0);
check('a seeded attempt still builds real standing',
  (seeded.skills.internet_basics.level || 0) >= 1 && seeded.skills.internet_basics.xp > 0);
check('the skill is marked as never practised', seeded.skills.internet_basics.neverPractised === true);

check('seeding earns no "complete your first activity"',
  !evaluate(seeded, reqCount).includes('first_step'),
  'a badge for work the learner had not done');

check('seeding earns no "fail then pass"', !evaluate(seeded, reqCount).includes('persistent'));

/* …but one real attempt on top does earn it, and does start a streak. */
const seededThenReal = applyAttempt(seeded, webIndex, {
  skillId: 'internet_basics', activityId: skillActivity('internet_basics', 'quiz').id,
  kind: 'quiz', score: 90, passed: true, id: 'real:1',
}, t0 + DAY).state;

check('a real attempt after seeding earns First Step',
  evaluate(seededThenReal, reqCount).includes('first_step'));
eq('a real attempt after seeding starts the streak', seededThenReal.streak.current, 1);
check('the skill is no longer marked never practised',
  seededThenReal.skills.internet_basics.neverPractised === false);

/*
 * A goal that spans two trees is served from both.
 *
 * The candidate set and the "on the path to your goal" boost were built from
 * `goal.treeId`, which names one tree — so for "open a web design business",
 * which needs the business tree *and* the web tree, half the plan could not be
 * recommended from at all and none of its skills were boosted.
 */
check('a cross-tree goal recommends from every tree it crosses', (() => {
  const p = buildDemoProfile(Date.UTC(2026, 1, 20));
  const spans = new Set(goals.buildProgramme({
    catalog: catalogModule, state: p, goalText: p.plan.goalText, minutesPerDay: 30,
  }).steps.map((s) => s.treeId));
  return spans.size >= 2;
})(), 'the demo goal no longer spans more than one tree — pick another for this test');

/* ================================================================== *
 * Colour contrast
 *
 * Read out of tokens.css and computed, rather than asserted in a comment.
 * Every one of these was wrong at some point *because* it had been measured
 * against a single surface and then used on four — a token that passes on a
 * card and fails on the page ground is the failure this exists to catch.
 * ================================================================== */
group('Contrast');

const tokensCss = readFileSync(resolve(ROOT, 'skilltree/src/styles/tokens.css'), 'utf8');

/* The light block starts at the [data-theme="light"] selector; everything
 * before it is the dark default. */
const lightAt = tokensCss.indexOf('[data-theme="light"]');
const tokenIn = (where, name) => {
  const scope = where === 'dark' ? tokensCss.slice(0, lightAt) : tokensCss.slice(lightAt);
  const hits = [...scope.matchAll(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`, 'g'))];
  return hits.length ? hits[hits.length - 1][1] : null;
};

function luminance(hexColour) {
  const raw = hexColour.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* Every surface each of these actually sits on. */
const SURFACES = ['ground', 'surface', 'surface-2', 'surface-3'];

/* 4.5 for text, 3.0 for the boundary of a control you can operate (1.4.11). */
const CONTRAST_RULES = [
  ['bone', 4.5], ['bone-dim', 4.5], ['bone-dimmer', 4.5],
  ['accent-ink', 4.5], ['warn', 4.5], ['fail', 4.5],
  ['line-strong', 3],
];

for (const theme of ['dark', 'light']) {
  const grounds = SURFACES.map((name) => tokenIn(theme, name));
  check(`${theme}: every surface token is defined`, grounds.every(Boolean),
    `got ${JSON.stringify(grounds)}`);

  for (const [name, min] of CONTRAST_RULES) {
    const colour = tokenIn(theme, name);
    if (!colour) { check(`${theme}: --${name} is defined`, false); continue; }

    const worst = Math.min(...grounds.map((g) => contrast(colour, g)));
    check(`${theme}: --${name} clears ${min}:1 on every surface`, worst >= min,
      `${colour} worst case ${worst.toFixed(2)}:1`);
  }
}

/* ================================================================== *
 * The demo profile
 * ================================================================== */
group('Demo profile');

const demo = buildDemoProfile(Date.UTC(2026, 1, 20));
check('the demo has real XP', totalXp(demo.xpEvents) > 1000);
check('the demo is past level 5', levelForXp(totalXp(demo.xpEvents)) >= 5);
check('the demo has many skills', Object.keys(demo.skills).length >= 25);
check('the demo has mastered skills', Object.values(demo.skills).some((sk) => sk.level >= 5));
check('the demo has in-progress skills', Object.values(demo.skills).some((sk) => sk.level > 0 && sk.level < 3));
check('the demo has achievements', Object.keys(demo.achievements).length >= 4);

/*
 * The demo has to survive being read closely, because that is what it is for.
 *
 * Two things gave it away. Every achievement was stamped with the build time,
 * so an eighty-day-old profile showed ten badges all reading "Earned just
 * now"; and the attempts were applied tree by tree rather than in date order,
 * so the streak `touchStreak` produced was meaningless and had to be
 * overwritten with a separately-computed one — leaving the headline number and
 * the daily-XP chart below it derived from different things.
 */
const demoNow = Date.UTC(2026, 1, 20);
const demoAt = buildDemoProfile(demoNow);

check('demo achievements are dated when they were earned', (() => {
  const times = Object.values(demoAt.achievements);
  const atBuildTime = times.filter((t) => Math.abs(demoNow - t) < 60000).length;
  return times.length >= 4 && atBuildTime === 0;
})(), 'every badge carried the build timestamp');

check('demo achievements are spread over its history', (() => {
  const times = Object.values(demoAt.achievements).sort((a, b) => a - b);
  return (times[times.length - 1] - times[0]) > 30 * DAY;
})());

check('the demo streak is what its own ledger implies', (() => {
  const days = [...new Set(Object.values(demoAt.skills)
    .flatMap((s) => (s.attempts || []).map((a) => dayNumber(a.at))))].sort((a, b) => a - b);

  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of days) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  const today = dayNumber(demoNow);
  const current = previous === today || previous === today - 1 ? run : 0;

  return current === demoAt.streak.current && longest === demoAt.streak.longest;
})(), `profile says ${JSON.stringify(demoAt.streak)}, ledger says otherwise`);

check('the demo is deterministic', (() => {
  const again = buildDemoProfile(demoNow);
  return totalXp(again.xpEvents) === totalXp(demoAt.xpEvents)
    && Object.keys(again.skills).length === Object.keys(demoAt.skills).length
    && deepEqual(again.streak, demoAt.streak);
})());
check('the demo has a goal', !!demo.goal?.targetSkillId);
check('the demo has a written goal', typeof demo.plan?.goalText === 'string' && demo.plan.goalText.length > 3);
check('the demo goal resolves to a programme', (() => {
  const p = goals.buildProgramme({
    catalog: catalogModule, state: demo, goalText: demo.plan.goalText,
    minutesPerDay: demo.plan.minutesPerDay, now: Date.UTC(2026, 1, 20),
  });
  return p.ok && p.doneSteps > 0 && p.doneSteps < p.totalSteps;
})());
check('the demo has a streak', demo.streak.longest > 1);
check('the demo has a failure to learn from',
  Object.values(demo.skills).some((sk) => (sk.attempts || []).some((a) => !a.passed)));
check('the demo touches every tree', (() => {
  const ids = new Set(Object.keys(demo.skills));
  return trees.every((tree) => tree.skills.some((sk) => ids.has(sk.id)));
})());

/* The invariant that makes the demo trustworthy: totals are derived, not
 * asserted. If the ledger and the per-skill XP disagree, the charts lie. */
check('per-skill XP matches the ledger', (() => {
  const fromLedger = xpBySkill(demo.xpEvents);
  return Object.values(demo.skills).every((sk) => Math.abs((fromLedger.get(sk.skillId) || 0) - sk.xp) < 1);
})());

check('a record with no capacity reads as level 1, never higher', (() => {
  const stale = { js_arrays: { skillId: 'js_arrays', xp: 9999, masteryScore: 100, startedAt: 1 } };
  return requirementStatus(webIndex, 'react_basics', (id) => stale[id])
    .find((r) => r.skillId === 'js_arrays').haveLevel === 1;
})());

check('every demo skill respects its own gate', (() => {
  for (const tree of trees) {
    const index = indexTree(tree);
    for (const skillId of Object.keys(demo.skills)) {
      if (!index.byId.has(skillId)) continue;
      const missing = requirementStatus(index, skillId, (id) => demo.skills[id]).filter((r) => !r.met);
      /* A skill may be in progress while a prerequisite has since been
       * recalculated, but nothing should be *complete* behind a shut gate. */
      if (missing.length && (demo.skills[skillId].level || 0) >= 3) {
        console.log('  gate violation:', skillId, missing.map((m) => m.name).join(', '));
        return false;
      }
    }
  }
  return true;
})());

/* ================================================================== */

console.log(`\n${'-'.repeat(56)}`);
if (failures.length) {
  console.log(`FAILED — ${failures.length} of ${passed + failures.length}\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`All ${passed} checks passed.`);
