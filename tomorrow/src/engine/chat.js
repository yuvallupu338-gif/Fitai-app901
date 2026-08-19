/*
 * chat.js — asking TomorrowAI about your day.
 *
 * There is no model API connected to this app, and this file does not pretend
 * otherwise. Every answer below is produced locally from the forecast that is
 * already on screen: real numbers, real times, the same ones the cards show.
 * The interface says so out loud, there is no typing indicator for a request
 * that is not happening, and no invented latency.
 *
 * That is a deliberate product decision rather than a limitation being
 * apologised for. The questions people actually ask an app like this — how does
 * tomorrow look, when should I do the hard thing, why did the number drop, find
 * me an hour — are questions the engine already knows the answer to. Routing
 * them through a language model would make them slower, less accurate and
 * dependent on a network. What a model would genuinely add is understanding
 * phrasings this matcher misses, so setAdapter() leaves the seam open and the
 * fallback answer is honest about what it did not understand.
 */

import { fromMinutes } from '../core/time.js';
import { duration as fmtDuration, range as fmtRange, signed } from '../core/fmt.js';
import { simulate } from './simulate.js';
import { suggestSlot } from './scheduler.js';

export const CHAT_MODE = 'local';

export const SUGGESTIONS = [
  'איך מחר נראה?',
  'מה הדבר הכי חשוב שאשנה?',
  'מתי כדאי לי לעשות את המשימה הקשה ביותר?',
  'למה הציון של מחר ירד?',
  'מה יקרה אם אלך לישון ב-23:00?',
  'יש לי יותר מדי עומס מחר?',
  'תמצא לי שעה לפרויקט',
];

/*
 * An optional external answerer. Nothing in the app sets one today; it exists
 * so that adding a real model later is a change in one place rather than a
 * rewrite of the chat screen. When it is set the UI must stop claiming answers
 * are local — see ui/chat.js, which reads mode() rather than CHAT_MODE.
 */
let adapter = null;

export function setAdapter(fn) {
  adapter = typeof fn === 'function' ? fn : null;
}

export function mode() {
  return adapter ? 'remote' : CHAT_MODE;
}

export function hasAdapter() {
  return adapter !== null;
}

/* ------------------------------------------------------------------ *
 * Intent matching
 *
 * Ordered, first match wins. Order matters: "למה הציון ירד" contains the word
 * for score and would otherwise be answered by the general how-does-tomorrow-
 * look reply, which is true and unhelpful.
 * ------------------------------------------------------------------ */

const EFFORT = { low: 0, medium: 1, high: 2 };

const INTENTS = [
  { key: 'why', test: /למה.*(ציון|ירד|נמוך|עלה)|מה.*הוריד|מה.*השפיע/ },
  { key: 'whatif', test: /מה יקרה אם|מה אם|אם אלך לישון|אם אקום|בוא ננסה/ },
  { key: 'findtime', test: /תמצא|מצא לי|איפה אפשר|יש לי זמן|מתי אני פנוי/ },
  { key: 'hardest', test: /(משימה|דבר).*(קש|כבד|מסובך)|מתי.*(ללמוד|לעבוד|להתרכז)|חלון ריכוז|הכי מרוכז/ },
  { key: 'overload', test: /עומס|יותר מדי|עמוס|לחוץ|מספיק זמן|אספיק/ },
  { key: 'change', test: /(הכי חשוב|מה כדאי|מה לשנות|איך לשפר|שיפור|מה אשנה)/ },
  { key: 'sleep', test: /שינה|לישון|מתי ללכת לישון|כמה שעות/ },
  { key: 'risk', test: /סיכון|בעיה|מה יכול להשתבש|איפה.*תקוע/ },
  { key: 'tomorrow', test: /מחר|היום שלי|התחזית|ציון/ },
];

function detect(question) {
  const q = String(question || '').trim();
  for (const i of INTENTS) if (i.test.test(q)) return i.key;
  return 'unknown';
}

/* ------------------------------------------------------------------ *
 * Answers
 * ------------------------------------------------------------------ */

function hardestOf(items) {
  const pool = items.filter((i) => i.status === 'planned' && i.type !== 'break');
  if (!pool.length) return null;
  return pool.slice().sort((a, b) => {
    const ea = EFFORT[a.focusRequirement] * 2 + EFFORT[a.energyRequirement] + a.difficulty / 5;
    const eb = EFFORT[b.focusRequirement] * 2 + EFFORT[b.energyRequirement] + b.difficulty / 5;
    return eb - ea || (a.id < b.id ? -1 : 1);
  })[0];
}

/*
 * Times mentioned in a question, so "what if I go to sleep at 23:00" can be
 * simulated rather than answered in general terms. Only the first is used —
 * a second one is more likely to be part of a different clause than a range.
 */
function timeIn(question) {
  const hhmm = /(\d{1,2}):(\d{2})/.exec(question);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    if (h < 24 && m < 60) return h * 60 + m;
  }
  const bare = /\bב-?\s*(\d{1,2})\b/.exec(question);
  if (bare) {
    const h = Number(bare[1]);
    // A bare hour in a sentence about bedtime means the evening one. Nobody
    // asks what happens if they go to sleep at eleven in the morning.
    if (h >= 1 && h <= 11 && /לישון|שינה/.test(question)) return (h + 12) * 60;
    if (h < 24) return h * 60;
  }
  return null;
}

function answerTomorrow(c) {
  const f = c.forecast;
  const parts = [`הציון של מחר עומד על ${f.score} מתוך 100 — ${f.label}.`];
  if (f.focusWindows.length) {
    const w = f.focusWindows[0];
    parts.push(`הריכוז הכי חזק צפוי בין ${fmtRange(w.start, w.end - w.start, c.profile.timeFormat)}.`);
  }
  if (f.risks.length) parts.push(`מה שכדאי לשים לב אליו: ${f.risks[0].title.toLowerCase()}.`);
  else parts.push('לא זיהיתי משהו שנראה בעייתי ביום עצמו.');
  if (f.confidence.learningMode) {
    parts.push(`שים לב שאני עדיין לומד אותך — רמת הביטחון בתחזית הזו היא ${f.confidence.overall}%.`);
  }
  return { text: parts.join(' '), kind: 'tomorrow', followups: ['מה הדבר הכי חשוב שאשנה?', 'יש לי יותר מדי עומס מחר?'] };
}

function answerWhy(c) {
  const f = c.forecast;
  const down = f.reasons.down;
  const up = f.reasons.up;
  const lines = [`הציון ${f.score} מורכב משישה גורמים.`];
  if (down.length) lines.push(`מה שמושך אותו למטה: ${down.join('; ')}.`);
  if (up.length) lines.push(`מה שמחזיק אותו: ${up.join('; ')}.`);
  const worst = f.factors.slice().sort((a, b) => a.score - b.score)[0];
  if (worst) lines.push(`הגורם החלש ביותר כרגע הוא ${worst.label} (${worst.score}).`);
  return { text: lines.join(' '), kind: 'why', followups: ['מה הדבר הכי חשוב שאשנה?'] };
}

function answerChange(c) {
  const rec = c.forecast.recommendation;
  if (!rec) {
    return {
      text: 'לא מצאתי שינוי אחד שישפר את מחר בצורה משמעותית — היום נראה מסודר יחסית כמו שהוא.',
      kind: 'change', followups: ['איך מחר נראה?'],
    };
  }
  return {
    text: `${rec.title}. ${rec.detail} התחזית עוברת מ-${rec.from} ל-${rec.to}.`,
    kind: 'change', followups: ['מה יקרה אם אלך לישון ב-23:00?'],
  };
}

function answerHardest(c) {
  const f = c.forecast;
  const item = hardestOf(c.items);
  if (!f.focusWindows.length) {
    return {
      text: 'לא מצאתי מחר חלון ריכוז ארוך מספיק כדי להמליץ עליו בביטחון. היום די מלא מקצה לקצה.',
      kind: 'hardest', followups: ['יש לי יותר מדי עומס מחר?'],
    };
  }
  const w = f.focusWindows[0];
  const when = fmtRange(w.start, w.end - w.start, c.profile.timeFormat);
  if (!item) {
    return {
      text: `החלון החזק ביותר של מחר הוא ${when}, ברמת ביטחון ${Math.round(w.confidence)}%. אין כרגע משימה שמתאימה לשים בו.`,
      kind: 'hardest', followups: ['תמצא לי שעה לפרויקט'],
    };
  }
  const already = item.start !== null && item.start >= w.start - 15 && item.start < w.end;
  const text = already
    ? `"${item.title}" כבר יושבת על החלון החזק ביותר שלך, ${when}. הייתי משאיר אותה שם.`
    : `הייתי שם את "${item.title}" ב-${when} — זה החלון שבו הריכוז שלך צפוי להיות הכי גבוה מחר.`;
  return { text, kind: 'hardest', followups: ['מה הדבר הכי חשוב שאשנה?'] };
}

function answerOverload(c) {
  const f = c.forecast;
  const risk = f.risks.find((r) => r.key === 'overload' || r.key === 'no_free_time');
  const booked = fmtDuration(f.totals.loadMinutes);
  const free = fmtDuration(f.totals.freeMinutes);
  if (!risk) {
    return {
      text: `לא נראה עמוס במיוחד: ${booked} תפוסים מתוך היום, ונשארים ${free} פנויים.`,
      kind: 'overload', followups: ['מתי כדאי לי לעשות את המשימה הקשה ביותר?'],
    };
  }
  return {
    text: `${risk.reason} כרגע יש ${booked} תפוסים ו-${free} פנויים. ${risk.suggestion}`,
    kind: 'overload', followups: ['מה הדבר הכי חשוב שאשנה?'],
  };
}

function answerSleep(c) {
  const f = c.forecast;
  const night = fmtDuration(f.totals.sleepMinutes);
  const sleepFactor = f.factors.find((x) => x.key === 'sleep');
  const bed = fromMinutes(c.plan.nextBedtime);
  const parts = [`מחר אתה מתוכנן על ${night} שינה, והשעה שסימנת לכיבוי אורות היא ${bed}.`];
  if (sleepFactor) parts.push(`זה נותן לגורם השינה ${sleepFactor.score} מתוך 100.`);
  const rec = f.recommendation;
  if (rec && rec.key === 'bedtime') parts.push(`${rec.title} היה משפר את התחזית ל-${rec.to}.`);
  return { text: parts.join(' '), kind: 'sleep', followups: ['מה יקרה אם אלך לישון ב-23:00?'] };
}

function answerRisk(c) {
  const f = c.forecast;
  if (!f.risks.length) {
    return { text: 'לא זיהיתי מחר סיכון שווה אזכור. זה לא אומר שהכול ילך חלק, רק שאין משהו בולט בנתונים.', kind: 'risk', followups: ['איך מחר נראה?'] };
  }
  const lines = f.risks.slice(0, 2).map((r) => `${r.title} — ${r.reason} ${r.suggestion}`);
  return { text: lines.join(' '), kind: 'risk', followups: ['מה הדבר הכי חשוב שאשנה?'] };
}

/*
 * "What if I go to sleep at eleven" is answered by actually running the
 * scenario, not by describing what usually happens. If the sandbox says 86,
 * this says 86, because both call the same forecast.
 */
function answerWhatIf(c, question) {
  const at = timeIn(question);
  const wantsSleep = /לישון|שינה/.test(question);
  const wantsWake = /לקום|קימה|אקום/.test(question);
  if (at === null || (!wantsSleep && !wantsWake)) {
    return {
      text: 'אפשר לבדוק את זה במסך "מה אם" — שם אפשר לשנות שעת שינה, שעת קימה או מיקום של משימה ולראות איך התחזית זזה. לא הצלחתי לחלץ מהשאלה שעה מדויקת לבדוק.',
      kind: 'whatif', followups: ['מה יקרה אם אלך לישון ב-23:00?'],
    };
  }
  const mutation = wantsWake ? { kind: 'wake', minutes: at } : { kind: 'bedtime', minutes: at };
  const sc = simulate(c.input, [mutation]);
  const verb = wantsWake ? 'קימה' : 'שינה';
  if (sc.diff.score === 0) {
    return { text: `${verb} ב-${fromMinutes(at)} כמעט לא מזיזה את התחזית — הציון נשאר ${sc.next.score}.`, kind: 'whatif', followups: [] };
  }
  return {
    text: `${verb} ב-${fromMinutes(at)} מביאה את הציון מ-${sc.base.score} ל-${sc.next.score} (${signed(sc.diff.score)}). ${sc.summary.slice(1, 3).join(', ')}.`,
    kind: 'whatif', followups: ['מה הדבר הכי חשוב שאשנה?'],
  };
}

function answerFindTime(c, question) {
  const f = c.forecast;
  const wantedMinutes = /שעתיים/.test(question) ? 120 : /חצי שעה/.test(question) ? 30 : 60;
  const probe = {
    id: 'itm_probe', kind: 'task', type: 'task', title: 'זמן פנוי', notes: '',
    date: c.forecast.date, start: null, duration: wantedMinutes, locked: false,
    category: 'work', priority: 'medium', deadline: null,
    estimatedDuration: wantedMinutes, actualDuration: null, difficulty: 3,
    energyRequirement: 'medium', focusRequirement: 'high', preferredTime: 'any',
    status: 'planned', isTop: false, createdAt: c.profile.createdAt, completedAt: null,
  };
  const slot = suggestSlot(probe, Object.assign({}, c.input, {
    energy: f.energy, focus: f.focus, focusWindows: f.focusWindows,
  }));
  if (!slot) {
    return {
      text: `לא מצאתי מחר ${fmtDuration(wantedMinutes)} רצופים שלא דורסים משהו אחר. אם זה חשוב, כדאי להזיז או לדחות משהו קיים.`,
      kind: 'findtime', followups: ['מה הדבר הכי חשוב שאשנה?'],
    };
  }
  return {
    text: `יש מקום ב-${fmtRange(slot.start, wantedMinutes, c.profile.timeFormat)}. ${slot.reason}`,
    kind: 'findtime', followups: ['מתי כדאי לי לעשות את המשימה הקשה ביותר?'],
  };
}

function answerUnknown(c) {
  return {
    text: 'לא הבנתי בדיוק את השאלה. אני עונה מתוך התחזית של מחר — אפשר לשאול איך מחר נראה, מה כדאי לשנות, מתי לעשות את המשימה הקשה, למה הציון הוא מה שהוא, או מה יקרה אם תלך לישון בשעה מסוימת.',
    kind: 'unknown',
    followups: SUGGESTIONS.slice(0, 3),
  };
}

/**
 * Answer one question from the day that is already on screen.
 *
 * `context` carries the live forecast plus the raw input it was built from, so
 * the what-if answers can re-run the engine rather than describe it.
 */
export function answer(question, context) {
  const c = Object.assign({ items: [], insights: [], history: [] }, context);
  c.input = c.input || {
    date: c.forecast.date, profile: c.profile, plan: c.plan, items: c.items,
    learning: c.learning, history: c.history, now: c.now, morning: c.morning || null,
  };

  switch (detect(question)) {
    case 'why': return answerWhy(c);
    case 'whatif': return answerWhatIf(c, String(question));
    case 'findtime': return answerFindTime(c, String(question));
    case 'hardest': return answerHardest(c);
    case 'overload': return answerOverload(c);
    case 'change': return answerChange(c);
    case 'sleep': return answerSleep(c);
    case 'risk': return answerRisk(c);
    case 'tomorrow': return answerTomorrow(c);
    default: return answerUnknown(c);
  }
}
