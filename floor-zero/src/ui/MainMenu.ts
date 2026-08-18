import { MetaProgress } from '../core/types';
import { CHAPTERS } from '../data/chapters';
import { t } from '../data/localization';

export interface MainMenuHooks {
  newGame(): void;
  continueGame(): void;
  selectChapter(index: number): void;
  openSettings(): void;
  quit(): void;
}

type Panel = 'root' | 'chapters' | 'endings' | 'credits';

/**
 * The main menu sits over a live render of the lift interior, so the first
 * thing the player sees is the place the game keeps bringing them back to.
 */
export class MainMenu {
  readonly root: HTMLDivElement;
  private content: HTMLDivElement;
  private titleEl: HTMLHeadingElement;
  private panel: Panel = 'root';
  private meta: MetaProgress;
  private hasRun = false;
  private glitchTimer = 0;

  constructor(parent: HTMLElement, meta: MetaProgress, private readonly hooks: MainMenuHooks) {
    this.meta = meta;

    this.root = document.createElement('div');
    this.root.className = 'overlay menu';
    this.root.hidden = true;

    const shell = document.createElement('div');
    shell.className = 'menu__shell';
    this.root.appendChild(shell);

    this.titleEl = document.createElement('h1');
    this.titleEl.className = 'menu__title';
    shell.appendChild(this.titleEl);

    const subtitle = document.createElement('p');
    subtitle.className = 'menu__subtitle';
    subtitle.textContent = t('game.subtitle');
    shell.appendChild(subtitle);

    this.content = document.createElement('div');
    this.content.className = 'menu__content';
    shell.appendChild(this.content);

    parent.appendChild(this.root);
    this.render();
  }

  setMeta(meta: MetaProgress, hasRun: boolean): void {
    this.meta = meta;
    this.hasRun = hasRun;
    this.render();
  }

  open(): void {
    this.panel = 'root';
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** After ending 3 the title drops its zero for a moment. */
  update(delta: number): void {
    if (!this.meta.erased || this.root.hidden) return;
    this.glitchTimer += delta;
    const phase = this.glitchTimer % 9;
    this.titleEl.textContent = phase < 1.1 ? t('game.title_erased') : t('game.title');
  }

  private button(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'btn btn--menu';
    button.textContent = label;
    button.disabled = disabled;
    if (!disabled) button.addEventListener('click', onClick);
    this.content.appendChild(button);
    return button;
  }

  private backButton(): void {
    this.button(t('menu.back'), () => {
      this.panel = 'root';
      this.render();
    });
  }

  private render(): void {
    this.titleEl.textContent = t('game.title');
    this.content.innerHTML = '';

    switch (this.panel) {
      case 'root':
        this.button(t('menu.new_game'), () => this.hooks.newGame());
        if (this.hasRun) this.button(t('menu.continue'), () => this.hooks.continueGame());
        this.button(
          t('menu.chapters'),
          () => {
            this.panel = 'chapters';
            this.render();
          },
          !this.meta.completedOnce,
        );
        this.button(t('menu.settings'), () => this.hooks.openSettings());
        this.button(t('menu.endings'), () => {
          this.panel = 'endings';
          this.render();
        });
        this.button(t('menu.credits'), () => {
          this.panel = 'credits';
          this.render();
        });
        this.button(t('menu.exit'), () => this.hooks.quit());
        break;

      case 'chapters': {
        const note = document.createElement('p');
        note.className = 'menu__note';
        note.textContent = this.meta.completedOnce ? '' : t('chapters.locked_note');
        this.content.appendChild(note);
        for (const chapter of CHAPTERS) {
          const unlocked = this.meta.completedOnce && chapter.index <= this.meta.highestChapterReached;
          this.button(t(chapter.titleKey), () => this.hooks.selectChapter(chapter.index), !unlocked);
        }
        this.backButton();
        break;
      }

      case 'endings': {
        const list = document.createElement('div');
        list.className = 'endings';
        for (const ending of [1, 2, 3]) {
          const unlocked = this.meta.endingsUnlocked.includes(ending);
          const row = document.createElement('div');
          row.className = `ending ${unlocked ? 'is-unlocked' : ''}`;
          const name = document.createElement('strong');
          name.textContent = unlocked ? t(`ending.${ending}.name`) : '—';
          const status = document.createElement('span');
          status.textContent = unlocked ? '✓' : t('ending.locked');
          row.appendChild(name);
          row.appendChild(status);
          list.appendChild(row);
        }
        this.content.appendChild(list);
        const hint = document.createElement('p');
        hint.className = 'menu__note';
        hint.textContent = t('endings.hint');
        this.content.appendChild(hint);
        this.backButton();
        break;
      }

      case 'credits': {
        const body = document.createElement('pre');
        body.className = 'credits';
        body.textContent = t('credits.body');
        this.content.appendChild(body);
        this.backButton();
        break;
      }

      default:
        break;
    }
  }
}
