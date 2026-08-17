/**
 * Ron's side of the app: the diary, the list, and the tools that change them.
 *
 * The page is one big redraw — every mutation goes through store.js, and store
 * notifies here, which rebuilds the view from scratch. At the scale of one
 * barber's calendar that is both fast enough and much harder to get wrong than
 * patching the DOM in place.
 */

import { BUSINESS, DAY_SHORT, MONTH_NAMES } from './config.js'
import { SERVICES, serviceById, serviceName } from './services.js'
import {
  addDays,
  availableSlots,
  formatDateHe,
  hoursLabel,
  isClosed,
  isValidISO,
  todayISO,
  toISO,
} from './schedule.js'
import {
  STATUS_LABEL,
  clearAll,
  exportAll,
  importAll,
  isSlotFree,
  listBlocks,
  listBookings,
  removeBooking,
  storageIsPersistent,
  subscribe,
  updateBooking,
  addBooking,
} from './store.js'
import { isUnlocked, unlock, lock, cooldownLeft, sessionHours } from './auth.js'
import {
  el,
  render,
  icon,
  qs,
  toast,
  plural,
  isValidPhone,
  formatPhone,
  toE164Digits,
  downloadText,
} from './ui.js'
import { openSheet, confirmSheet } from './sheet.js'
import { mountBlocks, blockWholeDay, FULL_DAY } from './admin-blocks.js'

const LIVE = (b) => b.status !== 'cancelled'

const state = {
  view: 'calendar',
  month: { y: new Date().getFullYear(), m: new Date().getMonth() },
  selected: todayISO(),
  listTab: 'upcoming',
  query: '',
}

/* ================================================================= the gate */

function mountLock() {
  qs('#lockMark').append(icon('lock', { size: 26 }))

  const form = qs('#lockForm')
  const input = qs('#lockInput')
  const error = qs('#lockError')
  const submit = qs('#lockSubmit')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    error.textContent = ''
    submit.disabled = true
    submit.textContent = 'בודק…'

    // PBKDF2 at 310k iterations takes a beat; yield first so the label paints.
    await new Promise((r) => setTimeout(r, 0))
    const result = await unlock(input.value)

    submit.disabled = false
    submit.textContent = 'כניסה'

    if (result.ok) {
      input.value = ''
      boot()
      return
    }

    input.value = ''
    input.setAttribute('aria-invalid', 'true')
    input.focus()

    if (result.reason === 'cooldown') {
      error.textContent = `יותר מדי ניסיונות. נסה שוב בעוד ${Math.ceil(result.waitMs / 1000)} שניות.`
    } else if (result.reason === 'insecure-context') {
      error.textContent = 'בדיקת הסיסמה דורשת חיבור מאובטח (https או localhost).'
    } else {
      error.textContent = `סיסמה שגויה. נשארו ${result.left} ניסיונות.`
    }
  })

  const wait = cooldownLeft()
  if (wait > 0) {
    error.textContent = `יותר מדי ניסיונות. נסה שוב בעוד ${Math.ceil(wait / 1000)} שניות.`
  }
  input.focus()
}

function boot() {
  qs('#lock').remove()
  qs('#app').hidden = false
  drawBar()
  draw()
  subscribe(draw)
}

/* ================================================================= app bar */

function drawBar() {
  render(qs('#appBar'), [
    el('div', {}, [
      el('span', { className: 'admin-bar__title' }, [
        'יומן ההזמנות',
        el('small', { textContent: 'רון מלכה · ברברשופ' }),
      ]),
    ]),
    el('span', { className: 'admin-bar__spacer' }),
    el('a', { className: 'btn btn--quiet', href: 'index.html' }, 'לאתר'),
    el(
      'button',
      {
        type: 'button',
        className: 'btn btn--ghost',
        onclick: () => {
          lock()
          location.reload()
        },
      },
      [icon('logout', { size: 18 }), 'נעילה'],
    ),
  ])
}

/* ================================================================== stats */

function statsPanel() {
  const bookings = listBookings().filter(LIVE)
  const today = todayISO()
  const weekEnd = addDays(today, 7)

  const todays = bookings.filter((b) => b.date === today)
  const week = bookings.filter((b) => b.date >= today && b.date < weekEnd)
  const revenue = week.reduce((sum, b) => sum + (b.price || 0), 0)

  const tally = new Map()
  for (const b of bookings) tally.set(b.serviceId, (tally.get(b.serviceId) ?? 0) + 1)
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]

  const cards = [
    { label: 'תורים היום', value: String(todays.length), note: todays.length ? `הראשון ב-${todays[0].time}` : 'יום פנוי' },
    { label: 'בשבוע הקרוב', value: String(week.length), note: `עד ${formatDateHe(addDays(today, 6)).replace('יום ', '')}` },
    { label: 'הכנסה צפויה', value: `₪${revenue}`, gold: true, note: 'שבעה ימים קדימה' },
    { label: 'הכי מבוקש', value: top ? serviceName(top[0]) : '—', note: top ? plural(top[1], 'תור אחד', 'תורים') : 'אין נתונים' },
  ]

  return el(
    'div',
    { className: 'stats' },
    cards.map((c) =>
      el('div', { className: 'stat' }, [
        el('span', { className: 'stat__label', textContent: c.label }),
        el('span', { className: `stat__value${c.gold ? ' stat__value--gold' : ''}`, textContent: c.value }),
        el('span', { className: 'stat__note', textContent: c.note }),
      ]),
    ),
  )
}

/* =================================================================== tabs */

function tabs() {
  const upcoming = listBookings().filter((b) => LIVE(b) && b.date >= todayISO()).length
  const items = [
    { id: 'calendar', label: 'יומן', icon: 'calendar' },
    { id: 'list', label: 'רשימת תורים', icon: 'clock', count: upcoming },
    { id: 'blocks', label: 'חסימות', icon: 'lock' },
  ]

  return el(
    'div',
    { className: 'tabs', role: 'tablist' },
    items.map((t) =>
      el(
        'button',
        {
          type: 'button',
          className: 'tab',
          role: 'tab',
          'aria-selected': String(state.view === t.id),
          onclick: () => {
            state.view = t.id
            draw()
          },
        },
        [
          icon(t.icon, { size: 17 }),
          t.label,
          t.count ? el('span', { className: 'tab__count', textContent: String(t.count) }) : null,
        ],
      ),
    ),
  )
}

/* =============================================================== calendar */

function calendarView() {
  const { y, m } = state.month
  const bookings = listBookings().filter(LIVE)
  const blocks = listBlocks()

  const first = new Date(y, m, 1)
  const gridStart = new Date(y, m, 1 - first.getDay())
  const today = todayISO()

  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + i)
    const iso = toISO(date)
    const dayBookings = bookings.filter((b) => b.date === iso)
    const dayBlocks = blocks.filter((b) => b.date === iso)
    const shut = isClosed(iso)

    return el(
      'button',
      {
        type: 'button',
        className: [
          'cal-day',
          date.getMonth() !== m && 'cal-day--outside',
          shut && 'cal-day--shut',
          iso === today && 'cal-day--today',
        ]
          .filter(Boolean)
          .join(' '),
        'aria-pressed': String(state.selected === iso),
        'aria-label': `${formatDateHe(iso)} — ${plural(dayBookings.length, 'תור אחד', 'תורים')}`,
        onclick: () => {
          state.selected = iso
          // Following a click into a neighbouring month should move the view too.
          state.month = { y: date.getFullYear(), m: date.getMonth() }
          draw()
        },
      },
      [
        el('span', { className: 'cal-day__num', textContent: String(date.getDate()) }),
        el('span', { className: 'cal-day__tags' }, [
          dayBookings.length
            ? el('span', { className: 'cal-chip cal-chip--book', textContent: plural(dayBookings.length, 'תור אחד', 'תורים') })
            : null,
          dayBlocks.length ? el('span', { className: 'cal-chip cal-chip--block', textContent: 'חסום' }) : null,
          shut && !dayBlocks.length ? el('span', { className: 'cal-chip cal-chip--shut', textContent: 'סגור' }) : null,
        ]),
      ],
    )
  })

  const shift = (delta) => {
    const d = new Date(y, m + delta, 1)
    state.month = { y: d.getFullYear(), m: d.getMonth() }
    draw()
  }

  return [
    el('div', { className: 'panel' }, [
      el('div', { className: 'cal-nav' }, [
        el(
          'button',
          { type: 'button', className: 'cal-nav__btn', 'aria-label': 'חודש קודם', onclick: () => shift(-1) },
          icon('arrow', { size: 20 }),
        ),
        el('span', { className: 'cal-nav__month', textContent: `${MONTH_NAMES[m]} ${y}` }),
        el(
          'button',
          { type: 'button', className: 'cal-nav__btn cal-nav__btn--next', 'aria-label': 'חודש הבא', onclick: () => shift(1) },
          icon('arrow', { size: 20 }),
        ),
        el('span', { className: 'admin-bar__spacer' }),
        el('button', {
          type: 'button',
          className: 'btn btn--quiet',
          textContent: 'היום',
          onclick: () => {
            const now = new Date()
            state.month = { y: now.getFullYear(), m: now.getMonth() }
            state.selected = todayISO()
            draw()
          },
        }),
      ]),
      el('div', { className: 'cal-grid' }, [
        ...DAY_SHORT.map((d) => el('span', { className: 'cal-dow', textContent: d })),
        ...cells,
      ]),
      el('div', { className: 'cal-legend' }, [
        el('span', {}, [el('i', { className: 'cal-chip--book' }), 'יש תורים']),
        el('span', {}, [el('i', { className: 'cal-chip--block' }), 'חסום ידנית']),
        el('span', {}, [el('i', { className: 'cal-day--shut' }), 'סגור לפי שעות הפתיחה']),
      ]),
    ]),
    agendaPanel(),
  ]
}

/* ---------------------------------------------------------- day agenda */

function agendaPanel() {
  const iso = state.selected
  const dayBookings = listBookings().filter((b) => b.date === iso)
  const dayBlocks = listBlocks().filter((b) => b.date === iso)

  return el('div', { className: 'panel' }, [
    el('div', { className: 'agenda__head' }, [
      el('span', { className: 'agenda__date', textContent: formatDateHe(iso, { withYear: true }) }),
      el('span', { className: 'agenda__hours', textContent: hoursLabel(iso) }),
      el('span', { className: 'agenda__actions' }, [
        el('button', { type: 'button', className: 'btn btn--ghost', onclick: () => openBookingSheet({ date: iso }) }, [
          icon('plus', { size: 17 }),
          'תור חדש',
        ]),
        !dayBlocks.length &&
          el('button', {
            type: 'button',
            className: 'btn btn--quiet',
            textContent: 'לחסום את היום',
            onclick: () => blockWholeDay(iso, draw),
          }),
      ]),
    ]),
    dayBlocks.length
      ? el(
          'div',
          { className: 'rows u-mt' },
          dayBlocks.map((b) =>
            el('div', { className: 'block-row' }, [
              el('span', {
                className: 'block-row__what',
                textContent: b.from === FULL_DAY.from && b.to === FULL_DAY.to ? 'חסום כל היום' : `חסום ${b.from}–${b.to}`,
              }),
              b.reason && el('span', { className: 'block-row__when', textContent: b.reason }),
            ]),
          ),
        )
      : null,
    dayBookings.length
      ? el('div', { className: 'rows u-mt' }, dayBookings.map((b) => bookingRow(b, { showDate: false })))
      : el('div', { className: 'empty u-mt' }, [
          icon('calendar', { size: 30 }),
          el('p', {
            textContent: isClosed(iso) ? 'המספרה סגורה ביום הזה.' : 'אין תורים ביום הזה.',
          }),
        ]),
  ])
}

/* =================================================================== list */

const LIST_TABS = [
  { id: 'today', label: 'היום' },
  { id: 'upcoming', label: 'קרובים' },
  { id: 'past', label: 'עברו' },
  { id: 'all', label: 'הכל' },
]

function filteredBookings() {
  const today = todayISO()
  const q = state.query.trim().toLowerCase()

  let list = listBookings()
  if (state.listTab === 'today') list = list.filter((b) => b.date === today)
  else if (state.listTab === 'upcoming') list = list.filter((b) => b.date >= today)
  else if (state.listTab === 'past') list = list.filter((b) => b.date < today).reverse()

  if (q) {
    list = list.filter((b) =>
      [b.name, b.phone, serviceName(b.serviceId), b.notes].join(' ').toLowerCase().includes(q),
    )
  }
  return list
}

function listView() {
  const list = filteredBookings()

  return el('div', { className: 'panel' }, [
    el('div', { className: 'panel__head' }, [
      el('h2', { className: 'panel__title', textContent: 'רשימת תורים' }),
      el('label', { className: 'searchbox' }, [
        icon('search', { size: 17 }),
        el('input', {
          className: 'input',
          type: 'search',
          value: state.query,
          placeholder: 'חיפוש לפי שם, טלפון או שירות',
          'aria-label': 'חיפוש תורים',
          oninput: (e) => {
            state.query = e.target.value
            draw({ keepFocus: 'search' })
          },
        }),
      ]),
      el('button', { type: 'button', className: 'btn', onclick: () => openBookingSheet({}) }, [
        icon('plus', { size: 17 }),
        'תור חדש',
      ]),
    ]),
    el(
      'div',
      { className: 'tabs', role: 'tablist' },
      LIST_TABS.map((t) =>
        el('button', {
          type: 'button',
          className: 'tab',
          role: 'tab',
          textContent: t.label,
          'aria-selected': String(state.listTab === t.id),
          onclick: () => {
            state.listTab = t.id
            draw()
          },
        }),
      ),
    ),
    list.length
      ? el('div', { className: 'rows' }, list.map((b) => bookingRow(b, { showDate: true })))
      : el('div', { className: 'empty' }, [
          icon('search', { size: 30 }),
          el('p', { textContent: state.query ? 'אין תוצאות לחיפוש הזה.' : 'אין תורים להצגה.' }),
        ]),
  ])
}

/* ============================================================ booking row */

function bookingRow(b, { showDate }) {
  const svc = serviceById(b.serviceId)
  const tools = []

  if (b.status === 'pending') {
    tools.push(
      el(
        'button',
        {
          type: 'button',
          className: 'icon-btn icon-btn--ok',
          title: 'לאשר',
          'aria-label': `לאשר את התור של ${b.name}`,
          onclick: () => updateBooking(b.id, { status: 'confirmed' }),
        },
        icon('check', { size: 18 }),
      ),
    )
  }

  if (b.status === 'confirmed') {
    tools.push(
      el(
        'button',
        {
          type: 'button',
          className: 'icon-btn icon-btn--ok',
          title: 'סמן כבוצע',
          'aria-label': `לסמן כבוצע את התור של ${b.name}`,
          onclick: () => updateBooking(b.id, { status: 'done' }),
        },
        icon('check', { size: 18 }),
      ),
    )
  }

  if (b.status !== 'cancelled') {
    tools.push(
      el(
        'button',
        {
          type: 'button',
          className: 'icon-btn icon-btn--danger',
          title: 'לבטל',
          'aria-label': `לבטל את התור של ${b.name}`,
          onclick: () => updateBooking(b.id, { status: 'cancelled' }),
        },
        icon('close', { size: 18 }),
      ),
    )
  }

  tools.push(
    el(
      'button',
      {
        type: 'button',
        className: 'icon-btn',
        title: 'עריכה',
        'aria-label': `עריכת התור של ${b.name}`,
        onclick: () => openBookingSheet({ booking: b }),
      },
      icon('scissors', { size: 18 }),
    ),
    el(
      'button',
      {
        type: 'button',
        className: 'icon-btn icon-btn--danger',
        title: 'מחיקה',
        'aria-label': `מחיקת התור של ${b.name}`,
        onclick: () =>
          confirmSheet({
            title: 'למחוק את התור?',
            message: `${b.name}, ${formatDateHe(b.date)} ב-${b.time}. אי אפשר לשחזר.`,
            onConfirm: () => {
              removeBooking(b.id)
              toast('התור נמחק.', { tone: 'success' })
            },
          }),
      },
      icon('trash', { size: 18 }),
    ),
  )

  return el('article', { className: `row row--${b.status}` }, [
    el('div', { className: 'row__when' }, [
      el('span', { className: 'row__time', textContent: b.time }),
      showDate ? el('span', { className: 'row__date', textContent: formatDateHe(b.date).replace('יום ', '') }) : null,
    ]),
    el('div', { className: 'row__who' }, [
      el('div', { className: 'row__name' }, [
        b.name,
        el('span', { className: `badge badge--${b.status}`, textContent: STATUS_LABEL[b.status] }),
        b.source === 'admin' ? el('span', { className: 'badge badge--confirmed', textContent: 'ידני' }) : null,
      ]),
      el('div', { className: 'row__meta' }, [
        el('span', { textContent: `${svc?.name ?? serviceName(b.serviceId)} · ${b.durationMin} דק׳ · ₪${b.price}` }),
        el('a', { href: `tel:${b.phone}`, textContent: formatPhone(b.phone) }),
        el('a', {
          href: `https://wa.me/${toE164Digits(b.phone)}?text=${encodeURIComponent(reminderText(b))}`,
          target: '_blank',
          rel: 'noopener noreferrer',
          textContent: 'וואטסאפ',
        }),
      ]),
    ]),
    el('div', { className: 'row__tools' }, tools),
    b.notes ? el('p', { className: 'row__note', textContent: `הערה: ${b.notes}` }) : null,
  ])
}

function reminderText(b) {
  return [
    `היי ${b.name.split(' ')[0]}, כאן ${BUSINESS.name}.`,
    `מזכיר את התור: ${formatDateHe(b.date)} בשעה ${b.time} — ${serviceName(b.serviceId)}.`,
    'נתראה!',
  ].join('\n')
}

/* ========================================================= booking editor */

function openBookingSheet({ booking = null, date = null } = {}) {
  const editing = Boolean(booking)
  const form = {
    name: booking?.name ?? '',
    phone: booking?.phone ?? '',
    serviceId: booking?.serviceId ?? SERVICES[0].id,
    date: booking?.date ?? date ?? todayISO(),
    time: booking?.time ?? '',
    notes: booking?.notes ?? '',
    status: booking?.status ?? 'confirmed',
  }

  const timeSelect = el('select', { className: 'select', 'aria-label': 'שעה' })

  /** Free slots for the chosen day and service, plus the one already booked. */
  function refreshTimes() {
    const svc = serviceById(form.serviceId)
    const free = availableSlots(form.date, svc.durationMin, listBookings(), listBlocks())
    const options = [...new Set([...(editing && booking.date === form.date ? [booking.time] : []), ...free])].sort()

    render(
      timeSelect,
      options.length
        ? options.map((t) => el('option', { value: t, textContent: t, selected: t === form.time }))
        : [el('option', { value: '', textContent: 'אין שעות פנויות ביום הזה' })],
    )
    if (!options.includes(form.time)) form.time = options[0] ?? ''
    timeSelect.value = form.time
  }

  timeSelect.addEventListener('change', (e) => {
    form.time = e.target.value
  })

  const body = () =>
    el('div', { className: 'stack' }, [
      el('label', { className: 'field' }, [
        el('span', { className: 'field__label', textContent: 'שם הלקוח' }),
        el('input', {
          className: 'input',
          type: 'text',
          value: form.name,
          oninput: (e) => {
            form.name = e.target.value
          },
        }),
      ]),
      el('label', { className: 'field' }, [
        el('span', { className: 'field__label', textContent: 'טלפון' }),
        el('input', {
          className: 'input',
          type: 'tel',
          inputMode: 'tel',
          value: form.phone,
          placeholder: '050-123-4567',
          oninput: (e) => {
            form.phone = e.target.value
          },
        }),
      ]),
      el('div', { className: 'form-grid' }, [
        el('label', { className: 'field' }, [
          el('span', { className: 'field__label', textContent: 'שירות' }),
          el(
            'select',
            {
              className: 'select',
              onchange: (e) => {
                form.serviceId = e.target.value
                refreshTimes()
              },
            },
            SERVICES.map((s) =>
              el('option', { value: s.id, textContent: `${s.name} · ₪${s.price}`, selected: s.id === form.serviceId }),
            ),
          ),
        ]),
        el('label', { className: 'field' }, [
          el('span', { className: 'field__label', textContent: 'תאריך' }),
          el('input', {
            className: 'input',
            type: 'date',
            value: form.date,
            onchange: (e) => {
              if (isValidISO(e.target.value)) {
                form.date = e.target.value
                refreshTimes()
              }
            },
          }),
        ]),
        el('label', { className: 'field' }, [
          el('span', { className: 'field__label', textContent: 'שעה' }),
          timeSelect,
        ]),
        el('label', { className: 'field' }, [
          el('span', { className: 'field__label', textContent: 'סטטוס' }),
          el(
            'select',
            {
              className: 'select',
              onchange: (e) => {
                form.status = e.target.value
              },
            },
            Object.entries(STATUS_LABEL).map(([value, label]) =>
              el('option', { value, textContent: label, selected: value === form.status }),
            ),
          ),
        ]),
      ]),
      el('label', { className: 'field' }, [
        el('span', { className: 'field__label', textContent: 'הערה' }),
        el('textarea', {
          className: 'textarea',
          value: form.notes,
          oninput: (e) => {
            form.notes = e.target.value
          },
        }),
      ]),
    ])

  function save(close) {
    if (form.name.trim().length < 2) {
      toast('צריך שם ללקוח.', { tone: 'error' })
      return
    }
    if (!isValidPhone(form.phone)) {
      toast('מספר טלפון לא תקין.', { tone: 'error' })
      return
    }
    if (!form.time) {
      toast('אין שעה פנויה ביום הזה. בחר יום אחר.', { tone: 'error' })
      return
    }

    const svc = serviceById(form.serviceId)
    const free =
      form.status === 'cancelled' ||
      isSlotFree(form.date, form.time, svc.durationMin, { ignoreId: booking?.id ?? null })
    if (!free) {
      toast('השעה הזאת כבר תפוסה.', { tone: 'error' })
      return
    }

    const payload = {
      name: form.name,
      phone: form.phone,
      serviceId: svc.id,
      date: form.date,
      time: form.time,
      durationMin: svc.durationMin,
      price: svc.price,
      notes: form.notes,
      status: form.status,
    }

    try {
      if (editing) updateBooking(booking.id, payload)
      else addBooking({ ...payload, source: 'admin' })
      toast(editing ? 'התור עודכן.' : 'התור נוסף ליומן.', { tone: 'success' })
      close()
    } catch {
      toast('השעה נתפסה בינתיים. נסה שעה אחרת.', { tone: 'error' })
    }
  }

  openSheet({
    title: editing ? 'עריכת תור' : 'תור חדש',
    build: () => {
      const node = body()
      refreshTimes()
      return node
    },
    actions: (close) => [
      el('button', { type: 'button', className: 'btn btn--ghost', textContent: 'ביטול', onclick: close }),
      el('button', { type: 'button', className: 'btn', textContent: 'שמירה', onclick: () => save(close) }),
    ],
  })
}

/* ============================================================ backup tools */

const CSV_COLUMNS = [
  ['תאריך', (b) => b.date],
  ['שעה', (b) => b.time],
  ['שם', (b) => b.name],
  ['טלפון', (b) => formatPhone(b.phone)],
  ['שירות', (b) => serviceName(b.serviceId)],
  ['משך (דק׳)', (b) => b.durationMin],
  ['מחיר', (b) => b.price],
  ['סטטוס', (b) => STATUS_LABEL[b.status] ?? b.status],
  ['הערה', (b) => b.notes],
  ['נוצר', (b) => b.createdAt],
]

/** Quotes a field the way spreadsheets expect, doubling any embedded quote. */
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`

function exportCSV() {
  const rows = [
    CSV_COLUMNS.map(([header]) => csvCell(header)).join(','),
    ...listBookings().map((b) => CSV_COLUMNS.map(([, read]) => csvCell(read(b))).join(',')),
  ]
  // Excel needs the byte-order mark to read the Hebrew as UTF-8.
  downloadText(`tors-${todayISO()}.csv`, `﻿${rows.join('\r\n')}\r\n`, 'text/csv;charset=utf-8')
}

function exportJSON() {
  downloadText(`gibuy-${todayISO()}.json`, JSON.stringify(exportAll(), null, 2), 'application/json')
}

function importJSON() {
  const picker = el('input', { type: 'file', accept: 'application/json,.json', hidden: true })
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0]
    picker.remove()
    if (!file) return
    try {
      const added = importAll(JSON.parse(await file.text()), { mode: 'merge' })
      toast(
        `נוספו ${plural(added.bookings, 'תור אחד', 'תורים')} ו-${plural(added.blocks, 'חסימה אחת', 'חסימות')}.`,
        { tone: 'success' },
      )
    } catch (err) {
      toast(err.message === 'BAD_FORMAT' ? 'הקובץ אינו גיבוי של המערכת הזאת.' : 'לא הצלחתי לקרוא את הקובץ.', {
        tone: 'error',
      })
    }
  })
  document.body.append(picker)
  picker.click()
}

function footer() {
  return el('div', { className: 'admin-foot' }, [
    el('button', { type: 'button', className: 'btn btn--ghost', onclick: exportCSV }, [
      icon('download', { size: 17 }),
      'ייצוא לאקסל (CSV)',
    ]),
    el('button', { type: 'button', className: 'btn btn--quiet', onclick: exportJSON }, [
      icon('download', { size: 17 }),
      'גיבוי מלא',
    ]),
    el('button', { type: 'button', className: 'btn btn--quiet', onclick: importJSON }, [
      icon('upload', { size: 17 }),
      'שחזור מגיבוי',
    ]),
    el('button', {
      type: 'button',
      className: 'btn btn--danger',
      textContent: 'למחוק הכל',
      onclick: () =>
        confirmSheet({
          title: 'למחוק את כל היומן?',
          message: 'כל התורים וכל החסימות יימחקו מהדפדפן הזה. כדאי לעשות גיבוי מלא קודם.',
          confirmLabel: 'כן, למחוק הכל',
          onConfirm: () => {
            clearAll()
            toast('היומן רוקן.', { tone: 'success' })
          },
        }),
    }),
  ])
}

/* ================================================================== redraw */

function draw({ keepFocus = null } = {}) {
  const main = qs('#appMain')
  const caret = keepFocus === 'search' ? main.querySelector('.searchbox .input')?.selectionStart : null

  const blocksHost = el('div')

  render(main, [
    !storageIsPersistent &&
      el('p', { className: 'notice u-mt' }, [
        el('strong', { textContent: 'הדפדפן חוסם שמירה מקומית. ' }),
        'התורים יישמרו רק עד סגירת הלשונית. כדאי לפתוח את היומן בחלון רגיל, לא בגלישה פרטית.',
      ]),
    statsPanel(),
    tabs(),
    ...(state.view === 'calendar' ? calendarView() : state.view === 'list' ? [listView()] : [blocksHost]),
    footer(),
    el('p', {
      className: 'field__hint u-mt',
      textContent: `הכניסה נשמרת ל-${sessionHours} שעות או עד סגירת הלשונית. הנתונים נשמרים בדפדפן הזה בלבד — כדאי לגבות מדי פעם.`,
    }),
  ])

  if (state.view === 'blocks') mountBlocks(blocksHost, draw)

  if (keepFocus === 'search') {
    const box = main.querySelector('.searchbox .input')
    box?.focus()
    if (caret != null) box?.setSelectionRange(caret, caret)
  }
}

/* ==================================================================== boot */

if (isUnlocked()) boot()
else mountLock()
