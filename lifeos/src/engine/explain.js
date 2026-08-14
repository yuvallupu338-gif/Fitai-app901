/*
 * explain.js — reason codes into Hebrew sentences.
 *
 * The engines return codes because they run in tests where there is no
 * interface, and because the same reason needs different wording in a card, a
 * tooltip and a prompt. This is the single place that turns them into words,
 * which means the Hebrew audit has one file to check and a new reason code
 * cannot ship without a sentence.
 *
 * WHAT A GOOD EXPLANATION LOOKS LIKE.
 *
 * §69 and §197 both make the same point from different directions. Not:
 *
 *     "כדאי להתמקד במשימות החשובות"
 *
 * which is true of everything and says nothing. But:
 *
 *     "תתחיל בניווט של האתר. יש לך 50 דקות פנויות, הוא אמור לקחת בערך 35
 *      דקות והוא חוסם את הבדיקות של מחר."
 *
 * Every clause there is a number or a name out of the database. That is the
 * standard every sentence in this file is held to: if it cannot be traced to a
 * field, it does not get written.
 *
 * The sentences are also short and they stop. An explanation listing five
 * reasons is an explanation nobody finishes; the top two are what a person
 * needs to decide whether they agree.
 */

import { REASONS } from './planner.js';
import { HEALTH_REASONS } from './health.js';
import { formatDuration, formatTimeRange, relativeDay, formatDate } from '../core/time.js';
import { plural } from '../core/i18n.js';

/** One reason → one clause. Returns null for a code with nothing to add. */
export function reasonText(reason, ctx) {
  const c = ctx || {};
  switch (reason.code) {
    case REASONS.OVERDUE:
      return reason.days === 1
        ? 'היא באיחור של יום.'
        : `היא באיחור של ${reason.days === 2 ? 'יומיים' : `${reason.days} ימים`}.`;

    case REASONS.DUE_TODAY:
      return 'תאריך היעד הוא היום.';

    case REASONS.DUE_SOON:
      return reason.days === 1
        ? 'תאריך היעד הוא מחר.'
        : `תאריך היעד בעוד ${reason.days === 2 ? 'יומיים' : `${reason.days} ימים`}.`;

    case REASONS.BLOCKS_OTHERS: {
      if (reason.count === 1 && reason.titles && reason.titles[0]) {
        return `היא חוסמת את "${reason.titles[0]}".`;
      }
      return `היא ${plural('count.unlocks', reason.count)}.`;
    }

    case REASONS.TOP_GOAL:
      return `היא שייכת למטרה "${reason.title}", שהגדרת כחשובה.`;

    case REASONS.TOP_PROJECT:
      return `היא בפרויקט "${reason.title}", שמוביל כרגע.`;

    case REASONS.PROJECT_AT_RISK:
      return `הפרויקט "${reason.title}" לא בקצב.`;

    case REASONS.NEXT_MILESTONE:
      return `היא מקדמת את אבן הדרך "${reason.title}".`;

    case REASONS.IN_PROGRESS:
      return 'כבר התחלת אותה.';

    case REASONS.FITS_WINDOW:
      return `יש לך ${formatDuration(reason.have)} והיא אמורה לקחת ${formatDuration(reason.need)}.`;

    case REASONS.ONLY_FIT:
      return 'היא היחידה שנכנסת לזמן שנשאר.';

    case REASONS.QUICK:
      return `היא קצרה — ${formatDuration(reason.minutes)}.`;

    case REASONS.LOW_ENERGY:
      return 'היא לא דורשת ריכוז מיוחד.';

    default:
      return c.strict ? null : null;
  }
}

/**
 * A paragraph from a reason list. Two clauses, joined.
 *
 * Two rather than all of them because reasons are returned strongest first and
 * the third is almost always weaker than the reader's patience.
 */
export function explainReasons(reasons, opts) {
  const o = opts || {};
  const limit = o.limit || 2;
  const parts = (reasons || [])
    .map((r) => reasonText(r, o))
    .filter(Boolean)
    .slice(0, limit);
  return parts.join(' ');
}

/**
 * The full sentence for a next-action suggestion — the one §200 specifies.
 *
 *   "תעבוד 35 דקות על הניווט באתר. יש לך כרגע חלון פנוי של 50 דקות, המשימה
 *    חוסמת את הבדיקות שתכננת למחר והיא שייכת לפרויקט בעל העדיפות הגבוהה
 *    ביותר שלך."
 */
export function explainNextAction(suggestion) {
  if (!suggestion || !suggestion.ok) return '';
  const lead = `${formatDuration(suggestion.suggestedMinutes)} על "${suggestion.task.title}".`;
  const windowClause = `יש לך חלון פנוי של ${formatDuration(suggestion.availableMinutes)}`;
  const rest = explainReasons(suggestion.reasons, { limit: 2 });
  return rest ? `${lead} ${windowClause}. ${rest}` : `${lead} ${windowClause}.`;
}

/** Why a project is in the state it is in. */
export function explainHealth(reasons) {
  const parts = [];
  for (const reason of reasons || []) {
    switch (reason.code) {
      case HEALTH_REASONS.DONE:
        parts.push('הפרויקט הושלם.');
        break;
      case HEALTH_REASONS.NO_TASKS:
        parts.push('אין בפרויקט משימות פתוחות.');
        break;
      case HEALTH_REASONS.BLOCKED_TASKS:
        parts.push(`${plural('count.blocked', reason.count)}.`);
        break;
      case HEALTH_REASONS.BEHIND:
        parts.push(reason.shortfall
          ? `לפי ההערכות חסרות ${formatDuration(reason.shortfall)} כדי לסיים בזמן.`
          : 'לפי הקצב הנוכחי הפרויקט לא יסתיים בזמן.');
        break;
      case HEALTH_REASONS.TIGHT_WINDOW:
        parts.push(`נשאר מעט זמן ביחס לעבודה שנותרה — ${formatDuration(reason.needed)} מול ${formatDuration(reason.available)} פנויות.`);
        break;
      case HEALTH_REASONS.STALE:
        parts.push(reason.days
          ? `לא הייתה פעילות בפרויקט ${reason.days === 1 ? 'יום' : `${reason.days} ימים`}.`
          : 'הפרויקט מושהה.');
        break;
      case HEALTH_REASONS.NO_CAPACITY:
        parts.push('לא הוקצה לפרויקט זמן בלוח השנה.');
        break;
      case HEALTH_REASONS.RECENT_PROGRESS:
        parts.push('הייתה התקדמות לאחרונה.');
        break;
      case HEALTH_REASONS.ON_SCHEDULE:
        parts.push('קצב ההתקדמות מספיק לתאריך הסיום.');
        break;
      case HEALTH_REASONS.NO_DEADLINE:
        parts.push('אין תאריך סיום, אז אין לחץ זמן.');
        break;
      default:
        break;
    }
  }
  return parts.slice(0, 2).join(' ');
}

/** One line describing a planned change, for the replan preview. */
export function explainChange(change) {
  const title = `"${change.title}"`;
  switch (change.type) {
    case 'schedule':
      return `לתזמן את ${title} ל־${formatTimeRange(change.to.start, change.to.end)}`;
    case 'move':
      if (change.keptForDeadline) return `${title} נשארת ב־${formatTimeRange(change.from.start, change.from.end)} בגלל תאריך היעד`;
      return `להזיז את ${title} מ־${formatTimeRange(change.from.start, change.from.end)} ל־${formatTimeRange(change.to.start, change.to.end)}`;
    case 'moveDay':
      return `להעביר את ${title} ל${relativeDay(change.to.date)}`;
    case 'unschedule':
      return `להוריד את ${title} מהלו״ז`;
    default:
      return title;
  }
}

/** The morning brief, assembled from facts rather than written. */
export function explainBrief(plan, opts) {
  const o = opts || {};
  const lines = [];

  const events = (o.events || []).filter((e) => e.date === plan.date && !e.allDay);
  if (events.length) {
    lines.push(`יש לך היום ${plural('count.events', events.length)} קבועים.`);
  } else {
    lines.push('אין היום אירועים קבועים.');
  }

  const best = plan.facts.bestWindow;
  if (best) {
    lines.push(`חלון המיקוד הטוב ביותר כרגע הוא ${formatTimeRange(best.start, best.end)}.`);
  } else if (plan.capacity.isRestDay) {
    lines.push('זה יום שביקשת לא לתכנן בו.');
  } else {
    lines.push('אין היום חלון פנוי משמעותי.');
  }

  if (plan.mainFocus) {
    lines.push(`העדיפות המרכזית: ${plan.mainFocus.task.title}.`);
  }

  const overdue = (o.tasks || []).filter(
    (t) => t.dueDate && t.dueDate < plan.date && t.status !== 'done' && t.status !== 'cancelled',
  );
  if (overdue.length) lines.push(`יש ${plural('count.tasks', overdue.length)} באיחור.`);
  else lines.push('אין כרגע משימות דחופות באיחור.');

  return lines;
}

/** The evening wrap-up, same rules. */
export function explainWrapUp(opts) {
  const o = opts || {};
  const lines = [];

  if (o.completedCount > 0) lines.push(`${plural('count.tasksDone', o.completedCount)}.`);
  else lines.push('לא הושלמו היום משימות.');

  if (o.movedCount > 0) lines.push(`${plural('count.movedToTomorrow', o.movedCount)}.`);
  if (o.focusMinutes > 0) lines.push(`${formatDuration(o.focusMinutes)} מיקוד.`);
  if (o.topProjectTitle) lines.push(`הפרויקט המרכזי התקדם: ${o.topProjectTitle}.`);

  if (o.tomorrowFocus) lines.push(`המיקוד הראשון למחר: ${o.tomorrowFocus}.`);
  else lines.push('עוד לא נקבע מיקוד למחר.');

  return lines;
}

export { formatDate };
