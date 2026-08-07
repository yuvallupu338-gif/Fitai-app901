/*
 * font.js — the 8-pixel arcade alphabet.
 *
 * Glyphs are 5x7 inside an 8x8 cell, which is what a tile-based text layer
 * gives you: every character is one background tile, so a score is four tiles
 * and a countdown is three. Advance is a flat 8 pixels — no kerning, because
 * a proportional score would jitter as the digits changed.
 *
 * Uppercase Latin, digits and a handful of marks, and nothing else. The screen
 * text in this game is deliberately the arcade set the original used — WORLD,
 * TIME, GAME OVER — so the Hebrew belongs on the page around the canvas, where
 * it can be set in a real font at a readable size, rather than being crammed
 * into a 5-pixel box where it would be unreadable in every direction.
 *
 * Rows are written as strings so a glyph can be edited by eye. They are packed
 * into bitmaps once at load.
 */

const G = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/####./#...#/#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.###.',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '.###./..#../..#../..#../..#../..#../.###.',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#.#.#/#..##/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  1: '..#../.##../..#../..#../..#../..#../.###.',
  2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '####./....#/....#/.###./....#/....#/####.',
  4: '...#./..##./.#.#./#..#./#####/...#./...#.',
  5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '.###./#..../#..../####./#...#/#...#/.###.',
  7: '#####/....#/...#./..#../.#.../.#.../.#...',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/....#/.###.',
  ' ': '...../...../...../...../...../...../.....',
  '-': '...../...../...../#####/...../...../.....',
  '.': '...../...../...../...../...../.##../.##..',
  ',': '...../...../...../...../.##../.##../.#...',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  ':': '...../.##../.##../...../.##../.##../.....',
  '*': '...../.#.#./..#../#####/..#../.#.#./.....',
  '/': '....#/...#./...#./..#../.#.../.#.../#....',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '+': '...../..#../..#../#####/..#../..#../.....',
  '=': '...../...../#####/...../#####/...../.....',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.',
  '>': '.#.../..#../...#./....#/...#./..#../.#...',
  '%': '#...#/....#/...#./..#../.#.../#..../#...#',
  "'": '..#../..#../...../...../...../...../.....',
  '"': '.#.#./.#.#./...../...../...../...../.....',
  /* The coin mark that sits between the counter and the number. */
  '¢': '..#../.###./#.#../#.#../#.#../.###./..#..',
  /* Multiplication sign, for lives and stomp chains. */
  '×': '...../#...#/.#.#./..#../.#.#./#...#/.....',
  /* Solid arrow, for the level-select cursor. */
  '▶': '.#.../.##../.###./.####/.###./.##../.#...',
  '◀': '...#./..##./.###./####./.###./..##./...#.',
  /* A filled tick and a lock, for cleared and unreached levels. */
  '✓': '...../....#/...#./#..#./.##../..#../.....',
  '■': '...../.###./.###./.###./.###./.###./.....',
};

export const CHAR_W = 8;
export const CHAR_H = 8;

/* Each glyph becomes 7 bytes, one bit per column. Drawing then walks bits
   instead of characters, which matters because the HUD redraws every frame. */
const BITS = new Map();
for (const [ch, spec] of Object.entries(G)) {
  const rows = spec.split('/');
  const bytes = new Uint8Array(7);
  for (let y = 0; y < 7; y++) {
    let b = 0;
    const row = rows[y] || '';
    for (let x = 0; x < 5; x++) if (row[x] === '#') b |= 1 << x;
    bytes[y] = b;
  }
  BITS.set(ch, bytes);
}

const MISSING = BITS.get('?');

/*
 * Text is drawn straight onto the frame rather than blitted from an atlas.
 * At 5x7 that is at most 35 rectangles per character, and the alternative —
 * an atlas page per colour — costs more in memory than it saves in calls,
 * because the HUD uses white, black, red and grey on the same frame.
 */
export function drawText(ctx, text, x, y, opts) {
  const o = opts || {};
  const color = o.color || '#FCFCFC';
  const scale = o.scale || 1;
  const s = String(text).toUpperCase();
  let cx = x;
  if (o.align === 'center') cx = x - (s.length * CHAR_W * scale) / 2;
  else if (o.align === 'right') cx = x - s.length * CHAR_W * scale;

  /*
   * An outline rather than a drop shadow, when asked for one.
   *
   * The HUD is drawn over the level, and the level might be a black cave or a
   * pale blue sky. White text with a shadow to one side is legible on the
   * first and nearly invisible on the second; white text with a dark ring all
   * the way round is legible on both, which is the only requirement a score
   * counter has.
   */
  if (o.outline) {
    for (let dx = -scale; dx <= scale; dx += scale) {
      for (let dy = -scale; dy <= scale; dy += scale) {
        if (!dx && !dy) continue;
        drawText(ctx, s, cx + dx, y + dy, { ...o, align: 'left', color: o.outline, outline: null, shadow: null });
      }
    }
  } else if (o.shadow) {
    drawText(ctx, s, cx + scale, y + scale, { ...o, align: 'left', color: o.shadow, shadow: null });
  }

  ctx.fillStyle = color;
  for (let i = 0; i < s.length; i++) {
    const bytes = BITS.get(s[i]) || MISSING;
    const gx = cx + i * CHAR_W * scale;
    for (let row = 0; row < 7; row++) {
      const b = bytes[row];
      if (!b) continue;
      /* Runs of set bits are drawn as one rectangle. Most glyph rows are one
         or two runs, so this roughly halves the call count. */
      let col = 0;
      while (col < 5) {
        if (!(b & (1 << col))) { col++; continue; }
        let end = col;
        while (end < 5 && (b & (1 << end))) end++;
        ctx.fillRect(gx + col * scale, y + row * scale, (end - col) * scale, scale);
        col = end;
      }
    }
  }
  return s.length * CHAR_W * scale;
}

export function textWidth(text, scale) {
  return String(text).length * CHAR_W * (scale || 1);
}

/* Zero-padded numbers, which is how every counter in this game is displayed:
   a score that changes width makes the whole HUD twitch. */
export function pad(n, width) {
  const s = String(Math.max(0, Math.floor(n)));
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}
