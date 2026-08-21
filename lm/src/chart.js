/*
 * chart.js — the loss curve.
 *
 * Two lines and a dashed rule, drawn by hand on a canvas because a chart
 * library would be larger than the model. What it has to get right is small:
 * survive a device pixel ratio, keep the labels on the correct side of an RTL
 * page, and stay readable while a point is being added to it several times a
 * second.
 *
 * The dashed rule is ln(V) — the loss of a model that has learned nothing and
 * guesses uniformly. Without it the curve is a number falling, and it is not
 * obvious that falling below that particular line is the entire point.
 */

const PAD = { top: 14, right: 52, bottom: 24, left: 12 };

/* A curve is drawn a few times a second while training and can hold tens of
 * thousands of points, nearly all of which land inside the same pixel column.
 * Averaging them into buckets keeps the line honest and the frame cheap. */
function reduce(points, width) {
  const budget = Math.max(60, Math.floor(width));
  if (points.length <= budget) return points;
  const size = Math.ceil(points.length / budget);
  const out = [];
  for (let i = 0; i < points.length; i += size) {
    let x = 0, y = 0, n = 0;
    for (let j = i; j < i + size && j < points.length; j++) { x += points[j].x; y += points[j].y; n++; }
    out.push({ x: x / n, y: y / n });
  }
  return out;
}

export function createChart(canvas) {
  const ctx = canvas.getContext('2d');
  let css = { w: 0, h: 0 };
  /* The last series drawn, kept so a resize can put it back. Setting
   * canvas.width — which resizing must do, or the drawing is stretched — also
   * clears the canvas, and outside a training run there is nothing coming along
   * behind to redraw it. Without this, turning a phone sideways after a run
   * leaves a black rectangle where the curve was. */
  let last = { train: [], val: [], baseline: null };

  const colors = () => {
    const s = getComputedStyle(canvas);
    return {
      train: s.getPropertyValue('--amber').trim() || '#FFB13C',
      val: s.getPropertyValue('--cyan').trim() || '#56D9CE',
      grid: s.getPropertyValue('--line-soft').trim() || '#223047',
      text: s.getPropertyValue('--dimmer').trim() || '#788CA8',
      mono: s.getPropertyValue('--mono').trim() || 'monospace',
    };
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    css = { w: rect.width, h: rect.height };
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(series) {
    last = series;
    const { train = [], val = [], baseline = null } = series;
    if (!css.w || Math.abs(canvas.getBoundingClientRect().width - css.w) > 1) resize();
    const { w, h } = css;
    const c = colors();
    ctx.clearRect(0, 0, w, h);

    const plot = {
      x0: PAD.left, y0: PAD.top,
      x1: w - PAD.right, y1: h - PAD.bottom,
    };
    const pw = plot.x1 - plot.x0, ph = plot.y1 - plot.y0;
    if (pw <= 10 || ph <= 10) return;

    const all = train.concat(val);
    if (!all.length) {
      ctx.fillStyle = c.text;
      ctx.font = `13px ${c.mono}`;
      ctx.textAlign = 'center';
      ctx.fillText('—', (plot.x0 + plot.x1) / 2, (plot.y0 + plot.y1) / 2);
      return;
    }

    let maxX = 1, minY = Infinity, maxY = -Infinity;
    for (const p of all) {
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (baseline !== null) maxY = Math.max(maxY, baseline);
    /* Zero is not a useful floor once the loss is under one, and a range with no
     * height at all cannot be divided by. */
    const span = Math.max(maxY - minY, 0.05);
    minY = Math.max(0, minY - span * 0.12);
    maxY = maxY + span * 0.08;

    const X = (v) => plot.x0 + (v / maxX) * pw;
    const Y = (v) => plot.y1 - ((v - minY) / (maxY - minY)) * ph;

    /* Gridlines, labelled on the right where an RTL reader starts. */
    ctx.font = `11px ${c.mono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = minY + ((maxY - minY) * i) / 4;
      const y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = c.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x0, y);
      ctx.lineTo(plot.x1, y);
      ctx.stroke();
      ctx.fillStyle = c.text;
      ctx.fillText(v.toFixed(2), plot.x1 + 7, y);
    }

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = c.text;
    ctx.fillText(`${Math.round(maxX).toLocaleString()} צעדים`, (plot.x0 + plot.x1) / 2, h - 7);

    if (baseline !== null && baseline <= maxY && baseline >= minY) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = c.text;
      ctx.beginPath();
      ctx.moveTo(plot.x0, Y(baseline));
      ctx.lineTo(plot.x1, Y(baseline));
      ctx.stroke();
      ctx.restore();
    }

    const line = (points, color, width) => {
      const pts = reduce(points, pw);
      if (pts.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      ctx.stroke();
    };

    line(train, c.train, 1.8);
    line(val, c.val, 2.2);
  }

  window.addEventListener('resize', () => { resize(); draw(last); });
  resize();
  return { draw, resize };
}
