/*
 * exercise.js — the animated exercise card and its detail sheet.
 *
 * Card layout mirrors the reference document: figure, prescription, swap and
 * tick. The figure is a live SVG rig, not an image, so it costs nothing to ship
 * and works offline.
 */

import { h, clear, modal, announce } from '../core/dom.js';
import { mountClip } from '../core/anim.js';
import { clipFor } from '../data/clips.index.js';
import { byId } from '../data/exercises.index.js';
import * as store from '../core/store.js';

const players = new Set();

/** Tear down every mounted figure — call before re-rendering a whole view. */
export function releaseAll() {
  for (const c of players) {
    try { c.destroy(); } catch (e) { /* already gone */ }
  }
  players.clear();
}

function mount(host, ex, label) {
  const ctl = mountClip(host, clipFor(ex), { label });
  players.add(ctl);
  return ctl;
}

/**
 * @param {Object} day    Program day
 * @param {Object} slot   Slot with .key and .variants
 * @param {number} index  1-based position in the day
 * @param {Function} onChange  called after swap/tick so the parent can refresh chrome
 */
export function exerciseCard(day, slot, index, onChange) {
  const pick = store.pickOf(day.id, slot.key) % slot.variants.length;
  const v = slot.variants[pick];
  const ex = byId(v.exId);
  const done = store.isDone(day.id, slot.key);
  const logs = store.logsFor(day.id, slot.key);

  const card = h('div.ex' + (done ? '.done' : ''));

  const figure = h('div.anim', {
    role: 'button', tabindex: '0',
    title: 'הדגמה — לחץ להסבר מלא',
    onclick: () => openDetail(day, slot, pick, onChange),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(day, slot, pick, onChange); } },
  });
  card.appendChild(figure);
  mount(figure, ex, `הדגמה: ${v.name}`);

  const body = h('div.body-col',
    h('div.name', `${String(index).padStart(2, '0')} · ${v.name}`),
    v.nameEn ? h('div.name-en', v.nameEn) : null,
    h('div.prescr',
      h('span.chip', String(v.sets)),
      h('span.chip' + (v.unit === 'time' ? '.time' : ''), v.reps),
      v.rest ? h('span.chip.rest', `מנוחה ${v.rest}`) : null,
      v.tempo ? h('span.chip.rest', `טמפו ${v.tempo}`) : null,
      logs.length ? h('span.setpill', `${logs.length} סטים נרשמו`) : null,
    ),
    v.note ? h('p.note' + (String(v.note).startsWith('⚠︎') ? '.caution' : ''), v.note) : null,
    ex && ex.cues && ex.cues.length ? h('div.cues', ex.cues.slice(0, 3).map((c) => h('span.cue', c))) : null,
    levelRow(v.level, pick, slot.variants.length),
  );
  card.appendChild(body);

  card.appendChild(h('div.acts',
    slot.variants.length > 1
      ? h('button.iconbtn.swap', {
        type: 'button', title: 'החלף תרגיל', 'aria-label': `החלף תרגיל: ${v.name}`,
        onclick: () => {
          const next = (pick + 1) % slot.variants.length;
          store.setPick(day.id, slot.key, next);
          const fresh = exerciseCard(day, slot, index, onChange);
          fresh.classList.add('flash');
          card.replaceWith(fresh);
          setTimeout(() => fresh.classList.remove('flash'), 550);
          announce(`הוחלף ל־${slot.variants[next].name}`);
          if (onChange) onChange();
        },
      }, '⇄')
      : null,
    h('button.iconbtn.check' + (done ? '.on' : ''), {
      type: 'button', title: 'סמן כבוצע', 'aria-label': `סמן כבוצע: ${v.name}`,
      'aria-pressed': done ? 'true' : 'false',
      onclick: () => {
        store.setDone(day.id, slot.key, !done);
        card.replaceWith(exerciseCard(day, slot, index, onChange));
        if (onChange) onChange();
      },
    }, '✓'),
  ));

  return card;
}

function levelRow(level, pick, total) {
  const rungs = h('span.rungs');
  for (let i = 1; i <= 5; i++) rungs.appendChild(h('span.rung' + (i <= level ? '.f' : '')));
  return h('div.lev',
    h('span.lbl', 'קושי'),
    rungs,
    total > 1 ? h('span.of', `${pick + 1}/${total}`) : null,
  );
}

/* ------------------------------------------------------------------ *
 * Detail sheet
 * ------------------------------------------------------------------ */

const MUSCLE_HE = {
  chest: 'חזה', back: 'גב', lats: 'רחבים', traps: 'טרפז', shoulders: 'כתפיים',
  rear_delts: 'כתף אחורית', biceps: 'יד קדמית', triceps: 'יד אחורית',
  forearms: 'אמות', core: 'ליבה', obliques: 'אלכסונים', lower_back: 'גב תחתון',
  glutes: 'ישבן', quads: 'ארבע ראשי', hamstrings: 'ירך אחורית', calves: 'שוקיים',
  hip_flexors: 'כופפי ירך', adductors: 'מקרבים', full_body: 'כל הגוף',
};

const EQUIP_HE = {
  none: 'ללא ציוד', pullup_bar: 'מוט מתח', dip_bars: 'מקבילים', rings: 'טבעות',
  bands: 'גומיות', dumbbells: 'משקולות יד', barbell: 'מוט', kettlebell: 'קטלבל',
  bench: 'ספסל', box: 'קופסה', machines: 'מכונות', cable: 'פולי', trx: 'TRX',
  jump_rope: 'חבל קפיצה', mat: 'מזרן', sled: 'מזחלת', treadmill: 'הליכון',
  bike: 'אופניים', rower: 'חתירה',
};

export function openDetail(day, slot, pick, onChange) {
  const v = slot.variants[pick];
  const ex = byId(v.exId);

  const figure = h('div.anim.big');
  const body = h('div',
    figure,
    h('h3', { style: { marginTop: '14px' } }, v.name),
    v.nameEn ? h('div.name-en', { style: { marginBottom: '10px' } }, v.nameEn) : null,
    h('div.prescr',
      h('span.chip', String(v.sets)),
      h('span.chip' + (v.unit === 'time' ? '.time' : ''), v.reps),
      v.rest ? h('span.chip.rest', `מנוחה ${v.rest}`) : null,
      v.tempo ? h('span.chip.rest', `טמפו ${v.tempo}`) : null,
    ),
    v.note ? h('p.note' + (String(v.note).startsWith('⚠︎') ? '.caution' : ''), v.note) : null,
    ex && ex.cues && ex.cues.length
      ? h('div', { style: { marginTop: '14px' } },
        h('div.slotlbl', 'איך עושים נכון'),
        h('ul', { style: { paddingInlineStart: '18px', color: 'var(--dim)', fontSize: '13.5px' } },
          ex.cues.map((c) => h('li', { style: { margin: '4px 0' } }, c))))
      : null,
    ex ? h('div', { style: { marginTop: '14px' } },
      h('div.slotlbl', 'שרירים'),
      h('div.chipset', { style: { marginTop: '5px' } },
        (ex.muscles.primary || []).map((m) => h('span.chip', MUSCLE_HE[m] || m)),
        (ex.muscles.secondary || []).map((m) => h('span.chip.rest', MUSCLE_HE[m] || m)))) : null,
    ex && ex.equipment && ex.equipment.length ? h('div', { style: { marginTop: '12px' } },
      h('div.slotlbl', 'ציוד'),
      h('div.chipset', { style: { marginTop: '5px' } },
        ex.equipment.map((q) => h('span.chip.rest', EQUIP_HE[q] || q)))) : null,
    logger(day, slot),
    slot.variants.length > 1 ? variantSwitcher(day, slot, pick, onChange) : null,
  );

  let ctl = null;
  const close = modal(h('div', body, h('div.modal-actions',
    h('button.btn', { type: 'button', onclick: () => close() }, 'סגור'),
  )), {
    label: v.name,
    onClose: () => {
      // Stop the sheet's figure rather than leaving it ticking on a detached node.
      if (ctl) { ctl.destroy(); players.delete(ctl); }
    },
  });

  ctl = mountClip(figure, clipFor(ex), { label: `הדגמה: ${v.name}` });
  players.add(ctl);
  return close;
}

function variantSwitcher(day, slot, pick, onChange) {
  return h('div', { style: { marginTop: '16px' } },
    h('div.slotlbl', 'חלופות לאותו תפקיד'),
    h('div.opts', { style: { marginTop: '6px' } },
      slot.variants.map((alt, i) => h('button.opt' + (i === pick ? '.on' : ''), {
        type: 'button',
        onclick: () => {
          store.setPick(day.id, slot.key, i);
          if (onChange) onChange();
          announce(`הוחלף ל־${alt.name}`);
        },
      },
      h('span.tick', i === pick ? '✓' : ''),
      h('span.otext',
        h('span.otitle', alt.name),
        h('span.odesc', `${alt.sets} · ${alt.reps} · קושי ${alt.level}/5`)))),
    ));
}

function logger(day, slot) {
  const wrap = h('div', { style: { marginTop: '18px' } });
  const list = h('div.chipset', { style: { marginTop: '6px' } });

  function paint() {
    clear(list);
    const logs = store.logsFor(day.id, slot.key);
    if (!logs.length) {
      list.appendChild(h('span', { style: { color: 'var(--dimmer)', fontSize: '12.5px' } }, 'עוד לא נרשם סט היום'));
      return;
    }
    logs.forEach((l, i) => list.appendChild(h('span.setpill',
      `${i + 1}: ${l.reps}${l.weight ? ` × ${l.weight}ק״ג` : ''}`)));
  }

  const reps = h('input', { type: 'number', inputmode: 'numeric', placeholder: 'חזרות', min: '0' });
  const weight = h('input', { type: 'number', inputmode: 'decimal', placeholder: 'ק״ג', min: '0', step: '0.5' });

  wrap.appendChild(h('div.slotlbl', 'רישום סטים · נשמר במכשיר'));
  wrap.appendChild(h('div.logrow', reps, weight,
    h('button.btn', {
      type: 'button',
      onclick: () => {
        const r = Number(reps.value);
        if (!r) { reps.focus(); return; }
        store.logSet(day.id, slot.key, { reps: r, weight: weight.value ? Number(weight.value) : null });
        reps.value = '';
        paint();
        announce('הסט נרשם');
      },
    }, h('span.ico', '+'), 'הוסף סט')));
  wrap.appendChild(list);
  paint();
  return wrap;
}
