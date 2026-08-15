/*
 * audio.js — every sound in the shop, synthesised.
 *
 * No files. A brush is filtered noise whose band moves with how fast the
 * pointer is going, the till is a two-tone beep, and the room is a low hum with
 * a little air in it. The brush is the one that matters: painting with no sound
 * feels like dragging a cursor, and painting with the right sound feels like
 * putting something on a face.
 *
 * Nothing is created until the first gesture, because every browser refuses to
 * start an AudioContext before one and a suspended context that nobody resumes
 * is a game with no sound and no error.
 */

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.started = true;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    /* A shared noise buffer. Generating two seconds once and looping it costs
     * one allocation instead of one per brush stroke. */
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      /* Slightly pink: white noise alone is hissy and sounds like a fault. */
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5 + white * 0.35;
    }

    this._room();
    this._brushChain();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.9 : 0;
  }

  /* Room tone: a mains hum, a wash of air conditioning, and nothing else. */
  _room() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 380;
    const g = this.ctx.createGain();
    g.gain.value = 0.035;
    src.connect(filt).connect(g).connect(this.master);
    src.start();

    const hum = this.ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 100;
    const hg = this.ctx.createGain();
    hg.gain.value = 0.012;
    hum.connect(hg).connect(this.master);
    hum.start();
  }

  /*
   * The brush is a single always-running noise source behind a bandpass, with
   * its gain driven by the game. Starting and stopping a source per pointer
   * event clicks; riding one gain does not.
   */
  _brushChain() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.brushFilter = this.ctx.createBiquadFilter();
    this.brushFilter.type = 'bandpass';
    this.brushFilter.frequency.value = 1800;
    this.brushFilter.Q.value = 0.8;
    this.brushGain = this.ctx.createGain();
    this.brushGain.gain.value = 0;
    src.connect(this.brushFilter).connect(this.brushGain).connect(this.master);
    src.start();
  }

  /* `speed` is roughly texels per second; `grit` is how coarse the product is
   * (a powder brush against skin, a wet gloss wand). */
  brush(speed, grit = 0.5) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const level = Math.min(0.16, 0.02 + speed * 0.35);
    this.brushGain.gain.setTargetAtTime(level, t, 0.03);
    this.brushFilter.frequency.setTargetAtTime(900 + grit * 2600 + speed * 1400, t, 0.05);
  }

  brushOff() {
    if (!this.ctx) return;
    this.brushGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
  }

  _blip(freq, dur, type = 'sine', gain = 0.12, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  pick() { this._blip(880, 0.06, 'triangle', 0.07); }
  select() { this._blip(1320, 0.05, 'triangle', 0.05); }
  scan() { this._blip(2100, 0.09, 'square', 0.05); }

  /* The drawer. Two bells and a thump — anything less does not read as money. */
  cash() {
    this._blip(1560, 0.35, 'triangle', 0.10);
    this._blip(2080, 0.42, 'triangle', 0.08, 0.05);
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.16;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 240;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.3);
  }

  /* The door, when the next customer walks in. */
  chime() {
    this._blip(1174, 0.5, 'sine', 0.09);
    this._blip(1568, 0.6, 'sine', 0.07, 0.09);
  }

  /* A customer saying something. Not speech — three short tones in a shape that
   * matches the mood, which is enough for the ear to attach them to the line of
   * text that appeared at the same moment. */
  speak(mood = 'neutral', gender = 'f') {
    const base = gender === 'm' ? 190 : 300;
    const shape = mood === 'love' ? [1, 1.2, 1.5]
      : mood === 'hate' ? [1.2, 1, 0.78]
        : [1, 1.08, 1];
    for (let i = 0; i < shape.length; i++) {
      this._blip(base * shape[i], 0.09, 'sine', 0.045, i * 0.075);
    }
  }

  wipe() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.10, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.5);
  }
}
