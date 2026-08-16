import type { GameContext } from '../core/Context';
import type { Routine } from '../core/Sequencer';
import { MetaProgress, Settings } from '../core/types';
import { NoteDef, TapeDef, line, localized } from '../data/dialogue';
import { t } from '../data/localization';
import { MainMenu, MainMenuHooks } from './MainMenu';
import { PauseMenu, PauseHooks } from './PauseMenu';
import { SettingsMenu, SettingsHooks } from './SettingsMenu';
import { SubtitleManager } from './SubtitleManager';

export interface UIHooks extends MainMenuHooks, PauseHooks, SettingsHooks {}

/**
 * All DOM. The 3D view never draws text; everything the player reads is here so
 * it stays crisp, translatable and right-to-left by default.
 */
export class UIManager {
  readonly root: HTMLDivElement;
  readonly menu: MainMenu;
  readonly pause: PauseMenu;
  readonly settings: SettingsMenu;
  readonly subtitles: SubtitleManager;

  private hud: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private objectiveEl: HTMLDivElement;
  private objectiveText = '';
  private reticle: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private toastTimer = 0;
  private noteOverlay: HTMLDivElement;
  private noteTitle: HTMLHeadingElement;
  private noteBody: HTMLPreElement;
  private loadingEl: HTMLDivElement;
  private loadingText: HTMLParagraphElement;
  private errorEl: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private cinematicEl: HTMLDivElement;
  private cinematicText: HTMLDivElement;
  private hideEl: HTMLDivElement;
  private rotateEl: HTMLDivElement;
  private fpsEl: HTMLDivElement;
  private objectiveVisible = false;
  private objectiveHold = 0;
  private noteOpen = false;
  private tapeVoice: { stop(): void } | null = null;

  constructor(parent: HTMLElement, meta: MetaProgress, settings: Settings, hooks: UIHooks) {
    this.root = document.createElement('div');
    this.root.className = 'ui';
    parent.appendChild(this.root);

    // --- HUD -------------------------------------------------------
    this.hud = document.createElement('div');
    this.hud.className = 'hud';
    this.root.appendChild(this.hud);

    this.reticle = document.createElement('div');
    this.reticle.className = 'reticle';
    this.hud.appendChild(this.reticle);

    this.promptEl = document.createElement('div');
    this.promptEl.className = 'prompt';
    this.promptEl.hidden = true;
    this.hud.appendChild(this.promptEl);

    this.objectiveEl = document.createElement('div');
    this.objectiveEl.className = 'objective';
    this.objectiveEl.hidden = true;
    this.hud.appendChild(this.objectiveEl);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.hidden = true;
    this.hud.appendChild(this.toastEl);

    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'fps';
    this.fpsEl.hidden = true;
    this.root.appendChild(this.fpsEl);

    this.subtitles = new SubtitleManager(this.hud);

    // --- Note / tape reader ---------------------------------------
    this.noteOverlay = document.createElement('div');
    this.noteOverlay.className = 'overlay reader';
    this.noteOverlay.hidden = true;
    const paper = document.createElement('div');
    paper.className = 'paper';
    this.noteTitle = document.createElement('h3');
    this.noteBody = document.createElement('pre');
    const closeNote = document.createElement('button');
    closeNote.className = 'btn btn--ghost';
    closeNote.textContent = t('common.close');
    closeNote.addEventListener('click', () => this.hideNote());
    paper.appendChild(this.noteTitle);
    paper.appendChild(this.noteBody);
    paper.appendChild(closeNote);
    this.noteOverlay.appendChild(paper);
    this.noteOverlay.addEventListener('click', (event) => {
      if (event.target === this.noteOverlay) this.hideNote();
    });
    this.root.appendChild(this.noteOverlay);

    // --- Loading / error ------------------------------------------
    this.loadingEl = document.createElement('div');
    this.loadingEl.className = 'overlay loading';
    this.loadingEl.hidden = true;
    const loadingTitle = document.createElement('h2');
    loadingTitle.textContent = t('loading.title');
    this.loadingText = document.createElement('p');
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    this.loadingEl.appendChild(loadingTitle);
    this.loadingEl.appendChild(spinner);
    this.loadingEl.appendChild(this.loadingText);
    this.root.appendChild(this.loadingEl);

    this.errorEl = document.createElement('div');
    this.errorEl.className = 'overlay error';
    this.errorEl.hidden = true;
    this.root.appendChild(this.errorEl);

    // --- Full-screen effects --------------------------------------
    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'fade';
    this.root.appendChild(this.fadeEl);

    this.cinematicEl = document.createElement('div');
    this.cinematicEl.className = 'cinematic';
    this.cinematicEl.hidden = true;
    this.cinematicText = document.createElement('div');
    this.cinematicText.className = 'cinematic__text';
    this.cinematicEl.appendChild(this.cinematicText);
    this.root.appendChild(this.cinematicEl);

    this.hideEl = document.createElement('div');
    this.hideEl.className = 'hiding';
    this.hideEl.hidden = true;
    this.root.appendChild(this.hideEl);

    this.rotateEl = document.createElement('div');
    this.rotateEl.className = 'overlay rotate';
    this.rotateEl.hidden = true;
    const rotateTitle = document.createElement('h2');
    rotateTitle.textContent = t('mobile.rotate');
    const rotateSub = document.createElement('p');
    rotateSub.textContent = t('mobile.rotate_sub');
    this.rotateEl.appendChild(rotateTitle);
    this.rotateEl.appendChild(rotateSub);
    this.root.appendChild(this.rotateEl);

    // --- Menus -----------------------------------------------------
    this.menu = new MainMenu(this.root, meta, hooks);
    this.pause = new PauseMenu(this.root, hooks);
    this.settings = new SettingsMenu(this.root, settings, hooks);

    this.applySettings(settings);
  }

  applySettings(settings: Settings): void {
    this.subtitles.applySettings(settings);
    this.settings.setSettings(settings);
    document.documentElement.classList.toggle('high-contrast', settings.highContrast);
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
  }

  /* ---------------------------------------------------------------- */
  /* HUD                                                               */
  /* ---------------------------------------------------------------- */

  setHudVisible(visible: boolean): void {
    this.hud.hidden = !visible;
  }

  setPrompt(text: string | null): void {
    if (!text) {
      this.promptEl.hidden = true;
      this.reticle.classList.remove('is-active');
      return;
    }
    this.promptEl.hidden = false;
    this.promptEl.textContent = `[${t('prompt.key')}] ${text}`;
    this.reticle.classList.add('is-active');
  }

  setObjective(text: string): void {
    this.objectiveText = text;
    this.objectiveEl.textContent = `${t('hud.objective')}: ${text}`;
    this.objectiveHold = 5;
    this.objectiveVisible = true;
    this.objectiveEl.hidden = false;
  }

  showObjectiveNow(): void {
    if (!this.objectiveText) return;
    this.objectiveHold = Math.max(this.objectiveHold, 0.4);
    this.objectiveVisible = true;
    this.objectiveEl.hidden = false;
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    this.toastTimer = 2.6;
  }

  setFps(value: number | null): void {
    if (value === null) {
      this.fpsEl.hidden = true;
      return;
    }
    this.fpsEl.hidden = false;
    this.fpsEl.textContent = `${Math.round(value)} fps`;
  }

  /* ---------------------------------------------------------------- */
  /* Reader                                                            */
  /* ---------------------------------------------------------------- */

  showNote(note: NoteDef): void {
    this.noteTitle.textContent = localized(note.title);
    this.noteBody.textContent = localized(note.body);
    this.noteOverlay.hidden = false;
    this.noteOpen = true;
  }

  hideNote(): void {
    this.noteOverlay.hidden = true;
    this.noteOpen = false;
  }

  get isReading(): boolean {
    return this.noteOpen;
  }

  playTape(tape: TapeDef, ctx: GameContext): void {
    this.tapeVoice?.stop();
    const hiss = ctx.audio.play('tape_hiss', { loop: true, volume: 0.8, bus: 'voice' });
    this.tapeVoice = { stop: () => ctx.audio.stop(hiss, 0.4) };
    this.toast(`${t('tape.title')} — ${localized(tape.title)}`);
    ctx.sequencer.run(this.tapeRoutine(tape, ctx), 'tape');
  }

  private *tapeRoutine(tape: TapeDef, ctx: GameContext): Routine {
    let elapsed = 0;
    for (const entry of tape.lines) {
      const wait = Math.max(0, entry.at - elapsed);
      elapsed = entry.at;
      if (wait > 0) yield wait;
      ctx.say(localized(entry.text), 4.6);
    }
    yield Math.max(0.5, tape.duration - elapsed);
    this.tapeVoice?.stop();
    this.tapeVoice = null;
  }

  /* ---------------------------------------------------------------- */
  /* Sequences                                                         */
  /* ---------------------------------------------------------------- */

  /** The one hiding beat: slats close, something walks past, slats open. */
  hideSequence(ctx: GameContext): void {
    ctx.sequencer.run(this.hideRoutine(ctx), 'hide');
  }

  private *hideRoutine(ctx: GameContext): Routine {
    ctx.state.cinematic = true;
    ctx.player.frozen = true;
    this.hideEl.hidden = false;
    ctx.audio.play('door_wood_close', { volume: 0.7 });
    ctx.tension.add(24);
    yield 1.4;

    ctx.audio.play('step_wood', { volume: 0.7, rate: 0.8 });
    yield 0.7;
    ctx.audio.play('step_wood', { volume: 0.8, rate: 0.8 });
    yield 0.7;
    ctx.audio.play('breath', { volume: 0.9, bus: 'voice' });
    yield 1.8;
    ctx.audio.play('step_wood', { volume: 0.6, rate: 0.8 });
    yield 0.9;
    ctx.audio.play('step_wood', { volume: 0.4, rate: 0.8 });
    yield 2.2;

    this.hideEl.hidden = true;
    ctx.audio.play('door_wood_open', { volume: 0.7 });
    ctx.player.frozen = false;
    ctx.state.cinematic = false;
    ctx.tension.add(-18);
  }

  /** Black screen with a line of text, used for the prologue and the endings. */
  cinematic(text: string | null): void {
    if (text === null) {
      this.cinematicEl.hidden = true;
      return;
    }
    this.cinematicEl.hidden = false;
    this.cinematicText.textContent = text;
  }

  setFade(alpha: number): void {
    this.fadeEl.style.opacity = String(Math.max(0, Math.min(1, alpha)));
  }

  showLoading(text: string): void {
    this.loadingText.textContent = text;
    this.loadingEl.hidden = false;
  }

  hideLoading(): void {
    this.loadingEl.hidden = true;
  }

  showError(title: string, body: string): void {
    this.errorEl.innerHTML = '';
    const heading = document.createElement('h2');
    heading.textContent = title;
    const paragraph = document.createElement('p');
    paragraph.textContent = body;
    const reload = document.createElement('button');
    reload.className = 'btn';
    reload.textContent = t('error.reload');
    reload.addEventListener('click', () => window.location.reload());
    this.errorEl.appendChild(heading);
    this.errorEl.appendChild(paragraph);
    this.errorEl.appendChild(reload);
    this.errorEl.hidden = false;
  }

  showDeath(onRetry: () => void, cause = 'mimic'): void {
    this.errorEl.innerHTML = '';
    this.errorEl.classList.add('error--death');
    const heading = document.createElement('h2');
    // Each thing on the floor gets its own last line. t() returns the key when
    // it has no entry, so that is what an unknown cause is detected by.
    const key = `death.caught.${cause}`;
    const text = t(key);
    heading.textContent = text === key ? t('death.caught') : text;
    const retry = document.createElement('button');
    retry.className = 'btn btn--menu';
    retry.textContent = t('death.retry');
    retry.addEventListener('click', () => {
      this.errorEl.hidden = true;
      this.errorEl.classList.remove('error--death');
      onRetry();
    });
    this.errorEl.appendChild(heading);
    this.errorEl.appendChild(retry);
    this.errorEl.hidden = false;
  }

  setRotatePrompt(visible: boolean): void {
    this.rotateEl.hidden = !visible;
  }

  /* ---------------------------------------------------------------- */

  update(delta: number, ctx: GameContext | null): void {
    this.subtitles.update(delta);
    this.menu.update(delta);

    if (this.toastTimer > 0) {
      this.toastTimer -= delta;
      if (this.toastTimer <= 0) this.toastEl.hidden = true;
    }

    if (this.objectiveVisible) {
      const held = ctx?.input.isDown('objective') ?? false;
      if (!held) {
        this.objectiveHold -= delta;
        if (this.objectiveHold <= 0) {
          this.objectiveVisible = false;
          this.objectiveEl.hidden = true;
        }
      }
    } else if (ctx?.input.isDown('objective')) {
      this.showObjectiveNow();
    }
  }

  /** Convenience used by the endings. */
  endingLine(key: string): string {
    return line(key);
  }
}
