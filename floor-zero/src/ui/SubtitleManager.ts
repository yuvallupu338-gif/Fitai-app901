import { Settings } from '../core/types';

interface Entry {
  text: string;
  speaker?: string;
  remaining: number;
}

/**
 * Subtitles for every audible line and for the important non-verbal events, so
 * the game is playable with the sound off.
 */
export class SubtitleManager {
  private element: HTMLDivElement;
  private queue: Entry[] = [];
  private current: Entry | null = null;
  private enabled = true;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'subtitles';
    this.element.setAttribute('aria-live', 'polite');
    this.element.hidden = true;
    parent.appendChild(this.element);
  }

  applySettings(settings: Settings): void {
    this.enabled = settings.subtitles;
    this.element.classList.remove('subtitles--small', 'subtitles--medium', 'subtitles--large');
    this.element.classList.add(`subtitles--${settings.subtitleSize}`);
    if (!this.enabled) this.clear();
  }

  show(text: string, duration = 3.2, speaker?: string): void {
    if (!this.enabled || !text) return;
    // Never flash a line too briefly to read.
    const minimum = Math.max(1.6, Math.min(9, text.length * 0.055));
    const entry: Entry = { text, speaker, remaining: Math.max(duration, minimum) };
    if (this.current && this.current.text === text) {
      this.current.remaining = Math.max(this.current.remaining, entry.remaining);
      return;
    }
    this.queue.push(entry);
    if (this.queue.length > 4) this.queue.shift();
  }

  clear(): void {
    this.queue = [];
    this.current = null;
    this.element.hidden = true;
    this.element.textContent = '';
  }

  update(delta: number): void {
    if (!this.enabled) return;
    if (!this.current) {
      this.current = this.queue.shift() ?? null;
      if (this.current) this.render(this.current);
      else this.element.hidden = true;
      return;
    }
    this.current.remaining -= delta;
    if (this.current.remaining <= 0) {
      this.current = null;
      this.element.hidden = this.queue.length === 0;
      if (this.queue.length === 0) this.element.textContent = '';
    }
  }

  private render(entry: Entry): void {
    this.element.hidden = false;
    this.element.textContent = entry.speaker ? `${entry.speaker}: ${entry.text}` : entry.text;
  }
}
