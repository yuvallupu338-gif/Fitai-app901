/*
 * app.js — the shell: theme, tabs, and the once-a-day bookkeeping.
 *
 * Rendering is full-redraw-per-screen rather than diffed. At this size that is
 * the right trade: four screens, no lists longer than a year of one-line rows,
 * and a codebase where nobody has to reason about stale state. The one place it
 * would show — the book's year grid — is built once per visit, not per tap.
 */

import { h, clear, qs, toast } from './core/dom.js';
import * as store from './core/store.js';
import { dayKey } from './core/day.js';
import * as streak from './core/streak.js';
import { renderOnboarding, sparkMark } from './ui/onboarding.js';
import { renderHome, offerNotifications } from './ui/home.js';
import { renderBook } from './ui/book.js';
import { renderInsights } from './ui/insights.js';
import { renderProfile } from './ui/profile.js';
import * as notify from './ui/notify.js';

const TABS = [
  { key: 'home', he: 'בית', glyph: 'spark' },
  { key: 'book', he: 'הספר', glyph: 'book' },
  { key: 'insights', he: 'תובנות', glyph: 'chart' },
  { key: 'profile', he: 'פרופיל', glyph: 'person' },
];

const app = qs('#app');
let tab = 'home';
let firstRun = false;

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

/*
 * Three states, not two: an explicit choice wins, and "system" means the OS
 * decides. Written to the root element as an attribute so the whole stylesheet
 * can key off tokens and no component ever needs to know which theme is on.
 */
function applyTheme() {
  const pref = store.get().settings.theme;
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);

  const dark = pref === 'dark'
    || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = qs('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#131110' : '#FBF7F2');
}

/* ------------------------------------------------------------------ *
 * Chrome
 * ------------------------------------------------------------------ */

function tabIcon(kind) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'tab-icon');
  svg.setAttribute('aria-hidden', 'true');
  const paths = {
    spark: 'M12 3c.3 4.6 1.6 6.9 5.4 8-3.4.9-4.8 2.8-5.6 6.6-.7-3.5-1.9-5.3-4.8-6.2C10 10.3 11.2 8.3 12 3z',
    book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H18v18H6.5A1.5 1.5 0 0 1 5 19.5zM9 3v18',
    chart: 'M4 20V10M10 20V5M16 20v-7M22 20H2',
    person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.4-3.6 4.3-5.4 8-5.4s6.6 1.8 8 5.4',
  };
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[kind] || paths.spark);
  path.setAttribute('fill', kind === 'spark' ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

function tabBar() {
  return h('nav.tabs', { role: 'tablist', 'aria-label': 'ניווט ראשי' },
    TABS.map((t) => h(`button.tab${tab === t.key ? '.is-on' : ''}`, {
      role: 'tab', 'aria-selected': String(tab === t.key),
      onclick: () => go(t.key),
    }, tabIcon(t.glyph), h('span.tab-label', t.he))));
}

export function go(next) {
  tab = next;
  /* The hash is set so the back button and a deep link both work, but the app
   * does not read it on every render — that way a stale hash from a previous
   * session cannot decide which screen someone lands on. */
  if (location.hash !== `#${next}`) history.replaceState(null, '', `#${next}`);
  render();
  const heading = qs('.screen-title, .spark-title');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

const ctx = {
  rerender: () => render(),
  applyTheme,
  get firstRun() { return firstRun; },
  /*
   * Called after the first response of the very first day, and only then.
   * This is the notification ask, placed where the person has just received
   * something rather than before they have received anything.
   */
  afterFirstResponse: () => {
    if (!firstRun) return;
    firstRun = false;
    offerNotifications(() => render());
  },
};

function render() {
  const state = store.get();

  if (state.stage !== 'app') {
    clear(app);
    renderOnboarding(app, () => {
      firstRun = true;
      streak.registerOpen();
      go('home');
    });
    return;
  }

  clear(app);
  const screen = h('main.screen', { id: 'screen' });
  app.appendChild(screen);
  app.appendChild(tabBar());

  if (tab === 'home') renderHome(screen, ctx);
  else if (tab === 'book') renderBook(screen);
  else if (tab === 'insights') renderInsights(screen);
  else renderProfile(screen, ctx);
}

/* ------------------------------------------------------------------ *
 * Day boundary
 * ------------------------------------------------------------------ */

/*
 * A phone keeps a tab alive for days. Without this check, someone who opened
 * the app on Tuesday and returns to it on Thursday sees Tuesday's spark with
 * Tuesday's date, and the streak never registers Thursday at all.
 *
 * Checked on every visibility change rather than on a timer, because a timer in
 * a suspended tab does not fire — which is exactly the case this is for.
 */
let lastSeenDay = dayKey();

function checkDayBoundary() {
  const today = dayKey();
  if (today === lastSeenDay) return;
  lastSeenDay = today;
  reportOpen();
  render();
}

function reportOpen() {
  const report = streak.registerOpen();
  if (report.usedFreeze) {
    toast(`הרצף שלך שמור. השתמשנו ב${report.coveredDays === 1 ? 'יום הקפאה' : `-${report.coveredDays} ימי הקפאה`}.`);
  }
  notify.registerOpen(false);
  notify.schedule();
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function boot() {
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  const state = store.get();
  if (state.stage === 'app') reportOpen();

  const hash = (location.hash || '').replace('#', '');
  if (TABS.some((t) => t.key === hash)) tab = hash;

  render();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkDayBoundary();
  });
  window.addEventListener('focus', checkDayBoundary);
  window.addEventListener('hashchange', () => {
    const next = (location.hash || '').replace('#', '');
    if (TABS.some((t) => t.key === next) && next !== tab) go(next);
  });

  /*
   * The service worker is what makes this work with no network at all — which
   * for a once-a-day app on a phone is not an edge case, it is the commute.
   * Registration is guarded because the single-file build runs from file://,
   * where service workers are unavailable and the failure would be noisy.
   */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline still works from cache */ });
    navigator.serviceWorker.addEventListener('message', (event) => {
      /* The "✓ עשיתי" button on the notification posts back here. */
      if (event.data && event.data.type === 'spark-done') {
        const entry = store.dayEntry(dayKey());
        if (entry && entry.status !== 'completed') {
          store.putDay(dayKey(), { status: 'completed', respondedAt: Date.now() });
          render();
        }
      }
    });
  }

  /* A tiny mark in the corner while the first paint settles — the app should
   * never show an empty white page, even for 200ms. */
  const brand = qs('.boot-mark');
  if (brand) brand.remove();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* Exported so the smoke test can drive the app without reaching into the DOM
 * for navigation, and so the mark is reachable from one place. */
export { render, applyTheme, sparkMark };
