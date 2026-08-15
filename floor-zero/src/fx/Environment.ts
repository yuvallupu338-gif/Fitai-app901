import * as THREE from 'three';

/**
 * A tiny pre-filtered environment probe standing in for the room's own bounced
 * light: dark floor, dim greenish walls, a slightly brighter ceiling. Without
 * it every metal surface in the game reflects pure black and reads as plastic.
 */
export function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0.0, '#3b4148'); // ceiling, lit by the fluorescents
  gradient.addColorStop(0.22, '#2c3138');
  gradient.addColorStop(0.5, '#20252b'); // walls
  gradient.addColorStop(0.78, '#151a1f');
  gradient.addColorStop(1.0, '#0b0e12'); // floor
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const source = new THREE.CanvasTexture(canvas);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;
  source.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromEquirectangular(source);
  pmrem.dispose();
  source.dispose();

  return target.texture;
}
