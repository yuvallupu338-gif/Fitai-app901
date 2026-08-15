import { EventBus } from '../core/EventBus';
import { AudioManager, Voice } from './AudioManager';

export type Ambience = 'none' | 'outside' | 'lobby' | 'corridor' | 'apartment' | 'elevator' | 'control';

export interface TensionInputs {
  /** 0..1 how lit the player's position is. */
  brightness: number;
  /** Metres to the mimic, or Infinity when it is not present. */
  mimicDistance: number;
  mimicVisible: boolean;
  inElevator: boolean;
  /** Small closed rooms wind the player up faster than the open corridor. */
  enclosed: boolean;
  /** Seconds the player has not moved. */
  idleTime: number;
  watchingScreen: boolean;
  chaseActive: boolean;
  /** Seconds since the last anomaly or story beat. */
  quietTime: number;
}

/**
 * A hidden 0..100 tension value. Nothing on screen shows it; it drives the
 * music layers, the fluorescent noise, the grain, the breathing and how often
 * the anomaly director is allowed to fire.
 */
export class TensionSystem {
  private tension = 12;
  private lastReported = -1;
  private breathTimer = 6;
  private heartTimer = 0;
  private layers: { low: Voice | null; mid: Voice | null; high: Voice | null } = {
    low: null,
    mid: null,
    high: null,
  };
  private hum: Voice | null = null;
  private ambienceVoices: Voice[] = [];
  private ambience: Ambience = 'none';
  private reducedScares = false;

  constructor(private readonly audio: AudioManager, private readonly bus: EventBus) {}

  get value(): number {
    return this.tension;
  }

  /** 0..1 */
  get normalized(): number {
    return this.tension / 100;
  }

  setReducedScares(reduced: boolean): void {
    this.reducedScares = reduced;
  }

  reset(value = 12): void {
    this.tension = value;
  }

  add(amount: number): void {
    this.tension = Math.max(0, Math.min(100, this.tension + amount));
  }

  startLayers(): void {
    if (!this.audio.ready) return;
    this.layers.low ??= this.audio.play('drone_low', { loop: true, volume: 0.25, bus: 'music' });
    this.layers.mid ??= this.audio.play('drone_mid', { loop: true, volume: 0, bus: 'music' });
    this.layers.high ??= this.audio.play('drone_high', { loop: true, volume: 0, bus: 'music' });
  }

  stopLayers(): void {
    this.layers.low?.stop(0.6);
    this.layers.mid?.stop(0.6);
    this.layers.high?.stop(0.6);
    this.layers = { low: null, mid: null, high: null };
    this.hum?.stop(0.4);
    this.hum = null;
    for (const voice of this.ambienceVoices) voice.stop(0.6);
    this.ambienceVoices = [];
    this.ambience = 'none';
  }

  setAmbience(kind: Ambience): void {
    if (this.ambience === kind) return;
    this.ambience = kind;
    for (const voice of this.ambienceVoices) voice.stop(0.8);
    this.ambienceVoices = [];
    if (!this.audio.ready) return;

    switch (kind) {
      case 'outside':
        this.ambienceVoices.push(this.audio.play('rain', { loop: true, volume: 0.9 })!);
        this.ambienceVoices.push(this.audio.play('wind', { loop: true, volume: 0.5 })!);
        break;
      case 'lobby':
        this.ambienceVoices.push(this.audio.play('rain', { loop: true, volume: 0.22 })!);
        this.ambienceVoices.push(this.audio.play('wind', { loop: true, volume: 0.3 })!);
        break;
      case 'corridor':
        this.ambienceVoices.push(this.audio.play('wind', { loop: true, volume: 0.18 })!);
        break;
      case 'apartment':
      case 'control':
        this.ambienceVoices.push(this.audio.play('wind', { loop: true, volume: 0.1 })!);
        break;
      default:
        break;
    }
    this.ambienceVoices = this.ambienceVoices.filter(Boolean);
  }

  /** Global fluorescent hum whose level tracks the lighting near the player. */
  private updateHum(brightness: number): void {
    if (!this.audio.ready) return;
    if (!this.hum) this.hum = this.audio.play('fluorescent', { loop: true, volume: 0 });
    const noiseBoost = 1 + this.normalized * 1.9;
    this.hum?.setVolume(Math.min(1.6, brightness * 0.85 * noiseBoost), 0.4);
  }

  update(delta: number, inputs: TensionInputs): void {
    let rate = 0;

    if (inputs.brightness < 0.25) rate += 3.4 * (1 - inputs.brightness / 0.25);
    if (inputs.mimicDistance < 12) rate += (12 - inputs.mimicDistance) * 0.55;
    if (inputs.mimicVisible && inputs.mimicDistance < 18) rate += 4;
    if (inputs.enclosed) rate += 1.2;
    if (inputs.watchingScreen) rate += 1.8;
    if (inputs.idleTime > 8) rate += Math.min(3, (inputs.idleTime - 8) * 0.25);
    if (inputs.chaseActive) rate += 16;

    if (inputs.brightness > 0.6) rate -= 2.2;
    if (inputs.inElevator) rate -= 6;
    if (inputs.quietTime > 12) rate -= 1.6;
    if (!inputs.chaseActive && inputs.mimicDistance > 20) rate -= 1.4;

    // Always drift a little toward calm so tension has to be re-earned.
    rate -= 0.9;

    this.tension = Math.max(0, Math.min(100, this.tension + rate * delta));

    if (Math.abs(this.tension - this.lastReported) > 2) {
      this.lastReported = this.tension;
      this.bus.emit('tension_changed', { value: this.tension });
    }

    this.updateHum(inputs.brightness);

    const level = this.normalized;
    this.layers.low?.setVolume(0.22 + level * 0.5, 1.2);
    this.layers.mid?.setVolume(Math.max(0, level - 0.32) * 1.3, 1.6);
    this.layers.high?.setVolume(Math.max(0, level - 0.62) * 1.6, 1.6);

    // Breathing and heartbeat, both muted when the player asked for less.
    const scale = this.reducedScares ? 0.5 : 1;
    if (level > 0.45) {
      this.breathTimer -= delta * (0.6 + level);
      if (this.breathTimer <= 0) {
        this.breathTimer = 5.5 - level * 2.5;
        this.audio.play('breath', { volume: (level - 0.4) * 0.9 * scale, bus: 'voice' });
      }
    } else {
      this.breathTimer = 4;
    }

    if (inputs.chaseActive || (level > 0.8 && inputs.mimicDistance < 9)) {
      this.heartTimer -= delta;
      if (this.heartTimer <= 0) {
        this.heartTimer = 0.95 - Math.min(0.35, level * 0.35);
        this.audio.play('heartbeat', { volume: 0.55 * scale });
      }
    } else {
      this.heartTimer = 0;
    }
  }
}
