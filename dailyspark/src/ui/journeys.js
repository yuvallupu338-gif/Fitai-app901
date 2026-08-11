/*
 * journeys.js — the multi-day arcs, on screen.
 *
 * Two states worth noting in the copy, because both are places where habit apps
 * usually get punitive:
 *
 *   Pausing is offered before abandoning, and it is the visually primary of the
 *   two. A paused journey keeps its progress and simply stops asking. Most
 *   "quit" taps are really "not this week" taps, and giving them a button that
 *   means that is the difference between someone coming back to day six and
 *   someone never starting a journey again.
 *
 *   A journey that did not advance because the day was fragile says so plainly —
 *   "המסע חיכה לך" — rather than silently losing a day or, worse, showing an
 *   unchanged counter that reads as a bug.
 */

import { h, sheet, toast, haptic, ltr } from '../core/dom.js';
import * as store from '../core/store.js';
import { JOURNEYS, journeyBySlug, EFFORT_LABEL } from '../data/journeys.js';
import { categoryLabel, sizeOf } from '../data/taxonomy.js';
import { dayKey } from '../core/day.js';

export function journeysSection(rerender) {
  const state = store.get();
  const j = state.journey;
  const journey = j ? journeyBySlug(j.slug) : null;

  if (!journey) return library(rerender);
  if (j.day >= journey.days) return finished(journey, rerender);
  return active(journey, j, rerender);
}

/* ------------------------------------------------------------------ *
 * Active
 * ------------------------------------------------------------------ */

function active(journey, j, rerender) {
  const today = store.dayEntry(dayKey());
  const waited = !!(today && today.mood && !today.journey);
  const step = journey.steps[Math.min(j.day, journey.days - 1)];

  return h('section.card.journey-active',
    h('div.journey-head',
      h('div',
        h('span.journey-eyebrow', j.state === 'paused' ? 'מושהה' : 'מסע פעיל'),
        h('h2.card-title', journey.title)),
      h('span.journey-count', ltr(`${j.day}/${journey.days}`))),

    progressBar(j.day, journey.days),

    j.state === 'paused'
      ? h('p.card-lede', 'המסע ממתין. תמשיך מאיפה שהיית מתי שתרצה.')
      : h('p.card-lede', waited
        ? 'היום סימנת שקשה, אז המסע חיכה. הוא ימשיך ביום הבא — לא איבדת כלום.'
        : `הצעד הבא: ${categoryLabel(step.category)} · ${sizeOf(step.size).he}`),

    h('div.journey-dots', { 'aria-hidden': 'true' },
      journey.steps.map((s, i) => h(
        `span.jdot${i < j.day ? '.is-done' : ''}${i === j.day ? '.is-now' : ''}`,
      ))),

    h('div.row-actions',
      j.state === 'paused'
        ? h('button.btn.btn-primary', {
          onclick: () => { store.setJourneyState('active'); haptic('select'); rerender(); },
        }, 'המשך')
        : h('button.btn', {
          onclick: () => {
            store.setJourneyState('paused');
            haptic('select');
            toast('המסע מושהה. הוא שומר על המקום.');
            rerender();
          },
        }, 'השהה'),
      h('button.btn.btn-ghost', {
        onclick: () => confirmEnd(rerender),
      }, 'סיים מסע')));
}

function progressBar(done, total) {
  return h('div.journey-bar', { role: 'progressbar', 'aria-valuenow': String(done), 'aria-valuemax': String(total) },
    h('span.journey-fill', { style: { width: `${Math.round((done / total) * 100)}%` } }));
}

function confirmEnd(rerender) {
  const close = sheet(h('div',
    h('p.sheet-lede', 'הימים שכבר עשית נשארים בספר. אפשר להתחיל את המסע שוב מתי שתרצה.'),
    h('div.sheet-actions',
      h('button.btn.btn-danger', {
        onclick: () => { store.endJourney(); close(); rerender(); },
      }, 'סיים'),
      h('button.btn.btn-ghost', { onclick: () => close() }, 'ביטול'))), {
    label: 'סיום מסע', title: 'לסיים את המסע?',
  });
}

/* ------------------------------------------------------------------ *
 * Finished
 * ------------------------------------------------------------------ */

function finished(journey, rerender) {
  return h('section.card.journey-done',
    h('span.journey-eyebrow', 'הושלם'),
    h('h2.card-title', journey.title),
    h('p.card-lede', `${journey.days} ימים. הם בספר שלך.`),
    h('div.row-actions',
      h('button.btn.btn-primary', {
        onclick: () => { store.endJourney(); haptic('success'); rerender(); },
      }, 'בחר מסע חדש')));
}

/* ------------------------------------------------------------------ *
 * Library
 * ------------------------------------------------------------------ */

function library(rerender) {
  return h('section.card',
    h('h2.card-title', 'מסעות'),
    h('p.card-lede', 'רצף של ימים סביב נושא אחד. הניצוץ היומי ממשיך להיות אחד — הוא פשוט מכוון לכיוון אחד לאורך תקופה.'),
    h('div.journey-grid', JOURNEYS.map((jr) => h('button.journey-card', {
      onclick: () => openJourney(jr, rerender),
    },
    h('span.journey-title', jr.title),
    h('span.journey-sub', jr.subtitle),
    h('span.journey-meta', `${jr.days} ימים · ${EFFORT_LABEL[jr.effort]}`)))));
}

function openJourney(journey, rerender) {
  /* The sheet lists what the arc actually asks for, day by day. A journey that
   * will not say what is in it is asking for a fortnight on faith. */
  const close = sheet(h('div',
    h('p.sheet-lede', journey.subtitle),
    h('ol.journey-steps', journey.steps.map((s, i) => h('li.journey-step',
      h('span.jstep-num', ltr(i + 1)),
      h('span.jstep-body', `${categoryLabel(s.category)} · ${sizeOf(s.size).he}`)))),
    h('p.card-foot', 'ביום שבו תסמן שקשה, המסע יחכה ותקבל משהו קטן במקום. הוא לא יתקדם בלעדיך.'),
    h('div.sheet-actions',
      h('button.btn.btn-primary', {
        onclick: () => {
          store.startJourney(journey.slug);
          haptic('success');
          close();
          toast('המסע מתחיל מהניצוץ הבא.');
          rerender();
        },
      }, 'התחל מסע'),
      h('button.btn.btn-ghost', { onclick: () => close() }, 'לא עכשיו'))), {
    label: journey.title, title: journey.title,
  });
}

/** A compact badge for the home screen, or null when no journey is running. */
export function journeyBadge() {
  const state = store.get();
  const j = state.journey;
  if (!j || j.state !== 'active') return null;
  const journey = journeyBySlug(j.slug);
  if (!journey || j.day >= journey.days) return null;
  const entry = store.dayEntry(dayKey());
  const onToday = !!(entry && entry.journey);
  return h('div.journey-badge',
    h('span.journey-badge-title', journey.title),
    h('span.journey-badge-count', onToday
      ? ltr(`יום ${j.day}/${journey.days}`)
      : 'ממתין'));
}
