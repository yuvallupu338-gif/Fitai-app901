/*
 * charts.js — the two charts, drawn as inline SVG.
 *
 * Both are single-series, which decides most of the design: no legend is
 * needed (the title names the series), no categorical palette is involved, and
 * the accent carries the data. That is a genuine fit with the app's
 * monochrome-plus-one position rather than a compromise — the green is the
 * progress here exactly as it is everywhere else.
 *
 * Deliberate choices worth recording:
 *
 * - Daily XP is bars, not a line. A line implies a continuous quantity
 *   interpolating between points; daily XP is a discrete total per day, and
 *   the days with nothing are the most informative part of the picture. Bars
 *   with visible zero days show consistency honestly; a line smooths the gaps
 *   away and flatters the learner.
 *
 * - Every chart ships a table alternative behind a toggle. An SVG of 30 bars
 *   is unreadable to a screen reader whatever the aria labels say, and the
 *   numbers are the point.
 *
 * - Grid and axes are recessive; marks are thin; nothing is labelled that the
 *   axis already says.
 */

import { h, svg, num } from '../core/dom.js';

/* ------------------------------------------------------------------ *
 * Daily XP
 * ------------------------------------------------------------------ */

/**
 * @param days [{ at, xp }] oldest first, gaps present as zeroes
 */
export function xpChart(days, opts = {}) {
  const width = opts.width || 640;
  const height = opts.height || 168;
  const padL = 34;
  const padR = 6;
  const padT = 10;
  const padB = 20;

  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const max = Math.max(10, ...days.map((d) => d.xp));
  /* Round the ceiling to something a person would choose, so the gridline
   * labels read 0/50/100 rather than 0/37/74. */
  const ceiling = niceCeiling(max);

  const slot = plotW / Math.max(1, days.length);
  const barW = Math.max(2, Math.min(18, slot - 2)); /* 2px surface gap */

  const chart = svg('svg.chart', {
    viewBox: `0 0 ${width} ${height}`,
    /* Uniform scaling. With `none` the viewBox was stretched independently on
     * each axis — at 320px the x-scale was 0.40 against a y-scale of 1.0, and
     * every axis label was compressed to two-fifths of its width. */
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': `Daily XP over the last ${days.length} days. Highest day ${num(max)} XP.`,
    style: 'width:100%;height:auto',
  });

  /* gridlines + y labels */
  for (let i = 0; i <= 2; i += 1) {
    const value = (ceiling / 2) * i;
    const y = padT + plotH - (value / ceiling) * plotH;
    chart.appendChild(svg('line.gridline', { x1: padL, y1: y, x2: width - padR, y2: y }));
    chart.appendChild(svg('text.tick', { x: padL - 7, y: y + 3.5, 'text-anchor': 'end' }, String(Math.round(value))));
  }

  const bars = svg('g');
  days.forEach((day, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    const barH = day.xp > 0 ? Math.max(2, (day.xp / ceiling) * plotH) : 2;
    const y = padT + plotH - barH;

    const rect = svg('rect', {
      x, y, width: barW, height: barH,
      rx: Math.min(4, barW / 2), /* rounded data-end, anchored to baseline */
      class: day.xp > 0 ? 'barfill' : 'barfill zero',
    });

    /* Hover target is the full column, not the 3px bar — a hit area you have
     * to aim at is a hit area nobody uses. */
    const hit = svg('rect', {
      x: padL + i * slot, y: padT, width: slot, height: plotH,
      fill: 'transparent',
      style: 'cursor:pointer',
    });
    hit.appendChild(svg('title', {}, `${formatDay(day.at)} — ${day.xp} XP`));

    bars.appendChild(rect);
    bars.appendChild(hit);
  });
  chart.appendChild(bars);

  /* x labels: first, middle, last only. A label per day is unreadable at this
   * width and adds nothing the shape does not already say. */
  const marks = [0, Math.floor(days.length / 2), days.length - 1];
  for (const i of marks) {
    if (!days[i]) continue;
    chart.appendChild(svg('text.tick', {
      x: padL + i * slot + slot / 2,
      y: height - 6,
      'text-anchor': i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle',
    }, formatDay(days[i].at)));
  }

  chart.appendChild(svg('line.axis', { x1: padL, y1: padT + plotH, x2: width - padR, y2: padT + plotH }));

  return withTable(chart, {
    caption: 'Daily XP',
    columns: ['Day', 'XP'],
    rows: days.filter((d) => d.xp > 0).map((d) => [formatDay(d.at), String(d.xp)]),
    emptyNote: 'No XP recorded in this window.',
  });
}

function niceCeiling(max) {
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= max) return candidate;
  }
  return magnitude * 10;
}

function formatDay(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------------ *
 * Skill radar
 * ------------------------------------------------------------------ */

/**
 * The radar the brief asks for (§19).
 *
 * Radar charts are easy to get wrong — they imply a cyclic relationship
 * between axes that usually is not there, and area scales as the square of the
 * value, which exaggerates. The mitigation here is that every axis is directly
 * labelled with its value, so a magnitude is never inferred from an area, and
 * the scale is stated beside the chart. It is used for the one thing a radar is
 * genuinely good at: shape-at-a-glance across a handful of comparable,
 * same-unit dimensions.
 *
 * @param areas [{ label, value 0..100, key }]
 */
export function radarChart(areas, opts = {}) {
  const size = opts.size || 300;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 54; /* room for labels outside the web */
  const n = areas.length;

  const chart = svg('svg.chart', {
    viewBox: `0 0 ${size} ${size}`,
    role: 'img',
    'aria-label': `Skill areas: ${areas.map((a) => `${a.label} ${Math.round(a.value)}`).join(', ')}.`,
    style: `max-width:${size}px;margin:0 auto`,
  });

  if (n < 3) {
    /* Under three axes a radar is a line or a triangle degenerate — the caller
     * should use bars, and saying so beats drawing something misleading. */
    return withTable(h('div.empty', h('p', 'Not enough areas yet to draw a radar.')), {
      caption: 'Skill areas',
      columns: ['Area', 'Score'],
      rows: areas.map((a) => [a.label, String(Math.round(a.value))]),
    });
  }

  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i, value) => [cx + Math.cos(angle(i)) * r * (value / 100), cy + Math.sin(angle(i)) * r * (value / 100)];

  /* Web rings at quarter steps. They are not labelled: every vertex already
   * carries its own value, so a ring tick adds nothing and — with the first
   * axis pointing straight up — lands exactly on top of the first axis label.
   * The scale is stated in the card subtitle instead. */
  for (const level of [25, 50, 75, 100]) {
    const pts = areas.map((_, i) => point(i, level).join(',')).join(' ');
    chart.appendChild(svg('polygon.radar-web', { points: pts }));
  }

  /* spokes */
  for (let i = 0; i < n; i += 1) {
    const [x, y] = point(i, 100);
    chart.appendChild(svg('line.radar-web', { x1: cx, y1: cy, x2: x, y2: y }));
  }

  /* the shape */
  const shape = areas.map((a, i) => point(i, Math.max(0, Math.min(100, a.value))).join(',')).join(' ');
  chart.appendChild(svg('polygon.radar-shape', { points: shape }));

  /* vertices, ≥8px as the mark spec requires */
  areas.forEach((a, i) => {
    const [x, y] = point(i, Math.max(0, Math.min(100, a.value)));
    const dot = svg('circle.radar-point', { cx: x, cy: y, r: 4 });
    dot.appendChild(svg('title', {}, `${a.label}: ${Math.round(a.value)}`));
    chart.appendChild(dot);
  });

  /*
   * Labels outside the web, with the value attached — so the reader never has
   * to estimate a magnitude from an area.
   *
   * The radius multiplier is 1.18 rather than 1.28, and the anchor is clamped
   * away from the edges: at 320px the left-hand label started at x = -15 and
   * "Programming" rendered as "gramming".
   */
  areas.forEach((a, i) => {
    const [x, y] = point(i, 118);
    const cos = Math.cos(angle(i));
    const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
    /* Keep the text box inside the viewBox whatever the anchor. */
    const clamped = Math.max(4, Math.min(size - 4, x));
    const label = svg('text.radar-label', { x: clamped, y: y + 4, 'text-anchor': anchor });
    label.appendChild(svg('tspan', {}, a.label));
    label.appendChild(svg('tspan', { x: clamped, dy: '13', class: 'tick' }, String(Math.round(a.value))));
    chart.appendChild(label);
  });

  return withTable(chart, {
    caption: 'Skill areas',
    columns: ['Area', 'Score'],
    rows: areas.map((a) => [a.label, String(Math.round(a.value))]),
  });
}

/* ------------------------------------------------------------------ *
 * Table alternative
 * ------------------------------------------------------------------ */

/*
 * Every chart gets one. The toggle is a real control rather than visually
 * hidden markup, because the numbers behind a chart are useful to everybody —
 * this is the rare accessibility affordance that sighted users also click.
 */
function withTable(chartNode, { caption, columns, rows, emptyNote }) {
  const tableWrap = h('div', { hidden: true, style: { marginTop: 'var(--s3)', overflowX: 'auto' } });

  if (!rows.length) {
    tableWrap.appendChild(h('div.card-note', emptyNote || 'Nothing recorded yet.'));
  } else {
    const table = h('table', {
      style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
    },
    h('caption', { class: 'sr-only' }, caption),
    h('thead', h('tr', ...columns.map((c) => h('th', {
      scope: 'col',
      style: { textAlign: 'left', padding: '4px 8px', color: 'var(--bone-dimmer)', fontWeight: '580', borderBottom: '1px solid var(--line)' },
    }, c)))),
    h('tbody', ...rows.map((cells) => h('tr', ...cells.map((cell, i) => h('td', {
      style: {
        padding: '4px 8px',
        borderBottom: '1px solid var(--line-soft)',
        fontFamily: i > 0 ? 'var(--mono)' : 'inherit',
        color: i > 0 ? 'var(--bone)' : 'var(--bone-dim)',
      },
    }, cell))))));
    tableWrap.appendChild(table);
  }

  const toggle = h('button.btn.ghost.small', {
    'aria-expanded': 'false',
    onclick: () => {
      const showing = !tableWrap.hidden;
      tableWrap.hidden = showing;
      toggle.setAttribute('aria-expanded', String(!showing));
      toggle.textContent = showing ? 'Show numbers' : 'Hide numbers';
    },
  }, 'Show numbers');

  return h('div',
    chartNode,
    h('div', { style: { marginTop: 'var(--s2)' } }, toggle),
    tableWrap);
}
