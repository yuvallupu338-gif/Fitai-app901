/*
 * renderer.js — one forward pass, then a lens.
 *
 * The pipeline is deliberately short:
 *
 *   sky        a gradient, drawn first, which indoor levels never see because
 *              the ceiling covers it and outdoor levels live on;
 *   scene      every chunk and every moving thing, lit by up to sixteen point
 *              lights and one flashlight, into a half-float target;
 *   bloom      threshold, downsample, four blur passes;
 *   composite  bloom back in, ACES, vignette, aberration, grain, dither.
 *
 * There is no deferred pass, no SSAO buffer and no shadow map. The occlusion
 * is baked into the vertices, the shadows are a ten-step march through a
 * height field, and the entire budget goes into the lighting and the lens,
 * which is where the look actually comes from.
 */

import {
  createContext, createProgram, createArrayTexture, createTexture2D,
  createTarget, destroyTarget, createFullscreenVAO, createMeshVAO, destroyMesh,
} from '../core/gl.js';
import {
  SCENE_VERT, SCENE_FRAG, SKY_VERT, SKY_FRAG, POST_VERT,
  BRIGHT_FRAG, BLUR_FRAG, COMPOSITE_FRAG,
} from './shaders.js';
import { bakeMaterial, parseColor } from './textures.js';
import { MAT_COUNT, MAT } from '../world/grid.js';
import { MeshBuilder, addBox, addCylinder } from '../world/meshbuilder.js';
import {
  mat4, perspective, multiply, viewFromEuler, forwardFromEuler,
  frustumFromMatrix, aabbInFrustum, DEG,
} from '../core/math.js';

const MAX_LIGHTS = 16;

export class Renderer {
  constructor(canvas, quality = {}) {
    const ctx = createContext(canvas);
    if (!ctx) throw new Error('WebGL2 is required and this browser did not provide it.');
    this.canvas = canvas;
    this.gl = ctx.gl;
    this.caps = ctx.caps;
    this.quality = Object.assign({
      renderScale: 1,
      textureSize: 256,
      shadowLights: 2,
      bloom: true,
    }, quality);

    const gl = this.gl;
    this.scene = createProgram(gl, SCENE_VERT, SCENE_FRAG, 'scene');
    this.sky = createProgram(gl, SKY_VERT, SKY_FRAG, 'sky');
    this.bright = createProgram(gl, POST_VERT, BRIGHT_FRAG, 'bright');
    this.blur = createProgram(gl, POST_VERT, BLUR_FRAG, 'blur');
    this.composite = createProgram(gl, POST_VERT, COMPOSITE_FRAG, 'composite');
    this.fsVAO = createFullscreenVAO(gl);

    this.proj = mat4();
    this.view = mat4();
    this.viewProj = mat4();
    this.planes = new Float32Array(24);
    this.model = mat4();
    this.fwd = new Float32Array(3);

    this.lightPos = new Float32Array(MAX_LIGHTS * 4);
    this.lightCol = new Float32Array(MAX_LIGHTS * 4);
    this.lightList = new Array(MAX_LIGHTS);
    this.matA = new Float32Array(MAT_COUNT * 4);
    this.matB = new Float32Array(MAT_COUNT * 4);
    this.matTint = new Float32Array(MAT_COUNT * 4);

    this.targets = {};
    this.width = 0;
    this.height = 0;
    this.albedoTex = null;
    this.normalTex = null;
    this.occTex = null;
    this.level = null;
    this.dyn = {};
    this.stats = { chunks: 0, tris: 0, lights: 0 };

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.disable(gl.BLEND);
  }

  /* ---------------------------------------------------------------- *
   * Level setup
   * ---------------------------------------------------------------- */

  /*
   * Bake the level's materials and upload them as two array textures. Yields
   * between materials so the loading screen can actually paint — baking eight
   * 256² materials is a couple of hundred milliseconds of pure arithmetic and
   * doing it in one go looks like a hang.
   */
  async setLevel(level, onProgress) {
    const gl = this.gl;
    const size = this.quality.textureSize;
    const defs = normaliseMaterials(level);
    const albedo = [], normal = [];

    for (let i = 0; i < defs.length; i++) {
      const baked = bakeMaterial(defs[i], size);
      albedo.push(baked.albedo);
      normal.push(baked.normal);
      if (onProgress) onProgress((i + 1) / defs.length, defs[i].kind);
      await new Promise((r) => setTimeout(r, 0));
    }

    if (this.albedoTex) gl.deleteTexture(this.albedoTex);
    if (this.normalTex) gl.deleteTexture(this.normalTex);
    this.albedoTex = createArrayTexture(gl, this.caps, size, size, defs.length, albedo,
      { srgb: true });
    this.normalTex = createArrayTexture(gl, this.caps, size, size, defs.length, normal, {});

    for (let i = 0; i < MAT_COUNT; i++) {
      const d = defs[i] || defs[0];
      this.matA[i * 4]     = 1 / (d.tile || 2);
      this.matA[i * 4 + 1] = d.roughMul ?? 1;
      this.matA[i * 4 + 2] = d.emissive ?? 0;
      this.matA[i * 4 + 3] = d.specular ?? 0.3;
      this.matB[i * 4]     = d.water ?? 0;
      this.matB[i * 4 + 1] = d.normalStrength ?? 1;
      this.matB[i * 4 + 2] = d.cutout ? (d.alphaCut ?? 0.45) : 0;
      this.matB[i * 4 + 3] = d.tint ? 1 : 0;
      const t = d.tint ? parseColor(d.tint) : [1, 1, 1];
      this.matTint[i * 4] = t[0];
      this.matTint[i * 4 + 1] = t[1];
      this.matTint[i * 4 + 2] = t[2];
    }

    if (!this.occTex) {
      this.occTex = createTexture2D(gl, 128, 128, null, { nearest: true, clamp: true });
    }
    this.level = level;
    this.buildDynamicMeshes();
  }

  /* Meshes for everything that moves. Built once per level so they pick up the
   * level's own prop materials. */
  buildDynamicMeshes() {
    const gl = this.gl;
    for (const k of Object.keys(this.dyn)) destroyMesh(gl, this.dyn[k]);
    this.dyn = {};

    const make = (fn) => {
      const mb = new MeshBuilder(256);
      fn(mb);
      const d = mb.finish();
      return createMeshVAO(gl, this.scene, d.vertices, d.indices);
    };

    /* Almond water: a carton, because the bottle is a later invention and the
     * carton is what people picture. */
    this.dyn.almond = make((mb) => {
      addBox(mb, 0, 0.11, 0, 0.09, 0.22, 0.07, 0, MAT.LIGHT, { ao: () => 1 });
    });
    this.dyn.battery = make((mb) => {
      addCylinder(mb, 0, 0, 0, 0.035, 0.13, 8, MAT.PROP2, { ao: () => 0.9 });
    });
    this.dyn.note = make((mb) => {
      addBox(mb, 0, 0.005, 0, 0.21, 0.01, 0.29, 0, MAT.LIGHT, { ao: () => 1 });
    });
    /* Entities are deliberately barely-shapes. Anything more defined than this
     * is less frightening, not more, and at fog distance in the dark all the
     * player ever gets is a silhouette and a sound. */
    this.dyn.entity = make((mb) => {
      addBox(mb, 0, 0.9, 0, 0.42, 1.8, 0.32, 0, MAT.PROP2, { ao: () => 0.5 });
      addBox(mb, 0, 1.86, 0, 0.24, 0.26, 0.24, 0, MAT.PROP2, { ao: () => 0.45 });
      addBox(mb, 0.28, 1.1, 0, 0.12, 0.9, 0.12, 0.2, MAT.PROP2, { ao: () => 0.4 });
      addBox(mb, -0.28, 1.1, 0, 0.12, 0.9, 0.12, -0.2, MAT.PROP2, { ao: () => 0.4 });
    });
    this.dyn.crawler = make((mb) => {
      addBox(mb, 0, 0.34, 0, 0.5, 0.36, 1.0, 0, MAT.PROP2, { ao: () => 0.45 });
      addBox(mb, 0, 0.42, -0.6, 0.28, 0.26, 0.34, 0, MAT.PROP2, { ao: () => 0.4 });
    });
  }

  /* ---------------------------------------------------------------- *
   * Buffers
   * ---------------------------------------------------------------- */

  uploadMesh(data) {
    return createMeshVAO(this.gl, this.scene, data.vertices, data.indices);
  }
  releaseMesh(m) { destroyMesh(this.gl, m); }

  resize() {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = this.quality.renderScale;
    const w = Math.max(320, Math.floor(this.canvas.clientWidth * dpr * scale));
    const h = Math.max(240, Math.floor(this.canvas.clientHeight * dpr * scale));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);

    for (const k of Object.keys(this.targets)) destroyTarget(gl, this.targets[k]);
    this.targets = {
      scene: createTarget(gl, this.caps, w, h, { depth: true }),
      bloomA: createTarget(gl, this.caps, w >> 1, h >> 1, {}),
      bloomB: createTarget(gl, this.caps, w >> 1, h >> 1, {}),
    };
  }

  /* ---------------------------------------------------------------- *
   * Frame
   * ---------------------------------------------------------------- */

  render(world, cam, state) {
    const gl = this.gl;
    this.resize();
    const L = this.level;
    const t = this.targets;

    const aspect = this.width / this.height;
    perspective(this.proj, (cam.fov || 72) * DEG, aspect, 0.055, Math.max(120, L.fogFar * 3));
    viewFromEuler(this.view, cam.x, cam.y, cam.z, cam.yaw, cam.pitch);
    multiply(this.viewProj, this.proj, this.view);
    frustumFromMatrix(this.viewProj, this.planes);
    forwardFromEuler(cam.yaw, cam.pitch, this.fwd);

    gl.bindFramebuffer(gl.FRAMEBUFFER, t.scene.fb);
    gl.viewport(0, 0, this.width, this.height);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.drawSky(cam, aspect, state);
    this.drawScene(world, cam, state);

    if (this.quality.bloom) this.drawBloom(state);
    this.drawComposite(state);
  }

  drawSky(cam, aspect, state) {
    const gl = this.gl;
    const L = this.level;
    const p = this.sky;
    p.use();
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    const tanHalf = Math.tan((cam.fov || 72) * DEG / 2);
    /* Camera basis, same convention as viewFromEuler. */
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    gl.uniform3f(p.u.uRight, cy, 0, -sy);
    gl.uniform3f(p.u.uUp, sy * sp, cp, cy * sp);
    gl.uniform3f(p.u.uFwd, this.fwd[0], this.fwd[1], this.fwd[2]);
    gl.uniform2f(p.u.uScale, tanHalf * aspect, tanHalf);
    const sk = L.sky || {};
    setColor(gl, p.u.uHorizon, sk.horizon || L.fogColor);
    setColor(gl, p.u.uZenith, sk.zenith || L.fogColor);
    setColor(gl, p.u.uGround, sk.ground || L.fogColor);
    gl.uniform1f(p.u.uTime, state.time);
    gl.uniform1f(p.u.uStars, sk.stars || 0);

    gl.bindVertexArray(this.fsVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
  }

  drawScene(world, cam, state) {
    const gl = this.gl;
    const L = this.level;
    const p = this.scene;
    p.use();

    /* Lights. Gathered fresh each frame because which sixteen matter changes
     * as you walk, and because the flicker is evaluated here so the point
     * light and its emissive panel stay in step. */
    const n = world.gatherLights(cam.x, cam.y, cam.z, MAX_LIGHTS, this.lightList);
    for (let i = 0; i < n; i++) {
      const l = this.lightList[i];
      this.lightPos[i * 4] = l.x;
      this.lightPos[i * 4 + 1] = l.y;
      this.lightPos[i * 4 + 2] = l.z;
      this.lightPos[i * 4 + 3] = l.radius;
      const f = l.phase < 0 ? 1 : flickerCPU(state.time, l.phase);
      this.lightCol[i * 4] = l.r;
      this.lightCol[i * 4 + 1] = l.g;
      this.lightCol[i * 4 + 2] = l.b;
      this.lightCol[i * 4 + 3] = l.intensity * f * (state.lightScale ?? 1);
    }
    gl.uniform1i(p.u.uLightCount, n);
    gl.uniform4fv(p.u.uLightPos, this.lightPos);
    gl.uniform4fv(p.u.uLightColor, this.lightCol);
    gl.uniform1i(p.u.uShadowLights, Math.min(this.quality.shadowLights, n));
    this.stats.lights = n;

    gl.uniform3f(p.u.uCamPos, cam.x, cam.y, cam.z);
    gl.uniform1f(p.u.uTime, state.time);
    setColor(gl, p.u.uAmbient, scaleColor(L.ambient, state.ambientScale ?? 1));
    const ad = L.ambientDir || [0, 1, 0];
    gl.uniform3f(p.u.uAmbientDir, ad[0], ad[1], ad[2]);
    setColor(gl, p.u.uFogColor, L.fogColor);
    /* fogFar is the distance at which the level is essentially gone. The
     * shader wants a density, and exp2 fog reaches ~0.98 at 2/density. */
    gl.uniform1f(p.u.uFogDensity, 2 / Math.max(4, L.fogFar));
    gl.uniform1f(p.u.uFogHeight, L.fogHeight || 0);
    gl.uniform4fv(p.u.uMatA, this.matA);
    gl.uniform4fv(p.u.uMatB, this.matB);
    gl.uniform4fv(p.u.uMatTint, this.matTint);
    gl.uniformMatrix4fv(p.u.uViewProj, false, this.viewProj);

    const fl = state.flashlight || { on: false };
    if (fl.on) {
      gl.uniform4f(p.u.uFlash, fl.intensity ?? 2.4,
        Math.cos((fl.inner ?? 15) * DEG), Math.cos((fl.outer ?? 34) * DEG), fl.range ?? 22);
      gl.uniform3f(p.u.uFlashDir, this.fwd[0], this.fwd[1], this.fwd[2]);
    } else {
      gl.uniform4f(p.u.uFlash, 0, 1, 0.9, 1);
      gl.uniform3f(p.u.uFlashDir, 0, 0, -1);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.albedoTex);
    gl.uniform1i(p.u.uAlbedo, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.normalTex);
    gl.uniform1i(p.u.uNormalTex, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.occTex);
    if (world.occChanged) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, world.occSize, world.occSize,
        gl.RGBA, gl.UNSIGNED_BYTE, world.occData);
      world.occChanged = false;
    }
    gl.uniform1i(p.u.uOcc, 2);
    const rect = world.occRect();
    gl.uniform4f(p.u.uOccRect, rect[0], rect[1], rect[2], rect[3]);

    identityInto(this.model);
    gl.uniformMatrix4fv(p.u.uModel, false, this.model);

    let chunks = 0, tris = 0;
    for (const c of world.chunks.values()) {
      if (!c.mesh || !c.bounds) continue;
      const b = c.bounds;
      if (!aabbInFrustum(this.planes, b[0], b[1], b[2], b[3], b[4], b[5])) continue;
      gl.bindVertexArray(c.mesh.vao);
      gl.drawElements(gl.TRIANGLES, c.mesh.count, gl.UNSIGNED_INT, 0);
      chunks++;
      tris += c.mesh.count / 3;
    }
    this.stats.chunks = chunks;
    this.stats.tris = tris;

    /* Dynamic objects: items on the floor and whatever is walking around. */
    for (const d of state.dynamics || []) {
      const mesh = this.dyn[d.mesh];
      if (!mesh) continue;
      modelInto(this.model, d.x, d.y, d.z, d.rot || 0, d.scale || 1);
      gl.uniformMatrix4fv(p.u.uModel, false, this.model);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
  }

  drawBloom(state) {
    const gl = this.gl;
    const t = this.targets;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.fsVAO);

    const half = [t.bloomA.width, t.bloomA.height];
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.bloomA.fb);
    gl.viewport(0, 0, half[0], half[1]);
    this.bright.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.scene.color);
    gl.uniform1i(this.bright.u.uTex, 0);
    gl.uniform2f(this.bright.u.uTexel, 1 / this.width, 1 / this.height);
    /* Without float render targets everything above 1.0 has already been
     * clamped away, so a threshold of 1.0 finds nothing and the fixtures clip
     * to flat white with no glow at all. Dropping the threshold below 1
     * recovers most of the look on hardware that cannot do HDR. */
    gl.uniform1f(this.bright.u.uThreshold,
      t.scene.float ? (state.bloomThreshold ?? 1.0) : 0.70);
    gl.uniform1f(this.bright.u.uSoft, 0.6);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* Two ping-pong passes, the second at triple the step, which widens the
     * halo far more cheaply than another downsample chain. */
    this.blur.use();
    gl.uniform1i(this.blur.u.uTex, 0);
    const passes = [[1, 0, 1], [0, 1, 1], [1, 0, 3], [0, 1, 3]];
    let src = t.bloomA, dst = t.bloomB;
    for (const [dx, dy, k] of passes) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.viewport(0, 0, dst.width, dst.height);
      gl.bindTexture(gl.TEXTURE_2D, src.color);
      gl.uniform2f(this.blur.u.uDir, (dx * k) / half[0], (dy * k) / half[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const tmp = src; src = dst; dst = tmp;
    }
    this.bloomResult = src;

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  drawComposite(state) {
    const gl = this.gl;
    const p = this.composite;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    p.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.targets.scene.color);
    gl.uniform1i(p.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,
      (this.quality.bloom && this.bloomResult ? this.bloomResult : this.targets.scene).color);
    gl.uniform1i(p.u.uBloom, 1);
    gl.uniform2f(p.u.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(p.u.uTime, state.time);
    gl.uniform1f(p.u.uExposure, state.exposure ?? 1);
    gl.uniform1f(p.u.uBloomAmount, this.quality.bloom ? (state.bloom ?? 0.55) : 0);
    gl.uniform1f(p.u.uVignette, state.vignette ?? 0.35);
    gl.uniform1f(p.u.uGrain, state.grain ?? 0.055);
    gl.uniform1f(p.u.uAberration, state.aberration ?? 0.0016);
    gl.uniform1f(p.u.uVHS, state.vhs ?? 0);
    gl.uniform1f(p.u.uSanity, state.sanity ?? 1);
    gl.uniform1f(p.u.uDamage, state.damage ?? 0);
    const tint = this.level.tint || [1, 1, 1];
    gl.uniform3f(p.u.uTint, tint[0], tint[1], tint[2]);
    gl.bindVertexArray(this.fsVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/* Must match flicker() in the shader, or a fixture's light and its own glowing
 * panel drift apart and the illusion dies instantly. */
export function flickerCPU(t, phase) {
  if (phase < 0) return 1;
  const p = phase * 37;
  const slow = 0.94 + 0.06 * Math.sin(t * 1.7 + p * 6.283);
  const beat = Math.sin(t * 27 + p * 12) * 0.5 + 0.5;
  const s = Math.sin(Math.floor(t * 11 + p * 50) * 12.9898) * 43758.5453;
  const dropout = (s - Math.floor(s)) > 0.985 ? 1 : 0;
  return slow * (1 - 0.1 * beat * beat) * (1 - 0.75 * dropout);
}

function setColor(gl, loc, c) {
  const v = typeof c === 'string' ? parseColor(c) : (c || [1, 1, 1]);
  gl.uniform3f(loc, v[0], v[1], v[2]);
}

function scaleColor(c, k) {
  const v = typeof c === 'string' ? parseColor(c) : (c || [1, 1, 1]);
  return [v[0] * k, v[1] * k, v[2] * k];
}

function identityInto(m) {
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function modelInto(m, x, y, z, yaw, scale) {
  const c = Math.cos(yaw) * scale, s = Math.sin(yaw) * scale;
  m[0] = c;  m[1] = 0;      m[2] = s;  m[3] = 0;
  m[4] = 0;  m[5] = scale;  m[6] = 0;  m[7] = 0;
  m[8] = -s; m[9] = 0;      m[10] = c; m[11] = 0;
  m[12] = x; m[13] = y;     m[14] = z; m[15] = 1;
  return m;
}

/*
 * Fill in the material slots a level did not specify. Every level gets a full
 * set so the shader can index any slot without checking, and so a level that
 * only cares about its walls does not have to describe a prop material it will
 * never use.
 */
function normaliseMaterials(level) {
  const defs = (level.mats || []).slice(0, MAT_COUNT).map((d, i) =>
    Object.assign({ seed: (level.seed | 0) + i * 977 }, d));
  const fallback = [
    { kind: 'carpet', color: '#8a7a3c', tile: 2.2, bump: 1.4 },
    { kind: 'wallpaper', color: '#c8b464', tile: 1.7 },
    { kind: 'ceilingTile', color: '#d8d2b8', tile: 2.4 },
    { kind: 'lightPanel', color: '#fffaf0', tile: 1, emissive: 1, roughMul: 0.6 },
    { kind: 'drywall', color: '#b0a678', tile: 1.6 },
    { kind: 'water', color: '#2b4a52', tile: 3, water: 1, specular: 1.4, roughMul: 0.2 },
    { kind: 'metal', color: '#7c7a74', tile: 1.4 },
    { kind: 'metal', color: '#3a3d42', tile: 1.2, polish: 0.25 },
    { kind: 'blades', color: '#7f8a3c', tile: 1, cutout: true, specular: 0.1 },
  ];
  for (let i = 0; i < MAT_COUNT; i++) {
    if (!defs[i]) {
      defs[i] = Object.assign(
        { seed: (level.seed | 0) + i * 977 },
        fallback[i] || fallback[fallback.length - 1]);
    }
  }
  return defs;
}
