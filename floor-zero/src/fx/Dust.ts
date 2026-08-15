import * as THREE from 'three';
import type { LightingManager } from '../world/LightingManager';

/**
 * Motes drifting in the air around the player. They are only visible where the
 * light actually falls, which is what makes a corridor read as a volume of air
 * rather than a set of surfaces — and it gives the fluorescents something to
 * catch when they flicker.
 */
export class DustField {
  private readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly drift: Float32Array;
  private readonly colors: Float32Array;
  private readonly probe = new THREE.Vector3();
  private cursor = 0;
  private enabled = true;

  constructor(
    scene: THREE.Scene,
    private readonly count = 520,
    private readonly radius = 8,
  ) {
    this.positions = new Float32Array(count * 3);
    this.drift = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * radius * 2;
      this.positions[i * 3 + 1] = Math.random() * 2.6;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * radius * 2;
      // Barely-there convection, plus a slow sink.
      this.drift[i * 3] = (Math.random() - 0.5) * 0.05;
      this.drift[i * 3 + 1] = -0.012 - Math.random() * 0.02;
      this.drift[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
      this.colors[i * 3] = 0;
      this.colors[i * 3 + 1] = 0;
      this.colors[i * 3 + 2] = 0;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 2);

    this.material = new THREE.PointsMaterial({
      size: 0.018,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: dustSprite(),
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.points.visible = enabled;
  }

  update(delta: number, camera: THREE.Camera, lighting: LightingManager, intensity: number): void {
    if (!this.enabled) return;

    const origin = camera.getWorldPosition(this.probe).clone();
    const position = this.geometry.attributes.position as THREE.BufferAttribute;
    const color = this.geometry.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < this.count; i++) {
      let x = this.positions[i * 3] + this.drift[i * 3] * delta;
      let y = this.positions[i * 3 + 1] + this.drift[i * 3 + 1] * delta;
      let z = this.positions[i * 3 + 2] + this.drift[i * 3 + 2] * delta;

      // Keep the field wrapped around the player so it is never empty and
      // never larger than it needs to be.
      if (y < 0.05) y += 2.55;
      if (x - origin.x > this.radius) x -= this.radius * 2;
      else if (x - origin.x < -this.radius) x += this.radius * 2;
      if (z - origin.z > this.radius) z -= this.radius * 2;
      else if (z - origin.z < -this.radius) z += this.radius * 2;

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
    }
    position.needsUpdate = true;

    // Relighting every mote every frame is wasted work; a rolling slice keeps
    // the cost flat and the eye cannot tell.
    const slice = Math.min(this.count, 64);
    for (let n = 0; n < slice; n++) {
      const i = (this.cursor + n) % this.count;
      this.probe.set(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]);
      const lit = lighting.brightnessAt(this.probe) * intensity;
      this.colors[i * 3] = lit;
      this.colors[i * 3 + 1] = lit * 0.98;
      this.colors[i * 3 + 2] = lit * 0.92;
    }
    this.cursor = (this.cursor + slice) % this.count;
    color.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
  }
}

function dustSprite(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}
