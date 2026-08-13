/* main.js — אניגמה.
 *
 * Everything here is an enhancement over a page that already reads without it:
 * the copy, the four rooms, the clues and the whole booking form are in the
 * HTML. What JS adds is the clock, the lock, and the things that move.
 */

import { initNav } from './nav.js';
import { initClock } from './clock.js';
import { initReveal, initCounters } from './reveal.js';
import { initDisclosures } from './disclosure.js';
import { initRooms } from './rooms.js';
import { initLock } from './lock.js';
import { initBooking } from './booking.js';

initNav();
initClock();
initReveal();
initCounters();
initDisclosures();
initRooms();
initLock();
initBooking();
