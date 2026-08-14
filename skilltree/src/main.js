/*
 * main.js — wiring.
 *
 * Builds the shell, registers routes, and decides what the first screen is.
 * Everything else is in its own module; this file should stay boring.
 */

import { h, clear } from './core/dom.js';
import { icon } from './ui/icons.js';
import * as store from './core/store.js';
import * as session from './core/session.js';
import { route, notFound, start, go, onNavigate, currentRoute } from './core/router.js';
import { buildShell, syncNav, syncTheme, applyTheme } from './ui/shell.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderActivity } from './ui/activity.js';
import { renderOnboarding } from './ui/onboarding.js';
import {
  renderTree, renderExplore, renderProgress, renderAchievements, renderProfile, renderSettings,
} from './ui/screens.js';
import { buildDemoProfile } from './data/demo.js';
import { findActivity, findSkill, allTrees } from './data/catalog.js';

const { main } = buildShell();

/*
 * Every screen render is wrapped.
 *
 * A thrown error inside one screen must not leave a blank page with a stack
 * trace in a console nobody has open — the learner gets a real message and a
 * way out, and the error still reaches the console for whoever is debugging.
 */
function screen(fn) {
  return (parsed) => {
    try {
      fn(main, parsed.params, parsed.query);
    } catch (err) {
      console.error('screen failed', err);
      clear(main);
      main.appendChild(h('div.wrap', h('div.empty',
        icon('alert', { size: 28 }),
        h('h3', 'That screen failed to load'),
        h('p', err && err.message ? err.message : 'Something went wrong.'),
        h('div.row', { style: { gap: 'var(--s2)' } },
          h('button.btn.primary', { onclick: () => go('dashboard') }, 'Go home'),
          h('button.btn', { onclick: () => window.location.reload() }, 'Reload')))));
    }
  };
}

/* A profile is required for every screen except onboarding — without one there
 * is nothing to render and every screen would need its own null check. */
function guarded(fn) {
  return screen((host, params, query) => {
    if (!store.get() || !store.get().onboarded) { go('onboarding'); return; }
    fn(host, params, query);
  });
}

route('dashboard', guarded((host) => renderDashboard(host)));
route('tree', guarded((host, params, query) => renderTree(host, params, query)));
route('explore', guarded((host) => renderExplore(host)));
route('progress', guarded((host) => renderProgress(host)));
route('achievements', guarded((host) => renderAchievements(host)));
route('profile', guarded((host) => renderProfile(host)));
route('settings', guarded((host) => renderSettings(host)));
route('activity', guarded((host, params) => renderActivity(host, params[0])));

route('onboarding', screen((host) => {
  if (!store.get()) store.createProfile('');
  renderOnboarding(host);
}));

/*
 * The demo route (§77). Installs a fully-populated profile so the whole
 * product is visible without an hour of clicking, then lands on the dashboard.
 * It creates a *separate* profile rather than overwriting the current one, so
 * trying the demo cannot cost someone their real progress.
 */
route('demo', screen(() => {
  const existing = store.listProfiles().find((p) => p.name === 'Alex' && p.demo);
  if (existing) {
    store.switchProfile(existing.id);
    go('dashboard');
    return;
  }

  const demo = buildDemoProfile();
  const created = store.createProfile('Alex');
  store.update((profile) => ({ ...demo, id: profile.id, name: 'Alex', demo: true, createdAt: Date.now() - 80 * 86400000 }));
  syncTheme();
  go('dashboard');
}));

notFound(screen((host) => {
  clear(host);
  host.appendChild(h('div.wrap', h('div.empty',
    icon('compass', { size: 28 }),
    h('h3', 'Nothing here'),
    h('p', 'That link does not point at a screen in this app.'),
    h('button.btn.primary', { onclick: () => go('dashboard') }, 'Go home'))));
}));

onNavigate(() => {
  syncNav();
  /* Reset scroll on navigation. Without this, moving from a long tree page to
   * the dashboard lands halfway down it. */
  if (currentRoute()?.name !== 'tree') window.scrollTo(0, 0);
});

/* Repaint the active screen whenever stored state changes, so a change made in
 * a sheet is reflected on the page behind it without every caller remembering
 * to re-render. */
let repainting = false;
store.subscribe(() => {
  if (repainting) return;
  repainting = true;
  window.requestAnimationFrame(() => {
    repainting = false;
    syncTheme();
  });
});

syncTheme();

/* First run goes to onboarding; everyone else resumes where the hash says. */
if (!store.get() || !store.get().onboarded) {
  if (!window.location.hash || window.location.hash === '#/') {
    window.location.replace('#/onboarding');
  }
}

start();

/*
 * A small surface for the smoke test to drive the app deterministically —
 * resetting between runs, installing the demo without clicking through six
 * onboarding steps, and reading activity data to answer a quiz correctly.
 *
 * The catalogue accessors are here for a specific reason: the test previously
 * reached for them with a dynamic module load, which resolves against the page
 * URL and therefore breaks in the single-file build. It failed silently and
 * the test fell back to guessing, which is exactly how 101 questions with the
 * answer at index 0 went unnoticed. Exposing them makes the test read real
 * data in both builds, or fail loudly.
 *
 * Namespaced, read-only in practice, and inert for anyone not looking for it.
 */
window.SkillTree = {
  store, session, go, buildDemoProfile, applyTheme,
  catalog: { findActivity, findSkill, allTrees },
};
