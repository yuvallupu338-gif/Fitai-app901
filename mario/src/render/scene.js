/*
 * scene.js — one frame of the world, back to front.
 *
 * Order: sky, scenery, tiles, entities, player, effects, water tint. Anything
 * that reads wrong is almost always an ordering mistake rather than a drawing
 * one — a Piranha Plant in front of its pipe, a coin popping behind the block
 * it came out of.
 *
 * Only the visible columns are drawn. A level is up to 260 tiles wide and the
 * screen shows sixteen of them, so drawing the whole map would be sixteen
 * times the work for the same picture; the loop is bounded by the camera,
 * which is what keeps this at 60Hz on a phone.
 *
 * The hills, bushes, clouds and fences are drawn with rectangles rather than
 * from the sprite atlas. They are large, they are pure silhouette, and they
 * change colour with the theme — which is three lines of arithmetic here and
 * would be forty pieces of near-identical art otherwise.
 */

import { TILE, SCREEN_W, SCREEN_H } from '../game/constants.js';
import { T, tileArt } from '../game/tiles.js';
import { THEMES } from './palettes.js';

const BUMP_HEIGHT = 6;
const BUMP_FRAMES = 10;

export function createRenderer(ctx, atlas, drawSprite) {
  /* ---------------------------------------------------------------- *
   * Backgrounds
   * ---------------------------------------------------------------- */

  function sky(theme, camera, frame) {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    if (theme.scenery === 'night') {
      /* Stars, placed by a hash of their column so they hold still relative
         to the world instead of swimming as the camera moves. */
      ctx.fillStyle = '#FCFCFC';
      const base = Math.floor(camera.x / 3);
      for (let i = 0; i < 40; i++) {
        const h = (i * 2654435761) >>> 0;
        const x = ((h % 900) - base) % 300;
        const sx = x < 0 ? x + 300 : x;
        if (sx > SCREEN_W) continue;
        const sy = 8 + ((h >> 9) % 90);
        const twinkle = ((frame >> 4) + i) % 7 !== 0;
        if (twinkle) ctx.fillRect(sx, sy, 1, 1);
      }
    }
    if (theme.scenery === 'sea') {
      /* Light shafts. Cheap, and they are what says "underwater" before a
         single bubble is drawn. */
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#FCFCFC';
      for (let i = 0; i < 6; i++) {
        const x = ((i * 61 - camera.x * 0.3) % 320 + 320) % 320 - 32;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 14, 0);
        ctx.lineTo(x + 40, SCREEN_H);
        ctx.lineTo(x + 20, SCREEN_H);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------------------------------------------------------- *
   * Scenery, drawn as shapes
   * ---------------------------------------------------------------- */

  function scenery(level, theme, camera) {
    for (const d of level.scenery) {
      const x = Math.round(d.x - camera.x);
      if (x < -80 || x > SCREEN_W + 16) continue;
      const y = Math.round(d.y);
      switch (d.kind) {
        case 'hill': hill(x, y, d.big ? 5 : 3, theme); break;
        case 'bush': bush(x, y, d.w || 2, theme); break;
        case 'cloud': cloud(x, y, d.w || 2, theme); break;
        case 'fence': fence(x, y, d.w || 3, theme); break;
        case 'tree': tree(x, y, d.big, theme); break;
        case 'cactus': cactus(x, y, theme); break;
        case 'snowman': snowman(x, y); break;
        case 'weed': weed(x, y, d.h || 2, theme); break;
        default: break;
      }
    }
  }

  /* A stepped trapezoid, not a triangle: the steps are what make it read as
     tiles rather than as vector art dropped into a pixel game. */
  function hill(x, y, h, theme) {
    const unit = 8;
    ctx.fillStyle = theme.hill;
    for (let r = 0; r < h; r++) {
      const wide = (h - r) * 2 + 1;
      ctx.fillRect(x - (wide * unit) / 2 + unit * h, y - r * unit - unit, wide * unit, unit);
    }
    ctx.fillStyle = theme.hillLight;
    ctx.fillRect(x + unit * h - unit, y - h * unit + unit, unit, unit);
    ctx.fillRect(x + unit * h - unit * 2, y - unit * 2, unit, unit);
    ctx.fillRect(x + unit * h, y - unit * 3, unit, unit);
  }

  function bush(x, y, w, theme) {
    ctx.fillStyle = theme.bush;
    for (let i = 0; i < w; i++) {
      ctx.fillRect(x + i * 16, y - 8, 16, 8);
      ctx.fillRect(x + i * 16 + 4, y - 14, 8, 6);
    }
    ctx.fillRect(x - 4, y - 6, 4, 6);
    ctx.fillRect(x + w * 16, y - 6, 4, 6);
  }

  function cloud(x, y, w, theme) {
    ctx.fillStyle = theme.cloud;
    for (let i = 0; i < w; i++) {
      ctx.fillRect(x + i * 16, y + 6, 16, 10);
      ctx.fillRect(x + i * 16 + 4, y, 10, 8);
    }
    ctx.fillRect(x - 6, y + 8, 6, 8);
    ctx.fillRect(x + w * 16, y + 8, 6, 8);
  }

  function fence(x, y, w, theme) {
    ctx.fillStyle = theme.hillLight;
    ctx.fillRect(x, y - 14, w * 16, 3);
    for (let i = 0; i < w * 2; i++) ctx.fillRect(x + i * 8 + 2, y - 18, 4, 18);
  }

  function tree(x, y, big, theme) {
    const h = big ? 48 : 32;
    ctx.fillStyle = theme.hill;
    ctx.fillRect(x - 2, y - h, 20, h - 12);
    ctx.fillRect(x + 2, y - h - 6, 12, 8);
    ctx.fillStyle = '#503000';
    ctx.fillRect(x + 6, y - 14, 5, 14);
  }

  function cactus(x, y, theme) {
    ctx.fillStyle = theme.bush;
    ctx.fillRect(x + 5, y - 34, 6, 34);
    ctx.fillRect(x, y - 26, 5, 4);
    ctx.fillRect(x, y - 26, 4, 12);
    ctx.fillRect(x + 11, y - 20, 5, 4);
    ctx.fillRect(x + 12, y - 20, 4, 10);
  }

  function snowman(x, y) {
    ctx.fillStyle = '#FCFCFC';
    ctx.fillRect(x, y - 12, 14, 12);
    ctx.fillRect(x + 2, y - 22, 10, 10);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 4, y - 19, 2, 2);
    ctx.fillRect(x + 8, y - 19, 2, 2);
    ctx.fillRect(x + 1, y - 24, 12, 2);
    ctx.fillRect(x + 3, y - 27, 8, 3);
  }

  function weed(x, y, h, theme) {
    ctx.fillStyle = theme.bush;
    for (let i = 0; i < h; i++) {
      ctx.fillRect(x + (i % 2 ? 4 : 0), y - 8 - i * 8, 4, 8);
    }
  }

  /* ---------------------------------------------------------------- *
   * Tiles
   * ---------------------------------------------------------------- */

  function tiles(level, themeName, camera, frame, bumps) {
    const first = Math.max(0, Math.floor(camera.x / TILE));
    const last = Math.min(level.w - 1, Math.ceil((camera.x + SCREEN_W) / TILE));

    /* Bumped blocks are a short list, so a lookup map costs less than testing
       every drawn tile against it. */
    let bumpMap = null;
    if (bumps && bumps.length) {
      bumpMap = new Map();
      for (const b of bumps) bumpMap.set(b.row * level.w + b.col, b.t);
    }

    for (let row = 0; row < level.h; row++) {
      for (let col = first; col <= last; col++) {
        const t = level.at(col, row);
        if (t === T.EMPTY) continue;
        const art = tileArt(t, frame, THEMES[themeName]);
        if (!art) continue;
        let y = row * TILE;
        if (bumpMap) {
          const bt = bumpMap.get(row * level.w + col);
          /* Up and back down over ten frames: a block that only went up
             would read as the block moving, not as it being hit. */
          if (bt !== undefined) y -= Math.sin((bt / BUMP_FRAMES) * Math.PI) * BUMP_HEIGHT;
        }
        drawSprite(art, themeName, col * TILE - camera.x, y);
      }
    }
  }

  /* The flag on the pole. It hangs at the top until the player catches it,
     then rides down with them — which is the whole animation. */
  function flag(level, themeName, camera, player) {
    const goal = level.goal;
    if (!goal || goal.type !== 'flag') return;
    let y = goal.y + 16;
    if (player.state === 'flag') y = Math.max(goal.y + 16, player.y);
    else if (player.state === 'walk' || player.state === 'done') y = goal.base - 32;
    drawSprite('flag', themeName, goal.x - camera.x - 16, y);
  }

  /* ---------------------------------------------------------------- *
   * Things
   * ---------------------------------------------------------------- */

  function entity(e, camera, themeName, frame) {
    const s = e.sprite ? e.sprite() : null;
    if (!s) return;
    const x = e.x - camera.x;
    const y = e.y;

    /* The three that are not a single blit. */
    if (s.name === 'platform_lift') { lift(e, camera, themeName); return; }
    if (s.name === 'firebar') { firebar(e, camera); return; }
    if (s.clipTop !== undefined) { plant(e, s, camera); return; }

    if (s.wings) {
      drawSprite(s.wings, s.pal, x - 10, y - 2, false);
      drawSprite(s.wings, s.pal, x + e.w - 6, y - 2, true);
    }
    if (s.spin !== undefined) {
      ctx.save();
      ctx.translate(Math.round(x + 8), Math.round(y + 8));
      ctx.rotate(s.spin * 0.35);
      drawSprite(s.name, s.pal, -8, -8, false);
      ctx.restore();
      return;
    }
    if (e.flipped || s.flipY) {
      /* Killed enemies fall upside down. */
      ctx.save();
      ctx.translate(0, Math.round(y * 2 + e.h));
      ctx.scale(1, -1);
      drawSprite(s.name, s.pal, x + (s.ox || 0), y, s.flip);
      ctx.restore();
      return;
    }
    drawSprite(s.name, s.pal, x + (s.ox || 0), y + (s.oy || 0), s.flip);
  }

  function lift(e, camera, themeName) {
    for (let i = 0; i < e.tiles; i++) {
      drawSprite('platform', themeName, e.x - camera.x + i * TILE, e.y - 1);
    }
  }

  function firebar(e, camera) {
    for (let i = 0; i < e.balls.length; i++) {
      const b = e.balls[i];
      drawSprite(i & 1 ? 'fireball1' : 'fireball0', 'fireball', b.x - camera.x, b.y);
    }
    /* The pivot, so the bar visibly comes out of something. */
    ctx.fillStyle = '#FC9838';
    ctx.fillRect(Math.round(e.x - camera.x - 2), Math.round(e.y - 2), 4, 4);
  }

  /* A Piranha Plant is drawn clipped to the part that is above its pipe, so
     it looks like it is coming out of the pipe rather than sliding in front
     of it. Cheaper and more robust than re-drawing the pipe over the top. */
  function plant(e, s, camera) {
    const visible = e.h - s.clipTop;
    if (visible <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SCREEN_W, Math.round(e.pipeTop));
    ctx.clip();
    drawSprite(s.name, s.pal, e.x - camera.x - 8, e.y, s.flip);
    ctx.restore();
  }

  function effect(f, camera, themeName, frame) {
    if (f.text !== undefined) return;             // score pops are drawn by the HUD
    /* Tagged with a flag rather than tested by class name: these files are
       served raw, but a name check is the kind of thing that survives every
       test and then breaks the first time anybody puts a minifier in front
       of it. */
    if (f.isDebris) {
      ctx.save();
      ctx.translate(Math.round(f.x - camera.x + 4), Math.round(f.y + 4));
      ctx.rotate(f.anim * 0.3);
      drawSprite('debris', themeName, -4, -4);
      ctx.restore();
      return;
    }
    if (f.isCoinPop) {
      const spin = ['coin0', 'coin1', 'coin2', 'coin1'][(f.t >> 1) & 3];
      drawSprite(spin, 'coin', f.x - camera.x, f.y);
      return;
    }
    const s = f.sprite ? f.sprite() : null;
    if (!s) return;
    drawSprite(s.name, s.pal, f.x - camera.x + (s.ox || 0), f.y + (s.oy || 0), s.flip);
  }

  function player(p, camera, frame) {
    if (!p.visible(frame)) return;
    const s = p.spriteName();
    const pal = p.paletteName(frame);
    /* Sprites are anchored bottom-centre on the hitbox: the big and small
       bodies are different heights and different widths, and anchoring at
       the top-left would make growing look like a jump. */
    const info = atlas.index.get(`${s}@${pal}`);
    const sw = info ? info.w : 16;
    const sh = info ? info.h : 16;
    const x = p.x + p.w / 2 - sw / 2 - camera.x;
    const y = p.y + p.h - sh;
    drawSprite(s, pal, x, y, p.facing < 0);
  }

  /* ---------------------------------------------------------------- *
   * Water
   * ---------------------------------------------------------------- */

  function waterTint(level, camera, frame) {
    if (!level.water && level.waterLine === undefined) return;
    const top = level.water ? 0 : level.waterLine * TILE;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#2038EC';
    ctx.fillRect(0, top, SCREEN_W, SCREEN_H - top);
    ctx.globalAlpha = 1;
    if (!level.water) {
      /* A moving surface line, so a pond does not look like a flat blue box. */
      ctx.fillStyle = '#BCE0FC';
      for (let x = 0; x < SCREEN_W; x += 8) {
        const wobble = Math.sin((x + camera.x + frame * 1.5) * 0.08) * 1.5;
        ctx.fillRect(x, Math.round(top + wobble), 8, 2);
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * The whole frame
   * ---------------------------------------------------------------- */

  function draw(world, frame) {
    const level = world.level;
    const themeName = THEMES[level.theme] ? level.theme : 'overworld';
    const theme = THEMES[themeName];
    const camera = world.camera;

    sky(theme, camera, frame);
    scenery(level, theme, camera);
    tiles(level, themeName, camera, frame, world.bumps);
    flag(level, themeName, camera, world.player);

    /* Items still emerging from a block draw behind the tiles they are
       coming out of; everything else draws in front. */
    for (const f of world.effects) if (f.isItem && f.emerging) effect(f, camera, themeName, frame);
    for (const e of world.entities) {
      if (!e.active) continue;
      entity(e, camera, themeName, frame);
    }
    for (const f of world.effects) if (!f.isItem || !f.emerging) effect(f, camera, themeName, frame);

    player(world.player, camera, frame);
    waterTint(level, camera, frame);

    return { themeName, camera };
  }

  return { draw, scorePops: (world) => world.effects.filter((f) => f.text !== undefined) };
}
