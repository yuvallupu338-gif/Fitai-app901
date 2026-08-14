/*
 * rules.js — everything the assistant does, without an assistant.
 *
 * §108 SAYS THE APP MUST NOT BREAK WITHOUT AN API KEY. THIS IS THE STRONGER
 * VERSION OF THAT: WITHOUT A KEY, NOTHING IS MISSING.
 *
 * Every capability in the provider interface has an implementation here, built
 * on the same engines the rest of the app runs on. Plan the day, rank the
 * tasks, break down a goal, split a task, summarise the week, read a captured
 * line, suggest what to do now, explain why — all of it, offline, deterministic,
 * free.
 *
 * What a model adds is phrasing and the ability to handle a goal that does not
 * resemble anything in the template library. That is a real improvement and it
 * is worth having. It is not the product.
 *
 * THE TEMPLATES ARE NOT FAKE CONTENT.
 *
 * §188 forbids demo data that pretends to be a working feature. A template
 * library is the opposite of that: these are real, reusable project structures
 * of the kind §134 asks for, matched to the goal by its words and its declared
 * type, and every one of them is a plan somebody could actually follow. What
 * would be fake is generating five plausible-sounding tasks from a random
 * phrase generator and calling it AI. The interface says which produced what —
 * "מחושב מהנתונים שלך" against a local result, "נוסח על ידי מודל" against a
 * model's — because a person should know which one is talking to them.
 */

import { rankTasks } from '../engine/priority.js';
import { buildDailyPlan, suggestNextAction, reasonsFor } from '../engine/planner.js';
import { replanDay } from '../engine/replan.js';
import { parseCapture, guessProject } from '../engine/nlp.js';
import { explainReasons, explainNextAction, explainHealth } from '../engine/explain.js';
import { formatDuration, addDays, daysBetween, today as todayIso } from '../core/time.js';

/* ------------------------------------------------------------------ *
 * Goal and project templates
 *
 * Matched on the goal's declared type first, then on words in its title. The
 * word lists are short and specific; a goal that matches nothing falls through
 * to a generic structure that is still a real plan — define, do, check, finish
 * — rather than to an apology.
 * ------------------------------------------------------------------ */

const TEMPLATES = [
  {
    id: 'website',
    words: ['אתר', 'תיק עבודות', 'פורטפוליו', 'לנדינג', 'דף נחיתה'],
    project: 'בניית האתר',
    milestones: ['האפיון הושלם', 'העיצוב הושלם', 'הפיתוח הושלם', 'הבדיקות הושלמו', 'האתר עלה לאוויר'],
    tasks: [
      { title: 'להחליט מה האתר צריך להגיד', minutes: 45, energy: 'deep' },
      { title: 'לאסוף את התוכן — טקסטים ותמונות', minutes: 60, energy: 'normal' },
      { title: 'לשרטט את מבנה העמודים', minutes: 45, energy: 'deep' },
      { title: 'לבנות את עמוד הבית', minutes: 90, energy: 'deep' },
      { title: 'להתאים למובייל', minutes: 60, energy: 'normal' },
      { title: 'לבדוק בדפדפנים ובטלפון', minutes: 30, energy: 'light' },
      { title: 'להעלות לאוויר', minutes: 30, energy: 'normal' },
    ],
  },
  {
    id: 'app',
    words: ['אפליקציה', 'אפליקציית', 'מוצר', 'משחק'],
    project: 'פיתוח המוצר',
    milestones: ['הגדרת המוצר', 'ה־User Flow מוכן', 'גרסה ראשונה עובדת', 'בדיקות עם משתמשים', 'שחרור'],
    tasks: [
      { title: 'להגדיר למי זה מיועד', minutes: 45, energy: 'deep' },
      { title: 'לבחור את שלושת הפיצ׳רים החשובים', minutes: 45, energy: 'deep' },
      { title: 'לבנות User Flow', minutes: 60, energy: 'deep' },
      { title: 'לבנות את המסך הראשי', minutes: 90, energy: 'deep' },
      { title: 'לחבר את הנתונים', minutes: 90, energy: 'deep' },
      { title: 'לבדוק עם שני אנשים', minutes: 45, energy: 'light' },
    ],
  },
  {
    id: 'exam',
    words: ['מבחן', 'בחינה', 'בגרות', 'מועד', 'פסיכומטרי'],
    project: 'הכנה למבחן',
    milestones: ['החומר ממופה', 'הסיכומים מוכנים', 'סבב חזרה ראשון הושלם', 'פתרון מבחנים קודמים', 'חזרה אחרונה'],
    tasks: [
      { title: 'למפות את כל הנושאים בחומר', minutes: 45, energy: 'normal' },
      { title: 'לסמן את הנושאים החלשים', minutes: 25, energy: 'light' },
      { title: 'לכתוב סיכום לנושא הראשון', minutes: 60, energy: 'deep' },
      { title: 'לפתור תרגילים בנושא החלש ביותר', minutes: 45, energy: 'deep' },
      { title: 'לפתור מבחן משנה קודמת', minutes: 90, energy: 'deep' },
      { title: 'לעבור על הטעויות', minutes: 45, energy: 'normal' },
    ],
  },
  {
    id: 'learn',
    words: ['ללמוד', 'לימוד', 'קורס', 'שפה', 'javascript', 'react', 'python', 'תכנות'],
    project: 'מסלול הלמידה',
    milestones: ['הבסיס מוכן', 'תרגול ראשון', 'פרויקט קטן עובד', 'פרויקט מלא'],
    tasks: [
      { title: 'לבחור מקור למידה אחד ולהתחיל', minutes: 30, energy: 'normal' },
      { title: 'לעבור על היסודות', minutes: 60, energy: 'deep' },
      { title: 'לכתוב תרגיל ראשון לבד', minutes: 45, energy: 'deep' },
      { title: 'לבנות משהו קטן מאפס', minutes: 90, energy: 'deep' },
      { title: 'לחזור על מה שלא הובן', minutes: 45, energy: 'normal' },
    ],
  },
  {
    id: 'fitness',
    words: ['כושר', 'אימון', 'ריצה', 'משקל', 'בריאות', 'שינה'],
    project: 'בניית השגרה',
    milestones: ['שבועיים ראשונים', 'חודש ברצף', 'שיפור מדיד'],
    tasks: [
      { title: 'לקבוע את הימים הקבועים בשבוע', minutes: 15, energy: 'light' },
      { title: 'למדוד נקודת התחלה', minutes: 20, energy: 'light' },
      { title: 'לבנות אימון ראשון קצר', minutes: 30, energy: 'normal' },
      { title: 'לתכנן מה עושים בשבוע עמוס', minutes: 20, energy: 'light' },
    ],
  },
  {
    id: 'write',
    words: ['לכתוב', 'ספר', 'מאמר', 'עבודה', 'סמינר', 'תזה', 'בלוג'],
    project: 'הכתיבה',
    milestones: ['המבנה מוכן', 'טיוטה ראשונה', 'עריכה', 'הגשה'],
    tasks: [
      { title: 'לכתוב ראשי פרקים', minutes: 45, energy: 'deep' },
      { title: 'לאסוף מקורות', minutes: 60, energy: 'normal' },
      { title: 'לכתוב את הפרק הראשון', minutes: 90, energy: 'deep' },
      { title: 'לקרוא ולערוך', minutes: 60, energy: 'normal' },
    ],
  },
];

const GENERIC = {
  id: 'generic',
  project: 'הצעדים הראשונים',
  milestones: ['ההגדרה מוכנה', 'ההתחלה נעשתה', 'החלק העיקרי הושלם', 'סיום'],
  tasks: [
    { title: 'להגדיר איך נראה "הצלחה" בפועל', minutes: 25, energy: 'deep' },
    { title: 'לרשום את כל מה שצריך לקרות', minutes: 30, energy: 'normal' },
    { title: 'לעשות את הצעד הראשון הקטן ביותר', minutes: 25, energy: 'light' },
    { title: 'לקבוע זמן קבוע בשבוע לעבודה על זה', minutes: 15, energy: 'light' },
  ],
};

const BY_TYPE = {
  learning: 'learn',
  maintenance: 'fitness',
};

function pickTemplate(goal) {
  const text = `${goal.title} ${goal.description || ''} ${goal.successDefinition || ''}`.toLowerCase();
  for (const template of TEMPLATES) {
    if (template.words.some((w) => text.includes(w))) return template;
  }
  const byType = BY_TYPE[goal.type];
  if (byType) {
    const found = TEMPLATES.find((t) => t.id === byType);
    if (found) return found;
  }
  return GENERIC;
}

/* ------------------------------------------------------------------ *
 * The interface, implemented locally
 * ------------------------------------------------------------------ */

/**
 * Propose a project, milestones and first tasks for a goal.
 *
 * Dates are spread across the time available rather than left blank: a
 * milestone list with no dates is a list, and the whole point is a plan that
 * the deadline arithmetic can then check.
 */
export function generateGoalPlan(goal, snap) {
  const template = pickTemplate(goal);
  const today = snap.today;
  const target = goal.targetDate;
  const span = target ? Math.max(7, daysBetween(today, target)) : 42;

  const milestones = template.milestones.map((title, i) => ({
    title,
    targetDate: addDays(today, Math.round((span * (i + 1)) / template.milestones.length)),
  }));

  const tasks = template.tasks.map((t) => ({
    title: t.title,
    estimatedMinutes: t.minutes,
    energyLevel: t.energy,
  }));

  return {
    origin: 'rules',
    projects: [{
      title: goal.type === 'maintenance' ? template.project : `${template.project} — ${goal.title}`.slice(0, 100),
      dueDate: target,
      milestones,
      tasks,
    }],
    note: template.id === 'generic' ? 'generic' : template.id,
  };
}

/** Break a project into steps. Same library, project-shaped. */
export function breakDownProject(project, snap) {
  const pseudoGoal = {
    title: project.title,
    description: project.description,
    successDefinition: '',
    type: 'outcome',
    targetDate: project.dueDate,
  };
  const template = pickTemplate(pseudoGoal);
  const existing = new Set(
    snap.tasks.filter((t) => t.projectId === project.id).map((t) => t.title.trim()),
  );

  return {
    origin: 'rules',
    milestones: snap.milestones.some((m) => m.projectId === project.id)
      ? []
      : template.milestones.map((title) => ({ title })),
    /* Never propose a task that already exists in the project — the second
     * time somebody presses this button they should get what is missing, not
     * a duplicate of what they already accepted. */
    tasks: template.tasks
      .filter((t) => !existing.has(t.title))
      .map((t) => ({ title: t.title, estimatedMinutes: t.minutes, energyLevel: t.energy })),
  };
}

/**
 * Split a task into steps.
 *
 * Generic verbs, because a task title is one line and there is nothing to
 * infer from it locally. Deliberately four steps of a quarter the estimate
 * each: the value of splitting a stuck task is mostly that the first step
 * becomes small enough to start.
 */
export function splitTask(task) {
  const each = Math.max(10, Math.round((task.estimatedMinutes || 60) / 4));
  const title = task.title.replace(/^ל/, '');
  return {
    origin: 'rules',
    steps: [
      { title: `להבין מה בדיוק צריך ב"${task.title}"`, estimatedMinutes: Math.min(20, each), energyLevel: 'light' },
      { title: `להתחיל ל${title} — החלק הראשון`, estimatedMinutes: each, energyLevel: task.energyLevel },
      { title: `להמשיך ל${title} — החלק השני`, estimatedMinutes: each, energyLevel: task.energyLevel },
      { title: `לסיים ולבדוק את "${task.title}"`, estimatedMinutes: Math.min(30, each), energyLevel: 'normal' },
    ],
  };
}

export function prioritizeTasks(tasks, snap) {
  return {
    origin: 'rules',
    tasks: rankTasks(tasks, {
      weights: snap.preferences.weights,
      today: snap.today,
      graph: snap.graph,
      goalsById: snap.goalsById,
    }),
  };
}

export function generateDailyPlan(snap, opts) {
  return Object.assign({ origin: 'rules' }, buildDailyPlan(Object.assign({}, snap, opts || {})));
}

export function replan(snap, opts) {
  return Object.assign({ origin: 'rules' }, replanDay(Object.assign({}, snap, opts || {})));
}

export function nextAction(snap, opts) {
  const suggestion = suggestNextAction(Object.assign({}, snap, opts || {}));
  return Object.assign({ origin: 'rules' }, suggestion, {
    sentence: suggestion.ok ? explainNextAction(suggestion) : '',
  });
}

export function classifyInboxItem(text, snap) {
  const parsed = parseCapture(text, { today: snap.today, nowMinutes: snap.nowMinutes });
  const guess = guessProject(parsed.title || text, snap.projects);
  return {
    origin: 'rules',
    title: parsed.title,
    fields: parsed.fields,
    projectId: guess ? guess.project.id : null,
    projectTitle: guess ? guess.project.title : null,
    confidence: guess ? guess.score : 0,
    /* A captured line that names a duration and a date is a task. One that is
     * a noun phrase with no verb is more likely a note or an idea, and the
     * interface offers both rather than deciding. */
    kind: parsed.fields.scheduledDate || parsed.fields.estimatedMinutes ? 'task' : 'unknown',
  };
}

export function extractTaskFromText(text, snap) {
  return Object.assign({ origin: 'rules' }, parseCapture(text, {
    today: snap.today, nowMinutes: snap.nowMinutes,
  }));
}

/**
 * The weekly summary, in sentences assembled from the statistics.
 *
 * Every clause is a number out of periodStats. Nothing is characterised —
 * there is no "great week" or "you struggled", because the app has no basis
 * for either and a person reading their own numbers does not need to be told
 * how to feel about them.
 */
export function summarizeWeek(review) {
  const s = review.stats;
  const lines = [];

  if (s.empty) return { origin: 'rules', lines: ['לא נרשמה השבוע פעילות.'], headline: null };

  lines.push(`${s.tasksCompleted} משימות הושלמו.`);
  if (s.focusMinutes > 0) lines.push(`${formatDuration(s.focusMinutes)} מיקוד ב־${s.focusSessions} סשנים.`);
  if (s.milestonesCompleted > 0) lines.push(`${s.milestonesCompleted} אבני דרך הושלמו.`);
  if (s.deadlinesDue > 0) lines.push(`עמדת ב־${s.deadlinesMet} מתוך ${s.deadlinesDue} תאריכי יעד.`);
  if (s.habitRate !== null) lines.push(`עמידה בהרגלים: ${s.habitRate}%.`);

  const headline = review.biggestMove
    ? `ההתקדמות הגדולה ביותר: ${review.biggestMove.project.title}`
    : null;

  const attention = review.needsAttention.length
    ? `דורש תשומת לב: ${review.needsAttention.map((r) => r.project.title).join(', ')}`
    : null;

  return { origin: 'rules', lines, headline, attention };
}

export function explainRecommendation(item, snap) {
  if (item.reasons) return { origin: 'rules', text: explainReasons(item.reasons) };
  if (item.health) return { origin: 'rules', text: explainHealth(item.health.reasons) };
  if (item.task) {
    return {
      origin: 'rules',
      text: explainReasons(reasonsFor(item.task, {
        day: snap.today,
        graph: snap.graph,
        goalsById: snap.goalsById,
        projectsById: snap.projectsById,
        atRiskProjectIds: snap.atRiskProjectIds,
      })),
    };
  }
  return { origin: 'rules', text: '' };
}

export { todayIso };
