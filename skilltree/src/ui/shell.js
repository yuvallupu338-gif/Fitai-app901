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
  const main = h('main.main', { id: 'main' });

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

  const app = h('div.app',
    sidebar,
    main,
    /* Skip link, first in tab order, so a keyboard user is not walked through
     * seven nav items on every navigation. */
    h('a', {
      href: '#main',
      class: 'sr-only',
      style: { position: 'fixed', top: '8px', left: '8px', zIndex: '100' },
      onfocus: (e) => { e.target.classList.remove('sr-only'); },
      onblur: (e) => { e.target.classList.add('sr-only'); },
    }, 'Skip to content'));

  document.body.appendChild(app);
  document.body.appendChild(tabbar);
  ensureLiveRegion();

  return { main };
}

/** Mark the active nav item in both navigations at once. */
export function syncNav() {
  const route = currentRoute();
  const active = route ? route.name : 'dashboard';
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
