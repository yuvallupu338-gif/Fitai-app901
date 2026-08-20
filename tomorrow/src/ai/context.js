/*
 * context.js — everything the model is told about the day, and everything it
 * is deliberately not told.
 *
 * The rest of this feature is plumbing: a table of vendors, a fetch, a map from
 * HTTP status to a Hebrew sentence. This file is the part that decides whether
 * an answer sounds like TomorrowAI or like a general chatbot that happens to
 * reply in Hebrew. A hosted model knows nothing about this person and cannot
 * find anything out, so every fact that appears in an answer has to arrive from
 * here, already computed, in a form it cannot misread.
 *
 * Two jobs, kept apart on purpose. systemPrompt() is the standing instruction —
 * the voice, the hedging, and the one rule the whole product rests on: the
 * numbers belong to the engine and the model may not make new ones.
 * contextBlock() is the day itself, rendered as text. They are separate because
 * the block changes every time anything on the schedule moves and the rules
 * never do, and because a caller can put the rules in the vendor's system field
 * while the block travels with the question.
 *
 * THE SHARE LEVEL IS A PROMISE, NOT A PREFERENCE.
 *
 * 'summary' sends the shape of the day — the score, the factors, where the
 * curves turn, the risks, the totals, the confidence — and no item names at
 * all, so somebody can buy better phrasing from a vendor without handing over
 * their calendar. Leaving titles out of a schedule listing is not enough to
 * achieve that: the engine writes them into risk reasons, into the focus
 * factor's detail line and into the recommendation's own title, so every piece
 * of free text coming out of the forecast is scrubbed on the way through. And
 * anything that is not exactly the string 'full' is treated as 'summary',
 * because the cost of a typo in a settings value has to be less disclosure and
 * never more.
 *
 * Pure: no DOM, no network, no clock. `ctx.now` is injected by the caller like
 * everywhere else in this app, so this module stays a function of its
 * arguments and can be read, diffed and tested in plain Node.
 */

import { time as fmtTime, duration as fmtDuration, pct, dayName, dateLabel } from '../core/fmt.js';
import { bedtimeAbs } from '../core/time.js';

const DAY_MINUTES = 1440;

/* ------------------------------------------------------------------ *
 * Small renderers
 * ------------------------------------------------------------------ */

function timeFormatOf(ctx) {
  return (ctx && ctx.profile && ctx.profile.timeFormat) || '24h';
}

/*
 * A clock reading, marked when it belongs to the small hours of the morning
 * after.
 *
 * Curves, bedtimes and late items all run past midnight, and fromMinutes()
 * wraps them, which is right for a screen where the row's position says which
 * day it is on. In a flat block of text it is not: a bedtime that renders as
 * 00:30 next to a wake time of 06:45 reads as a night of six hours in the wrong
 * direction, and the model would describe it that way with complete confidence.
 */
function clock(minute, format) {
  const n = Number(minute);
  if (!Number.isFinite(n)) return '—';
  const text = fmtTime(n, format);
  return n >= DAY_MINUTES ? `${text} (למחרת)` : text;
}

function span(from, to, format) {
  return `${clock(from, format)}–${clock(to, format)}`;
}

function int(n) {
  const v = Number(n);
  return Number.isFinite(v) ? String(Math.round(v)) : '—';
}

/*
 * An item's start, or null when it has none.
 *
 * Worth its own function because `Number(null)` is 0 and `Number.isFinite(0)`
 * is true, so the obvious test passes for an unscheduled task and hands it a
 * start time of midnight. That reached the block once: a task the user had not
 * placed anywhere was presented to the model as an item at 00:00, which it
 * would have described back to them as a fact about their night.
 */
function startOf(item) {
  if (!item || item.start === null || item.start === undefined) return null;
  const n = Number(item.start);
  return Number.isFinite(n) ? n : null;
}

/*
 * The day's items in reading order, unscheduled ones last, ties broken by id.
 *
 * The order is what the summary level's placeholders are numbered from, so it
 * has to be stable: a handle that meant one thing in the first question and
 * something else in the third would let the model contradict itself across a
 * conversation while quoting the app's own data both times.
 */
function orderedItems(ctx) {
  const items = (ctx && ctx.items) || [];
  return items.slice().sort((a, b) => {
    const as = startOf(a);
    const bs = startOf(b);
    const an = as === null ? Infinity : as;
    const bn = bs === null ? Infinity : bs;
    if (an !== bn) return an - bn;
    return String(a && a.id) < String(b && b.id) ? -1 : 1;
  });
}

/* ------------------------------------------------------------------ *
 * Withholding names
 * ------------------------------------------------------------------ */

/**
 * A scrubber that replaces this day's item titles with neutral handles.
 *
 * Numbered rather than a single placeholder repeated, because the conflict risk
 * says two things overlap and the whole content of that sentence is that they
 * are two different things. Collapsing both to one word would turn a real
 * warning into a sentence that reads like a bug.
 */
function anonymiser(items) {
  const names = items
    .map((it, i) => ({ title: String((it && it.title) || '').trim(), handle: `פריט ${i + 1}` }))
    /* Two characters is the floor. A one-character title is somebody testing
     * the input box, and substituting it would rewrite half the Hebrew in the
     * block — the letter ו alone appears in almost every sentence. */
    .filter((n) => n.title.length >= 2)
    /* Longest first, because one title is often contained in another — קריאה
     * inside קריאה למבחן. Replacing the short one first leaves the tail of the
     * long one sitting in the text, which is the leak this function exists to
     * prevent. */
    .sort((a, b) => (b.title.length - a.title.length) || (a.title < b.title ? -1 : 1));

  return function scrub(text) {
    let s = text === null || text === undefined ? '' : String(text);
    for (const n of names) {
      // The quoted form first: otherwise the handle lands inside a pair of
      // quotes and the sweep below replaces it a second time, throwing away the
      // number that made it useful.
      s = s.split(`"${n.title}"`).join(n.handle);
      s = s.split(n.title).join(n.handle);
    }
    /*
     * The sweep. Every item name the engine interpolates into a sentence it
     * wraps in ASCII double quotes — risk.js, scoring.js and optimize.js all do
     * it, and nothing else in the forecast's Hebrew is quoted that way; the
     * gershayim inside אחה״צ is a different character entirely. So a quoted run
     * still standing at this point is a name this function was never given,
     * which happens when a risk points at an item the caller did not pass or
     * when a future string quotes something new. It costs a little fluency to
     * blank it. Leaving it would break the promise the setting made, and the
     * user would never know.
     */
    return s.replace(/"[^"]*"/g, 'פריט ביומן');
  };
}

/** At the full level the engine's own wording travels untouched. */
function verbatim(text) {
  return text === null || text === undefined ? '' : String(text);
}

/* ------------------------------------------------------------------ *
 * The system prompt
 * ------------------------------------------------------------------ */

/*
 * Written in English, like the prompts in the repository's other app, while
 * every string the model has to produce or recognise is given in Hebrew. The
 * instructions are for the model; the vocabulary is for the user.
 */
const RULES = `You are the phrasing layer of TomorrowAI, a Hebrew app that reads a person's
next day before it starts and estimates how it is likely to go. They are asking
you from the app's chat screen, with the forecast you are given open on the
screen behind you.

Answer in Hebrew. Two or three sentences. Go longer only when they ask for
something that genuinely needs it, and never past a short paragraph.

Plain text only. The reply is rendered as a paragraph, so markdown does not
become formatting here — it becomes visible asterisks and hash marks. No
bullet lists, no headings, no bold, no emoji.

THE NUMBERS ARE THE APP'S, NOT YOURS

This is the rule the product stands on, and it outranks everything else below.
Every figure in the data block — the score, each factor, the energy and focus
levels, the times, the durations, the percentages, the confidence — has already
been computed by the app's own engine from this person's own history. Your job
is to say what those figures mean in a sentence a human would actually say. It
is not to produce figures.

  * Quote a number only if it appears in the block, and quote it exactly as it
    is written there. Copy times character for character.
  * Never compute a new one. Not an average, not a difference, not a
    percentage, not a total, not an "about an hour and a half" worked out from
    two times in the block. A number you derived looks identical to a number
    the engine computed, and the person has no way to tell them apart — which
    is how one invented figure costs the app the credibility of every real
    figure it has ever shown them.
  * When they ask for something the block does not contain, say so plainly:
    אין לי את המספר הזה. That is always a correct answer. A plausible guess
    never is.
  * A what-if — what happens if I sleep at 23:00, if I move the workout — is a
    calculation, and the app has a screen that runs it for real against the
    same engine. Send them to מה אם instead of estimating the new score.

THE FUTURE IS AN ESTIMATE, AND THE HEBREW HAS TO SAY SO

The app never claims to know what will happen, and neither do you. A prediction
stated as fact is a bug, not a style choice.

  * Wrong: מחר תהיה עייף ב-14:00.
  * Right: לפי הדפוס שלך, צפויה ירידה באנרגיה סביב 14:00.

Hedge inside the sentence, using these words: צפוי, צפויה, סביר, נוטה, ייתכן,
בערך, להערכתי, כנראה, לפי הדפוס שלך, על סמך הימים האחרונים שלך. A hedge added
at the end as a disclaimer is not a hedge. What already happened — what they
logged, what they planned, what is on the schedule — is fact and does not get
hedged; only the day that has not happened yet does.

THE VOICE

Calm, short, human: a level-headed friend who has looked at the numbers, not a
coach and not a wellness app.

  * Never dramatic. No exclamation marks. Nothing here is an emergency.
  * Never judgemental. A short night, an unfinished task and a heavy day are
    information, not failures. Do not tell them what they should have done, and
    do not congratulate them either — praise for an early bedtime is the same
    move as a telling-off for a late one, and both make the app something they
    have to manage their feelings around.
  * No filler. Do not restate the question, do not announce that you looked at
    the data, do not offer to help further. Open with the answer.
  * This is the register: הבוקר שלך נראה חזק, אבל אחר הצהריים עמוס מהרגיל.
    העברה של משימה אחת לאחרי 18:00 ושינה חצי שעה מוקדם יותר משפרות את התחזית.

YOU HAVE NOT DONE ANYTHING

You are a reply in a chat box. You cannot move a task, change a bedtime, add
anything to the schedule, open a screen or save a setting, and nothing in the
app acts on what you write. Never use a verb that claims otherwise — העברתי,
שיניתי, הוספתי, קבעתי, עדכנתי, מחקתי. Suggest, and name the place that really
does it:

  * שפר את מחר — applies the app's own highest-impact change to the day.
  * מה אם — tries a change and shows the new score without saving it.
  * לוח — the schedule, where an item is moved or edited by hand.
  * פרופיל — wake time, bedtime and the rest of the settings.

כדאי להזיז את זה מוקדם יותר, אפשר לעשות את זה במסך לוח is right. הזזתי את זה
is a lie they will catch the moment they look at the schedule.

WHEN NAMES ARE WITHHELD

The data block states which share level this person chose. At the summary level
their calendar entries were deliberately not sent: the block gives the shape of
the day and calls each thing on it פריט 1, פריט 2 and so on. Those are
placeholders, not names. Do not guess what they stand for, do not ask for them,
and do not repeat a placeholder back — פריט 2 means nothing to the person
reading. Say אחד הדברים שקבעת למחר, or identify it by its time.

WHAT YOU ARE NOT

TomorrowAI plans days. It is not a doctor, a therapist or a diagnosis. If
someone describes pain, illness or real distress, answer briefly and kindly,
stay away from clinical advice, and do not fold it into the forecast. A
question with nothing to do with their day can get a short answer, but this is
a planning app and what is useful here is almost always tomorrow.`;

/*
 * The handful of facts that must be true no matter how the caller assembles the
 * request. The block below carries the day in detail, but a client is free to
 * send it as part of the user turn, and a system prompt that did not know which
 * date it was talking about would let the model answer a question about Tuesday
 * with Monday's numbers and sound entirely sure of itself.
 *
 * Nothing here identifies anybody: no name, no titles, no notes. It stays safe
 * to send at either share level, which is what lets the settings screen preview
 * it honestly.
 */
function frameOf(ctx) {
  const f = ctx && ctx.forecast;
  if (!f) {
    return 'No day has been computed yet. Until a forecast arrives, say you do not have the '
      + 'numbers rather than describing a day you cannot see.';
  }

  const lines = [];
  const when = ctx && ctx.now instanceof Date ? dateLabel(f.date, ctx.now) : dayName(f.date);
  lines.push(`This conversation is about ${f.date} (${when}). Everything you are told is about `
    + 'that one day. A question about another day, or about anything the data does not cover, '
    + 'gets an honest אין לי את הנתון הזה rather than a guess.');

  const c = f.confidence;
  if (c && c.learningMode) {
    lines.push(`The app is still learning this person: confidence in this forecast is ${pct(c.overall)} `
      + 'and it is in learning mode. Hedge harder than usual and say outright that the estimate '
      + 'is early, rather than letting a confident sentence stand on thin history.');
  } else if (c) {
    lines.push(`The app's confidence in this forecast is ${pct(c.overall)} (${c.level}). Do not `
      + 'sound more certain than that number, and do not quote a different one.');
  }

  if (f.judged === false) {
    lines.push('The score is not a verdict on this day — there is too little planned for it to '
      + 'grade anything. Describe the day, do not mark it.');
  }

  return lines.join('\n\n');
}

/**
 * The standing instruction sent with every question.
 *
 * Safe to call with no forecast, and with no `ctx` at all: the settings screen
 * shows exactly what leaves the device before anything has left it, and that
 * preview happens on a screen where a day may not have been computed yet.
 */
export function systemPrompt(ctx) {
  return `${RULES}\n\n${frameOf(ctx)}\n`;
}

/* ------------------------------------------------------------------ *
 * The day, as text
 * ------------------------------------------------------------------ */

function factorLines(f, scrub, out) {
  const factors = (f && f.factors) || [];
  if (!factors.length) return;
  out.push('factors (score 0-100, weight, direction against this person\'s own average):');
  for (const x of factors) {
    out.push(`  ${x.key} / ${x.label} — ${int(x.score)}, weight ${x.weight}, ${x.direction}`
      + `${x.detail ? ` — ${scrub(x.detail)}` : ''}`);
  }
}

function curveLines(f, format, out) {
  const e = f.energyPeak || null;
  const d = f.energyDip || null;
  const p = f.focusPeak || null;
  if (e) out.push(`energy: peak ${int(e.value)} at ${clock(e.minute, format)}`
    + `${d ? `, afternoon dip ${int(d.value)} at ${clock(d.minute, format)}` : ''}`);
  if (p) out.push(`focus: peak ${int(p.value)} at ${clock(p.minute, format)}`);

  const windows = f.focusWindows || [];
  if (!windows.length) {
    out.push('best focus windows: none long enough to recommend — the day has no clear stretch of 45 minutes above the threshold.');
    return;
  }
  out.push('best focus windows (best first):');
  for (const w of windows) {
    out.push(`  ${span(w.start, w.end, format)} — focus ${int(w.score)}, confidence ${pct(w.confidence)}`);
  }
}

function riskLines(f, scrub, format, full, items, out) {
  const risks = f.risks || [];
  if (!risks.length) {
    out.push('risks: none found. That is not a promise the day will go smoothly, only that nothing in the data stands out.');
    return;
  }
  const byId = new Map(items.map((it) => [it && it.id, it]));
  out.push(`risks (worst first, ${risks.length}):`);
  for (const r of risks) {
    out.push(`  ${r.key} — severity ${r.severity}, score ${int(r.score)}`);
    out.push(`    title: ${scrub(r.title)}`);
    out.push(`    reason: ${scrub(r.reason)}`);
    out.push(`    suggestion: ${scrub(r.suggestion)}`);
    if (r.window) out.push(`    when: ${span(r.window.start, r.window.end, format)}`);
    const ids = r.itemIds || [];
    if (!ids.length) continue;
    /* The ids themselves never go out. They are meaningless to a model and at
     * the summary level they would be a second channel for the same names the
     * rest of this function is busy withholding. */
    out.push(full
      ? `    involves: ${ids.map((id) => (byId.get(id) || {}).title || 'פריט שאינו ביום הזה').join(', ')}`
      : `    involves: ${ids.length} ${ids.length === 1 ? 'item' : 'items'} on the schedule`);
  }
}

function insightLines(f, scrub, out) {
  const insights = f.insights || [];
  if (!insights.length) {
    out.push('insights: none yet — fewer than three comparable days logged. Do not offer a pattern; there is not one to offer.');
    return;
  }
  out.push('insights, learned from this person\'s own logged days (each one is only true with its evidence attached):');
  for (const i of insights) {
    out.push(`  ${scrub(i.text)} — ${scrub(i.evidence)} (${i.samples} samples, ${i.strength})`);
  }
}

function recommendationLines(f, scrub, out) {
  const r = f.recommendation;
  if (!r) {
    out.push('primary recommendation: none. The optimiser searched and found no single change worth at least a point. Say that plainly if asked; do not invent one.');
    return;
  }
  out.push('primary recommendation (the highest-impact change the optimiser found, already scored):');
  out.push(`  ${scrub(r.title)}`);
  out.push(`  ${scrub(r.detail)}`);
  out.push(`  projected score: ${int(r.from)} to ${int(r.to)}, confidence ${pct(r.confidence)}`);
  out.push('  the person applies it themselves from שפר את מחר. You cannot apply it.');
}

function scheduleLines(f, format, full, items, out) {
  if (!full) {
    out.push(`schedule: withheld. The day holds ${items.length} ${items.length === 1 ? 'item' : 'items'}; `
      + 'their names and times were not sent, by the person\'s own choice in settings. Everything '
      + 'above describes the shape of the day without saying what is in it.');
    return;
  }
  if (!items.length) {
    out.push('schedule: empty — nothing is planned on this day.');
    return;
  }
  out.push(`schedule (${items.length} items, times exact):`);
  for (const it of items) {
    const at = startOf(it);
    const when = at === null
      ? `unscheduled, ${fmtDuration(it.duration)}`
      : span(at, at + Number(it.duration), format);
    const tags = [it.type, it.category, `priority ${it.priority}`, `difficulty ${it.difficulty}`,
      `energy ${it.energyRequirement}`, `focus ${it.focusRequirement}`, it.status];
    if (it.locked) tags.push('locked');
    if (it.isTop) tags.push('marked most important');
    out.push(`  ${when} — ${it.title} [${tags.join(', ')}]`);
  }
  out.push('  notes attached to items are never sent, at any share level.');
}

/**
 * The live forecast as compact, unambiguous text.
 *
 * `share` is 'summary' or 'full' from `Root.settings.ai`. Anything else — an
 * old value, a typo, undefined — falls to 'summary'. A default that widened
 * disclosure would be a privacy bug hiding behind a data-validation bug.
 */
export function contextBlock(ctx, share) {
  const full = share === 'full';
  const f = ctx && ctx.forecast;
  const format = timeFormatOf(ctx);
  const items = orderedItems(ctx);
  const scrub = full ? verbatim : anonymiser(items);
  const out = [];

  out.push('FORECAST DATA — computed by the app, on the device, before this request. Quote it; never recompute it.');

  if (!f) {
    out.push('none — no day has been computed yet, so there are no numbers to quote.');
    return out.join('\n');
  }

  out.push(full
    ? 'share level: full — the schedule below carries the real titles this person typed.'
    : 'share level: summary — item names were withheld deliberately. פריט N is a placeholder for a real thing on the schedule whose name was not sent.');
  out.push('');

  out.push(`day: ${f.date} (${dayName(f.date)})`);
  const plan = ctx.plan;
  if (plan) {
    /* Two bedtimes, and confusing them is the easiest mistake to make here.
     * `bedtime` is tonight — the night that ends on this date, the one the sleep
     * factor is scored on and the one the recommendation moves. `nextBedtime`
     * closes the day. A model told only "bedtime" would answer a question about
     * tonight with tomorrow evening's number. */
    out.push(`awake window: ${clock(plan.wake, format)} to ${clock(bedtimeAbs(plan.nextBedtime), format)}`);
    out.push(`tonight's lights-out (the night before this day, and the one a sleep change would move): ${clock(plan.bedtime, format)}`);
  }
  out.push(`score: ${int(f.score)} / 100 — band ${f.band}, called ${f.label}`);
  if (f.judged === false) {
    out.push('  judged: false — too little is planned for the score to be a verdict on anything. It is not a grade and must not be described as one.');
  }
  out.push('');

  factorLines(f, scrub, out);
  out.push('');

  curveLines(f, format, out);
  out.push('');

  riskLines(f, scrub, format, full, items, out);
  out.push('');

  const t = f.totals || {};
  out.push(`totals: ${fmtDuration(t.loadMinutes)} booked, ${fmtDuration(t.freeMinutes)} free, `
    + `${fmtDuration(t.sleepMinutes)} sleep, ${fmtDuration(t.awakeMinutes)} awake; `
    + `${int(t.taskCount)} tasks, ${int(t.doneCount)} of them already done; `
    + `${int(t.topCount)} marked as most important for the day`);

  const c = f.confidence;
  if (c) {
    out.push(`confidence: ${pct(c.overall)} (level ${c.level}), learning mode: ${c.learningMode ? 'yes' : 'no'}`
      + `${f.meta ? `, built from ${int(f.meta.samples)} logged days` : ''}`);
    for (const reason of c.reasons || []) out.push(`  ${scrub(reason)}`);
  }
  out.push('');

  const reasons = f.reasons || {};
  if ((reasons.up || []).length || (reasons.down || []).length) {
    out.push('the app\'s own wording for why the score is what it is:');
    if ((reasons.up || []).length) out.push(`  holding it up: ${reasons.up.map(scrub).join('; ')}`);
    if ((reasons.down || []).length) out.push(`  pulling it down: ${reasons.down.map(scrub).join('; ')}`);
    out.push('');
  }

  insightLines(f, scrub, out);
  out.push('');

  recommendationLines(f, scrub, out);
  out.push('');

  scheduleLines(f, format, full, items, out);

  return out.join('\n');
}
