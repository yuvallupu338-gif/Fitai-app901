/*
 * exercise.js — the animated exercise card and its detail sheet.
 *
 * Card layout mirrors the reference document: figure, prescription, swap and
 * tick. The figure is a live SVG rig, not an image, so it costs nothing to ship
 * and works offline.
 */

import { h, clear, modal, announce } from '../core/dom.js';
import { byId } from '../data/exercises.index.js';
import { stepDifficulty, prescribeSwap } from '../engine/adjust.js';
import { startRest, parseRest } from './timer.js';
import * as store from '../core/store.js';

const players = new Set();

/** Tear down every mounted figure — call before re-rendering a whole view. */
export function releaseAll() {
  for (const c of players) {
    try { c.destroy(); } catch (e) { /* already gone */ }
  }
  players.clear();
}

/*
 * A link to a YouTube search for this exercise, rather than a drawn figure.
 *
 * The search is by the Hebrew name, because that is the name on the card and
 * the one the user would type. The English name rides along as a second term:
 * on movements where Hebrew coverage is thin it is what surfaces a technique
 * video, and where it is not, YouTube ignores it.
 *
 * target=_blank with rel=noopener — this is the one place the app leaves the
 * device, and a plan half-logged should still be here when they come back.
 */
function demoSearchUrl(ex, name) {
  const terms = [name || (ex && ex.name), ex && ex.nameEn].filter(Boolean).join(' ');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(terms)}`;
}

function ytLink(ex, name, big) {
  return h(`a.anim${big ? '.big' : ''}.ytlink`, {
    href: demoSearchUrl(ex, name),
    target: '_blank',
    rel: 'noopener noreferrer',
    title: `חפש ביוטיוב: ${name}`,
    'aria-label': `צפה בהדגמה של ${name} ביוטיוב — נפתח בלשונית חדשה`,
  }, h('span.ytmark', '▶'), h('span.ytcap', big ? 'צפה בהדגמה ביוטיוב' : 'הדגמה'));
}

/**
 * @param {Object} day    Program day
 * @param {Object} slot   Slot with .key and .variants
 * @param {number} index  1-based position in the day
 * @param {Function} onChange  called after swap/tick so the parent can refresh chrome
 */
export function exerciseCard(day, slot, index, onChange) {
  const pick = store.pickOf(day.id, slot.key) % slot.variants.length;
  const override = store.overrideOf(day.id, slot.key);
  const v = override || slot.variants[pick];
  const ex = byId(v.exId);
  const done = store.isDone(day.id, slot.key);
  const logs = store.logsFor(day.id, slot.key);

  const card = h('div.ex' + (done ? '.done' : ''));

  card.appendChild(ytLink(ex, v.name, false));

  /*
   * The name opens the detail sheet, because the figure no longer can — it is a
   * link out to YouTube now. The sheet holds the full cues and the alternatives,
   * so losing the only way in would have quietly removed all of it.
   */
  const body = h('div.body-col',
    h('button.name.namebtn', {
      type: 'button',
      title: 'פרטים, דגשים וחלופות',
      onclick: () => openDetail(day, slot, pick, onChange),
    }, `${String(index).padStart(2, '0')} · ${v.name}`),
    v.nameEn ? h('div.name-en', v.nameEn) : null,
    h('div.prescr',
      h('span.chip', setsChip(v)),
      repsChip(v),
      restChip(v),
      v.tempo ? h('span.chip.rest', `טמפו ${v.tempo}`) : null,
      /* Amber, not muted like tempo and rest: where it appears it IS the
         prescription, and repsChip has stood down for it. */
      v.effort ? h('span.chip.effort', v.effort) : null,
      logs.length ? h('span.setpill', `${logs.length} סטים נרשמו`) : null,
    ),
    v.note ? h('p.note' + (String(v.note).startsWith('⚠︎') ? '.caution' : ''), v.note) : null,
    slot.partner ? h('p.note.partner',
      h('span.pbadge', slot.partner.spot ? 'שמירה' : slot.partner.alternating ? 'לסירוגין' : 'מנוחה מלאה'),
      slot.partner.note) : null,
    ex && ex.cues && ex.cues.length ? h('div.cues', ex.cues.slice(0, 3).map((c) => h('span.cue', c))) : null,
    levelRow(v.level, pick, slot.variants.length, !!override),
    feedbackRow(day, slot, v, index, onChange),
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

/*
 * The rest chip doubles as the timer's trigger. Rest is the one number on the
 * card the user has to act on, and hanging a separate button off it would be a
 * second thing to find between sets — with a phone in one hand. A prescription
 * whose rest text holds no readable interval falls back to the plain chip it
 * always was.
 */
/*
 * A rep range and "to failure" are two prescriptions, and only one of them can
 * be followed.
 *
 * "3×6–10 עד כישלון" asks the trainee to stop at ten and to keep going until
 * they cannot — and whichever they obey, the card was wrong about the other.
 * The rep range was already the weaker half: on a bodyweight movement at the
 * right leverage the count falls out of the effort, and where the leverage is
 * wrong the range is the thing that hides it. That was how "8–12 to failure"
 * reached somebody who could do thirty.
 *
 * So where an effort instruction is present it replaces the range, and the
 * set count grows a unit so the line still reads as a prescription rather than
 * a bare number. Everything without an effort line — time-based holds, the
 * finishing movements past position seven, every other goal — keeps its range,
 * because there the range is all the trainee has.
 */
function prescribesEffort(v) {
  return !!v.effort && /כישלון/.test(v.effort);
}

function setsChip(v) {
  return prescribesEffort(v) ? `${v.sets} סטים` : String(v.sets);
}

function repsChip(v) {
  if (prescribesEffort(v)) return null;
  return h('span.chip' + (v.unit === 'time' ? '.time' : ''), v.reps);
}

function restChip(v) {
  if (!v.rest) return null;
  if (!parseRest(v.rest)) return h('span.chip.rest', `מנוחה ${v.rest}`);
  return h('button.chip.rest.resttrigger', {
    type: 'button',
    title: 'הפעל טיימר מנוחה',
    'aria-label': `הפעל טיימר מנוחה של ${v.rest} — ${v.name}`,
    onclick: () => {
      startRest(v.rest, v.name);
      announce(`טיימר מנוחה ${v.rest}`);
    },
  }, h('span.ico', '◷'), `מנוחה ${v.rest}`);
}

/*
 * Difficulty, and separately which alternative you are looking at.
 *
 * These were one row and read as one number. The label said "קושי", and the
 * chip beside it said "1/3" — which was the VARIANT index, not the level, so a
 * level-4 exercise showing as the first of three alternatives announced itself
 * as "קושי 1/3". The chip also vanished whenever a slot had a single variant,
 * which made the whole row look like it rendered inconsistently.
 *
 * The level is now spelled out as a number as well as drawn. At level 1 the
 * meter is one faint rung in five, which is indistinguishable from a bar that
 * failed to render, and "1/5" beside it settles the question.
 */
function levelRow(level, pick, total, adjusted) {
  const rungs = h('span.rungs');
  for (let i = 1; i <= 5; i++) rungs.appendChild(h('span.rung' + (i <= level ? '.f' : '')));
  return h('div.lev',
    h('span.lbl', 'קושי'),
    rungs,
    h('span.of', { 'aria-label': `רמת קושי ${level} מתוך 5` }, `${level}/5`),
    adjusted ? h('span.of', { style: { color: 'var(--cyan)' } }, 'מותאם') : null,
    !adjusted && total > 1
      ? h('span.of', { style: { opacity: '.75' } }, `חלופה ${pick + 1} מתוך ${total}`)
      : null,
  );
}

/* Autoregulation. The generator guesses a starting difficulty; only the person
   doing the set knows whether it was actually hard. */
function feedbackRow(day, slot, v, index, onChange) {
  const profile = store.get().profile;
  if (!profile) return null;

  const move = (dir) => {
    const next = stepDifficulty(profile, slot, v.exId, dir);
    if (!next) {
      announce(dir > 0 ? 'זה כבר הקשה ביותר שמתאים לך' : 'זה כבר הקל ביותר בתרגיל הזה');
      return;
    }
    store.setOverride(day.id, slot.key, prescribeSwap(v, next, dir, v.level));
    const fresh = exerciseCard(day, slot, index, onChange);
    fresh.classList.add('flash');
    const host = document.activeElement && document.activeElement.closest('.ex');
    (host || fresh).replaceWith(fresh);
    setTimeout(() => fresh.classList.remove('flash'), 550);
    announce(`${dir > 0 ? 'הועלה' : 'הורד'} ל־${next.name}`);
    if (onChange) onChange();
  };

  const canUp = !!stepDifficulty(profile, slot, v.exId, 1);
  const canDown = !!stepDifficulty(profile, slot, v.exId, -1);
  const adjusted = !!store.overrideOf(day.id, slot.key);
  if (!canUp && !canDown && !adjusted) return null;

  return h('div.feedback',
    canUp ? h('button.fbtn', {
      type: 'button', title: 'החלף לתרגיל קשה יותר',
      onclick: () => move(1),
    }, 'קל לי ↑') : null,
    canDown ? h('button.fbtn', {
      type: 'button', title: 'החלף לתרגיל קל יותר',
      onclick: () => move(-1),
    }, 'קשה לי ↓') : null,
    adjusted ? h('button.fbtn.reset', {
      type: 'button', title: 'חזור לתרגיל המקורי',
      onclick: () => {
        store.setOverride(day.id, slot.key, null);
        const fresh = exerciseCard(day, slot, index, onChange);
        card_replace(fresh);
        announce('חזרה לתרגיל המקורי');
        if (onChange) onChange();
      },
    }, '↺ מקורי') : null,
  );

  function card_replace(fresh) {
    const host = document.activeElement && document.activeElement.closest('.ex');
    if (host) host.replaceWith(fresh);
  }
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

/**
 * A YouTube search for the movement. Deliberately a search rather than a fixed
 * video id: nobody here owns or vets the footage, ids rot, and a search keeps
 * the choice with the user. The English name pulls far better technique
 * results than the Hebrew one. Needs a connection — everything else does not.
 */
export function videoSearchUrl(ex, fallbackName) {
  const term = (ex && ex.nameEn) || fallbackName || '';
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${term} proper form`)}`;
}

function videoLink(ex, name) {
  return h('a.btn.videolink', {
    href: videoSearchUrl(ex, name),
    target: '_blank',
    rel: 'noopener noreferrer',
    title: 'נפתח ביוטיוב בלשונית חדשה — דורש אינטרנט',
  }, h('span.ico', '▶'), 'הדגמות בוידאו');
}

export function openDetail(day, slot, pick, onChange) {
  const v = slot.variants[pick];
  const ex = byId(v.exId);

  const figure = ytLink(ex, v.name, true);
  const body = h('div',
    figure,
    h('h3', { style: { marginTop: '14px' } }, v.name),
    v.nameEn ? h('div.name-en', { style: { marginBottom: '10px' } }, v.nameEn) : null,
    h('div.prescr',
      h('span.chip', setsChip(v)),
      repsChip(v),
      restChip(v),
      v.tempo ? h('span.chip.rest', `טמפו ${v.tempo}`) : null,
      /* Amber, not muted like tempo and rest: where it appears it IS the
         prescription, and repsChip has stood down for it. */
      v.effort ? h('span.chip.effort', v.effort) : null,
    ),
    v.note ? h('p.note' + (String(v.note).startsWith('⚠︎') ? '.caution' : ''), v.note) : null,
    ex && ex.cues && ex.cues.length
      ? h('div', { style: { marginTop: '14px' } },
        h('div.slotlbl', 'איך עושים נכון'),
        h('ul', { style: { paddingInlineStart: '18px', color: 'var(--dim)', fontSize: '13.5px' } },
          ex.cues.map((c) => h('li', { style: { margin: '4px 0' } }, c))))
      : null,
    h('div', { style: { marginTop: '14px' } },
      videoLink(ex, v.name),
      h('p', { style: { color: 'var(--dimmer)', fontSize: '11.5px', marginTop: '6px' } },
        'חיפוש ביוטיוב בשם התרגיל. הסרטונים אינם שלנו ולא נבדקו — דורש חיבור לאינטרנט.')),
    ex ? h('div', { style: { marginTop: '14px' } },
      h('div.slotlbl', 'שרירים'),
      h('div.chipset', { style: { marginTop: '5px' } },
        (ex.muscles.primary || []).map((m) => h('span.chip', MUSCLE_HE[m] || m)),
        (ex.muscles.secondary || []).map((m) => h('span.chip.rest', MUSCLE_HE[m] || m)))) : null,
    ex && ex.equipment && ex.equipment.length ? h('div', { style: { marginTop: '12px' } },
      h('div.slotlbl', 'ציוד'),
      h('div.chipset', { style: { marginTop: '5px' } },
        ex.equipment.map((q) => h('span.chip.rest', EQUIP_HE[q] || q)))) : null,
    logger(day, slot, v),
    slot.variants.length > 1 ? variantSwitcher(day, slot, pick, onChange) : null,
  );

  const close = modal(h('div', body, h('div.modal-actions',
    h('button.btn', { type: 'button', onclick: () => close() }, 'סגור'),
  )), {
    label: v.name,
  });

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

function logger(day, slot, v) {
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
        // Logging a set IS finishing one, and the rest starts the moment it
        // ends — not when someone remembers to press a second button. One
        // announcement for both, because announce() only holds the last one.
        const timed = startRest(v && v.rest, v && v.name);
        announce(timed ? `הסט נרשם · מנוחה ${v.rest}` : 'הסט נרשם');
      },
    }, h('span.ico', '+'), 'הוסף סט')));
  wrap.appendChild(list);
  paint();
  return wrap;
}
