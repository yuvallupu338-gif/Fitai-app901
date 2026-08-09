/*
 * overlay.js — reading something.
 *
 * Picking up a piece of paper stops the world and puts the paper on the
 * screen, big enough to read without leaning in. The alternative — texture
 * text on a prop in the world — was tried and is unreadable at any resolution
 * a browser will give you, and squinting is not tension.
 *
 * Flavour lines and dialogue use the same layer with no panel behind them, so
 * a sentence about what you can see through the window does not arrive looking
 * like a document.
 */

import { escapeHtml } from './hud.js';

export class Overlay {
  constructor(root, events, sfx) {
    this.root = root;
    this.events = events;
    this.sfx = sfx;
    this.open = false;
    this.onClose = null;
    this._flavourTimer = 0;

    this.off = [
      events.on('document', (payload) => this.showDocument(payload)),
      events.on('flavour', (payload) => this.showFlavour(payload.text)),
    ];

    this.root.addEventListener('click', () => { if (this.open) this.hide(); });
    this._onKey = (e) => {
      if (!this.open) return;
      if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      }
    };
    window.addEventListener('keydown', this._onKey, true);
  }

  showDocument(payload) {
    const doc = document.createElement('div');
    doc.className = 'document';

    if (payload.kind === 'image' && payload.canvas) {
      doc.classList.add('dark');
      doc.innerHTML = `<h2>${escapeHtml(payload.title || '')}</h2>`;
      const img = document.createElement('img');
      /* The canvas is the live texture, so what the player reads is exactly
         what is screwed to the wall right now — including whatever it has
         been changed to since they last looked. */
      try { img.src = payload.canvas.toDataURL('image/png'); } catch { /* tainted, never happens here */ }
      img.alt = payload.title || '';
      doc.appendChild(img);
      if (payload.caption) {
        const cap = document.createElement('span');
        cap.className = 'caption';
        cap.textContent = payload.caption;
        doc.appendChild(cap);
      }
    } else if (payload.clue) {
      const clue = payload.clue;
      doc.innerHTML = `<h2>${escapeHtml(clue.title)}</h2>`
        + clue.lines.map((l) => `<p class="${escapeHtml(l.class || '')}">${escapeHtml(l.text)}</p>`).join('');
    } else {
      doc.innerHTML = `<h2>${escapeHtml(payload.title || '')}</h2><p>${escapeHtml(payload.body || '')}</p>`;
    }

    const dismiss = document.createElement('div');
    dismiss.className = 'dismiss';
    dismiss.textContent = 'E · put it back';
    doc.appendChild(dismiss);

    this._present(doc);
  }

  showFlavour(text) {
    if (!text) return;
    const el = document.createElement('div');
    el.className = 'flavour';
    el.textContent = text;
    this._present(el, { transient: 4.6 });
  }

  showSpeech(speaker, text) {
    const el = document.createElement('div');
    el.className = 'flavour';
    el.innerHTML = (speaker ? `<span class="speaker">${escapeHtml(speaker)}</span>` : '') + escapeHtml(text);
    this._present(el, { transient: 6 });
  }

  _present(node, opts = {}) {
    clearTimeout(this._flavourTimer);
    this.root.innerHTML = '';
    this.root.appendChild(node);
    this.root.hidden = false;
    this.root.classList.remove('leaving');
    this.open = true;
    this.transient = Boolean(opts.transient);
    this.events.emit('overlay:open', { transient: this.transient });
    if (opts.transient) {
      this._flavourTimer = setTimeout(() => this.hide(), opts.transient * 1000);
    }
  }

  hide(silent = false) {
    if (!this.open) return;
    clearTimeout(this._flavourTimer);
    this.open = false;
    this.root.classList.add('leaving');
    setTimeout(() => {
      if (this.open) return;
      this.root.hidden = true;
      this.root.innerHTML = '';
    }, 190);
    if (!silent) this.sfx?.play('cloth', { caption: false });
    this.events.emit('overlay:close');
    this.onClose?.();
  }

  dispose() {
    for (const off of this.off) off();
    window.removeEventListener('keydown', this._onKey, true);
  }
}
