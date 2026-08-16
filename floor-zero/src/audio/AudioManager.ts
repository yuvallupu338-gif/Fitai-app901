import * as THREE from 'three';
import { Settings } from '../core/types';

export type Bus = 'music' | 'sfx' | 'voice';

export interface PlayOptions {
  position?: THREE.Vector3;
  volume?: number;
  rate?: number;
  loop?: boolean;
  bus?: Bus;
  /** Max audible distance for positional sounds. */
  refDistance?: number;
}

export interface Voice {
  readonly id: number;
  readonly output: GainNode;
  readonly panner: PannerNode | null;
  readonly loop: boolean;
  position: THREE.Vector3 | null;
  occlusion: BiquadFilterNode | null;
  stop(fade?: number): void;
  setVolume(value: number, ramp?: number): void;
  alive: boolean;
}

export type SoundId =
  | 'fluorescent'
  | 'lift_motor'
  | 'lift_cable'
  | 'lift_door_open'
  | 'lift_door_close'
  | 'lift_bell'
  | 'door_wood_open'
  | 'door_wood_close'
  | 'door_metal_open'
  | 'door_metal_close'
  | 'shutter_open'
  | 'shutter_close'
  | 'step_terrazzo'
  | 'step_wood'
  | 'step_carpet'
  | 'step_metal'
  | 'knock'
  | 'wind'
  | 'rain'
  | 'tv_static'
  | 'tape_hiss'
  | 'phone'
  | 'breath'
  | 'camera_servo'
  | 'creak'
  | 'whisper'
  | 'stinger'
  | 'sub_drop'
  | 'switch'
  | 'button'
  | 'pickup'
  | 'paper'
  | 'clock_tick'
  | 'clock_lock'
  | 'toy_0'
  | 'toy_1'
  | 'toy_2'
  | 'toy_3'
  | 'heartbeat'
  | 'glitch'
  | 'thud'
  | 'chair_scrape'
  | 'drone_low'
  | 'drone_mid'
  | 'drone_high'
  | 'line_noise'
  | 'power_up'
  | 'power_down'
  | 'crawl'
  | 'shriek';

type Builder = (audio: AudioManager, ctx: AudioContext, out: AudioNode, opts: PlayOptions) => (() => void) | void;

/**
 * Every sound in the game is synthesised here at runtime. No audio files are
 * shipped, so there is nothing to license and nothing to download.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private compressor!: DynamicsCompressorNode;
  private buses!: Record<Bus, GainNode>;
  private noiseBuffer: AudioBuffer | null = null;
  private brownBuffer: AudioBuffer | null = null;
  private voices = new Map<number, Voice>();
  private nextId = 1;
  private settings: Settings | null = null;
  private listenerPosition = new THREE.Vector3();
  private occlusionTimer = 0;
  private started = false;
  private suspended = false;

  /** Injected by the game so positional sounds can be muffled through walls. */
  occlusionTest: ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | null = null;

  get ready(): boolean {
    return this.started && !!this.ctx;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Must be called from a user gesture — browsers block audio otherwise. */
  async init(): Promise<void> {
    if (this.started) {
      await this.resume();
      return;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      console.warn('[audio] Web Audio API unavailable — running silent');
      return;
    }
    const ctx = new Ctor();
    this.ctx = ctx;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 22;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.25;
    this.compressor.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.compressor);

    this.buses = {
      music: ctx.createGain(),
      sfx: ctx.createGain(),
      voice: ctx.createGain(),
    };
    for (const bus of Object.values(this.buses)) bus.connect(this.master);

    this.noiseBuffer = this.makeNoiseBuffer(2, 'white');
    this.brownBuffer = this.makeNoiseBuffer(3, 'brown');

    if (ctx.listener.forwardX) {
      ctx.listener.forwardX.value = 0;
      ctx.listener.forwardY.value = 0;
      ctx.listener.forwardZ.value = -1;
      ctx.listener.upX.value = 0;
      ctx.listener.upY.value = 1;
      ctx.listener.upZ.value = 0;
    }

    this.started = true;
    await this.resume();
    if (this.settings) this.applySettings(this.settings);
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* the browser will let us try again on the next gesture */
      }
    }
  }

  suspend(): void {
    if (!this.ctx || this.suspended) return;
    this.suspended = true;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  unsuspend(): void {
    if (!this.ctx || !this.suspended) return;
    this.suspended = false;
    this.applySettings(this.settings);
  }

  applySettings(settings: Settings | null): void {
    this.settings = settings;
    if (!this.ctx || !settings) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.suspended ? 0 : settings.masterVolume, now, 0.05);
    this.buses.music.gain.setTargetAtTime(settings.musicVolume, now, 0.05);
    this.buses.sfx.gain.setTargetAtTime(settings.sfxVolume, now, 0.05);
    this.buses.voice.gain.setTargetAtTime(settings.voiceVolume, now, 0.05);
  }

  private makeNoiseBuffer(seconds: number, kind: 'white' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (kind === 'white') {
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    } else {
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    return buffer;
  }

  noise(loop = true, kind: 'white' | 'brown' = 'white'): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = kind === 'white' ? this.noiseBuffer : this.brownBuffer;
    source.loop = loop;
    return source;
  }

  osc(type: OscillatorType, frequency: number): OscillatorNode {
    const oscillator = this.ctx!.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    return oscillator;
  }

  gain(value = 1): GainNode {
    const node = this.ctx!.createGain();
    node.gain.value = value;
    return node;
  }

  filter(type: BiquadFilterType, frequency: number, q = 1): BiquadFilterNode {
    const node = this.ctx!.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /* ---------------------------------------------------------------- */

  play(id: SoundId, options: PlayOptions = {}): Voice | null {
    if (!this.ctx || !this.started) return null;
    const build = SOUNDS[id];
    if (!build) return null;

    const ctx = this.ctx;
    const busName = options.bus ?? DEFAULT_BUS[id] ?? 'sfx';
    const output = this.gain(options.volume ?? 1);

    let panner: PannerNode | null = null;
    let occlusion: BiquadFilterNode | null = null;
    let tail: AudioNode = output;

    if (options.position) {
      occlusion = this.filter('lowpass', 20000, 0.7);
      panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = options.refDistance ?? 2.2;
      panner.maxDistance = 40;
      panner.rolloffFactor = 1.3;
      panner.positionX.value = options.position.x;
      panner.positionY.value = options.position.y;
      panner.positionZ.value = options.position.z;
      output.connect(occlusion);
      occlusion.connect(panner);
      tail = panner;
    }

    tail.connect(this.buses[busName]);

    const voiceId = this.nextId++;
    let stopFn: (() => void) | void;
    try {
      stopFn = build(this, ctx, output, options);
    } catch (error) {
      console.warn(`[audio] failed to build "${id}"`, error);
      output.disconnect();
      return null;
    }

    const voice: Voice = {
      id: voiceId,
      output,
      panner,
      occlusion,
      loop: options.loop ?? false,
      position: options.position ? options.position.clone() : null,
      alive: true,
      stop: (fade = 0.08) => {
        if (!voice.alive) return;
        voice.alive = false;
        const time = ctx.currentTime;
        try {
          output.gain.cancelScheduledValues(time);
          output.gain.setTargetAtTime(0, time, Math.max(0.01, fade / 3));
        } catch {
          /* node already torn down */
        }
        window.setTimeout(() => {
          try {
            stopFn?.();
          } catch {
            /* ignore */
          }
          try {
            output.disconnect();
            occlusion?.disconnect();
            panner?.disconnect();
          } catch {
            /* ignore */
          }
          this.voices.delete(voiceId);
        }, Math.max(60, fade * 1000 + 80));
      },
      setVolume: (value, ramp = 0.08) => {
        output.gain.setTargetAtTime(value, ctx.currentTime, Math.max(0.005, ramp / 3));
      },
    };

    this.voices.set(voiceId, voice);
    if (voice.position) this.applyOcclusion(voice);

    if (!options.loop) {
      const life = ONE_SHOT_LIFE[id] ?? 2.5;
      window.setTimeout(() => voice.stop(0.05), life * 1000);
    }
    return voice;
  }

  stop(voice: Voice | null | undefined, fade = 0.15): void {
    voice?.stop(fade);
  }

  stopAll(fade = 0.2): void {
    for (const voice of Array.from(this.voices.values())) voice.stop(fade);
  }

  moveVoice(voice: Voice | null, position: THREE.Vector3): void {
    if (!voice || !voice.panner) return;
    voice.position?.copy(position);
    voice.panner.positionX.value = position.x;
    voice.panner.positionY.value = position.y;
    voice.panner.positionZ.value = position.z;
  }

  private applyOcclusion(voice: Voice): void {
    if (!voice.occlusion || !voice.position || !this.occlusionTest || !this.ctx) return;
    const clear = this.occlusionTest(this.listenerPosition, voice.position);
    const target = clear ? 18000 : 780;
    voice.occlusion.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  updateListener(camera: THREE.Camera): void {
    if (!this.ctx) return;
    const listener = this.ctx.listener;
    camera.getWorldPosition(this.listenerPosition);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const time = this.ctx.currentTime;
    if (listener.positionX) {
      listener.positionX.setTargetAtTime(this.listenerPosition.x, time, 0.02);
      listener.positionY.setTargetAtTime(this.listenerPosition.y, time, 0.02);
      listener.positionZ.setTargetAtTime(this.listenerPosition.z, time, 0.02);
      listener.forwardX.setTargetAtTime(forward.x, time, 0.02);
      listener.forwardY.setTargetAtTime(forward.y, time, 0.02);
      listener.forwardZ.setTargetAtTime(forward.z, time, 0.02);
      listener.upX.setTargetAtTime(up.x, time, 0.02);
      listener.upY.setTargetAtTime(up.y, time, 0.02);
      listener.upZ.setTargetAtTime(up.z, time, 0.02);
    } else {
      const legacy = listener as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
      };
      legacy.setPosition(this.listenerPosition.x, this.listenerPosition.y, this.listenerPosition.z);
      legacy.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  update(delta: number): void {
    if (!this.ctx) return;
    this.occlusionTimer += delta;
    if (this.occlusionTimer < 0.25) return;
    this.occlusionTimer = 0;
    for (const voice of this.voices.values()) {
      if (voice.loop && voice.position) this.applyOcclusion(voice);
    }
  }

  dispose(): void {
    this.stopAll(0.05);
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.started = false;
  }

  get busNode(): Record<Bus, GainNode> {
    return this.buses;
  }
}

/* ------------------------------------------------------------------ */
/* Synthesis definitions                                               */
/* ------------------------------------------------------------------ */

const DEFAULT_BUS: Partial<Record<SoundId, Bus>> = {
  drone_low: 'music',
  drone_mid: 'music',
  drone_high: 'music',
  breath: 'voice',
  whisper: 'voice',
  line_noise: 'voice',
};

const ONE_SHOT_LIFE: Partial<Record<SoundId, number>> = {
  lift_bell: 2.5,
  lift_cable: 2.2,
  lift_door_open: 2.0,
  lift_door_close: 2.0,
  door_wood_open: 1.8,
  door_wood_close: 1.2,
  door_metal_open: 1.8,
  door_metal_close: 1.4,
  shutter_open: 2.2,
  shutter_close: 1.6,
  step_terrazzo: 0.5,
  step_wood: 0.5,
  step_carpet: 0.5,
  step_metal: 0.6,
  knock: 1.6,
  camera_servo: 1.2,
  creak: 2.4,
  stinger: 3.2,
  sub_drop: 3.0,
  switch: 0.4,
  button: 0.5,
  pickup: 0.8,
  paper: 1.0,
  clock_tick: 0.3,
  clock_lock: 1.2,
  toy_0: 1.6,
  toy_1: 1.6,
  toy_2: 1.6,
  toy_3: 1.6,
  heartbeat: 1.4,
  glitch: 0.9,
  thud: 1.4,
  chair_scrape: 1.4,
  breath: 2.4,
  power_up: 2.0,
  power_down: 1.6,
  phone: 4.2,
  crawl: 0.7,
  shriek: 2.6,
};

function impact(audio: AudioManager, ctx: AudioContext, out: AudioNode, freq: number, decay: number, gain = 0.6): void {
  const osc = audio.osc('sine', freq);
  const g = audio.gain(0);
  osc.connect(g);
  g.connect(out);
  const t = ctx.currentTime;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.4), t + decay);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.start(t);
  osc.stop(t + decay + 0.05);
}

function noiseBurst(
  audio: AudioManager,
  ctx: AudioContext,
  out: AudioNode,
  options: {
    type?: BiquadFilterType;
    freq: number;
    q?: number;
    attack?: number;
    decay: number;
    gain?: number;
    sweepTo?: number;
    kind?: 'white' | 'brown';
  },
): void {
  const source = audio.noise(true, options.kind ?? 'white');
  const band = audio.filter(options.type ?? 'bandpass', options.freq, options.q ?? 1.2);
  const g = audio.gain(0);
  source.connect(band);
  band.connect(g);
  g.connect(out);
  const t = ctx.currentTime;
  const attack = options.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(options.gain ?? 0.4, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + options.decay);
  if (options.sweepTo) {
    band.frequency.setValueAtTime(options.freq, t);
    band.frequency.exponentialRampToValueAtTime(Math.max(30, options.sweepTo), t + attack + options.decay);
  }
  source.start(t);
  source.stop(t + attack + options.decay + 0.05);
}

function bell(
  audio: AudioManager,
  ctx: AudioContext,
  out: AudioNode,
  partials: Array<[number, number]>,
  decay: number,
  gain = 0.3,
): void {
  const t = ctx.currentTime;
  for (const [freq, weight] of partials) {
    const osc = audio.osc('sine', freq);
    const g = audio.gain(0);
    osc.connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * weight, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay * (0.6 + weight * 0.6));
    osc.start(t);
    osc.stop(t + decay + 0.1);
  }
}

const SOUNDS: Record<SoundId, Builder> = {
  fluorescent: (audio, _ctx, out) => {
    const hum = audio.osc('sawtooth', 100);
    const hum2 = audio.osc('sine', 120);
    const band = audio.filter('bandpass', 340, 5);
    const hiss = audio.noise(true);
    const hissBand = audio.filter('bandpass', 5200, 3);
    const hissGain = audio.gain(0.02);
    const g = audio.gain(0.028);
    hum.connect(band);
    hum2.connect(band);
    band.connect(g);
    hiss.connect(hissBand);
    hissBand.connect(hissGain);
    hissGain.connect(out);
    g.connect(out);
    hum.start();
    hum2.start();
    hiss.start();
    return () => {
      hum.stop();
      hum2.stop();
      hiss.stop();
    };
  },

  lift_motor: (audio, _ctx, out) => {
    const low = audio.osc('sawtooth', 54);
    const sub = audio.osc('sine', 27);
    const lfo = audio.osc('sine', 5.5);
    const lfoGain = audio.gain(2.4);
    const lp = audio.filter('lowpass', 240, 1.1);
    const rumble = audio.noise(true, 'brown');
    const rumbleFilter = audio.filter('lowpass', 180, 0.8);
    const rumbleGain = audio.gain(0.16);
    const g = audio.gain(0.16);
    lfo.connect(lfoGain);
    lfoGain.connect(low.frequency);
    low.connect(lp);
    sub.connect(lp);
    lp.connect(g);
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(out);
    g.connect(out);
    low.start();
    sub.start();
    lfo.start();
    rumble.start();
    return () => {
      low.stop();
      sub.stop();
      lfo.stop();
      rumble.stop();
    };
  },

  lift_cable: (audio, ctx, out) => {
    noiseBurst(audio, ctx, out, { freq: 1800, q: 9, decay: 1.4, gain: 0.14, sweepTo: 620 });
    noiseBurst(audio, ctx, out, { freq: 3400, q: 14, decay: 0.9, gain: 0.08, sweepTo: 2100 });
    impact(audio, ctx, out, 70, 0.6, 0.22);
  },

  lift_door_open: (audio, ctx, out) => {
    noiseBurst(audio, ctx, out, { type: 'bandpass', freq: 900, q: 2.4, decay: 1.1, gain: 0.2, sweepTo: 1500 });
    impact(audio, ctx, out, 120, 0.25, 0.2);
  },

  lift_door_close: (audio, ctx, out) => {
    noiseBurst(audio, ctx, out, { type: 'bandpass', freq: 1400, q: 2.4, decay: 1.0, gain: 0.2, sweepTo: 700 });
    window.setTimeout(() => {
      try {
        impact(audio, ctx, out, 90, 0.3, 0.35);
      } catch {
        /* context closed */
      }
    }, 900);
  },

  lift_bell: (audio, ctx, out) => {
    bell(audio, ctx, out, [[880, 1], [1320, 0.4], [1760, 0.2]], 1.6, 0.16);
  },

  door_wood_open: (audio, ctx, out) => {
    const osc = audio.osc('sawtooth', 240);
    const band = audio.filter('bandpass', 900, 8);
    const g = audio.gain(0);
    osc.connect(band);
    band.connect(g);
    g.connect(out);
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(210, t);
    osc.frequency.linearRampToValueAtTime(340, t + 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.start(t);
    osc.stop(t + 1.2);
    noiseBurst(audio, ctx, out, { freq: 2200, q: 3, decay: 0.5, gain: 0.05 });
  },

  door_wood_close: (audio, ctx, out) => {
    impact(audio, ctx, out, 110, 0.35, 0.5);
    noiseBurst(audio, ctx, out, { freq: 1400, q: 2, decay: 0.18, gain: 0.16 });
  },

  door_metal_open: (audio, ctx, out) => {
    noiseBurst(audio, ctx, out, { freq: 2600, q: 7, decay: 1.0, gain: 0.13, sweepTo: 1100 });
    impact(audio, ctx, out, 140, 0.3, 0.22);
  },

  door_metal_close: (audio, ctx, out) => {
    impact(audio, ctx, out, 95, 0.45, 0.55);
    noiseBurst(audio, ctx, out, { freq: 3200, q: 5, decay: 0.6, gain: 0.18, sweepTo: 1600 });
  },

  shutter_open: (audio, ctx, out) => {
    noiseBurst(audio, ctx, out, { freq: 1200, q: 1.6, decay: 1.5, gain: 0.22, sweepTo: 2600 });
    impact(audio, ctx, out, 150, 0.3, 0.25);
  },

  shutter_close: (audio, ctx, out) => {
    noiseBurst(audio, ctx, out, { freq: 2400, q: 1.8, decay: 0.9, gain: 0.24, sweepTo: 800 });
    window.setTimeout(() => {
      try {
        impact(audio, ctx, out, 70, 0.5, 0.7);
      } catch {
        /* ignore */
      }
    }, 700);
  },

  step_terrazzo: (audio, ctx, out, opts) => {
    const rate = opts.rate ?? 1;
    noiseBurst(audio, ctx, out, { freq: 1700 * rate, q: 1.6, decay: 0.09, gain: 0.16 });
    impact(audio, ctx, out, 150 * rate, 0.07, 0.12);
  },
  step_wood: (audio, ctx, out, opts) => {
    const rate = opts.rate ?? 1;
    noiseBurst(audio, ctx, out, { freq: 900 * rate, q: 1.2, decay: 0.11, gain: 0.14 });
    impact(audio, ctx, out, 110 * rate, 0.1, 0.14);
  },
  step_carpet: (audio, ctx, out, opts) => {
    const rate = opts.rate ?? 1;
    noiseBurst(audio, ctx, out, { freq: 480 * rate, q: 0.9, decay: 0.13, gain: 0.09 });
  },
  step_metal: (audio, ctx, out, opts) => {
    const rate = opts.rate ?? 1;
    noiseBurst(audio, ctx, out, { freq: 3200 * rate, q: 4, decay: 0.16, gain: 0.13 });
    impact(audio, ctx, out, 190 * rate, 0.09, 0.1);
  },

  knock: (audio, ctx, out) => {
    for (let i = 0; i < 3; i++) {
      window.setTimeout(() => {
        try {
          impact(audio, ctx, out, 130 - i * 6, 0.16, 0.5);
          noiseBurst(audio, ctx, out, { freq: 900, q: 2.2, decay: 0.12, gain: 0.18 });
        } catch {
          /* ignore */
        }
      }, i * 260);
    }
  },

  wind: (audio, _ctx, out) => {
    const source = audio.noise(true, 'brown');
    const lp = audio.filter('lowpass', 420, 0.7);
    const lfo = audio.osc('sine', 0.11);
    const lfoGain = audio.gain(170);
    const g = audio.gain(0.09);
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    source.connect(lp);
    lp.connect(g);
    g.connect(out);
    source.start();
    lfo.start();
    return () => {
      source.stop();
      lfo.stop();
    };
  },

  rain: (audio, _ctx, out) => {
    const source = audio.noise(true);
    const hp = audio.filter('highpass', 900, 0.6);
    const lp = audio.filter('lowpass', 6500, 0.5);
    const lfo = audio.osc('sine', 0.23);
    const lfoGain = audio.gain(0.03);
    const g = audio.gain(0.1);
    source.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    g.connect(out);
    source.start();
    lfo.start();
    return () => {
      source.stop();
      lfo.stop();
    };
  },

  tv_static: (audio, _ctx, out) => {
    const source = audio.noise(true);
    const bp = audio.filter('bandpass', 3200, 0.8);
    const g = audio.gain(0.06);
    source.connect(bp);
    bp.connect(g);
    g.connect(out);
    source.start();
    return () => source.stop();
  },

  tape_hiss: (audio, _ctx, out) => {
    const source = audio.noise(true);
    const hp = audio.filter('highpass', 2400, 0.5);
    const lp = audio.filter('lowpass', 7200, 0.6);
    const wobble = audio.osc('sine', 3.1);
    const wobbleGain = audio.gain(0.012);
    const g = audio.gain(0.05);
    source.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    wobble.connect(wobbleGain);
    wobbleGain.connect(g.gain);
    g.connect(out);
    source.start();
    wobble.start();
    return () => {
      source.stop();
      wobble.stop();
    };
  },

  phone: (audio, ctx, out) => {
    const tone = audio.osc('sine', 425);
    const tone2 = audio.osc('sine', 452);
    const g = audio.gain(0);
    tone.connect(g);
    tone2.connect(g);
    g.connect(out);
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const on = t + i * 1.05;
      g.gain.setValueAtTime(0.0001, on);
      g.gain.exponentialRampToValueAtTime(0.11, on + 0.02);
      g.gain.setValueAtTime(0.11, on + 0.42);
      g.gain.exponentialRampToValueAtTime(0.0001, on + 0.5);
    }
    tone.start(t);
    tone2.start(t);
    tone.stop(t + 4.4);
    tone2.stop(t + 4.4);
  },

  breath: (audio, ctx, out) => {
    const source = audio.noise(true);
    const bp = audio.filter('bandpass', 620, 1.4);
    const g = audio.gain(0);
    source.connect(bp);
    bp.connect(g);
    g.connect(out);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    g.gain.exponentialRampToValueAtTime(0.04, t + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    bp.frequency.setValueAtTime(560, t);
    bp.frequency.linearRampToValueAtTime(760, t + 1.1);
    bp.frequency.linearRampToValueAtTime(520, t + 2.3);
    source.start(t);
    source.stop(t + 2.4);
  },

  camera_servo: (audio, ctx, out) => {
    const osc = audio.osc('square', 62);
    const lp = audio.filter('lowpass', 900, 1);
    const g = audio.gain(0);
    osc.connect(lp);
    lp.connect(g);
    g.connect(out);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.04);
    g.gain.setValueAtTime(0.05, t + 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.start(t);
    osc.stop(t + 1);
  },

  creak: (audio, ctx, out) => {
    const osc = audio.osc('sawtooth', 160);
    const bp = audio.filter('bandpass', 1100, 12);
    const g = audio.gain(0);
    osc.connect(bp);
    bp.connect(g);
    g.connect(out);
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.linearRampToValueAtTime(280, t + 1.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
    osc.start(t);
    osc.stop(t + 2.1);
  },

  whisper: (audio, _ctx, out) => {
    const source = audio.noise(true);
    const g = audio.gain(0.05);
    const formants: BiquadFilterNode[] = [];
    for (const [freq, q] of [
      [620, 9],
      [1180, 11],
      [2560, 13],
    ] as Array<[number, number]>) {
      const f = audio.filter('bandpass', freq, q);
      source.connect(f);
      f.connect(g);
      formants.push(f);
    }
    const lfo = audio.osc('sine', 3.7);
    const lfoGain = audio.gain(120);
    lfo.connect(lfoGain);
    lfoGain.connect(formants[1].frequency);
    const amp = audio.osc('sine', 2.3);
    const ampGain = audio.gain(0.03);
    amp.connect(ampGain);
    ampGain.connect(g.gain);
    g.connect(out);
    source.start();
    lfo.start();
    amp.start();
    return () => {
      source.stop();
      lfo.stop();
      amp.stop();
    };
  },

  stinger: (audio, ctx, out) => {
    const t = ctx.currentTime;
    const swell = audio.noise(true, 'brown');
    const bp = audio.filter('bandpass', 220, 1.4);
    const swellGain = audio.gain(0.0001);
    swell.connect(bp);
    bp.connect(swellGain);
    swellGain.connect(out);
    swellGain.gain.setValueAtTime(0.0001, t);
    swellGain.gain.exponentialRampToValueAtTime(0.42, t + 0.09);
    swellGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    bp.frequency.setValueAtTime(2200, t);
    bp.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    swell.start(t);
    swell.stop(t + 2.0);
    impact(audio, ctx, out, 62, 1.5, 0.6);
  },

  sub_drop: (audio, ctx, out) => {
    const osc = audio.osc('sine', 90);
    const g = audio.gain(0);
    osc.connect(g);
    g.connect(out);
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(26, t + 2.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    osc.start(t);
    osc.stop(t + 2.7);
  },

  switch: (audio, ctx, out) => {
    noiseBurst(audio, ctx, out, { freq: 4200, q: 2, decay: 0.05, gain: 0.22 });
    impact(audio, ctx, out, 380, 0.05, 0.14);
  },

  button: (audio, ctx, out) => {
    noiseBurst(audio, ctx, out, { freq: 3000, q: 3, decay: 0.04, gain: 0.14 });
    bell(audio, ctx, out, [[1180, 1]], 0.22, 0.07);
  },

  pickup: (audio, ctx, out) => {
    noiseBurst(audio, ctx, out, { freq: 2400, q: 1.1, decay: 0.28, gain: 0.11, sweepTo: 4200 });
  },

  paper: (audio, ctx, out) => {
    for (let i = 0; i < 3; i++) {
      window.setTimeout(() => {
        try {
          noiseBurst(audio, ctx, out, { type: 'highpass', freq: 3400, decay: 0.14, gain: 0.09 });
        } catch {
          /* ignore */
        }
      }, i * 130);
    }
  },

  clock_tick: (audio, ctx, out) => {
    noiseBurst(audio, ctx, out, { freq: 5200, q: 6, decay: 0.035, gain: 0.13 });
  },

  clock_lock: (audio, ctx, out) => {
    impact(audio, ctx, out, 190, 0.28, 0.32);
    bell(audio, ctx, out, [[520, 1], [780, 0.5]], 0.9, 0.1);
  },

  toy_0: (audio, ctx, out) => bell(audio, ctx, out, [[523.25, 1], [1046.5, 0.35]], 1.1, 0.16),
  toy_1: (audio, ctx, out) => bell(audio, ctx, out, [[659.25, 1], [1318.5, 0.35]], 1.1, 0.16),
  toy_2: (audio, ctx, out) => bell(audio, ctx, out, [[783.99, 1], [1568, 0.35]], 1.1, 0.16),
  toy_3: (audio, ctx, out) => bell(audio, ctx, out, [[987.77, 1], [1975.5, 0.35]], 1.1, 0.16),

  heartbeat: (audio, ctx, out) => {
    impact(audio, ctx, out, 58, 0.24, 0.42);
    window.setTimeout(() => {
      try {
        impact(audio, ctx, out, 50, 0.3, 0.3);
      } catch {
        /* ignore */
      }
    }, 260);
  },

  glitch: (audio, ctx, out) => {
    const source = audio.noise(true);
    const bp = audio.filter('bandpass', 1800, 0.8);
    const g = audio.gain(0);
    source.connect(bp);
    bp.connect(g);
    g.connect(out);
    const t = ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const at = t + i * 0.045;
      g.gain.setValueAtTime(i % 2 === 0 ? 0.18 : 0.0001, at);
      bp.frequency.setValueAtTime(600 + Math.random() * 4200, at);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    source.start(t);
    source.stop(t + 0.5);
  },

  thud: (audio, ctx, out) => {
    impact(audio, ctx, out, 74, 0.5, 0.6);
    noiseBurst(audio, ctx, out, { type: 'lowpass', freq: 420, decay: 0.3, gain: 0.2 });
  },

  chair_scrape: (audio, ctx, out) => {
    noiseBurst(audio, ctx, out, { freq: 1500, q: 5, decay: 0.85, gain: 0.15, sweepTo: 700 });
  },

  drone_low: (audio, _ctx, out) => {
    const a = audio.osc('sine', 41.2);
    const b = audio.osc('sine', 61.7);
    const lp = audio.filter('lowpass', 220, 0.9);
    const g = audio.gain(0.14);
    a.connect(lp);
    b.connect(lp);
    lp.connect(g);
    g.connect(out);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  },

  drone_mid: (audio, _ctx, out) => {
    const a = audio.osc('sawtooth', 82.4);
    const lp = audio.filter('lowpass', 620, 3.5);
    const lfo = audio.osc('sine', 0.07);
    const lfoGain = audio.gain(240);
    const g = audio.gain(0.05);
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    a.connect(lp);
    lp.connect(g);
    g.connect(out);
    a.start();
    lfo.start();
    return () => {
      a.stop();
      lfo.stop();
    };
  },

  drone_high: (audio, _ctx, out) => {
    const a = audio.osc('sine', 987.8);
    const b = audio.osc('sine', 991.3);
    const g = audio.gain(0.014);
    const lp = audio.filter('lowpass', 2400, 0.7);
    a.connect(lp);
    b.connect(lp);
    lp.connect(g);
    g.connect(out);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  },

  line_noise: (audio, _ctx, out) => {
    const source = audio.noise(true);
    const bp = audio.filter('bandpass', 1400, 1.8);
    const hp = audio.filter('highpass', 380, 0.7);
    const g = audio.gain(0.05);
    source.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    g.connect(out);
    source.start();
    return () => source.stop();
  },

  power_up: (audio, ctx, out) => {
    const osc = audio.osc('sawtooth', 40);
    const lp = audio.filter('lowpass', 300, 2);
    const g = audio.gain(0);
    osc.connect(lp);
    lp.connect(g);
    g.connect(out);
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(30, t);
    osc.frequency.exponentialRampToValueAtTime(118, t + 1.1);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 1.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    osc.start(t);
    osc.stop(t + 1.8);
    bell(audio, ctx, out, [[660, 1], [990, 0.4]], 0.7, 0.07);
  },

  power_down: (audio, ctx, out) => {
    const osc = audio.osc('sawtooth', 120);
    const lp = audio.filter('lowpass', 2400, 2);
    const g = audio.gain(0);
    osc.connect(lp);
    lp.connect(g);
    g.connect(out);
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(118, t);
    osc.frequency.exponentialRampToValueAtTime(24, t + 1.2);
    lp.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    osc.start(t);
    osc.stop(t + 1.5);
  },

  /** Chitin on terrazzo: a dry scrape with a hard tick under it. */
  crawl: (audio, ctx, out) => {
    const source = audio.noise();
    const bp = audio.filter('bandpass', 2600, 2.2);
    const hp = audio.filter('highpass', 900, 0.7);
    const g = audio.gain(0);
    source.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(out);
    const t = ctx.currentTime;
    bp.frequency.setValueAtTime(3400, t);
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.22);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    source.start(t);
    source.stop(t + 0.36);

    // The claw that lands after the drag.
    const tick = audio.osc('square', 180);
    const tickGain = audio.gain(0);
    const tickLp = audio.filter('lowpass', 1800, 1);
    tick.connect(tickLp);
    tickLp.connect(tickGain);
    tickGain.connect(out);
    tick.frequency.setValueAtTime(210, t + 0.16);
    tick.frequency.exponentialRampToValueAtTime(70, t + 0.26);
    tickGain.gain.setValueAtTime(0.0001, t + 0.16);
    tickGain.gain.exponentialRampToValueAtTime(0.05, t + 0.18);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    tick.start(t + 0.16);
    tick.stop(t + 0.36);
  },

  /** Not a scream — an inhale run backwards, with the throat in the wrong place. */
  shriek: (audio, ctx, out) => {
    const t = ctx.currentTime;
    const source = audio.noise(true);
    const formant = audio.filter('bandpass', 900, 7);
    const shape = audio.filter('highpass', 300, 0.8);
    const g = audio.gain(0);
    source.connect(formant);
    formant.connect(shape);
    shape.connect(g);
    g.connect(out);
    formant.frequency.setValueAtTime(420, t);
    formant.frequency.exponentialRampToValueAtTime(2600, t + 0.9);
    formant.frequency.exponentialRampToValueAtTime(600, t + 2.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    source.start(t);
    source.stop(t + 2.4);

    // A detuned pair underneath so it reads as a throat rather than as noise.
    for (const base of [143, 149]) {
      const osc = audio.osc('sawtooth', base);
      const lp = audio.filter('lowpass', 1400, 3);
      const og = audio.gain(0);
      osc.connect(lp);
      lp.connect(og);
      og.connect(out);
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 2.6, t + 0.85);
      osc.frequency.exponentialRampToValueAtTime(base * 0.6, t + 2.1);
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.035, t + 0.45);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      osc.start(t);
      osc.stop(t + 2.4);
    }
  },
};
