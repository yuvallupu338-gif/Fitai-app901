#!/usr/bin/env node
/*
 * makeup-avatar.mjs — put a real face on the counter.
 *
 * A photograph is not an avatar. It becomes one when somebody says where the
 * pupils are, where the mouth corners are, where the chin is — twenty points,
 * from which `portrait/frame.js` derives everything else. This tool is how
 * those twenty points get collected, and it is a small web page because that is
 * the only interface in which "click the corner of her eye" is a reasonable
 * instruction.
 *
 * It serves the repository, so the marking page imports the *real* frame and
 * mask code rather than a copy of it. The preview it draws is therefore not an
 * approximation of what the game will do — it is what the game will do.
 *
 *   node tools/makeup-avatar.mjs add <photo.jpg>   mark a face and save it
 *   node tools/makeup-avatar.mjs list              what the counter has
 *   node tools/makeup-avatar.mjs remove <id>       take one out again
 *
 * `add` writes makeup/src/data/avatars/<id>.js and adds the two lines to
 * index.js that bring it in. The photograph is scaled down, re-encoded and
 * embedded as a data URL: a single-file build stays a single file, the EXIF
 * (including where it was taken) does not survive the re-encode, and the module
 * cannot go stale against an image somebody later moved.
 */

import { createServer } from 'node:http';
import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, extname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AVATAR_DIR = resolve(ROOT, 'makeup/src/data/avatars');
const INDEX = join(AVATAR_DIR, 'index.js');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/* ------------------------------------------------------------------ *
 * The index
 * ------------------------------------------------------------------ */

/* A safe JS identifier from an id, so two avatars can both export the thing
 * they export without colliding once the bundler has flattened them into one
 * scope. */
const ident = (id) => 'AVATAR_' + id.replace(/[^A-Za-z0-9_$]/g, '_');

async function readIndex() {
  const src = await readFile(INDEX, 'utf8');
  const ids = [...src.matchAll(/^import \{ AVATAR_[\w$]+ \} from '\.\/([^']+)\.js';$/gm)]
    .map((m) => m[1]);
  return { src, ids };
}

/*
 * Rewrite the list. The header comment is preserved verbatim — it is the only
 * documentation of what an avatar module has to contain, and a generator that
 * eats its own instructions is a generator nobody can use twice.
 */
async function writeIndex(ids) {
  const src = await readFile(INDEX, 'utf8');
  /* From the comment's opening, not from the start of the file: the imports sit
   * above it, and slicing from zero carries the old ones through into the new
   * file — which leaves an avatar imported after it has been deleted, and a
   * module that will not load. */
  const header = src.slice(src.indexOf('/*'), src.indexOf('*/') + 2);
  const sorted = [...new Set(ids)].sort();
  const imports = sorted.map((id) => `import { ${ident(id)} } from './${id}.js';`).join('\n');
  const list = sorted.length
    ? `export const PHOTOS = [\n${sorted.map((id) => `  ${ident(id)},`).join('\n')}\n];`
    : 'export const PHOTOS = [];';
  await writeFile(INDEX, `${imports ? imports + '\n\n' : ''}${header}\n\n${list}\n`);
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

async function list() {
  const { ids } = await readIndex();
  if (!ids.length) {
    console.log('no avatars yet — the counter is serving modelled heads.');
    console.log('add one with:  node tools/makeup-avatar.mjs add <photo.jpg>');
    return;
  }
  for (const id of ids) {
    const src = await readFile(join(AVATAR_DIR, `${id}.js`), 'utf8');
    const name = /name: '([^']*)'/.exec(src);
    const size = Math.round(Buffer.byteLength(src) / 1024);
    console.log(`  ${id}${name ? ` — ${name[1]}` : ''}  (${size} KB)`);
  }
}

async function remove(id) {
  const { ids } = await readIndex();
  if (!ids.includes(id)) { console.error(`no avatar called "${id}"`); process.exit(1); }
  await unlink(join(AVATAR_DIR, `${id}.js`));
  await writeIndex(ids.filter((x) => x !== id));
  console.log(`removed ${id}`);
}

async function save(payload) {
  const id = String(payload.id || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id)) throw new Error('id must be lowercase letters, digits and dashes');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(payload.image)) {
    throw new Error('image is not a data URL this tool produced');
  }

  const marks = Object.entries(payload.landmarks)
    .map(([k, v]) => `    ${k}: [${v[0].toFixed(5)}, ${v[1].toFixed(5)}],`)
    .join('\n');

  const body = `/*
 * ${id}${payload.name ? ` — ${payload.name}` : ''}
 *
 * Marked with \`node tools/makeup-avatar.mjs add\`. The numbers are positions in
 * the picture, 0..1 across and down, and they mean what \`portrait/frame.js\`
 * says they mean. Re-mark rather than nudge: the twenty of them are fitted as a
 * pair of monotone curves, and moving one by hand moves the whole face.
 */

export const ${ident(id)} = {
  id: '${id}',
  name: ${JSON.stringify(payload.name || id)},
  width: ${payload.width},
  height: ${payload.height},
${payload.credit ? `  credit: ${JSON.stringify(payload.credit)},\n` : ''}  landmarks: {
${marks}
  },
  image: '${payload.image}',
};
`;

  await writeFile(join(AVATAR_DIR, `${id}.js`), body);
  const { ids } = await readIndex();
  await writeIndex([...ids, id]);
  return { id, bytes: Buffer.byteLength(body) };
}

/* ------------------------------------------------------------------ *
 * add — the marking session
 * ------------------------------------------------------------------ */

async function add(photoPath) {
  const abs = resolve(process.cwd(), photoPath);
  if (!existsSync(abs)) { console.error(`no such file: ${photoPath}`); process.exit(1); }
  const photo = await readFile(abs);
  const photoMime = MIME[extname(abs).toLowerCase()] || 'image/jpeg';
  const suggested = basename(abs, extname(abs)).toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'face';

  const page = markupPage(suggested);
  let done = false;

  const server = createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    try {
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'content-type': MIME['.html'] }).end(page);
        return;
      }
      if (url === '/__photo') {
        res.writeHead(200, { 'content-type': photoMime }).end(photo);
        return;
      }
      if (url === '/__save' && req.method === 'POST') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const out = await save(payload);
        res.writeHead(200, { 'content-type': MIME['.json'] }).end(JSON.stringify(out));
        console.log(`\nsaved makeup/src/data/avatars/${out.id}.js (${Math.round(out.bytes / 1024)} KB)`);
        console.log('rebuild the single file with:  node tools/build-single.js makeup/index.html dist/makeup.html');
        done = true;
        setTimeout(() => process.exit(0), 400);
        return;
      }
      const path = resolve(ROOT, `.${url}`);
      if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch (err) {
      res.writeHead(url === '/__save' ? 400 : 404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(String(err && err.message ? err.message : err));
    }
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  console.log(`marking ${photoPath}`);
  console.log(`open  http://127.0.0.1:${port}/  and click the twenty points.`);
  console.log('ctrl-c to give up without saving.');
  void done;
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

function markupPage(suggestedId) {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>סימון אווטאר</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #16090f; color: #f3e6ec;
         font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  #wrap { display: grid; grid-template-columns: 1fr 330px; gap: 16px; padding: 16px;
          height: 100vh; box-sizing: border-box; }
  #stage { position: relative; background: #0c0509; border-radius: 12px; overflow: hidden;
           display: grid; place-items: center; }
  #photo { max-width: 100%; max-height: 100%; display: block; cursor: crosshair; }
  #side { overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
  h1 { font-size: 17px; margin: 0; }
  .muted { color: #b895a6; font-size: 12px; margin: 0; }
  ol { list-style: none; margin: 0; padding: 0; border: 1px solid #3a2430; border-radius: 10px; }
  li { display: flex; gap: 8px; align-items: baseline; padding: 5px 9px; cursor: pointer;
       border-bottom: 1px solid #2a1720; font-size: 12.5px; }
  li:last-child { border-bottom: 0; }
  li.done { color: #7fd8a8; }
  li.now { background: #40202f; color: #ffd9e6; }
  li b { font-weight: 600; }
  li span { color: #a5808f; font-size: 11px; }
  input, button { font: inherit; }
  input { background: #240f19; border: 1px solid #4a2a38; color: #f3e6ec;
          border-radius: 8px; padding: 6px 9px; width: 100%; box-sizing: border-box; }
  button { background: #d24d7f; border: 0; color: #fff; border-radius: 9px;
           padding: 9px 12px; cursor: pointer; }
  button.ghost { background: #33202a; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .row { display: flex; gap: 8px; }
  #zoom { position: absolute; width: 150px; height: 150px; border-radius: 75px;
          border: 2px solid #ffd9e6; pointer-events: none; display: none;
          box-shadow: 0 6px 24px #000a; }
  #preview { width: 100%; border-radius: 10px; background: #0c0509; display: block; }
  #msg { min-height: 18px; font-size: 12px; color: #ffb6cf; }
</style>
</head>
<body>
<div id="wrap">
  <div id="stage">
    <canvas id="photo"></canvas>
    <canvas id="zoom" width="150" height="150"></canvas>
  </div>
  <div id="side">
    <h1>סימון פנים</h1>
    <p class="muted">לוחצים על כל נקודה לפי הסדר. אפשר ללחוץ על שורה ברשימה כדי לסמן אותה מחדש.
      זכוכית המגדלת מראה בדיוק לאן הלחיצה נופלת.</p>
    <ol id="list"></ol>
    <canvas id="preview" width="300" height="300"></canvas>
    <p class="muted" id="prevnote">התצוגה המקדימה תופיע אחרי כל עשרים הנקודות — זה בדיוק מה שהמשחק יראה.</p>
    <label class="muted">מזהה (אנגלית, קטן)</label>
    <input id="id" value="${suggestedId}">
    <label class="muted">שם בעברית</label>
    <input id="name" value="">
    <div class="row">
      <button id="undo" class="ghost">ביטול נקודה</button>
      <button id="save" disabled>שמירה</button>
    </div>
    <div id="msg"></div>
  </div>
</div>

<script type="module">
import { LANDMARKS, LANDMARK_KEYS, makeFrame, validateAvatar } from '/makeup/src/portrait/frame.js';
import { buildPortraitMasks } from '/makeup/src/portrait/masks.js';

const photoCv = document.getElementById('photo');
const pctx = photoCv.getContext('2d');
const zoomCv = document.getElementById('zoom');
const zctx = zoomCv.getContext('2d');
const listEl = document.getElementById('list');
const prevCv = document.getElementById('preview');
const msg = document.getElementById('msg');
const saveBtn = document.getElementById('save');

const marks = {};
let current = 0;
let img = null;

/*
 * The picture the avatar will actually contain: scaled to something a repository
 * can carry and re-encoded, which also drops the EXIF — including the
 * orientation tag, so what is marked here is what is stored, and the location
 * tag, which has no business being in a game.
 */
const MAX = 1600;
async function normalise(src) {
  const raw = new Image();
  raw.src = src;
  await raw.decode();
  const k = Math.min(1, MAX / Math.max(raw.naturalWidth, raw.naturalHeight));
  const w = Math.round(raw.naturalWidth * k), h = Math.round(raw.naturalHeight * k);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(raw, 0, 0, w, h);
  const url = cv.toDataURL('image/jpeg', 0.86);
  const out = new Image();
  out.src = url;
  await out.decode();
  return { img: out, url, width: w, height: h };
}

let normalised = null;

function drawList() {
  listEl.innerHTML = '';
  LANDMARKS.forEach((l, i) => {
    const li = document.createElement('li');
    li.className = marks[l.key] ? 'done' : '';
    if (i === current) li.className += ' now';
    li.innerHTML = '<b>' + l.he + '</b> <span>' + l.hint + '</span>';
    li.onclick = () => { current = i; drawList(); };
    listEl.appendChild(li);
  });
}

function draw() {
  pctx.drawImage(img, 0, 0, photoCv.width, photoCv.height);
  for (const [key, p] of Object.entries(marks)) {
    const x = p[0] * photoCv.width, y = p[1] * photoCv.height;
    pctx.strokeStyle = key === LANDMARK_KEYS[current] ? '#ffe06a' : '#4ff0c0';
    pctx.lineWidth = 1.5;
    pctx.beginPath(); pctx.arc(x, y, 5, 0, 7); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(x - 9, y); pctx.lineTo(x + 9, y);
    pctx.moveTo(x, y - 9); pctx.lineTo(x, y + 9); pctx.stroke();
  }
}

function place(ev) {
  const r = photoCv.getBoundingClientRect();
  const u = (ev.clientX - r.left) / r.width;
  const v = (ev.clientY - r.top) / r.height;
  marks[LANDMARK_KEYS[current]] = [Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))];
  const next = LANDMARK_KEYS.findIndex((k, i) => i > current && !marks[k]);
  current = next >= 0 ? next : LANDMARK_KEYS.findIndex((k) => !marks[k]);
  if (current < 0) current = LANDMARK_KEYS.length - 1;
  drawList(); draw(); check();
}

/* The magnifier. Clicking a pupil to within a couple of pixels is the whole
 * accuracy of the fit, and at photograph scale a pupil is four pixels wide. */
function magnify(ev) {
  const r = photoCv.getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * img.naturalWidth;
  const y = ((ev.clientY - r.top) / r.height) * img.naturalHeight;
  zoomCv.style.display = 'block';
  zoomCv.style.left = (ev.clientX - r.left + 22) + 'px';
  zoomCv.style.top = (ev.clientY - r.top - 165) + 'px';
  zctx.imageSmoothingEnabled = false;
  zctx.clearRect(0, 0, 150, 150);
  zctx.drawImage(img, x - 12.5, y - 12.5, 25, 25, 0, 0, 150, 150);
  zctx.strokeStyle = '#ffe06a';
  zctx.lineWidth = 1;
  zctx.beginPath();
  zctx.moveTo(75, 60); zctx.lineTo(75, 90);
  zctx.moveTo(60, 75); zctx.lineTo(90, 75);
  zctx.stroke();
}

const ZONE_COLOUR = {
  lip: [255, 70, 110], lid: [120, 150, 255], brow: [200, 160, 90],
  cheek: [255, 130, 150], contour: [150, 110, 90], lash: [40, 40, 60],
  underEye: [120, 220, 200], glow: [255, 240, 190], skin: [255, 255, 255],
};

/*
 * The preview, drawn the way the game draws it: the crop through the frame's
 * own transform, with the zones on top. A pupil clicked on the wrong eye or a
 * chin clicked on a collar shows up here as lipstick on a nose, which is the
 * whole reason the preview exists.
 */
function preview() {
  const avatar = { id: 'preview', width: normalised.width, height: normalised.height, landmarks: marks };
  const problems = validateAvatar(avatar);
  if (problems.length) { msg.textContent = problems[0]; saveBtn.disabled = true; return; }
  let frame;
  try { frame = makeFrame(avatar); } catch (e) { msg.textContent = e.message; saveBtn.disabled = true; return; }

  const size = prevCv.width;
  const ctx = prevCv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const m = frame.cropTransform(size);
  ctx.save();
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  const masks = buildPortraitMasks(frame, size);
  const px = ctx.getImageData(0, 0, size, size);
  for (const [name, colour] of Object.entries(ZONE_COLOUR)) {
    const buf = masks.zones[name];
    if (!buf) continue;
    const strength = name === 'skin' ? 0.10 : 0.42;
    for (let i = 0; i < buf.length; i++) {
      const a = (buf[i] / 255) * strength;
      if (a <= 0.01) continue;
      const p = i * 4;
      px.data[p] = px.data[p] * (1 - a) + colour[0] * a;
      px.data[p + 1] = px.data[p + 1] * (1 - a) + colour[1] * a;
      px.data[p + 2] = px.data[p + 2] * (1 - a) + colour[2] * a;
    }
  }
  ctx.putImageData(px, 0, 0);
  msg.textContent = 'נראה טוב? אפשר לשמור. אפשר גם ללחוץ על שורה ולתקן נקודה.';
  saveBtn.disabled = false;
}

function check() {
  if (LANDMARK_KEYS.every((k) => marks[k])) preview();
  else {
    saveBtn.disabled = true;
    msg.textContent = 'נשארו ' + LANDMARK_KEYS.filter((k) => !marks[k]).length + ' נקודות.';
  }
}

document.getElementById('undo').onclick = () => {
  const placed = LANDMARK_KEYS.filter((k) => marks[k]);
  if (!placed.length) return;
  const last = placed[placed.length - 1];
  delete marks[last];
  current = LANDMARK_KEYS.indexOf(last);
  drawList(); draw(); check();
};

saveBtn.onclick = async () => {
  saveBtn.disabled = true;
  msg.textContent = 'שומר…';
  const res = await fetch('/__save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: document.getElementById('id').value.trim(),
      name: document.getElementById('name').value.trim(),
      width: normalised.width,
      height: normalised.height,
      image: normalised.url,
      landmarks: marks,
    }),
  });
  const text = await res.text();
  if (!res.ok) { msg.textContent = text; saveBtn.disabled = false; return; }
  msg.textContent = 'נשמר. אפשר לסגור את החלון ולהריץ את המשחק.';
};

(async () => {
  normalised = await normalise('/__photo');
  img = normalised.img;
  photoCv.width = img.naturalWidth;
  photoCv.height = img.naturalHeight;
  photoCv.style.maxHeight = 'calc(100vh - 32px)';
  photoCv.addEventListener('click', place);
  photoCv.addEventListener('mousemove', magnify);
  photoCv.addEventListener('mouseleave', () => { zoomCv.style.display = 'none'; });
  drawList(); draw(); check();
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
  console.log('  node tools/makeup-avatar.mjs add <photo.jpg>   mark a face and save it');
  console.log('  node tools/makeup-avatar.mjs list              what the counter has');
  console.log('  node tools/makeup-avatar.mjs remove <id>       take one out again');
  await readdir(AVATAR_DIR).catch(() => []);
  process.exit(arg === undefined && cmd === undefined ? 0 : 1);
}
