import * as THREE from 'three';
import { QualityLevel } from '../core/types';

export interface FixtureConfig {
  id: string;
  position: THREE.Vector3;
  color?: number;
  intensity?: number;
  distance?: number;
  /** Emissive tube/bulb mesh that dims with the light. */
  emissive?: THREE.Mesh;
  on?: boolean;
  /** Fixtures marked cosmetic never receive a real light, only glow. */
  cosmetic?: boolean;
}

interface Fixture extends Required<Omit<FixtureConfig, 'emissive'>> {
  emissive: THREE.Mesh | null;
  flickerTimer: number;
  flickerStrength: number;
  current: number;
  phase: number;
  baseColor: THREE.Color;
}

const POOL_SIZE: Record<QualityLevel, number> = { low: 3, medium: 5, high: 7 };

/**
 * Three.js uses physical light units, where a PointLight's intensity is in
 * candela and illuminance falls off as 1/d². Fixture intensities in this game
 * are authored as relative values around 1.0, so they are scaled by this before
 * reaching the renderer.
 */
const CANDELA_PER_UNIT = 3.4;

/**
 * Fluorescent lighting with a fixed budget of real lights. Fixtures are
 * cosmetic glowing tubes; the nearest few borrow an actual PointLight from a
 * pool, which keeps the shader cost constant however long the corridor gets.
 */
export class LightingManager {
  readonly ambient: THREE.AmbientLight;
  readonly hemisphere: THREE.HemisphereLight;
  private pool: THREE.PointLight[] = [];
  private fixtures: Fixture[] = [];
  private quality: QualityLevel = 'medium';
  private globalDim = 1;
  private emissiveBoost = 1;
  private blackoutTimer = 0;
  private sortScratch: Array<{ fixture: Fixture; distance: number }> = [];

  constructor(private readonly scene: THREE.Scene) {
    this.ambient = new THREE.AmbientLight(0x2a3038, 0.20);
    this.hemisphere = new THREE.HemisphereLight(0x39404a, 0x14161a, 0.12);
    scene.add(this.ambient);
    scene.add(this.hemisphere);
    this.setQuality('medium');
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    const wanted = POOL_SIZE[quality];
    while (this.pool.length > wanted) {
      const light = this.pool.pop();
      if (light) {
        light.removeFromParent();
        light.dispose();
      }
    }
    while (this.pool.length < wanted) {
      const light = new THREE.PointLight(0xdfe7ee, 0, 15, 1.25);
      light.castShadow = false;
      this.scene.add(light);
      this.pool.push(light);
    }
  }

  /** Emissive tubes are driven past white so the bloom pass has something to find. */
  setEmissiveBoost(boost: number): void {
    this.emissiveBoost = Math.max(1, boost);
  }

  setShadows(enabled: boolean): void {
    // Only the closest few lights cast: a point-light shadow is six faces, so
    // each one is expensive, and past three the corridor gains nothing.
    const casters = this.quality === 'high' ? 3 : this.quality === 'medium' ? 2 : 0;
    const resolution = this.quality === 'high' ? 1024 : 512;
    this.pool.forEach((light, index) => {
      const wants = enabled && index < casters;
      if (light.castShadow === wants) return;
      light.castShadow = wants;
      light.shadow.mapSize.set(resolution, resolution);
      // Thin trim (architraves, skirting) sits millimetres off the wall, so the
      // normal bias has to clear it or the casing bands with shadow acne.
      light.shadow.bias = -0.0012;
      light.shadow.normalBias = 0.09;
      light.shadow.camera.near = 0.04;
      light.shadow.camera.far = 14;
      light.shadow.needsUpdate = true;
    });
  }

  clearFixtures(): void {
    this.fixtures = [];
    for (const light of this.pool) light.intensity = 0;
  }

  addFixture(config: FixtureConfig): void {
    const color = config.color ?? 0xdfe7ee;
    this.fixtures.push({
      id: config.id,
      position: config.position.clone(),
      color,
      intensity: config.intensity ?? 1.35,
      distance: config.distance ?? 14,
      emissive: config.emissive ?? null,
      on: config.on ?? true,
      cosmetic: config.cosmetic ?? false,
      flickerTimer: 0,
      flickerStrength: 0,
      current: config.on === false ? 0 : 1,
      phase: Math.random() * Math.PI * 2,
      baseColor: new THREE.Color(color),
    });
  }

  has(id: string): boolean {
    return this.fixtures.some((f) => f.id === id);
  }

  setOn(id: string, on: boolean): void {
    for (const fixture of this.fixtures) {
      if (fixture.id === id || id === '*') fixture.on = on;
    }
  }

  isOn(id: string): boolean {
    return this.fixtures.find((f) => f.id === id)?.on ?? false;
  }

  flicker(id: string, duration = 1.2, strength = 1): void {
    for (const fixture of this.fixtures) {
      if (fixture.id === id || id === '*') {
        fixture.flickerTimer = Math.max(fixture.flickerTimer, duration);
        fixture.flickerStrength = strength;
      }
    }
  }

  /** Kill every light for a moment — used by the blackout scare. */
  blackout(duration: number): void {
    this.blackoutTimer = Math.max(this.blackoutTimer, duration);
  }

  get isBlackout(): boolean {
    return this.blackoutTimer > 0;
  }

  fixtureIds(): string[] {
    return this.fixtures.map((f) => f.id);
  }

  /** Nearest fixture id behind the player (used by "the light behind you goes out"). */
  fixtureBehind(position: THREE.Vector3, forward: THREE.Vector3): string | null {
    let best: string | null = null;
    let bestScore = Infinity;
    for (const fixture of this.fixtures) {
      if (!fixture.on) continue;
      const dx = fixture.position.x - position.x;
      const dz = fixture.position.z - position.z;
      const dot = dx * forward.x + dz * forward.z;
      if (dot > -0.6) continue; // must be behind
      const distance = Math.hypot(dx, dz);
      if (distance < 2 || distance > 16) continue;
      if (distance < bestScore) {
        bestScore = distance;
        best = fixture.id;
      }
    }
    return best;
  }

  /** 0..1 estimate of how lit a world position is; feeds the tension system. */
  brightnessAt(position: THREE.Vector3): number {
    if (this.blackoutTimer > 0) return 0;
    let total = 0;
    for (const fixture of this.fixtures) {
      if (!fixture.on || fixture.current < 0.05) continue;
      const distance = fixture.position.distanceTo(position);
      if (distance > fixture.distance) continue;
      total += fixture.current * (1 - distance / fixture.distance) * fixture.intensity;
    }
    return Math.max(0, Math.min(1, total / 1.6));
  }

  setGlobalDim(value: number): void {
    this.globalDim = Math.max(0, Math.min(1, value));
  }

  update(delta: number, viewer: THREE.Vector3, reduceFlashing: boolean): void {
    if (this.blackoutTimer > 0) this.blackoutTimer = Math.max(0, this.blackoutTimer - delta);
    const blackout = this.blackoutTimer > 0;

    for (const fixture of this.fixtures) {
      let target = fixture.on && !blackout ? 1 : 0;

      if (fixture.flickerTimer > 0) {
        fixture.flickerTimer = Math.max(0, fixture.flickerTimer - delta);
        if (!reduceFlashing) {
          const t = performance.now() * 0.001;
          const noise =
            Math.sin(t * 47 + fixture.phase) * 0.5 + Math.sin(t * 113 + fixture.phase * 2) * 0.5;
          target *= noise > 0.1 ? 1 : 0.08 + Math.max(0, noise) * 0.4;
        } else {
          target *= 0.72;
        }
      } else if (fixture.on && !blackout && !reduceFlashing) {
        // Constant, barely-there mains ripple.
        const t = performance.now() * 0.001;
        target *= 0.965 + Math.sin(t * 12.1 + fixture.phase) * 0.035;
      }

      const speed = fixture.flickerTimer > 0 ? 34 : 9;
      fixture.current += (target - fixture.current) * Math.min(1, delta * speed);

      if (fixture.emissive) {
        const material = fixture.emissive.material as THREE.MeshBasicMaterial;
        const level = 0.06 + fixture.current * 0.94;
        material.color.copy(fixture.baseColor).multiplyScalar(level * this.emissiveBoost);
      }
    }

    // Assign the pooled lights to the closest non-cosmetic fixtures.
    this.sortScratch.length = 0;
    for (const fixture of this.fixtures) {
      if (fixture.cosmetic) continue;
      this.sortScratch.push({ fixture, distance: fixture.position.distanceToSquared(viewer) });
    }
    this.sortScratch.sort((a, b) => a.distance - b.distance);

    for (let i = 0; i < this.pool.length; i++) {
      const light = this.pool[i];
      const entry = this.sortScratch[i];
      if (!entry) {
        light.intensity = 0;
        continue;
      }
      const { fixture } = entry;
      light.position.copy(fixture.position);
      light.color.copy(fixture.baseColor);
      light.distance = fixture.distance;
      light.intensity = fixture.current * fixture.intensity * this.globalDim * CANDELA_PER_UNIT;
    }
  }

  dispose(): void {
    for (const light of this.pool) {
      light.removeFromParent();
      light.dispose();
    }
    this.pool = [];
    this.fixtures = [];
    this.ambient.removeFromParent();
    this.hemisphere.removeFromParent();
  }
}
