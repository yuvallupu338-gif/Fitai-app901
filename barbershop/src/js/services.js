/**
 * The price list. `durationMin` is what actually reserves the chair, so it is
 * the number the booking calendar uses to decide which start times still fit.
 *
 * Keep `id` stable once a booking has been made with it — a stored booking
 * refers to the service by id, and an id that no longer resolves shows up as
 * "שירות שהוסר" in the admin table.
 */
export const SERVICES = [
  {
    id: 'cut',
    name: 'תספורת גבר',
    desc: 'מספריים ומכונה, שטיפה וסידור בסוף.',
    durationMin: 30,
    price: 80,
    photo: 'cut-classic',
  },
  {
    id: 'cut-beard',
    name: 'תספורת + זקן',
    desc: 'התספורת המלאה, ועיצוב הזקן בתער אחריה.',
    durationMin: 45,
    price: 110,
    photo: 'cut-beard',
    featured: true,
  },
  {
    id: 'fade',
    name: 'פייד / סקין פייד',
    desc: 'מעבר נקי מהעור כלפי מעלה. עבודה איטית, בלי קפיצות.',
    durationMin: 45,
    price: 100,
    photo: 'cut-fade',
  },
  {
    id: 'beard',
    name: 'עיצוב זקן',
    desc: 'קווים, קיצור וטיפוח — בלי תספורת.',
    durationMin: 20,
    price: 50,
    photo: 'cut-crop',
  },
  {
    id: 'shave',
    name: 'גילוח מגבת חמה',
    desc: 'מגבת חמה, קצף, תער ישר, ובלסם לסיום.',
    durationMin: 40,
    price: 90,
    photo: 'cut-shave',
  },
  {
    id: 'kids',
    name: 'תספורת ילדים',
    desc: 'עד גיל 12, בקצב שלהם.',
    durationMin: 25,
    price: 60,
    photo: 'cut-kids',
  },
]

const BY_ID = new Map(SERVICES.map((s) => [s.id, s]))

/** Returns the service, or undefined for an id that is no longer in the list. */
export function serviceById(id) {
  return BY_ID.get(id)
}

/** The label to print for a booking whose service has since been removed. */
export function serviceName(id) {
  return BY_ID.get(id)?.name ?? 'שירות שהוסר'
}
