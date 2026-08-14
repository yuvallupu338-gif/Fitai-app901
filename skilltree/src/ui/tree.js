/*
 * tree.js — the interactive skill graph.
 *
 * This is the screen the product is about, so it is worth stating what it does
 * and does not do.
 *
 * It does: pan by drag, zoom by wheel and pinch, click to open a skill,
 * hover/focus to light the whole dependency chain in both directions, keyboard
 * navigation between nodes, and a fit-to-view that actually frames the graph.
 *
 * It does not: re-render on pan or zoom. Nodes are built once when the tree or
 * the learner's progress changes, and panning writes a single CSS transform on
 * the container. That is the difference between smooth at 300 nodes and not,
 * and it is why the node elements are kept in a Map rather than rebuilt from
 * state each frame (§54).
 *
 * Highlighting is likewise a class toggle on the container plus a class on the
 * lit nodes — not 300 inline style writes.
 */

import { h, svg, clear, qsa } from '../core/dom.js';
import { icon } from './icons.js';
import { getIndex, getLayout } from '../data/catalog.js';
import { statusOf, STATUS, readiness } from '../domain/unlock.js';
import { skillProgress } from '../domain/levels.js';
import { skillCapacity } from '../domain/xp.js';
import { ancestorsOf, descendantsOf } from '../domain/graph.js';

const MIN_SCALE = 0.28;
const MAX_SCALE = 1.9;

/*
 * The scale below which node labels stop being readable.
 *
 * Labels are 11.5px, so anything under about 0.8 turns them into grey smudges.
 * This matters because a true fit-to-bounds on a 33-skill tree lands around
 * 0.36 on a laptop: the whole graph is technically visible and none of it can
 * be read, with half the canvas empty because the tree is far wider than it is
 * tall. That is a worse first impression than showing part of a legible tree.
 */
const READABLE_SCALE = 0.8;

/**
 * Mount the tree into `host`.
 *
 * Returns a handle with `focusSkill`, `refresh` and `destroy` so the screen
 * around it can drive it — opening a skill from search, for instance — without
 * this module knowing anything about the rest of the app.
 */
export function mountTree(host, opts) {
  const { treeId, state, onSelect, goalPath = [] } = opts;
  const index = getIndex(treeId);
  const layout = getLayout(treeId);
  if (!index || !layout) return null;

  const goalSet = new Set(goalPath);
  const progressOf = (id) => state.skills[id];

  const canvas = h('div.tree-canvas');
  const viewport = h('div.tree-viewport', canvas);
  const shell = h('div.tree-shell', viewport);

  /* ---- edges ---- */

  const PAD = 90;
  const width = layout.bounds.maxX - layout.bounds.minX + PAD * 2;
  const height = layout.bounds.maxY - layout.bounds.minY + PAD * 2;
  const ox = PAD - layout.bounds.minX;
  const oy = PAD - layout.bounds.minY;

  const pos = new Map(layout.nodes.map((n) => [n.id, { x: n.x + ox, y: n.y + oy }]));

  const edgeLayer = svg('svg.tree-edges', { width, height, viewBox: `0 0 ${width} ${height}` });
  const edgeEls = new Map();

  for (const edge of layout.edges) {
    const a = pos.get(edge.from);
    const b = pos.get(edge.to);
    if (!a || !b) continue;

    /* A cubic with horizontal control points. Straight lines between nodes in
     * different rows cross each other into an unreadable mess; the curve makes
     * the branch structure legible, which is the entire reason the tree is a
     * graph and not a list. */
    const dx = Math.max(40, (b.x - a.x) * 0.5);
    const path = svg('path.tree-edge', {
      d: `M ${a.x + 26} ${a.y} C ${a.x + 26 + dx} ${a.y}, ${b.x - 26 - dx} ${b.y}, ${b.x - 26} ${b.y}`,
    });

    /* A met prerequisite is drawn in the accent — so the route you have
     * already walked is visible as a lit path through the tree. */
    const fromLevel = state.skills[edge.from]?.level || 0;
    if (fromLevel >= (edge.minLevel ?? 1)) path.classList.add('met');

    edgeLayer.appendChild(path);
    if (!edgeEls.has(edge.to)) edgeEls.set(edge.to, []);
    if (!edgeEls.has(edge.from)) edgeEls.set(edge.from, []);
    edgeEls.get(edge.to).push({ el: path, from: edge.from, to: edge.to });
    edgeEls.get(edge.from).push({ el: path, from: edge.from, to: edge.to });
  }
  canvas.appendChild(edgeLayer);

  /* ---- nodes ---- */

  const nodeEls = new Map();

  for (const node of layout.nodes) {
    const p = pos.get(node.id);
    const status = statusOf(index, node.id, progressOf);
    const progress = state.skills[node.id];
    const el = buildNode(node.skill, status, progress, goalSet.has(node.id));

    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;

    el.addEventListener('click', () => onSelect(node.id));
    el.addEventListener('pointerenter', () => light(node.id));
    el.addEventListener('pointerleave', () => unlight());
    el.addEventListener('focus', () => light(node.id));
    el.addEventListener('blur', () => unlight());

    canvas.appendChild(el);
    nodeEls.set(node.id, el);
  }

  /* ---- highlighting ---- */

  let litIds = null;

  function light(skillId) {
    const up = ancestorsOf(index, skillId);
    const down = descendantsOf(index, skillId);
    const set = new Set([...up, ...down, skillId]);
    litIds = set;

    canvas.classList.add('focusing');
    for (const [id, el] of nodeEls) el.classList.toggle('lit', set.has(id));

    for (const list of edgeEls.values()) {
      for (const edge of list) {
        edge.el.classList.toggle('lit', set.has(edge.from) && set.has(edge.to));
      }
    }
  }

  function unlight() {
    if (!litIds) return;
    litIds = null;
    canvas.classList.remove('focusing');
    for (const el of nodeEls.values()) el.classList.remove('lit');
    for (const list of edgeEls.values()) for (const edge of list) edge.el.classList.remove('lit');
  }

  /* ---- viewport transform ----
   *
   * One source of truth (scale, tx, ty) written to a single transform. Nothing
   * else moves; no node has its position recalculated when the view changes. */

  let scale = 0.72;
  let tx = 0;
  let ty = 0;
  let frame = null;

  function paint() {
    frame = null;
    canvas.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
  }

  function schedule() {
    /* Coalesce to one write per animation frame. A pointermove can fire many
     * times between frames and each one writing a transform is wasted layout. */
    if (frame === null) frame = window.requestAnimationFrame(paint);
  }

  /*
   * Keep the graph in the frame.
   *
   * Without this you can pan into empty space in every direction, and — more
   * visibly — centring on a node near the top of the graph leaves the upper
   * half of the canvas blank while the rest of the tree runs off the bottom.
   * That was the state of the tree screen on a phone: a correct centring on
   * the right node, and 300px of nothing above it.
   *
   * So: when the scaled graph is larger than the viewport, the translation is
   * clamped so its edges cannot come further inside than a small margin; when
   * it is smaller, it is centred outright. The margin is deliberate slack —
   * being unable to nudge a node away from the very edge feels stuck.
   */
  function clampPan() {
    const box = shell.getBoundingClientRect();
    if (!box.width || !box.height) return;

    /*
     * Clamp against where the nodes actually are, not against the canvas.
     *
     * The canvas carries PAD of empty space on every side, and the layout
     * centres short columns against the tallest one, so its bounding box is
     * considerably larger than the region containing anything. Clamping to the
     * canvas therefore still permitted ~90px of guaranteed emptiness at an
     * edge — which on a phone is a fifth of the visible height.
     *
     * The node region in canvas coordinates is inset by exactly PAD.
     */
    const margin = 48;
    const left = PAD * scale;
    const right = (width - PAD) * scale;
    const top = PAD * scale;
    const bottom = (height - PAD) * scale;

    const contentW = right - left;
    const contentH = bottom - top;

    tx = contentW <= box.width - margin
      ? (box.width - contentW) / 2 - left
      : Math.min(margin - left, Math.max(box.width - margin - right, tx));

    ty = contentH <= box.height - margin
      ? (box.height - contentH) / 2 - top
      : Math.min(margin - top, Math.max(box.height - margin - bottom, ty));
  }

  function setScale(next, originX, originY) {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    if (clamped === scale) return;

    /* Zoom about a point: keep the graph coordinate under the cursor fixed,
     * otherwise the view drifts toward the origin on every wheel tick and the
     * user has to chase it. */
    const gx = (originX - tx) / scale;
    const gy = (originY - ty) / scale;
    scale = clamped;
    tx = originX - gx * scale;
    ty = originY - gy * scale;
    clampPan();
    schedule();
  }

  /* A true fit-to-bounds. What the Fit control does, and what a small tree
   * gets on open. */
  function fit() {
    const box = shell.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const ideal = Math.min(box.width / width, box.height / height, 1) * 0.94;
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, ideal));
    tx = (box.width - width * scale) / 2;
    ty = (box.height - height * scale) / 2;
    schedule();
  }

  /*
   * The opening view — and it is deliberately not always a fit.
   *
   * Fitting a 33-skill tree into a laptop needs about 0.36, and into a phone
   * about 0.13. At either the labels are unreadable, and because these trees
   * are far wider than they are tall, the fitted view also leaves most of the
   * canvas empty. The learner's first impression of the core screen is then a
   * small grey smear in the middle of a lot of nothing.
   *
   * So: fit when the whole graph fits legibly, and otherwise open at a
   * readable scale centred on the node that matters — what they last practised,
   * or what they can start. The tree then opens on "here is where you are",
   * and the Fit control is one click away for the overview.
   */
  function frameView() {
    const box = shell.getBoundingClientRect();
    if (!box.width || !box.height) return;

    const ideal = Math.min(box.width / width, box.height / height, 1) * 0.94;
    if (ideal >= READABLE_SCALE) { fit(); return; }

    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, READABLE_SCALE));
    const anchor = focalPoint();
    if (anchor) { centreOn(anchor, null, 0.34); return; }

    tx = (box.width - width * scale) / 2;
    ty = (box.height - height * scale) / 2;
    schedule();
  }

  /*
   * The node worth opening on: whatever was last practised, else the furthest
   * along, else the first thing that can be started. Falls back to nothing for
   * an untouched tree, where centring the roots is right anyway.
   */
  function focalPoint() {
    if (opts.focusId && pos.has(opts.focusId)) return opts.focusId;

    let best = null;
    let bestAt = -1;
    for (const [id] of pos) {
      const p = state.skills[id];
      if (p && (p.lastPracticedAt || 0) > bestAt) { bestAt = p.lastPracticedAt || 0; best = id; }
    }
    if (best) return best;

    for (const node of layout.nodes) {
      if (statusOf(index, node.id, progressOf) === STATUS.AVAILABLE) return node.id;
    }
    return null;
  }

  /*
   * Put a node at a chosen point in the viewport.
   *
   * `biasX` defaults to dead centre, which is right when jumping to a node the
   * learner asked for. The opening view passes a smaller value: these trees run
   * left to right, so anchoring the current skill a third of the way in shows
   * what comes next rather than filling the left third with the empty space
   * behind them.
   */
  function centreOn(skillId, targetScale, biasX = 0.5) {
    const p = pos.get(skillId);
    if (!p) return;
    const box = shell.getBoundingClientRect();
    if (targetScale) scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));
    tx = box.width * biasX - p.x * scale;
    ty = box.height / 2 - p.y * scale;
    clampPan();
    schedule();
  }

  /* ---- pointer: drag to pan, pinch to zoom ----
   *
   * Pointer events cover mouse, touch and pen with one code path, and the
   * active-pointer map is what makes two-finger pinch work without a separate
   * touch handler. */

  const pointers = new Map();
  let pinchStart = null;
  let panFrom = null;
  let moved = false;

  viewport.addEventListener('pointerdown', (e) => {
    /* Let the node take its own click; dragging starts on the canvas. */
    if (e.target.closest('.node')) return;
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;

    if (pointers.size === 1) {
      panFrom = { x: e.clientX - tx, y: e.clientY - ty };
      viewport.classList.add('dragging');
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
      panFrom = null;
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = true;

    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.distance > 0) {
        const box = shell.getBoundingClientRect();
        setScale(pinchStart.scale * (distance / pinchStart.distance),
          (a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top);
      }
      return;
    }

    if (panFrom) {
      tx = e.clientX - panFrom.x;
      ty = e.clientY - panFrom.y;
      clampPan();
      schedule();
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      panFrom = null;
      viewport.classList.remove('dragging');
    }
  }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const box = shell.getBoundingClientRect();
    /* Exponential rather than additive so zooming feels the same at every
     * scale — a fixed step is glacial when zoomed out and violent when in. */
    setScale(scale * Math.exp(-e.deltaY * 0.0016), e.clientX - box.left, e.clientY - box.top);
  }, { passive: false });

  /* ---- keyboard ----
   *
   * Nodes are real buttons in DOM order, so Tab already works. This adds
   * arrow-key movement through the graph, which is how the structure is
   * navigable without sight of the layout. */
  shell.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (!active || !active.classList.contains('node')) return;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;

    e.preventDefault();
    const id = active.dataset.skill;
    const here = pos.get(id);
    if (!here) return;

    const wantRight = e.key === 'ArrowRight';
    const wantLeft = e.key === 'ArrowLeft';
    const horizontal = wantRight || wantLeft;

    let best = null;
    let bestScore = Infinity;
    for (const [otherId, other] of pos) {
      if (otherId === id) continue;
      const dx = other.x - here.x;
      const dy = other.y - here.y;
      if (horizontal && ((wantRight && dx <= 4) || (wantLeft && dx >= -4))) continue;
      if (!horizontal && ((e.key === 'ArrowDown' && dy <= 4) || (e.key === 'ArrowUp' && dy >= -4))) continue;
      /* Prefer near in the travel axis, penalise drift in the other, so
       * ArrowRight lands on the next column rather than a distant diagonal. */
      const score = horizontal ? Math.abs(dx) + Math.abs(dy) * 2.2 : Math.abs(dy) + Math.abs(dx) * 2.2;
      if (score < bestScore) { bestScore = score; best = otherId; }
    }

    if (best) {
      nodeEls.get(best).focus();
      centreOn(best);
    }
  });

  /* ---- controls ---- */

  const controls = h('div.tree-controls',
    h('button', { 'aria-label': 'Zoom in', onclick: () => zoomButton(1.25) }, icon('zoomIn', { size: 17 })),
    h('button', { 'aria-label': 'Zoom out', onclick: () => zoomButton(0.8) }, icon('zoomOut', { size: 17 })),
    h('button', { 'aria-label': 'Fit to view', onclick: () => fit() }, icon('fit', { size: 17 })));

  function zoomButton(factor) {
    const box = shell.getBoundingClientRect();
    setScale(scale * factor, box.width / 2, box.height / 2);
  }

  const legend = h('div.tree-legend',
    ...[
      ['locked', 'Locked'],
      ['available', 'Ready'],
      ['in_progress', 'In progress'],
      ['completed', 'Complete'],
      ['mastered', 'Mastered'],
    ].map(([state_, label]) => h('span.row', { style: { gap: '5px' } }, legendDot(state_), h('b', label))));

  shell.appendChild(controls);
  shell.appendChild(legend);

  clear(host);
  host.appendChild(shell);

  /* Frame once the shell has a measured size. Calling it synchronously gives a
   * zero-width box on first paint and the graph lands off-screen. */
  window.requestAnimationFrame(() => frameView());

  const onResize = () => frameView();
  window.addEventListener('resize', onResize);

  return {
    shell,
    fit,
    frameView,
    focusSkill(skillId) {
      const el = nodeEls.get(skillId);
      if (!el) return;
      centreOn(skillId, Math.max(scale, 0.85));
      el.focus();
      light(skillId);
    },
    destroy() {
      window.removeEventListener('resize', onResize);
      if (frame !== null) window.cancelAnimationFrame(frame);
    },
  };
}

/*
 * One node. Built once and then left alone — see the header note.
 *
 * The ring content differs per state rather than being a colour swap: a lock
 * glyph, a plus, a live percentage, a tick, a star. That redundancy with
 * colour is what makes the tree readable in greyscale (§53).
 */
function buildNode(skill, status, progress, onPath) {
  const el = h('button.node', {
    type: 'button',
    data: { state: status, skill: skill.id },
    'aria-label': `${skill.name}. ${labelFor(status, progress)}`,
  });

  if (onPath) el.classList.add('on-path');

  const ring = h('div.node-ring');

  if (status === STATUS.LOCKED) {
    ring.appendChild(icon('lock', { size: 16, class: 'node-glyph' }));
  } else if (status === STATUS.MASTERED) {
    ring.appendChild(icon('star', { size: 18, class: 'node-glyph' }));
  } else if (status === STATUS.COMPLETED) {
    ring.appendChild(icon('check', { size: 18, class: 'node-glyph' }));
  } else if (status === STATUS.IN_PROGRESS) {
    const p = skillProgress({
      xp: progress?.xp || 0,
      masteryScore: progress?.masteryScore || 0,
      capacity: progress?.capacity || skillCapacity(skill.activities, skill.difficulty || 1),
      started: true,
    });
    const pct = Math.round(p.fraction * 100);
    ring.appendChild(h('div.node-arc', { style: { '--p': String(pct) } }));
    ring.appendChild(h('span.node-pct', String(pct)));
  } else {
    ring.appendChild(icon('plus', { size: 17, class: 'node-glyph' }));
  }

  el.appendChild(ring);
  el.appendChild(h('span.node-label', skill.name));

  /* Level is shown only once there is one, so an untouched tree is not a wall
   * of "Lv.0" — which reads as broken rather than as unstarted. */
  if (progress && progress.level > 0) {
    el.appendChild(h('span.lvl', `Lv.${progress.level}`));
  }

  return el;
}

function labelFor(status, progress) {
  switch (status) {
    case STATUS.LOCKED: return 'Locked';
    case STATUS.AVAILABLE: return 'Ready to start';
    case STATUS.IN_PROGRESS: return `In progress, level ${progress?.level || 1}`;
    case STATUS.COMPLETED: return `Complete, level ${progress?.level || 3}`;
    case STATUS.MASTERED: return 'Mastered';
    default: return '';
  }
}

function legendDot(state) {
  const dot = h('span', {
    style: {
      width: '9px',
      height: '9px',
      borderRadius: '50%',
      display: 'inline-block',
      border: '1.5px solid var(--line)',
    },
  });
  if (state === 'locked') dot.style.borderStyle = 'dashed';
  if (state === 'available') dot.style.borderColor = 'var(--bone-dimmer)';
  if (state === 'in_progress' || state === 'completed') dot.style.borderColor = 'var(--lime)';
  if (state === 'mastered') { dot.style.background = 'var(--lime)'; dot.style.borderColor = 'var(--lime)'; }
  return dot;
}

/** Readiness of a locked skill, for the "almost there" ordering elsewhere. */
export { readiness };
