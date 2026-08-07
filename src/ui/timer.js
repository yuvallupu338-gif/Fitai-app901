/*
 * timer.js — the rest timer.
 *
 * Every prescription here carries a rest interval and nothing ever counted it:
 * the app told someone to rest three minutes and then left them guessing on a
 * gym floor. There is exactly one timer, it lives on document.body rather than
 * inside the card that started it, and starting another replaces it. Living
 * outside #app is what lets it survive a tab switch, a full re-render and the
 * detail sheet being opened on top of it.
 *
 * Every reading comes off an absolute end timestamp. A locked phone freezes rAF
 * and clamps intervals to a crawl, so a counter that added up elapsed time would
 * come back a minute short at exactly the moment the number has to be trusted.
 */

import { h, announce, reduceMotion } from '../core/dom.js';

const NS = 'http://www.w3.org/2000/svg';

/* sessionStorage, not the app store: a rest interval belongs to the tab you are
   resting in and not to the exported profile, and a backgrounded tab that iOS
   discards and reloads is the case this has to survive. */
const KEY = 'fitai.rest';

const R = 19;                     // ring radius inside the 44-unit box
const CIRC = 2 * Math.PI * R;

/* How long "go" stays up before it becomes "you are late". A prescribed range
   gives the real number — 2–3 דק׳ means sixty seconds of grace — and a single
   value gets half a minute, so a rest that merely ended does not scold someone
   for taking a breath. */
const MIN_GRACE = 30;

/* Past this much overtime nobody is resting any more; they racked the weights
   and walked off, and a countdown nobody dismissed is just clutter. */
const STALE_SEC = 300;

let current = null;   // the one live timer, or null
let ticker = 0;
let alarmId = 0;
let audio = null;
let titleBefore = '';

/**
 * Reads the Hebrew rest text back into seconds — "2–3 דק׳", "90 שנ׳",
 * "60–90 שנ׳". A Prescription carries `rest` as text and not the `restSec` it
 * was built from (see CONTRACTS.md), and the engine is not ours to change, so
 * the text is the interface. A range is two real numbers: the low end is when
 * you MAY start the next set, the high end is when you are late.
 *
 * @returns {{lo:number, hi:number}|null} null for anything unreadable — the
 *          caller then just shows the text, exactly as it did before.
 */
export function parseRest(text) {
  const s = String(text === null || text === undefined ? '' : text);
  const nums = s.match(/\d+/g);
  if (!nums) return null;
  const unit = s.indexOf('דק') >= 0 ? 60 : 1;
  const lo = parseInt(nums[0], 10) * unit;
  const hi = nums.length > 1 ? parseInt(nums[1], 10) * unit : lo;
  if (!(lo >= 5) || lo > 3600) return null;
  return { lo, hi: Math.max(lo, hi) };
}

/**
 * Starts (or replaces) the rest timer.
 * @param {string} text  the prescription's rest, e.g. '90 שנ׳'
 * @param {string} name  Hebrew exercise name, shown so a timer found later on
 *                       the screen still says what it belongs to
 * @returns {boolean} false when the text held no readable interval, so the
 *          caller can keep quiet rather than announce a timer that never ran
 */
export function startRest(text, name) {
  const span = parseRest(text);
  if (!span) return false;
  // Built inside the tap that started the timer. That user gesture is the whole
  // reason the beep later needs no permission and dodges the autoplay block.
  armAudio();
  const now = Date.now();
  run({
    lo: span.lo,
    hi: span.hi,
    text: String(text),
    name: name || '',
    startedAt: now,
    endsAt: now + span.lo * 1000,
    alarmed: false,
  });
  return true;
}

/** Dismiss the timer. Safe to call when none is running. */
export function stopRest() {
  teardown();
  try { window.sessionStorage.removeItem(KEY); } catch (e) { /* nothing to forget */ }
}

/* ------------------------------------------------------------------ *
 * The bar
 * ------------------------------------------------------------------ */

function run(t) {
  teardown();
  current = t;
  current.node = build();
  document.body.appendChild(current.node);
  document.body.classList.add('resting');
  save();
  paint();
  arm();
  // 250ms is four times finer than the display needs, which is what keeps the
  // seconds from visibly stuttering; under reduced motion one tick per second
  // is enough and the ring then steps rather than sweeps.
  ticker = setInterval(paint, reduceMotion.matches ? 1000 : 250);
}

function build() {
  const label = h('div.restlabel');
  // dir=ltr on both readouts: '+30' and '+0:14' are numbers, and a leading plus
  // is a neutral character that an RTL paragraph flips to the far side — the
  // bar came out reading "30+" and "0:14+".
  const time = h('div.resttime', { dir: 'ltr' });
  const ring = makeRing();

  // role="timer" is a live region whose implicit politeness is "off" — said out
  // loud so nobody "fixes" it into aria-live="polite" and makes a screen reader
  // read a new number every second. The moments that matter are announced by
  // hand instead.
  const bar = h('div.restbar', { role: 'timer', 'aria-live': 'off', 'aria-label': 'טיימר מנוחה' },
    h('div.restinner',
      ring.svg,
      h('div.resttext', label, time),
      h('div.restacts',
        h('button.iconbtn.wide', {
          type: 'button', dir: 'ltr', title: 'הוסף 30 שניות', 'aria-label': 'הוסף 30 שניות למנוחה',
          onclick: () => extend(30),
        }, '+30'),
        h('button.iconbtn', {
          type: 'button', title: 'התחל מהתחלה', 'aria-label': 'התחל את המנוחה מהתחלה',
          onclick: () => restart(),
        }, '↺'),
        h('button.iconbtn', {
          type: 'button', title: 'סיים מנוחה', 'aria-label': 'סיים את המנוחה וסגור את הטיימר',
          onclick: () => stopRest(),
        }, '✕'),
      )));

  bar.__label = label;
  bar.__time = time;
  bar.__arc = ring.arc;
  return bar;
}

function makeRing() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'restring');
  svg.setAttribute('viewBox', '0 0 44 44');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const track = document.createElementNS(NS, 'circle');
  const arc = document.createElementNS(NS, 'circle');
  for (const c of [track, arc]) {
    c.setAttribute('cx', '22');
    c.setAttribute('cy', '22');
    c.setAttribute('r', String(R));
  }
  track.setAttribute('class', 'track');
  arc.setAttribute('class', 'arc');
  // Drawn from twelve o'clock; a circle otherwise starts at three.
  arc.setAttribute('transform', 'rotate(-90 22 22)');
  arc.setAttribute('stroke-dasharray', String(CIRC));

  svg.appendChild(track);
  svg.appendChild(arc);
  return { svg, arc };
}

/* ------------------------------------------------------------------ *
 * Ticking
 * ------------------------------------------------------------------ */

function paint() {
  if (!current) return;
  const node = current.node;
  const left = current.endsAt - Date.now();

  if (left > 0) {
    const span = Math.max(1, current.endsAt - current.startedAt);
    tone('run');
    node.__label.textContent = current.name ? `מנוחה · ${current.name}` : `מנוחה ${current.text}`;
    node.__time.textContent = clock(left / 1000, Math.ceil);
    setArc(left / span);
    return;
  }

  if (!current.alarmed) fire();
  const over = Math.floor(-left / 1000);
  const grace = Math.max(current.hi - current.lo, MIN_GRACE);
  const late = over > grace;
  tone(late ? 'late' : 'done');
  node.__label.textContent = late
    ? 'אתה כבר מעבר לזמן המנוחה'
    : 'המנוחה נגמרה — קדימה לסט הבא';
  // Counting up rather than sitting on 0:00: someone who looked away needs to
  // know how long ago it ended, not that it ended.
  node.__time.textContent = `+${clock(over)}`;
  setArc(1);
  if (over > grace + STALE_SEC) stopRest();
}

/* The interval alone would land the alarm up to a second late — a hidden tab
   gets its timers clamped — so the moment gets a timeout of its own. Whichever
   arrives first wins; `alarmed` makes the loser a no-op. */
function arm() {
  clearTimeout(alarmId);
  alarmId = 0;
  const wait = current.endsAt - Date.now();
  if (wait > 0) alarmId = setTimeout(paint, wait + 20);
}

function fire() {
  current.alarmed = true;
  save();
  announce('המנוחה נגמרה');
  try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch (e) { /* no motor */ }
  beep();
  if (document.hidden) flagTitle();
}

function tone(t) {
  current.node.classList.toggle('done', t === 'done');
  current.node.classList.toggle('late', t === 'late');
}

function setArc(frac) {
  const f = Math.max(0, Math.min(1, frac));
  current.node.__arc.setAttribute('stroke-dashoffset', String(CIRC * (1 - f)));
}

function clock(sec, round) {
  const s = Math.max(0, (round || Math.floor)(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

function extend(sec) {
  if (!current) return;
  const now = Date.now();
  if (current.endsAt <= now) {
    // Pressing +30 on a rest that is already over means "give me another
    // thirty", not "the alarm you heard was wrong" — so the count restarts.
    current.startedAt = now;
    current.endsAt = now + sec * 1000;
  } else {
    current.endsAt += sec * 1000;
  }
  current.alarmed = false;
  unflagTitle();
  save();
  arm();
  paint();
  announce(`נוספו ${sec} שניות למנוחה`);
}

function restart() {
  if (!current) return;
  current.startedAt = Date.now();
  current.endsAt = current.startedAt + current.lo * 1000;
  current.alarmed = false;
  unflagTitle();
  save();
  arm();
  paint();
  announce('המנוחה מתחילה מחדש');
}

function teardown() {
  clearInterval(ticker);
  clearTimeout(alarmId);
  ticker = 0;
  alarmId = 0;
  unflagTitle();
  if (current && current.node) current.node.remove();
  current = null;
  if (typeof document !== 'undefined') document.body.classList.remove('resting');
}

/* ------------------------------------------------------------------ *
 * Saying it is up, on a phone that is in a pocket
 * ------------------------------------------------------------------ */

/*
 * Web Audio, on a context built during the starting tap. The beep is a bonus
 * and never the signal — the bar changes colour and the phone buzzes on its own
 * — so every step here is allowed to fail quietly on a device that has no
 * audio, no permission for it, or a muted switch.
 */
function armAudio() {
  if (audio) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try { audio = new Ctx(); } catch (e) { audio = null; }
}

function beep() {
  if (!audio) return;
  try {
    // A context comes back suspended from a backgrounded tab, and resume() then
    // wants a gesture and rejects without one — an unhandled rejection logged
    // for a beep nobody was promised.
    if (audio.state === 'suspended') {
      const resumed = audio.resume();
      if (resumed && resumed.catch) resumed.catch(() => {});
    }
    const t0 = audio.currentTime + 0.02;
    for (let i = 0; i < 3; i++) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 2 ? 1046.5 : 784;   // G5 G5 C6 — rising reads as "finished"
      const at = t0 + i * 0.22;
      // Ramped, not switched: gating a sine with a square edge clicks.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.2);
    }
  } catch (e) { /* silence is survivable */ }
}

/* A phone in a pocket shows no bar and a laptop on another tab shows nothing at
   all. The tab title is the one channel left that costs no permission. Put back
   the moment the tab is looked at again. */
function flagTitle() {
  if (titleBefore || typeof document === 'undefined') return;
  titleBefore = document.title;
  document.title = '● המנוחה נגמרה';
}

function unflagTitle() {
  if (!titleBefore) return;
  document.title = titleBefore;
  titleBefore = '';
}

/* ------------------------------------------------------------------ *
 * Surviving a discarded tab
 * ------------------------------------------------------------------ */

function save() {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({
      lo: current.lo, hi: current.hi, text: current.text, name: current.name,
      startedAt: current.startedAt, endsAt: current.endsAt,
    }));
  } catch (e) { /* private mode: the timer runs, it just will not outlive a reload */ }
}

function restore() {
  let raw = null;
  try { raw = window.sessionStorage.getItem(KEY); } catch (e) { return; }
  if (!raw) return;

  let t = null;
  try { t = JSON.parse(raw); } catch (e) { t = null; }
  const span = t && parseRest(t.text);
  if (!t || !span || !(t.endsAt > 0)) { stopRest(); return; }

  const over = (Date.now() - t.endsAt) / 1000;
  if (over > Math.max(t.hi - t.lo, MIN_GRACE) + STALE_SEC) { stopRest(); return; }
  // Marked as already alarmed when the end has passed: the tab was gone, we
  // cannot know whether it sounded, and a beep out of nowhere on page load is
  // worse than a missed one.
  run({
    lo: span.lo,
    hi: span.hi,
    text: t.text,
    name: t.name || '',
    startedAt: t.startedAt || (t.endsAt - span.lo * 1000),
    endsAt: t.endsAt,
    alarmed: over > 0,
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    // Coming back from a locked screen: repaint off the clock immediately
    // rather than showing whatever the throttled interval last managed.
    unflagTitle();
    paint();
  });
  restore();
}
