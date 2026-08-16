import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { GameState } from '../core/GameState';
import { RNG } from '../core/RNG';
import { NOTES, TAPES, line, localized } from '../data/dialogue';
import { t } from '../data/localization';
import { Interactable, SimpleInteractable } from '../interactions/Interactable';
import { ReplayDoorPuzzle } from '../puzzles/ReplayDoorPuzzle';
import {
  FloorBuildContext,
  buildApartment01,
  buildApartment02,
  buildApartment03,
  buildApartment04,
  buildAlcove,
  buildControlRoom,
  buildRoom,
  placePhoto,
} from './ApartmentBuilder';
import { Builder } from './Builders';
import { TriggerVolume, makeTrigger } from './Collision';
import { DoorSystem } from './DoorController';
import { buildElevatorCar } from './ElevatorController';
import { Frame } from './Frame';
import { LevelBuild } from './LevelTypes';
import { MaterialLibrary } from './Materials';
import { rememberedNote } from './Memory';
import { NavGraph } from './Nav';
import {
  apartmentPlate,
  cabinet,
  createSwingDoor,
  familyPhoto,
  fluorescentFixture,
  makeDoorInteractable,
  makeNote,
  makeTapePlayer,
  makeWallSwitch,
  noticeBoard,
  pipes,
  plasticChair,
  securityCamera,
  table,
} from './Props';
import { SecurityFeed } from './Screens';
import {
  blackWaterTexture,
  bleedTexture,
  rainWindowTexture,
  silhouetteTexture,
  softShadowTexture,
  wallFaceTexture,
  windowCorridorTexture,
} from './Textures';
import {
  CORRIDOR,
  CORRIDOR_FIXTURES,
  DOORWAYS,
  FLOOR_BOUNDS,
  LIFT_ORIGIN,
  ROOM_RECTS,
  SHUTTER_X,
  WALL_MOUNT,
} from './floorPlan';

export interface BuildParams {
  materials: MaterialLibrary;
  state: GameState;
  variant: number;
}

/* ================================================================== */
/* The lobby (prologue)                                                */
/* ================================================================== */

export function buildLobby(params: BuildParams): LevelBuild {
  const builder = new Builder(params.materials);
  const doors = new DoorSystem();
  const interactables: Interactable[] = [];
  const nav = new NavGraph();
  const fixtures: ReturnType<typeof fluorescentFixture>[] = [];
  const props = new Map<string, THREE.Object3D>();
  const triggers: TriggerVolume[] = [];
  const updaters: Array<(delta: number, ctx: GameContext) => void> = [];

  const LOBBY = { minX: -5, maxX: 5, minZ: -8, maxZ: 2, height: 3.0 };

  // --- Outside ---------------------------------------------------
  builder.slab('street', -11, 2, 11, 13, 0, 'concrete', { tile: 2.5 });
  builder.wall({
    id: 'facade',
    axis: 'x',
    at: LOBBY.maxZ,
    from: -11,
    to: 11,
    height: 7.5,
    material: 'concrete',
    tile: 2.4,
    openings: [{ start: -0.6, end: 0.6, bottom: 0, top: 2.15 }],
  });
  // Blank windows on the facade.
  for (let row = 0; row < 3; row++) {
    for (let col = -3; col <= 3; col++) {
      if (col === 0 && row === 0) continue;
      builder.decor({
        material: 'glassDark',
        center: [col * 2.4, 3.1 + row * 1.6, LOBBY.maxZ + 0.12],
        size: [1.0, 1.0, 0.06],
      });
    }
  }
  builder.decor({ material: 'darkMetal', center: [0, 2.35, 3.0], size: [3.0, 0.12, 1.6] });
  builder.wall({ id: 'street_wall_w', axis: 'z', at: -11, from: 2, to: 13, height: 7, material: 'concrete', collide: true });
  builder.wall({ id: 'street_wall_e', axis: 'z', at: 11, from: 2, to: 13, height: 7, material: 'concrete', collide: true });
  builder.wall({ id: 'street_wall_s', axis: 'x', at: 13, from: -11, to: 11, height: 7, material: 'concrete', collide: true });

  fixtures.push(
    fluorescentFixture(builder, 'street_light', 0, 2.9, 2.6, {
      length: 0.8,
      color: 0xe0c78c,
      intensity: 1.1,
    }),
  );

  // Rain: a cheap instanced streak field that always surrounds the player.
  const rainCount = 420;
  const rainGeometry = new THREE.BoxGeometry(0.012, 0.34, 0.012);
  builder.trackGeometry(rainGeometry);
  const rainMaterial = builder.own(
    new THREE.MeshBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.35 }),
  );
  const rain = new THREE.InstancedMesh(rainGeometry, rainMaterial, rainCount);
  rain.frustumCulled = false;
  const rainState = new Float32Array(rainCount * 3);
  const rainMatrix = new THREE.Matrix4();
  for (let i = 0; i < rainCount; i++) {
    rainState[i * 3] = (Math.random() - 0.5) * 22;
    rainState[i * 3 + 1] = Math.random() * 8;
    rainState[i * 3 + 2] = 2 + Math.random() * 11;
  }
  builder.addObject(rain);
  props.set('rain', rain);
  updaters.push((delta, ctx) => {
    if (ctx.camera.position.z < LOBBY.maxZ - 0.5) {
      rain.visible = false;
      return;
    }
    rain.visible = true;
    for (let i = 0; i < rainCount; i++) {
      rainState[i * 3 + 1] -= delta * (7 + (i % 5));
      if (rainState[i * 3 + 1] < 0) {
        rainState[i * 3 + 1] = 8;
        rainState[i * 3] = ctx.camera.position.x + (Math.random() - 0.5) * 22;
        rainState[i * 3 + 2] = 2 + Math.random() * 11;
      }
      rainMatrix.makeTranslation(rainState[i * 3], rainState[i * 3 + 1], rainState[i * 3 + 2]);
      rain.setMatrixAt(i, rainMatrix);
    }
    rain.instanceMatrix.needsUpdate = true;
  });

  // --- Lobby interior --------------------------------------------
  const fc: FloorBuildContext = {
    builder,
    doors,
    interactables,
    fixtures,
    rooms: [],
    props,
    feeds: [],
    nav,
    triggers,
    state: params.state,
    variant: params.variant,
    chapter: 0,
    rng: new RNG(params.state.run.seed ^ 0x5f5f),
    updaters,
    clockPuzzle: null,
    toyPuzzle: null,
  };

  buildRoom(fc, {
    id: 'lobby',
    rect: LOBBY,
    floor: 'floor',
    surface: 'terrazzo',
    ambience: 'lobby',
    enclosed: false,
    openings: {
      south: [{ start: -0.6, end: 0.6, bottom: 0, top: 2.15 }],
      north: [{ start: -0.58, end: 0.58, bottom: 0, top: 2.1 }],
    },
  });
  fc.rooms.push({
    id: 'street',
    minX: -11,
    maxX: 11,
    minZ: 2,
    maxZ: 13,
    surface: 'terrazzo',
    enclosed: false,
    ambience: 'outside',
  });

  fixtures.push(fluorescentFixture(builder, 'lobby_light_a', -1.6, -2.4, 2.86, { length: 1.2 }));
  fixtures.push(fluorescentFixture(builder, 'lobby_light_b', 1.6, -5.6, 2.86, { length: 1.2 }));

  pipes(builder, -4.6, 4.6, -7.2, 2.72);

  // Entrance door.
  const entrance = createSwingDoor(builder, doors, {
    id: 'door_entrance',
    axis: 'x',
    at: LOBBY.maxZ,
    from: -0.6,
    to: 0.6,
    height: 2.15,
    swing: -Math.PI / 2,
    material: 'doorMetal',
    speed: 1.1,
  });
  props.set('door_entrance', entrance.pivot);
  interactables.push(
    makeDoorInteractable(entrance, {
      sound: 'metal',
      onOpen: (ctx) => {
        ctx.setObjective('p_power');
        ctx.checkpoint('lobby');
      },
    }),
  );

  // Mailboxes and a stairwell door that is going to stay shut.
  for (let i = 0; i < 8; i++) {
    builder.decor({
      material: 'metal',
      center: [-4.82, 1.05 + (i % 4) * 0.28, -1.2 - Math.floor(i / 4) * 0.62],
      size: [0.06, 0.24, 0.56],
    });
  }
  const stairDoor = createSwingDoor(builder, doors, {
    id: 'door_stairs',
    axis: 'z',
    at: LOBBY.minX,
    from: -6.6,
    to: -5.6,
    swing: Math.PI / 2,
    material: 'doorMetal',
    locked: true,
  });
  interactables.push(
    makeDoorInteractable(stairDoor, {
      sound: 'metal',
      canOpen: () => false,
      lockedMessage: t('toast.no_key'),
    }),
  );

  const board = noticeBoard(builder, [4.82, 1.6, -1.6], -Math.PI / 2);
  props.set('notice_board', board.mesh);
  interactables.push(makeNote(builder, NOTES.note_board, [4.8, 1.05, -2.9], -Math.PI / 2));

  // Electrical cabinet — the prologue objective.
  const cabinetBox = cabinet(builder, 'lobby_cabinet', [4.72, 1.35, -5.0], [0.36, 1.0, 0.75], 'metal');
  props.set('lobby_cabinet', cabinetBox);
  interactables.push(makeNote(builder, NOTES.note_cabinet, [4.5, 1.85, -5.0], -Math.PI / 2));

  const cabinetSwitch = makeWallSwitch(
    builder,
    'lobby_power',
    [4.5, 1.35, -5.0],
    -Math.PI / 2,
    (ctx) => {
      if (ctx.state.flag('lobby_power')) return;
      ctx.state.setFlag('lobby_power');
      ctx.audio.play('power_up', { volume: 0.9 });
      ctx.world.lighting.setOn('*', true);
      ctx.world.elevator.powered = true;
      ctx.world.elevator.setDisplay('0');
      ctx.say(line('elevator_power_on'), 3);
      ctx.setObjective('p_elevator');
      ctx.bus.emit('power_changed', { on: true });
      ctx.checkpoint('lobby_power');
    },
    () => t('prompt.use'),
  );
  interactables.push(cabinetSwitch.interactable);

  table(builder, 'lobby_table', -3.4, -4.4, 1.0, 0.6, 0.74);
  plasticChair(builder, 'lobby_chair', -2.4, -4.4, 0.6);
  interactables.push(makeTapePlayer(builder, TAPES.tape_1, [-3.4, 0.79, -4.4], 0));

  // --- The lift ---------------------------------------------------
  const frame = new Frame(0, LOBBY.minZ - 0.1, 90);
  const rig = buildElevatorCar(builder, doors, frame);
  props.set('elevator', rig.group);

  // The car has its own light, so the lift is legible even with the floor dark.
  fixtures.push({
    id: 'lift_light',
    position: rig.lightPosition.clone(),
    color: 0xdfe4ea,
    intensity: 1.15,
    distance: 5.4,
    emissive: rig.lamp,
    on: true,
  });

  interactables.push(
    new SimpleInteractable(
      'lift_call',
      'button',
      builder.box({
        id: 'lift_call_plate',
        material: 'metal',
        center: [0.95, 1.2, LOBBY.minZ + 0.08],
        size: [0.14, 0.2, 0.05],
        collide: false,
      }),
      (ctx) => (ctx.state.flag('lobby_power') ? t('prompt.press') : t('toast.power_off')),
      (ctx) => {
        if (!ctx.state.flag('lobby_power')) {
          ctx.audio.play('button', { volume: 0.4 });
          ctx.say(line('elevator_no_power'), 2.6);
          return;
        }
        ctx.audio.play('button', { volume: 0.8 });
        ctx.audio.play('lift_door_open', { volume: 0.8 });
        ctx.world.elevator.openDoors();
        ctx.setObjective('p_press');
      },
      { maxDistance: 2.6, recordAs: 'elevator_button' },
    ),
  );

  interactables.push(makeLiftButton(rig.buttonMeshes[0], 'קומת קרקע'));

  triggers.push(
    makeTrigger('tut_enter', -1.2, 3.4, 1.2, 5.2, {
      onEnter: () => undefined,
    }),
  );

  nav.add({ id: 'street', x: 0, z: 6, links: [], room: 'street' });
  nav.add({ id: 'lobby_door', x: 0, z: 1.2, links: [], room: 'lobby' });
  nav.add({ id: 'lobby_mid', x: 0, z: -3.4, links: [], room: 'lobby' });
  nav.add({ id: 'lobby_lift', x: 0, z: -7.2, links: [], room: 'lobby' });
  nav.link('street', 'lobby_door');
  nav.link('lobby_door', 'lobby_mid');
  nav.link('lobby_mid', 'lobby_lift');

  return {
    id: 'lobby',
    variant: params.variant,
    builder,
    doors,
    interactables,
    triggers,
    nav,
    rooms: fc.rooms,
    props,
    screens: [],
    feeds: [],
    puzzles: { clocks: null, toys: null, shutter: null },
    fixtures,
    elevator: rig,
    spawn: { x: 0, z: 8.4, yaw: 0 },
    bounds: { minX: -11.5, maxX: 11.5, minZ: -11, maxZ: 13.5 },
    safePoint: { x: 0, z: 5 },
    update: (delta, ctx) => {
      for (const updater of updaters) updater(delta, ctx);
    },
  };
}

function makeLiftButton(mesh: THREE.Mesh, label: string): Interactable {
  mesh.userData.interactableId = 'lift_button_0';
  return new SimpleInteractable(
    'lift_button_0',
    'button',
    mesh,
    (ctx) => (ctx.world.elevator.powered ? label : t('toast.power_off')),
    (ctx) => {
      if (!ctx.world.elevator.powered) {
        ctx.audio.play('button', { volume: 0.35 });
        ctx.say(line('elevator_no_power'), 2.4);
        return;
      }
      ctx.audio.play('button', { volume: 0.9 });
      ctx.travelToFloorZero();
    },
    { maxDistance: 2.2, recordAs: 'elevator_button' },
  );
}

/* ================================================================== */
/* Floor 0                                                             */
/* ================================================================== */

export function buildFloorZero(params: BuildParams & { chapter: number }): LevelBuild {
  const builder = new Builder(params.materials);
  const doors = new DoorSystem();
  const interactables: Interactable[] = [];
  const nav = new NavGraph();
  const props = new Map<string, THREE.Object3D>();
  const feeds: SecurityFeed[] = [];
  const updaters: Array<(delta: number, ctx: GameContext) => void> = [];
  const triggers: TriggerVolume[] = [];
  const variantRng = new RNG((params.state.run.seed ^ (params.variant * 2654435761)) >>> 0);

  const fc: FloorBuildContext = {
    builder,
    doors,
    interactables,
    fixtures: [],
    rooms: [],
    props,
    feeds,
    nav,
    triggers,
    state: params.state,
    variant: params.variant,
    chapter: params.chapter,
    rng: variantRng,
    updaters,
    clockPuzzle: null,
    toyPuzzle: null,
  };

  // --- Corridor shell --------------------------------------------
  builder.slab('corridor_floor', CORRIDOR.x0 - 0.2, CORRIDOR.z0, CORRIDOR.x1, CORRIDOR.z1, 0, 'floor', {
    tile: 1.4,
  });
  builder.slab(
    'corridor_ceiling',
    CORRIDOR.x0 - 0.2,
    CORRIDOR.z0,
    CORRIDOR.x1,
    CORRIDOR.z1,
    CORRIDOR.height + 0.12,
    'ceiling',
    { tile: 1.6 },
  );

  builder.wall({
    id: 'corridor_n',
    axis: 'x',
    at: CORRIDOR.z0,
    from: CORRIDOR.x0 - 0.2,
    to: CORRIDOR.x1,
    height: CORRIDOR.height,
    openings: [DOORWAYS.apt01, DOORWAYS.alcove, DOORWAYS.apt03, DOORWAYS.control].map((d) => ({
      start: d.from,
      end: d.to,
      bottom: 0,
      top: d.height,
    })),
  });
  builder.wall({
    id: 'corridor_s',
    axis: 'x',
    at: CORRIDOR.z1,
    from: CORRIDOR.x0 - 0.2,
    to: CORRIDOR.x1,
    height: CORRIDOR.height,
    openings: [DOORWAYS.apt02, DOORWAYS.apt04a, DOORWAYS.apt04b].map((d) => ({
      start: d.from,
      end: d.to,
      bottom: 0,
      top: d.height,
    })),
  });
  builder.wall({
    id: 'corridor_w',
    axis: 'z',
    at: CORRIDOR.x0,
    from: CORRIDOR.z0,
    to: CORRIDOR.z1,
    height: CORRIDOR.height,
    openings: [{ start: -0.6, end: 0.6, bottom: 0, top: 2.1 }],
  });
  builder.wall({
    id: 'corridor_e',
    axis: 'z',
    at: CORRIDOR.x1,
    from: CORRIDOR.z0,
    to: CORRIDOR.z1,
    height: CORRIDOR.height,
    openings: [{ start: -0.8, end: 0.8, bottom: 1.0, top: 2.05 }],
  });

  fc.rooms.push({
    id: 'corridor',
    minX: CORRIDOR.x0 - 0.4,
    maxX: CORRIDOR.x1,
    minZ: CORRIDOR.z0,
    maxZ: CORRIDOR.z1,
    surface: 'terrazzo',
    enclosed: false,
    ambience: 'corridor',
  });

  // The window at the far end: it shows a corridor, not a street.
  const windowTexture = builder.ownTexture(rainWindowTexture());
  const windowPanel = builder.panel(
    windowTexture,
    1.6,
    1.05,
    [CORRIDOR.x1 - WALL_MOUNT, 1.52, 0],
    -Math.PI / 2,
    { emissive: true, name: 'corridor_window' },
  );
  windowPanel.userData.rainTexture = windowTexture;
  windowPanel.userData.corridorTexture = builder.ownTexture(windowCorridorTexture());
  props.set('corridor_window', windowPanel);
  // The surround sits behind the glass and reaches back into the opening; a
  // frame the pane is *inside* would swallow it.
  builder.decor({
    material: 'darkMetal',
    center: [CORRIDOR.x1 - 0.06, 1.52, 0],
    size: [0.1, 1.15, 1.72],
  });

  // Ceiling detail.
  pipes(builder, 1.0, CORRIDOR.x1 - 0.6, CORRIDOR.z0 + 0.35, 2.5);

  // Lighting.
  CORRIDOR_FIXTURES.forEach((x, index) => {
    const on = !(params.variant >= 2 && index === (params.variant % CORRIDOR_FIXTURES.length));
    fc.fixtures.push(
      fluorescentFixture(builder, `corridor_light_${index}`, x, 0, CORRIDOR.height - 0.08, {
        length: 1.15,
        on,
        intensity: 1.35,
      }),
    );
  });

  // --- The lift ---------------------------------------------------
  const frame = new Frame(LIFT_ORIGIN.x, LIFT_ORIGIN.z, 0);
  const rig = buildElevatorCar(builder, doors, frame);
  props.set('elevator', rig.group);

  // The car has its own light, so the lift is legible even with the floor dark.
  fc.fixtures.push({
    id: 'lift_light',
    position: rig.lightPosition.clone(),
    color: 0xdfe4ea,
    intensity: 1.15,
    distance: 5.4,
    emissive: rig.lamp,
    on: true,
  });

  interactables.push(makeLiftButton(rig.buttonMeshes[0], t('prompt.press')));

  // --- Corridor dressing -----------------------------------------
  const board = noticeBoard(builder, [2.0, 1.62, CORRIDOR.z0 + WALL_MOUNT], 0);
  props.set('corridor_board', board.mesh);
  props.set('corridor_board_api', board.mesh);
  (board.mesh.userData as { setMessage?: (message: string) => void }).setMessage = board.setMessage;

  // The floor writes its own notice. From the second arrival on, the committee
  // is quoting the player's behaviour profile back at them.
  const memory = rememberedNote(params.state);
  if (params.variant >= 2) board.setMessage(localized(memory.board));
  interactables.push(
    new SimpleInteractable(
      'corridor_board_read',
      'note',
      board.mesh,
      () => t('prompt.read'),
      (ctx) => {
        ctx.audio.play('paper', { volume: 0.5 });
        ctx.ui.showNote({
          id: 'corridor_board_read',
          title: params.variant >= 2 ? memory.title : NOTES.note_board.title,
          body: params.variant >= 2 ? memory.body : NOTES.note_board.body,
        });
      },
      { maxDistance: 2.5 },
    ),
  );

  const photo = familyPhoto(builder, [10.4, 1.6, CORRIDOR.z0 + WALL_MOUNT], 0);
  props.set('family_photo', photo.mesh);
  (photo.mesh.userData as { setVariant?: (variant: number) => void }).setVariant = photo.setVariant;
  photo.setVariant(params.variant >= 3 ? Math.min(4, params.variant - 2) : 0);

  const chairX = 16 + (params.variant % 3) * 0.6;
  const chair = plasticChair(builder, 'corridor_chair', chairX, -0.85, 0.4 + params.variant * 0.2);
  props.set('corridor_chair', chair);

  const camera = securityCamera(builder, 'corridor_camera', [21.6, 2.5, CORRIDOR.z0 + 0.22], Math.PI);
  props.set('corridor_camera', camera.group);
  props.set('corridor_camera_head', camera.head);

  // Apartment number plates. One of them is wrong from visit three onward.
  const plateSpecs: Array<{ text: string; position: [number, number, number]; rotationY: number }> = [
    { text: '01', position: [3.55, 1.85, CORRIDOR.z0 + WALL_MOUNT], rotationY: 0 },
    { text: '02', position: [9.05, 1.85, CORRIDOR.z1 - WALL_MOUNT], rotationY: Math.PI },
    { text: '03', position: [14.05, 1.85, CORRIDOR.z0 + WALL_MOUNT], rotationY: 0 },
    { text: '04', position: [18.75, 1.85, CORRIDOR.z1 - WALL_MOUNT], rotationY: Math.PI },
  ];
  const plates = plateSpecs.map((spec) => apartmentPlate(builder, spec.text, spec.position, spec.rotationY));
  props.set('plate_04', plates[3].mesh);
  (plates[3].mesh.userData as { setText?: (text: string) => void }).setText = plates[3].setText;

  // Electrical panel — where the fuse goes.
  const panelBox = cabinet(builder, 'corridor_panel', [2.6, 1.35, CORRIDOR.z1 - 0.16], [0.5, 0.85, 0.22], 'metal');
  props.set('corridor_panel', panelBox);
  interactables.push(
    new SimpleInteractable(
      'corridor_panel_use',
      'panel',
      panelBox,
      (ctx) =>
        ctx.state.flag('floor_power')
          ? null
          : ctx.state.hasItem('fuse')
            ? t('prompt.use')
            : t('toast.power_off'),
      (ctx) => {
        if (ctx.state.flag('floor_power')) return;
        if (!ctx.state.hasItem('fuse')) {
          ctx.audio.play('switch', { volume: 0.5 });
          ctx.ui.toast(t('toast.power_off'));
          return;
        }
        ctx.state.removeItem('fuse');
        ctx.state.setFlag('floor_power');
        ctx.audio.play('power_up', { volume: 1 });
        ctx.world.lighting.setOn('*', true);
        ctx.world.elevator.powered = true;
        ctx.world.elevator.setDisplay('0');
        ctx.say(line('c1_power_restored'), 3);
        ctx.bus.emit('power_changed', { on: true });
        ctx.setObjective('c1_return');
        ctx.completeChapter();
      },
      { maxDistance: 2.4, recordAs: 'switch' },
    ),
  );

  // Reset lever at the far end — the chapter 2 goal.
  const leverPlate = builder.box({
    id: 'reset_lever_plate',
    material: 'metal',
    center: [25.6, 1.3, CORRIDOR.z0 + 0.1],
    size: [0.3, 0.42, 0.1],
    collide: false,
  });
  const leverGeometry = new THREE.BoxGeometry(0.06, 0.22, 0.06);
  builder.trackGeometry(leverGeometry);
  const leverMesh = new THREE.Mesh(leverGeometry, builder.own(new THREE.MeshLambertMaterial({ color: 0xb43c30 })));
  leverMesh.position.set(25.6, 1.3, CORRIDOR.z0 + 0.18);
  builder.addObject(leverMesh);
  leverMesh.userData.interactableId = 'reset_lever';
  interactables.push(
    new SimpleInteractable(
      'reset_lever',
      'lever',
      leverPlate,
      (ctx) => (ctx.state.flag('lever_pulled') ? null : t('prompt.use')),
      (ctx) => {
        if (ctx.state.flag('lever_pulled')) return;
        ctx.state.setFlag('lever_pulled');
        leverMesh.rotation.x = 0.8;
        ctx.audio.play('switch', { volume: 1 });
        ctx.audio.play('power_up', { volume: 0.6 });
        ctx.say(line('c2_lever_done'), 3);
        ctx.setObjective('c2_return');
        ctx.completeChapter();
        ctx.checkpoint('c2_lever');
        // The first time the copy stops obeying the tape.
        ctx.mimic.lookAtPlayer(5);
        ctx.say(line('c2_mimic_looked'), 3);
      },
      { maxDistance: 2.6, recordAs: 'switch' },
    ),
  );

  interactables.push(makeNote(builder, NOTES.note_floor, [6.9, 1.35, CORRIDOR.z1 - WALL_MOUNT], Math.PI));

  // The first photograph, taped low by the lift where somebody knelt to leave it.
  placePhoto(fc, 0, [1.05, 0.95, CORRIDOR.z0 + WALL_MOUNT], 0);

  // --- Hidden props the anomaly director animates -------------------
  const falseWall = builder.box({
    id: 'false_end_wall',
    material: 'wall',
    center: [9.2, CORRIDOR.height / 2, 0],
    size: [0.22, CORRIDOR.height, CORRIDOR.z1 - CORRIDOR.z0],
    collide: true,
    tile: 2,
  });
  falseWall.visible = false;
  builder.collision.setSolid('false_end_wall', false);
  props.set('false_end_wall', falseWall);

  const shadowTexture = builder.ownTexture(softShadowTexture());
  const doorShadow = builder.panel(shadowTexture, 1.1, 0.7, [4.3, 0.02, CORRIDOR.z0 + 0.45], 0, {
    emissive: true,
    opacity: 0.8,
    name: 'door_shadow',
  });
  doorShadow.rotation.set(-Math.PI / 2, 0, 0);
  doorShadow.visible = false;
  (doorShadow.material as THREE.MeshBasicMaterial).depthWrite = false;
  props.set('door_shadow', doorShadow);

  const wrongShadow = builder.panel(shadowTexture, 0.9, 1.7, [4, 0.02, 0], 0, {
    emissive: true,
    opacity: 0.7,
    name: 'wrong_shadow',
  });
  wrongShadow.rotation.set(-Math.PI / 2, 0, 0);
  wrongShadow.visible = false;
  (wrongShadow.material as THREE.MeshBasicMaterial).depthWrite = false;
  props.set('wrong_shadow', wrongShadow);

  // Faces that press out of the corridor walls. Four of them, alternating
  // sides, hidden until something pushes.
  const faceTexture = builder.ownTexture(wallFaceTexture());
  const faces: THREE.Mesh[] = [];
  [
    { x: 6.2, side: -1 },
    { x: 11.6, side: 1 },
    { x: 16.4, side: -1 },
    { x: 20.9, side: 1 },
  ].forEach((spot, index) => {
    const z = spot.side < 0 ? CORRIDOR.z0 + WALL_MOUNT * 0.6 : CORRIDOR.z1 - WALL_MOUNT * 0.6;
    const face = builder.panel(faceTexture, 0.62, 0.86, [spot.x, 1.45, z], spot.side < 0 ? 0 : Math.PI, {
      emissive: true,
      opacity: 0,
      name: `wall_face_${index}`,
    });
    (face.material as THREE.MeshBasicMaterial).depthWrite = false;
    face.visible = false;
    faces.push(face);
    props.set(`wall_face_${index}`, face);
  });
  props.set('wall_faces', faces[0]);
  (faces[0].userData as { all?: THREE.Mesh[] }).all = faces;

  // Writing that soaks through the wallpaper opposite the lift.
  const bleed = builder.panel(
    builder.ownTexture(bleedTexture('0317')),
    1.5,
    0.75,
    [5.0, 1.6, CORRIDOR.z1 - WALL_MOUNT * 0.6],
    Math.PI,
    { emissive: true, opacity: 0, name: 'wall_bleed' },
  );
  (bleed.material as THREE.MeshBasicMaterial).depthWrite = false;
  bleed.visible = false;
  props.set('wall_bleed', bleed);

  // The corridor floor, when it stops being a floor.
  const water = builder.panel(
    builder.ownTexture(blackWaterTexture()),
    CORRIDOR.x1 - CORRIDOR.x0,
    CORRIDOR.z1 - CORRIDOR.z0,
    [(CORRIDOR.x0 + CORRIDOR.x1) / 2, 0.012, 0],
    0,
    { emissive: true, opacity: 0, name: 'black_water' },
  );
  water.rotation.set(-Math.PI / 2, 0, 0);
  (water.material as THREE.MeshBasicMaterial).depthWrite = false;
  water.visible = false;
  props.set('black_water', water);

  const hallFigure = builder.panel(
    builder.ownTexture(silhouetteTexture()),
    0.9,
    1.85,
    [25.4, 0.93, 0],
    -Math.PI / 2,
    { emissive: true, opacity: 0.9, name: 'hall_figure' },
  );
  hallFigure.visible = false;
  props.set('hall_figure', hallFigure);

  // A ghost that only shows up on the lift mirror.
  const mirrorGhost = builder.panel(
    builder.ownTexture(silhouetteTexture()),
    0.55,
    1.15,
    [rig.mirror.position.x + 0.04, 1.28, rig.mirror.position.z],
    rig.mirror.rotation.y,
    { emissive: true, opacity: 0, name: 'mirror_ghost' },
  );
  mirrorGhost.visible = false;
  props.set('mirror_ghost', mirrorGhost);

  props.set('lift_mirror', rig.mirror);

  // --- Rooms -------------------------------------------------------
  buildApartment01(fc);
  buildAlcove(fc);
  buildApartment03(fc);
  buildApartment02(fc);
  buildApartment04(fc);
  buildControlRoom(fc);

  // --- Shutter puzzle ----------------------------------------------
  const shutter = new ReplayDoorPuzzle(builder, doors, {
    x: SHUTTER_X,
    minZ: CORRIDOR.z0,
    maxZ: CORRIDOR.z1,
    height: 2.4,
    switchPosition: [5.7, 1.3, ROOM_RECTS.apt01.minZ + 0.1],
    switchRotation: 0,
  });
  interactables.push(...shutter.interactables);
  updaters.push((delta, ctx) => shutter.update(delta, ctx));
  props.set('shutter', shutter.door.pivot);

  // From chapter 3 on, the shutter is simply gone.
  if (params.chapter >= 3 || params.state.isSolved('puzzle_shutter')) {
    shutter.forceSolved();
  }

  // --- Corridor navigation ----------------------------------------
  const corridorNodes: string[] = [];
  for (let i = 0; i <= 12; i++) {
    const x = 0.9 + i * 2.1;
    if (x > CORRIDOR.x1 - 0.6) break;
    const id = `corr_${i}`;
    nav.add({ id, x, z: 0, links: [], room: 'corridor' });
    corridorNodes.push(id);
  }
  for (let i = 1; i < corridorNodes.length; i++) nav.link(corridorNodes[i - 1], corridorNodes[i]);
  nav.add({ id: 'lift_in', x: -1.0, z: 0, links: [], room: 'elevator' });
  nav.link('lift_in', corridorNodes[0]);

  const junctions: Array<[string, number]> = [
    ['apt01_door', 4.3],
    ['alcove_in', 8.9],
    ['apt02_door', 8.3],
    ['apt03_door', 13.3],
    ['apt04_a', 18.0],
    ['apt04_b', 20.6],
    ['control_door', 22.5],
  ];
  for (const [nodeId, x] of junctions) {
    let nearest = corridorNodes[0];
    let best = Infinity;
    for (const id of corridorNodes) {
      const node = nav.get(id);
      if (!node) continue;
      const distance = Math.abs(node.x - x);
      if (distance < best) {
        best = distance;
        nearest = id;
      }
    }
    nav.link(nodeId, nearest);
  }

  // --- Screens ------------------------------------------------------
  updaters.push((delta, ctx) => {
    for (const feed of feeds) feed.update(delta, ctx);
  });

  // --- Chapter gating -----------------------------------------------
  const controlCover = props.get('control_cover');
  const controlDoorPivot = props.get('door_control');
  if (controlCover && controlDoorPivot) {
    const revealed = params.chapter >= 5;
    controlCover.visible = !revealed;
    builder.collision.setSolid('control_cover', !revealed);
    controlDoorPivot.visible = revealed;
    const doorItem = interactables.find((item) => item.id === 'door_control');
    if (doorItem) doorItem.enabled = revealed;
  }

  const shutterVisible = params.chapter === 2 && !params.state.isSolved('puzzle_shutter');
  if (!shutterVisible) {
    shutter.door.forceState(true);
    props.get('shutter')!.visible = false;
    builder.collision.setSolid('shutter_col', false);
    for (const item of shutter.interactables) item.enabled = false;
  }

  return {
    id: 'floor0',
    variant: params.variant,
    builder,
    doors,
    interactables,
    triggers,
    nav,
    rooms: fc.rooms,
    props,
    screens: feeds.map((feed) => feed.surface),
    feeds,
    puzzles: { clocks: fc.clockPuzzle, toys: fc.toyPuzzle, shutter },
    fixtures: fc.fixtures,
    elevator: rig,
    spawn: { x: 1.2, z: 0, yaw: -Math.PI / 2 },
    bounds: FLOOR_BOUNDS,
    safePoint: { x: 1.5, z: 0 },
    update: (delta, ctx) => {
      for (const updater of updaters) updater(delta, ctx);
    },
  };
}
