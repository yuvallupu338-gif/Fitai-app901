/*
 * audio.js — a small synthesiser, because a platformer without sound is a
 * different game.
 *
 * Nothing is loaded. Every sound here is generated: the jump is a square wave
 * sweeping up, the coin is two notes a fifth apart, the music is three
 * oscillators and a noise channel driven by a step sequencer. That is not a
 * size optimisation — it is the only way to ship this as plain files with no
 * build step and no assets directory, and it happens to be exactly how the
 * machine being imitated made sound in the first place.
 *
 * Two things browsers force on you and this handles once:
 *
 * The context cannot start before a user gesture, so it is created lazily on
 * the first key or tap and everything before that is silently dropped rather
 * than queued — a queue would dump nine seconds of backed-up sound effects
 * the moment the player pressed a key.
 *
 * Scheduling has to run ahead of the clock. Notes are scheduled about a
 * quarter of a second into the future against `ctx.currentTime`, not fired
 * from the game loop, because a dropped frame you can see is much better than
 * a dropped frame you can hear.
 */

import { SONGS, JINGLES } from './music.js';

const LOOKAHEAD = 0.25;
const MASTER_GAIN = 0.22;

/* Note name -> frequency. A4 = 440, twelve-tone equal temperament. */
const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteFreq(name) {
  if (!name || name === '-') return 0;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return 0;
  let n = SEMITONE[m[1]];
  if (m[2] === '#') n++;
  if (m[2] === 'b') n--;
  const octave = parseInt(m[3], 10);
  const midi = n + (octave + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createAudio(startMuted) {
  let ctx = null;
  let master = null;
  let muted = !!startMuted;
  let noiseBuffer = null;

  /* Music state */
  let song = null;
  let songName = null;
  let step = 0;
  let nextStepTime = 0;
  let stepDur = 0;
  let tempoScale = 1;
  let starUntil = 0;
  let resumeSong = null;
  let jingle = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_GAIN;
      master.connect(ctx.destination);
      noiseBuffer = makeNoise(ctx);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function makeNoise(c) {
    const len = c.sampleRate * 0.5;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    /* A short LFSR rather than Math.random: it gives the periodic, slightly
       pitched hiss a console noise channel had, instead of white static. */
    let reg = 0x7FFF;
    for (let i = 0; i < len; i++) {
      const bit = ((reg ^ (reg >> 1)) & 1);
      reg = (reg >> 1) | (bit << 14);
      data[i] = (reg & 1) ? 0.5 : -0.5;
    }
    return buf;
  }

  /* ---------------------------------------------------------------- *
   * One voice
   * ---------------------------------------------------------------- */

  function tone(opts) {
    const c = ensure();
    if (!c || muted) return;
    const t0 = opts.at || c.currentTime;
    const dur = opts.dur || 0.1;
    const gain = c.createGain();
    gain.connect(master);

    const peak = opts.gain === undefined ? 0.5 : opts.gain;
    /* A hard attack and an exponential tail. Linear ramps on a square wave
       sound like a fade; exponential ones sound like a chip. */
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + 0.005);
    if (opts.sustain) {
      gain.gain.setValueAtTime(Math.max(0.0001, peak), t0 + dur * 0.7);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    if (opts.wave === 'noise') {
      const src = c.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = opts.filter || 'highpass';
      filter.frequency.value = opts.cutoff || 800;
      src.connect(filter);
      filter.connect(gain);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
      return;
    }

    const osc = c.createOscillator();
    osc.type = opts.wave || 'square';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to) {
      /* Sweeps carry most of the character: the jump rises, the shrink
         falls, the fireball falls fast. */
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + dur);
    }
    if (opts.vibrato) {
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = opts.vibrato;
      depth.gain.value = opts.freq * 0.012;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur);
    }
    osc.connect(gain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /* ---------------------------------------------------------------- *
   * Sound effects
   * ---------------------------------------------------------------- */

  const SFX = {
    jump: () => tone({ wave: 'square', freq: 300, to: 660, dur: 0.16, gain: 0.32 }),
    jumpBig: () => tone({ wave: 'square', freq: 240, to: 620, dur: 0.22, gain: 0.34 }),
    stomp: () => {
      tone({ wave: 'square', freq: 500, to: 160, dur: 0.1, gain: 0.35 });
      tone({ wave: 'noise', cutoff: 1200, dur: 0.06, gain: 0.18 });
    },
    bump: () => tone({ wave: 'square', freq: 180, to: 120, dur: 0.08, gain: 0.3 }),
    coin: () => {
      const c = ensure(); if (!c) return;
      const t = c.currentTime;
      tone({ wave: 'square', freq: noteFreq('B5'), dur: 0.07, gain: 0.3, at: t });
      tone({ wave: 'square', freq: noteFreq('E6'), dur: 0.4, gain: 0.3, at: t + 0.07, sustain: true });
    },
    breakBlock: () => {
      tone({ wave: 'noise', cutoff: 700, dur: 0.22, gain: 0.3 });
      tone({ wave: 'square', freq: 400, to: 90, dur: 0.18, gain: 0.2 });
    },
    powerup: () => {
      const c = ensure(); if (!c) return;
      const seq = ['C5', 'G5', 'C6', 'E6', 'G6'];
      seq.forEach((n, i) => tone({
        wave: 'square', freq: noteFreq(n), dur: 0.1, gain: 0.28, at: c.currentTime + i * 0.06,
      }));
    },
    sprout: () => {
      const c = ensure(); if (!c) return;
      ['C4', 'E4', 'G4', 'C5'].forEach((n, i) => tone({
        wave: 'triangle', freq: noteFreq(n), dur: 0.12, gain: 0.3, at: c.currentTime + i * 0.05,
      }));
    },
    shrink: () => {
      const c = ensure(); if (!c) return;
      ['G5', 'E5', 'C5', 'G4'].forEach((n, i) => tone({
        wave: 'square', freq: noteFreq(n), dur: 0.11, gain: 0.28, at: c.currentTime + i * 0.06,
      }));
    },
    fire: () => tone({ wave: 'sawtooth', freq: 900, to: 200, dur: 0.13, gain: 0.22 }),
    kick: () => tone({ wave: 'square', freq: 220, to: 700, dur: 0.09, gain: 0.3 }),
    pipe: () => tone({ wave: 'square', freq: 500, to: 90, dur: 0.5, gain: 0.28 }),
    spring: () => tone({ wave: 'square', freq: 180, to: 900, dur: 0.25, gain: 0.3 }),
    swim: () => tone({ wave: 'triangle', freq: 420, to: 700, dur: 0.12, gain: 0.24 }),
    flagpole: () => {
      const c = ensure(); if (!c) return;
      for (let i = 0; i < 16; i++) {
        tone({
          wave: 'square', freq: noteFreq('C5') * Math.pow(2, i / 24),
          dur: 0.06, gain: 0.2, at: c.currentTime + i * 0.045,
        });
      }
    },
    bullet: () => tone({ wave: 'noise', cutoff: 400, filter: 'bandpass', dur: 0.3, gain: 0.14 }),
    bossFire: () => tone({ wave: 'sawtooth', freq: 260, to: 80, dur: 0.3, gain: 0.2 }),
    bossDown: () => {
      const c = ensure(); if (!c) return;
      tone({ wave: 'noise', cutoff: 300, dur: 0.7, gain: 0.3 });
      tone({ wave: 'square', freq: 300, to: 40, dur: 0.8, gain: 0.25 });
    },
    oneUp: () => {
      const c = ensure(); if (!c) return;
      ['E5', 'G5', 'E6', 'C6', 'D6', 'G6'].forEach((n, i) => tone({
        wave: 'square', freq: noteFreq(n), dur: 0.11, gain: 0.3, at: c.currentTime + i * 0.09,
      }));
    },
    pause: () => tone({ wave: 'square', freq: 660, dur: 0.12, gain: 0.25 }),
    select: () => tone({ wave: 'square', freq: 880, dur: 0.06, gain: 0.22 }),
    move: () => tone({ wave: 'square', freq: 520, dur: 0.04, gain: 0.16 }),
  };

  /* ---------------------------------------------------------------- *
   * The sequencer
   * ---------------------------------------------------------------- */

  function startSong(name, opts) {
    const s = SONGS[name] || JINGLES[name];
    if (!s) { song = null; return; }
    const c = ensure();
    song = s;
    songName = name;
    step = 0;
    stepDur = 60 / s.bpm / 4;             // one step is a sixteenth
    tempoScale = 1;
    nextStepTime = c ? c.currentTime + 0.06 : 0;
    jingle = opts && opts.jingle ? { after: opts.after || null } : null;
  }

  /*
   * Called once a frame. Schedules every step that falls inside the lookahead
   * window, which is what keeps the music steady across a stutter — the audio
   * clock is not the frame clock and must never be driven by it.
   */
  function tick() {
    if (!ctx || !song || muted) return;
    const now = ctx.currentTime;
    let guard = 0;
    while (nextStepTime < now + LOOKAHEAD && guard++ < 64) {
      scheduleStep(step, nextStepTime);
      nextStepTime += stepDur * tempoScale;
      step++;
      if (step >= song.length) {
        if (song.loop) {
          step = 0;
        } else {
          const after = jingle && jingle.after;
          song = null;
          songName = null;
          if (after) startSong(after, {});
          return;
        }
      }
    }
    if (starUntil && now > starUntil) {
      starUntil = 0;
      if (resumeSong) { startSong(resumeSong, {}); resumeSong = null; }
    }
  }

  function scheduleStep(i, when) {
    for (const track of song.tracks) {
      const cell = track.data[i % track.data.length];
      if (!cell || cell === '.') continue;      // '.' holds the previous note
      if (cell === '-') continue;               // '-' is a rest
      const dur = (track.dur || 1) * stepDur * tempoScale;
      if (track.wave === 'noise') {
        tone({
          wave: 'noise', dur: dur * 0.9, gain: (track.gain || 0.2),
          cutoff: cell === 'k' ? 200 : 2200, filter: cell === 'k' ? 'lowpass' : 'highpass',
          at: when,
        });
        continue;
      }
      const f = noteFreq(cell);
      if (!f) continue;
      tone({
        wave: track.wave || 'square',
        freq: f,
        dur: dur * (track.legato ? 1.0 : 0.85),
        gain: track.gain === undefined ? 0.16 : track.gain,
        at: when,
        sustain: !!track.sustain,
      });
    }
  }

  /* ---------------------------------------------------------------- *
   * Public face
   * ---------------------------------------------------------------- */

  return {
    /* Called from the first real input event; without it nothing sounds. */
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },
    tick,
    sfx(name) {
      if (muted) return;
      const fn = SFX[name];
      if (fn) fn();
    },
    playMusic(name) {
      if (songName === name && song) return;
      resumeSong = null;
      starUntil = 0;
      startSong(name, {});
    },
    /* A jingle stops the music, plays once, and hands back to `after`. */
    playJingle(name, after) {
      startSong(name, { jingle: true, after });
    },
    stopMusic() { song = null; songName = null; },
    /* Star power swaps the track and swaps back when it runs out. */
    starMusic(frames) {
      const c = ensure();
      if (!c) return;
      if (!starUntil) resumeSong = songName;
      starUntil = c.currentTime + frames / 60;
      startSong('star', {});
    },
    /* Under 100 on the clock the same song plays faster, which is the oldest
       tension trick in the medium and still the best one. */
    hurry() {
      tempoScale = 0.78;
      this.sfx('pause');
    },
    setMuted(v) {
      muted = !!v;
      if (master) master.gain.value = muted ? 0 : MASTER_GAIN;
      if (muted) { song = null; songName = null; }
    },
    get muted() { return muted; },
    get current() { return songName; },
  };
}
