import { describe, expect, it } from 'vitest';
import { CollisionWorld, makeBox, makeTrigger, updateTriggers, wallSegments } from '../src/world/Collision';
import { NavGraph } from '../src/world/Nav';
import { Frame } from '../src/world/Frame';
import { CORRIDOR, DOORWAYS, ROOM_RECTS } from '../src/world/floorPlan';

describe('wallSegments', () => {
  it('returns one solid piece for a wall with no openings', () => {
    const pieces = wallSegments(10, 2.7);
    expect(pieces).toEqual([{ start: 0, end: 10, bottom: 0, top: 2.7 }]);
  });

  it('splits around a full-height doorway', () => {
    const pieces = wallSegments(10, 2.7, [{ start: 4, end: 5, bottom: 0, top: 2.7 }]);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toEqual({ start: 0, end: 4, bottom: 0, top: 2.7 });
    expect(pieces[1]).toEqual({ start: 5, end: 10, bottom: 0, top: 2.7 });
  });

  it('leaves a lintel above a door that does not reach the ceiling', () => {
    const pieces = wallSegments(6, 2.7, [{ start: 2, end: 3, bottom: 0, top: 2.05 }]);
    const lintel = pieces.find((p) => p.bottom > 0);
    expect(lintel).toBeDefined();
    expect(lintel!.bottom).toBeCloseTo(2.05, 5);
    expect(lintel!.top).toBeCloseTo(2.7, 5);
  });

  it('leaves a sill below a window', () => {
    const pieces = wallSegments(6, 2.7, [{ start: 2, end: 4, bottom: 1.0, top: 2.0 }]);
    expect(pieces.some((p) => p.bottom === 0 && p.top === 1.0 && p.start === 2)).toBe(true);
    expect(pieces.some((p) => p.bottom === 2.0 && p.top === 2.7)).toBe(true);
  });

  it('handles several openings and keeps them in order', () => {
    const pieces = wallSegments(20, 2.7, [
      { start: 12, end: 13 },
      { start: 4, end: 5 },
    ]);
    expect(pieces.map((p) => [p.start, p.end])).toEqual([
      [0, 4],
      [5, 12],
      [13, 20],
    ]);
  });

  it('clips openings that run past the ends of the wall', () => {
    const pieces = wallSegments(10, 2.7, [{ start: -4, end: 2 }]);
    expect(pieces).toEqual([{ start: 2, end: 10, bottom: 0, top: 2.7 }]);
  });

  it('returns nothing solid when an opening covers the whole wall', () => {
    expect(wallSegments(10, 2.7, [{ start: 0, end: 10 }])).toEqual([]);
  });

  it('ignores degenerate openings', () => {
    expect(wallSegments(10, 2.7, [{ start: 5, end: 5 }])).toHaveLength(1);
  });
});

describe('CollisionWorld', () => {
  function walled(): CollisionWorld {
    const world = new CollisionWorld();
    // A 10×10 room with walls at ±5.
    world.add(makeBox('n', 0, 1.35, -5, 10, 2.7, 0.2));
    world.add(makeBox('s', 0, 1.35, 5, 10, 2.7, 0.2));
    world.add(makeBox('w', -5, 1.35, 0, 0.2, 2.7, 10));
    world.add(makeBox('e', 5, 1.35, 0, 0.2, 2.7, 10));
    return world;
  }

  it('detects overlap with a wall', () => {
    const world = walled();
    expect(world.overlaps(0, 0, 0.3, 0, 1.75)).toBe(false);
    expect(world.overlaps(0, 4.95, 0.3, 0, 1.75)).toBe(true);
  });

  it('ignores boxes above the body', () => {
    const world = new CollisionWorld();
    world.add(makeBox('pipe', 0, 2.4, 0, 4, 0.2, 0.2));
    expect(world.overlaps(0, 0, 0.3, 0, 1.75)).toBe(false);
    expect(world.overlaps(0, 0, 0.3, 0, 2.6)).toBe(true);
  });

  it('stops a body at a wall instead of passing through', () => {
    const world = walled();
    const position = { x: 0, z: 4 };
    for (let i = 0; i < 200; i++) world.moveAndSlide(position, 0, 0.1, 0.3, 0, 1.75);
    expect(position.z).toBeLessThan(4.75);
    expect(world.overlaps(position.x, position.z, 0.3, 0, 1.75)).toBe(false);
  });

  it('slides along a wall rather than sticking', () => {
    const world = walled();
    const position = { x: 0, z: 4.6 };
    // Push diagonally into the south wall: the z component is blocked, x is not.
    for (let i = 0; i < 40; i++) world.moveAndSlide(position, 0.05, 0.05, 0.3, 0, 1.75);
    expect(position.x).toBeGreaterThan(1.5);
  });

  it('never lets a fast body tunnel out of the room', () => {
    const world = walled();
    const position = { x: 0, z: 0 };
    for (let i = 0; i < 50; i++) world.moveAndSlide(position, 1.5, 0, 0.3, 0, 1.75);
    expect(position.x).toBeLessThan(5);
  });

  it('respects a door collider being switched off', () => {
    const world = new CollisionWorld();
    world.add(makeBox('door', 0, 1, 2, 1, 2, 0.2));
    const closed = { x: 0, z: 0 };
    for (let i = 0; i < 60; i++) world.moveAndSlide(closed, 0, 0.1, 0.3, 0, 1.75);
    expect(closed.z).toBeLessThan(2);

    world.setSolid('door', false);
    const open = { x: 0, z: 0 };
    for (let i = 0; i < 60; i++) world.moveAndSlide(open, 0, 0.1, 0.3, 0, 1.75);
    expect(open.z).toBeGreaterThan(3);
  });

  it('reports line of sight correctly', () => {
    const world = walled();
    expect(world.hasLineOfSight(-3, 0, 3, 0)).toBe(true);
    world.add(makeBox('block', 0, 1.35, 0, 0.4, 2.7, 4));
    expect(world.hasLineOfSight(-3, 0, 3, 0)).toBe(false);
    // Around the blocker there is still a clear line.
    expect(world.hasLineOfSight(-3, 3, 3, 3)).toBe(true);
  });

  it('removes colliders by id', () => {
    const world = walled();
    world.remove('e');
    const position = { x: 0, z: 0 };
    for (let i = 0; i < 100; i++) world.moveAndSlide(position, 0.1, 0, 0.3, 0, 1.75);
    expect(position.x).toBeGreaterThan(5);
  });
});

describe('trigger volumes', () => {
  it('fires on enter and only once when marked once', () => {
    let entered = 0;
    const trigger = makeTrigger('t', 0, 0, 2, 2, { once: true, onEnter: () => (entered += 1) });
    updateTriggers([trigger], 1, 1);
    updateTriggers([trigger], 5, 5);
    updateTriggers([trigger], 1, 1);
    expect(entered).toBe(1);
  });

  it('can re-fire when not marked once', () => {
    let entered = 0;
    let exited = 0;
    const trigger = makeTrigger('t', 0, 0, 2, 2, {
      once: false,
      onEnter: () => (entered += 1),
      onExit: () => (exited += 1),
    });
    updateTriggers([trigger], 1, 1);
    updateTriggers([trigger], 9, 9);
    updateTriggers([trigger], 1, 1);
    expect(entered).toBe(2);
    expect(exited).toBe(1);
  });
});

describe('NavGraph', () => {
  function line(): NavGraph {
    const nav = new NavGraph();
    for (let i = 0; i < 5; i++) nav.add({ id: `n${i}`, x: i * 2, z: 0, links: [], room: 'corridor' });
    for (let i = 1; i < 5; i++) nav.link(`n${i - 1}`, `n${i}`);
    return nav;
  }

  it('finds the nearest node', () => {
    const nav = line();
    expect(nav.nearest(5.1, 0)?.id).toBe('n3');
  });

  it('walks the chain from one end to the other', () => {
    const nav = line();
    const path = nav.path('n0', 'n4');
    expect(path.map((n) => n.id)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4']);
  });

  it('returns a single node when start equals end', () => {
    expect(line().path('n2', 'n2').map((n) => n.id)).toEqual(['n2']);
  });

  it('returns nothing when the graph is disconnected', () => {
    const nav = line();
    nav.add({ id: 'island', x: 99, z: 99, links: [] });
    expect(nav.path('n0', 'island')).toEqual([]);
  });

  it('prefers the shorter branch', () => {
    const nav = new NavGraph();
    nav.add({ id: 'a', x: 0, z: 0, links: [] });
    nav.add({ id: 'shortcut', x: 5, z: 0, links: [] });
    nav.add({ id: 'detour1', x: 2, z: 20, links: [] });
    nav.add({ id: 'detour2', x: 4, z: 20, links: [] });
    nav.add({ id: 'b', x: 10, z: 0, links: [] });
    nav.link('a', 'shortcut');
    nav.link('shortcut', 'b');
    nav.link('a', 'detour1');
    nav.link('detour1', 'detour2');
    nav.link('detour2', 'b');
    expect(nav.path('a', 'b').map((n) => n.id)).toEqual(['a', 'shortcut', 'b']);
  });

  it('routes between arbitrary points and ends at the destination', () => {
    const nav = line();
    const route = nav.route(0.2, 0, 7.7, 0);
    expect(route.length).toBeGreaterThan(1);
    expect(route.at(-1)).toEqual({ x: 7.7, z: 0 });
  });

  it('lists nodes by room', () => {
    expect(line().inRoom('corridor')).toHaveLength(5);
    expect(line().inRoom('nowhere')).toHaveLength(0);
  });
});

describe('Frame', () => {
  it('maps local coordinates through each quarter turn', () => {
    expect(new Frame(0, 0, 0).point(1, 2)).toEqual([1, 2]);
    expect(new Frame(0, 0, 90).point(1, 2)).toEqual([-2, 1]);
    expect(new Frame(0, 0, 180).point(1, 2)).toEqual([-1, -2]);
    expect(new Frame(0, 0, 270).point(1, 2)).toEqual([2, -1]);
  });

  it('swaps extents on quarter turns only', () => {
    expect(new Frame(0, 0, 0).size(3, 1)).toEqual([3, 1]);
    expect(new Frame(0, 0, 90).size(3, 1)).toEqual([1, 3]);
    expect(new Frame(0, 0, 180).size(3, 1)).toEqual([3, 1]);
  });

  it('reports which world axis a local slide happens on', () => {
    expect(new Frame(0, 0, 0).axisForLocalZ).toBe('z');
    expect(new Frame(0, 0, 90).axisForLocalZ).toBe('x');
    expect(new Frame(0, 0, 90).signForLocalZ).toBe(-1);
    expect(new Frame(0, 0, 270).signForLocalZ).toBe(1);
  });

  it('applies the origin offset', () => {
    expect(new Frame(10, -4, 0).point(1, 1)).toEqual([11, -3]);
  });
});

describe('the Floor 0 plan', () => {
  it('puts every corridor doorway inside the corridor', () => {
    for (const doorway of Object.values(DOORWAYS)) {
      expect(doorway.from).toBeGreaterThanOrEqual(CORRIDOR.x0);
      expect(doorway.to).toBeLessThanOrEqual(CORRIDOR.x1);
      expect(doorway.to - doorway.from).toBeGreaterThan(0.7);
      expect(Math.abs(doorway.at)).toBeCloseTo(1.4, 5);
    }
  });

  it('does not overlap any two rooms', () => {
    const rects = Object.entries(ROOM_RECTS);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const [nameA, a] = rects[i];
        const [nameB, b] = rects[j];
        const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
        const overlaps = overlapX > 0.05 && overlapZ > 0.05;
        expect(overlaps, `${nameA} overlaps ${nameB}`).toBe(false);
      }
    }
  });

  it('lines each apartment door up with the room behind it', () => {
    const pairs: Array<[keyof typeof DOORWAYS, keyof typeof ROOM_RECTS]> = [
      ['apt01', 'apt01'],
      ['alcove', 'alcove'],
      ['apt03', 'apt03'],
      ['control', 'control'],
      ['apt02', 'apt02hall'],
      ['apt04a', 'apt04'],
      ['apt04b', 'apt04'],
    ];
    for (const [doorKey, roomKey] of pairs) {
      const door = DOORWAYS[doorKey];
      const room = ROOM_RECTS[roomKey];
      expect(door.from, `${doorKey} starts inside ${roomKey}`).toBeGreaterThanOrEqual(room.minX - 0.01);
      expect(door.to, `${doorKey} ends inside ${roomKey}`).toBeLessThanOrEqual(room.maxX + 0.01);
    }
  });
});
