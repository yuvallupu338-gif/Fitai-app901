/*
 * inbox.js — the pile, and the four ways out of it.
 *
 * CAPTURE AND SORTING ARE TWO DIFFERENT ACTS, AND THIS SCREEN IS THE SECOND.
 *
 * The box at the top is here anyway, because the moment a person opens the
 * inbox is also the moment they remember the three other things they meant to
 * write down. It saves and stays open. But the screen's real job starts under
 * it: every item leaves in exactly one direction —
 *
 *   a project   — it is work, and it belongs to something
 *   a note      — it was never a task, it was a thought
 *   מתישהו      — it is real, it is not now
 *   the editor  — it needs a date, an estimate, a decision
 *
 * An inbox whose items have no way out is a list that grows until people stop
 * opening it, so every row carries all four and none of them is buried.
 *
 * THE SUGGESTION IS LOCAL UNLESS SOMEBODY ASKS FOR MORE.
 *
 * classifyInboxItem falls back to the rules engine when no assistant is
 * configured, so the "this looks like it belongs to X" line appears either way.
 * The difference is who pays: with a key configured, a row would otherwise fire
 * a request per item on every render, so there the guess is behind a button and
 * the local one is free and automatic.
 */

import {
  h, emptyState, dialog, popupMenu, confirmDestructive, replace,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastError, toastUndo } from '../core/toast.js';
import { snapshot } from '../services/core.js';
import * as tasksService from '../services/tasks.js';
import * as notesService from '../services/notes.js';
import { projects } from '../services/structure.js';
import * as ai from '../ai/provider.js';
import { pageHeader, taskRow, originNote } from './components.js';
import { openTaskEditor } from './taskeditor.js';

let rerender = () => {};

/* Set just before a rerender that came from the capture box. Sorting an inbox
 * is a run of short entries, and a field that drops focus after each one turns
 * a run into a series of trips back to the mouse. */
let refocusCapture = false;

/* ------------------------------------------------------------------ *
 * Capture
 * ------------------------------------------------------------------ */

function captureBox() {
  const input = h('input', {
    type: 'text',
    id: 'inbox-capture',
    placeholder: t('inbox.capturePlaceholder'),
    autocomplete: 'off',
    autocapitalize: 'sentences',
    spellcheck: 'false',
    'aria-label': t('inbox.capturePlaceholder'),
    'aria-describedby': 'inbox-capture-hint',
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      submit();
    },
  });

  const go = h('button.capture-go', {
    type: 'button',
    'aria-label': t('common.add'),
    onclick: () => submit(),
  }, icon('plus'));

  function submit() {
    const text = input.value.trim();
    if (!text) { input.focus(); return; }

    const result = tasksService.capture(text);
    if (!result.ok) { toastError(t('errors.generic')); return; }

    /* The toast names the title because a line that parsed into a schedule
     * leaves the inbox on the spot — without the name it reads as a line that
     * was typed and then vanished. */
    toast(t('inbox.addedAs', { title: result.task.title }), { tone: 'ok' });
    refocusCapture = true;
    rerender();
  }

  return h('div', { style: { marginBlockEnd: 'var(--sp-5)' } },
    h('div.capture', input, go),
    h('p.field-hint', {
      id: 'inbox-capture-hint',
      style: { marginBlockStart: '8px' },
    }, t('inbox.captureHint')));
}

/* ------------------------------------------------------------------ *
 * Where an item goes
 * ------------------------------------------------------------------ */

function fileToProject(task, projectId) {
  const result = tasksService.fileToProject(task.id, projectId);
  if (!result.ok) { toastError(t('errors.generic')); return false; }
  toast(t('tasks.updated'), { tone: 'ok' });
  rerender();
  return true;
}

function openProjectPicker(task) {
  const list = projects.active();
  const d = dialog({
    title: t('inbox.convertProject'),
    note: task.title,
    body: h('div.stack-tight', list.map((p) => h('button.btn.btn-secondary.btn-block', {
      type: 'button',
      style: { justifyContent: 'start' },
      onclick: () => {
        if (fileToProject(task, p.id)) d.close();
      },
    }, icon('project', { size: 15 }), p.title))),
  });
  return d;
}

function convertToNote(task) {
  const result = notesService.create({
    title: task.title,
    body: task.description || '',
    type: 'idea',
    projectId: task.projectId || null,
    areaId: task.areaId || null,
  });
  if (!result.ok) { toastError(t('errors.generic')); return; }

  /* The task goes with it. A thought that is now a note and still an inbox item
   * is the same thought waiting to be sorted twice. */
  tasksService.remove(task.id);

  toastUndo(t('notes.created'), () => {
    notesService.remove(result.note.id);
    tasksService.create({
      title: task.title,
      description: task.description || '',
      projectId: task.projectId || null,
      areaId: task.areaId || null,
      status: 'inbox',
    });
    rerender();
  });
  rerender();
}

function moveToSomeday(task) {
  tasksService.markSomeday(task.id);
  /* Not activateFromSomeday() for the undo: that lands the task on 'ready',
   * which would quietly file it instead of putting it back where it was. */
  toastUndo(t('someday.moved'), () => {
    tasksService.update(task.id, { someday: false, status: 'inbox' });
    rerender();
  });
  rerender();
}

async function deleteTask(task) {
  const yes = await confirmDestructive({
    title: t('confirm.deleteTaskTitle'),
    note: t('confirm.deleteTaskNote'),
  });
  if (!yes) return;
  tasksService.remove(task.id);
  toast(t('tasks.deleted'));
  rerender();
}

function fileMenu(anchor, task) {
  const active = projects.active();
  return popupMenu(anchor, [
    { label: t('inbox.process') },
    active.length
      ? { label: t('inbox.convertProject'), icon: 'project', onClick: () => openProjectPicker(task) }
      : null,
    { label: t('inbox.convertNote'), icon: 'note', onClick: () => convertToNote(task) },
    { label: t('inbox.convertSomeday'), icon: 'someday', onClick: () => moveToSomeday(task) },
    { separator: true },
    { label: t('common.edit'), icon: 'edit', onClick: () => openTaskEditor(task.id, rerender) },
    { label: t('common.delete'), icon: 'trash', danger: true, onClick: () => deleteTask(task) },
  ].filter(Boolean));
}

/* ------------------------------------------------------------------ *
 * The guess
 * ------------------------------------------------------------------ */

function suggestionBlock(task, suggestion, explicit) {
  if (!suggestion) return null;
  const project = suggestion.projectId ? projects.byId(suggestion.projectId) : null;

  /* Silence is the right answer for the automatic pass — a row per item saying
   * nothing was found is a column of noise. Somebody who pressed the button
   * asked a question and deserves an answer either way. */
  if (!project) {
    return explicit
      ? h('p.tiny.quiet', {
        style: { paddingInline: 'var(--sp-4)', paddingBlockEnd: '12px' },
      }, t('inbox.suggestNone'))
      : null;
  }

  return h('div', { style: { paddingInline: 'var(--sp-4)', paddingBlockEnd: '12px' } },
    h('div.card.card-sunk.card-pad',
      h('div.row.wrap-flex',
        h('span.tiny.grow', t('inbox.suggestProject', { project: project.title })),
        h('button.btn.btn-sm.btn-secondary.shrink0', {
          type: 'button',
          onclick: () => fileToProject(task, project.id),
        }, t('inbox.suggestAccept'))),
      suggestion.reason
        ? h('p.why', { style: { marginBlockStart: '8px' } }, suggestion.reason)
        : null,
      originNote(suggestion.origin)));
}

function classifyButton(task, host) {
  const button = h('button.btn-icon.shrink0', {
    type: 'button',
    'aria-label': t('inbox.classify'),
    title: t('inbox.classify'),
    onclick: () => {
      button.disabled = true;
      ai.classifyInboxItem(task.title).then((suggestion) => {
        button.disabled = false;
        if (!host.isConnected) return;
        replace(host, suggestionBlock(task, suggestion, true));
        if (suggestion && suggestion.error) toastError(t('ai.errGeneric'));
      }).catch(() => {
        button.disabled = false;
        toastError(t('ai.errGeneric'));
      });
    },
  }, icon('sparkle'));
  return button;
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

function inboxRow(task, snap, aiUsable, last) {
  const host = h('div');

  const row = taskRow(tasksService.decorate(task, snap), {
    actions: false,
    showEstimate: true,
    onToggle(x, next) {
      tasksService.setComplete(x.id, next);
      if (next) {
        toastUndo(t('tasks.completed'), () => {
          tasksService.setComplete(x.id, false);
          rerender();
        });
      }
      rerender();
    },
    onOpen(x) { openTaskEditor(x.id, rerender); },
  });

  if (aiUsable) row.appendChild(classifyButton(task, host));
  row.appendChild(h('button.btn-icon.shrink0', {
    type: 'button',
    'aria-label': t('common.actions'),
    onclick: (e) => fileMenu(e.currentTarget, task),
  }, icon('more')));

  /* The suggestion has to sit under its own row, which means a wrapper — and a
   * wrapper moves the separator, because .trow draws its own only while it is
   * the last child of the card. */
  row.style.borderBlockEnd = 'none';
  const item = h('div', {
    style: last ? null : { borderBlockEnd: '1px solid var(--line-soft)' },
  }, row, host);

  if (!aiUsable) {
    ai.classifyInboxItem(task.title).then((suggestion) => {
      if (!host.isConnected) return;
      replace(host, suggestionBlock(task, suggestion, false));
    }).catch(() => { /* the row is complete without it */ });
  }

  return item;
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderInbox(onRerender) {
  rerender = onRerender;

  const snap = snapshot();
  const list = tasksService.inbox();
  const aiUsable = ai.status().usable;

  const container = h('div',
    pageHeader(t('inbox.title'), {
      subtitle: t('inbox.lead'),
      actions: list.length ? [h('span.chip', plural('count.tasks', list.length))] : null,
    }),
    captureBox());

  if (!list.length) {
    container.appendChild(emptyState({
      icon: 'inbox',
      title: t('inbox.emptyTitle'),
      note: t('inbox.emptyNote'),
    }));
  } else {
    container.appendChild(h('div.card.card-flat', { style: { overflow: 'hidden' } },
      list.map((task, i) => inboxRow(task, snap, aiUsable, i === list.length - 1))));
  }

  if (refocusCapture) {
    refocusCapture = false;
    /* The screen is not in the document yet — the shell appends it after this
     * returns, and focusing a detached input does nothing. */
    setTimeout(() => {
      const input = container.querySelector('#inbox-capture');
      if (input) input.focus();
    }, 0);
  }

  return container;
}
