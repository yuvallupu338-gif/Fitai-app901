#!/usr/bin/env node
/*
 * makeup-head.mjs — put a modelled head on the counter.
 *
 * The twin of makeup-avatar.mjs, for geometry instead of photographs. It serves
 * the repository and opens a page that imports the game's own reader, fit and
 * unwrap, so what you see while marking is what the game will do — including
 * the preview, which paints the real zone masks onto the real unwrapped model.
 *
 *   node tools/makeup-head.mjs add <model.glb|model.gltf|model.obj>
 *   node tools/makeup-head.mjs list
 *   node tools/makeup-head.mjs remove <id>
 *
 * `add` writes makeup/src/data/heads/<id>.js. What it writes is not the file
 * you imported — it is the *result* of importing it: positions already in head
 * space, texture coordinates already in face space, packed as base64 typed
 * arrays. The parsing, the twenty-point fit and the unwrap all happen here,
 * once, and the game never does them again.
 *
 * Two things it will refuse, both worth refusing loudly:
 *
 *   Draco-compressed glTF, which is what Sketchfab's own glTF export usually
 *   is. Decoding it needs a decompressor bigger than this whole game. Download
 *   the uncompressed glTF, or the OBJ, and use that.
 *
 *   A model with no licence line. Nearly every head worth importing is
 *   Creative Commons Attribution: free to use, and free on the condition that
 *   the credit is shown. The game shows it on screen, so it is not paperwork —
 *   it is the term on which the model may be in the repository at all.
 */

import { createServer } from 'node:http';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, extname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HEAD_DIR = resolve(ROOT, 'makeup/src/data/heads');
const INDEX = join(HEAD_DIR, 'index.js');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const ident = (id) => 'HEAD_' + id.replace(/[^A-Za-z0-9_$]/g, '_');

/* ------------------------------------------------------------------ *
 * The index
 * ------------------------------------------------------------------ */

async function readIndex() {
  const src = await readFile(INDEX, 'utf8');
  const ids = [...src.matchAll(/^import \{ HEAD_[\w$]+ \} from '\.\/([^']+)\.js';$/gm)]
    .map((m) => m[1]);
  return { src, ids };
}

async function writeIndex(ids) {
  const src = await readFile(INDEX, 'utf8');
  /* From the comment's opening, not from the start of the file: the imports sit
   * above it, and slicing from zero carries the old ones into the new file. */
  const header = src.slice(src.indexOf('/*'), src.indexOf('*/') + 2);
  const sorted = [...new Set(ids)].sort();
  const imports = sorted.map((id) => `import { ${ident(id)} } from './${id}.js';`).join('\n');
  const list = sorted.length
    ? `export const HEADS = [\n${sorted.map((id) => `  ${ident(id)},`).join('\n')}\n];`
    : 'export const HEADS = [];';
  await writeFile(INDEX, `${imports ? imports + '\n\n' : ''}${header}\n\n${list}\n`);
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

async function list() {
  const { ids } = await readIndex();
  if (!ids.length) {
    console.log('no modelled heads yet — the counter is generating its own.');
    console.log('add one with:  node tools/makeup-head.mjs add <model.glb>');
    return;
  }
  for (const id of ids) {
    const src = await readFile(join(HEAD_DIR, `${id}.js`), 'utf8').catch(() => '');
    const name = /name: '([^']*)'|name: "([^"]*)"/.exec(src);
    const tris = /triangleCount: (\d+)/.exec(src);
    const credit = /credit: "([^"]*)"/.exec(src);
    console.log(`  ${id}${name ? ` — ${name[1] || name[2]}` : ''}`
      + `${tris ? `  ${(+tris[1]).toLocaleString()} triangles` : ''}`
      + `  (${Math.round(Buffer.byteLength(src) / 1024)} KB)`);
    if (credit && credit[1]) console.log(`      ${credit[1]}`);
  }
}

async function remove(id) {
  const { ids } = await readIndex();
  if (!ids.includes(id)) { console.error(`no head called "${id}"`); process.exit(1); }
  await unlink(join(HEAD_DIR, `${id}.js`)).catch(() => {});
  await writeIndex(ids.filter((x) => x !== id));
  console.log(`removed ${id}`);
}

async function save(record) {
  const id = String(record.id || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id)) throw new Error('id must be lowercase letters, digits and dashes');
  if (!record.credit || record.credit.trim().length < 4) {
    throw new Error('a credit line is required — the model\'s author and licence');
  }
  for (const k of ['pos', 'uv', 'idx']) {
    if (!/^[A-Za-z0-9+/=]*$/.test(record[k] || '')) throw new Error(`${k} is not base64`);
  }

  const body = `/*
 * ${id}${record.name ? ` — ${record.name}` : ''}
 *
 * ${record.credit}
 *
 * Imported with \`node tools/makeup-head.mjs add\`. This is the result of the
 * import, not the file that was imported: positions are in head space and
 * texture coordinates are in face space, both packed as sixteen-bit arrays. The
 * fit put the marks on the reference head to within ${record.fit.residual.toFixed(4)} of a head
 * half-height; ${record.fit.flipped} of ${record.triangleCount} triangles folded, all of them behind or
 * beside the face where nothing is painted.
 *
 * Re-import rather than edit. Every number below is derived from the twenty
 * marks by a fit, and there is no number in here that can be usefully nudged.
 */

export const ${ident(id)} = ${JSON.stringify({
    id,
    name: record.name || id,
    credit: record.credit,
    provides: record.provides || [],
    landmarks: record.landmarks,
    vertexCount: record.vertexCount,
    triangleCount: record.triangleCount,
    eyeRadius: record.eyeRadius,
    eyeL: record.eyeL,
    eyeR: record.eyeR,
    focus: record.focus,
    fit: record.fit,
    pos: record.pos,
    uv: record.uv,
    idx: record.idx,
  }, null, 2)};
`;

  await writeFile(join(HEAD_DIR, `${id}.js`), body);
  const { ids } = await readIndex();
  await writeIndex([...ids, id]);
  return { id, bytes: Buffer.byteLength(body) };
}

/* ------------------------------------------------------------------ *
 * add — the marking session
 * ------------------------------------------------------------------ */

async function add(modelPath) {
  const abs = resolve(process.cwd(), modelPath);
  if (!existsSync(abs)) { console.error(`no such file: ${modelPath}`); process.exit(1); }
  const model = await readFile(abs);
  const ext = extname(abs).toLowerCase();
  const suggested = basename(abs, ext).toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'head';
  const page = markupPage(suggested, ext);

  const server = createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    try {
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'content-type': MIME['.html'] }).end(page);
        return;
      }
      if (url === '/__model') {
        res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(model);
        return;
      }
      if (url === '/__save' && req.method === 'POST') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const out = await save(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        res.writeHead(200, { 'content-type': MIME['.json'] }).end(JSON.stringify(out));
        console.log(`\nsaved makeup/src/data/heads/${out.id}.js (${Math.round(out.bytes / 1024)} KB)`);
        console.log('rebuild the single file with:  node tools/build-single.js makeup/index.html dist/makeup.html');
        setTimeout(() => process.exit(0), 400);
        return;
      }
      const path = resolve(ROOT, `.${url}`);
      if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const bytes = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(bytes);
    } catch (err) {
      res.writeHead(url === '/__save' ? 400 : 404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(String(err && err.message ? err.message : err));
    }
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  console.log(`marking ${modelPath}`);
  console.log(`open  http://127.0.0.1:${server.address().port}/  turn the head round and click twenty points.`);
  console.log('ctrl-c to give up without saving.');
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

function markupPage(suggestedId, ext) {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>סימון ראש תלת־ממדי</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #16090f; color: #f3e6ec; overflow: hidden;
         font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  #wrap { display: grid; grid-template-columns: 1fr 340px; gap: 14px; padding: 14px;
          height: 100vh; box-sizing: border-box; }
  #stage { position: relative; background: #0c0509; border-radius: 12px; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
  #side { overflow-y: auto; display: flex; flex-direction: column; gap: 9px; }
  h1 { font-size: 17px; margin: 0; }
  .muted { color: #b895a6; font-size: 12px; margin: 0; }
  ol { list-style: none; margin: 0; padding: 0; border: 1px solid #3a2430; border-radius: 10px; }
  li { padding: 5px 9px; cursor: pointer; border-bottom: 1px solid #2a1720; font-size: 12.5px; }
  li:last-child { border-bottom: 0; }
  li.done { color: #7fd8a8; }
  li.now { background: #40202f; color: #ffd9e6; }
  li span { color: #a5808f; font-size: 11px; }
  input, button, select { font: inherit; }
  input[type=text] { background: #240f19; border: 1px solid #4a2a38; color: #f3e6ec;
          border-radius: 8px; padding: 6px 9px; width: 100%; box-sizing: border-box; }
  button { background: #d24d7f; border: 0; color: #fff; border-radius: 9px;
           padding: 8px 11px; cursor: pointer; }
  button.ghost { background: #33202a; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .row { display: flex; gap: 7px; flex-wrap: wrap; align-items: center; }
  label.chk { display: flex; gap: 5px; align-items: center; font-size: 12px; }
  #msg { min-height: 34px; font-size: 12px; color: #ffb6cf; }
  #stats { font-size: 11px; color: #9c8090; white-space: pre-line; }
  #overlay { position: absolute; inset: auto 10px 10px 10px; font-size: 11px; color: #a5808f;
             pointer-events: none; direction: ltr; }
</style>
</head>
<body>
<div id="wrap">
  <div id="stage"><canvas id="gl"></canvas><div id="overlay">drag = orbit · wheel = zoom · shift+drag = pan · click = place mark</div></div>
  <div id="side">
    <h1>סימון ראש</h1>
    <p class="muted">מסובבים עד שרואים את הפנים, ולוחצים על כל נקודה לפי הסדר.
      הלחיצה יורה קרן על המש, אז היא נוחתת על המשטח עצמו.</p>
    <div class="row">
      <button class="ghost" id="v-front">חזית</button>
      <button class="ghost" id="v-left">שמאל</button>
      <button class="ghost" id="v-right">ימין</button>
      <button class="ghost" id="undo">ביטול נקודה</button>
    </div>
    <ol id="list"></ol>
    <div id="stats"></div>
    <label class="muted">מזהה (אנגלית, קטן)</label>
    <input type="text" id="id" value="${suggestedId}">
    <label class="muted">שם בעברית</label>
    <input type="text" id="name" value="">
    <label class="muted">קרדיט ורישיון — חובה</label>
    <input type="text" id="credit" placeholder="Head by Someone (CC-BY 4.0), sketchfab.com/...">
    <p class="muted">מה כבר קיים במודל (המשחק לא יבנה את זה מעליו):</p>
    <div class="row">
      <label class="chk"><input type="checkbox" id="p-ears" checked> אוזניים</label>
      <label class="chk"><input type="checkbox" id="p-hair"> שיער</label>
      <label class="chk"><input type="checkbox" id="p-neck"> צוואר</label>
    </div>
    <div class="row"><button id="save" disabled>שמירה</button></div>
    <div id="msg">טוען את המודל…</div>
  </div>
</div>

<script type="module">
import { parseOBJ } from '/makeup/src/model/import/obj.js';
import { parseMesh } from '/makeup/src/model/import/gltf.js';
import { unwrapHead } from '/makeup/src/model/import/unwrap.js';
import { packHead } from '/makeup/src/model/import/heads.js';
import { LANDMARKS, LANDMARK_KEYS } from '/makeup/src/model/landmarks.js';
import { buildMasks, ZONE_NAMES } from '/makeup/src/model/face.js';
import {
  mat4, perspective, lookAt, multiply, invert, rayFromScreen, rayMesh,
} from '/makeup/src/core/math.js';

const cv = document.getElementById('gl');
const gl = cv.getContext('webgl2', { antialias: true });
if (!gl) throw new Error('WebGL2 is required');
const listEl = document.getElementById('list');
const msg = document.getElementById('msg');
const statsEl = document.getElementById('stats');
const saveBtn = document.getElementById('save');

let source = null, marks = {}, current = 0, unwrapped = null;
const cam = { yaw: 0, pitch: 0, dist: 3, target: [0, 0, 0], radius: 1 };

/* ---------------------------------------------------------------- *
 * A very small renderer. Two programs: the model, and the model with
 * the zone masks painted onto its new coordinates.
 * ---------------------------------------------------------------- */
const VS = \`#version 300 es
in vec3 aPos; in vec3 aNrm; in vec2 aUV;
uniform mat4 uMVP; out vec3 vN; out vec2 vUV; out vec3 vP;
void main(){ vN=aNrm; vUV=aUV; vP=aPos; gl_Position=uMVP*vec4(aPos,1.0); }\`;
const FS = \`#version 300 es
precision highp float;
in vec3 vN; in vec2 vUV; in vec3 vP; out vec4 o;
uniform sampler2D uMask; uniform float uShowMask;
void main(){
  vec3 n = normalize(vN);
  float d = 0.25 + 0.75 * max(dot(n, normalize(vec3(-0.3,0.5,0.9))), 0.0);
  vec3 base = vec3(0.72,0.60,0.55) * d;
  if (uShowMask > 0.5) {
    vec4 m = texture(uMask, clamp(vUV, 0.0, 1.0));
    base = mix(base, m.rgb, m.a * 0.75);
  }
  o = vec4(base, 1.0);
}\`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
gl.useProgram(prog);
const uMVP = gl.getUniformLocation(prog, 'uMVP');
const uShowMask = gl.getUniformLocation(prog, 'uShowMask');
gl.uniform1i(gl.getUniformLocation(prog, 'uMask'), 0);

let vao = null, drawCount = 0;
function upload(positions, normals, uvs, indices) {
  vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bind = (name, data, size) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, name);
    if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); }
  };
  bind('aPos', positions, 3);
  bind('aNrm', normals, 3);
  bind('aUV', uvs, 2);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  drawCount = indices.length;
}

/* The zones, as a picture, so the preview shows where each product will land. */
const ZONE_COLOUR = {
  lip: [255, 60, 100], lid: [110, 150, 255], brow: [210, 165, 80],
  cheek: [255, 130, 150], contour: [150, 110, 90], lash: [50, 50, 70],
  underEye: [120, 220, 200], glow: [255, 245, 200], skin: [255, 255, 255],
};
function maskTexture() {
  const N = 512;
  const masks = buildMasks(N);
  const px = new Uint8Array(N * N * 4);
  for (const name of ZONE_NAMES) {
    const c = ZONE_COLOUR[name]; if (!c) continue;
    const buf = masks.zones[name];
    const strength = name === 'skin' ? 0.18 : 1;
    for (let i = 0; i < buf.length; i++) {
      const a = (buf[i] / 255) * strength;
      if (a <= 0.02) continue;
      const o = i * 4;
      const prev = px[o + 3] / 255;
      px[o] = px[o] * (1 - a) + c[0] * a;
      px[o + 1] = px[o + 1] * (1 - a) + c[1] * a;
      px[o + 2] = px[o + 2] * (1 - a) + c[2] * a;
      px[o + 3] = Math.min(255, (prev + a) * 255);
    }
  }
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

const view = mat4(), proj = mat4(), vp = mat4(), ivp = mat4();
function draw() {
  const w = cv.clientWidth, h = cv.clientHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== (w * dpr | 0)) { cv.width = w * dpr | 0; cv.height = h * dpr | 0; }
  gl.viewport(0, 0, cv.width, cv.height);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.05, 0.02, 0.04, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (!vao) return;

  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const ex = cam.target[0] + sy * cp * cam.dist;
  const ey = cam.target[1] + sp * cam.dist;
  const ez = cam.target[2] + cy * cp * cam.dist;
  lookAt(view, ex, ey, ez, cam.target[0], cam.target[1], cam.target[2]);
  perspective(proj, 0.7, cv.width / cv.height, cam.radius * 0.01, cam.radius * 40);
  multiply(vp, proj, view);
  invert(ivp, vp);

  gl.useProgram(prog);
  gl.uniformMatrix4fv(uMVP, false, vp);
  gl.uniform1f(uShowMask, unwrapped ? 1 : 0);
  gl.bindVertexArray(vao);
  gl.drawElements(gl.TRIANGLES, drawCount, gl.UNSIGNED_INT, 0);
  gl.bindVertexArray(null);
}
function loop() { draw(); requestAnimationFrame(loop); }

/* ---------------------------------------------------------------- *
 * Marking
 * ---------------------------------------------------------------- */
function drawList() {
  listEl.innerHTML = '';
  LANDMARKS.forEach((l, i) => {
    const li = document.createElement('li');
    li.className = (marks[l.key] ? 'done' : '') + (i === current ? ' now' : '');
    li.innerHTML = '<b>' + l.he + '</b> <span>' + l.hint + '</span>';
    li.onclick = () => { current = i; drawList(); };
    listEl.appendChild(li);
  });
}

const ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
const hit = { u: 0, v: 0, t: 0, x: 0, y: 0, z: 0 };
function place(ev) {
  if (!source) return;
  const r = cv.getBoundingClientRect();
  rayFromScreen(ray, ivp,
    ((ev.clientX - r.left) / r.width) * 2 - 1,
    1 - ((ev.clientY - r.top) / r.height) * 2);
  if (!rayMesh(ray, source, hit)) { msg.textContent = 'הלחיצה לא פגעה במודל.'; return; }
  marks[LANDMARK_KEYS[current]] = [hit.x, hit.y, hit.z];
  const next = LANDMARK_KEYS.findIndex((k, i) => i > current && !marks[k]);
  current = next >= 0 ? next : Math.max(0, LANDMARK_KEYS.findIndex((k) => !marks[k]));
  drawList();
  check();
}

function check() {
  const missing = LANDMARK_KEYS.filter((k) => !marks[k]);
  if (missing.length) {
    saveBtn.disabled = true;
    unwrapped = null;
    msg.textContent = 'נשארו ' + missing.length + ' נקודות.';
    statsEl.textContent = '';
    return;
  }
  try {
    unwrapped = unwrapHead(source, marks);
  } catch (err) {
    unwrapped = null; saveBtn.disabled = true;
    msg.textContent = err.message;
    return;
  }
  /* Re-upload with the new coordinates so the preview paints the real zones
   * where the game will paint them. */
  const V = unwrapped.mesh.vertices, count = V.length / 9;
  const p = new Float32Array(count * 3), n = new Float32Array(count * 3), t = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    p[i * 3] = V[i * 9]; p[i * 3 + 1] = V[i * 9 + 1]; p[i * 3 + 2] = V[i * 9 + 2];
    n[i * 3] = V[i * 9 + 3]; n[i * 3 + 1] = V[i * 9 + 4]; n[i * 3 + 2] = V[i * 9 + 5];
    t[i * 2] = V[i * 9 + 6]; t[i * 2 + 1] = V[i * 9 + 7];
  }
  upload(p, n, t, unwrapped.mesh.indices);
  frameOn(p);
  const s = unwrapped.stats;
  statsEl.textContent =
    \`התאמה: \${s.residual.toFixed(4)} (טוב מתחת ל-0.05)
קיפולים: \${s.flipped} מתוך \${s.triangles}
תפר: \${s.seamSplit} קודקודים שוכפלו\`;
  const problems = [];
  if (s.residual > 0.09) problems.push('ההתאמה רחוקה — כנראה נקודה על הפיצ׳ר הלא נכון');
  if (s.flipped / s.triangles > 0.05) problems.push('חלק גדול מהמש מתקפל');
  if (s.orderProblems.length) problems.push(s.orderProblems[0]);
  msg.textContent = problems.length
    ? problems.join(' · ')
    : 'נראה טוב. האזורים הצבועים הם בדיוק לאן שהאיפור ייפול.';
  saveBtn.disabled = false;
}

function frameOn(positions) {
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], positions[i + k]);
      hi[k] = Math.max(hi[k], positions[i + k]);
    }
  }
  cam.target = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  cam.radius = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 || 1;
  cam.dist = cam.radius * 3.2;
}

/* ---------------------------------------------------------------- *
 * Camera control
 * ---------------------------------------------------------------- */
let dragging = null;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  dragging = { x: e.clientX, y: e.clientY, moved: 0, shift: e.shiftKey, button: e.button };
});
cv.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
  dragging.moved += Math.abs(dx) + Math.abs(dy);
  if (dragging.shift || dragging.button === 2) {
    const k = cam.dist * 0.0016;
    cam.target[0] -= dx * k * Math.cos(cam.yaw);
    cam.target[2] += dx * k * Math.sin(cam.yaw);
    cam.target[1] += dy * k;
  } else {
    cam.yaw -= dx * 0.008;
    cam.pitch = Math.max(-1.4, Math.min(1.4, cam.pitch + dy * 0.006));
  }
  dragging.x = e.clientX; dragging.y = e.clientY;
});
cv.addEventListener('pointerup', (e) => {
  /* A click is a drag that went nowhere. Marking and orbiting share the same
   * button because asking somebody to hold a modifier while aiming at a pupil
   * is how marks end up two millimetres off. */
  if (dragging && dragging.moved < 5 && !dragging.shift && dragging.button === 0) place(e);
  dragging = null;
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = Math.max(cam.radius * 0.15, Math.min(cam.radius * 12, cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
}, { passive: false });

document.getElementById('v-front').onclick = () => { cam.yaw = 0; cam.pitch = 0; };
document.getElementById('v-left').onclick = () => { cam.yaw = -1.2; cam.pitch = 0; };
document.getElementById('v-right').onclick = () => { cam.yaw = 1.2; cam.pitch = 0; };
document.getElementById('undo').onclick = () => {
  const placed = LANDMARK_KEYS.filter((k) => marks[k]);
  if (!placed.length) return;
  const last = placed[placed.length - 1];
  delete marks[last];
  current = LANDMARK_KEYS.indexOf(last);
  drawList(); check();
};

/*
 * The seam the tool's own test drives, and the only way to place a mark without
 * a mouse. Aiming twenty clicks at a pupil from a script means reproducing the
 * projection out here and trusting it, which tests the test; handing the tool a
 * point tests the tool.
 */
window.__tool = {
  place(key, p) { marks[key] = p; drawList(); check(); },
  get stats() { return unwrapped && unwrapped.stats; },
  get triangles() { return source && source.stats.triangles; },
  message: () => msg.textContent,
};

saveBtn.onclick = async () => {
  saveBtn.disabled = true;
  msg.textContent = 'אורז…';
  const provides = ['ears', 'hair', 'neck'].filter((p) => document.getElementById('p-' + p).checked);
  let record;
  try {
    record = packHead(unwrapped, {
      id: document.getElementById('id').value.trim(),
      name: document.getElementById('name').value.trim(),
      credit: document.getElementById('credit').value.trim(),
      provides,
      landmarks: marks,
    });
  } catch (err) { msg.textContent = err.message; saveBtn.disabled = false; return; }
  const res = await fetch('/__save', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(record),
  });
  const text = await res.text();
  if (!res.ok) { msg.textContent = text; saveBtn.disabled = false; return; }
  msg.textContent = 'נשמר. אפשר לסגור ולהריץ את המשחק.';
};

/* ---------------------------------------------------------------- *
 * Boot
 * ---------------------------------------------------------------- */
(async () => {
  const bytes = await (await fetch('/__model')).arrayBuffer();
  try {
    source = '${ext}' === '.obj'
      ? parseOBJ(new TextDecoder().decode(new Uint8Array(bytes)))
      : parseMesh(bytes);
  } catch (err) { msg.textContent = err.message; return; }

  /* rayMesh reads UVs off the triangle it hit; nothing here wants them, but it
   * would fault without an array to read. */
  if (!source.uvs) source.uvs = new Float32Array(source.positions.length / 3 * 2);
  let normals = source.normals;
  if (!normals) {
    normals = new Float32Array(source.positions.length);
    const p = source.positions, idx = source.indices;
    for (let f = 0; f < idx.length; f += 3) {
      const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
      const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
      const e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      for (const o of [a, b, c]) { normals[o] += n[0]; normals[o + 1] += n[1]; normals[o + 2] += n[2]; }
    }
    for (let i = 0; i < normals.length; i += 3) {
      const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
      normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
    }
  }
  upload(source.positions, normals, source.uvs, source.indices);
  frameOn(source.positions);
  maskTexture();
  drawList();
  msg.textContent = source.stats.triangles.toLocaleString() + ' משולשים. מסובבים לחזית ומתחילים לסמן.';
  if (source.stats.triangles > 400000) {
    msg.textContent += ' — זה מודל כבד מאוד, המשחק יעבוד לאט.';
  }
  loop();
})();
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ *
 * Entry
 * ------------------------------------------------------------------ */

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'add' && arg) await add(arg);
else if (cmd === 'list') await list();
else if (cmd === 'remove' && arg) await remove(arg);
else {
  console.log('usage:');
  console.log('  node tools/makeup-head.mjs add <model.glb|.gltf|.obj>   mark a head and save it');
  console.log('  node tools/makeup-head.mjs list                        what the counter has');
  console.log('  node tools/makeup-head.mjs remove <id>                 take one out again');
  process.exit(cmd === undefined ? 0 : 1);
}
