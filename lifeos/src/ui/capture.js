/*
 * capture.js — one line in, one task out.
 *
 * The whole point of quick capture is that it costs nothing: a thought arrives,
 * it goes somewhere safe, and the person carries on with what they were doing.
 * Anything that turns capture into a form defeats it — by the time there are
 * six fields to fill, the thought is written on a napkin instead.
 *
 * SO THE PARSER IS AGGRESSIVE AND THE GUESS IS ALWAYS ON SCREEN.
 *
 * "מחר ב־17:00 ללמוד מתמטיקה 45 דקות" becomes a scheduled task with an
 * estimate, and the preview underneath shows exactly which parts were read as
 * what. That pairing is what makes the aggression safe: a parser nobody can
 * see is a parser that silently invents deadlines, while a parser whose output
 * is visible before saving is a shortcut with an undo built into the reading.
 *
 * THREE WAYS OUT, BECAUSE THE PARSE IS NOT ALWAYS WANTED.
 *
 *   Enter        — save what was understood
 *   מתישהו       — the same, parked out of the active lists
 *   כמו שזה      — save the raw line, parser ignored entirely
 *
 * The third exists because a task genuinely called "לבדוק מחר בבוקר" should be
 * allowed to keep its name, and no amount of parser tuning can tell that case
 * apart from the one where the same words meant a schedule.
 */

import { h, dialog, replace, announce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { toast, toastError } from '../core/toast.js';
import {
  formatDuration, formatTimeRange, relativeDay, dayName, dayOfWeek, addDays,
  today as todayIso,
} from '../core/time.js';
import * as tasksService from '../services/tasks.js';

/* ------------------------------------------------------------------ *
 * Preview
 * ------------------------------------------------------------------ */

function previewRow(label, value) {
  return h('div.row', { style: { marginBlockStart: '6px' } },
    h('span.tiny.quiet.shrink0', { style: { width: '76px' } }, label),
    h('span.tiny', { style: { color: 'var(--ink)' } }, value));
}

function recurrenceText(fields) {
  if (fields.recurrence === 'weekly' && fields.recurrenceDays && fields.recurrenceDays.length) {
    /* The rule is a weekday index; the only way to name it is to find the next
     * date that lands on it and ask the calendar what that day is called. */
    const base = todayIso();
    const iso = addDays(base, (fields.recurrenceDays[0] - dayOfWeek(base) + 7) % 7);
    return t('tasks.recurrenceOnDay', { day: dayName(iso) });
  }
  return t(`tasks.recurrenceEvery.${fields.recurrence}`);
}

/* ------------------------------------------------------------------ *
 * The dialog
 * ------------------------------------------------------------------ */

/**
 * openCapture({ text, projectId, areaId, onSaved })
 *
 * `projectId` / `areaId` file the result somewhere specific — the inbox screen
 * and a project screen both capture into their own context. `onSaved` lets the
 * screen underneath refresh; there is no rerender to call otherwise, because
 * the shell opens this from a button that belongs to no screen.
 */
export function openCapture(defaults) {
  const o = defaults || {};

  let parsed = null;
  let acceptGuess = false;
  let guessId = null;

  const input = h('input', {
    type: 'text',
    id: 'capture-input',
    value: o.text || '',
    placeholder: t('inbox.capturePlaceholder'),
    autocomplete: 'off',
    autocapitalize: 'sentences',
    spellcheck: 'false',
    'aria-label': t('inbox.capturePlaceholder'),
    'aria-describedby': 'capture-hint',
    oninput: () => refresh(),
    onkeydown: onKey,
  });

  const submitButton = h('button.capture-go', {
    type: 'button',
    'aria-label': t('common.add'),
    onclick: () => save({}),
  }, icon('plus'));

  const preview = h('div', { style: { marginBlockStart: 'var(--sp-4)' } });

  const d = dialog({
    title: t('shortcuts.capture'),
    body: [
      h('div.capture', input, submitButton),
      h('p.field-hint', { id: 'capture-hint', style: { marginBlockStart: '8px' } },
        t('inbox.captureHint')),
      preview,
    ],
    /* The head already carries a close button, so the footer is free for the
     * two saves that are not the obvious one. */
    actions: [
      { label: t('someday.add'), onClick: () => save({ someday: true }) },
      { label: t('inbox.keepAsIs'), onClick: () => saveRaw() },
    ],
    /* Named explicitly: the first focusable in the dialog is the close button in
     * the head, and a capture box that opens with the caret anywhere but the
     * field is a capture box nobody types into. */
    initialFocus: '#capture-input',
  });

  function onKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    /* The parser did something a person would not have predicted — read a bare
     * number as an afternoon hour, or understood less than half the line. Enter
     * is a reflex; a button press is a decision, and this is a case that
     * deserves the second one. */
    if (parsed && parsed.needsConfirmation) {
      announce(t('inbox.parsedConfirm'));
      submitButton.focus();
      return;
    }
    save({});
  }

  function save(opts) {
    const text = input.value.trim();
    if (!text) { input.focus(); return false; }

    const result = tasksService.capture(text, Object.assign({
      acceptGuess,
      projectId: o.projectId || null,
      areaId: o.areaId || null,
    }, opts));

    if (!result.ok) { toastError(t('errors.generic')); return false; }
    return done(result.task);
  }

  function saveRaw() {
    const text = input.value.trim();
    if (!text) { input.focus(); return false; }

    /* Deliberately not capture(): "כמו שזה" means the line is the title, dates
     * and all. Going through the parser and then undoing it is not the same
     * thing — the parser also strips what it matched out of the title. */
    const result = tasksService.create({
      title: text,
      projectId: o.projectId || null,
      areaId: o.areaId || null,
      status: 'inbox',
    });

    if (!result.ok) { toastError(t('errors.generic')); return false; }
    return done(result.task);
  }

  function done(task) {
    toast(t('inbox.addedAs', { title: task.title }), { tone: 'ok' });
    if (o.onSaved) o.onSaved(task);
    d.close();
    return true;
  }

  function guessBlock(guess) {
    const toggle = h('button.chip.chip-select', {
      type: 'button',
      'aria-pressed': acceptGuess ? 'true' : 'false',
      onclick: () => {
        acceptGuess = !acceptGuess;
        toggle.setAttribute('aria-pressed', acceptGuess ? 'true' : 'false');
      },
    }, icon('project', { size: 12 }), t('inbox.suggestAccept'));

    return h('div.row.wrap-flex', { style: { marginBlockStart: '12px' } },
      h('span.tiny.quiet', t('inbox.suggestProject', { project: guess.project.title })),
      toggle);
  }

  function previewBody() {
    if (!parsed || !parsed.ok) return null;

    /* Already filed by the caller — a guess about where it belongs would be
     * offering to overrule a decision that has been made. */
    const guess = o.projectId ? null : parsed.projectGuess;
    if (!parsed.matched.length && !guess) return null;

    const f = parsed.fields;
    const rows = [previewRow(t('inbox.parsedTask'), parsed.title)];

    /* A date on its own is a deadline and a date with a time is a plan — the
     * parser makes that distinction, so the preview has to say which one it
     * landed on rather than calling both of them "תאריך". */
    if (f.dueDate) rows.push(previewRow(t('tasks.due'), relativeDay(f.dueDate)));
    else if (f.scheduledDate) rows.push(previewRow(t('inbox.parsedDate'), relativeDay(f.scheduledDate)));

    if (f.scheduledStart !== undefined && f.scheduledStart !== null) {
      rows.push(previewRow(t('inbox.parsedTime'), formatTimeRange(f.scheduledStart, f.scheduledEnd)));
    }
    if (f.estimatedMinutes) rows.push(previewRow(t('inbox.parsedDuration'), formatDuration(f.estimatedMinutes)));
    if (f.recurrence) rows.push(previewRow(t('tasks.recurrence'), recurrenceText(f)));
    if (f.tags && f.tags.length) rows.push(previewRow(t('tasks.tags'), f.tags.join(', ')));

    return [
      h('div.card.card-sunk.card-pad',
        h('div.eyebrow', t('inbox.parsedTitle')),
        rows,
        guess ? guessBlock(guess) : null),
      parsed.needsConfirmation
        ? h('div.notice.notice-info', { style: { marginBlockStart: 'var(--sp-3)' } },
          t('inbox.parsedConfirm'))
        : null,
    ];
  }

  function refresh() {
    const text = input.value.trim();
    submitButton.disabled = !text;
    parsed = text ? tasksService.previewCapture(text) : null;

    /* A different project on the table is a different question, so the answer
     * to the previous one does not carry over. */
    const guess = parsed && parsed.ok ? parsed.projectGuess : null;
    const nextId = guess ? guess.project.id : null;
    if (nextId !== guessId) { guessId = nextId; acceptGuess = false; }

    replace(preview, previewBody());
  }

  refresh();
  return d;
}
