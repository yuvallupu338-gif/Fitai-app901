import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { localized, NoteDef, PhotoDef, PHOTOS, TapeDef } from '../data/dialogue';
import { t } from '../data/localization';
import { Interactable, SimpleInteractable } from '../interactions/Interactable';
import { Builder } from './Builders';
import { Door, DoorSystem } from './DoorController';
import { FixtureConfig } from './LightingManager';
import { MaterialKey } from './Materials';
import {
  childDrawingTexture,
  familyPhotoTexture,
  noticeBoardTexture,
  paperTexture,
  plateTexture,
  polaroidTexture,
} from './Textures';

/* ------------------------------------------------------------------ */
/* Lighting                                                            */
/* ------------------------------------------------------------------ */

export function fluorescentFixture(
  builder: Builder,
  id: string,
  x: number,
  z: number,
  y = 2.62,
  options: { length?: number; along?: 'x' | 'z'; color?: number; intensity?: number; on?: boolean } = {},
): FixtureConfig {
  const length = options.length ?? 1.15;
  const along = options.along ?? 'x';
  const size: [number, number, number] = along === 'x' ? [length, 0.07, 0.16] : [0.16, 0.07, length];
  const housingSize: [number, number, number] =
    along === 'x' ? [length + 0.12, 0.09, 0.24] : [0.24, 0.09, length + 0.12];

  builder.decor({ material: 'darkMetal', center: [x, y + 0.06, z], size: housingSize });

  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  builder.trackGeometry(geometry);
  const material = builder.own(new THREE.MeshBasicMaterial({ color: options.color ?? 0xdfe7ee }));
  const tube = new THREE.Mesh(geometry, material);
  tube.position.set(x, y, z);
  tube.name = `fixture_${id}`;
  builder.addObject(tube);

  return {
    id,
    position: new THREE.Vector3(x, y - 0.1, z),
    color: options.color ?? 0xdfe7ee,
    intensity: options.intensity ?? 1.35,
    distance: 9.5,
    emissive: tube,
    on: options.on ?? true,
  };
}

/* ------------------------------------------------------------------ */
/* Doors                                                               */
/* ------------------------------------------------------------------ */

export interface SwingDoorOptions {
  id: string;
  axis: 'x' | 'z';
  /** Fixed coordinate: z when the wall runs along x. */
  at: number;
  from: number;
  to: number;
  height?: number;
  thickness?: number;
  material?: MaterialKey;
  /** Radians. Sign chooses which way the leaf swings. */
  swing?: number;
  hinge?: 'start' | 'end';
  locked?: boolean;
  speed?: number;
}

export interface DoorHandle {
  door: Door;
  pivot: THREE.Group;
  leaf: THREE.Mesh;
}

export function createSwingDoor(builder: Builder, doors: DoorSystem, options: SwingDoorOptions): DoorHandle {
  const height = options.height ?? 2.05;
  const thickness = options.thickness ?? 0.06;
  const width = Math.abs(options.to - options.from);
  const start = Math.min(options.from, options.to);
  const hingeAtStart = (options.hinge ?? 'start') === 'start';
  const hingeAlong = hingeAtStart ? start : start + width;
  const leafOffset = hingeAtStart ? width / 2 : -width / 2;

  const pivot = new THREE.Group();
  pivot.name = `${options.id}_pivot`;
  if (options.axis === 'x') pivot.position.set(hingeAlong, 0, options.at);
  else pivot.position.set(options.at, 0, hingeAlong);
  builder.addObject(pivot);

  const leafSize: [number, number, number] =
    options.axis === 'x' ? [width, height, thickness] : [thickness, height, width];
  const leaf = builder.box({
    id: `${options.id}_leaf`,
    material: options.material ?? 'doorWood',
    center: [0, 0, 0],
    size: leafSize,
    collide: false,
    tile: 1,
    castShadow: true,
  });
  leaf.removeFromParent();
  leaf.position.set(
    options.axis === 'x' ? leafOffset : 0,
    height / 2,
    options.axis === 'x' ? 0 : leafOffset,
  );
  pivot.add(leaf);

  // Handle.
  const handleGeometry = new THREE.BoxGeometry(0.11, 0.03, 0.03);
  builder.trackGeometry(handleGeometry);
  const handleMaterial = builder.own(new THREE.MeshLambertMaterial({ color: 0xb9a071 }));
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  const handleAlong = hingeAtStart ? width - 0.14 : -(width - 0.14);
  handle.position.set(
    options.axis === 'x' ? handleAlong : 0.06,
    1.02,
    options.axis === 'x' ? 0.06 : handleAlong,
  );
  if (options.axis === 'z') handle.rotation.y = Math.PI / 2;
  pivot.add(handle);

  // Architrave: a plain painted casing around the opening. Cheap, but it is
  // the difference between a hole in a wall and a door.
  const casing = 0.07;
  const casingDepth = (options.thickness ?? 0.06) + 0.16;
  // The casing straddles each edge of the opening rather than butting against
  // it: coplanar faces with the wall would z-fight at grazing angles.
  const head = options.axis === 'x'
    ? { center: [start + width / 2, height, options.at] as [number, number, number],
        size: [width + casing * 2, casing, casingDepth] as [number, number, number] }
    : { center: [options.at, height, start + width / 2] as [number, number, number],
        size: [casingDepth, casing, width + casing * 2] as [number, number, number] };
  builder.decor({ material: 'skirting', center: head.center, size: head.size });
  for (const side of [-1, 1] as const) {
    const along = start + width / 2 + side * (width / 2);
    const jamb = options.axis === 'x'
      ? { center: [along, height / 2, options.at] as [number, number, number],
          size: [casing, height + casing, casingDepth] as [number, number, number] }
      : { center: [options.at, height / 2, along] as [number, number, number],
          size: [casingDepth, height + casing, casing] as [number, number, number] };
    builder.decor({ material: 'skirting', center: jamb.center, size: jamb.size });
  }

  const colliderId = `${options.id}_col`;
  const centerAlong = start + width / 2;
  builder.addCollider({
    id: colliderId,
    minX: options.axis === 'x' ? centerAlong - width / 2 : options.at - 0.1,
    maxX: options.axis === 'x' ? centerAlong + width / 2 : options.at + 0.1,
    minY: 0,
    maxY: height,
    minZ: options.axis === 'x' ? options.at - 0.1 : centerAlong - width / 2,
    maxZ: options.axis === 'x' ? options.at + 0.1 : centerAlong + width / 2,
    solid: true,
  });

  const door = doors.add(
    new Door({
      id: options.id,
      type: 'swing',
      pivot,
      colliderId,
      collision: builder.collision,
      travel: options.swing ?? Math.PI / 2,
      speed: options.speed ?? 1.5,
      locked: options.locked ?? false,
    }),
  );

  return { door, pivot, leaf };
}

export interface DoorInteractableOptions {
  label?: string;
  lockedMessage?: string;
  /** Called before opening; return false to refuse (locked, needs a key…). */
  canOpen?: (ctx: GameContext) => boolean;
  onOpen?: (ctx: GameContext) => void;
  sound?: 'wood' | 'metal';
}

export function makeDoorInteractable(
  handle: DoorHandle,
  options: DoorInteractableOptions = {},
): Interactable {
  const { door, leaf } = handle;
  const item = new SimpleInteractable(
    door.id,
    'door',
    leaf,
    (ctx) => {
      if (options.canOpen && !options.canOpen(ctx)) return t('prompt.locked');
      return door.open ? t('prompt.close') : options.label ?? t('prompt.open');
    },
    (ctx) => {
      if (door.isMoving) return;
      if (!door.open && options.canOpen && !options.canOpen(ctx)) {
        ctx.audio.play('door_metal_close', { volume: 0.35 });
        ctx.ui.toast(options.lockedMessage ?? t('toast.no_key'));
        return;
      }
      const opening = !door.open;
      door.setOpen(opening);
      const kind = options.sound ?? 'wood';
      ctx.audio.play(
        opening ? (kind === 'metal' ? 'door_metal_open' : 'door_wood_open') : kind === 'metal' ? 'door_metal_close' : 'door_wood_close',
        { position: handle.pivot.position.clone(), volume: 0.7 },
      );
      ctx.bus.emit(opening ? 'door_opened' : 'door_closed', { id: door.id });
      if (opening) options.onOpen?.(ctx);
    },
    { maxDistance: 2.4, recordAs: 'door_open' },
  );
  return item;
}

/* ------------------------------------------------------------------ */
/* Wall dressing                                                       */
/* ------------------------------------------------------------------ */

export function apartmentPlate(
  builder: Builder,
  text: string,
  position: [number, number, number],
  rotationY: number,
): { mesh: THREE.Mesh; setText: (next: string) => void } {
  const mesh = builder.panel(builder.ownTexture(plateTexture(text)), 0.16, 0.11, position, rotationY, {
    name: `plate_${text}`,
  });
  mesh.translateZ(0.012);
  return {
    mesh,
    setText: (next: string) => {
      const material = mesh.material as THREE.MeshLambertMaterial;
      material.map = builder.ownTexture(plateTexture(next));
      material.needsUpdate = true;
    },
  };
}

export function familyPhoto(
  builder: Builder,
  position: [number, number, number],
  rotationY: number,
): { mesh: THREE.Mesh; setVariant: (variant: number) => void } {
  const textures = new Map<number, THREE.Texture>();
  const initial = builder.ownTexture(familyPhotoTexture(0));
  textures.set(0, initial);
  const mesh = builder.panel(initial, 0.5, 0.38, position, rotationY, { name: 'family_photo' });
  builder.decor({
    material: 'darkMetal',
    center: [position[0], position[1], position[2]],
    size: rotationY === 0 || Math.abs(rotationY) === Math.PI ? [0.56, 0.44, 0.02] : [0.02, 0.44, 0.56],
  });
  mesh.position.set(position[0], position[1], position[2]);
  mesh.translateZ(0.012);

  return {
    mesh,
    setVariant: (variant: number) => {
      let texture = textures.get(variant);
      if (!texture) {
        texture = builder.ownTexture(familyPhotoTexture(variant));
        textures.set(variant, texture);
      }
      const material = mesh.material as THREE.MeshLambertMaterial;
      material.map = texture;
      material.needsUpdate = true;
    },
  };
}

export function noticeBoard(
  builder: Builder,
  position: [number, number, number],
  rotationY: number,
): { mesh: THREE.Mesh; setMessage: (message: string) => void } {
  const base = builder.ownTexture(noticeBoardTexture(83));
  const mesh = builder.panel(base, 1.1, 0.82, position, rotationY, { name: 'notice_board' });
  builder.decor({
    material: 'skirting',
    center: position,
    size: Math.abs(rotationY) < 0.01 || Math.abs(Math.abs(rotationY) - Math.PI) < 0.01 ? [1.18, 0.9, 0.04] : [0.04, 0.9, 1.18],
  });
  // Clear of the surround's own half-depth, or the cork sits inside its frame.
  mesh.translateZ(0.035);
  return {
    mesh,
    setMessage: (message: string) => {
      const texture = builder.ownTexture(noticeBoardTexture(83, message));
      const material = mesh.material as THREE.MeshLambertMaterial;
      material.map = texture;
      material.needsUpdate = true;
    },
  };
}

export function childDrawing(
  builder: Builder,
  kind: number,
  position: [number, number, number],
  rotationY: number,
): { mesh: THREE.Mesh; setKind: (kind: number) => void } {
  const mesh = builder.panel(builder.ownTexture(childDrawingTexture(kind)), 0.26, 0.33, position, rotationY, {
    name: `drawing_${kind}`,
  });
  mesh.translateZ(0.01);
  return {
    mesh,
    setKind: (next: number) => {
      const material = mesh.material as THREE.MeshLambertMaterial;
      material.map = builder.ownTexture(childDrawingTexture(next));
      material.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Interactive props                                                   */
/* ------------------------------------------------------------------ */

export function makeNote(
  builder: Builder,
  note: NoteDef,
  position: [number, number, number],
  rotationY: number,
): Interactable {
  const texture = builder.ownTexture(paperTexture(localized(note.title), localized(note.body)));
  const mesh = builder.panel(texture, 0.21, 0.28, position, rotationY, { name: `note_${note.id}` });
  mesh.translateZ(0.008);
  return new SimpleInteractable(
    note.id,
    'note',
    mesh,
    () => t('prompt.read'),
    (ctx) => {
      ctx.audio.play('paper', { volume: 0.6 });
      ctx.ui.showNote(note);
      if (!ctx.state.run.notesRead.includes(note.id)) ctx.state.run.notesRead.push(note.id);
      ctx.bus.emit('note_read', { id: note.id });
    },
    { maxDistance: 2.2 },
  );
}

/**
 * A found photograph. Collecting one is optional and never gates anything, so
 * it stays a discovery rather than a chore: it reads like a note, but it also
 * counts, and the fifth one changes what is waiting in the control room.
 */
export function makePhotoPickup(
  builder: Builder,
  photo: PhotoDef,
  position: [number, number, number],
  rotationY: number,
  options: { collect?: boolean } = {},
): Interactable {
  const collect = options.collect ?? true;
  const texture = builder.ownTexture(polaroidTexture(photo.kind, localized(photo.caption)));
  const mesh = builder.panel(texture, 0.14, 0.165, position, rotationY, { name: `photo_${photo.id}` });
  mesh.translateZ(0.007);
  // A sliver of white edge-on, so the print reads as an object on the wall.
  // The size already encodes which way it faces; rotating it as well would turn
  // the thin axis into the deep one and drive the slab through the wall.
  const backing = builder.decor({
    material: 'paper',
    center: position,
    size: Math.abs(Math.sin(rotationY)) > 0.5 ? [0.006, 0.17, 0.145] : [0.145, 0.17, 0.006],
  });

  const item = new SimpleInteractable(
    photo.id,
    'note',
    mesh,
    () => (collect ? t('prompt.take') : t('prompt.read')),
    (ctx) => {
      ctx.audio.play('paper', { volume: 0.7 });
      ctx.ui.showNote(photo);
      if (!collect) return;

      mesh.visible = false;
      backing.visible = false;
      item.enabled = false;
      ctx.state.setFlag(`found_${photo.id}`);
      const found = PHOTOS.filter((entry) => ctx.state.flag(`found_${entry.id}`)).length;
      const complete = found >= PHOTOS.length;
      if (complete) ctx.state.setFlag('photos_all');
      // One toast slot: the set being finished outranks the running count.
      ctx.ui.toast(complete ? t('toast.photo_all') : t('toast.photo', found, PHOTOS.length));
      ctx.bus.emit('photo_found', { id: photo.id, found, total: PHOTOS.length });
    },
    { maxDistance: 2.2, recordAs: 'pickup' },
  );
  return item;
}

export function makeTapePlayer(
  builder: Builder,
  tape: TapeDef,
  position: [number, number, number],
  rotationY: number,
): Interactable {
  const body = builder.box({
    id: `tape_${tape.id}`,
    material: 'darkMetal',
    center: position,
    size: [0.26, 0.09, 0.18],
    collide: false,
    castShadow: true,
  });
  body.rotation.y = rotationY;
  builder.decor({
    material: 'metal',
    center: [position[0], position[1] + 0.05, position[2]],
    size: [0.12, 0.01, 0.09],
  });

  return new SimpleInteractable(
    tape.id,
    'tape',
    body,
    () => t('prompt.listen'),
    (ctx) => {
      ctx.ui.playTape(tape, ctx);
      if (!ctx.state.run.tapesPlayed.includes(tape.id)) ctx.state.run.tapesPlayed.push(tape.id);
      ctx.bus.emit('tape_played', { id: tape.id });
    },
    { maxDistance: 2.2, recordAs: 'use' },
  );
}

export function makeWallSwitch(
  builder: Builder,
  id: string,
  position: [number, number, number],
  rotationY: number,
  onUse: (ctx: GameContext) => void,
  label?: () => string,
): { interactable: Interactable; mesh: THREE.Mesh } {
  const plate = builder.box({
    id: `${id}_plate`,
    material: 'paper',
    center: position,
    size: rotationY === 0 || Math.abs(rotationY) === Math.PI ? [0.11, 0.15, 0.03] : [0.03, 0.15, 0.11],
    collide: false,
  });
  const toggleGeometry = new THREE.BoxGeometry(0.045, 0.06, 0.02);
  builder.trackGeometry(toggleGeometry);
  const toggleMaterial = builder.own(new THREE.MeshLambertMaterial({ color: 0xe8e2d2 }));
  const toggle = new THREE.Mesh(toggleGeometry, toggleMaterial);
  toggle.position.set(position[0], position[1], position[2]);
  toggle.rotation.y = rotationY;
  toggle.translateZ(0.022);
  builder.addObject(toggle);
  toggle.userData.interactableId = id;

  const interactable = new SimpleInteractable(
    id,
    'switch',
    plate,
    () => label?.() ?? t('prompt.use'),
    (ctx) => {
      ctx.audio.play('switch', { position: new THREE.Vector3(...position), volume: 0.8 });
      toggle.rotation.x = toggle.rotation.x > 0.05 ? 0 : 0.35;
      onUse(ctx);
    },
    { maxDistance: 2.3, recordAs: 'switch' },
  );
  return { interactable, mesh: plate };
}

export function makePickup(
  builder: Builder,
  id: string,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: MaterialKey,
  onTake?: (ctx: GameContext) => void,
): Interactable {
  const mesh = builder.box({
    id: `${id}_mesh`,
    material,
    center: position,
    size,
    collide: false,
    castShadow: true,
  });
  const item = new SimpleInteractable(
    id,
    'item',
    mesh,
    () => t('prompt.take'),
    (ctx) => {
      mesh.visible = false;
      item.enabled = false;
      ctx.state.addItem(id);
      ctx.audio.play('pickup', { volume: 0.7 });
      ctx.ui.toast(t('toast.item', name));
      ctx.bus.emit('item_collected', { id, name });
      onTake?.(ctx);
    },
    { maxDistance: 2.4, recordAs: 'pickup' },
  );
  return item;
}

/* ------------------------------------------------------------------ */
/* Furniture                                                           */
/* ------------------------------------------------------------------ */

export function plasticChair(builder: Builder, id: string, x: number, z: number, rotationY = 0): THREE.Group {
  const group = new THREE.Group();
  group.name = id;
  group.position.set(x, 0, z);
  group.rotation.y = rotationY;
  builder.addObject(group);

  const material = builder.own(new THREE.MeshLambertMaterial({ color: 0x2f5d7a }));
  const legMaterial = builder.own(new THREE.MeshLambertMaterial({ color: 0x8f959a }));

  const seatGeometry = new THREE.BoxGeometry(0.42, 0.05, 0.4);
  const backGeometry = new THREE.BoxGeometry(0.42, 0.42, 0.05);
  const legGeometry = new THREE.BoxGeometry(0.04, 0.44, 0.04);
  builder.trackGeometry(seatGeometry);
  builder.trackGeometry(backGeometry);
  builder.trackGeometry(legGeometry);

  const seat = new THREE.Mesh(seatGeometry, material);
  seat.position.y = 0.46;
  seat.castShadow = true;
  group.add(seat);

  const back = new THREE.Mesh(backGeometry, material);
  back.position.set(0, 0.68, -0.18);
  back.rotation.x = -0.12;
  back.castShadow = true;
  group.add(back);

  for (const [lx, lz] of [
    [-0.17, -0.16],
    [0.17, -0.16],
    [-0.17, 0.16],
    [0.17, 0.16],
  ] as Array<[number, number]>) {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(lx, 0.22, lz);
    group.add(leg);
  }

  builder.addCollider({
    id,
    minX: x - 0.26,
    maxX: x + 0.26,
    minY: 0,
    maxY: 0.9,
    minZ: z - 0.26,
    maxZ: z + 0.26,
    solid: true,
  });

  return group;
}

export function securityCamera(
  builder: Builder,
  id: string,
  position: [number, number, number],
  baseRotation: number,
): { group: THREE.Group; head: THREE.Group } {
  const group = new THREE.Group();
  group.position.set(position[0], position[1], position[2]);
  group.rotation.y = baseRotation;
  group.name = id;
  builder.addObject(group);

  const bracketGeometry = new THREE.BoxGeometry(0.06, 0.14, 0.06);
  const bodyGeometry = new THREE.BoxGeometry(0.12, 0.11, 0.26);
  const lensGeometry = new THREE.CylinderGeometry(0.035, 0.045, 0.06, 10);
  const ledGeometry = new THREE.SphereGeometry(0.012, 6, 6);
  builder.trackGeometry(bracketGeometry);
  builder.trackGeometry(bodyGeometry);
  builder.trackGeometry(lensGeometry);
  builder.trackGeometry(ledGeometry);

  const shell = builder.own(new THREE.MeshLambertMaterial({ color: 0xd8d3c4 }));
  const dark = builder.own(new THREE.MeshLambertMaterial({ color: 0x1c1f22 }));
  const led = builder.own(new THREE.MeshBasicMaterial({ color: 0xd83a3a }));

  const bracket = new THREE.Mesh(bracketGeometry, shell);
  bracket.position.y = -0.07;
  group.add(bracket);

  const head = new THREE.Group();
  head.position.y = -0.16;
  group.add(head);

  const body = new THREE.Mesh(bodyGeometry, shell);
  head.add(body);

  const lens = new THREE.Mesh(lensGeometry, dark);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.16;
  head.add(lens);

  const light = new THREE.Mesh(ledGeometry, led);
  light.position.set(0.045, 0.045, 0.12);
  head.add(light);

  return { group, head };
}

export function table(
  builder: Builder,
  id: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  height = 0.74,
  material: MaterialKey = 'wood',
): void {
  builder.box({
    id: `${id}_top`,
    material,
    center: [x, height, z],
    size: [width, 0.05, depth],
    collide: false,
    castShadow: true,
  });
  const legGeometry = new THREE.BoxGeometry(0.06, height, 0.06);
  builder.trackGeometry(legGeometry);
  const legMaterial = builder.own(new THREE.MeshLambertMaterial({ color: 0x54402c }));
  for (const [ox, oz] of [
    [-width / 2 + 0.06, -depth / 2 + 0.06],
    [width / 2 - 0.06, -depth / 2 + 0.06],
    [-width / 2 + 0.06, depth / 2 - 0.06],
    [width / 2 - 0.06, depth / 2 - 0.06],
  ] as Array<[number, number]>) {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(x + ox, height / 2, z + oz);
    builder.addObject(leg);
  }
  builder.addCollider({
    id,
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: 0,
    maxY: height + 0.05,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    solid: true,
  });
}

export function cabinet(
  builder: Builder,
  id: string,
  center: [number, number, number],
  size: [number, number, number],
  material: MaterialKey = 'wood',
): THREE.Mesh {
  return builder.box({ id, material, center, size, collide: true, castShadow: true, tile: 1.1 });
}

export function pipes(builder: Builder, x0: number, x1: number, z: number, y = 2.42): void {
  const length = Math.abs(x1 - x0);
  const geometry = new THREE.CylinderGeometry(0.045, 0.045, length, 8);
  builder.trackGeometry(geometry);
  const material = builder.own(new THREE.MeshLambertMaterial({ color: 0x6f6a5e }));
  for (let i = 0; i < 2; i++) {
    const pipe = new THREE.Mesh(geometry, material);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set((x0 + x1) / 2, y - i * 0.11, z);
    builder.addObject(pipe);
  }
}
