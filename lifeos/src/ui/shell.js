/*
 * shell.js — the frame every screen renders into.
 *
 * A rail on the inline-start edge on desktop, which an RTL document puts on
 * the right without a single direction-specific rule; a bottom bar under 900px,
 * because a 244px rail on a 390px phone is a drawer nobody opens.
 *
 * THE NAVIGATION IS NOT A LIST OF SCREENS, IT IS THE CORE LOOP.
 *
 *     קליטה → ארגון → תעדוף → תכנון → מיקוד → ביצוע → למידה → התאמה
 *
 * grouped as: what today needs (היום, תיבת קליטה, משימות, לוח שנה), what the
 * work belongs to (מטרות, פרויקטים, תחומים), what repeats (הרגלים, שגרות,
 * מיקוד), and what it produced (הערות, התקדמות, סיכומים). Somebody who has
 * never seen the app should be able to read the sidebar and understand what it
 * thinks a life is made of.
 *
 * Counts next to items are live and only shown when non-zero — a permanent
 * "0" next to תיבת קליטה is visual noise that trains people to stop reading
 * the number.
 */

import { h, clear, qs, announce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { href, isActive, go } from '../core/router.js';
import { on, EV } from '../core/bus.js';
import { snapshot } from '../services/core.js';
import { currentUser, signOut } from '../core/session.js';
import { openCapture } from './capture.js';
import { openPalette } from './palette.js';

const PRIMARY = [
  { path: '/today', label: 'nav.today', icon: 'today' },
  { path: '/inbox', label: 'nav.inbox', icon: 'inbox', count: 'inbox' },
  { path: '/tasks', label: 'nav.tasks', icon: 'tasks', count: 'overdue' },
  { path: '/calendar', label: 'nav.calendar', icon: 'calendar' },
];

const STRUCTURE = [
  { path: '/goals', label: 'nav.goals', icon: 'goal' },
  { path: '/projects', label: 'nav.projects', icon: 'project', count: 'attention' },
  { path: '/areas', label: 'nav.areas', icon: 'area' },
];

const RHYTHM = [
  { path: '/habits', label: 'nav.habits', icon: 'habit' },
  { path: '/routines', label: 'nav.routines', icon: 'routine' },
  { path: '/focus', label: 'nav.focus', icon: 'focus' },
];

const OUTPUT = [
  { path: '/notes', label: 'nav.notes', icon: 'note' },
  { path: '/progress', label: 'nav.progress', icon: 'progress' },
  { path: '/review', label: 'nav.review', icon: 'review' },
];

/* Five on the bottom bar, because six is where the labels start truncating on
 * a 375px screen and a truncated label is worse than a menu. */
const MOBILE = [
  { path: '/today', label: 'nav.today', icon: 'today' },
  { path: '/tasks', label: 'nav.tasks', icon: 'tasks', count: 'overdue' },
  { path: '/calendar', label: 'nav.calendar', icon: 'calendar' },
  { path: '/goals', label: 'nav.goals', icon: 'goal' },
  { path: '/more', label: 'nav.more', icon: 'more' },
];

let root = null;
let contentHost = null;
let titleHost = null;

/** The counts shown as badges. Recomputed on every data change. */
function counts() {
  const snap = snapshot();
  return {
    inbox: snap.tasks.filter((x) => x.status === 'inbox' && !x.someday).length,
    overdue: snap.tasks.filter((x) => x.dueDate && x.dueDate < snap.today
      && x.status !== 'done' && x.status !== 'cancelled' && !x.someday).length,
    attention: snap.atRiskProjectIds ? snap.atRiskProjectIds.size : 0,
  };
}

function navItem(item, values) {
  const n = item.count ? values[item.count] : 0;
  const active = isActive(item.path);
  return h('a.nav-item', {
    href: href(item.path),
    'aria-current': active ? 'page' : null,
  },
  icon(item.icon),
  h('span.nav-label', t(item.label)),
  n > 0
    ? h('span.nav-count', {
      class: item.count === 'overdue' || item.count === 'attention' ? 'nav-count-alert' : null,
      'aria-label': `${n}`,
    }, String(n))
    : null);
}

function sidebar(values) {
  return h('nav.sidebar', { 'aria-label': t('nav.menu') },
    h('a.brand', { href: href('/today') },
      h('div.brand-mark', icon('layers', { size: 17 })),
      h('span.brand-name', t('app.name'))),

    h('div', { style: { padding: '0 var(--sp-3) var(--sp-3)' } },
      h('button.btn.btn-primary.btn-block', {
        type: 'button',
        onclick: () => openCapture(),
      }, icon('plus', { size: 16 }), t('inbox.capturePlaceholder').replace('…', ''))),

    h('div.nav-group', PRIMARY.map((i) => navItem(i, values))),

    h('div.nav-heading', t('nav.library')),
    h('div.nav-group', STRUCTURE.map((i) => navItem(i, values))),

    h('div.nav-heading', t('nav.planning')),
    h('div.nav-group', RHYTHM.map((i) => navItem(i, values))),

    h('div.nav-heading', t('nav.more')),
    h('div.nav-group', OUTPUT.map((i) => navItem(i, values))),

    h('div.sidebar-foot',
      h('div.nav-group',
        h('button.nav-item', {
          type: 'button',
          onclick: () => openPalette(),
        }, icon('search'), h('span.nav-label', t('nav.search')),
        h('span.kbd', 'Ctrl K')),
        navItem({ path: '/settings', label: 'nav.settings', icon: 'settings' }, values))));
}

function bottomNav(values) {
  return h('nav.bottom-nav', { 'aria-label': t('nav.menu') },
    MOBILE.map((item) => {
      const n = item.count ? values[item.count] : 0;
      const active = item.path === '/more'
        ? !MOBILE.slice(0, 4).some((m) => isActive(m.path))
        : isActive(item.path);
      return h('a.bottom-item', {
        href: href(item.path),
        'aria-current': active ? 'page' : null,
      },
      icon(item.icon),
      h('span', t(item.label)),
      n > 0 ? h('span.bottom-badge', { 'aria-hidden': 'true' }, n > 9 ? '9+' : String(n)) : null,
      n > 0 ? h('span.sr-only', plural('count.tasks', n)) : null);
    }));
}

function topbar() {
  const user = currentUser();
  return h('header.topbar',
    h('h1.topbar-title.grow.ellipsis', { id: 'screen-title' }, ''),
    h('button.btn-icon', {
      type: 'button',
      'aria-label': t('nav.search'),
      onclick: () => openPalette(),
    }, icon('search')),
    h('a.btn-icon', {
      href: href('/settings'),
      'aria-label': t('nav.settings'),
    }, icon('settings')),
    user
      ? h('button.avatar', {
        type: 'button',
        title: user.displayName,
        'aria-label': user.displayName,
        onclick: () => go('/settings'),
      }, (user.displayName || '?').trim().charAt(0))
      : null);
}

/**
 * Build the shell once. Screens render into the content host, so navigating
 * does not rebuild the navigation — which matters for the focus ring: a rail
 * rebuilt on every route change throws focus back to the document.
 */
export function mount(hostElement) {
  root = hostElement;
  clear(root);

  const values = counts();

  contentHost = h('main.content', { id: 'main', tabindex: '-1' });

  root.appendChild(h('a.skip-link', { href: '#main' }, t('nav.skipToContent')));
  root.appendChild(h('div.shell',
    sidebar(values),
    h('div.main', topbar(), contentHost),
    bottomNav(values)));

  root.appendChild(h('button.fab', {
    type: 'button',
    'aria-label': t('inbox.capturePlaceholder'),
    onclick: () => openCapture(),
  }, icon('plus')));

  titleHost = qs('#screen-title', root);

  /* The badges are the only part of the chrome that depends on data, so they
   * are the only part that gets rebuilt on a write. */
  on(EV.DATA_CHANGED, refreshNav);
  on(EV.ROUTE_CHANGED, refreshNav);

  return contentHost;
}

function refreshNav() {
  if (!root) return;
  const values = counts();
  const oldSidebar = qs('.sidebar', root);
  const oldBottom = qs('.bottom-nav', root);
  if (oldSidebar) oldSidebar.replaceWith(sidebar(values));
  if (oldBottom) oldBottom.replaceWith(bottomNav(values));
}

/** Swap the screen. Returns the host so a screen can keep a reference. */
export function render(node, title) {
  if (!contentHost) return null;
  clear(contentHost);
  if (Array.isArray(node)) for (const n of node) contentHost.appendChild(n);
  else if (node) contentHost.appendChild(node);
  setTitle(title);
  contentHost.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'auto' });
  return contentHost;
}

export function setTitle(title) {
  if (titleHost) titleHost.textContent = title || '';
  document.title = title ? `${title} · ${t('app.name')}` : t('app.name');
  /* Announced because a single-page navigation moves nothing a screen reader
   * would otherwise notice. */
  if (title) announce(title);
}

export function contentElement() {
  return contentHost;
}

export function wide(on_) {
  if (!contentHost) return;
  contentHost.classList.toggle('content-wide', !!on_);
}

export { signOut };
