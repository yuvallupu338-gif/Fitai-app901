/*
 * palette.js — Ctrl+K.
 *
 * One box that answers both of the questions a keyboard reaches for: "where is
 * that thing" and "just do the thing". Splitting them into a search field and a
 * command menu means learning which one holds what, and the answer — a project
 * is a place, planning tomorrow is a command — is not obvious enough to be
 * worth two shortcuts.
 *
 * WITH NO QUERY IT IS A MENU, WITH A QUERY IT IS A SEARCH.
 *
 * Empty, it lists what can be done and everywhere that can be gone to; that is
 * also the discoverability story for people who opened it by accident. Typing
 * turns it into search across every record in the app, with the commands whose
 * names match kept on top — because somebody typing "מיקוד" may want the habit
 * called מיקוד or may want to start a focus session, and the only honest answer
 * is to show both.
 *
 * FOCUS STAYS IN THE INPUT.
 *
 * Selection is roving aria-selected with aria-activedescendant rather than real
 * focus moves, so every keystroke keeps going to the field being typed in. The
 * rows are still buttons: a pointer has to be able to click one.
 */

import { h, dialog, field, replace, scrollIntoViewIfNeeded } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast } from '../core/toast.js';
import { go, currentRoute } from '../core/router.js';
import { today as todayIso } from '../core/time.js';
import * as notesService from '../services/notes.js';
import * as planning from '../services/planning.js';
import * as focusService from '../services/focus.js';
import * as account from '../services/account.js';
import { projects as projectsService } from '../services/structure.js';
import { openTaskEditor } from './taskeditor.js';
import { openGoalWizard } from './goalwizard.js';
import { openCapture } from './capture.js';
import { openReplanPreview } from './replan.js';
import { openFocusPicker } from './focus.js';

/* Every top-level destination, in the order the sidebar groups them. */
const NAV = [
  { path: '/today', label: 'nav.today', icon: 'today' },
  { path: '/inbox', label: 'nav.inbox', icon: 'inbox' },
  { path: '/tasks', label: 'nav.tasks', icon: 'tasks' },
  { path: '/calendar', label: 'nav.calendar', icon: 'calendar' },
  { path: '/goals', label: 'nav.goals', icon: 'goal' },
  { path: '/projects', label: 'nav.projects', icon: 'project' },
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
  { path: '/more', label: 'nav.more', icon: 'more' },
];

/* What a search hit of each kind is called, and where it opens. A task opens
 * its editor rather than a screen, because there is no screen for one task. */
const KINDS = {
  task: { group: 'palette.groupTasks', icon: 'tasks', open: (r) => openTaskEditor(r.id, refreshRoute) },
  project: { group: 'palette.groupProjects', icon: 'project', open: (r) => go(`/projects/${r.id}`) },
  goal: { group: 'palette.groupGoals', icon: 'goal', open: (r) => go(`/goals/${r.id}`) },
  note: { group: 'palette.groupNotes', icon: 'note', open: (r) => go(`/notes/${r.id}`) },
  habit: { group: 'palette.groupHabits', icon: 'habit', open: () => go('/habits') },
  area: { group: 'palette.groupAreas', icon: 'area', open: () => go('/areas') },
  event: { group: 'palette.groupEvents', icon: 'calendar', open: (r) => go(`/calendar/${r.record.date}`) },
  routine: { group: 'palette.groupRoutines', icon: 'routine', open: () => go('/routines') },
};

/**
 * The palette can act on any screen, so its refresh is the route itself:
 * re-resolving the current path rebuilds whatever was underneath.
 */
function refreshRoute() {
  go(currentRoute().path);
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

/**
 * A one-field creator for the two records the palette can start but has no
 * editor for. The record is real and the screen it belongs to opens straight
 * away, which is where the rest of its fields live — a palette is a place to
 * begin something, not to fill it in.
 */
function quickCreate(opts) {
  const input = h('input', {
    type: 'text',
    placeholder: opts.placeholder,
    autocomplete: 'off',
  });
  const inputId = 'quick-create-input';

  let created = null;

  function submit() {
    const text = input.value.trim();
    if (!text) { input.focus(); return false; }
    if (!opts.onSubmit(text)) { input.focus(); return false; }
    created.close();
    return true;
  }

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submit();
  });

  created = dialog({
    title: opts.title,
    body: field({ id: inputId, label: opts.label, control: input }),
    actions: [
      { label: t('common.cancel') },
      { label: t('common.create'), kind: 'primary', onClick: submit },
    ],
    /* Otherwise the head's close button wins, being the first focusable node. */
    initialFocus: `#${inputId}`,
  });
}

function newProject() {
  quickCreate({
    title: t('projects.newProject'),
    label: t('projects.titleField'),
    placeholder: t('projects.titlePlaceholder'),
    onSubmit: (text) => {
      const result = projectsService.create({ title: text });
      if (!result.ok) return false;
      toast(t('projects.created'), { tone: 'ok' });
      go(`/projects/${result.project.id}`);
      return true;
    },
  });
}

function newNote() {
  quickCreate({
    title: t('notes.newNote'),
    label: t('notes.titleField'),
    placeholder: t('notes.titlePlaceholder'),
    onSubmit: (text) => {
      const result = notesService.create({ title: text });
      if (!result.ok) return false;
      toast(t('notes.created'), { tone: 'ok' });
      go(`/notes/${result.note.id}`);
      return true;
    },
  });
}

function startFocus() {
  /* A session already running is not a new one, and offering to pick a task
   * would quietly abandon the one in progress. */
  if (focusService.running()) { go('/focus'); return; }
  openFocusPicker();
}

function planTomorrow() {
  const result = planning.applyPlan(planning.tomorrow());
  if (!result.created) { toast(t('planning.replanNothing')); return; }
  toast(plural('count.changes', result.created), { tone: 'ok' });
  go('/calendar');
}

function toggleTheme() {
  const next = account.resolvedTheme() === 'dark' ? 'light' : 'dark';
  account.setTheme(next);
  toast(`${t('settings.theme')}: ${t(next === 'dark' ? 'settings.themeDark' : 'settings.themeLight')}`);
}

function commands() {
  return [
    { icon: 'plus', label: t('palette.actionNewTask'), run: () => openTaskEditor(null, refreshRoute) },
    { icon: 'inbox', label: t('shortcuts.capture'), run: () => openCapture({ onSaved: refreshRoute }) },
    { icon: 'goal', label: t('palette.actionNewGoal'), run: () => openGoalWizard() },
    { icon: 'project', label: t('palette.actionNewProject'), run: newProject },
    { icon: 'note', label: t('palette.actionNewNote'), run: newNote },
    { icon: 'today', label: t('palette.actionOpenToday'), run: () => go('/today') },
    { icon: 'focus', label: t('palette.actionStartFocus'), run: startFocus },
    { icon: 'calendar', label: t('palette.actionPlanTomorrow'), run: planTomorrow },
    { icon: 'routine', label: t('palette.actionReplan'), run: () => openReplanPreview(todayIso(), refreshRoute) },
    { icon: 'review', label: t('palette.actionWeeklyReview'), run: () => go('/review') },
    { icon: account.resolvedTheme() === 'dark' ? 'sun' : 'moon', label: t('palette.actionToggleTheme'), run: toggleTheme },
  ];
}

function navCommands() {
  return NAV.map((item) => ({
    icon: item.icon,
    label: t(item.label),
    run: () => go(item.path),
  }));
}

/* ------------------------------------------------------------------ *
 * Grouping
 * ------------------------------------------------------------------ */

function matching(list, query) {
  const q = query.toLowerCase();
  return list.filter((item) => item.label.toLowerCase().includes(q));
}

function groupsFor(query) {
  const q = query.trim();
  const groups = [];

  if (!q) {
    groups.push({ label: t('palette.groupActions'), items: commands() });
    groups.push({ label: t('palette.groupNav'), items: navCommands() });
    return groups;
  }

  const actions = matching(commands(), q);
  if (actions.length) groups.push({ label: t('palette.groupActions'), items: actions });

  /* grouped() hands back kinds in relevance order, so the group that holds the
   * best match comes first rather than tasks always winning. */
  for (const [kind, results] of notesService.grouped(q)) {
    const spec = KINDS[kind];
    if (!spec) continue;
    groups.push({
      label: t(spec.group),
      items: results.map((r) => ({
        icon: spec.icon,
        label: r.title,
        note: r.done ? t('tasks.statusShort.done') : r.subtitle,
        run: () => spec.open(r),
      })),
    });
  }

  const navs = matching(navCommands(), q);
  if (navs.length) groups.push({ label: t('palette.groupNav'), items: navs });

  return groups;
}

/* ------------------------------------------------------------------ *
 * The overlay
 * ------------------------------------------------------------------ */

let live = null;

export function openPalette(initialQuery) {
  /* Ctrl+K is bound globally and fires even while a dialog is open, so a second
   * palette on top of the first is one keystroke away. */
  if (live) {
    live.reopen(initialQuery);
    return live.close;
  }

  let items = [];
  let selected = -1;
  let closed = false;

  const list = h('div.palette-list', {
    role: 'listbox',
    id: 'palette-list',
    'aria-label': t('search.results'),
  });

  const input = h('input.palette-input', {
    type: 'text',
    value: initialQuery || '',
    placeholder: t('palette.placeholder'),
    autocomplete: 'off',
    spellcheck: 'false',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'palette-list',
    'aria-autocomplete': 'list',
    'aria-label': t('palette.placeholder'),
    oninput: () => render(),
  });

  const box = h('div.palette', {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': t('nav.search'),
  }, input, list);

  const scrim = h('div.palette-scrim', {
    onclick: (e) => { if (e.target === scrim) close(); },
  }, box);

  const previous = document.activeElement;

  function select(index) {
    if (!items.length) {
      selected = -1;
      input.removeAttribute('aria-activedescendant');
      return;
    }
    const next = Math.max(0, Math.min(items.length - 1, index));
    if (items[selected]) items[selected].el.setAttribute('aria-selected', 'false');
    selected = next;
    const el = items[selected].el;
    el.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', el.id);
    scrollIntoViewIfNeeded(el, list);
  }

  function activate(index) {
    const item = items[index];
    if (!item) return;
    /* Closed first: several of these open a dialog of their own, and two focus
     * traps fighting over the same keyboard is how a modal becomes unclosable. */
    close();
    item.run();
  }

  function render() {
    const groups = groupsFor(input.value);
    const nodes = [];
    items = [];
    selected = -1;

    for (const group of groups) {
      nodes.push(h('div.palette-group', { role: 'presentation' }, group.label));
      for (const item of group.items) {
        const index = items.length;
        const el = h('button.palette-item', {
          type: 'button',
          role: 'option',
          id: `palette-item-${index}`,
          tabindex: '-1',
          'aria-selected': 'false',
          onclick: () => activate(index),
          onmouseenter: () => select(index),
        },
        icon(item.icon),
        h('span.grow.ellipsis', item.label),
        item.note ? h('span.palette-kind.ellipsis', item.note) : null);

        items.push({ run: item.run, el });
        nodes.push(el);
      }
    }

    if (!items.length) {
      nodes.push(h('p.tiny.quiet', { style: { padding: 'var(--sp-4)' } }, t('palette.empty')));
    }

    replace(list, nodes);
    select(0);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'Tab') {
      /* Nothing else in here is tabbable, and letting Tab out would leave the
       * scrim up with focus behind it. */
      e.preventDefault();
      input.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      select(selected + 1 >= items.length ? 0 : selected + 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      select(selected <= 0 ? items.length - 1 : selected - 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      activate(selected);
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    live = null;
    document.removeEventListener('keydown', onKey, true);
    scrim.remove();
    document.body.style.overflow = '';
    if (previous && previous.focus && document.contains(previous)) previous.focus();
  }

  function reopen(query) {
    if (query !== undefined && query !== null) {
      input.value = query;
      render();
    }
    input.focus();
    input.select();
  }

  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(scrim);
  document.body.style.overflow = 'hidden';
  render();
  input.focus();
  input.select();

  live = { close, reopen };
  return close;
}
