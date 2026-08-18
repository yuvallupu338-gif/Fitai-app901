/**
 * A 90°-step local frame. Sub-assemblies (the lift car, the control desk) are
 * authored in convenient local coordinates and stamped into the world through
 * one of these, so their axis-aligned collision boxes stay axis aligned.
 */
export type Quarter = 0 | 90 | 180 | 270;

export class Frame {
  constructor(
    readonly originX: number,
    readonly originZ: number,
    readonly rotation: Quarter = 0,
  ) {}

  /** Local (x,z) → world (x,z). */
  point(x: number, z: number): [number, number] {
    switch (this.rotation) {
      case 90:
        return [this.originX - z, this.originZ + x];
      case 180:
        return [this.originX - x, this.originZ - z];
      case 270:
        return [this.originX + z, this.originZ - x];
      default:
        return [this.originX + x, this.originZ + z];
    }
  }

  /** Local extents → world extents (swapped on quarter turns). */
  size(sx: number, sz: number): [number, number] {
    return this.rotation === 90 || this.rotation === 270 ? [sz, sx] : [sx, sz];
  }

  /** Local direction → world direction. */
  direction(x: number, z: number): [number, number] {
    switch (this.rotation) {
      case 90:
        return [-z, x];
      case 180:
        return [-x, -z];
      case 270:
        return [z, -x];
      default:
        return [x, z];
    }
  }

  /** Yaw in radians to add to a mesh authored facing local +x. */
  get angle(): number {
    return (this.rotation * Math.PI) / 180;
  }

  /** Which world axis a local x-axis slide happens on. */
  get axisForLocalX(): 'x' | 'z' {
    return this.rotation === 90 || this.rotation === 270 ? 'z' : 'x';
  }

  /** Which world axis a local z-axis slide happens on. */
  get axisForLocalZ(): 'x' | 'z' {
    return this.rotation === 90 || this.rotation === 270 ? 'x' : 'z';
  }

  /** Sign applied to a local z offset when mapped to its world axis. */
  get signForLocalZ(): number {
    switch (this.rotation) {
      case 90:
        return -1;
      case 180:
        return -1;
      default:
        return 1;
    }
  }
}
