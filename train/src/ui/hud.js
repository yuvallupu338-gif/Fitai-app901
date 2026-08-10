/*
 * hud.js — the crosshair, the prompt, the subtitles and the two toasts.
 *
 * There is no more than this on purpose. The game has no objective, no
 * inventory to check and no state the player is expected to manage, so the
 * only jobs the HUD has are telling them what they are pointing at and
 * transcribing what they are hearing. Both of those can be turned off.
 */

export class Hud {
  constructor(root, events, settings) {
    this.root = root;
    this.events = events;
    this.settings = settings;

    this.crosshair = root.querySelector('#crosshair');
    this.prompt = root.querySelector('#prompt');
    this.captions = root.querySelector('#captions');
    this.toasts = root.querySelector('#toasts');
    this.stationcard = root.querySelector('#stationcard');
    this.hints = root.querySelector('#hints');
    this.hintEls = [];

    this.lines = [];
    this.lastPromptKey = '';

    this.off = [
      events.on('subtitle', (payload) => this.caption(payload.text, payload.kind, payload.duration, payload.speaker)),
      events.on('caption', (payload) => {
        if (this.settings.soundCaptions) this.caption(payload.text, 'sound', 3.2);
      }),
      events.on('speech', (payload) => this.caption(payload.text, 'speech', 5.5, payload.speaker)),
      events.on('clue', ({ clue, total, of }) => this.toast('Found', `${clue.title} · ${total} of ${of}`)),
      events.on('achievement', (def) => this.toast('Achievement', def.name)),
      events.on('station', ({ station }) => this.showStation(station)),
      events.on('hint', (payload) => this.hint(payload)),
    ];
  }

  show(on) {
    this.root.hidden = !on;
    if (!on) { this.clearCaptions(); this.clearHints(); }
  }

  update(hover, opts = {}) {
    const cross = this.crosshair;
    cross.classList.toggle('hidden', !this.settings.crosshair || opts.hideAll === true);
    cross.classList.toggle('hot', Boolean(hover));

    if (!hover || opts.hideAll) {
      this.prompt.classList.remove('show');
      this.prompt.hidden = true;
      this.lastPromptKey = '';
      return;
    }
    const key = `${hover.verb}|${hover.label}`;
    if (key !== this.lastPromptKey) {
      this.lastPromptKey = key;
      this.prompt.innerHTML = `<span class="key">E</span>${escapeHtml(hover.verb || 'Use')}`
        + `<span class="label">${escapeHtml(hover.label || '')}</span>`;
    }
    this.prompt.hidden = false;
    this.prompt.classList.add('show');
  }

  /*
   * One caption line. Subtitles and sound captions share the strip so a
   * whispered line and the footsteps under it do not fight for the same
   * twenty pixels.
   */
  caption(text, kind = 'sound', duration = 3, speaker = '') {
    if (!text) return;
    /* Subtitles govern spoken lines and sound captions have their own switch;
       turning subtitles off used to silently take the sound captions with it
       while their toggle still read as on. */
    if (kind === 'sound') { if (!this.settings.soundCaptions) return; }
    else if (!this.settings.subtitles && kind !== 'speech') return;

    const el = document.createElement('div');
    el.className = `caption ${kind}`;
    el.style.setProperty('--sub-scale', this.settings.subtitleSize ?? 1);
    el.textContent = speaker && kind === 'speech' ? `${speaker}: ${text}` : text;
    this.captions.appendChild(el);

    const entry = { el, until: performance.now() + duration * 1000 };
    this.lines.push(entry);
    while (this.lines.length > 3) this._retire(this.lines.shift());

    entry.timer = setTimeout(() => {
      const i = this.lines.indexOf(entry);
      if (i >= 0) this.lines.splice(i, 1);
      this._retire(entry);
    }, Math.max(400, duration * 1000));
  }

  _retire(entry) {
    if (!entry || !entry.el.parentNode) return;
    clearTimeout(entry.timer);
    entry.el.classList.add('leaving');
    setTimeout(() => entry.el.remove(), 340);
  }

  clearCaptions() {
    for (const entry of this.lines) {
      clearTimeout(entry.timer);
      entry.el.remove();
    }
    this.lines.length = 0;
  }

  /*
   * A hint. Bottom-left, one at a time, and gone after its welcome. The game
   * explains nothing about itself except how to work the controls and what
   * the one decision is; everything else it refuses to say, which only works
   * if those two things are said clearly.
   */
  hint({ keys, text, duration = 8 }) {
    if (this.settings.hints === false) return;
    const el = document.createElement('div');
    el.className = 'hint';
    el.innerHTML = (keys ? `<span class="keys">${escapeHtml(keys)}</span>` : '')
      + escapeHtml(text);
    this.hints.appendChild(el);
    this.hintEls.push(el);
    while (this.hintEls.length > 2) this._retireHint(this.hintEls.shift());
    el.__timer = setTimeout(() => {
      const i = this.hintEls.indexOf(el);
      if (i >= 0) this.hintEls.splice(i, 1);
      this._retireHint(el);
    }, duration * 1000);
  }

  _retireHint(el) {
    if (!el || !el.parentNode) return;
    clearTimeout(el.__timer);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 520);
  }

  clearHints() {
    for (const el of this.hintEls) {
      clearTimeout(el.__timer);
      el.remove();
    }
    this.hintEls.length = 0;
  }

  toast(kind, name) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="kind">${escapeHtml(kind)}</div><div class="name">${escapeHtml(name)}</div>`;
    this.toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 420);
    }, 4200);
  }

  showStation(station) {
    const card = this.stationcard;
    card.hidden = false;
    card.classList.remove('leaving');
    const name = station.signName != null && station.signName.trim() === ''
      ? '· · ·'
      : (station.signName || station.name);
    card.innerHTML = `<div class="name">${escapeHtml(name)}</div>`
      + (station.signSub ? `<div class="sub">${escapeHtml(station.signSub)}</div>` : '');
    clearTimeout(this._stationTimer);
    this._stationTimer = setTimeout(() => {
      card.classList.add('leaving');
      setTimeout(() => { card.hidden = true; }, 720);
    }, 3600);
  }

  dispose() {
    for (const off of this.off) off();
    this.clearCaptions();
    this.clearHints();
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
