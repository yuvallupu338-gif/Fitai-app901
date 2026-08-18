/**
 * The four-step booking flow: service → day → time → details.
 *
 * Only start times that genuinely fit are offered, and the slot is checked
 * again at write time in store.addBooking — two tabs can reach the same 14:00.
 *
 * The confirmation screen is where a local-only booking becomes useful to a real
 * barber: it hands the customer a calendar file and a pre-filled WhatsApp message
 * addressed to the shop. See the README on why that bridge is needed.
 */

import { BUSINESS } from './config.js'
import { SERVICES, serviceById } from './services.js'
import {
  availableSlots,
  formatDateHe,
  fromISO,
  isClosed,
  minutesOf,
  relativeDayHe,
  upcomingDays,
} from './schedule.js'
import { addBooking, listBlocks, listBookings, storageIsPersistent } from './store.js'
import { DAY_SHORT, MONTH_NAMES } from './config.js'
import { el, render, icon, toast, plural, isValidPhone, formatPhone, downloadText } from './ui.js'

const STEPS = [
  { key: 'service', label: 'שירות' },
  { key: 'date', label: 'תאריך' },
  { key: 'time', label: 'שעה' },
  { key: 'details', label: 'פרטים' },
]

const shekel = (n) => `₪${n}`

export function mountBooking(root) {
  const state = {
    step: 0,
    serviceId: null,
    date: null,
    time: null,
    name: '',
    phone: '',
    notes: '',
    booking: null, // set once confirmed
  }

  const service = () => serviceById(state.serviceId)

  function go(step) {
    state.step = step
    draw()
    // Keep the top of the card in view when the step changes, but never yank
    // the page on first paint.
    root.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  /**
   * Picks a service and moves on to the day. Both the buttons in step 1 and the
   * cards in the price list up the page call this — one copy, so the two entry
   * points cannot drift apart on the next change.
   */
  function selectService(id) {
    // Changing the service can invalidate a time already picked, and a service
    // chosen from the price list while the confirmation is showing means the
    // visitor is booking again rather than re-reading the last one.
    if (state.serviceId !== id) state.time = null
    state.serviceId = id
    state.booking = null
    go(1)
    // Arriving from the price list, focus is left far up the page. Move it to
    // the destination — preventScroll, or it would fight go()'s smooth scroll.
    root.querySelector('.day:not([disabled])')?.focus({ preventScroll: true })
  }

  /* ------------------------------------------------------------- step bar */

  function stepBar() {
    return el(
      'div',
      { className: 'steps', role: 'list', 'aria-label': 'שלבי ההזמנה' },
      STEPS.map((s, i) =>
        el(
          'div',
          {
            role: 'listitem',
            className: `step${i === state.step ? ' is-current' : ''}${i < state.step ? ' is-done' : ''}`,
            'aria-current': i === state.step ? 'step' : null,
          },
          [
            el('span', { className: 'step__num' }, i < state.step ? icon('check', { size: 13 }) : String(i + 1)),
            el('span', { className: 'step__label', textContent: s.label }),
          ],
        ),
      ),
    )
  }

  /* ------------------------------------------------------- step 1: service */

  function stepService() {
    return [
      el('h3', { className: 'booking__legend', textContent: 'מה עושים היום?' }),
      el('p', { className: 'booking__hint', textContent: 'הבחירה קובעת כמה זמן נתפס ביומן.' }),
      el(
        'div',
        { className: 'pick-grid' },
        SERVICES.map((s) =>
          el(
            'button',
            {
              type: 'button',
              className: 'pick',
              'aria-pressed': String(state.serviceId === s.id),
              onclick: () => selectService(s.id),
            },
            [
              el('span', { className: 'pick__name', textContent: s.name }),
              el('span', { className: 'pick__meta' }, [
                el('b', { textContent: shekel(s.price) }),
                el('span', { textContent: `${s.durationMin} דק׳` }),
              ]),
            ],
          ),
        ),
      ),
    ]
  }

  /* ---------------------------------------------------------- step 2: day */

  function stepDate() {
    const svc = service()
    const bookings = listBookings()
    const blocks = listBlocks()

    // A day is only offered if this particular service still fits in it. A short
    // beard trim can slot into a gap that a full cut and shave cannot, and today
    // drops out entirely once the last start time has passed.
    const days = upcomingDays().map((day) => {
      const free = day.closed ? 0 : availableSlots(day.iso, svc.durationMin, bookings, blocks).length
      return { ...day, free }
    })

    const anyFree = days.some((d) => d.free > 0)

    return [
      el('h3', { className: 'booking__legend', textContent: 'איזה יום?' }),
      el('p', {
        className: 'booking__hint',
        textContent: `מוצגים רק ימים שבהם עוד נשאר מקום ל${svc.name}. אפשר לגלול הצידה.`,
      }),
      el(
        'div',
        { className: 'daybar', role: 'group', 'aria-label': 'בחירת תאריך' },
        days.map(({ iso, date, closed, free }) => {
          const note = closed ? 'סגור' : free === 0 ? 'מלא' : MONTH_NAMES[date.getMonth()].slice(0, 4)
          return el(
            'button',
            {
              type: 'button',
              className: 'day',
              disabled: free === 0,
              'aria-pressed': String(state.date === iso),
              'aria-label': `${formatDateHe(iso)}${free === 0 ? ` — ${note}` : ` — ${plural(free, 'שעה אחת פנויה', 'שעות פנויות')}`}`,
              onclick: () => {
                if (state.date !== iso) state.time = null
                state.date = iso
                go(2)
              },
            },
            [
              el('span', { className: 'day__dow', textContent: DAY_SHORT[date.getDay()] }),
              el('span', { className: 'day__num', textContent: String(date.getDate()) }),
              el('span', { className: 'day__month', textContent: note }),
            ],
          )
        }),
      ),
      !anyFree &&
        el('p', {
          className: 'empty-slots',
          textContent: `אין תאריך פנוי ל${svc.name} בחודש הקרוב. כדאי להתקשר — לפעמים מתפנה משהו.`,
        }),
      backRow(0),
    ].filter(Boolean)
  }

  /* --------------------------------------------------------- step 3: time */

  /** Morning / afternoon / evening, so a long day is not one wall of buttons. */
  function groupSlots(slots) {
    const groups = [
      { label: 'בוקר', until: 12 * 60, items: [] },
      { label: 'צהריים', until: 17 * 60, items: [] },
      { label: 'ערב', until: Infinity, items: [] },
    ]
    for (const slot of slots) {
      const m = minutesOf(slot)
      groups.find((g) => m < g.until).items.push(slot)
    }
    return groups.filter((g) => g.items.length)
  }

  function stepTime() {
    const svc = service()
    const slots = availableSlots(state.date, svc.durationMin, listBookings(), listBlocks())

    const body = slots.length
      ? groupSlots(slots).map((group) =>
          el('div', { className: 'slots-group' }, [
            el('p', { className: 'slots-group__label', textContent: group.label }),
            el(
              'div',
              { className: 'slots', role: 'group', 'aria-label': `שעות ב${group.label}` },
              group.items.map((slot) =>
                el('button', {
                  type: 'button',
                  className: 'slot',
                  textContent: slot,
                  'aria-pressed': String(state.time === slot),
                  onclick: () => {
                    state.time = slot
                    go(3)
                  },
                }),
              ),
            ),
          ]),
        )
      : [
          el('p', {
            className: 'empty-slots',
            textContent: isClosed(state.date)
              ? 'המספרה סגורה ביום הזה.'
              : `אין שעות פנויות ל${svc.name} ביום הזה. אפשר לנסות יום אחר, או שירות קצר יותר.`,
          }),
        ]

    return [
      el('h3', { className: 'booking__legend', textContent: `שעות פנויות · ${relativeDayHe(state.date)}` }),
      el('p', { className: 'booking__hint', textContent: `${formatDateHe(state.date)} · ${svc.name}, ${svc.durationMin} דק׳` }),
      ...body,
      backRow(1),
    ]
  }

  /* ------------------------------------------------------ step 4: details */

  function summary() {
    const svc = service()
    const rows = [
      ['שירות', svc.name],
      ['תאריך', formatDateHe(state.date)],
      ['שעה', `${state.time} · ${svc.durationMin} דק׳`],
    ]
    return el('dl', { className: 'summary' }, [
      ...rows.map(([label, value]) =>
        el('div', { className: 'summary__row' }, [
          el('dt', { textContent: label }),
          el('dd', { textContent: value }),
        ]),
      ),
      el('div', { className: 'summary__row summary__row--total' }, [
        el('dt', { textContent: 'מחיר' }),
        el('dd', { textContent: shekel(svc.price) }),
      ]),
    ])
  }

  function stepDetails() {
    const nameError = el('span', { className: 'field__error', id: 'nameError' })
    const phoneError = el('span', { className: 'field__error', id: 'phoneError' })

    const nameInput = el('input', {
      className: 'input',
      id: 'bkName',
      type: 'text',
      name: 'name',
      autocomplete: 'name',
      required: true,
      value: state.name,
      'aria-describedby': 'nameError',
      oninput: (e) => {
        state.name = e.target.value
        nameError.textContent = ''
        e.target.setAttribute('aria-invalid', 'false')
      },
    })

    const phoneInput = el('input', {
      className: 'input',
      id: 'bkPhone',
      type: 'tel',
      name: 'phone',
      inputMode: 'tel',
      autocomplete: 'tel',
      placeholder: '050-123-4567',
      required: true,
      value: state.phone,
      'aria-describedby': 'phoneError',
      oninput: (e) => {
        state.phone = e.target.value
        phoneError.textContent = ''
        e.target.setAttribute('aria-invalid', 'false')
      },
    })

    const notesInput = el('textarea', {
      className: 'textarea',
      id: 'bkNotes',
      name: 'notes',
      value: state.notes,
      placeholder: 'משהו שכדאי שרון ידע מראש? (לא חובה)',
      oninput: (e) => {
        state.notes = e.target.value
      },
    })

    function submit(e) {
      e.preventDefault()
      let ok = true

      if (state.name.trim().length < 2) {
        nameError.textContent = 'צריך שם, לפחות שתי אותיות.'
        nameInput.setAttribute('aria-invalid', 'true')
        ok = false
      }
      if (!isValidPhone(state.phone)) {
        phoneError.textContent = 'מספר טלפון ישראלי, למשל 050-123-4567.'
        phoneInput.setAttribute('aria-invalid', 'true')
        ok = false
      }
      if (!ok) {
        ;(nameError.textContent ? nameInput : phoneInput).focus()
        return
      }

      const svc = service()
      try {
        state.booking = addBooking({
          name: state.name,
          phone: state.phone,
          serviceId: svc.id,
          date: state.date,
          time: state.time,
          durationMin: svc.durationMin,
          price: svc.price,
          notes: state.notes,
        })
        go(4)
      } catch (err) {
        if (err.message === 'SLOT_TAKEN') {
          toast('השעה הזאת נתפסה בינתיים. בבקשה בחר שעה אחרת.', { tone: 'error' })
          state.time = null
          go(2)
        } else {
          toast('לא הצלחנו לשמור את התור. אפשר להתקשר במקום.', { tone: 'error' })
        }
      }
    }

    return [
      el('h3', { className: 'booking__legend', textContent: 'הפרטים שלך' }),
      el('p', { className: 'booking__hint', textContent: 'רק שם וטלפון. הטלפון הוא כדי שנוכל לעדכן אם משהו משתנה.' }),
      summary(),
      el('form', { className: 'booking__form', noValidate: true, onsubmit: submit }, [
        el('label', { className: 'field' }, [
          el('span', { className: 'field__label' }, ['שם מלא ', el('span', { className: 'field__req', textContent: '*' })]),
          nameInput,
          nameError,
        ]),
        el('label', { className: 'field' }, [
          el('span', { className: 'field__label' }, ['טלפון ', el('span', { className: 'field__req', textContent: '*' })]),
          phoneInput,
          phoneError,
        ]),
        el('label', { className: 'field' }, [
          el('span', { className: 'field__label', textContent: 'הערה' }),
          notesInput,
        ]),
        el('div', { className: 'booking__actions' }, [
          el('button', { type: 'button', className: 'btn btn--quiet', textContent: 'חזרה', onclick: () => go(2) }),
          el('button', { type: 'submit', className: 'btn btn--lg' }, ['לאשר את התור', icon('check', { size: 18 })]),
        ]),
      ]),
    ]
  }

  /* ------------------------------------------------------------- step 5: done */

  function stepDone() {
    const b = state.booking
    const svc = serviceById(b.serviceId)

    return [
      el('div', { className: 'done' }, [
        el('div', { className: 'done__mark' }, icon('check', { size: 38 })),
        el('h3', { textContent: `נתראה, ${b.name.split(' ')[0]}` }),
        el('p', {
          className: 'done__lead',
          textContent: 'התור נשמר. שני הכפתורים למטה שווים את הקליק — הראשון מכניס אותו ליומן שלך, השני מודיע לרון.',
        }),
        summaryOf(b, svc),
        el('div', { className: 'done__actions' }, [
          el(
            'button',
            {
              type: 'button',
              className: 'btn btn--ghost',
              onclick: () => downloadText(`tor-${b.date}-${b.time.replace(':', '')}.ics`, buildICS(b, svc), 'text/calendar;charset=utf-8'),
            },
            [icon('calendar', { size: 18 }), 'הוספה ליומן'],
          ),
          el(
            'a',
            {
              className: 'btn btn--whatsapp',
              href: whatsappHref(b, svc),
              target: '_blank',
              rel: 'noopener noreferrer',
            },
            [icon('whatsapp', { size: 18 }), 'לשלוח לרון בוואטסאפ'],
          ),
        ]),
        el('div', { className: 'booking__actions' }, [
          el('button', {
            type: 'button',
            className: 'btn btn--quiet',
            textContent: 'להזמין תור נוסף',
            onclick: () => {
              Object.assign(state, { step: 0, serviceId: null, date: null, time: null, notes: '', booking: null })
              draw()
            },
          }),
        ]),
      ]),
    ]
  }

  function summaryOf(b, svc) {
    const rows = [
      ['שירות', svc?.name ?? 'שירות'],
      ['תאריך', formatDateHe(b.date, { withYear: true })],
      ['שעה', `${b.time} · ${b.durationMin} דק׳`],
      ['על שם', `${b.name} · ${formatPhone(b.phone)}`],
    ]
    return el('dl', { className: 'summary' }, [
      ...rows.map(([label, value]) =>
        el('div', { className: 'summary__row' }, [
          el('dt', { textContent: label }),
          el('dd', { textContent: value }),
        ]),
      ),
      el('div', { className: 'summary__row summary__row--total' }, [
        el('dt', { textContent: 'מחיר' }),
        el('dd', { textContent: shekel(b.price) }),
      ]),
    ])
  }

  /* ----------------------------------------------------------------- shell */

  function backRow(target) {
    return el('div', { className: 'booking__actions' }, [
      el('button', { type: 'button', className: 'btn btn--quiet', textContent: 'חזרה', onclick: () => go(target) }),
    ])
  }

  function draw() {
    const body =
      state.step === 0 ? stepService()
      : state.step === 1 ? stepDate()
      : state.step === 2 ? stepTime()
      : state.step === 3 ? stepDetails()
      : stepDone()

    render(root, [
      state.step < 4 && stepBar(),
      el('div', { className: 'booking__body' }, body),
    ])
  }

  draw()

  // Storage can be switched off entirely; say so rather than silently losing a
  // booking the moment the tab closes.
  if (!storageIsPersistent) {
    const notice = document.querySelector('#bookingNotice')
    if (notice) {
      notice.hidden = false
      notice.textContent =
        'הדפדפן חוסם שמירה מקומית, אז תור שתזמין כאן יישמר רק עד סגירת הלשונית. אחרי האישור כדאי לשלוח את ההודעה בוואטסאפ.'
    }
  }

  // The price list drives the flow through this, rather than reaching into it.
  return { selectService }
}

/* ---------------------------------------------------------------- calendar */

const two = (n) => String(n).padStart(2, '0')

/** 'YYYYMMDDTHHMMSS' in local ("floating") time — the wall clock at the shop. */
function icsLocal(iso, minutes) {
  const d = fromISO(iso)
  return (
    `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}` +
    `T${two(Math.floor(minutes / 60))}${two(minutes % 60)}00`
  )
}

const icsEscape = (text) => String(text).replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n')

/**
 * RFC 5545 asks for lines of at most 75 octets, continued with a leading space.
 * Hebrew is two bytes a character, so folding has to count bytes, not characters.
 */
function icsFold(line) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line

  const out = []
  let chunk = ''
  let used = 0
  let limit = 75
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length
    if (used + size > limit) {
      out.push(chunk)
      chunk = ch
      used = size
      limit = 74 // continuation lines lose one octet to the leading space
    } else {
      chunk += ch
      used += size
    }
  }
  out.push(chunk)
  return out.join('\r\n ')
}

export function buildICS(booking, svc) {
  const start = minutesOf(booking.time)
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ron Malka Barbershop//booking//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${booking.id}@ron-malka-barbershop`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsLocal(booking.date, start)}`,
    `DTEND:${icsLocal(booking.date, start + booking.durationMin)}`,
    `SUMMARY:${icsEscape(`${svc?.name ?? 'תור'} · ${BUSINESS.name}`)}`,
    `LOCATION:${icsEscape(BUSINESS.address)}`,
    `DESCRIPTION:${icsEscape(
      `${svc?.name ?? 'תור'} · ${booking.durationMin} דקות · ₪${booking.price}` +
        (booking.notes ? `\nהערה: ${booking.notes}` : ''),
    )}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(`תזכורת: תור אצל ${BUSINESS.name} בעוד שעתיים`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(icsFold).join('\r\n') + '\r\n'
}

/* ---------------------------------------------------------------- whatsapp */

export function whatsappText(booking, svc) {
  return [
    `היי רון, קבעתי תור דרך האתר 👇`,
    '',
    `שם: ${booking.name}`,
    `טלפון: ${formatPhone(booking.phone)}`,
    `שירות: ${svc?.name ?? 'תור'}`,
    `תאריך: ${formatDateHe(booking.date, { withYear: true })}`,
    `שעה: ${booking.time} (${booking.durationMin} דק׳)`,
    `מחיר: ₪${booking.price}`,
    booking.notes ? `הערה: ${booking.notes}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

export function whatsappHref(booking, svc) {
  return `https://wa.me/${BUSINESS.phoneE164}?text=${encodeURIComponent(whatsappText(booking, svc))}`
}
