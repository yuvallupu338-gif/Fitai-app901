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
   * phoneE164 is the number a booking is relayed to over WhatsApp. International
   * form, digits only, no leading + and no dashes:  05X-XXXXXXX → 9725XXXXXXXX */
  phoneE164: '972526564130',
  /** The same number as a person reads it. */
  phoneDisplay: '052-656-4130',

  /* Still missing the house number. Update both of these together, or the map
   * link will point somewhere the text does not.
   * Weizmann is the neighbourhood, not a second street — the map search leaves
   * it out, because a street and a city are what Waze resolves cleanly. */
  address: 'החיד״א, שכונת ויצמן, חדרה',
  /** "Open in maps" link. Any map service URL works; this is a Waze search. */
  mapsUrl: 'https://waze.com/ul?q=%D7%94%D7%97%D7%99%D7%93%D7%90%20%D7%97%D7%93%D7%A8%D7%94',
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
