/*
 * audio.js — every sound in Pine Court, synthesised at runtime.
 *
 * There are no audio files, and this time it is not really about download
 * size. The game has one important sound in it, and that sound has to change
 * continuously with where she is standing, whether a house is between her and
 * you, and whether she has stopped drifting and started hunting. A recording
 * of a woman whistling would need a filter, a panner and a distance curve
 * bolted onto it anyway, and once you have written those three the recording
 * is the least interesting part of the chain.
 *
 * Two decisions carry the file.
 *
 * The whistle is built as a person, not as a lead line. A sine at 1.8 kHz with
 * an envelope on it is a hearing test — an early build of it got described as
 * "the pause menu beeping". What makes an ear hear a mouth is the breath
 * underneath the tone, the glide between the notes, and a vibrato that widens
 * as the note runs out of air. Those three cost about ten lines each and they
 * are the whole difference.
 *
 * The phrase is scheduled ahead, as a whole, on the AudioContext clock. Note
 * timing driven out of tick() drifts by whatever each frame took, and a
 * lullaby that wobbles in time stops sounding like someone singing and starts
 * sounding like a loop with a bug in it. The player hears this thing for five
 * minutes at a stretch, so they will find that bug. tick() only ever answers
 * the question "is the next phrase due yet".
 */

/* ------------------------------------------------------------------ *
 * The lullaby
 * ------------------------------------------------------------------ */

/*
 * Eight notes, in semitones from the root, with a length in beats. A minor:
 * up a third, back down, one held note, and then the last two sit a whole tone
 * under where the ear has already decided they are going, so the phrase ends
 * on the subtonic and never resolves. Hear it once and you can sing it back;
 * sing it back and it is wrong, and you cannot say where. That is the entire
 * brief for this melody.
 */
const MELODY = [
  { semitone:  0, beats: 1.0 },   /* A                                        */
  { semitone:  3, beats: 1.0 },   /* C   — up a minor third                   */
  { semitone:  2, beats: 0.5 },   /* B                                        */
  { semitone:  0, beats: 1.5 },   /* A                                        */
  { semitone: -2, beats: 1.0 },   /* G                                        */
  { semitone:  0, beats: 2.0 },   /* A   — the held one; the vibrato opens up */
  { semitone: -4, beats: 1.0 },   /* F   — the ear wants G here               */
  { semitone: -2, beats: 2.0 },   /* G   — and it wants A here                */
];

/*
 * A6, not A5. A whistled note lives between about 1 and 2.5 kHz, which is why
 * the tone runs through a bandpass up there; write the melody an octave lower
 * to match the notation and the bandpass eats the fundamental and passes the
 * second harmonic, so every note arrives an octave up anyway — only thinner,
 * and with the breath layer an octave away from anything it belongs to.
 */
const ROOT = 1760;
const BEAT = 0.62;          /* seconds per beat at tempo 1: 10 beats = 6.2 s */
const BEATS = MELODY.reduce((a, n) => a + n.beats, 0);
const LOOP = 12;            /* phrase, then silence — the floor on the cycle */
const LOOKAHEAD = 1.6;      /* how far ahead of the clock tick() schedules   */

/* Footsteps. `send` matters more than gain out here: the difference between
 * the middle of the road and the passage between two houses is almost entirely
 * how much of the step comes back at you. */
const SURFACES = {
  grass:  { hp: 200, lp: 2400, dur: 0.14, gain: 0.115, send: 0.16, rate: 0.85 },
  road:   { hp: 340, lp: 5400, dur: 0.07, gain: 0.180, send: 0.34, rate: 1.15 },
  path:   { hp: 300, lp: 4200, dur: 0.08, gain: 0.175, send: 0.30, rate: 1.05 },
  wood:   { hp: 140, lp: 1700, dur: 0.10, gain: 0.190, send: 0.22, rate: 0.90 },
  gravel: { hp: 520, lp: 7600, dur: 0.16, gain: 0.170, send: 0.26, rate: 1.25 },
  floor:  { hp: 170, lp: 2100, dur: 0.09, gain: 0.140, send: 0.14, rate: 0.95 },
};

/* A garden music box has a pentatonic comb because a pentatonic comb cannot
 * play a wrong note by accident. The puzzle leans on that: every tine you can
 * strike sounds fine, so the only way to be wrong is the order. */
const BOX_SCALE = [0, 3, 5, 7, 10, 12, 15, 17];
const BOX_ROOT = 1046.5;    /* C6 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/* Every number reaching this file comes from the whistler AI, from a countdown
 * or from a divide by a distance that was zero for one frame. A NaN written to
 * an AudioParam throws, and on a per-frame call that takes the frame with it. */
const num = (v, d) => (Number.isFinite(v) ? v : d);

/* Firefox was late to cancelAndHoldAtTime and some builds still lack it.
 * Reading .value mid-ramp gives roughly where the ramp has got to, which is
 * inaudible underneath the 12 ms fade that always follows this call. */
function hold(param, t) {
  if (param.cancelAndHoldAtTime) { param.cancelAndHoldAtTime(t); return; }
  const v = param.value;
  param.cancelScheduledValues(t);
  param.setValueAtTime(v, t);
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.scene = 'night';
    this.night = 1;
    this.indoors = false;
    this.danger = 0;
    this.tempo = 1;

    this.amb = { srcs: [], gains: {}, base: {} };
    this.w = null;                /* the whistle graph, or null */
    this.whistleOn = false;
    this.whistleWanted = false;
    this.whistleUntil = 0;
    this.lastPan = 0;
    this.her = { dist: 99, hunting: false, visible: false };

    /* Next-event clocks for everything that repeats. They live in one object
     * so that it stays obvious that nothing in tick() allocates a node without
     * also pushing its clock forward. */
    this.next = { cricket: 0, dog: 0, bird: 0, kid: 0, tick: 0, tick2: 0,
                  beat: 0, breath: 0 };
  }

  /* Must be called from a user gesture; browsers will not start an
   * AudioContext otherwise. Failing here is not fatal — the game is playable
   * mute, it is just an entirely different and much easier game. */
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
    /* Not 0.9. setMuted is wired to a checkbox that is restored from storage
     * before anything has been clicked, so the mute can and does arrive first;
     * opening at 0.9 regardless gives a game that plays at full volume with
     * its own sound toggle showing off. */
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.release.value = 0.35;
    this.master.connect(comp).connect(ctx.destination);

    /* Two convolvers rather than one whose buffer gets replaced. Assigning
     * .buffer on a running ConvolverNode cuts whatever tail is in it dead, and
     * the moment that happens is the moment you cross your own threshold with
     * the flag in your hands — the one second of the night that must not
     * click. Both spaces run and applySpace crossfades between them. */
    this.reverb = this.gain(1);
    this.rvOut = ctx.createConvolver();
    this.rvIn = ctx.createConvolver();
    this.rvOutGain = this.gain(1);
    this.rvInGain = this.gain(0);
    this.reverbGain = this.gain(0.18);
    this.reverb.connect(this.rvOut).connect(this.rvOutGain).connect(this.reverbGain);
    this.reverb.connect(this.rvIn).connect(this.rvInGain).connect(this.reverbGain);
    this.reverbGain.connect(this.master);
    this.spaceKey = '';
    this.dry = ctx.createGain();
    this.dry.connect(this.master);

    /*
     * One four-second noise buffer for the wind bed, the footsteps, the breath
     * layer and the keypad clicks. Backrooms integrates its noise almost all
     * the way to brown, which is right for a room tone and silent through a
     * 2 kHz highpass — and half the sounds out here are highpassed clicks. So
     * this one keeps a good deal more white in the mix.
     */
    const len = ctx.sampleRate * 4;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 2.6 + w * 0.55;
    }

    /* Ambience runs on its own bus so it can be ducked under a scream and
     * tilted cold as the nights get worse without touching the one-shots. */
    this.ambBus = this.gain(1);
    this.ambDuck = this.gain(1);
    this.ambTilt = this.filter('lowshelf', 260);
    this.ambSend = this.gain(0.5);
    this.ambBus.connect(this.ambDuck).connect(this.ambTilt).connect(this.dry);
    this.ambTilt.connect(this.ambSend).connect(this.reverb);

    /* A hair of ring, driven by suspicion, sitting under the threshold of
     * "there is a tone playing" until it is not. Testers report it as the night
     * going quiet rather than as a sound being added, which is the idea. */
    this.ring = this.osc('sine', 3120);
    this.ringGain = this.gain(0);
    this.ring.connect(this.ringGain).connect(this.dry);
    this.ring.start();

    /* The sub that comes up while she is hunting. Below anything a laptop
     * speaker reproduces, deliberately: on headphones it is dread, on a laptop
     * it is nothing at all, and neither of those is the wrong answer. */
    this.sub = this.osc('sine', 38);
    this.subGain = this.gain(0);
    this.sub.connect(this.subGain).connect(this.dry);
    this.sub.start();

    this.ready = true;
    this.setNight(this.night);
    this.buildBed();
    if (this.whistleWanted) this.startWhistle({ tempo: this.tempo });
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Node plumbing
   * ------------------------------------------------------------------ */

  gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }

  osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    return o;
  }

  noise(rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true; s.playbackRate.value = rate;
    return s;
  }

  /* Not every browser has StereoPannerNode; the ones that do not simply get a
   * mono neighbourhood, which loses a cue and breaks nothing. */
  panner(pan) {
    if (!this.ctx.createStereoPanner || !pan) return null;
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    return p;
  }

  /* Dry, plus a send, plus an optional pan. Every one-shot ends this way. */
  out(node, send, pan) {
    const p = this.panner(pan);
    if (p) node.connect(p).connect(this.dry); else node.connect(this.dry);
    if (send > 0) node.connect(this.gain(send)).connect(this.reverb);
  }

  /* Attack, then exponential decay: the shape of every struck thing here. The
   * floor is 0.0001 rather than 0 because an exponential ramp to zero is
   * undefined and silently leaves the gain wherever it was. */
  env(node, t, peak, dur, atk = 0.006) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + atk);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  /* ------------------------------------------------------------------ *
   * Space
   * ------------------------------------------------------------------ */

  /*
   * `gap` is the pre-delay, and it is the parameter that actually separates
   * outdoors from indoors. The naive version does not have one: shorten a
   * hallway impulse until its tail is street-length and you get a small bright
   * bathroom, not a street. Out here the nearest reflecting thing is the house
   * opposite, so the first reflection lands 40-odd milliseconds late and there
   * is nothing at all in between. The four discrete taps are that house, the
   * road and the two nearest fences; offsetting them per channel is most of
   * what makes the outdoors sound wide.
   */
  makeImpulse(seconds, decay, gap) {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const pre = Math.min(len - 1, Math.floor(rate * gap));
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / (len - pre);
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
      for (let k = 0; k < 4; k++) {
        const at = pre + Math.floor(rate * (0.011 + k * 0.023 + c * 0.007));
        if (at < len) ch[at] += (0.45 + Math.random() * 0.55) * (1 - k * 0.19)
          * (c ? -1 : 1);
      }
    }
    return buf;
  }

  applySpace() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    /* Later nights are drier. Nothing in the fiction explains it and nobody
     * notices it directly; it just makes night seven feel as though the air
     * has been taken out of the street. */
    const air = 1 - (this.night - 1) / 11;
    /* Baked once per scene per night, not per call: it is a quarter of a
     * million samples of noise, and indoors flips every frame for anyone
     * standing in their own doorway. */
    const key = this.scene + this.night;
    if (this.spaceKey !== key) {
      this.spaceKey = key;
      /* The same street is shorter by day. Warm air, open windows, leaves on
       * everything — the slap off the house opposite comes back sooner and
       * with less of itself left in it than it does at half three. */
      const size = this.scene === 'night' ? 0.95 : 0.62;
      this.rvOut.buffer = this.makeImpulse(size + 0.55 * air, 3.4, 0.045);
    }
    if (!this.rvIn.buffer) this.rvIn.buffer = this.makeImpulse(0.30, 4.8, 0.005);
    /* 80 ms: inside the length of a door closing, and well outside the length
     * of a step. */
    const swap = 0.08;
    this.rvOutGain.gain.setTargetAtTime(this.indoors ? 0 : 1, t, swap);
    this.rvInGain.gain.setTargetAtTime(this.indoors ? 1 : 0, t, swap);
    this.reverbGain.gain.setTargetAtTime(
      this.indoors ? 0.20 : 0.06 + 0.15 * air, t, swap);
    this.ambSend.gain.setTargetAtTime(this.indoors ? 0.22 : 0.5, t, swap);
  }

  /* ------------------------------------------------------------------ *
   * Ambience
   * ------------------------------------------------------------------ */

  bedNoise(key, type, freq, q, level, rate, depth) {
    const src = this.noise();
    const f = this.filter(type, freq, q);
    const g = this.gain(0);
    src.connect(f).connect(g).connect(this.ambBus);
    src.start();
    /* Gusts. A wind bed on a fixed filter is a hiss, and three seconds of an
     * unchanging hiss is all it takes for the ear to file it under "the
     * speaker is broken" and stop hearing the street at all. */
    const lfo = this.osc('sine', rate);
    lfo.connect(this.gain(depth)).connect(f.frequency);
    lfo.start();
    g.gain.setTargetAtTime(level, this.ctx.currentTime, 1.4);
    this.amb.srcs.push(src, lfo);
    this.amb.gains[key] = g;
    this.amb.base[key] = level;
  }

  /* Sodium street lamps: gear noise at twice mains. It is the one sound in the
   * game with no reverb send at all, because it is coming from four metres
   * over your head — put a tail on it and it moves across the road, which
   * reads as wrong even to people who cannot say what changed. */
  bedHum() {
    const g = this.gain(0);
    g.connect(this.dry);
    for (const [f, a, type] of [[120, 1, 'triangle'], [240, 0.34, 'sine'],
                                [360, 0.12, 'sine']]) {
      const o = this.osc(type, f);
      o.connect(this.gain(a)).connect(g);
      o.start();
      this.amb.srcs.push(o);
    }
    /* Old ballast never sits still, and without the flutter this is a 120 Hz
     * test tone that beats against the whistle's lower notes. */
    const fl = this.osc('sine', 0.23);
    fl.connect(this.gain(0.0055)).connect(g.gain);
    fl.start();
    this.amb.srcs.push(fl);
    g.gain.setTargetAtTime(0.018, this.ctx.currentTime, 2);
    this.amb.gains.hum = g;
  }

  /* Someone two streets over, mowing at four in the afternoon. Almost all of
   * it is reverb because at that range nothing else survives, and the slow
   * wander on the frequency is the blade loading and unloading — without it
   * the whole thing is a fridge. */
  bedMower() {
    const o = this.osc('sawtooth', 76);
    const g = this.gain(0);
    o.connect(this.filter('lowpass', 330, 1.1)).connect(g).connect(this.ambBus);
    o.start();
    const load = this.osc('sine', 0.14);
    load.connect(this.gain(5.5)).connect(o.frequency);
    load.start();
    g.gain.setTargetAtTime(0.020, this.ctx.currentTime, 3);
    this.amb.srcs.push(o, load);
    this.amb.gains.mower = g;
  }

  buildBed() {
    this.stopBed();
    if (!this.ready) return;
    if (this.scene === 'night') {
      this.bedNoise('wind', 'lowpass', 250, 0.7, 0.038, 0.06, 95);
      this.bedHum();
    } else {
      this.bedNoise('leaves', 'bandpass', 1450, 0.55, 0.030, 0.09, 620);
      this.bedNoise('wind', 'lowpass', 320, 0.6, 0.018, 0.05, 120);
      this.bedMower();
    }
    this.applySpace();
  }

  stopBed() {
    for (const s of this.amb.srcs) { try { s.stop(); } catch { /* done */ } }
    this.amb = { srcs: [], gains: {}, base: {} };
  }

  setScene(scene) {
    const s = scene === 'day' ? 'day' : 'night';
    if (s === this.scene && this.amb.srcs.length) return;
    this.scene = s;
    this.next.cricket = this.next.dog = this.next.bird = this.next.kid = 0;
    this.buildBed();
  }

  /* Colder and drier, one night at a time. Cold is a shelf cut under 260 Hz:
   * take the warmth out of the wind and the same bed sounds like February. */
  setNight(n) {
    this.night = clamp(Math.round(num(n, 1)), 1, 7);
    if (!this.ready) return;
    this.ambTilt.gain.value = -1.2 * (this.night - 1);
    this.applySpace();
  }

  duck(seconds) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const g = this.ambDuck.gain;
    hold(g, t);
    g.linearRampToValueAtTime(0.22, t + 0.05);
    g.linearRampToValueAtTime(1, t + 0.05 + seconds);
  }

  /* ------------------------------------------------------------------ *
   * One-shots
   * ------------------------------------------------------------------ */

  burst({ hp, lp, dur, gain, send, rate = 1, q = 1, at = 0, pan = 0, lp2 = 0 }) {
    if (!this.ready || this.muted) return;
    const t = at || this.ctx.currentTime;
    const src = this.noise(rate);
    const lpf = this.filter('lowpass', lp, q);
    /* A falling lowpass is the difference between a burst of noise and a thing
     * moving away from the hand that let go of it: cloth, a slam, a bin. */
    if (lp2) {
      lpf.frequency.setValueAtTime(lp, t);
      lpf.frequency.exponentialRampToValueAtTime(Math.max(60, lp2), t + dur);
    }
    const g = this.gain(0);
    this.env(g, t, gain, dur);
    src.connect(this.filter('highpass', hp)).connect(lpf).connect(g);
    this.out(g, send, pan);
    /* Every source gets an explicit stop. A night is five minutes long at
     * sixty frames a second, which is a great many chances to leak one, and a
     * leaked oscillator does not announce itself until the tab is unusable. */
    src.start(t, Math.random() * 3, dur + 0.05);
    src.stop(t + dur + 0.06);
  }

  tone(freq, dur, gain, type = 'sine', send = 0.3, at = 0, pan = 0) {
    if (!this.ready || this.muted) return;
    const t = at || this.ctx.currentTime;
    const o = this.osc(type, freq);
    const g = this.gain(0);
    this.env(g, t, gain, dur, 0.008);
    o.connect(g);
    this.out(g, send, pan);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /*
   * A creak. The resonance is the timber and the sawtooth is the stick-slip: a
   * hinge does not glide, it grabs and lets go a few dozen times a second, and
   * a swept sine through the same filter is a theremin. The wobble on the gain
   * is that grabbing, and it is why no two doors here sound alike.
   */
  creak(t0, f0, f1, dur, gain) {
    const o = this.osc('sawtooth', f0);
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.10);
    g.gain.exponentialRampToValueAtTime(gain * 0.4, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const wob = this.osc('sine', 6 + Math.random() * 7);
    wob.connect(this.gain(gain * 0.55)).connect(g.gain);
    o.connect(this.filter('bandpass', 1050 + Math.random() * 500, 6.5)).connect(g);
    this.out(g, 0.45, 0);
    o.start(t0); o.stop(t0 + dur + 0.05);
    wob.start(t0); wob.stop(t0 + dur + 0.05);
  }

  /*
   * A throat, roughly: two detuned sawtooths for the folds, a formant band
   * that does not move with the pitch, and a lowpass standing in for however
   * many walls are in the way. `rasp` is the noise on top — without it the
   * loudest version of this is an air-raid siren, and with it, it is a person,
   * which is very much worse.
   */
  voice({ f0, f1, f2, dur, gain, wall = 9000, send = 0.5, rasp = 0.5, at = 0,
          pan = 0 }) {
    if (!this.ready || this.muted) return;
    const t = at || this.ctx.currentTime;
    const outG = this.gain(0);
    outG.gain.setValueAtTime(0.0001, t);
    outG.gain.exponentialRampToValueAtTime(gain, t + dur * 0.12);
    outG.gain.setValueAtTime(gain, t + dur * 0.55);
    outG.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const form = this.filter('bandpass', 1150, 1.05);
    form.connect(this.filter('lowpass', wall, 0.6)).connect(outG);
    this.out(outG, send, pan);

    const vib = this.osc('sine', 5.4 + Math.random() * 2.2);
    const vg = this.gain(28);
    vib.connect(vg);
    for (let i = 0; i < 2; i++) {
      const o = this.osc('sawtooth', f0);
      o.detune.value = i ? 13 : -9;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.22);
      o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      vg.connect(o.detune);
      o.connect(this.gain(0.5)).connect(form);
      o.start(t); o.stop(t + dur + 0.05);
    }
    vib.start(t); vib.stop(t + dur + 0.05);
    if (rasp > 0) {
      this.burst({ hp: 650, lp: Math.min(wall, 5400), dur: dur * 0.9,
        gain: gain * rasp * 0.7, send, rate: 1.3, at: t, pan });
    }
  }

  /* ------------------------------------------------------------------ *
   * The whistle
   * ------------------------------------------------------------------ */

  buildWhistle() {
    const ctx = this.ctx;
    const w = this.w = {};
    w.osc = this.osc('sine', ROOT);
    w.harm = this.osc('sine', ROOT * 2);

    /*
     * Vibrato in two stages. `vibNote` carries the per-note shape — it opens
     * towards the end of a held note, because that is what someone running out
     * of breath does — and `vibDepth` carries the width in cents, which
     * setWhistler widens when she starts hunting. Two gains rather than one
     * because those are written from completely different places at completely
     * different rates, and multiplying them in the graph is far cheaper than
     * reconciling them in JS sixty times a second.
     */
    w.lfo = this.osc('sine', 4.6);
    w.vibNote = this.gain(0.3);
    w.vibDepth = this.gain(20);
    w.lfo.connect(w.vibNote).connect(w.vibDepth);
    w.vibDepth.connect(w.osc.detune);
    w.vibDepth.connect(w.harm.detune);

    /* The bandpass is what turns two sines into a mouth. It is wide enough to
     * pass the whole phrase but it rolls the top note off relative to the
     * bottom one, which is what a real whistle does and what makes the melody
     * sound sung rather than played. */
    w.mix = this.gain(1);
    w.body = this.filter('bandpass', 1850, 0.9);
    w.osc.connect(w.mix);
    w.harm.connect(this.gain(0.085)).connect(w.mix);
    w.mix.connect(w.body);

    w.air = this.noise();
    w.airBp = this.filter('bandpass', 2200, 0.8);
    w.airGain = this.gain(0.055);
    w.air.connect(w.airBp).connect(w.airGain);

    /* The note envelope. The breath goes through it too, so it is gated
     * exactly with the notes and never sits under the silence as a hiss. */
    w.note = this.gain(0);
    w.body.connect(w.note);
    w.airGain.connect(w.note);

    /* Except for this: a second copy of the breath routed around the envelope
     * and opened for the length of the whole phrase. It is the intake before
     * the first note and the air still moving between notes, and it is the
     * cheapest thing in the file that makes her a person. It hangs off airGain
     * rather than off the filter, so its envelope is a multiple of the breath
     * level and not of the raw noise — tapped one node earlier the intake
     * comes out twenty times the gated breath and louder than the whistle,
     * which is a woman with a punctured lung. */
    w.airBleed = this.gain(0);
    w.airGain.connect(w.airBleed);

    /* Distance and occlusion both live in this one filter: how far away she is
     * and whether there is a house in the way. Nothing else in the game tells
     * you she has gone round the back of number 14. */
    w.lp = this.filter('lowpass', 1400, 0.5);
    w.note.connect(w.lp);
    w.airBleed.connect(w.lp);

    w.gain = this.gain(0);
    w.hasPan = !!ctx.createStereoPanner;
    w.pan = w.hasPan ? ctx.createStereoPanner() : this.gain(1);
    w.send = this.gain(0.5);
    w.lp.connect(w.gain).connect(w.pan).connect(this.dry);
    w.pan.connect(w.send).connect(this.reverb);

    const t = ctx.currentTime;
    w.osc.start(t); w.harm.start(t); w.lfo.start(t); w.air.start(t);
  }

  startWhistle(opts) {
    this.tempo = clamp(num(opts && opts.tempo, 1), 0.5, 2);
    this.whistleWanted = true;
    if (!this.ready || this.whistleOn) return;
    this.buildWhistle();
    this.whistleOn = true;
    /* Six tenths of a second, not zero: the first thing you hear on any night
     * is the intake, and it needs somewhere to live before the first note. */
    this.whistleUntil = this.ctx.currentTime + 0.6;
  }

  /*
   * Schedules one whole phrase starting at t0 and nothing else. All of it is
   * absolute-time automation, so a frame that takes 200 ms changes nothing
   * about how the melody comes out.
   */
  schedulePhrase(t0) {
    const w = this.w;
    if (!w) return;
    const beat = BEAT / this.tempo;
    const glide = Math.min(0.10, beat * 0.26);
    const now = this.ctx.currentTime;

    /* The intake runs through the same distance filter as the notes, so it
     * disappears behind a house exactly like they do — which it would not if
     * it were a one-shot fired at the dry bus, and that mismatch is instantly
     * audible as two different people standing in two different places. */
    const air = w.airBleed.gain;
    air.setValueAtTime(0.0001, Math.max(now, t0 - 0.55));
    air.exponentialRampToValueAtTime(1.15, t0 - 0.14);
    air.exponentialRampToValueAtTime(0.26, t0 + 0.08);

    let t = t0;
    let prev = ROOT * Math.pow(2, MELODY[0].semitone / 12) * 0.94;
    for (let i = 0; i < MELODY.length; i++) {
      const n = MELODY[i];
      const dur = n.beats * beat;
      const f = ROOT * Math.pow(2, n.semitone / 12);

      /*
       * Portamento. The pitch starts moving before the note does and is still
       * arriving after the envelope has opened, because a mouth cannot jump.
       * Setting the frequency at the note boundary instead is what made an
       * early build read as a synth lead, and it was the only thing that did.
       */
      const g0 = i === 0 ? t - 0.06 : t - glide * 0.5;
      for (const [o, mul] of [[w.osc, 1], [w.harm, 2]]) {
        o.frequency.setValueAtTime(prev * mul, Math.max(now, g0));
        o.frequency.exponentialRampToValueAtTime(f * mul, t + glide * 0.5);
      }
      prev = f;

      const peak = 0.92 - (i === 2 ? 0.18 : 0) - (i > 5 ? 0.10 : 0);
      const rel = Math.min(0.14, dur * 0.34);
      const g = w.note.gain;
      g.setValueAtTime(0.0006, t);
      g.exponentialRampToValueAtTime(peak, t + Math.min(0.06, dur * 0.22));
      g.setValueAtTime(peak, t + dur - rel);
      g.exponentialRampToValueAtTime(0.0006, t + dur - 0.02);

      /* The vibrato arrives late and stays almost shut on the short notes.
       * Constant vibrato across a phrase sounds like an effect; vibrato that
       * only turns up at the end of a long note sounds like a lung. */
      const v = w.vibNote.gain;
      v.setValueAtTime(0.12, t);
      v.linearRampToValueAtTime(dur > 0.85 ? 1.25 : 0.42, t + dur * 0.88);

      t += dur;
    }

    /* Let the air run a beat past the last note. She stops whistling some time
     * before she stops breathing. */
    air.setValueAtTime(0.26, t);
    air.exponentialRampToValueAtTime(0.0001, t + 0.9);
  }

  stopWhistle(hard) {
    this.whistleWanted = false;
    this.whistleOn = false;
    this.whistleUntil = 0;
    this.her = { dist: 99, hunting: false, visible: false };
    const w = this.w;
    this.w = null;
    if (!w || !this.ready) return;
    const t = this.ctx.currentTime;
    /* 12 ms, not zero. A true instantaneous cut clicks, and the click is
     * louder than the whistle was — a comic sound at the exact moment the game
     * is trying to be at its worst. */
    const r = hard ? 0.012 : 0.5;
    for (const p of [w.note.gain, w.airBleed.gain, w.vibNote.gain,
                     w.osc.frequency, w.harm.frequency]) hold(p, t);
    w.note.gain.linearRampToValueAtTime(0, t + r);
    w.airBleed.gain.linearRampToValueAtTime(0, t + r);
    /* And the sources have to actually go away: seven nights, each restarted
     * however many times, is a lot of oscillators to leave running silently. */
    for (const s of [w.osc, w.harm, w.lfo, w.air]) {
      try { s.stop(t + r + 0.06); } catch { /* already stopped */ }
    }
  }

  /* Called every frame while she exists. dx/dz arrive already in camera space:
   * +x is the player's right, -z is forward. */
  setWhistler(p) {
    if (!p) return;
    const dist = Math.max(0.4, num(p.dist, 99));
    const dx = num(p.dx, 0);
    const dz = num(p.dz, 0);
    const visible = !!p.visible;
    const hunting = !!p.hunting;
    this.her = { dist, hunting, visible };

    /*
     * Pan from the angle, not from dx alone: dx/dist collapses towards zero
     * when she is far away in any direction, and she is usually far away.
     * sin(angle) is ±1 at your ears and zero both in front of you and behind
     * you — and behind is the case that matters, because a stereo field cannot
     * express it and she spends most of the night there. So anything behind
     * gets pushed out towards whichever side it is already on. Dead centre has
     * to mean "in front of you", or the cue lies at the one moment it counts.
     */
    const flat = Math.max(0.001, Math.hypot(dx, dz));
    let s = dx / flat;
    const side = s >= 0 ? 1 : -1;
    if (dz > 0) s += (side - s) * 0.55 * (dz / flat);
    this.lastPan = clamp(s * 0.92, -0.95, 0.95);

    const w = this.w;
    if (!this.ready || !w) return;
    const t = this.ctx.currentTime;

    /* Smoothed, all of it. She moves fast enough that writing these straight
     * gives audible zipper noise on the pan and a chirp on the filter. */
    if (w.hasPan) w.pan.pan.setTargetAtTime(this.lastPan, t, 0.09);

    let cut = 340 + 5200 * Math.pow(0.5, dist / 13);
    if (!visible) cut *= 0.38;
    w.lp.frequency.setTargetAtTime(clamp(cut, 170, 7000), t, 0.18);

    const near = clamp(1 - dist / 38, 0, 1);
    let g = 0.045 + 0.50 * near * near;
    if (!visible) g *= 0.72;
    if (hunting) g *= 1.15;
    w.gain.gain.setTargetAtTime(g, t, 0.15);
    /* Further away is wetter, because at forty metres across open ground most
     * of what reaches you has been off a wall first. */
    w.send.gain.setTargetAtTime(0.25 + 0.55 * (1 - near), t, 0.25);

    /* Hunting: sharp and wide. Upward rather than downward matters — a whistle
     * going flat sounds tired, a whistle going sharp sounds like someone
     * deciding something. */
    const h = hunting ? 1 : 0;
    w.osc.detune.setTargetAtTime(h * 55, t, 0.5);
    w.harm.detune.setTargetAtTime(h * 55, t, 0.5);
    w.vibDepth.gain.setTargetAtTime(20 + h * 46, t, 0.5);
    w.lfo.frequency.setTargetAtTime(4.5 + h * 1.4, t, 0.6);
  }

  scream() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this.duck(1.4);
    /* Two voices a few cents apart, because one is a sound effect and two is a
     * throat. The pitch climbs into the scream and only falls at the very end,
     * which is the shape that stops it reading as a slide whistle. */
    this.voice({ f0: 620, f1: 1180, f2: 760, dur: 1.5, gain: 0.30, send: 0.55,
      rasp: 0.85, at: t, pan: this.lastPan * 0.5 });
    this.voice({ f0: 640, f1: 1240, f2: 700, dur: 1.35, gain: 0.16, wall: 7000,
      send: 0.7, rasp: 0.4, at: t + 0.03, pan: -this.lastPan * 0.5 });
    /* The thump underneath is not part of the scream. It is the fact that she
     * is already a great deal closer than she was. */
    this.tone(44, 1.1, 0.22, 'sine', 0.2, t);
    this.burst({ hp: 40, lp: 400, dur: 0.7, gain: 0.20, send: 0.6, rate: 0.5,
      at: t });
  }

  breath(near) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    /* Rate-limited in here rather than at the call site: main.js calls this
     * every frame she is close, and a breath per frame is three and a half
     * thousand buffer sources a minute. */
    if (t < this.next.breath) return;
    const n = clamp(num(near, 0), 0, 1);
    this.next.breath = t + 2.5 - n * 1.2;
    const g = 0.02 + n * 0.075;
    const pan = this.lastPan * 0.8;
    this.burst({ hp: 420, lp: 1900 + n * 900, dur: 0.34, gain: g, send: 0.35,
      rate: 0.7, at: t, pan, lp2: 900 });
    this.burst({ hp: 300, lp: 1200, dur: 0.42, gain: g * 0.8, send: 0.4,
      rate: 0.55, at: t + 0.46, pan });
  }

  /* ------------------------------------------------------------------ *
   * The world
   * ------------------------------------------------------------------ */

  step(surface, fast) {
    if (!this.ready || this.muted) return;
    const s = SURFACES[surface] || SURFACES.path;
    const t = this.ctx.currentTime;
    const v = fast ? 1.3 : 1;
    this.burst({ hp: s.hp, lp: s.lp, dur: s.dur, send: s.send,
      gain: s.gain * v * (0.85 + Math.random() * 0.3),
      rate: s.rate * (0.9 + Math.random() * 0.22) });
    /* Gravel is two sounds: the foot, and then the stones finding somewhere
     * else to be. One burst is sand. */
    if (surface === 'gravel') {
      this.burst({ hp: 1800, lp: 11000, dur: 0.12, gain: 0.075 * v, send: 0.3,
        rate: 1.6, at: t + 0.035 });
    }
    /* And a porch board occasionally gives, which is how the game teaches that
     * the fastest way to a front door is not the quietest one. */
    if (surface === 'wood' && Math.random() < 0.22) {
      this.creak(t + 0.02, 44, 62, 0.3, 0.045 * v);
    }
  }

  land(hard) {
    this.burst({ hp: 55, lp: hard ? 950 : 520, dur: hard ? 0.24 : 0.13,
      gain: hard ? 0.30 : 0.15, send: 0.35 });
    if (hard) this.tone(72, 0.2, 0.10, 'sine', 0.3);
  }

  /* Latch, then hinge, then — closing — the frame. In that order, because that
   * is the order a hand does it in, and a door whose creak starts before its
   * latch has clicked is the sort of thing nobody can name and everybody
   * hears. */
  door(open) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this.burst({ hp: 1900, lp: 11000, dur: 0.035, gain: 0.18, send: 0.3, at: t });
    this.tone(open ? 2300 : 1720, 0.028, 0.055, 'square', 0.2, t + 0.004);
    this.creak(t + 0.09, open ? 56 : 74, open ? 98 : 38, 0.85, 0.085);
    if (!open) {
      this.burst({ hp: 50, lp: 620, dur: 0.18, gain: 0.26, send: 0.45, rate: 0.7,
        at: t + 0.95, lp2: 180 });
      this.tone(94, 0.20, 0.11, 'sine', 0.3, t + 0.95);
      this.burst({ hp: 2400, lp: 12000, dur: 0.03, gain: 0.10, send: 0.2,
        at: t + 0.98 });
    }
  }

  /* Pickets are thin and dry and every one of them rings at a slightly
   * different pitch, which is why this is a handful of knocks and not one. */
  fence() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const at = t + i * (0.045 + Math.random() * 0.05);
      this.burst({ hp: 400, lp: 4200, dur: 0.06, send: 0.3,
        gain: 0.10 + Math.random() * 0.06, rate: 1.1 + Math.random() * 0.5, at });
      this.tone(320 + Math.random() * 420, 0.07, 0.045, 'triangle', 0.35, at);
    }
    this.creak(t + 0.12, 40, 52, 0.4, 0.04);
  }

  /*
   * The loudest mistake in the game. A wheelie bin is a hollow plastic drum
   * with a lid that carries on after the body has stopped, and the second
   * knock is what turns a thud into "something has fallen over" — one impact
   * on its own reads as a heavy footstep and nobody in the street wakes up.
   */
  bin() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this.duck(0.8);
    this.tone(104, 0.34, 0.30, 'triangle', 0.7, t);
    this.tone(157, 0.20, 0.16, 'sine', 0.6, t);
    this.burst({ hp: 200, lp: 5400, dur: 0.20, gain: 0.34, send: 0.7, rate: 1.1,
      at: t, lp2: 900 });
    this.burst({ hp: 900, lp: 8000, dur: 0.09, gain: 0.20, send: 0.6, rate: 1.5,
      at: t + 0.14 });
    this.tone(238, 0.13, 0.12, 'triangle', 0.6, t + 0.15);
    this.burst({ hp: 700, lp: 6000, dur: 0.07, gain: 0.13, send: 0.6, rate: 1.7,
      at: t + 0.29 });
    /* The wheels, which go on rolling for long enough that you know there is
     * nothing left to do about it. */
    this.burst({ hp: 80, lp: 900, dur: 1.1, gain: 0.12, send: 0.8, rate: 0.55,
      at: t + 0.34, lp2: 260 });
  }

  dogBark(dist) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const near = clamp(1 - Math.max(1, num(dist, 40)) / 80, 0, 1);
    /* Distance is a lowpass and a reverb send, not a volume knob. A quiet bark
     * with all its top end still on it is a small dog standing next to you,
     * which is a different and much less lonely sound. */
    const wall = 500 + 4200 * near;
    const send = 0.35 + 0.5 * (1 - near);
    const pan = (Math.random() * 2 - 1) * 0.7;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      this.voice({ f0: 180 + Math.random() * 40, f1: 330, f2: 150, dur: 0.16,
        gain: 0.05 + near * 0.13, wall, send, rasp: 0.6, pan,
        at: t + i * (0.28 + Math.random() * 0.14) });
    }
  }

  /* A sleeper waking. The gasp is barely filtered because a window is open
   * somewhere; the scream after it is heavily filtered, because whoever it is
   * has not got as far as opening anything. */
  neighbourWake() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const pan = (Math.random() * 2 - 1) * 0.6;
    this.burst({ hp: 520, lp: 2800, dur: 0.30, gain: 0.15, send: 0.35,
      rate: 0.75, at: t, pan });
    this.voice({ f0: 330, f1: 740, f2: 470, dur: 1.5, gain: 0.20, wall: 760,
      send: 0.8, rasp: 0.35, at: t + 0.55, pan });
    this.burst({ hp: 60, lp: 400, dur: 0.5, gain: 0.09, send: 0.5, rate: 0.6,
      at: t + 0.5, pan });
  }

  pickup() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this.burst({ hp: 900, lp: 7000, dur: 0.05, gain: 0.09, send: 0.2, at: t });
    this.tone(640, 0.09, 0.075, 'triangle', 0.2, t);
    this.tone(960, 0.13, 0.055, 'triangle', 0.3, t + 0.07);
  }

  /*
   * The flag comes off its pole. Cloth first — a noise burst whose band falls
   * as the fabric slides free — and then, for about half a second, something
   * much older bleeding through underneath: a music box at the wrong speed,
   * playing the opening of the lullaby. It is never explained, and it is the
   * only place in the game where two decades are audible at once.
   */
  flagTake() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this.burst({ hp: 380, lp: 6500, dur: 0.42, gain: 0.20, send: 0.35,
      rate: 0.9, at: t, lp2: 800 });
    this.tone(1650, 0.05, 0.05, 'triangle', 0.4, t + 0.02);
    this.burst({ hp: 1600, lp: 9000, dur: 0.09, gain: 0.07, send: 0.4,
      rate: 1.4, at: t + 0.05 });
    const bleed = [0, 2, 4, 3, 2];
    for (let i = 0; i < bleed.length; i++) {
      this.musicBox(bleed[i], false, t + 0.28 + i * 0.115, 0.84);
    }
  }

  /* Not a fanfare. Three notes of the lullaby, in tune for once, over a low
   * one that does not belong to the chord: you got the flag through your own
   * front door, which is not the same as anything being over. */
  win() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const r = ROOT / 2;
    this.tone(r, 0.9, 0.095, 'sine', 0.7, t);
    this.tone(r * Math.pow(2, 3 / 12), 0.9, 0.075, 'sine', 0.7, t + 0.18);
    this.tone(r * Math.pow(2, 7 / 12), 1.7, 0.085, 'sine', 0.8, t + 0.36);
    this.tone(97, 2.6, 0.070, 'sine', 0.4, t + 0.36);
  }

  /* A plastic membrane keypad. The click is the whole sound; the pitch exists
   * only so that pressing one key twice does not read as a single long press,
   * which is exactly how a code with a repeated digit gets entered wrong three
   * times in a row. */
  keypad(digitIndex, ok) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const i = ((num(digitIndex, 0) | 0) % 12 + 12) % 12;
    this.burst({ hp: 2200, lp: 12000, dur: 0.018, gain: 0.15, send: 0.12, at: t });
    this.tone(740 + i * 36, 0.030, 0.045, 'square', 0.1, t);
    this.burst({ hp: 1400, lp: 7000, dur: 0.024, gain: 0.06, send: 0.12,
      at: t + 0.05 });
    if (ok === true) {
      this.tone(1180, 0.07, 0.085, 'square', 0.2, t + 0.09);
      this.tone(1770, 0.17, 0.075, 'square', 0.25, t + 0.16);
    } else if (ok === false) {
      this.tone(148, 0.14, 0.10, 'square', 0.2, t + 0.09);
      this.tone(148, 0.22, 0.10, 'square', 0.2, t + 0.28);
    }
  }

  /*
   * One tine of a garden music box. Struck metal is inharmonic — its partials
   * are not integer multiples of anything — and a stack tuned to 2x and 3x
   * gives an organ, not a comb. `wrong` drops it sixty cents and puts a second
   * tine a few cents from the first, which beats; that beating is the sour
   * part, not the flatness. `at` and `speed` are for flagTake, which needs the
   * same comb running slow and unsteady.
   */
  musicBox(note, wrong, at = 0, speed = 1) {
    if (!this.ready || this.muted) return;
    const t = at || this.ctx.currentTime;
    const i = ((num(note, 0) | 0) % BOX_SCALE.length + BOX_SCALE.length)
      % BOX_SCALE.length;
    const f = BOX_ROOT * Math.pow(2, BOX_SCALE[i] / 12) * speed
      * (wrong ? Math.pow(2, -0.6 / 12) : 1);
    const dur = (wrong ? 1.1 : 1.7) / speed;

    const outG = this.gain(0);
    this.env(outG, t, 1, dur, 0.004);
    const bp = this.filter('bandpass', f * 1.6, 0.7);
    bp.connect(outG);
    this.out(outG, 0.75, 0);

    /* Wow. A wrong-speed box is not merely slow, it is unsteady, and the
     * unsteadiness is what says "mechanism" rather than "pitch shift". */
    let wow = null;
    if (speed !== 1) {
      wow = this.osc('sine', 1.9);
      const wg = this.gain(22);
      wow.connect(wg);
      wow.start(t); wow.stop(t + dur + 0.05);
      wow = wg;
    }

    const parts = wrong ? [[1, 1], [1.0035, 0.9], [3.94, 0.20], [7.1, 0.06]]
                        : [[1, 1], [3.92, 0.16], [7.24, 0.05], [11.3, 0.02]];
    for (const [mul, amp] of parts) {
      const o = this.osc('sine', f * mul);
      const g = this.gain(0.10 * amp);
      /* The bright partials die first. That is what makes a strike a strike
       * and not a bell pad. The setValueAtTime is not decoration: a ramp with
       * nothing anchoring it starts from wherever the clock is now, so a note
       * scheduled half a second out — which is every note flagTake plays —
       * arrives with its partials already most of the way down and no attack
       * left on it at all. */
      g.gain.setValueAtTime(0.10 * amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (mul > 2 ? 3.2 : 1));
      if (wow) wow.connect(o.detune);
      o.connect(g).connect(bp);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  /* Rate is beats per second-ish, 0 for off. Called every frame, so the only
   * thing it may do most of the time is compare two numbers. */
  heartbeat(rate) {
    if (!this.ready || this.muted) return;
    const r = num(rate, 0);
    if (r <= 0) { this.next.beat = 0; return; }
    const t = this.ctx.currentTime;
    if (t < this.next.beat) return;
    this.next.beat = t + clamp(1 / clamp(r, 0.3, 3.5), 0.3, 3);
    const g = clamp(0.09 + r * 0.04, 0.07, 0.22);
    this.thump(t, 56, g);
    this.thump(t + 0.155, 46, g * 0.6);
  }

  /* No reverb send at all: a heartbeat with a tail is happening in the room,
   * and this one is happening in your head. The moment it acquires a space it
   * belongs to the street instead of to you. */
  thump(t, f, gain) {
    const o = this.osc('sine', f);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.13);
    const g = this.gain(0);
    this.env(g, t, gain, 0.17, 0.012);
    o.connect(g).connect(this.dry);
    o.start(t); o.stop(t + 0.2);
    this.burst({ hp: 30, lp: 160, dur: 0.1, gain: gain * 0.5, send: 0,
      rate: 0.4, at: t });
  }

  /* ------------------------------------------------------------------ *
   * Per frame
   * ------------------------------------------------------------------ */

  /* A cricket is a train of pulses, not a tone. Three of them at 30 ms is the
   * shortest thing that still reads as an insect and not as a UI beep with a
   * filter over it. */
  chirp(t, gain) {
    const pan = Math.random() * 1.7 - 0.85;
    const f = 4200 + Math.random() * 900;
    for (let i = 0; i < 3; i++) {
      this.tone(f, 0.020, gain, 'triangle', 0.35, t + i * 0.031, pan);
    }
  }

  bird(t) {
    const pan = Math.random() * 1.6 - 0.8;
    const f = 2400 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.tone(f * (1 + i * 0.12), 0.055, 0.014, 'sine', 0.55, t + i * 0.09, pan);
    }
  }

  tick(dt, state) {
    if (!this.ready) return;
    const s = state || {};
    const now = this.ctx.currentTime;

    if (!!s.indoors !== this.indoors) {
      this.indoors = !!s.indoors;
      this.applySpace();
    }
    if (s.scene && s.scene !== this.scene) this.setScene(s.scene);
    this.danger += (clamp(num(s.danger, 0), 0, 1) - this.danger)
      * Math.min(1, num(dt, 0.016) * 3);

    /* ---- the whistle ---- */

    if (this.whistleOn && this.w) {
      /*
       * If the tab has been in the background the clock has run on without any
       * frames, and whistleUntil can be a minute in the past. The naive while
       * loop then schedules five phrases at once, all of them already due, and
       * they arrive together as a chord. Fast-forward instead.
       */
      if (this.whistleUntil < now) this.whistleUntil = now + 0.25;
      /* Twelve seconds, unless the phrase does not fit in twelve seconds. At
       * tempo 0.5 it is 12.4 s of notes plus the breath that runs on past the
       * last one, and a fixed cycle lays the next phrase's automation down
       * underneath events already on the same AudioParams — which is not a
       * slow lullaby, it is two of them coming apart. */
      const span = Math.max(LOOP, BEATS * (BEAT / this.tempo) + 1.6);
      while (this.whistleUntil < now + LOOKAHEAD) {
        this.schedulePhrase(this.whistleUntil);
        this.whistleUntil += span;
      }
    }

    /* ---- ambience ---- */

    if (this.scene === 'night') {
      if (now > this.next.cricket) {
        this.next.cricket = now + 0.25 + Math.random() * 0.9;
        /*
         * Crickets do not fade, they stop, and that is the best warning in the
         * game — better than anything the HUD does. But a hard cut at a hard
         * radius flickers on and off while she walks along the boundary, which
         * reads as a bug, so it ramps over four metres and survives.
         */
        const hush = smooth(12, 16, this.her.dist) * (1 - this.danger * 0.8);
        if (hush > 0.03) this.chirp(now, 0.011 * hush * (0.6 + Math.random() * 0.8));
      }
      if (now > this.next.dog) {
        this.next.dog = now + 20 + Math.random() * 20;
        this.dogBark(40 + Math.random() * 45);
      }
    } else {
      if (now > this.next.bird) {
        this.next.bird = now + 1.4 + Math.random() * 3.6;
        this.bird(now);
      }
      if (now > this.next.kid) {
        this.next.kid = now + 18 + Math.random() * 22;
        /* Children two gardens over, which at that distance is two vowels and
         * no consonants at all. Anything more articulate and they are in your
         * garden, which is a different game. */
        for (const [f0, f1, f2, d, g, off] of [[500, 820, 610, 0.55, 0.035, 0],
                                               [620, 900, 700, 0.40, 0.028, 0.8]]) {
          this.voice({ f0, f1, f2, dur: d, gain: g, wall: 1400, send: 0.9,
            rasp: 0.12, at: now + off, pan: Math.random() * 1.4 - 0.7 });
        }
      }
    }

    /* ---- time pressure ---- */

    const left = num(s.timeLeft, 999);
    if (left < 60) {
      const urg = clamp((60 - left) / 40, 0, 1);
      if (now > this.next.tick) {
        this.next.tick = now + 1.02 - urg * 0.44;
        this.tone(2050, 0.032, 0.014 + urg * 0.05, 'square', 0.25, now);
        this.burst({ hp: 2600, lp: 12000, dur: 0.02, send: 0.2, at: now,
          gain: 0.012 + urg * 0.04 });
      }
      /* Under twenty seconds a second tick starts, faster and deliberately off
       * the beat of the first. Two clocks that do not agree is a far worse
       * feeling than one clock going quickly. */
      if (left < 20 && now > this.next.tick2) {
        this.next.tick2 = now + 0.31;
        this.tone(3150, 0.020, 0.026, 'square', 0.2, now);
      }
    } else {
      this.next.tick = 0;
      this.next.tick2 = 0;
    }

    /* ---- continuous parameters ---- */

    /* Everything below here writes to nodes that already exist. Nothing below
     * here is allowed to allocate, because all of it runs sixty times a second
     * for five minutes at a stretch. */
    this.ringGain.gain.setTargetAtTime(
      clamp(num(s.suspicion, 0), 0, 1) * 0.009, now, 0.5);
    this.subGain.gain.setTargetAtTime(
      s.hunting ? 0.055 : this.danger * 0.02, now, 0.7);
    const wind = this.amb.gains.wind;
    if (wind) {
      wind.gain.setTargetAtTime(
        this.amb.base.wind * (1 + this.danger * 0.9), now, 1.2);
    }
  }

  /* ------------------------------------------------------------------ *
   * Lifecycle
   * ------------------------------------------------------------------ */

  setMuted(m) {
    this.muted = !!m;
    if (!this.master) return;
    /* Ramped, because the mute checkbox lives in a settings panel that can be
     * clicked repeatedly, and a stepped gain change on a running wind bed is
     * an audible thud every time. */
    const t = this.ctx.currentTime;
    hold(this.master.gain, t);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.9, t + 0.06);
  }

  dispose() {
    if (this.ready) this.stopWhistle(true);
    this.stopBed();
    for (const o of [this.ring, this.sub]) {
      if (o) { try { o.stop(); } catch { /* already stopped */ } }
    }
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ready = false;
    this.w = null;
  }
}
