/*
 * home.js — the daily spark screen. Eighty per cent of all use happens here.
 *
 * The target is fifteen seconds from opening the app to a recorded response,
 * so everything on this screen is either the spark, the three response buttons,
 * or one line of context. Anything else lives a tap away.
 *
 * The response row is the most important control in the product: it is the
 * only place the engine gets a labelled example, and it is why the buttons are
 * large, always visible without scrolling, and never behind a confirmation.
 */

import { h, clear, sheet, haptic, toast, announce, reduceMotion, ltr } from '../core/dom.js';
import * as store from '../core/store.js';
import { dayKey, humanDate, untilRolloverText } from '../core/day.js';
import * as streak from '../core/streak.js';
import { ensureToday, reroll, applyFeedback } from '../engine/select.js';
import { sparkById } from '../data/sparks.index.js';
import { MOODS, REJECT_REASONS, categoryLabel, sizeOf } from '../data/taxonomy.js';
import { shouldOfferSupport, SUPPORT_COOLDOWN_DAYS, HELPLINES } from '../engine/safety.js';
import { shareEntry } from './share.js';
import * as notify from './notify.js';
import { sparkMark } from './onboarding.js';

/* ------------------------------------------------------------------ *
 * Mood check-in
 * ------------------------------------------------------------------ */

/*
 * Asked before the spark is revealed, because the answer changes the spark.
 * Asking afterwards would make it a survey; asking before makes it an input.
 *
 * Skipping is a first-class outcome, not a failure state — the energy falls
 * back to the profile's typical value and nothing is withheld. An app that
 * requires a feelings report before it will function is an app people stop
 * opening on the days they feel worst.
 */
function askMood(onDone) {
  const close = sheet(h('div',
    h('p.sheet-lede', 'זה משנה את גודל הניצוץ של היום.'),
    h('div.mood-grid', MOODS.map((m) => h('button.mood', {
      type: 'button',
      onclick: () => {
        haptic('select');
        store.putDay(dayKey(), { mood: m.key, energy: m.energy });
        close();
        onDone();
      },
    }, moodGlyph(m.key), h('span.mood-label', m.he)))),
    h('button.btn.btn-ghost.sheet-skip', {
      onclick: () => { close(); onDone(); },
    }, 'דלג')), { label: 'איך אתה מרגיש היום', title: 'איך אתה מרגיש היום?' });
}

/*
 * Mood glyphs are abstract shapes, not faces.
 *
 * A face prescribes an interpretation — a frown tells you that you are sad.
 * A shape that gets denser or looser lets a person map their own state onto it,
 * which is both kinder and, for the engine, more honest data.
 */
function moodGlyph(key) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('class', 'mood-glyph');
  svg.setAttribute('aria-hidden', 'true');
  const shapes = {
    energized: 'M16 3l3.4 8.6L28 15l-8.6 3.4L16 27l-3.4-8.6L4 15l8.6-3.4z',
    calm: 'M4 16c4-6 8-6 12 0s8 6 12 0',
    busy: 'M5 9h22M5 16h22M5 23h14',
    tired: 'M5 20c4-3 8-3 12 0s8 3 10 0',
    overloaded: 'M6 6l20 20M26 6L6 26M16 3v26M3 16h26',
    flat: 'M4 16h24',
  };
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', shapes[key] || shapes.flat);
  path.setAttribute('fill', key === 'energized' ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

/* ------------------------------------------------------------------ *
 * The reveal
 * ------------------------------------------------------------------ */

/*
 * Twelve particles rising from the card. The one piece of ornament in the app,
 * and it is here because this is the moment the product is about: something
 * arriving, once a day.
 *
 * Skipped entirely under prefers-reduced-motion — not slowed, skipped. Motion
 * that has been reduced to a slower version of itself is still motion.
 */
function emitParticles(host) {
  if (reduceMotion.matches) return;
  const layer = h('div.particles', { 'aria-hidden': 'true' });
  for (let i = 0; i < 12; i += 1) {
    const p = h('i.particle');
    p.style.setProperty('--x', `${(Math.random() * 80 + 10).toFixed(1)}%`);
    p.style.setProperty('--d', `${(Math.random() * 320).toFixed(0)}ms`);
    p.style.setProperty('--s', (0.5 + Math.random() * 0.8).toFixed(2));
    layer.appendChild(p);
  }
  host.appendChild(layer);
  setTimeout(() => layer.remove(), 1400);
}

/* ------------------------------------------------------------------ *
 * Detail sheet
 * ------------------------------------------------------------------ */

function openDetail(entry, spark, rerender) {
  let ticking = null;
  const seconds = (spark && spark.seconds) || sizeOf(spark ? spark.size : 'standard').seconds;
  const timerLabel = h('span.timer-time', formatClock(seconds));
  let left = seconds;

  const timerBtn = h('button.btn.btn-timer', {
    onclick: () => {
      if (ticking) {
        clearInterval(ticking);
        ticking = null;
        timerBtn.textContent = '';
        timerBtn.append('התחל טיימר · ', timerLabel);
        return;
      }
      applyFeedback('timer_used');
      haptic('light');
      ticking = setInterval(() => {
        left -= 1;
        timerLabel.textContent = formatClock(Math.max(0, left));
        if (left <= 0) {
          clearInterval(ticking);
          ticking = null;
          haptic('success');
          announce('הטיימר הסתיים');
          timerLabel.textContent = 'סיימת';
        }
      }, 1000);
      timerBtn.textContent = '';
      timerBtn.append('עצור · ', timerLabel);
    },
  }, 'התחל טיימר · ', timerLabel);

  const note = h('textarea.input.note', {
    rows: '3', maxlength: '400', placeholder: 'הערה אישית — נשמרת רק אצלך',
    oninput: (e) => { store.putDay(entry.day || dayKey(), { note: e.target.value }); },
  });
  note.value = entry.note || '';

  const close = sheet(h('div.detail',
    h('p.detail-why', entry.why || ''),
    spark && spark.expansion ? h('p.detail-expansion', spark.expansion) : null,
    spark && spark.easier ? h('div.detail-easier',
      h('span.detail-easier-label', 'גרסה קטנה יותר'),
      h('p', spark.easier)) : null,
    h('div.detail-actions', timerBtn),
    h('label.field',
      h('span.field-label', 'הערה'),
      note),
    h('div.detail-foot',
      h('button.btn.btn-ghost', {
        onclick: () => {
          if (ticking) clearInterval(ticking);
          close();
          rerender();
        },
      }, 'סגור'))), {
    label: 'פרטי הניצוץ',
    title: entry.title,
    onClose: () => { if (ticking) clearInterval(ticking); },
  });
}

function formatClock(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Support card
 * ------------------------------------------------------------------ */

/*
 * Shown in place of the spark — with a way past it in one tap — when several
 * consecutive check-ins have been fragile.
 *
 * It names nothing, measures nothing and diagnoses nothing. It offers phone
 * numbers and a way to carry on. Everything about the presentation is chosen to
 * be quiet: no red, no icon, no exclamation, and a fourteen-day cooldown so it
 * cannot become wallpaper.
 */
function supportCard(onDismiss) {
  return h('section.card.support',
    h('p.support-line', 'לפעמים ימים כאלה נמשכים. אם בא לך לדבר עם מישהו —'),
    h('ul.support-list', HELPLINES.map((l) => h('li',
      h('a', { href: l.href, rel: 'noreferrer noopener', target: '_blank' },
        h('span.support-name', l.name),
        h('span.support-detail', l.detail))))),
    h('div.support-actions',
      h('button.btn.btn-ghost', { onclick: onDismiss }, 'אני בסדר, תודה'),
      h('button.btn', { onclick: onDismiss }, 'המשך לניצוץ של היום')));
}

function recentMoods(state, days) {
  const out = [];
  const keys = Object.keys(state.days).sort();
  for (const k of keys.slice(-days)) out.push(state.days[k].mood);
  return out.filter(Boolean);
}

/* ------------------------------------------------------------------ *
 * Screen
 * ------------------------------------------------------------------ */

export function renderHome(root, ctx) {
  const state = store.get();
  const key = dayKey();
  let entry = state.days[key];

  clear(root);

  /* The mood sheet runs before selection, so the answer can shape the pick.
   * Only on a day with no entry yet — reopening the app must never re-ask. */
  if (!entry && state.settings.moodPrompt) {
    askMood(() => ctx.rerender());
    root.appendChild(skeleton());
    return;
  }

  entry = ensureToday();
  if (!entry) {
    root.appendChild(h('section.card.empty',
      h('h2', 'משהו נתקע אצלנו.'),
      h('p', 'נסה לרענן. שום דבר ממה ששמרת לא הלך לאיבוד.')));
    return;
  }

  const spark = sparkById(entry.sparkId);
  const st = streak.summary();
  const support = state.supportShownAt
    ? daysSince(state.supportShownAt) >= SUPPORT_COOLDOWN_DAYS
    : true;

  root.appendChild(header(st, key));

  if (support && shouldOfferSupport(recentMoods(state, 7)) && !entry.supportDismissed) {
    root.appendChild(supportCard(() => {
      store.set({ supportShownAt: dayKey() });
      store.putDay(key, { supportDismissed: true });
      ctx.rerender();
    }));
    return;
  }

  const done = entry.status === 'completed';
  const card = sparkCard(entry, spark, ctx);
  root.appendChild(card);

  if (!entry.openedAt) {
    store.putDay(key, { openedAt: Date.now() });
    applyFeedback('expanded');
    emitParticles(card);
  }

  root.appendChild(done ? afterCard(entry) : responses(entry, spark, ctx));
  root.appendChild(secondary(entry, spark, ctx));

  if (ctx.firstRun && !done) root.appendChild(coachMark());
}

function daysSince(key) {
  const then = new Date(`${key}T12:00:00`);
  return Math.round((Date.now() - then.getTime()) / 86400000);
}

function skeleton() {
  return h('div.skeleton', h('div.sk-line.sk-w40'), h('div.sk-card'));
}

function header(st, key) {
  return h('header.home-head',
    h('button.streak', {
      type: 'button',
      'aria-label': `רצף של ${st.current} ימים. נותרו ${st.freezesLeft} ימי הקפאה.`,
      onclick: () => sheet(h('div',
        h('p.sheet-lede', 'הרצף כאן סופר ימים שבהם פתחת — לא ימים שבהם הצלחת. יום שפוספס נסגר אוטומטית ביום הקפאה, בלי שתצטרך לעשות כלום.'),
        h('dl.streak-stats',
          h('div', h('dt', 'רצף נוכחי'), h('dd', ltr(st.current))),
          h('div', h('dt', 'השיא שלך'), h('dd', ltr(st.longest))),
          h('div', h('dt', 'ימי הקפאה החודש'), h('dd', ltr(st.freezesLeft))))),
      { label: 'הרצף שלך', title: 'הרצף שלך' }),
    }, h('span.streak-flame', { 'aria-hidden': 'true' }, '🔥'), ltr(st.current)),
    h('span.home-date', humanDate(key)));
}

function sparkCard(entry, spark, ctx) {
  const meta = spark
    ? `${categoryLabel(spark.category)} · ${Math.max(1, Math.round(spark.seconds / 60))} דקות`
    : '';
  return h('article.card.spark-card', {
    tabindex: '0', role: 'article', 'aria-label': `הניצוץ של היום: ${entry.title}`,
    onclick: (e) => {
      if (e.target.closest('button')) return;
      openDetail(entry, spark, ctx.rerender);
    },
    onkeydown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetail(entry, spark, ctx.rerender);
      }
    },
  },
  h('div.spark-meta', meta),
  h('h1.spark-title', entry.title),
  h('p.spark-body', entry.body),
  h('div.spark-rule', { 'aria-hidden': 'true' }),
  h('p.spark-action', entry.action),
  entry.status === 'completed' ? h('div.spark-done', { 'aria-hidden': 'true' }, '✓') : null);
}

/*
 * The three responses.
 *
 * "עשיתי" is primary, the other two are equal and quiet. Not because the app
 * wants completion — it does — but because a visibly discouraged "not today"
 * makes people close the app instead of pressing it, and a closed app teaches
 * the engine nothing at all.
 */
function responses(entry, spark, ctx) {
  const key = dayKey();

  function complete() {
    haptic('success');
    store.putDay(key, { status: 'completed', respondedAt: Date.now() });
    applyFeedback('completed');
    notify.registerOpen(true);
    const milestone = streak.milestoneFor(streak.summary().current);
    announce('סומן כבוצע');
    ctx.rerender();
    if (milestone) celebrate(milestone);
    ctx.afterFirstResponse();
  }

  function defer() {
    haptic('light');
    store.putDay(key, { status: 'deferred', respondedAt: Date.now() });
    applyFeedback('deferred');
    toast('נשמר בספר. נתראה מחר.');
    ctx.rerender();
    ctx.afterFirstResponse();
  }

  function notForMe() {
    haptic('light');
    askReason((reason) => {
      store.putDay(key, { status: 'rejected', rejectReason: reason, respondedAt: Date.now() });
      reroll(reason);
      toast('החלפנו. זה ישפיע גם על מחר.');
      ctx.rerender();
      ctx.afterFirstResponse();
    });
  }

  return h('div.responses',
    h('button.resp.resp-done', { onclick: complete }, '✓ עשיתי'),
    h('button.resp', { onclick: defer }, 'לא היום'),
    h('button.resp', { onclick: notForMe }, 'לא בשבילי'));
}

/*
 * The reason picker.
 *
 * Optional — "פשוט תחליף" is a real button, and taking it still records the
 * rejection. Four reasons, because each maps to a different correction in
 * select.js. A single thumbs-down cannot distinguish "wrong subject" from
 * "wrong size", and those need opposite responses.
 */
function askReason(onPick) {
  const close = sheet(h('div',
    h('p.sheet-lede', 'זה יעזור לנו לא לחזור על זה.'),
    h('div.reason-list', REJECT_REASONS.map((r) => h('button.reason', {
      onclick: () => { close(); onPick(r.key); },
    }, r.he))),
    h('button.btn.btn-ghost.sheet-skip', {
      onclick: () => { close(); onPick(null); },
    }, 'פשוט תחליף')), { label: 'מה לא התאים', title: 'מה לא התאים?' });
}

function afterCard(entry) {
  return h('div.after',
    h('p.after-line', entry.status === 'completed' ? 'סומן. נתראה מחר.' : 'נשמר בספר.'),
    h('p.after-next', untilRolloverText()));
}

function secondary(entry, spark, ctx) {
  const used = entry.rerolls || 0;
  const left = Math.max(0, 1 - used);

  return h('div.secondary',
    h('button.mini', {
      'aria-pressed': String(!!entry.saved),
      onclick: () => {
        const saved = !entry.saved;
        store.putDay(dayKey(), { saved });
        if (saved) applyFeedback('saved');
        haptic('select');
        toast(saved ? 'נשמר לאוסף' : 'הוסר מהאוסף');
        ctx.rerender();
      },
    }, entry.saved ? '★ שמור' : '☆ שמור'),
    h('button.mini', {
      onclick: () => { applyFeedback('shared'); shareEntry(entry, spark); },
    }, '↗ שתף'),
    h('button.mini', {
      disabled: left === 0,
      title: left === 0 ? 'ההחלפה היומית נוצלה' : '',
      onclick: () => {
        reroll(null);
        toast('ניצוץ אחר');
        ctx.rerender();
      },
    }, left === 0 ? '⟳ נוצל' : '⟳ עוד אחד'));
}

/*
 * Milestones. Four in a lifetime — 7, 30, 100, 365 — because a celebration
 * that happens weekly is a loading screen.
 */
function celebrate(days) {
  if (reduceMotion.matches) { toast(`${days} ימים.`); return; }
  const layer = h('div.celebrate', { 'aria-hidden': 'true' });
  for (let i = 0; i < 26; i += 1) {
    const bit = h('i.confetti');
    bit.style.setProperty('--x', `${Math.random() * 100}%`);
    bit.style.setProperty('--d', `${Math.random() * 400}ms`);
    bit.style.setProperty('--r', `${Math.random() * 360}deg`);
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1600);
  announce(`${days} ימים ברצף`);
  toast(`${days} ימים. זה לא מעט.`);
}

function coachMark() {
  return h('p.coach', 'הכפתורים למטה הם מה שמלמד את האפליקציה. שנייה אחת, וזה משפיע על מחר.');
}

/*
 * The notification ask, offered once, after a first response — never before.
 * Its own screen first, so the browser's one-shot prompt is only spent on
 * someone who already said yes to ours.
 */
export function offerNotifications(onDone) {
  if (!notify.supported() || notify.permission() !== 'default') { onDone(); return; }

  const close = sheet(h('div.notify-ask',
    h('div.notify-mark', { 'aria-hidden': 'true' }, sparkMark(40)),
    h('p.sheet-lede', 'התראה אחת ביום. זהו.'),
    h('ul.ob-points',
      h('li', 'בשעה שמתאימה לך — נלמד מתי אתה בפועל פותח.'),
      h('li', 'הניצוץ עצמו בהתראה, בלי לפתוח כלום.'),
      h('li', 'אפשר להפחית בהדרגה, לא רק לכבות.')),
    h('div.sheet-actions',
      h('button.btn.btn-primary', {
        onclick: async () => {
          const result = await notify.requestPermission();
          close();
          if (result === 'granted') { notify.schedule(); toast('נשלח לך ניצוץ אחד ביום.'); }
          onDone();
        },
      }, 'אישור — בסדר גמור'),
      h('button.btn.btn-ghost', {
        onclick: () => { close(); onDone(); },
      }, 'אולי אחר כך'))), { label: 'התראות', title: 'רוצה תזכורת יומית?' });
}
