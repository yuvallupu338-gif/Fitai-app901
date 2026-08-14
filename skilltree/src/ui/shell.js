/*
 * shell.js — the frame: sidebar on desktop, tab bar on a phone, and the theme.
 *
 * Both navigations render from one list, so a screen cannot exist in the
 * sidebar and be unreachable on mobile — which is the usual way a "responsive"
 * app ends up with a feature nobody on a phone can find.
 */

import { h, clear, qsa, ensureLiveRegion } from '../core/dom.js';
import { icon, brandMark } from './icons.js';
import { go, currentRoute } from '../core/router.js';
import * as session from '../core/session.js';
import * as store from '../core/store.js';

const NAV = [
  { name: 'dashboard', label: 'Home', icon: 'home' },
  { name: 'plan', label: 'Goal', icon: 'target' },
  { name: 'tree', label: 'Tree', icon: 'tree' },
  { name: 'explore', label: 'Explore', icon: 'compass' },
  { name: 'progress', label: 'Progress', icon: 'chart' },
  { name: 'achievements', label: 'Awards', icon: 'award' },
  { name: 'profile', label: 'Profile', icon: 'user' },
];

/* The tab bar takes five. Explore and Awards are the two that survive being a
 * tap further away — the goal, the tree and progress are the daily loop. */
const MOBILE_NAV = NAV.filter((n) => !['achievements', 'explore'].includes(n.name));

/**
 * Apply a theme. Dark is the default and is what an unset preference gets —
 * the brief asks for dark first, and the palette was built for it.
 */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#F4F3EF' : '#0E1012');
}

export function buildShell() {
  const main = h('main.main', { id: 'main', tabindex: '-1' });

  const sidebar = h('nav.nav', { 'aria-label': 'Main' },
    h('div.nav-brand', brandMark(26), 'SkillTree'),
    ...NAV.map((item) => h('button.nav-link', {
      type: 'button',
      data: { nav: item.name },
      onclick: () => go(item.name),
    }, icon(item.icon, { size: 17, class: 'nav-icon' }), item.label)),
    h('div.nav-spacer'),
    h('button.nav-link', {
      type: 'button',
      data: { nav: 'settings' },
      onclick: () => go('settings'),
    }, icon('settings', { size: 17, class: 'nav-icon' }), 'Settings'));

  const tabbar = h('nav.tabbar', { 'aria-label': 'Main' },
    ...MOBILE_NAV.map((item) => h('button.tab', {
      type: 'button',
      data: { nav: item.name },
      onclick: () => go(item.name),
    }, icon(item.icon, { size: 19 }), item.label)),
    h('button.tab', {
      type: 'button',
      data: { nav: 'settings' },
      onclick: () => go('settings'),
    }, icon('settings', { size: 19 }), 'Settings'));

  /*
   * Genuinely first in tab order — it was appended last, after the sidebar and
   * the whole of main, so it was reached only after every other control on the
   * page and skipped nothing. It also painted transparent white text over the
   * h1 when focused; `.skip-link` in components.css gives it a real surface.
   */
  const skip = h('a.skip-link', {
    href: '#main',
    onclick: () => { window.requestAnimationFrame(() => main.focus()); },
  }, 'Skip to content');

  const app = h('div.app', skip, sidebar, main);

  document.body.appendChild(app);
  document.body.appendChild(tabbar);
  document.body.appendChild(demoBar());
  ensureLiveRegion();

  return { main };
}

/*
 * A banner while the demo profile is active.
 *
 * #/demo switches to a populated profile called Alex and says nothing about
 * it. Everything afterwards reads as the learner's own — "Good afternoon,
 * Alex", 1,346 XP, a 15-day streak — and the only route back was Settings,
 * below Appearance and Daily missions, where nobody would think to look for
 * it. Someone who tried the demo out of curiosity was simply left in it.
 */
function demoBar() {
  const bar = h('div.demobar', { hidden: true, role: 'status' });

  const sync = () => {
    const profile = store.get();
    const on = !!profile?.demo;
    bar.hidden = !on;
    document.body.classList.toggle('has-demobar', on);
    if (!on) return;

    clear(bar);
    const mine = store.listProfiles().find((p) => !p.demo);
    /* Short on a phone, where two wrapped lines plus a button took a fifth of
     * the screen away from the canvas below it. */
    bar.appendChild(h('span.demobar-long', "Demo profile — this progress belongs to Alex, not to you."));
    bar.appendChild(h('span.demobar-short', 'Demo profile'));
    bar.appendChild(h('button.btn.small', {
      onclick: () => {
        if (mine) store.switchProfile(mine.id);
        else go('onboarding');
      },
    }, mine ? `Back to ${mine.name || 'my profile'}` : 'Start my own'));
  };

  sync();
  store.subscribe(sync);
  return bar;
}

/** Mark the active nav item in both navigations at once. */
export function syncNav() {
  const route = currentRoute();
  const active = route ? route.name : 'dashboard';

  /*
   * Hide both navigations during onboarding.
   *
   * They were rendered on every step — eight sidebar links and six tabs, all
   * looking enabled — and were entirely inert *except* for one destructive
   * effect: every screen is guarded on `onboarded`, so clicking any of them
   * bounced back to `#/onboarding`, which re-runs with a fresh answers object.
   * The learner's name and chosen area vanished and they landed on step one
   * again, with no warning and nothing to explain it. On the first screen a new
   * user ever sees.
   *
   * Controls that cannot work should not be on the screen. The onboarding has
   * its own back and next.
   */
  document.body.classList.toggle('onboarding', active === 'onboarding');
  for (const el of qsa('[data-nav]')) {
    const on = el.dataset.nav === active;
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }

  /* Title follows the route: it is what a browser tab, a bookmark and the
   * back-button history all read from. */
  const label = [...NAV,
    { name: 'settings', label: 'Settings' },
    { name: 'activity', label: 'Activity' },
    { name: 'explore', label: 'Explore' },
  ].find((n) => n.name === active);
  document.title = label && label.name !== 'dashboard' ? `${label.label} · SkillTree` : 'SkillTree';
}

/** Theme from the stored profile, falling back to dark. */
export function syncTheme() {
  const profile = session.profile();
  applyTheme(profile?.settings?.theme || 'dark');
}
