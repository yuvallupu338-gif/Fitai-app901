/*
 * schema.js — every entity in LifeOS, its enumerations, and its defaults.
 *
 * One file rather than one per entity, because the interesting thing about
 * this model is the relationships between the entities and those are only
 * visible when they are next to each other. The hierarchy the whole product
 * rests on:
 *
 *     area  →  goal  →  project  →  milestone  →  task
 *
 * with every arrow optional in the downward direction. A task with no project
 * is normal — most captured tasks start that way. A project with no goal is
 * normal. What is NOT allowed is a task pointing at a project that points at a
 * different goal than the task does; normalise() resolves that by trusting the
 * project, because the project is where a person actually manages the work.
 *
 * TWO NUMBER SCALES, AND THEY MEAN DIFFERENT THINGS.
 *
 * importance / urgency / goalImpact / priority are 1–5 integers, chosen by a
 * person, and they are inputs. progress / confidence / health are 0–100 and
 * are computed — nothing in the interface lets anyone type them except a goal
 * whose progress is explicitly set to manual. Mixing the two is how a
 * dashboard ends up displaying a number nobody can explain.
 */

import * as v from './validate.js';

/* ------------------------------------------------------------------ *
 * Enumerations
 * ------------------------------------------------------------------ */

export const TASK_STATUS = ['inbox', 'planned', 'ready', 'in_progress', 'waiting', 'blocked', 'done', 'cancelled'];
export const OPEN_TASK_STATUS = ['inbox', 'planned', 'ready', 'in_progress', 'waiting', 'blocked'];
/* Statuses a task can be in and still be offered as work to do now. `waiting`
 * and `blocked` are open but not actionable — that distinction is the entire
 * point of having both. */
export const ACTIONABLE_TASK_STATUS = ['inbox', 'planned', 'ready', 'in_progress'];

export const ENERGY_LEVELS = ['light', 'normal', 'deep'];
export const ESTIMATE_PRESETS = [5, 10, 15, 25, 45, 60, 90];

export const GOAL_TYPES = ['outcome', 'improvement', 'learning', 'maintenance', 'metric'];
export const GOAL_STATUS = ['active', 'paused', 'achieved', 'dropped'];
export const GOAL_PROGRESS_SOURCES = ['manual', 'milestones', 'tasks', 'metric'];

export const PROJECT_STATUS = ['active', 'on_track', 'needs_attention', 'blocked', 'paused', 'done'];
export const PROJECT_HEALTH = ['on_track', 'needs_attention', 'at_risk', 'blocked', 'idle', 'done'];

export const BLOCK_KINDS = ['fixed', 'flexible', 'preferred'];
export const NOTE_TYPES = ['quick', 'idea', 'project', 'meeting', 'learning', 'thought'];
export const HABIT_FREQUENCIES = ['daily', 'weekly', 'specific_days'];
export const HABIT_STATUS = ['active', 'paused', 'archived'];
export const FOCUS_KINDS = ['deep', 'light', 'review', 'learning'];
export const FOCUS_OUTCOMES = ['done', 'progress', 'stuck', 'more_time'];
export const MEMORY_TYPES = ['preference', 'planning', 'estimation', 'priority', 'workstyle'];
export const MEMORY_SOURCES = ['observed', 'stated', 'inferred'];
export const PLANNING_STYLES = ['structured', 'flexible', 'balanced'];
export const THEMES = ['system', 'light', 'dark'];
export const ACTORS = ['USER', 'AI', 'SYSTEM', 'SYNC'];
export const RECURRENCE = ['none', 'daily', 'weekly', 'monthly'];
export const REVIEW_PERIODS = ['week', 'month'];
export const RECOMMENDATION_STATUS = ['open', 'accepted', 'modified', 'dismissed', 'reverted'];

/* Area colours are token names rather than hex, so an area keeps its identity
 * when the theme flips instead of becoming a colour that reads as a different
 * area in the other palette. */
export const AREA_COLORS = ['area-1', 'area-2', 'area-3', 'area-4', 'area-5', 'area-6', 'area-7', 'area-8'];

/* ------------------------------------------------------------------ *
 * Profile and preferences
 * ------------------------------------------------------------------ */

export const ProfileSchema = v.object({
  displayName: v.str({ max: 60 }),
  timezone: v.str({ max: 60, default: 'Asia/Jerusalem' }),
  locale: v.str({ max: 10, default: 'he-IL' }),
  weekStartsOn: v.num({ int: true, min: 0, max: 6, default: 0 }),
  planningStyle: v.oneOf(PLANNING_STYLES, { default: 'balanced' }),
  preferredTheme: v.oneOf(THEMES, { default: 'system' }),
  dailyCapacityMinutes: v.num({ int: true, min: 15, max: 960, default: 180 }),
  onboardedAt: v.num({ min: 0, default: 0 }),
  helpWith: v.arrayOf(v.str({ max: 40 }), { max: 10 }),
});

/*
 * The planning constraints. These are what turn "here are your tasks" into a
 * plan that fits the day somebody actually has.
 *
 * bufferPct deserves a note: a plan that fills 100% of the free time is a plan
 * that fails the first time anything takes five minutes longer, and then keeps
 * failing, and then gets abandoned. Reserving a share of the day is what makes
 * the rest of it believable. 15% is the default; the setting exists because
 * how much slack a person needs is genuinely personal.
 */
export const PreferencesSchema = v.object({
  workStartMinutes: v.minuteOfDay({ default: 8 * 60 }),
  workEndMinutes: v.minuteOfDay({ default: 22 * 60 }),
  focusWindowStart: v.minuteOfDay({ default: 16 * 60 }),
  focusWindowEnd: v.minuteOfDay({ default: 19 * 60 }),
  breakMinutes: v.num({ int: true, min: 0, max: 60, default: 10 }),
  maxDeepWorkMinutes: v.num({ int: true, min: 30, max: 600, default: 180 }),
  bufferPct: v.num({ int: true, min: 0, max: 50, default: 15 }),
  minBlockMinutes: v.num({ int: true, min: 5, max: 120, default: 15 }),
  restDays: v.arrayOf(v.num({ int: true, min: 0, max: 6 }), { max: 7 }),
  weights: v.object({
    importance: v.num({ min: 0, max: 1, default: 0.30 }),
    urgency: v.num({ min: 0, max: 1, default: 0.25 }),
    goalImpact: v.num({ min: 0, max: 1, default: 0.20 }),
    deadlinePressure: v.num({ min: 0, max: 1, default: 0.15 }),
    unlockPotential: v.num({ min: 0, max: 1, default: 0.10 }),
  }),
  aiEnabled: v.bool({ default: true }),
  memoryEnabled: v.bool({ default: true }),
  aiCanReadNotes: v.bool({ default: false }),
  aiCanReadCalendar: v.bool({ default: true }),
  aiLearnFromActivity: v.bool({ default: true }),
});

export const DEFAULT_WEIGHTS = {
  importance: 0.30,
  urgency: 0.25,
  goalImpact: 0.20,
  deadlinePressure: 0.15,
  unlockPotential: 0.10,
};

/* ------------------------------------------------------------------ *
 * Areas
 * ------------------------------------------------------------------ */

export const AreaSchema = v.object({
  title: v.str({ min: 1, max: 40 }),
  color: v.oneOf(AREA_COLORS, { default: 'area-1' }),
  icon: v.str({ max: 24, default: 'area' }),
  order: v.num({ int: true, min: 0, default: 0 }),
  archived: v.bool({ default: false }),
});

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

export const GoalSchema = v.object({
  title: v.str({ min: 1, max: 140 }),
  description: v.str({ max: 2000 }).optional(''),
  areaId: v.id().optional(null),
  type: v.oneOf(GOAL_TYPES, { default: 'outcome' }),
  status: v.oneOf(GOAL_STATUS, { default: 'active' }),
  priority: v.num({ int: true, min: 1, max: 5, default: 3 }),
  startDate: v.isoDate().optional(null),
  targetDate: v.isoDate().optional(null),
  successDefinition: v.str({ max: 400 }).optional(''),
  motivation: v.str({ max: 400 }).optional(''),
  progressSource: v.oneOf(GOAL_PROGRESS_SOURCES, { default: 'milestones' }),
  progressManual: v.num({ int: true, min: 0, max: 100, default: 0 }),
  metricTarget: v.num({ min: 0 }).optional(null),
  metricCurrent: v.num({ min: 0, default: 0 }),
  metricUnit: v.str({ max: 24 }).optional(''),
  confidence: v.num({ int: true, min: 0, max: 100, default: 50 }),
  completedAt: v.num({ min: 0 }).optional(null),
});

/* ------------------------------------------------------------------ *
 * Projects and milestones
 * ------------------------------------------------------------------ */

export const ProjectSchema = v.object({
  title: v.str({ min: 1, max: 140 }),
  description: v.str({ max: 2000 }).optional(''),
  goalId: v.id().optional(null),
  areaId: v.id().optional(null),
  status: v.oneOf(PROJECT_STATUS, { default: 'active' }),
  priority: v.num({ int: true, min: 1, max: 5, default: 3 }),
  startDate: v.isoDate().optional(null),
  dueDate: v.isoDate().optional(null),
  estimatedMinutes: v.num({ int: true, min: 0, max: 100000, default: 0 }),
  order: v.num({ int: true, min: 0, default: 0 }),
  completedAt: v.num({ min: 0 }).optional(null),
});

export const MilestoneSchema = v.object({
  projectId: v.id({ required: true }),
  title: v.str({ min: 1, max: 140 }),
  description: v.str({ max: 1000 }).optional(''),
  targetDate: v.isoDate().optional(null),
  order: v.num({ int: true, min: 0, default: 0 }),
  completedAt: v.num({ min: 0 }).optional(null),
});

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

export const TaskSchema = v.object({
  title: v.str({ min: 1, max: 200 }),
  description: v.str({ max: 4000 }).optional(''),
  projectId: v.id().optional(null),
  goalId: v.id().optional(null),
  areaId: v.id().optional(null),
  milestoneId: v.id().optional(null),
  status: v.oneOf(TASK_STATUS, { default: 'inbox' }),

  /* Person-set, 1–5. The priority engine combines them; nothing writes them. */
  importance: v.num({ int: true, min: 1, max: 5, default: 3 }),
  urgency: v.num({ int: true, min: 1, max: 5, default: 3 }),
  goalImpact: v.num({ int: true, min: 1, max: 5, default: 3 }),
  difficulty: v.num({ int: true, min: 1, max: 5, default: 3 }),
  energyLevel: v.oneOf(ENERGY_LEVELS, { default: 'normal' }),

  estimatedMinutes: v.num({ int: true, min: 0, max: 1440, default: 25 }),
  actualMinutes: v.num({ int: true, min: 0, max: 100000, default: 0 }),

  dueDate: v.isoDate().optional(null),
  scheduledDate: v.isoDate().optional(null),
  scheduledStart: v.minuteOfDay().optional(null),
  scheduledEnd: v.minuteOfDay().optional(null),

  waitingFor: v.str({ max: 140 }).optional(''),
  tags: v.arrayOf(v.str({ max: 24 }), { max: 12 }),
  someday: v.bool({ default: false }),

  recurrence: v.oneOf(RECURRENCE, { default: 'none' }),
  recurrenceDays: v.arrayOf(v.num({ int: true, min: 0, max: 6 }), { max: 7 }),
  recurrenceUntil: v.isoDate().optional(null),
  recurrenceParentId: v.id().optional(null),

  /* How many times this has been pushed to a later day. The stuck-task
   * detector reads it; nothing else does. */
  postponeCount: v.num({ int: true, min: 0, default: 0 }),
  order: v.num({ int: true, min: 0, default: 0 }),
  completedAt: v.num({ min: 0 }).optional(null),
});

export const TaskDependencySchema = v.object({
  taskId: v.id({ required: true }),
  dependsOnId: v.id({ required: true }),
});

/* ------------------------------------------------------------------ *
 * Habits
 * ------------------------------------------------------------------ */

export const HabitSchema = v.object({
  title: v.str({ min: 1, max: 100 }),
  areaId: v.id().optional(null),
  frequency: v.oneOf(HABIT_FREQUENCIES, { default: 'daily' }),
  /* Times per week, when frequency is 'weekly'. */
  target: v.num({ int: true, min: 1, max: 7, default: 7 }),
  days: v.arrayOf(v.num({ int: true, min: 0, max: 6 }), { max: 7 }),
  preferredTime: v.minuteOfDay().optional(null),
  regularVersion: v.str({ max: 120 }).optional(''),
  minimumVersion: v.str({ max: 120 }).optional(''),
  estimatedMinutes: v.num({ int: true, min: 0, max: 480, default: 15 }),
  status: v.oneOf(HABIT_STATUS, { default: 'active' }),
  order: v.num({ int: true, min: 0, default: 0 }),
});

export const HabitCompletionSchema = v.object({
  habitId: v.id({ required: true }),
  date: v.isoDate({ required: true }),
  /* A completion is full or minimum. Recording the difference is what lets the
   * app say "you kept it going on your worst week" instead of showing a gap. */
  minimum: v.bool({ default: false }),
  minutes: v.num({ int: true, min: 0, max: 480, default: 0 }),
});

/* ------------------------------------------------------------------ *
 * Routines
 * ------------------------------------------------------------------ */

export const RoutineStepSchema = v.object({
  id: v.str({ max: 40 }),
  title: v.str({ min: 1, max: 120 }),
  minutes: v.num({ int: true, min: 0, max: 240, default: 5 }),
  optional: v.bool({ default: false }),
});

export const RoutineSchema = v.object({
  title: v.str({ min: 1, max: 100 }),
  areaId: v.id().optional(null),
  preferredTime: v.minuteOfDay().optional(null),
  steps: v.arrayOf(RoutineStepSchema, { max: 30 }),
  order: v.num({ int: true, min: 0, default: 0 }),
});

/* ------------------------------------------------------------------ *
 * Calendar
 * ------------------------------------------------------------------ */

export const EventSchema = v.object({
  title: v.str({ min: 1, max: 140 }),
  date: v.isoDate({ required: true }),
  startMinutes: v.minuteOfDay({ default: 9 * 60 }),
  endMinutes: v.minuteOfDay({ default: 10 * 60 }),
  allDay: v.bool({ default: false }),
  location: v.str({ max: 120 }).optional(''),
  areaId: v.id().optional(null),
  /* Where it came from. Everything is 'local' today; the field exists so that
   * a synced event can be told apart from one typed here, which is the first
   * thing an import needs and the last thing anyone remembers to add. */
  source: v.str({ max: 24, default: 'local' }),
  externalId: v.str({ max: 120 }).optional(''),
  notes: v.str({ max: 1000 }).optional(''),
});

export const BlockSchema = v.object({
  date: v.isoDate({ required: true }),
  startMinutes: v.minuteOfDay({ default: 9 * 60 }),
  endMinutes: v.minuteOfDay({ default: 10 * 60 }),
  taskId: v.id().optional(null),
  routineId: v.id().optional(null),
  habitId: v.id().optional(null),
  title: v.str({ max: 140 }).optional(''),
  kind: v.oneOf(BLOCK_KINDS, { default: 'flexible' }),
  /* Blocks the planner created can be rearranged by the planner. Blocks a
   * person dragged into place are theirs, and get moved only with consent. */
  createdBy: v.oneOf(ACTORS, { default: 'USER' }),
});

/* ------------------------------------------------------------------ *
 * Focus
 * ------------------------------------------------------------------ */

export const FocusSessionSchema = v.object({
  taskId: v.id().optional(null),
  habitId: v.id().optional(null),
  routineId: v.id().optional(null),
  title: v.str({ max: 200 }).optional(''),
  kind: v.oneOf(FOCUS_KINDS, { default: 'deep' }),
  plannedMinutes: v.num({ int: true, min: 1, max: 480, default: 25 }),
  actualMinutes: v.num({ int: true, min: 0, max: 480, default: 0 }),
  startedAt: v.num({ min: 0, default: 0 }),
  endedAt: v.num({ min: 0 }).optional(null),
  outcome: v.oneOf(FOCUS_OUTCOMES, { default: 'progress' }),
  note: v.str({ max: 500 }).optional(''),
  date: v.isoDate().optional(null),
});

/* ------------------------------------------------------------------ *
 * Notes
 * ------------------------------------------------------------------ */

export const NoteSchema = v.object({
  title: v.str({ max: 140 }).optional(''),
  body: v.str({ max: 20000 }).optional(''),
  type: v.oneOf(NOTE_TYPES, { default: 'quick' }),
  areaId: v.id().optional(null),
  goalId: v.id().optional(null),
  projectId: v.id().optional(null),
  taskId: v.id().optional(null),
  tags: v.arrayOf(v.str({ max: 24 }), { max: 12 }),
  pinned: v.bool({ default: false }),
});

/* ------------------------------------------------------------------ *
 * Reviews
 * ------------------------------------------------------------------ */

export const ReviewSchema = v.object({
  period: v.oneOf(REVIEW_PERIODS, { default: 'week' }),
  fromDate: v.isoDate({ required: true }),
  toDate: v.isoDate({ required: true }),
  /* The numbers are recomputed from the event log every time the screen opens,
   * so what is stored is only what a person wrote and what they decided. A
   * stored statistic is a statistic that can disagree with the data. */
  reflection: v.str({ max: 4000 }).optional(''),
  nextFocus: v.str({ max: 300 }).optional(''),
  decisions: v.arrayOf(v.str({ max: 300 }), { max: 20 }),
});

/* ------------------------------------------------------------------ *
 * AI records
 * ------------------------------------------------------------------ */

export const RecommendationSchema = v.object({
  kind: v.str({ max: 40 }),
  title: v.str({ max: 300 }),
  reason: v.str({ max: 600 }).optional(''),
  taskId: v.id().optional(null),
  projectId: v.id().optional(null),
  goalId: v.id().optional(null),
  status: v.oneOf(RECOMMENDATION_STATUS, { default: 'open' }),
  /* Whether a model wrote this or the local rules did. Displayed, because a
   * person should know which one is talking to them. */
  origin: v.oneOf(['rules', 'model'], { default: 'rules' }),
  payload: v.object({}, { passthrough: true }),
  respondedAt: v.num({ min: 0 }).optional(null),
});

export const MemorySchema = v.object({
  type: v.oneOf(MEMORY_TYPES, { default: 'preference' }),
  /* A stable identifier for what this memory is ABOUT, as opposed to how it is
   * currently worded. "estimation.global" stays the same when the finding
   * moves from 30% to 40%, which is what lets learning update a memory in
   * place instead of accumulating four near-identical sentences that all claim
   * to be about the same thing. Empty for memories a person typed. */
  key: v.str({ max: 60 }).optional(''),
  content: v.str({ min: 1, max: 300 }),
  confidence: v.num({ int: true, min: 0, max: 100, default: 50 }),
  source: v.oneOf(MEMORY_SOURCES, { default: 'observed' }),
  /* How many observations back this. Shown next to the claim, because "based
   * on 12 sessions" and "based on 2" are different claims. */
  evidenceCount: v.num({ int: true, min: 0, default: 1 }),
  lastConfirmedAt: v.num({ min: 0, default: 0 }),
  expiresAt: v.num({ min: 0 }).optional(null),
  pinned: v.bool({ default: false }),
});

export const AIInteractionSchema = v.object({
  requestType: v.str({ max: 40 }),
  provider: v.str({ max: 24 }).optional(''),
  model: v.str({ max: 60 }).optional(''),
  ok: v.bool({ default: true }),
  error: v.str({ max: 200 }).optional(''),
  contextItems: v.num({ int: true, min: 0, default: 0 }),
  durationMs: v.num({ int: true, min: 0, default: 0 }),
  at: v.num({ min: 0, default: 0 }),
});

/* ------------------------------------------------------------------ *
 * Activity
 * ------------------------------------------------------------------ */

export const ACTIVITY_TYPES = [
  'TASK_CREATED', 'TASK_COMPLETED', 'TASK_REOPENED', 'TASK_RESCHEDULED', 'TASK_DELETED', 'TASK_SPLIT',
  'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_COMPLETED',
  'GOAL_CREATED', 'GOAL_UPDATED', 'GOAL_ACHIEVED',
  'MILESTONE_COMPLETED',
  'FOCUS_STARTED', 'FOCUS_COMPLETED',
  'HABIT_COMPLETED', 'HABIT_MINIMUM',
  'EVENT_CREATED', 'BLOCK_CREATED',
  'NOTE_CREATED',
  'PLAN_GENERATED', 'PLAN_APPLIED',
  'AI_RECOMMENDATION_ACCEPTED', 'AI_RECOMMENDATION_DISMISSED',
  'MEMORY_LEARNED',
  'REVIEW_CREATED',
];

/* ------------------------------------------------------------------ *
 * Cross-field normalisation
 * ------------------------------------------------------------------ */

/**
 * Settle the relationships a single-field validator cannot see.
 *
 * Called on every task write. It is deliberately a pure function of the task
 * plus its project so it can be unit-tested without a database.
 */
export function normaliseTask(task, project, goal) {
  const out = Object.assign({}, task);

  /* A project owns the goal and area of everything in it. Letting a task
   * disagree produces a task that shows under one goal in the goal screen and
   * a different one in the project screen, and neither is wrong from where it
   * is standing. */
  if (project) {
    out.projectId = project.id;
    if (project.goalId) out.goalId = project.goalId;
    if (project.areaId) out.areaId = project.areaId;
  } else if (goal) {
    out.goalId = goal.id;
    if (goal.areaId && !out.areaId) out.areaId = goal.areaId;
  }

  /* A scheduled time without a date is not a schedule. */
  if (!out.scheduledDate) {
    out.scheduledStart = null;
    out.scheduledEnd = null;
  }
  if (out.scheduledStart !== null && out.scheduledStart !== undefined) {
    if (out.scheduledEnd === null || out.scheduledEnd === undefined || out.scheduledEnd <= out.scheduledStart) {
      out.scheduledEnd = Math.min(1440, out.scheduledStart + Math.max(5, out.estimatedMinutes || 25));
    }
  }

  /* Completion and status are one fact stored twice; keep them agreeing. */
  if (out.status === 'done' && !out.completedAt) out.completedAt = Date.now();
  if (out.status !== 'done' && out.completedAt) out.completedAt = null;

  /* 'waiting' means waiting for a person or an event outside the app;
   * 'blocked' means waiting for another task here. A task with neither a
   * waitingFor note nor a dependency is not waiting for anything. */
  if (out.status === 'waiting' && !out.waitingFor) out.status = 'ready';

  if (out.someday) {
    /* Someday items are explicitly outside planning — they must not turn up in
     * a day plan because they happen to carry a stale scheduled date. */
    out.scheduledDate = null;
    out.scheduledStart = null;
    out.scheduledEnd = null;
  }

  return out;
}

/** Which fields a person can actually edit. Guards the update path. */
export const TASK_EDITABLE = [
  'title', 'description', 'projectId', 'goalId', 'areaId', 'milestoneId', 'status',
  'importance', 'urgency', 'goalImpact', 'difficulty', 'energyLevel',
  'estimatedMinutes', 'dueDate', 'scheduledDate', 'scheduledStart', 'scheduledEnd',
  'waitingFor', 'tags', 'someday', 'recurrence', 'recurrenceDays', 'recurrenceUntil', 'order',
];

export function pickEditable(patch, allowed) {
  const out = {};
  for (const key of allowed) if (key in patch) out[key] = patch[key];
  return out;
}
