/*
 * renderer.js — the frame.
 *
 * Order of operations, and why:
 *
 *   1. Planar reflections, one pass per window wall, interior only. The
 *      reflection is not decoration here — the game has an anomaly that
 *      desynchronises the player's reflection from the player, and that beat
 *      only lands if the reflection is otherwise exact.
 *   2. The scene into an offscreen target. Opaque first, then glass sorted
 *      back to front.
 *   3. Bloom: threshold, two separable blurs, at quarter resolution.
 *   4. Composite: grade, vignette, aberration, grain, dither, fade.
 *
 * Everything the story wants to do to the image — the blackouts, the moment
 * the world desaturates, the slow lens breathing when something is behind you
 * — arrives as a field on `fx` and is applied in step 4.
 */

import {
  mat4, identity, copyMat, multiply, perspective,
  mirrorX, normalMatrix, clamp,
} from '../core/math.js';
import { Program, RenderTarget, ScreenQuad, createGL } from './gl.js';
import {
  SCENE_VS, SCENE_FS, GLASS_VS, GLASS_FS, POST_VS, BRIGHT_FS, BLUR_FS, COMPOSITE_FS, MAX_LIGHTS,
} from './shaders.js';
import { TextureSet } from './textures.js';

export const DEFAULT_MATERIAL = {
  map: null,
  color: [1, 1, 1],
  alpha: 1,
  emissive: [0, 0, 0],
  emissiveScale: 0,
  specular: 0.06,
  shininess: 24,
  unlit: false,
  transparent: false,
  glass: null,          // 'left' | 'right' | 'plain'
  uvScale: [1, 1],
  uvOffset: [0, 0],
  cull: true,
  alphaCutoff: 0.01,
  reflectOnly: false,
};

/*
 * Base exposure.
 *
 * The lighting rig is built around surfaces reading correctly under it, and
 * the result is a carriage lit like an operating theatre: the median pixel
 * came out of the scene pass at about 0.67, which is daylight. Grading that
 * down with contrast alone crushed everything below the pivot to black while
 * the walls stayed white, which is exactly the picture a player cannot read.
 * One multiply here — before the bright pass, so the bloom thresholds against
 * the exposed image and stops treating the whole carriage as a light source —
 * puts the night back without touching a single lamp.
 */
export const BASE_EXPOSURE = 0.48;

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    const gl = createGL(canvas);
    if (!gl) throw new Error('WEBGL2_UNAVAILABLE');
    this.gl = gl;

    this.textures = new TextureSet(gl, 0xa17e);
    this.sceneProgram = new Program(gl, SCENE_VS, SCENE_FS, 'scene');
    this.glassProgram = new Program(gl, GLASS_VS, GLASS_FS, 'glass');
    this.brightProgram = new Program(gl, POST_VS, BRIGHT_FS, 'bright');
    this.blurProgram = new Program(gl, POST_VS, BLUR_FS, 'blur');
    this.compositeProgram = new Program(gl, POST_VS, COMPOSITE_FS, 'composite');
    this.quad = new ScreenQuad(gl);

    this.width = 1;
    this.height = 1;
    this.sceneTarget = new RenderTarget(gl, 2, 2, { depth: true, samples: samplesFor(settings) });
    this.bloomA = new RenderTarget(gl, 2, 2);
    this.bloomB = new RenderTarget(gl, 2, 2);
    this.reflectionTargets = {
      left: new RenderTarget(gl, 2, 2, { depth: true }),
      right: new RenderTarget(gl, 2, 2, { depth: true }),
    };
    this.reflectionMatrices = { left: mat4(), right: mat4() };

    this.proj = mat4();
    this.view = mat4();
    this.mirrored = mat4();
    this.mirrorMat = mat4();
    this.model = mat4();
    this.normalMat = new Float32Array(9);
    this.projView = mat4();

    this.lightPos = new Float32Array(MAX_LIGHTS * 4);
    this.lightColor = new Float32Array(MAX_LIGHTS * 4);

    this.stats = { drawCalls: 0, triangles: 0, passes: 0 };
    this._transparent = [];
    this._lightScratch = [];
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = clamp(this.settings.resolutionScale ?? 1, 0.4, 2);
    const cssW = this.canvas.clientWidth || window.innerWidth || 1280;
    const cssH = this.canvas.clientHeight || window.innerHeight || 720;
    const w = Math.max(2, Math.round(cssW * dpr * scale));
    const h = Math.max(2, Math.round(cssH * dpr * scale));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.sceneTarget.resize(w, h);
    this.bloomA.resize(Math.max(2, w >> 2), Math.max(2, h >> 2));
    this.bloomB.resize(Math.max(2, w >> 2), Math.max(2, h >> 2));
    const rw = Math.max(2, Math.round(w * 0.5));
    const rh = Math.max(2, Math.round(h * 0.5));
    this.reflectionTargets.left.resize(rw, rh);
    this.reflectionTargets.right.resize(rw, rh);
  }

  applySettings(settings) {
    this.settings = settings;
    this.sceneTarget.setSamples(samplesFor(settings));
    this.width = -1;   // force the next resize() to reallocate
    this.resize();
  }

  resolveTexture(map) {
    if (!map) return this.textures.white;
    if (typeof map === 'string') return this.textures.get(map);
    return map;
  }

  /* Picks the MAX_LIGHTS lights that matter most from where the camera is —
     nearest first, weighted so a bright light a little further away still
     wins over a dim one underfoot. */
  _packLights(scene, eye) {
    const list = this._lightScratch;
    list.length = 0;
    for (const l of scene.lights) {
      if (l.enabled === false || l.intensity <= 0) continue;
      const dx = l.position[0] - eye[0];
      const dy = l.position[1] - eye[1];
      const dz = l.position[2] - eye[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > l.radius + 14) continue;
      list.push({ l, score: d / Math.max(0.2, l.intensity) });
    }
    list.sort((a, b) => a.score - b.score);
    const count = Math.min(MAX_LIGHTS, list.length);
    for (let i = 0; i < count; i++) {
      const l = list[i].l;
      this.lightPos[i * 4] = l.position[0];
      this.lightPos[i * 4 + 1] = l.position[1];
      this.lightPos[i * 4 + 2] = l.position[2];
      this.lightPos[i * 4 + 3] = l.radius;
      const gain = l.intensity * (l.flicker ?? 1);
      this.lightColor[i * 4] = l.color[0] * gain;
      this.lightColor[i * 4 + 1] = l.color[1] * gain;
      this.lightColor[i * 4 + 2] = l.color[2] * gain;
      this.lightColor[i * 4 + 3] = 1;
    }
    return count;
  }

  _bindSceneUniforms(prog, scene, eye, lightCount) {
    prog.v3('uAmbient', scene.ambient[0], scene.ambient[1], scene.ambient[2]);
    prog.v3('uCameraPos', eye[0], eye[1], eye[2]);
    prog.v3('uFogColor', scene.fogColor[0], scene.fogColor[1], scene.fogColor[2]);
    prog.f('uFogDensity', scene.fogDensity);
    prog.f('uLightScale', scene.lightScale ?? 1);
    prog.i('uLightCount', lightCount);
    prog.v4v('uLightPos', this.lightPos);
    prog.v4v('uLightColor', this.lightColor);
    prog.f('uTime', scene.time || 0);
  }

  _drawNodes(scene, nodes, prog, { pass }) {
    const gl = this.gl;
    this._transparent.length = 0;

    for (const node of nodes) {
      if (node.visible === false || !node.mesh) continue;
      if (pass === 'reflection') {
        if (!node.reflect) continue;
      } else if (node.reflectOnly) {
        continue;
      }

      prog.mat4('uModel', node.matrix);
      normalMatrix(this.normalMat, node.matrix);
      prog.mat3('uNormalMat', this.normalMat);
      const wob = node.wobble;
      prog.v4('uWobble', wob ? wob[0] : 0, wob ? wob[1] : 0, wob ? wob[2] : 0, wob ? wob[3] : 0);

      for (const group of node.mesh.groups) {
        const mat = this._materialFor(node, group);
        if (!mat || mat.hidden) continue;
        if (mat.glass) continue;          // glass has its own pass
        if (mat.transparent) {
          this._transparent.push({ node, group, mat });
          continue;
        }
        this._drawGroup(node, group, mat, prog);
      }
    }

    if (this._transparent.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const item of this._transparent) {
        prog.mat4('uModel', item.node.matrix);
        normalMatrix(this.normalMat, item.node.matrix);
        prog.mat3('uNormalMat', this.normalMat);
        /* uWobble is per-node too. Leaving it on whatever the last opaque node
           installed makes transparent geometry inherit the grab handles' sway. */
        const wob = item.node.wobble;
        prog.v4('uWobble', wob ? wob[0] : 0, wob ? wob[1] : 0, wob ? wob[2] : 0, wob ? wob[3] : 0);
        this._drawGroup(item.node, item.group, item.mat, prog);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }

  _materialFor(node, group) {
    const override = node.overrides && node.overrides[group.key];
    if (!override) return group.material;
    return { ...group.material, ...override };
  }

  _drawGroup(node, group, mat, prog) {
    const gl = this.gl;
    if (mat.cull === false) gl.disable(gl.CULL_FACE);
    prog.tex('uMap', this.resolveTexture(mat.map));
    const c = mat.color || [1, 1, 1];
    prog.v4('uBaseColor', c[0], c[1], c[2], mat.alpha ?? 1);
    const e = mat.emissive || [0, 0, 0];
    prog.v3('uEmissive', e[0], e[1], e[2]);
    prog.f('uEmissiveScale', mat.emissiveScale ?? 0);
    prog.f('uSpecular', mat.specular ?? 0);
    prog.f('uShininess', mat.shininess ?? 24);
    prog.f('uUnlit', mat.unlit ? 1 : 0);
    prog.f('uAlphaCutoff', mat.alphaCutoff ?? 0.01);
    const us = mat.uvScale || [1, 1];
    const uo = mat.uvOffset || [0, 0];
    prog.v4('uUVTransform', us[0], us[1], uo[0], uo[1]);
    node.mesh.bind();
    node.mesh.drawGroup(group);
    this.stats.drawCalls++;
    this.stats.triangles += group.count / 3;
    if (mat.cull === false) gl.enable(gl.CULL_FACE);
  }

  _renderReflection(scene, camera, side, planeX) {
    const gl = this.gl;
    const target = this.reflectionTargets[side];
    target.bind();
    gl.clearColor(scene.fogColor[0], scene.fogColor[1], scene.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    /* Mirroring flips handedness, so the faces that were front are now back. */
    gl.cullFace(gl.FRONT);

    mirrorX(this.mirrorMat, planeX);
    multiply(this.mirrored, camera.view, this.mirrorMat);
    multiply(this.reflectionMatrices[side], this.proj, this.mirrored);

    const prog = this.sceneProgram.use();
    prog.mat4('uProj', this.proj);
    prog.mat4('uView', this.mirrored);
    /* The eye used for lighting is the mirrored eye, otherwise specular
       highlights slide the wrong way across the reflected seats. */
    const eye = [2 * planeX - camera.position[0], camera.position[1], camera.position[2]];
    const lightCount = this._packLights(scene, eye);
    this._bindSceneUniforms(prog, scene, eye, lightCount);
    this._drawNodes(scene, scene.nodes, prog, { pass: 'reflection' });

    gl.cullFace(gl.BACK);
    this.stats.passes++;
  }

  render(scene, camera, fx = {}) {
    const gl = this.gl;
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
    this.stats.passes = 0;

    const aspect = this.width / this.height;
    perspective(this.proj, (camera.fov * Math.PI) / 180, aspect, camera.near ?? 0.04, camera.far ?? 160);

    const wantReflections = this.settings.reflections && scene.reflectionPlanes?.length;
    if (wantReflections) {
      for (const plane of scene.reflectionPlanes) {
        this._renderReflection(scene, camera, plane.side, plane.x);
      }
    }

    this.sceneTarget.bind();
    gl.clearColor(scene.clearColor?.[0] ?? scene.fogColor[0],
      scene.clearColor?.[1] ?? scene.fogColor[1],
      scene.clearColor?.[2] ?? scene.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);

    const prog = this.sceneProgram.use();
    prog.mat4('uProj', this.proj);
    prog.mat4('uView', camera.view);
    const lightCount = this._packLights(scene, camera.position);
    this._bindSceneUniforms(prog, scene, camera.position, lightCount);
    this._drawNodes(scene, scene.nodes, prog, { pass: 'main' });
    this._drawGlass(scene, camera, wantReflections);

    /* Collapse the samples before anything reads the scene texture. */
    this.sceneTarget.resolve();
    this._postProcess(scene, fx);
  }

  _drawGlass(scene, camera, wantReflections) {
    const gl = this.gl;
    const panes = [];
    for (const node of scene.nodes) {
      if (node.visible === false || !node.mesh || node.reflectOnly) continue;
      for (const group of node.mesh.groups) {
        const mat = this._materialFor(node, group);
        if (!mat || !mat.glass || mat.hidden) continue;
        panes.push({ node, group, mat });
      }
    }
    if (!panes.length) return;

    /* Back to front. Two panes of a train window are rarely both in view, but
       the connecting doors put four sheets of glass in a line. */
    panes.sort((a, b) => distanceToNode(camera.position, b.node) - distanceToNode(camera.position, a.node));

    const prog = this.glassProgram.use();
    prog.mat4('uProj', this.proj);
    prog.mat4('uView', camera.view);
    prog.v3('uCameraPos', camera.position[0], camera.position[1], camera.position[2]);
    prog.f('uTime', scene.time || 0);
    prog.f('uRainSpeed', scene.rainSpeed ?? 0.01);
    prog.f('uWarp', scene.glassWarp ?? 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    for (const pane of panes) {
      const side = pane.mat.glass;
      const useRefl = wantReflections && (side === 'left' || side === 'right');
      prog.use();
      prog.mat4('uProj', this.proj);
      prog.mat4('uView', camera.view);
      prog.v3('uCameraPos', camera.position[0], camera.position[1], camera.position[2]);
      prog.f('uTime', scene.time || 0);
      prog.f('uRainSpeed', scene.rainSpeed ?? 0.01);
      prog.f('uWarp', scene.glassWarp ?? 0);
      prog.mat4('uModel', pane.node.matrix);
      normalMatrix(this.normalMat, pane.node.matrix);
      prog.mat3('uNormalMat', this.normalMat);
      prog.mat4('uReflProjView', useRefl ? this.reflectionMatrices[side] : IDENTITY);
      prog.tex('uReflection', useRefl ? this.reflectionTargets[side].texture : this.textures.black);
      prog.tex('uSmudge', this.textures.get('smudge'));
      const tint = pane.mat.glassTint || [0.04, 0.05, 0.07];
      prog.v3('uGlassTint', tint[0], tint[1], tint[2]);
      prog.f('uReflStrength', useRefl ? (pane.mat.reflStrength ?? 1) * (scene.reflectionStrength ?? 1) : 0.12);
      prog.f('uSmudgeAmount', pane.mat.smudge ?? 1);
      const us = pane.mat.uvScale || [1, 1];
      const uo = pane.mat.uvOffset || [0, 0];
      prog.v4('uUVTransform', us[0], us[1], uo[0], uo[1]);
      pane.node.mesh.bind();
      pane.node.mesh.drawGroup(pane.group);
      this.stats.drawCalls++;
    }

    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  _postProcess(scene, fx) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    const exposure = BASE_EXPOSURE * (fx.exposure ?? 1);
    const bloomAmount = this.settings.bloom ? (fx.bloom ?? 0.55) : 0;
    if (bloomAmount > 0) {
      this.bloomA.bind();
      const bright = this.brightProgram.use();
      bright.tex('uSource', this.sceneTarget.texture);
      bright.f('uExposure', exposure);
      bright.f('uThreshold', fx.bloomThreshold ?? 0.74);
      bright.f('uKnee', 0.35);
      this.quad.draw();

      const blur = this.blurProgram.use();
      for (let i = 0; i < 2; i++) {
        this.bloomB.bind();
        blur.use();
        blur.tex('uSource', this.bloomA.texture);
        blur.v2('uDirection', (1.4 + i) / this.bloomA.width, 0);
        this.quad.draw();

        this.bloomA.bind();
        blur.use();
        blur.tex('uSource', this.bloomB.texture);
        blur.v2('uDirection', 0, (1.4 + i) / this.bloomA.height);
        this.quad.draw();
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    const comp = this.compositeProgram.use();
    comp.tex('uScene', this.sceneTarget.texture);
    comp.tex('uBloom', bloomAmount > 0 ? this.bloomA.texture : this.textures.black);
    comp.f('uBloomAmount', bloomAmount);
    comp.f('uTime', scene.time || 0);
    comp.f('uGrain', (this.settings.grain ?? 1) * (fx.grain ?? 1));
    comp.f('uSharpen', this.settings.sharpen ?? 0.5);
    comp.f('uContrast', this.settings.contrast ?? 1);
    comp.f('uExposure', exposure);
    comp.v2('uTexel', 1 / this.width, 1 / this.height);
    comp.f('uVignette', (this.settings.vignette ?? 1) * (fx.vignette ?? 0.62));
    comp.f('uChromatic', (this.settings.chromatic ?? 1) * (fx.chromatic ?? 1));
    comp.f('uBrightness', (this.settings.brightness ?? 1) * (fx.brightness ?? 1));
    comp.f('uFade', fx.fade ?? 0);
    const fc = fx.fadeColor || [0, 0, 0];
    comp.v3('uFadeColor', fc[0], fc[1], fc[2]);
    comp.f('uDistort', fx.distort ?? 0);
    comp.f('uScanline', fx.scanline ?? 0);
    comp.f('uDesaturate', fx.desaturate ?? 0);
    comp.f('uPulse', fx.pulse ?? 0);
    comp.v2('uResolution', this.width, this.height);
    this.quad.draw();
  }

  dispose() {
    this.sceneProgram.dispose();
    this.glassProgram.dispose();
    this.brightProgram.dispose();
    this.blurProgram.dispose();
    this.compositeProgram.dispose();
    this.quad.dispose();
    this.sceneTarget.dispose();
    this.bloomA.dispose();
    this.bloomB.dispose();
    this.reflectionTargets.left.dispose();
    this.reflectionTargets.right.dispose();
    this.textures.dispose();
  }
}

/* 0 disables the multisampled path entirely. */
function samplesFor(settings) {
  if (settings.antialias === false) return 0;
  const quality = settings.quality || 'high';
  if (quality === 'low') return 0;
  if (quality === 'medium') return 2;
  return 4;
}

const IDENTITY = identity(mat4());

function distanceToNode(eye, node) {
  const m = node.matrix;
  const dx = m[12] - eye[0];
  const dy = m[13] - eye[1];
  const dz = m[14] - eye[2];
  return dx * dx + dy * dy + dz * dz;
}

/*
 * The camera. Yaw/pitch/roll rather than a quaternion because every consumer
 * — mouse look, the sit-down easing, the clamp that stops you from looking
 * behind a headrest — wants to talk in those terms, and roll only ever comes
 * from the carriage swaying.
 */
export class Camera {
  constructor(fov = 72) {
    this.position = [0, 1.7, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.fov = fov;
    this.near = 0.04;
    this.far = 170;
    this.view = mat4();
    this.forward = [0, 0, -1];
    this.right = [1, 0, 0];
    this.up = [0, 1, 0];
    this._world = mat4();
  }

  update() {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.forward[0] = -sy * cp;
    this.forward[1] = sp;
    this.forward[2] = -cy * cp;
    this.right[0] = cy;
    this.right[1] = 0;
    this.right[2] = -sy;

    /*
     * view = Rz(-roll) · Rx(-pitch) · Ry(-yaw) · T(-eye)
     *
     * Each helper left-multiplies, so the calls run in the order the world
     * point passes through them: shift to the eye first, then turn. Composing
     * these the other way round rotates the world about its own origin and
     * then slides the result, which still produces a perfectly plausible
     * picture — of a carriage several times further away than the one the
     * player is standing in.
     */
    const m = identity(this._world);
    translateInPlace(m, -this.position[0], -this.position[1], -this.position[2]);
    rotateYInPlace(m, -this.yaw);
    rotateXInPlace(m, -this.pitch);
    rotateZInPlace(m, -this.roll);
    copyMat(this.view, m);

    this.up[0] = m[1]; this.up[1] = m[5]; this.up[2] = m[9];
    return this;
  }
}

/* These three multiply on the *left*, which is what "apply this rotation to
   the view built so far" means. The generic helpers in math.js post-multiply,
   so they cannot be used here. */
function rotateYInPlace(out, rad) {
  const s = Math.sin(rad), c = Math.cos(rad);
  const r = TMP_A;
  identity(r);
  r[0] = c; r[2] = -s; r[8] = s; r[10] = c;
  multiply(out, r, out);
}
function rotateXInPlace(out, rad) {
  const s = Math.sin(rad), c = Math.cos(rad);
  const r = TMP_A;
  identity(r);
  r[5] = c; r[6] = s; r[9] = -s; r[10] = c;
  multiply(out, r, out);
}
function rotateZInPlace(out, rad) {
  const s = Math.sin(rad), c = Math.cos(rad);
  const r = TMP_A;
  identity(r);
  r[0] = c; r[1] = s; r[4] = -s; r[5] = c;
  multiply(out, r, out);
}
function translateInPlace(out, x, y, z) {
  const r = TMP_A;
  identity(r);
  r[12] = x; r[13] = y; r[14] = z;
  multiply(out, r, out);
}
const TMP_A = mat4();
