/*
 * renderer.js — one forward pass, then a lens.
 *
 * The villa is a small, fixed building, which changes what a renderer should
 * spend its budget on. There is no streaming, no chunk culling and no shadow
 * map: the whole house is a handful of static meshes plus a short list of
 * dynamic ones, and it all fits comfortably in a few draw calls.
 *
 *   scene       every surface, up to sixteen point lights and the torch, into
 *               a half-float target;
 *   bright      threshold;
 *   blur        separable gaussian, ping-ponged;
 *   composite   bloom back in, ACES, vignette, aberration, grain, dither.
 *
 * Two passes over the geometry rather than one: opaque first with depth write
 * on, then cut-out materials (the tape) with a discard threshold. Keeping the
 * cut-outs separate means the opaque pass never pays for the discard, and the
 * tape never has to be depth-sorted against itself.
 *
 * The renderer knows nothing about the game. It is handed a view — meshes,
 * lights, a camera and a mood — and draws it.
 */

import {
  createContext, createProgram, createArrayTexture, createTarget, destroyTarget,
  createFullscreenVAO, createMeshVAO, destroyMesh,
} from '../core/gl.js';
import {
  SCENE_VERT, SCENE_FRAG, POST_VERT, BRIGHT_FRAG, BLUR_FRAG, COMPOSITE_FRAG, MAX_LIGHTS,
} from './shaders.js';
import { bakeMaterial } from './textures.js';
import { mat4, perspective, multiply, viewFromEuler } from '../core/math.js';

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
      bloom: true,
      grain: 0.032,
      exposure: 1.15,
    }, quality);

    const gl = this.gl;
    this.pScene = createProgram(gl, SCENE_VERT, SCENE_FRAG, 'scene');
    this.pBright = createProgram(gl, POST_VERT, BRIGHT_FRAG, 'bright');
    this.pBlur = createProgram(gl, POST_VERT, BLUR_FRAG, 'blur');
    this.pComposite = createProgram(gl, POST_VERT, COMPOSITE_FRAG, 'composite');
    this.fsVAO = createFullscreenVAO(gl);

    this.proj = mat4();
    this.view = mat4();
    this.viewProj = mat4();

    /* Scratch, allocated once. A renderer that allocates per frame is a
     * renderer that stutters every few seconds when the collector runs. */
    this.lightPos = new Float32Array(MAX_LIGHTS * 3);
    this.lightColor = new Float32Array(MAX_LIGHTS * 3);
    this.lightRange = new Float32Array(MAX_LIGHTS);
    this.flicker = new Float32Array(8);
    this.flicker[0] = 1;

    this.targets = null;
    this.albedoTex = null;
    this.normalTex = null;
    this.materials = [];
    this.resize();
  }

  /* ---------------------------------------------------------- materials */

  /*
   * Bake every material into one 2D array texture pair. This is why the whole
   * villa draws in two calls: the material index rides in the vertex data, so
   * plaster, oak, timber and glass all come out of one bind.
   *
   * Baking is the slowest thing this game does — a second or so at 256px —
   * which is why it happens once, behind a loading screen, and never again.
   */
  setMaterials(defs) {
    const gl = this.gl;
    const size = this.quality.textureSize;
    this.materials = defs;

    const albedo = [];
    const normal = [];
    for (const def of defs) {
      const baked = bakeMaterial(def, size);
      albedo.push(baked.albedo);
      normal.push(baked.normal);
    }

    if (this.albedoTex) gl.deleteTexture(this.albedoTex);
    if (this.normalTex) gl.deleteTexture(this.normalTex);
    /* Albedo is sRGB so the sampler converts it; the normal map must not be,
     * because its channels are directions and a gamma curve is not something
     * you can apply to a direction. */
    this.albedoTex = createArrayTexture(gl, this.caps, size, size, defs.length, albedo, { srgb: true });
    this.normalTex = createArrayTexture(gl, this.caps, size, size, defs.length, normal, { srgb: false });
  }

  materialIndex(name) {
    const i = this.materials.findIndex((m) => m.name === name);
    return i < 0 ? 0 : i;
  }

  /* ------------------------------------------------------------ meshes */

  upload(data) {
    if (!data || !data.indices || data.indices.length === 0) return null;
    return createMeshVAO(this.gl, this.pScene, data.vertices, data.indices);
  }

  /*
   * A mesh that changes every frame — the intruders, and whatever is standing
   * on the other side of a window. Rebuilding a VAO sixty times a second means
   * allocating and freeing GL buffers sixty times a second, which is how a
   * renderer ends up stuttering on a schedule. This keeps the buffers and
   * overwrites their contents, growing only when the geometry outgrows them.
   */
  uploadDynamic(handle, data) {
    const gl = this.gl;
    if (!data || !data.indices || data.indices.length === 0) {
      if (handle) handle.count = 0;
      return handle;
    }
    if (!handle || data.vertices.length > handle.vCap || data.indices.length > handle.iCap) {
      if (handle) destroyMesh(gl, handle);
      /* Half again, so a mesh that grows steadily does not reallocate on
       * every single frame of the growth. */
      const vCap = Math.ceil(data.vertices.length * 1.5);
      const iCap = Math.ceil(data.indices.length * 1.5);
      const next = createMeshVAO(gl, this.pScene,
        new Float32Array(vCap), new Uint32Array(iCap));
      next.vCap = vCap;
      next.iCap = iCap;
      handle = next;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, handle.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.vertices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, handle.ibo);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, data.indices);
    handle.count = data.indices.length;
    return handle;
  }

  release(mesh) {
    destroyMesh(this.gl, mesh);
  }

  /* ------------------------------------------------------------ resize */

  resize() {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = this.quality.renderScale;
    const w = Math.max(320, Math.floor(this.canvas.clientWidth * dpr * scale));
    const h = Math.max(240, Math.floor(this.canvas.clientHeight * dpr * scale));
    if (this.targets && this.targets.w === w && this.targets.h === h) return;

    this.canvas.width = w;
    this.canvas.height = h;

    if (this.targets) {
      destroyTarget(gl, this.targets.scene);
      destroyTarget(gl, this.targets.bloomA);
      destroyTarget(gl, this.targets.bloomB);
    }
    const bw = Math.max(2, w >> 2);
    const bh = Math.max(2, h >> 2);
    this.targets = {
      w, h,
      scene: createTarget(gl, this.caps, w, h, { depth: true }),
      bloomA: createTarget(gl, this.caps, bw, bh, {}),
      bloomB: createTarget(gl, this.caps, bw, bh, {}),
    };
  }

  /* ------------------------------------------------------------ render */

  /*
   * `view` is the whole frame:
   *   camera   { x, y, z, yaw, pitch, fov }
   *   meshes   [{ mesh, cutout }]
   *   lights   [{ x, y, z, r, g, b, range, group }]
   *   torch    { on, level, range, inner, outer }
   *   ambient  [r, g, b]
   *   fog      { color: [r,g,b], density }
   *   stress   0..1, drives the lens
   *   time     seconds, for grain and flicker
   */
  render(view) {
    const gl = this.gl;
    const t = this.targets;
    const cam = view.camera;

    perspective(this.proj, (cam.fov || 68) * Math.PI / 180, t.w / t.h, 0.04, 90);
    viewFromEuler(this.view, cam.x, cam.y, cam.z, cam.yaw, cam.pitch);
    multiply(this.viewProj, this.proj, this.view);

    /* ---- scene ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.scene.fb);
    gl.viewport(0, 0, t.w, t.h);
    const fog = view.fog || { color: [0.01, 0.012, 0.02], density: 0.06 };
    gl.clearColor(fog.color[0], fog.color[1], fog.color[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    const p = this.pScene;
    p.use();
    gl.uniformMatrix4fv(p.u.uViewProj, false, this.viewProj);
    gl.uniform3f(p.u.uEye, cam.x, cam.y, cam.z);

    const amb = view.ambient || [0.012, 0.014, 0.020];
    gl.uniform3f(p.u.uAmbient, amb[0], amb[1], amb[2]);
    gl.uniform3f(p.u.uFogColor, fog.color[0], fog.color[1], fog.color[2]);
    gl.uniform1f(p.u.uFogDensity, fog.density);

    /* Nearest sixteen. Sorting by distance rather than dropping the tail means
     * walking into a room always lights that room, however many lamps are on
     * elsewhere in the house. */
    const lights = (view.lights || []).slice();
    lights.sort((a, b) => dist2(a, cam) - dist2(b, cam));
    const n = Math.min(lights.length, MAX_LIGHTS);
    for (let i = 0; i < n; i++) {
      const l = lights[i];
      this.lightPos[i * 3] = l.x; this.lightPos[i * 3 + 1] = l.y; this.lightPos[i * 3 + 2] = l.z;
      const f = (l.group ? this.flicker[l.group] : 1) * (l.intensity === undefined ? 1 : l.intensity);
      this.lightColor[i * 3] = l.r * f;
      this.lightColor[i * 3 + 1] = l.g * f;
      this.lightColor[i * 3 + 2] = l.b * f;
      this.lightRange[i] = l.range;
    }
    gl.uniform1i(p.u.uLightCount, n);
    gl.uniform3fv(p.u.uLightPos, this.lightPos);
    gl.uniform3fv(p.u.uLightColor, this.lightColor);
    gl.uniform1fv(p.u.uLightRange, this.lightRange);
    gl.uniform1fv(p.u.uFlicker, this.flicker);

    const torch = view.torch || { on: false };
    if (torch.on) {
      const dir = forward(cam.yaw, cam.pitch);
      gl.uniform3f(p.u.uTorchPos, cam.x, cam.y, cam.z);
      gl.uniform3f(p.u.uTorchDir, dir[0], dir[1], dir[2]);
      gl.uniform1f(p.u.uTorchInner, Math.cos((torch.inner || 16) * Math.PI / 180));
      gl.uniform1f(p.u.uTorchOuter, Math.cos((torch.outer || 30) * Math.PI / 180));
      gl.uniform1f(p.u.uTorchRange, torch.range || 16);
      gl.uniform1f(p.u.uTorchLevel, torch.level === undefined ? 1 : torch.level);
    } else {
      gl.uniform1f(p.u.uTorchLevel, 0);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.albedoTex);
    gl.uniform1i(p.u.uAlbedo, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.normalTex);
    gl.uniform1i(p.u.uNormal, 1);

    /* Opaque first, then the cut-outs. Splitting them is what keeps the
     * discard out of the hot path. */
    gl.uniform1f(p.u.uCutout, 0);
    for (const item of view.meshes) {
      if (!item || !item.mesh || item.cutout) continue;
      this.draw(item.mesh);
    }
    gl.uniform1f(p.u.uCutout, 0.5);
    gl.disable(gl.CULL_FACE);
    for (const item of view.meshes) {
      if (!item || !item.mesh || !item.cutout) continue;
      this.draw(item.mesh);
    }
    gl.enable(gl.CULL_FACE);

    /* ---- bloom ---- */
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.fsVAO);
    let bloomTex = null;
    if (this.quality.bloom) {
      /* Without float targets the scene never exceeds 1.0, so a threshold of
       * 1.0 would find nothing to bloom. Dropping it below one keeps the
       * highlights glowing on hardware that cannot give us HDR. */
      const threshold = t.scene.float ? 1.0 : 0.72;
      this.pass(this.pBright, t.bloomA, (pr) => {
        bindTex(gl, t.scene.color, 0);
        gl.uniform1i(pr.u.uTex, 0);
        gl.uniform1f(pr.u.uThreshold, threshold);
      });
      for (let i = 0; i < 3; i++) {
        this.pass(this.pBlur, t.bloomB, (pr) => {
          bindTex(gl, t.bloomA.color, 0);
          gl.uniform1i(pr.u.uTex, 0);
          gl.uniform2f(pr.u.uDir, 1 / t.bloomA.width, 0);
        });
        this.pass(this.pBlur, t.bloomA, (pr) => {
          bindTex(gl, t.bloomB.color, 0);
          gl.uniform1i(pr.u.uTex, 0);
          gl.uniform2f(pr.u.uDir, 0, 1 / t.bloomB.height);
        });
      }
      bloomTex = t.bloomA.color;
    }

    /* ---- composite ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, t.w, t.h);
    const c = this.pComposite;
    c.use();
    bindTex(gl, t.scene.color, 0);
    gl.uniform1i(c.u.uScene, 0);
    bindTex(gl, bloomTex || t.scene.color, 1);
    gl.uniform1i(c.u.uBloom, 1);
    gl.uniform1f(c.u.uBloomAmount, this.quality.bloom ? 0.55 : 0);
    gl.uniform1f(c.u.uExposure, this.quality.exposure);
    gl.uniform1f(c.u.uTime, view.time || 0);
    gl.uniform1f(c.u.uGrain, this.quality.grain);
    gl.uniform1f(c.u.uVignette, 0.85);
    /* Kept small on purpose. Chromatic aberration displaces the red and blue
     * channels by a fraction of the distance from the centre, so on
     * high-frequency detail at the edge of frame — a stippled ceiling seen at
     * a grazing angle is the worst case — it turns aliasing into rainbow
     * speckle. At this strength it reads as a lens and not as a fault. */
    gl.uniform1f(c.u.uAberration, 0.0007);
    gl.uniform1f(c.u.uStress, view.stress || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  draw(mesh) {
    const gl = this.gl;
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  pass(prog, target, setup) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.width, target.height);
    prog.use();
    setup(prog);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /*
   * Flicker, computed on the CPU because it is eight numbers and the shader
   * would have to recompute them per fragment. Group 0 never flickers. Each
   * other group has its own rhythm: mostly steady, with an occasional
   * stutter — a bulb that flickers constantly is a strobe, and a bulb that
   * flickers once every few seconds is a house with something wrong with it.
   */
  updateFlicker(time) {
    this.flicker[0] = 1;
    for (let g = 1; g < 8; g++) {
      const t = time * (0.7 + g * 0.31) + g * 17.3;
      const base = Math.sin(t) * 0.5 + Math.sin(t * 3.7) * 0.3;
      const stutter = Math.sin(t * 11.0) > 0.93 ? 0.45 : 1;
      this.flicker[g] = Math.max(0.25, (0.90 + base * 0.10) * stutter);
    }
  }
}

function dist2(l, cam) {
  const dx = l.x - cam.x, dy = l.y - cam.y, dz = l.z - cam.z;
  return dx * dx + dy * dy + dz * dz;
}

/* Same convention as core/math.js forwardFromEuler and Player.forward. */
function forward(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

function bindTex(gl, tex, unit) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
}
