/*
 * explain.js — the app's speaking voice.
 *
 * Templates over real numbers, and the register is the specification. Short,
 * calm, human. Never dramatic, never congratulatory, never scolding. Two
 * sentences at most, because a paragraph about somebody's Tuesday is a paragraph
 * nobody reads twice.
 *
 * The hedging is not politeness, it is accuracy. Every sentence about tomorrow
 * is about a model's estimate, and contract §0 makes saying so a rule rather
 * than a style: `צפוי`, `סביר`, `לפי הדפוס שלך`, never `יהיה`. A template that
 * states a prediction as fact is a bug, and the same one every night is nearly
 * as bad — so the phrasing varies with which factor actually moved, chosen
 * deterministically from the data rather than at random.
 *
 * Signed numbers come out of here as plain strings with a real minus sign
 * (U+2212). The UI wraps them with signedNum() so they do not detach from their
 * digits in an RTL paragraph — see core/dom.js for why that is a real problem.
 */

import { duration as fmtDuration, time as fmtTime, range as fmtRange } from '../core/fmt.js';

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function signed(n) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

/* ------------------------------------------------------------------ *
 * The day, in a sentence or two
 * ------------------------------------------------------------------ */

/*
 * Built from the shape of the day rather than from its score.
 *
 * A 74 that is 74 because of a short night and a 74 that is 74 because the
 * afternoon is stacked are different days and want different sentences. So the
 * opening clause comes from the strongest factor, the second from the weakest,
 * and the whole thing only mentions the score if neither says anything useful.
 */
export function explainDay(forecast) {
  const f = forecast;
  const factors = f.factors.slice().sort((a, b) => b.score - a.score);
  const best = factors[0];
  const worst = factors[factors.length - 1];
  const fmt = '24h';

  const opening = OPENERS[best.key] ? OPENERS[best.key](f) : `מחר נראה סביר בסך הכול`;

  let concern = '';
  if (worst.score < 62) {
    concern = CONCERNS[worst.key] ? CONCERNS[worst.key](f) : '';
  }

  const win = f.focusWindows[0];
  const closing = concern
    ? concern
    : win
      ? `החלון החזק ביותר שלך צפוי בין ${fmtRange(win.start, win.end - win.start, fmt)}.`
      : '';

  return [opening, closing].filter(Boolean).join(' ');
}

const OPENERS = {
  sleep: (f) => `הלילה שלפני מחר נראה טוב — ${fmtDuration(f.totals.sleepMinutes)} מתוכננות`,
  balance: () => 'העומס של מחר מפוזר יפה על פני היום',
  focus: (f) => {
    const w = f.focusWindows[0];
    return w
      ? `העבודה החשובה של מחר יושבת על שעות הריכוז החזקות שלך`
      : 'סדר היום של מחר מתאים לקצב שלך';
  },
  goals: () => 'הדברים שסימנת כחשובים מקבלים מקום אמיתי במחר',
  free: (f) => `נשאר לך במחר ${fmtDuration(f.totals.freeMinutes)} לא תפוסים`,
  risk: () => 'לא זיהיתי במחר נקודה שנראית בעייתית',
};

const CONCERNS = {
  sleep: (f) => `מה שמושך למטה זו השינה — ${fmtDuration(f.totals.sleepMinutes)} זה קצר מהרגיל שלך.`,
  balance: (f) => {
    const b = f.factors.find((x) => x.key === 'balance');
    return `החלק שדורש תשומת לב הוא העומס: ${b.detail}.`;
  },
  focus: () => 'המשימה התובענית ביותר יושבת בשעה שבה הריכוז שלך צפוי להיות נמוך יחסית.',
  goals: (f) => {
    const g = f.factors.find((x) => x.key === 'goals');
    return `${g.detail} — שווה לקבוע להם שעה.`;
  },
  free: (f) => `היום כמעט מלא: ${fmtDuration(f.totals.freeMinutes)} פנויים בלבד, וזה לא משאיר מקום למשהו שיימשך יותר מהצפוי.`,
  risk: (f) => (f.risks[0] ? `${f.risks[0].title} — ${f.risks[0].suggestion}` : ''),
};

/* ------------------------------------------------------------------ *
 * Why the score is what it is
 * ------------------------------------------------------------------ */

/**
 * The "why 74?" list.
 *
 * Arrows rather than prose, because this is a scan rather than a read: the user
 * has already asked the question and wants the four things that answer it, not
 * a paragraph that contains them.
 */
export function explainScore(forecast) {
  const out = [];
  for (const line of forecast.reasons.down) out.push(`↓ ${line}`);
  for (const line of forecast.reasons.up) out.push(`↑ ${line}`);
  if (!out.length) out.push('הציון יושב בדיוק על הממוצע שלך — אין גורם שבולט לכאן או לכאן.');
  return out;
}

/*
 * One factor, explained in terms of what would move it.
 *
 * Deliberately forward-looking. Somebody who taps a factor is asking what it
 * means, and the useful answer is what changes it — not a restatement of the
 * number they can already see.
 */
export function explainFactor(factor, forecast) {
  const f = forecast;
  switch (factor.key) {
    case 'sleep': {
      const total = fmtDuration(f.totals.sleepMinutes);
      return factor.score >= 78
        ? `${total} זו כמות טובה עבורך, והיא מרימה את כל עקומת האנרגיה של מחר.`
        : `${total} זה מתחת למה שאתה בדרך כלל צריך. הקדמה של חצי שעה בשינה היא בדרך כלל השינוי הכי משתלם ביום.`;
    }
    case 'balance':
      return factor.score >= 75
        ? 'העומס מפוזר, כך שאין חלק ביום שנושא את כל המשקל.'
        : 'כשמשימות תובעניות נערמות זו על זו, מה שנפגע זו בדרך כלל האחרונה שבהן. פתיחת רווח באמצע שווה יותר ממה שהיא עולה.';
    case 'focus':
      return factor.score >= 75
        ? 'העבודה שדורשת ראש צלול יושבת בשעות שבהן הוא צפוי להיות צלול.'
        : 'המשימה התובענית יושבת בשעה חלשה יחסית. הזזה שלה לחלון הריכוז החזק היא בדרך כלל השינוי בעל ההשפעה הגדולה ביותר על היום.';
    case 'goals':
      return factor.score >= 75
        ? 'הדברים שסימנת כחשובים מתוכננים, ובשעות סבירות.'
        : 'משימה חשובה בלי שעה היא הדרך הנפוצה ביותר שבה יום מתוכנן היטב לא קורה בפועל.';
    case 'free':
      return factor.score >= 70
        ? 'יש ביום מספיק אוויר כדי לספוג משהו שיימשך יותר מהצפוי.'
        : 'יום בלי זמן פנוי לא שורד את הדבר הראשון שנמשך יותר מדי, וזה כמעט תמיד קורה.';
    case 'risk':
      return f.risks.length
        ? `${f.risks[0].reason} ${f.risks[0].suggestion}`
        : 'לא מצאתי ביום הזה נקודה שנראית בעייתית.';
    default:
      return factor.detail;
  }
}

export function explainRisk(risk) {
  return `${risk.reason} ${risk.suggestion}`;
}

/*
 * A single proposed change, in terms of its effect rather than its mechanics.
 *
 * The change list already says what moves where. This says why it is worth
 * doing, which is the part somebody is deciding on.
 */
export function explainChange(change, forecast) {
  const fmt = (forecast && forecast.profile && forecast.profile.timeFormat) || '24h';
  switch (change.kind) {
    case 'bedtime': {
      const gained = change.from - change.to;
      return `${fmtDuration(gained)} שינה נוספות מרימות את כל עקומת האנרגיה של מחר, לא רק את הבוקר.`;
    }
    case 'move':
      return change.to === null
        ? 'הוצאת המשימה מהיום מפנה מקום לשאר.'
        : `ב-${fmtTime(change.to % 1440, fmt)} הריכוז שלך צפוי להיות גבוה יותר מאשר במיקום הנוכחי.`;
    case 'break':
      return 'רצף ארוך של עבודה נשחק מהר יותר משנדמה. הפסקה קצרה באמצע מחזירה יותר ממה שהיא לוקחת.';
    case 'defer':
      return 'זו המשימה הכי פחות דחופה ביום, והיא לא אחת מאלה שסימנת כחשובות.';
    case 'shorten': {
      const longer = change.to > change.from;
      return longer
        ? 'לפי ההיסטוריה שלך זה הזמן שמשימה כזו באמת לוקחת, ולתכנן פחות מזה זה מה ששובר את שאר היום.'
        : 'המשך המעודכן מבוסס על כמה זמן זה באמת לקח לך בפעמים הקודמות.';
    }
    default:
      return change.label;
  }
}

/**
 * What a scenario did, as a line of prose.
 *
 * Used by the chat, where a list of deltas would read as a machine talking.
 */
export function explainScenario(diff) {
  const bits = [];
  if (diff.score) bits.push(`הציון זז ${signed(diff.score)}`);
  if (Math.abs(diff.energy) >= 2) bits.push(`האנרגיה הממוצעת ${signed(diff.energy)}`);
  if (Math.abs(diff.free) >= 15) bits.push(`הזמן הפנוי ${signed(Math.round(diff.free))} דקות`);
  if (!bits.length) return 'השינוי הזה כמעט לא מזיז את התחזית.';
  return `${bits.join(', ')}.`;
}
