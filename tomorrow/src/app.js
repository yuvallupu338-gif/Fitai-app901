/*
 * app.js — boot, routing, and the decisions about which day the user is
 * actually looking at.
 *
 * Small on purpose. It wires the store to the shell, builds the context object
 * every view is handed, and owns the one piece of product logic that does not
 * belong to any single screen: which day "the day" means right now, and which
 * of the app's four moments — onboarding, the evening ritual, the morning
 * check-in, the end-of-day review — is due.
 */

import { get, subscribe, setUi, record, dayPlan } from './core/store.js';
import { forecastFor, inputFor, invalidate } from './core/forecast.js';
import { todayKey, addDays, nowMinutes, isValidKey } from './core/time.js';
import { watch as watchMotion } from './core/motion.js';
import { build, show, refresh, toast, flow, currentView } from './ui/shell.js';

import * as home from './ui/home.js';
import * as schedule from './ui/schedule.js';
import * as chat from './ui/chat.js';
import * as insights from './ui/insights.js';
import * as profile from './ui/profile.js';
import { runOnboarding } from './ui/onboarding.js';
import { runRitual } from './ui/ritual.js';
import { runMorning } from './ui/morning.js';
import { runReview } from './ui/review.js';

const VIEWS = { tomorrow: home, schedule, chat, insights, profile };

/*
 * When the evening starts, as far as this app is concerned.
 *
 * Before it, "the day" is today and the app is a companion to a day in
 * progress. After it, today is mostly spent and the useful question is about
 * tomorrow — which is the whole product. Four in the afternoon is early for an
 * adult and about right for the student the demo is built around; either way
 * the header lets the user flip between the two, so the guess only has to be
 * reasonable rather than correct.
 */
const EVENING_FROM = 16 * 60;

function defaultFocus(now) {
  return nowMinutes(now) >= EVENING_FROM ? 'tomorrow' : 'today';
}

/*
 * Which day is on screen.
 *
 * An explicit choice wins over the clock, but only while it still makes sense.
 * A tab left open overnight would otherwise come back in the morning still
 * pinned to "tomorrow" — meaning the day after the one the user actually wants
 * — or, worse, parked on a date that is now in the past. Anything before today
 * falls back to today rather than showing a day nobody can change.
 */
function focusDate(now) {
  const root = get();
  const today = todayKey(now);
  const which = root.ui.focus || defaultFocus(now);
  if (which === 'other') {
    const pinned = root.ui.focusDate;
    if (pinned && isValidKey(pinned) && pinned >= today) return pinned;
    return today;
  }
  return which === 'tomorrow' ? addDays(today, 1) : today;
}

export function greeting(now) {
  const m = nowMinutes(now);
  if (m < 5 * 60) return 'לילה טוב';
  if (m < 12 * 60) return 'בוקר טוב';
  if (m < 16 * 60) return 'צהריים טובים';
  if (m < 22 * 60) return 'ערב טוב';
  return 'לילה טוב';
}

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

/**
 * Everything a view needs, rebuilt on each render.
 *
 * The forecast comes from the memoising layer, so building this object is cheap
 * even though it looks like it does work. Views call ctx.refresh() after they
 * change something rather than repainting themselves, which keeps the "who
 * repaints what" question answerable.
 */
function makeCtx() {
  const now = new Date();
  const root = get();
  const today = todayKey(now);
  const date = focusDate(now);
  return {
    now,
    root,
    today,
    tomorrow: addDays(today, 1),
    date,
    isTomorrow: date !== today,
    profile: root.profile,
    plan: dayPlan(date),
    record: record(date),
    forecast: forecastFor(date, now),
    input: inputFor(date, now),
    greeting: greeting(now),
    go,
    setFocus,
    setFocusDate,
    refresh: repaint,
    toast,
    flow,
    openRitual,
    openMorning,
    openReview,
  };
}

let painting = false;
let scheduled = false;

/*
 * Repaint the mounted view, once, however many writes asked for it.
 *
 * A single gesture usually writes to the store more than once — a view patches
 * an item and then asks for a refresh, and the store's own subscription would
 * have repainted anyway. Rendering three times for one tap is not just waste:
 * each render rebuilds the DOM, so an input the user is typing into loses focus
 * and a half-open sheet flickers. Collapsing them onto a microtask means the
 * writes all land first and the screen is drawn once, from the settled state.
 *
 * The re-entry guard is separate and checked at schedule time, so a view that
 * writes to the store during its own render cannot recurse through the
 * subscription. That would be a bug worth finding, but a blank screen is a poor
 * way to report it.
 */
function repaint() {
  if (painting || scheduled) return;
  scheduled = true;
  Promise.resolve().then(() => {
    scheduled = false;
    painting = true;
    try {
      refresh(makeCtx());
    } finally {
      painting = false;
    }
  });
}

/*
 * Navigation renders synchronously rather than waiting for the microtask,
 * because a tap on the nav bar should move the screen now. Holding the guard
 * across the write keeps the subscription from queueing a second render of the
 * view being left.
 */
function go(view) {
  painting = true;
  try { setUi({ view }); } finally { painting = false; }
  show(view, makeCtx());
}

function setFocus(which) {
  painting = true;
  try { setUi({ focus: which, focusDate: null }); } finally { painting = false; }
  show(currentView() || 'tomorrow', makeCtx());
}

/** Jump to a specific day — used when something is saved onto another one. */
function setFocusDate(date) {
  const today = todayKey(new Date());
  const which = date === today ? 'today' : date === addDays(today, 1) ? 'tomorrow' : 'other';
  painting = true;
  try { setUi({ focus: which, focusDate: which === 'other' ? date : null }); } finally { painting = false; }
  show(currentView() || 'tomorrow', makeCtx());
}

/* ------------------------------------------------------------------ *
 * The four moments
 * ------------------------------------------------------------------ */

function openRitual(date) {
  runRitual(makeCtx(), date || focusDate(new Date()), () => { invalidate(); repaint(); });
}

function openMorning() {
  runMorning(makeCtx(), () => { invalidate(); repaint(); });
}

function openReview(date) {
  runReview(makeCtx(), date, () => { invalidate(); repaint(); });
}

/*
 * Which moment, if any, the app should open itself into.
 *
 * Only ever one, and only when it has not already been answered. An app that
 * greets somebody with three modals in a row has stopped being useful, so the
 * order here is a priority list rather than a queue: the check-in is the one
 * that expires, the review is the one that needs yesterday still fresh, and the
 * ritual is the one that can wait until the user asks for it.
 */
function dueMoment(now) {
  const root = get();
  const today = todayKey(now);
  const m = nowMinutes(now);

  if (m >= 5 * 60 && m < 12 * 60) {
    const rec = record(today);
    if (!rec.morning && Object.keys(root.records).length > 0) return { kind: 'morning' };
  }
  if (m >= 20 * 60) {
    const rec = record(today);
    if (rec.forecast && !rec.review) return { kind: 'review', date: today };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function start() {
  const host = document.getElementById('app');
  if (!host) return;

  const root = get();
  document.documentElement.setAttribute('data-theme', root.profile.theme || 'dark');
  watchMotion();

  build(host, VIEWS, go);

  if (!root.user.onboarded) {
    runOnboarding(makeCtx(), () => {
      invalidate();
      show(get().ui.view || 'tomorrow', makeCtx());
      /*
       * A brand new user has an empty tomorrow and no reason to guess what the
       * app wants from them, so the ritual is the answer to "now what". Somebody
       * who chose the demo has the opposite problem — a full day is already
       * waiting — and opening a five-screen flow over it is the app talking
       * across its own first impression.
       */
      const ctx = makeCtx();
      if (!ctx.input.items.length) openRitual(ctx.date);
    });
    return;
  }

  show(root.ui.view && VIEWS[root.ui.view] ? root.ui.view : 'tomorrow', makeCtx());

  const due = dueMoment(new Date());
  if (due && due.kind === 'morning') openMorning();
  else if (due && due.kind === 'review') openReview(due.date);
}

/*
 * The store is the single source of truth, so a write anywhere repaints. Views
 * still call ctx.refresh() explicitly after their own edits, because that is
 * clearer to read than relying on a side effect three files away — this
 * subscription is the safety net for the writes that happen outside a view.
 */
subscribe(() => {
  if (currentView()) repaint();
});

/*
 * A tab left open overnight is a real case for this app in particular: somebody
 * checks tomorrow before bed and picks the phone up in the morning. Without
 * this the header still says good evening and the forecast is for a day that
 * has already started.
 */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  invalidate();
  if (currentView()) repaint();
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
