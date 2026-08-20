/*
 * renderer.js — one forward pass, then a lens.
 *
 * The pipeline is short on purpose:
 *
 *   sky        a gradient with a moon in it, drawn first and always visible,
 *              because this game is outdoors;
 *   scene      every sector of the street and everything moving in it, lit by
 *              one directional light and up to sixteen lamps, into a
 *              half-float target;
 *   bloom      threshold, downsample, four blur passes;
 *   composite  bloom back in, ACES, vignette, aberration, grain, dither.
 *
 * There is no deferred pass and no shadow map. Ambient occlusion is baked into
 * the vertices at build time, the shadows are a march through a height field
 * of the whole neighbourhood, and the entire budget goes into the lighting and
 * the lens — which is where the look comes from.
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
import { MAT, MAT_COUNT, materialDefs, EMISSIVE } from '../world/materials.js';
import { MeshBuilder, addBox, addCylinder, addLimb, addSphere, addQuad, addCross }
  from '../world/meshbuilder.js';
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
      shadows: 2,          /* 0 none, 1 moon, 2 moon + one lamp, 3 + two    */
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
    this.matA = new Float32Array(MAT_COUNT * 4);
    this.matB = new Float32Array(MAT_COUNT * 4);

    this.targets = {};
    this.width = 0;
    this.height = 0;
    this.albedoTex = null;
    this.normalTex = null;
    this.occTex = null;
    this.sectors = [];
    this.dyn = {};
    this.defs = null;
    this.stats = { sectors: 0, tris: 0, lights: 0 };
    this.frames = 0;
    this._capture = false;
    this.lastCapture = null;
    this._pick = [];

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.disable(gl.BLEND);
  }

  /* ---------------------------------------------------------------- *
   * Materials
   * ---------------------------------------------------------------- */

  /*
   * Bake all seventeen materials and upload them as two array textures.
   * Yields between materials so the loading screen can actually paint —
   * seventeen 256-square recipes is a few hundred milliseconds of pure
   * arithmetic and doing it in one go looks like the tab has hung.
   */
  async setMaterials(seed, onProgress) {
    const gl = this.gl;
    const size = this.quality.textureSize;
    const defs = materialDefs(seed);
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
    this.defs = defs;
    this.setScene('night');
    this.buildDynamicMeshes();
  }

  /* Which slots glow, and how much. The same baked textures serve both halves
   * of the day; only this table changes. */
  setScene(scene) {
    const defs = this.defs || materialDefs(0);
    const em = EMISSIVE[scene] || EMISSIVE.night;
    for (let i = 0; i < MAT_COUNT; i++) {
      const d = defs[i] || defs[0];
      this.matA[i * 4]     = 1 / (d.tile || 2);
      this.matA[i * 4 + 1] = d.roughMul ?? 1;
      this.matA[i * 4 + 2] = em[i] !== undefined ? em[i] : (d.emissive ?? 0);
      this.matA[i * 4 + 3] = d.specular ?? 0.3;
      this.matB[i * 4]     = d.water ?? 0;
      this.matB[i * 4 + 1] = d.normalStrength ?? 1;
      this.matB[i * 4 + 2] = d.cutout ? (d.alphaCut ?? 0.45) : 0;
      this.matB[i * 4 + 3] = 0;
    }
  }

  /* ---------------------------------------------------------------- *
   * Geometry
   * ---------------------------------------------------------------- */

  setWorld(world) {
    const gl = this.gl;
    for (const s of this.sectors) destroyMesh(gl, s.mesh);
    this.sectors = world.sectors.map((s) => ({
      mesh: createMeshVAO(gl, this.scene, s.data.vertices, s.data.indices),
      bounds: s.bounds,
    }));

    const hf = world.heightField;
    if (!this.occTex) {
      this.occTex = createTexture2D(gl, hf.size, hf.size, null, { clamp: true });
    }
    gl.bindTexture(gl.TEXTURE_2D, this.occTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, hf.size, hf.size, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, hf.pixels);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.occRect = hf.rect;
    this.occMaxH = hf.maxH;
  }

  /*
   * Everything that moves, built once per session. The bodies are articulated
   * rather than one rigid lump: each piece has its origin at the joint it
   * swings from, so the walk cycle can rotate it directly.
   *
   * The proportions are the point. Four stacked boxes read as furniture no
   * matter how they are lit — the eye identifies a body from its silhouette,
   * from taper and from how the limbs swing, long before it can resolve any
   * surface. Hers are slightly wrong on purpose: too tall, too thin, arms an
   * inch too long. Almost right is much worse than obviously wrong, which is
   * the entire effect being aimed for.
   */
  buildDynamicMeshes() {
    const gl = this.gl;
    for (const k of Object.keys(this.dyn)) destroyMesh(gl, this.dyn[k]);
    this.dyn = {};
    const make = (fn, est = 512) => {
      const mb = new MeshBuilder(est);
      fn(mb);
      const d = mb.finish();
      return createMeshVAO(gl, this.scene, d.vertices, d.indices);
    };
    const shade = (v) => () => v;

    /*
     * Her. Two metres ten, which is nine inches taller than a tall man and is
     * the single most effective thing in her design: at that height the
     * silhouette is wrong before anything else about her registers, and the
     * eye is looking up at a face it cannot see.
     *
     * The dress is one long taper from the shoulders to the ground, so she has
     * no walk cycle to sell — she does not walk. Under it, two bare feet
     * pointing down at nothing, which is the detail that says so.
     */
    this.dyn.wTorso = make((mb) => {
      addLimb(mb, 0, 1.98, 0, [0.18, 0.11], [0.36, 0.29], 1.98, MAT.CLOTH,
        { ao: shade(0.7), sub: 2, capBottom: false });
      addLimb(mb, 0, 2.06, 0, [0.05, 0.05], [0.06, 0.06], 0.11, MAT.SKIN,
        { ao: shade(0.55) });
      for (const ex of [-0.07, 0.07]) {
        addLimb(mb, ex, 0.16, 0, [0.045, 0.06], [0.035, 0.09], 0.16, MAT.SKIN,
          { ao: shade(0.4) });
      }
    }, 512);
    this.dyn.wHead = make((mb) => {
      addSphere(mb, 0, 0, 0, 0.112, 12, 9, MAT.SKIN,
        { ao: shade(0.7), scaleY: 1.24, scaleZ: 1.02 });
      /*
       * The jaw, hung well below where a jaw ends. It is a separate mesh so it
       * can stay open after the whistle has stopped — two seconds of open
       * mouth and no sound at all, which is the worst two seconds in the game.
       */
      for (const ex of [-0.042, 0.042]) {
        addSphere(mb, ex, 0.018, -0.092, 0.021, 7, 5, MAT.EYE, { ao: () => 1 });
      }
    }, 512);
    this.dyn.wJaw = make((mb) => {
      addLimb(mb, 0, 0, -0.03, [0.055, 0.05], [0.045, 0.04], 0.17, MAT.SKIN,
        { ao: shade(0.35) });
      addQuad(mb, [-0.05, -0.02, -0.05], [0.05, -0.02, -0.05],
        [0.05, -0.02, 0.02], [-0.05, -0.02, 0.02],
        [0, 0], [0.1, 0], [0.1, 0.07], [0, 0.07], MAT.SKIN, { sub: 1, ao: () => 0.2 });
    }, 128);
    /*
     * The hair, as three crossed cut-out panes hanging past the jaw. It hides
     * most of the face, and hiding most of the face is the whole design of
     * this character: the moment you can read a whole face she stops being a
     * thing in the street and becomes a model. It is its own mesh because it
     * lifts when she hunts.
     */
    this.dyn.wHair = make((mb) => {
      for (let i = 0; i < 3; i++) {
        addCross(mb, 0, -0.44, 0.01, 0.31 - i * 0.04, 0.66 + i * 0.05,
          i * 0.7, MAT.SKIN, { ao: shade(0.3) });
      }
    }, 512);
    this.dyn.wArm = make((mb) => {
      addLimb(mb, 0, 0, 0, [0.05, 0.05], [0.028, 0.028], 0.82, MAT.CLOTH,
        { ao: shade(0.6) });
      addLimb(mb, 0, -0.82, 0, [0.03, 0.03], [0.038, 0.03], 0.13, MAT.SKIN,
        { ao: shade(0.5) });
    }, 256);

    /*
     * A neighbour: shorter and wider than her, and built out of one rule that
     * the previous version broke — EVERY part is authored hanging downward
     * from its own joint at local zero, and the draw call says where that
     * joint is in the world.
     *
     * The torso used to be authored at its finished height (a limb from y=1.42
     * down to y=0.72) and then ALSO translated to 0.72, so it floated at
     * 1.44-2.14: a slab hanging in the air above the head it belonged to, with
     * the arms swinging from nothing and the legs ending at the knee of a body
     * that was not there. It was drawn that way in every daylight garden in
     * the game. Hence the rule, stated once and kept: joints only.
     *
     * The proportions below make a 1.73 m person: feet on the ground, hips at
     * 0.88, shoulders at 1.44, the crown at about 1.73. Joints overlap by a
     * centimetre or two on purpose — a gap at a hip is far more visible than
     * the overlap that closes it, and neither costs a triangle.
     */
    const NEIGHBOUR_CLOTH = [MAT.CLOTH_B, MAT.CLOTH_C, MAT.CLOTH_D];
    NEIGHBOUR_CLOTH.forEach((cloth, i) => {
      this.dyn['nTorso' + i] = make((mb) => {
        /* Shoulders down to hips, and wider across the top: the taper is what
         * stops a torso reading as a crate. */
        addLimb(mb, 0, 0, 0, [0.195, 0.115], [0.150, 0.098], 0.58, cloth,
          { ao: shade(0.65), sub: 2 });
        /* The neck runs UP out of the shoulder joint, which is why it is its
         * own short limb instead of part of the taper. Without it a head is a
         * ball balanced on a box. */
        addLimb(mb, 0, 0.14, 0, [0.043, 0.043], [0.055, 0.055], 0.14, MAT.SKIN,
          { ao: shade(0.45) });
        /* The pelvis, closing the hole the legs swing out of. Two poles
         * pushed straight into the bottom of a coat is the single thing that
         * most makes a low-polygon figure read as furniture. */
        addLimb(mb, 0, -0.50, 0, [0.150, 0.098], [0.128, 0.092], 0.16, cloth,
          { ao: shade(0.45) });
      }, 384);
      this.dyn['nLeg' + i] = make((mb) => {
        addLimb(mb, 0, 0, 0, [0.072, 0.072], [0.050, 0.050], 0.80, cloth,
          { ao: shade(0.5) });
        /* A shoe, in roof shingle because it is the darkest thing in the
         * atlas at this scale. A limb that stops dead in mid-air is a cut
         * pole, and the eye reads the join with the ground before it reads
         * anything else about a standing figure. */
        addBox(mb, 0, -0.826, -0.022, 0.135, 0.088, 0.215, 0, MAT.ROOF,
          { ao: shade(0.32) });
      }, 256);
      this.dyn['nArm' + i] = make((mb) => {
        addLimb(mb, 0, 0, 0, [0.052, 0.052], [0.036, 0.036], 0.36, cloth,
          { ao: shade(0.55) });
        /* Sleeve, then bare forearm, then a hand. The break at the elbow is
         * worth its four triangles: it is the only thing telling the eye this
         * is an arm and not a rod. */
        addLimb(mb, 0, -0.36, 0, [0.036, 0.036], [0.030, 0.030], 0.26, MAT.SKIN,
          { ao: shade(0.5) });
        addSphere(mb, 0, -0.645, 0, 0.040, 6, 5, MAT.SKIN,
          { ao: shade(0.42), scaleY: 1.35, scaleZ: 0.8 });
      }, 384);
    });
    this.dyn.nHead = make((mb) => {
      addSphere(mb, 0, 0, 0, 0.115, 10, 8, MAT.SKIN, { ao: shade(0.72), scaleY: 1.15 });
      /*
       * Hair as a cap on the crown rather than as strands. At the distance a
       * neighbour is ever actually looked at, what separates one head from
       * another is the shape of the top of it and how dark it is against the
       * sky; nothing finer than that survives the trip. It sits high enough to
       * leave the face — such as it is — alone.
       */
      addSphere(mb, 0, 0.050, 0.008, 0.107, 10, 6, MAT.SKIN,
        { ao: shade(0.26), scaleY: 0.78, scaleZ: 1.04 });
    }, 384);

    /* The flag: a pole and a rectangle of cloth. It is drawn dynamically
     * because it moves twice in a night — once when it appears and once when
     * it ends up in your hand. */
    this.dyn.flag = make((mb) => {
      addCylinder(mb, 0, 0, 0, 0.022, 0.62, 6, MAT.WOOD, { ao: () => 0.9 });
      addQuad(mb, [0.01, 0.30, 0], [0.01, 0.30, 0.34], [0.01, 0.60, 0.34], [0.01, 0.60, 0],
        [0, 0], [0.34, 0], [0.34, 0.30], [0, 0.30], MAT.GLOW, { sub: 2 });
      addQuad(mb, [-0.01, 0.30, 0.34], [-0.01, 0.30, 0], [-0.01, 0.60, 0], [-0.01, 0.60, 0.34],
        [0, 0], [0.34, 0], [0.34, 0.30], [0, 0.30], MAT.GLOW, { sub: 2 });
    }, 128);

    /* A door leaf, hinged at its own origin so a yaw on the model matrix
     * swings it. */
    this.dyn.door = make((mb) => {
      addBox(mb, 0.525, 1.05, 0, 1.05, 2.1, 0.06, 0, MAT.WOOD, { ao: () => 0.8 });
      addSphere(mb, 0.93, 1.05, 0.06, 0.035, 6, 5, MAT.METAL, { ao: () => 1 });
    }, 128);

    /* A unit quad, used for the windows that come on during the night. */
    this.dyn.glow = make((mb) => {
      addQuad(mb, [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0],
        [0, 0], [1, 0], [1, 1], [0, 1], MAT.GLASS_LIT, { sub: 1 });
      addQuad(mb, [0.5, -0.5, 0], [-0.5, -0.5, 0], [-0.5, 0.5, 0], [0.5, 0.5, 0],
        [0, 0], [1, 0], [1, 1], [0, 1], MAT.GLASS_LIT, { sub: 1 });
    }, 64);

    /* The dog, for the one garden that has one. */
    this.dyn.dog = make((mb) => {
      addLimb(mb, 0, 0.55, 0, [0.13, 0.26], [0.11, 0.24], 0.28, MAT.SKIN, { ao: shade(0.6) });
      addSphere(mb, 0, 0.62, -0.30, 0.11, 8, 6, MAT.SKIN, { ao: shade(0.65), scaleZ: 1.3 });
      for (const [ox, oz] of [[-0.1, -0.18], [0.1, -0.18], [-0.1, 0.18], [0.1, 0.18]]) {
        addLimb(mb, ox, 0.30, oz, [0.035, 0.035], [0.03, 0.03], 0.30, MAT.SKIN,
          { ao: shade(0.45) });
      }
    }, 512);
  }

  uploadMesh(data) { return createMeshVAO(this.gl, this.scene, data.vertices, data.indices); }
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

  render(cam, state) {
    const gl = this.gl;
    this.resize();
    const t = this.targets;

    const aspect = this.width / this.height;
    perspective(this.proj, (cam.fov || 74) * DEG, aspect, 0.06, 400);
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
    this.drawScene(cam, state);
    if (this.quality.bloom) this.drawBloom(state);
    this.drawComposite(state);
    this.frames++;

    /*
     * Framebuffer readback, for the tests. It has to happen here, inside the
     * same frame as the draw: without `preserveDrawingBuffer` the default
     * framebuffer's contents are undefined once the browser has composited, so
     * reading the canvas from outside the render loop can return a blank image
     * for a frame that drew perfectly well.
     */
    if (this._capture) {
      this._capture = false;
      this.lastCapture = this.readback();
    }
  }

  requestCapture() {
    this.lastCapture = null;
    this._capture = true;
  }

  readback() {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);

    const stepX = Math.max(1, Math.floor(w / 200));
    const stepY = Math.max(1, Math.floor(h / 140));
    const seen = new Set();
    let r = 0, g = 0, b = 0, dark = 0, n = 0, lo = 999, hi = -1;
    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const i = (y * w + x) * 4;
        const R = px[i], G = px[i + 1], B = px[i + 2];
        r += R; g += G; b += B; n++;
        const l = 0.21 * R + 0.72 * G + 0.07 * B;
        if (l < 3) dark++;
        if (l < lo) lo = l;
        if (l > hi) hi = l;
        seen.add(((R >> 3) << 10) | ((G >> 3) << 5) | (B >> 3));
      }
    }
    return {
      mean: [r / n, g / n, b / n],
      dark: dark / n,
      contrast: hi - lo,
      colours: seen.size,
      width: w, height: h, samples: n,
    };
  }

  drawSky(cam, aspect, state) {
    const gl = this.gl;
    const p = this.sky;
    const sk = state.sky;
    p.use();
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    const tanHalf = Math.tan((cam.fov || 74) * DEG / 2);
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    gl.uniform3f(p.u.uRight, cy, 0, -sy);
    gl.uniform3f(p.u.uUp, sy * sp, cp, cy * sp);
    gl.uniform3f(p.u.uFwd, this.fwd[0], this.fwd[1], this.fwd[2]);
    gl.uniform2f(p.u.uScale, tanHalf * aspect, tanHalf);
    setColor(gl, p.u.uHorizon, sk.horizon);
    setColor(gl, p.u.uZenith, sk.zenith);
    setColor(gl, p.u.uGround, sk.ground);
    gl.uniform1f(p.u.uTime, state.time);
    gl.uniform1f(p.u.uStars, sk.stars || 0);
    const md = state.sun.dir;
    gl.uniform3f(p.u.uMoonDir, md[0], md[1], md[2]);
    setColor(gl, p.u.uMoonColor, sk.moonColor || '#ffffff');
    gl.uniform1f(p.u.uMoonSize, sk.moonSize || 0);

    gl.bindVertexArray(this.fsVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
  }

  drawScene(cam, state) {
    const gl = this.gl;
    const p = this.scene;
    p.use();

    /* Lights: the sixteen nearest, gathered fresh because which sixteen matter
     * changes as you walk. The flicker is evaluated here as well as in the
     * shader so a failing lamp and its own glowing glass stay in step. */
    const list = state.lights;
    const n = Math.min(MAX_LIGHTS, list.length);
    for (let i = 0; i < n; i++) {
      const l = list[i];
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
    this.stats.lights = n;

    const q = this.quality.shadows;
    gl.uniform1f(p.u.uSunShadow, q >= 1 ? 1 : 0);
    gl.uniform1i(p.u.uShadowLights, Math.max(0, Math.min(n, q - 1)));

    gl.uniform3f(p.u.uCamPos, cam.x, cam.y, cam.z);
    gl.uniform1f(p.u.uTime, state.time);
    const sd = state.sun.dir;
    gl.uniform3f(p.u.uSunDir, sd[0], sd[1], sd[2]);
    setColor(gl, p.u.uSunColor, state.sun.color);
    gl.uniform1f(p.u.uSunIntensity, state.sun.intensity);
    setColor(gl, p.u.uSkyColor, state.ambient.sky);
    setColor(gl, p.u.uGroundColor, state.ambient.ground);
    setColor(gl, p.u.uFogColor, state.fog.color);
    gl.uniform1f(p.u.uFogDensity, state.fog.density);
    gl.uniform1f(p.u.uFogHeight, state.fog.height);
    gl.uniform1f(p.u.uFogFloor, state.fog.floor);
    gl.uniform4fv(p.u.uMatA, this.matA);
    gl.uniform4fv(p.u.uMatB, this.matB);
    gl.uniformMatrix4fv(p.u.uViewProj, false, this.viewProj);

    const tl = state.torch || { on: false };
    if (tl.on) {
      gl.uniform4f(p.u.uTorch, tl.intensity ?? 2.2,
        Math.cos((tl.inner ?? 17) * DEG), Math.cos((tl.outer ?? 42) * DEG), tl.range ?? 18);
      gl.uniform3f(p.u.uTorchDir, this.fwd[0], this.fwd[1], this.fwd[2]);
    } else {
      gl.uniform4f(p.u.uTorch, 0, 1, 0.9, 1);
      gl.uniform3f(p.u.uTorchDir, 0, 0, -1);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.albedoTex);
    gl.uniform1i(p.u.uAlbedo, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.normalTex);
    gl.uniform1i(p.u.uNormalTex, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.occTex);
    gl.uniform1i(p.u.uOcc, 2);
    const r = this.occRect;
    gl.uniform4f(p.u.uOccRect, r[0], r[1], r[2], r[3]);
    gl.uniform1f(p.u.uOccMaxH, this.occMaxH);

    identityInto(this.model);
    gl.uniformMatrix4fv(p.u.uModel, false, this.model);

    let sectors = 0, tris = 0;
    for (const s of this.sectors) {
      const b = s.bounds;
      if (!aabbInFrustum(this.planes, b[0], b[1], b[2], b[3], b[4], b[5])) continue;
      gl.bindVertexArray(s.mesh.vao);
      gl.drawElements(gl.TRIANGLES, s.mesh.count, gl.UNSIGNED_INT, 0);
      sectors++;
      tris += s.mesh.count / 3;
    }
    this.stats.sectors = sectors;

    for (const d of state.dynamics || []) {
      const mesh = this.dyn[d.mesh];
      if (!mesh) continue;
      modelInto(this.model, d.x, d.y, d.z, d.rot || 0, d.pitch || 0,
        d.sx ?? d.scale ?? 1, d.sy ?? d.scale ?? 1, d.sz ?? d.scale ?? 1);
      gl.uniformMatrix4fv(p.u.uModel, false, this.model);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
      tris += mesh.count / 3;
    }
    this.stats.tris = tris;
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
    /* Without float targets everything over 1.0 has already been clamped away,
     * so a threshold of 1.0 finds nothing and the lamps clip to flat white with
     * no glow at all. Dropping below 1 recovers most of the look on hardware
     * that cannot do HDR. */
    gl.uniform1f(this.bright.u.uThreshold,
      t.scene.float ? (state.bloomThreshold ?? 0.95) : 0.62);
    gl.uniform1f(this.bright.u.uSoft, 0.65);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

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
    gl.uniform1f(p.u.uBloomAmount, this.quality.bloom ? (state.bloom ?? 0.6) : 0);
    gl.uniform1f(p.u.uVignette, state.vignette ?? 0.4);
    gl.uniform1f(p.u.uGrain, state.grain ?? 0.05);
    gl.uniform1f(p.u.uAberration, state.aberration ?? 0.0016);
    gl.uniform1f(p.u.uFear, state.fear ?? 0);
    gl.uniform1f(p.u.uGlitch, state.glitch ?? 0);
    gl.uniform1f(p.u.uFlashAmt, state.flash ?? 0);
    const tint = state.tint || [1, 1, 1];
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

/* Must match flicker() in the shader, or a failing lamp and its own glowing
 * glass drift apart and the illusion dies immediately. */
export function flickerCPU(t, phase) {
  if (phase < 0) return 1;
  const p = phase * 37;
  const slow = 0.93 + 0.07 * Math.sin(t * 1.3 + p * 6.283);
  const warm = 0.55 + 0.45 * Math.sin(t * 0.7 + p * 3.1);
  const s = Math.sin(Math.floor(t * 7 + p * 50) * 12.9898) * 43758.5453;
  const drop = (s - Math.floor(s)) > 0.972 ? 1 : 0;
  return slow * (1 + 0.25 * (warm - 1)) * (1 - 0.8 * drop);
}

function setColor(gl, loc, c) {
  const v = typeof c === 'string' ? parseColor(c) : (c || [1, 1, 1]);
  gl.uniform3f(loc, v[0], v[1], v[2]);
}

function identityInto(m) {
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/*
 * Translate x yaw x pitch x non-uniform scale.
 *
 * Pitch is what swings a limb about the joint its mesh was built around, and
 * is zero for everything else. The separate axis scales are for the window
 * glow quad, which is the one thing in the game that is a unit mesh stretched
 * to a size the world decides.
 */
function modelInto(m, x, y, z, yaw, pitch, sx, sy, sz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  m[0] = c * sx;        m[1] = 0;        m[2] = -s * sx;       m[3] = 0;
  m[4] = s * sp * sy;   m[5] = cp * sy;  m[6] = c * sp * sy;   m[7] = 0;
  m[8] = s * cp * sz;   m[9] = -sp * sz; m[10] = c * cp * sz;  m[11] = 0;
  m[12] = x; m[13] = y; m[14] = z;       m[15] = 1;
  return m;
}
