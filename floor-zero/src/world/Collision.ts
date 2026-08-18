/**
 * Axis-aligned collision. Pure arithmetic (no Three.js) so the movement rules
 * can be unit tested and so the mimic can reuse them for path validity.
 */

export interface AABB {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  solid: boolean;
}

export interface Point2 {
  x: number;
  z: number;
}

export function makeBox(
  id: string,
  centerX: number,
  centerY: number,
  centerZ: number,
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  solid = true,
): AABB {
  return {
    id,
    minX: centerX - sizeX / 2,
    maxX: centerX + sizeX / 2,
    minY: centerY - sizeY / 2,
    maxY: centerY + sizeY / 2,
    minZ: centerZ - sizeZ / 2,
    maxZ: centerZ + sizeZ / 2,
    solid,
  };
}

export interface WallOpening {
  /** Position along the wall, in wall-local coordinates. */
  start: number;
  end: number;
  bottom?: number;
  top?: number;
}

export interface WallPiece {
  start: number;
  end: number;
  bottom: number;
  top: number;
}

/**
 * Split a wall of the given length/height into solid pieces around the
 * openings. Openings that overlap are merged; openings outside the wall are
 * ignored. Returns pieces in wall-local coordinates.
 */
export function wallSegments(
  length: number,
  height: number,
  openings: readonly WallOpening[] = [],
): WallPiece[] {
  const clean = openings
    .map((o) => ({
      start: Math.max(0, Math.min(length, Math.min(o.start, o.end))),
      end: Math.max(0, Math.min(length, Math.max(o.start, o.end))),
      bottom: Math.max(0, o.bottom ?? 0),
      top: Math.min(height, o.top ?? height),
    }))
    .filter((o) => o.end - o.start > 1e-4 && o.top - o.bottom > 1e-4)
    .sort((a, b) => a.start - b.start);

  const pieces: WallPiece[] = [];
  let cursor = 0;

  for (const opening of clean) {
    if (opening.start > cursor + 1e-4) {
      pieces.push({ start: cursor, end: opening.start, bottom: 0, top: height });
    }
    if (opening.bottom > 1e-4) {
      pieces.push({ start: opening.start, end: opening.end, bottom: 0, top: opening.bottom });
    }
    if (opening.top < height - 1e-4) {
      pieces.push({ start: opening.start, end: opening.end, bottom: opening.top, top: height });
    }
    cursor = Math.max(cursor, opening.end);
  }

  if (cursor < length - 1e-4) {
    pieces.push({ start: cursor, end: length, bottom: 0, top: height });
  }

  return pieces;
}

export class CollisionWorld {
  private boxes: AABB[] = [];
  private byId = new Map<string, AABB[]>();

  add(box: AABB): AABB {
    this.boxes.push(box);
    const list = this.byId.get(box.id);
    if (list) list.push(box);
    else this.byId.set(box.id, [box]);
    return box;
  }

  addAll(boxes: readonly AABB[]): void {
    for (const box of boxes) this.add(box);
  }

  setSolid(id: string, solid: boolean): void {
    const list = this.byId.get(id);
    if (!list) return;
    for (const box of list) box.solid = solid;
  }

  remove(id: string): void {
    const list = this.byId.get(id);
    if (!list) return;
    this.boxes = this.boxes.filter((box) => !list.includes(box));
    this.byId.delete(id);
  }

  clear(): void {
    this.boxes = [];
    this.byId.clear();
  }

  get all(): readonly AABB[] {
    return this.boxes;
  }

  /** True when an upright capsule at (x,z) of the given radius/height overlaps something solid. */
  overlaps(x: number, z: number, radius: number, feetY: number, headY: number): boolean {
    for (const box of this.boxes) {
      if (!box.solid) continue;
      if (headY <= box.minY || feetY >= box.maxY) continue;
      if (x + radius <= box.minX || x - radius >= box.maxX) continue;
      if (z + radius <= box.minZ || z - radius >= box.maxZ) continue;
      return true;
    }
    return false;
  }

  /**
   * Move a body and slide along whatever it hits.
   *
   * The move is split into sub-steps no longer than the body radius so that a
   * large delta (a stalled tab, a slow frame, a sprinting player) can never
   * jump clean through a wall between two tests.
   */
  moveAndSlide(
    position: Point2,
    dx: number,
    dz: number,
    radius: number,
    feetY: number,
    headY: number,
  ): { hitX: boolean; hitZ: boolean } {
    const distance = Math.hypot(dx, dz);
    const maxStep = Math.max(0.05, radius * 0.75);
    const steps = Math.min(24, Math.max(1, Math.ceil(distance / maxStep)));
    if (steps === 1) return this.stepOnce(position, dx, dz, radius, feetY, headY);

    let hitX = false;
    let hitZ = false;
    const stepX = dx / steps;
    const stepZ = dz / steps;
    for (let i = 0; i < steps; i++) {
      const result = this.stepOnce(position, stepX, stepZ, radius, feetY, headY);
      hitX = hitX || result.hitX;
      hitZ = hitZ || result.hitZ;
    }
    return { hitX, hitZ };
  }

  private stepOnce(
    position: Point2,
    dx: number,
    dz: number,
    radius: number,
    feetY: number,
    headY: number,
  ): { hitX: boolean; hitZ: boolean } {
    let hitX = false;
    let hitZ = false;

    if (dx !== 0) {
      const previous = position.x;
      position.x += dx;
      if (this.overlaps(position.x, position.z, radius, feetY, headY)) {
        position.x = this.resolveAxisX(previous, position.x, position.z, radius, feetY, headY);
        hitX = true;
      }
    }

    if (dz !== 0) {
      const previous = position.z;
      position.z += dz;
      if (this.overlaps(position.x, position.z, radius, feetY, headY)) {
        position.z = this.resolveAxisZ(previous, position.z, position.x, radius, feetY, headY);
        hitZ = true;
      }
    }

    return { hitX, hitZ };
  }

  private resolveAxisX(
    from: number,
    to: number,
    z: number,
    radius: number,
    feetY: number,
    headY: number,
  ): number {
    let best = to;
    const movingPositive = to > from;
    for (const box of this.boxes) {
      if (!box.solid) continue;
      if (headY <= box.minY || feetY >= box.maxY) continue;
      if (z + radius <= box.minZ || z - radius >= box.maxZ) continue;
      if (to + radius <= box.minX || to - radius >= box.maxX) continue;
      best = movingPositive
        ? Math.min(best, box.minX - radius - 1e-4)
        : Math.max(best, box.maxX + radius + 1e-4);
    }
    // If the resolved value pushed us past where we started, refuse the move.
    if (movingPositive ? best < from : best > from) return from;
    return best;
  }

  private resolveAxisZ(
    from: number,
    to: number,
    x: number,
    radius: number,
    feetY: number,
    headY: number,
  ): number {
    let best = to;
    const movingPositive = to > from;
    for (const box of this.boxes) {
      if (!box.solid) continue;
      if (headY <= box.minY || feetY >= box.maxY) continue;
      if (x + radius <= box.minX || x - radius >= box.maxX) continue;
      if (to + radius <= box.minZ || to - radius >= box.maxZ) continue;
      best = movingPositive
        ? Math.min(best, box.minZ - radius - 1e-4)
        : Math.max(best, box.maxZ + radius + 1e-4);
    }
    if (movingPositive ? best < from : best > from) return from;
    return best;
  }

  /** Distance along a horizontal ray until it hits something solid. */
  rayDistance(x: number, z: number, dirX: number, dirZ: number, maxDistance: number, y = 1.4): number {
    const length = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / length;
    const nz = dirZ / length;
    let closest = maxDistance;
    for (const box of this.boxes) {
      if (!box.solid) continue;
      if (y < box.minY || y > box.maxY) continue;
      let tmin = 0;
      let tmax = maxDistance;
      for (const [origin, dir, min, max] of [
        [x, nx, box.minX, box.maxX],
        [z, nz, box.minZ, box.maxZ],
      ] as Array<[number, number, number, number]>) {
        if (Math.abs(dir) < 1e-6) {
          if (origin < min || origin > max) {
            tmin = Infinity;
            break;
          }
        } else {
          let t1 = (min - origin) / dir;
          let t2 = (max - origin) / dir;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
        }
      }
      if (tmin <= tmax && tmin >= 0 && tmin < closest) closest = tmin;
    }
    return closest;
  }

  /** True when nothing solid stands between two points at head height. */
  hasLineOfSight(ax: number, az: number, bx: number, bz: number, y = 1.5): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-3) return true;
    return this.rayDistance(ax, az, dx, dz, distance, y) >= distance - 1e-3;
  }
}

export interface TriggerVolume {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  once: boolean;
  fired: boolean;
  onEnter?: () => void;
  onExit?: () => void;
  inside: boolean;
}

export function makeTrigger(
  id: string,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  options: { once?: boolean; onEnter?: () => void; onExit?: () => void } = {},
): TriggerVolume {
  return {
    id,
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minZ: Math.min(minZ, maxZ),
    maxZ: Math.max(minZ, maxZ),
    once: options.once ?? true,
    fired: false,
    onEnter: options.onEnter,
    onExit: options.onExit,
    inside: false,
  };
}

export function updateTriggers(triggers: TriggerVolume[], x: number, z: number): void {
  for (const trigger of triggers) {
    const inside = x >= trigger.minX && x <= trigger.maxX && z >= trigger.minZ && z <= trigger.maxZ;
    if (inside && !trigger.inside) {
      trigger.inside = true;
      if (!trigger.once || !trigger.fired) {
        trigger.fired = true;
        trigger.onEnter?.();
      }
    } else if (!inside && trigger.inside) {
      trigger.inside = false;
      trigger.onExit?.();
    }
  }
}
