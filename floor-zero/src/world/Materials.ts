import * as THREE from 'three';
import { QualityLevel } from '../core/types';
import {
  carpetTexture,
  ceilingTexture,
  concreteTexture,
  elevatorMetalTexture,
  metalDoorTexture,
  normalFromTexture,
  roughnessFromTexture,
  terrazzoTexture,
  tileWallTexture,
  wallTexture,
  woodDoorTexture,
  woodFloorTexture,
} from './Textures';

export type MaterialKey =
  | 'wall'
  | 'wallDim'
  | 'floor'
  | 'ceiling'
  | 'concrete'
  | 'tile'
  | 'wood'
  | 'carpet'
  | 'doorWood'
  | 'doorMetal'
  | 'elevator'
  | 'metal'
  | 'darkMetal'
  | 'plastic'
  | 'rubber'
  | 'skirting'
  | 'glassDark'
  | 'paper'
  | 'fabric';

interface SurfaceSpec {
  key: MaterialKey;
  /** Base colour texture, or null for an untextured surface. */
  texture: THREE.CanvasTexture | null;
  color?: number;
  roughness: number;
  metalness: number;
  /** Height-to-normal strength; 0 skips the normal map entirely. */
  bump?: number;
  /** Roughness map range as [dark, light]; omitted uses the flat value. */
  roughnessRange?: [number, number];
  envIntensity?: number;
}

/**
 * Surfaces are physically based: every textured material gets a normal map and
 * a roughness map derived from its own diffuse, so the corridor reacts to the
 * fluorescent tubes instead of being evenly washed.
 *
 * On the low quality tier the whole library falls back to MeshLambertMaterial
 * with no derived maps, which is roughly a third of the fragment cost.
 */
export class MaterialLibrary {
  private materials = new Map<string, THREE.Material>();
  private textures: THREE.Texture[] = [];

  constructor(readonly quality: QualityLevel = 'medium') {
    const physical = quality !== 'low';
    const detail = quality === 'high' ? 1 : 0.75;

    const specs: SurfaceSpec[] = [
      {
        key: 'wall',
        texture: this.track(wallTexture(7)),
        roughness: 0.92,
        metalness: 0,
        bump: 1.5 * detail,
        roughnessRange: [0.97, 0.78],
      },
      {
        key: 'wallDim',
        texture: this.track(wallTexture(7)),
        color: 0xa9a496,
        roughness: 0.94,
        metalness: 0,
        bump: 1.5 * detail,
      },
      {
        key: 'floor',
        texture: this.track(terrazzoTexture(11)),
        // Polished terrazzo: the chips catch the light, the grout does not.
        roughness: 0.42,
        metalness: 0.04,
        bump: 1.1 * detail,
        roughnessRange: [0.72, 0.24],
        envIntensity: 0.30,
      },
      {
        key: 'ceiling',
        texture: this.track(ceilingTexture(23)),
        color: 0xe8e6df,
        roughness: 0.95,
        metalness: 0,
        bump: 0.45 * detail,
      },
      {
        key: 'concrete',
        texture: this.track(concreteTexture(31)),
        roughness: 0.96,
        metalness: 0,
        bump: 1.9 * detail,
      },
      {
        key: 'tile',
        texture: this.track(tileWallTexture(41)),
        roughness: 0.35,
        metalness: 0.03,
        bump: 2.4 * detail,
        roughnessRange: [0.68, 0.2],
        envIntensity: 0.28,
      },
      {
        key: 'wood',
        texture: this.track(woodFloorTexture(53)),
        roughness: 0.62,
        metalness: 0,
        bump: 1.2 * detail,
        roughnessRange: [0.82, 0.46],
        envIntensity: 0.16,
      },
      {
        key: 'carpet',
        texture: this.track(carpetTexture(61)),
        roughness: 1,
        metalness: 0,
        bump: 2.6 * detail,
        envIntensity: 0.03,
      },
      {
        key: 'doorWood',
        texture: this.track(woodDoorTexture(67)),
        roughness: 0.58,
        metalness: 0,
        bump: 1.6 * detail,
        roughnessRange: [0.78, 0.42],
        envIntensity: 0.16,
      },
      {
        key: 'doorMetal',
        texture: this.track(metalDoorTexture(71)),
        roughness: 0.52,
        metalness: 0.72,
        bump: 1.4 * detail,
        roughnessRange: [0.74, 0.36],
        envIntensity: 0.40,
      },
      {
        key: 'elevator',
        texture: this.track(elevatorMetalTexture(79)),
        roughness: 0.34,
        metalness: 0.85,
        bump: 1.0 * detail,
        roughnessRange: [0.55, 0.22],
        envIntensity: 0.45,
      },
      { key: 'metal', texture: null, color: 0x9aa0a5, roughness: 0.38, metalness: 0.8, envIntensity: 1 },
      { key: 'darkMetal', texture: null, color: 0x3d4247, roughness: 0.46, metalness: 0.75, envIntensity: 0.9 },
      { key: 'plastic', texture: null, color: 0x2f5d7a, roughness: 0.45, metalness: 0 , envIntensity: 0.5 },
      { key: 'rubber', texture: null, color: 0x22262a, roughness: 0.95, metalness: 0 },
      { key: 'skirting', texture: null, color: 0x6d6455, roughness: 0.66, metalness: 0, envIntensity: 0.3 },
      { key: 'glassDark', texture: null, color: 0x11161c, roughness: 0.12, metalness: 0.2, envIntensity: 1 },
      { key: 'paper', texture: null, color: 0xe6e0cc, roughness: 0.94, metalness: 0 },
      { key: 'fabric', texture: null, color: 0x6b5a49, roughness: 1, metalness: 0, envIntensity: 0.1 },
    ];

    for (const spec of specs) {
      this.materials.set(spec.key, physical ? this.buildStandard(spec) : this.buildLambert(spec));
    }
  }

  private buildStandard(spec: SurfaceSpec): THREE.Material {
    const material = new THREE.MeshStandardMaterial({
      map: spec.texture ?? null,
      color: spec.color ?? 0xffffff,
      roughness: spec.roughness,
      metalness: spec.metalness,
      envMapIntensity: spec.envIntensity ?? 0.18,
    });

    if (spec.texture && spec.bump && spec.bump > 0.01) {
      material.normalMap = this.track(normalFromTexture(spec.texture, spec.bump));
      material.normalScale = new THREE.Vector2(1, 1);
    }
    if (spec.texture && spec.roughnessRange) {
      material.roughnessMap = this.track(
        roughnessFromTexture(spec.texture, spec.roughnessRange[0], spec.roughnessRange[1]),
      );
    }
    return material;
  }

  private buildLambert(spec: SurfaceSpec): THREE.Material {
    return new THREE.MeshLambertMaterial({
      map: spec.texture ?? null,
      color: spec.color ?? 0xffffff,
    });
  }

  private track<T extends THREE.Texture>(texture: T): T {
    this.textures.push(texture);
    return texture;
  }

  get(key: MaterialKey): THREE.Material {
    const material = this.materials.get(key);
    if (!material) throw new Error(`Unknown material "${key}"`);
    return material;
  }

  /** Register an ad-hoc material (per-level props) so it gets disposed. */
  register(key: string, material: THREE.Material): THREE.Material {
    this.materials.set(key, material);
    return material;
  }

  registerTexture<T extends THREE.Texture>(texture: T): T {
    return this.track(texture);
  }

  /**
   * How far emissive surfaces overdrive past white. Above 1 they feed the bloom
   * pass; on the low tier there is no bloom, so they must stay in range.
   */
  get emissiveBoost(): number {
    return this.quality === 'low' ? 1 : 3.2;
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.materials.clear();
    this.textures = [];
  }
}
