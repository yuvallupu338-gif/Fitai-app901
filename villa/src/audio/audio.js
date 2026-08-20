/*
 * audio.js — every sound in the game, synthesised at runtime.
 *
 * No audio files, for the same reason there are no images: this is a horror
 * game about listening, so the sound has to be continuous, layered and
 * reactive, and a set of loops that could do that is a download nobody waits
 * for. What the game actually needs is filtered noise, a few oscillators and
 * an envelope each, and those are a handful of lines apiece.
 *
 * The bed is three layers that never stop: wind outside, a low room tone, and
 * a heartbeat whose rate and volume follow the danger meter. That last one is
 * the whole design — the player should know the house is in trouble before
 * they have looked at a single meter, and should notice it settling again
 * without being told. Everything else is a one-shot over the top.
 *
 * The context is created inside a user gesture because every browser refuses
 * otherwise, and the whole module degrades to silent no-ops if it is refused
 * anyway — a game that cannot make a sound is still a game.
 */

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.nodes = {};
    this.heart = { at: 0, rate: 1.4 };
  }

  /* Must be called from inside a click or a keypress. */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      return;
    }
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    /* A short generated impulse response, so the villa sounds like rooms
     * rather than like headphones. */
    this.verb = ctx.createConvolver();
    this.verb.buffer = impulse(ctx, 1.6, 2.4);
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.34;
    this.verb.connect(verbGain).connect(this.master);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);

    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.0001;
    this.bedGain.connect(this.dry);
    this.bedGain.connect(this.verb);

    /* Wind: pink-ish noise through a slow, wandering band-pass. */
    const wind = noiseSource(ctx);
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 380;
    windFilter.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.16;
    wind.connect(windFilter).connect(windGain).connect(this.bedGain);
    this.nodes.windFilter = windFilter;
    this.nodes.windGain = windGain;

    /* An LFO on the wind's centre frequency is the difference between weather
     * and a hiss. */
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmount = ctx.createGain();
    lfoAmount.gain.value = 210;
    lfo.connect(lfoAmount).connect(windFilter.frequency);
    lfo.start();

    /* Room tone: a very low pair, slightly detuned, barely audible and doing
     * most of the work of making a quiet house feel occupied. */
    for (const f of [46, 69]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      o.connect(g).connect(this.bedGain);
      o.start();
    }

    this.ready = true;
    this.bedGain.gain.setTargetAtTime(0.55, ctx.currentTime, 1.5);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.08);
  }

  /* Called every frame. `danger` is 0..1. The wind opens up and the heart
   * quickens together, so the room gets louder as it gets worse. */
  update(danger, dt) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.nodes.windGain.gain.setTargetAtTime(0.16 + danger * 0.34, t, 0.6);
    this.nodes.windFilter.Q.setTargetAtTime(0.7 + danger * 2.4, t, 0.6);

    if (danger < 0.28) { this.heart.at = 0; return; }
    /* From a resting sixty to something over a hundred at the top. */
    this.heart.rate = 1.05 - (danger - 0.28) * 0.62;
    this.heart.at -= dt;
    if (this.heart.at <= 0) {
      this.heart.at = this.heart.rate;
      const vol = 0.10 + (danger - 0.28) * 0.5;
      this.beat(0, vol);
      this.beat(0.17, vol * 0.66);
    }
  }

  beat(delay, vol) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(64, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    o.connect(g).connect(this.dry);
    o.start(t);
    o.stop(t + 0.22);
  }

  /* ---------------------------------------------------------- one-shots */

  /*
   * `play` is a small vocabulary rather than one function per sound, because
   * the sounds this game needs are mostly the same two shapes: a filtered
   * noise burst with an envelope (a knock, a hammer, tape, a gunshot) or a
   * short tone (the phone, the interface). The recipe table below is the
   * actual sound design; everything under it is plumbing.
   */
  play(name) {
    if (!this.ready || this.muted) return;
    const r = RECIPES[name];
    if (!r) return;
    if (r.repeat) {
      for (let i = 0; i < r.repeat; i++) this.oneShot(r, i * (r.gap || 0.1));
    } else {
      this.oneShot(r, 0);
    }
  }

  oneShot(r, delay) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const send = ctx.createGain();
    send.gain.value = r.verb === undefined ? 0.3 : r.verb;
    send.connect(this.verb);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(r.gain, t + (r.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + r.dur);
    g.connect(this.dry);
    g.connect(send);

    if (r.noise) {
      const src = noiseSource(ctx, r.dur + 0.1);
      const f = ctx.createBiquadFilter();
      f.type = r.type || 'bandpass';
      f.frequency.setValueAtTime(r.freq, t);
      if (r.sweep) f.frequency.exponentialRampToValueAtTime(r.sweep, t + r.dur);
      f.Q.value = r.q || 1;
      src.connect(f).connect(g);
      src.start(t);
      src.stop(t + r.dur + 0.1);
    } else {
      const o = ctx.createOscillator();
      o.type = r.osc || 'sine';
      o.frequency.setValueAtTime(r.freq, t);
      if (r.sweep) o.frequency.exponentialRampToValueAtTime(r.sweep, t + r.dur);
      o.connect(g);
      o.start(t);
      o.stop(t + r.dur + 0.02);
    }
  }
}

/*
 * The sound design, as a table. Read it as: what is it made of (noise or a
 * tone), where it sits, where it goes, how long it lasts, and how wet it is.
 */
const RECIPES = {
  /* The house being worked on from outside. */
  knock:     { noise: true, freq: 160, sweep: 70, q: 1.6, gain: 0.34, dur: 0.20, verb: 0.5, repeat: 3, gap: 0.19 },
  scratch:   { noise: true, freq: 2600, sweep: 1500, q: 0.8, type: 'highpass', gain: 0.14, dur: 0.46, verb: 0.35 },
  strain:    { noise: true, freq: 240, sweep: 150, q: 3.0, gain: 0.20, dur: 0.7, verb: 0.5 },
  breach:    { noise: true, freq: 900, sweep: 90, q: 0.6, gain: 0.75, dur: 0.9, verb: 0.7 },

  /* The player's hands. */
  gunshot:   { noise: true, freq: 1800, sweep: 120, q: 0.5, gain: 0.85, dur: 0.34, verb: 0.65 },
  reload:    { noise: true, freq: 3200, sweep: 1400, q: 2.2, type: 'bandpass', gain: 0.20, dur: 0.09, verb: 0.2, repeat: 3, gap: 0.13 },
  hammer:    { noise: true, freq: 900, sweep: 260, q: 1.2, gain: 0.42, dur: 0.13, verb: 0.45, repeat: 4, gap: 0.17 },
  tape:      { noise: true, freq: 3400, sweep: 2100, q: 0.7, type: 'highpass', gain: 0.20, dur: 0.55, verb: 0.2 },
  plankDown: { noise: true, freq: 420, sweep: 150, q: 1.4, gain: 0.34, dur: 0.22, verb: 0.4 },
  step:      { noise: true, freq: 320, sweep: 140, q: 1.1, gain: 0.13, dur: 0.11, verb: 0.3 },
  snap:      { noise: true, freq: 2400, sweep: 700, q: 1.0, type: 'highpass', gain: 0.26, dur: 0.16, verb: 0.3 },

  /* The telephone, and the interface. */
  phone:     { freq: 420, osc: 'square', gain: 0.10, dur: 0.42, verb: 0.35, repeat: 2, gap: 0.55 },
  dial:      { freq: 700, osc: 'sine', gain: 0.09, dur: 0.10, verb: 0.15, repeat: 5, gap: 0.13 },
  click:     { freq: 620, osc: 'triangle', gain: 0.07, dur: 0.05, verb: 0.05 },
  alert:     { freq: 300, sweep: 190, osc: 'sawtooth', gain: 0.13, dur: 0.5, verb: 0.4 },
  good:      { freq: 420, sweep: 640, osc: 'sine', gain: 0.10, dur: 0.24, verb: 0.25 },
  dawn:      { freq: 300, sweep: 600, osc: 'sine', gain: 0.16, dur: 1.5, verb: 0.6 },
  dead:      { freq: 190, sweep: 44, osc: 'sawtooth', gain: 0.32, dur: 2.2, verb: 0.7 },
};

/* Which sound an event from the simulation makes. The view does not decide
 * this; it hands the event kind straight over. */
export const EVENT_SOUND = {
  breached: 'breach',
  critical: 'alert',
  under_pressure: 'strain',
  noise: 'scratch',
  hidden_appeared: 'scratch',
  hidden_revealed: 'good',
  tape_applied: 'tape',
  tape_snapped: 'snap',
  plank_applied: 'hammer',
  plank_broke: 'snap',
  repaired: 'plankDown',
  resecured: 'good',
  shot: 'gunshot',
  shot_intruder: 'gunshot',
  dawn_reload: 'reload',
  phone_dialing: 'dial',
  neighbor_arrived: 'phone',
  neighbor_left: 'click',
  intruder_in: 'knock',
  intruder_near: 'alert',
  drawer_found: 'good',
  night_survived: 'dawn',
  moved: 'step',
};

/* ------------------------------------------------------------------ *
 * Sources
 * ------------------------------------------------------------------ */

function noiseSource(ctx, seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * (seconds || 2)));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  /* Two poles of smoothing turns white into something closer to pink, which
   * is what wind and cloth and distance all actually sound like. */
  let a = 0, b = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    a = 0.99 * a + 0.01 * w;
    b = 0.86 * b + 0.14 * w;
    d[i] = (a * 2.2 + b * 0.8) * 0.6;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = !seconds;
  if (!seconds) src.start();
  return src;
}

/* Exponentially decaying noise. A room is mostly its tail. */
function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}
