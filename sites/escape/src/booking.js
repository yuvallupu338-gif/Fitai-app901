/* booking.js — the slot grid, the stepper, validation, and the summary sheet.
 *
 * There is no backend and the page says so. What this produces is the message
 * the visitor sends us, written the way a person would write it, so the reply
 * can be a confirmation rather than four more questions.
 */

import { qs, qsa } from './dom.js';

const WA = '97237284460';
const MAIL = 'hello@enigma.co.il';
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/* Opening hours, in minutes from midnight, and the note that explains a short
   day to someone who just found half the grid greyed out. */
const HOURS = {
  0: { open: 600, close: 1380, note: '' },
  1: { open: 600, close: 1380, note: '' },
  2: { open: 600, close: 1380, note: '' },
  3: { open: 600, close: 1380, note: '' },
  4: { open: 600, close: 1380, note: '' },
  5: { open: 540, close: 900, note: 'בשישי אנחנו סוגרים ב-15:00, אז המשחק האחרון מתחיל ב-13:00.' },
  6: { open: 1140, close: 1440, note: 'בשבת פותחים בצאת השבת. המשחק הראשון ב-19:00.' },
};

const minutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function initBooking() {
  const form = qs('[data-book]');
  if (!form) return;

  const date = qs('#b-date', form);
  const slots = qsa('.slot', form);
  const slotValue = qs('[data-time-value]', form);
  const slotGroup = qs('[data-slots]', form);
  const slotNote = qs('[data-slots-note]', form);
  const players = qs('[data-players]', form);
  const summary = qs('[data-summary]');
  const list = qs('[data-summary-list]');

  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  date.min = iso(today);

  /* ---------------------------------------------------------- slot grid -- */

  const pick = (btn) => {
    for (const s of slots) s.setAttribute('aria-pressed', String(s === btn));
    slotValue.value = btn ? btn.dataset.slot : '';
    clearError(slotGroup.closest('.field'), slotGroup);
  };

  for (const btn of slots) {
    btn.addEventListener('click', () => pick(btn));
  }

  const syncSlots = () => {
    if (!date.value) return;
    const day = new Date(`${date.value}T12:00:00`).getDay();
    const hours = HOURS[day];
    if (!hours) return;

    for (const btn of slots) {
      const at = minutes(btn.dataset.slot);
      const ok = at >= hours.open && at <= hours.close - 60;
      btn.disabled = !ok;
      if (!ok && btn.getAttribute('aria-pressed') === 'true') pick(null);
    }
    slotNote.textContent = hours.note;
    slotNote.hidden = !hours.note;
  };

  date.addEventListener('change', syncSlots);
  syncSlots();

  /* ------------------------------------------------------------ stepper -- */

  const clamp = (n) => Math.min(6, Math.max(2, Number.isFinite(n) ? n : 4));
  const syncStepper = () => {
    const n = clamp(Math.round(Number(players.value)));
    players.value = String(n);
    for (const btn of qsa('.stepper__b', form)) {
      const dir = Number(btn.dataset.step);
      btn.disabled = (dir < 0 && n <= 2) || (dir > 0 && n >= 6);
    }
  };

  for (const btn of qsa('.stepper__b', form)) {
    btn.addEventListener('click', () => {
      players.value = String(clamp(Number(players.value) + Number(btn.dataset.step)));
      syncStepper();
    });
  }
  players.addEventListener('change', syncStepper);
  syncStepper();

  /* --------------------------------------------------------- validation -- */

  const checks = [
    { el: qs('#b-room', form), bad: (el) => !el.value },
    { el: date, bad: (el) => !el.value || el.value < date.min },
    { el: slotGroup, bad: () => !slotValue.value },
    { el: players, bad: (el) => Number(el.value) < 2 || Number(el.value) > 6 },
    { el: qs('#b-name', form), bad: (el) => el.value.trim().length < 2 },
    { el: qs('#b-phone', form), bad: (el) => !/^0\d{8,9}$/.test(el.value.replace(/\D/g, '').replace(/^972/, '0')) },
  ];

  for (const { el } of checks) {
    const event = el.tagName === 'DIV' ? 'click' : 'input';
    el.addEventListener(event, () => clearError(el.closest('.field'), el));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    let first = null;
    for (const { el, bad } of checks) {
      const field = el.closest('.field');
      if (bad(el)) {
        field.classList.add('is-bad');
        el.setAttribute('aria-invalid', 'true');
        if (!first) first = el;
      } else {
        clearError(field, el);
      }
    }

    if (first) {
      (first.tagName === 'DIV' ? qs('.slot:not([disabled])', first) : first).focus();
      return;
    }

    render({ form, date, slotValue, players, list, summary });
  });
}

function clearError(field, el) {
  field?.classList.remove('is-bad');
  el.removeAttribute('aria-invalid');
}

function niceDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  const day = DAYS[new Date(y, m - 1, d).getDay()];
  return `יום ${day}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function render({ form, date, slotValue, players, list, summary }) {
  const val = (id) => qs(id, form).value.trim();
  /* The third field says whether the value is a latin run that has to be
     isolated. Sniffing it from the text does not work — Hebrew letters are
     non-word characters to a JS regex, so a Hebrew date passes a "looks
     numeric" test and comes out backwards. */
  const rows = [
    ['חדר', val('#b-room'), false],
    ['תאריך', niceDate(date.value), false],
    ['שעה', slotValue.value, true],
    ['שחקנים', players.value, true],
    ['שם', val('#b-name'), false],
    ['טלפון', val('#b-phone'), true],
  ];
  if (val('#b-coupon')) rows.push(['קופון', val('#b-coupon').toUpperCase(), true]);
  if (val('#b-notes')) rows.push(['הערות', val('#b-notes'), false]);

  list.textContent = '';
  for (const [key, value, latin] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (latin) dd.className = 'num';
    list.append(dt, dd);
  }

  const text = ['שלום, אשמח להזמין חדר באניגמה.', '']
    .concat(rows.map(([key, value]) => `${key}: ${value}`))
    .concat(['', 'נשמח לאישור.'])
    .join('\n');

  qs('[data-wa]').href = `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;
  qs('[data-mail]').href =
    `mailto:${MAIL}?subject=${encodeURIComponent(`הזמנה — ${val('#b-room')}`)}&body=${encodeURIComponent(text)}`;

  summary.hidden = false;
  const head = qs('.summary__h', summary);
  head.tabIndex = -1;
  head.focus({ preventScroll: true });
  summary.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
