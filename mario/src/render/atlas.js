/*
 * atlas.js — turns the art tables into one texture, once, at boot.
 *
 * Every frame in art.*.js is a grid of letters, and every letter needs a
 * colour from a palette. Doing that lookup at draw time would mean a fillRect
 * per pixel per sprite per frame — tens of thousands of canvas calls a frame,
 * which is exactly how a 256x240 game manages to drop frames on a machine
 * that renders 3D for a living.
 *
 * So it is resolved once: every (art, palette) pair the game can ask for is
 * rasterised into a single offscreen canvas at load, and drawing a sprite is
 * one drawImage out of it. The build writes straight into an ImageData buffer
 * rather than calling the 2D context per pixel, which takes the whole thing
 * from a visible pause to a few milliseconds.
 *
 * The palette-per-variant approach is what makes the tileset work: `brick` is
 * one drawing, and ten themes ask for it with ten palettes, so the atlas ends
 * up holding ten bricks that are guaranteed to be the same brick.
 */

import { ALL_PLAYER_ART } from './art.player.js';
import { ENEMY_ART } from './art.enemies.js';
import { ITEM_ART } from './art.items.js';
import { TILE_ART } from './art.tiles.js';
import { SPRITE_PAL, THEMES, CYCLE } from './palettes.js';

const ATLAS_W = 512;

/* Which palettes each family of art needs. Anything not listed gets only the
   palette the art declares. */
const PLAYER_PALS = ['mario', 'fire', 'star1', 'star2', 'star3'];

const ENEMY_PALS = {
  goomba0: ['goomba', 'goombaBlue', 'goombaGray'],
  goomba1: ['goomba', 'goombaBlue', 'goombaGray'],
  goomba_flat: ['goomba', 'goombaBlue', 'goombaGray'],
  koopa0: ['koopa', 'koopaRed', 'koopaBlue', 'buzzy'],
  koopa1: ['koopa', 'koopaRed', 'koopaBlue', 'buzzy'],
  shell: ['koopa', 'koopaRed', 'koopaBlue', 'buzzy'],
  shell_wake: ['koopa', 'koopaRed', 'koopaBlue', 'buzzy'],
  wing0: ['koopa', 'koopaRed', 'koopaBlue', 'buzzy'],
  wing1: ['koopa', 'koopaRed', 'koopaBlue', 'buzzy'],
  piranha0: ['piranha', 'piranhaRed'],
  piranha1: ['piranha', 'piranhaRed'],
  cheep0: ['cheep', 'cheepGray'],
  cheep1: ['cheep', 'cheepGray'],
  boss0: ['boss', 'bossAngry'],
  boss1: ['boss', 'bossAngry'],
};

const ITEM_PALS = {
  mushroom: ['mushroom', 'oneUp'],
  flower: CYCLE.flower,
  star_item: CYCLE.starItem,
};

function hexToRGBA(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  /* Little-endian ABGR, which is what a Uint32 view of an RGBA ImageData
     wants on every platform this runs on. */
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

export function buildAtlas() {
  /* 1. Collect every (art, palette) pair. */
  const reqs = [];
  const add = (name, art, palName, palObj) => {
    reqs.push({ key: `${name}@${palName}`, art, pal: palObj });
  };

  for (const [name, art] of Object.entries(ALL_PLAYER_ART)) {
    for (const p of PLAYER_PALS) add(name, art, p, SPRITE_PAL[p]);
  }
  for (const [name, art] of Object.entries(ENEMY_ART)) {
    for (const p of ENEMY_PALS[name] || [art.pal]) add(name, art, p, SPRITE_PAL[p]);
  }
  for (const [name, art] of Object.entries(ITEM_ART)) {
    for (const p of ITEM_PALS[name] || [art.pal]) add(name, art, p, SPRITE_PAL[p]);
  }
  for (const [name, art] of Object.entries(TILE_ART)) {
    for (const [themeName, theme] of Object.entries(THEMES)) add(name, art, themeName, theme);
  }

  /* 2. Shelf-pack. Sorting by height first keeps the shelves tight; with a
     fixed 512 width this wastes a few percent and costs nothing to compute. */
  reqs.sort((a, b) => b.art.h - a.art.h || b.art.w - a.art.w);
  let x = 0;
  let y = 0;
  let shelfH = 0;
  for (const r of reqs) {
    if (x + r.art.w > ATLAS_W) { x = 0; y += shelfH; shelfH = 0; }
    r.x = x;
    r.y = y;
    x += r.art.w;
    if (r.art.h > shelfH) shelfH = r.art.h;
  }
  const height = y + shelfH;

  /* 3. Rasterise. */
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const img = ctx.createImageData(ATLAS_W, height);
  const px = new Uint32Array(img.data.buffer);

  const index = new Map();
  const colorCache = new Map();
  for (const r of reqs) {
    const { art, pal } = r;
    for (let row = 0; row < art.h; row++) {
      const line = art.rows[row];
      const base = (r.y + row) * ATLAS_W + r.x;
      for (let col = 0; col < art.w; col++) {
        const ch = line[col];
        if (ch === '.' || ch === ' ' || ch === undefined) continue;
        const hex = pal[ch];
        if (!hex) continue;
        let c = colorCache.get(hex);
        if (c === undefined) { c = hexToRGBA(hex); colorCache.set(hex, c); }
        px[base + col] = c;
      }
    }
    index.set(r.key, { x: r.x, y: r.y, w: art.w, h: art.h });
  }
  ctx.putImageData(img, 0, 0);

  return { canvas, index, width: ATLAS_W, height };
}

/*
 * The one call the whole renderer goes through.
 *
 * `flip` mirrors horizontally, which is why there is exactly one drawing of
 * every walk cycle instead of two that drift apart. It costs a save/restore
 * and a negative scale, and only sprites that are actually facing left pay it.
 */
export function makeDrawSprite(atlas, ctx) {
  const { canvas, index } = atlas;
  return function drawSprite(name, pal, dx, dy, flip, alpha) {
    const s = index.get(`${name}@${pal}`);
    if (!s) return false;
    if (alpha !== undefined && alpha < 1) {
      ctx.globalAlpha = alpha;
    }
    if (flip) {
      ctx.save();
      ctx.translate(Math.round(dx) + s.w, Math.round(dy));
      ctx.scale(-1, 1);
      ctx.drawImage(canvas, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
      ctx.restore();
    } else {
      ctx.drawImage(canvas, s.x, s.y, s.w, s.h, Math.round(dx), Math.round(dy), s.w, s.h);
    }
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = 1;
    return true;
  };
}
