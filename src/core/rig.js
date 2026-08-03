/*
 * rig.js — humanoid stick-rig, forward kinematics + 2-link IK, SVG renderer.
 *
 * COORDINATE SYSTEM
 *   viewBox is always "0 0 100 100". Ground line at y = GROUND.
 *   SVG y grows downward, but ALL ANGLES USE MATH CONVENTION:
 *     0   = pointing right (+X)
 *     90  = pointing up
 *     -90 = pointing down
 *     180 = pointing left
 *   A segment endpoint is  (x + len*cos(a),  y - len*sin(a)).
 *
 * ANGLE CONTINUITY
 *   Interpolation between keyframes is plain linear on the raw numbers.
 *   Keep angles continuous inside a clip: if a limb sits near 180, write
 *   -170 / -160 consistently (or 190 / 200 consistently) — never mix, or
 *   the limb will spin the long way round.
 */

export const SEG = {
  spine: 26,        // pelvis -> neck
  neck: 7,          // neck -> head centre
  headR: 5.6,
  upperArm: 12,
  forearm: 11.5,
  thigh: 15.5,
  shin: 15,
  foot: 6.5,
  shoulderFrac: 0.88, // where the shoulder sits along the spine
};

export const GROUND = 88;

const D2R = Math.PI / 180;

export function project(x, y, len, deg) {
  const r = deg * D2R;
  return [x + len * Math.cos(r), y - len * Math.sin(r)];
}

export function angleOf(ax, ay, bx, by) {
  return Math.atan2(-(by - ay), bx - ax) / D2R;
}

/**
 * Two-link IK. Returns [proximalAngle, distalAngle] in degrees.
 * bend = +1 puts the middle joint counter-clockwise of the root->target line,
 * bend = -1 puts it clockwise. Reach is clamped, never NaN.
 */
export function ik(rootX, rootY, targetX, targetY, l1, l2, bend) {
  const dx = targetX - rootX;
  const dy = targetY - rootY;
  let d = Math.hypot(dx, dy);
  const min = Math.abs(l1 - l2) + 0.001;
  const max = l1 + l2 - 0.001;
  if (d < min) d = min;
  if (d > max) d = max;
  const base = Math.atan2(-dy, dx) / D2R;
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA))) / D2R;
  const p = base + (bend >= 0 ? a : -a);
  const [jx, jy] = project(rootX, rootY, l1, p);
  return [p, angleOf(jx, jy, targetX, targetY)];
}

/* ------------------------------------------------------------------ *
 * Pose -> joint positions
 * ------------------------------------------------------------------ */

/**
 * A pose is a plain object. Every field is optional; defaults come from STAND.
 *
 *   x, y        pelvis position
 *   spine       pelvis -> neck angle (90 = upright)
 *   head        neck -> head angle
 *   armL/armR   [upperArmAngle, forearmAngle]          (FK)
 *   handL/handR {x, y, bend}  -> overrides armL/armR   (IK, preferred)
 *   legL/legR   [thighAngle, shinAngle]                (FK)
 *   footPtL/footPtR {x, y, bend} -> overrides legL/legR (IK)
 *   footL/footR ankle -> toe angle
 *   flip        mirror the whole scene horizontally
 *
 * "L" is the far side (drawn dimmer, behind the torso), "R" is the near side.
 */
export function solve(pose) {
  const p = pose;
  const x = num(p.x, 50);
  const y = num(p.y, 57);
  const spine = num(p.spine, 90);
  const [nx, ny] = project(x, y, SEG.spine, spine);
  const sx = x + (nx - x) * SEG.shoulderFrac;
  const sy = y + (ny - y) * SEG.shoulderFrac;
  const [hx, hy] = project(nx, ny, SEG.neck, num(p.head, spine));

  const out = {
    pelvis: [x, y],
    neck: [nx, ny],
    shoulder: [sx, sy],
    head: [hx, hy],
    arms: {},
    legs: {},
  };

  for (const side of ['L', 'R']) {
    const target = p['hand' + side];
    let a1;
    let a2;
    if (target) {
      [a1, a2] = ik(sx, sy, num(target.x, sx), num(target.y, sy), SEG.upperArm, SEG.forearm, num(target.bend, 1));
    } else {
      const fk = p['arm' + side] || (side === 'L' ? [-84, -86] : [-96, -94]);
      a1 = fk[0];
      a2 = fk[1];
    }
    const [ex, ey] = project(sx, sy, SEG.upperArm, a1);
    const [wx, wy] = project(ex, ey, SEG.forearm, a2);
    out.arms[side] = { shoulder: [sx, sy], elbow: [ex, ey], hand: [wx, wy] };
  }

  for (const side of ['L', 'R']) {
    const target = p['footPt' + side];
    let a1;
    let a2;
    if (target) {
      [a1, a2] = ik(x, y, num(target.x, x), num(target.y, y), SEG.thigh, SEG.shin, num(target.bend, -1));
    } else {
      const fk = p['leg' + side] || (side === 'L' ? [-87, -89] : [-93, -91]);
      a1 = fk[0];
      a2 = fk[1];
    }
    const [kx, ky] = project(x, y, SEG.thigh, a1);
    const [ax, ay] = project(kx, ky, SEG.shin, a2);
    const footAngle = num(p['foot' + side], defaultFoot(a2));
    const [tx, ty] = project(ax, ay, SEG.foot, footAngle);
    out.legs[side] = { hip: [x, y], knee: [kx, ky], ankle: [ax, ay], toe: [tx, ty] };
  }

  return out;
}

function defaultFoot(shinAngle) {
  // Toes point forward, perpendicular-ish to the shin.
  return shinAngle + 90;
}

function num(v, d) {
  return typeof v === 'number' && isFinite(v) ? v : d;
}

/* ------------------------------------------------------------------ *
 * Interpolation
 * ------------------------------------------------------------------ */

export function lerpPose(a, b, t) {
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number') {
      out[k] = va + (vb - va) * t;
    } else if (Array.isArray(va) && Array.isArray(vb)) {
      out[k] = va.map((v, i) => v + ((vb[i] ?? v) - v) * t);
    } else if (va && vb && typeof va === 'object' && typeof vb === 'object') {
      out[k] = {
        x: num(va.x, 0) + (num(vb.x, 0) - num(va.x, 0)) * t,
        y: num(va.y, 0) + (num(vb.y, 0) - num(va.y, 0)) * t,
        bend: num(va.bend, num(vb.bend, 1)),
      };
    } else {
      out[k] = t < 0.5 ? (va !== undefined ? va : vb) : (vb !== undefined ? vb : va);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * SVG rendering
 * ------------------------------------------------------------------ */

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function line(x1, y1, x2, y2, cls, w) {
  return el('line', { x1, y1, x2, y2, class: cls, 'stroke-width': w });
}

/**
 * Builds the static scene chrome (props + ground). Returns a <g>.
 * Props are plain objects — see CONTRACTS.md for the catalogue.
 */
export function renderProps(props, ground) {
  const g = el('g', { class: 'rig-props' });
  if (ground !== false) {
    g.appendChild(el('line', { x1: 2, y1: GROUND, x2: 98, y2: GROUND, class: 'rig-ground', 'stroke-width': 1.1 }));
  }
  for (const p of props || []) {
    switch (p.type) {
      case 'bar': {
        const w = num(p.w, 46);
        g.appendChild(line(p.x - w / 2, p.y, p.x + w / 2, p.y, 'rig-prop', 2));
        if (p.posts !== false) {
          g.appendChild(line(p.x - w / 2, p.y, p.x - w / 2, GROUND, 'rig-prop-thin', 1.2));
          g.appendChild(line(p.x + w / 2, p.y, p.x + w / 2, GROUND, 'rig-prop-thin', 1.2));
        }
        break;
      }
      case 'dipbars': {
        const w = num(p.w, 26);
        const gap = num(p.gap, 7);
        for (const off of [-gap / 2, gap / 2]) {
          g.appendChild(line(p.x - w / 2, p.y + off, p.x + w / 2, p.y + off, 'rig-prop', 1.8));
        }
        g.appendChild(line(p.x - w / 2, p.y, p.x - w / 2, GROUND, 'rig-prop-thin', 1.2));
        g.appendChild(line(p.x + w / 2, p.y, p.x + w / 2, GROUND, 'rig-prop-thin', 1.2));
        break;
      }
      case 'wall':
        g.appendChild(line(p.x, num(p.y0, 6), p.x, num(p.y1, GROUND), 'rig-prop', 2));
        break;
      case 'bench':
      case 'box': {
        const w = num(p.w, 30);
        const h = num(p.h, 6);
        g.appendChild(el('rect', {
          x: p.x - w / 2, y: p.y, width: w, height: h, rx: 1.5, class: 'rig-prop-fill',
        }));
        if (p.type === 'bench' && p.legs !== false) {
          g.appendChild(line(p.x - w / 2 + 3, p.y + h, p.x - w / 2 + 3, GROUND, 'rig-prop-thin', 1.2));
          g.appendChild(line(p.x + w / 2 - 3, p.y + h, p.x + w / 2 - 3, GROUND, 'rig-prop-thin', 1.2));
        }
        break;
      }
      case 'rings': {
        const gap = num(p.w, 15);
        const top = num(p.y0, 8);
        for (const dx of [-gap / 2, gap / 2]) {
          g.appendChild(line(p.x + dx, top, p.x + dx, p.y - 2.4, 'rig-prop-thin', 1.2));
          g.appendChild(el('circle', { cx: p.x + dx, cy: p.y, r: 2.4, class: 'rig-prop-ring' }));
        }
        break;
      }
      case 'band': {
        g.appendChild(el('path', {
          d: `M ${p.x0} ${p.y0} Q ${(p.x0 + p.x1) / 2} ${(p.y0 + p.y1) / 2 + num(p.sag, 4)} ${p.x1} ${p.y1}`,
          class: 'rig-prop-band',
        }));
        break;
      }
      case 'machine': {
        const w = num(p.w, 22);
        const h = num(p.h, 34);
        g.appendChild(el('rect', { x: p.x - w / 2, y: p.y, width: w, height: h, rx: 2, class: 'rig-prop-outline' }));
        break;
      }
      case 'mat': {
        const w = num(p.w, 54);
        g.appendChild(el('rect', { x: p.x - w / 2, y: GROUND - 1.6, width: w, height: 1.6, rx: 0.8, class: 'rig-prop-fill' }));
        break;
      }
      default:
        break;
    }
  }
  return g;
}

function handProp(kind, hand, otherHand) {
  const g = el('g', { class: 'rig-load' });
  const [hx, hy] = hand;
  switch (kind) {
    case 'dumbbell':
      g.appendChild(line(hx - 3.4, hy, hx + 3.4, hy, 'rig-load-bar', 1.4));
      g.appendChild(el('circle', { cx: hx - 3.4, cy: hy, r: 2, class: 'rig-load-fill' }));
      g.appendChild(el('circle', { cx: hx + 3.4, cy: hy, r: 2, class: 'rig-load-fill' }));
      break;
    case 'kettlebell':
      g.appendChild(el('circle', { cx: hx, cy: hy + 4, r: 3.2, class: 'rig-load-fill' }));
      g.appendChild(el('path', { d: `M ${hx - 2} ${hy + 2} L ${hx - 1.4} ${hy - 1} L ${hx + 1.4} ${hy - 1} L ${hx + 2} ${hy + 2}`, class: 'rig-load-bar' }));
      break;
    case 'barbell':
      if (otherHand) {
        const [ox, oy] = otherHand;
        const dx = hx - ox;
        const dy = hy - oy;
        const len = Math.hypot(dx, dy) || 1;
        const ux = (dx / len) * 9;
        const uy = (dy / len) * 9;
        g.appendChild(line(ox - ux, oy - uy, hx + ux, hy + uy, 'rig-load-bar', 1.6));
        g.appendChild(el('circle', { cx: ox - ux, cy: oy - uy, r: 2.6, class: 'rig-load-fill' }));
        g.appendChild(el('circle', { cx: hx + ux, cy: hy + uy, r: 2.6, class: 'rig-load-fill' }));
      }
      break;
    case 'plate':
      g.appendChild(el('circle', { cx: hx, cy: hy, r: 3, class: 'rig-load-outline' }));
      break;
    default:
      return null;
  }
  return g;
}

/**
 * Draws the figure. Far limbs first (dim), then torso, then near limbs.
 */
export function renderFigure(pose) {
  const j = solve(pose);
  const g = el('g', { class: 'rig-figure' });
  const LW = 3.1;

  const limb = (set, cls) => {
    const sub = el('g', { class: cls });
    sub.appendChild(line(...set.a, ...set.b, 'rig-bone', LW));
    sub.appendChild(line(...set.b, ...set.c, 'rig-bone', LW));
    if (set.d) sub.appendChild(line(...set.c, ...set.d, 'rig-bone', LW * 0.72));
    sub.appendChild(el('circle', { cx: set.b[0], cy: set.b[1], r: 1.35, class: 'rig-joint' }));
    return sub;
  };

  const armSet = (s) => ({ a: j.arms[s].shoulder, b: j.arms[s].elbow, c: j.arms[s].hand });
  const legSet = (s) => ({ a: j.legs[s].hip, b: j.legs[s].knee, c: j.legs[s].ankle, d: j.legs[s].toe });

  g.appendChild(limb(legSet('L'), 'rig-far'));
  g.appendChild(limb(armSet('L'), 'rig-far'));

  const torso = el('g', { class: 'rig-near' });
  torso.appendChild(line(j.pelvis[0], j.pelvis[1], j.neck[0], j.neck[1], 'rig-bone rig-spine', LW * 1.25));
  torso.appendChild(el('circle', { cx: j.head[0], cy: j.head[1], r: SEG.headR, class: 'rig-head' }));
  g.appendChild(torso);

  g.appendChild(limb(legSet('R'), 'rig-near'));
  g.appendChild(limb(armSet('R'), 'rig-near'));

  if (pose.load) {
    const l = handProp(pose.load, j.arms.R.hand, j.arms.L.hand);
    if (l) g.appendChild(l);
    if (pose.load !== 'barbell') {
      const l2 = handProp(pose.load, j.arms.L.hand, j.arms.R.hand);
      if (l2) {
        l2.setAttribute('class', 'rig-load rig-far');
        g.insertBefore(l2, g.firstChild);
      }
    }
  }

  return g;
}

/** Full scene: props behind, figure in front, optional horizontal mirror. */
export function renderScene(pose, props, ground) {
  const root = el('g', {});
  if (pose && pose.flip) root.setAttribute('transform', 'translate(100,0) scale(-1,1)');
  root.appendChild(renderProps(props, ground));
  root.appendChild(renderFigure(pose));
  return root;
}

export function makeSvg(cls) {
  return el('svg', {
    viewBox: '0 0 100 100',
    class: cls || 'rig-svg',
    preserveAspectRatio: 'xMidYMid meet',
    'aria-hidden': 'true',
    focusable: 'false',
  });
}
