import * as THREE from 'three';
import { Builder } from './Builders';
import { Door, DoorSystem } from './DoorController';
import { Frame } from './Frame';
import { ScreenSurface } from './Textures';
import type { GameContext } from '../core/Context';
import type { Routine } from '../core/Sequencer';

export interface ElevatorRig {
  group: THREE.Group;
  left: Door;
  right: Door;
  display: ScreenSurface;
  /** World-space centre of the car interior. */
  interior: THREE.Vector3;
  /** Yaw the player should face when they step in. */
  facing: number;
  panelPosition: THREE.Vector3;
  mirror: THREE.Mesh;
  buttonMeshes: THREE.Mesh[];
  lightPosition: THREE.Vector3;
  lamp: THREE.Mesh;
}

const CAR_DEPTH = 1.95;
const CAR_HALF_WIDTH = 1.0;
const CAR_HEIGHT = 2.25;
const DOOR_HALF = 0.56;
const DOOR_HEIGHT = 2.05;

/**
 * Builds a small, slightly cramped lift car in world space through `frame`.
 * The car is authored facing local +x.
 */
export function buildElevatorCar(builder: Builder, doors: DoorSystem, frame: Frame): ElevatorRig {
  const group = new THREE.Group();
  group.name = 'elevator';
  builder.addObject(group);

  const worldBox = (
    lx: number,
    ly: number,
    lz: number,
    sx: number,
    sy: number,
    sz: number,
    material: Parameters<Builder['box']>[0]['material'],
    id: string,
    collide = true,
  ): THREE.Mesh => {
    const [wx, wz] = frame.point(lx, lz);
    const [dx, dz] = frame.size(sx, sz);
    return builder.box({
      id,
      material,
      center: [wx, ly, wz],
      size: [dx, sy, dz],
      collide,
      tile: 1.4,
    });
  };

  // Shell.
  worldBox(-CAR_DEPTH - 0.06, CAR_HEIGHT / 2, 0, 0.12, CAR_HEIGHT, CAR_HALF_WIDTH * 2 + 0.24, 'elevator', 'lift_back');
  worldBox(-CAR_DEPTH / 2, CAR_HEIGHT / 2, -CAR_HALF_WIDTH - 0.06, CAR_DEPTH, CAR_HEIGHT, 0.12, 'elevator', 'lift_side_a');
  worldBox(-CAR_DEPTH / 2, CAR_HEIGHT / 2, CAR_HALF_WIDTH + 0.06, CAR_DEPTH, CAR_HEIGHT, 0.12, 'elevator', 'lift_side_b');
  worldBox(-CAR_DEPTH / 2, -0.05, 0, CAR_DEPTH + 0.12, 0.1, CAR_HALF_WIDTH * 2, 'rubber', 'lift_floor', false);
  worldBox(-CAR_DEPTH / 2, CAR_HEIGHT + 0.06, 0, CAR_DEPTH + 0.12, 0.12, CAR_HALF_WIDTH * 2 + 0.24, 'elevator', 'lift_ceiling', false);

  // Door frame: fixed panels either side of the opening.
  const jamb = CAR_HALF_WIDTH - DOOR_HALF;
  worldBox(0, DOOR_HEIGHT / 2, -CAR_HALF_WIDTH + jamb / 2, 0.14, DOOR_HEIGHT, jamb, 'darkMetal', 'lift_jamb_a');
  worldBox(0, DOOR_HEIGHT / 2, CAR_HALF_WIDTH - jamb / 2, 0.14, DOOR_HEIGHT, jamb, 'darkMetal', 'lift_jamb_b');
  worldBox(0, DOOR_HEIGHT + (CAR_HEIGHT - DOOR_HEIGHT) / 2, 0, 0.14, CAR_HEIGHT - DOOR_HEIGHT, CAR_HALF_WIDTH * 2, 'darkMetal', 'lift_lintel');

  // Two sliding leaves that part from the centre of the opening.
  const madeDoors: Door[] = [];
  for (const side of [-1, 1] as const) {
    const pivot = new THREE.Group();
    const closedLocalZ = (side * DOOR_HALF) / 2;
    const [px, pz] = frame.point(0, closedLocalZ);
    pivot.position.set(px, 0, pz);
    group.add(pivot);

    const [sx, sz] = frame.size(0.08, DOOR_HALF);
    const mesh = builder.box({
      id: `lift_leaf_${side > 0 ? 'b' : 'a'}`,
      material: 'darkMetal',
      center: [0, DOOR_HEIGHT / 2, 0],
      size: [sx, DOOR_HEIGHT, sz],
      collide: false,
      tile: 1.2,
    });
    mesh.removeFromParent();
    mesh.position.set(0, DOOR_HEIGHT / 2, 0);
    pivot.add(mesh);

    const colliderId = `lift_leaf_col_${side > 0 ? 'b' : 'a'}`;
    const [cx, cz] = frame.point(0, closedLocalZ);
    const [csx, csz] = frame.size(0.12, DOOR_HALF);
    builder.addCollider({
      id: colliderId,
      minX: cx - csx / 2,
      maxX: cx + csx / 2,
      minY: 0,
      maxY: DOOR_HEIGHT,
      minZ: cz - csz / 2,
      maxZ: cz + csz / 2,
      solid: true,
    });

    const travelSign = side * frame.signForLocalZ;
    madeDoors.push(
      doors.add(
        new Door({
          id: `lift_door_${side > 0 ? 'b' : 'a'}`,
          type: 'slide',
          pivot,
          colliderId,
          collision: builder.collision,
          travel: travelSign * (DOOR_HALF + 0.02),
          speed: 0.9,
          slideAxis: frame.axisForLocalZ,
          closedPosition: pivot.position.clone(),
        }),
      ),
    );
  }

  // Control panel on the local -z wall next to the door.
  const panel = worldBox(-0.42, 1.18, -CAR_HALF_WIDTH + 0.03, 0.42, 0.72, 0.04, 'metal', 'lift_panel', false);
  panel.receiveShadow = true;

  const buttonMeshes: THREE.Mesh[] = [];
  const buttonGeometry = new THREE.CylinderGeometry(0.028, 0.028, 0.018, 12);
  builder.trackGeometry(buttonGeometry);
  const buttonMaterial = builder.own(new THREE.MeshLambertMaterial({ color: 0x2b2f33 }));
  for (let i = 0; i < 6; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const [bx, bz] = frame.point(-0.34 - col * 0.14, -CAR_HALF_WIDTH + 0.055);
    const button = new THREE.Mesh(buttonGeometry, buttonMaterial);
    button.position.set(bx, 1.34 - row * 0.15, bz);
    button.rotation.z = Math.PI / 2;
    button.rotation.y = frame.angle;
    button.name = `lift_button_${i}`;
    group.add(button);
    buttonMeshes.push(button);
  }

  // Floor display above the panel.
  const display = new ScreenSurface(192, 96);
  const [dx, dz] = frame.point(-0.42, -CAR_HALF_WIDTH + 0.062);
  const displayMesh = builder.panel(display.texture, 0.26, 0.13, [dx, 1.62, dz], frame.angle + Math.PI / 2, {
    emissive: true,
    name: 'lift_display',
  });
  displayMesh.renderOrder = 1;
  (displayMesh.material as THREE.MeshBasicMaterial).color.setScalar(
    Math.max(1, builder.emissiveBoost * 0.6),
  );

  // Mirror on the back wall.
  const [mx, mz] = frame.point(-CAR_DEPTH + 0.02, 0);
  const mirrorGeometry = new THREE.PlaneGeometry(1.0, 1.35);
  builder.trackGeometry(mirrorGeometry);
  const mirrorMaterial = builder.own(
    new THREE.MeshLambertMaterial({ color: 0x2d343c, transparent: true, opacity: 0.94 }),
  );
  const mirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
  mirror.position.set(mx, 1.32, mz);
  mirror.rotation.y = frame.angle;
  mirror.name = 'lift_mirror';
  group.add(mirror);

  // Handrails.
  for (const side of [-1, 1] as const) {
    const [hx, hz] = frame.point(-CAR_DEPTH / 2, side * (CAR_HALF_WIDTH - 0.06));
    const [hsx, hsz] = frame.size(CAR_DEPTH - 0.2, 0.05);
    builder.decor({
      material: 'metal',
      center: [hx, 0.92, hz],
      size: [hsx, 0.05, hsz],
    });
  }

  // Ceiling light.
  const [ux, uz] = frame.point(-CAR_DEPTH / 2, 0);
  const [usx, usz] = frame.size(0.7, 0.34);
  const lampGeometry = new THREE.BoxGeometry(usx, 0.04, usz);
  builder.trackGeometry(lampGeometry);
  const lampMaterial = builder.own(new THREE.MeshBasicMaterial({ color: 0xd8e2ea }));
  const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
  lamp.position.set(ux, CAR_HEIGHT - 0.05, uz);
  lamp.name = 'lift_lamp';
  group.add(lamp);

  const [ix, iz] = frame.point(-CAR_DEPTH / 2 - 0.1, 0);
  const [ppx, ppz] = frame.point(-0.42, -CAR_HALF_WIDTH + 0.12);
  const [fdx, fdz] = frame.direction(1, 0);

  return {
    group,
    left: madeDoors[0],
    right: madeDoors[1],
    display,
    interior: new THREE.Vector3(ix, 0, iz),
    // Yaw that makes the camera look out through the doors: the player's
    // forward vector is (-sin yaw, -cos yaw), so the door direction is negated.
    facing: Math.atan2(-fdx, -fdz),
    panelPosition: new THREE.Vector3(ppx, 1.25, ppz),
    mirror,
    buttonMeshes,
    lightPosition: new THREE.Vector3(ux, CAR_HEIGHT - 0.12, uz),
    lamp,
  };
}

export type LiftState = 'idle' | 'closing' | 'travelling' | 'opening';

/**
 * Runs the lift: doors, display, and the ride that swaps Floor 0 underneath the
 * player without ever moving the car.
 */
export class ElevatorController {
  private rig: ElevatorRig | null = null;
  state: LiftState = 'idle';
  private displayText = '—';
  private displayFlicker = 0;
  private redraw = true;
  powered = false;

  attach(rig: ElevatorRig): void {
    this.rig = rig;
    this.redraw = true;
    this.setDisplay(this.displayText);
  }

  detach(): void {
    this.rig = null;
  }

  get current(): ElevatorRig | null {
    return this.rig;
  }

  get doorsOpen(): boolean {
    return !!this.rig && this.rig.left.progress > 0.92;
  }

  get doorsClosed(): boolean {
    return !!this.rig && this.rig.left.progress < 0.05;
  }

  setDisplay(text: string): void {
    this.displayText = text;
    this.redraw = true;
  }

  glitchDisplay(seconds = 1.4): void {
    this.displayFlicker = seconds;
  }

  openDoors(): void {
    this.rig?.left.setOpen(true);
    this.rig?.right.setOpen(true);
  }

  closeDoors(): void {
    this.rig?.left.setOpen(false);
    this.rig?.right.setOpen(false);
  }

  snapDoors(open: boolean): void {
    this.rig?.left.forceState(open);
    this.rig?.right.forceState(open);
  }

  update(delta: number): void {
    if (!this.rig) return;
    if (this.displayFlicker > 0) {
      this.displayFlicker = Math.max(0, this.displayFlicker - delta);
      this.redraw = true;
    }
    if (!this.redraw) return;
    this.redraw = this.displayFlicker > 0;

    const screen = this.rig.display;
    const ctx = screen.context;
    screen.clear('#050806');
    const glitching = this.displayFlicker > 0 && Math.floor(performance.now() / 60) % 2 === 0;
    ctx.fillStyle = this.powered ? (glitching ? '#d8ffe0' : '#77e39a') : '#1d2a22';
    ctx.font = 'bold 62px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glitching ? '§' : this.displayText, screen.width / 2, screen.height / 2 + 4);
    screen.scanlines(0.22);
    screen.commit();
  }

  /**
   * The ride itself. `rebuild` is called while the doors are shut, which is
   * where Floor 0 quietly becomes a different Floor 0.
   */
  *ride(ctx: GameContext, label: string, rebuild: () => void): Routine {
    if (!this.rig) return;
    this.state = 'closing';
    ctx.bus.emit('elevator_state', { state: 'closing', floor: label });
    ctx.audio.play('lift_door_close');
    this.closeDoors();
    yield () => this.doorsClosed;
    yield 0.35;

    this.state = 'travelling';
    ctx.bus.emit('elevator_state', { state: 'travelling', floor: label });
    const motor = ctx.audio.play('lift_motor', { loop: true, volume: 0.75 });
    ctx.player.setShake(0.035, 3.2);
    yield 1.1;
    this.setDisplay(label);
    this.glitchDisplay(1.2);
    yield 1.5;

    rebuild();
    yield 0.2;

    ctx.audio.play('lift_cable', { volume: 0.6 });
    yield 1.1;
    ctx.player.setShake(0, 0);
    ctx.audio.stop(motor);
    ctx.audio.play('lift_bell');

    this.state = 'opening';
    ctx.bus.emit('elevator_state', { state: 'opening', floor: label });
    yield 0.5;
    ctx.audio.play('lift_door_open');
    this.openDoors();
    yield () => this.doorsOpen;
    this.state = 'idle';
    ctx.bus.emit('elevator_state', { state: 'idle', floor: label });
  }
}
