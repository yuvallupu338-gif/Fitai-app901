/*
 * areas.js — the shortest screen in the app, and it should stay that way.
 *
 * An area is a label that never ends: לימודים, כושר, עבודה. It has no
 * deadline, no progress and no completion, so a screen that tries to give it
 * those invents them. What an area can honestly answer is how much is filed
 * under it and how much of this month actually went there — the second being
 * the one number nobody can estimate for themselves, and the reason the screen
 * is worth opening at all.
 *
 * Deleting an area keeps its children (structure.js explains why), so the
 * confirmation says so rather than borrowing the project's scarier wording.
 */

import {
  h, replace, emptyState, confirmDestructive, dialog, field, popupMenu,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastError } from '../core/toast.js';
import { formatDuration } from '../core/time.js';
import { AREA_COLORS } from '../domain/schema.js';
import { areas as areasService } from '../services/structure.js';
import { timeAllocation } from '../services/insights.js';
import { pageHeader, areaDot } from './components.js';

let rerender = () => {};

function errorText(err) {
  if (!err) return null;
  switch (err.code) {
    case 'required': return t('errors.required');
    case 'max': return t('errors.tooLong', { n: err.max });
    default: return t('errors.generic');
  }
}

/* ------------------------------------------------------------------ *
 * The form
 * ------------------------------------------------------------------ */

/**
 * The colour swatches.
 *
 * Real buttons in a radio group rather than a native colour input: the palette
 * is eight theme tokens, not sixteen million values, and a token keeps the
 * area recognisable when the theme flips. Selection is marked by a ring and a
 * tick, never by the swatch's own colour — the colour is the choice, so it
 * cannot also be the state.
 */
function colorPicker(form) {
  const group = h('div.row.wrap-flex', { role: 'radiogroup', 'aria-label': t('areas.color') });
  const repaints = [];

  AREA_COLORS.forEach((color, index) => {
    const swatch = h('button.chip-select', {
      type: 'button',
      role: 'radio',
      'aria-label': t('areas.colorOption', { n: index + 1 }),
      style: {
        background: `var(--${color})`,
        color: 'var(--ink-inverse)',
        minWidth: '44px',
        minHeight: '44px',
        padding: '0',
      },
      onclick: () => {
        form.color = color;
        repaints.forEach((paint) => paint());
      },
    });

    function paint() {
      const on = form.color === color;
      swatch.setAttribute('aria-checked', on ? 'true' : 'false');
      swatch.setAttribute('aria-pressed', on ? 'true' : 'false');
      swatch.style.outline = on ? '2px solid var(--accent)' : '';
      swatch.style.outlineOffset = on ? '2px' : '';
      replace(swatch, on ? icon('check', { size: 16, weight: 3 }) : null);
    }

    repaints.push(paint);
    paint();
    group.appendChild(swatch);
  });

  return group;
}

function openAreaEditor(areaId, refresh) {
  const existing = areaId ? areasService.byId(areaId) : null;
  if (areaId && !existing) { toastError(t('errors.notFound')); return null; }

  /* A new area gets the first colour nobody is using, which is also what the
   * service would pick — so the swatch shown is the one that will be saved. */
  const used = new Set(areasService.all().map((a) => a.color));
  const form = {
    title: existing ? existing.title : '',
    color: existing ? existing.color : (AREA_COLORS.find((c) => !used.has(c)) || AREA_COLORS[0]),
  };
  let errors = {};

  const titleHost = h('div');

  function paintTitle() {
    replace(titleHost, field({
      label: t('areas.titleField'),
      error: errorText(errors.title),
      control: h('input', {
        type: 'text',
        value: form.title,
        maxlength: '40',
        oninput: (e) => { form.title = e.target.value; },
      }),
    }));
  }
  paintTitle();

  function save() {
    const payload = { title: form.title.trim(), color: form.color };
    const result = existing
      ? areasService.update(existing.id, payload)
      : areasService.create(payload);

    if (!result.ok) {
      errors = result.errors || {};
      paintTitle();
      if (!Object.keys(errors).length) toastError(t('errors.generic'));
      return false;
    }

    toast(existing ? t('common.saved') : t('areas.created'), { tone: 'ok' });
    refresh();
    return true;
  }

  return dialog({
    title: existing ? t('common.edit') : t('areas.newArea'),
    initialFocus: 'input',
    body: [
      titleHost,
      h('div.field', { style: { marginBlockStart: 'var(--sp-4)' } },
        h('div.field-label', t('areas.color')),
        colorPicker(form)),
    ],
    actions: [
      { label: t('common.cancel') },
      { label: t('common.save'), kind: 'primary', onClick: save },
    ],
  });
}

async function deleteArea(area) {
  const yes = await confirmDestructive({
    title: t('confirm.deleteAreaTitle'),
    note: t('confirm.deleteAreaNote'),
  });
  if (!yes) return;
  areasService.remove(area.id);
  toast(t('areas.deleted'));
  rerender();
}

/* ------------------------------------------------------------------ *
 * The cards
 * ------------------------------------------------------------------ */

/** The title is right next to it, so here the dot is decoration. */
function quietDot(area) {
  const dot = areaDot(area);
  dot.removeAttribute('role');
  dot.removeAttribute('aria-label');
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}

function areaCard(row, allocation) {
  const area = row.area;
  const counts = [];

  if (row.goals) counts.push(h('span.chip', icon('goal', { size: 12 }), plural('count.goals', row.goals)));
  if (row.projects) counts.push(h('span.chip', icon('project', { size: 12 }), plural('count.projects', row.projects)));
  if (row.tasks) counts.push(h('span.chip', icon('tasks', { size: 12 }), plural('count.tasks', row.tasks)));

  const time = allocation.get(area.id);

  return h('div.card.card-pad',
    h('div.row-between',
      h('div.row.grow.ellipsis',
        quietDot(area),
        h('h4.ellipsis', area.title)),
      h('button.btn-icon.shrink0', {
        type: 'button',
        'aria-label': t('common.actions'),
        onclick: (e) => popupMenu(e.currentTarget, [
          { label: t('common.edit'), icon: 'edit', onClick: () => openAreaEditor(area.id, rerender) },
          { separator: true },
          { label: t('common.delete'), icon: 'trash', danger: true, onClick: () => deleteArea(area) },
        ]),
      }, icon('more'))),

    h('div.row.wrap-flex', { style: { marginBlockStart: '12px' } },
      counts.length ? counts : h('span.tiny.quiet', t('common.nothingHere')),
      /* Only when there is time to report: a "0 דק׳" chip on every area is
       * eight rows of nothing, and it reads as a judgement. */
      time
        ? h('span.chip.chip-accent', icon('clock', { size: 12 }),
          `${t('progress.timeThisMonth')}: ${formatDuration(time.minutes)} · ${time.pct}%`)
        : null));
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderAreas(onRerender) {
  rerender = onRerender;

  const rows = areasService.withCounts();

  const container = h('div', pageHeader(t('areas.title'), {
    subtitle: t('areas.lead'),
    actions: [
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: () => openAreaEditor(null, rerender),
      }, icon('plus', { size: 16 }), t('areas.newArea')),
    ],
  }));

  if (!rows.length) {
    container.appendChild(emptyState({
      icon: 'area',
      title: t('areas.emptyTitle'),
      note: t('areas.emptyNote'),
      action: { label: t('areas.newArea'), onClick: () => openAreaEditor(null, rerender) },
    }));
    return container;
  }

  const allocation = new Map();
  for (const entry of timeAllocation('month').rows) {
    if (entry.minutes > 0) allocation.set(entry.areaId, entry);
  }

  container.appendChild(h('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
      gap: 'var(--sp-3)',
    },
  }, rows.map((row) => areaCard(row, allocation))));

  return container;
}
