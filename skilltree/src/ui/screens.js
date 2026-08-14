/*
 * screens.js — tree, explore, progress, achievements, profile and settings.
 *
 * Grouped in one module because each is a single render function over the same
 * session data, and six files of thirty lines each would be filing rather than
 * structure. The two screens with real behaviour behind them — the graph and
 * the activity runner — have their own modules.
 */

import { h, clear, num, ago, sheet, announce, reduceMotion } from '../core/dom.js';
import { icon, brandMark } from './icons.js';
import * as session from '../core/session.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { mountTree } from './tree.js';
import { openSkill } from './skillpanel.js';
import { xpChart, radarChart } from './charts.js';
import { allTrees, getTree, getIndex, searchSkills, findSkill } from '../data/catalog.js';
import { statusOf, STATUS } from '../domain/unlock.js';
import { xpByDay, totalXp, xpSince } from '../domain/xp.js';
import { ACHIEVEMENTS } from '../domain/achievements.js';
import { INTENSITY } from '../domain/missions.js';
import { PROVIDERS, loadKey, saveKey, keyLooksValid, saveChoice, loadChoice, hasAnyKey } from '../ai/provider.js';
import { generateTree, scaffoldActivities } from '../ai/generator.js';
import { applyTheme } from './shell.js';
import { toast } from './toast.js';

/* ------------------------------------------------------------------ *
 * Tree
 * ------------------------------------------------------------------ */

let mounted = null;

export function renderTree(host, params, query) {
  const state = session.freshProfile();
  const trees = allTrees();
  const treeId = params[0] && getTree(params[0]) ? params[0] : (state.goal?.treeId || trees[0].id);
  const tree = getTree(treeId);

  const goalPath = state.goal?.treeId === treeId
    ? session.goalPathFor(state.goal).map((s) => s.skillId)
    : [];

  const page = h('div.wrap.stack');

  /* `compact` drops the tagline and shrinks the title on a phone, where the
   * canvas below is what the screen is for. */
  page.appendChild(h('div.page-head.compact',
    h('div',
      h('h1', tree.name),
      h('p', tree.tagline)),
    h('div.tree-switch.row', { style: { gap: 'var(--s2)' } },
      ...trees.map((t) => h('button.chip', {
        class: t.id === treeId ? 'on' : '',
        onclick: () => go(`tree/${t.id}`),
      }, t.name)))));

  /* A tree-level notice — the calisthenics safety framing (§40) — shown once,
   * at the top, rather than repeated inside every node. */
  if (tree.notice) {
    /*
     * A real button, not a click handler on a div. On a phone this is clamped
     * to two lines, and on the calisthenics tree the hidden remainder is the
     * injury-safety framing — reachable only by mouse, with no affordance
     * saying it expanded.
     */
    const noticeText = h('span.tree-notice', tree.notice);
    const toggle = h('button.notice.notice-toggle', {
      type: 'button',
      'aria-expanded': 'false',
      onclick: () => {
        const open = noticeText.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      },
    }, icon('info', { size: 16 }), noticeText);
    page.appendChild(toggle);
  }

  /* Search across every tree, not just this one. */
  const results = h('div');
  const search = h('input.input', {
    type: 'search',
    placeholder: 'Search skills…',
    'aria-label': 'Search skills',
    oninput: (e) => renderSearch(results, e.target.value, host),
  });
  page.appendChild(h('div.row.tree-search', { style: { gap: 'var(--s2)' } },
    h('span', { style: { color: 'var(--bone-dimmer)', display: 'flex' } }, icon('search', { size: 17 })),
    search));
  page.appendChild(results);

  const canvasHost = h('div');
  page.appendChild(canvasHost);

  /*
   * The goal path, taken from the one programme the dashboard and plan use.
   *
   * This card previously walked its own single-target path and reported "2 / 19"
   * while the dashboard reported "9 / 27" for the same goal at the same moment.
   * A graph can only draw the skills in the tree it is drawing, so the count is
   * scoped — and now says it is, instead of looking like a second opinion on
   * the same number.
   */
  const inTree = session.programmeInTree(treeId);
  if (inTree && inTree.steps.length) {
    const scoped = inTree.steps.length !== inTree.total;
    page.appendChild(h('div.card',
      h('div.card-head',
        h('span.card-title', scoped ? 'Your goal path, in this tree' : 'Your goal path'),
        h('span.card-note.num', `${inTree.done} / ${inTree.steps.length}`)),
      h('div.row.wrap', { style: { gap: 'var(--s2)' } },
        ...inTree.steps.map((step) => h('button.chip', {
          class: step.done ? 'on' : '',
          onclick: () => openSkill(step.skillId, { onChange: () => renderTree(host, params, query) }),
        }, step.skill.name))),
      scoped
        ? h('div.card-note', { style: { marginTop: 'var(--s3)' } },
          `${inTree.total} skills in the whole plan — the rest are in other trees.`)
        : null));
  }

  clear(host);
  host.appendChild(page);

  if (mounted) mounted.destroy();
  mounted = mountTree(canvasHost, {
    treeId,
    state,
    goalPath,
    /* Where to open the view when the tree is too wide to frame — see fit(). */
    focusId: query?.skill || session.currentFocus(1)[0]?.skillId || null,
    onSelect: (skillId) => openSkill(skillId, { onChange: () => renderTree(host, params, query) }),
  });

  /* Deep link from a result or from an activity's back button. */
  const target = query?.skill;
  if (target && mounted) window.requestAnimationFrame(() => mounted.focusSkill(target));
}

function renderSearch(host, query, screenHost) {
  clear(host);
  const q = String(query || '').trim();
  if (q.length < 2) return;

  const hits = searchSkills(q, 8);
  if (!hits.length) {
    host.appendChild(h('div.card.quiet', h('div.card-note', `Nothing matching "${q}".`)));
    return;
  }

  const state = session.freshProfile();
  host.appendChild(h('div.card', h('div.list', ...hits.map(({ skill, tree }) => {
    const index = getIndex(tree.id);
    const status = statusOf(index, skill.id, (id) => state.skills[id]);
    return h('button.list-item', {
      onclick: () => openSkill(skill.id, { onChange: () => screenHost && renderTree(host, [tree.id], {}) }),
    },
    h('div.grow',
      h('div.title', skill.name),
      h('div.sub', `${tree.name} · ${skill.category || ''}`)),
    h('span.chip', { class: status === STATUS.LOCKED ? '' : 'on' }, statusLabel(status)));
  }))));
}

function statusLabel(status) {
  return {
    [STATUS.LOCKED]: 'Locked',
    [STATUS.AVAILABLE]: 'Ready',
    [STATUS.IN_PROGRESS]: 'In progress',
    [STATUS.COMPLETED]: 'Complete',
    [STATUS.MASTERED]: 'Mastered',
  }[status] || '';
}

/* ------------------------------------------------------------------ *
 * Explore
 * ------------------------------------------------------------------ */

export function renderExplore(host, params, query = {}) {
  const state = session.freshProfile();
  const page = h('div.wrap.stack.loose');

  const trees = allTrees();
  page.appendChild(h('div.page-head',
    h('div',
      h('h1', 'Explore'),
      /* Counted, not written down. The sentence said "three trees are built in"
       * beside four tree cards, and would have gone on saying it. */
      h('p', `${trees.length} trees are built in. You can also describe something you want to learn and have one generated.`))));

  page.appendChild(h('div.grid.cols-2', ...trees.map((tree) => {
    const index = getIndex(tree.id);
    const started = tree.skills.filter((s) => state.skills[s.id]).length;
    const mastered = tree.skills.filter((s) => (state.skills[s.id]?.level || 0) >= 5).length;

    return h('div.card',
      h('div.row.between', { style: { marginBottom: 'var(--s3)' } },
        h('span.chip', tree.category),
        started ? h('span.chip.on', `${started} started`) : null),
      h('h3', { style: { fontSize: '17px', marginBottom: 'var(--s1)' } }, tree.name),
      h('p', { style: { color: 'var(--bone-dim)', fontSize: '13.5px' } }, tree.tagline),
      h('div.row.between', { style: { marginTop: 'var(--s4)' } },
        h('span.card-note.num', `${tree.skills.length} skills${mastered ? ` · ${mastered} mastered` : ''}`),
        h('button.btn.small', { onclick: () => go(`tree/${tree.id}`) }, 'Open')));
  })));

  /* ---- generate ---- */
  const genHost = h('div');
  const input = h('input.input', {
    type: 'text',
    placeholder: 'e.g. game development, bread baking, music theory',
    'aria-label': 'What do you want to learn?',
    onkeydown: (e) => { if (e.key === 'Enter') runGeneration(input.value, genHost, host); },
  });

  const generateBtn = h('button.btn.primary', { onclick: () => runGeneration(input.value, genHost, host) },
    icon('sparkle', { size: 15 }), 'Generate');

  page.appendChild(h('div.card.feature',
    h('div.eyebrow', 'Build your own'),
    h('h2', 'Describe what you want to learn.'),
    h('p', { style: { color: 'var(--bone-dim)', margin: 'var(--s2) 0 var(--s4)' } },
      hasAnyKey()
        ? 'A tree is generated, checked for missing prerequisites and circular dependencies, then shown to you before anything is added.'
        : 'This is the one feature that needs an AI key. Everything else in SkillTree works without one.'),
    h('div.row.wrap', { style: { gap: 'var(--s2)' } }, input, generateBtn),
    genHost));

  clear(host);
  host.appendChild(page);

  /* Arrived from the goal screen with a goal the built-in trees do not cover.
   * Carry it in, put it in the field, and scroll to it — rather than handing
   * back a blank page and expecting it to be retyped. */
  if (query.generate) {
    input.value = query.generate;
    input.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    input.focus();
  }
}

async function runGeneration(text, host, screenHost) {
  const goal = String(text || '').trim();
  clear(host);

  if (goal.length < 3) {
    host.appendChild(h('div.notice.warn', icon('alert', { size: 16 }), h('span', 'Say a little more about what you want to learn.')));
    return;
  }

  host.appendChild(h('div.row', { style: { gap: 'var(--s2)', marginTop: 'var(--s4)', color: 'var(--bone-dim)' } },
    icon('sparkle', { size: 16 }), h('span', 'Designing a tree…')));
  announce('Generating a skill tree');

  const result = await generateTree(goal);
  clear(host);

  if (!result.ok) {
    host.appendChild(h('div.notice.fail', icon('alert', { size: 16 }), h('span', result.error)));
    if (result.kind === 'no_key') {
      host.appendChild(h('button.btn.small', { style: { marginTop: 'var(--s3)' }, onclick: () => go('settings') }, 'Open settings'));
    }
    return;
  }

  /* Review before accepting (§13): the learner sees what was produced, and any
   * repairs the validator had to make, before it joins their catalogue. */
  const preview = h('div', { style: { marginTop: 'var(--s4)' } },
    h('div.card-title', { style: { marginBottom: 'var(--s2)' } }, `${result.tree.name} — ${result.tree.skills.length} skills`),
    h('div.row.wrap', { style: { gap: 'var(--s2)', marginBottom: 'var(--s4)' } },
      ...result.tree.skills.slice(0, 14).map((s) => h('span.chip', s.name)),
      result.tree.skills.length > 14 ? h('span.card-note', `+${result.tree.skills.length - 14} more`) : null));

  if (result.warnings?.length) {
    preview.appendChild(h('div.notice.warn',
      icon('alert', { size: 16 }),
      h('div',
        h('div', { style: { fontWeight: '580', marginBottom: '4px' } }, 'Repaired before accepting:'),
        ...result.warnings.slice(0, 5).map((w) => h('div', { style: { fontSize: '12.5px' } }, w)))));
  }

  preview.appendChild(h('div.row.wrap', { style: { gap: 'var(--s2)', marginTop: 'var(--s4)' } },
    h('button.btn.primary', {
      onclick: () => {
        for (const skill of result.tree.skills) skill.activities = scaffoldActivities(skill);
        const accepted = session.acceptGeneratedTree(result.tree);
        if (!accepted.ok) {
          host.appendChild(h('div.notice.fail', icon('alert', { size: 16 }), h('span', accepted.error)));
          return;
        }
        if (!accepted.persisted) {
          toast('Added for this session — storage is full, so it will not survive a reload.', { duration: 6000 });
        }
        go(`tree/${result.tree.id}`);
      },
    }, 'Add this tree'),
    h('button.btn', { onclick: () => clear(host) }, 'Discard')));

  host.appendChild(preview);
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

export function renderProgress(host) {
  const state = session.freshProfile();
  const overview = session.overview();
  const page = h('div.wrap.stack.loose');

  page.appendChild(h('div.page-head', h('div', h('h1', 'Progress'))));

  const attempts = Object.values(state.skills).flatMap((s) => s.attempts || []);

  /* Empty state with a way out, not a blank screen (§63). */
  if (!attempts.length) {
    page.appendChild(h('div.card', h('div.empty',
      icon('chart', { size: 28 }),
      h('h3', 'Nothing to chart yet'),
      h('p', 'Complete your first challenge and this fills in — XP over time, mastery by area, and how consistent you have been.'),
      h('button.btn.primary', { onclick: () => go('tree') }, 'Start learning'))));
    clear(host);
    host.appendChild(page);
    return;
  }

  const week = Date.now() - 7 * 86400000;
  const month = Date.now() - 30 * 86400000;
  const graded = attempts.filter((a) => Number.isFinite(a.score));
  const avg = graded.length ? Math.round(graded.reduce((s, a) => s + a.score, 0) / graded.length) : 0;

  page.appendChild(h('div.grid.cols-3.stats',
    stat('Total XP', num(overview.xp)),
    stat('Level', String(overview.level)),
    stat('Skills started', String(overview.skillsStarted)),
    stat('Mastered', String(overview.skillsMastered)),
    stat('Average score', `${avg}%`),
    stat('Current streak', `${overview.streak.current}d`),
    stat('Longest streak', `${overview.streak.longest}d`),
    stat('XP this week', num(xpSince(state.xpEvents, week))),
    stat('XP this month', num(xpSince(state.xpEvents, month)))));

  page.appendChild(h('div.card',
    h('div.card-head',
      h('span.card-title', 'Daily XP'),
      h('span.card-note', 'Last 30 days')),
    xpChart(xpByDay(state.xpEvents, 30))));

  /* Radar across areas (§19). Areas are tree categories, scored as the mean
   * mastery of started skills — which is a fair reading of "how strong am I
   * here" and does not punish a large tree for being large. */
  const areas = areaScores(state);
  if (areas.length >= 3) {
    page.appendChild(h('div.card',
      h('div.card-head',
        h('span.card-title', 'Areas'),
        h('span.card-note', 'Mean mastery, 0–100, of skills you have started')),
      radarChart(areas)));
  }

  clear(host);
  host.appendChild(page);
}

function areaScores(state) {
  const buckets = new Map();
  for (const [skillId, progress] of Object.entries(state.skills)) {
    const found = findSkill(skillId);
    if (!found) continue;
    const key = found.tree.category || found.tree.name;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(progress.masteryScore || 0);
  }
  return [...buckets.entries()]
    .map(([label, values]) => ({ label, value: values.reduce((a, b) => a + b, 0) / values.length }))
    .sort((a, b) => b.value - a.value);
}

function stat(label, value) {
  return h('div.card', h('div.stat', h('span.k', label), h('span.v', value)));
}

/* ------------------------------------------------------------------ *
 * Achievements
 * ------------------------------------------------------------------ */

export function renderAchievements(host) {
  const state = session.freshProfile();
  const earned = state.achievements || {};
  const page = h('div.wrap.stack.loose');

  const got = ACHIEVEMENTS.filter((a) => earned[a.id]);
  const rest = ACHIEVEMENTS.filter((a) => !earned[a.id]);

  page.appendChild(h('div.page-head',
    h('div',
      h('h1', 'Achievements'),
      h('p', `${got.length} of ${ACHIEVEMENTS.length} earned.`))));

  const card = (a, isEarned) => h('div.card', {
    /* Dashed border and a dimmed icon rather than opacity on the whole card:
     * fading it took the description text to 2.2:1. */
    class: isEarned ? '' : 'quiet locked',
  },
  h('div.row', { style: { gap: 'var(--s3)', alignItems: 'flex-start' } },
    h('span', { style: { color: isEarned ? 'var(--accent-ink)' : 'var(--bone-dimmer)', display: 'flex' } },
      icon(isEarned ? 'award' : 'lock', { size: 20 })),
    h('div.grow',
      h('div', { style: { fontWeight: '600', fontSize: '14px' } }, a.name),
      h('div.card-note', a.description),
      isEarned ? h('div.card-note', { style: { marginTop: '4px', color: 'var(--accent-ink)' } }, `Earned ${ago(earned[a.id])}`) : null),
    h('span.chip', a.tier)));

  if (got.length) {
    page.appendChild(h('div',
      h('div.eyebrow', 'Earned'),
      h('div.grid.cols-2', ...got.map((a) => card(a, true)))));
  }

  page.appendChild(h('div',
    h('div.eyebrow', got.length ? 'Still to come' : 'Available'),
    h('div.grid.cols-2', ...rest.map((a) => card(a, false)))));

  clear(host);
  host.appendChild(page);
}

/* ------------------------------------------------------------------ *
 * Profile
 * ------------------------------------------------------------------ */

export function renderProfile(host) {
  const state = session.freshProfile();
  const overview = session.overview();
  const page = h('div.wrap.stack.loose');

  const top = Object.values(state.skills)
    .map((s) => ({ ...s, skill: findSkill(s.skillId)?.skill }))
    .filter((s) => s.skill)
    .sort((a, b) => (b.level - a.level) || (b.masteryScore - a.masteryScore))
    .slice(0, 8);

  page.appendChild(h('div.page-head',
    h('div',
      h('h1', state.name || 'Your profile'),
      h('p', `Joined ${new Date(state.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`))));

  /* The character sheet (§20) — the numbers that describe who this learner is,
   * set in the monospace face so it reads as a record rather than marketing. */
  page.appendChild(h('div.card.feature',
    h('div.grid.cols-3.stats',
      h('div.stat.big', h('span.k', 'Level'), h('span.v', String(overview.level))),
      h('div.stat.big', h('span.k', 'Total XP'), h('span.v', num(overview.xp))),
      h('div.stat.big', h('span.k', 'Mastered'), h('span.v', String(overview.skillsMastered))),
      h('div.stat.big', h('span.k', 'Achievements'), h('span.v', String(overview.achievements))),
      h('div.stat.big', h('span.k', 'Streak'), h('span.v', `${overview.streak.current}d`)),
      h('div.stat.big', h('span.k', 'Longest'), h('span.v', `${overview.streak.longest}d`)))));

  /* The same programme the dashboard, plan and tree read — see
   * session.programme. This card used to compute its own and disagree. */
  const plan = session.programme();
  if (plan) {
    const pct = plan.totalSteps ? (plan.doneSteps / plan.totalSteps) * 100 : 0;
    page.appendChild(h('div.card',
      h('div.card-head',
        h('span.card-title', 'Goal'),
        h('span.card-note.num', `${plan.doneSteps} / ${plan.totalSteps}`)),
      h('div', { style: { fontSize: '15px', fontWeight: '560', marginBottom: 'var(--s2)' } },
        state.plan.goalText),
      h('div.bar.tall', h('i', { style: { width: `${pct}%` } }))));
  }

  if (top.length) {
    page.appendChild(h('div.card',
      h('div.card-head', h('span.card-title', 'Top skills')),
      h('div.list', ...top.map((s) => h('button.list-item', {
        onclick: () => openSkill(s.skillId, { onChange: () => renderProfile(host) }),
      },
      h('div.grow',
        h('div.title', s.skill.name),
        h('div.sub', `Mastery ${Math.round(s.masteryScore)}% · confidence ${s.confidence}%`)),
      h('span.lvl', { class: s.level >= 5 ? 'on' : '' }, `Lv.${s.level}`))))));
  } else {
    page.appendChild(h('div.card', h('div.empty',
      icon('user', { size: 28 }),
      h('h3', 'No skills yet'),
      h('p', 'Your profile fills in as you work through the trees.'),
      h('button.btn.primary', { onclick: () => go('tree') }, 'Open the tree'))));
  }

  clear(host);
  host.appendChild(page);
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export function renderSettings(host) {
  const state = session.freshProfile();
  const page = h('div.wrap.stack.loose');

  page.appendChild(h('div.page-head', h('div', h('h1', 'Settings'))));

  /* ---- profile ---- */
  const saveName = () => { store.patch({ name: nameInput.value.trim() }); announce('Name saved'); renderSettings(host); };
  const nameInput = h('input.input', {
    type: 'text',
    value: state.name,
    'aria-label': 'Your name',
    onkeydown: (e) => { if (e.key === 'Enter') saveName(); },
  });
  page.appendChild(h('div.card',
    h('div.card-head', h('span.card-title', 'Profile')),
    h('div.stack.tight',
      h('div.field',
        /* Wrapping the control rather than a `for` pointing at an id nothing
         * had — tapping the label now focuses the field, which on a phone is
         * the largest hit area a 40px input has. */
        h('label', 'Name', nameInput)),
      h('div.row.wrap', { style: { gap: 'var(--s2)' } },
        h('button.btn.small', { onclick: saveName }, 'Save'),
        ...store.listProfiles().filter((p) => p.id !== state.id).map((p) => h('button.chip', {
          onclick: () => { store.switchProfile(p.id); go('dashboard'); },
        }, `Switch to ${p.name || 'Unnamed'}`)),
        h('button.chip', { onclick: () => newProfilePrompt(host) }, '+ New profile')))));

  /* ---- appearance ---- */
  page.appendChild(h('div.card',
    h('div.card-head', h('span.card-title', 'Appearance')),
    h('div.row.wrap', { style: { gap: 'var(--s2)' } },
      /* "Light mode" rather than "Light", because the intensity control below
       * also has a "Light" — two different meanings of the same word on one
       * screen is a real ambiguity, not just a test-selector problem. */
      ...[['dark', 'Dark mode', 'moon'], ['light', 'Light mode', 'sun']].map(([value, label, ic]) => h('button.btn.small', {
        class: state.settings.theme === value ? 'primary' : '',
        onclick: () => { store.patchSettings({ theme: value }); applyTheme(value); renderSettings(host); },
      }, icon(ic, { size: 15 }), label)))));

  /* ---- intensity ---- */
  page.appendChild(h('div.card',
    h('div.card-head',
      h('span.card-title', 'Daily missions'),
      h('span.card-note', 'How much the app asks of you each day')),
    h('div.stack.tight', ...Object.entries(INTENSITY).map(([key, meta]) => h('button.pick', {
      'aria-pressed': String(state.settings.intensity === key),
      onclick: () => {
        /* Clear today's missions so the new intensity takes effect now rather
         * than tomorrow — a setting that appears to do nothing is a bug. */
        store.update((p) => ({ ...p, settings: { ...p.settings, intensity: key }, missions: null }));
        renderSettings(host);
      },
    },
    h('span.pick-mark'),
    h('span.pick-body', meta.label, h('small', meta.blurb)))))));

  /* ---- AI ---- */
  page.appendChild(aiCard(host));

  /* ---- data ---- */
  page.appendChild(h('div.card',
    h('div.card-head',
      h('span.card-title', 'Your data'),
      h('span.card-note', store.persists() ? 'Saved on this device' : 'Not being saved')),
    h('p', { style: { fontSize: '13px', color: 'var(--bone-dim)' } },
      'SkillTree has no server. Everything lives in this browser, which means clearing site data erases it — export a copy if it matters.'),
    h('div.row.wrap', { style: { gap: 'var(--s2)' } },
      h('button.btn.small', { onclick: () => downloadExport() }, 'Export'),
      h('button.btn.small', { onclick: () => importPrompt(host) }, 'Import'),
      h('button.btn.small', {
        style: { color: 'var(--fail)' },
        onclick: () => confirmReset(host),
      }, 'Erase everything'))));

  clear(host);
  host.appendChild(page);
}

function aiCard(host) {
  const choice = loadChoice();
  const card = h('div.card',
    h('div.card-head',
      h('span.card-title', 'AI'),
      h('span.card-note', hasAnyKey() ? 'Connected' : 'Optional')),
    h('p', { style: { fontSize: '13px', color: 'var(--bone-dim)' } },
      'Used for the coach and for generating new trees. Progression, XP, unlocks and grading are all deterministic and work without a key.'));

  for (const provider of PROVIDERS) {
    const saveThisKey = () => {
      saveKey(provider.id, input.value.trim());
      if (input.value.trim()) saveChoice(provider.id, provider.defaultModel);
      announce(`${provider.name} key saved`);
      renderSettings(host);
    };

    const input = h('input.input', {
      type: 'password',
      value: loadKey(provider.id),
      placeholder: provider.keyHint,
      'aria-label': `${provider.name} API key`,
      autocomplete: 'off',
      onkeydown: (e) => { if (e.key === 'Enter') saveThisKey(); },
    });

    const status = h('span.card-note');
    const refreshStatus = () => {
      const key = loadKey(provider.id);
      status.textContent = key ? (keyLooksValid(provider.id, key) ? 'Saved' : 'Saved — that does not look like a valid key') : '';
      status.className = `card-note${key && !keyLooksValid(provider.id, key) ? ' chip warn' : ''}`;
    };
    refreshStatus();

    card.appendChild(h('div.field', { style: { marginTop: 'var(--s3)' } },
      h('label', provider.name, h('span.sr-only', ' API key')),
      h('div.row', { style: { gap: 'var(--s2)' } },
        input,
        h('button.btn.small', { onclick: saveThisKey }, 'Save')),
      status));
  }

  if (choice) {
    const provider = PROVIDERS.find((p) => p.id === choice.providerId);
    if (provider) {
      card.appendChild(h('div.field', { style: { marginTop: 'var(--s3)' } },
        h('label', 'Model'),
        h('select.input', {
          'aria-label': `${provider.name} model`,
          onchange: (e) => saveChoice(provider.id, e.target.value),
        }, ...provider.models.map((m) => h('option', { value: m, selected: m === choice.model }, m)))));
    }
  }

  card.appendChild(h('div.notice', { style: { marginTop: 'var(--s4)' } },
    icon('info', { size: 16 }),
    h('span', 'Keys are stored in this browser and sent straight to the provider from your device. There is no server in between — which also means any script on this page could read them.')));

  return card;
}

function newProfilePrompt(host) {
  const input = h('input.input', { type: 'text', placeholder: 'Name', 'data-autofocus': '' });
  const { close } = sheet(h('div.stack',
    h('h2', 'New profile'),
    h('p', { style: { color: 'var(--bone-dim)', fontSize: '13.5px' } },
      'A separate set of progress on this device. Useful for trying the app fresh without losing what you have.'),
    input,
    h('button.btn.primary.wide', {
      onclick: () => {
        store.createProfile(input.value.trim() || 'Learner');
        close();
        go('onboarding');
      },
    }, 'Create')), { label: 'New profile' });
}

function downloadExport() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `skilltree-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Revoked on the next tick — immediately after click() the download may not
   * have started, and Firefox in particular cancels it. */
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function importPrompt(host) {
  const input = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const result = store.importJson(await file.text());
    if (!result.ok) { announce(result.error); window.alert(result.error); return; }
    /* An export can carry the generated trees it depends on. They are stored
     * by the import but not registered, so the catalogue has to be rebuilt
     * before any screen tries to resolve a skill from one. */
    if (result.trees?.length) session.restoreTrees();
    go('dashboard');
  });
  document.body.appendChild(input);
  input.click();
  input.remove();
}

function confirmReset(host) {
  const { close } = sheet(h('div.stack',
    h('h2', 'Erase everything?'),
    h('p', { style: { color: 'var(--bone-dim)' } },
      'Every profile, all XP, all progress. There is no server copy, so this cannot be undone.'),
    h('div.row', { style: { gap: 'var(--s2)' } },
      h('button.btn', { 'data-autofocus': '', onclick: () => close() }, 'Cancel'),
      h('button.btn', {
        style: { color: 'var(--fail)', borderColor: 'var(--fail)' },
        onclick: () => { store.resetAll(); close(); window.location.reload(); },
      }, 'Erase'))), { label: 'Confirm erase' });
}

