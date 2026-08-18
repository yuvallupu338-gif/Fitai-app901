/**
 * Assembles the customer page from the data in config.js and services.js.
 *
 * The marketing copy is in the HTML; everything here is the part that has to
 * stay in step with the price list and the opening hours.
 *
 * Nothing runs on import — `mountSite()` is called by whichever entry point
 * loaded it, so the same module serves the served pages and the single-file
 * build without either one guessing at the other's DOM.
 */

import { BUSINESS, HOURS, DAY_NAMES } from './config.js'
import { SERVICES } from './services.js'
import { hoursLabel, todayISO, toISO, fromISO } from './schedule.js'
import { el, render, icon, qs, observeReveals } from './ui.js'
import { mountGallery } from './gallery.js'
import { mountBooking } from './booking.js'

/* ---------------------------------------------------------------- contact */

function hoursCard() {
  const today = fromISO(todayISO()).getDay()
  const rows = DAY_NAMES.map((name, day) => {
    // Build a real date that falls on this weekday, so hoursLabel sees the same
    // day the table is describing.
    const probe = new Date()
    probe.setDate(probe.getDate() + ((day - probe.getDay() + 7) % 7))
    const label = HOURS[day]?.length ? hoursLabel(toISO(probe)) : 'סגור'
    return el('tr', { className: day === today ? 'is-today' : '' }, [
      el('th', { scope: 'row', textContent: `יום ${name}` }),
      el('td', { className: label === 'סגור' ? 'is-closed' : '', textContent: label }),
    ])
  })

  return el('div', { className: 'contact__card' }, [
    el('h3', {}, [icon('clock', { size: 20 }), 'שעות פתיחה']),
    el('table', { className: 'hours-table' }, [el('tbody', {}, rows)]),
  ])
}

function reachCard() {
  const lines = [
    el('li', {}, [
      el('a', { href: `tel:+${BUSINESS.phoneE164}` }, [icon('phone', { size: 18 }), BUSINESS.phoneDisplay]),
    ]),
    el('li', {}, [
      el('a', { href: BUSINESS.mapsUrl, target: '_blank', rel: 'noopener noreferrer' }, [
        icon('pin', { size: 18 }),
        BUSINESS.address,
      ]),
    ]),
    BUSINESS.instagramUrl &&
      el('li', {}, [
        el('a', { href: BUSINESS.instagramUrl, target: '_blank', rel: 'noopener noreferrer' }, [
          icon('instagram', { size: 18 }),
          'אינסטגרם',
        ]),
      ]),
  ].filter(Boolean)

  return el('div', { className: 'contact__card' }, [
    el('h3', {}, [icon('pin', { size: 20 }), 'איך מגיעים']),
    el('ul', { className: 'contact__lines' }, lines),
  ])
}

function bookCard() {
  return el('div', { className: 'contact__card' }, [
    el('h3', {}, [icon('calendar', { size: 20 }), 'לתפוס תור']),
    el('p', {
      textContent: 'הכי מהר זה דרך האתר — רואים מיד מה פנוי, בלי טלפונים ובלי לחכות לתשובה.',
    }),
    el('a', { className: 'btn btn--block u-mt', href: '#booking' }, 'להזמנת תור'),
  ])
}

/* -------------------------------------------------------------------- mount */

export function mountSite() {
  /* The booking flow mounts first: the price list below hands work to it, so
   * its handle has to exist before those cards are built. */
  const booking = mountBooking(qs('#bookingCard'))

  /* --- hero --- */
  qs('#brandMark').append(icon('scissors', { size: 20 }))
  qs('#heroBlurb').textContent = BUSINESS.blurb

  render(
    qs('#heroFacts'),
    [
      ['pin', BUSINESS.address],
      ['clock', `היום ${hoursLabel(todayISO())}`],
      ['phone', BUSINESS.phoneDisplay],
    ].map(([name, text]) => el('li', { className: 'hero__fact' }, [icon(name, { size: 17 }), text])),
  )

  /* --- services --- */
  render(
    qs('#serviceList'),
    SERVICES.map((s) =>
      el('article', { className: `service${s.featured ? ' service--featured' : ''}` }, [
        s.featured && el('span', { className: 'service__flag', textContent: 'הכי מבוקש' }),
        el('div', { className: 'service__head' }, [el('h3', { className: 'service__name', textContent: s.name })]),
        el('p', { className: 'service__desc', textContent: s.desc }),
        el('div', { className: 'service__meta' }, [
          el('span', { className: 'service__price', textContent: `₪${s.price}` }),
          el('span', { className: 'service__duration' }, [icon('clock', { size: 15 }), `${s.durationMin} דק׳`]),
          el(
            'button',
            {
              type: 'button',
              className: 'service__cta',
              // Named per service: six buttons all called "book" tell a screen
              // reader running through them nothing about which is which.
              'aria-label': `לקבוע תור ל${s.name}`,
              onclick: () => booking.selectService(s.id),
            },
            ['לקבוע תור', icon('arrow', { size: 15 })],
          ),
        ]),
      ]),
    ),
  )

  /* --- about --- */
  render(
    qs('#aboutList'),
    [
      'תור אחד בכל פעם — בלי חפיפות ובלי המתנה בעמידה.',
      'מספריים ותער, לא רק מכונה.',
      'ילדים מגיל 3, בלי לחץ ובלי הבטחות שווא.',
      'תיקון חינם עד שבוע, אם משהו לא יושב נכון.',
    ].map((text) => el('li', {}, [icon('check', { size: 17 }), el('span', { textContent: text })])),
  )

  /* --- contact and footer --- */
  render(qs('#contactGrid'), [hoursCard(), reachCard(), bookCard()])
  qs('#footerCopy').textContent = `© ${new Date().getFullYear()} ${BUSINESS.name} ברברשופ · ${BUSINESS.address}`

  /* --- interactive --- */
  mountGallery(qs('#galleryGrid'))
  observeReveals()

  /* One observer on a sentinel beats a scroll listener: the header solidifies
   * once the hero's top edge leaves, and the floating button appears at the same
   * point but hides again while the booking card itself is on screen. */
  const header = qs('#siteHeader')
  const fab = qs('#bookFab')
  const bookingSection = qs('#booking')

  const sentinel = el('div', { className: 'scroll-sentinel', 'aria-hidden': 'true' })
  document.body.prepend(sentinel)

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      ([entry]) => {
        header.classList.toggle('is-stuck', !entry.isIntersecting)
        fab.classList.toggle('is-shown', !entry.isIntersecting)
      },
      { rootMargin: '-120px 0px 0px 0px' },
    ).observe(sentinel)

    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) fab.classList.remove('is-shown')
    }, { threshold: 0.15 }).observe(bookingSection)
  }
}
