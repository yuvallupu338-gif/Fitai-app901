/*
 * more.js — everything the bottom bar could not hold, plus the keyboard map.
 *
 * The phone bar carries five items: היום, משימות, לוח שנה, מטרות, עוד. That is
 * not a shortened sidebar, it is the four screens somebody opens during a day
 * and a door to the rest. This is the rest — in the same order as the desktop
 * rail, because a person who learns the app on a laptop and then picks up a
 * phone should be reading the same list in the same sequence, not hunting for
 * where תחומי חיים moved to.
 *
 * The counts are the reason this is not a static menu. "תיבת קליטה 7" and
 * "פרויקטים 2" are the two numbers that make somebody open a screen they were
 * not otherwise going to open, and they are only shown when they are not zero.
 */

import { h, dialog, confirmDestructive } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { href } from '../core/router.js';
import { signOut } from '../core/session.js';
import { snapshot } from '../services/core.js';
import * as account from '../services/account.js';

let rebuild = () => {};

const ITEMS = [
  { path: '/inbox', label: 'nav.inbox', icon: 'inbox', count: 'inbox', countLabel: 'count.tasks' },
  { path: '/projects', label: 'nav.projects', icon: 'project', count: 'attention', countLabel: 'count.projects' },
  { path: '/areas', label: 'nav.areas', icon: 'area' },
  { path: '/habits', label: 'nav.habits', icon: 'habit' },
  { path: '/routines', label: 'nav.routines', icon: 'routine' },
  { path: '/focus', label: 'nav.focus', icon: 'focus' },
  { path: '/notes', label: 'nav.notes', icon: 'note' },
  { path: '/someday', label: 'nav.someday', icon: 'someday' },
  { path: '/progress', label: 'nav.progress', icon: 'progress' },
  { path: '/review', label: 'nav.review', icon: 'review' },
  { path: '/memory', label: 'nav.memory', icon: 'memory' },
  { path: '/settings', label: 'nav.settings', icon: 'settings' },
];

const THEMES = [
  { value: 'system', label: 'settings.themeSystem', icon: 'monitor' },
  { value: 'light', label: 'settings.themeLight', icon: 'sun' },
  { value: 'dark', label: 'settings.themeDark', icon: 'moon' },
];

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], label: 'shortcuts.palette' },
  { keys: ['n'], label: 'shortcuts.capture' },
  { keys: ['c'], label: 'shortcuts.newTask' },
  { keys: ['g'], label: 'shortcuts.today' },
  { keys: ['f'], label: 'shortcuts.focus' },
  { keys: ['/'], label: 'shortcuts.search' },
  { keys: ['?'], label: 'shortcuts.help' },
  { keys: ['Esc'], label: 'shortcuts.close' },
];

/* ------------------------------------------------------------------ *
 * Keyboard map
 * ------------------------------------------------------------------ */

/**
 * The shortcut list, opened from here and from `?` anywhere in the app.
 *
 * Every line is a key the app actually binds in app.js. A help sheet that
 * documents a shortcut nobody implemented is worse than no help sheet.
 */
export function openShortcuts() {
  return dialog({
    title: t('shortcuts.title'),
    body: h('div', SHORTCUTS.map((s) => h('div.row-between', { style: { paddingBlock: '7px' } },
      h('span', t(s.label)),
      h('div.row.shrink0', s.keys.map((k) => h('span.kbd', k)))))),
  });
}

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

function counts() {
  const snap = snapshot();
  return {
    inbox: snap.tasks.filter((x) => x.status === 'inbox' && !x.someday).length,
    attention: snap.atRiskProjectIds ? snap.atRiskProjectIds.size : 0,
  };
}

function navList(values) {
  return h('nav.card.card-flat', {
    'aria-label': t('nav.menu'),
    style: { padding: 'var(--sp-2)' },
  }, h('div.nav-group', ITEMS.map((item) => {
    const n = item.count ? values[item.count] : 0;
    return h('a.nav-item', { href: href(item.path) },
      icon(item.icon),
      h('span.nav-label', t(item.label)),
      /* The badge is a bare number, which tells a screen reader nothing about
       * what was counted — so the words go alongside it, unseen. */
      n > 0
        ? [
          h('span.nav-count', {
            class: item.count === 'attention' ? 'nav-count-alert' : null,
            'aria-hidden': 'true',
          }, String(n)),
          h('span.sr-only', plural(item.countLabel, n)),
        ]
        : null);
  })));
}

function themeCard() {
  const current = account.currentTheme();
  return h('div.card.card-pad', { style: { marginBlockStart: 'var(--sp-4)' } },
    h('div.tiny.quiet', t('settings.theme')),
    h('div.segmented', {
      role: 'group',
      'aria-label': t('settings.theme'),
      style: { marginBlockStart: '8px' },
    }, THEMES.map((option) => h('button', {
      type: 'button',
      'aria-pressed': option.value === current ? 'true' : 'false',
      onclick: () => {
        account.setTheme(option.value);
        rebuild();
      },
    }, icon(option.icon, { size: 14 }), t(option.label)))));
}

async function askSignOut() {
  const yes = await confirmDestructive({
    title: t('confirm.signOutTitle'),
    note: t('confirm.signOutNote'),
    confirmLabel: t('auth.signOut'),
  });
  if (!yes) return;
  /* The app listens for the session change and swaps itself back to the
   * sign-in screen, so there is nothing to navigate to from here. */
  signOut();
}

function toolsCard() {
  return h('nav.card.card-flat', {
    'aria-label': t('common.actions'),
    style: { marginBlockStart: 'var(--sp-4)', padding: 'var(--sp-2)' },
  }, h('div.nav-group',
    h('button.nav-item', {
      type: 'button',
      onclick: () => openShortcuts(),
    },
    icon('keyboard'),
    h('span.nav-label', t('settings.keyboardShortcuts')),
    h('span.kbd', '?')),

    h('button.nav-item', {
      type: 'button',
      onclick: () => askSignOut(),
    },
    icon('logout'),
    h('span.nav-label', t('auth.signOut')))));
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderMore(rerender) {
  rebuild = rerender;

  const values = counts();

  /* No page header: the topbar already carries "עוד", and a menu screen that
   * repeats its own name twice above the first item is one screen of chrome
   * for eleven links. */
  return h('div',
    navList(values),
    themeCard(),
    toolsCard());
}
