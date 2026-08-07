/*
 * screens.js — everything that is not a level: the title, the level grid, and
 * the ending.
 *
 * The level select is the piece that a hundred levels actually needs. Four
 * levels a world for twenty-five worlds is not a thing anybody can navigate
 * one stage at a time, so it is a ten by ten grid of every level at once,
 * with the state of each in its colour: cleared, open, or locked. The whole
 * run fits on one screen, which is the only way the number 100 stops being a
 * threat and starts being a map.
 */

import { drawText, pad } from './render/font.js';
import { SCREEN_W, SCREEN_H } from './game/constants.js';
import { CATALOG, worldName } from './levels/catalog.js';
import { save } from './core/save.js';

const WHITE = '#FCFCFC';
const DIM = '#7C7C7C';
const GOLD = '#FCD8A8';
const GREEN = '#B8F818';

/* ------------------------------------------------------------------ *
 * Title
 * ------------------------------------------------------------------ */

export function createTitleScreen(ctx, drawSprite, audio, input) {
  let t = 0;

  return {
    enter() { t = 0; audio.playMusic('title'); },

    update(input) {
      t++;
      if (input.pressed('start') || input.pressed('a')) {
        audio.sfx('select');
        return 'select';
      }
      return null;
    },

    draw(frame) {
      ctx.fillStyle = '#5C94FC';
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

      /* A strip of ground and a few blocks, so the title screen is made of
         the same material as the game rather than being a slide. */
      for (let x = 0; x < SCREEN_W; x += 16) {
        drawSprite('ground_soil', 'overworld', x, SCREEN_H - 32);
        drawSprite('ground_soil', 'overworld', x, SCREEN_H - 16);
      }
      /* Kept left of where the centred text runs, so PRESS START does not
         end up printed across a question block. */
      drawSprite('qblock0', 'overworld', 24, SCREEN_H - 96);
      drawSprite('brick', 'overworld', 40, SCREEN_H - 96);
      drawSprite('qblock0', 'overworld', 56, SCREEN_H - 96);
      drawSprite('pipe_lip_l', 'overworld', 192, SCREEN_H - 64);
      drawSprite('pipe_lip_r', 'overworld', 208, SCREEN_H - 64);
      drawSprite('pipe_body_l', 'overworld', 192, SCREEN_H - 48);
      drawSprite('pipe_body_r', 'overworld', 208, SCREEN_H - 48);

      /* The player idles under the blocks, and hops every couple of
         seconds — a title screen with nothing moving on it looks broken. */
      const hop = (frame % 150) < 20 ? -Math.abs(Math.sin((frame % 150) / 20 * Math.PI)) * 24 : 0;
      drawSprite('big_idle', 'mario', 60, SCREEN_H - 64 + hop);
      drawSprite('goomba0', 'goomba', 140, SCREEN_H - 48);

      ctx.fillStyle = '#000000';
      ctx.fillRect(24, 40, SCREEN_W - 48, 60);
      ctx.fillStyle = '#E45C10';
      ctx.fillRect(26, 42, SCREEN_W - 52, 56);
      ctx.fillStyle = '#000000';
      ctx.fillRect(30, 46, SCREEN_W - 60, 48);

      drawText(ctx, 'SUPER', SCREEN_W / 2, 52, { color: GOLD, align: 'center', scale: 2 });
      drawText(ctx, 'JUMP BROS', SCREEN_W / 2, 72, { color: WHITE, align: 'center', scale: 2 });

      drawText(ctx, '100 LEVELS', SCREEN_W / 2, 108, { color: WHITE, align: 'center' });
      drawText(ctx, `TOP  ${pad(save.highScore, 6)}`, SCREEN_W / 2, 124, { color: GOLD, align: 'center' });
      drawText(ctx, `CLEARED  ${pad(save.clearedCount, 3)} / 100`, SCREEN_W / 2, 136,
        { color: save.clearedCount ? GREEN : DIM, align: 'center' });

      if ((frame >> 4) & 1) {
        drawText(ctx, 'PRESS START', SCREEN_W / 2, 160, { color: WHITE, align: 'center' });
      }
      /* A pad reports nothing until one of its buttons is pressed, so this
         line appearing is the confirmation that it is really connected. */
      if (input && input.gamepad) {
        drawText(ctx, 'GAMEPAD READY', SCREEN_W / 2, 200, { color: GREEN, align: 'center' });
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * The grid
 * ------------------------------------------------------------------ */

const COLS = 10;
const ROWS = 10;
const CELL_W = 22;
const CELL_H = 15;
const GRID_X = (SCREEN_W - COLS * CELL_W) / 2;
const GRID_Y = 44;

export function createSelectScreen(ctx, drawSprite, audio) {
  let cursor = 0;

  function move(d) {
    const next = cursor + d;
    if (next < 0 || next >= 100) return;
    cursor = next;
    audio.sfx('move');
  }

  return {
    enter() {
      /* Opens on the furthest level reached rather than on level 1, because
         after the first session that is always where the player is going. */
      cursor = Math.min(99, Math.max(0, save.current - 1));
      audio.playMusic('title');
    },

    update(input) {
      if (input.pressed('left')) move(-1);
      if (input.pressed('right')) move(1);
      if (input.pressed('up')) move(-COLS);
      if (input.pressed('down')) move(COLS);
      if (input.pressed('start') || input.pressed('a')) {
        const id = cursor + 1;
        if (id <= save.unlocked) {
          audio.sfx('select');
          save.setCurrent(id);
          return { go: 'play', id };
        }
        audio.sfx('bump');
      }
      if (input.pressed('b')) return 'title';
      return null;
    },

    get selected() { return cursor + 1; },

    draw(frame) {
      ctx.fillStyle = '#101018';
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

      drawText(ctx, 'SELECT A LEVEL', SCREEN_W / 2, 16, { color: WHITE, align: 'center' });
      drawText(ctx, `${save.clearedCount} CLEARED    TOP ${pad(save.highScore, 6)}`,
        SCREEN_W / 2, 28, { color: DIM, align: 'center' });

      for (let i = 0; i < 100; i++) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = GRID_X + col * CELL_W;
        const y = GRID_Y + row * CELL_H;
        const id = i + 1;
        const rec = save.level(id);
        const locked = id > save.unlocked;
        const isCastle = CATALOG[i].castle;

        let color = DIM;
        if (rec.cleared) color = GREEN;
        else if (!locked) color = WHITE;

        if (i === cursor) {
          /* The cursor is a filled box rather than an outline: at 22 pixels
             wide an outline and a border are the same two pixels. */
          ctx.fillStyle = (frame >> 3) & 1 ? '#FCD8A8' : '#E45C10';
          ctx.fillRect(x - 1, y - 2, CELL_W - 1, CELL_H - 1);
          color = '#000000';
        } else if (isCastle) {
          ctx.fillStyle = '#2C2C3C';
          ctx.fillRect(x - 1, y - 2, CELL_W - 1, CELL_H - 1);
        }

        drawText(ctx, locked ? '--' : pad(id, id < 100 ? 2 : 3), x + 1, y, { color });
      }

      /* What the cursor is sitting on. */
      const def = CATALOG[cursor];
      const rec = save.level(cursor + 1);
      const locked = cursor + 1 > save.unlocked;
      const y = GRID_Y + ROWS * CELL_H + 10;
      drawText(ctx, `WORLD ${def.name}  ${worldName(def.world)}`, SCREEN_W / 2, y,
        { color: locked ? DIM : GOLD, align: 'center' });
      drawText(ctx, `${def.theme.toUpperCase()}${def.castle ? '  CASTLE' : ''}`,
        SCREEN_W / 2, y + 12, { color: DIM, align: 'center' });
      if (rec.cleared) {
        drawText(ctx, `BEST ${pad(rec.bestTime, 3)}   COINS ${pad(rec.coins, 2)}`,
          SCREEN_W / 2, y + 24, { color: GREEN, align: 'center' });
      } else if (locked) {
        drawText(ctx, 'LOCKED', SCREEN_W / 2, y + 24, { color: DIM, align: 'center' });
      } else {
        drawText(ctx, 'START TO PLAY', SCREEN_W / 2, y + 24, { color: WHITE, align: 'center' });
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * The ending
 * ------------------------------------------------------------------ */

export function createEndingScreen(ctx, drawSprite, audio) {
  let t = 0;

  return {
    enter() { t = 0; audio.playJingle('ending'); },

    update(input) {
      t++;
      if (t > 120 && (input.pressed('start') || input.pressed('a'))) return 'title';
      return null;
    },

    draw(frame) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

      /* Fireworks, because the ending of this kind of game has fireworks. */
      for (let i = 0; i < 6; i++) {
        const life = (frame + i * 37) % 120;
        if (life > 60) continue;
        const cx = 40 + ((i * 2654435761) >>> 0) % (SCREEN_W - 80);
        const cy = 30 + ((i * 40503) >>> 0) % 90;
        const r = life * 0.9;
        ctx.fillStyle = ['#FCD8A8', '#FC5438', '#B8F818', '#3CBCFC'][i % 4];
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          ctx.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), 2, 2);
        }
      }

      drawText(ctx, 'THANK YOU', SCREEN_W / 2, 128, { color: WHITE, align: 'center', scale: 2 });
      drawText(ctx, 'ALL 100 LEVELS CLEARED', SCREEN_W / 2, 156, { color: GOLD, align: 'center' });
      drawText(ctx, `FINAL SCORE  ${pad(save.highScore, 6)}`, SCREEN_W / 2, 176,
        { color: WHITE, align: 'center' });
      if (t > 120 && (frame >> 4) & 1) {
        drawText(ctx, 'PRESS START', SCREEN_W / 2, 200, { color: DIM, align: 'center' });
      }
    },
  };
}
