/*
 * context.js — deciding what the model is allowed to see.
 *
 * §61 IS THE WHOLE FILE: NEVER SEND THE DATABASE.
 *
 * The naive implementation of an assistant serialises everything and lets the
 * model sort it out. Three things go wrong, in increasing order of severity.
 *
 * It costs money — a year of tasks is tens of thousands of tokens per
 * question, on every question.
 *
 * It gets worse answers. A model given four hundred tasks and asked what to do
 * next has to do the retrieval itself, badly, and the top of its attention is
 * spent on rows that were irrelevant before the question was asked. The
 * ranking already happened, deterministically, in priority.js; handing over
 * the top twelve produces a better answer than handing over everything.
 *
 * And it sends a person's entire life to a third party to answer "what should
 * I do now". The privacy screen says what leaves the device, and it can only
 * say that truthfully because this file is where the decision is made.
 *
 * So: one builder per request type, each assembling the minimum. "מה לעשות
 * עכשיו" needs the clock, the free window, the top ranked tasks, their
 * deadlines and their blockers — and nothing else. Not notes, not history, not
 * the other eleven projects.
 *
 * WHAT IS EXCLUDED BY POLICY RATHER THAN BY RELEVANCE.
 *
 * Notes are off unless the person turned them on (default off), the calendar
 * carries times and durations but not event titles unless it is on, and
 * nothing that has not been asked for is ever added "because it might help".
 * Every builder returns the id set it offered, so guard.js can reject a
 * response that refers to something outside it.
 */

import { preferences } from '../services/core.js';
import { forContext as memoriesForContext } from '../services/memory.js';
import { sanitiseForPrompt, fence, DATA_NOTICE } from './guard.js';
import { formatTime, formatTimeRange, formatDuration, daysBetween } from '../core/time.js';

/* Short handles rather than raw ids. A model copying "t_m4x9z2q1a8" back is
 * error-prone in a way that copying "T3" is not, and the mapping back is a
 * lookup this file owns. Also cheaper, which matters at every call. */
function handleMap(records, prefix) {
  const toHandle = new Map();
  const toId = new Map();
  records.forEach((r, i) => {
    const handle = `${prefix}${i + 1}`;
    toHandle.set(r.id, handle);
    toId.set(handle, r.id);
  });
  return { toHandle, toId };
}

function taskLine(task, snap, handles, today) {
  const bits = [`${handles.toHandle.get(task.id)}: ${sanitiseForPrompt(task.title, 120)}`];
  bits.push(`${task.estimatedMinutes || 25} דק׳`);
  if (task.dueDate) {
    const days = daysBetween(today, task.dueDate);
    bits.push(days < 0 ? `באיחור ${Math.abs(days)} ימים` : days === 0 ? 'יעד היום' : `יעד בעוד ${days} ימים`);
  }
  if (task.projectId && snap.projectsById.get(task.projectId)) {
    bits.push(`פרויקט: ${sanitiseForPrompt(snap.projectsById.get(task.projectId).title, 60)}`);
  }
  if (task.energyLevel === 'deep') bits.push('דורש ריכוז');
  if (task.energyLevel === 'light') bits.push('קליל');
  if (task._priority) bits.push(`ציון ${Math.round(task._priority.score)}`);
  return bits.join(' | ');
}

/* ------------------------------------------------------------------ *
 * Builders
 * ------------------------------------------------------------------ */

/**
 * buildAIContext(requestType, snapshot, options)
 *
 * Returns { text, ids, itemCount, includes } — the prompt fragment, the set of
 * ids the model may legitimately refer to, and a plain-language list of what
 * was included, which the privacy panel shows verbatim.
 */
export function buildAIContext(requestType, snap, options) {
  const o = options || {};
  const prefs = preferences();
  const today = snap.today;

  const sections = [];
  const ids = new Set();
  const includes = [];
  let handles = { toHandle: new Map(), toId: new Map() };

  function addTasks(tasks, label, prefix) {
    if (!tasks.length) return;
    handles = handleMap(tasks, prefix || 'T');
    for (const t of tasks) ids.add(t.id);
    sections.push(`${label}:\n${tasks.map((t) => taskLine(t, snap, handles, today)).join('\n')}`);
    includes.push(`${tasks.length} משימות`);
  }

  function addMemories() {
    const memories = memoriesForContext(5);
    if (!memories.length) return;
    sections.push(`מה שידוע על אופן העבודה:\n${memories.map((m) => `- ${sanitiseForPrompt(m.content, 160)}`).join('\n')}`);
    includes.push('העדפות שנלמדו');
  }

  function addCalendar(dayIso) {
    if (!prefs.aiCanReadCalendar) {
      sections.push('לוח השנה לא זמין לעוזר לפי ההגדרות.');
      return;
    }
    const events = snap.events.filter((e) => e.date === dayIso && !e.allDay);
    if (events.length) {
      sections.push(`אירועים קבועים היום:\n${events.map(
        (e) => `- ${formatTimeRange(e.startMinutes, e.endMinutes)} ${sanitiseForPrompt(e.title, 60)}`,
      ).join('\n')}`);
      includes.push(`${events.length} אירועים`);
    } else {
      sections.push('אין היום אירועים קבועים.');
    }
  }

  switch (requestType) {
    /* ---------------------------------------------------------------- */
    case 'nextAction': {
      const s = o.suggestion;
      sections.push(`השעה ${formatTime(snap.nowMinutes)}, ${today}.`);
      if (s && s.window) {
        sections.push(`חלון פנוי: ${formatTimeRange(s.window.start, s.window.end)} (${formatDuration(s.availableMinutes)}).`);
      }
      addCalendar(today);
      /* Only what fits — a suggestion for something that does not fit the
       * window is not a suggestion, and the ranking is already done. */
      addTasks((o.candidates || []).slice(0, 8), 'המשימות המובילות לפי הדירוג');
      addMemories();
      break;
    }

    /* ---------------------------------------------------------------- */
    case 'dailyPlan': {
      const plan = o.plan;
      sections.push(`תאריך: ${today}. זמן פנוי שמיש: ${formatDuration(plan.capacity.usableMinutes)}.`);
      addCalendar(plan.date);
      if (plan.windows.length) {
        sections.push(`חלונות פנויים:\n${plan.windows.map(
          (w) => `- ${formatTimeRange(w.start, w.end)}`,
        ).join('\n')}`);
      }
      addTasks((plan.ranked || []).slice(0, 12), 'משימות מועמדות, מדורגות');
      addMemories();
      break;
    }

    /* ---------------------------------------------------------------- */
    case 'goalBreakdown': {
      const goal = o.goal;
      sections.push(`מטרה: ${sanitiseForPrompt(goal.title, 140)}`);
      if (goal.successDefinition) sections.push(`הצלחה מוגדרת כ: ${sanitiseForPrompt(goal.successDefinition, 300)}`);
      if (goal.motivation) sections.push(`למה זה חשוב: ${sanitiseForPrompt(goal.motivation, 300)}`);
      if (goal.targetDate) {
        sections.push(`תאריך יעד: ${goal.targetDate} (בעוד ${daysBetween(today, goal.targetDate)} ימים).`);
      }
      sections.push(`סוג המטרה: ${goal.type}.`);
      const existing = snap.projects.filter((p) => p.goalId === goal.id);
      if (existing.length) {
        sections.push(`פרויקטים שכבר קיימים למטרה:\n${existing.map(
          (p) => `- ${sanitiseForPrompt(p.title, 80)}`,
        ).join('\n')}`);
      }
      sections.push(`זמן פנוי ממוצע ליום: ${formatDuration(prefs.dailyCapacityMinutes)}.`);
      includes.push('המטרה ופרטיה');
      break;
    }

    /* ---------------------------------------------------------------- */
    case 'projectBreakdown': {
      const project = o.project;
      sections.push(`פרויקט: ${sanitiseForPrompt(project.title, 140)}`);
      if (project.description) sections.push(fence('תיאור', project.description));
      if (project.dueDate) {
        sections.push(`תאריך סיום: ${project.dueDate} (בעוד ${daysBetween(today, project.dueDate)} ימים).`);
      }
      const existing = snap.tasks.filter((t) => t.projectId === project.id && t.status !== 'cancelled');
      if (existing.length) {
        sections.push(`משימות קיימות בפרויקט:\n${existing.slice(0, 20).map(
          (t) => `- ${sanitiseForPrompt(t.title, 80)}`,
        ).join('\n')}`);
      }
      const milestones = snap.milestones.filter((m) => m.projectId === project.id);
      if (milestones.length) {
        sections.push(`אבני דרך קיימות:\n${milestones.map((m) => `- ${sanitiseForPrompt(m.title, 80)}`).join('\n')}`);
      }
      includes.push('הפרויקט ותוכנו');
      break;
    }

    /* ---------------------------------------------------------------- */
    case 'taskSplit': {
      const task = o.task;
      sections.push(`משימה: ${sanitiseForPrompt(task.title, 200)}`);
      if (task.description) sections.push(fence('פרטים', task.description));
      sections.push(`הערכת זמן נוכחית: ${formatDuration(task.estimatedMinutes || 25)}.`);
      if (task.postponeCount) sections.push(`נדחתה ${task.postponeCount} פעמים.`);
      includes.push('המשימה');
      break;
    }

    /* ---------------------------------------------------------------- */
    case 'classifyInbox': {
      sections.push(`הפריט שנקלט: ${sanitiseForPrompt(o.text, 300)}`);
      const projects = snap.projects.filter((p) => p.status !== 'done');
      handles = handleMap(projects, 'P');
      for (const p of projects) ids.add(p.id);
      if (projects.length) {
        sections.push(`פרויקטים פעילים:\n${projects.map(
          (p) => `${handles.toHandle.get(p.id)}: ${sanitiseForPrompt(p.title, 80)}`,
        ).join('\n')}`);
      }
      const areas = snap.areas;
      if (areas.length) {
        sections.push(`תחומי חיים:\n${areas.map((a) => `- ${sanitiseForPrompt(a.title, 40)}`).join('\n')}`);
      }
      includes.push('הטקסט שנקלט', 'שמות פרויקטים');
      break;
    }

    /* ---------------------------------------------------------------- */
    case 'weekSummary': {
      const stats = o.stats;
      sections.push([
        `שבוע ${stats.from} עד ${stats.to}.`,
        `${stats.tasksCompleted} משימות הושלמו.`,
        `${formatDuration(stats.focusMinutes)} מיקוד ב־${stats.focusSessions} סשנים.`,
        `${stats.milestonesCompleted} אבני דרך.`,
        `עומס בלוח השנה: ${stats.calendarLoad}%.`,
        `עמידה ביעדים: ${stats.deadlinesMet} מתוך ${stats.deadlinesDue}.`,
      ].join('\n'));

      if (o.projectMovement && o.projectMovement.length) {
        sections.push(`התקדמות לפי פרויקט:\n${o.projectMovement.slice(0, 5).map(
          (row) => `- ${sanitiseForPrompt(row.project.title, 80)}: ${row.tasks} משימות, ${row.milestones} אבני דרך`,
        ).join('\n')}`);
      }
      if (o.needsAttention && o.needsAttention.length) {
        sections.push(`פרויקטים שדורשים תשומת לב:\n${o.needsAttention.map(
          (row) => `- ${sanitiseForPrompt(row.project.title, 80)}`,
        ).join('\n')}`);
      }
      includes.push('סטטיסטיקות השבוע');
      break;
    }

    /* ---------------------------------------------------------------- */
    case 'explain': {
      sections.push(`המלצה: ${sanitiseForPrompt(o.title, 200)}`);
      sections.push(`העובדות שמאחוריה:\n${(o.facts || []).map((f) => `- ${sanitiseForPrompt(f, 200)}`).join('\n')}`);
      includes.push('ההמלצה והעובדות שמאחוריה');
      break;
    }

    default:
      sections.push('אין הקשר.');
      break;
  }

  return {
    text: sections.join('\n\n'),
    ids,
    handles,
    itemCount: ids.size,
    includes,
    notice: DATA_NOTICE,
  };
}

/** Turn a handle the model returned back into a real id. */
export function resolveHandle(context, handle) {
  if (!handle) return null;
  return context.handles.toId.get(String(handle).trim()) || null;
}

export function resolveHandles(context, list) {
  return (list || []).map((h) => resolveHandle(context, h)).filter(Boolean);
}
