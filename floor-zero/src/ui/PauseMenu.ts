import { t } from '../data/localization';

export interface PauseHooks {
  resume(): void;
  openSettings(): void;
  restartCheckpoint(): void;
  toMainMenu(): void;
}

export class PauseMenu {
  readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, hooks: PauseHooks) {
    this.root = document.createElement('div');
    this.root.className = 'overlay pause';
    this.root.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'panel';
    this.root.appendChild(panel);

    const title = document.createElement('h2');
    title.textContent = t('pause.title');
    panel.appendChild(title);

    const actions: Array<[string, () => void]> = [
      [t('pause.resume'), hooks.resume],
      [t('pause.settings'), hooks.openSettings],
      [t('pause.checkpoint'), hooks.restartCheckpoint],
      [t('pause.menu'), hooks.toMainMenu],
    ];

    for (const [label, action] of actions) {
      const button = document.createElement('button');
      button.className = 'btn btn--menu';
      button.textContent = label;
      button.addEventListener('click', action);
      panel.appendChild(button);
    }

    parent.appendChild(this.root);
  }

  open(): void {
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }
}
