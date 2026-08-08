/*
 * retest.js — asking for the numbers again, every four weeks.
 *
 * The questionnaire reads four numbers and the engine picks exercise levels
 * from them. That was a one-off: whatever somebody could do on the day they
 * signed up decided what they were prescribed forever. A beginner's push-ups
 * roughly double in two months, so by week eight the plan is built on a number
 * that is no longer true, and it is wrong in the direction that wastes the
 * training — too easy, silently, with nothing on screen admitting it.
 *
 * So the app asks again. Four weeks, counted in days since the numbers were
 * recorded rather than in programme weeks — see benchmarks.js for why that
 * distinction matters for somebody who took a fortnight off.
 *
 * Two rules this screen exists to keep:
 *
 *   Nothing moves unless something moved. retestDelta() is consulted before
 *   the programme is touched, and the commonest honest outcome of a re-test is
 *   "the same". Rebuilding the week to announce that would punish measuring.
 *
 *   Declining works. "לא עכשיו" stops the asking for a week. A prompt with no
 *   way out gets answered with a guess, and a guessed number is worse than a
 *   stale measured one.
 *
 * The same form doubles as the way in for somebody who skipped the questions at
 * intake. Before it there was no way at all: the four fields existed only inside
 * the questionnaire, so a trainee who declined and later learned their push-up
 * count would have had to redo all ten steps to tell the app.
 */

import { h, announce } from '../core/dom.js';
import { STEPS } from '../intake/schema.js';
import { patternHe } from '../vision/apply.js';
import {
  RETEST_DAYS, RETEST_SNOOZE_DAYS, retestDue, daysUntilRetest, daysSinceBenchmarks,
  retestDelta, snoozeExpired, hasBenchmarks,
} from '../engine/benchmarks.js';

/*
 * The questions, taken from the questionnaire itself rather than retyped.
 *
 * The re-test has to ask exactly what was asked the first time or the two
 * numbers are not comparable, and a hand-copied list drifts the moment a fifth
 * benchmark is added. Reading STEPS keeps the labels, the units and the bounds
 * identical by construction.
 */
const FIELDS = STEPS
  .reduce((acc, s) => acc.concat(s.fields || []), [])
  .filter((f) => typeof f.key === 'string' && f.key.startsWith('bm_'))
  .map((f) => ({ key: f.key.slice(3), label: f.label, unit: f.unit, min: f.min, max: f.max }));

/*
 * The questions, named from the same place the form is built from.
 *
 * This sentence was hand-written as "שכיבות סמיכה, מתח, מקבילים ופלאנק" and
 * then a fifth benchmark was added — so the form asked five things and the
 * prompt promised four, with the squat missing. The comment on FIELDS above
 * predicted exactly this ("a hand-copied list drifts the moment a fifth
 * benchmark is added"); the code obeyed the rule and the prose beside it did
 * not. Now neither can.
 */
function fieldList() {
  const names = FIELDS.map((f) => String(f.label).replace(/ ברצף$/, ''));
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}`;
}

/** Should the re-test card be on screen right now? */
export function retestVisible(profile, ui, now) {
  return retestDue(profile, now) && snoozeExpired(ui && ui.retestSnoozeAt, now);
}

/**
 * One line for the plan tab, or null.
 *
 * The card itself lives in the tracking tab, which is where a measurement
 * belongs — but somebody who never opens that tab would never be asked, and an
 * app that only prompts where you already went is not prompting. This is the
 * part that does the asking; the tab it points at does the work.
 */
export function retestBanner(profile, ui, onGo, now) {
  if (!retestVisible(profile, ui, now)) return null;
  const days = daysSinceBenchmarks(profile, now);
  return h('div.callout.warn', { role: 'status' },
    h('h4', 'זמן למדוד מחדש'),
    h('p', days === null
      ? 'המספרים שהתוכנית בנויה עליהם נרשמו לפני זמן לא ידוע. בדיקה קצרה ואני מעדכן את הרמות.'
      : `עברו ${days} ימים מאז שמדדת. ${fieldList()} — `
        + 'כמה דקות, ואני מעדכן את הרמות לפי המספרים החדשים.'),
    h('div.toolbar', { style: { margin: '12px 0 0' } },
      h('button.btn.primary', { type: 'button', onclick: onGo }, 'למדידה'),
    ),
  );
}

/**
 * The measurement card for the tracking tab, or null when there is nothing to
 * say. Three states, in order of how loudly they ask:
 *
 *   due       — the four weeks are up. Amber, with a way to decline.
 *   never     — the questionnaire's number fields were skipped. A quiet offer,
 *               and the only way back in: without it, somebody who skipped the
 *               questions and later knows their push-up count would have to
 *               redo the entire questionnaire to tell the app.
 *   otherwise — one line saying when the next measurement is.
 *
 *   onApply(nextProfile, moved)  — moved is retestDelta()'s list. Empty means
 *                                  the numbers changed nothing and the caller
 *                                  must NOT rebuild the programme.
 *   onSnooze()                   — record the "not now".
 */
export function retestCard(profile, ui, handlers, now) {
  const cb = handlers || {};
  const due = retestVisible(profile, ui, now);
  const never = !hasBenchmarks(profile);
  if (!due && !never) return dueLater(profile, ui, now);

  const card = h(due ? 'div.callout.warn' : 'div.callout');
  const days = daysSinceBenchmarks(profile, now);
  card.appendChild(h('h4', never ? 'כוונון לפי מספרים' : 'מדידה מחדש'));
  if (never) {
    card.appendChild(h('p', 'דילגת על שאלות המספרים, אז רמת התרגילים נקבעה מהוותק שסימנת בלבד — '
      + 'וזה האומדן הגס ביותר שיש כאן. ארבעה מספרים ואני מכוון אותה במדויק.'));
  } else {
    card.appendChild(h('p', days === null
      ? 'המספרים האלה נרשמו לפני זמן לא ידוע, ורמת התרגילים נקבעת מהם. מדוד שוב ואעדכן.'
      : `עברו ${days} ימים מאז המדידה האחרונה. הרמות בתוכנית נקבעו מהמספרים ההם, `
        + 'ואם התקדמת הן כבר נמוכות מדי.'));
  }
  card.appendChild(h('p', 'סט אחד של כל תרגיל, עד כישלון טכני — לא עד כישלון מוחלט. '
    + 'תרגיל אחד ליום מספיק, אין צורך למדוד הכל באותה ישיבה. שדה ריק נשאר כמו שהיה.'));

  const inputs = new Map();
  const rows = h('div', { style: { marginTop: '14px' } });
  for (const f of FIELDS) {
    const prev = valueOf(profile, f.key);
    const id = `retest-${f.key}`;
    const input = h('input', {
      id,
      type: 'number',
      inputmode: 'numeric',
      min: String(f.min),
      max: String(f.max),
      placeholder: prev === null ? '' : String(prev),
      'aria-describedby': `${id}-prev`,
    });
    inputs.set(f.key, input);
    rows.appendChild(h('div.logrow',
      h('label', { for: id, style: { minWidth: '128px', fontSize: '13.5px' } }, f.label),
      input,
      h('span.setpill', { id: `${id}-prev` },
        prev === null ? `${f.unit} · לא נמדד` : `${f.unit} · קודם ${prev}`),
    ));
  }
  card.appendChild(rows);

  const out = h('div');
  card.appendChild(out);

  card.appendChild(h('div.toolbar', { style: { margin: '14px 0 0' } },
    h('button.btn.primary', {
      type: 'button',
      onclick: () => {
        const next = {};
        let bad = null;
        for (const f of FIELDS) {
          const raw = inputs.get(f.key).value;
          if (raw === '') continue;
          const n = Number(raw);
          if (!Number.isFinite(n) || n < f.min || n > f.max) { bad = bad || f; continue; }
          next[f.key] = Math.round(n);
        }
        if (bad) {
          showError(out, `${bad.label}: הזן מספר בין ${bad.min} ל־${bad.max}.`);
          inputs.get(bad.key).focus();
          return;
        }
        if (!Object.keys(next).length) {
          showError(out, never
            ? 'לא הוזן אף מספר. מלא לפחות שדה אחד.'
            : 'לא הוזן אף מספר. מלא לפחות שדה אחד, או "לא עכשיו".');
          inputs.get(FIELDS[0].key).focus();
          return;
        }
        const moved = retestDelta(profile, next);
        const updated = Object.assign({}, profile, {
          benchmarks: Object.assign({}, profile.benchmarks, next),
          benchmarksAt: new Date(now === undefined ? Date.now() : now).toISOString(),
        });
        /*
         * Announced only when nothing downstream will announce over it.
         *
         * A rebuild fires its own "התוכנית נבנתה מחדש" about eight milliseconds
         * later, and a polite live region rewritten that fast speaks only the
         * second one — so a screen-reader user heard "the plan was rebuilt" and
         * learned nothing about what their measurement bought, with focus on
         * body and no cursor near the summary either. When a rebuild is coming,
         * the caller owns the announcement and says the whole thing.
         */
        if (!moved.length) announce('המספרים עודכנו. הרמות נשארות כפי שהן.');
        if (cb.onApply) cb.onApply(updated, moved);
      },
    }, never ? 'כוונן לפי המספרים' : 'עדכן ובנה מחדש'),
    /* No decline on the offer. There is nothing to postpone — it is not asking,
       and a "not now" on something that never nagged would only hide it. */
    never ? null : h('button.btn', {
      type: 'button',
      onclick: () => {
        announce(`נשאל שוב בעוד ${RETEST_SNOOZE_DAYS} ימים`);
        if (cb.onSnooze) cb.onSnooze();
      },
    }, 'לא עכשיו'),
  ));

  return card;
}

/*
 * The between-times line: how long until the next measurement.
 *
 * Worth showing even when nothing is due, because a cycle nobody can see is a
 * cycle that arrives as a surprise.
 *
 * The snoozed case gets its own sentence rather than nothing. Somebody who
 * pressed "לא עכשיו" and then found the screen blank has no way to tell whether
 * they postponed the measurement or switched it off, and the difference matters
 * to them — the card is the only thing keeping their levels honest.
 */
function dueLater(profile, ui, now) {
  const snoozedAt = ui && ui.retestSnoozeAt;
  if (retestDue(profile, now) && !snoozeExpired(snoozedAt, now)) {
    const at = now === undefined ? Date.now() : now;
    const back = Math.max(1, Math.ceil(
      (Date.parse(snoozedAt) + RETEST_SNOOZE_DAYS * 86400000 - at) / 86400000));
    return h('p.note', `המדידה נדחתה. אשאל שוב בעוד ${back} ימים — עד אז הרמות נשארות `
      + 'לפי המספרים הישנים.');
  }
  const left = daysUntilRetest(profile, now);
  if (left === null) return null;
  return h('p.note', `מדידה הבאה בעוד ${left} ימים — כל ${RETEST_DAYS} יום אני מבקש את המספרים שוב `
    + 'ומעדכן את רמות התרגילים לפיהם.');
}

/**
 * What the new numbers bought, as a paragraph.
 *
 * Shown after the rebuild rather than instead of it: the trainee measured, and
 * the least the app can do is name what changed. Deduped by Hebrew label,
 * because push-ups speak for three patterns and three identical-looking lines
 * read like a bug.
 *
 * Three buckets, because the same delta means three different things:
 *
 *   up    — they got stronger. Say so.
 *   down  — a re-test after an illness, a layoff or a bad month comes back
 *           lower and the engine correctly moves that pattern down a rung. This
 *           used to announce it as "עלית רמה" — the app congratulating somebody
 *           on losing ground, at the exact moment they are deciding whether to
 *           believe anything it says.
 *   first — from is null: the pattern had no evidence at all until now, which
 *           is every pattern for a trainee who skipped the questions at intake.
 *           Nothing rose; the app was told where they stand.
 */
export function retestSummary(moved) {
  if (!moved || !moved.length) {
    return h('p.note', 'המספרים נשמרו. הרמות לא זזו — התוכנית שלך כבר במקום הנכון, '
      + 'וזו תשובה טובה בדיוק כמו קפיצה.');
  }
  const names = (list) => {
    const out = [];
    for (const m of list) {
      const he = patternHe(m.pattern);
      if (out.indexOf(he) < 0) out.push(he);
    }
    return out.join(', ');
  };
  const first = moved.filter((m) => m.from === null);
  const up = moved.filter((m) => m.from !== null && m.to > m.from);
  const down = moved.filter((m) => m.from !== null && m.to < m.from);

  const parts = [];
  if (first.length) parts.push(`הרמות כוונו לפי המספרים ב: ${names(first)}.`);
  if (up.length) {
    parts.push(`עלית רמה ב: ${names(up)}. התרגילים בקבוצות האלה הוחלפו לגרסאות קשות יותר.`);
  }
  if (down.length) {
    parts.push(`ירדת רמה ב: ${names(down)} — התוכנית מתחילה משם, וזה הדבר הנכון `
      + 'אחרי הפסקה או מחלה. חוזרים מהר יותר ממה שנדמה.');
  }
  return h('p.note', parts.join(' '));
}

function valueOf(profile, key) {
  const bm = (profile && profile.benchmarks) || {};
  const v = bm[key];
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function showError(holder, msg) {
  const old = holder.querySelector('.err');
  if (old) old.remove();
  holder.appendChild(h('p.err', { role: 'alert', style: { marginTop: '10px' } }, msg));
  announce(msg);
}
