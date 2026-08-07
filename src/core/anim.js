/*
 * anim.js — clip player.
 *
 * One shared requestAnimationFrame loop drives every mounted player, so a
 * screen full of exercise cards costs one rAF, not thirty. Players only tick
 * while their element is on screen (IntersectionObserver) and the document is
 * visible. `prefers-reduced-motion` freezes every clip on its hero frame.
 *
 * Clip shape — see docs/CONTRACTS.md:
 *   { id, duration, ground, props, hero, keys:[{t, pose, ease}] }
 */

import { makeSvg, renderScene, lerpPose } from './rig.js';
import { EASE } from './poses.js';

/* ------------------------------------------------------------------ *
 * Motion curves
 *
 * EASE (poses.js) holds the four generic curves: linear, in, out, inOut.
 * Every one of them puts its slowest moment at an END of the segment, and
 * that is the whole reason a rig reads as a mannequin being rotated: a lift
 * animated with them accelerates smoothly, decelerates smoothly, and has no
 * weight anywhere in between.
 *
 * The three below are the ones a lift actually needs, and none of them can be
 * built out of the other four no matter how the keys are spaced.
 *
 *   grind      A concentric with a sticking point. Fast out of the bottom
 *              where the stretch reflex helps, slowest through the middle
 *              where the leverage is worst, fast again to lockout. Velocity
 *              ratio is about 4:1 between the ends and the middle.
 *   settle     A lockout that arrives, overshoots by ~4% and settles back.
 *              A loaded bar does not stop dead; the joint stack rebounds.
 *              Do NOT point this at a key whose limbs are pinned to the floor
 *              — the overshoot would drive them through it.
 *   anticipate A move that loads backwards ~4% before it goes. The pull before
 *              a swing, the dip before a jump, the counter-swing of an arm.
 *
 * All three start at 0 and end at 1 exactly, so a clip that ends where it
 * started still loops seamlessly.
 * ------------------------------------------------------------------ */
const TAU = Math.PI * 2;

export const CURVE = Object.assign({}, EASE, {
  grind: (t) => t + 0.62 * Math.sin(TAU * t) / TAU,
  settle: (t) => 1 + 2 * Math.pow(t - 1, 3) + Math.pow(t - 1, 2),
  anticipate: (t) => 2 * t * t * t - t * t,
});

/* ------------------------------------------------------------------ *
 * KEYING A REP
 *
 * Most clips in this app were shaped [rest, far, hold, rest]: out in one
 * straight interpolation, back in one straight interpolation, both the same
 * length. Four things are wrong with that, and all four are visible.
 *
 *  1. Equal halves. A real rep lowers slower than it lifts, about 3:2. Equal
 *     halves is the loudest single tell that a figure is being interpolated
 *     rather than lifting something.
 *  2. No key inside either half, so the whole movement is two straight lines
 *     between three poses. Whatever arc a hand should travel, it does not.
 *  3. No overlap. Every joint leaves and arrives on the same frame, which is
 *     what a rigid object does and not what a body does.
 *  4. Nothing at the ends. A lockout arrives, overshoots by a hair and settles;
 *     a bottom position is held for a beat before it reverses.
 *
 * repKeys() answers all four out of the three poses a clip already carries, so
 * a variant still only states what makes it that variant.
 *
 *   mode  Which half is the CONCENTRIC, because the answer is not the same for
 *         every lift and it decides which half is the fast one. 'lower' (the
 *         default) starts at lockout and goes down first — a push-up, a squat,
 *         a bench press. 'lift' starts at the stretch and pulls first — a row,
 *         a curl, a pull-up, a calf raise, a hip thrust.
 *   lag   Tilts the two derived middle keys a degree or two flatter than the
 *         straight interpolation, holding the spine behind the pelvis: the
 *         shoulders lead going down, the hips lead coming back. Leave it at 0
 *         for anything where the torso does not travel.
 *   arc   Bows the derived hand targets sideways off the chord. A press does
 *         not travel in a straight line between two points and neither does a
 *         row; that bow is the bar path, and two keys can never have one.
 * ------------------------------------------------------------------ */

/* eccentric 46% / hold 10% / concentric 34% / lockout 10% */
const REP_LOWER = { mid1: 0.26, far: 0.46, hold: 0.56, mid2: 0.74, home: 0.9 };
/* concentric 34% / squeeze 12% / eccentric 46% / reset 8% */
const REP_LIFT = { mid1: 0.2, far: 0.34, hold: 0.46, mid2: 0.72, home: 0.92 };

/** Displace a pose's hand targets perpendicular to the a -> b hand travel. */
function bow(pose, a, b, amount) {
  if (!amount) return pose;
  const out = Object.assign({}, pose);
  for (const k of ['handL', 'handR']) {
    const p0 = a[k];
    const p1 = b[k];
    const cur = pose[k];
    if (!p0 || !p1 || !cur) continue;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    out[k] = { x: cur.x - (dy / len) * amount, y: cur.y + (dx / len) * amount, bend: cur.bend };
  }
  return out;
}

/** Flatten a pose's spine by `deg`, carrying the head with it. */
function tilt(pose, deg) {
  if (!deg) return pose;
  return Object.assign({}, pose, {
    spine: (pose.spine === undefined ? 90 : pose.spine) - deg,
    head: (pose.head === undefined ? 90 : pose.head) - deg,
  });
}

/**
 * Build the seven keys of one rep from three poses.
 * `rest` is the t:0 / t:1 pose, `far` the other end, `hold` the settled version
 * of `far` (pass null to reuse `far`).
 */
export function repKeys(rest, far, hold, opts) {
  const o = opts || {};
  const lift = o.mode === 'lift';
  const T = lift ? REP_LIFT : REP_LOWER;
  const parked = hold || far;
  const lag = o.lag || 0;
  const arc = o.arc || 0;
  const out = bow(tilt(lerpPose(rest, far, lift ? 0.52 : 0.55), lag), rest, far, arc);
  const back = bow(tilt(lerpPose(parked, rest, lift ? 0.55 : 0.5), lag * 1.6), parked, rest, arc);
  return [
    { t: 0, pose: rest },
    // `grind` puts the slowest moment in the MIDDLE of the drive, where the
    // leverage is worst — the one place none of in/out/inOut can put it.
    { t: T.mid1, pose: out, ease: lift ? 'grind' : 'in' },
    { t: T.far, pose: far, ease: lift ? 'settle' : 'out' },
    { t: T.hold, pose: parked },
    { t: T.mid2, pose: back, ease: lift ? 'in' : 'grind' },
    { t: T.home, pose: rest, ease: lift ? 'out' : 'settle' },
    { t: 1, pose: rest },
  ];
}

const players = new Set();
let rafId = 0;
let globalPaused = false;

const reduceMotion = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

let io = null;
function observer() {
  if (io || typeof IntersectionObserver === 'undefined') return io;
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const pl = e.target.__player;
      if (pl) pl.visible = e.isIntersecting;
    }
  }, { rootMargin: '120px 0px' });
  return io;
}

function tick(now) {
  rafId = 0;
  let any = false;
  for (const pl of players) {
    if (pl.dead) continue;
    any = true;
    if (!pl.visible || globalPaused || pl.paused) {
      pl.last = now;
      continue;
    }
    const dt = pl.last ? Math.min(now - pl.last, 120) : 16;
    pl.last = now;
    pl.time = (pl.time + dt * pl.speed) % pl.clip.duration;
    pl.draw(pl.time / pl.clip.duration);
  }
  if (any && !reduceMotion.matches) rafId = requestAnimationFrame(tick);
}

function schedule() {
  if (!rafId && !reduceMotion.matches) rafId = requestAnimationFrame(tick);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    globalPaused = document.hidden;
    if (!globalPaused) {
      for (const pl of players) pl.last = 0;
      schedule();
    }
  });
}

/** Sample a clip at normalised time u in [0,1). */
export function sampleClip(clip, u) {
  const keys = clip.keys;
  if (!keys || !keys.length) return {};
  if (keys.length === 1) return keys[0].pose;
  const t = ((u % 1) + 1) % 1;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1] || keys[0];
  const span = (b.t <= a.t ? 1 + b.t : b.t) - a.t;
  const local = span <= 0 ? 0 : (t - a.t) / span;
  const ease = CURVE[b.ease || clip.ease || 'inOut'] || CURVE.inOut;
  return lerpPose(a.pose, b.pose, ease(Math.max(0, Math.min(1, local))));
}

/**
 * Mount a clip into `host`. Returns a controller.
 * opts: { speed, paused, label }
 */
export function mountClip(host, clip, opts) {
  const o = opts || {};
  host.innerHTML = '';
  const svg = makeSvg('rig-svg');
  host.appendChild(svg);

  if (o.label) {
    host.setAttribute('role', 'img');
    host.setAttribute('aria-label', o.label);
  }

  const pl = {
    clip,
    host,
    svg,
    time: (clip.hero || 0) * clip.duration,
    last: 0,
    speed: o.speed || 1,
    paused: !!o.paused,
    visible: true,
    dead: false,
    draw(u) {
      const pose = sampleClip(clip, u);
      const scene = renderScene(pose, clip.props, clip.ground);
      if (svg.firstChild) svg.replaceChild(scene, svg.firstChild);
      else svg.appendChild(scene);
    },
  };

  pl.draw(pl.time / clip.duration);

  if (reduceMotion.matches) {
    pl.paused = true;
    return controller(pl);
  }

  host.__player = pl;
  const ob = observer();
  if (ob) {
    pl.visible = false;
    ob.observe(host);
  }
  players.add(pl);
  schedule();
  return controller(pl);
}

function controller(pl) {
  return {
    play() { pl.paused = false; pl.last = 0; schedule(); },
    pause() { pl.paused = true; },
    toggle() { pl.paused ? this.play() : this.pause(); return !pl.paused; },
    get playing() { return !pl.paused; },
    setSpeed(s) { pl.speed = s; },
    seek(u) { pl.time = u * pl.clip.duration; pl.draw(u); },
    destroy() {
      pl.dead = true;
      players.delete(pl);
      const ob = observer();
      if (ob) ob.unobserve(pl.host);
      delete pl.host.__player;
    },
  };
}

/** Render a single frame with no animation — used for print/export. */
export function staticFrame(clip, u) {
  const svg = makeSvg('rig-svg');
  svg.appendChild(renderScene(sampleClip(clip, u === undefined ? (clip.hero || 0.5) : u), clip.props, clip.ground));
  return svg;
}

/*
 * Whether motion is switched off right now — either by the app's own control or
 * by the OS setting. The filmed demos need this: an animated WebP cannot be
 * paused from script the way the rig can, so the card renders the rig instead
 * while motion is off, which honours the control rather than ignoring it.
 */
export function motionOff() {
  return globalPaused || reduceMotion.matches;
}

export function pauseAll(v) {
  globalPaused = !!v;
  if (!v) {
    for (const pl of players) pl.last = 0;
    schedule();
  }
}

export { reduceMotion };
