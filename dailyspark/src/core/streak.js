/*
 * streak.js — the no-guilt streak.
 *
 * Three decisions separate this from the streak that makes people delete
 * habit apps.
 *
 * 1. It counts showing up, not succeeding. Opening the app is enough. A person
 *    who reads the spark and decides today is not the day has still done the
 *    thing the streak is there to encourage, and punishing that teaches them to
 *    avoid the app on exactly the days it might have helped.
 *
 * 2. Missed days are absorbed silently by a freeze allowance, and the person is
 *    told afterwards. Warning someone that their streak is *about to* break is
 *    the mechanic this product exists to reject: it converts a gentle habit into
 *    a debt.
 *
 * 3. When the allowance runs out the streak resets without commentary. No red,
 *    no "you lost 23 days", no offer to buy it back. The number simply starts
 *    again, and the book — which is the real record — is untouched.
 */

import { dayKey, daysBetween, shiftKey } from './day.js';
import * as store from './store.js';

const MONTHLY_FREEZES = 2;

function monthOf(key) {
  return key.slice(0, 7);
}

/*
 * Refill the freeze allowance when the month turns.
 *
 * Stored as a month stamp rather than a timer so that it is correct after the
 * app has been closed for six weeks, which a countdown would not be.
 */
function refreshAllowance(streak, today) {
  const month = monthOf(today);
  if (streak.freezeMonth !== month) {
    streak.freezeMonth = month;
    streak.freezesLeft = MONTHLY_FREEZES;
  }
}

/*
 * Register that the app was opened today.
 *
 * Returns a small report the UI uses to decide whether to say anything:
 *   { changed, current, longest, usedFreeze, coveredDays, reset }
 *
 * The UI only speaks when `usedFreeze` or `reset` is set — a streak that simply
 * continued needs no announcement.
 */
export function registerOpen(today) {
  const day = today || dayKey();
  const report = { changed: false, usedFreeze: false, coveredDays: 0, reset: false };

  store.update((s) => {
    const streak = s.streak;
    refreshAllowance(streak, day);

    if (streak.lastDay === day) {
      report.current = streak.current;
      report.longest = streak.longest;
      return;
    }

    if (!streak.lastDay) {
      streak.current = 1;
    } else {
      const gap = daysBetween(streak.lastDay, day);
      if (gap === 1) {
        streak.current += 1;
      } else if (gap > 1) {
        const missed = gap - 1;
        if (missed <= streak.freezesLeft) {
          /* Absorb the gap. The streak keeps counting through the covered days
           * so the number matches the calendar the person remembers. */
          streak.freezesLeft -= missed;
          streak.current += gap;
          report.usedFreeze = true;
          report.coveredDays = missed;
          for (let i = 1; i <= missed; i += 1) {
            streak.frozenDays.push(shiftKey(day, -i));
          }
          if (streak.frozenDays.length > 60) {
            streak.frozenDays = streak.frozenDays.slice(-60);
          }
        } else {
          streak.current = 1;
          report.reset = true;
        }
      }
      /* gap <= 0 means the clock moved backwards — a timezone change or a
       * device with the wrong date. Leave the streak alone rather than
       * rewarding or punishing something the person did not do. */
    }

    streak.lastDay = day;
    if (streak.current > streak.longest) streak.longest = streak.current;
    report.changed = true;
    report.current = streak.current;
    report.longest = streak.longest;
  });

  return report;
}

/** Milestones worth a moment. Small list on purpose — confetti stops meaning anything at the fifth party. */
const MILESTONES = [7, 30, 100, 365];

export function milestoneFor(current) {
  return MILESTONES.includes(current) ? current : null;
}

export function summary() {
  const s = store.get().streak;
  return {
    current: s.current,
    longest: s.longest,
    freezesLeft: s.freezesLeft,
    frozen: new Set(s.frozenDays),
  };
}
