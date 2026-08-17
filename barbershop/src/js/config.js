/**
 * Everything about the business that a person might want to change lives here.
 * Edit this file and the whole site follows — the hero, the contact card, the
 * opening hours the booking calendar is built from, and the WhatsApp handoff.
 */

export const BUSINESS = {
  name: 'רון מלכה',
  tagline: 'ברברשופ',
  /** Shown under the hero title. One sentence, no more. */
  blurb: 'תספורת שנראית טוב גם ביום השלישי. עבודת מספריים ותער, בלי למהר, בלי לקצר בפינות.',

  /* ------------------------------------------------------------------ contact
   * PHONE_E164 is the number bookings are relayed to over WhatsApp. It must be
   * in international form, digits only, no leading + and no dashes:
   * 05X-XXXXXXX  →  9725XXXXXXXX
   *
   * ⚠️  The value below is a PLACEHOLDER. Replace it with the real number, or
   *     the "send to Ron on WhatsApp" button will lead nowhere. tools/smoke.mjs
   *     warns while it is still unchanged. */
  phoneE164: '972500000000',
  /** The same number as a human reads it. */
  phoneDisplay: '050-000-0000',

  address: 'הרצל 42, תל אביב',
  /** Used for the "open in maps" link. Any map service URL works. */
  mapsUrl: 'https://waze.com/ul?q=%D7%94%D7%A8%D7%A6%D7%9C%2042%20%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91',
  instagramUrl: '',
  email: '',
}

/**
 * Opening hours per weekday, 0 = Sunday … 6 = Saturday.
 * Each day is a list of windows; an empty list closes the day. Two windows make
 * a midday break, and the booking calendar will not offer a slot inside it.
 */
export const HOURS = {
  0: [{ from: '09:00', to: '14:00' }, { from: '15:00', to: '20:00' }],
  1: [{ from: '09:00', to: '14:00' }, { from: '15:00', to: '20:00' }],
  2: [{ from: '09:00', to: '14:00' }, { from: '15:00', to: '20:00' }],
  3: [{ from: '09:00', to: '14:00' }, { from: '15:00', to: '20:00' }],
  4: [{ from: '09:00', to: '14:00' }, { from: '15:00', to: '21:00' }],
  5: [{ from: '08:30', to: '14:00' }],
  6: [],
}

export const BOOKING = {
  /** Slots are offered on this grid, in minutes. 15 gives 09:00, 09:15, 09:30… */
  slotStepMin: 15,
  /** How far ahead the calendar lets a customer book. */
  horizonDays: 30,
  /** A slot closer than this to right now is not offered. */
  leadTimeMin: 60,
  /** Public holidays or one-off closures, as 'YYYY-MM-DD'. */
  closedDates: [],
}

export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
export const MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]
