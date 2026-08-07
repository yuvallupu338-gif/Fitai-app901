/*
 * hud.js — the four numbers, and the cards between levels.
 *
 * The layout is the arcade one and the reasons are still good: score on the
 * left because it only grows, coins next to it because they feed it, the
 * level in the middle because it is the thing you would read out loud, and
 * the clock on the right where a number counting down is easiest to ignore
 * until it matters.
 *
 * All of it is drawn over the level rather than in a bar above it. The top
 * two rows of every map are kept clear for exactly this, which is why the
 * level height is fifteen tiles and not thirteen.
 */

import { drawText, pad } from './font.js';
import { SCREEN_W, SCREEN_H } from '../game/constants.js';

const WHITE = '#FCFCFC';
const SHADOW = '#000000';
/* Every counter is drawn ringed in black so it reads over a cave and over a
   sky without the HUD needing to know which one it is on. */
const RING = { color: WHITE, outline: SHADOW };

export function drawHud(ctx, world, run, frame) {
  const level = world.level;

  drawText(ctx, 'MARIO', 24, 16, RING);
  drawText(ctx, pad(run.score, 6), 24, 24, RING);

  /* The coin counter blinks its symbol, which is the one piece of motion in
     an otherwise static HUD and stops the whole strip reading as an image. */
  const coinMark = (frame >> 3) & 1 ? '¢' : ' ';
  drawText(ctx, `${coinMark}×${pad(run.coins, 2)}`, 88, 24, RING);

  drawText(ctx, 'WORLD', 144, 16, RING);
  drawText(ctx, level.name || '1-1', 152, 24, RING);

  drawText(ctx, 'TIME', 200, 16, RING);
  /* Under a hundred the clock turns red, before the music changes. */
  const low = world.timeLeft <= 100;
  drawText(ctx, pad(world.timeLeft, 3), 208, 24, {
    color: low && (frame >> 2) & 1 ? '#FC5438' : WHITE,
    outline: SHADOW,
  });

  for (const f of world.effects) {
    if (f.text === undefined) continue;
    drawText(ctx, f.text, f.x - world.camera.x + 8, f.y, {
      color: WHITE, outline: SHADOW, align: 'center',
    });
  }
}

/* ------------------------------------------------------------------ *
 * The cards
 * ------------------------------------------------------------------ */

export function drawLevelCard(ctx, def, run, worldName) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  drawText(ctx, `WORLD ${def.name}`, SCREEN_W / 2, 88, { color: WHITE, align: 'center' });
  drawText(ctx, worldName, SCREEN_W / 2, 104, { color: '#FCD8A8', align: 'center' });

  /* The little sprite of the player next to the life count is the original's
     way of saying "this is you" without a word of text. It is drawn by the
     caller, which has the atlas; here we leave the room for it. */
  drawText(ctx, `×  ${run.lives}`, SCREEN_W / 2 + 4, 136, { color: WHITE, align: 'center' });
}

export function drawClearCard(ctx, world, run, def) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawText(ctx, 'COURSE CLEAR', SCREEN_W / 2, 72, { color: WHITE, align: 'center' });
  drawText(ctx, `WORLD ${def.name}`, SCREEN_W / 2, 92, { color: '#FCD8A8', align: 'center' });
  drawText(ctx, `TIME BONUS  ${pad(world.timeLeft * 50, 5)}`, SCREEN_W / 2, 120,
    { color: WHITE, align: 'center' });
  drawText(ctx, `SCORE  ${pad(run.score, 6)}`, SCREEN_W / 2, 136, { color: WHITE, align: 'center' });
}

export function drawGameOver(ctx, run) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawText(ctx, 'GAME OVER', SCREEN_W / 2, 100, { color: WHITE, align: 'center' });
  drawText(ctx, `SCORE  ${pad(run.score, 6)}`, SCREEN_W / 2, 124, { color: '#FCD8A8', align: 'center' });
  drawText(ctx, 'PRESS START', SCREEN_W / 2, 156, { color: WHITE, align: 'center' });
}

export function drawPause(ctx) {
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.globalAlpha = 1;
  drawText(ctx, 'PAUSE', SCREEN_W / 2, 108, { color: WHITE, align: 'center' });
  drawText(ctx, 'ENTER TO GO ON', SCREEN_W / 2, 128, { color: '#8898C0', align: 'center' });
  drawText(ctx, 'ESC TWICE TO QUIT', SCREEN_W / 2, 140, { color: '#8898C0', align: 'center' });
}
