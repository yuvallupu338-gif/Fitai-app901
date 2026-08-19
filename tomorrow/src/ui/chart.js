/*
 * chart.js — every graph in TomorrowAI, drawn by hand.
 *
 * There is no chart library here and there is not going to be one. This app
 * ships as plain modules a browser loads directly, so a dependency would mean a
 * build step, and the four shapes below are the entire visual vocabulary: a
 * curve over the day, a dial for the score, a bar for a factor and a sparkline
 * for a history row. A charting library is a hundred kilobytes to draw four
 * things, and none of them the way this design wants them drawn.
 *
 * Everything is a viewBox with no fixed pixel size, so a chart is exactly as
 * wide as the card it sits in and stays sharp on any screen. Colours come from
 * the CSS custom properties rather than being baked into the path, which is what
 * lets the same SVG work in both themes without being redrawn.
 */

import { svg, h } from '../core/dom.js';
import { time as fmtTime } from '../core/fmt.js';

const VB_W = 320;

/*
 * A smooth line through the samples, as a cubic Bézier per segment.
 *
 * Straight segments between fifteen-minute samples make a physiological curve
 * look like a stock chart, and a spline that overshoots invents energy the model
 * never predicted — a peak above the highest sample is a lie the eye believes.
 * This is a Catmull-Rom conversion with the tangents scaled to a sixth of the
 * neighbouring gap, which is the standard construction that stays inside the
 * data it was given.
 */
function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length < 3) return `M${pts.map((p) => `${p.x},${p.y}`).join('L')}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

/*
 * Which hours get a label.
 *
 * At 375px a label every two hours collides into a grey smear, so the step
 * widens until the labels fit the width they actually have. Thinning them is
 * always better than overlapping them — an axis nobody can read is worse than
 * an axis with fewer marks.
 */
function labelStep(spanMinutes, width) {
  const room = Math.max(3, Math.floor(width / 46));
  for (const step of [60, 120, 180, 240, 360]) {
    if (spanMinutes / step <= room) return step;
  }
  return 360;
}

/**
 * The energy or focus curve across a day.
 *
 * opts: { points, from, to, color, label, windows, markers, height, timeFormat,
 *         now, ariaLabel, id }
 *
 * `windows` shades the best focus stretches; `markers` drops a dot and a caption
 * at a specific minute (the peak, the dip). Both are optional.
 */
export function lineChart(opts) {
  const o = Object.assign({
    points: [], from: 420, to: 1400, color: 'var(--primary)', label: '',
    windows: [], markers: [], height: 116, timeFormat: '24h', now: null,
    ariaLabel: '', id: `c${Math.round(opts && opts.from || 0)}`,
  }, opts);

  const H = o.height;
  const padT = 10;
  const padB = 20;
  const padX = 4;
  const plotH = H - padT - padB;
  const span = Math.max(1, o.to - o.from);

  const x = (minute) => padX + ((minute - o.from) / span) * (VB_W - padX * 2);
  const y = (value) => padT + (1 - Math.max(0, Math.min(100, value)) / 100) * plotH;

  const pts = o.points
    .filter((p) => p.minute >= o.from - 1 && p.minute <= o.to + 1)
    .map((p) => ({ x: x(p.minute), y: y(p.value) }));

  const line = smoothPath(pts);
  const area = pts.length ? `${line}L${pts[pts.length - 1].x.toFixed(2)},${(padT + plotH).toFixed(2)}L${pts[0].x.toFixed(2)},${(padT + plotH).toFixed(2)}Z` : '';

  const gid = `grad-${o.id}`;
  const kids = [];

  kids.push(svg('defs', null,
    svg('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' },
      svg('stop', { offset: '0%', 'stop-color': o.color, 'stop-opacity': '.30' }),
      svg('stop', { offset: '100%', 'stop-color': o.color, 'stop-opacity': '0' }))));

  // Horizontal guides at 25/50/75. Faint on purpose: they are for judging a
  // height, not for reading a value off.
  for (const v of [25, 50, 75]) {
    kids.push(svg('line', {
      x1: padX, x2: VB_W - padX, y1: y(v).toFixed(2), y2: y(v).toFixed(2),
      class: 'chart-guide',
    }));
  }

  for (const w of o.windows || []) {
    const a = x(Math.max(o.from, w.start));
    const b = x(Math.min(o.to, w.end));
    if (b <= a) continue;
    kids.push(svg('rect', {
      x: a.toFixed(2), y: padT, width: (b - a).toFixed(2), height: plotH,
      class: 'chart-window', rx: 4,
    }));
  }

  if (area) kids.push(svg('path', { d: area, fill: `url(#${gid})` }));
  if (line) kids.push(svg('path', { d: line, class: 'chart-line', style: { stroke: o.color } }));

  const step = labelStep(span, VB_W);
  const firstTick = Math.ceil(o.from / step) * step;
  for (let m = firstTick; m <= o.to; m += step) {
    kids.push(svg('text', {
      x: x(m).toFixed(2), y: H - 6, class: 'chart-tick', 'text-anchor': 'middle',
    }, fmtTime(m % 1440, o.timeFormat)));
  }

  for (const mk of o.markers || []) {
    if (mk.minute < o.from || mk.minute > o.to) continue;
    const mx = x(mk.minute);
    const my = y(mk.value);
    kids.push(svg('line', {
      x1: mx.toFixed(2), x2: mx.toFixed(2), y1: my.toFixed(2), y2: padT + plotH,
      class: `chart-marker-line ${mk.tone || ''}`,
    }));
    kids.push(svg('circle', {
      cx: mx.toFixed(2), cy: my.toFixed(2), r: 3.4,
      class: `chart-dot ${mk.tone || ''}`,
    }));
  }

  if (o.now !== null && o.now >= o.from && o.now <= o.to) {
    kids.push(svg('line', {
      x1: x(o.now).toFixed(2), x2: x(o.now).toFixed(2), y1: padT - 4, y2: padT + plotH,
      class: 'chart-now',
    }));
  }

  const node = svg('svg', {
    viewBox: `0 0 ${VB_W} ${H}`, preserveAspectRatio: 'none',
    class: 'chart', role: 'img', 'aria-label': o.ariaLabel || o.label,
  }, kids);
  /*
   * preserveAspectRatio="none" would stretch the text with the box, so the
   * labels get their own non-scaling treatment in CSS. It is the one place this
   * file and the stylesheet have to agree.
   */
  node.setAttribute('vector-effect', 'non-scaling-stroke');
  return node;
}

/**
 * The score dial.
 *
 * opts: { value, size, label, band, ariaLabel }
 *
 * The arc is a stroke-dasharray on a circle rather than an arc path, because a
 * dasharray animates cleanly from one value to another and an arc path has to
 * be recomputed every frame. ui/home.js counts the number up; this just draws
 * whatever it is told to draw.
 */
export function ring(opts) {
  const o = Object.assign({ value: 0, size: 168, band: 'good', label: '', ariaLabel: '' }, opts);
  const R = 52;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, o.value)) / 100;

  return svg('svg', {
    viewBox: '0 0 120 120', class: `ring band-${o.band}`,
    role: 'img', 'aria-label': o.ariaLabel || `${o.value} מתוך 100`,
    style: { width: `${o.size}px`, height: `${o.size}px` },
  },
  svg('defs', null,
    svg('linearGradient', { id: 'ring-grad', x1: '0', y1: '0', x2: '1', y2: '1' },
      svg('stop', { offset: '0%', 'stop-color': 'var(--primary-strong)' }),
      svg('stop', { offset: '55%', 'stop-color': 'var(--primary)' }),
      svg('stop', { offset: '100%', 'stop-color': 'var(--violet)' }))),
  svg('circle', { cx: 60, cy: 60, r: R, class: 'ring-track' }),
  svg('circle', {
    cx: 60, cy: 60, r: R, class: 'ring-fill',
    'stroke-dasharray': `${(C * pct).toFixed(2)} ${(C * (1 - pct) + 1).toFixed(2)}`,
    transform: 'rotate(-90 60 60)',
  }));
}

/**
 * One factor of the score, as a labelled bar.
 *
 * opts: { label, value, detail, direction, tone, onclick }
 *
 * Returns an HTML row rather than SVG — it is a list item that happens to
 * contain a bar, and building it as a real button keeps it keyboard-reachable
 * and lets the breakdown open on Enter like everything else.
 */
export function barRow(opts) {
  const o = Object.assign({ label: '', value: 0, detail: '', direction: 'flat', tone: '' }, opts);
  const arrow = o.direction === 'up' ? '↑' : o.direction === 'down' ? '↓' : '';
  const tone = o.tone || (o.value >= 80 ? 'good' : o.value >= 60 ? 'fair' : 'warn');

  return h('button.factor', {
    type: 'button',
    'data-t': o.testId || null,
    onclick: o.onclick || null,
    'aria-label': `${o.label}, ${o.value} מתוך 100. ${o.detail}`,
  },
  h('span.factor-head', null,
    h('span.factor-label', { text: o.label }),
    h('span.factor-value', null,
      h('b', { text: String(o.value) }),
      arrow ? h('i', { class: `dir ${o.direction}`, text: arrow, 'aria-hidden': 'true' }) : null)),
  h('span.factor-bar', { 'aria-hidden': 'true' },
    h('i', { class: `fill ${tone}`, style: { width: `${Math.max(2, Math.min(100, o.value))}%` } })),
  o.detail ? h('span.factor-detail', { text: o.detail }) : null);
}

/**
 * A history row's trend line.
 *
 * opts: { values, color, height, ariaLabel }
 *
 * Deliberately axis-free. It answers "is this going up or down" at a glance and
 * nothing else; the numbers next to it answer everything more precise.
 */
export function sparkline(opts) {
  const o = Object.assign({ values: [], color: 'var(--primary)', height: 30, ariaLabel: '' }, opts);
  const vals = o.values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (vals.length < 2) {
    return svg('svg', { viewBox: `0 0 ${VB_W} ${o.height}`, class: 'spark empty',
      role: 'img', 'aria-label': o.ariaLabel || 'אין מספיק נתונים' });
  }
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  // A flat run has no range to scale against; centring it beats dividing by zero
  // and beats drawing it at the very bottom, which reads as a collapse.
  const range = hi - lo < 1 ? 1 : hi - lo;
  const pts = vals.map((v, i) => ({
    x: 2 + (i / (vals.length - 1)) * (VB_W - 4),
    y: 3 + (1 - (v - lo) / range) * (o.height - 6),
  }));

  return svg('svg', {
    viewBox: `0 0 ${VB_W} ${o.height}`, preserveAspectRatio: 'none', class: 'spark',
    role: 'img', 'aria-label': o.ariaLabel,
  },
  svg('path', { d: smoothPath(pts), class: 'spark-line', style: { stroke: o.color } }),
  svg('circle', {
    cx: pts[pts.length - 1].x.toFixed(2), cy: pts[pts.length - 1].y.toFixed(2),
    r: 2.6, class: 'spark-dot', style: { fill: o.color },
  }));
}

/**
 * A small stacked pair of curves, for the home screen's preview card.
 *
 * Energy and focus on one set of axes, because the point of the card is the gap
 * between them: being awake and being sharp are not the same thing, and seeing
 * the two lines diverge is the fastest way to understand that.
 */
export function dualChart(opts) {
  const o = opts || {};
  const wrap = h('div.dual');
  wrap.appendChild(lineChart(Object.assign({}, o, {
    points: o.energy, color: 'var(--energy)', id: 'energy',
    windows: [], ariaLabel: o.energyLabel || 'תחזית אנרגיה',
  })));
  const overlay = lineChart(Object.assign({}, o, {
    points: o.focus, color: 'var(--focus)', id: 'focus',
    ariaLabel: o.focusLabel || 'תחזית ריכוז',
  }));
  overlay.classList.add('overlay');
  wrap.appendChild(overlay);
  return wrap;
}
