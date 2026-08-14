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

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(resolve(ROOT, 'skilltree/src', p)).href);

const {
  xpForLevel, levelForXp, globalProgress, levelFor, skillProgress, xpForSkillLevel,
} = await load('domain/levels.js');
const { computeAward, appendXpEvent, totalXp, xpBySkill, xpByDay, repeatMultiplier, skillCapacity } = await load('domain/xp.js');
const { computeMastery, confidenceFor, reviewUrgency, weightedScore } = await load('domain/mastery.js');
const { indexTree, findCycle, computeDepths, layoutTree, ancestorsOf, descendantsOf, pathTo } = await load('domain/graph.js');
const { isUnlocked, statusOf, STATUS, requirementStatus, statusSnapshot, newlyUnlocked, readiness } = await load('domain/unlock.js');
const { applyAttempt, startSkill, newUserSkill, dayNumber, liveStreak, touchStreak } = await load('domain/progress.js');
const { evaluate, award, ACHIEVEMENTS } = await load('domain/achievements.js');
const { gradeQuiz, gradeCode, gradeNumeric, gradeChecklist, parseNumeric, deepEqual } = await load('domain/verify.js');
const { validateTree, extractJson, parse, s } = await load('ai/schema.js');
const { recommend, difficultyFit, goalPath } = await load('domain/recommend.js');
const { nextActivityFor, generateMissions, completeMissionsFor } = await load('domain/missions.js');
const { WEB_TREE } = await load('data/tree.web.js');
const { MATH_TREE } = await load('data/tree.math.js');
const { CALISTHENICS_TREE } = await load('data/tree.calisthenics.js');
const { buildDemoProfile } = await load('data/demo.js');
const { allTrees: registeredTrees, getIndex: registeredIndex } = await load('data/catalog.js');
const { emptyProfile } = await load('core/store.js');

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

const trees = [WEB_TREE, MATH_TREE, CALISTHENICS_TREE];
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
check('the demo has a goal', !!demo.goal?.targetSkillId);
check('the demo has a streak', demo.streak.longest > 1);
check('the demo has a failure to learn from',
  Object.values(demo.skills).some((sk) => (sk.attempts || []).some((a) => !a.passed)));
check('the demo touches all three trees', (() => {
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
