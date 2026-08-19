/*
 * scene.js — the cutscene player.
 *
 * Six scripted moments carry the first night: a conversation over a fence at
 * seven in the evening, a photograph on the kitchen table at half past ten,
 * twenty seconds of dream over black at midnight, waking at 3:29, the first
 * time she is on the screen, and Bob at the fence again in the morning.
 * story.js already holds them as lists of beats. This is the thing that puts
 * them up.
 *
 * It is a loop over a list and a timer, and it is deliberately nothing more.
 * The timing belongs to the beats — the two-second silence before Bob says
 * "קישוט" is a fact about the scene rather than a fade duration — so nothing
 * here waits on an animation event or on a frame callback, and a beat lasts
 * exactly as long as story.js says it does.
 *
 * Two rules it does not get to break. It never takes a pointer event: the
 * skip listens at the window instead, because the beat at 3:32 plays over the
 * live game with the clock still running, and a full-screen element that
 * swallowed a thumb would cost a phone player the night. And it is skippable
 * unless the caller says otherwise, and says so once, quietly — the second run
 * of a horror game is the one where the player already knows what is coming,
 * and an unskippable cutscene is where they stop replaying it.
 */

/* Who is talking, when anyone is. `null` covers both description and Adam's
 * own thoughts, and they share one voice on purpose: the whole neighbourhood
 * is his memory, so there is nobody else here to be noticing things. */
const SPEAKERS = {
  bob: 'בוב',
  adam: 'אדם',
  /* Not her name. Her name is the last thing the game gives up — a diary page
   * in a house that is locked on most nights — and a label over her first line
   * would hand it to everyone in the third minute of night one. */
  evelyn: 'האישה',
};

/* A beat with no `ms` is a mistake in the script rather than an instruction to
 * hang. Three seconds and on to the next one. */
const DEFAULT_MS = 3000;

/* The first third of a second of a sequence is deaf to the skip. play() is
 * normally called out of the very press that started the thing — E on the bed,
 * a click on a menu button — and E held down long enough to auto-repeat would
 * otherwise skip the scene it had just opened. */
const DEAF_MS = 350;

/* How long the one skip line stays up. */
const HINT_MS = 5600;

/*
 * How long a sequence that ended on black holds the black before letting go of
 * it by itself. `opts.black` means the caller is taking the screen from here —
 * swap the world behind it, then fade in — so the black has to survive the
 * promise resolving. This is the timer that stops a caller which threw on the
 * way from leaving the player looking at nothing at all: long enough to build
 * a night, short enough that nobody decides the game has crashed.
 */
const BLACK_HOLD_MS = 6000;

export class Scene {
  constructor() {
    /* index.html does not have #scene and does not need to: the element is
     * this class's, and it goes inside #ui, which is the layer that already
     * lies over the canvas and takes no pointer events. <body> is the fallback
     * so a bare harness page that imports only this file still works. */
    this.el = document.querySelector('#scene');
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'scene';
      (document.querySelector('#ui') || document.body).appendChild(this.el);
    }
    this.el.hidden = true;
    this.el.textContent = '';

    this.veilEl = document.createElement('div');
    this.veilEl.id = 'scene-veil';
    this.el.appendChild(this.veilEl);

    this.textEl = document.createElement('div');
    this.textEl.id = 'scene-text';
    /* polite, not assertive: the beats replace each other every couple of
     * seconds and an assertive region spends the scene interrupting itself. */
    this.textEl.setAttribute('aria-live', 'polite');
    this.el.appendChild(this.textEl);

    this.hintEl = document.createElement('div');
    this.hintEl.id = 'scene-skip';
    this.hintEl.hidden = true;
    this.el.appendChild(this.hintEl);

    this._run = null;
    this._token = 0;
    this._advance = null;      /* ends the beat that is on screen, if any     */
    this._holding = false;     /* that beat is waiting for a press, not a timer */
    this._skipped = false;
    this._skippable = true;
    this._hinted = false;
    this._deafUntil = 0;
    this._timer = 0;
    this._hintT = 0;
    this._blackT = 0;
    this._hideT = 0;
    this._shakeT = 0;

    /*
     * Capture, so that the press which ends a beat is eaten before input.js
     * sees it. Otherwise skipping the scene at the bed also presses E on the
     * bed, and the player who wanted to read the line ends up in the night.
     * A tap cannot be swallowed the same way — the click that follows it is a
     * separate event — but a stray click in this game only asks for the
     * pointer back, so it is left alone.
     */
    this._onKey = (e) => {
      if (e.repeat) return;
      if (e.code !== 'Escape' && e.code !== 'KeyE') return;
      if (this._press(e.code === 'Escape')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    this._onPointer = () => { this._press(false); };
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('pointerdown', this._onPointer, true);
  }

  get playing() { return this._run !== null; }

  /* ---------------------------------------------------------------- *
   * Playing
   * ---------------------------------------------------------------- */

  /*
   * Resolves true if the sequence ran to its end and false if the player got
   * out of it, which is worth knowing: the line the caller wanted to show
   * afterwards is usually still worth showing, but the pause for effect is
   * not.
   */
  play(beats, opts = {}) {
    /* A second call while one is running is neither an error nor a queue. The
     * caller has moved on, so what is on screen moves on with it — and the new
     * run waits for the old one's teardown rather than racing it, which is the
     * whole reason play() is safe to call again immediately. */
    const previous = this._run;
    if (previous) this.skip();
    const token = ++this._token;
    const run = (async () => {
      /* Whatever happened to the run before this one, it has already put the
       * screen back; there is nothing to do here about it but start. */
      if (previous) {
        try { await previous; } catch { /* it cleaned up after itself */ }
      }
      /* Overtaken while we were waiting: a third caller owns the screen now
       * and must not have it torn down underneath it. */
      if (this._token !== token) return false;
      return this._sequence(beats, opts);
    })().finally(() => {
      if (this._token === token) this._run = null;
    });
    this._run = run;
    return run;
  }

  /* Ends the sequence where it stands. Safe at any time, including from inside
   * an onBeat callback and including when nothing is playing. */
  skip() {
    if (!this._run) return;
    this._skipped = true;
    if (this._advance) this._advance();
  }

  async _sequence(beats, opts) {
    /* A script that builds its list with a conditional leaves a `false` in it
     * on the nights the beat does not apply. */
    const list = (Array.isArray(beats) ? beats : []).filter(Boolean);
    const dark = !!opts.black;
    this._skippable = opts.skippable !== false;
    this._skipped = false;
    this._deafUntil = Date.now() + DEAF_MS;

    clearTimeout(this._blackT);
    clearTimeout(this._hideT);
    this.el.hidden = false;
    /* A sequence that starts black cuts to black rather than wiping the world
     * out over a quarter of a second, and it has to: the veil is what the
     * caller is handing the screen over to, and a twenty-second dream is not
     * the only length of sequence — a two-hundred-millisecond one would
     * otherwise resolve with the world still three-quarters visible through
     * it. Beats that turn the black on and off mid-sequence still crossfade. */
    if (dark) {
      this.el.classList.add('cut', 'black');
      void this.el.offsetWidth;
      this.el.classList.remove('cut');
    } else {
      this.el.classList.remove('black');
    }
    if (this._skippable && list.length) this._hint();

    try {
      for (let i = 0; i < list.length; i++) {
        if (this._skipped) break;
        const beat = list[i];
        /* A sequence declared black stays black unless a beat says otherwise,
         * so the dream does not have to write `black: true` four times. */
        this.el.classList.toggle('black',
          beat.black === undefined ? dark : !!beat.black);
        this._draw(beat);
        if (opts.onBeat) {
          /* The callback is where the laugh, the car horn and the door go. It
           * is somebody else's code and it is allowed to be broken; the scene
           * is not allowed to stop because of it. */
          try { opts.onBeat(beat, i); } catch { /* keep the scene running */ }
        }
        await this._beat(beat);
      }
    } catch (err) {
      /* A broken beat may not take the night with it. The caller is a script
       * that runs the evening in order — seven, half past ten, midnight,
       * 3:29 — and a rejected promise here would leave the player standing in
       * a house that never gets to half past three. So: the same answer
       * main.js gives a night that will not load. Say so on the console, and
       * hand back a screen that works and a promise that admits it did not
       * reach the end. */
      console.error(err);
      this._skipped = true;
    } finally {
      /* Whatever happened in there — a throw, a skip, a caller that passed
       * nonsense — the text comes down here and only here. A cutscene that
       * fails and leaves a black screen over the game is indistinguishable
       * from a crash. */
      this._end(dark);
    }
    return !this._skipped;
  }

  /* One beat, on screen, until its own `ms` runs out or the player presses
   * something. */
  _beat(beat) {
    const ms = Number.isFinite(beat.ms) ? beat.ms : DEFAULT_MS;
    return new Promise((resolve) => {
      let fired = false;
      const go = () => {
        if (fired) return;
        fired = true;
        clearTimeout(this._timer);
        this._timer = 0;
        if (this._advance === go) {
          this._advance = null;
          this._holding = false;
        }
        resolve();
      };
      this._advance = go;
      this._holding = !!beat.hold;
      if (!beat.hold) this._timer = setTimeout(go, Math.max(0, ms));
    });
  }

  /*
   * What a press means depends on what is on screen. A held beat is asking to
   * be advanced, so E and a tap advance it rather than throwing the rest of
   * the scene away; Escape on a held beat still skips, because a player who
   * wants out should not have to click through four more lines to get there.
   * In a sequence the caller marked unskippable, Escape falls back to
   * advancing — nothing in this game may leave the player with no way on.
   */
  _press(escape) {
    if (!this._run || !this._advance) return false;
    if (Date.now() < this._deafUntil) return false;
    if (this._holding && !(escape && this._skippable)) {
      this._advance();
      return true;
    }
    if (!this._skippable) return false;
    this.skip();
    return true;
  }

  /* ---------------------------------------------------------------- *
   * The screen
   * ---------------------------------------------------------------- */

  _draw(beat) {
    const line = document.createElement('div');
    /* Speaker or not is the whole typographic split: a named line is speech,
     * an unnamed one is Adam noticing something, and the second is set in the
     * journal's face because it is the same voice as the diary pages. */
    line.className = beat.speaker ? 'scene-line' : 'scene-line think';

    const name = SPEAKERS[beat.speaker];
    if (name) {
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = name;
      line.appendChild(who);
    }

    const say = document.createElement('p');
    say.className = 'say';
    /* textContent throughout. Half of these strings end up quoting what a
     * neighbour said, and none of them is ever parsed as markup. */
    say.textContent = beat.text || '';
    line.appendChild(say);

    if (beat.hold) {
      const more = document.createElement('span');
      more.className = 'scene-more';
      if (document.body.classList.contains('touch')) {
        more.textContent = 'נגיעה להמשך';
      } else {
        const key = document.createElement('b');
        key.textContent = 'E';
        more.appendChild(key);
        more.appendChild(document.createTextNode(' להמשך'));
      }
      line.appendChild(more);
    }

    /* A fresh node per beat, which is what restarts the entrance animation —
     * the alternative is retitling one element and forcing a reflow to make
     * the animation play again, and there is nothing to keep. */
    this.textEl.textContent = '';
    this.textEl.appendChild(line);
    if (beat.shake) this._shake();
  }

  /*
   * The shake is on the text and never on #scene itself: #scene carries the
   * black, and translating it by four pixels opens a strip of lit street down
   * one edge of a black screen, which is far worse than no shake at all.
   * prefers-reduced-motion turns it off in the stylesheet, which is why this
   * is a class and not an inline animation.
   */
  _shake() {
    this.textEl.classList.remove('shake');
    void this.textEl.offsetWidth;       /* restarts it; see UI.shake */
    this.textEl.classList.add('shake');
    clearTimeout(this._shakeT);
    this._shakeT = setTimeout(() => this.textEl.classList.remove('shake'), 500);
  }

  /* Once per session, on the first skippable sequence. Any more than that and
   * it is an instruction rather than a courtesy. */
  _hint() {
    if (this._hinted) return;
    this._hinted = true;
    this.hintEl.textContent = '';
    if (document.body.classList.contains('touch')) {
      /* Telling a phone player to press Escape tells them nothing. */
      this.hintEl.appendChild(document.createTextNode('נגיעה במסך מדלגת'));
    } else {
      this.hintEl.appendChild(document.createTextNode('לדילוג: '));
      for (const code of ['Esc', 'E']) {
        if (this.hintEl.childNodes.length > 1) {
          this.hintEl.appendChild(document.createTextNode(' '));
        }
        const b = document.createElement('b');
        b.textContent = code;
        this.hintEl.appendChild(b);
      }
    }
    this.hintEl.hidden = false;
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => { this.hintEl.hidden = true; }, HINT_MS);
  }

  _end(dark) {
    clearTimeout(this._timer);
    clearTimeout(this._hintT);
    this._timer = 0;
    this._advance = null;
    this._holding = false;
    this.textEl.textContent = '';
    this.textEl.classList.remove('shake');
    this.hintEl.hidden = true;
    /* A skipped black sequence still ends black: dropping to the bedroom for
     * one frame and then blacking out again is a flicker, not a skip. */
    if (dark) {
      clearTimeout(this._blackT);
      this._blackT = setTimeout(() => this._release(), BLACK_HOLD_MS);
      return;
    }
    this._release();
  }

  /* Black off, and the element out of the way once it has finished going. It
   * takes no pointer events either way, but an invisible layer left over the
   * game is the sort of thing the next person to read this has to prove is
   * harmless. */
  _release() {
    clearTimeout(this._blackT);
    clearTimeout(this._hideT);
    this._blackT = 0;
    this.el.classList.remove('black');
    this._hideT = setTimeout(() => {
      if (!this._run) this.el.hidden = true;
    }, 400);
  }

  dispose() {
    this.skip();
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('pointerdown', this._onPointer, true);
    for (const t of [this._timer, this._hintT, this._blackT, this._hideT,
      this._shakeT]) clearTimeout(t);
    this._run = null;
    this.el.remove();
  }
}
