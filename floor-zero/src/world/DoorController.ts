import * as THREE from 'three';
import { CollisionWorld } from './Collision';

export type DoorType = 'swing' | 'slide';

export interface DoorConfig {
  id: string;
  type: DoorType;
  pivot: THREE.Object3D;
  colliderId: string;
  collision: CollisionWorld;
  /** Radians for a swing door, metres for a sliding one. */
  travel: number;
  speed: number;
  locked?: boolean;
  /** Sliding doors move along this world axis ('y' for roller shutters). */
  slideAxis?: 'x' | 'y' | 'z';
  closedPosition?: THREE.Vector3;
  onStateChange?: (open: boolean) => void;
}

export class Door {
  open = false;
  locked: boolean;
  /** 0 = closed, 1 = fully open. */
  progress = 0;
  private target = 0;
  private readonly closedPos: THREE.Vector3;
  private lastSolid = true;

  constructor(private readonly config: DoorConfig) {
    this.locked = config.locked ?? false;
    this.closedPos = (config.closedPosition ?? config.pivot.position).clone();
  }

  get id(): string {
    return this.config.id;
  }

  get pivot(): THREE.Object3D {
    return this.config.pivot;
  }

  get isMoving(): boolean {
    return Math.abs(this.progress - this.target) > 1e-3;
  }

  setOpen(open: boolean): void {
    if (this.locked && open) return;
    this.open = open;
    this.target = open ? 1 : 0;
    this.config.onStateChange?.(open);
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  /** Snap without animating, used when rebuilding a level. */
  forceState(open: boolean): void {
    this.open = open;
    this.target = open ? 1 : 0;
    this.progress = this.target;
    this.apply();
  }

  update(delta: number): void {
    if (!this.isMoving) return;
    const step = this.config.speed * delta;
    if (this.progress < this.target) this.progress = Math.min(this.target, this.progress + step);
    else this.progress = Math.max(this.target, this.progress - step);
    this.apply();
  }

  private apply(): void {
    const eased = this.progress * this.progress * (3 - 2 * this.progress);
    if (this.config.type === 'swing') {
      this.config.pivot.rotation.y = eased * this.config.travel;
    } else {
      const offset = eased * this.config.travel;
      const axis = this.config.slideAxis ?? 'x';
      this.config.pivot.position.set(
        this.closedPos.x + (axis === 'x' ? offset : 0),
        this.closedPos.y + (axis === 'y' ? offset : 0),
        this.closedPos.z + (axis === 'z' ? offset : 0),
      );
    }
    // The leaf stops blocking once it is a third of the way open.
    const solid = this.progress < 0.33;
    if (solid !== this.lastSolid) {
      this.lastSolid = solid;
      this.config.collision.setSolid(this.config.colliderId, solid);
    }
  }
}

export class DoorSystem {
  private doors = new Map<string, Door>();

  add(door: Door): Door {
    this.doors.set(door.id, door);
    return door;
  }

  get(id: string): Door | undefined {
    return this.doors.get(id);
  }

  get all(): Door[] {
    return Array.from(this.doors.values());
  }

  update(delta: number): void {
    for (const door of this.doors.values()) door.update(delta);
  }

  clear(): void {
    this.doors.clear();
  }
}
