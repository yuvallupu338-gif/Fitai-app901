/*
 * nights.js — the seven nights, and what is different about each one.
 *
 * The whole difficulty curve is this table. Nothing else in the game branches
 * on the night number, which is deliberate: a difficulty curve spread through
 * six files is one nobody can read, and this one has to be readable because it
 * is the design. Every field here is a promise to the player that the night
 * they are on is different from the one before it in exactly one or two ways
 * they can name.
 *
 * Times are seconds past 3:00:00, because the clock on the HUD is the game and
 * writing 1860 rather than "3:31" once, here, is better than converting in
 * four places.
 */

const M = 60;
const T = (h, m, s = 0) => (h - 3) * 3600 + m * M + s;

export const NIGHTS = [
  {
    n: 1,
    title: 'לילה ראשון',
    /* The whistle starts, the flag appears a minute later, and it is over at
     * 3:35. Every night keeps that last number. */
    start: T(3, 30), flag: T(3, 31), end: T(3, 35),
    speed: 1.00,          /* metres per second while patrolling             */
    huntSpeed: 3.05,
    sight: 22,            /* how far she can see, in metres                 */
    cone: 105,            /* her field of view, in degrees, total           */
    notice: 1.00,         /* multiplier on how fast she fills with suspicion */
    sleepers: 0,          /* neighbours standing in their gardens, asleep    */
    relocate: 0,          /* the flag moves if untouched for this long       */
    entersHouses: false,
    hideTime: 14,         /* seconds you can stay in a wardrobe              */
    note: 'היא איטית, והדגל קרוב. תלמד את הרחוב.',
  },
  {
    n: 2,
    title: 'לילה שני',
    start: T(3, 30), flag: T(3, 31), end: T(3, 35),
    speed: 1.20, huntSpeed: 3.25, sight: 25, cone: 110, notice: 1.10,
    sleepers: 0, relocate: 0, entersHouses: false, hideTime: 14,
    note: 'מהירה ב-20%. הדגל רחוק יותר.',
  },
  {
    n: 3,
    title: 'לילה שלישי',
    start: T(3, 30), flag: T(3, 31), end: T(3, 35),
    speed: 1.30, huntSpeed: 3.45, sight: 26, cone: 115, notice: 1.15,
    /* "Sleeping neighbours": people standing in their own front gardens in the
     * dark, not moving, facing nothing. They block the shortest way through
     * and they wake if you touch them. */
    sleepers: 4, relocate: 0, entersHouses: false, hideTime: 12,
    note: 'יש אנשים בגינות. הם ישנים. אל תיגע בהם.',
  },
  {
    n: 4,
    title: 'לילה רביעי',
    /* She starts two minutes early. The flag still appears at 3:31 and it is
     * still over at 3:35, so this night is not longer — it is two extra
     * minutes of her being outside while you have nothing to go and get. */
    start: T(3, 28), flag: T(3, 31), end: T(3, 35),
    speed: 1.35, huntSpeed: 3.6, sight: 28, cone: 118, notice: 1.2,
    sleepers: 4, relocate: 0, entersHouses: false, hideTime: 12,
    note: 'השריקה מתחילה ב-3:28. הדגל עדיין ב-3:31.',
  },
  {
    n: 5,
    title: 'לילה חמישי',
    start: T(3, 28), flag: T(3, 31), end: T(3, 35),
    speed: 1.45, huntSpeed: 3.8, sight: 29, cone: 120, notice: 1.25,
    sleepers: 6,
    /* If you have not picked it up within a minute it is somewhere else. */
    relocate: 60, entersHouses: false, hideTime: 10,
    note: 'אם לא תיקח אותו תוך דקה — הוא יזוז.',
  },
  {
    n: 6,
    title: 'לילה שישי',
    start: T(3, 28), flag: T(3, 31), end: T(3, 35),
    speed: 1.5, huntSpeed: 3.95, sight: 30, cone: 124, notice: 1.3,
    sleepers: 6, relocate: 60,
    /* Every door in the street is open tonight, including the ones she uses.
     * There is nowhere inside that is safe, which is the point. */
    entersHouses: true, hideTime: 8,
    note: 'הדלתות פתוחות הלילה. כולן.',
  },
  {
    n: 7,
    title: 'לילה שביעי',
    start: T(3, 28), flag: T(3, 31), end: T(3, 35),
    speed: 1.6, huntSpeed: 4.15, sight: 32, cone: 130, notice: 1.4,
    sleepers: 8, relocate: 45, entersHouses: true, hideTime: 8,
    note: 'הלילה האחרון. היא כבר לא מחפשת אותך.',
  },
];

export function nightConfig(n) {
  return NIGHTS[Math.max(1, Math.min(NIGHTS.length, n | 0)) - 1];
}

export const TOTAL_NIGHTS = NIGHTS.length;
