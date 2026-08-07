/*
 * mario-bot.js — the test player.
 *
 * Injected into the page by tools/mario-smoke.mjs and used by both of its
 * modes: the rendered one, which steps at sixty frames a second through the
 * real loop, and `--all`, which drives world.update() in a tight loop so a
 * hundred levels take twenty seconds instead of forty minutes. Same bot in
 * both, so a level that passes one cannot fail the other for bot reasons.
 *
 * It is not trying to be a good player. It answers one question — can a body
 * get from the start of this level to the flag — and it answers it with star
 * power on, permanently, so that enemies cannot decide the result. Pits, lava
 * and walls still kill, because those are the level's geometry and geometry is
 * the thing being tested.
 *
 * The interesting part is the lifts. A pit spanned by a moving platform is
 * eight tiles of nothing as far as any look-ahead is concerned, and a bot that
 * only knows how to jump will die in it every time. So it does what a player
 * does: stops at the edge, waits for the platform to come to it, steps on,
 * rides, and gets off at the far end.
 */

(function attach(global) {
  const JUMP_TRIGGER = 20;      // px from the hazard the jump starts
  const FULL_HOLD = 16;         // frames of held A for a maximum jump
  const LOOKAHEAD = 6;          // tiles
/* Long enough to release the button so the next press is a fresh edge, and
   no longer: eight frames is a quarter of the time it takes to cross a small
   island, and the bot spent it standing on the far edge unable to jump. */
const COOLDOWN = 2;

  function makeBot(api) {
    const { isSolid, isSemiSolid } = api.tiles;

    /* The row a body standing in this column would rest on, searching down
       from `from`. -1 means there is nothing to stand on at all. */
    function standRow(level, col, from) {
      for (let y = Math.max(0, from); y < level.h; y++) {
        const t = level.at(col, y);
        if (isSolid(t) || isSemiSolid(t)) return y;
      }
      return -1;
    }

    /* The first column at or after `col` that has a floor again. */
    function farSideOf(level, col) {
      for (let x = col; x < col + 24 && x < level.w; x++) {
        if (standRow(level, x, 0) >= 0) return x;
      }
      return -1;
    }

    return {
      /* Per-frame state the bot carries between calls. */
      fresh() {
        return { jumpFor: 0, cooldown: 0, since: 0, best: -Infinity, waiting: false };
      },

      /*
       * One frame of decisions. Reads the world, writes to the input, and
       * returns nothing — the caller advances the simulation.
       */
      step(world, input, s) {
        const p = world.player;
        const level = world.level;
        p.starTimer = 999999;

        if (p.x > s.best + 2) { s.best = p.x; s.since = 0; } else s.since++;

        const col = Math.floor((p.x + p.w) / 16);
        const footRow = Math.floor((p.y + p.h) / 16);
        const myFloor = standRow(level, col, footRow);

        /* What is coming, how far away, and how much jump it needs. */
        let dangerAt = -1;
        let dangerCol = -1;
        let isPit = false;
        let hold = FULL_HOLD;
        for (let d = 0; d <= LOOKAHEAD; d++) {
          const r = standRow(level, col + d, footRow - 1);
          if (r < 0) { dangerAt = (col + d) * 16; dangerCol = col + d; isPit = true; break; }
          if (myFloor >= 0 && r < myFloor) {
            dangerAt = (col + d) * 16;
            dangerCol = col + d;
            /* A one-tile step needs a hop, not a full jump. Spending the
               maximum on it is what strands the bot in mid-air over the pit
               that comes straight after, with no ground left to jump from. */
            hold = Math.min(14, 3 + (myFloor - r) * 3);
            break;
          }
        }
        for (const e of world.entities) {
          if (!e.active || e.dead || e.isPlatform || e.isSpring) continue;
          if (Math.abs(e.y - p.y) > 26) continue;
          const dx = e.x - (p.x + p.w);
          if (dx > 0 && dx < 40 && (dangerAt < 0 || e.x < dangerAt)) { dangerAt = e.x; hold = 9; }
        }
        const gap = dangerAt < 0 ? 9999 : dangerAt - (p.x + p.w);

        /* --- lifts --- */
        const lift = this.liftFor(world, p);
        const riding = lift && p.onGround
          && Math.abs((p.y + p.h) - lift.y) < 8
          && p.x + p.w > lift.x + 1 && p.x < lift.x + lift.w - 1;

        if (riding) {
          /* Ride until the far side is inside a jump, then go. Holding right
             the whole way walks off the front of the platform. */
          const far = dangerCol >= 0 ? farSideOf(level, dangerCol) : -1;
          const farX = far >= 0 ? far * 16 : -1;
          const ahead = standRow(level, Math.floor((p.x + p.w + 20) / 16), footRow - 1);
          if (ahead >= 0 || (farX >= 0 && farX - (p.x + p.w) < 56)) {
            input.press('right');
            if (p.onGround && s.jumpFor === 0 && s.cooldown === 0) { s.jumpFor = FULL_HOLD; s.cooldown = COOLDOWN; }
          } else {
            input.release('right');
            input.release('a');
            s.jumpFor = 0;
            /* Riding is progress even though x may not be changing much. */
            s.since = 0;
            return;
          }
        } else if (isPit && lift && gap < 40 && gap > -8) {
          /* Standing at the edge of a pit a lift serves: wait for it rather
             than jumping into it. */
          const reachable = lift.x <= p.x + p.w + 10 && lift.x + lift.w > p.x - 4
            && Math.abs(lift.y - (p.y + p.h)) < 26;
          if (!reachable) {
            input.release('right');
            input.release('a');
            s.since = 0;                 // waiting is not being stuck
            return;
          }
          input.press('right');
        } else {
          input.press('right');
        }

        input.press('b');

        /* --- jumping and swimming --- */
        if (p.underwater) {
          if (s.jumpFor > 0) { s.jumpFor--; input.press('a'); } else {
            input.release('a');
            if (s.cooldown > 0) s.cooldown--;
            else if (gap < 48 || p.y > 130 || s.since > 8) { s.jumpFor = 2; s.cooldown = 7; }
          }
          return;
        }
        if (s.jumpFor > 0) { s.jumpFor--; input.press('a'); return; }
        input.release('a');
        if (s.cooldown > 0) { s.cooldown--; return; }
        if (p.onGround && (gap < JUMP_TRIGGER || s.since > 8)) {
          s.jumpFor = s.since > 8 ? FULL_HOLD : hold;
          s.cooldown = COOLDOWN;
        }
      },

      /* The nearest lift ahead that could be stood on. */
      liftFor(world, p) {
        let best = null;
        for (const e of world.entities) {
          if (!e.isPlatform || !e.active) continue;
          if (e.x + e.w < p.x - 24) continue;
          if (e.x > p.x + 200) continue;
          if (e.y < p.y - 40 || e.y > p.y + 80) continue;
          if (!best || e.x < best.x) best = e;
        }
        return best;
      },

      release(input) {
        input.release('right');
        input.release('a');
        input.release('b');
      },

      /*
       * Every level, headless. Returns one row per level saying whether the
       * bot finished it and, if not, how far it got and what stopped it.
       */
      runAll(opts) {
        const o = opts || {};
        const maxFrames = o.maxFrames || 9000;
        const tries = o.attempts || 4;
        const first = o.from || 1;
        const last = o.to || 100;
        const out = [];

        for (let id = first; id <= last; id++) {
          let cleared = false;
          let furthest = 0;
          let levelW = 0;
          let reason = 'ran out of frames';
          let used = 0;

          for (let attempt = 0; attempt < tries && !cleared; attempt++) {
            used = attempt + 1;
            api.startLevel(id, false);
            api.skipCard();
            const w = api.world;
            const p = w.player;
            const s = this.fresh();
            s.best = p.x;
            levelW = w.level.w * 16;

            for (let f = 0; f < maxFrames; f++) {
              this.step(w, api.input, s);
              w.update();
              api.input.flush();
              if (p.x > furthest) furthest = p.x;
              if (w.state === 'clear' || w.state === 'finished') { cleared = true; break; }
              if (w.state === 'dead') { reason = `died at ${Math.round(p.x)}`; break; }
              if (w.state === 'timeup') { reason = 'ran out of time'; break; }
              if (s.since > 500) { reason = `stuck at ${Math.round(p.x)}`; break; }
            }
            this.release(api.input);
            api.input.flush();
          }
          out.push({ id, cleared, furthest: Math.round(furthest), levelW, attempts: used, reason });
        }
        api.goTitle();
        return out;
      },
    };
  }

  global.__makeMarioBot = makeBot;
}(typeof window !== 'undefined' ? window : globalThis));
