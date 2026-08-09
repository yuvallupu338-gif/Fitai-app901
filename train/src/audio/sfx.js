/*
 * sfx.js — every named sound, and the public-address voice.
 *
 * The voice is worth a paragraph. It is not text-to-speech. It is a formant
 * synthesiser driven by the syllable count of the line, run through a
 * band-limited chain that sounds like a 60mm driver in a plastic housing at
 * the end of a carriage. That is a deliberate choice over the browser's real
 * TTS (which is still offered, in settings, for players who prefer it):
 *
 *  - It is identical on every machine. A horror beat that lands on Chrome for
 *    macOS and comes out as a cheerful assistant on Windows is not a beat.
 *  - It cannot be understood without the subtitle, which means the player
 *    *reads* the announcements — and the game changes what the announcements
 *    say. Reading is slower and more deliberate than hearing.
 *  - It can be degraded continuously. As the night gets worse the formants
 *    drift, the carrier detunes, and the same routine "mind the doors" line
 *    stops sounding like it is being played back and starts sounding like it
 *    is being said.
 */

import { clamp } from '../core/math.js';
import { bus as globalBus } from '../core/events.js';

export class Sfx {
  constructor(engine, events = globalBus) {
    this.engine = engine;
    this.events = events;
    this.voiceChain = null;
    this.activeVoice = null;
    this.corruption = 0;      // 0..1, raised by the director as the night sours
    this.lastFootstep = 0;
    this.footToggle = 0;
    /* Settings choose between the built-in public-address synthesiser and the
       browser's own speech engine; individual calls can still override it. */
    this.systemVoice = (engine.settings?.speechVoice === 'system');
  }

  get ready() { return this.engine.ready; }

  /* Announces itself to the caption layer whether or not audio is running, so
     a player with the volume at zero still gets the beat. */
  caption(text, kind = 'sound') {
    if (text) this.events.emit('caption', { text, kind });
  }

  play(name, opts = {}) {
    const fn = SOUNDS[name];
    if (!fn) {
      console.warn(`[sfx] unknown sound "${name}"`);
      return;
    }
    if (opts.caption !== false && CAPTIONS[name]) this.caption(CAPTIONS[name], 'sound');
    if (!this.engine.ready) return;
    try { fn(this.engine, { ...opts, sfx: this }); } catch (err) { console.warn(`[sfx] ${name}`, err); }
  }

  /* ---- public address ---------------------------------------------- */

  _buildVoiceChain() {
    const e = this.engine;
    const ctx = e.ctx;
    const input = ctx.createGain();
    input.gain.value = 1;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 320;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3400;

    /* The plastic-cone resonance that makes a tannoy a tannoy. */
    const horn = ctx.createBiquadFilter();
    horn.type = 'peaking';
    horn.frequency.value = 1750;
    horn.Q.value = 1.6;
    horn.gain.value = 7;

    const shaper = ctx.createWaveShaper();
    shaper.curve = softClip(2.6);
    shaper.oversample = '2x';

    const out = ctx.createGain();
    out.gain.value = 0.5;

    input.connect(hp).connect(horn).connect(shaper).connect(lp).connect(out);
    out.connect(e.buses.voice);

    const send = ctx.createGain();
    send.gain.value = 0.5;
    out.connect(send).connect(e.reverbSend);

    this.voiceChain = { input, out, lp, horn, hp };
    return this.voiceChain;
  }

  /*
   * Speaks a line. Returns the duration in seconds so callers can sequence
   * against it even when audio is muted or unavailable.
   */
  speak(text, opts = {}) {
    const clean = String(text || '').trim();
    if (!clean) return 0;

    const syllables = countSyllables(clean);
    const rate = opts.rate ?? 1;
    const perSyllable = 0.165 / rate;
    const duration = Math.max(0.5, syllables * perSyllable + 0.45);

    this.events.emit('subtitle', {
      text: clean,
      speaker: opts.speaker || 'PA',
      duration: duration + 0.9,
      kind: opts.kind || 'announcement',
    });

    if (!this.engine.ready) return duration;

    if ((opts.system ?? this.systemVoice) && typeof speechSynthesis !== 'undefined') {
      try {
        const utter = new SpeechSynthesisUtterance(clean);
        utter.rate = 0.92 * rate;
        utter.pitch = opts.pitch ?? 0.85;
        utter.volume = clamp((this.engine.settings.volumeVoice ?? 1) * 0.9, 0, 1);
        speechSynthesis.cancel();
        speechSynthesis.speak(utter);
        if (opts.chime !== false) this.play('paChime', { caption: false });
        return duration;
      } catch { /* fall through to the synthetic voice */ }
    }

    const chain = this.voiceChain || this._buildVoiceChain();
    const e = this.engine;
    const ctx = e.ctx;
    let t = e.now + 0.02;

    const corrupt = clamp(this.corruption + (opts.corruption ?? 0), 0, 1);
    chain.lp.frequency.setTargetAtTime(3400 - corrupt * 1500, t, 0.1);
    chain.horn.gain.setTargetAtTime(7 + corrupt * 5, t, 0.1);

    if (opts.chime !== false) {
      this.play('paChime', { caption: false, when: t });
      t += 0.72;
    }

    /* The click of a live PA before anybody speaks. */
    e.noiseBurst({
      when: t, duration: 0.09, type: 'white', filter: 'highpass', frequency: 900,
      gain: 0.10, attack: 0.001, bus: 'voice',
    });
    t += 0.14;

    const words = clean.replace(/[^\w\s'’-]/g, ' ').split(/\s+/).filter(Boolean);
    const base = (opts.pitch ?? 1) * (opts.female ? 172 : 116);
    let index = 0;
    const total = Math.max(1, syllables);

    for (const word of words) {
      const count = Math.max(1, syllablesInWord(word));
      for (let s = 0; s < count; s++) {
        const progress = index / total;
        /* Falling sentence contour with a lift on the final syllable of each
           word, which is most of what makes speech sound like speech. */
        const contour = 1 - progress * 0.22 + (s === count - 1 ? 0.05 : 0);
        const jitter = 1 + (Math.random() - 0.5) * (0.04 + corrupt * 0.30);
        const f0 = base * contour * jitter;
        const dur = perSyllable * (0.72 + Math.random() * 0.5);
        this._syllable(chain.input, t, dur, f0, corrupt, opts);
        t += perSyllable;
        index++;
      }
      /* Word gap. Longer after punctuation-heavy words. */
      t += perSyllable * 0.35;
    }

    /* And the click of it going dead again. */
    e.noiseBurst({
      when: t + 0.12, duration: 0.07, type: 'white', filter: 'highpass', frequency: 1200,
      gain: 0.07, attack: 0.001, bus: 'voice',
    });

    if (corrupt > 0.4) {
      e.noiseBurst({
        when: t + 0.2, duration: 0.5 + corrupt, type: 'white', filter: 'bandpass',
        frequency: 1400, Q: 0.7, gain: 0.02 * corrupt, bus: 'voice', reverb: 0.4,
      });
    }

    this.activeVoice = { end: t + 0.5 };
    return duration;
  }

  /* One voiced syllable: a buzzing carrier through three formants. */
  _syllable(destination, when, duration, f0, corrupt, opts) {
    const ctx = this.engine.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, when);
    osc.frequency.linearRampToValueAtTime(f0 * (1 + (Math.random() - 0.5) * 0.06), when + duration);

    /* Vibrato keeps a sustained vowel from sounding like a test tone. */
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2 + Math.random() * 1.4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = f0 * 0.012;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(when);
    lfo.stop(when + duration + 0.05);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(0.42, when + 0.022);
    env.gain.setValueAtTime(0.42, when + duration * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(env);

    const vowel = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    for (let i = 0; i < vowel.length; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      const drift = 1 + (Math.random() - 0.5) * corrupt * 0.5;
      f.frequency.value = vowel[i] * drift * (opts.female ? 1.15 : 1);
      f.Q.value = 7 - i * 1.6;
      const g = ctx.createGain();
      g.gain.value = [1, 0.6, 0.3][i];
      env.connect(f).connect(g).connect(destination);
    }

    osc.start(when);
    osc.stop(when + duration + 0.05);

    /* An unvoiced consonant in front of roughly half of them. */
    if (Math.random() < 0.55) {
      const src = ctx.createBufferSource();
      src.buffer = this.engine.noise.white;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200 + Math.random() * 2400;
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when - 0.028);
      g.gain.linearRampToValueAtTime(0.10, when - 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.02);
      src.connect(bp).connect(g).connect(destination);
      src.start(Math.max(0, when - 0.03), Math.random(), 0.08);
      src.stop(when + 0.06);
    }
  }

  /*
   * A whisper. Unvoiced — no carrier at all, only shaped breath — which is why
   * it is intelligible as speech but never as words. The subtitle says what it
   * said. Whether the player believes the subtitle is their business.
   */
  whisper(text, opts = {}) {
    const clean = String(text || '').trim();
    const syllables = Math.max(2, countSyllables(clean));
    const duration = syllables * 0.15 + 0.3;

    this.events.emit('subtitle', {
      text: clean,
      speaker: opts.speaker || '',
      duration: duration + 1.4,
      kind: 'whisper',
    });

    if (!this.engine.ready) return duration;
    const e = this.engine;
    let t = e.now + 0.05;
    const pan = opts.pan ?? (Math.random() * 2 - 1) * 0.85;

    for (let i = 0; i < syllables; i++) {
      const dur = 0.09 + Math.random() * 0.07;
      e.noiseBurst({
        when: t,
        duration: dur,
        type: 'white',
        filter: 'bandpass',
        frequency: 700 + Math.random() * 1500,
        Q: 5.5,
        gain: (opts.gain ?? 0.05),
        attack: 0.02,
        bus: 'voice',
        pan,
        reverb: 0.5,
        far: opts.far ?? 0,
      });
      t += 0.15;
    }
    return duration;
  }

  /* Footsteps are pushed from the player controller's stride phase rather
     than run on a timer, so they stay locked to the head bob. */
  footstep(opts = {}) {
    this.footToggle ^= 1;
    const surface = opts.surface || 'carriage';
    const cfg = surface === 'platform'
      ? { frequency: 1500, Q: 1.1, duration: 0.16, gain: 0.075, reverb: 0.55 }
      : { frequency: 620, Q: 1.6, duration: 0.10, gain: 0.055, reverb: 0.22 };
    if (!this.engine.ready) return;
    this.engine.noiseBurst({
      duration: cfg.duration,
      type: 'white',
      filter: 'bandpass',
      frequency: cfg.frequency * (this.footToggle ? 1 : 0.88),
      Q: cfg.Q,
      gain: cfg.gain * (opts.level ?? 1),
      attack: 0.002,
      pan: this.footToggle ? -0.12 : 0.12,
      reverb: cfg.reverb,
    });
    this.engine.tone({
      frequency: 96 * (this.footToggle ? 1 : 0.94),
      endFrequency: 52,
      duration: 0.09,
      type: 'sine',
      gain: 0.035 * (opts.level ?? 1),
    });
  }
}

/* ---- the sound table ------------------------------------------------ */

const SOUNDS = {
  /* Doors -------------------------------------------------------------- */
  doorChime(e, o) {
    const t = o.when || e.now;
    /* Two-note transit chime, major third down, second note softer. */
    e.tone({ when: t, frequency: 880, duration: 0.42, type: 'sine', gain: 0.14, bus: 'voice', reverb: 0.5 });
    e.tone({ when: t, frequency: 1320, duration: 0.36, type: 'sine', gain: 0.05, bus: 'voice', reverb: 0.5 });
    e.tone({ when: t + 0.38, frequency: 698, duration: 0.55, type: 'sine', gain: 0.12, bus: 'voice', reverb: 0.5 });
    e.tone({ when: t + 0.38, frequency: 1047, duration: 0.45, type: 'sine', gain: 0.04, bus: 'voice', reverb: 0.5 });
  },
  paChime(e, o) {
    const t = o.when || e.now;
    e.tone({ when: t, frequency: 587, duration: 0.30, type: 'sine', gain: 0.10, bus: 'voice', reverb: 0.4 });
    e.tone({ when: t + 0.24, frequency: 784, duration: 0.30, type: 'sine', gain: 0.09, bus: 'voice', reverb: 0.4 });
    e.tone({ when: t + 0.46, frequency: 523, duration: 0.42, type: 'sine', gain: 0.08, bus: 'voice', reverb: 0.4 });
  },
  doorOpen(e, o) {
    const t = o.when || e.now;
    e.noiseBurst({ when: t, duration: 0.55, type: 'white', filter: 'highpass', frequency: 2600, gain: 0.09, attack: 0.02, reverb: 0.3, pan: o.pan ?? 0 });
    e.noiseBurst({ when: t + 0.10, duration: 0.85, type: 'pink', filter: 'bandpass', frequency: 420, Q: 1.2, gain: 0.06, attack: 0.08, reverb: 0.4, pan: o.pan ?? 0 });
    e.tone({ when: t + 0.12, frequency: 210, endFrequency: 150, duration: 0.7, type: 'sawtooth', gain: 0.016, pan: o.pan ?? 0 });
  },
  doorClose(e, o) {
    const t = o.when || e.now;
    e.noiseBurst({ when: t, duration: 0.75, type: 'pink', filter: 'bandpass', frequency: 380, Q: 1.1, gain: 0.06, attack: 0.06, reverb: 0.35, pan: o.pan ?? 0 });
    e.tone({ when: t, frequency: 160, endFrequency: 220, duration: 0.62, type: 'sawtooth', gain: 0.015, pan: o.pan ?? 0 });
    /* The thud of rubber meeting rubber at the end of the travel. */
    e.noiseBurst({ when: t + 0.70, duration: 0.16, type: 'brown', filter: 'lowpass', frequency: 300, gain: 0.16, attack: 0.002, reverb: 0.5, pan: o.pan ?? 0 });
    e.tone({ when: t + 0.70, frequency: 88, endFrequency: 45, duration: 0.2, type: 'sine', gain: 0.10 });
  },
  doorAlarm(e, o) {
    const t = o.when || e.now;
    for (let i = 0; i < 4; i++) {
      e.tone({ when: t + i * 0.30, frequency: 1046, duration: 0.16, type: 'square', gain: 0.045, bus: 'voice', reverb: 0.3 });
    }
  },

  /* Braking and motion ------------------------------------------------- */
  brake(e, o) {
    const t = o.when || e.now;
    e.noiseBurst({ when: t, duration: o.duration ?? 3.2, type: 'white', filter: 'bandpass', frequency: 3200, sweepTo: 1400, Q: 9, gain: 0.035, attack: 0.5, reverb: 0.3, curve: 'lin' });
    e.noiseBurst({ when: t, duration: o.duration ?? 3.2, type: 'brown', filter: 'lowpass', frequency: 260, gain: 0.07, attack: 0.4, curve: 'lin' });
  },
  depart(e, o) {
    const t = o.when || e.now;
    /* Traction inverter whine — the rising staircase of a modern EMU. */
    e.tone({ when: t, frequency: 120, endFrequency: 640, duration: 4.2, type: 'sawtooth', gain: 0.020 });
    e.tone({ when: t, frequency: 240, endFrequency: 1280, duration: 4.2, type: 'sine', gain: 0.008 });
    e.noiseBurst({ when: t, duration: 1.4, type: 'pink', filter: 'bandpass', frequency: 300, Q: 0.8, gain: 0.05, attack: 0.3, curve: 'lin' });
  },
  trainPassing(e, o) {
    const t = o.when || e.now;
    const dur = o.duration ?? 3.4;
    e.noiseBurst({ when: t, duration: dur, type: 'brown', filter: 'lowpass', frequency: 900, sweepTo: 200, gain: 0.16, attack: dur * 0.35, reverb: 0.4, curve: 'lin', pan: -0.8 });
    e.noiseBurst({ when: t + 0.2, duration: dur, type: 'white', filter: 'bandpass', frequency: 2200, sweepTo: 700, Q: 0.8, gain: 0.05, attack: dur * 0.35, curve: 'lin', pan: 0.8 });
  },
  railJoint(e, o) { e.clack(o.when || e.now, o.speed ?? 0.7, 1); },

  /* Objects ------------------------------------------------------------ */
  button(e, o) {
    const t = o.when || e.now;
    e.noiseBurst({ when: t, duration: 0.04, type: 'white', filter: 'highpass', frequency: 3000, gain: 0.11, attack: 0.001 });
    e.tone({ when: t + 0.01, frequency: 1400, duration: 0.05, type: 'square', gain: 0.03 });
    e.tone({ when: t + 0.05, frequency: 60, duration: 0.10, type: 'sine', gain: 0.05 });
  },
  buttonDenied(e, o) {
    const t = o.when || e.now;
    e.tone({ when: t, frequency: 220, duration: 0.13, type: 'square', gain: 0.05 });
    e.tone({ when: t + 0.16, frequency: 165, duration: 0.20, type: 'square', gain: 0.05 });
  },
  paper(e, o) {
    const t = o.when || e.now;
    for (let i = 0; i < 5; i++) {
      e.noiseBurst({
        when: t + i * 0.055 + Math.random() * 0.03, duration: 0.09, type: 'white',
        filter: 'highpass', frequency: 2600 + Math.random() * 2000, gain: 0.05, attack: 0.004,
        pan: o.pan ?? 0, reverb: 0.15,
      });
    }
  },
  cloth(e, o) {
    e.noiseBurst({ when: o.when || e.now, duration: 0.32, type: 'pink', filter: 'bandpass', frequency: 1600, Q: 0.9, gain: 0.035, attack: 0.05, pan: o.pan ?? 0 });
  },
  seatCreak(e, o) {
    const t = o.when || e.now;
    e.tone({ when: t, frequency: 320, endFrequency: 240, duration: 0.5, type: 'sawtooth', gain: 0.012, pan: o.pan ?? 0 });
    e.noiseBurst({ when: t, duration: 0.45, type: 'pink', filter: 'bandpass', frequency: 900, Q: 4, gain: 0.02, attack: 0.08, pan: o.pan ?? 0 });
  },
  phoneRing(e, o) {
    const t = o.when || e.now;
    /* Dual tone, two bursts, then a long wait — a phone nobody is answering. */
    for (const offset of [0, 0.9]) {
      const when = t + offset;
      e.tone({ when, frequency: 440, duration: 0.4, type: 'sine', gain: 0.030, pan: o.pan ?? 0.5, far: o.far ?? 0.7, reverb: 0.4 });
      e.tone({ when, frequency: 480, duration: 0.4, type: 'sine', gain: 0.030, pan: o.pan ?? 0.5, far: o.far ?? 0.7, reverb: 0.4 });
    }
  },
  knock(e, o) {
    const t = o.when || e.now;
    for (let i = 0; i < (o.count ?? 3); i++) {
      const when = t + i * 0.34;
      e.noiseBurst({ when, duration: 0.12, type: 'brown', filter: 'lowpass', frequency: 420, gain: 0.10, attack: 0.002, pan: o.pan ?? 0, reverb: 0.5, far: o.far ?? 0.3 });
      e.tone({ when, frequency: 150, endFrequency: 80, duration: 0.14, type: 'sine', gain: 0.05, pan: o.pan ?? 0 });
    }
  },
  windowTap(e, o) {
    const t = o.when || e.now;
    for (let i = 0; i < 3; i++) {
      e.noiseBurst({ when: t + i * 0.20, duration: 0.05, type: 'white', filter: 'bandpass', frequency: 5200, Q: 3, gain: 0.06, attack: 0.001, pan: o.pan ?? -0.7 });
    }
  },

  /* Presence ------------------------------------------------------------ */
  distantFootsteps(e, o) {
    const t = o.when || e.now;
    const count = o.count ?? 7;
    const spacing = o.spacing ?? 0.46;
    for (let i = 0; i < count; i++) {
      const when = t + i * spacing + (Math.random() - 0.5) * 0.03;
      const fade = o.approaching ? 0.4 + (i / count) * 0.9 : 1 - (i / count) * 0.6;
      e.noiseBurst({
        when, duration: 0.20, type: 'brown', filter: 'lowpass', frequency: 380,
        gain: 0.055 * fade, attack: 0.004, pan: o.pan ?? 0, far: 0.85, reverb: 0.3,
      });
      e.tone({ when, frequency: 78, endFrequency: 46, duration: 0.18, type: 'sine', gain: 0.03 * fade, pan: o.pan ?? 0, far: 0.7 });
    }
  },
  breath(e, o) {
    const t = o.when || e.now;
    e.noiseBurst({ when: t, duration: 0.7, type: 'pink', filter: 'bandpass', frequency: 600, Q: 2.2, gain: 0.030, attack: 0.22, pan: o.pan ?? 0, reverb: 0.3, curve: 'lin' });
  },
  heartbeat(e, o) {
    const t = o.when || e.now;
    for (const [offset, level] of [[0, 1], [0.24, 0.72]]) {
      e.tone({ when: t + offset, frequency: 62, endFrequency: 34, duration: 0.24, type: 'sine', gain: 0.13 * level });
      e.noiseBurst({ when: t + offset, duration: 0.10, type: 'brown', filter: 'lowpass', frequency: 180, gain: 0.05 * level, attack: 0.004 });
    }
  },

  /* Environment --------------------------------------------------------- */
  lightBuzz(e, o) {
    const t = o.when || e.now;
    e.noiseBurst({ when: t, duration: o.duration ?? 0.55, type: 'white', filter: 'bandpass', frequency: 5200, Q: 2.5, gain: 0.030, attack: 0.005, curve: 'lin' });
    e.tone({ when: t, frequency: 100, duration: o.duration ?? 0.55, type: 'square', gain: 0.014 });
  },
  lightsOut(e, o) {
    const t = o.when || e.now;
    e.tone({ when: t, frequency: 220, endFrequency: 40, duration: 0.35, type: 'sawtooth', gain: 0.05 });
    e.noiseBurst({ when: t, duration: 0.2, type: 'white', filter: 'highpass', frequency: 2000, gain: 0.05, attack: 0.002 });
  },
  powerUp(e, o) {
    const t = o.when || e.now;
    e.tone({ when: t, frequency: 45, endFrequency: 210, duration: 0.5, type: 'sawtooth', gain: 0.045 });
    e.noiseBurst({ when: t + 0.35, duration: 0.3, type: 'white', filter: 'bandpass', frequency: 4200, Q: 2, gain: 0.03, attack: 0.01 });
  },
  metalGroan(e, o) {
    const t = o.when || e.now;
    const dur = o.duration ?? 3.4;
    e.tone({ when: t, frequency: 58, endFrequency: 41, duration: dur, type: 'sawtooth', gain: 0.030, attack: 0.9, reverb: 0.6 });
    e.tone({ when: t + 0.2, frequency: 87, endFrequency: 63, duration: dur - 0.2, type: 'triangle', gain: 0.018, attack: 0.8, reverb: 0.6 });
    e.noiseBurst({ when: t, duration: dur, type: 'brown', filter: 'bandpass', frequency: 160, Q: 5, gain: 0.03, attack: 1.2, curve: 'lin' });
  },
  staticBurst(e, o) {
    const t = o.when || e.now;
    e.noiseBurst({ when: t, duration: o.duration ?? 0.5, type: 'white', filter: 'bandpass', frequency: 1800, Q: 0.5, gain: 0.055, attack: 0.004, bus: 'voice' });
  },
  rustle(e, o) {
    e.noiseBurst({ when: o.when || e.now, duration: 0.5, type: 'pink', filter: 'highpass', frequency: 1800, gain: 0.022, attack: 0.15, pan: o.pan ?? 0, curve: 'lin' });
  },
  clue(e, o) {
    const t = o.when || e.now;
    e.tone({ when: t, frequency: 1320, duration: 0.5, type: 'sine', gain: 0.035, reverb: 0.5 });
    e.tone({ when: t + 0.06, frequency: 1760, duration: 0.6, type: 'sine', gain: 0.020, reverb: 0.5 });
  },
  uiMove(e, o) {
    e.tone({ when: o.when || e.now, frequency: 620, duration: 0.06, type: 'sine', gain: 0.035, bus: 'sfx' });
  },
  uiSelect(e, o) {
    const t = o.when || e.now;
    e.tone({ when: t, frequency: 420, duration: 0.10, type: 'sine', gain: 0.05 });
    e.tone({ when: t + 0.04, frequency: 840, duration: 0.16, type: 'sine', gain: 0.03 });
  },
  uiBack(e, o) {
    e.tone({ when: o.when || e.now, frequency: 300, endFrequency: 180, duration: 0.16, type: 'sine', gain: 0.045 });
  },
  stinger(e, o) {
    const t = o.when || e.now;
    /* Not a jump scare — a low swell that arrives after the thing it is
       reacting to, which is the opposite of a sting. */
    e.tone({ when: t, frequency: 44, duration: 3.0, type: 'sine', gain: 0.10, attack: 1.1 });
    e.tone({ when: t, frequency: 66, duration: 2.6, type: 'triangle', gain: 0.035, attack: 1.3 });
    e.noiseBurst({ when: t, duration: 2.8, type: 'brown', filter: 'lowpass', frequency: 220, gain: 0.05, attack: 1.4, curve: 'lin' });
  },
};

/* Sound captions, for players who leave subtitles on. Only sounds that carry
   information get one — captioning the wheels would drown the ones that
   matter. */
const CAPTIONS = {
  distantFootsteps: '[footsteps, next carriage]',
  phoneRing: '[a phone ringing, somewhere]',
  knock: '[knocking]',
  windowTap: '[tapping on the glass]',
  metalGroan: '[metal groaning]',
  lightsOut: '[the lights go out]',
  powerUp: '[power returns]',
  breath: '[breathing, close]',
  heartbeat: '[a heartbeat]',
  staticBurst: '[static]',
  trainPassing: '[a train passes]',
  doorAlarm: '[door alarm]',
  seatCreak: '[a seat creaks]',
  rustle: '[something shifts]',
};

/* Three formants per vowel — roughly /a/, /e/, /i/, /o/, /u/. */
const VOWELS = [
  [730, 1090, 2440],
  [530, 1840, 2480],
  [270, 2290, 3010],
  [570, 840, 2410],
  [300, 870, 2240],
];

function softClip(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

export function syllablesInWord(word) {
  const w = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1;
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return groups ? Math.max(1, groups.length) : 1;
}

export function countSyllables(text) {
  return String(text)
    .split(/\s+/)
    .filter(Boolean)
    .reduce((sum, w) => sum + syllablesInWord(w), 0);
}
