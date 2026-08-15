import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import { QualityLevel } from '../core/types';

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;
uniform float uAberration;
uniform float uWarp;
uniform float uExposure;
uniform float uFade;
uniform float uContrast;
uniform vec2 uResolution;

varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = vUv;
  vec2 centered = uv - 0.5;

  // Gentle barrel warp that grows with tension.
  float r2 = dot(centered, centered);
  uv = 0.5 + centered * (1.0 + uWarp * r2 * 1.6);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Chromatic split, strongest at the edges where it reads as lens error.
  vec2 offset = centered * uAberration * (0.4 + r2);
  vec3 color;
  color.r = texture2D(tDiffuse, uv + offset).r;
  color.g = texture2D(tDiffuse, uv).g;
  color.b = texture2D(tDiffuse, uv - offset).b;

  color *= uExposure;

  // Contrast around mid grey.
  color = (color - 0.5) * uContrast + 0.5;

  // Film grain: animated, luminance-weighted so it lives in the shadows.
  float noise = hash(uv * uResolution + vec2(uTime * 61.7, uTime * 37.3));
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  color += (noise - 0.5) * uGrain * (1.25 - luminance);

  // Vignette.
  float vignette = smoothstep(0.92, 0.18, length(centered) * 1.35);
  color *= mix(1.0, vignette, uVignette);

  // Very soft scanline, matching the old camcorder look.
  float scan = 1.0 - 0.035 * step(0.5, fract(uv.y * uResolution.y * 0.25));
  color *= scan;

  color *= uFade;

  gl_FragColor = vec4(max(color, 0.0), 1.0);
}
`;

export interface PostFXTargets {
  grain: number;
  vignette: number;
  aberration: number;
  warp: number;
  exposure: number;
  contrast: number;
}

/**
 * A single full-screen pass. Everything the game needs (grain, vignette, edge
 * warp, chromatic split, exposure adaptation, fade to black) lives in one
 * shader, which is far cheaper on a mid-range laptop than a composer chain.
 */
export class PostFX {
  private target: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private enabled = true;
  private strength = 1;
  private pixelRatio = 1;

  private current: PostFXTargets = {
    grain: 0.05,
    vignette: 0.7,
    aberration: 0.0015,
    warp: 0.02,
    exposure: 1,
    contrast: 1.02,
  };
  private wanted: PostFXTargets = { ...this.current };
  private fade = 1;
  private fadeTarget = 1;
  private pulse = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const size = renderer.getSize(new THREE.Vector2());
    this.target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uTime: { value: 0 },
        uGrain: { value: 0.05 },
        uVignette: { value: 0.7 },
        uAberration: { value: 0.0015 },
        uWarp: { value: 0.02 },
        uExposure: { value: 1 },
        uFade: { value: 1 },
        uContrast: { value: 1.02 },
        uResolution: { value: new THREE.Vector2(size.x, size.y) },
      },
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setQuality(quality: QualityLevel): void {
    this.enabled = quality !== 'low';
    this.pixelRatio = quality === 'high' ? 1 : 0.85;
    this.resize();
  }

  /** 0..1 user preference for how heavy the screen effects are. */
  setStrength(strength: number): void {
    this.strength = clamp(strength, 0, 1);
  }

  resize(): void {
    const size = this.renderer.getSize(new THREE.Vector2());
    const width = Math.max(1, Math.floor(size.x * this.renderer.getPixelRatio() * this.pixelRatio));
    const height = Math.max(1, Math.floor(size.y * this.renderer.getPixelRatio() * this.pixelRatio));
    this.target.setSize(width, height);
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }

  /** Drives the look from tension, health of the lights and accessibility settings. */
  setTargets(targets: Partial<PostFXTargets>): void {
    Object.assign(this.wanted, targets);
  }

  fadeTo(value: number, immediate = false): void {
    this.fadeTarget = clamp(value, 0, 1);
    if (immediate) this.fade = this.fadeTarget;
  }

  get faded(): boolean {
    return Math.abs(this.fade - this.fadeTarget) < 0.02;
  }

  /** One-off flash of distortion, used by the scares. */
  kick(amount = 1): void {
    this.pulse = Math.max(this.pulse, amount);
  }

  update(delta: number, time: number): void {
    for (const key of Object.keys(this.wanted) as Array<keyof PostFXTargets>) {
      this.current[key] = damp(this.current[key], this.wanted[key], 3, delta);
    }
    this.pulse = Math.max(0, this.pulse - delta * 1.6);
    this.fade = damp(this.fade, this.fadeTarget, 5, delta);

    const uniforms = this.material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uGrain.value = this.current.grain * this.strength + this.pulse * 0.06;
    uniforms.uVignette.value = this.current.vignette * (0.4 + this.strength * 0.6) + this.pulse * 0.2;
    uniforms.uAberration.value = (this.current.aberration + this.pulse * 0.006) * this.strength;
    uniforms.uWarp.value = (this.current.warp + this.pulse * 0.05) * this.strength;
    uniforms.uExposure.value = this.current.exposure;
    uniforms.uContrast.value = this.current.contrast;
    uniforms.uFade.value = this.fade;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled && this.fade > 0.99) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    (this.quad.geometry as THREE.BufferGeometry).dispose();
  }
}
