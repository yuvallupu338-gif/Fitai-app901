import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import { QualityLevel } from '../core/types';

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Depth-only SSAO. Normals are reconstructed from the depth buffer with screen
 * derivatives, which avoids a second geometry pass; in a corridor made of flat
 * slabs that is more than accurate enough and it is what puts real dirt in the
 * corners.
 */
const SSAO_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D tDepth;
uniform mat4 uProjection;
uniform mat4 uInverseProjection;
uniform vec2 uResolution;
uniform float uRadius;
uniform float uBias;
uniform float uIntensity;

varying vec2 vUv;

#define SAMPLES 12

const vec3 kernel[SAMPLES] = vec3[SAMPLES](
  vec3( 0.5381, 0.1856, 0.4319), vec3( 0.1379, 0.2486, 0.4430),
  vec3( 0.3371, 0.5679, 0.0057), vec3(-0.6999, -0.0451, 0.0019),
  vec3( 0.0689, -0.1598, 0.8547), vec3( 0.0560, 0.0069, 0.1843),
  vec3(-0.0146, 0.1402, 0.0762), vec3( 0.0100, -0.1924, 0.0344),
  vec3(-0.3577, -0.5301, 0.4358), vec3(-0.3169, 0.1063, 0.0158),
  vec3( 0.0103, -0.5869, 0.0046), vec3(-0.0897, -0.4940, 0.3287)
);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 viewPosition(vec2 uv) {
  float depth = texture2D(tDepth, uv).x;
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = uInverseProjection * clip;
  return view.xyz / view.w;
}

void main() {
  float depth = texture2D(tDepth, vUv).x;
  if (depth >= 0.9999) {
    gl_FragColor = vec4(1.0);
    return;
  }

  vec3 origin = viewPosition(vUv);
  vec3 normal = normalize(cross(dFdx(origin), dFdy(origin)));

  float angle = hash(vUv * uResolution) * 6.2831853;
  vec3 randomVec = vec3(cos(angle), sin(angle), 0.0);
  vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
  vec3 bitangent = cross(normal, tangent);
  mat3 tbn = mat3(tangent, bitangent, normal);

  float occlusion = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float scale = 0.25 + 0.75 * (float(i) / float(SAMPLES));
    vec3 samplePoint = origin + tbn * kernel[i] * uRadius * scale;

    vec4 offset = uProjection * vec4(samplePoint, 1.0);
    offset.xyz /= offset.w;
    vec2 sampleUv = offset.xy * 0.5 + 0.5;
    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;

    float sampleDepth = viewPosition(sampleUv).z;
    float rangeCheck = smoothstep(0.0, 1.0, uRadius / max(0.0001, abs(origin.z - sampleDepth)));
    occlusion += (sampleDepth >= samplePoint.z + uBias ? 1.0 : 0.0) * rangeCheck;
  }

  float ao = 1.0 - (occlusion / float(SAMPLES)) * uIntensity;
  gl_FragColor = vec4(vec3(clamp(ao, 0.0, 1.0)), 1.0);
}
`;

/** Separable blur, reused for the ambient-occlusion clean-up and for bloom. */
const BLUR_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uDirection;
varying vec2 vUv;

void main() {
  vec4 sum = texture2D(tDiffuse, vUv) * 0.2270270270;
  sum += texture2D(tDiffuse, vUv + uDirection * 1.3846153846) * 0.3162162162;
  sum += texture2D(tDiffuse, vUv - uDirection * 1.3846153846) * 0.3162162162;
  sum += texture2D(tDiffuse, vUv + uDirection * 3.2307692308) * 0.0702702703;
  sum += texture2D(tDiffuse, vUv - uDirection * 3.2307692308) * 0.0702702703;
  gl_FragColor = sum;
}
`;

/** Everything above the threshold becomes glow: the tubes, the CRTs, the torch. */
const BRIGHT_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;

void main() {
  vec3 color = texture2D(tDiffuse, vUv).rgb;
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float contribution = smoothstep(uThreshold, uThreshold + uKnee, luminance);
  gl_FragColor = vec4(color * contribution, 1.0);
}
`;

/**
 * Final composite: occlusion, bloom, filmic tone mapping, a cool-shadow grade,
 * then the camcorder artefacts the game already had.
 */
const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform sampler2D tBloom0;
uniform sampler2D tBloom1;
uniform sampler2D tBloom2;
uniform sampler2D tAO;

uniform float uTime;
uniform float uGrain;
uniform float uVignette;
uniform float uAberration;
uniform float uWarp;
uniform float uExposure;
uniform float uFade;
uniform float uContrast;
uniform float uBloom;
uniform float uAOStrength;
uniform vec2 uResolution;

varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Narkowicz's ACES approximation: cheap, and it keeps the fluorescent
// highlights from turning into flat white discs.
vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 toSRGB(vec3 linear) {
  return mix(
    linear * 12.92,
    1.055 * pow(max(linear, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
    step(vec3(0.0031308), linear)
  );
}

void main() {
  vec2 centered = vUv - 0.5;
  float r2 = dot(centered, centered);
  vec2 uv = 0.5 + centered * (1.0 + uWarp * r2 * 1.6);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 offset = centered * uAberration * (0.4 + r2);
  vec3 color;
  color.r = texture2D(tDiffuse, uv + offset).r;
  color.g = texture2D(tDiffuse, uv).g;
  color.b = texture2D(tDiffuse, uv - offset).b;

  float ao = mix(1.0, texture2D(tAO, uv).r, uAOStrength);
  color *= ao;

  vec3 bloom =
    texture2D(tBloom0, uv).rgb * 0.55 +
    texture2D(tBloom1, uv).rgb * 0.32 +
    texture2D(tBloom2, uv).rgb * 0.22;
  color += bloom * uBloom;

  color *= uExposure;
  color = aces(color);

  // Grade: cool the shadows toward the fluorescent green-blue, keep the
  // highlights slightly warm, and pull a little saturation out overall.
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadowTint = vec3(0.93, 1.0, 1.06);
  vec3 highlightTint = vec3(1.04, 1.0, 0.94);
  color *= mix(shadowTint, highlightTint, smoothstep(0.15, 0.75, luminance));
  color = mix(vec3(luminance), color, 0.88);
  color = (color - 0.5) * uContrast + 0.5;

  float noise = hash(uv * uResolution + vec2(uTime * 61.7, uTime * 37.3));
  color += (noise - 0.5) * uGrain * (0.55 + 0.45 * (1.0 - luminance));

  float vignette = smoothstep(0.95, 0.16, length(centered) * 1.35);
  color *= mix(1.0, vignette, uVignette);

  float scan = 1.0 - 0.028 * step(0.5, fract(uv.y * uResolution.y * 0.25));
  color *= scan;
  color *= uFade;

  gl_FragColor = vec4(toSRGB(max(color, 0.0)), 1.0);
}
`;

/* ------------------------------------------------------------------ */

export interface PostFXTargets {
  grain: number;
  vignette: number;
  aberration: number;
  warp: number;
  exposure: number;
  contrast: number;
  bloom: number;
  ao: number;
}

interface QualityProfile {
  enabled: boolean;
  ssao: boolean;
  bloomLevels: number;
  renderScale: number;
}

const PROFILES: Record<QualityLevel, QualityProfile> = {
  low: { enabled: false, ssao: false, bloomLevels: 0, renderScale: 1 },
  medium: { enabled: true, ssao: false, bloomLevels: 2, renderScale: 1 },
  high: { enabled: true, ssao: true, bloomLevels: 3, renderScale: 1.25 },
};

/**
 * HDR post chain. The scene is rendered linearly into a half-float target, so
 * bloom happens before tone mapping and bright sources bleed the way they
 * would on a real sensor.
 */
export class PostFX {
  private profile: QualityProfile = PROFILES.medium;
  private sceneTarget!: THREE.WebGLRenderTarget;
  private aoTarget!: THREE.WebGLRenderTarget;
  private aoBlurTarget!: THREE.WebGLRenderTarget;
  private bloomTargets: THREE.WebGLRenderTarget[] = [];
  private bloomScratch: THREE.WebGLRenderTarget[] = [];

  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;

  private ssaoMaterial: THREE.ShaderMaterial;
  private blurMaterial: THREE.ShaderMaterial;
  private brightMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;
  private whiteTexture: THREE.DataTexture;
  private blackTexture: THREE.DataTexture;

  private strength = 1;
  private current: PostFXTargets = {
    grain: 0.05,
    vignette: 0.7,
    aberration: 0.0015,
    warp: 0.02,
    exposure: 1,
    contrast: 1.02,
    bloom: 1,
    ao: 1,
  };
  private wanted: PostFXTargets = { ...this.current };
  private fade = 1;
  private fadeTarget = 1;
  private pulse = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.whiteTexture = solidTexture(255);
    this.blackTexture = solidTexture(0);

    this.ssaoMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: SSAO_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      extensions: { derivatives: true } as never,
      uniforms: {
        tDepth: { value: null },
        uProjection: { value: new THREE.Matrix4() },
        uInverseProjection: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uRadius: { value: 0.6 },
        uBias: { value: 0.03 },
        uIntensity: { value: 1.05 },
      },
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: BLUR_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2() },
      },
    });

    this.brightMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: BRIGHT_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 1.15 },
        uKnee: { value: 0.7 },
      },
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tBloom0: { value: this.blackTexture },
        tBloom1: { value: this.blackTexture },
        tBloom2: { value: this.blackTexture },
        tAO: { value: this.whiteTexture },
        uTime: { value: 0 },
        uGrain: { value: 0.05 },
        uVignette: { value: 0.7 },
        uAberration: { value: 0.0015 },
        uWarp: { value: 0.02 },
        uExposure: { value: 1 },
        uFade: { value: 1 },
        uContrast: { value: 1.02 },
        uBloom: { value: 1 },
        uAOStrength: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.allocate();
  }

  /* ---------------------------------------------------------------- */

  private allocate(): void {
    this.dispose(false);

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const width = Math.max(2, Math.floor(size.x * this.profile.renderScale));
    const height = Math.max(2, Math.floor(size.y * this.profile.renderScale));

    const depthTexture = new THREE.DepthTexture(width, height);
    depthTexture.type = THREE.UnsignedIntType;

    this.sceneTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture,
    });

    const half = (divisor: number, floating = true): THREE.WebGLRenderTarget =>
      new THREE.WebGLRenderTarget(
        Math.max(1, Math.floor(width / divisor)),
        Math.max(1, Math.floor(height / divisor)),
        {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          type: floating ? THREE.HalfFloatType : THREE.UnsignedByteType,
          depthBuffer: false,
          stencilBuffer: false,
        },
      );

    this.aoTarget = half(2, false);
    this.aoBlurTarget = half(2, false);

    this.bloomTargets = [];
    this.bloomScratch = [];
    for (let level = 0; level < this.profile.bloomLevels; level++) {
      this.bloomTargets.push(half(2 << level));
      this.bloomScratch.push(half(2 << level));
    }

    (this.compositeMaterial.uniforms.uResolution.value as THREE.Vector2).set(width, height);
    (this.ssaoMaterial.uniforms.uResolution.value as THREE.Vector2).set(width / 2, height / 2);
  }

  setQuality(quality: QualityLevel): void {
    this.profile = PROFILES[quality] ?? PROFILES.medium;
    // Tone mapping is done in the composite when the chain is on, so the scene
    // pass must stay linear; without the chain the renderer does it itself.
    this.renderer.toneMapping = this.profile.enabled ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    this.allocate();
  }

  get enabled(): boolean {
    return this.profile.enabled;
  }

  /** How strongly emissive surfaces should overdrive, to feed the bloom. */
  get emissiveBoost(): number {
    return this.profile.enabled ? 3.2 : 1;
  }

  setStrength(strength: number): void {
    this.strength = clamp(strength, 0, 1);
  }

  resize(): void {
    this.allocate();
  }

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

  kick(amount = 1): void {
    this.pulse = Math.max(this.pulse, amount);
  }

  update(delta: number, time: number): void {
    for (const key of Object.keys(this.wanted) as Array<keyof PostFXTargets>) {
      this.current[key] = damp(this.current[key], this.wanted[key], 3, delta);
    }
    this.pulse = Math.max(0, this.pulse - delta * 1.6);
    this.fade = damp(this.fade, this.fadeTarget, 5, delta);

    const uniforms = this.compositeMaterial.uniforms;
    uniforms.uTime.value = time;
    uniforms.uGrain.value = this.current.grain * this.strength + this.pulse * 0.06;
    uniforms.uVignette.value = this.current.vignette * (0.4 + this.strength * 0.6) + this.pulse * 0.2;
    uniforms.uAberration.value = (this.current.aberration + this.pulse * 0.006) * this.strength;
    uniforms.uWarp.value = (this.current.warp + this.pulse * 0.05) * this.strength;
    uniforms.uExposure.value = this.current.exposure;
    uniforms.uContrast.value = this.current.contrast;
    uniforms.uBloom.value = this.current.bloom * (0.45 + this.strength * 0.55);
    uniforms.uAOStrength.value = this.profile.ssao ? this.current.ao : 0;
    uniforms.uFade.value = this.fade;
  }

  /* ---------------------------------------------------------------- */

  private blit(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  private blur(
    source: THREE.Texture,
    scratch: THREE.WebGLRenderTarget,
    destination: THREE.WebGLRenderTarget,
  ): void {
    this.blurMaterial.uniforms.tDiffuse.value = source;
    (this.blurMaterial.uniforms.uDirection.value as THREE.Vector2).set(1 / scratch.width, 0);
    this.blit(this.blurMaterial, scratch);

    this.blurMaterial.uniforms.tDiffuse.value = scratch.texture;
    (this.blurMaterial.uniforms.uDirection.value as THREE.Vector2).set(0, 1 / destination.height);
    this.blit(this.blurMaterial, destination);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    if (!this.profile.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }

    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    // --- Ambient occlusion ------------------------------------------
    if (this.profile.ssao) {
      this.ssaoMaterial.uniforms.tDepth.value = this.sceneTarget.depthTexture;
      (this.ssaoMaterial.uniforms.uProjection.value as THREE.Matrix4).copy(camera.projectionMatrix);
      (this.ssaoMaterial.uniforms.uInverseProjection.value as THREE.Matrix4).copy(
        camera.projectionMatrixInverse,
      );
      this.blit(this.ssaoMaterial, this.aoTarget);
      this.blur(this.aoTarget.texture, this.aoBlurTarget, this.aoTarget);
      this.compositeMaterial.uniforms.tAO.value = this.aoTarget.texture;
    } else {
      this.compositeMaterial.uniforms.tAO.value = this.whiteTexture;
    }

    // --- Bloom -------------------------------------------------------
    let source: THREE.Texture = this.sceneTarget.texture;
    for (let level = 0; level < this.bloomTargets.length; level++) {
      if (level === 0) {
        this.brightMaterial.uniforms.tDiffuse.value = source;
        this.blit(this.brightMaterial, this.bloomScratch[0]);
        source = this.bloomScratch[0].texture;
      }
      this.blur(source, this.bloomScratch[level], this.bloomTargets[level]);
      source = this.bloomTargets[level].texture;
    }
    for (let level = 0; level < 3; level++) {
      const uniform = this.compositeMaterial.uniforms[`tBloom${level}`];
      uniform.value = this.bloomTargets[level]?.texture ?? this.blackTexture;
    }

    // --- Composite ---------------------------------------------------
    this.compositeMaterial.uniforms.tDiffuse.value = this.sceneTarget.texture;
    this.blit(this.compositeMaterial, null);
  }

  dispose(full = true): void {
    this.sceneTarget?.depthTexture?.dispose();
    this.sceneTarget?.dispose();
    this.aoTarget?.dispose();
    this.aoBlurTarget?.dispose();
    for (const target of this.bloomTargets) target.dispose();
    for (const target of this.bloomScratch) target.dispose();
    this.bloomTargets = [];
    this.bloomScratch = [];

    if (!full) return;
    this.ssaoMaterial.dispose();
    this.blurMaterial.dispose();
    this.brightMaterial.dispose();
    this.compositeMaterial.dispose();
    this.whiteTexture.dispose();
    this.blackTexture.dispose();
    (this.quad.geometry as THREE.BufferGeometry).dispose();
  }
}

function solidTexture(value: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([value, value, value, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}
