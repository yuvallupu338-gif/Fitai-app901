/*
 * audio.js — every sound in the game, synthesised at runtime.
 *
 * No audio files, for the same reason there are no texture files: a hundred
 * levels each want their own room tone, and a hundred loops is a download
 * nobody will wait for. What they actually want is a filter, a noise source
 * and a reverb tail, and those are three lines of WebAudio each.
 *
 * The one thing worth spending on is the reverb. A footstep in a carpeted
 * office and the same footstep in a tiled pool hall differ almost entirely in
 * their tail, and the impulse response here is generated per level from its
 * declared reverb amount. Get that right and a room sounds like its own size
 * before you have seen any of it.
 */

const TONES = {
  hum:      { noise: [220, 0.9, 0.028], osc: [100, 0.030], harm: [200, 0.012] },
  electric: { noise: [900, 1.6, 0.020], osc: [120, 0.038], harm: [360, 0.020] },
  drone:    { noise: [140, 0.7, 0.034], osc: [48, 0.055], harm: [72, 0.020] },
  machine:  { noise: [420, 1.2, 0.036], osc: [58, 0.040], harm: [174, 0.014] },
  steam:    { noise: [1500, 2.4, 0.048], osc: null, harm: null },
  water:    { noise: [520, 1.4, 0.030], osc: null, harm: null },
  wind:     { noise: [340, 1.1, 0.042], osc: null, harm: null },
  rain:     { noise: [2200, 2.6, 0.052], osc: null, harm: null },
  static:   { noise: [3400, 3.0, 0.045], osc: null, harm: null },
  silence:  { noise: [90, 0.6, 0.010], osc: null, harm: null },
  none:     { noise: [60, 0.5, 0.000], osc: null, harm: null },
  monitor:  { noise: [200, 0.8, 0.016], osc: null, harm: null },
  alarm:    { noise: [300, 1.0, 0.020], osc: null, harm: null },
  announce: { noise: [260, 0.9, 0.022], osc: null, harm: null },
  muzak:    { noise: [180, 0.8, 0.018], osc: null, harm: null },
  choir:    { noise: [150, 0.7, 0.020], osc: [66, 0.026], harm: [99, 0.014] },
  crowd:    { noise: [420, 1.3, 0.030], osc: null, harm: null },
};

/* Which footstep to play, worked out from what the floor is made of rather
 * than from a field every level would have to remember to set. */
function surfaceOf(level) {
  const kind = (level.mats && level.mats[0] && level.mats[0].kind) || 'concrete';
  if (kind === 'carpet' || kind === 'carpetPattern' || kind === 'fabric') return 'soft';
  if (kind === 'tile' || kind === 'marble' || kind === 'linoleum') return 'hard';
  if (kind === 'metal') return 'metal';
  if (kind === 'grass' || kind === 'ground') return 'grit';
  if (kind === 'wood') return 'wood';
  return 'stone';
}

const STEPS = {
  soft:  { hp: 90,  lp: 620,  dur: 0.10, gain: 0.16, send: 0.15 },
  hard:  { hp: 300, lp: 5200, dur: 0.07, gain: 0.22, send: 0.55 },
  stone: { hp: 180, lp: 2600, dur: 0.09, gain: 0.20, send: 0.40 },
  grit:  { hp: 260, lp: 3800, dur: 0.11, gain: 0.17, send: 0.20 },
  metal: { hp: 400, lp: 6000, dur: 0.13, gain: 0.20, send: 0.50 },
  wood:  { hp: 160, lp: 1800, dur: 0.09, gain: 0.19, send: 0.30 },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.level = null;
    this.nodes = {};
    this.dripAt = 0;
    this.beatAt = 0;
    this.danger = 0;
  }

  /* Must be called from a user gesture; browsers will not start an
   * AudioContext otherwise, and failing silently here is fine — the game is
   * perfectly playable mute. */
  async start() {
    if (this.ready) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch { return false; }

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.5;
    this.reverb.connect(this.reverbGain).connect(this.master);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);

    /* A four second white-noise buffer, reused by everything that needs
     * noise — ambience, footsteps, splashes. */
    const len = ctx.sampleRate * 4;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      /* Brown-ish: white noise integrated a little. Reads as "room" where
       * white noise reads as "broken speaker". */
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2 + w * 0.25;
    }
    this.ready = true;
    return true;
  }

  makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        /* Early reflections then an exponential tail; the little burst at the
         * start is what makes a space sound like it has walls. */
        const early = i < rate * 0.03 ? (Math.random() * 2 - 1) * 0.7 : 0;
        ch[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early)
              * (1 - t * 0.15);
      }
    }
    return buf;
  }

  setLevel(level) {
    this.level = level;
    if (!this.ready) return;
    const ctx = this.ctx;
    this.stopAmbience();

    const a = level.audio || {};
    const rv = a.reverb ?? 0.4;
    this.reverb.buffer = this.makeImpulse(0.35 + rv * 3.4, 2.2 + rv * 3);
    this.reverbGain.gain.value = 0.18 + rv * 0.62;
    this.surface = surfaceOf(level);

    const tone = TONES[a.tone] || TONES.hum;
    const nodes = this.nodes = {};

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = tone.noise[0];
    filt.Q.value = tone.noise[1];
    const g = ctx.createGain();
    g.gain.value = tone.noise[2];
    src.connect(filt).connect(g);
    g.connect(this.dry);
    g.connect(this.reverb);
    src.start();
    nodes.noise = src;
    nodes.noiseGain = g;
    nodes.noiseFilter = filt;

    /* A slow wander on the filter so the room tone never sits still — three
     * seconds of a perfectly constant loop and the ear stops hearing it. */
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + Math.random() * 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = tone.noise[0] * 0.25;
    lfo.connect(lfoGain).connect(filt.frequency);
    lfo.start();
    nodes.lfo = lfo;

    if (tone.osc) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = tone.osc[0] || 55;
      const og = ctx.createGain();
      og.gain.value = tone.osc[1];
      o.connect(og).connect(this.dry);
      o.start();
      nodes.osc = o;
      nodes.oscGain = og;
    }
    if (tone.harm) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = tone.harm[0];
      const og = ctx.createGain();
      og.gain.value = tone.harm[1];
      o.connect(og).connect(this.dry);
      o.start();
      nodes.harm = o;
      nodes.harmGain = og;
    }
  }

  stopAmbience() {
    for (const k of ['noise', 'osc', 'harm', 'lfo']) {
      const n = this.nodes[k];
      if (n) { try { n.stop(); } catch { /* already stopped */ } }
    }
    this.nodes = {};
  }

  /* ---------------------------------------------------------------- *
   * One-shots
   * ---------------------------------------------------------------- */

  burst({ hp, lp, dur, gain, send, rate = 1, q = 1 }) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rate;
    const offset = Math.random() * 3;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = hp;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = lp;
    lpf.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hpf).connect(lpf).connect(g);
    g.connect(this.dry);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverb);
    }
    src.start(t, offset, dur + 0.05);
    src.stop(t + dur + 0.06);
  }

  tone(freq, dur, gain, type = 'sine', send = 0.3) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.dry);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverb);
    }
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  step(wet, fast) {
    const s = STEPS[this.surface] || STEPS.stone;
    if (wet) {
      this.burst({ hp: 500, lp: 7000, dur: 0.14, gain: 0.18, send: 0.5, rate: 1.2 });
      this.burst({ hp: 200, lp: 1400, dur: 0.09, gain: 0.10, send: 0.4 });
      return;
    }
    this.burst({
      hp: s.hp, lp: s.lp, dur: s.dur, send: s.send,
      gain: s.gain * (fast ? 1.25 : 1) * (0.85 + Math.random() * 0.3),
      rate: 0.9 + Math.random() * 0.25,
    });
  }

  land(hard) {
    this.burst({ hp: 60, lp: hard ? 900 : 500, dur: hard ? 0.22 : 0.12,
      gain: hard ? 0.30 : 0.16, send: 0.4 });
  }

  splash() {
    this.burst({ hp: 400, lp: 9000, dur: 0.3, gain: 0.22, send: 0.7, rate: 1.4 });
  }

  drip() {
    this.tone(900 + Math.random() * 1400, 0.09, 0.055, 'sine', 0.85);
  }

  pickup() {
    this.tone(660, 0.09, 0.10, 'triangle', 0.2);
    setTimeout(() => this.tone(990, 0.12, 0.08, 'triangle', 0.3), 70);
  }

  hurt() {
    this.burst({ hp: 60, lp: 700, dur: 0.35, gain: 0.34, send: 0.5 });
    this.tone(84, 0.5, 0.10, 'sawtooth', 0.2);
  }

  /*
   * A lurker giving up the disguise: a hard, wide-band crack with a rising
   * tail under it. Loud on purpose and only ever heard once per encounter —
   * the whole behaviour is silence and then this.
   */
  lunge() {
    this.burst({ hp: 200, lp: 7000, dur: 0.18, gain: 0.40, send: 0.4, rate: 1.4 });
    this.tone(150, 0.45, 0.16, 'sawtooth', 0.35);
    this.tone(300, 0.30, 0.10, 'square', 0.3);
  }

  descend() {
    this.tone(180, 1.6, 0.10, 'sine', 0.9);
    this.tone(90, 2.2, 0.09, 'sine', 0.9);
    this.burst({ hp: 40, lp: 400, dur: 1.4, gain: 0.16, send: 0.9 });
  }

  /* The noise a thing makes when it is moving towards you. Pitched by how
   * close it is, because a distant growl and a near one should not be the
   * same sample at different volumes. */
  cue(kind, dist) {
    const near = Math.max(0, 1 - dist / 26);
    if (kind === 'crawler') {
      this.burst({ hp: 700, lp: 4200, dur: 0.22, gain: 0.05 + near * 0.15, send: 0.6,
        rate: 1.6 });
    } else if (kind === 'watcher') {
      this.tone(58 + near * 30, 0.9, 0.03 + near * 0.07, 'sine', 0.7);
    } else if (kind === 'shade') {
      /*
       * A breath and a sub-bass under it, no growl. The shade is the one you
       * are not supposed to hear coming: the low tone sits under the room
       * tone until it is close, and the filtered air is the only part with
       * any attack. A snarl would tell you exactly where it is, which is the
       * opposite of what this thing is for.
       */
      this.tone(34 + near * 14, 1.8, 0.02 + near * 0.10, 'sine', 0.85);
      this.burst({ hp: 1400, lp: 3000, dur: 0.9, gain: 0.02 + near * 0.06,
        send: 0.9, rate: 0.5 });
    } else if (kind === 'smiler') {
      /* Two notes a minor second apart. It is the least musical interval
       * there is and the ear reads it as wrong rather than as a sound. */
      this.tone(494, 0.5, 0.02 + near * 0.05, 'triangle', 0.5);
      this.tone(466, 0.6, 0.02 + near * 0.05, 'triangle', 0.5);
    } else if (kind === 'swarm') {
      /* Short, dry and high — many small feet, not one big thing. Rate is
       * jittered so a group does not tick in unison like a metronome. */
      this.burst({ hp: 1800, lp: 6500, dur: 0.10, gain: 0.03 + near * 0.10,
        send: 0.35, rate: 2.0 + Math.random() * 0.9 });
    } else if (kind === 'titan') {
      /* A footfall you feel rather than hear, and the room answering it. */
      this.tone(41, 0.5, 0.05 + near * 0.22, 'sine', 0.6);
      this.burst({ hp: 60, lp: 260, dur: 0.7, gain: 0.05 + near * 0.20,
        send: 1.0, rate: 0.35 });
    } else if (kind === 'lurker') {
      /* Nothing while it waits; the lunge below is the only sound it makes,
       * and a cue here would be a warning it is not supposed to give. */
    } else if (kind === 'stalker') {
      /* Kept quiet and close-miked: it is always about the same distance
       * away, so a cue that scaled with range would never change. */
      this.burst({ hp: 300, lp: 1500, dur: 0.35, gain: 0.035, send: 0.5, rate: 0.9 });
    } else {
      this.burst({ hp: 90, lp: 800 + near * 1200, dur: 0.4, gain: 0.06 + near * 0.2,
        send: 0.55, rate: 0.7 });
    }
  }

  /* Per-frame housekeeping: drips, the heartbeat, and pulling the room tone
   * down as sanity goes, which does more for dread than any sting. */
  tick(dt, state) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const a = this.level && this.level.audio ? this.level.audio : {};

    if (a.drips && now > this.dripAt) {
      this.dripAt = now + 1.5 + Math.random() * 6;
      this.drip();
    }
    if (a.crickets && now > (this.cricketAt || 0)) {
      this.cricketAt = now + 0.7 + Math.random() * 1.4;
      this.tone(3800 + Math.random() * 900, 0.05, 0.012, 'triangle', 0.2);
    }

    this.danger = state.danger;
    if (state.danger > 0.35 && now > this.beatAt) {
      this.beatAt = now + Math.max(0.42, 1.1 - state.danger * 0.7);
      this.tone(52, 0.16, 0.05 + state.danger * 0.12, 'sine', 0.1);
    }

    if (this.nodes.noiseGain) {
      const base = (TONES[a.tone] || TONES.hum).noise[2];
      const target = base * (1 + (1 - state.sanity) * 1.6);
      this.nodes.noiseGain.gain.value += (target - this.nodes.noiseGain.gain.value)
        * Math.min(1, dt * 2);
    }
    if (this.nodes.oscGain) {
      const base = ((TONES[a.tone] || TONES.hum).osc || [0, 0])[1];
      this.nodes.oscGain.gain.value = base * (1 + state.danger * 1.5);
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  dispose() {
    this.stopAmbience();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ready = false;
  }
}
