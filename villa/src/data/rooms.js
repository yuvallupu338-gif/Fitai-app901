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
 * `x`, `y`, `w`, `h` are floor-plan units on a 100 x 70 grid, used by the SVG
 * map and by nothing else — the simulation only ever reads `links`. They are
 * not arbitrary: every pair of rooms in `links` must share an actual wall
 * segment, or the map cannot draw a doorway between them and the plan reads as
 * six sealed boxes. An earlier layout had the bedroom meeting the hall at a
 * single corner point, which is a doorway you cannot draw and a house you
 * cannot walk through. tools/villa-sim.mjs asserts the overlap.
 */

export const ROOMS = [
  {
    id: 'entrance',
    name: 'הכניסה',
    desc: 'מבואה צרה. הטלפון הקווי על השידה, והדלת הכבדה מולך.',
    links: ['hall'],
    x: 0, y: 44, w: 50, h: 26,
    has: ['phone'],
  },
  {
    id: 'hall',
    name: 'המסדרון',
    desc: 'מסדרון ארוך בלי חלונות כמעט. כל דלת בבית נפתחת אליו.',
    links: ['entrance', 'living', 'kitchen', 'bedroom', 'supply'],
    x: 0, y: 30, w: 100, h: 14,
    has: [],
  },
  {
    id: 'living',
    name: 'הסלון',
    desc: 'החלון הגדול תופס קיר שלם. מעבר לו אין כלום שאפשר לראות.',
    links: ['hall', 'kitchen'],
    x: 0, y: 0, w: 44, h: 30,
    has: [],
  },
  {
    id: 'kitchen',
    name: 'המטבח',
    desc: 'ריח של מתכת קרה. הדלת האחורית מובילה לחצר.',
    links: ['hall', 'living'],
    x: 44, y: 0, w: 28, h: 30,
    has: [],
  },
  {
    id: 'bedroom',
    name: 'חדר השינה',
    desc: 'מיטה, ארון, ושידה עם מגירה אחת שנתקעת.',
    links: ['hall'],
    x: 72, y: 0, w: 28, h: 30,
    has: ['drawer'],
  },
  {
    id: 'supply',
    name: 'חדר הציוד',
    desc: 'קרשים מוערמים לקיר, קופסת מסמרים, גלילי סקוץ׳ טייפ ופטיש על הרצפה.',
    links: ['hall'],
    x: 50, y: 44, w: 50, h: 26,
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

/*
 * The wall two rooms share, as a segment, or null if they only touch at a
 * corner. The map draws a doorway across the middle of it; the headless test
 * requires one to exist for every link.
 */
export function sharedWall(a, b) {
  const A = ROOM_BY_ID[a];
  const B = ROOM_BY_ID[b];
  if (!A || !B) return null;

  /* Vertical wall: one room's right edge is the other's left edge. */
  for (const [L, R] of [[A, B], [B, A]]) {
    if (Math.abs((L.x + L.w) - R.x) < 0.001) {
      const y1 = Math.max(L.y, R.y);
      const y2 = Math.min(L.y + L.h, R.y + R.h);
      if (y2 - y1 > 1) return { x1: R.x, y1, x2: R.x, y2, vertical: true };
    }
  }
  /* Horizontal wall: one room's bottom edge is the other's top edge. */
  for (const [T, D] of [[A, B], [B, A]]) {
    if (Math.abs((T.y + T.h) - D.y) < 0.001) {
      const x1 = Math.max(T.x, D.x);
      const x2 = Math.min(T.x + T.w, D.x + D.w);
      if (x2 - x1 > 1) return { x1, y1: D.y, x2, y2: D.y, vertical: false };
    }
  }
  return null;
}
