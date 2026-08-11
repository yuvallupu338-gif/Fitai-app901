/*
 * notify.js — the daily reminder.
 *
 * An honest note about what this can and cannot do, because the spec describes
 * a server and this app does not have one.
 *
 * A web page can only show a notification while something of it is alive: the
 * tab, or its service worker woken by a *push* from a server. There is no
 * standard, shipping way for a purely local web app to say "wake me at 08:30
 * tomorrow" (Notification Triggers never shipped beyond a Chrome origin trial).
 * So what runs here is:
 *
 *   - a real timer while the app is open or backgrounded in a live tab, and
 *   - a catch-up check whenever the app becomes visible again, and
 *   - the whole fatigue and scheduling model, which is the part with the
 *     actual product thinking in it, working locally and ready for a push
 *     sender to call instead of the timer.
 *
 * The settings screen says this plainly rather than implying reminders that
 * will not arrive. Promising a notification that never fires is worse than
 * offering none.
 *
 * The ladder is the piece worth reading: instead of one on/off switch, the
 * cadence steps down — automatically when reminders go unopened, and only
 * upwards when the person asks. That is what saves the people who would
 * otherwise turn everything off after a bad week.
 */

import * as store from '../core/store.js';
import { dayKey, partOfDay } from '../core/day.js';
import { SLOTS, pickSlot, learnSlot } from '../engine/bandit.js';

/*
 * Six rungs. Level 0 is one reminder a day; level 5 is silence. Everything in
 * between is a real, usable setting rather than a stop on the way to "off".
 */
export const LADDER = [
  { level: 0, label: 'כל יום', perWeek: 7 },
  { level: 1, label: '4 בשבוע', perWeek: 4 },
  { level: 2, label: 'פעמיים בשבוע', perWeek: 2 },
  { level: 3, label: 'פעם בשבוע', perWeek: 1 },
  { level: 4, label: 'רק ווידג׳ט ומסך הבית', perWeek: 0 },
  { level: 5, label: 'כבוי', perWeek: 0 },
];

export function supported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permission() {
  return supported() ? Notification.permission : 'unsupported';
}

/*
 * Ask the browser.
 *
 * Called only from the screen that explains why first. The browser gives one
 * chance on most platforms, and spending it on a cold prompt is how apps end
 * up with a third of the opt-in rate they could have had.
 */
export async function requestPermission() {
  if (!supported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    store.update((s) => { s.settings.notify.enabled = result === 'granted'; });
    return result;
  } catch (e) {
    return 'denied';
  }
}

/** Which days of the week this ladder level fires on. */
function firesToday(level, day) {
  const perWeek = LADDER[level] ? LADDER[level].perWeek : 0;
  if (perWeek >= 7) return true;
  if (perWeek <= 0) return false;
  /* Spread across the week deterministically from the date, so the same day
   * always answers the same way and a reload cannot produce a second one. */
  const dow = new Date(`${day}T12:00:00`).getDay();
  if (perWeek === 4) return [0, 2, 3, 5].includes(dow);
  if (perWeek === 2) return [0, 3].includes(dow);
  return dow === 0;
}

function inQuietHours(date, cfg) {
  const hour = date.getHours();
  const { quietStart, quietEnd } = cfg;
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return hour >= quietStart && hour < quietEnd;
  return hour >= quietStart || hour < quietEnd;      // window wraps midnight
}

/*
 * When today's reminder should fire.
 *
 * `auto` hands the choice to the send-time bandit, which is learning from
 * something better than open rate — see bandit.js: a reminder that was opened
 * and acted on scores higher than one that was merely opened.
 */
export function plannedTime(now) {
  const s = store.get();
  const cfg = s.settings.notify;
  const base = now ? new Date(now) : new Date();
  let hour = cfg.hour;
  let minute = cfg.minute;
  let slot = null;

  if (cfg.mode === 'auto') {
    slot = pickSlot(s.sendTime, cfg.hour);
    hour = SLOTS[slot].hour;
    minute = SLOTS[slot].minute;
  }

  const at = new Date(base);
  at.setHours(hour, minute, 0, 0);
  return { at, slot };
}

let timer = null;

/*
 * Arm the timer for today, if today is a day this level fires and the reminder
 * has not already gone out.
 *
 * Safe to call repeatedly — every entry point does (load, visibility change,
 * settings save), because that is the only way a timer-based scheduler
 * survives a phone suspending the tab for four hours.
 */
export function schedule() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!supported() || permission() !== 'granted') return null;

  const s = store.get();
  const cfg = s.settings.notify;
  if (!cfg.enabled || cfg.ladder >= 4) return null;

  const today = dayKey();
  if (cfg.lastSentDay === today) return null;
  if (!firesToday(cfg.ladder, today)) return null;

  const { at, slot } = plannedTime();
  const now = new Date();

  /* Already past the hour — but the reminder never went out, because the app
   * was closed. Fire shortly rather than skipping the day: a person who opens
   * the app at 20:00 having missed the 08:30 slot still has an evening. */
  const delay = at > now ? at - now : 90 * 1000;
  if (inQuietHours(new Date(now.getTime() + delay), cfg)) return null;

  timer = setTimeout(() => fire(slot), Math.min(delay, 2 ** 31 - 1));
  return at;
}

/*
 * Show it.
 *
 * The title is the spark itself, not "you have a new spark". That is the whole
 * copy rule for this channel: the notification has to be worth something even
 * if it is never tapped, and a person who reads "ארבע דקות בחוץ" on a lock
 * screen and goes outside has been served perfectly.
 */
async function fire(slot) {
  const entry = store.dayEntry(dayKey());
  if (!entry) return;

  const body = entry.action || entry.body;
  const options = {
    body,
    tag: 'dailyspark-daily',
    dir: 'rtl',
    lang: 'he',
    badge: undefined,
    data: { day: dayKey() },
  };

  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) {
      /* Through the service worker when there is one: only that path supports
       * action buttons, which is what makes "✓ עשיתי" from the lock screen
       * possible at all. */
      await reg.showNotification(entry.title, Object.assign({}, options, {
        actions: [{ action: 'done', title: '✓ עשיתי' }, { action: 'open', title: 'הצג' }],
      }));
    } else {
      const n = new Notification(entry.title, options);
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch (e) {
    return;                              // a failed notification is not an error worth surfacing
  }

  store.update((s) => {
    s.settings.notify.lastSentDay = dayKey();
    if (slot !== null && slot !== undefined) s.sendTime.lastSlot = slot;
    s.settings.notify.unopenedRun = (s.settings.notify.unopenedRun || 0) + 1;
  });

  maybeStepDown();
}

/*
 * Automatic step-down.
 *
 * Three unopened reminders in a row and the cadence drops one rung, without
 * asking. Asking would be the polite-looking choice and the wrong one: the
 * person who is ignoring notifications is by definition not reading a prompt
 * about notifications. They are told in the app, after the fact, where they can
 * put it back.
 */
function maybeStepDown() {
  const s = store.get();
  if ((s.settings.notify.unopenedRun || 0) < 3) return;
  if (s.settings.notify.ladder >= 3) return;
  store.update((st) => {
    st.settings.notify.ladder += 1;
    st.settings.notify.unopenedRun = 0;
    st.settings.notify.autoSteppedDown = true;
  });
}

/*
 * Called when the app is opened. Closes the loop for the send-time bandit and
 * clears the ignored-run counter.
 */
export function registerOpen(acted) {
  const s = store.get();
  const slot = s.sendTime.lastSlot;
  store.update((st) => { st.settings.notify.unopenedRun = 0; });
  if (slot === null || slot === undefined) return;
  store.update((st) => {
    st.sendTime = learnSlot(st.sendTime, slot, acted ? 'acted' : 'opened');
    st.sendTime.lastSlot = null;
  });
}

/** A one-off notification so a person can see what they signed up for. */
export async function sendTest() {
  if (permission() !== 'granted') return false;
  const entry = store.dayEntry(dayKey());
  const title = entry ? entry.title : 'ניצוץ אחד ביום';
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    const options = { body: entry ? entry.action : 'ככה זה ייראה.', dir: 'rtl', lang: 'he', tag: 'dailyspark-test' };
    if (reg && reg.showNotification) await reg.showNotification(title, options);
    else new Notification(title, options);
    return true;
  } catch (e) {
    return false;
  }
}

/** Human description of when the next one is due, for the settings screen. */
export function nextText() {
  const s = store.get();
  const cfg = s.settings.notify;
  if (!supported()) return 'הדפדפן הזה לא תומך בהתראות';
  if (permission() !== 'granted') return 'ההתראות לא אושרו';
  if (!cfg.enabled || cfg.ladder >= 5) return 'כבוי';
  if (cfg.ladder === 4) return 'רק במסך הבית ובווידג׳ט';
  const { at } = plannedTime();
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  const when = cfg.lastSentDay === dayKey() ? 'מחר' : 'היום';
  return `${when} בסביבות ${hh}:${mm}${cfg.mode === 'auto' ? ' · נבחר אוטומטית' : ''}`;
}

/** Part of day right now, exposed so the settings copy can be specific. */
export function currentPart() {
  return partOfDay();
}
