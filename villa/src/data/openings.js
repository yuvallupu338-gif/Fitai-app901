/*
 * openings.js — everything that can be come through.
 *
 * Two rosters. REGULAR_OPENINGS is the villa's own doors and windows, in a
 * fixed order: night n uses the first n+3 of them. That order is a difficulty
 * curve in itself — night one is four openings in two adjoining rooms, so the
 * player can watch all of them at once and learn what the meters mean, and by
 * night seven they are spread over all six rooms and cannot be.
 *
 * HIDDEN_OPENINGS is the pool the things that should not be there are drawn
 * from. A hidden opening is not a door: some of them cannot be taped at all,
 * because you cannot tape a hole in a floor.
 */

/* `isMain` marks the two openings the spec singles out: leave one of these
 * breached and unattended and the run ends, whatever the danger meter says. */
export const REGULAR_OPENINGS = [
  { id: 'entrance_door',      room: 'entrance', kind: 'door',   isMain: true,
    name: 'דלת הכניסה',            side: 'south', at: 0.5 },
  { id: 'living_window_main', room: 'living',   kind: 'window', isMain: true,
    name: 'החלון הגדול בסלון',      side: 'north', at: 0.5 },
  { id: 'living_door_patio',  room: 'living',   kind: 'door',   isMain: false,
    name: 'דלת המרפסת',            side: 'west',  at: 0.5 },
  { id: 'living_window_side', room: 'living',   kind: 'window', isMain: false,
    name: 'חלון הצד בסלון',         side: 'west',  at: 0.82 },
  { id: 'kitchen_door_back',  room: 'kitchen',  kind: 'door',   isMain: false,
    name: 'הדלת האחורית במטבח',     side: 'north', at: 0.35 },
  { id: 'kitchen_window',     room: 'kitchen',  kind: 'window', isMain: false,
    name: 'חלון המטבח',            side: 'north', at: 0.75 },
  { id: 'bedroom_window',     room: 'bedroom',  kind: 'window', isMain: false,
    name: 'חלון חדר השינה',         side: 'east',  at: 0.4 },
  { id: 'hall_window',        room: 'hall',     kind: 'window', isMain: false,
    name: 'חלון המסדרון',          side: 'east',  at: 0.5 },
  { id: 'kitchen_hatch',      room: 'kitchen',  kind: 'window', isMain: false,
    name: 'צוהר המטבח',            side: 'north', at: 0.92 },
  { id: 'supply_door',        room: 'supply',   kind: 'door',   isMain: false,
    name: 'דלת חדר הציוד',          side: 'east',  at: 0.5 },
];

/*
 * `where` is what the player is told when it is finally seen, and `canTape`
 * is the honest constraint: a crack in a wall takes tape, a gap in a floor or
 * a ceiling takes boards and nothing else. That single flag is what makes the
 * nail count matter on the late nights, when half of what wakes up cannot be
 * papered over.
 */
export const HIDDEN_OPENINGS = [
  { id: 'h_living_floor',   room: 'living',   where: 'floor',
    name: 'סדק ברצפת הסלון',          canTape: false, at: 0.30 },
  { id: 'h_kitchen_ceiling', room: 'kitchen', where: 'ceiling',
    name: 'פתח בתקרת המטבח',          canTape: false, at: 0.55 },
  { id: 'h_hall_wall',      room: 'hall',     where: 'wall',
    name: 'חור בקיר המסדרון',         canTape: true,  at: 0.22 },
  { id: 'h_bedroom_corner', room: 'bedroom',  where: 'corner',
    name: 'הפינה החשוכה בחדר השינה',   canTape: true,  at: 0.7 },
  { id: 'h_living_sofa',    room: 'living',   where: 'furniture',
    name: 'הפתח שמאחורי הספה',        canTape: true,  at: 0.62 },
  { id: 'h_supply_wall',    room: 'supply',   where: 'wall',
    name: 'סדק בקיר חדר הציוד',       canTape: true,  at: 0.4 },
  { id: 'h_hall_floor',     room: 'hall',     where: 'floor',
    name: 'לוח רופף ברצפת המסדרון',    canTape: false, at: 0.78 },
  { id: 'h_bedroom_ceiling', room: 'bedroom', where: 'ceiling',
    name: 'כתם בתקרת חדר השינה',      canTape: false, at: 0.6 },
];

export const HIDDEN_BY_ID = Object.fromEntries(HIDDEN_OPENINGS.map((o) => [o.id, o]));

/* What the player is told when a hidden opening announces itself but has not
 * been found yet. Deliberately about the room, not the spot — finding the spot
 * is what the search is for. */
export const HIDDEN_HINT = {
  floor: 'משהו נשמע מתחת לרצפה',
  ceiling: 'משהו נגרר מעל התקרה',
  wall: 'שריטה איטית בתוך הקיר',
  corner: 'רשרוש מהפינה החשוכה',
  furniture: 'משהו זז מאחורי הרהיטים',
};

/* The six states an opening can be in, in the order the UI ranks them. The
 * player-facing copy lives here rather than in the view, because the text
 * front-end and the HUD have to agree about what "כמעט נפרץ" means. */
export const OPENING_STATES = [
  { id: 'clear',    name: 'בטוח',        at: 0.0 },
  { id: 'pressure', name: 'תחת לחץ',      at: 0.25 },
  { id: 'critical', name: 'כמעט נפרץ',    at: 0.8 },
  { id: 'breached', name: 'נפרץ',         at: 1.0 },
];

/* Barricade state is reported separately from breach state, because "חסום"
 * and "תחת לחץ" are both true of the same opening most of the time. */
export const BARRICADE_STATES = {
  none: 'לא חסום',
  partial: 'חסום חלקית',
  full: 'חסום',
};
