/*
 * renderer.js — the frame.
 *
 * Draw order is opaque scene, then the blended lashes, then a bright pass, two
 * blurs and a composite. Everything is lit by at most eight point lights with
 * real inverse-square falloff; there are no shadow maps, because the only thing
 * in this shop that casts a shadow anyone would miss is the jaw onto the neck,
 * and that one is baked into the vertices where it costs nothing.
 *
 * The renderer also owns the transforms that make the customer alive — where
 * the eyes are looking, how far the lids are down, how the head sways. Those
 * are presentation, they change every frame, and putting them in the game layer
 * would mean the game layer holding matrices.
 */

import {
  createContext, createProgram, createTexture2D, createTarget, destroyTarget,
  createFullscreenVAO, createMeshVAO, destroyMesh,
} from '../core/gl.js';
import {
  mat4, identity, multiply, perspective, lookAt, compose, normalMatrix,
  invert, clamp, damp, smoothstep,
} from '../core/math.js';
import { SCENE_VS, SCENE_FS, FULLSCREEN_VS, BRIGHT_FS, BLUR_FS, POST_FS } from './shaders.js';
import {
  marbleTexture, lacquerTexture, metalTexture, wallTexture, floorTexture,
  packageTexture, bodySkinTexture, signTexture, tillScreenTexture, flatTexture,
} from './textures.js';
import { SHOP } from '../model/props.js';
import { srgbToLinear } from '../core/color.js';

const MODE = {
  STD: 0, SKIN: 1, BODY: 2, HAIR: 3, EYE: 4, LASH: 5, EMISSIVE: 6, SCREEN: 7,
};

/*
 * The shop's materials. `tex` names a texture built at boot; everything else is
 * a uniform.
 *
 * Tints are written here in sRGB, the way anybody reading a colour thinks of
 * it, and converted to linear on their way to the shader — because the texture
 * they multiply has already been decoded out of sRGB by the sampler. Getting
 * this wrong is not subtle and it is not obvious: the head, whose colour comes
 * from a texture, came out correct while the neck, whose colour came from a
 * tint, came out pale and washed next to it, on the same customer, from the
 * same skin tone.
 */
const MATERIALS = {
  floor: { tex: 'floor', tint: [1, 1, 1], rough: 0.30, metal: 0.0, uv: [3, 3], bump: 0.5 },
  wall: { tex: 'wall', tint: [0.98, 0.95, 0.97], rough: 0.85, metal: 0, uv: [1, 1], bump: 0.4 },
  marble: { tex: 'marble', tint: [1, 1, 1], rough: 0.16, metal: 0, uv: [1, 1], bump: 0.35 },
  lacquer: { tex: 'lacquer', tint: [0.95, 0.80, 0.98], rough: 0.22, metal: 0, uv: [1, 1], bump: 0.3 },
  metal: { tex: 'metal', tint: [0.86, 0.84, 0.88], rough: 0.28, metal: 0.9, uv: [1, 1], bump: 0.5 },
  emissive: { mode: MODE.EMISSIVE, emissive: [1.45, 1.32, 1.38] },
  screen: { mode: MODE.SCREEN, tex: 'till', emissive: [1.15, 1.15, 1.15], uv: [1, 1] },
  sign: { mode: MODE.SCREEN, tex: 'sign', emissive: [1.30, 1.05, 1.22], uv: [1, 1] },
  productA: { tex: 'package', tint: [0.95, 0.72, 0.78], rough: 0.20, metal: 0.1, uv: [1, 1] },
  productB: { tex: 'package', tint: [0.55, 0.40, 0.62], rough: 0.20, metal: 0.1, uv: [1, 1] },
  productC: { tex: 'package', tint: [0.92, 0.86, 0.70], rough: 0.18, metal: 0.5, uv: [1, 1] },
  productD: { tex: 'package', tint: [0.30, 0.30, 0.34], rough: 0.25, metal: 0.2, uv: [1, 1] },
  productE: { tex: 'package', tint: [0.86, 0.52, 0.46], rough: 0.20, metal: 0.1, uv: [1, 1] },
  productF: { tex: 'package', tint: [0.72, 0.86, 0.88], rough: 0.18, metal: 0.2, uv: [1, 1] },
};

/*
 * Lighting. A beauty counter is lit like nowhere else: a very large soft key
 * straight at the face so nothing casts a shadow on it, a coloured wash off the
 * back shelving, and warm pendants that exist to give the room a temperature
 * the key light does not have.
 */
/*
 * Intensities are in the units the tone mapper expects: a lit face should land
 * around 0.7 of linear white, not above it. The first version of this table was
 * four times brighter, and every one of them clipped — the head came out as a
 * featureless cream egg with two eyes on it, because ACES maps everything past
 * about 1.2 to the same white and the nose, the lips and the eye sockets all
 * landed on the far side of it. Lighting a face is mostly about not doing that.
 */
const LIGHTS = [
  /*
   * The key is off the camera axis on purpose, up and to one side. A ring light
   * dead in front of a face is what a beauty counter really has, and it is also
   * exactly the light under which a nose is invisible: with no shadows in this
   * renderer, the only thing that draws a nose is the N·L gradient across it,
   * and a frontal key flattens that to nothing. Moving it 30 degrees over gives
   * the nose, the brow and the cheekbones something to catch.
   */
  { pos: [0.62, 2.05, 0.30], r: 2.4, col: [1.0, 0.96, 0.93], power: 0.92 },
  /* Soft fill from the other side, so the shadow side is modelled and not
   * merely dark. */
  { pos: [-0.85, 1.62, 0.35], r: 2.2, col: [0.95, 0.93, 1.0], power: 0.32 },
  { pos: [0, 1.40, -2.85], r: 3.4, col: [1.0, 0.62, 0.82], power: 0.40 },
  { pos: [-1.6, 2.26, -1.2], r: 2.6, col: [1.0, 0.78, 0.52], power: 0.22 },
  { pos: [1.6, 2.26, -1.2], r: 2.6, col: [1.0, 0.78, 0.52], power: 0.22 },
  /* The counter bounce. Marble under a face throws a real fill up into the
   * jaw, and leaving it out is what makes a CG face look like it is floating. */
  { pos: [0, 1.06, -0.30], r: 1.4, col: [0.85, 0.80, 0.86], power: 0.16 },
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.frames = 0;
    this.lastCapture = null;
    this._capture = false;
    this.quality = { scale: 1, texture: 512, bloom: true };
    this.shopMeshes = [];
    this.trayMeshes = [];
    this.customer = null;
    this.time = 0;
    this.viewProj = mat4();
    this.invViewProj = mat4();
    this._model = mat4();
    this._nrm = new Float32Array(9);
    this._view = mat4();
    this._proj = mat4();
    this.camera = { yaw: 0, pitch: 0.06, dist: 0.95, target: [0, SHOP.customerHeadY - 0.09, SHOP.customerZ] };
    this.eyePos = [0, 1.5, 0];
  }

  init() {
    const ctx = createContext(this.canvas);
    if (!ctx) return false;
    this.gl = ctx.gl;
    this.caps = ctx.caps;
    const gl = this.gl;

    this.progScene = createProgram(gl, SCENE_VS, SCENE_FS, 'scene');
    this.progBright = createProgram(gl, FULLSCREEN_VS, BRIGHT_FS, 'bright');
    this.progBlur = createProgram(gl, FULLSCREEN_VS, BLUR_FS, 'blur');
    this.progPost = createProgram(gl, FULLSCREEN_VS, POST_FS, 'post');
    this.fsVAO = createFullscreenVAO(gl);

    const N = this.quality.texture;
    this.tex = {
      floor: createTexture2D(gl, this.caps, N, N, floorTexture(N), { srgb: true }),
      wall: createTexture2D(gl, this.caps, N, N, wallTexture(N), { srgb: true }),
      marble: createTexture2D(gl, this.caps, N, N, marbleTexture(N), { srgb: true }),
      lacquer: createTexture2D(gl, this.caps, 256, 256, lacquerTexture(256), { srgb: true }),
      metal: createTexture2D(gl, this.caps, 256, 256, metalTexture(256), { srgb: true }),
      package: createTexture2D(gl, this.caps, 256, 256, packageTexture(256), { srgb: true }),
      body: createTexture2D(gl, this.caps, 128, 128, bodySkinTexture(128), { srgb: true }),
      flat: createTexture2D(gl, this.caps, 1, 1, flatTexture(), { srgb: true, mips: false }),
    };
    const sign = signTexture('BELLA · בלה');
    if (sign) this.tex.sign = createTexture2D(gl, this.caps, 512, 128, sign, { srgb: true, clamp: true });
    this.setTillScreen([], 0);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    return true;
  }

  /* The till's screen is a texture the game rewrites as items are rung up. */
  setTillScreen(lines, total) {
    const px = tillScreenTexture(lines, total);
    if (!px) return;
    const gl = this.gl;
    if (!this.tex.till) {
      this.tex.till = createTexture2D(gl, this.caps, 256, 168, px, { srgb: true, clamp: true, mips: false });
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.tex.till.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 168, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }

  resize(width, height) {
    const gl = this.gl;
    /*
     * Render at device pixels, not CSS pixels. On any modern phone or laptop
     * those differ by two or three times, and drawing at CSS resolution is the
     * difference between a face with an eyelash on it and a face with a smudge.
     * Capped at 2: past that the cost is real and nobody can see it.
     */
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const scale = this.quality.scale * dpr;
    const w = Math.max(2, Math.round(width * scale));
    const h = Math.max(2, Math.round(height * scale));
    if (this.width === w && this.height === h) return;
    this.width = w; this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    destroyTarget(gl, this.sceneTarget);
    destroyTarget(gl, this.blurA);
    destroyTarget(gl, this.blurB);
    this.sceneTarget = createTarget(gl, this.caps, w, h, { depth: true });
    const bw = Math.max(2, w >> 1), bh = Math.max(2, h >> 1);
    this.blurA = createTarget(gl, this.caps, bw, bh, {});
    this.blurB = createTarget(gl, this.caps, bw, bh, {});
  }

  /* ---------------------------------------------------------------- *
   * Scene contents
   * ---------------------------------------------------------------- */

  setShop(groups) {
    const gl = this.gl;
    for (const g of this.shopMeshes) destroyMesh(gl, g.vao);
    this.shopMeshes = groups.map((g) => ({
      vao: createMeshVAO(gl, this.progScene, g.mesh.vertices, g.mesh.indices),
      mat: g.mat,
      name: g.name,
    }));
  }

  setTray(groups) {
    const gl = this.gl;
    for (const g of this.trayMeshes) destroyMesh(gl, g.vao);
    this.trayMeshes = groups.map((g) => ({
      vao: createMeshVAO(gl, this.progScene, g.mesh.vertices, g.mesh.indices),
      product: g.product,
      x: g.x,
    }));
  }

  /*
   * Hand over a whole customer: meshes, textures and the anchors the animation
   * needs. Everything the previous customer owned is released here — a shift is
   * a dozen customers and a leaked head is twenty thousand vertices each time.
   */
  setCustomer(c) {
    const gl = this.gl;
    this.releaseCustomer();
    this.customer = {
      ...c,
      vao: {
        head: createMeshVAO(gl, this.progScene, c.head.vertices, c.head.indices, c.morph),
        neck: createMeshVAO(gl, this.progScene, c.neck.vertices, c.neck.indices),
        garment: createMeshVAO(gl, this.progScene, c.garment.vertices, c.garment.indices),
        ears: createMeshVAO(gl, this.progScene, c.ears.vertices, c.ears.indices),
        hands: createMeshVAO(gl, this.progScene, c.hands.vertices, c.hands.indices),
        hair: createMeshVAO(gl, this.progScene, c.hair.vertices, c.hair.indices),
        eye: createMeshVAO(gl, this.progScene, c.eye.vertices, c.eye.indices),
        lidL: createMeshVAO(gl, this.progScene, c.lidL.vertices, c.lidL.indices),
        lidR: createMeshVAO(gl, this.progScene, c.lidR.vertices, c.lidR.indices),
        lowL: createMeshVAO(gl, this.progScene, c.lowL.vertices, c.lowL.indices),
        lowR: createMeshVAO(gl, this.progScene, c.lowR.vertices, c.lowR.indices),
        lashL: createMeshVAO(gl, this.progScene, c.lashL.vertices, c.lashL.indices),
        lashR: createMeshVAO(gl, this.progScene, c.lashR.vertices, c.lashR.indices),
      },
      tex: {
        skin: createTexture2D(gl, this.caps, c.skinSize, c.skinSize, c.skinPixels, { srgb: true, clamp: true }),
        iris: createTexture2D(gl, this.caps, 256, 256, c.irisPixels, { srgb: true, clamp: true }),
        hair: createTexture2D(gl, this.caps, 256, 256, c.hairPixels, { srgb: true }),
        garment: createTexture2D(gl, this.caps, 256, 256, c.garmentPixels, { srgb: true }),
      },
    };
    return this.customer;
  }

  releaseCustomer() {
    if (!this.customer) return;
    const gl = this.gl;
    for (const m of Object.values(this.customer.vao)) destroyMesh(gl, m);
    for (const t of Object.values(this.customer.tex)) gl.deleteTexture(t.tex);
    this.customer = null;
  }

  /* ---------------------------------------------------------------- *
   * Drawing
   * ---------------------------------------------------------------- */

  _bindMaterial(mat) {
    const gl = this.gl;
    const p = this.progScene;
    const m = typeof mat === 'string' ? MATERIALS[mat] : mat;
    const tex = (m.tex && this.tex[m.tex]) || this.tex.flat;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, m.texture ? m.texture.tex : tex.tex);
    gl.uniform1i(p.u.uTex, 0);
    const tint = m.tint || [1, 1, 1];
    gl.uniform3f(p.u.uTint,
      srgbToLinear(tint[0]), srgbToLinear(tint[1]), srgbToLinear(tint[2]));
    gl.uniform3fv(p.u.uEmissive, m.emissive || [0, 0, 0]);
    gl.uniform3fv(p.u.uSSS, m.sss || [0, 0, 0]);
    gl.uniform2fv(p.u.uUVScale, m.uv || [1, 1]);
    gl.uniform1f(p.u.uRough, m.rough === undefined ? 0.6 : m.rough);
    gl.uniform1f(p.u.uMetal, m.metal || 0);
    gl.uniform1f(p.u.uBump, m.bump === undefined ? 0.4 : m.bump);
    gl.uniform1f(p.u.uOpacity, m.opacity === undefined ? 1 : m.opacity);
    gl.uniform1i(p.u.uMode, m.mode === undefined ? MODE.STD : m.mode);
    gl.uniform2f(p.u.uMorph, m.morph ? m.morph[0] : 0, m.morph ? m.morph[1] : 0);
  }

  _draw(vao, model, mat) {
    const gl = this.gl;
    const p = this.progScene;
    this._bindMaterial(mat);
    gl.uniformMatrix4fv(p.u.uModel, false, model);
    normalMatrix(this._nrm, model);
    gl.uniformMatrix3fv(p.u.uNormalMat, false, this._nrm);
    gl.bindVertexArray(vao.vao);
    gl.drawElements(gl.TRIANGLES, vao.count, gl.UNSIGNED_INT, 0);
  }

  /*
   * A rotation built from three axes plus a translation. The eyes and lids are
   * both "point this local frame along that direction", which is not something
   * euler angles express without a gimbal argument.
   */
  static basis(out, rx, ry, rz, ux, uy, uz, fx, fy, fz, px, py, pz, scale) {
    out[0] = rx * scale; out[1] = ry * scale; out[2] = rz * scale; out[3] = 0;
    out[4] = ux * scale; out[5] = uy * scale; out[6] = uz * scale; out[7] = 0;
    out[8] = fx * scale; out[9] = fy * scale; out[10] = fz * scale; out[11] = 0;
    out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
    return out;
  }

  render(state, dt) {
    const gl = this.gl;
    this.time += dt;
    const c = this.customer;

    /* ---- camera ---- */
    const cam = this.camera;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const ex = cam.target[0] + sy * cp * cam.dist;
    const ey = cam.target[1] + sp * cam.dist;
    const ez = cam.target[2] + cy * cp * cam.dist;
    this.eyePos[0] = ex; this.eyePos[1] = ey; this.eyePos[2] = ez;
    lookAt(this._view, ex, ey, ez, cam.target[0], cam.target[1], cam.target[2]);
    perspective(this._proj, 0.62, this.width / this.height, 0.03, 40);
    multiply(this.viewProj, this._proj, this._view);
    invert(this.invViewProj, this.viewProj);

    /* ---- scene pass ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget.fb);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0.02, 0.02, 0.03, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const p = this.progScene;
    p.use();
    gl.uniformMatrix4fv(p.u.uViewProj, false, this.viewProj);
    gl.uniform3fv(p.u.uCamPos, this.eyePos);
    gl.uniform1f(p.u.uTime, this.time);
    gl.uniform1i(p.u.uLightCount, LIGHTS.length);
    const lp = new Float32Array(LIGHTS.length * 4);
    const lc = new Float32Array(LIGHTS.length * 4);
    for (let i = 0; i < LIGHTS.length; i++) {
      const L = LIGHTS[i];
      lp.set([L.pos[0], L.pos[1], L.pos[2], L.r], i * 4);
      lc.set([L.col[0], L.col[1], L.col[2], L.power * (state.dim || 1)], i * 4);
    }
    gl.uniform4fv(p.u.uLightPos, lp);
    gl.uniform4fv(p.u.uLightCol, lc);
    gl.uniform3fv(p.u.uAmbSky, [0.085, 0.080, 0.098]);
    gl.uniform3fv(p.u.uAmbGround, [0.032, 0.029, 0.033]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.flat.tex);
    gl.uniform1i(p.u.uPaint, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.flat.tex);
    gl.uniform1i(p.u.uFx, 2);

    identity(this._model);
    for (const g of this.shopMeshes) this._draw(g.vao, this._model, g.mat);
    for (const g of this.trayMeshes) {
      this._draw(g.vao, this._model, {
        tex: 'package', tint: g.product.trayTint || [0.9, 0.9, 0.9],
        rough: 0.18, metal: 0.25, uv: [1, 1],
      });
    }

    if (c) this._drawCustomer(c, state, dt);

    /* ---- post ---- */
    this._post(state);
    this.frames++;
    if (this._capture) this._grab();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _drawCustomer(c, state, dt) {
    const gl = this.gl;
    const p = this.progScene;
    const a = c.anim;

    /* Idle: a slow sway plus a breath. Without it the customer is a bust on a
     * plinth, and every reaction reads as a glitch rather than a movement. */
    a.t += dt;
    const sway = Math.sin(a.t * 0.62) * 0.020 + Math.sin(a.t * 0.23) * 0.014;
    const nod = Math.sin(a.t * 0.47 + 1.1) * 0.012;
    a.yaw = damp(a.yaw, (state.headYaw || 0) + sway, 3.0, dt);
    a.pitch = damp(a.pitch, (state.headPitch || 0) + nod, 3.0, dt);
    a.morph[0] = damp(a.morph[0], state.smile || 0, 6.0, dt);
    a.morph[1] = damp(a.morph[1], state.concern || 0, 6.0, dt);

    /* Blink. A real one is fast down and slower up, and the pause between them
     * is what stops it looking mechanical. */
    a.blinkTimer -= dt;
    if (a.blinkTimer <= 0) {
      a.blinkTimer = 2.4 + (a.t * 37 % 3.7);
      a.blink = 1;
    }
    if (a.blink > 0) a.blink = Math.max(0, a.blink - dt * 6.5);
    const blinkAmt = Math.sin(Math.min(1, a.blink) * Math.PI);
    const lidClose = clamp(Math.max(state.eyesClosed || 0, blinkAmt), 0, 1);
    a.lid = damp(a.lid, lidClose, 18, dt);

    const scale = SHOP.headScale;
    compose(this._model, 0, SHOP.customerHeadY, SHOP.customerZ,
      a.pitch, a.yaw, 0, scale, scale, scale);
    const M = mat4();
    M.set(this._model);
    /* Kept for picking: a pointer has to be turned into a face-space
     * coordinate against the matrix the frame was actually drawn with. */
    c.headMatrix = M;

    /* ---- the face ---- */
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, c.paintTex.tex);
    gl.uniform1i(p.u.uPaint, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, c.fxTex.tex);
    gl.uniform1i(p.u.uFx, 2);

    const skinMat = {
      mode: MODE.SKIN, texture: c.tex.skin, tint: [1, 1, 1],
      rough: 0.42, metal: 0, uv: [1, 1], bump: 0.55, sss: c.sssRgb,
      morph: a.morph,
    };
    this._draw(c.vao.head, M, skinMat);

    /* ---- neck, ears, hands ---- */
    const bodyMat = {
      mode: MODE.BODY, texture: this.tex.body, tint: c.skinRgb,
      rough: 0.48, metal: 0, uv: [3, 3], bump: 0.35, sss: c.sssRgb,
    };
    this._draw(c.vao.neck, M, bodyMat);
    this._draw(c.vao.ears, M, bodyMat);
    this._draw(c.vao.hands, M, bodyMat);

    this._draw(c.vao.garment, M, {
      mode: MODE.STD, texture: c.tex.garment, tint: [1, 1, 1],
      rough: 0.72, metal: 0, uv: [1, 1], bump: 0.5,
    });

    /* ---- eyes and lids ---- */
    const eyeMat = {
      mode: MODE.EYE, texture: c.tex.iris, tint: [1, 1, 1],
      rough: 0.08, metal: 0, uv: [1, 1], bump: 0,
    };
    const lidMat = { ...skinMat, morph: [0, 0] };
    const lashMat = {
      mode: MODE.LASH, tint: c.lashRgb, opacity: c.lashOpacity,
      uv: [1, 1],
    };

    const gaze = state.gaze || [0, SHOP.customerHeadY, 1.4];
    for (const side of [-1, 1]) {
      const anchor = side < 0 ? c.eyeL : c.eyeR;
      /* Eye centre in world space. */
      const ex = M[0] * anchor.centre[0] + M[4] * anchor.centre[1] + M[8] * anchor.centre[2] + M[12];
      const ey = M[1] * anchor.centre[0] + M[5] * anchor.centre[1] + M[9] * anchor.centre[2] + M[13];
      const ez = M[2] * anchor.centre[0] + M[6] * anchor.centre[1] + M[10] * anchor.centre[2] + M[14];

      let fx = gaze[0] - ex, fy = gaze[1] - ey, fz = gaze[2] - ez;
      const fl = Math.hypot(fx, fy, fz) || 1;
      fx /= fl; fy /= fl; fz /= fl;
      /* Eyes do not swivel more than about 35 degrees before the head turns
       * with them; past that a gaze reads as a lizard. */
      const nx = M[0] * anchor.normal[0] + M[4] * anchor.normal[1] + M[8] * anchor.normal[2];
      const ny = M[1] * anchor.normal[0] + M[5] * anchor.normal[1] + M[9] * anchor.normal[2];
      const nz = M[2] * anchor.normal[0] + M[6] * anchor.normal[1] + M[10] * anchor.normal[2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      const dot = (fx * nx + fy * ny + fz * nz) / nl;
      const limit = Math.cos(0.62);
      if (dot < limit) {
        const k = smoothstep(limit - 0.35, limit, dot);
        fx = fx * k + (nx / nl) * (1 - k);
        fy = fy * k + (ny / nl) * (1 - k);
        fz = fz * k + (nz / nl) * (1 - k);
        const l2 = Math.hypot(fx, fy, fz) || 1;
        fx /= l2; fy /= l2; fz /= l2;
      }

      /* Basis with the eye's forward on the gaze, and right taken as the
       * horizontal perpendicular — world up crossed with forward, written out
       * because two of its three terms are zero. */
      let rx = -fz, ry = 0, rz = fx;
      let rl = Math.hypot(rx, ry, rz);
      if (rl < 1e-5) { rx = 1; rz = 0; rl = 1; }
      rx /= rl; rz /= rl;
      const ux = ry * fz - rz * fy;
      const uy = rz * fx - rx * fz;
      const uz = rx * fy - ry * fx;

      const eyeM = mat4();
      Renderer.basis(eyeM, rx, ry, rz, ux, uy, uz, fx, fy, fz, ex, ey, ez, scale);
      this._draw(c.vao.eye, eyeM, eyeMat);

      /* The lid shares the eye's origin but hinges on the socket's own axis,
       * not the gaze — a lid that followed the eyes would slide off the face
       * every time the customer looked sideways. */
      const lidM = mat4();
      const bx = M[0] * anchor.normal[0] + M[4] * anchor.normal[1] + M[8] * anchor.normal[2];
      const by = M[1] * anchor.normal[0] + M[5] * anchor.normal[1] + M[9] * anchor.normal[2];
      const bz = M[2] * anchor.normal[0] + M[6] * anchor.normal[1] + M[10] * anchor.normal[2];
      const bl = Math.hypot(bx, by, bz) || 1;
      const nfx = bx / bl, nfy = by / bl, nfz = bz / bl;
      let arx = -nfz, ary = 0, arz = nfx;
      const arl = Math.hypot(arx, ary, arz) || 1;
      arx /= arl; arz /= arl;
      const aux = ary * nfz - arz * nfy;
      const auy = arz * nfx - arx * nfz;
      const auz = arx * nfy - ary * nfx;
      /*
       * Swing the lid about that axis. Open is rotated up out of the way, but
       * not far enough to clear the eyeball — a real upper lid covers the top
       * of the iris even wide open, and without that the customer stares.
       */
      const hinge = (angle, out) => {
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const f2x = nfx * ca + aux * sa, f2y = nfy * ca + auy * sa, f2z = nfz * ca + auz * sa;
        const u2x = -nfx * sa + aux * ca, u2y = -nfy * sa + auy * ca, u2z = -nfz * sa + auz * ca;
        return Renderer.basis(out, arx, ary, arz, u2x, u2y, u2z, f2x, f2y, f2z,
          ex, ey, ez, scale);
      };

      hinge((1 - a.lid) * 1.00, lidM);
      this._draw(side < 0 ? c.vao.lidL : c.vao.lidR, lidM, lidMat);
      if (side < 0) c.lidMatrixL = lidM; else c.lidMatrixR = lidM;

      /* The lower lid barely moves — it lifts a little as the eye closes, which
       * is what a blink actually looks like, and the rest of the time it is the
       * thing that turns a sphere into an eye. */
      const lowM = mat4();
      hinge(-(1.00 - a.lid * 0.28), lowM);
      this._draw(side < 0 ? c.vao.lowL : c.vao.lowR, lowM, lidMat);
    }

    /* ---- hair ---- */
    this._draw(c.vao.hair, M, {
      mode: MODE.HAIR, texture: c.tex.hair, tint: [1, 1, 1],
      rough: 0.30, metal: 0, uv: [1, 1], bump: 0.55,
    });

    /* ---- lashes, blended, last ---- */
    if (c.lashOpacity > 0.01) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      this._draw(c.vao.lashL, c.lidMatrixL, lashMat);
      this._draw(c.vao.lashR, c.lidMatrixR, lashMat);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }

  _post(state) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.fsVAO);

    if (this.quality.bloom) {
      const b = this.progBright;
      b.use();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurA.fb);
      gl.viewport(0, 0, this.blurA.width, this.blurA.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.color);
      gl.uniform1i(b.u.uSrc, 0);
      gl.uniform1f(b.u.uThreshold, 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const bl = this.progBlur;
      bl.use();
      for (let pass = 0; pass < 2; pass++) {
        for (const [src, dst, dir] of [
          [this.blurA, this.blurB, [1 / this.blurA.width, 0]],
          [this.blurB, this.blurA, [0, 1 / this.blurA.height]],
        ]) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
          gl.viewport(0, 0, dst.width, dst.height);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, src.color);
          gl.uniform1i(bl.u.uSrc, 0);
          gl.uniform2f(bl.u.uDir, dir[0] * (1 + pass), dir[1] * (1 + pass));
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }
    }

    const po = this.progPost;
    po.use();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.color);
    gl.uniform1i(po.u.uSrc, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.quality.bloom ? this.blurA.color : this.tex.flat.tex);
    gl.uniform1i(po.u.uBloom, 1);
    gl.uniform1f(po.u.uExposure, state.exposure || 1.0);
    gl.uniform1f(po.u.uBloomAmount, this.quality.bloom ? 0.55 : 0);
    gl.uniform1f(po.u.uVignette, 0.42);
    gl.uniform1f(po.u.uGrain, 0.020);
    gl.uniform1f(po.u.uTime, this.time);
    gl.uniform2f(po.u.uResolution, this.width, this.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
  }

  /* ---------------------------------------------------------------- *
   * Self-inspection, for the smoke test
   * ---------------------------------------------------------------- */

  requestCapture() { this._capture = true; this.lastCapture = null; }

  /*
   * Summarise the frame that was just drawn, from inside the render call.
   * Reading the canvas from outside is unreliable without preserveDrawingBuffer
   * — the contents are undefined after compositing — and a flaky pixel check is
   * worse than none, because it fails on frames that are fine.
   */
  _grab() {
    const gl = this.gl;
    this._capture = false;
    const w = this.width, h = this.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);

    let sum = [0, 0, 0], sq = 0, black = 0;
    const n = w * h;
    for (let i = 0; i < n; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      sum[0] += r; sum[1] += g; sum[2] += b;
      const l = (r + g + b) / 3;
      sq += l * l;
      if (r < 6 && g < 6 && b < 6) black++;
    }
    const mean = sum.map((s) => s / n);
    const meanL = (mean[0] + mean[1] + mean[2]) / 3;
    /* A face-sized window in the middle of the frame, which is where the
     * customer always is. Its own statistics catch the failure the whole-frame
     * ones miss: a lit shop with no customer in it. */
    const window = (fx0, fx1, fy0, fy1) => {
      const x0 = (w * fx0) | 0, x1 = (w * fx1) | 0;
      const y0 = (h * fy0) | 0, y1 = (h * fy1) | 0;
      const sums = [0, 0, 0];
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          sums[0] += px[i]; sums[1] += px[i + 1]; sums[2] += px[i + 2];
          count++;
        }
      }
      return sums.map((s) => s / Math.max(1, count));
    };

    this.lastCapture = {
      width: w, height: h,
      mean, meanL,
      stddev: Math.sqrt(Math.max(0, sq / n - meanL * meanL)),
      blackFraction: black / n,
      centre: window(0.34, 0.66, 0.30, 0.80),
      /* A much tighter window, for questions about one feature rather than the
       * whole customer: with the camera focused on the mouth this is almost
       * entirely lips, so "did the lipstick go on" is answerable in colour. */
      core: window(0.45, 0.55, 0.45, 0.58),
    };
  }
}

export { MODE, MATERIALS, LIGHTS };
