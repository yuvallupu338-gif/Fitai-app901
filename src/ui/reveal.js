/*
 * reveal.js — the moment between the last question and the plan.
 *
 * There is nothing to wait for. generateProgram() and nutritionPlan() together
 * take 1.3ms on the lightest profile and 2.3ms on the heaviest one this
 * questionnaire can describe — six sessions of two hours in a full gym. The work
 * is finished before the first frame paints.
 *
 * So the honest options were two, and only one of them is this file.
 *
 * The one not taken: staged progress. "בונה חימום…", pause, "בוחר תרגילים…",
 * pause, "מחשב תזונה…". It would look expensive and it would be the app lying
 * about what it is doing, on the first screen after ten questions — which is
 * exactly the screen where a trainee decides whether this thing is serious.
 * Every comment in src/engine/ is an argument against doing that.
 *
 * What this is instead: the engine runs first, and then the screen spends about
 * two seconds showing things it actually decided. Every number here is read off
 * the finished program. The pause is presentation, not computation, and it is
 * paid for by telling somebody something true they would otherwise never learn —
 * that 98 of 271 exercises survived their equipment and their level, that ten of
 * those made the plan, that thirty-one more are sitting behind the swap button.
 *
 * Nothing here is load-bearing. If any of it throws, onDone() still fires and
 * the trainee gets their plan; a decorative screen is never worth a failed
 * build. Reduced motion collapses the whole thing to a single frame.
 */

import { h, clear, announce, reduceMotion } from '../core/dom.js';
import { EXERCISES, candidates } from '../data/exercises.index.js';

/*
 * The pacing.
 *
 * Slow enough that three lines register as three separate facts rather than as
 * a flash, fast enough that the tenth time through — and there will be a tenth
 * time, because "ערוך תשובות ובנה מחדש" comes through here too — it is over
 * before it can annoy. Anything past about two and a half seconds stops being
 * a reveal and starts being a wait.
 */
const STEP_MS = 420;
const HOLD_MS = 620;

/**
 * Facts read off a finished program. Pure; no DOM.
 *
 * Everything returned is either always present or explicitly null, and the
 * caller drops the nulls — a reveal screen has to degrade to the profile that
 * declared nothing, because that profile is common.
 */
export function revealFacts(profile, program) {
  const days = (program && program.days) || [];
  const slots = days.flatMap((d) => d.slots || []);

  const leads = new Set();
  const all = new Set();
  for (const s of slots) {
    const vs = s.variants || [];
    if (vs[0]) leads.add(vs[0].exId);
    for (const v of vs) all.add(v.exId);
  }

  /*
   * The funnel denominator is what this profile could ever have been offered,
   * not the raw library. 87 of the 271 exercises are unreachable for everybody
   * — matchesTrack removes every loaded movement because normalizeProfile pins
   * the track to calisthenics — so opening with "271" would be quoting a
   * number that was never on the table. `passed` is the honest one: it is the
   * real candidates() call the generator itself makes.
   */
  let passed = null;
  try { passed = candidates(profile, {}).length; } catch (e) { passed = null; }

  const vol = (program && program.volume) || {};
  const total = Number.isFinite(vol.total) ? vol.total : null;

  return {
    library: EXERCISES.length,
    passed,
    picked: leads.size || null,
    /* Alternates only — the depth behind ⇄ that nobody ever sees. Stated as a
       total, never as a per-exercise promise: some slots have no alternate. */
    behindSwap: all.size > leads.size ? all.size - leads.size : null,
    sets: total,
    days: days.length || null,
    split: (program && program.meta && program.meta.splitName) || null,
    push: Number.isFinite(vol.push) ? vol.push : null,
    pull: Number.isFinite(vol.pull) ? vol.pull : null,
    legs: Number.isFinite(vol.legs) ? vol.legs : null,
    warmup: (program && program.warmup && program.warmup.length) || null,
    weeks: (program && program.meta && program.meta.weeksTotal) || null,
  };
}

/**
 * The lines, in order. Each is {n, label} where n is the number that counts up
 * and label is the Hebrew that sits under it.
 *
 * Three at most. A fourth turns a beat into a slideshow, and the tenth visit is
 * the one that decides whether this screen was a good idea.
 */
export function revealLines(f) {
  const out = [];
  if (f.passed) {
    out.push({
      n: f.passed,
      label: 'תרגילים עברו את הציוד, הפציעות והרמה שלך',
    });
  }
  if (f.picked) {
    out.push({
      n: f.picked,
      label: f.behindSwap
        ? `נבחרו לתוכנית · ועוד ${f.behindSwap} מחכים מאחורי כפתור ההחלפה`
        : 'נבחרו לתוכנית',
    });
  }
  if (f.sets) {
    out.push({
      n: f.sets,
      label: f.push && f.pull && f.legs
        ? `סטים עובדים בשבוע · ${f.push} דחיפה, ${f.pull} משיכה, ${f.legs} רגליים`
        : 'סטים עובדים בשבוע',
    });
  }
  return out.slice(0, 3);
}

/**
 * Paint the reveal into `root`, then call onDone().
 *
 * Returns a cancel function. onDone fires exactly once, whether the screen ran
 * its course, was skipped, or threw.
 */
export function renderReveal(root, profile, program, onDone) {
  let finished = false;
  const timers = [];
  const finish = () => {
    if (finished) return;
    finished = true;
    for (const t of timers) clearTimeout(t);
    onDone();
  };

  let lines = [];
  try {
    lines = revealLines(revealFacts(profile, program));
  } catch (e) {
    console.error(e);
  }

  // Nothing true to say — go straight through rather than hold somebody on an
  // empty screen for the sake of the animation.
  if (!lines.length) { finish(); return finish; }

  const view = h('section.reveal', {
    /* The whole screen is one skip target. Somebody on their tenth rebuild
       should not have to find a small button — a tap anywhere, Enter, or Escape
       all end it. */
    role: 'button',
    tabindex: '0',
    'aria-label': 'התוכנית מוכנה. הקש כדי לדלג להצגה',
    onclick: finish,
    onkeydown: (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); finish(); }
    },
  });
  root.appendChild(view);

  view.appendChild(h('div.eyebrow', 'התוכנית מוכנה'));
  view.appendChild(h('h2.reveal-h', 'נבנתה מהתשובות שלך'));

  const list = h('ol.reveal-list');
  view.appendChild(list);

  /*
   * Screen readers get the finished content immediately and in full, rather
   * than three separate announcements arriving over two seconds — a live region
   * that fires four times in a row is worse than one that fires once. The list
   * itself is aria-hidden for the same reason: it is the same information, and
   * hearing it twice is the defect.
   */
  list.setAttribute('aria-hidden', 'true');
  announce(`התוכנית מוכנה. ${lines.map((l) => `${l.n} ${l.label}`).join('. ')}.`);

  const rows = lines.map((l) => {
    const num = h('b.reveal-n', reduceMotion.matches ? String(l.n) : '0');
    const row = h('li.reveal-row', num, h('span.reveal-label', l.label));
    list.appendChild(row);
    return { row, num, target: l.n };
  });

  /*
   * Reduced motion is not a faster version of the animation, it is the end
   * state — every number final, everything visible, one frame, then out. The
   * only thing preserved is that the trainee sees the facts at all.
   */
  if (reduceMotion.matches) {
    for (const r of rows) r.row.classList.add('on');
    timers.push(setTimeout(finish, HOLD_MS));
    return finish;
  }

  /*
   * The escape hatch has to be visible or it is not an escape hatch.
   *
   * The whole section is the skip target, which is generous and completely
   * undiscoverable — a trainee on their fifth rebuild would sit through it
   * every time without knowing they could stop it. aria-hidden because the
   * section's own aria-label already says the same thing to a screen reader.
   */
  view.appendChild(h('p.reveal-skip', { 'aria-hidden': 'true' }, 'הקש כדי לדלג'));

  view.focus({ preventScroll: true });

  rows.forEach((r, i) => {
    timers.push(setTimeout(() => {
      r.row.classList.add('on');
      countTo(r.num, r.target, STEP_MS);
    }, i * STEP_MS));
  });
  timers.push(setTimeout(finish, rows.length * STEP_MS + HOLD_MS));

  return finish;
}

/*
 * Count a number up over `ms`, on the frame clock.
 *
 * Eased so it decelerates into the real value: a linear count reads as a
 * spinner, which is the thing this screen is specifically not. The final frame
 * is assigned rather than interpolated, because a count-up that lands on 97 of
 * 98 undermines the one claim the screen is making.
 */
function countTo(node, target, ms) {
  if (target <= 0) { node.textContent = String(target); return; }
  const started = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - started) / ms);
    const eased = 1 - (1 - t) * (1 - t) * (1 - t);
    node.textContent = String(t >= 1 ? target : Math.round(target * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
