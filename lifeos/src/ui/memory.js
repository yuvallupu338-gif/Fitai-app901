/*
 * memory.js — everything the app thinks it knows about you, in one list.
 *
 * A system that learns preferences and never shows them is a system nobody can
 * correct. The claims are what steer suggestions, so each one is rendered as a
 * sentence you can read, with where it came from, how sure it is, and how much
 * evidence is behind it — and next to every one of them, the three controls
 * that make the whole thing answerable: edit it, pin it, delete it.
 *
 * WHAT IS STORED IS LISTED EVEN WHEN LEARNING IS OFF.
 *
 * Switching memory off stops new learning; it does not erase what is already
 * there. A screen that went blank in that state would imply it had, and the
 * one place a person goes to check what is remembered about them is the last
 * place to be vague. So the notice says learning has stopped, and the list
 * underneath still says exactly what remains.
 */

import {
  h, replace, dialog, confirmDestructive, emptyState, field, ltr,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastOk, toastError, toastUndo } from '../core/toast.js';
import { href } from '../core/router.js';
import { formatAgo } from '../core/time.js';
import * as db from '../core/db.js';
import { MEMORY_TYPES } from '../domain/schema.js';
import { preferences } from '../services/core.js';
import * as memoryService from '../services/memory.js';
import { pageHeader } from './components.js';

let rerender = () => {};

/* ------------------------------------------------------------------ *
 * Bits
 * ------------------------------------------------------------------ */

/**
 * How sure the app is, as a word first.
 *
 * 55 is the line forContext() draws — below it a memory never reaches a model
 * — so it is the one threshold on this screen that means something outside it.
 */
function confidenceChip(confidence) {
  const level = confidence >= 80 ? 'High' : confidence >= 55 ? 'Med' : 'Low';
  return h('span.chip', {
    class: level === 'High' ? 'chip-ok' : level === 'Low' ? 'chip-warn' : null,
    title: t('memory.confidence'),
  }, t(`memory.confidence${level}`), ' ', ltr(`${confidence}%`));
}

function typeSelect(value) {
  const select = h('select', { 'aria-label': t('notes.type') },
    MEMORY_TYPES.map((type) => h('option', { value: type }, t(`memory.types.${type}`))));
  select.value = value || MEMORY_TYPES[0];
  return select;
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

function openEditor(memory) {
  const form = { content: memory.content, type: memory.type };
  const host = h('div');

  function paint(error) {
    const typeControl = typeSelect(form.type);
    typeControl.onchange = (e) => { form.type = e.target.value; };
    replace(host,
      field({
        label: t('memory.content'),
        error,
        hint: error ? null : t('memory.editNote'),
        control: h('textarea', {
          rows: '4',
          maxlength: '300',
          oninput: (e) => { form.content = e.target.value; },
        }, form.content),
      }),
      field({ label: t('notes.type'), control: typeControl }));
  }

  paint(null);

  return dialog({
    title: t('memory.edit'),
    initialFocus: 'textarea',
    body: host,
    actions: [
      { label: t('common.cancel') },
      {
        label: t('common.save'),
        kind: 'primary',
        onClick: () => {
          const content = form.content.trim();
          if (!content) { paint(t('errors.required')); return false; }
          const result = memoryService.update(memory.id, { content, type: form.type });
          if (!result.ok) { paint(t('errors.generic')); return false; }
          toast(t('memory.updated'), { tone: 'ok' });
          rerender();
          return true;
        },
      },
    ],
  });
}

/**
 * Pinning goes straight to the record rather than through update().
 *
 * The service marks anything edited through it as `stated`, which is right for
 * a rewritten sentence and wrong for a pin: keeping an observation is not the
 * same as claiming to have said it, and a source chip that flips to "נאמר על
 * ידיך" because somebody pressed a pin is the screen telling a small lie about
 * its own provenance. The learning pass already exempts pinned memories.
 */
function togglePin(memory) {
  db.update('memories', memory.id, { pinned: !memory.pinned });
  rerender();
}

function deleteMemory(memory) {
  memoryService.remove(memory.id);
  toastUndo(t('memory.deleted'), () => {
    memoryService.create({
      type: memory.type,
      key: memory.key || '',
      content: memory.content,
      confidence: memory.confidence,
      source: memory.source,
      evidenceCount: memory.evidenceCount,
      lastConfirmedAt: memory.lastConfirmedAt,
      pinned: memory.pinned,
    });
    rerender();
  });
  rerender();
}

async function clearAll() {
  const yes = await confirmDestructive({
    title: t('memory.clearAllConfirm'),
    note: t('memory.clearAllNote'),
    confirmLabel: t('memory.clearAll'),
  });
  if (!yes) return;
  memoryService.clearAll();
  toast(t('memory.cleared'));
  rerender();
}

/**
 * Run a learning pass now.
 *
 * Forced, because pressing the button is an explicit instruction and the
 * ambient "learn from activity" switch governs the passes nobody asked for.
 * It is only offered while memory itself is on — forcing one against a switch
 * that says nothing new will be stored is the app doing the thing the switch
 * promises it will not.
 */
function learnNow() {
  const result = memoryService.learn({ force: true });
  const changed = result.added + result.updated;
  if (!changed) { toast(t('memory.learnNothing')); return; }
  toastOk(t('memory.learnDone', { added: result.added, updated: result.updated }));
  rerender();
}

/* ------------------------------------------------------------------ *
 * Pieces of the screen
 * ------------------------------------------------------------------ */

function offNotice() {
  return h('div.notice.notice-info', { style: { marginBlockEnd: 'var(--sp-4)' } },
    h('strong', t('memory.off')),
    h('p', { style: { marginBlockStart: '4px' } }, t('memory.offNote')),
    h('a.btn.btn-sm.btn-secondary', {
      href: href('/settings'),
      style: { marginBlockStart: 'var(--sp-3)' },
    }, icon('settings', { size: 14 }), t('nav.settings')));
}

function addCard() {
  const input = h('input', {
    type: 'text',
    maxlength: '300',
    placeholder: t('memory.addPlaceholder'),
    onkeydown: (e) => { if (e.key === 'Enter') submit(); },
  });
  const type = typeSelect(MEMORY_TYPES[0]);

  function submit() {
    const content = input.value.trim();
    if (!content) { toastError(t('errors.required')); input.focus(); return; }
    /* create() files it as `stated` at high confidence — a person typing it is
     * the strongest evidence this screen ever gets. */
    const result = memoryService.create({ content, type: type.value });
    if (!result.ok) { toastError(t('errors.generic')); return; }
    toast(t('memory.added'), { tone: 'ok' });
    rerender();
  }

  return h('div.card.card-pad', { style: { marginBlockEnd: 'var(--sp-4)' } },
    field({ label: t('memory.add'), control: input }),
    h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-3)' } },
      h('div.grow', { style: { maxWidth: '220px' } }, type),
      h('button.btn.btn-secondary.shrink0', {
        type: 'button',
        onclick: () => submit(),
      }, icon('plus', { size: 16 }), t('common.add'))));
}

function memoryCard(memory) {
  const meta = [
    memory.pinned
      ? h('span.chip.chip-accent', icon('flag', { size: 12 }), t('notes.pinned'))
      : null,
    h('span.chip', t(`memory.types.${memory.type}`)),
    h('span.chip', t(`memory.sources.${memory.source}`)),
    confidenceChip(memory.confidence),
  ];

  return h('div.card.card-pad',
    h('p', memory.content),

    h('div.row.wrap-flex', { style: { marginBlockStart: '10px' } }, meta),

    h('div.row-between', { style: { marginBlockStart: '10px' } },
      h('div.tiny.quiet',
        /* Nothing counted is not "based on none" — it is a claim with no
         * evidence line to show, which is what a hand-typed memory is. */
        memory.evidenceCount
          ? t('memory.basedOn', { n: plural('count.items', memory.evidenceCount) })
          : null,
        memory.lastConfirmedAt
          ? `${memory.evidenceCount ? ' · ' : ''}${t('memory.lastConfirmed')}: ${formatAgo(memory.lastConfirmedAt)}`
          : null),
      h('div.row.shrink0',
        h('button.btn-icon', {
          type: 'button',
          'aria-label': t(memory.pinned ? 'memory.unpin' : 'memory.pin'),
          'aria-pressed': memory.pinned ? 'true' : 'false',
          title: t(memory.pinned ? 'memory.unpin' : 'memory.pin'),
          onclick: () => togglePin(memory),
        }, icon('flag')),
        h('button.btn-icon', {
          type: 'button',
          'aria-label': t('memory.edit'),
          title: t('memory.edit'),
          onclick: () => openEditor(memory),
        }, icon('edit')),
        h('button.btn-icon', {
          type: 'button',
          'aria-label': t('memory.deleteOne'),
          title: t('memory.deleteOne'),
          onclick: () => deleteMemory(memory),
        }, icon('trash')))));
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderMemory(onRerender) {
  rerender = onRerender;

  const enabled = !!preferences().memoryEnabled;
  const memories = memoryService.all();

  const container = h('div', pageHeader(t('memory.title'), {
    subtitle: t('memory.lead'),
    actions: enabled
      ? [h('button.btn.btn-secondary', {
        type: 'button',
        onclick: () => learnNow(),
      }, icon('sparkle', { size: 16 }), t('memory.learnNow'))]
      : null,
  }));

  if (!enabled) container.appendChild(offNotice());
  container.appendChild(addCard());

  if (!memories.length) {
    container.appendChild(emptyState({
      icon: 'memory',
      title: t('memory.emptyTitle'),
      note: t('memory.emptyNote'),
    }));
    return container;
  }

  container.appendChild(h('div.stack', memories.map(memoryCard)));

  /* Last, and only when there is something to lose. */
  container.appendChild(h('div.row', { style: { marginBlockStart: 'var(--sp-5)' } },
    h('button.btn.btn-ghost.btn-sm', {
      type: 'button',
      onclick: () => clearAll(),
    }, icon('trash', { size: 15 }), t('memory.clearAll'))));

  return container;
}
