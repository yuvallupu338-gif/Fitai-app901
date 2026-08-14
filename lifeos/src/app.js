/*
 * app.js — boot, routes, and the keyboard.
 *
 * Three states, decided at boot and re-decided whenever the session changes:
 *
 *   no account on this device  → sign up
 *   signed out                 → sign in
 *   signed in, never onboarded → onboarding
 *   signed in                  → the app
 *
 * Screens are lazy-imported. Not for bundle size — there is no bundler — but
 * because the calendar, the analytics and the settings screen are a third of
 * the code and none of them is needed to paint Today, which is where almost
 * every session starts and the only screen whose first paint anybody notices.
 */

import { h, qs, clear, announce } from './core/dom.js';
import { t } from './core/i18n.js';
import * as router from './core/router.js';
import { on, EV } from './core/bus.js';
import * as session from './core/session.js';
import * as store from './core/store.js';
import * as db from './core/db.js';
import { invalidate, profile } from './services/core.js';
import { applyTheme, currentTheme } from './services/account.js';
import { toastError } from './core/toast.js';
import * as shell from './ui/shell.js';

const root = qs('#app');

/* ------------------------------------------------------------------ *
 * Screen registry
 *
 * Each entry resolves to a module exporting `render(rerender, params)` which
 * returns a node. Keeping the contract identical across twenty screens is what
 * lets the re-render loop below be four lines.
 * ------------------------------------------------------------------ */

const SCREENS = {
  today: { load: () => import('./ui/today.js'), fn: 'renderToday', title: 'nav.today' },
  inbox: { load: () => import('./ui/inbox.js'), fn: 'renderInbox', title: 'nav.inbox' },
  tasks: { load: () => import('./ui/tasks.js'), fn: 'renderTasks', title: 'nav.tasks' },
  calendar: { load: () => import('./ui/calendar.js'), fn: 'renderCalendar', title: 'nav.calendar', wide: true },
  goals: { load: () => import('./ui/goals.js'), fn: 'renderGoals', title: 'nav.goals' },
  goalDetail: { load: () => import('./ui/goals.js'), fn: 'renderGoalDetail', title: 'nav.goals' },
  projects: { load: () => import('./ui/projects.js'), fn: 'renderProjects', title: 'nav.projects' },
  projectDetail: { load: () => import('./ui/projects.js'), fn: 'renderProjectDetail', title: 'nav.projects' },
  areas: { load: () => import('./ui/areas.js'), fn: 'renderAreas', title: 'nav.areas' },
  habits: { load: () => import('./ui/habits.js'), fn: 'renderHabits', title: 'nav.habits' },
  routines: { load: () => import('./ui/routines.js'), fn: 'renderRoutines', title: 'nav.routines' },
  focus: { load: () => import('./ui/focus.js'), fn: 'renderFocusScreen', title: 'nav.focus' },
  notes: { load: () => import('./ui/notes.js'), fn: 'renderNotes', title: 'nav.notes' },
  someday: { load: () => import('./ui/someday.js'), fn: 'renderSomeday', title: 'nav.someday' },
  progress: { load: () => import('./ui/progress.js'), fn: 'renderProgress', title: 'nav.progress', wide: true },
  review: { load: () => import('./ui/review.js'), fn: 'renderReview', title: 'nav.review' },
  settings: { load: () => import('./ui/settings.js'), fn: 'renderSettings', title: 'nav.settings' },
  memory: { load: () => import('./ui/memory.js'), fn: 'renderMemory', title: 'nav.memory' },
  more: { load: () => import('./ui/more.js'), fn: 'renderMore', title: 'nav.more' },
};

let currentScreen = null;
let currentParams = {};

/**
 * Render a screen, then re-render it in place whenever it asks.
 *
 * The screen owns its own refresh: it is handed a function that rebuilds it
 * from current data and swaps the subtree. That is the entire state management
 * model, and for an app rendering from one in-memory snapshot it is enough —
 * there is no diffing to get wrong and no stale closure to chase.
 */
async function show(name, params) {
  const entry = SCREENS[name];
  if (!entry) { router.replace('/today'); return; }

  currentScreen = name;
  currentParams = params || {};

  let module;
  try {
    module = await entry.load();
  } catch (e) {
    shell.render(h('div.empty',
      h('p.empty-title', t('errors.generic')),
      h('button.btn.btn-secondary', {
        style: { marginBlockStart: '16px' },
        onclick: () => window.location.reload(),
      }, t('common.retry'))), t(entry.title));
    return;
  }

  /* A navigation that happened while the module was loading wins. Without this
   * a slow import can paint over the screen somebody has already moved to. */
  if (currentScreen !== name) return;

  shell.wide(!!entry.wide);

  const rerender = () => {
    if (currentScreen !== name) return;
    try {
      shell.render(module[entry.fn](rerender, currentParams), t(entry.title));
    } catch (e) {
      reportScreenError(e, entry);
    }
  };

  try {
    shell.render(module[entry.fn](rerender, currentParams), t(entry.title));
  } catch (e) {
    reportScreenError(e, entry);
  }
}

function reportScreenError(error, entry) {
  if (typeof console !== 'undefined') console.error(error);
  shell.render(h('div.empty',
    h('p.empty-title', t('errors.generic')),
    h('p.empty-note', t('errors.notFoundNote')),
    h('button.btn.btn-secondary', {
      style: { marginBlockStart: '16px' },
      onclick: () => router.go('/today'),
    }, t('errors.goBack'))), t(entry.title));
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

function defineRoutes() {
  router.define('/today', () => show('today'));
  router.define('/inbox', () => show('inbox'));
  router.define('/tasks', () => show('tasks'));
  router.define('/calendar', () => show('calendar'));
  router.define('/calendar/:date', (p) => show('calendar', p));
  router.define('/goals', () => show('goals'));
  router.define('/goals/:id', (p) => show('goalDetail', p));
  router.define('/projects', () => show('projects'));
  router.define('/projects/:id', (p) => show('projectDetail', p));
  router.define('/areas', () => show('areas'));
  router.define('/habits', () => show('habits'));
  router.define('/routines', () => show('routines'));
  router.define('/focus', () => show('focus'));
  router.define('/notes', () => show('notes'));
  router.define('/notes/:id', (p) => show('notes', p));
  router.define('/someday', () => show('someday'));
  router.define('/progress', () => show('progress'));
  router.define('/review', () => show('review'));
  router.define('/review/:period', (p) => show('review', p));
  router.define('/settings', () => show('settings'));
  router.define('/memory', () => show('memory'));
  router.define('/more', () => show('more'));
  router.defineNotFound(() => router.replace('/today'));
}

/* ------------------------------------------------------------------ *
 * Keyboard
 *
 * Every shortcut is also a visible control somewhere. Shortcuts that are the
 * only way to reach something are a feature for the person who wrote them.
 * ------------------------------------------------------------------ */

function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function bindKeys() {
  document.addEventListener('keydown', async (e) => {
    /* Ctrl/Cmd+K works even inside a field — it is how you get out of one. */
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const { openPalette } = await import('./ui/palette.js');
      openPalette();
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    /* A dialog is open: its own handler owns the keyboard. */
    if (qs('.scrim') || qs('.palette-scrim') || qs('.focus-screen')) return;

    switch (e.key) {
      case 'n': {
        e.preventDefault();
        const { openCapture } = await import('./ui/capture.js');
        openCapture();
        break;
      }
      case 'c': {
        e.preventDefault();
        const { openTaskEditor } = await import('./ui/taskeditor.js');
        openTaskEditor(null, () => show(currentScreen, currentParams));
        break;
      }
      case 'g':
        e.preventDefault();
        router.go('/today');
        break;
      case 'f': {
        e.preventDefault();
        const { openFocusPicker } = await import('./ui/focus.js');
        openFocusPicker();
        break;
      }
      case '/': {
        e.preventDefault();
        const { openPalette } = await import('./ui/palette.js');
        openPalette();
        break;
      }
      case '?': {
        e.preventDefault();
        const { openShortcuts } = await import('./ui/more.js');
        openShortcuts();
        break;
      }
      default:
        break;
    }
  });
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function showAuth() {
  clear(root);
  const { renderAuth } = await import('./ui/auth.js');
  root.appendChild(renderAuth(() => boot()));
  document.title = t('app.name');
}

async function showOnboarding() {
  clear(root);
  const { renderOnboarding } = await import('./ui/onboarding.js');
  root.appendChild(renderOnboarding(() => {
    invalidate();
    boot();
  }));
  document.title = t('app.name');
}

function mountApp() {
  clear(root);
  shell.mount(root);
  defineRoutes();
  router.start();
}

export function boot() {
  store.probeStorage();
  applyTheme(currentTheme());

  const user = session.restore();
  if (!user) { showAuth(); return; }

  db.load();
  invalidate();

  const p = profile();
  if (!p.onboardedAt) { showOnboarding(); return; }

  /* The theme stored on the account wins once we know who is signed in — the
   * device default was only ever a guess made before that was knowable. */
  applyTheme(p.preferredTheme || currentTheme());
  mountApp();
}

/* A write that could not reach disk is the one failure a person must be told
 * about immediately, because everything they do afterwards is provisional. */
let storageWarned = false;
on(EV.STORAGE_FAILED, () => {
  if (storageWarned) return;
  storageWarned = true;
  toastError(t('errors.storageFull'), { duration: 20000 });
});

on(EV.SESSION_CHANGED, (user) => {
  if (!user) { showAuth(); return; }
  db.unload();
  db.load();
  invalidate();
  boot();
});

/* Signed in in another tab, or signed out there. Either way this tab is now
 * showing somebody else's data or nobody's, and it has to catch up. */
window.addEventListener('storage', (e) => {
  if (!e.key || !e.key.startsWith(store.STORAGE_PREFIX)) return;
  if (e.key.endsWith('.session')) {
    db.unload();
    boot();
  } else if (e.key.includes('.data.')) {
    db.unload();
    invalidate();
    if (currentScreen) show(currentScreen, currentParams);
  }
});

bindKeys();
boot();

announce(t('app.name'));
