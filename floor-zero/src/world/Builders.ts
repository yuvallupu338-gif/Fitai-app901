import * as THREE from 'three';
import { AABB, CollisionWorld, WallOpening, wallSegments } from './Collision';
import { MaterialKey, MaterialLibrary } from './Materials';

/**
 * Rescale a box's UVs so a shared tiling texture keeps a constant real-world
 * size no matter how large the box is. Without this every wall would stretch
 * its texture differently.
 */
export function applyBoxUV(
  geometry: THREE.BoxGeometry,
  width: number,
  height: number,
  depth: number,
  tile = 1,
): void {
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z — 4 vertices each.
  const scales: Array<[number, number]> = [
    [depth / tile, height / tile],
    [depth / tile, height / tile],
    [width / tile, depth / tile],
    [width / tile, depth / tile],
    [width / tile, height / tile],
    [width / tile, height / tile],
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = scales[face];
    for (let i = 0; i < 4; i++) {
      const index = face * 4 + i;
      uv.setXY(index, uv.getX(index) * su, uv.getY(index) * sv);
    }
  }
  uv.needsUpdate = true;
}

export interface BoxOptions {
  id?: string;
  material: MaterialKey | THREE.Material;
  center: [number, number, number];
  size: [number, number, number];
  collide?: boolean;
  tile?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  rotationY?: number;
  name?: string;
}

export interface WallOptions {
  id: string;
  axis: 'x' | 'z';
  /** The fixed coordinate: z when the wall runs along x, x when along z. */
  at: number;
  from: number;
  to: number;
  height: number;
  baseY?: number;
  thickness?: number;
  material?: MaterialKey;
  /** Openings expressed in world coordinates along the wall axis. */
  openings?: WallOpening[];
  tile?: number;
  skirting?: boolean;
  collide?: boolean;
}

/**
 * Accumulates the meshes, collision boxes and disposable geometry of one level.
 */
export class Builder {
  readonly group = new THREE.Group();
  readonly collision = new CollisionWorld();
  private geometries = new Set<THREE.BufferGeometry>();
  private ownedMaterials: THREE.Material[] = [];
  private ownedTextures: THREE.Texture[] = [];
  private counter = 0;

  constructor(private readonly materials: MaterialLibrary) {
    this.group.name = 'level';
  }

  /** Multiplier emissive props apply so they bloom. */
  get emissiveBoost(): number {
    return this.materials.emissiveBoost;
  }

  private resolve(material: MaterialKey | THREE.Material): THREE.Material {
    return typeof material === 'string' ? this.materials.get(material) : material;
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${this.counter}`;
  }

  own<T extends THREE.Material>(material: T): T {
    this.ownedMaterials.push(material);
    return material;
  }

  /** Textures created for a single level, disposed with it. */
  ownTexture<T extends THREE.Texture>(texture: T): T {
    this.ownedTextures.push(texture);
    return texture;
  }

  box(options: BoxOptions): THREE.Mesh {
    const [w, h, d] = options.size;
    const [cx, cy, cz] = options.center;
    const geometry = new THREE.BoxGeometry(Math.abs(w), Math.abs(h), Math.abs(d));
    applyBoxUV(geometry, Math.abs(w), Math.abs(h), Math.abs(d), options.tile ?? 1);
    this.geometries.add(geometry);

    const mesh = new THREE.Mesh(geometry, this.resolve(options.material));
    mesh.position.set(cx, cy, cz);
    if (options.rotationY) mesh.rotation.y = options.rotationY;
    mesh.castShadow = options.castShadow ?? false;
    mesh.receiveShadow = options.receiveShadow ?? true;
    mesh.name = options.name ?? options.id ?? this.nextId('box');
    this.group.add(mesh);

    if (options.collide !== false) {
      const id = options.id ?? mesh.name;
      // A rotated box uses its axis-aligned extent, which is fine for the
      // 45°-or-less decor rotations used in this game.
      const spanX = options.rotationY
        ? Math.abs(w * Math.cos(options.rotationY)) + Math.abs(d * Math.sin(options.rotationY))
        : Math.abs(w);
      const spanZ = options.rotationY
        ? Math.abs(w * Math.sin(options.rotationY)) + Math.abs(d * Math.cos(options.rotationY))
        : Math.abs(d);
      this.collision.add({
        id,
        minX: cx - spanX / 2,
        maxX: cx + spanX / 2,
        minY: cy - Math.abs(h) / 2,
        maxY: cy + Math.abs(h) / 2,
        minZ: cz - spanZ / 2,
        maxZ: cz + spanZ / 2,
        solid: true,
      });
    }
    return mesh;
  }

  /** Non-colliding decorative box. */
  decor(options: Omit<BoxOptions, 'collide'>): THREE.Mesh {
    return this.box({ ...options, collide: false });
  }

  wall(options: WallOptions): THREE.Mesh[] {
    const {
      axis,
      at,
      from,
      to,
      height,
      baseY = 0,
      thickness = 0.18,
      material = 'wall',
      openings = [],
      tile = 2,
      skirting = true,
      collide = true,
    } = options;

    const start = Math.min(from, to);
    const length = Math.abs(to - from);
    const localOpenings: WallOpening[] = openings.map((o) => ({
      start: o.start - start,
      end: o.end - start,
      bottom: o.bottom,
      top: o.top,
    }));

    const pieces = wallSegments(length, height, localOpenings);
    const meshes: THREE.Mesh[] = [];

    pieces.forEach((piece, index) => {
      const segLength = piece.end - piece.start;
      const segHeight = piece.top - piece.bottom;
      if (segLength <= 1e-3 || segHeight <= 1e-3) return;
      const centerAlong = start + piece.start + segLength / 2;
      const centerY = baseY + piece.bottom + segHeight / 2;
      const size: [number, number, number] =
        axis === 'x' ? [segLength, segHeight, thickness] : [thickness, segHeight, segLength];
      const center: [number, number, number] =
        axis === 'x' ? [centerAlong, centerY, at] : [at, centerY, centerAlong];

      meshes.push(
        this.box({
          id: `${options.id}_${index}`,
          material,
          center,
          size,
          tile,
          collide,
          receiveShadow: true,
        }),
      );

      // Skirting board along the base of full-height pieces.
      if (skirting && piece.bottom < 0.02) {
        const skirtSize: [number, number, number] =
          axis === 'x' ? [segLength, 0.12, thickness + 0.04] : [thickness + 0.04, 0.12, segLength];
        const skirtCenter: [number, number, number] =
          axis === 'x' ? [centerAlong, baseY + 0.06, at] : [at, baseY + 0.06, centerAlong];
        this.decor({ material: 'skirting', center: skirtCenter, size: skirtSize });
      }
    });

    return meshes;
  }

  /** Horizontal slab used for floors and ceilings. */
  slab(
    id: string,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    material: MaterialKey,
    options: { thickness?: number; tile?: number; collide?: boolean; receiveShadow?: boolean } = {},
  ): THREE.Mesh {
    const thickness = options.thickness ?? 0.12;
    return this.box({
      id,
      material,
      center: [(x0 + x1) / 2, y - thickness / 2, (z0 + z1) / 2],
      size: [Math.abs(x1 - x0), thickness, Math.abs(z1 - z0)],
      tile: options.tile ?? 1.2,
      collide: options.collide ?? false,
      receiveShadow: options.receiveShadow ?? true,
    });
  }

  /** Flat textured quad for posters, photos, signs and screens. */
  panel(
    texture: THREE.Texture,
    width: number,
    height: number,
    position: [number, number, number],
    rotationY: number,
    options: { emissive?: boolean; opacity?: number; name?: string } = {},
  ): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(width, height);
    this.geometries.add(geometry);
    const material = options.emissive
      ? new THREE.MeshBasicMaterial({
          map: texture,
          transparent: options.opacity !== undefined,
          opacity: options.opacity ?? 1,
        })
      : new THREE.MeshLambertMaterial({
          map: texture,
          transparent: options.opacity !== undefined,
          opacity: options.opacity ?? 1,
        });
    this.own(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.y = rotationY;
    mesh.name = options.name ?? this.nextId('panel');
    this.group.add(mesh);
    return mesh;
  }

  addObject(object: THREE.Object3D): void {
    this.group.add(object);
  }

  trackGeometry(geometry: THREE.BufferGeometry): void {
    this.geometries.add(geometry);
  }

  addCollider(box: AABB): void {
    this.collision.add(box);
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    for (const texture of this.ownedTextures) texture.dispose();
    this.geometries.clear();
    this.ownedMaterials = [];
    this.ownedTextures = [];
    this.group.clear();
    this.collision.clear();
  }
}

/** Remove an object tree from its parent and dispose any geometry it owns. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
    }
  });
  root.removeFromParent();
}
