/*
 * chart.js — every graph in TomorrowAI, drawn by hand.
 *
 * There is no chart library here and there is not going to be one. This app
 * ships as plain modules a browser loads directly, so a dependency would mean a
 * build step, and the shapes below are the entire visual vocabulary: a curve
 * over the day, a dial for the score, a bar for a factor, a sparkline for a
 * history row. A charting library is a hundred kilobytes to draw four things,
 * and none of them the way this design wants them drawn.
 *
 * Nothing here carries a colour or a pixel size. Every stroke takes its paint
 * from a class in components.css, and every chart is a viewBox with no width,
 * so a graph is exactly as wide as the card it sits in, works in both themes,
 * and cannot be the thing that gives a 375px phone a horizontal scrollbar.
 */

import { svg, h } from '../core/dom.js';
import { time as fmtTime } from '../core/fmt.js';

const VB_W = 320;

/*
 * A smooth line through the samples, as a cubic Bézier per segment.
 *
 * Straight segments between fifteen-minute samples make a physiological curve
 * look like a stock chart, and a spline that overshoots invents energy the model
 * never predicted — a peak drawn above the highest sample is a lie the eye
 * believes. This is a Catmull-Rom conversion with the tangents scaled to a sixth
 * of the neighbouring gap, the standard construction that stays inside the data
 * it was given.
 */
function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length < 3) return `M${pts.map((p) => `${p.x},${p.y}`).join('L')}`;
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
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
 * At 375px a label every hour collides into a grey smear, so the step widens
 * until the labels fit the width they actually have. Thinning is always better
 * than overlapping: an axis nobody can read is worse than an axis with fewer
 * marks on it.
 */
function labelStep(spanMinutes) {
  for (const step of [120, 180, 240, 360]) {
    if (spanMinutes / step <= 6) return step;
  }
  return 360;
}

/**
 * One or two curves across a day.
 *
 * opts: { series, from, to, windows, markers, height, timeFormat, now, ariaLabel, id }
 *
 * `series` is [{ points, variant }] where variant is 'energy' or 'focus' — the
 * stylesheet owns the colour. Drawing both on one set of axes is the point of
 * the preview card: being awake and being sharp are not the same thing, and the
 * gap between the two lines is the fastest way to see that.
 */
export function lineChart(opts) {
  const o = Object.assign({
    series: [], from: 420, to: 1400, windows: [], markers: [],
    height: 118, timeFormat: '24h', now: null, ariaLabel: '', id: 'chart',
  }, opts);

  const H = o.height;
  const padT = 10;
  const padB = 18;
  const padX = 4;
  const plotH = H - padT - padB;
  const span = Math.max(1, o.to - o.from);

  const x = (minute) => padX + ((minute - o.from) / span) * (VB_W - padX * 2);
  const y = (value) => padT + (1 - Math.max(0, Math.min(100, value)) / 100) * plotH;

  const kids = [];

  kids.push(svg('defs', null,
    ...o.series.map((s) => svg('linearGradient',
      { id: `fill-${o.id}-${s.variant}`, x1: '0', y1: '0', x2: '0', y2: '1' },
      svg('stop', { offset: '0%', 'stop-color': `var(--${s.variant})`, 'stop-opacity': '.26' }),
      svg('stop', { offset: '100%', 'stop-color': `var(--${s.variant})`, 'stop-opacity': '0' })))));

  // Faint guides at a quarter, a half and three quarters. They are for judging
  // a height against, not for reading a value off, so they stay quiet.
  for (const v of [25, 50, 75]) {
    kids.push(svg('line', {
      x1: padX, x2: VB_W - padX, y1: y(v).toFixed(2), y2: y(v).toFixed(2),
      class: v === 50 ? 'chart-grid strong' : 'chart-grid',
    }));
  }

  for (const w of o.windows || []) {
    const a = x(Math.max(o.from, w.start));
    const b = x(Math.min(o.to, w.end));
    if (b <= a) continue;
    kids.push(svg('rect', {
      x: a.toFixed(2), y: padT, width: (b - a).toFixed(2), height: plotH,
      class: 'chart-band', rx: 5,
    }));
  }

  for (const s of o.series) {
    const pts = (s.points || [])
      .filter((p) => p.minute >= o.from - 1 && p.minute <= o.to + 1)
      .map((p) => ({ x: x(p.minute), y: y(p.value) }));
    if (!pts.length) continue;
    const line = smoothPath(pts);
    if (s.fill !== false) {
      const area = `${line}L${pts[pts.length - 1].x.toFixed(2)},${(padT + plotH).toFixed(2)}L${pts[0].x.toFixed(2)},${(padT + plotH).toFixed(2)}Z`;
      kids.push(svg('path', { d: area, fill: `url(#fill-${o.id}-${s.variant})`, stroke: 'none' }));
    }
    kids.push(svg('path', { d: line, class: `chart-line ${s.variant}` }));
  }

  const step = labelStep(span);
  for (let m = Math.ceil(o.from / step) * step; m <= o.to; m += step) {
    kids.push(svg('text', {
      x: x(m).toFixed(2), y: H - 5, class: 'chart-axis', 'text-anchor': 'middle',
    }, fmtTime(m % 1440, o.timeFormat)));
  }

  for (const mk of o.markers || []) {
    if (mk.minute < o.from || mk.minute > o.to) continue;
    kids.push(svg('circle', {
      cx: x(mk.minute).toFixed(2), cy: y(mk.value).toFixed(2), r: 4,
      class: 'chart-marker', style: { stroke: `var(--${mk.variant || 'energy'})` },
    }));
  }

  if (o.now !== null && o.now >= o.from && o.now <= o.to) {
    kids.push(svg('line', {
      x1: x(o.now).toFixed(2), x2: x(o.now).toFixed(2), y1: padT - 3, y2: padT + plotH,
      class: 'chart-grid strong', 'stroke-dasharray': '2 3',
    }));
  }

  /*
   * No preserveAspectRatio override and no width attribute. The stylesheet sets
   * width:100% and height:auto, so the box decides the size and the viewBox
   * decides the proportions — which also keeps the axis labels from being
   * stretched sideways on a wide screen.
   */
  return h('div.chart', { 'data-t': o.testId || null },
    svg('svg', {
      viewBox: `0 0 ${VB_W} ${H}`, role: 'img', 'aria-label': o.ariaLabel,
    }, kids));
}

/**
 * The score dial.
 *
 * The arc is a stroke-dasharray on a circle rather than an arc path, because a
 * dasharray animates from one value to another for free and an arc path has to
 * be recomputed every frame. Callers put this inside a `.ring-wrap` along with
 * the number itself.
 */
export function ring(opts) {
  const o = Object.assign({ value: 0, band: 'good', ariaLabel: '' }, opts);
  const R = 52;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, o.value)) / 100;

  return svg('svg', {
    viewBox: '0 0 120 120', class: `ring band-${o.band}`,
    role: 'img', 'aria-label': o.ariaLabel || `${Math.round(o.value)} מתוך 100`,
  },
  svg('defs', null,
    svg('linearGradient', { id: 'ring-grad', x1: '0', y1: '0', x2: '1', y2: '1' },
      svg('stop', { offset: '0%', 'stop-color': 'var(--primary-strong)' }),
      svg('stop', { offset: '52%', 'stop-color': 'var(--primary)' }),
      svg('stop', { offset: '100%', 'stop-color': 'var(--violet)' }))),
  svg('circle', { cx: 60, cy: 60, r: R, class: 'ring-track' }),
  svg('circle', {
    cx: 60, cy: 60, r: R, class: 'ring-fill',
    'stroke-dasharray': `${(C * pct).toFixed(2)} ${(C * (1 - pct) + 1).toFixed(2)}`,
    transform: 'rotate(-90 60 60)',
  }));
}

/** Move an already-rendered dial to a new value, for the count-up after Apply. */
export function setRing(node, value) {
  const fill = node.querySelector('.ring-fill');
  if (!fill) return;
  const R = 52;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  fill.setAttribute('stroke-dasharray', `${(C * pct).toFixed(2)} ${(C * (1 - pct) + 1).toFixed(2)}`);
}

/**
 * One factor of the score, as a labelled bar.
 *
 * A real `<button>`, so the breakdown opens on Enter for a keyboard user and the
 * whole row is a target on a phone rather than a small chevron at the end of it.
 * `.bar-row` is a grid in the stylesheet and a button inherits that happily.
 */
export function barRow(opts) {
  const o = Object.assign({ label: '', value: 0, detail: '', direction: 'flat' }, opts);
  const tone = o.tone || (o.value >= 80 ? 'good' : o.value >= 58 ? '' : o.value >= 40 ? 'warn' : 'risk');
  const arrow = o.direction === 'up' ? '↑' : o.direction === 'down' ? '↓' : '';

  const node = h(o.onclick ? 'button.bar-row' : 'div.bar-row', {
    type: o.onclick ? 'button' : null,
    'data-t': o.testId || null,
    onclick: o.onclick || null,
    'aria-label': o.onclick ? `${o.label}, ${o.value} מתוך 100. ${o.detail}` : null,
  },
  h('span.bar-label', { text: o.label }),
  h('span.bar-track', { 'aria-hidden': 'true' },
    h('i.bar-fill', { class: tone ? `bar-fill ${tone}` : 'bar-fill',
      style: { width: `${Math.max(2, Math.min(100, o.value))}%` } })),
  h('span.bar-value', null, String(o.value), arrow ? ` ${arrow}` : ''));

  return node;
}

/**
 * A history row's trend line.
 *
 * Deliberately axis-free. It answers "is this going up or down" at a glance and
 * nothing else; the numbers beside it answer everything more precise.
 */
export function sparkline(opts) {
  const o = Object.assign({ values: [], variant: 'energy', ariaLabel: '' }, opts);
  const vals = o.values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  const H = 28;
  if (vals.length < 2) {
    return svg('svg', { viewBox: `0 0 ${VB_W} ${H}`, class: 'sparkline',
      role: 'img', 'aria-label': o.ariaLabel || 'אין עדיין מספיק נתונים' });
  }
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  // A flat run has no range to scale against. Centring it beats dividing by
  // zero, and beats drawing it along the bottom, which reads as a collapse.
  const range = hi - lo < 1 ? 1 : hi - lo;
  const pts = vals.map((v, i) => ({
    x: 2 + (i / (vals.length - 1)) * (VB_W - 4),
    y: 3 + (1 - (v - lo) / range) * (H - 6),
  }));

  return svg('svg', {
    viewBox: `0 0 ${VB_W} ${H}`, class: 'sparkline', role: 'img', 'aria-label': o.ariaLabel,
  },
  svg('path', { d: smoothPath(pts), class: `chart-line ${o.variant}`, 'stroke-width': '2' }),
  svg('circle', {
    cx: pts[pts.length - 1].x.toFixed(2), cy: pts[pts.length - 1].y.toFixed(2),
    r: 2.8, class: 'chart-marker', style: { stroke: `var(--${o.variant})` },
  }));
}

/** The energy/focus key that sits under the preview chart. */
export function legend(items) {
  return h('div.legend', null, items.map((i) => h('span.legend-item', null,
    h('i', { class: `legend-dot ${i.variant}`, 'aria-hidden': 'true' }),
    h('span', { text: i.label }))));
}
