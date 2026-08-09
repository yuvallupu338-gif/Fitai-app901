/*
 * dims.js — the measurements everything else agrees on.
 *
 * These are real numbers off a real stock sheet, near enough: a 2.72m wide
 * body, 2.28m from floor to ceiling, doors 1.32m across. The reason to keep
 * them honest is that the whole game is one corridor, and a corridor that is
 * ten centimetres too wide stops feeling like a train immediately, in a way
 * nobody can name.
 *
 * Coordinates: +X is the right-hand side of the train looking forward, +Y is
 * up from the floor, +Z is the direction of travel. Car 0 is at the front.
 */

export const CAR = {
  length: 17.2,          // interior, wall to wall
  halfWidth: 1.36,
  height: 2.28,
  spacing: 18.7,         // centre to centre, i.e. interior plus the gangway
  gangway: 1.5,

  doorZ: [-4.4, 4.4],
  doorHalfWidth: 0.66,
  doorHeight: 1.98,

  windowY0: 1.04,
  windowY1: 1.80,

  seatY: 0.44,           // top of the cushion
  seatDepth: 0.47,
  seatBackY: 0.95,
  seatInnerX: 0.86,      // where the cushion stops and the aisle starts

  poleX: 0.62,
  railY: 2.02,
  railX: 0.92,

  corridorHalf: 0.74,    // how far off centre you can stand between the seats
  doorwayHalf: 1.30,     // and how far, standing in a doorway

  lightY: 2.24,
  lightX: 0.58,

  eyeHeight: 1.68,
  sitEyeHeight: 1.17,
};

/* The seat banks, as z ranges. Doors interrupt them. */
export const SEAT_BANKS = [
  { z0: -8.30, z1: -5.20 },
  { z0: -3.56, z1: 3.56 },
  { z0: 5.20, z1: 8.30 },
];

export const SEAT_PITCH = 0.462;

/* Where the vertical grab poles stand. Mirrored in X. */
export const POLE_Z = [-5.06, -3.72, 3.72, 5.06];

export function carCenterZ(index) {
  return index * CAR.spacing;
}

/* Seat slots, in car-local space, generated once and shared by every car so a
   passenger's "seat 12" means the same bench position wherever they are. */
export function buildSeatSlots() {
  const slots = [];
  for (const side of [-1, 1]) {
    for (let b = 0; b < SEAT_BANKS.length; b++) {
      const bank = SEAT_BANKS[b];
      const span = bank.z1 - bank.z0;
      const count = Math.max(1, Math.floor(span / SEAT_PITCH));
      const pad = (span - (count - 1) * SEAT_PITCH) / 2;
      for (let i = 0; i < count; i++) {
        slots.push({
          index: slots.length,
          bank: b,
          side,
          x: side * (CAR.halfWidth - CAR.seatDepth / 2 - 0.12),
          z: bank.z0 + pad + i * SEAT_PITCH,
          /* A seated passenger faces across the carriage. */
          facing: side > 0 ? -Math.PI / 2 : Math.PI / 2,
        });
      }
    }
  }
  return slots;
}

export const SEAT_SLOTS = buildSeatSlots();

export function seatSlot(index) {
  return SEAT_SLOTS[((index % SEAT_SLOTS.length) + SEAT_SLOTS.length) % SEAT_SLOTS.length];
}
