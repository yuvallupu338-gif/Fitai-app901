import { $, $$, on } from './dom.js';
import { currentIntensity } from './intensity.js';

const WHATSAPP = '97239051190';
const MAIL = 'book@martef9.co.il';

const ROOM_BY_KEY = { anna: 'החדר של אנה', sanit: 'הסניטריום', line6: 'קו 6' };
const CAPACITY = { 'החדר של אנה': [2, 4], 'הסניטריום': [4, 8], 'קו 6': [2, 6] };
const WEEKDAY = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

const pad = (n) => String(n).padStart(2, '0');

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function hebrewDate(iso) {
  const [y, m, d] = iso.split('-');
  const day = new Date(`${iso}T12:00:00`).getDay();
  return `יום ${WEEKDAY[day]}, ${d}.${m}.${y}`;
}

/* 17:00 to midnight in half hours — fifteen slots, which is why the grid runs
   three or five across and never leaves a hole in the last row. */
function slotTimes() {
  const out = [];
  for (let minutes = 17 * 60; minutes <= 24 * 60; minutes += 30) {
    out.push(`${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`);
  }
  return out;
}

function buildSlots(host) {
  const frag = document.createDocumentFragment();
  for (const time of slotTimes()) {
    const wrap = document.createElement('div');
    wrap.className = 'slot';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'time';
    input.value = time;
    input.id = `t-${time.replace(':', '')}`;
    input.className = 'sr-only';

    const label = document.createElement('label');
    label.setAttribute('for', input.id);
    label.className = 'num';
    label.textContent = time;

    wrap.append(input, label);
    frag.append(wrap);
  }
  host.replaceChildren(frag);
}

export function initBooking() {
  const form = $('#book-form');
  const done = $('#book-done');
  if (!form || !done) return;

  const room = $('#bk-room');
  const date = $('#bk-date');
  const size = $('#bk-size');
  const name = $('#bk-name');
  const tel = $('#bk-tel');
  const note = $('#bk-note');
  const age = $('#bk-age');
  const slots = $('#slots');

  buildSlots(slots);
  date.min = todayISO();

  const timeField = slots.closest('.field');
  const checkedTime = () => $$('input[name="time"]', slots).find((el) => el.checked);

  const checks = [
    {
      control: room,
      run: (v) => (v ? null : 'בחרו חדר, או ״עוד לא החלטנו״.'),
    },
    {
      control: date,
      run: (v) => {
        if (!v) return 'בחרו תאריך.';
        if (v < todayISO()) return 'התאריך כבר עבר.';
        if (new Date(`${v}T12:00:00`).getDay() === 5) return 'בשישי בערב אנחנו סגורים. בחרו יום אחר.';
        return null;
      },
    },
    {
      control: size,
      run: (v) => {
        if (!v) return 'בחרו מספר משתתפים.';
        const cap = CAPACITY[room.value];
        if (!cap) return null;
        if (Number(v) < cap[0]) return `${room.value} נפתח מ־${cap[0]} משתתפים ומעלה.`;
        if (Number(v) > cap[1]) return `${room.value} מקבל עד ${cap[1]} משתתפים.`;
        return null;
      },
    },
    { control: name, run: (v) => (v.trim().length >= 2 ? null : 'כתבו שם, אפילו רק פרטי.') },
    {
      control: tel,
      run: (v) => (/^0\d{8,9}$/.test(v.replace(/\D/g, '')) ? null : 'מספר טלפון ישראלי, 9 או 10 ספרות.'),
    },
    {
      control: age,
      run: () => (age.checked ? null : 'בלי האישור הזה אי אפשר להזמין.'),
    },
    {
      control: null,
      field: timeField,
      group: () => $$('input[name="time"]', slots),
      run: () => (checkedTime() ? null : 'בחרו שעה.'),
    },
  ];

  function mark(check, message) {
    const field = check.field || check.control.closest('.field');
    const err = $('.err', field);
    field.classList.toggle('is-bad', Boolean(message));
    if (err && message) err.textContent = message;

    const controls = check.group ? check.group() : [check.control];
    for (const el of controls) {
      if (!el) continue;
      if (message) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }
  }

  function verify(check, { quiet = false } = {}) {
    const value = check.control ? check.control.value : '';
    const message = check.run(value);
    if (!quiet || !message) mark(check, message);
    return !message;
  }

  for (const check of checks) {
    const controls = check.group ? check.group() : [check.control];
    for (const el of controls) {
      if (!el) continue;
      on(el, 'blur', () => verify(check));
      // Once a field is wrong, clear it the moment it becomes right rather than
      // making somebody submit again to find out.
      on(el, 'change', () => {
        const field = check.field || check.control.closest('.field');
        if (field.classList.contains('is-bad')) verify(check);
      });
    }
  }

  // Participants and room argue with each other, so changing either re-reads
  // the pair instead of waiting for the number to be touched again.
  on(room, 'change', () => {
    const sizeCheck = checks.find((c) => c.control === size);
    if (size.value) verify(sizeCheck);
  });

  for (const link of $$('[data-book]')) {
    on(link, 'click', () => {
      const value = ROOM_BY_KEY[link.dataset.book];
      if (!value) return;
      room.value = value;
      mark(checks[0], null);
      const sizeCheck = checks.find((c) => c.control === size);
      if (size.value) verify(sizeCheck);
    });
  }

  function summary() {
    const { level, name: levelName, touch } = currentIntensity();
    const rows = [
      ['חדר', room.value],
      ['תאריך', hebrewDate(date.value)],
      ['שעה', checkedTime().value],
      ['משתתפים', size.value],
      ['עוצמה', `${level} · ${levelName}`],
      ['מגע פיזי', touch ? 'כן' : 'לא'],
      ['שם', name.value.trim()],
      ['טלפון', tel.value.trim()],
    ];
    if (note.value.trim()) rows.push(['הערות', note.value.trim()]);
    return rows;
  }

  function message(rows) {
    return [
      'שלום, רוצים להזמין חדר במרתף 9.',
      '',
      ...rows.map(([key, value]) => `${key}: ${value}`),
      '',
      'אישרנו שכל מי שנכנס עומד בתנאי הגיל.',
    ].join('\n');
  }

  function render(rows) {
    const list = $('#done-sum');
    list.replaceChildren();
    for (const [key, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = value;
      list.append(dt, dd);
    }
  }

  on(form, 'submit', (e) => {
    e.preventDefault();

    let firstBad = null;
    for (const check of checks) {
      if (verify(check)) continue;
      if (firstBad) continue;
      firstBad = check.control || check.group()[0];
    }
    if (firstBad) { firstBad.focus(); return; }

    const rows = summary();
    const text = message(rows);
    render(rows);

    $('#done-wa').href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
    $('#done-mail').href = `mailto:${MAIL}?subject=${encodeURIComponent('הזמנה — מרתף 9')}&body=${encodeURIComponent(text)}`;

    form.hidden = true;
    done.hidden = false;
    done.focus();
  });

  on($('#done-back'), 'click', () => {
    done.hidden = true;
    form.hidden = false;
    room.focus();
  });
}
