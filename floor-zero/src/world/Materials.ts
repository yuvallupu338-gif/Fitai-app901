import * as THREE from 'three';
import {
  carpetTexture,
  ceilingTexture,
  concreteTexture,
  elevatorMetalTexture,
  metalDoorTexture,
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

/**
 * All lit surfaces use MeshLambertMaterial: it supports maps, emissive and
 * shadows while costing far less than a PBR material, which matters because the
 * corridor is lit by several point lights at once.
 */
export class MaterialLibrary {
  private materials = new Map<string, THREE.Material>();
  private textures: THREE.Texture[] = [];

  constructor() {
    const wall = this.track(wallTexture(7));
    const floor = this.track(terrazzoTexture(11));
    const ceiling = this.track(ceilingTexture(23));
    const concrete = this.track(concreteTexture(31));
    const tile = this.track(tileWallTexture(41));
    const wood = this.track(woodFloorTexture(53));
    const carpet = this.track(carpetTexture(61));
    const doorWood = this.track(woodDoorTexture(67));
    const doorMetal = this.track(metalDoorTexture(71));
    const elevator = this.track(elevatorMetalTexture(79));

    this.set('wall', new THREE.MeshLambertMaterial({ map: wall, color: 0xffffff }));
    this.set('wallDim', new THREE.MeshLambertMaterial({ map: wall, color: 0xa9a496 }));
    this.set('floor', new THREE.MeshLambertMaterial({ map: floor }));
    this.set('ceiling', new THREE.MeshLambertMaterial({ map: ceiling, color: 0xe8e6df }));
    this.set('concrete', new THREE.MeshLambertMaterial({ map: concrete }));
    this.set('tile', new THREE.MeshLambertMaterial({ map: tile }));
    this.set('wood', new THREE.MeshLambertMaterial({ map: wood }));
    this.set('carpet', new THREE.MeshLambertMaterial({ map: carpet }));
    this.set('doorWood', new THREE.MeshLambertMaterial({ map: doorWood }));
    this.set('doorMetal', new THREE.MeshLambertMaterial({ map: doorMetal }));
    this.set('elevator', new THREE.MeshLambertMaterial({ map: elevator }));
    this.set('metal', new THREE.MeshLambertMaterial({ color: 0x9aa0a5 }));
    this.set('darkMetal', new THREE.MeshLambertMaterial({ color: 0x3d4247 }));
    this.set('plastic', new THREE.MeshLambertMaterial({ color: 0x2f5d7a }));
    this.set('rubber', new THREE.MeshLambertMaterial({ color: 0x22262a }));
    this.set('skirting', new THREE.MeshLambertMaterial({ color: 0x6d6455 }));
    this.set('glassDark', new THREE.MeshLambertMaterial({ color: 0x11161c }));
    this.set('paper', new THREE.MeshLambertMaterial({ color: 0xe6e0cc }));
    this.set('fabric', new THREE.MeshLambertMaterial({ color: 0x6b5a49 }));
  }

  private track<T extends THREE.Texture>(texture: T): T {
    this.textures.push(texture);
    return texture;
  }

  private set(key: MaterialKey, material: THREE.Material): void {
    this.materials.set(key, material);
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

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.materials.clear();
    this.textures = [];
  }
}
