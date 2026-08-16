/**
 * One source of truth for the Floor 0 layout. The corridor builder cuts the
 * openings from this table and the apartment builder hangs the doors in exactly
 * the same places.
 */

export const CORRIDOR = {
  x0: 0,
  x1: 26.5,
  z0: -1.4,
  z1: 1.4,
  height: 2.7,
};

/**
 * Walls are 0.18m thick and centred on their coordinate, so a flat panel hung
 * at the wall's own coordinate is buried inside it and never drawn. Anything
 * mounted on a wall face offsets by this much toward the room instead.
 */
export const WALL_MOUNT = 0.12;

export interface Doorway {
  id: string;
  axis: 'x' | 'z';
  /** Fixed coordinate of the wall. */
  at: number;
  from: number;
  to: number;
  height: number;
}

export const DOORWAYS: Record<string, Doorway> = {
  apt01: { id: 'apt01', axis: 'x', at: CORRIDOR.z0, from: 3.8, to: 4.8, height: 2.05 },
  alcove: { id: 'alcove', axis: 'x', at: CORRIDOR.z0, from: 8.4, to: 9.4, height: 2.05 },
  apt03: { id: 'apt03', axis: 'x', at: CORRIDOR.z0, from: 12.8, to: 13.8, height: 2.05 },
  control: { id: 'control', axis: 'x', at: CORRIDOR.z0, from: 22.0, to: 23.0, height: 2.05 },
  apt02: { id: 'apt02', axis: 'x', at: CORRIDOR.z1, from: 7.8, to: 8.8, height: 2.05 },
  apt04a: { id: 'apt04a', axis: 'x', at: CORRIDOR.z1, from: 17.5, to: 18.5, height: 2.05 },
  apt04b: { id: 'apt04b', axis: 'x', at: CORRIDOR.z1, from: 20.2, to: 21.0, height: 2.05 },
};

export const ROOM_RECTS = {
  apt01: { minX: 2.2, maxX: 6.6, minZ: -6.4, maxZ: -1.4, height: 2.5 },
  alcove: { minX: 7.3, maxX: 10.3, minZ: -4.2, maxZ: -1.4, height: 2.4 },
  apt03: { minX: 11.0, maxX: 19.5, minZ: -9.6, maxZ: -1.4, height: 2.55 },
  service: { minX: 16.8, maxX: 19.5, minZ: -12.4, maxZ: -9.6, height: 2.4 },
  control: { minX: 20.0, maxX: 26.5, minZ: -8.4, maxZ: -1.4, height: 2.6 },
  apt02hall: { minX: 7.6, maxX: 9.2, minZ: 1.4, maxZ: 7.2, height: 2.4 },
  apt02kids: { minX: 5.0, maxX: 12.0, minZ: 7.2, maxZ: 12.4, height: 2.5 },
  apt04: { minX: 15.5, maxX: 21.5, minZ: 1.4, maxZ: 7.4, height: 2.5 },
};

/** Corridor x where the chapter-2 shutter drops. */
export const SHUTTER_X = 12.0;

/** The lift car sits just west of the corridor, facing east. */
export const LIFT_ORIGIN = { x: -0.1, z: 0 };

export const FLOOR_BOUNDS = { minX: -3.5, maxX: 28.5, minZ: -14, maxZ: 14 };

export const CORRIDOR_FIXTURES = [2.5, 6.6, 10.6, 14.6, 18.6, 22.6, 25.6];
