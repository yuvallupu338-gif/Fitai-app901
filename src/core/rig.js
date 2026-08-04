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
 *   spread      0 = profile (default). Above 0 the figure turns to FACE the
 *               viewer: shoulders and hips separate horizontally and the limb
 *               angles are read in the frontal plane. Use it for movements the
 *               profile view collapses — lateral raises, reverse flyes, upright
 *               rows, grip width. Around 13 is a natural shoulder width.
 *
 * "L" is the far side (drawn dimmer, behind the torso), "R" is the near side.
 * At spread > 1 neither is further away, so both draw in the near tone.
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

  /*
   * spread — how far apart the two sides sit, measured across the spine.
   *
   * At 0 the shoulders coincide and the hips coincide, which is what a body
   * looks like in profile and is what every clip written before this assumed.
   * Above 0 the figure turns to face the viewer: the sides separate and the
   * limbs swing in the FRONTAL plane instead of the sagittal one.
   *
   * That second camera is not decoration. Side-on, a lateral raise and a front
   * raise trace the same arc, both arms of a reverse fly overlap into one, and
   * a wide grip is indistinguishable from a narrow one — the differences that
   * define those exercises all live in the plane the profile view collapses.
   */
  const spread = Math.max(0, num(p.spread, 0));
  /*
   * The separation is HORIZONTAL ON SCREEN, not perpendicular to the spine.
   * Bending forward rotates the body in the sagittal plane — the plane the
   * camera is looking down — so on screen the two shoulders stay side by side.
   * Rotating the offset with the spine instead made a bent-over reverse fly
   * separate diagonally, which is a body twisting, not a body hinging.
   */
  const offX = spread / 2;
  const sgn = (side) => (side === 'R' ? 1 : -1);

  const out = {
    pelvis: [x, y],
    neck: [nx, ny],
    shoulder: [sx, sy],
    head: [hx, hy],
    spread,
    arms: {},
    legs: {},
  };

  for (const side of ['L', 'R']) {
    const rx = sx + offX * sgn(side);
    const ry = sy;
    const target = p['hand' + side];
    let a1;
    let a2;
    if (target) {
      [a1, a2] = ik(rx, ry, num(target.x, rx), num(target.y, ry), SEG.upperArm, SEG.forearm, num(target.bend, 1));
    } else {
      const fk = p['arm' + side] || (side === 'L' ? [-84, -86] : [-96, -94]);
      a1 = fk[0];
      a2 = fk[1];
    }
    const [ex, ey] = project(rx, ry, SEG.upperArm, a1);
    const [wx, wy] = project(ex, ey, SEG.forearm, a2);
    out.arms[side] = { shoulder: [rx, ry], elbow: [ex, ey], hand: [wx, wy] };
  }

  for (const side of ['L', 'R']) {
    // Hips separate less than the shoulders, which is what makes a torso a
    // torso rather than a rectangle.
    const hipX = x + offX * sgn(side) * 0.62;
    const hipY = y;
    const target = p['footPt' + side];
    let a1;
    let a2;
    if (target) {
      [a1, a2] = ik(hipX, hipY, num(target.x, hipX), num(target.y, hipY), SEG.thigh, SEG.shin, num(target.bend, -1));
    } else {
      const fk = p['leg' + side] || (side === 'L' ? [-87, -89] : [-93, -91]);
      a1 = fk[0];
      a2 = fk[1];
    }
    const [kx, ky] = project(hipX, hipY, SEG.thigh, a1);
    const [ax, ay] = project(kx, ky, SEG.shin, a2);
    const footAngle = num(p['foot' + side], defaultFoot(a2));
    const [tx, ty] = project(ax, ay, SEG.foot, footAngle);
    out.legs[side] = { hip: [hipX, hipY], knee: [kx, ky], ankle: [ax, ay], toe: [tx, ty] };
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
/* ------------------------------------------------------------------ *
 * Body shape
 *
 * The skeleton is still lines and angles, but the figure drawn over it has
 * volume: every segment is a tapered capsule, thick at the proximal joint and
 * narrower at the distal one, which is what makes a limb read as an arm rather
 * than a stick. Widths are in the same 0..100 units as the segments.
 * ------------------------------------------------------------------ */

export const GIRTH = {
  neck: 3.4,
  shoulder: 10.4,      // full width across the deltoids
  chest: 9.6,
  waist: 6.8,
  hip: 8.2,
  upperArm: 3.9, elbow: 2.9, wrist: 2.2,
  thigh: 6.2, knee: 4.2, ankle: 2.8,
  foot: 2.6,
  headRx: 4.1, headRy: 4.9,
  deltoid: 5.0,
};

/** A tapered capsule from A to B: straight sides, round caps at both ends. */
function capsule(ax, ay, bx, by, wa, wb) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 0.0001;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const ra = Math.max(0.15, wa / 2);
  const rb = Math.max(0.15, wb / 2);
  const p = (x, y) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  // Both caps sweep the same way (0) because we travel down one side and back
  // up the other; see the note in the commit that introduced this.
  return `M ${p(ax + nx * ra, ay + ny * ra)}`
    + ` L ${p(bx + nx * rb, by + ny * rb)}`
    + ` A ${rb.toFixed(2)} ${rb.toFixed(2)} 0 0 0 ${p(bx - nx * rb, by - ny * rb)}`
    + ` L ${p(ax - nx * ra, ay - ny * ra)}`
    + ` A ${ra.toFixed(2)} ${ra.toFixed(2)} 0 0 0 ${p(ax + nx * ra, ay + ny * ra)} Z`;
}

/** Torso: hips to shoulders, pinched at the waist. `spread` widens it, because
    a chest seen head-on is broader than the same chest seen edge-on. */
function torsoPath(pelvis, shoulder, spread) {
  const [px, py] = pelvis;
  const [sx, sy] = shoulder;
  const dx = sx - px;
  const dy = sy - py;
  const len = Math.hypot(dx, dy) || 0.0001;
  const nx = -(dy / len);
  const ny = dx / len;

  const at = (t, w) => {
    const cx = px + dx * t;
    const cy = py + dy * t;
    return [[cx + nx * w / 2, cy + ny * w / 2], [cx - nx * w / 2, cy - ny * w / 2]];
  };
  const w = Math.max(0, spread || 0);
  const hipW = GIRTH.hip + w * 0.45;
  const shoulderW = GIRTH.shoulder + w * 0.6;
  const hip = at(0, hipW);
  const waist = at(0.42, GIRTH.waist + w * 0.3);
  const chest = at(0.78, GIRTH.chest + w * 0.5);
  const top = at(1, shoulderW);
  const p = (q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`;

  return `M ${p(hip[0])}`
    + ` Q ${p(waist[0])} ${p(chest[0])}`
    + ` L ${p(top[0])}`
    + ` A ${(shoulderW / 2).toFixed(2)} ${(shoulderW / 2).toFixed(2)} 0 0 0 ${p(top[1])}`
    + ` L ${p(chest[1])}`
    + ` Q ${p(waist[1])} ${p(hip[1])}`
    + ` A ${(hipW / 2).toFixed(2)} ${(hipW / 2).toFixed(2)} 0 0 0 ${p(hip[0])} Z`;
}

function path(d, cls) {
  return el('path', { d, class: cls });
}

/**
 * Draws the figure. Far limbs first in a recessed tone, then the torso and
 * head, then the near limbs — so the body reads with depth instead of as a
 * flat tangle of lines.
 */
export function renderFigure(pose) {
  const j = solve(pose);
  const g = el('g', { class: 'rig-figure' });

  const arm = (s, cls) => {
    const a = j.arms[s];
    const sub = el('g', { class: cls });
    // A deltoid cap where the arm meets the torso. Without it the upper arm
    // appears to sprout from the middle of the chest.
    sub.appendChild(el('circle', {
      cx: a.shoulder[0], cy: a.shoulder[1], r: GIRTH.deltoid / 2, class: 'rig-body',
    }));
    sub.appendChild(path(capsule(...a.shoulder, ...a.elbow, GIRTH.upperArm, GIRTH.elbow), 'rig-body'));
    // Joint cap: fills the notch the two capsules leave when the limb is
    // sharply bent, so the elbow reads as a hinge rather than a break.
    sub.appendChild(el('circle', { cx: a.elbow[0], cy: a.elbow[1], r: GIRTH.elbow / 2, class: 'rig-body' }));
    sub.appendChild(path(capsule(...a.elbow, ...a.hand, GIRTH.elbow, GIRTH.wrist), 'rig-body'));
    sub.appendChild(el('circle', { cx: a.hand[0], cy: a.hand[1], r: GIRTH.wrist * 0.72, class: 'rig-body' }));
    return sub;
  };

  const leg = (s, cls) => {
    const l = j.legs[s];
    const sub = el('g', { class: cls });
    sub.appendChild(path(capsule(...l.hip, ...l.knee, GIRTH.thigh, GIRTH.knee), 'rig-body'));
    sub.appendChild(el('circle', { cx: l.knee[0], cy: l.knee[1], r: GIRTH.knee / 2, class: 'rig-body' }));
    sub.appendChild(path(capsule(...l.knee, ...l.ankle, GIRTH.knee, GIRTH.ankle), 'rig-body'));
    sub.appendChild(el('circle', { cx: l.ankle[0], cy: l.ankle[1], r: GIRTH.ankle / 2, class: 'rig-body' }));
    sub.appendChild(path(capsule(...l.ankle, ...l.toe, GIRTH.ankle * 0.9, GIRTH.foot * 0.7), 'rig-body'));
    return sub;
  };

  // Facing the viewer, the far side is not further away — it is the other half
  // of a symmetrical body, and dimming it would say the lateral raise is being
  // done with one arm. The outline stroke still separates overlapping limbs.
  const farClass = j.spread > 1 ? 'rig-near' : 'rig-far';
  g.appendChild(leg('L', farClass));
  g.appendChild(arm('L', farClass));

  const torso = el('g', { class: 'rig-near' });
  torso.appendChild(path(capsule(j.shoulder[0], j.shoulder[1], j.neck[0], j.neck[1], GIRTH.neck * 1.3, GIRTH.neck), 'rig-body'));
  torso.appendChild(path(torsoPath(j.pelvis, j.shoulder, j.spread), 'rig-body rig-torso'));
  const headAngle = 90 - angleOf(j.neck[0], j.neck[1], j.head[0], j.head[1]);
  torso.appendChild(el('ellipse', {
    cx: j.head[0], cy: j.head[1], rx: GIRTH.headRx, ry: GIRTH.headRy,
    transform: `rotate(${headAngle.toFixed(1)} ${j.head[0].toFixed(2)} ${j.head[1].toFixed(2)})`,
    class: 'rig-body rig-head',
  }));
  g.appendChild(torso);

  g.appendChild(leg('R', 'rig-near'));
  g.appendChild(arm('R', 'rig-near'));

  if (pose.load) {
    // loadSide: 'R' | 'L' puts the implement in ONE hand. A suitcase carry
    // loaded on both sides is a farmer carry, and the asymmetry the exercise
    // exists to train is gone.
    const side = pose.loadSide;
    if (side !== 'L') {
      const l = handProp(pose.load, j.arms.R.hand, j.arms.L.hand);
      if (l) g.appendChild(l);
    }
    if (pose.load !== 'barbell' && side !== 'R') {
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
