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

import { h } from './core/dom.js';
import { get, subscribe, setUi, record, dayPlan } from './core/store.js';
import { forecastFor, inputFor, invalidate } from './core/forecast.js';
import { todayKey, addDays, nowMinutes } from './core/time.js';
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

function focusDate(now) {
  const root = get();
  const which = root.ui.focus || defaultFocus(now);
  const today = todayKey(now);
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
    refresh: repaint,
    toast,
    flow,
    openRitual,
    openMorning,
    openReview,
  };
}

function go(view) {
  setUi({ view });
  show(view, makeCtx());
}

function setFocus(which) {
  setUi({ focus: which });
  repaint();
}

let painting = false;

/*
 * Repaint the mounted view.
 *
 * Guarded against re-entry because a view that writes to the store during its
 * own render would otherwise recurse through the subscription below. That is a
 * bug worth catching rather than tolerating, but a blank screen is a bad way to
 * report it.
 */
function repaint() {
  if (painting) return;
  painting = true;
  try {
    refresh(makeCtx());
  } finally {
    painting = false;
  }
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
      // A brand new user has an empty tomorrow and no reason to guess what the
      // app wants from them. The ritual is the answer to "now what".
      openRitual();
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
