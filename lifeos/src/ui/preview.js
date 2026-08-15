/*
 * preview.js — "LifeOS proposes this. Apply?"
 *
 * §110: a model proposes, a person applies. Every structure the assistant
 * generates — a goal's projects, a project's breakdown — arrives here first,
 * as a list of checkboxes with nothing written yet. The apply button is the
 * only thing in the flow that touches the database, and it is pressed by a
 * hand.
 *
 * It is generic on purpose. One preview surface means one place where the
 * origin is disclosed, one place where "nothing is selected" is handled, and
 * one set of habits to learn: what is ticked is what happens.
 */

import { h, replace, dialog } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { originNote } from './components.js';

function normalise(groups) {
  return (groups || []).map((g) => ({
    title: g.title || '',
    items: (g.items || []).map((item) => ({
      id: item.id,
      label: item.label,
      note: item.note || '',
      /* Proposals arrive ticked — the common case is accepting most of them,
       * and an empty list of checkboxes reads as work rather than an offer. */
      selected: item.selected !== false,
    })),
  })).filter((g) => g.items.length);
}

/**
 * openPreview({title, lead, groups, onApply, origin})
 *
 * groups: [{title, items:[{id, label, note, selected}]}]
 * onApply: receives the selection grouped the same way —
 *          [{title, ids:[id...], items:[item...]}], in the order given.
 */
export function openPreview(opts) {
  const o = opts || {};
  const groups = normalise(o.groups);
  const onApply = o.onApply || (() => {});

  const countHost = h('div.tiny.quiet', { style: { marginBlockStart: 'var(--sp-4)' } });
  let applyButton = null;

  function count() {
    return groups.reduce((n, g) => n + g.items.filter((x) => x.selected).length, 0);
  }

  function sync() {
    const n = count();
    const total = groups.reduce((s, g) => s + g.items.length, 0);
    replace(countHost, total === 0 ? ''
      : n === 0 ? t('planning.previewNone')
        : `${n} ${t('common.of')} ${plural('count.items', total)}`);
    if (applyButton) applyButton.disabled = n === 0;
  }

  function groupSection(group) {
    const allHost = h('div.shrink0');
    const rows = [];

    /* One control rather than a checkbox next to a word: the label has to be
     * pressable, and the glyph carries the state so it is not read off the
     * colour of a box. */
    function paintAll() {
      const all = group.items.every((x) => x.selected);
      replace(allHost, h('button.btn.btn-sm.btn-ghost', {
        type: 'button',
        role: 'checkbox',
        'aria-checked': all ? 'true' : 'false',
        onclick: () => {
          for (const item of group.items) item.selected = !all;
          rows.forEach((paint) => paint());
          paintAll();
          sync();
        },
      }, icon(all ? 'check' : 'plus', { size: 14 }), t('planning.previewSelectAll')));
    }

    /* The whole row is the checkbox, rather than a box next to a row that also
     * toggles: two controls that do the same thing are two things to hear and
     * two places to miss on a phone. */
    const list = group.items.map((item) => {
      const row = h('button.trow', {
        type: 'button',
        role: 'checkbox',
        onclick: () => { item.selected = !item.selected; paint(); paintAll(); sync(); },
      });

      function paint() {
        row.setAttribute('aria-checked', item.selected ? 'true' : 'false');
        replace(row,
          /* Hidden from the reader, which already hears the row's state — the
           * aria-checked here is the hook the stylesheet ticks the box with. */
          h('span.tcheck', {
            'aria-hidden': 'true',
            'aria-checked': item.selected ? 'true' : 'false',
          }, icon('check', { weight: 3 })),
          h('div.trow-body',
            h('div.trow-title', item.label),
            item.note
              ? h('div.tiny.quiet', { style: { marginBlockStart: '3px' } }, item.note)
              : null));
      }

      rows.push(paint);
      paint();
      return row;
    });

    paintAll();

    return h('section.section',
      h('div.section-head',
        h('h3.section-title', group.title || plural('count.items', group.items.length)),
        allHost),
      h('div.card.card-flat', { style: { overflow: 'hidden' } }, list));
  }

  const dlg = dialog({
    title: o.title || t('planning.previewTitle'),
    note: o.lead || null,
    wide: true,
    body: [
      o.origin ? originNote(o.origin) : null,
      groups.length
        ? groups.map(groupSection)
        : h('p.quiet', { style: { marginBlockStart: 'var(--sp-4)' } }, t('common.nothingHere')),
      countHost,
    ],
    actions: [
      { label: t('common.dismiss') },
      {
        label: t('common.applyChanges'),
        kind: 'primary',
        onClick: () => {
          if (!count()) return false;
          onApply(groups.map((g) => {
            const items = g.items.filter((x) => x.selected);
            return { title: g.title, ids: items.map((x) => x.id), items };
          }));
          return true;
        },
      },
    ],
  });

  /* The footer is built by dialog(), so the apply button is reached through
   * the box rather than held as a reference. It has to be disabled rather than
   * merely refused: a button that does nothing on press is worse than one that
   * says it cannot. */
  applyButton = dlg.body.parentNode.querySelector('.modal-foot .btn-primary');
  sync();

  return dlg;
}
