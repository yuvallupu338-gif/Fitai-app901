import { Language, QualityLevel, Settings } from '../core/types';
import { setLanguage, t } from '../data/localization';

export type SettingsTab = 'audio' | 'controls' | 'video' | 'access' | 'data';

export interface SettingsHooks {
  onChange(settings: Settings): void;
  onResetSave(): void;
  onClose(): void;
}

/**
 * Every option in the design lives here, grouped into five tabs. Changes apply
 * immediately and are written to disk by the game.
 */
export class SettingsMenu {
  readonly root: HTMLDivElement;
  private body: HTMLDivElement;
  private tabsBar: HTMLDivElement;
  private tab: SettingsTab = 'audio';
  private settings: Settings;

  constructor(parent: HTMLElement, settings: Settings, private readonly hooks: SettingsHooks) {
    this.settings = settings;

    this.root = document.createElement('div');
    this.root.className = 'overlay settings';
    this.root.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'panel panel--wide';
    this.root.appendChild(panel);

    const header = document.createElement('div');
    header.className = 'panel__header';
    const title = document.createElement('h2');
    title.textContent = t('settings.title');
    header.appendChild(title);
    const close = document.createElement('button');
    close.className = 'btn btn--ghost';
    close.textContent = t('common.close');
    close.addEventListener('click', () => this.hooks.onClose());
    header.appendChild(close);
    panel.appendChild(header);

    this.tabsBar = document.createElement('div');
    this.tabsBar.className = 'tabs';
    panel.appendChild(this.tabsBar);

    this.body = document.createElement('div');
    this.body.className = 'settings__body';
    panel.appendChild(this.body);

    parent.appendChild(this.root);
    this.buildTabs();
    this.render();
  }

  private buildTabs(): void {
    const tabs: Array<[SettingsTab, string]> = [
      ['audio', 'settings.tab_audio'],
      ['controls', 'settings.tab_controls'],
      ['video', 'settings.tab_video'],
      ['access', 'settings.tab_access'],
      ['data', 'settings.tab_data'],
    ];
    this.tabsBar.innerHTML = '';
    for (const [id, key] of tabs) {
      const button = document.createElement('button');
      button.className = `tab ${this.tab === id ? 'is-active' : ''}`;
      button.textContent = t(key);
      button.addEventListener('click', () => {
        this.tab = id;
        this.buildTabs();
        this.render();
      });
      this.tabsBar.appendChild(button);
    }
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.render();
  }

  open(): void {
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  private commit(): void {
    this.hooks.onChange(this.settings);
  }

  private row(label: string, control: HTMLElement, hint?: string): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'setting';
    const text = document.createElement('div');
    text.className = 'setting__label';
    text.textContent = label;
    if (hint) {
      const small = document.createElement('span');
      small.className = 'setting__hint';
      small.textContent = hint;
      text.appendChild(small);
    }
    row.appendChild(text);
    const holder = document.createElement('div');
    holder.className = 'setting__control';
    holder.appendChild(control);
    row.appendChild(holder);
    this.body.appendChild(row);
    return row;
  }

  private slider(
    value: number,
    min: number,
    max: number,
    step: number,
    onInput: (value: number) => void,
    format: (value: number) => string = (v) => `${Math.round(v * 100)}%`,
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'slider';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const readout = document.createElement('span');
    readout.className = 'slider__value';
    readout.textContent = format(value);
    input.addEventListener('input', () => {
      const next = Number(input.value);
      readout.textContent = format(next);
      onInput(next);
      this.commit();
    });
    wrap.appendChild(input);
    wrap.appendChild(readout);
    return wrap;
  }

  private toggle(value: boolean, onChange: (value: boolean) => void): HTMLElement {
    const button = document.createElement('button');
    button.className = `switch ${value ? 'is-on' : ''}`;
    button.type = 'button';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', String(value));
    button.textContent = value ? t('common.on') : t('common.off');
    button.addEventListener('click', () => {
      const next = !button.classList.contains('is-on');
      button.classList.toggle('is-on', next);
      button.setAttribute('aria-checked', String(next));
      button.textContent = next ? t('common.on') : t('common.off');
      onChange(next);
      this.commit();
    });
    return button;
  }

  private choice<T extends string>(
    value: T,
    options: Array<[T, string]>,
    onChange: (value: T) => void,
  ): HTMLElement {
    const group = document.createElement('div');
    group.className = 'choice';
    const buttons: HTMLButtonElement[] = [];
    for (const [id, label] of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `choice__item ${value === id ? 'is-active' : ''}`;
      button.textContent = label;
      button.addEventListener('click', () => {
        for (const other of buttons) other.classList.remove('is-active');
        button.classList.add('is-active');
        onChange(id);
        this.commit();
      });
      buttons.push(button);
      group.appendChild(button);
    }
    return group;
  }

  private render(): void {
    this.body.innerHTML = '';
    const s = this.settings;

    switch (this.tab) {
      case 'audio':
        this.row(t('settings.master'), this.slider(s.masterVolume, 0, 1, 0.01, (v) => (s.masterVolume = v)));
        this.row(t('settings.music'), this.slider(s.musicVolume, 0, 1, 0.01, (v) => (s.musicVolume = v)));
        this.row(t('settings.sfx'), this.slider(s.sfxVolume, 0, 1, 0.01, (v) => (s.sfxVolume = v)));
        this.row(t('settings.voice'), this.slider(s.voiceVolume, 0, 1, 0.01, (v) => (s.voiceVolume = v)));
        this.row(t('settings.subtitles'), this.toggle(s.subtitles, (v) => (s.subtitles = v)));
        break;

      case 'controls':
        this.row(
          t('settings.mouse'),
          this.slider(s.mouseSensitivity, 0.2, 3, 0.05, (v) => (s.mouseSensitivity = v), (v) => v.toFixed(2)),
        );
        this.row(
          t('settings.touch'),
          this.slider(s.touchSensitivity, 0.2, 3, 0.05, (v) => (s.touchSensitivity = v), (v) => v.toFixed(2)),
        );
        this.row(t('settings.invert_y'), this.toggle(s.invertY, (v) => (s.invertY = v)));
        this.row(t('settings.sprint_toggle'), this.toggle(s.sprintToggle, (v) => (s.sprintToggle = v)));
        this.row(
          t('settings.fov'),
          this.slider(s.fov, 60, 100, 1, (v) => (s.fov = v), (v) => `${Math.round(v)}°`),
        );
        break;

      case 'video':
        this.row(
          t('settings.quality'),
          this.choice<QualityLevel>(
            s.quality,
            [
              ['low', t('settings.quality.low')],
              ['medium', t('settings.quality.medium')],
              ['high', t('settings.quality.high')],
            ],
            (v) => (s.quality = v),
          ),
        );
        this.row(t('settings.shadows'), this.toggle(s.shadows, (v) => (s.shadows = v)));
        this.row(
          t('settings.screen_fx'),
          this.slider(s.screenEffects, 0, 1, 0.05, (v) => (s.screenEffects = v)),
        );
        this.row(t('settings.head_bob'), this.toggle(s.headBob, (v) => (s.headBob = v)));
        this.row(
          t('settings.language'),
          this.choice<Language>(
            s.lang,
            [
              ['he', 'עברית'],
              ['en', 'English'],
            ],
            (v) => {
              s.lang = v;
              setLanguage(v);
              this.buildTabs();
              window.setTimeout(() => this.render(), 0);
            },
          ),
        );
        break;

      case 'access':
        this.row(t('settings.high_contrast'), this.toggle(s.highContrast, (v) => (s.highContrast = v)));
        this.row(t('settings.reduce_motion'), this.toggle(s.reduceMotion, (v) => (s.reduceMotion = v)));
        this.row(t('settings.reduce_flashing'), this.toggle(s.reduceFlashing, (v) => (s.reduceFlashing = v)));
        this.row(
          t('settings.scare'),
          this.choice(
            s.scareIntensity,
            [
              ['normal', t('settings.scare.normal')],
              ['reduced', t('settings.scare.reduced')],
            ],
            (v) => (s.scareIntensity = v),
          ),
        );
        this.row(
          t('settings.subtitle_size'),
          this.choice(
            s.subtitleSize,
            [
              ['small', t('settings.size.small')],
              ['medium', t('settings.size.medium')],
              ['large', t('settings.size.large')],
            ],
            (v) => (s.subtitleSize = v),
          ),
        );
        this.row(t('settings.hints'), this.toggle(s.extraHints, (v) => (s.extraHints = v)));
        break;

      case 'data': {
        const button = document.createElement('button');
        button.className = 'btn btn--danger';
        button.textContent = t('settings.reset_save');
        button.addEventListener('click', () => {
          const confirmRow = document.createElement('div');
          confirmRow.className = 'confirm';
          const message = document.createElement('p');
          message.textContent = t('settings.reset_confirm');
          const yes = document.createElement('button');
          yes.className = 'btn btn--danger';
          yes.textContent = t('common.confirm');
          const no = document.createElement('button');
          no.className = 'btn btn--ghost';
          no.textContent = t('common.cancel');
          yes.addEventListener('click', () => {
            this.hooks.onResetSave();
            confirmRow.replaceChildren(document.createTextNode(t('settings.reset_done')));
          });
          no.addEventListener('click', () => confirmRow.remove());
          confirmRow.appendChild(message);
          confirmRow.appendChild(yes);
          confirmRow.appendChild(no);
          this.body.appendChild(confirmRow);
        });
        this.row(t('settings.reset_save'), button);
        break;
      }

      default:
        break;
    }
  }
}
