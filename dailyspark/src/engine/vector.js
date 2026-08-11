/*
 * vector.js — the user's direction, in the same space the sparks live in.
 *
 * There is no embedding model in a static page, so "semantic similarity" here
 * is cosine similarity in an explicit, hand-built topic space (taxonomy.js).
 * This is a smaller claim than a learned embedding and it is worth being clear
 * about: it cannot notice that "לצאת לאוויר" and "הליכה" are related unless a
 * human tagged both with `outdoors`.
 *
 * In exchange it gives two things a learned embedding would not:
 *   - every score is inspectable, which is what makes the "למה קיבלת את זה"
 *     line on the card true rather than decorative, and
 *   - it works from the very first session, offline, with no download.
 *
 * The profile vector has two parts, summed:
 *   declared  — from the goals and interests chosen in onboarding. Stable.
 *   behaviour — an exponential moving average over the topics of sparks that
 *               were actually acted on, minus the ones rejected. This is what
 *               makes the app feel like it learns, and it is deliberately
 *               weighted below the declared part early on and above it later.
 */

import { TOPICS, TOPIC_INDEX, GOALS, CATEGORIES } from '../data/taxonomy.js';

/* Half-life of about three weeks. Slow enough that one bad Tuesday does not
 * redraw the profile, fast enough that a genuine change of season shows up
 * inside a month. */
const LEARNING_RATE = 0.18;

export function zeros() {
  return new Array(TOPICS.length).fill(0);
}

export function normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i += 1) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (!norm) return vec.slice();
  return vec.map((v) => v / norm);
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/*
 * A free-text goal, mapped into the topic space.
 *
 * Keyword matching over the Hebrew labels, which is crude and which is the
 * right amount of machinery here: the field is optional, most people use the
 * chips, and a goal that matches nothing simply contributes nothing rather than
 * contributing noise. Matching is on substrings because Hebrew inflection
 * ("לזוז", "תזוזה", "לזוזה") defeats exact comparison.
 */
const GOAL_HINTS = [
  { words: ['לזוז', 'תנוע', 'הליכ', 'ספורט', 'אימון', 'כושר'], topics: ['movement', 'outdoors', 'energy'] },
  { words: ['מסך', 'טלפון', 'סושיאל', 'רשתות'], topics: ['digital', 'attention'] },
  { words: ['ריכוז', 'פוקוס', 'להתרכז', 'דחיינ'], topics: ['focus', 'procrastination'] },
  { words: ['רגוע', 'לחץ', 'חרד', 'שקט', 'נשימ'], topics: ['calm', 'breathing'] },
  { words: ['שינה', 'לישון', 'עייפ'], topics: ['sleep', 'energy'] },
  { words: ['לכתוב', 'כתיב', 'ליצור', 'יצירת', 'מוזיק', 'ציור'], topics: ['creativity', 'writing'] },
  { words: ['חבר', 'משפח', 'זוג', 'ילד', 'קשר'], topics: ['relationships', 'connection', 'family'] },
  { words: ['סדר', 'לארגן', 'בלגן', 'ניקיון'], topics: ['order', 'environment', 'decluttering'] },
  { words: ['ללמוד', 'למידה', 'קריא', 'ספר'], topics: ['learning', 'curiosity'] },
  { words: ['כסף', 'חסכ', 'תקציב', 'הוצא'], topics: ['money', 'spending'] },
  { words: ['להתחיל', 'לדחות', 'אומץ', 'לבקש'], topics: ['starting', 'courage'] },
  { words: ['תודה', 'להעריך', 'הכרת'], topics: ['gratitude', 'noticing'] },
  { words: ['עצמי', 'ביקורת', 'קשה עם'], topics: ['self-compassion', 'resilience'] },
];

export function topicsFromText(text) {
  if (!text) return [];
  const t = String(text).trim();
  if (!t) return [];
  const out = new Set();
  for (const hint of GOAL_HINTS) {
    if (hint.words.some((w) => t.includes(w))) hint.topics.forEach((x) => out.add(x));
  }
  return Array.from(out);
}

/*
 * The declared half of the profile.
 *
 * Goals count for more than interests because they were typed as an intention
 * ("I want to move more") while an interest is only "this doesn't bore me".
 * Interest weight 2 ("חשוב לי") is worth roughly a goal; weight 1 nudges; 0
 * contributes nothing here and is separately a hard filter in retrieval.
 */
export function declaredVector(profile) {
  const v = zeros();
  const add = (topic, amount) => {
    const i = TOPIC_INDEX[topic];
    if (i !== undefined) v[i] += amount;
  };

  for (const key of profile.goals || []) {
    const goal = GOALS.find((g) => g.key === key);
    if (goal) goal.topics.forEach((t) => add(t, 1.0));
  }
  for (const t of topicsFromText(profile.customGoal)) add(t, 0.9);

  /* Interests are category-level, so they spread over the topics that the
   * category's sparks actually use. Built from CATEGORIES rather than from the
   * library so an empty category still contributes its direction. */
  for (const cat of CATEGORIES) {
    const w = (profile.interests || {})[cat.key];
    if (!w) continue;
    for (const t of CATEGORY_TOPICS[cat.key] || []) add(t, w === 2 ? 0.55 : 0.2);
  }

  for (const habit of profile.habits || []) {
    for (const t of topicsFromText(habit.label)) add(t, 0.7);
  }

  return normalize(v);
}

/* Which topics each category pulls on. Kept next to the categories rather than
 * derived from the library so that adding one spark cannot quietly redefine
 * what a whole category means to the profile. */
const CATEGORY_TOPICS = {
  movement: ['movement', 'outdoors', 'energy', 'posture'],
  focus: ['focus', 'procrastination', 'digital', 'productivity'],
  mindfulness: ['breathing', 'attention', 'calm', 'noticing'],
  creativity: ['creativity', 'writing', 'ideation'],
  relationships: ['relationships', 'connection', 'listening', 'family'],
  order: ['order', 'environment', 'decluttering'],
  learning: ['learning', 'memory', 'curiosity'],
  resilience: ['resilience', 'control', 'self-compassion'],
  gratitude: ['gratitude', 'noticing'],
  sleep: ['sleep', 'morning', 'evening', 'energy'],
  money: ['money', 'spending'],
  courage: ['courage', 'priorities', 'starting', 'boundaries'],
};

/*
 * Fold one piece of feedback into the behavioural vector.
 *
 * `reward` is signed: a completed spark pulls the profile toward its topics, a
 * rejected one pushes away. Pushing away is bounded by the same learning rate
 * so that two annoyed taps cannot erase a month of genuine preference.
 */
export function learnTopics(behaviour, sparkVector, reward) {
  const out = behaviour ? behaviour.slice() : zeros();
  for (let i = 0; i < out.length; i += 1) {
    out[i] = (1 - LEARNING_RATE) * out[i] + LEARNING_RATE * reward * sparkVector[i];
  }
  return out;
}

/*
 * Declared and learned, combined.
 *
 * The learned half is trusted more as evidence accumulates: at zero
 * interactions it contributes nothing, and it approaches parity with the
 * declared half around forty. Someone who has used the app for two months and
 * only ever acts on movement should get movement, whatever they clicked in
 * onboarding — but not on day three, when three taps are not a preference.
 */
export function profileVector(profile, behaviour, interactions) {
  const declared = declaredVector(profile);
  if (!behaviour) return declared;
  const trust = Math.min(0.5, (interactions || 0) / 80);
  const out = zeros();
  for (let i = 0; i < out.length; i += 1) {
    out[i] = (1 - trust) * declared[i] + trust * behaviour[i];
  }
  return normalize(out);
}

/** The topic names that contributed most to a match — the "why this" line. */
export function topMatchingTopics(userVec, sparkVec, limit) {
  const scored = [];
  for (let i = 0; i < userVec.length; i += 1) {
    const contribution = userVec[i] * sparkVec[i];
    if (contribution > 0) scored.push({ topic: TOPICS[i], contribution });
  }
  scored.sort((a, b) => b.contribution - a.contribution);
  return scored.slice(0, limit || 2).map((s) => s.topic);
}
