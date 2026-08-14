/*
 * core.js — the snapshot, and the settings the engines read.
 *
 * WHY A SNAPSHOT EXISTS AT ALL.
 *
 * Every engine in this app is a pure function of the account's data. That is
 * what makes them testable in node with no browser and no storage, and it is
 * not a property worth giving up. But it means each of them needs the same
 * bundle of arrays and lookup maps, and building that bundle from db.list()
 * calls at every call site would be both repetitive and slow — the Today
 * screen alone asks four engines the same question about the same day.
 *
 * So: one snapshot, built once, invalidated on write. Everything downstream
 * takes it as an argument. The engines never import db.js, never import
 * session.js, and cannot accidentally read another account's data because they
 * have no way to reach it.
 *
 * The cache is keyed on a counter bumped by the data-changed event rather than
 * on a timestamp, because two writes inside the same millisecond are ordinary
 * during a batch and a timestamp would serve one of them a stale snapshot.
 */

import * as db from '../core/db.js';
import { on, EV } from '../core/bus.js';
import { currentUserId } from '../core/session.js';
import { ProfileSchema, PreferencesSchema } from '../domain/schema.js';
import { buildGraph } from '../engine/deps.js';
import { healthReport } from '../engine/health.js';
import { today as todayIso, nowMinutes } from '../core/time.js';

let version = 0;
let cache = null;
let cacheKey = null;

on(EV.DATA_CHANGED, () => { version += 1; cache = null; });
on(EV.SESSION_CHANGED, () => { version += 1; cache = null; });

/**
 * Everything the engines need, in the shape they expect.
 *
 * `graph` and the by-id maps are built here rather than in each engine because
 * they are O(n) to construct and would otherwise be rebuilt per call.
 */
export function snapshot() {
  const userId = currentUserId();
  const key = `${userId}:${version}`;
  if (cache && cacheKey === key) return cache;

  const tasks = db.list('tasks');
  const dependencies = db.list('taskDependencies');
  const goals = db.list('goals');
  const projects = db.list('projects');
  const milestones = db.list('milestones');
  const areas = db.list('areas');

  const snap = {
    today: todayIso(),
    nowMinutes: nowMinutes(),

    areas,
    goals,
    projects,
    milestones,
    tasks,
    dependencies,
    habits: db.list('habits'),
    habitCompletions: db.list('habitCompletions'),
    routines: db.list('routines'),
    events: db.list('events'),
    blocks: db.list('blocks'),
    focusSessions: db.list('focusSessions'),
    notes: db.list('notes'),
    reviews: db.list('reviews'),
    recommendations: db.list('recommendations'),
    memories: db.list('memories'),
    activity: db.list('activity'),

    preferences: preferences(),
    profile: profile(),

    graph: buildGraph(tasks, dependencies),
    areasById: new Map(areas.map((a) => [a.id, a])),
    goalsById: new Map(goals.map((g) => [g.id, g])),
    projectsById: new Map(projects.map((p) => [p.id, p])),
    milestonesById: new Map(milestones.map((m) => [m.id, m])),
    tasksById: new Map(tasks.map((t) => [t.id, t])),
  };

  /* Health depends on the snapshot and the snapshot carries health, so it is
   * computed after the rest is assembled and attached. The planner reads
   * atRiskProjectIds to explain why a task matters. */
  const health = healthReport(snap);
  snap.health = health.byProject;
  snap.atRiskProjectIds = health.atRisk;

  cache = snap;
  cacheKey = key;
  return snap;
}

/** Force a rebuild — used by tests and after an import. */
export function invalidate() {
  version += 1;
  cache = null;
}

/* ------------------------------------------------------------------ *
 * Profile and preferences
 * ------------------------------------------------------------------ */

export function profile() {
  return ProfileSchema.coerce(db.getProfile() || {});
}

export function updateProfile(patch) {
  const next = ProfileSchema.coerce(Object.assign({}, profile(), patch));
  db.setProfile(next);
  return next;
}

export function preferences() {
  const raw = db.getPreferences() || {};
  const prefs = PreferencesSchema.coerce(raw);
  /* Preferences are stored with the weights as five numbers that a person can
   * drag independently, so they will not sum to 1. Normalising on read means
   * the engines never have to, and the settings screen can show the sliders
   * as raw values without doing arithmetic to display them. */
  return prefs;
}

export function updatePreferences(patch) {
  const next = PreferencesSchema.coerce(Object.assign({}, preferences(), patch));
  db.setPreferences(next);
  return next;
}

/** Reset the priority weights to the defaults from the specification. */
export function resetWeights() {
  return updatePreferences({
    weights: {
      importance: 0.30, urgency: 0.25, goalImpact: 0.20, deadlinePressure: 0.15, unlockPotential: 0.10,
    },
  });
}

/* ------------------------------------------------------------------ *
 * Shared helpers used across services
 * ------------------------------------------------------------------ */

/** Resolve the area of anything, following project → goal → area. */
export function resolveArea(entity, snap) {
  const s = snap || snapshot();
  if (!entity) return null;
  if (entity.areaId) return s.areasById.get(entity.areaId) || null;
  if (entity.projectId) {
    const project = s.projectsById.get(entity.projectId);
    if (project && project.areaId) return s.areasById.get(project.areaId) || null;
    if (project && project.goalId) {
      const goal = s.goalsById.get(project.goalId);
      if (goal && goal.areaId) return s.areasById.get(goal.areaId) || null;
    }
  }
  if (entity.goalId) {
    const goal = s.goalsById.get(entity.goalId);
    if (goal && goal.areaId) return s.areasById.get(goal.areaId) || null;
  }
  return null;
}

export { db };
