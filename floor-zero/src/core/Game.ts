import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { TensionSystem } from '../audio/TensionAudioSystem';
import { AnomalyDirector } from '../anomalies/AnomalyDirector';
import { PostFX } from '../fx/PostFX';
import { InputManager } from '../input/InputManager';
import { TouchControls } from '../input/TouchControls';
import { InteractionSystem } from '../interactions/InteractionSystem';
import { MimicDirector } from '../mimic/MimicDirector';
import { ReplayTrack } from '../mimic/ReplayTrack';
import { PlayerController } from '../player/PlayerController';
import { PlayerRecorder } from '../player/PlayerRecorder';
import { SaveManager } from '../save/SaveManager';
import { UIManager } from '../ui/UIManager';
import { LevelManager } from '../world/LevelManager';
import { CHAPTERS, LAST_CHAPTER, chapterDef } from '../data/chapters';
import { line, objective } from '../data/dialogue';
import { setLanguage, t } from '../data/localization';
import { GameContext } from './Context';
import { EventBus, bus as globalBus } from './EventBus';
import { GameLoop } from './GameLoop';
import { GameState } from './GameState';
import { RNG, makeSeed } from './RNG';
import { Routine, Sequencer } from './Sequencer';
import { RunState, Settings } from './types';

const DEV = import.meta.env?.DEV ?? false;

export class Game implements GameContext {
  readonly bus: EventBus = globalBus;
  readonly state: GameState;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly audio = new AudioManager();
  readonly tension: TensionSystem;
  readonly save = new SaveManager();
  readonly world: LevelManager;
  readonly player: PlayerController;
  readonly recorder = new PlayerRecorder({ interval: 0.1 });
  readonly mimic: MimicDirector;
  readonly anomalies: AnomalyDirector;
  readonly interactions = new InteractionSystem();
  readonly postfx: PostFX;
  readonly ui: UIManager;
  readonly input: InputManager;
  readonly sequencer = new Sequencer();
  readonly touch: TouchControls;

  settings: Settings;
  rng: RNG;
  time = 0;

  private loop: GameLoop;
  private checkpointSnapshot: RunState | null = null;
  private travelling = false;
  private chaseArmed = false;
  private endingPlaying = false;
  private lastAutoSave = 0;

  constructor(private readonly container: HTMLElement) {
    const saved = this.save.load();
    this.settings = saved.settings;
    setLanguage(this.settings.lang);

    this.state = new GameState(saved.meta);
    this.rng = this.state.rng;

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.settings.quality !== 'low',
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(this.devicePixelRatio());
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.className = 'viewport';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.FogExp2(0x0a0d12, 0.032);

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 16 / 9, 0.06, 90);

    this.world = new LevelManager(this.scene);
    this.player = new PlayerController(this.camera, this.scene);
    this.mimic = new MimicDirector(this.scene);
    this.tension = new TensionSystem(this.audio, this.bus);
    this.anomalies = new AnomalyDirector(this.bus, this.state.run.seed);
    this.postfx = new PostFX(this.renderer);

    this.input = new InputManager(this.renderer.domElement);
    this.touch = new TouchControls(container);
    this.input.attachTouch(this.touch);

    this.ui = new UIManager(container, this.state.meta, this.settings, {
      newGame: () => this.startNewGame(),
      continueGame: () => this.continueGame(),
      selectChapter: (index) => this.startChapter(index),
      openSettings: () => this.ui.settings.open(),
      quit: () => this.ui.toast(t('menu.exit_note')),
      resume: () => this.setPaused(false),
      restartCheckpoint: () => {
        this.setPaused(false);
        this.respawnAtCheckpoint('manual');
      },
      toMainMenu: () => this.returnToMenu(),
      onChange: (settings) => this.applySettings(settings),
      onResetSave: () => this.resetSave(),
      onClose: () => this.ui.settings.close(),
    });

    this.loop = new GameLoop((delta) => this.tick(delta));

    this.audio.occlusionTest = (from, to) => {
      const collision = this.world.collision;
      if (!collision) return true;
      return collision.hasLineOfSight(from.x, from.z, to.x, to.z, 1.5);
    };

    this.bindEvents();
    this.applySettings(this.settings, false);
  }

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */

  async boot(): Promise<void> {
    this.ui.showLoading(t('loading.world'));
    this.state.phase = 'loading';

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('orientationchange', () => this.checkOrientation());

    this.resize();
    this.world.setQuality(this.settings.quality, this.settings.shadows);

    // Build the lift so the menu has something real behind it.
    this.loadLevel('lobby', 0);
    this.placeInLift(true);

    this.ui.hideLoading();
    this.ui.setHudVisible(false);
    this.state.phase = 'menu';
    this.ui.menu.setMeta(this.state.meta, this.save.hasRun);
    this.ui.menu.open();
    this.checkOrientation();

    this.loop.start();

    // Audio can only start after a gesture; the first click anywhere does it.
    const unlock = async (): Promise<void> => {
      await this.audio.init();
      this.audio.applySettings(this.settings);
      this.tension.startLayers();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private devicePixelRatio(): number {
    const cap = this.settings.quality === 'high' ? 2 : this.settings.quality === 'medium' ? 1.5 : 1;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  private resize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.devicePixelRatio());
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.postfx.resize();
    this.checkOrientation();
  }

  private checkOrientation(): void {
    const isTouch = TouchControls.isTouchDevice();
    const portrait = window.innerHeight > window.innerWidth;
    this.ui.setRotatePrompt(isTouch && portrait && this.state.phase === 'playing');
    this.touch.setVisible(isTouch && this.state.phase === 'playing');
  }

  private onVisibility(): void {
    if (document.hidden) {
      if (this.state.phase === 'playing') this.setPaused(true);
      this.audio.suspend();
    } else {
      this.audio.unsuspend();
      this.loop.resync();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Settings                                                          */
  /* ---------------------------------------------------------------- */

  applySettings(settings: Settings, persist = true): void {
    this.settings = settings;
    setLanguage(settings.lang);
    this.audio.applySettings(settings);
    this.tension.setReducedScares(settings.scareIntensity === 'reduced');
    this.ui.applySettings(settings);
    this.touch.setSensitivity(settings.touchSensitivity);
    this.renderer.shadowMap.enabled = settings.shadows && settings.quality !== 'low';
    this.renderer.setPixelRatio(this.devicePixelRatio());
    this.world.setQuality(settings.quality, settings.shadows);
    this.postfx.setQuality(settings.quality);
    this.postfx.setStrength(settings.screenEffects);
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    if (persist) this.save.saveSettings(settings);
  }

  private resetSave(): void {
    this.save.clear();
    this.state.meta = this.save.load().meta;
    this.state.startNewRun();
    this.checkpointSnapshot = null;
    this.ui.menu.setMeta(this.state.meta, false);
  }

  /* ---------------------------------------------------------------- */
  /* Flow                                                              */
  /* ---------------------------------------------------------------- */

  private startNewGame(): void {
    void this.audio.init();
    this.state.startNewRun(makeSeed());
    this.rng = this.state.rng;
    this.beginRun(0);
    this.sequencer.run(this.prologueRoutine(), 'prologue');
  }

  private continueGame(): void {
    void this.audio.init();
    const saved = this.save.load();
    if (!saved.run) {
      this.startNewGame();
      return;
    }
    this.state.adoptRun(saved.run);
    this.rng = this.state.rng;
    this.beginRun(saved.run.chapter);
  }

  private startChapter(index: number): void {
    void this.audio.init();
    this.state.startNewRun(makeSeed());
    this.rng = this.state.rng;
    const clamped = Math.max(0, Math.min(LAST_CHAPTER, index));
    this.state.run.chapter = clamped;
    // Give the player whatever earlier chapters would have handed them.
    if (clamped >= 1) this.state.setFlag('lobby_power');
    if (clamped >= 2) {
      this.state.setFlag('floor_power');
      this.state.run.visit = 1;
    }
    if (clamped >= 3) {
      this.state.markSolved('puzzle_shutter');
      this.state.setFlag('lever_pulled');
      this.state.run.visit = 3;
    }
    if (clamped >= 4) {
      this.state.markSolved('puzzle_clocks');
      this.state.run.visit = 4;
    }
    if (clamped >= 5) {
      this.state.markSolved('puzzle_toys');
      this.state.addItem('control_key');
      this.state.run.visit = 5;
    }
    this.beginRun(clamped);
  }

  private beginRun(chapter: number): void {
    this.ui.menu.close();
    this.ui.settings.close();
    this.ui.setHudVisible(true);
    this.endingPlaying = false;
    this.chaseArmed = false;
    this.tension.reset(10);
    this.sequencer.stopAll();

    if (chapter === 0) {
      this.loadLevel('lobby', 0);
      const spawn = this.world.current!.spawn;
      this.player.teleport(spawn.x, spawn.z, spawn.yaw);
      this.tension.setAmbience('outside');
      this.setObjective('p_enter');
    } else {
      this.loadLevel('floor0', Math.max(1, this.state.run.visit));
      this.placeInLift(false);
      this.world.elevator.powered = true;
      this.world.elevator.setDisplay('0');
      this.world.elevator.snapDoors(true);
      this.tension.setAmbience('corridor');
      this.beginVisit();
    }

    this.state.phase = 'playing';
    this.postfx.fadeTo(1);
    this.ui.setFade(0);
    this.checkpoint(chapterDef(chapter).checkpointId);
    this.bus.emit('chapter_started', { chapter, visit: this.state.run.visit });
    this.requestLock();
    this.checkOrientation();
  }

  private returnToMenu(): void {
    this.setPaused(false);
    this.state.phase = 'menu';
    this.state.cinematic = false;
    this.player.frozen = false;
    this.sequencer.stopAll();
    this.recorder.cancel();
    this.mimic.clearVisit();
    this.persist();
    this.input.releasePointerLock();
    this.ui.setHudVisible(false);
    this.ui.cinematic(null);
    this.ui.setFade(0);
    this.postfx.fadeTo(1, true);
    this.loadLevel('lobby', 0);
    this.placeInLift(true);
    this.tension.setAmbience('elevator');
    this.tension.reset(8);
    this.ui.menu.setMeta(this.state.meta, this.save.hasRun);
    this.ui.menu.open();
    this.checkOrientation();
  }

  private loadLevel(id: 'lobby' | 'floor0', variant: number): void {
    const build = this.world.load(id, {
      variant,
      chapter: this.state.run.chapter,
      state: this.state,
    });
    this.interactions.clear();
    this.interactions.registerAll(build.interactables);
  }

  /** Puts the camera inside the lift; used for the menu backdrop and respawns. */
  private placeInLift(menuMode: boolean): void {
    const rig = this.world.current?.elevator;
    if (!rig) return;
    this.player.teleport(rig.interior.x, rig.interior.z, rig.facing);
    this.world.elevator.snapDoors(menuMode);
    this.world.elevator.powered = !menuMode;
    this.world.elevator.setDisplay(menuMode ? '0' : '0');
    if (menuMode) {
      this.player.teleport(rig.interior.x - 0.25, rig.interior.z, rig.facing);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Prologue and chapter beats                                        */
  /* ---------------------------------------------------------------- */

  private *prologueRoutine(): Routine {
    this.state.cinematic = true;
    this.player.frozen = true;
    this.ui.setFade(1);
    this.ui.cinematic('');
    const noise = this.audio.play('line_noise', { loop: true, volume: 0.7, bus: 'voice' });
    yield 1.2;
    this.ui.cinematic(line('intro_dispatch_1'));
    this.say(line('intro_dispatch_1'), 3);
    yield 2.6;
    this.ui.cinematic(line('intro_dispatch_2'));
    this.say(line('intro_dispatch_2'), 3);
    yield 2.6;
    this.ui.cinematic(line('intro_dispatch_3'));
    this.say(line('intro_dispatch_3'), 3);
    yield 2.4;
    this.audio.stop(noise, 1);
    this.ui.cinematic(null);

    // Fade up on the street.
    for (let step = 0; step <= 20; step++) {
      this.ui.setFade(1 - step / 20);
      yield 0.05;
    }
    this.player.frozen = false;
    this.state.cinematic = false;
    this.say(line('tutorial_move'), 4);
    yield 4;
    this.say(this.input.usingTouch ? line('tutorial_touch_look') : line('tutorial_look'), 4);
    yield 4.5;
    this.say(line('tutorial_interact'), 4);
  }

  /** Called after the doors open on Floor 0. */
  private beginVisit(): void {
    const chapter = chapterDef(this.state.run.chapter);
    this.state.visitTime = 0;
    // Each arrival re-arms the chapter-5 chase; the control-room flag is what
    // stops it firing again once the player is safely inside.
    this.chaseArmed = false;
    this.recorder.start(this.state.run.visit);
    this.bus.emit('recording_started', { visit: this.state.run.visit });

    this.anomalies.configure(
      { chapter: chapter.index, minGap: chapter.anomalyGap, budget: chapter.anomalyBudget },
      this.rng.fork(this.state.run.visit).state,
    );

    const previous = ReplayTrack.fromPacked(this.state.run.lastTrack);
    if (chapter.mimicTier > 0) {
      this.mimic.planVisit({
        tier: chapter.mimicTier,
        spawnDelay: chapter.mimicTier === 1 ? 14 : 8 + this.rng.range(0, 6),
        track: previous,
      });
    } else {
      this.mimic.clearVisit();
    }

    this.updateObjective();
    this.checkpoint(chapter.checkpointId);
  }

  /** Chooses the right objective for the current chapter and progress. */
  private updateObjective(): void {
    const chapter = this.state.run.chapter;
    const s = this.state;
    let key = chapterDef(chapter).startObjective;

    switch (chapter) {
      case 1:
        if (s.flag('floor_power')) key = 'c1_return';
        else if (s.hasItem('fuse')) key = 'c1_panel';
        else if (s.flag('saw_corridor')) key = 'c1_fuse';
        else key = 'c1_look';
        break;
      case 2:
        if (s.flag('lever_pulled')) key = 'c2_return';
        else if (s.isSolved('puzzle_shutter')) key = 'c2_lever';
        else if (s.flag('switch_recorded')) key = 'c2_wait';
        else key = 'c2_switch';
        break;
      case 3:
        if (s.isSolved('puzzle_clocks')) key = 'c3_service';
        else if (s.flag('entered_apt03')) key = 'c3_clocks';
        else key = 'c3_apartment';
        break;
      case 4:
        if (s.isSolved('puzzle_toys')) key = 'c4_key';
        else if (s.flag('entered_kids')) key = 'c4_toys';
        else key = 'c4_kids';
        break;
      case 5:
        if (this.world.roomAt(this.camera.position.x, this.camera.position.z) === 'control') key = 'c5_choose';
        else if (this.mimic.isChasing) key = 'c5_run';
        else key = 'c5_door';
        break;
      default:
        break;
    }
    this.setObjective(key);
  }

  /* ---------------------------------------------------------------- */
  /* GameContext                                                       */
  /* ---------------------------------------------------------------- */

  say(text: string, duration = 3.2): void {
    this.ui.subtitles.show(text, duration);
    this.bus.emit('subtitle', { text, duration });
  }

  setObjective(key: string): void {
    const text = objective(key);
    if (text === this.state.objective) return;
    this.state.objective = text;
    this.ui.setObjective(text);
    this.bus.emit('objective_changed', { text });
  }

  checkpoint(label: string): void {
    this.state.run.checkpointId = label;
    this.state.syncRngState();
    this.checkpointSnapshot = structuredCloneSafe(this.state.run);
    this.persist();
    this.bus.emit('checkpoint_saved', { chapter: this.state.run.chapter, label });
    this.ui.toast(t('toast.saved'));
  }

  completeChapter(): void {
    const finished = this.state.run.chapter;
    this.state.run.chapter = Math.min(LAST_CHAPTER, finished + 1);
    this.state.meta.highestChapterReached = Math.max(
      this.state.meta.highestChapterReached,
      this.state.run.chapter,
    );
    this.bus.emit('chapter_completed', { chapter: finished });
    this.persist();
  }

  travelToFloorZero(): void {
    if (this.travelling || this.endingPlaying) return;
    this.travelling = true;
    // Take control on this frame rather than on the routine's first step, so
    // the player cannot squeeze in one more input after pressing the button.
    this.state.cinematic = true;
    this.player.frozen = true;
    this.sequencer.run(this.travelRoutine(), 'travel');
  }

  private *travelRoutine(): Routine {
    this.state.cinematic = true;
    this.player.frozen = true;

    // Close the book on this visit before the doors shut.
    if (this.world.levelId === 'floor0' && this.recorder.isRecording) {
      const track = this.recorder.stop();
      this.state.run.olderTrack = this.state.run.lastTrack;
      this.state.run.lastTrack = track.toPacked();
      this.bus.emit('recording_finished', {
        visit: track.visit,
        duration: track.duration,
        samples: track.sampleCount,
      });
    }
    this.mimic.clearVisit();

    // Stepping into the lift in the lobby is what ends the prologue, so the
    // floor is rebuilt as chapter 1 rather than chapter 0.
    if (this.state.run.chapter === 0 && this.world.levelId === 'lobby') {
      this.completeChapter();
    }

    yield* this.world.elevator.ride(this, '0', () => {
      this.state.run.visit += 1;
      const previousFacing = this.world.current?.elevator?.facing ?? 0;
      const relativeYaw = this.player.yaw - previousFacing;

      this.loadLevel('floor0', this.state.run.visit);
      const rig = this.world.current!.elevator!;
      this.world.elevator.snapDoors(false);
      this.world.elevator.powered = true;
      this.world.elevator.setDisplay('0');
      this.player.teleport(rig.interior.x, rig.interior.z, rig.facing + relativeYaw);
      this.tension.setAmbience('corridor');
    });

    this.player.frozen = false;
    this.state.cinematic = false;
    this.travelling = false;

    if (this.state.run.visit === 1) {
      this.say(line('arrive_floor_zero'), 4);
    }
    this.beginVisit();
  }

  playEnding(ending: 1 | 2 | 3): void {
    if (this.endingPlaying) return;
    this.endingPlaying = true;
    this.sequencer.run(this.endingRoutine(ending), 'ending');
  }

  private *endingRoutine(ending: 1 | 2 | 3): Routine {
    this.state.phase = 'ending';
    this.state.cinematic = true;
    this.player.frozen = true;
    this.input.releasePointerLock();
    this.mimic.stopChase();
    this.bus.emit('ending_selected', { ending });
    this.state.unlockEnding(ending);

    const fadeOut = function* (this: Game, seconds: number): Routine {
      const steps = Math.max(1, Math.round(seconds / 0.05));
      for (let i = 0; i <= steps; i++) {
        this.ui.setFade(i / steps);
        yield 0.05;
      }
    }.bind(this);

    if (ending === 1) {
      this.audio.play('lift_motor', { volume: 0.5 });
      this.say(line('ending1_choice'), 3);
      yield 2.5;
      yield* fadeOut(1.6);
      this.ui.cinematic('');
      yield 1.2;
      // Outside. Everything looks normal, until it does not.
      this.tension.setAmbience('outside');
      this.ui.cinematic(line('ending1_a'));
      yield 3.4;
      this.audio.play('glitch', { volume: 0.5 });
      this.ui.cinematic(line('ending1_b'));
      yield 4;
    } else if (ending === 2) {
      this.audio.play('power_down', { volume: 0.9 });
      this.say(line('ending2_choice'), 3);
      yield 1.6;
      // Lights go out one at a time.
      for (const id of this.world.lighting.fixtureIds()) {
        this.world.lighting.setOn(id, false);
        this.audio.play('switch', { volume: 0.4 });
        yield 0.32;
      }
      this.mimic.controller.show();
      this.mimic.controller.standStill();
      this.mimic.controller.teleport(
        new THREE.Vector3(
          this.camera.position.x + this.player.forward.x * 2.6,
          0,
          this.camera.position.z + this.player.forward.z * 2.6,
        ),
      );
      this.mimic.lookAtPlayer(8);
      yield 3.2;
      yield* fadeOut(2.4);
      this.ui.cinematic(line('ending2_a'));
      yield 4.5;
    } else {
      this.audio.play('glitch', { volume: 0.8 });
      this.say(line('ending3_choice'), 3);
      for (const feed of this.world.feeds) feed.setKind('dead');
      yield 2;
      this.state.run.lastTrack = null;
      this.state.run.olderTrack = null;
      this.state.meta.erased = true;
      this.mimic.clearVisit();
      this.world.lighting.setGlobalDim(0.25);
      yield 2.4;
      yield* fadeOut(2.6);
      this.ui.cinematic(line('ending3_a'));
      yield 4.5;
    }

    this.ui.cinematic(null);
    this.state.meta.completedOnce = true;
    this.save.saveMeta(this.state.meta);
    this.save.clearRun();
    this.world.lighting.setGlobalDim(1);
    this.endingPlaying = false;
    this.state.phase = 'credits';
    this.returnToMenu();
  }

  respawnAtCheckpoint(reason: string): void {
    this.sequencer.run(this.respawnRoutine(reason), 'respawn');
  }

  private *respawnRoutine(reason: string): Routine {
    this.state.cinematic = true;
    this.player.frozen = true;
    this.mimic.stopChase();
    this.chaseArmed = false;
    void reason;

    for (let i = 0; i <= 12; i++) {
      this.ui.setFade(i / 12);
      yield 0.04;
    }

    if (this.checkpointSnapshot) {
      this.state.adoptRun(structuredCloneSafe(this.checkpointSnapshot));
      this.rng = this.state.rng;
    }

    if (this.state.run.chapter === 0) {
      this.loadLevel('lobby', 0);
      const spawn = this.world.current!.spawn;
      this.player.teleport(spawn.x, spawn.z, spawn.yaw);
      this.tension.setAmbience('lobby');
    } else {
      this.loadLevel('floor0', Math.max(1, this.state.run.visit));
      const rig = this.world.current!.elevator!;
      this.world.elevator.snapDoors(true);
      this.world.elevator.powered = true;
      this.player.teleport(rig.interior.x, rig.interior.z, rig.facing);
      this.tension.setAmbience('corridor');
      this.beginVisit();
    }

    this.tension.reset(14);
    yield 0.4;
    for (let i = 12; i >= 0; i--) {
      this.ui.setFade(i / 12);
      yield 0.04;
    }
    this.player.frozen = false;
    this.state.cinematic = false;
    this.requestLock();
  }

  /* ---------------------------------------------------------------- */
  /* Pause                                                             */
  /* ---------------------------------------------------------------- */

  setPaused(paused: boolean): void {
    if (paused && this.state.phase !== 'playing') return;
    if (!paused && this.state.phase !== 'paused') return;

    if (paused) {
      this.state.phase = 'paused';
      this.input.enabled = false;
      this.input.releasePointerLock();
      this.ui.pause.open();
      this.audio.suspend();
      this.persist();
    } else {
      this.state.phase = 'playing';
      this.input.enabled = true;
      this.ui.pause.close();
      this.ui.settings.close();
      this.audio.unsuspend();
      this.loop.resync();
      this.requestLock();
    }
    this.bus.emit('game_paused', { paused });
  }

  private requestLock(): void {
    if (TouchControls.isTouchDevice()) return;
    this.input.enabled = true;
    this.input.requestPointerLock();
  }

  private persist(): void {
    this.state.syncRngState();
    this.save.saveRun(this.state.run, this.state.meta, this.settings);
  }

  /* ---------------------------------------------------------------- */
  /* Events                                                            */
  /* ---------------------------------------------------------------- */

  private bindEvents(): void {
    this.bus.on('interaction_triggered', ({ id, kind }) => {
      if (kind === 'door') {
        this.mimic.noteDoorUse(id, this.state.behavior);
        const item = this.interactions.get(id);
        if (item) {
          const world = item.hitbox.getWorldPosition(new THREE.Vector3());
          this.mimic.favouriteDoorPosition = { x: world.x, z: world.z };
        }
      }
      if (id === 'shutter_switch') {
        this.state.setFlag('switch_recorded');
        this.say(line('c2_shutter'), 3);
        this.updateObjective();
      }
    });

    this.bus.on('puzzle_solved', () => {
      this.tension.add(-14);
      this.updateObjective();
      this.persist();
    });

    this.bus.on('item_collected', () => this.updateObjective());

    this.bus.on('player_caught', () => {
      this.player.kick(0.25);
      this.postfx.kick(1);
      this.audio.play('stinger', { volume: 1 });
      this.state.cinematic = true;
      this.player.frozen = true;
      this.ui.showDeath(() => this.respawnAtCheckpoint('caught'));
      this.input.releasePointerLock();
    });

    this.bus.on('anomaly_triggered', () => {
      this.postfx.kick(0.35);
    });

    this.bus.on('mimic_spawned', () => {
      if (this.state.run.chapter === 2 && !this.state.flag('saw_mimic')) {
        this.state.setFlag('saw_mimic');
        this.say(line('c2_mimic_seen'), 4);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  private tick(delta: number): void {
    this.time += delta;

    if (this.input.wasPressed('pause')) {
      if (this.ui.isReading) this.ui.hideNote();
      else if (this.ui.settings.isOpen) this.ui.settings.close();
      else if (this.state.phase === 'paused') this.setPaused(false);
      else if (this.state.phase === 'playing') this.setPaused(true);
    }

    if (this.state.phase === 'playing' && this.ui.isReading && this.input.wasPressed('interact')) {
      this.ui.hideNote();
    }
    this.interactions.blocked = this.ui.isReading;

    const running = this.state.phase === 'playing' || this.state.phase === 'ending';

    if (running) {
      this.state.run.playTime += delta;
      this.state.visitTime += delta;
      this.sequencer.update(delta);
      this.player.update(delta, this);
      this.world.update(delta, this);
      this.interactions.update(delta, this);
      this.mimic.update(delta, this);
      this.anomalies.update(delta, this);
      this.updateTension(delta);
      this.updateChase();
      this.updateRoomLogic();

      if (this.recorder.isRecording) {
        this.recorder.update(delta, {
          x: this.player.position.x,
          y: this.player.position.y,
          z: this.player.position.z,
          yaw: this.player.yaw,
          pitch: this.player.pitch,
          motion: this.player.motion,
        });
      }

      this.lastAutoSave += delta;
      if (this.lastAutoSave > 45) {
        this.lastAutoSave = 0;
        this.persist();
      }
    } else if (this.state.phase === 'menu') {
      this.updateMenuScene(delta);
    }

    this.audio.updateListener(this.camera);
    this.audio.update(delta);
    this.ui.update(delta, this);
    this.updatePostFX(delta);

    this.postfx.render(this.scene, this.camera);
    if (DEV) this.ui.setFps(this.loop.fps);
    this.input.endFrame();
  }

  private updateTension(delta: number): void {
    const brightness = this.world.lighting.brightnessAt(this.camera.position);
    const rig = this.world.current?.elevator;
    const inElevator = rig
      ? Math.hypot(this.camera.position.x - rig.interior.x, this.camera.position.z - rig.interior.z) < 1.2
      : false;

    this.tension.update(delta, {
      brightness,
      mimicDistance: this.mimic.distanceToPlayer(this),
      mimicVisible: this.mimic.visible,
      inElevator,
      enclosed: this.world.isEnclosed(this.camera.position.x, this.camera.position.z),
      idleTime: this.player.idleTime,
      watchingScreen: this.interactions.current?.kind === 'screen',
      chaseActive: this.mimic.isChasing,
      quietTime: this.anomalies.quietTime,
    });
  }

  private updatePostFX(delta: number): void {
    const level = this.tension.normalized;
    const brightness = this.world.lighting.brightnessAt(this.camera.position);
    this.postfx.setTargets({
      grain: 0.035 + level * 0.075 + (1 - brightness) * 0.02,
      vignette: 0.62 + level * 0.3,
      aberration: 0.0009 + level * 0.0035,
      warp: this.settings.reduceMotion ? 0.012 : 0.016 + level * 0.05,
      exposure: 1.02 - level * 0.08 + (brightness < 0.15 ? 0.06 : 0),
      contrast: 1.01 + level * 0.09,
    });
    this.postfx.update(delta, this.time);
  }

  private updateRoomLogic(): void {
    const room = this.world.roomAt(this.camera.position.x, this.camera.position.z);
    const ambience = this.world.ambienceAt(this.camera.position.x, this.camera.position.z);
    this.tension.setAmbience(ambience);

    if (room === 'apt03' && !this.state.flag('entered_apt03')) {
      this.state.setFlag('entered_apt03');
      this.say(line('c3_clocks_all'), 4);
      this.updateObjective();
    }
    if (room === 'apt02kids' && !this.state.flag('entered_kids')) {
      this.state.setFlag('entered_kids');
      this.say(line('c4_drawings'), 4);
      this.updateObjective();
    }
    if (room === 'service' && !this.state.flag('entered_service')) {
      this.state.setFlag('entered_service');
      if (this.state.run.chapter === 3) {
        this.completeChapter();
        this.setObjective('c2_return');
      }
    }
    if (room === 'control' && !this.state.flag('entered_control')) {
      this.state.setFlag('entered_control');
      this.sequencer.run(this.revealRoutine(), 'reveal');
    }
    if (this.state.run.chapter === 1 && !this.state.flag('saw_corridor') && room === 'corridor') {
      this.state.setFlag('saw_corridor');
      this.say(line('c1_intro'), 4);
      this.updateObjective();
    }
  }

  private *revealRoutine(): Routine {
    this.mimic.stopChase();
    this.checkpoint('c5_control');
    this.setObjective('c5_choose');
    yield 1.5;
    this.say(line('c5_reveal_1'), 5);
    yield 5;
    this.say(line('c5_reveal_2'), 5);
    yield 5;
    this.say(line('c5_reveal_3'), 5);
  }

  private updateChase(): void {
    if (this.state.run.chapter !== 5) return;
    const room = this.world.roomAt(this.camera.position.x, this.camera.position.z);
    if (room === 'control') {
      if (this.mimic.isChasing) {
        this.mimic.stopChase();
        this.bus.emit('chase_ended', { survived: true });
      }
      return;
    }
    if (this.chaseArmed || this.state.flag('entered_control')) return;
    if (this.camera.position.x < 14 || room !== 'corridor') return;

    this.chaseArmed = true;
    this.checkpoint('c5_chase');
    this.say(line('c5_chase'), 4);
    this.setObjective('c5_run');
    this.audio.play('stinger', { volume: this.settings.scareIntensity === 'reduced' ? 0.5 : 1 });
    this.postfx.kick(1);
    this.world.lighting.blackout(1.4);
    this.mimic.startChase(this);
  }

  private updateMenuScene(delta: number): void {
    // Slow drift inside the lift, and once in a while it is standing there.
    this.player.view.yaw += delta * 0.035;
    this.player.view.update({
      position: this.player.position,
      eyeHeight: 1.62,
      speed: 0,
      running: false,
      settings: this.settings,
      tension: 0.2,
      delta,
    });
    this.world.update(delta, this);
    this.mimic.controller.update(delta, this);

    if (this.state.meta.highestChapterReached >= 2 && !this.mimic.controller.isVisible) {
      if (Math.random() < delta * 0.02) {
        const rig = this.world.current?.elevator;
        if (rig) {
          this.mimic.controller.show();
          this.mimic.controller.standStill();
          this.mimic.controller.attention = 1;
          this.mimic.controller.teleport(new THREE.Vector3(rig.interior.x + 2.6, 0, rig.interior.z + 1.2));
          window.setTimeout(() => this.mimic.controller.hide(), 2600);
        }
      }
    }
  }

  dispose(): void {
    this.loop.stop();
    this.sequencer.stopAll();
    this.audio.dispose();
    this.mimic.dispose();
    this.world.dispose();
    this.postfx.dispose();
    this.input.dispose();
    this.renderer.dispose();
  }
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fall through to JSON */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export { CHAPTERS };
