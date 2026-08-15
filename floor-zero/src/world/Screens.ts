import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { CORRIDOR, ROOM_RECTS } from './floorPlan';
import { ScreenSurface } from './Textures';

export type FeedKind =
  | 'corridor'
  | 'lobby'
  | 'elevator'
  | 'apartment'
  | 'player'
  | 'past'
  | 'outside'
  | 'unopened'
  | 'duplicate'
  | 'dead';

const LABELS: Record<FeedKind, string> = {
  corridor: 'CAM 01  MSDRON',
  lobby: 'CAM 02  LOBBY',
  elevator: 'CAM 03  LIFT',
  apartment: 'CAM 04  DIRA 03',
  player: 'CAM 07  ---',
  past: 'CAM 01  REC 0311',
  outside: 'CAM 09  HUTZ',
  unopened: 'CAM 12  ??',
  duplicate: 'CAM 01  x2',
  dead: 'NO SIGNAL',
};

/**
 * A CCTV monitor. The feeds are drawn as a stylised plan view rather than a
 * second 3D render: it costs nothing, it reads instantly at 256×192, and it
 * makes the "you are two seconds ahead of yourself" trick easy to stage.
 */
export class SecurityFeed {
  private time = 0;
  private glitchTimer = 0;
  private redrawTimer = 0;
  /** Seconds into the future the feed shows. Negative shows the past. */
  lead = 0;
  /** Draws a second figure standing behind the player. */
  showWatcher = false;
  private readonly trail: Array<{ x: number; z: number }> = [];

  constructor(
    readonly surface: ScreenSurface,
    public kind: FeedKind,
    private readonly fps = 12,
  ) {}

  setKind(kind: FeedKind): void {
    this.kind = kind;
  }

  glitch(seconds = 0.8): void {
    this.glitchTimer = Math.max(this.glitchTimer, seconds);
  }

  update(delta: number, ctx: GameContext): void {
    this.time += delta;
    if (this.glitchTimer > 0) this.glitchTimer -= delta;

    this.redrawTimer -= delta;
    if (this.redrawTimer > 0) return;
    this.redrawTimer = 1 / this.fps;

    const screen = this.surface;
    const c = screen.context;
    const w = screen.width;
    const h = screen.height;

    if (this.kind === 'dead') {
      screen.clear('#07090a');
      screen.static_(0.9);
      screen.scanlines(0.22);
      screen.label(LABELS.dead, '#5d6b5f');
      screen.commit();
      return;
    }

    screen.clear('#0a0f0b');

    const glitching = this.glitchTimer > 0;

    // Plan-view of the corridor with the doors marked.
    const pad = 14;
    const spanX = CORRIDOR.x1 - CORRIDOR.x0;
    const toX = (x: number): number => pad + ((x - CORRIDOR.x0) / spanX) * (w - pad * 2);
    const toY = (z: number): number => h / 2 + (z / 9) * (h / 2 - pad);

    c.strokeStyle = 'rgba(130,215,155,0.55)';
    c.lineWidth = 1;
    c.strokeRect(toX(CORRIDOR.x0), toY(CORRIDOR.z0), toX(CORRIDOR.x1) - toX(CORRIDOR.x0), toY(CORRIDOR.z1) - toY(CORRIDOR.z0));

    c.strokeStyle = 'rgba(120,200,140,0.3)';
    for (const rect of Object.values(ROOM_RECTS)) {
      c.strokeRect(
        toX(rect.minX),
        toY(rect.minZ),
        toX(rect.maxX) - toX(rect.minX),
        toY(rect.maxZ) - toY(rect.minZ),
      );
    }

    const player = ctx.camera.position;
    const velocityX = ctx.player.forward.x * ctx.player.speed;
    const velocityZ = ctx.player.forward.z * ctx.player.speed;
    const px = player.x + velocityX * this.lead;
    const pz = player.z + velocityZ * this.lead;

    this.trail.push({ x: px, z: pz });
    if (this.trail.length > 20) this.trail.shift();

    c.strokeStyle = 'rgba(150,230,170,0.22)';
    c.beginPath();
    this.trail.forEach((point, index) => {
      const sx = toX(point.x);
      const sy = toY(point.z);
      if (index === 0) c.moveTo(sx, sy);
      else c.lineTo(sx, sy);
    });
    c.stroke();

    // The player.
    c.fillStyle = glitching ? '#ffffff' : '#b9f4c8';
    c.beginPath();
    c.arc(toX(px), toY(pz), 4.2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(185,244,200,0.5)';
    c.beginPath();
    c.moveTo(toX(px), toY(pz));
    c.lineTo(toX(px + ctx.player.forward.x * 2.4), toY(pz + ctx.player.forward.z * 2.4));
    c.stroke();

    // The mimic, when it exists.
    if (ctx.mimic.isActive && ctx.mimic.visible) {
      const mimic = ctx.mimic.position;
      c.fillStyle = '#4a6f56';
      c.beginPath();
      c.arc(toX(mimic.x), toY(mimic.z), 4.2, 0, Math.PI * 2);
      c.fill();
    }

    if (this.showWatcher) {
      const bx = player.x - ctx.player.forward.x * 1.6;
      const bz = player.z - ctx.player.forward.z * 1.6;
      c.fillStyle = '#e8f6ec';
      c.beginPath();
      c.arc(toX(bx), toY(bz), 4.6, 0, Math.PI * 2);
      c.fill();
    }

    if (this.kind === 'duplicate') {
      for (let i = 1; i <= 2; i++) {
        c.fillStyle = 'rgba(185,244,200,0.45)';
        c.beginPath();
        c.arc(toX(px - i * 3.5), toY(pz), 3.6, 0, Math.PI * 2);
        c.fill();
      }
    }

    if (this.kind === 'past') {
      const ghostX = CORRIDOR.x0 + ((this.time * 1.4) % spanX);
      c.fillStyle = 'rgba(150,220,170,0.55)';
      c.beginPath();
      c.arc(toX(ghostX), toY(0), 4, 0, Math.PI * 2);
      c.fill();
    }

    if (this.kind === 'unopened') {
      c.strokeStyle = 'rgba(200,240,210,0.5)';
      c.strokeRect(w * 0.32, h * 0.28, w * 0.36, h * 0.42);
      c.fillStyle = 'rgba(200,240,210,0.12)';
      c.fillRect(w * 0.32, h * 0.28, w * 0.36, h * 0.42);
    }

    if (this.kind === 'outside') {
      c.strokeStyle = 'rgba(150,200,170,0.4)';
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(pad, pad + i * ((h - pad * 2) / 4));
        c.lineTo(w - pad, pad + i * ((h - pad * 2) / 4));
        c.stroke();
      }
    }

    screen.static_(glitching ? 0.85 : 0.16);
    screen.scanlines(0.18);
    screen.label(LABELS[this.kind], glitching ? '#d8ffe4' : '#7fd39a');

    // Blinking timestamp.
    c.fillStyle = '#6ec78d';
    c.font = 'bold 11px monospace';
    c.textAlign = 'right';
    c.textBaseline = 'bottom';
    const seconds = Math.floor(this.time) % 60;
    c.fillText(`00:17:${String(seconds).padStart(2, '0')}`, w - 8, h - 6);

    screen.commit();
  }
}

/** A CRT body with a screen surface on the front, for TVs and monitors. */
export function buildMonitor(
  addObject: (object: THREE.Object3D) => void,
  trackGeometry: (geometry: THREE.BufferGeometry) => void,
  ownMaterial: <T extends THREE.Material>(material: T) => T,
  options: {
    position: [number, number, number];
    rotationY: number;
    width: number;
    height: number;
    depth?: number;
    /** Overdrive so the screen feeds the bloom pass. */
    boost?: number;
  },
): { group: THREE.Group; feedSurface: ScreenSurface; screenMesh: THREE.Mesh } {
  const { position, rotationY, width, height } = options;
  const depth = options.depth ?? 0.34;

  const group = new THREE.Group();
  group.position.set(position[0], position[1], position[2]);
  group.rotation.y = rotationY;
  addObject(group);

  const shellGeometry = new THREE.BoxGeometry(width + 0.08, height + 0.08, depth);
  trackGeometry(shellGeometry);
  const shellMaterial = ownMaterial(new THREE.MeshLambertMaterial({ color: 0x2b2b28 }));
  const shell = new THREE.Mesh(shellGeometry, shellMaterial);
  shell.position.z = -depth / 2;
  shell.castShadow = true;
  group.add(shell);

  const surface = new ScreenSurface(256, 192);
  const screenGeometry = new THREE.PlaneGeometry(width, height);
  trackGeometry(screenGeometry);
  const screenMaterial = ownMaterial(new THREE.MeshBasicMaterial({ map: surface.texture }));
  screenMaterial.color.setScalar(Math.max(1, (options.boost ?? 1) * 0.55));
  const screenMesh = new THREE.Mesh(screenGeometry, screenMaterial);
  screenMesh.position.z = 0.006;
  group.add(screenMesh);

  return { group, feedSurface: surface, screenMesh };
}
