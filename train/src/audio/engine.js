/*
 * engine.js — the audio graph.
 *
 * The whole soundtrack is synthesised. Nothing is loaded, which is partly the
 * no-assets habit of this repository and partly because the game needs to do
 * things to the sound that a set of samples cannot: slow the wheel rhythm
 * continuously as the train brakes, take the reverb tail out from under a
 * carriage the instant it stops being real, and — the important one — cut
 * *everything* to silence in 200ms and hold it there.
 *
 * Buses:
 *
 *   master ─ compressor ─ destination
 *      ├ ambient   the train itself: rumble, wheels, hum, air
 *      ├ sfx       doors, footsteps, objects, the things you are not sure of
 *      └ voice     announcements and whispers
 *
 * `duck()` pulls all three down together. Silence is a cue in this game, not
 * an absence of one.
 */

import { clamp } from '../core/math.js';

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.failed = false;
    this.buses = {};
    this.noise = {};
    this.duckAmount = 1;
    this._duckTarget = 1;
    this._ambient = null;
    this._clackNext = 0;
    this._clackToggle = 0;
    this.speed = 0;
  }

  /* Must be called from a user gesture. Everything else in the game tolerates
     `ready === false` and simply makes no sound. */
  init() {
    if (this.ready || this.failed) return this.ready;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) { this.failed = true; return false; }
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 26;
      comp.ratio.value = 5;
      comp.attack.value = 0.006;
      comp.release.value = 0.22;
      comp.connect(ctx.destination);

      const master = ctx.createGain();
      master.gain.value = this.settings.volumeMaster ?? 0.85;
      master.connect(comp);

      const duck = ctx.createGain();
      duck.gain.value = 1;
      duck.connect(master);

      const mk = (vol) => {
        const g = ctx.createGain();
        g.gain.value = vol;
        g.connect(duck);
        return g;
      };
      this.buses = {
        master,
        duck,
        ambient: mk(this.settings.volumeAmbient ?? 0.9),
        sfx: mk(this.settings.volumeSfx ?? 0.9),
        voice: mk(this.settings.volumeVoice ?? 1),
      };

      /* Carriage reverb: short, boxy, metallic. Long enough that a footstep at
         the far end of the car reads as far away, short enough that it never
         sounds like a cathedral. */
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = impulseResponse(ctx, 1.35, 3.2, 0.55);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.32;
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.buses.sfx);

      /* A second, far bigger space for anything that is supposed to be coming
         from somewhere that is not this carriage. */
      this.farReverb = ctx.createConvolver();
      this.farReverb.buffer = impulseResponse(ctx, 3.6, 1.4, 0.8);
      this.farSend = ctx.createGain();
      this.farSend.gain.value = 0.6;
      this.farSend.connect(this.farReverb);
      this.farReverb.connect(this.buses.sfx);

      this.noise.white = noiseBuffer(ctx, 2, 'white');
      this.noise.pink = noiseBuffer(ctx, 3, 'pink');
      this.noise.brown = noiseBuffer(ctx, 4, 'brown');

      this.ready = true;
      this._buildAmbient();
      return true;
    } catch (err) {
      console.warn('[audio] unavailable', err);
      this.failed = true;
      return false;
    }
  }

  resume() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  suspend() {
    if (!this.ctx) return;
    if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  applySettings(settings) {
    this.settings = settings;
    if (!this.ready) return;
    const t = this.now;
    this.buses.master.gain.setTargetAtTime(settings.volumeMaster ?? 0.85, t, 0.02);
    this.buses.ambient.gain.setTargetAtTime(settings.volumeAmbient ?? 0.9, t, 0.02);
    this.buses.sfx.gain.setTargetAtTime(settings.volumeSfx ?? 0.9, t, 0.02);
    this.buses.voice.gain.setTargetAtTime(settings.volumeVoice ?? 1, t, 0.02);
  }

  /* 1 = normal, 0 = the bottom drops out. `duckAmount` is what callers read
     to decide whether they still owe the mix a restore, so it has to move
     with the target and not stay at its constructed value. */
  duck(amount, seconds = 0.25) {
    this._duckTarget = clamp(amount, 0, 1);
    this.duckAmount = this._duckTarget;
    if (!this.ready) return;
    const g = this.buses.duck.gain;
    g.cancelScheduledValues(this.now);
    g.setTargetAtTime(this._duckTarget, this.now, Math.max(0.01, seconds / 3));
  }

  /* ---- ambient bed ------------------------------------------------- */

  _buildAmbient() {
    const ctx = this.ctx;
    const out = this.buses.ambient;

    const rumbleSrc = loopSource(ctx, this.noise.brown);
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 150;
    rumbleFilter.Q.value = 0.7;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleSrc.connect(rumbleFilter).connect(rumbleGain).connect(out);
    rumbleSrc.start();

    const hissSrc = loopSource(ctx, this.noise.white);
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 1500;
    hissFilter.Q.value = 0.6;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0;
    hissSrc.connect(hissFilter).connect(hissGain).connect(out);
    hissSrc.start();

    /* Mains hum. 50Hz and its odd harmonics — the sound of a fluorescent
       fitting, and the first thing the player notices when it stops. */
    const humGain = ctx.createGain();
    humGain.gain.value = 0.05;
    humGain.connect(out);
    const humOscs = [];
    for (const [freq, level] of [[50, 0.5], [100, 0.28], [150, 0.12], [300, 0.05]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(humGain);
      osc.start();
      humOscs.push(osc);
    }

    const airSrc = loopSource(ctx, this.noise.pink);
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 420;
    airFilter.Q.value = 0.5;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.035;
    airSrc.connect(airFilter).connect(airGain).connect(out);
    airSrc.start();

    /* Wind past the body of the train — only audible at speed. */
    const windSrc = loopSource(ctx, this.noise.pink);
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'highpass';
    windFilter.frequency.value = 700;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter).connect(windGain).connect(out);
    windSrc.start();

    this._ambient = {
      rumbleGain, rumbleFilter, hissGain, hissFilter,
      humGain, humOscs, airGain, windGain, windFilter,
      clackGain: (() => { const g = ctx.createGain(); g.gain.value = 1; g.connect(out); return g; })(),
    };
  }

  /*
   * Drives the bed from the train's speed and schedules wheel joints a little
   * way ahead of the clock. Called once per frame; `speed` is 0..1.
   */
  updateAmbient(dt, speed, opts = {}) {
    this.speed = speed;
    if (!this.ready || !this._ambient) return;
    const a = this._ambient;
    const t = this.now;
    const tc = 0.25;
    const s = clamp(speed, 0, 1);
    const inside = opts.doorsOpen ? 0.55 : 1;

    a.rumbleGain.gain.setTargetAtTime(0.02 + s * 0.30 * inside, t, tc);
    a.rumbleFilter.frequency.setTargetAtTime(90 + s * 190, t, tc);
    a.hissGain.gain.setTargetAtTime(s * s * 0.035 * inside, t, tc);
    a.hissFilter.frequency.setTargetAtTime(900 + s * 1800, t, tc);
    a.windGain.gain.setTargetAtTime(s * s * 0.022, t, tc);
    a.humGain.gain.setTargetAtTime((opts.lightsOn === false ? 0.004 : 0.05) * (opts.humScale ?? 1), t, 0.12);
    a.airGain.gain.setTargetAtTime(opts.hvac === false ? 0.004 : 0.035, t, 0.4);

    if (opts.doorsOpen) {
      /* Station air: the platform is a bigger, colder room and it leaks in. */
      a.airGain.gain.setTargetAtTime(0.055, t, 0.3);
    }

    if (s > 0.04) {
      /* Rail joints. Real bogies give you a pair of beats per joint, and the
         gap between pairs is what your ear reads as speed. */
      const interval = clamp(0.92 / (0.15 + s * 1.85), 0.13, 3.2);
      if (this._clackNext < t) this._clackNext = t + 0.05;
      while (this._clackNext < t + 0.35) {
        this._clackToggle = (this._clackToggle + 1) % 2;
        const when = this._clackNext;
        this.clack(when, s, this._clackToggle === 0 ? 1 : 0.82);
        this._clackNext += this._clackToggle === 0 ? interval * 0.26 : interval * 0.74;
      }
    } else {
      this._clackNext = t;
    }
  }

  clack(when, speed, level) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise.white;
    src.playbackRate.value = 0.7 + speed * 0.6;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 130 + speed * 120;
    bp.Q.value = 2.4;

    const g = ctx.createGain();
    const amp = (0.05 + speed * 0.16) * level;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.10 + speed * 0.05);

    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = level > 0.9 ? -0.35 : 0.35;

    src.connect(bp).connect(g);
    if (pan) { g.connect(pan); pan.connect(this._ambient.clackGain); }
    else g.connect(this._ambient.clackGain);
    g.connect(this.reverbSend);

    src.start(when, Math.random() * 1.5, 0.25);
    src.stop(when + 0.3);

    /* The low body of the impact, under the click. */
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(74 + speed * 26, when);
    osc.frequency.exponentialRampToValueAtTime(38, when + 0.09);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, when);
    og.gain.linearRampToValueAtTime(amp * 0.75, when + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    osc.connect(og).connect(this._ambient.clackGain);
    osc.start(when);
    osc.stop(when + 0.2);
  }

  /* ---- primitives the sfx layer builds on --------------------------- */

  noiseBurst({
    when = 0, duration = 0.2, type = 'white', filter = 'bandpass', frequency = 800,
    Q = 1, gain = 0.2, attack = 0.005, bus = 'sfx', pan = 0, reverb = 0, far = 0,
    playbackRate = 1, sweepTo = 0, curve = 'exp',
  } = {}) {
    if (!this.ready) return null;
    const ctx = this.ctx;
    const t = when || this.now;
    const src = ctx.createBufferSource();
    const buffer = this.noise[type] || this.noise.white;
    src.buffer = buffer;
    src.playbackRate.value = playbackRate;
    /* The noise buffers are two to four seconds long and some of these sounds
       — the brake, which runs for ten — are longer than that. A one-shot
       source simply stops at the end of its buffer, so without looping the
       envelope goes on describing a sound that finished seconds ago. */
    const startOffset = Math.random() * Math.max(0, Math.min(1.2, buffer.duration - 0.3));
    if (duration + 0.1 > buffer.duration - startOffset) src.loop = true;

    let node = src;
    let filterNode = null;
    if (filter !== 'none') {
      filterNode = ctx.createBiquadFilter();
      filterNode.type = filter;
      filterNode.frequency.setValueAtTime(frequency, t);
      if (sweepTo) filterNode.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + duration);
      filterNode.Q.value = Q;
      node = node.connect(filterNode);
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    else g.gain.linearRampToValueAtTime(0.0001, t + duration);
    node.connect(g);

    this._route(g, bus, pan, reverb, far);
    src.start(t, startOffset);
    src.stop(t + duration + 0.1);
    return { source: src, gain: g, filter: filterNode };
  }

  tone({
    when = 0, frequency = 440, endFrequency = 0, duration = 0.3, type = 'sine',
    gain = 0.2, attack = 0.008, bus = 'sfx', pan = 0, reverb = 0, far = 0, detune = 0,
  } = {}) {
    if (!this.ready) return null;
    const ctx = this.ctx;
    const t = when || this.now;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFrequency), t + duration);
    osc.detune.value = detune;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    this._route(g, bus, pan, reverb, far);
    osc.start(t);
    osc.stop(t + duration + 0.05);
    return { osc, gain: g };
  }

  _route(node, bus, pan, reverb, far) {
    const ctx = this.ctx;
    let tail = node;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      tail = tail.connect(p);
    }
    tail.connect(this.buses[bus] || this.buses.sfx);
    if (reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      tail.connect(send).connect(this.reverbSend);
    }
    if (far > 0) {
      const send = ctx.createGain();
      send.gain.value = far;
      tail.connect(send).connect(this.farSend);
    }
  }

  dispose() {
    try { this.ctx?.close(); } catch { /* already gone */ }
    this.ready = false;
  }
}

/* ---- buffers -------------------------------------------------------- */

function noiseBuffer(ctx, seconds, kind) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    /* Voss-McCartney, seven octaves. */
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return buf;
}

/*
 * Impulse response for the convolvers. Noise under an exponential decay, with
 * the high end pulled off faster than the low — which is what a metal box
 * full of soft people does to a sound.
 */
function impulseResponse(ctx, seconds, decay, damping) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, decay);
      const w = (Math.random() * 2 - 1) * env;
      /* One-pole low pass whose cutoff falls as the tail decays. */
      const a = 1 - damping * t * 0.85;
      lp += (w - lp) * clamp(a, 0.02, 1);
      d[i] = lp;
    }
  }
  return buf;
}

function loopSource(ctx, buffer) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}
