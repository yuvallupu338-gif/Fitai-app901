/*
 * main.js — boot, the loop, and the rules that are not any one system's job.
 *
 * The loop is the usual shape: fixed order, variable delta, clamped so that a
 * tab left in the background does not resume by teleporting the player through
 * a wall. Everything interesting lives in the modules; what is here is the
 * wiring between them and the handful of decisions that need all of them at
 * once — what counts as being lit, what happens when you walk into a no-clip
 * point, and what happens when you run out of floor.
 */

import { Renderer } from './render/renderer.js';
import { parseColor } from './render/textures.js';
import { World } from './world/world.js';
import { Player } from './game/player.js';
import { Entities } from './game/entities.js';
import { GameAudio } from './game/audio.js';
import { Input } from './game/input.js';
import { LEVELS, getLevel } from './data/levels.js';
import { UI } from './ui/ui.js';
import * as store from './ui/store.js';
import { clamp } from './core/math.js';

const canvas = document.querySelector('#view');

class Game {
  constructor() {
    this.ui = new UI();
    this.input = new Input(canvas);
    this.audio = new GameAudio();
    this.state = 'menu';
    this.time = 0;
    this.last = 0;
    this.fps = 60;
    this.level = null;
    this.world = null;
    this.player = null;
    this.entities = null;
    this.dynamics = [];
    this.lightBuf = new Array(16);
    this.loading = false;
    this.coarsePointer = window.matchMedia
      && window.matchMedia('(pointer: coarse)').matches;

    const s = store.settings();
    try {
      this.renderer = new Renderer(canvas, {
        renderScale: s.renderScale,
        textureSize: s.textureSize,
        shadowLights: s.shadowLights,
        bloom: s.bloom,
      });
    } catch (err) {
      this.fatal(err);
      return;
    }
    this.input.sensitivity = 0.0022 * s.sensitivity;
    this.input.invertY = s.invertY;
    this.audio.setMuted(s.muted);

    this.wire();
    this.ui.markVisited(store.load().visited, store.load().deepest);
    if (store.load().current !== null) {
      document.querySelector('#btn-continue').hidden = false;
      document.querySelector('#btn-continue').textContent =
        `המשך · Level ${store.load().current}`;
    }
    this.ui.show('menu');
    requestAnimationFrame((t) => this.frame(t));
  }

  fatal(err) {
    console.error(err);
    document.querySelector('#ui').innerHTML =
      `<section class="screen"><div class="menu-wrap"><h2>הדפדפן הזה לא תומך ב-WebGL2</h2>
       <p class="sub">המשחק מרנדר תלת־ממד בזמן אמת וזקוק ל-WebGL2. נסה דפדפן עדכני,
       או הפעל האצת חומרה בהגדרות.</p>
       <p class="credits">${String(err && err.message || err)}</p></div></section>`;
  }

  /* ---------------------------------------------------------------- *
   * Wiring
   * ---------------------------------------------------------------- */

  wire() {
    const on = (sel, fn) => document.querySelector(sel).addEventListener('click', fn);

    on('#btn-start', () => this.enterLevel(0));
    on('#btn-continue', () => this.enterLevel(store.load().current || 0));
    on('#btn-levels', () => { this.refreshLevels(); this.ui.show('levels'); });
    on('#btn-levels-back', () => this.ui.show(this.level && this.state !== 'menu' ? 'pause' : 'menu'));
    on('#btn-settings', () => { this.fillSettings(); this.ui.show('settings'); });
    on('#btn-settings-back', () => this.ui.show(this.level && this.state !== 'menu' ? 'pause' : 'menu'));
    on('#btn-resume', () => this.resume());
    on('#btn-pause-levels', () => { this.refreshLevels(); this.ui.show('levels'); });
    on('#btn-pause-settings', () => { this.fillSettings(); this.ui.show('settings'); });
    on('#btn-quit', () => this.toMenu());
    on('#btn-retry', () => this.enterLevel(this.level.id));
    on('#btn-dead-menu', () => this.toMenu());
    on('#btn-reset', () => {
      store.reset();
      this.ui.markVisited([], 0);
      this.fillSettings();
      this.ui.toast('ההתקדמות אופסה.');
    });

    this.ui.onPick = (id) => this.enterLevel(id);

    /* Clicking the view is how you take control back; losing pointer lock is
     * how the game learns you pressed Escape. */
    canvas.addEventListener('click', () => {
      if (this.state === 'play' && !this.input.locked) this.input.requestLock();
    });
    this.input.onUnlock = () => {
      if (this.state === 'play') this.pause();
    };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'paused' && this.ui.current === 'pause') {
        this.resume();
      }
    });

    this.bindSettings();
  }

  bindSettings() {
    const s = store.settings();
    const bind = (sel, key, transform, after) => {
      const el = document.querySelector(sel);
      const read = () => (el.type === 'checkbox' ? el.checked
        : transform ? transform(el.value) : el.value);
      el.addEventListener('input', () => {
        s[key] = read();
        store.save();
        if (after) after(s[key]);
        this.fillSettings();
      });
    };
    bind('#set-sens', 'sensitivity', Number, (v) => { this.input.sensitivity = 0.0022 * v; });
    bind('#set-scale', 'renderScale', Number, (v) => {
      this.renderer.quality.renderScale = v;
      this.renderer.width = 0;      /* force the targets to rebuild */
    });
    bind('#set-tex', 'textureSize', Number, () => {
      this.ui.toast('איכות הטקסטורות תיכנס לתוקף ברמה הבאה שתיטען.');
    });
    bind('#set-shadow', 'shadowLights', Number, (v) => {
      this.renderer.quality.shadowLights = v;
    });
    bind('#set-bloom', 'bloom', null, (v) => { this.renderer.quality.bloom = v; });
    bind('#set-vhs', 'vhs');
    bind('#set-invert', 'invertY', null, (v) => { this.input.invertY = v; });
    bind('#set-mute', 'muted', null, (v) => this.audio.setMuted(v));
    bind('#set-entities', 'entities');
  }

  fillSettings() {
    const s = store.settings();
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    };
    set('#set-sens', s.sensitivity);
    set('#set-scale', s.renderScale);
    set('#set-tex', s.textureSize);
    set('#set-shadow', s.shadowLights);
    set('#set-bloom', s.bloom);
    set('#set-vhs', s.vhs);
    set('#set-invert', s.invertY);
    set('#set-mute', s.muted);
    set('#set-entities', s.entities);
    document.querySelector('#out-sens').textContent = s.sensitivity.toFixed(2);
    document.querySelector('#out-scale').textContent = `${Math.round(s.renderScale * 100)}%`;
  }

  refreshLevels() {
    const st = store.load();
    this.ui.markVisited(st.visited, st.deepest);
  }

  /* ---------------------------------------------------------------- *
   * Level lifecycle
   * ---------------------------------------------------------------- */

  async enterLevel(id, opts = {}) {
    if (this.loading) return;
    try {
      await this.loadLevel(id, opts);
    } catch (err) {
      /* A level that fails to build must not leave the game wedged with
       * `loading` stuck true — that turns one bad chunk into a dead app. */
      console.error(err);
      this.loading = false;
      this.state = 'menu';
      this.ui.show('menu');
      await this.ui.fade(false);
      this.ui.toast(`הרמה לא נטענה: ${String(err && err.message || err)}`, 7000);
    }
  }

  async loadLevel(id, opts = {}) {
    this.loading = true;
    this.state = 'loading';
    this.input.releaseLock();

    await this.audio.start();
    const level = getLevel(id);
    await this.ui.fade(true);
    this.ui.show('loading');
    this.ui.setLoading(0, 'בונה חומרים…', `Level ${level.id} · ${level.name}`);

    const s = store.settings();
    this.renderer.quality.textureSize = s.textureSize;
    await this.renderer.setLevel(level, (p, kind) => {
      this.ui.setLoading(p * 0.6, `חומר: ${kind}`);
    });

    if (this.world) this.world.dispose();
    this.world = new World(level,
      (data) => this.renderer.uploadMesh(data),
      (mesh) => this.renderer.releaseMesh(mesh));

    /* Find somewhere to stand before meshing, so the chunks that get built
     * are the ones around the spawn rather than around the origin. */
    const spawn = this.world.findSpawn(
      opts.x ?? (level.id * 137.3), opts.z ?? (level.id * 61.7));
    this.player = new Player(spawn);
    this.player.yaw = Math.random() * Math.PI * 2;
    if (level.flashlight) this.player.flashlightOn = true;

    const total = 8;
    for (let i = 0; i < total; i++) {
      this.world.update(spawn.x, spawn.z, 6);
      this.ui.setLoading(0.6 + 0.4 * ((i + 1) / total), 'מרכיב את החדרים…');
      await new Promise((r) => setTimeout(r, 0));
    }

    this.entities = new Entities(level, this.world);
    if (!s.entities) this.entities.max = 0;
    this.audio.setLevel(level);
    this.level = level;

    store.visit(level.id);
    this.refreshLevels();
    document.querySelector('#btn-continue').hidden = false;
    document.querySelector('#btn-continue').textContent = `המשך · Level ${level.id}`;

    this.ui.setLevelCard(level);
    this.ui.show(null);
    this.state = 'play';
    this.loading = false;
    await this.ui.fade(false);
    this.ui.log(`Level ${level.id} — ${level.name}`);
    this.ui.toast(`<b>Level ${level.id} · ${level.name}</b><br>${level.note}`, 5200);
    this.input.requestLock();
  }

  descend(reason) {
    if (this.loading) return;
    const next = this.level.id + 1;
    this.audio.descend();
    if (next >= LEVELS.length) {
      this.ui.toast('הגעת לסף שמתחת. אין רמה 100.', 6000);
      setTimeout(() => this.toMenu(), 1800);
      return;
    }
    this.ui.log(reason);
    this.enterLevel(next);
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.input.releaseLock();
    this.ui.setPauseWhere(this.level);
    this.ui.show('pause');
  }

  resume() {
    if (!this.level) return;
    this.state = 'play';
    this.ui.show(null);
    this.input.requestLock();
  }

  toMenu() {
    this.state = 'menu';
    this.input.releaseLock();
    this.ui.show('menu');
  }

  /* ---------------------------------------------------------------- *
   * Frame
   * ---------------------------------------------------------------- */

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    this.last = now;
    this.time += dt;
    this.fps += ((1 / Math.max(dt, 0.001)) - this.fps) * 0.06;

    if (this.state === 'play') this.update(dt);
    if (this.world && this.level) this.render(dt);
    this.input.endFrame();
  }

  update(dt) {
    const { world, player, entities, level, ui, audio, input } = this;

    const light = this.lightAt(player.pos.x, player.cameraY, player.pos.z);
    player.update(dt, input, world, level, light);

    if (input.hit('KeyF')) {
      const on = player.toggleFlashlight();
      audio.tone(on ? 880 : 620, 0.05, 0.06, 'square', 0.1);
    }

    world.update(player.pos.x, player.pos.z, 2);
    if (entities) entities.update(dt, player, world, this.time);

    for (const e of player.events) {
      if (e.type === 'step') audio.step(e.wet, e.fast);
      else if (e.type === 'land') audio.land(e.hard);
      else if (e.type === 'void') this.descend('נפלת דרך הרצפה.');
      else if (e.type === 'died') {
        audio.hurt();
        ui.died(level, 'לא יצאת');
        this.state = 'dead';
        input.releaseLock();
      } else if (e.type === 'battery-dead') {
        ui.log('הסוללה נגמרה.');
      }
    }
    if (entities) {
      for (const e of entities.events) {
        if (e.type === 'cue') audio.cue(e.kind, e.dist);
        else if (e.type === 'hit') { audio.hurt(); ui.log('משהו נגע בך.'); }
        else if (e.type === 'freeze') ui.log('הוא עצר כשהסתכלת.');
      }
    }

    /* ---- pickups and the way down ---- */
    let prompt = null;
    for (const item of world.itemsNear(player.pos.x, player.pos.z, 2.2)) {
      const d = Math.hypot(item.x - player.pos.x, item.z - player.pos.z);
      if (d > 1.35) continue;
      prompt = `<b>E</b> ${
        item.kind === 'almond' ? 'מי שקדים'
        : item.kind === 'battery' ? 'סוללה' : 'פתק'}`;
      if (input.hit('KeyE')) {
        world.take(item);
        audio.pickup();
        if (item.kind === 'almond') {
          player.almond++;
          player.sanity = clamp(player.sanity + 0.45, 0, 1);
          player.health = clamp(player.health + 0.25, 0, 1);
          ui.log('מי שקדים. הראש מתבהר.');
        } else if (item.kind === 'battery') {
          player.battery = 1;
          ui.log('סוללה חדשה.');
        } else {
          player.notes++;
          ui.log(NOTES[(player.notes + level.id) % NOTES.length]);
        }
        prompt = null;
      }
      break;
    }

    const exit = world.nearestExit(player.pos.x, player.pos.z, 3.5);
    if (exit && exit.dist < 1.6) {
      prompt = '<b>E</b> לרדת דרך הפתח';
      if (input.hit('KeyE')) this.descend('ירדת רמה.');
    }
    /*
     * Pointer lock can only be requested from a fresh user gesture, and
     * loading a level takes far longer than a gesture stays valid — so after
     * a level swap the mouse is dead until the player clicks. Without this
     * line that reads as a broken game rather than as a missing click.
     */
    if (!input.locked && !this.coarsePointer) prompt = 'לחץ על המסך כדי לקבל שליטה בעכבר';
    ui.prompt(prompt);

    const danger = entities
      ? clamp(1 - entities.nearest(player.pos.x, player.pos.z) / 22, 0, 1) : 0;
    audio.tick(dt, { sanity: player.sanity, danger });

    ui.updateHUD(player,
      `${Math.round(this.fps)} fps · ${this.renderer.stats.chunks} chunks · `
      + `${Math.round(this.renderer.stats.tris / 1000)}k tris · ${this.renderer.stats.lights} lights`);
  }

  /* How brightly lit the player is, in the renderer's own units. Used for
   * sanity, so it has to agree with what the screen shows: the same falloff
   * as the shader, plus the level's ambient. */
  lightAt(x, y, z) {
    const n = this.world.gatherLights(x, y, z, 16, this.lightBuf);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const l = this.lightBuf[i];
      const d = Math.hypot(l.x - x, l.y - y, l.z - z);
      const w = Math.max(0, 1 - d / l.radius);
      sum += l.intensity * w * w / (1 + d * d * 0.35);
    }
    const amb = parseColor(this.level.ambient);
    sum += (amb[0] * 0.21 + amb[1] * 0.72 + amb[2] * 0.07) * 2.2;
    return clamp(sum, 0, 2);
  }

  render(dt) {
    const { player, level, entities } = this;
    const cam = player ? player.camera()
      : { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0, fov: 74 };

    this.dynamics.length = 0;
    if (this.world && player) {
      for (const item of this.world.itemsNear(player.pos.x, player.pos.z, 34)) {
        this.dynamics.push({
          mesh: item.kind === 'almond' ? 'almond' : item.kind === 'battery' ? 'battery' : 'note',
          x: item.x,
          y: item.y + (item.kind === 'note' ? 0.01 : 0.02 + Math.sin(this.time * 1.6) * 0.02),
          z: item.z,
          rot: item.kind === 'note' ? 0.6 : this.time * 0.7,
          scale: 1,
        });
      }
      if (entities) entities.dynamics(this.dynamics);
    }

    const s = store.settings();
    const sanity = player ? player.sanity : 1;
    this.renderer.render(this.world, cam, {
      time: this.time,
      exposure: level.exposure * (1 + (1 - sanity) * 0.12),
      bloom: 0.55,
      bloomThreshold: 0.95,
      vignette: 0.34,
      grain: level.grain,
      aberration: level.aberration,
      vhs: Math.max(level.vhs, s.vhs ? 0.55 : 0),
      sanity,
      damage: player ? player.damage : 0,
      dynamics: this.dynamics,
      ambientScale: 1,
      lightScale: 1,
      flashlight: {
        on: player ? player.flashlightOn : false,
        intensity: 2.6,
        inner: 13,
        outer: 32,
        range: 24,
      },
    });
    void dt;
  }
}

/* Scraps of paper, in the register of the ones people actually write down
 * there: practical, and no help at all. */
const NOTES = [
  'פתק: "אל תלך לכיוון הזמזום."',
  'פתק: "ספרתי 400 חדרים. אותו חדר."',
  'פתק: "אם המים חמים — תחזור."',
  'פתק: "הוא לא זז כשמסתכלים."',
  'פתק: "רמה 5 היא לא מלון."',
  'פתק: "שתיתי. עדיין כאן."',
  'פתק: "אם אתה קורא את זה — גם אני חשבתי שיש יציאה."',
  'פתק: "הרצפה במקומות מסוימים לא באמת שם."',
];

/* Exposed so the smoke test can drive the game the way a player would —
 * enter a level, wait for it to settle, look at what came out. */
window.backrooms = new Game();
