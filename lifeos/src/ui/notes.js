/*
 * notes.js — the small end of the app, kept small on purpose.
 *
 * §54 is the whole design: a note is a title, a body, a type, and the thing it
 * is about. No folders, no backlinks, no rich text. Everything a fuller notes
 * app would add is another way to spend an evening arranging notes about work
 * instead of doing the work, and the app already has a structure for work.
 *
 * THE EDITOR IS A DIALOG, NOT A SECOND PANE.
 *
 * A list beside an editor needs a breakpoint, two focus models, and an answer
 * to "what does the editor show when nothing is selected". The dialog is the
 * same editor at every width and from every route into it — the list, the plus
 * button, or /notes/:id — which is worth more here than the pane would be.
 *
 * WHY EVERY ROW SAYS WHETHER THE ASSISTANT CAN READ IT.
 *
 * One preference decides it for all notes, so the chip reads the same on every
 * row, and that is the point: somebody writing something they would rather keep
 * to themselves needs the answer where they are writing it, not three screens
 * away in settings. The chip reports that preference and claims nothing else.
 */

import {
  h, qsa, replace, dialog, field, chipGroup, switchRow, popupMenu, emptyState,
  announce, confirmDestructive,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastError } from '../core/toast.js';
import { formatAgo } from '../core/time.js';
import { currentRoute, replace as routeReplace } from '../core/router.js';
import { NOTE_TYPES } from '../domain/schema.js';
import { snapshot } from '../services/core.js';
import * as notesService from '../services/notes.js';
import * as tasksService from '../services/tasks.js';
import { goals as goalsService, projects as projectsService } from '../services/structure.js';
import { pageHeader, areaChip } from './components.js';

const view = { type: 'all', query: '' };

let rerender = () => {};
let listHost = null;
let paramId = null;

/* ------------------------------------------------------------------ *
 * Small pieces
 * ------------------------------------------------------------------ */

function aiChip(canRead) {
  return h('span.chip.quiet', { title: t('settings.aiNotes') },
    icon(canRead ? 'eye' : 'lock', { size: 12 }),
    canRead ? t('notes.aiVisible') : t('notes.aiHidden'));
}

/** The label for the pin control — what pressing it will do, not the state. */
function pinLabel(note) {
  return note.pinned ? t('notes.unpin') : t('notes.pin');
}

function linkChips(note, snap) {
  const out = [];
  const area = note.areaId ? snap.areasById.get(note.areaId) : null;
  if (area) out.push(areaChip(area));
  const goal = note.goalId ? snap.goalsById.get(note.goalId) : null;
  if (goal) out.push(h('span.chip', icon('goal', { size: 12 }), goal.title));
  const project = note.projectId ? snap.projectsById.get(note.projectId) : null;
  if (project) out.push(h('span.chip', icon('project', { size: 12 }), project.title));
  const task = note.taskId ? snap.tasksById.get(note.taskId) : null;
  if (task) out.push(h('span.chip', icon('tasks', { size: 12 }), task.title));
  return out;
}

/** A label over something that is not a single focusable control. */
function labelled(label, control) {
  return h('div.field', h('div.field-label', label), control);
}

function errorText(err) {
  if (!err) return null;
  switch (err.code) {
    case 'required': return t('errors.required');
    case 'max': return t('errors.tooLong', { n: err.max });
    case 'notFound': return t('errors.notFound');
    default: return t('errors.generic');
  }
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

function togglePin(note) {
  const result = notesService.update(note.id, { pinned: !note.pinned });
  if (!result.ok) { toastError(t('errors.generic')); return; }
  /* Only the list: pinning re-sorts it, and rebuilding the toolbar would take
   * the caret out of the search box somebody is filtering with. */
  paintList(false);
}

async function deleteNote(note) {
  const yes = await confirmDestructive({ title: t('confirm.deleteNoteTitle') });
  if (!yes) return false;
  notesService.remove(note.id);
  toast(t('notes.deleted'));
  rerender();
  return true;
}

function noteMenu(anchor, note) {
  return popupMenu(anchor, [
    { label: t('common.edit'), icon: 'edit', onClick: () => openNoteEditor(note.id) },
    {
      label: pinLabel(note),
      icon: 'flag',
      onClick: () => togglePin(note),
    },
    { separator: true },
    { label: t('common.delete'), icon: 'trash', danger: true, onClick: () => deleteNote(note) },
  ]);
}

/* ------------------------------------------------------------------ *
 * The row
 * ------------------------------------------------------------------ */

function noteRow(note, snap) {
  const meta = [];
  /* Pinned is a word before it is a position: a row that simply sits at the top
   * gives a reader nothing to tell it apart from the newest note. */
  if (note.pinned) meta.push(h('span.chip.chip-accent', icon('flag', { size: 12 }), t('notes.pinned')));
  meta.push(h('span.chip', t(`notes.types.${note.type}`)));
  for (const chip of linkChips(note, snap)) meta.push(chip);
  meta.push(aiChip(!!snap.preferences.aiCanReadNotes));
  meta.push(h('span.tiny.quiet', formatAgo(note.updatedAt)));

  return h('div.trow',
    h('button.trow-body', {
      type: 'button',
      onclick: () => openNoteEditor(note.id),
    },
    h('div.trow-title.ellipsis', note.title || t('common.untitled')),
    note.body
      ? h('div.tiny.quiet.clamp-2', { style: { marginBlockStart: '4px' } }, note.body)
      : null,
    h('div.trow-meta', meta)),

    /* The label says what the press will do rather than what the state is —
     * the state is already a word in the meta row, and announcing both makes a
     * screen reader read the pin twice. */
    h('button.btn-icon.shrink0', {
      type: 'button',
      'aria-label': pinLabel(note),
      title: pinLabel(note),
      onclick: () => togglePin(note),
    }, icon('flag')),

    h('button.btn-icon.shrink0', {
      type: 'button',
      'aria-label': t('common.actions'),
      onclick: (e) => noteMenu(e.currentTarget, note),
    }, icon('more')));
}

/* ------------------------------------------------------------------ *
 * Toolbar and list
 * ------------------------------------------------------------------ */

function toolbar() {
  const segmented = h('div.segmented', { role: 'group', 'aria-label': t('notes.type') });
  for (const key of ['all'].concat(NOTE_TYPES)) {
    segmented.appendChild(h('button', {
      type: 'button',
      'aria-pressed': view.type === key ? 'true' : 'false',
      data: { type: key },
      onclick: () => {
        view.type = key;
        for (const b of qsa('button', segmented)) {
          b.setAttribute('aria-pressed', b.dataset.type === key ? 'true' : 'false');
        }
        paintList(true);
      },
    }, key === 'all' ? t('common.all') : t(`notes.types.${key}`)));
  }

  const search = h('input', {
    type: 'search',
    value: view.query,
    placeholder: t('common.searchPlaceholder'),
    'aria-label': t('common.search'),
    autocomplete: 'off',
    oninput: (e) => { view.query = e.target.value; paintList(false); },
  });

  return h('div', { style: { marginBlockEnd: 'var(--sp-5)' } },
    h('div', { style: { overflowX: 'auto' } }, segmented),
    h('div.row', { style: { marginBlockStart: 'var(--sp-3)' } },
      h('div.grow', { style: { minWidth: '160px' } }, search)));
}

function resetFilter() {
  view.type = 'all';
  view.query = '';
  rerender();
}

function paintList(announceCount) {
  if (!listHost) return;

  const snap = snapshot();
  const query = view.query.trim().toLowerCase();
  const rows = notesService.all()
    .filter((note) => view.type === 'all' || note.type === view.type)
    .filter((note) => !query
      || String(note.title || '').toLowerCase().includes(query)
      || String(note.body || '').toLowerCase().includes(query));

  replace(listHost);

  if (!rows.length) {
    listHost.appendChild(emptyState({
      icon: 'note',
      title: t('notes.emptyFiltered'),
      action: { label: t('common.showAll'), onClick: () => resetFilter() },
    }));
  } else {
    listHost.appendChild(h('div.card.card-flat', { style: { overflow: 'hidden' } },
      rows.map((note) => noteRow(note, snap))));
  }

  /* The controls sit above the list, so a change made from the keyboard moves
   * nothing a screen reader would otherwise notice. */
  if (announceCount) announce(plural('count.notes', rows.length));
}

/* ------------------------------------------------------------------ *
 * The editor
 * ------------------------------------------------------------------ */

/**
 * An active list, plus whatever this note is already linked to.
 *
 * A note about a finished project must not lose its link the moment somebody
 * opens it to fix a typo — the select would show "ללא" and save it.
 */
function withLinked(list, id, byId) {
  if (!id || list.some((x) => x.id === id)) return list;
  const record = byId.get(id);
  return record ? list.concat([record]) : list;
}

function linkField(label, value, options, onChange) {
  return field({
    label,
    optional: true,
    control: h('select', {
      onchange: (e) => onChange(e.target.value || null),
    },
    h('option', { value: '' }, t('common.none')),
    options.map((o) => h('option', {
      value: o.id,
      selected: o.id === value,
    }, o.title || t('common.untitled')))),
  });
}

function openNoteEditor(noteId, onClose) {
  const existing = noteId ? notesService.byId(noteId) : null;
  if (noteId && !existing) {
    toastError(t('errors.notFound'));
    if (onClose) onClose();
    return null;
  }

  const snap = snapshot();
  const form = {
    title: existing ? existing.title || '' : '',
    body: existing ? existing.body || '' : '',
    type: existing ? existing.type : 'quick',
    areaId: existing ? existing.areaId || null : null,
    goalId: existing ? existing.goalId || null : null,
    projectId: existing ? existing.projectId || null : null,
    taskId: existing ? existing.taskId || null : null,
    pinned: existing ? !!existing.pinned : false,
  };

  let errors = {};
  let dlg = null;

  const hosts = {
    title: h('div'),
    body: h('div', { style: { marginBlockStart: 'var(--sp-4)' } }),
  };

  function paintTitle() {
    replace(hosts.title, field({
      label: t('notes.titleField'),
      optional: true,
      error: errorText(errors.title),
      control: h('input', {
        type: 'text',
        value: form.title,
        maxlength: '140',
        placeholder: t('notes.titlePlaceholder'),
        oninput: (e) => { form.title = e.target.value; },
      }),
    }));
  }

  function paintBody() {
    replace(hosts.body, field({
      label: t('notes.body'),
      error: errorText(errors.body),
      control: h('textarea', {
        rows: '10',
        placeholder: t('notes.bodyPlaceholder'),
        oninput: (e) => { form.body = e.target.value; },
      }, form.body),
    }));
  }

  function showErrors(map) {
    errors = map || {};
    paintTitle();
    paintBody();
    if (errors['']) toastError(errorText(errors['']));
    const invalid = dlg && dlg.body.querySelector('[aria-invalid="true"]');
    if (invalid) invalid.focus();
  }

  function save() {
    const payload = {
      title: form.title.trim(),
      body: form.body,
      type: form.type,
      areaId: form.areaId,
      goalId: form.goalId,
      projectId: form.projectId,
      taskId: form.taskId,
      pinned: form.pinned,
    };

    /* create() refuses an empty note; update() would happily store one, and an
     * untitled blank row in the list is not something anybody meant to make. */
    if (!payload.title && !payload.body.trim()) {
      toastError(t('notes.needContent'));
      return false;
    }

    const result = noteId ? notesService.update(noteId, payload) : notesService.create(payload);
    if (!result.ok) {
      if (result.code === 'notFound') { toastError(t('errors.notFound')); return false; }
      showErrors(result.errors);
      return false;
    }

    toast(noteId ? t('notes.updated') : t('notes.created'), { tone: 'ok' });
    rerender();
    return true;
  }

  paintTitle();
  paintBody();

  const typeField = labelled(t('notes.type'), chipGroup({
    label: t('notes.type'),
    value: form.type,
    options: NOTE_TYPES.map((type) => ({ value: type, label: t(`notes.types.${type}`) })),
    onChange: (value) => { form.type = value; },
  }));

  /* Four independent pickers rather than a cascade. A meeting note can be about
   * an area with no goal named, or about one task inside a project it is not
   * otherwise about, and a cascade would force a link the person did not mean. */
  const links = h('div',
    h('div.eyebrow', { style: { marginBlockEnd: '8px' } }, t('notes.linkedTo')),
    linkField(t('tasks.area'), form.areaId,
      withLinked(snap.areas.filter((a) => !a.archived), form.areaId, snap.areasById),
      (value) => { form.areaId = value; }),
    h('div', { style: { marginBlockStart: 'var(--sp-4)' } },
      linkField(t('tasks.goal'), form.goalId,
        withLinked(goalsService.active(), form.goalId, snap.goalsById),
        (value) => { form.goalId = value; })),
    h('div', { style: { marginBlockStart: 'var(--sp-4)' } },
      linkField(t('tasks.project'), form.projectId,
        withLinked(projectsService.active(), form.projectId, snap.projectsById),
        (value) => { form.projectId = value; })),
    h('div', { style: { marginBlockStart: 'var(--sp-4)' } },
      linkField(t('tasks.one'), form.taskId,
        withLinked(tasksService.open(), form.taskId, snap.tasksById),
        (value) => { form.taskId = value; })));

  const pinField = switchRow({
    label: t('notes.pinned'),
    note: t('notes.pinNote'),
    checked: form.pinned,
    onChange: (value) => { form.pinned = value; },
  });

  const deleteAction = noteId
    ? h('div.row', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('button.btn.btn-sm.btn-ghost', {
        type: 'button',
        async onclick() {
          const done = await deleteNote(existing);
          if (done) dlg.close();
        },
      }, icon('trash', { size: 14 }), t('common.delete')))
    : null;

  dlg = dialog({
    title: noteId ? t('notes.editNote') : t('notes.newNote'),
    wide: true,
    initialFocus: 'input',
    body: [
      hosts.title,
      hosts.body,
      h('div', { style: { marginBlockStart: 'var(--sp-4)' } }, typeField),
      h('div', { style: { marginBlockStart: 'var(--sp-5)' } }, links),
      h('div', { style: { marginBlockStart: 'var(--sp-4)' } }, pinField),
      h('div.row', { style: { marginBlockStart: 'var(--sp-4)' } },
        aiChip(!!snap.preferences.aiCanReadNotes)),
      deleteAction,
    ],
    actions: [
      { label: t('common.cancel') },
      { label: noteId ? t('common.save') : t('common.create'), kind: 'primary', onClick: save },
    ],
    onClose: () => { if (onClose) onClose(); },
  });

  return dlg;
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderNotes(onRerender, params) {
  rerender = onRerender || (() => {});

  const all = notesService.all();

  const container = h('div', pageHeader(t('notes.title'), {
    actions: [
      all.length ? h('span.chip', plural('count.notes', all.length)) : null,
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: () => openNoteEditor(null),
      }, icon('plus', { size: 16 }), t('notes.newNote')),
    ],
  }));

  if (!all.length) {
    listHost = null;
    container.appendChild(emptyState({
      icon: 'note',
      title: t('notes.emptyTitle'),
      note: t('notes.emptyNote'),
      action: { label: t('notes.newNote'), onClick: () => openNoteEditor(null) },
    }));
  } else {
    container.appendChild(toolbar());
    listHost = h('div');
    container.appendChild(listHost);
    paintList(false);
  }

  /* A route names one note once. Re-opening the editor on every re-render would
   * mean saving a note reopens it, so the id is consumed here and the URL is put
   * back to /notes when the editor closes. The open is deferred by a microtask
   * because the shell has not mounted this node yet — a dialog that traps focus
   * before the screen behind it exists leaves the reader with nowhere to return
   * to when it closes. */
  const routeId = params && params.id;
  if (!routeId) paramId = null;
  else if (routeId !== paramId) {
    paramId = routeId;
    Promise.resolve().then(() => {
      if (paramId !== routeId) return;
      openNoteEditor(routeId, () => {
        if (currentRoute().path !== '/notes') routeReplace('/notes');
      });
    });
  }

  return container;
}
