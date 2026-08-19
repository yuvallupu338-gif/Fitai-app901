/*
 * puzzle.js — the panel you get when you press E on a lock.
 *
 * The object in the world is real geometry — a mailbox with a combination
 * dial, four gnomes, three music boxes — and this is the interface to it. It
 * is DOM rather than something drawn in the canvas for three reasons that all
 * matter: a keypad has to be hittable with a thumb on a phone, the digits have
 * to be readable at whatever the player's text size is, and the whole thing
 * has to work right-to-left.
 *
 * The clock does not stop while this is open. That is the entire design of the
 * puzzles: standing at a keypad is spending the same seconds as running, and
 * she is still out there, and the panel covers the middle of your screen.
 */

const $ = (sel) => document.querySelector(sel);

export class PuzzlePanel {
  constructor() {
    this.el = $('#puzzle');
    this.title = $('#puzzle-title');
    this.note = $('#puzzle-note');
    this.body = $('#puzzle-body');
    this.status = $('#puzzle-status');
    this.open = false;
    this.puzzle = null;
    this.onSolve = null;
    this.onWrong = null;
    this.onClose = null;
    this.onPress = null;
    $('#puzzle-close').addEventListener('click', () => this.close());
    /* Escape closes the panel rather than the game. Pointer lock is already
     * gone by the time this is open, so the usual Escape handler would drop
     * the player into the pause menu with a keypad still on screen. */
    this._key = (e) => {
      if (!this.open) return;
      if (e.code === 'Escape') { e.stopPropagation(); this.close(); }
      if (this.entry !== undefined && /^Digit[0-9]$/.test(e.code)) this.digit(e.code[5]);
      if (this.entry !== undefined && e.code === 'Backspace') this.digit(null);
      if (this.entry !== undefined && e.code === 'Enter') this.submitKeypad();
    };
    window.addEventListener('keydown', this._key, true);
  }

  show(puzzle, extra = {}) {
    this.puzzle = puzzle;
    this.open = true;
    /* A lock can be walked away from; the last night's choice cannot, so the
     * close button and Escape are taken away for it. */
    this.locked = !!extra.noClose;
    document.querySelector('#puzzle-close').hidden = this.locked;
    this.el.hidden = false;
    this.title.textContent = puzzle.title;
    this.note.textContent = extra.note || puzzle.note;
    this.status.textContent = '';
    this.status.className = '';
    this.body.textContent = '';
    this.entry = undefined;
    if (puzzle.kind === 'keypad') this.buildKeypad(puzzle);
    else if (puzzle.kind === 'choice') this.buildChoice(puzzle, extra);
    else if (puzzle.kind === 'order') this.buildOrder(puzzle);
  }

  close() {
    if (!this.open || this.locked) return;
    this.open = false;
    this.el.hidden = true;
    if (this.onClose) this.onClose();
  }

  solved(ok) {
    if (ok) {
      this.puzzle.solved = true;
      this.status.textContent = 'נפתח.';
      this.status.className = 'ok';
      if (this.onSolve) this.onSolve(this.puzzle);
      setTimeout(() => this.close(), 700);
    } else {
      this.status.textContent = 'לא.';
      this.status.className = 'bad';
      if (this.onWrong) this.onWrong(this.puzzle);
    }
  }

  /* ---------------------------------------------------------------- *
   * Keypad
   * ---------------------------------------------------------------- */

  buildKeypad(p) {
    this.entry = '';
    const out = document.createElement('div');
    out.className = 'readout';
    this.body.appendChild(out);
    this.entryEl = out;
    this.renderEntry();

    const pad = document.createElement('div');
    pad.className = 'keypad';
    for (const label of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '↵']) {
      const b = document.createElement('button');
      b.className = 'key' + (label === '⌫' ? ' clear' : label === '↵' ? ' go' : '');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        if (label === '⌫') this.digit(null);
        else if (label === '↵') this.submitKeypad();
        else this.digit(label);
      });
      pad.appendChild(b);
    }
    this.body.appendChild(pad);
    void p;
  }

  digit(d) {
    if (this.entry === undefined) return;
    if (d === null) this.entry = this.entry.slice(0, -1);
    else if (this.entry.length < (this.puzzle.digits || 4)) this.entry += d;
    if (this.onPress) this.onPress(this.entry.length, null);
    this.renderEntry();
    /* Submit itself the moment the last digit lands. A player standing at a
     * mailbox with a woman coming up the street should not also have to find
     * the enter key. */
    if (this.entry.length === (this.puzzle.digits || 4)) this.submitKeypad();
  }

  renderEntry() {
    const n = this.puzzle.digits || 4;
    const cells = [];
    for (let i = 0; i < n; i++) cells.push(this.entry[i] || '·');
    this.entryEl.textContent = cells.join(' ');
  }

  submitKeypad() {
    if (this.entry === undefined) return;
    const ok = this.entry === String(this.puzzle.answer);
    if (this.onPress) this.onPress(this.entry.length, ok);
    if (!ok) {
      this.entry = '';
      this.renderEntry();
    }
    this.solved(ok);
  }

  /* ---------------------------------------------------------------- *
   * Choice
   * ---------------------------------------------------------------- */

  buildChoice(p, extra) {
    const row = document.createElement('div');
    row.className = 'choice';
    p.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.type = 'button';
      b.textContent = (extra.labels && extra.labels[i]) || `תיבה ${i + 1}`;
      b.addEventListener('click', () => {
        if (extra.onPreview) extra.onPreview(i, opt);
        /*
         * Two kinds of choice go through here. A lock is graded: the wrong
         * music box plays a sour note loud enough to bring her, which is what
         * stops it being brute-forced in four seconds. The last night's
         * decision is not graded at all — both answers are answers — so a
         * caller that passes onChoose takes the option and closes.
         */
        if (extra.onChoose) {
          this.open = false;
          this.el.hidden = true;
          extra.onChoose(i, opt);
          return;
        }
        this.solved(i === p.answer);
      });
      row.appendChild(b);
    });
    this.body.appendChild(row);
  }

  /* ---------------------------------------------------------------- *
   * Order
   * ---------------------------------------------------------------- */

  buildOrder(p) {
    this.order = p.items.map((it) => it.id);
    const list = document.createElement('div');
    list.className = 'order';
    this.body.appendChild(list);
    this.orderEl = list;
    this.renderOrder(p);

    const go = document.createElement('button');
    go.className = 'btn small primary';
    go.type = 'button';
    go.textContent = 'לבדוק';
    go.addEventListener('click', () => {
      const ok = this.order.every((id, i) => id === p.answer[i]);
      this.solved(ok);
    });
    this.body.appendChild(go);
  }

  renderOrder(p) {
    this.orderEl.textContent = '';
    this.order.forEach((id, i) => {
      const item = p.items.find((x) => x.id === id);
      const row = document.createElement('div');
      row.className = 'order-item';
      const name = document.createElement('span');
      name.innerHTML = `<span class="idx">${i + 1}</span>`;
      name.appendChild(document.createTextNode(item.name));
      row.appendChild(name);
      const moves = document.createElement('span');
      moves.className = 'order-moves';
      for (const [label, delta] of [['▲', -1], ['▼', 1]]) {
        const b = document.createElement('button');
        b.className = 'move';
        b.type = 'button';
        b.textContent = label;
        b.disabled = (i === 0 && delta < 0) || (i === this.order.length - 1 && delta > 0);
        b.addEventListener('click', () => {
          const j = i + delta;
          const t = this.order[i];
          this.order[i] = this.order[j];
          this.order[j] = t;
          if (this.onPress) this.onPress(i, null);
          this.renderOrder(p);
        });
        moves.appendChild(b);
      }
      row.appendChild(moves);
      this.orderEl.appendChild(row);
    });
  }

  dispose() {
    window.removeEventListener('keydown', this._key, true);
  }
}
