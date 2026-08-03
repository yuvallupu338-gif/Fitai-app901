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
  const ease = EASE[b.ease || clip.ease || 'inOut'] || EASE.inOut;
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

export function pauseAll(v) {
  globalPaused = !!v;
  if (!v) {
    for (const pl of players) pl.last = 0;
    schedule();
  }
}

export { reduceMotion };
