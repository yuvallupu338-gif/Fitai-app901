/*
 * catalog.js — the registry of every tree the app knows about, and the only
 * place that turns raw tree data into an indexed graph.
 *
 * Indexing is memoised. Building the maps for a 33-node tree is fast, but the
 * tree screen calls into it on every pan frame, and doing it there turned a
 * cheap render into a measurable one.
 *
 * User-created and AI-generated trees are registered here at runtime through
 * `registerTree`, so they behave identically to the seeded ones everywhere
 * downstream — same index, same search, same layout, same gates.
 */

import { indexTree, layoutTree } from '../domain/graph.js';
import { WEB_TREE } from './tree.web.js';
import { MATH_TREE } from './tree.math.js';
import { CALISTHENICS_TREE } from './tree.calisthenics.js';

const trees = new Map();
const indexCache = new Map();
const layoutCache = new Map();

/*
 * Deterministic option shuffling.
 *
 * Every multiple-choice question in this repo was authored with its correct
 * answer written first — which is the natural way to write them and a fatal
 * way to ship them. All 101 questions had the answer at index 0, so the whole
 * quiz system could be beaten by always clicking the top option. The smoke
 * test found it by accident: a broken fallback path guessed index 0 for every
 * question and scored 100%.
 *
 * Fixing it by hand across 101 questions would be tedious and would silently
 * regress the next time content is added, so the permutation happens here
 * instead — once, at registration, for every tree including generated ones.
 *
 * It is seeded from the question text rather than being random, for two
 * reasons: the order must not change between a learner's first attempt and
 * their retry, and a test that cannot predict the layout cannot assert on it.
 */
function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleOptions(question) {
  if (!Array.isArray(question.options) || question.options.length < 2) return question;

  /* Fisher-Yates driven by a seeded LCG, so the permutation is a pure function
   * of the prompt. */
  let seed = hashString(question.prompt) || 1;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const order = question.options.map((option, i) => ({ option, i }));
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  return {
    ...question,
    options: order.map((o) => o.option),
    answer: order.findIndex((o) => o.i === question.answer),
  };
}

function normaliseTree(tree) {
  let touched = false;
  const skills = tree.skills.map((skill) => {
    if (!(skill.activities || []).some((a) => Array.isArray(a.questions))) return skill;
    touched = true;
    return {
      ...skill,
      activities: (skill.activities || []).map((activity) => (
        Array.isArray(activity.questions)
          ? { ...activity, questions: activity.questions.map(shuffleOptions) }
          : activity
      )),
    };
  });
  return touched ? { ...tree, skills } : tree;
}

export function registerTree(rawTree) {
  const tree = normaliseTree(rawTree);
  /* Index eagerly so a malformed tree — a bad prerequisite id, a cycle —
   * fails here, at registration, with a message naming the tree. Discovering
   * it later during a render gives you a stack trace in the layout code. */
  const index = indexTree(tree);
  trees.set(tree.id, tree);
  indexCache.set(tree.id, index);
  layoutCache.delete(tree.id);
  return index;
}

for (const tree of [WEB_TREE, MATH_TREE, CALISTHENICS_TREE]) registerTree(tree);

export function allTrees() {
  return [...trees.values()];
}

export function getTree(treeId) {
  return trees.get(treeId) || null;
}

export function getIndex(treeId) {
  if (!indexCache.has(treeId)) {
    const tree = trees.get(treeId);
    if (!tree) return null;
    indexCache.set(treeId, indexTree(tree));
  }
  return indexCache.get(treeId);
}

export function getLayout(treeId) {
  if (!layoutCache.has(treeId)) {
    const index = getIndex(treeId);
    if (!index) return null;
    layoutCache.set(treeId, layoutTree(index));
  }
  return layoutCache.get(treeId);
}

/** Find a skill anywhere, without the caller having to know its tree. */
export function findSkill(skillId) {
  for (const [treeId] of trees) {
    const index = getIndex(treeId);
    const skill = index.byId.get(skillId);
    if (skill) return { skill, tree: index.tree, index };
  }
  return null;
}

export function findActivity(activityId) {
  for (const [treeId] of trees) {
    const tree = trees.get(treeId);
    for (const skill of tree.skills) {
      for (const activity of skill.activities || []) {
        if (activity.id === activityId) return { activity, skill, tree, index: getIndex(treeId) };
      }
    }
  }
  return null;
}

/**
 * Search across every tree.
 *
 * Ranked rather than filtered: an exact name match must beat a description
 * that happens to contain the word, or searching "react" surfaces six skills
 * that mention React before React itself. Scored, sorted, then cut.
 */
export function searchSkills(query, limit = 20) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];

  const hits = [];
  for (const [treeId] of trees) {
    const tree = trees.get(treeId);
    for (const skill of tree.skills) {
      const name = skill.name.toLowerCase();
      let score = 0;

      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      else if ((skill.category || '').toLowerCase().includes(q)) score = 40;
      else if ((skill.description || '').toLowerCase().includes(q)) score = 25;
      else if ((skill.why || '').toLowerCase().includes(q)) score = 15;

      if (score > 0) hits.push({ skill, tree, score });
    }
  }

  return hits
    .sort((a, b) => (b.score - a.score) || a.skill.name.localeCompare(b.skill.name))
    .slice(0, limit);
}

/** Categories for the Explore screen, with a real count rather than a guess. */
export function categories() {
  const out = new Map();
  for (const tree of trees.values()) {
    if (!out.has(tree.category)) out.set(tree.category, { name: tree.category, trees: [], skills: 0 });
    const entry = out.get(tree.category);
    entry.trees.push(tree);
    entry.skills += tree.skills.length;
  }
  return [...out.values()];
}
