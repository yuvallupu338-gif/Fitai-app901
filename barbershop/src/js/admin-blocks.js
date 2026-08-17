/**
 * Taking time off the board.
 *
 * Three shapes, because a barber closes time in three different ways:
 *   • a whole day        — a holiday, a wedding, a sick day
 *   • a window in a day  — lunch, a delivery, an errand at four
 *   • a weekday, repeated for a few weeks — "no Mondays until the end of the month"
 *
 * A repeating block is stored as one record per date, all sharing a groupId, so
 * the calendar can read a single day without expanding a rule, and the list can
 * still show and undo the whole set as one line.
 */

import { DAY_NAMES, DAY_SHORT } from './config.js'
import { addDays, formatDateHe, fromISO, hoursLabel, isClosed, minutesOf, todayISO } from './schedule.js'
import {
  addBlock,
  addBlockGroup,
  listBlockRows,
  listBookings,
  removeBlock,
  removeBlockGroup,
} from './store.js'
import { el, render, icon, toast, plural } from './ui.js'
import { confirmSheet } from './sheet.js'

const MODES = [
  { id: 'day', title: 'יום שלם', hint: 'סוגר יום אחד לגמרי' },
  { id: 'hours', title: 'טווח שעות', hint: 'הפסקה או חלון ביום אחד' },
  { id: 'weekly', title: 'קבוע בשבוע', hint: 'יום בשבוע, לכמה שבועות קדימה' },
]

const SPANS = [
  { weeks: 1, label: 'שבוע' },
  { weeks: 2, label: 'שבועיים' },
  { weeks: 3, label: '3 שבועות' },
  { weeks: 4, label: 'חודש' },
  { weeks: 8, label: 'חודשיים' },
]

const FULL_DAY = { from: '00:00', to: '23:59' }

/**
 * Every date within `weeks` weeks from today whose weekday is in `weekdays`.
 * Counting starts today, so choosing Monday on a Monday blocks today as well.
 */
export function datesForWeekdays(weekdays, weeks, startISO = todayISO()) {
  const days = weeks * 7
  const out = []
  for (let i = 0; i < days; i++) {
    const iso = addDays(startISO, i)
    if (weekdays.includes(fromISO(iso).getDay())) out.push(iso)
  }
  return out
}

/** Live bookings that fall inside a window on any of these dates. */
function collisions(dates, from, to) {
  const start = minutesOf(from)
  const end = minutesOf(to)
  const set = new Set(dates)
  return listBookings().filter((b) => {
    if (!set.has(b.date) || b.status === 'cancelled') return false
    const bStart = minutesOf(b.time)
    return bStart < end && start < bStart + b.durationMin
  })
}

/** Saves the blocks, after warning about any booking already inside them. */
function commit({ dates, from, to, reason, repeat, onDone }) {
  if (!dates.length) {
    toast('לא נבחר תאריך לחסימה.', { tone: 'error' })
    return
  }

  const save = () => {
    if (dates.length === 1 && !repeat) {
      addBlock({ date: dates[0], from, to, reason })
    } else {
      addBlockGroup({ dates, from, to, reason, repeat })
    }
    toast(dates.length === 1 ? 'היום נחסם.' : `נחסמו ${dates.length} תאריכים.`, { tone: 'success' })
    onDone()
  }

  const clash = collisions(dates, from, to)
  if (!clash.length) {
    save()
    return
  }

  confirmSheet({
    title: 'יש תורים בטווח',
    message:
      `${clash.length} ${clash.length === 1 ? 'תור קיים נופל' : 'תורים קיימים נופלים'} בתוך החסימה. ` +
      'החסימה מונעת הזמנות חדשות אבל לא מבטלת את הקיימים — כדאי להתקשר ללקוחות ולבטל ידנית מהיומן.',
    confirmLabel: 'הבנתי, לחסום בכל זאת',
    onConfirm: save,
  })
}

/* ------------------------------------------------------------------- panel */

export function mountBlocks(root, redraw) {
  const state = {
    mode: 'day',
    date: todayISO(),
    from: '12:00',
    to: '14:00',
    weekdays: [],
    weeks: 2,
    weeklyAllDay: true,
    reason: '',
  }

  const set = (patch) => {
    Object.assign(state, patch)
    draw()
  }

  /* --- the form for whichever mode is selected --- */

  function reasonField() {
    return el('label', { className: 'field' }, [
      el('span', { className: 'field__label', textContent: 'סיבה (לא חובה)' }),
      el('input', {
        className: 'input',
        type: 'text',
        value: state.reason,
        placeholder: 'חופשה, חתונה, קורס…',
        oninput: (e) => {
          state.reason = e.target.value
        },
      }),
    ])
  }

  function dateField(label = 'תאריך') {
    return el('label', { className: 'field' }, [
      el('span', { className: 'field__label', textContent: label }),
      el('input', {
        className: 'input',
        type: 'date',
        value: state.date,
        min: todayISO(),
        onchange: (e) => set({ date: e.target.value || todayISO() }),
      }),
    ])
  }

  function timeField(key, label) {
    return el('label', { className: 'field' }, [
      el('span', { className: 'field__label', textContent: label }),
      el('input', {
        className: 'input',
        type: 'time',
        step: 900,
        value: state[key],
        onchange: (e) => {
          state[key] = e.target.value
        },
      }),
    ])
  }

  function formForMode() {
    if (state.mode === 'day') {
      return [
        el('div', { className: 'form-grid' }, [dateField(), reasonField()]),
        el('p', {
          className: 'field__hint',
          textContent: isClosed(state.date)
            ? 'היום הזה סגור ממילא לפי שעות הפתיחה.'
            : `שעות הפתיחה ביום הזה: ${hoursLabel(state.date)}. החסימה תסגור אותן במלואן.`,
        }),
      ]
    }

    if (state.mode === 'hours') {
      return [
        el('div', { className: 'form-grid' }, [
          dateField(),
          timeField('from', 'משעה'),
          timeField('to', 'עד שעה'),
        ]),
        reasonField(),
      ]
    }

    // weekly
    return [
      el('div', { className: 'field' }, [
        el('span', { className: 'field__label', textContent: 'איזה ימים בשבוע' }),
        el(
          'div',
          { className: 'chips' },
          DAY_NAMES.map((name, day) =>
            el('button', {
              type: 'button',
              className: 'chip',
              textContent: DAY_SHORT[day],
              'aria-label': `יום ${name}`,
              'aria-pressed': String(state.weekdays.includes(day)),
              onclick: () =>
                set({
                  weekdays: state.weekdays.includes(day)
                    ? state.weekdays.filter((d) => d !== day)
                    : [...state.weekdays, day].sort(),
                }),
            }),
          ),
        ),
      ]),
      el('div', { className: 'field' }, [
        el('span', { className: 'field__label', textContent: 'לכמה זמן קדימה' }),
        el(
          'div',
          { className: 'chips' },
          SPANS.map((span) =>
            el('button', {
              type: 'button',
              className: 'chip',
              textContent: span.label,
              'aria-pressed': String(state.weeks === span.weeks),
              onclick: () => set({ weeks: span.weeks }),
            }),
          ),
        ),
      ]),
      el('div', { className: 'field' }, [
        el('span', { className: 'field__label', textContent: 'כמה מהיום' }),
        el('div', { className: 'chips' }, [
          el('button', {
            type: 'button',
            className: 'chip',
            textContent: 'כל היום',
            'aria-pressed': String(state.weeklyAllDay),
            onclick: () => set({ weeklyAllDay: true }),
          }),
          el('button', {
            type: 'button',
            className: 'chip',
            textContent: 'טווח שעות',
            'aria-pressed': String(!state.weeklyAllDay),
            onclick: () => set({ weeklyAllDay: false }),
          }),
        ]),
      ]),
      !state.weeklyAllDay && el('div', { className: 'form-grid' }, [timeField('from', 'משעה'), timeField('to', 'עד שעה')]),
      reasonField(),
      weeklyPreview(),
    ]
  }

  function weeklyPreview() {
    const dates = datesForWeekdays(state.weekdays, state.weeks)
    if (!state.weekdays.length) {
      return el('p', { className: 'field__hint', textContent: 'בחר לפחות יום אחד בשבוע.' })
    }
    return el('p', {
      className: 'field__hint',
      textContent:
        `ייחסמו ${plural(dates.length, 'תאריך אחד', 'תאריכים')}: ` +
        dates.slice(0, 4).map((d) => formatDateHe(d).replace('יום ', '')).join(' · ') +
        (dates.length > 4 ? ` ועוד ${dates.length - 4}` : ''),
    })
  }

  function submit() {
    if (state.mode === 'day') {
      commit({ dates: [state.date], ...FULL_DAY, reason: state.reason, onDone: done })
      return
    }

    if (state.mode === 'hours') {
      if (minutesOf(state.to) <= minutesOf(state.from)) {
        toast('שעת הסיום צריכה להיות אחרי שעת ההתחלה.', { tone: 'error' })
        return
      }
      commit({ dates: [state.date], from: state.from, to: state.to, reason: state.reason, onDone: done })
      return
    }

    if (!state.weekdays.length) {
      toast('בחר לפחות יום אחד בשבוע.', { tone: 'error' })
      return
    }
    if (!state.weeklyAllDay && minutesOf(state.to) <= minutesOf(state.from)) {
      toast('שעת הסיום צריכה להיות אחרי שעת ההתחלה.', { tone: 'error' })
      return
    }
    const window = state.weeklyAllDay ? FULL_DAY : { from: state.from, to: state.to }
    commit({
      dates: datesForWeekdays(state.weekdays, state.weeks),
      ...window,
      reason: state.reason,
      repeat: { weekdays: [...state.weekdays], weeks: state.weeks },
      onDone: done,
    })
  }

  function done() {
    state.reason = ''
    state.weekdays = []
    redraw()
  }

  /* --- the list of blocks already in place --- */

  function describe(row) {
    const allDay = row.from === FULL_DAY.from && row.to === FULL_DAY.to
    const window = allDay ? 'כל היום' : `${row.from}–${row.to}`

    if (row.kind === 'group') {
      const names = row.repeat?.weekdays?.map((d) => `יום ${DAY_NAMES[d]}`).join(', ')
      return {
        what: names ? `${names} — ${window}` : `${plural(row.dates.length, 'תאריך אחד', 'תאריכים')} — ${window}`,
        when: `${plural(row.dates.length, 'תאריך אחד', 'תאריכים')} · ${formatDateHe(row.dates[0])} עד ${formatDateHe(row.dates[row.dates.length - 1])}`,
        dates: row.dates.map((d) => formatDateHe(d).replace('יום ', '')).join(' · '),
      }
    }
    return {
      what: window,
      when: formatDateHe(row.date, { withYear: true }),
      dates: '',
    }
  }

  function blockList() {
    const rows = listBlockRows(todayISO())
    if (!rows.length) {
      return el('div', { className: 'empty' }, [
        icon('calendar', { size: 30 }),
        el('p', { textContent: 'אין חסימות עתידיות. היומן פתוח לפי שעות הפתיחה.' }),
      ])
    }

    return el(
      'div',
      { className: 'rows' },
      rows.map((row) => {
        const d = describe(row)
        return el('div', { className: 'block-row' }, [
          el('span', { className: 'block-row__what', textContent: d.what }),
          el('span', { className: 'block-row__when', textContent: d.when }),
          row.reason && el('span', { className: 'badge badge--cancelled', textContent: row.reason }),
          el(
            'button',
            {
              type: 'button',
              className: 'icon-btn icon-btn--danger',
              'aria-label': 'ביטול החסימה',
              title: 'ביטול החסימה',
              onclick: () => {
                if (row.kind === 'group') removeBlockGroup(row.groupId)
                else removeBlock(row.id)
                toast('החסימה בוטלה.', { tone: 'success' })
                redraw()
              },
            },
            icon('trash', { size: 18 }),
          ),
          d.dates && el('span', { className: 'block-row__dates', textContent: d.dates }),
        ])
      }),
    )
  }

  function draw() {
    render(root, [
      el('div', { className: 'panel' }, [
        el('div', { className: 'panel__head' }, [el('h2', { className: 'panel__title', textContent: 'חסימת זמן' })]),
        el(
          'div',
          { className: 'block-modes' },
          MODES.map((mode) =>
            el(
              'button',
              {
                type: 'button',
                className: 'block-mode',
                'aria-pressed': String(state.mode === mode.id),
                onclick: () => set({ mode: mode.id }),
              },
              [el('b', { textContent: mode.title }), el('span', { textContent: mode.hint })],
            ),
          ),
        ),
        el('div', { className: 'stack' }, formForMode().filter(Boolean)),
        el('div', { className: 'booking__actions' }, [
          el('button', { type: 'button', className: 'btn', onclick: submit }, [
            icon('plus', { size: 18 }),
            'לחסום',
          ]),
        ]),
      ]),
      el('div', { className: 'panel' }, [
        el('div', { className: 'panel__head' }, [
          el('h2', { className: 'panel__title', textContent: 'חסימות פעילות' }),
        ]),
        blockList(),
      ]),
    ])
  }

  draw()
}

/** Shortcut used by the calendar's day panel: block this one day, all of it. */
export function blockWholeDay(iso, redraw) {
  commit({ dates: [iso], ...FULL_DAY, reason: '', onDone: redraw })
}

export { FULL_DAY }
