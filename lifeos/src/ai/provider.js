/*
 * provider.js — the LifeOSAIProvider interface from §107, and the only door
 * between the app and a model.
 *
 * EVERY METHOD HAS THE SAME SHAPE, AND THE SHAPE IS THE DESIGN.
 *
 *     1. compute the answer locally, with the engines           (always)
 *     2. if the assistant is off or has no key, return that     (done)
 *     3. otherwise ask a model, with a context built for this
 *        question only
 *     4. validate the reply against a schema
 *     5. check every id it returned against the database
 *     6. on any failure at 3, 4 or 5 — return the local answer
 *
 * Step 1 running unconditionally is what makes step 6 free. There is no
 * degraded mode to write and no error state to design: a network failure, a
 * rejected key, a malformed reply and a hallucinated id all land on an answer
 * that was already computed. The person sees a suggestion either way; what
 * changes is whether it is labelled מחושב מהנתונים שלך or נוסח על ידי מודל.
 *
 * It also means the model can never make the app worse than not having one,
 * which is the property that lets §110 be true: the model does not own access
 * control, persistence, dependencies, calculation, deadlines or conflict
 * detection. It writes sentences and it proposes structures. A person applies
 * them.
 */

import * as db from '../core/db.js';
import { snapshot, preferences } from '../services/core.js';
import { available, callStructured, choice, AI_ERRORS } from './client.js';
import { buildAIContext, resolveHandle, resolveHandles } from './context.js';
import { checkIds, capList, DATA_NOTICE } from './guard.js';
import * as rules from './rules.js';

/* ------------------------------------------------------------------ *
 * The voice
 * ------------------------------------------------------------------ */

const SYSTEM = [
  'אתה חלק ממערכת תכנון אישית בשם LifeOS. אתה עונה בעברית בלבד.',
  '',
  'הסגנון: קצר, ענייני, רגוע. משפטים קצרים. בלי סימני קריאה, בלי מילות עידוד,',
  'בלי "בהצלחה", בלי אימוג׳י, ובלי לספר למשתמש איך להרגיש.',
  'כתוב כמו עמית לעבודה שמסביר משהו בשתי שורות, לא כמו אפליקציה.',
  '',
  'אל תשתמש ב"שלך" אלא אם בלעדיו המשמעות משתנה. בעברית לא מצמידים שייכות לכל דבר.',
  '',
  'כל נימוק חייב להישען על עובדה שקיבלת: תאריך, מספר דקות, שם פרויקט, תלות.',
  'אם אין לך עובדה — אל תמציא אחת ואל תכתוב נימוק כללי כמו "זה חשוב".',
  '',
  'אתה עונה אך ורק דרך הכלי שסופק לך. אל תכתוב טקסט חופשי.',
  '',
  DATA_NOTICE,
].join('\n');

/* ------------------------------------------------------------------ *
 * Tool schemas
 * ------------------------------------------------------------------ */

const SCHEMAS = {
  goalPlan: {
    name: 'propose_goal_plan',
    description: 'הצע פרויקטים, אבני דרך ומשימות ראשונות למטרה.',
    schema: {
      type: 'object',
      properties: {
        projects: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'שם הפרויקט בעברית, עד 8 מילים' },
              milestones: {
                type: 'array',
                maxItems: 6,
                items: {
                  type: 'object',
                  properties: { title: { type: 'string' } },
                  required: ['title'],
                },
              },
              tasks: {
                type: 'array',
                maxItems: 8,
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'משימה קונקרטית שאפשר להתחיל' },
                    estimatedMinutes: { type: 'integer', minimum: 5, maximum: 240 },
                    energyLevel: { type: 'string', enum: ['light', 'normal', 'deep'] },
                  },
                  required: ['title', 'estimatedMinutes'],
                },
              },
            },
            required: ['title', 'tasks'],
          },
        },
      },
      required: ['projects'],
    },
  },

  projectBreakdown: {
    name: 'propose_project_breakdown',
    description: 'הצע אבני דרך ומשימות לפרויקט קיים.',
    schema: {
      type: 'object',
      properties: {
        milestones: {
          type: 'array',
          maxItems: 6,
          items: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
        },
        tasks: {
          type: 'array',
          maxItems: 10,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              estimatedMinutes: { type: 'integer', minimum: 5, maximum: 240 },
              energyLevel: { type: 'string', enum: ['light', 'normal', 'deep'] },
            },
            required: ['title', 'estimatedMinutes'],
          },
        },
      },
      required: ['tasks'],
    },
  },

  taskSplit: {
    name: 'propose_task_split',
    description: 'פרק משימה גדולה לצעדים שאפשר להתחיל.',
    schema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          minItems: 2,
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              estimatedMinutes: { type: 'integer', minimum: 5, maximum: 240 },
              energyLevel: { type: 'string', enum: ['light', 'normal', 'deep'] },
            },
            required: ['title', 'estimatedMinutes'],
          },
        },
      },
      required: ['steps'],
    },
  },

  /* The daily plan schema from §109, with handles rather than raw ids. */
  dailyPlan: {
    name: 'phrase_daily_plan',
    description: 'נסח את התוכנית היומית שכבר חושבה.',
    schema: {
      type: 'object',
      properties: {
        mainFocusHandle: { type: 'string', description: 'המזהה הקצר של משימת המיקוד, למשל T1' },
        mustDoHandles: { type: 'array', maxItems: 3, items: { type: 'string' } },
        focusReason: { type: 'string', description: 'משפט אחד בעברית שמסביר למה דווקא היא, על סמך העובדות שניתנו' },
      },
      required: ['mainFocusHandle', 'focusReason'],
    },
  },

  nextAction: {
    name: 'phrase_next_action',
    description: 'נסח את ההמלצה מה לעשות עכשיו.',
    schema: {
      type: 'object',
      properties: {
        handle: { type: 'string' },
        sentence: { type: 'string', description: 'שתיים עד שלוש שורות: מה לעשות, כמה זמן, ולמה' },
      },
      required: ['handle', 'sentence'],
    },
  },

  classify: {
    name: 'classify_item',
    description: 'סווג פריט שנקלט בתיבת הקליטה.',
    schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['task', 'idea', 'note', 'goal', 'project'] },
        title: { type: 'string', description: 'ניסוח נקי של הפריט' },
        projectHandle: { type: 'string', description: 'מזהה קצר של פרויקט מתאים, או ריק' },
        reason: { type: 'string' },
      },
      required: ['kind', 'title'],
    },
  },

  weekSummary: {
    name: 'phrase_week_summary',
    description: 'נסח סיכום שבועי מתוך המספרים שניתנו.',
    schema: {
      type: 'object',
      properties: {
        headline: { type: 'string', description: 'שורה אחת על השבוע' },
        lines: { type: 'array', maxItems: 5, items: { type: 'string' } },
        nextFocus: { type: 'string', description: 'הצעה למיקוד לשבוע הבא, שורה אחת' },
      },
      required: ['lines'],
    },
  },

  explain: {
    name: 'phrase_explanation',
    description: 'נסח הסבר קצר להמלצה, על סמך העובדות שניתנו.',
    schema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'עד שתי שורות' } },
      required: ['text'],
    },
  },
};

/* ------------------------------------------------------------------ *
 * Plumbing
 * ------------------------------------------------------------------ */

function enabled() {
  return preferences().aiEnabled && available();
}

function record(requestType, result, contextItems) {
  const c = choice();
  db.insert('aiInteractions', {
    requestType,
    provider: c.providerId,
    model: c.model,
    ok: !!result.ok,
    error: result.ok ? '' : String(result.error || ''),
    contextItems: contextItems || 0,
    durationMs: result.durationMs || 0,
    at: Date.now(),
  });
}

/**
 * Ask a model, or say why not.
 * Never throws — every failure is a value the caller falls back from.
 */
async function ask(requestType, tool, context, instruction) {
  const result = await callStructured({
    system: SYSTEM,
    prompt: `${instruction}\n\n${context.text}`,
    tool,
    maxTokens: 1600,
  });
  record(requestType, result, context.itemCount);
  return result;
}

/* Bound to the signed-in account: guard.js gets a lookup that cannot reach
 * another user's records even if a model returns a real id from one. */
function lookup(collection, id) {
  return db.get(collection, id);
}

/* ------------------------------------------------------------------ *
 * The interface
 * ------------------------------------------------------------------ */

/**
 * Propose a structure for a goal.
 * Resolves to {origin, projects, error?} — `origin` says who wrote it.
 */
export async function generateGoalPlan(goal) {
  const snap = snapshot();
  const local = rules.generateGoalPlan(goal, snap);
  if (!enabled()) return local;

  const context = buildAIContext('goalBreakdown', snap, { goal });
  const result = await ask('goalBreakdown', SCHEMAS.goalPlan, context,
    'הצע תוכנית לפירוק המטרה: פרויקט אחד (לכל היותר שניים), אבני דרך משמעותיות, '
    + 'ומשימות ראשונות שאפשר להתחיל השבוע. משימה היא פעולה קונקרטית, לא כותרת.');

  if (!result.ok) return Object.assign({}, local, { error: result.error });

  const projects = capList(result.value.projects, 2).map((p) => ({
    title: String(p.title || '').slice(0, 100),
    dueDate: goal.targetDate || null,
    milestones: capList(p.milestones, 6).map((m) => ({ title: String(m.title || '').slice(0, 100) }))
      .filter((m) => m.title),
    tasks: capList(p.tasks, 8).map((t) => ({
      title: String(t.title || '').slice(0, 160),
      estimatedMinutes: Math.max(5, Math.min(240, Number(t.estimatedMinutes) || 30)),
      energyLevel: ['light', 'normal', 'deep'].includes(t.energyLevel) ? t.energyLevel : 'normal',
    })).filter((t) => t.title),
  })).filter((p) => p.title && p.tasks.length);

  if (!projects.length) return Object.assign({}, local, { error: AI_ERRORS.BAD_OUTPUT });
  return { origin: 'model', projects };
}

export async function breakDownProject(project) {
  const snap = snapshot();
  const local = rules.breakDownProject(project, snap);
  if (!enabled()) return local;

  const context = buildAIContext('projectBreakdown', snap, { project });
  const result = await ask('projectBreakdown', SCHEMAS.projectBreakdown, context,
    'הצע את המשימות שחסרות בפרויקט הזה. אל תחזור על משימות שכבר קיימות. '
    + 'כל משימה היא פעולה שאפשר להתחיל, עם הערכת זמן.');

  if (!result.ok) return Object.assign({}, local, { error: result.error });

  const tasks = capList(result.value.tasks, 10).map((t) => ({
    title: String(t.title || '').slice(0, 160),
    estimatedMinutes: Math.max(5, Math.min(240, Number(t.estimatedMinutes) || 30)),
    energyLevel: ['light', 'normal', 'deep'].includes(t.energyLevel) ? t.energyLevel : 'normal',
  })).filter((t) => t.title);

  if (!tasks.length) return Object.assign({}, local, { error: AI_ERRORS.BAD_OUTPUT });

  return {
    origin: 'model',
    milestones: capList(result.value.milestones, 6)
      .map((m) => ({ title: String(m.title || '').slice(0, 100) })).filter((m) => m.title),
    tasks,
  };
}

export async function splitTask(task) {
  const local = rules.splitTask(task);
  if (!enabled()) return local;

  const snap = snapshot();
  const context = buildAIContext('taskSplit', snap, { task });
  const result = await ask('taskSplit', SCHEMAS.taskSplit, context,
    'פרק את המשימה לצעדים. הצעד הראשון צריך להיות קטן מספיק כדי להתחיל עכשיו.');

  if (!result.ok) return Object.assign({}, local, { error: result.error });

  const steps = capList(result.value.steps, 6).map((s) => ({
    title: String(s.title || '').slice(0, 160),
    estimatedMinutes: Math.max(5, Math.min(240, Number(s.estimatedMinutes) || 20)),
    energyLevel: ['light', 'normal', 'deep'].includes(s.energyLevel) ? s.energyLevel : task.energyLevel,
  })).filter((s) => s.title);

  if (steps.length < 2) return Object.assign({}, local, { error: AI_ERRORS.BAD_OUTPUT });
  return { origin: 'model', steps };
}

/** Ranking is never delegated. This exists so the interface is complete. */
export function prioritizeTasks(tasks) {
  return rules.prioritizeTasks(tasks, snapshot());
}

/**
 * The daily plan.
 *
 * The model does not choose the tasks and does not choose the times — the
 * planner did both, deterministically, before this function was called. What
 * it may do is disagree about which of the placed tasks deserves to be the
 * headline, and write the sentence explaining it. Anything it returns that is
 * not in the plan is discarded.
 */
export async function generateDailyPlan(opts) {
  const snap = snapshot();
  const plan = rules.generateDailyPlan(snap, opts);
  if (!enabled() || !plan.mainFocus) return plan;

  const context = buildAIContext('dailyPlan', snap, { plan });
  const result = await ask('dailyPlan', SCHEMAS.dailyPlan, context,
    'התוכנית כבר חושבה. בחר מתוך המשימות שניתנו את זו שראויה להיות המיקוד המרכזי, '
    + 'וכתוב משפט אחד שמסביר למה — על סמך העובדות שבשורה שלה בלבד.');

  if (!result.ok) return Object.assign({}, plan, { error: result.error });

  const focusId = resolveHandle(context, result.value.mainFocusHandle);
  const checked = checkIds({ taskId: focusId }, { taskId: 'tasks' }, lookup);

  /* An id that is not in the plan is not a disagreement, it is an invention. */
  const placed = new Set(plan.placements.map((p) => p.taskId));
  if (!checked.ok || !focusId || !placed.has(focusId)) {
    return Object.assign({}, plan, { error: AI_ERRORS.BAD_OUTPUT, rejectedId: result.value.mainFocusHandle });
  }

  const chosen = plan.ranked.find((t) => t.id === focusId);
  const mustDoIds = resolveHandles(context, result.value.mustDoHandles)
    .filter((id) => placed.has(id))
    .slice(0, 3);

  return Object.assign({}, plan, {
    origin: 'model',
    mainFocus: {
      task: chosen,
      placement: plan.placements.find((p) => p.taskId === focusId) || null,
      reasons: plan.mainFocus.reasons,
      sentence: String(result.value.focusReason || '').slice(0, 300),
    },
    mustDo: mustDoIds.length
      ? mustDoIds.map((id) => plan.mustDo.find((m) => m.task.id === id)
        || { task: plan.ranked.find((t) => t.id === id), reasons: [], placement: null })
        .filter((m) => m.task)
      : plan.mustDo,
  });
}

export function replanDay(opts) {
  /* Never a model. Moving somebody's calendar on a model's say-so is exactly
   * the class of action §110 puts out of bounds, and the diff is arithmetic. */
  return rules.replan(snapshot(), opts);
}

/**
 * What to do right now. The most important answer in the app (§200).
 *
 * The task is chosen locally. The model writes the sentence — and only if it
 * agrees with the choice, because a beautifully-written recommendation for a
 * different task than the one the engine picked would leave the interface
 * showing two answers.
 */
export async function suggestNextAction(opts) {
  const snap = snapshot();
  const local = rules.nextAction(snap, opts);
  if (!enabled() || !local.ok) return local;

  const context = buildAIContext('nextAction', snap, {
    suggestion: local,
    candidates: [local.task].concat(local.alternative ? [local.alternative.task] : []),
  });
  const result = await ask('nextAction', SCHEMAS.nextAction, context,
    'נסח את ההמלצה למשימה הראשונה ברשימה. שתיים עד שלוש שורות: מה לעשות, כמה זמן, ולמה — '
    + 'כשה"למה" נשען על תאריך היעד, על התלויות או על הפרויקט שמופיעים בשורה שלה.');

  if (!result.ok) return Object.assign({}, local, { error: result.error });

  const id = resolveHandle(context, result.value.handle);
  if (id !== local.task.id) {
    return Object.assign({}, local, { error: AI_ERRORS.BAD_OUTPUT });
  }

  return Object.assign({}, local, {
    origin: 'model',
    sentence: String(result.value.sentence || '').slice(0, 400) || local.sentence,
  });
}

export async function classifyInboxItem(text) {
  const snap = snapshot();
  const local = rules.classifyInboxItem(text, snap);
  if (!enabled()) return local;

  const context = buildAIContext('classifyInbox', snap, { text });
  const result = await ask('classifyInbox', SCHEMAS.classify, context,
    'סווג את הפריט, נסח אותו נקי, והצע פרויקט קיים אם הוא מתאים באמת. '
    + 'אם אף פרויקט לא מתאים, השאר את השדה ריק.');

  if (!result.ok) return Object.assign({}, local, { error: result.error });

  const projectId = resolveHandle(context, result.value.projectHandle);
  const checked = checkIds({ projectId }, { projectId: 'projects' }, lookup);
  const finalProjectId = checked.ok && projectId ? projectId : null;
  const project = finalProjectId ? db.get('projects', finalProjectId) : null;

  return {
    origin: 'model',
    kind: result.value.kind || 'task',
    title: String(result.value.title || local.title).slice(0, 200),
    /* The parsed dates and durations come from the local parser regardless.
     * A regular expression that read "17:00" is more reliable than a model
     * that read "17:00", and it cannot mistype it. */
    fields: local.fields,
    projectId: finalProjectId,
    projectTitle: project ? project.title : null,
    reason: String(result.value.reason || '').slice(0, 200),
    confidence: finalProjectId ? 0.8 : 0,
  };
}

export function extractTaskFromText(text) {
  /* Local always. See classifyInboxItem. */
  return rules.extractTaskFromText(text, snapshot());
}

export async function summarizeWeek(review) {
  const local = rules.summarizeWeek(review);
  if (!enabled() || review.stats.empty) return local;

  const snap = snapshot();
  const context = buildAIContext('weekSummary', snap, {
    stats: review.stats,
    projectMovement: review.stats.projectMovement,
    needsAttention: review.needsAttention,
  });
  const result = await ask('weekSummary', SCHEMAS.weekSummary, context,
    'נסח סיכום שבועי מהמספרים שניתנו. אל תוסיף מספרים שלא קיבלת ואל תאפיין את השבוע כטוב או רע. '
    + 'בסוף, הצע מיקוד אחד לשבוע הבא על סמך מה שדורש תשומת לב.');

  if (!result.ok) return Object.assign({}, local, { error: result.error });

  const lines = capList(result.value.lines, 5).map((l) => String(l).slice(0, 200)).filter(Boolean);
  if (!lines.length) return Object.assign({}, local, { error: AI_ERRORS.BAD_OUTPUT });

  return {
    origin: 'model',
    lines,
    headline: String(result.value.headline || local.headline || '').slice(0, 200),
    nextFocus: String(result.value.nextFocus || '').slice(0, 200),
    attention: local.attention,
  };
}

export async function explainRecommendation(item) {
  const snap = snapshot();
  const local = rules.explainRecommendation(item, snap);
  if (!enabled() || !local.text) return local;

  const context = buildAIContext('explain', snap, {
    title: item.title || (item.task ? item.task.title : ''),
    facts: [local.text],
  });
  const result = await ask('explain', SCHEMAS.explain, context,
    'נסח מחדש את ההסבר בשתי שורות לכל היותר. אל תוסיף עובדות.');

  if (!result.ok) return Object.assign({}, local, { error: result.error });
  const text = String(result.value.text || '').slice(0, 300);
  return text ? { origin: 'model', text } : local;
}

/** Is the assistant on and usable? The interface asks before offering it. */
export function status() {
  const prefs = preferences();
  return {
    enabled: prefs.aiEnabled,
    hasKey: available(),
    usable: enabled(),
    choice: choice(),
  };
}

export { AI_ERRORS };
