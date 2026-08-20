/*
 * main.js — boot, the loop, and the rules that are nobody else's job.
 *
 * The shape of a night is the shape of this file:
 *
 *   day     you wake in the afternoon, walk the street, talk to whoever is in
 *           their garden, read whatever is lying about, and go to bed. The
 *           puzzle answers are out here, and this is the only place to get
 *           them. It has no timer and nothing is hunting you.
 *   night   3:30. The whistle starts. At 3:31 a flag appears somewhere in the
 *           neighbourhood and at 3:35 the whistle stops. Bring it through your
 *           own front door before that happens.
 *   reset   she sees you, or the clock runs out. Same screen either way,
 *           because it is the same outcome: back to bed, 3:30, again.
 *
 * Everything interesting lives in the modules. What is here is the wiring, and
 * the handful of decisions that need all of them at once: what counts as being
 * lit, what pressing E means where you are standing, and what happens in the
 * half second after she screams.
 */

import { Renderer } from './render/renderer.js';
import { buildLayout } from './world/layout.js';
import { buildWorld } from './world/build.js';
import { Player } from './game/player.js';
import { Input } from './game/input.js';
import { GameAudio } from './game/audio.js';
import { Whistler, STATE } from './game/whistler.js';
import { Neighbours, screamLoudness } from './game/neighbours.js';
import { Flag, FLAG } from './game/flag.js';
import { Clock, DayClock, PHASE } from './game/clock.js';
import { nightConfig, TOTAL_NIGHTS } from './game/nights.js';
import {
  collectibleFor, neighbourLines, NIGHT_INTRO, CAUGHT_LINES, TIMEOUT_LINES,
  REVEAL, ENDINGS, OPENING, TABLE_NOTE, DREAM, WAKE, FIRST_SIGHT, MORNING,
} from './game/story.js';
import { UI } from './ui/ui.js';
import { PuzzlePanel } from './ui/puzzle.js';
import { Scene } from './ui/scene.js';
import * as store from './ui/store.js';
import { clamp, damp } from './core/math.js';

/* The last line of both endings. The connections table only appears in the
 * archive once an ending has been reached, and a player who has just watched
 * the credits of their own memory has no reason to go and look. */
const AFTER = '<br><br><span class="dim">"מה שנמצא" פתוח עכשיו עד הסוף.</span>';

const canvas = document.querySelector('#view');

/* The two halves of the day, as lighting. Everything that separates the warm
 * afternoon from the cold half past three is in this table — the geometry, the
 * materials and the code are identical across both. */
const LIGHTING = {
  day: {
    sun: { dir: norm(0.38, 0.80, 0.46), color: '#fff0d8', intensity: 2.5 },
    ambient: { sky: '#6e8db4', ground: '#3a3a2c' },
    fog: { color: '#c4d3e0', density: 0.0055, height: 30, floor: 0 },
    sky: { horizon: '#d8e5f0', zenith: '#4d84c4', ground: '#5f6154', stars: 0,
      moonColor: '#fff3d0', moonSize: 0.004 },
    exposure: 1.0, tint: [1.04, 1.0, 0.95], grain: 0.03, vignette: 0.3,
  },
  night: {
    /* The moon sits low and behind the north row, so the roofs cut it and the
     * gardens on that side are in shadow all night. That is a lighting choice
     * doing level design: it decides which half of the street is the safe half. */
    sun: { dir: norm(-0.34, 0.40, -0.52), color: '#8aa4d8', intensity: 0.52 },
    ambient: { sky: '#101a24', ground: '#05080b' },
    fog: { color: '#0c1520', density: 0.024, height: 2.7, floor: -0.2 },
    sky: { horizon: '#0e1824', zenith: '#04080f', ground: '#03060a', stars: 0.9,
      moonColor: '#b8705e', moonSize: 0.010 },
    exposure: 1.38, tint: [0.88, 0.96, 1.10], grain: 0.055, vignette: 0.44,
  },
};

function norm(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

class Game {
  constructor() {
    this.ui = new UI();
    this.input = new Input(canvas);
    this.audio = new GameAudio();
    this.puzzle = new PuzzlePanel();
    this.cutscene = new Scene();
    this.state = 'menu';
    this.scene = 'night';
    this.time = 0;
    this.last = 0;
    this.fps = 60;
    this.dynamics = [];
    this.lights = [];
    this.loading = false;
    this.awareShown = 0;
    this.glitch = 0;
    this.fear = 0;
    this.coarsePointer = !!(window.matchMedia
      && window.matchMedia('(pointer: coarse)').matches);
    this.touchMode = this.coarsePointer
      || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
    this.perf = { window: 0, frames: 0, sum: 0, floor: 0.5 };
    this.rotateDismissed = false;
    this.talkIndex = new Map();

    const s = store.settings();
    try {
      this.renderer = new Renderer(canvas, {
        renderScale: s.renderScale,
        textureSize: s.textureSize,
        shadows: s.shadows,
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
    this.wire();
    this.wireTouch();
    this.watchOrientation();
    this.watchVisibility();
    this.refresh();
    this.ui.show('menu');
    requestAnimationFrame((t) => this.frame(t));
  }

  fatal(err) {
    console.error(err);
    document.querySelector('#ui').innerHTML =
      `<section class="screen"><div class="menu-wrap"><h2>הדפדפן הזה לא תומך ב-WebGL2</h2>
       <p class="sub">המשחק מרנדר תלת־ממד בזמן אמת וזקוק ל-WebGL2. נסה דפדפן עדכני,
       או הפעל האצת חומרה בהגדרות.</p>
       <p class="credits">${String((err && err.message) || err)}</p></div></section>`;
  }

  refresh() {
    const st = store.load();
    this.ui.markProgress(st);
    const btn = document.querySelector('#btn-continue');
    /* Both ways round. Only ever un-hiding it left "continue · night 5" on the
     * menu of a save that had just been wiped. */
    const started = st.night > 1 || st.cleared.length > 0;
    btn.hidden = !started;
    if (started) btn.textContent = `המשך · לילה ${st.night}`;
  }

  /* ---------------------------------------------------------------- *
   * Wiring
   * ---------------------------------------------------------------- */

  wire() {
    const on = (sel, fn) => document.querySelector(sel).addEventListener('click', fn);
    on('#btn-start', () => { this.goFullscreen(); this.enterNight(1); });
    on('#btn-continue', () => { this.goFullscreen(); this.enterNight(store.load().night); });
    on('#btn-nights', () => { this.refresh(); this.ui.show('nights'); });
    on('#btn-nights-back', () => this.ui.show(this.layout && this.state !== 'menu' ? 'pause' : 'menu'));
    on('#btn-archive', () => { this.refresh(); this.ui.show('archive'); });
    on('#btn-archive-back', () => this.ui.show(this.layout && this.state !== 'menu' ? 'pause' : 'menu'));
    on('#btn-settings', () => { this.fillSettings(); this.ui.show('settings'); });
    on('#btn-settings-back', () => this.ui.show(this.layout && this.state !== 'menu' ? 'pause' : 'menu'));
    on('#btn-read-back', () => this.ui.show(this.state === 'menu' ? 'archive' : 'pause'));
    on('#btn-resume', () => this.resume());
    on('#btn-pause-nights', () => { this.refresh(); this.ui.show('nights'); });
    on('#btn-pause-archive', () => { this.refresh(); this.ui.show('archive'); });
    on('#btn-pause-settings', () => { this.fillSettings(); this.ui.show('settings'); });
    on('#btn-quit', () => this.toMenu());
    on('#btn-again', () => this.enterNight(this.night));
    on('#btn-night-menu', () => this.toMenu());
    on('#btn-reset', () => {
      store.reset();
      this.refresh();
      this.fillSettings();
      this.ui.toast('ההתקדמות אופסה. השכונה נבנתה מחדש.');
    });
    this.ui.onPickNight = (n) => { this.goFullscreen(); this.enterNight(n); };

    canvas.addEventListener('click', () => {
      if (this.state === 'play' && !this.input.locked && !this.puzzle.open) {
        this.input.requestLock();
      }
    });
    this.input.onUnlock = () => {
      /* Losing the pointer is how the game learns Escape was pressed — except
       * while a puzzle panel is open, which releases it on purpose. */
      if (this.state === 'play' && !this.puzzle.open) this.pause();
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'paused' && this.ui.current === 'pause') {
        this.resume();
      }
    });

    this.puzzle.onSolve = (p) => {
      this.audio.keypad(0, true);
      p.solved = true;
      /* Two of the locks open something in the world rather than simply
       * marking themselves done, and it has to happen here: a chain that comes
       * off a gate has to make the gate walk-through-able, and a pump that
       * stops takes the water with it. */
      if (p.id === 'hedges') {
        for (const it of this.world.interact) {
          if (it.kind === 'gate' && it.box) {
            it.box.solid = false;
            it.box.opaque = false;
          }
        }
        this.world.collision.build();
        this.ui.log('השרשרת נופלת. השער נפתח.', true);
      } else if (p.id === 'panel') {
        this.ui.log('המשאבה נדמה. המים יורדים.', true);
      } else {
        this.ui.log('נפתח.', true);
      }
    };
    this.puzzle.onWrong = (p) => {
      this.audio.keypad(0, false);
      /* A wrong answer is loud. That is the cost, and it is the reason to have
       * done the daylight walk. */
      this.noise(this.player.pos.x, this.player.pos.z, 0.7);
      this.ui.log('משהו נקש. חזק מדי.');
      void p;
    };
    this.puzzle.onPress = (i, ok) => { if (ok === null) this.audio.keypad(i, null); };
    this.puzzle.onClose = () => {
      if (this.state === 'play' && !this.touchMode) this.input.requestLock();
    };

    this.bindSettings();
  }

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
      btn.addEventListener('pointerup', (e) => { e.preventDefault(); e.stopPropagation(); });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    const pause = document.querySelector('#t-pause');
    if (pause) {
      pause.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); this.pause();
      });
    }
    const rotateOk = document.querySelector('#rotate-ok');
    if (rotateOk) {
      rotateOk.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.rotateDismissed = true;
        document.querySelector('#rotate').hidden = true;
      });
    }
  }

  resetHeldToggles() {
    for (const btn of document.querySelectorAll('.tbtn[data-mode="hold"]')) {
      btn.classList.remove('on');
      this.input.hold(btn.dataset.key, false);
    }
  }

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
    } catch { /* only allowed in fullscreen, and never on iOS */ }
  }

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
    this.renderer.width = 0;
    this.ui.log(`איכות הורדה ל-${Math.round(q.renderScale * 100)}% כדי לשמור על קצב`);
  }

  bindSettings() {
    const s = store.settings();
    const bind = (sel, key, transform, after) => {
      const el = document.querySelector(sel);
      el.addEventListener('input', () => {
        s[key] = el.type === 'checkbox' ? el.checked
          : transform ? transform(el.value) : el.value;
        store.save();
        if (after) after(s[key]);
        this.fillSettings();
      });
    };
    bind('#set-sens', 'sensitivity', Number, (v) => { this.input.sensitivity = 0.0022 * v; });
    bind('#set-scale', 'renderScale', Number, (v) => {
      this.renderer.quality.renderScale = v;
      this.renderer.width = 0;
    });
    bind('#set-tex', 'textureSize', Number, () => {
      this.ui.toast('איכות הטקסטורות תיכנס לתוקף בלילה הבא שייטען.');
    });
    bind('#set-shadow', 'shadows', Number, (v) => { this.renderer.quality.shadows = v; });
    bind('#set-bloom', 'bloom', null, (v) => { this.renderer.quality.bloom = v; });
    bind('#set-invert', 'invertY', null, (v) => { this.input.invertY = v; });
    bind('#set-mute', 'muted', null, (v) => this.audio.setMuted(v));
    bind('#set-guide', 'guide');
    bind('#set-scares', 'scares');
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
    set('#set-shadow', s.shadows);
    set('#set-bloom', s.bloom);
    set('#set-invert', s.invertY);
    set('#set-mute', s.muted);
    set('#set-guide', s.guide);
    set('#set-scares', s.scares);
    document.querySelector('#out-sens').textContent = s.sensitivity.toFixed(2);
    document.querySelector('#out-scale').textContent = `${Math.round(s.renderScale * 100)}%`;
  }

  /* ---------------------------------------------------------------- *
   * A night
   * ---------------------------------------------------------------- */

  async enterNight(n) {
    if (this.loading) return;
    try {
      await this.loadNight(n);
    } catch (err) {
      console.error(err);
      this.loading = false;
      this.state = 'menu';
      this.ui.show('menu');
      await this.ui.fade(false);
      this.ui.toast(`הלילה לא נטען: ${String((err && err.message) || err)}`, 7000);
    }
  }

  async loadNight(n) {
    this.loading = true;
    this.state = 'loading';
    this.input.releaseLock();
    await this.audio.start();

    const st = store.load();
    this.night = n;
    this.cfg = nightConfig(n);
    await this.ui.fade(true);
    this.ui.show('loading');
    this.ui.setLoading(0, 'בונה חומרים…', this.cfg.title);

    /*
     * Seventeen materials at 256 square is about 1.7 seconds of arithmetic, and
     * they depend on the save's seed and on nothing else — so they are baked
     * once and kept. The seed is part of the key because resetting progress
     * draws a new neighbourhood, and a new neighbourhood painted in the old
     * one's noise is a subtle, permanent wrongness nobody would ever trace
     * back to here.
     */
    const s = store.settings();
    if (this.bakedSeed !== st.seed || this.bakedSize !== s.textureSize) {
      this.renderer.quality.textureSize = s.textureSize;
      await this.renderer.setMaterials(st.seed, (p, kind) => {
        this.ui.setLoading(p * 0.6, `חומר: ${kind}`);
      });
      this.bakedSeed = st.seed;
      this.bakedSize = s.textureSize;
    }
    this.ui.setLoading(0.62, 'בונה את הרחוב…');
    await new Promise((r) => setTimeout(r, 0));

    this.layout = buildLayout(n, st.seed);
    this.world = buildWorld(this.layout);
    this.renderer.setWorld(this.world);
    this.ui.setLoading(0.9, 'מכבה את האורות…');
    await new Promise((r) => setTimeout(r, 0));

    this.startDay();
    this.loading = false;
    this.ui.show(null);
    this.state = 'play';
    this.resetHeldToggles();
    this.keepAwake();
    if (this.updateOrientation) this.updateOrientation();
    await this.ui.fade(false);
    if (!this.touchMode) this.input.requestLock();
  }

  /*
   * The afternoon. No clock, nothing hunting, and the only thing to do is walk
   * around and be told things — which is exactly why it is here. Every puzzle
   * in the game is solvable from what people say in their gardens between four
   * and six in the afternoon.
   */
  startDay() {
    this.scene = 'day';
    /* Whatever the last night was doing, it is over. Starting a new night from
     * the pause menu mid-hunt otherwise leaves her whistling through the
     * afternoon, from a position that no longer exists. */
    this.audio.stopWhistle(true);
    this.audio.setNight(this.night);
    this.audio.setScene('day');
    this.renderer.setScene('day');
    const home = this.layout.home;
    this.player = new Player({
      x: home.x, z: home.frontZ - home.sign * 3.4, yaw: home.yaw + Math.PI,
    });
    this.whistler = null;
    this.neighbours = new Neighbours(this.layout, this.cfg, store.load().seed, 'day');
    this.flag = null;
    this.clock = null;
    this.talkIndex.clear();
    this.ui.setSuspicion(0);
    this.ui.setHide(null);
    this.day = new DayClock();
    this.day.start();
    this.ui.log('אחר הצהריים. השכנים בחוץ עד שמונה.');
    if (this.night === 1 && !this.openingShown) {
      /* Only ever once per session: it is a first-week-in-the-street scene,
       * and a player who has been caught eleven times has had that week. */
      this.openingShown = true;
      this.cutscene.play(OPENING).then(() => {
        this.ui.subtitle('תסתובב בשכונה. כשתהיה מוכן — לך לישון.', 6000);
      });
    } else {
      this.ui.subtitle(`${this.cfg.title}. תסתובב בשכונה. כשתהיה מוכן — לך לישון.`, 6500);
    }
  }

  /* Bed. The night begins the moment you lie down, which is why the prompt
   * says so. */
  startNight() {
    this.scene = 'night';
    this.audio.setScene('night');
    this.renderer.setScene('night');
    const st = store.load();
    this.player = new Player(this.layout.spawn);
    this.whistler = new Whistler(this.layout, this.cfg, st.seed);
    this.neighbours = new Neighbours(this.layout, this.cfg, st.seed, 'night');
    this.flag = new Flag(this.layout, this.cfg, st.seed);
    this.clock = new Clock(this.night);
    this.clock.start();
    this.awareShown = 0;
    this.fear = 0;
    this.flagKnown = false;
    this.sighted = false;
    this.decided = false;
    this.ending = null;
    this.audio.startWhistle({ tempo: 1 + (this.night - 1) * 0.04 });
    /* When the phrase started, so the one puzzle that has to be done under
     * cover of it can ask which half of the loop we are in. */
    this.whistleFrom = this.time;
    this.action = null;
    this.ui.setAction(null);
    this.ui.subtitle(NIGHT_INTRO[this.night - 1] || NIGHT_INTRO[0], 6000);
    this.ui.log('3:30. השריקה התחילה.');
  }

  endNight(reason) {
    if (this.state !== 'play') return;
    this.state = 'over';
    /* Whatever was open goes with it. A keypad left on screen over the
     * night-over card is the kind of thing that looks like the game has
     * crashed. */
    this.puzzle.locked = false;
    this.puzzle.close();
    this.ui.setMap(false);
    this.action = null;
    this.ui.setAction(null);
    this.clock.stop();
    this.audio.stopWhistle(reason === 'caught');
    this.input.releaseLock();
    this.releaseAwake();
    const st = store.load();

    if (reason === 'home') {
      store.clearNight(this.night);
      this.refresh();
      /* The clock stops when the night does, so the time on the card has to
       * be read before the morning plays over it. */
      const at = this.clock.text;
      if (this.night === 1) {
        /* Seven in the morning, sun, a sprinkler, and Bob over the fence
         * telling you the next one will be even better. */
        this.cutscene.play(MORNING, { black: true }).then(() => {
          this.showNightEnd(at);
          /* And take the black off with it. #scene sits over the screens, so
           * a sequence that ends black leaves the card it was covering for
           * behind six seconds of nothing — which reads as a hang, on the one
           * screen the player has been working towards all night. */
          this.cutscene.play([]);
        });
        return;
      }
      this.showNightEnd(at);
      return;
    }

    store.failNight();
    const lines = reason === 'caught' ? CAUGHT_LINES : TIMEOUT_LINES;
    this.ui.nightOver({
      eyebrow: reason === 'caught' ? 'היא ראתה אותך' : '3:35',
      title: 'הלילה מתחיל מחדש',
      note: `${lines[(st.attempts + this.night) % lines.length]}<br>`
        + `<span class="dim">הדגל היה ${this.flag ? this.flag.site.label : 'איפשהו'}.</span>`,
      again: true,
    });
  }

  /* The card that closes a night you won. Split out of endNight so the
   * first night can put the morning cutscene in front of it. */
  showNightEnd(at) {
    const last = this.night >= TOTAL_NIGHTS;
    const end = last ? ENDINGS.take : null;
    this.ui.nightOver({
      eyebrow: last ? 'הלילה השביעי' : 'הדגל בבית',
      title: last ? end.title : `לילה ${this.night} נגמר`,
      note: last
        ? `${REVEAL.join('<br><br>')}<br><br><b>${end.text}</b>${AFTER}`
        : `הבאת את הדגל הביתה ב-${at}. `
          + `${store.load().cleared.length} מתוך ${TOTAL_NIGHTS}.`,
      again: false,
    });
  }

  pause() {
    if (this.state !== 'play' || this.puzzle.open) return;
    this.state = 'paused';
    this.input.releaseLock();
    this.input.touch.move = null;
    this.input.touch.look = null;
    this.resetHeldToggles();
    this.releaseAwake();
    this.ui.setPauseWhere(this.scene === 'day'
      ? `${this.cfg.title} · אחר הצהריים`
      : `${this.cfg.title} · ${this.clock ? this.clock.text : ''}`);
    this.ui.show('pause');
    if (this.updateOrientation) this.updateOrientation();
  }

  resume() {
    if (!this.layout) return;
    this.state = 'play';
    /* The context is suspended when the tab goes away, and the visibility
     * handler only resumes it if the game was still playing — which it never
     * is, because losing the tab pauses it. Without this line, one alt-tab
     * makes the rest of the session silent. */
    if (this.audio.ctx && this.audio.ctx.state === 'suspended') {
      this.audio.ctx.resume().catch(() => {});
    }
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
    this.audio.stopWhistle(true);
    this.refresh();
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
    } else if (this.state === 'over') {
      this.glitch = Math.max(0, this.glitch - dt * 1.6);
    }
    if (this.world && this.layout) this.render(dt);
    if (this.touchMode) this.drawStick();
    this.input.endFrame(dt);
  }

  drawStick() {
    const el = this.stickEl || (this.stickEl = document.querySelector('#stick'));
    if (!el) return;
    const m = this.input.touch.move;
    if (!m || this.state !== 'play') {
      if (el.classList.contains('on')) el.classList.remove('on');
      return;
    }
    el.classList.add('on');
    el.style.transform = `translate(${m.ox}px, ${m.oy}px)`;
    el.firstElementChild.style.transform = `translate(${m.x * 34}px, ${m.y * 34}px)`;
  }

  update(dt) {
    const { player, input, audio, ui } = this;
    const col = this.world.collision;

    /*
     * A puzzle panel takes the keyboard and the mouse. It takes nothing else:
     * the clock runs, she keeps walking, and she can still find you standing
     * at a keypad with a panel over your eyes — which is the whole cost of a
     * lock, and the reason the daylight walk is worth doing. Freezing her here
     * was the first version and it turned every puzzle into a safe room.
     */
    input.enabled = !this.puzzle.open && !this.cutscene.playing;
    if (this.cutscene.playing && this.scene === 'day') {
      /* The afternoon has no clock, so a scene simply stops the world. At
       * night it does not: the two beats that play out there are one line
       * long and the whistle does not wait for anybody. */
      ui.prompt(null);
      return;
    }
    if (this.puzzle.open) {
      /* Standing at a keypad is standing still, and she treats it that way —
       * including the running penalty, which would otherwise be applied to
       * whatever speed the player happened to be carrying when they pressed E. */
      player.still += dt;
      player.speed = 0;
      player.vel.x = player.vel.z = 0;
      if (this.clock) this.tickNight(dt, this.lightAt(player.pos.x, player.cameraY,
        player.pos.z));
      return;
    }

    const lit = this.lightAt(player.pos.x, player.cameraY, player.pos.z);
    player.update(dt, input, col);

    if (input.hit('KeyF')) {
      player.torchOn = !player.torchOn;
      audio.keypad(0, null);
      ui.log(player.torchOn ? 'פנס דלוק. היא רואה אותו.' : 'פנס כבוי.');
    }
    if (input.hit('KeyM')) {
      this.ui.setMap(!this.ui.mapOn);
      if (this.ui.mapOn) this.ui.drawMap(this.layout, player, this.flagKnown ? this.flag : null);
    }

    for (const e of player.events) {
      if (e.type === 'step') audio.step(e.sound, e.fast);
      else if (e.type === 'land') audio.land(e.hard);
      else if (e.type === 'brush') {
        audio.fence();
        this.noise(player.pos.x, player.pos.z, 0.3);
      } else if (e.type === 'noise') this.noise(e.x, e.z, e.level);
      else if (e.type === 'hide-timeout') ui.log('אי אפשר להישאר שם יותר.');
    }

    if (this.scene === 'night') this.tickNight(dt, lit);
    else this.tickDay(dt);

    this.updateAction(dt);
    this.interact();
    this.hud();
    if (this.ui.mapOn) this.ui.drawMap(this.layout, player, this.flagKnown ? this.flag : null);
  }

  tickDay(dt) {
    const wasIn = this.day ? this.day.insideYet : false;
    if (this.day) this.day.update(dt);
    this.neighbours.walk(dt, this.day);
    /* Said once, at eight, and never again: the street emptying is the thing
     * the player is supposed to notice, and a line every frame afterwards
     * would be the game noticing it for them. */
    if (this.day && this.day.insideYet && !wasIn) {
      this.ui.log('שמונה. כולם נכנסים הביתה.', true);
      this.ui.subtitle('הרחוב מתרוקן. מה שלא שאלת, לא תשאל הלילה.', 5000);
    }
    for (const e of this.neighbours.update(dt, this.player)) void e;
    this.audio.tick(dt, {
      danger: 0, hunting: false, timeLeft: 999, suspicion: 0,
      indoors: this.player.indoors, scene: 'day',
    });
  }

  tickNight(dt, lit = 0) {
    const { player, audio, ui } = this;
    const col = this.world.collision;
    this.clock.update(dt);

    if (this.clock.phase === PHASE.HUNT && this.flag.state === FLAG.WAITING) {
      this.flag.place();
      ui.subtitle('3:31. משהו הופיע.', 3200);
      ui.log(`הדגל: ${this.flag.site.hint}`);
      this.flagKnown = true;
    }
    for (const e of this.flag.update(dt)) {
      if (e.type === 'moved') {
        ui.log('הדגל זז.', true);
        ui.subtitle(`הוא כבר לא שם. ${e.site.hint}`, 3600);
      }
    }

    /* The lights that come on during the night: somebody upstairs, at 3:32,
     * in a house you already walked past. */
    for (const g of this.world.glows) {
      if (!g.lit && this.clock.t >= g.at) {
        g.lit = true;
        this.world.lights.push({
          x: g.x, y: g.y, z: g.z, r: 1, g: 0.78, b: 0.5,
          intensity: 1.4, radius: 8, phase: -1, kind: 'window',
        });
        ui.log('אור נדלק בבית מאחוריך.');
      }
    }

    this.whistler.update(dt, player, col, lit);
    for (const e of this.whistler.events) {
      if (e.type === 'spotted') this.spotted();
      else if (e.type === 'caught') this.caught();
      else if (e.type === 'lost') ui.log('היא איבדה אותך.');
    }
    for (const e of this.neighbours.update(dt, player)) {
      if (e.type === 'wake') {
        audio.neighbourWake();
        ui.log(`${e.name} התעורר. הוא צורח.`);
        this.noise(e.x, e.z, screamLoudness(0));
      } else if (e.type === 'bark') {
        audio.dogBark(e.dist);
        this.noise(e.x, e.z, 0.75);
      }
    }

    if (this.clock.phase === PHASE.OVER && this.flag.state !== FLAG.HOME) {
      this.endNight('timeout');
      return;
    }

    /* Home, with it. */
    if (this.flag.state === FLAG.CARRIED) {
      const g = this.layout.goal;
      const d = Math.hypot(player.pos.x - g.x, player.pos.z - g.z);
      if (d < g.radius) {
        this.flag.deliver();
        audio.win();
        this.endNight('home');
        return;
      }
    }

    const w = this.whistler;
    /*
     * The first time she is on screen, ever. One line, over the live game, and
     * never again: it is the moment the player learns what they are looking
     * at, and stopping the world for it would also stop the clock she is
     * walking towards them on.
     */
    if (w && w.visible && !this.sighted && this.night === 1) {
      this.sighted = true;
      for (let i = 0; i < FIRST_SIGHT.length; i++) {
        setTimeout(() => ui.subtitle(FIRST_SIGHT[i].text, FIRST_SIGHT[i].ms),
          i * 3000);
      }
    }
    const near = w ? clamp(1 - w.dist / 26, 0, 1) : 0;
    this.awareShown = damp(this.awareShown, w ? w.awareness : 0, 9, dt);
    this.fear = damp(this.fear,
      Math.max(this.awareShown, w && w.state === STATE.HUNT ? 1 : 0), 5, dt);
    audio.setWhistler(w.listener(player.camera(), col));
    audio.tick(dt, {
      danger: Math.max(near, this.awareShown),
      hunting: w.state === STATE.HUNT,
      timeLeft: this.clock.timeLeft,
      suspicion: this.awareShown,
      indoors: player.indoors,
      scene: 'night',
    });
    /* The heart is the last thirty seconds and the moment she is close, and
     * nothing else — a heartbeat that runs all night is a metronome. */
    const beat = Math.max(this.clock.timeLeft < 30 ? 1 - this.clock.timeLeft / 30 : 0, near);
    audio.heartbeat(beat > 0.15 ? 0.9 + beat * 1.4 : 0);
  }

  noise(x, z, level) {
    if (this.whistler) this.whistler.hear(x, z, level, this.world.collision);
  }

  spotted() {
    const s = store.settings();
    this.audio.stopWhistle(true);
    this.audio.scream();
    if (s.scares) {
      this.ui.flash('white', 70);
      this.ui.shake();
    }
    this.ui.log('היא ראתה אותך.', true);
    this.ui.subtitle('רוץ.', 1800);
  }

  caught() {
    if (this.state !== 'play') return;
    this.glitch = 1;
    this.ui.flash('red', 140);
    this.endNight('caught');
  }

  /* ---------------------------------------------------------------- *
   * Pressing E
   * ---------------------------------------------------------------- */

  /*
   * One list, one nearest-in-front test, one switch. Everything the player can
   * touch is in world.interact — which is built in the same pass that draws it,
   * so there is nothing here that is not also a thing on the screen.
   */
  interact() {
    const { player, input, ui } = this;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);

    if (player.hidden) {
      ui.prompt('<b>E</b> לצאת');
      if (input.hit('KeyE')) player.unhide();
      return;
    }
    if (this.action) {
      ui.prompt('<b>E</b> להפסיק');
      if (input.hit('KeyE')) this.cancelAction('עזבת את זה.');
      return;
    }

    /*
     * Nearest thing in front of you wins — except that some things outrank
     * others no matter where they are standing.
     *
     * Six of the ten flag sites sit inside something that is itself worth
     * pressing E on: the flag under the fountain is at the fountain, the flag
     * in the bin is at the bin. Scored on position alone those tie exactly,
     * the scenery is earlier in the list, and the answer to "take the flag" is
     * a line about leaves in the water — with four minutes on the clock. The
     * flag is what the night is about, so it outranks everything, and a person
     * standing in front of you outranks their own mailbox.
     */
    let best = null, bestScore = -1, bestPrio = -1;
    const consider = (item, radius, prio = 0) => {
      const dx = item.x - player.pos.x, dz = item.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > radius) return;
      const facing = d < 0.6 ? 1 : (dx * fx + dz * fz) / d;
      if (facing < 0.25) return;
      const score = facing * 2 - d / radius;
      if (prio > bestPrio || (prio === bestPrio && score > bestScore)) {
        bestPrio = prio;
        bestScore = score;
        best = item;
      }
    };

    for (const it of this.world.interact) consider(it, it.radius);
    if (this.flag && this.flag.state === FLAG.PLACED) {
      consider({ kind: 'flag', x: this.flag.x, y: this.flag.y, z: this.flag.z }, 2.4, 2);
    }
    if (this.scene === 'day') {
      const person = this.neighbours.nearest(player, 2.8);
      if (person) {
        consider({ kind: 'talk', person, x: person.x, y: 1.5, z: person.z }, 2.8, 1);
      }
    }

    if (!best) {
      ui.prompt(this.hintForNothing());
      return;
    }
    const label = this.labelFor(best);
    ui.prompt(label ? `<b>E</b> ${label}` : null);
    if (input.hit('KeyE')) this.use(best);
  }

  hintForNothing() {
    if (!this.input.locked && !this.touchMode && this.state === 'play') {
      return 'לחץ על המסך כדי לקבל שליטה בעכבר';
    }
    return null;
  }

  labelFor(it) {
    const P = this.layout.puzzles;
    const site = this.flag && this.flag.site;
    switch (it.kind) {
      case 'flag': {
        const lock = site.lock;
        if (lock && !P[lock].solved) return `${site.label} — נעול`;
        if (site.crouch && !this.player.crouch) return 'להתכופף כדי להגיע';
        return 'לקחת את הדגל';
      }
      case 'door': {
        const h = this.house(it.houseId);
        return h.enterable ? (this.doorFor(h).open ? 'לסגור את הדלת' : 'לפתוח את הדלת')
          : 'נעול';
      }
      case 'bed': return this.scene === 'day' ? 'ללכת לישון' : 'המיטה שלך';
      case 'talk': return `לדבר עם ${it.person.name}`;
      case 'hide': return 'להתחבא בארון';
      case 'mailbox':
        if (!it.locked) return 'תיבת דואר';
        return P.code.solved ? 'התיבה פתוחה' : 'מנעול הספרות';
      case 'car':
        if (!it.radio) return 'מכונית נעולה';
        return P.radio.solved ? 'המכונית פתוחה' : 'הרדיו והקודן';
      case 'mirror': return 'להסתכל במראה';
      case 'window': return 'לקרוא את החלון';
      case 'board':
        if (P.mirror.solved) return 'הקרש מורם';
        return P.mirror.read ? 'להרים את הקרש' : 'קרש רופף';
      case 'doll': return 'לקרוא את הלוחית';
      case 'musicbox': return 'להקיש על התיבה';
      case 'bin':
        if (it.slot < 0) return 'לפתוח את הפח';
        return P.bins.solved ? 'הפחים פתוחים' : 'השרשרת בין הפחים';
      case 'doghouse':
        if (P.bone.solved) return 'המלונה';
        return this.player.bone ? 'להניח את העצם' : 'הכלב לא יזוז';
      case 'dig': return this.player.bone || P.bone.dug ? 'כבר חפרת כאן' : 'לחפור';
      case 'ladder': return P.ladder.solved ? 'הסולם במקום' : 'לגרור את הסולם';
      case 'count': return P.hedges.counted ? `ספרת ${P.hedges.answer}` : 'לספור את המשוכות';
      case 'panel': return P.panel.solved ? 'המשאבה כבויה' : 'ארון החשמל';
      case 'gate': return P.hedges.solved ? 'השער פתוח' : 'השרשרת על השער';
      case 'fountain': return 'המזרקה';
      case 'number': return null;
      case 'home':
        return this.flag && this.flag.state === FLAG.CARRIED ? null : 'הבית שלך';
      case 'flagpole': return 'הדגל של הבית הזה';
      case 'story': return 'להסתכל';
      case 'garageDoor': return 'דלת המוסך נעולה';
      case 'gap': {
        const g = this.gap(it.gapId);
        if (!g) return null;
        if (g.open) return 'הקרש פתוח';
        /* The nailed ones say so only once you are standing at them, which is
         * the whole cost of walking over to find out. */
        return g.loose ? 'לדחוף את הקרש' : 'הקרש מסומר';
      }
      default: return it.label || null;
    }
  }

  house(id) { return this.layout.houses.find((h) => h.id === id); }
  gap(id) { return (this.layout.gaps || []).find((g) => g.id === id); }
  doorFor(h) { return this.world.doors.find((d) => d.houseId === h.id); }

  use(it) {
    const { ui, audio, player } = this;
    const P = this.layout.puzzles;
    const site = this.flag && this.flag.site;
    switch (it.kind) {
      case 'flag': {
        const lock = site.lock;
        if (lock && !P[lock].solved) {
          if (P[lock].kind === 'world') { ui.log(this.worldHint(lock)); return; }
          this.openPuzzle(lock);
          return;
        }
        if (site.crouch && !player.crouch) { ui.log('צריך להתכופף.'); return; }
        if (!this.flag.inReach(player)) { ui.log('רחוק מדי.'); return; }
        if (this.night >= TOTAL_NIGHTS && !this.decided) { this.offerEnding(); return; }
        this.takeFlag();
        break;
      }
      case 'door': {
        const h = this.house(it.houseId);
        const d = this.doorFor(h);
        if (!h.enterable) { ui.log('נעול.'); audio.door(false); return; }
        d.open = !d.open;
        d.box.solid = !d.open;
        d.box.opaque = !d.open;
        this.world.collision.build();
        audio.door(d.open);
        this.noise(it.x, it.z, 0.45);
        break;
      }
      case 'bed':
        if (this.scene === 'day' && !this.sleeping) this.goToBed();
        else if (this.scene !== 'day') ui.log('לא עכשיו.');
        break;
      case 'talk': this.talk(it.person); break;
      case 'hide': {
        if (this.scene !== 'night') { ui.log('אין סיבה.'); return; }
        if (player.hideCooldown > 0) { ui.log('לא עכשיו. תן לזה רגע.'); return; }
        player.hide(it.spot, this.cfg.hideTime);
        ui.log(this.cfg.entersHouses
          ? 'בארון. הלילה זה כבר לא בטוח.' : 'בארון. תשמע אותה מבחוץ.');
        break;
      }

      /* ---- the ten locks ---- */

      case 'mailbox':
        if (it.locked && !P.code.solved) this.openPuzzle('code');
        else ui.log(it.locked ? 'התיבה פתוחה.' : 'ריקה. חשבונות.');
        break;
      case 'car':
        if (it.radio && !P.radio.solved) {
          /* The radio plays the four notes as you lean in, every time, because
           * the answer is a thing you hear rather than a thing you remember.
           * Four, not the whole phrase: the puzzle note says four and the
           * sticker on the visor turns four into four digits. */
          audio.playLullaby('memory', { gain: 0.5, notes: P.radio.digits });
          this.openPuzzle('radio');
        } else ui.log('נעולה.');
        break;
      case 'window':
        /* Read from the garden, so it is back to front. The game does not
         * explain that; the mirror does. */
        ui.subtitle(`על הזכוכית, מבפנים: "${P.mirror.windowText}"`, 6000);
        break;
      case 'mirror':
        P.mirror.read = true;
        ui.subtitle(`במראה זה נקרא: "${P.mirror.readable}"`, 6000);
        ui.log('מישהו כתב את זה מבפנים, לפני הרבה זמן.');
        break;
      case 'board':
        if (P.mirror.solved) { ui.log('כבר פתוח.'); return; }
        if (!P.mirror.read) {
          ui.log('קרש כמו כל השאר. איזה מהם?');
          return;
        }
        P.mirror.solved = true;
        audio.fence();
        this.noise(it.x, it.z, 0.5);
        ui.log('הקרש עולה.', true);
        break;
      case 'doll': {
        const d = P.dolls.items[it.slot % P.dolls.items.length];
        const clue = P.dolls.clues[it.slot % P.dolls.clues.length];
        ui.subtitle(`${d.name}. על הלוחית: ${clue}`, 5000);
        break;
      }
      case 'musicbox': {
        const opt = P.sound.options[it.slot % P.sound.options.length];
        audio.musicBox(it.slot, !opt.memory);
        this.noise(it.x, it.z, 0.35);
        ui.log(opt.memory ? 'הצליל הזה נכון. הרביעי לא צורם.' : 'התו הרביעי צורם.');
        break;
      }
      case 'bin':
        if (it.slot < 0) {
          audio.bin();
          this.noise(it.x, it.z, 1.0);
          ui.log('הפח. זה היה חזק.');
        } else if (!P.bins.solved) this.openPuzzle('bins');
        else ui.log('פתוח.');
        break;
      case 'panel':
        if (!P.panel.solved) this.openPuzzle('panel');
        else ui.log('המשאבה כבויה.');
        break;
      case 'gate':
        if (!P.hedges.solved) this.openPuzzle('hedges');
        else ui.log('השער כבר פתוח.');
        break;
      case 'count':
        if (P.hedges.counted) {
          ui.subtitle(`ספרת ${P.hedges.answer} משוכות.`, 4000);
          return;
        }
        /* Twenty seconds standing at the fence in the open, and it cancels if
         * you move. That is the puzzle: not the number, the twenty seconds. */
        this.startAction({
          kind: 'count', need: 20, label: 'סופר משוכות',
          x: it.x, z: it.z,
          onDone: () => {
            P.hedges.counted = true;
            ui.subtitle(`${P.hedges.answer}. ספרת אותן פעמיים.`, 5000);
          },
        });
        break;
      case 'dig':
        if (player.bone || P.bone.dug) { ui.log('כבר חפרת כאן.'); return; }
        this.startAction({
          kind: 'dig', need: 4, label: 'חופר', x: it.x, z: it.z,
          noise: 0.4,
          onDone: () => {
            P.bone.dug = true;
            player.bone = true;
            audio.pickup();
            ui.log('עצם. ישנה מאוד.', true);
          },
        });
        break;
      case 'doghouse':
        if (P.bone.solved) { ui.log('הוא מכשכש.'); return; }
        if (!player.bone) {
          ui.log('הוא לא יזוז. משהו צריך להעסיק אותו.');
          audio.dogBark(2);
          this.noise(it.x, it.z, 0.8);
          return;
        }
        player.bone = false;
        P.bone.solved = true;
        audio.pickup();
        ui.log('הוא לוקח את העצם והולך.', true);
        break;
      case 'ladder':
        if (P.ladder.solved) { ui.log('הסולם כבר במקום.'); return; }
        /* Dragged only under the whistle, and the whistle covers you for six
         * seconds of every twelve. Drag in the quiet half and she hears the
         * whole thing. */
        this.startAction({
          kind: 'ladder', need: 9, label: 'גורר את הסולם', x: it.x, z: it.z,
          gated: true,
          onDone: () => {
            P.ladder.solved = true;
            P.ladder.progress = 1;
            /* The rungs only become somewhere to stand once the ladder is
             * actually against the tree. */
            for (const b of this.world.collision.boxes) {
              if (b.tag === 'rung') b.platform = true;
            }
            this.world.collision.build();
            ui.log('הסולם נשען על העץ.', true);
          },
        });
        break;

      /* ---- everything else ---- */

      case 'fountain':
        ui.log(P.panel.solved ? 'המים ירדו. יש משהו מתחת לשפה.'
          : 'מים, עלים, ומשהו מתחת לשפה שאי אפשר להגיע אליו.');
        break;
      case 'number':
        ui.subtitle(`מספר ${it.number}.`, 2600);
        break;
      case 'home':
        ui.subtitle(this.scene === 'night'
          ? 'הבית שלך. לכאן צריך להביא את הדגל.' : 'הבית שלך.', 3200);
        break;
      case 'flagpole':
        ui.subtitle(this.night >= TOTAL_NIGHTS
          ? 'הדגל של הבית הזה מונמך לחצי התורן. כולם מונמכים.'
          : 'דגל אדום קטן. לכל בית יש אחד.', 3800);
        break;
      /*
       * Pushing a loose board. It stays open for the rest of the night — a
       * short cut you have to re-find every time you use it is not a short
       * cut — and it is loud, which is the price: this is a fence panel being
       * dragged out of the way in a silent street at half past three, and she
       * comes to noise.
       */
      case 'gap': {
        const g = this.gap(it.gapId);
        if (!g) break;
        if (g.open) { ui.log('כבר פתוח.'); break; }
        if (!g.loose) {
          /* Nailed. Nothing happens, and nothing is wasted either: knowing
           * which boards are shut tonight is knowing the street. */
          ui.log('מסומר. לא הלילה.');
          audio.fence();
          this.noise(it.x, it.z, 0.25);
          break;
        }
        g.open = true;
        for (const b of this.world.collision.boxes) {
          if (b.tag === 'gapPanel' && b.id === g.id) { b.solid = false; b.opaque = false; }
        }
        this.world.collision.build();
        audio.fence();
        this.noise(it.x, it.z, 0.62);
        ui.log('הקרש נפתח. יש דרך מאחור.', true);
        break;
      }

      case 'story': {
        const item = collectibleFor(it.slot);
        const isNew = store.findObject(item.id);
        audio.pickup();
        this.pause();
        this.ui.read(item);
        if (isNew) this.refresh();
        break;
      }
      default:
        if (it.label) ui.log(it.label);
        break;
    }
  }

  /*
   * Lying down. On the first night this is the whole middle of the script —
   * the photograph on the kitchen table that was not there in the morning, the
   * dream, and waking at 3:29 for no reason — and on every night after it is
   * one line, because the tenth time through a cutscene is not atmosphere, it
   * is a wall between the player and the game.
   */
  async goToBed() {
    this.sleeping = true;
    await this.ui.fade(true);
    const dream = this.night === 1 && !this.dreamShown;
    if (dream) {
      this.dreamShown = true;
      await this.cutscene.play(TABLE_NOTE, { black: true });
      /* The lullaby as she actually sang it, under the dream — the only time
       * in the game the fourth note is the right one. */
      this.audio.playLullaby('memory', { gain: 0.9 });
      await this.cutscene.play(DREAM, { black: true, onBeat: (beat, i) => {
        /* The third beat is the one word the whole game turns on. */
        if (i === DREAM.length - 2) this.audio.carHorn();
      } });
      await this.cutscene.play(WAKE, { black: true });
    }
    this.startNight();
    /* The dream ends black on purpose — the night is built behind it — and
     * this is what hands the screen back, in step with the fade rather than
     * on the scene player's own six-second backstop. */
    if (dream) this.cutscene.play([]);
    this.sleeping = false;
    await this.ui.fade(false);
  }

  /* What a lock that has no panel is waiting for. */
  worldHint(lock) {
    const P = this.layout.puzzles;
    if (lock === 'mirror') {
      return P.mirror.read ? 'הקרש השלישי במרפסת של 17.'
        : 'כתוב על החלון, הפוך. יש מראה על הגדר האחורית.';
    }
    if (lock === 'ladder') return 'הסולם. אי אפשר לעלות בלעדיו.';
    if (lock === 'bone') return 'הכלב. הוא לא יזוז בשביל כלום.';
    return 'נעול.';
  }

  /* ---------------------------------------------------------------- *
   * Things that take time
   *
   * Counting a fence, digging under a porch, dragging a ladder. All three are
   * the same shape: stand still somewhere exposed for a number of seconds,
   * and lose it if you walk away. The ladder adds the only twist — it only
   * moves while the whistle is loud enough to cover it, which is six seconds
   * of every twelve, so the player has to work in the phrase and stop in the
   * silence they are otherwise waiting for.
   * ---------------------------------------------------------------- */

  startAction(a) {
    this.action = Object.assign({ t: 0, warned: false }, a);
    this.ui.log(`${a.label}…`);
  }

  cancelAction(why) {
    if (!this.action) return;
    if (why) this.ui.log(why);
    this.action = null;
    this.ui.setAction(null);
  }

  updateAction(dt) {
    const a = this.action;
    if (!a) return;
    const p = this.player;
    if (Math.hypot(p.pos.x - a.x, p.pos.z - a.z) > 2.6) {
      this.cancelAction('עזבת את זה באמצע.');
      return;
    }
    if (a.gated) {
      /* The loud half of her phrase. The twelve-second loop is the design's,
       * and it starts when the whistle does, so this is the same clock the
       * player is listening to rather than a second one. */
      const phase = ((this.time - (this.whistleFrom || 0)) % 12 + 12) % 12;
      const loud = phase < 6;
      this.ui.setAction(a.t / a.need, loud ? `${a.label} — עכשיו` : `${a.label} — לחכות`);
      if (!loud) {
        /* Dragging it in the silence is the loudest thing in the game. */
        if (this.input.down('KeyE')) {
          this.noise(a.x, a.z, 1.2);
          this.cancelAction('הסולם צרח. היא שמעה.');
          this.audio.fence();
        }
        return;
      }
      a.t += dt;
      this.noise(a.x, a.z, 0.25);
    } else {
      a.t += dt;
      this.ui.setAction(a.t / a.need, a.label);
      if (a.noise) this.noise(a.x, a.z, a.noise * 0.5);
    }
    if (a.t >= a.need) {
      const done = a.onDone;
      this.action = null;
      this.ui.setAction(null);
      done();
    }
  }

  takeFlag() {
    const { player, audio, ui } = this;
    this.flag.take(player);
    audio.flagTake();
    this.noise(player.pos.x, player.pos.z, this.flag.site.loud ? 0.9 : 0.35);
    ui.log('הדגל אצלך. הביתה.', true);
  }

  /*
   * The seventh night. Reaching the flag is not a pickup, it is the decision
   * the whole game has been walking towards, and it is put in the panel rather
   * than on a second key because it has to be answerable on a phone and
   * because it should stop the world for a moment. Both answers are answers;
   * neither is the good ending.
   */
  offerEnding() {
    this.decided = true;
    this.input.releaseLock();
    this.audio.stopWhistle(false);
    this.puzzle.show({
      id: 'ending',
      title: 'הדגל האחרון',
      note: REVEAL[3],
      kind: 'choice',
      options: [{ id: 0 }, { id: 1 }],
      answer: 0,
    }, {
      labels: [ENDINGS.take.title, ENDINGS.leave.title],
      noClose: true,
      onChoose: (i) => this.finish(i === 0 ? 'take' : 'leave'),
    });
  }

  finish(which) {
    const end = ENDINGS[which];
    store.setEnding(which);
    if (which === 'take') {
      /* Taking it still means carrying it home — the last walk of the game is
       * the same walk as every other night, which is the point of it. */
      this.takeFlag();
      this.ending = 'take';
      this.ui.subtitle(REVEAL[1], 8000);
      this.ui.log(end.note);
      if (!this.touchMode) this.input.requestLock();
      return;
    }
    this.ending = 'leave';
    this.state = 'over';
    this.clock.stop();
    this.audio.stopWhistle(false);
    this.releaseAwake();
    this.ui.nightOver({
      eyebrow: 'הלילה השביעי',
      title: end.title,
      note: `${REVEAL.join('<br><br>')}<br><br><b>${end.text}</b>${AFTER}`,
      again: false,
    });
  }

  openPuzzle(which) {
    const p = this.layout.puzzles[which];
    this.input.releaseLock();
    const extra = {};
    if (which === 'sound') {
      extra.labels = ['התיבה הימנית', 'התיבה האמצעית', 'התיבה השמאלית'];
      extra.onPreview = (i) => this.audio.musicBox(i, !p.options[i].memory);
    }
    if (which === 'panel') {
      extra.labels = ['מפסק 1', 'מפסק 2', 'מפסק 3', 'מפסק 4'];
      extra.onPreview = () => this.audio.keypad(0, null);
    }
    if (which === 'radio') {
      extra.note = `${p.note} הרדיו מנגן: ${p.notes.join(' ')}`;
    }
    if (which === 'hedges' && !p.counted) {
      extra.note = `${p.note} עוד לא ספרת אותן.`;
    }
    this.puzzle.show(p, extra);
  }

  talk(person) {
    const h = this.house(person.houseId);
    const lines = neighbourLines(h, this.layout, this.night);
    const i = this.talkIndex.get(person.houseId) || 0;
    this.ui.subtitle(lines[Math.min(i, lines.length - 1)], 6000);
    this.talkIndex.set(person.houseId, Math.min(i + 1, lines.length - 1));
    person.talkedTo = true;
  }

  /* ---------------------------------------------------------------- *
   * HUD and lighting
   * ---------------------------------------------------------------- */

  hud() {
    const { ui, player } = this;
    const st = store.load();
    if (this.clock) {
      ui.setClock(this.clock.text, this.clock.progress, this.clock.timeLeft,
        this.clock.phase);
    } else {
      /* The afternoon reads as a clock too, because it is one now — and the
       * bar under it runs down to eight rather than to 3:35. */
      ui.setClock(this.day ? this.day.text : '16:00',
        this.day ? 1 - this.day.leftReal / 240 : 0,
        this.day ? this.day.leftReal : 999, 'day');
    }
    ui.setNight(this.night, st.cleared.length);
    ui.setSuspicion(this.scene === 'night' ? this.awareShown : 0);
    ui.setItems(st.cleared.length, player.torchOn, st.found.length,
      this.flag && this.flag.state === FLAG.CARRIED);
    ui.setBreath(player.breath);
    ui.setHide(player.hidden ? clamp(player.hidden.until / this.cfg.hideTime, 0, 1) : null);

    /* The arrow. It points at the flag while it is out there and at your own
     * front door once you have it, and it is a setting because some people
     * want the neighbourhood to stay a maze. */
    if (store.settings().guide && this.scene === 'night' && this.flag) {
      let target = null, label = '';
      if (this.flag.state === FLAG.CARRIED) {
        target = this.layout.goal;
        label = 'הביתה';
      } else if (this.flag.state === FLAG.PLACED && this.flagKnown) {
        target = this.flag;
        label = 'הדגל';
      }
      if (target) {
        const ex = target.x - player.pos.x, ez = target.z - player.pos.z;
        const dist = Math.hypot(ex, ez);
        const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
        const fwd = ex * -sy + ez * -cy;
        const right = ex * cy + ez * -sy;
        ui.setGuide(Math.atan2(right, fwd), dist, label,
          this.flag.state === FLAG.CARRIED);
      } else ui.setGuide(null);
    } else ui.setGuide(null);

    ui.stats(`${Math.round(this.fps)} fps · ${this.renderer.stats.sectors} sectors · `
      + `${Math.round(this.renderer.stats.tris / 1000)}k tris · `
      + `${this.renderer.stats.lights} lights`);
  }

  /*
   * How brightly lit the player is, in the renderer's own units. It decides
   * how quickly she notices you, so it has to agree with what is on the
   * screen: the same falloff constant as the shader, plus the ambient.
   */
  lightAt(x, y, z) {
    let sum = 0;
    for (const l of this.world.lights) {
      const d = Math.hypot(l.x - x, l.y - y, l.z - z);
      if (d > l.radius) continue;
      const w = Math.max(0, 1 - d / l.radius);
      sum += l.intensity * w * w / (1 + d * d * 0.13);
    }
    if (this.scene === 'day') sum += 2;
    if (this.player && this.player.torchOn) sum += 0.4;
    if (this.flag && this.flag.state === FLAG.CARRIED) sum += 0.3;
    return clamp(sum, 0, 3);
  }

  /* The sixteen lights that matter, nearest first. */
  gatherLights(cam) {
    const all = this.world.lights;
    const out = this.lights;
    out.length = 0;
    for (const l of all) {
      const d = Math.hypot(l.x - cam.x, l.z - cam.z);
      if (d > l.radius + 40) continue;
      out.push(l);
    }
    if (this.flag && this.flag.state !== FLAG.HOME && this.scene === 'night') {
      const f = this.flag;
      const carried = f.state === FLAG.CARRIED;
      out.push({
        x: carried ? cam.x : f.x, y: carried ? cam.y - 0.6 : f.y,
        z: carried ? cam.z : f.z,
        r: 1, g: 0.22, b: 0.16, intensity: carried ? 0.5 : 1.1, radius: 7, phase: -1,
      });
    }
    out.sort((a, b) => (
      (a.x - cam.x) ** 2 + (a.z - cam.z) ** 2) - ((b.x - cam.x) ** 2 + (b.z - cam.z) ** 2));
    if (out.length > 16) out.length = 16;
    return out;
  }

  render(dt) {
    const { player } = this;
    const cam = player ? player.camera()
      : { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0, fov: 74 };
    const L = LIGHTING[this.scene];

    this.dynamics.length = 0;
    if (this.whistler) this.whistler.dynamics(this.dynamics, dt);
    if (this.neighbours) this.neighbours.dynamics(this.dynamics, this.time);
    if (this.flag) this.flag.dynamics(this.dynamics, cam, this.time);
    /*
     * The loose boards, in both halves of the day — the fence has a panel
     * missing from the static mesh where each one goes, so if this does not
     * run there is simply a person-sized hole in the back fence. It ran only
     * at night once, and the afternoon had twelve of them.
     *
     * A board that is loose tonight sits a few degrees out of true, which
     * together with the worn track in front of it is the only thing that says
     * so. A board that has been nailed shut sits flush and looks like fence.
     */
    for (const g of this.layout.gaps || []) {
      g.t = damp(g.t || 0, g.open ? 1 : 0, 7, dt);
      this.dynamics.push({
        mesh: 'gapBoard',
        x: g.x - g.w / 2, y: 0, z: g.z,
        /* Hinged at the panel's own left edge and swung either way depending
         * on which side of the street the garden is, because adding a half
         * turn instead put the whole board a full width off the hole it was
         * supposed to be filling. */
        rot: ((g.loose ? 0.055 : 0) + g.t * 1.30) * (g.sign > 0 ? 1 : -1),
      });
    }
    for (const d of this.world.doors) {
      /* Doors ease open rather than snapping, which is most of what sells a
       * door as a physical object rather than a state flag. */
      d.t = damp(d.t, d.open ? 1 : 0, 6, dt);
      this.dynamics.push({
        mesh: 'door', x: d.x, y: d.y, z: d.z,
        rot: d.yaw + d.t * 1.45 * (d.houseId % 2 ? 1 : -1),
      });
    }
    for (const g of this.world.glows) {
      if (!g.lit) continue;
      this.dynamics.push({
        mesh: 'glow', x: g.x, y: g.y, z: g.z - g.s * 0.02,
        rot: g.yaw, sx: g.w, sy: g.h, sz: 1,
      });
    }

    this.renderer.render(cam, {
      time: this.time,
      lights: this.gatherLights(cam),
      sun: L.sun,
      ambient: L.ambient,
      fog: L.fog,
      sky: L.sky,
      exposure: L.exposure,
      tint: L.tint,
      grain: L.grain,
      vignette: L.vignette,
      bloom: 0.6,
      bloomThreshold: 0.95,
      aberration: 0.0016,
      fear: this.fear,
      glitch: this.glitch,
      flash: 0,
      dynamics: this.dynamics,
      torch: {
        on: player ? player.torchOn : false,
        intensity: 2.4, inner: 18, outer: 44, range: 20,
      },
    });
  }
}

/* Exposed so the smoke test can drive the game the way a player would: start a
 * night, walk to a thing, press the key, look at what came out. */
window.suburb = new Game();
