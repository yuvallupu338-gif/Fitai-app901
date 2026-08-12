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
import { Entities, BEHAVIOUR } from './game/entities.js';
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
    this.coarsePointer = !!(window.matchMedia
      && window.matchMedia('(pointer: coarse)').matches);
    /* A device with no mouse. Everything about the control scheme, the default
     * quality and the pointer-lock prompt hangs off this one flag. */
    this.touchMode = this.coarsePointer
      || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
    this.perf = { window: 0, frames: 0, sum: 0, floor: 0.5 };
    this.rotateDismissed = false;

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

    document.body.classList.toggle('touch', this.touchMode);
    if (this.touchMode) {
      document.querySelector('.hint').innerHTML =
        'חצי מסך שמאלי — <b>הליכה</b> · חצי ימני — <b>מבט</b> · '
        + '<b>E</b> הרמה וירידה לרמה הבאה · <b>🔦</b> פנס · <b>⭡</b> קפיצה · '
        + '<b>רץ</b> ו<b>כפוף</b> נדלקים ונכבים · <b>❚❚</b> תפריט. '
        + 'למסך מלא באייפון: שתף ← הוסף למסך הבית.';
    }
    this.wire();
    this.wireTouch();
    this.watchOrientation();
    this.watchVisibility();
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

    on('#btn-start', () => { this.goFullscreen(); this.enterLevel(0); });
    on('#btn-continue', () => {
      this.goFullscreen();
      this.enterLevel(store.load().current || 0);
    });
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

    this.ui.onPick = (id) => { this.goFullscreen(); this.enterLevel(id); };

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

  /*
   * On-screen controls. Each button presses the same key its keyboard
   * equivalent does, so nothing downstream has a mobile code path.
   *
   * `tap` buttons fire once — interact, jump, torch. `hold` buttons are
   * toggles rather than press-and-hold: keeping a thumb pinned to "run" while
   * the same hand is steering is not something a human hand does, and a toggle
   * that shows its state is both easier and clearer.
   *
   * Bound to pointer events rather than touch events so the same code works
   * under a mouse — which is what makes it testable at all.
   */
  wireTouch() {
    const layer = document.querySelector('#touch');
    if (!layer) return;

    for (const btn of layer.querySelectorAll('.tbtn[data-key]')) {
      const key = btn.dataset.key;
      const mode = btn.dataset.mode;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (mode === 'hold') btn.classList.toggle('on', this.input.toggle(key));
        else this.input.tap(key);
      });
      /* Stop a stray pointerup from reaching the canvas and being read as a
       * tap on the world. */
      btn.addEventListener('pointerup', (e) => { e.preventDefault(); e.stopPropagation(); });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    const pause = document.querySelector('#t-pause');
    if (pause) {
      pause.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.pause();
      });
    }

    const rotateOk = document.querySelector('#rotate-ok');
    if (rotateOk) {
      rotateOk.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.rotateDismissed = true;
        document.querySelector('#rotate').hidden = true;
      });
    }
  }

  /* Toggles that survive a level change have to be cleared with it, or you
   * arrive on the next level already crouching with no indication why. */
  resetHeldToggles() {
    for (const btn of document.querySelectorAll('.tbtn[data-mode="hold"]')) {
      btn.classList.remove('on');
      this.input.hold(btn.dataset.key, false);
    }
  }

  /*
   * Best-effort fullscreen. iPhone Safari has no Fullscreen API at all — the
   * meta tags in index.html are what handle it there, once the page is added
   * to the home screen — so every step of this is allowed to fail silently.
   */
  goFullscreen() {
    if (!this.touchMode) return;
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        const p = el.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      }
    } catch { /* not permitted here */ }
    try {
      if (screen.orientation && screen.orientation.lock) {
        const p = screen.orientation.lock('landscape');
        if (p && p.catch) p.catch(() => {});
      }
    } catch { /* only allowed in fullscreen, and not on iOS */ }
  }

  /*
   * A phone screen dims and then locks after thirty seconds of no touches, and
   * walking with a joystick produces no touches at all as far as the OS is
   * concerned. Without this the screen goes dark mid-corridor.
   */
  async keepAwake() {
    try {
      if (navigator.wakeLock && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
      }
    } catch { /* denied, unsupported, or not visible — all fine */ }
  }

  releaseAwake() {
    if (this.wakeLock) {
      try { this.wakeLock.release(); } catch { /* already gone */ }
      this.wakeLock = null;
    }
  }

  /* Switching apps mid-level should stop the world, not leave something
   * hunting you in a pocket — and should let go of the audio hardware. */
  watchVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.releaseAwake();
        if (this.state === 'play') this.pause();
        if (this.audio.ctx && this.audio.ctx.state === 'running') {
          this.audio.ctx.suspend().catch(() => {});
        }
      } else if (this.state === 'play') {
        this.keepAwake();
        if (this.audio.ctx && this.audio.ctx.state === 'suspended') {
          this.audio.ctx.resume().catch(() => {});
        }
      }
    });
  }

  watchOrientation() {
    const rotate = document.querySelector('#rotate');
    const update = () => {
      if (!rotate) return;
      const portrait = window.innerHeight > window.innerWidth;
      rotate.hidden = !(this.touchMode && portrait && this.state === 'play'
        && !this.rotateDismissed);
    };
    this.updateOrientation = update;
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', () => setTimeout(update, 120));
  }

  /*
   * Adaptive resolution. A phone that cannot hold the frame rate gets a
   * smaller render target rather than a slideshow; it only ever goes down, so
   * it cannot oscillate, and it stops at half resolution because below that
   * the fog starts to band.
   */
  adaptQuality(dt) {
    const p = this.perf;
    p.window += dt;
    p.frames++;
    p.sum += 1 / Math.max(dt, 0.001);
    if (p.window < 3) return;
    const avg = p.sum / p.frames;
    p.window = 0; p.frames = 0; p.sum = 0;
    if (avg >= 26) return;
    const q = this.renderer.quality;
    if (q.renderScale <= p.floor + 0.001) return;
    q.renderScale = Math.max(p.floor, Math.round((q.renderScale - 0.1) * 100) / 100);
    this.renderer.width = 0;          /* force the targets to rebuild */
    this.ui.log(`איכות הורדה ל-${Math.round(q.renderScale * 100)}% כדי לשמור על קצב`);
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
    bind('#set-hints', 'hints');
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
    set('#set-hints', s.hints);
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
    /* Face the most open direction. Deterministic (it reads the generated
     * geometry, not a clock), so two runs of the same level still frame
     * identically and a rendering regression cannot hide in the framing. */
    this.player.yaw = this.world.openDirection(spawn.x, spawn.z);
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
    this.resetHeldToggles();
    this.keepAwake();
    if (this.updateOrientation) this.updateOrientation();
    await this.ui.fade(false);
    this.ui.log(`Level ${level.id} — ${level.name}`);
    this.ui.toast(`<b>Level ${level.id} · ${level.name}</b><br>${level.note}`, 5200);
    if (!this.touchMode) this.input.requestLock();
  }

  descend(reason) {
    if (this.loading) return;
    const next = this.level.id + 1;
    this.audio.descend();
    if (next >= LEVELS.length) {
      this.finish();
      return;
    }
    this.ui.log(reason);
    this.enterLevel(next);
  }

  /* Out the bottom of Level 99. There has to be something on the other side of
   * a hundred levels, or the last no-clip point is just another loading
   * screen. */
  finish() {
    const st = store.load();
    this.state = 'done';
    this.input.releaseLock();
    this.releaseAwake();
    this.ui.finished({
      levels: st.visited.length,
      distance: Math.round(this.player ? this.player.distance : 0),
      notes: this.player ? this.player.notes : 0,
      almond: this.player ? this.player.almond : 0,
    });
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.input.releaseLock();
    /* Drop the stick and any held toggle, or the player resumes already
     * walking into a wall. */
    this.input.touch.move = null;
    this.input.touch.look = null;
    this.resetHeldToggles();
    this.releaseAwake();
    this.ui.setPauseWhere(this.level);
    this.ui.show('pause');
    if (this.updateOrientation) this.updateOrientation();
  }

  resume() {
    if (!this.level) return;
    this.state = 'play';
    this.ui.show(null);
    if (!this.touchMode) this.input.requestLock();
    this.keepAwake();
    if (this.updateOrientation) this.updateOrientation();
  }

  toMenu() {
    this.state = 'menu';
    this.input.releaseLock();
    this.input.touch.move = null;
    this.input.touch.look = null;
    this.ui.show('menu');
    if (this.updateOrientation) this.updateOrientation();
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

    if (this.state === 'play') {
      this.update(dt);
      this.adaptQuality(dt);
    }
    if (this.world && this.level) this.render(dt);
    if (this.touchMode) this.drawStick();
    this.input.endFrame();
  }

  /* The joystick is drawn in the DOM rather than the canvas: it has to sit
   * under the thumb wherever the thumb landed, and moving one absolutely
   * positioned element is cheaper than any of the alternatives. */
  drawStick() {
    const el = this.stickEl || (this.stickEl = document.querySelector('#stick'));
    if (!el) return;
    const m = this.input.touch.move;
    if (!m || this.state !== 'play') {
      if (el.classList.contains('on')) el.classList.remove('on');
      return;
    }
    el.classList.add('on');
    el.style.transform =
      `translate(${m.ox}px, ${m.oy}px)`;
    el.firstElementChild.style.transform =
      `translate(${m.x * 34}px, ${m.y * 34}px)`;
  }

  update(dt) {
    const { world, player, entities, level, ui, audio, input } = this;

    const light = this.lightAt(player.pos.x, player.cameraY, player.pos.z);
    player.update(dt, input, world, level, light);

    if (input.hit('KeyF')) {
      const on = player.toggleFlashlight();
      audio.tone(on ? 880 : 620, 0.05, 0.06, 'square', 0.1);
    }
    if (input.hit('KeyH')) this.useHint();
    this.updateGuide(dt);

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
        else if (e.type === 'lunge') {
          /* The one moment a lurker is loud. Everything about it up to here
           * was designed to be mistaken for scenery. */
          audio.lunge();
          ui.log('משהו שעמד בלי לזוז — זז.');
        } else if (e.type === 'drop') {
          audio.lunge();
          ui.log('משהו ירד מהתקרה.');
        } else if (e.type === 'latch') {
          audio.hurt();
          ui.log('משהו נתפס בך. תרוץ.');
        } else if (e.type === 'shaken') {
          ui.log('הוא נפל.');
        } else if (e.type === 'grab') {
          audio.lunge();
          ui.log('משהו תפס אותך. אתה לא זז.');
        } else if (e.type === 'released') {
          ui.log('הוא הרפה. זוז עכשיו.');
        }
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
    if (!input.locked && !this.touchMode) prompt = 'לחץ על המסך כדי לקבל שליטה בעכבר';
    ui.prompt(prompt);

    const danger = entities
      ? clamp(1 - entities.nearest(player.pos.x, player.pos.z) / 22, 0, 1) : 0;
    this.danger = danger;
    audio.tick(dt, { sanity: player.sanity, danger });

    ui.updateHUD(player,
      `${Math.round(this.fps)} fps · ${this.renderer.stats.chunks} chunks · `
      + `${Math.round(this.renderer.stats.tris / 1000)}k tris · ${this.renderer.stats.lights} lights`);
  }

  /*
   * The guide: which way the nearest way down is, and how far.
   *
   * The search is the expensive half, so it runs on a timer rather than every
   * frame; the bearing is recomputed every frame because it has to track the
   * head. Radius grows when nothing is found nearby, so a level that happens
   * to have no exit within fifty metres still eventually points somewhere
   * instead of silently giving up.
   */
  updateGuide(dt) {
    const el = this.guideEl || (this.guideEl = document.querySelector('#guide'));
    if (!el) return;
    const { player, world } = this;

    if (!store.settings().hints) {
      el.hidden = true;
      this.guideTarget = null;
      /* Zero rather than left running, so switching hints back on searches on
       * the very next frame. Otherwise the guide stays blank for up to a
       * second and change after the toggle, which reads as a setting that did
       * not work. */
      this.guideTimer = 0;
      return;
    }

    this.guideTimer = (this.guideTimer ?? 0) - dt;
    if (this.guideTimer <= 0) {
      this.guideTimer = 1.2;
      const near = world.findExitNear(player.pos.x, player.pos.z, 2);
      this.guideTarget = near || world.findExitNear(player.pos.x, player.pos.z, 4);
    }
    if (!this.guideTarget) { el.hidden = true; return; }

    const ex = this.guideTarget.exit.x - player.pos.x;
    const ez = this.guideTarget.exit.z - player.pos.z;
    const dist = Math.hypot(ex, ez);

    /* Into the player's own frame, so the needle points where their head is
     * pointing rather than at a fixed compass north. */
    const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
    const fwd = ex * -sy + ez * -cy;
    const right = ex * cy + ez * -sy;
    const angle = Math.atan2(right, fwd);

    el.hidden = false;
    el.classList.toggle('close', dist < 12);
    /* Faint at range: a bright permanent marker turns the level into a
     * corridor with an arrow in it, which is not what anyone came for. */
    el.classList.toggle('faint', dist > 55 && this.hintFlash <= 0);
    const arrow = this.guideArrowEl
      || (this.guideArrowEl = document.querySelector('#guide-arrow'));
    arrow.style.transform = `rotate(${angle}rad)`;
    const distEl = this.guideDistEl
      || (this.guideDistEl = document.querySelector('#guide-dist'));
    distEl.textContent = `${Math.round(dist)}m`;

    this.hintFlash = Math.max(0, (this.hintFlash || 0) - dt);

    /* A ping that quickens as you close, so the way down can be found with the
     * phone in one hand and your eyes anywhere. */
    this.pingTimer = (this.pingTimer ?? 0) - dt;
    if (this.pingTimer <= 0 && dist < 40) {
      this.pingTimer = 0.35 + (dist / 40) * 2.6;
      this.audio.tone(440 + (1 - dist / 40) * 520, 0.05,
        0.012 + (1 - dist / 40) * 0.03, 'sine', 0.35);
    }
  }

  /* The hint button: search wider, flare the needle, and say something. */
  useHint() {
    if (!store.settings().hints) {
      this.ui.log('הרמזים כבויים בהגדרות.');
      return;
    }
    const found = this.world.findExitNear(this.player.pos.x, this.player.pos.z, 6);
    this.guideTarget = found;
    this.guideTimer = 1.2;
    this.hintFlash = 4;
    this.audio.tone(660, 0.14, 0.07, 'triangle', 0.5);
    if (!found) {
      this.ui.log('שום דבר לא מושך. תמשיך ללכת.');
      return;
    }
    const d = found.dist;
    this.ui.log(d < 12 ? 'זה ממש כאן.'
      : d < 40 ? `משהו מושך — בערך ${Math.round(d)} מטר.`
        : `רחוק. בערך ${Math.round(d)} מטר לכיוון החץ.`);
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
      /* Same falloff constant as the shader — if these drift, sanity drains in
       * rooms that look brightly lit. */
      sum += l.intensity * w * w / (1 + d * d * 0.18);
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
      if (entities) entities.dynamics(this.dynamics, cam);
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
      /*
       * The red closes in before anything touches you. Being hit is a spike on
       * top of a floor that rises as something gets near — which is the only
       * warning you get in a level where you cannot see past the fog, and is
       * worth far more than the hit itself.
       */
      damage: Math.max(player ? player.damage : 0, (this.danger || 0) * 0.30),
      dynamics: this.dynamics,
      ambientScale: 1,
      lightScale: 1,
      /*
       * A torch you hold in your hand throws a wide, soft pool of light with a
       * hot centre — it is not a stage spot. The first version of this was 13°
       * and 32°, which lit nothing that was not dead ahead: standing on a
       * platform in a void level, the floor under your own feet stayed black
       * and the level read as broken rather than as dark.
       */
      flashlight: {
        on: player ? player.flashlightOn : false,
        intensity: 3.0,
        inner: 19,
        outer: 47,
        range: 26,
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
 * enter a level, wait for it to settle, look at what came out. The behaviour
 * table goes with it so the tests can stage a kind without keeping their own
 * copy of which model belongs to which monster. */
window.backrooms = new Game();
window.backrooms.BEHAVIOUR = BEHAVIOUR;
