/*
 * rooms.js — the villa, as six rooms and the doorways between them.
 *
 * The layout is hub-and-spoke with one shortcut: the hall touches everything,
 * and the living room opens into the kitchen. That shape is doing real work.
 * The phone is at one end of the house and the equipment room is off the hall,
 * so calling the neighbour costs you two moves away from whatever is being
 * broken, and the shortcut is the only way to cover both of the busy rooms
 * without going back through the middle every time.
 *
 * `x`, `y`, `w`, `h` are floor-plan units, used by the SVG map and by nothing
 * else. The simulation only ever reads `links`.
 */

export const ROOMS = [
  {
    id: 'entrance',
    name: 'הכניסה',
    desc: 'מבואה צרה. הטלפון הקווי על השידה, והדלת הכבדה מולך.',
    links: ['hall'],
    x: 0, y: 34, w: 26, h: 26,
    has: ['phone'],
  },
  {
    id: 'hall',
    name: 'המסדרון',
    desc: 'מסדרון ארוך בלי חלונות כמעט. כל דלת בבית נפתחת אליו.',
    links: ['entrance', 'living', 'kitchen', 'bedroom', 'supply'],
    x: 26, y: 34, w: 48, h: 26,
    has: [],
  },
  {
    id: 'living',
    name: 'הסלון',
    desc: 'החלון הגדול תופס קיר שלם. מעבר לו אין כלום שאפשר לראות.',
    links: ['hall', 'kitchen'],
    x: 0, y: 0, w: 44, h: 34,
    has: [],
  },
  {
    id: 'kitchen',
    name: 'המטבח',
    desc: 'ריח של מתכת קרה. הדלת האחורית מובילה לחצר.',
    links: ['hall', 'living'],
    x: 44, y: 0, w: 30, h: 34,
    has: [],
  },
  {
    id: 'bedroom',
    name: 'חדר השינה',
    desc: 'מיטה, ארון, ושידה עם מגירה אחת שנתקעת.',
    links: ['hall'],
    x: 74, y: 0, w: 26, h: 34,
    has: ['drawer'],
  },
  {
    id: 'supply',
    name: 'חדר הציוד',
    desc: 'קרשים מוערמים לקיר, קופסת מסמרים, גלילי סקוץ׳ טייפ ופטיש על הרצפה.',
    links: ['hall'],
    x: 74, y: 34, w: 26, h: 26,
    has: ['supplies'],
  },
];

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

export const START_ROOM = 'entrance';

/* Breadth-first, because an intruder walking towards the player has to take
 * the doorways rather than the straight line, and because the map is small
 * enough that anything cleverer would be showing off. */
export function nextStepToward(fromId, toId) {
  if (fromId === toId) return fromId;
  const seen = { [fromId]: null };
  const queue = [fromId];
  while (queue.length) {
    const at = queue.shift();
    for (const next of ROOM_BY_ID[at].links) {
      if (next in seen) continue;
      seen[next] = at;
      if (next === toId) {
        let step = next;
        while (seen[step] !== fromId) step = seen[step];
        return step;
      }
      queue.push(next);
    }
  }
  return fromId;
}

export function areAdjacent(a, b) {
  return !!ROOM_BY_ID[a] && ROOM_BY_ID[a].links.indexOf(b) !== -1;
}
