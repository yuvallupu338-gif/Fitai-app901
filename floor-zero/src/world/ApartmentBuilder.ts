import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { GameState } from '../core/GameState';
import type { RNG } from '../core/RNG';
import { NOTES, PHOTOS, PHOTO_BONUS, TAPES, line } from '../data/dialogue';
import { t } from '../data/localization';
import { Interactable, SimpleInteractable } from '../interactions/Interactable';
import { ClockPuzzle } from '../puzzles/ClockPuzzle';
import { ToySoundPuzzle } from '../puzzles/ToySoundPuzzle';
import { Builder } from './Builders';
import { TriggerVolume, WallOpening } from './Collision';
import { DoorSystem } from './DoorController';
import { FixtureConfig } from './LightingManager';
import { MaterialKey } from './Materials';
import { NavGraph } from './Nav';
import { RoomBounds, SurfaceKind } from './LevelTypes';
import { DOORWAYS, ROOM_RECTS, WALL_MOUNT } from './floorPlan';
import {
  cabinet,
  childDrawing,
  createSwingDoor,
  fluorescentFixture,
  makeDoorInteractable,
  makeNote,
  makePhotoPickup,
  makePickup,
  makeTapePlayer,
  table,
} from './Props';
import { SecurityFeed, buildMonitor } from './Screens';
import type { Ambience } from '../audio/TensionAudioSystem';

export interface FloorBuildContext {
  builder: Builder;
  doors: DoorSystem;
  interactables: Interactable[];
  fixtures: FixtureConfig[];
  rooms: RoomBounds[];
  props: Map<string, THREE.Object3D>;
  feeds: SecurityFeed[];
  nav: NavGraph;
  triggers: TriggerVolume[];
  state: GameState;
  variant: number;
  chapter: number;
  rng: RNG;
  updaters: Array<(delta: number, ctx: GameContext) => void>;
  clockPuzzle: ClockPuzzle | null;
  toyPuzzle: ToySoundPuzzle | null;
}

type Side = 'north' | 'south' | 'east' | 'west';

export interface RoomOptions {
  id: string;
  rect: { minX: number; maxX: number; minZ: number; maxZ: number; height: number };
  floor: MaterialKey;
  surface: SurfaceKind;
  ceiling?: MaterialKey;
  wall?: MaterialKey;
  skip?: Side[];
  openings?: Partial<Record<Side, WallOpening[]>>;
  enclosed?: boolean;
  ambience?: Ambience;
  noCeiling?: boolean;
}

/** Builds four walls, a floor and a ceiling, and registers the room bounds. */
export function buildRoom(fc: FloorBuildContext, options: RoomOptions): void {
  const { builder } = fc;
  const { minX, maxX, minZ, maxZ, height } = options.rect;
  const wall = options.wall ?? 'wall';
  const skip = new Set(options.skip ?? []);

  builder.slab(`${options.id}_floor`, minX, minZ, maxX, maxZ, 0, options.floor, { tile: 1.5 });
  if (!options.noCeiling) {
    builder.slab(
      `${options.id}_ceil`,
      minX,
      minZ,
      maxX,
      maxZ,
      height + 0.12,
      options.ceiling ?? 'ceiling',
      { tile: 1.6 },
    );
  }

  if (!skip.has('north')) {
    builder.wall({
      id: `${options.id}_n`,
      axis: 'x',
      at: minZ,
      from: minX,
      to: maxX,
      height,
      material: wall,
      openings: options.openings?.north,
    });
  }
  if (!skip.has('south')) {
    builder.wall({
      id: `${options.id}_s`,
      axis: 'x',
      at: maxZ,
      from: minX,
      to: maxX,
      height,
      material: wall,
      openings: options.openings?.south,
    });
  }
  if (!skip.has('west')) {
    builder.wall({
      id: `${options.id}_w`,
      axis: 'z',
      at: minX,
      from: minZ,
      to: maxZ,
      height,
      material: wall,
      openings: options.openings?.west,
    });
  }
  if (!skip.has('east')) {
    builder.wall({
      id: `${options.id}_e`,
      axis: 'z',
      at: maxX,
      from: minZ,
      to: maxZ,
      height,
      material: wall,
      openings: options.openings?.east,
    });
  }

  fc.rooms.push({
    id: options.id,
    minX,
    maxX,
    minZ,
    maxZ,
    surface: options.surface,
    enclosed: options.enclosed ?? true,
    ambience: options.ambience ?? 'apartment',
  });
}

/**
 * Hangs one of the optional photographs, unless this run has already taken it.
 * Floor 0 is rebuilt from scratch on every arrival, so the flag is the only
 * thing that remembers.
 */
export function placePhoto(
  fc: FloorBuildContext,
  index: number,
  position: [number, number, number],
  rotationY: number,
): void {
  const photo = PHOTOS[index];
  if (!photo || fc.state.flag(`found_${photo.id}`)) return;
  fc.interactables.push(makePhotoPickup(fc.builder, photo, position, rotationY));
}

function navNode(fc: FloorBuildContext, id: string, x: number, z: number, room?: string): void {
  fc.nav.add({ id, x, z, links: [], room });
}

/* ------------------------------------------------------------------ */
/* Apartment 01 — the fuse and the shutter switch                      */
/* ------------------------------------------------------------------ */

export function buildApartment01(fc: FloorBuildContext): void {
  const rect = ROOM_RECTS.apt01;
  buildRoom(fc, {
    id: 'apt01',
    rect,
    floor: 'wood',
    surface: 'wood',
    skip: ['south'],
    ambience: 'apartment',
  });

  const doorway = DOORWAYS.apt01;
  const handle = createSwingDoor(fc.builder, fc.doors, {
    id: 'door_apt01',
    axis: 'x',
    at: doorway.at,
    from: doorway.from,
    to: doorway.to,
    swing: Math.PI / 2,
    material: 'doorWood',
  });
  fc.interactables.push(makeDoorInteractable(handle, { sound: 'wood' }));
  fc.props.set('door_apt01', handle.pivot);

  fc.fixtures.push(fluorescentFixture(fc.builder, 'apt01_light', 4.4, -3.6, 2.42, { length: 0.9 }));

  // Divider wall making a back nook.
  fc.builder.wall({
    id: 'apt01_partition',
    axis: 'z',
    at: 4.7,
    from: -6.4,
    to: -4.5,
    height: rect.height,
    material: 'wall',
  });

  table(fc.builder, 'apt01_table', 3.1, -5.6, 0.9, 0.55, 0.76);
  cabinet(fc.builder, 'apt01_cabinet', [6.1, 0.45, -2.6], [0.5, 0.9, 1.2]);

  fc.interactables.push(
    makePickup(fc.builder, 'fuse', 'נתיך', [3.1, 0.83, -5.6], [0.09, 0.13, 0.09], 'metal', (ctx) => {
      ctx.say(line('c1_fuse_found'), 3.2);
      ctx.setObjective('c1_panel');
    }),
  );

  fc.interactables.push(makeNote(fc.builder, NOTES.note_switch, [5.6, 1.55, rect.minZ + WALL_MOUNT], 0));
  fc.interactables.push(makeTapePlayer(fc.builder, TAPES.tape_2, [6.05, 0.95, -2.6], -Math.PI / 2));
  placePhoto(fc, 1, [rect.minX + WALL_MOUNT, 1.28, -3.2], Math.PI / 2);

  navNode(fc, 'apt01_door', 4.3, -2.0, 'apt01');
  navNode(fc, 'apt01_mid', 3.6, -4.4, 'apt01');
  navNode(fc, 'apt01_back', 5.6, -5.8, 'apt01');
  fc.nav.link('apt01_door', 'apt01_mid');
  fc.nav.link('apt01_mid', 'apt01_back');
}

/* ------------------------------------------------------------------ */
/* The alcove that should not exist                                    */
/* ------------------------------------------------------------------ */

export function buildAlcove(fc: FloorBuildContext): void {
  const rect = ROOM_RECTS.alcove;
  buildRoom(fc, {
    id: 'alcove',
    rect,
    floor: 'floor',
    surface: 'terrazzo',
    skip: ['south'],
    ambience: 'apartment',
  });

  // Sealed behind a wall until the anomaly opens it.
  const seal = fc.builder.box({
    id: 'alcove_seal',
    material: 'wall',
    center: [(DOORWAYS.alcove.from + DOORWAYS.alcove.to) / 2, DOORWAYS.alcove.height / 2, DOORWAYS.alcove.at],
    size: [DOORWAYS.alcove.to - DOORWAYS.alcove.from, DOORWAYS.alcove.height, 0.2],
    collide: true,
    tile: 2,
  });
  fc.props.set('alcove_seal', seal);

  const handle = createSwingDoor(fc.builder, fc.doors, {
    id: 'door_alcove',
    axis: 'x',
    at: DOORWAYS.alcove.at,
    from: DOORWAYS.alcove.from,
    to: DOORWAYS.alcove.to,
    swing: Math.PI / 2,
    material: 'doorWood',
  });
  handle.pivot.visible = false;
  fc.props.set('door_alcove', handle.pivot);
  const doorItem = makeDoorInteractable(handle, { sound: 'wood' });
  doorItem.enabled = false;
  fc.interactables.push(doorItem);

  fc.fixtures.push(
    fluorescentFixture(fc.builder, 'alcove_light', 8.8, -3.0, 2.3, { length: 0.7, on: false, intensity: 0.8 }),
  );

  navNode(fc, 'alcove_in', 8.9, -3.0, 'alcove');
}

/* ------------------------------------------------------------------ */
/* Apartment 03 — the clocks                                           */
/* ------------------------------------------------------------------ */

export function buildApartment03(fc: FloorBuildContext): void {
  const rect = ROOM_RECTS.apt03;
  buildRoom(fc, {
    id: 'apt03',
    rect,
    floor: 'wood',
    surface: 'wood',
    skip: ['south'],
    openings: {
      north: [{ start: 17.4, end: 18.4, bottom: 0, top: 2.05 }],
    },
    ambience: 'apartment',
  });

  const service = ROOM_RECTS.service;
  buildRoom(fc, {
    id: 'service',
    rect: service,
    floor: 'concrete',
    surface: 'metal',
    wall: 'concrete',
    skip: ['south'],
    ambience: 'apartment',
  });

  // Internal partitions: hall / living / kitchen.
  fc.builder.wall({
    id: 'apt03_p1',
    axis: 'x',
    at: -5.0,
    from: 11.0,
    to: 15.4,
    height: rect.height,
    openings: [{ start: 12.3, end: 13.3, bottom: 0, top: 2.05 }],
  });
  fc.builder.wall({
    id: 'apt03_p2',
    axis: 'z',
    at: 15.4,
    from: -9.6,
    to: -1.4,
    height: rect.height,
    openings: [
      { start: -3.6, end: -2.6, bottom: 0, top: 2.05 },
      { start: -8.6, end: -7.6, bottom: 0, top: 2.05 },
    ],
  });

  const doorway = DOORWAYS.apt03;
  const handle = createSwingDoor(fc.builder, fc.doors, {
    id: 'door_apt03',
    axis: 'x',
    at: doorway.at,
    from: doorway.from,
    to: doorway.to,
    swing: Math.PI / 2,
    material: 'doorWood',
    locked: fc.chapter < 3,
  });
  fc.props.set('door_apt03', handle.pivot);
  fc.interactables.push(
    makeDoorInteractable(handle, {
      sound: 'wood',
      canOpen: (ctx) => ctx.state.run.chapter >= 3,
      lockedMessage: t('toast.no_key'),
    }),
  );

  const serviceDoor = createSwingDoor(fc.builder, fc.doors, {
    id: 'door_service',
    axis: 'x',
    at: -9.6,
    from: 17.4,
    to: 18.4,
    swing: -Math.PI / 2,
    material: 'doorMetal',
    locked: true,
  });
  fc.props.set('door_service', serviceDoor.pivot);
  fc.interactables.push(
    makeDoorInteractable(serviceDoor, {
      sound: 'metal',
      canOpen: (ctx) => ctx.state.isSolved('puzzle_clocks'),
      lockedMessage: t('toast.no_key'),
    }),
  );

  fc.fixtures.push(fluorescentFixture(fc.builder, 'apt03_hall', 12.6, -3.2, 2.46, { length: 0.8 }));
  fc.fixtures.push(fluorescentFixture(fc.builder, 'apt03_living', 13.2, -7.2, 2.46, { length: 1.0 }));
  fc.fixtures.push(
    fluorescentFixture(fc.builder, 'apt03_kitchen', 17.4, -5.4, 2.46, { length: 0.9, color: 0xe8e4cf }),
  );
  fc.fixtures.push(
    fluorescentFixture(fc.builder, 'service_light', 18.1, -11.0, 2.3, { length: 0.7, intensity: 1.0 }),
  );

  // Furniture.
  table(fc.builder, 'apt03_hall_table', 12.1, -2.6, 0.8, 0.45, 0.74);
  table(fc.builder, 'apt03_living_table', 13.4, -7.4, 1.1, 0.6, 0.5);
  cabinet(fc.builder, 'apt03_sofa', [14.4, 0.35, -6.0], [0.85, 0.7, 1.9], 'fabric');
  cabinet(fc.builder, 'apt03_counter', [17.4, 0.45, -8.9], [3.6, 0.9, 0.6], 'wood');
  cabinet(fc.builder, 'apt03_fridge', [19.0, 0.85, -7.4], [0.7, 1.7, 0.7], 'metal');
  cabinet(fc.builder, 'apt03_bed', [17.6, 0.28, -3.0], [1.6, 0.55, 2.0], 'fabric');

  // The television that runs ahead of the player.
  const tv = buildMonitor(
    (object) => fc.builder.addObject(object),
    (geometry) => fc.builder.trackGeometry(geometry),
    (material) => fc.builder.own(material),
    {
      position: [11.28, 1.15, -7.4],
      rotationY: Math.PI / 2,
      width: 0.62,
      height: 0.46,
      boost: fc.builder.emissiveBoost,
    },
  );
  const tvFeed = new SecurityFeed(tv.feedSurface, 'corridor', 10);
  fc.feeds.push(tvFeed);
  fc.props.set('apt03_tv', tv.group);
  cabinet(fc.builder, 'apt03_tv_stand', [11.5, 0.42, -7.4], [0.5, 0.84, 0.9], 'wood');

  fc.interactables.push(
    new SimpleInteractable(
      'apt03_tv_watch',
      'screen',
      tv.screenMesh,
      () => t('prompt.watch'),
      (ctx) => {
        ctx.say(tvFeed.lead > 0 ? line('c3_tv_ahead') : line('c3_tv_live'), 3.4);
        ctx.tension.add(6);
        tvFeed.glitch(0.5);
      },
      { maxDistance: 2.6 },
    ),
  );

  // Clocks.
  const clocks = new ClockPuzzle(fc.builder, [
    { id: 'clock_1', position: [12.2, 1.72, -1.5], rotationY: Math.PI },
    { id: 'clock_2', position: [11.12, 1.72, -6.4], rotationY: Math.PI / 2 },
    { id: 'clock_3', position: [13.6, 1.72, -9.52], rotationY: 0 },
    { id: 'clock_4', position: [19.38, 1.72, -5.2], rotationY: -Math.PI / 2 },
  ]);
  clocks.onSolved = (ctx) => {
    serviceDoor.door.locked = false;
    ctx.say(line('c3_solved'), 3.5);
    ctx.setObjective('c3_service');
    ctx.checkpoint('c3_solved');
  };
  if (fc.state.isSolved(clocks.id)) {
    clocks.forceSolved();
    serviceDoor.door.locked = false;
  }
  fc.clockPuzzle = clocks;
  fc.interactables.push(...clocks.interactables);
  fc.updaters.push((delta, ctx) => clocks.update(delta, ctx));

  // Clues.
  fc.interactables.push(makeNote(fc.builder, NOTES.note_order, [18.62, 1.35, -7.4], -Math.PI / 2));
  fc.interactables.push(makeNote(fc.builder, NOTES.note_clock_hour, [12.1, 0.79, -2.6], Math.PI));
  fc.interactables.push(makeNote(fc.builder, NOTES.note_clock_number, [11.12, 1.3, -8.4], Math.PI / 2));
  fc.interactables.push(makeNote(fc.builder, NOTES.note_clock_last, [17.6, 0.86, -3.0], Math.PI));
  fc.interactables.push(makeTapePlayer(fc.builder, TAPES.tape_3, [13.4, 0.54, -7.4], Math.PI));
  // West of the apt03_p2 partition, which lands exactly on x = 15.4.
  placePhoto(fc, 4, [12.4, 1.24, rect.minZ + WALL_MOUNT], 0);

  // Service room contents.
  fc.interactables.push(makeTapePlayer(fc.builder, TAPES.tape_4, [18.1, 0.8, -11.4], Math.PI));
  table(fc.builder, 'service_table', 18.1, -11.4, 1.0, 0.6, 0.76);
  fc.interactables.push(makeNote(fc.builder, NOTES.note_report, [service.minX + WALL_MOUNT, 1.4, -11.0], Math.PI / 2));
  fc.interactables.push(makeNote(fc.builder, NOTES.note_system, [service.maxX - WALL_MOUNT, 1.4, -11.6], -Math.PI / 2));

  // A dial telephone in the hall — rings on its own later.
  const phone = fc.builder.box({
    id: 'apt03_phone',
    material: 'darkMetal',
    center: [12.1, 0.82, -2.45],
    size: [0.22, 0.12, 0.16],
    collide: false,
    castShadow: true,
  });
  fc.props.set('apt03_phone', phone);
  fc.interactables.push(
    new SimpleInteractable(
      'apt03_phone_use',
      'panel',
      phone,
      () => t('prompt.inspect'),
      (ctx) => {
        ctx.audio.play('line_noise', { volume: 0.5 });
        ctx.say('אין קו.', 2.4);
      },
      { maxDistance: 2.2 },
    ),
  );

  navNode(fc, 'apt03_door', 13.3, -2.0, 'apt03');
  navNode(fc, 'apt03_hall', 12.6, -3.8, 'apt03');
  navNode(fc, 'apt03_living', 13.2, -7.0, 'apt03');
  navNode(fc, 'apt03_kitchen', 17.2, -8.2, 'apt03');
  navNode(fc, 'apt03_bed', 17.6, -3.1, 'apt03');
  navNode(fc, 'service_in', 18.1, -10.6, 'service');
  fc.nav.link('apt03_door', 'apt03_hall');
  fc.nav.link('apt03_hall', 'apt03_living');
  fc.nav.link('apt03_hall', 'apt03_bed');
  fc.nav.link('apt03_living', 'apt03_kitchen');
  fc.nav.link('apt03_bed', 'apt03_kitchen');
  fc.nav.link('apt03_kitchen', 'service_in');
}

/* ------------------------------------------------------------------ */
/* Apartment 02 — the children's room                                  */
/* ------------------------------------------------------------------ */

export function buildApartment02(fc: FloorBuildContext): void {
  const hall = ROOM_RECTS.apt02hall;
  const kids = ROOM_RECTS.apt02kids;

  buildRoom(fc, {
    id: 'apt02hall',
    rect: hall,
    floor: 'wood',
    surface: 'wood',
    skip: ['north', 'south'],
    ambience: 'apartment',
  });
  buildRoom(fc, {
    id: 'apt02kids',
    rect: kids,
    floor: 'carpet',
    surface: 'carpet',
    ambience: 'apartment',
    openings: {
      north: [{ start: hall.minX, end: hall.maxX, bottom: 0, top: 2.1 }],
    },
  });
  // Cap the hall's far end where it meets the kids' room walls.
  fc.builder.wall({
    id: 'apt02hall_cap_w',
    axis: 'x',
    at: hall.maxZ,
    from: kids.minX,
    to: hall.minX,
    height: hall.height,
    skirting: false,
    collide: false,
  });

  const doorway = DOORWAYS.apt02;
  const handle = createSwingDoor(fc.builder, fc.doors, {
    id: 'door_apt02',
    axis: 'x',
    at: doorway.at,
    from: doorway.from,
    to: doorway.to,
    swing: -Math.PI / 2,
    material: 'doorWood',
    locked: fc.chapter < 4,
  });
  fc.props.set('door_apt02', handle.pivot);
  fc.interactables.push(
    makeDoorInteractable(handle, {
      sound: 'wood',
      canOpen: (ctx) => ctx.state.run.chapter >= 4,
    }),
  );

  fc.fixtures.push(
    fluorescentFixture(fc.builder, 'apt02_hall_light', 8.4, 4.4, 2.32, {
      length: 0.7,
      color: 0xd6c9a8,
      intensity: 0.85,
    }),
  );
  fc.fixtures.push(
    fluorescentFixture(fc.builder, 'apt02_kids_light', 8.4, 9.6, 2.42, {
      length: 0.8,
      color: 0xe8c98a,
      intensity: 1.05,
    }),
  );

  // Furniture.
  cabinet(fc.builder, 'kids_bed', [5.9, 0.28, 8.6], [1.0, 0.55, 1.9], 'fabric');
  cabinet(fc.builder, 'kids_shelf', [10.4, 0.55, 8.0], [0.4, 1.1, 1.4], 'wood');
  table(fc.builder, 'kids_table', 7.4, 11.2, 0.9, 0.6, 0.52);

  // The wardrobe the player can hide inside, once.
  const wardrobe = cabinet(fc.builder, 'kids_wardrobe', [11.4, 1.0, 11.6], [1.1, 2.0, 1.1], 'wood');
  fc.props.set('kids_wardrobe', wardrobe);
  fc.interactables.push(
    new SimpleInteractable(
      'kids_hide',
      'hide',
      wardrobe,
      (ctx) => (ctx.state.flag('used_wardrobe') ? null : t('prompt.hide')),
      (ctx) => {
        if (ctx.state.flag('used_wardrobe')) return;
        ctx.state.setFlag('used_wardrobe');
        ctx.ui.hideSequence(ctx);
      },
      { maxDistance: 2.4 },
    ),
  );

  // Drawings that describe what the player is about to do.
  const drawingKinds = [0, 1, 2, 3, 4, 5];
  const drawingSpots: Array<{ position: [number, number, number]; rotationY: number }> = [
    { position: [kids.minX + WALL_MOUNT, 1.5, 8.4], rotationY: Math.PI / 2 },
    { position: [kids.minX + WALL_MOUNT, 1.5, 9.6], rotationY: Math.PI / 2 },
    { position: [7.0, 1.55, kids.minZ + WALL_MOUNT], rotationY: 0 },
    { position: [9.6, 1.55, kids.minZ + WALL_MOUNT], rotationY: 0 },
    { position: [kids.maxX - WALL_MOUNT, 1.5, 9.0], rotationY: -Math.PI / 2 },
    { position: [9.0, 1.5, kids.maxZ - WALL_MOUNT], rotationY: Math.PI },
  ];
  const drawings = drawingSpots.map((spot, index) =>
    childDrawing(fc.builder, drawingKinds[index], spot.position, spot.rotationY),
  );
  fc.props.set('kids_drawings', drawings[0].mesh);
  fc.updaters.push((_, ctx) => {
    // Drawings drift as the player progresses; cheap but effective.
    const chapter = ctx.state.run.chapter;
    if (ctx.state.flag(`drawings_v${chapter}`)) return;
    ctx.state.setFlag(`drawings_v${chapter}`);
    drawings.forEach((drawing, index) => drawing.setKind((drawingKinds[index] + chapter) % 6));
  });

  fc.interactables.push(makeNote(fc.builder, NOTES.note_toys, [10.18, 1.2, 8.0], -Math.PI / 2));
  placePhoto(fc, 3, [kids.minX + WALL_MOUNT, 1.2, 10.2], Math.PI / 2);

  // The toy sequence puzzle.
  const sequence = Array.from({ length: 6 }, () => fc.rng.int(0, 3));
  const toys = new ToySoundPuzzle(
    fc.builder,
    [
      { x: 6.6, z: 10.4 },
      { x: 7.8, z: 11.0 },
      { x: 9.2, z: 10.6 },
      { x: 10.4, z: 9.8 },
    ],
    sequence,
    [8.4, 1.55, kids.maxZ - WALL_MOUNT],
    Math.PI,
  );
  const prizeCabinet = cabinet(fc.builder, 'kids_prize', [5.6, 0.5, 11.6], [1.0, 1.0, 1.0], 'wood');
  const key = makePickup(
    fc.builder,
    'control_key',
    'מפתח בקרה',
    [5.6, 1.08, 11.6],
    [0.05, 0.02, 0.13],
    'metal',
    (ctx) => {
      ctx.setObjective('c5_door');
      ctx.checkpoint('c4_key');
      ctx.completeChapter();
    },
  );
  key.enabled = false;
  (key.hitbox as THREE.Mesh).visible = false;
  toys.onSolved = (ctx) => {
    key.enabled = true;
    (key.hitbox as THREE.Mesh).visible = true;
    prizeCabinet.scale.y = 1;
    ctx.setObjective('c4_key');
    ctx.checkpoint('c4_solved');
  };
  if (fc.state.isSolved(toys.id)) {
    toys.forceSolved();
    if (!fc.state.hasItem('control_key')) {
      key.enabled = true;
      (key.hitbox as THREE.Mesh).visible = true;
    }
  }
  if (fc.state.hasItem('control_key')) {
    key.enabled = false;
    (key.hitbox as THREE.Mesh).visible = false;
  }
  fc.toyPuzzle = toys;
  fc.interactables.push(...toys.interactables, key);
  fc.updaters.push((delta, ctx) => toys.update(delta, ctx));

  navNode(fc, 'apt02_door', 8.3, 2.0, 'apt02hall');
  navNode(fc, 'apt02_hall_mid', 8.4, 5.0, 'apt02hall');
  navNode(fc, 'apt02_kids_in', 8.4, 8.0, 'apt02kids');
  navNode(fc, 'apt02_kids_toys', 8.4, 10.4, 'apt02kids');
  navNode(fc, 'apt02_kids_far', 6.0, 11.4, 'apt02kids');
  fc.nav.link('apt02_door', 'apt02_hall_mid');
  fc.nav.link('apt02_hall_mid', 'apt02_kids_in');
  fc.nav.link('apt02_kids_in', 'apt02_kids_toys');
  fc.nav.link('apt02_kids_toys', 'apt02_kids_far');
}

/* ------------------------------------------------------------------ */
/* Apartment 04 — tapes, and the way around during the chase           */
/* ------------------------------------------------------------------ */

export function buildApartment04(fc: FloorBuildContext): void {
  const rect = ROOM_RECTS.apt04;
  buildRoom(fc, {
    id: 'apt04',
    rect,
    floor: 'wood',
    surface: 'wood',
    skip: ['north'],
    ambience: 'apartment',
  });

  for (const key of ['apt04a', 'apt04b'] as const) {
    const doorway = DOORWAYS[key];
    const handle = createSwingDoor(fc.builder, fc.doors, {
      id: `door_${key}`,
      axis: 'x',
      at: doorway.at,
      from: doorway.from,
      to: doorway.to,
      swing: -Math.PI / 2,
      material: 'doorWood',
    });
    fc.props.set(`door_${key}`, handle.pivot);
    fc.interactables.push(makeDoorInteractable(handle, { sound: 'wood' }));
  }

  fc.fixtures.push(fluorescentFixture(fc.builder, 'apt04_light', 18.4, 4.4, 2.42, { length: 0.9 }));

  cabinet(fc.builder, 'apt04_sofa', [16.4, 0.35, 5.4], [0.9, 0.7, 1.8], 'fabric');
  // Deep in the room against the east wall. Anywhere nearer the corridor and it
  // stands squarely in the apt04b doorway, which is 20.2–21.0 wide.
  cabinet(fc.builder, 'apt04_shelf', [21.15, 0.6, 5.9], [0.4, 1.2, 1.6], 'wood');
  table(fc.builder, 'apt04_table', 18.6, 5.8, 1.0, 0.6, 0.72);

  fc.interactables.push(makeTapePlayer(fc.builder, TAPES.tape_1, [18.6, 0.79, 5.8], Math.PI));
  fc.interactables.push(makeNote(fc.builder, NOTES.note_floor, [rect.minX + WALL_MOUNT, 1.4, 4.0], Math.PI / 2));
  fc.interactables.push(makeNote(fc.builder, NOTES.note_mirror, [rect.maxX - WALL_MOUNT, 1.4, 5.6], -Math.PI / 2));
  placePhoto(fc, 2, [rect.maxX - WALL_MOUNT, 1.3, 3.2], -Math.PI / 2);

  navNode(fc, 'apt04_a', 18.0, 2.2, 'apt04');
  navNode(fc, 'apt04_mid', 19.2, 4.6, 'apt04');
  navNode(fc, 'apt04_b', 20.6, 2.2, 'apt04');
  fc.nav.link('apt04_a', 'apt04_mid');
  fc.nav.link('apt04_mid', 'apt04_b');
}

/* ------------------------------------------------------------------ */
/* The control room                                                    */
/* ------------------------------------------------------------------ */

export function buildControlRoom(fc: FloorBuildContext): void {
  const rect = ROOM_RECTS.control;
  buildRoom(fc, {
    id: 'control',
    rect,
    floor: 'concrete',
    surface: 'metal',
    wall: 'concrete',
    skip: ['south'],
    ambience: 'control',
  });

  const doorway = DOORWAYS.control;
  const handle = createSwingDoor(fc.builder, fc.doors, {
    id: 'door_control',
    axis: 'x',
    at: doorway.at,
    from: doorway.from,
    to: doorway.to,
    swing: Math.PI / 2,
    material: 'doorMetal',
    locked: true,
    speed: 2.2,
  });
  fc.props.set('door_control', handle.pivot);
  fc.interactables.push(
    makeDoorInteractable(handle, {
      sound: 'metal',
      canOpen: (ctx) => ctx.state.hasItem('control_key'),
      lockedMessage: t('toast.no_key'),
      onOpen: (ctx) => {
        ctx.say(line('c5_safe'), 3);
      },
    }),
  );

  // A false wall hides it until chapter 5.
  const cover = fc.builder.box({
    id: 'control_cover',
    material: 'wall',
    center: [(doorway.from + doorway.to) / 2, doorway.height / 2, doorway.at],
    size: [doorway.to - doorway.from, doorway.height, 0.16],
    collide: true,
    tile: 2,
  });
  fc.props.set('control_cover', cover);

  fc.fixtures.push(
    fluorescentFixture(fc.builder, 'control_light_a', 22.0, -3.4, 2.52, { length: 1.1, color: 0xcfe0ea }),
  );
  fc.fixtures.push(
    fluorescentFixture(fc.builder, 'control_light_b', 24.5, -6.4, 2.52, { length: 1.1, color: 0xcfe0ea }),
  );

  // Monitor wall.
  const kinds = ['lobby', 'elevator', 'corridor', 'apartment', 'player', 'past', 'outside', 'unopened', 'duplicate'] as const;
  let index = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const monitor = buildMonitor(
        (object) => fc.builder.addObject(object),
        (geometry) => fc.builder.trackGeometry(geometry),
        (material) => fc.builder.own(material),
        {
          position: [20.28, 1.95 - row * 0.52, -3.0 - col * 0.62],
          rotationY: Math.PI / 2,
          width: 0.44,
          height: 0.34,
          depth: 0.24,
          boost: fc.builder.emissiveBoost,
        },
      );
      const feed = new SecurityFeed(monitor.feedSurface, kinds[index % kinds.length], 8);
      feed.lead = index === 4 ? 1.6 : 0;
      fc.feeds.push(feed);
      index++;
    }
  }

  cabinet(fc.builder, 'control_desk', [21.4, 0.4, -4.4], [1.0, 0.8, 3.4], 'darkMetal');
  cabinet(fc.builder, 'control_rack', [25.9, 0.9, -7.4], [0.8, 1.8, 1.4], 'darkMetal');
  table(fc.builder, 'control_table', 23.6, -6.8, 1.4, 0.8, 0.76, 'darkMetal');

  fc.interactables.push(makeTapePlayer(fc.builder, TAPES.tape_5, [23.6, 0.82, -6.8], Math.PI));
  fc.interactables.push(makeNote(fc.builder, NOTES.note_experiment, [rect.maxX - WALL_MOUNT, 1.45, -5.2], -Math.PI / 2));
  fc.interactables.push(makeNote(fc.builder, NOTES.note_versions, [rect.maxX - WALL_MOUNT, 1.45, -6.6], -Math.PI / 2));

  // The reward for finding all five: the sixth print, already developed, pinned
  // where the others were filed. It is read, not taken.
  if (fc.state.flag('photos_all')) {
    fc.interactables.push(
      makePhotoPickup(fc.builder, PHOTO_BONUS, [rect.maxX - WALL_MOUNT, 1.45, -3.8], -Math.PI / 2, { collect: false }),
    );
  }

  // The three ways this ends.
  const endingSpecs: Array<{ id: string; ending: 1 | 2 | 3; center: [number, number, number]; color: number }> = [
    { id: 'ending_lift', ending: 1, center: [23.2, 1.25, -1.52], color: 0x4c8f56 },
    { id: 'ending_stop', ending: 2, center: [24.6, 1.25, -1.52], color: 0xb08a34 },
    { id: 'ending_erase', ending: 3, center: [26.0, 1.25, -1.52], color: 0xa63c33 },
  ];
  const endingLabels: Record<number, string> = {
    1: line('ending1_choice'),
    2: line('ending2_choice'),
    3: line('ending3_choice'),
  };
  for (const spec of endingSpecs) {
    const panel = fc.builder.box({
      id: `${spec.id}_panel`,
      material: 'metal',
      center: spec.center,
      size: [0.34, 0.4, 0.08],
      collide: false,
    });
    const leverGeometry = new THREE.BoxGeometry(0.06, 0.18, 0.06);
    fc.builder.trackGeometry(leverGeometry);
    const leverMaterial = fc.builder.own(new THREE.MeshLambertMaterial({ color: spec.color }));
    const lever = new THREE.Mesh(leverGeometry, leverMaterial);
    lever.position.set(spec.center[0], spec.center[1], spec.center[2] + 0.09);
    fc.builder.addObject(lever);
    lever.userData.interactableId = spec.id;

    fc.interactables.push(
      new SimpleInteractable(
        spec.id,
        'ending',
        panel,
        () => endingLabels[spec.ending],
        (ctx) => {
          lever.rotation.x = 0.7;
          ctx.audio.play('switch', { volume: 1 });
          ctx.playEnding(spec.ending);
        },
        { maxDistance: 2.6 },
      ),
    );
  }

  navNode(fc, 'control_door', 22.5, -2.0, 'control');
  navNode(fc, 'control_mid', 23.2, -4.6, 'control');
  navNode(fc, 'control_far', 25.4, -7.0, 'control');
  fc.nav.link('control_door', 'control_mid');
  fc.nav.link('control_mid', 'control_far');
}
