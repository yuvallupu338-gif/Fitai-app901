#!/usr/bin/env node
/*
 * makeup-audit.mjs — everything about the makeup counter that can be checked
 * without a GPU.
 *
 * The renderer needs a browser and gets one in makeup-smoke.mjs. Everything
 * underneath it — the face's coordinate system, the head it generates, the
 * catalogue, the brush, the scoring and the shift — is plain arithmetic, and
 * that is what this drives.
 *
 * Two rules were followed while writing these:
 *
 *   1. A check must not ask the same table its subject asks. Asserting that
 *      every look's requested category exists in CATEGORIES by iterating
 *      CATEGORIES proves only that a loop terminates. The checks here name the
 *      unsafe cases themselves — that a lipstick must never be scored as a
 *      blusher, that the mouth is below the eyes — so deleting the data they
 *      guard makes them fail.
 *
 *   2. Every one of them was watched failing on a deliberate mutation before it
 *      was trusted. Several of them caught real bugs on the way in: the lid
 *      zone overlapping the brow, and a wipe that cleared colour and left the
 *      gloss behind.
 *
 * Usage: node tools/makeup-audit.mjs
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(resolve(ROOT, 'makeup/src', p)).href);

const failures = [];
const notes = [];
let checks = 0;

function check(cond, msg) {
  checks++;
  if (cond) notes.push('ok: ' + msg);
  else failures.push(msg);
}

function near(a, b, tol, msg) {
  check(Math.abs(a - b) <= tol, `${msg} (${a} vs ${b}, tol ${tol})`);
}

/*
 * A stand-in for WebGL that records nothing and answers everything. The paint
 * layer's only use of the context is uploading buffers it already owns, so with
 * this in place the audit exercises the real brush, the real blending and the
 * real per-zone statistics — the code that decides whether the game is fair.
 */
function stubGl() {
  const noop = () => {};
  const target = {
    createTexture: () => ({ id: 1 }),
    bindTexture: noop, pixelStorei: noop, texStorage2D: noop, texSubImage2D: noop,
    texImage2D: noop, generateMipmap: noop, texParameteri: noop, texParameterf: noop,
    deleteTexture: noop,
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : 0x1908) });
}

async function main() {
  const color = await load('core/color.js');
  const math = await load('core/math.js');
  const rng = await load('core/rng.js');
  const face = await load('model/face.js');
  const landmarkMod = await load('model/landmarks.js');
  const head = await load('model/head.js');
  const products = await load('data/products.js');
  const looks = await load('data/looks.js');
  const customerMod = await load('game/customer.js');
  const paintMod = await load('game/paint.js');
  const scoring = await load('game/scoring.js');
  const shiftMod = await load('game/shift.js');
  const props = await load('model/props.js');
  const textures = await load('render/textures.js');
  const mesh = await load('model/mesh.js');
  const body = await load('model/body.js');

  /* ================================================== colour science == */

  {
    const white = [1, 1, 1], black = [0, 0, 0];
    check(color.rgbToLab(white)[0] > 99, 'white is L*100');
    check(color.rgbToLab(black)[0] < 1, 'black is L*0');
    near(color.deltaE([0.5, 0.2, 0.2], [0.5, 0.2, 0.2]), 0, 1e-9,
      'a colour is zero distance from itself');

    /* The property the shade mechanic rests on: a shade that is two steps away
     * in a ramp must measure further than one that is one step away. If this
     * inverts, "too light" and "too dark" swap and the game lies to the player. */
    const ramp = [];
    for (let i = 0; i <= 6; i++) ramp.push(color.mixLab([0.96, 0.87, 0.80], [0.30, 0.19, 0.13], i / 6));
    let monotone = true;
    for (let i = 1; i < ramp.length; i++) {
      if (color.rgbToLab(ramp[i])[0] >= color.rgbToLab(ramp[i - 1])[0]) monotone = false;
    }
    check(monotone, 'a Lab shade ramp gets steadily darker');
    check(color.deltaE(ramp[0], ramp[3]) > color.deltaE(ramp[0], ramp[1]),
      'shade distance grows with steps along the ramp');

    const warm = color.shadeMiss([0.92, 0.74, 0.52], [0.86, 0.72, 0.66]);
    check(warm.warmth > 0, 'a golden product on a pink skin reads as too warm');
    const cool = color.shadeMiss([0.86, 0.72, 0.72], [0.90, 0.76, 0.55]);
    check(cool.warmth < 0, 'a pink product on a golden skin reads as too cool');
    const pale = color.shadeMiss([0.96, 0.90, 0.86], [0.55, 0.40, 0.32]);
    check(pale.depth > 0, 'a pale product on deep skin reads as too light');

    check(color.undertone([0.95, 0.80, 0.58]) === 'warm', 'golden reads warm');
    check(color.undertone([0.93, 0.78, 0.79]) === 'cool', 'pink reads cool');
  }

  /* ==================================================== deterministic == */

  {
    const a = rng.makeRng('seed-one');
    const b = rng.makeRng('seed-one');
    const c = rng.makeRng('seed-two');
    const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
    check(sa.every((v, i) => v === sb[i]), 'the same seed gives the same sequence');
    check(sa.some((v, i) => v !== sc[i]), 'different seeds diverge');

    /* The generator must not rhyme: a hundred consecutive seeds should not
     * cluster. This catches a hash that ignores its high bits, which produces
     * "every third customer has the same nose". */
    const firsts = [];
    for (let i = 0; i < 200; i++) firsts.push(rng.makeRng(1000 + i)());
    const mean = firsts.reduce((n, v) => n + v, 0) / firsts.length;
    near(mean, 0.5, 0.06, 'consecutive seeds are not biased');
    const buckets = new Array(10).fill(0);
    for (const f of firsts) buckets[Math.min(9, (f * 10) | 0)]++;
    check(buckets.every((n) => n >= 8), 'consecutive seeds fill every decile');
  }

  /* ======================================================= face space == */

  {
    const { faceU, faceV, F } = face;

    /* Monotonicity is a correctness property, not a smoothness preference: a
     * warp that folds turns a band of the head inside out. */
    let uMono = true, vMono = true;
    let prevU = faceU(0), prevV = faceV(0);
    for (let i = 1; i <= 2000; i++) {
      const s = i / 2000;
      const u = faceU(s), v = faceV(s);
      if (u < prevU - 1e-12) uMono = false;
      if (v < prevV - 1e-12) vMono = false;
      prevU = u; prevV = v;
    }
    check(uMono, 'the longitude warp is monotone');
    check(vMono, 'the latitude warp is monotone');
    near(faceU(0.5), 0.5, 1e-9, 'the centre line of the face is the centre of the texture');
    near(faceV(0), 0, 1e-9, 'the crown is at the top of the texture');
    near(faceV(1), 1, 1e-9, 'the base of the neck is at the bottom');

    /* The warp exists for exactly one reason. If it stops paying for itself the
     * lips go back to being twenty texels across and the game is unplayable. */
    const lipWidth = 2 * F.lipHalfS;
    check(lipWidth > 0.22,
      `lips take a usable share of the texture width (${(lipWidth * 100).toFixed(0)}%)`);
    const sphereLipWidth = faceU(0.5 + F.lipHalfS) - faceU(0.5 - F.lipHalfS);
    check(lipWidth / sphereLipWidth > 2.4,
      `the warp magnifies the face by ${(lipWidth / sphereLipWidth).toFixed(1)}x`);

    /* Landmarks in the order a face has them, named here rather than read out
     * of the same table they are being checked against. */
    check(F.hairline < F.browT, 'the hairline is above the brow');
    check(F.browT < F.eyeT, 'the brow is above the eye');
    check(F.eyeT < F.noseTipT, 'the eye is above the tip of the nose');
    check(F.noseTipT < F.mouthT, 'the nose is above the mouth');
    check(F.mouthT < F.chinT, 'the mouth is above the chin');
    check(F.chinT < F.jawT, 'the chin is above the jawline');
    check(F.lidTopT < F.lidBotT, 'the upper lash line is above the lower one');
    check(F.creaseT < F.lidTopT, 'the crease is above the lash line');
  }

  /* ============================================================ masks == */

  {
    const masks = face.buildMasks(256);
    const total = (z) => face.maskTotal(masks, z);
    for (const zone of face.ZONE_NAMES) {
      check(total(zone) > 40, `zone "${zone}" covers a usable area`);
    }
    check(total('skin') > total('lip') * 6, 'the face is much larger than the lips');

    /* Overlaps that would make the scoring meaningless. Lipstick landing in the
     * eyeshadow zone would be counted as eyeshadow. */
    const overlap = (a, b) => {
      let n = 0;
      const A = masks.zones[a], B = masks.zones[b];
      for (let i = 0; i < A.length; i++) n += (A[i] / 255) * (B[i] / 255);
      return n;
    };
    check(overlap('lip', 'lid') < 1, 'the lips and the eyelids do not overlap');
    check(overlap('lip', 'brow') < 1, 'the lips and the brows do not overlap');
    check(overlap('lid', 'brow') < total('brow') * 0.25,
      'the eyeshadow area is mostly clear of the brow');
    check(overlap('lash', 'lid') > 0, 'the lash line touches the lid, which is how liner blends');

    /* Everything paintable must be inside the area the brush is allowed to
     * touch, or products would be clipped away by the very mask meant to keep
     * them on the face. */
    for (const zone of ['lip', 'cheek', 'lid', 'brow', 'glow', 'contour', 'underEye']) {
      const inside = overlap(zone, 'skin') / total(zone);
      check(inside > 0.55, `"${zone}" sits inside the paintable face (${inside.toFixed(2)})`);
    }

    /* Symmetry: a face whose left eye is bigger than its right is a bug that is
     * hard to see and impossible to unsee. */
    const n = masks.size;
    for (const zone of ['lid', 'cheek', 'brow', 'lash', 'underEye']) {
      const buf = masks.zones[zone];
      let left = 0, right = 0;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n / 2; x++) left += buf[y * n + x];
        for (let x = n / 2; x < n; x++) right += buf[y * n + x];
      }
      near(left / right, 1, 0.06, `"${zone}" is symmetrical`);
    }

    /* And the lips are not: a cupid's bow is asymmetrical top to bottom, which
     * is what stops them reading as an oval. */
    const lipBuf = masks.zones.lip;
    let above = 0, below = 0;
    const mouthRow = Math.round(face.F.mouthT * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (y < mouthRow) above += lipBuf[y * n + x]; else below += lipBuf[y * n + x];
      }
    }
    check(below > above * 1.05, 'the lower lip is fuller than the upper one');
  }

  /* ========================================================= portrait == */

  /*
   * The photographic path, checked against a face whose landmarks are numbers
   * rather than clicks — the same fixture the smoke test draws, so a failure
   * here and a failure there are the same failure.
   *
   * What these are guarding is a specific class of bug that is invisible on
   * screen: a map that is very slightly wrong puts the lip mask most of the way
   * onto the lips, looks fine, and quietly scores every lipstick as half
   * missed. The only defence is to assert the landmark it was built from comes
   * back out where it went in.
   */
  {
    const frameMod = await load('portrait/frame.js');
    const portraitMasks = await load('portrait/masks.js');
    const { F } = face;

    const W = 800, H = 1000, cx = 400;
    const FIXTURE = {
      hairline: [cx, 290],
      browL: [cx - 72, 435], browR: [cx + 72, 435],
      eyeTop: [cx - 72, 462],
      eyeL: [cx - 72, 480], eyeR: [cx + 72, 480],
      eyeBottom: [cx - 72, 500],
      eyeOuterL: [cx - 103, 482], eyeOuterR: [cx + 103, 482],
      noseTip: [cx, 565],
      noseWingL: [cx - 41, 585], noseWingR: [cx + 41, 585],
      noseBase: [cx, 597],
      lipTop: [cx - 18, 640],
      mouthL: [cx - 60, 665], mouthR: [cx + 60, 665],
      lipBottom: [cx, 695],
      chin: [cx, 750],
      faceL: [cx - 170, 500], faceR: [cx + 170, 500],
    };
    const marks = (pts) => {
      const out = {};
      for (const [k, p] of Object.entries(pts)) out[k] = [p[0] / W, p[1] / H];
      return out;
    };
    const avatar = { id: 'audit', width: W, height: H, landmarks: marks(FIXTURE) };

    check(frameMod.LANDMARK_KEYS.length === Object.keys(FIXTURE).length,
      `the fixture marks every landmark the frame asks for (${frameMod.LANDMARK_KEYS.length})`);
    check(frameMod.validateAvatar(avatar).length === 0, 'and the set validates');

    /* Pooling. Two landmarks that disagree about their order must come out of
     * it merged rather than crossed — a crossed pair is a fold, and a fold puts
     * one part of the face in two places. */
    const [px, py] = landmarkMod.poolMonotone([[0, 0], [3, 0.3], [2, 0.5], [5, 0.6]]);
    check(px.every((v, i) => i === 0 || v > px[i - 1]), 'pooled control points are strictly increasing in x');
    check(py.every((v, i) => i === 0 || v > py[i - 1]), 'and strictly increasing in y');
    check(px.length === 3, 'the conflicting pair was merged, not dropped or crossed');

    const frame = frameMod.makeFrame(avatar);
    const at = (p) => frame.cropToFace(...frame.imageToCrop(p[0] / W, p[1] / H));

    /* Every landmark back where it came from. The tolerances are what a click
     * a couple of pixels out would produce; anything looser would pass on a map
     * that is visibly wrong. */
    near(at(FIXTURE.mouthL)[1], F.mouthT, 0.006, 'the marked mouth lands on the mouth line');
    near(at(FIXTURE.eyeL)[1], F.eyeT, 0.006, 'the marked pupil lands on the eye line');
    near(at(FIXTURE.chin)[1], F.chinT, 0.006, 'the marked chin lands on the chin');
    near(at(FIXTURE.hairline)[1], F.hairline, 0.006, 'the marked hairline lands on the hairline');
    near(at(FIXTURE.noseTip)[1], F.noseTipT, 0.006, 'the marked nose tip lands on the nose');
    near(at(FIXTURE.eyeL)[0], 0.5 - F.eyeS, 0.006, 'the left pupil lands on the left eye');
    near(at(FIXTURE.eyeR)[0], 0.5 + F.eyeS, 0.006, 'the right pupil lands on the right eye');
    near(at(FIXTURE.mouthL)[0], 0.5 - F.lipHalfS, 0.006, 'the left mouth corner lands on the corner');
    near(at(FIXTURE.noseWingR)[0], 0.5 + F.noseHalfS, 0.006, 'the nose wings land on the nose');
    near(at([cx, 500])[0], 0.5, 1e-9, 'the centre line of the picture is the centre line of the face');
    near(at(FIXTURE.noseBase)[1], F.noseBaseT, 0.006, 'the marked base of the nose lands on it');

    /*
     * The marks that fix a *size* rather than a position — how full her lips
     * are, how open her eyes are, how high her brows arch. These are checked
     * against the masks themselves rather than against a landmark constant,
     * because the constant is what the frame aims at and asserting a number
     * against itself proves nothing. If the map stopped honouring them, the
     * lipstick would still land on the mouth and would still stop short of a
     * full lip on everybody with a fuller one than average.
     */
    const band = (fn, s, lo, hi) => {
      let first = null, last = null;
      for (let i = 0; i <= 2000; i++) {
        const t = lo + (hi - lo) * (i / 2000);
        if (fn(s, t) > 0.5) { if (first === null) first = t; last = t; }
      }
      return first === null ? null : [first, last];
    };
    let lipTopT = 1, lipBotT = 0, browPeakT = 1;
    for (let i = 0; i <= 240; i++) {
      const k = i / 240;
      const lip = band(face.ZONES.lip, 0.5 - F.lipHalfS + 2 * F.lipHalfS * k, 0.45, 0.75);
      if (lip) { lipTopT = Math.min(lipTopT, lip[0]); lipBotT = Math.max(lipBotT, lip[1]); }
      const brow = band(face.ZONES.brow, 0.5 + F.browS - F.browHalfS + 2 * F.browHalfS * k, 0.24, 0.40);
      if (brow) browPeakT = Math.min(browPeakT, (brow[0] + brow[1]) / 2);
    }
    near(at(FIXTURE.lipTop)[1], lipTopT, 0.006, 'the marked top of the lip is the top of the lip mask');
    near(at(FIXTURE.lipBottom)[1], lipBotT, 0.006, 'and the marked bottom is the bottom of it');
    near(at(FIXTURE.browR)[1], browPeakT, 0.008, 'the marked peak of the brow is the peak of the brow mask');

    const eyeBand = band(face.eyeOpening, 0.5 - F.eyeS, 0.30, 0.50);
    near(at(FIXTURE.eyeTop)[1], eyeBand[0], 0.006, 'the marked upper lid is the top of the eye opening');
    near(at(FIXTURE.eyeBottom)[1], eyeBand[1], 0.006, 'and the marked lower lid the bottom of it');

    /* No folds, in either axis, anywhere in the crop. */
    let sMono = true, tMono = true;
    for (let i = 1; i <= 400; i++) {
      const a = frame.cropToFace(i / 400, 0.5), b = frame.cropToFace((i - 1) / 400, 0.5);
      if (a[0] <= b[0]) sMono = false;
      const c = frame.cropToFace(0.5, i / 400), d = frame.cropToFace(0.5, (i - 1) / 400);
      if (c[1] <= d[1]) tMono = false;
    }
    check(sMono, 'the fitted map never folds across the face');
    check(tMono, 'nor down it');

    /* And it inverts, which is what puts a hint on the lips. */
    for (const [s, t] of [[0.5, F.mouthT], [0.5 - F.eyeS, F.eyeT], [0.5, F.chinT]]) {
      const back = frame.cropToFace(...frame.faceToCrop(s, t));
      near(back[0], s, 1e-4, `face->crop->face returns s=${s}`);
      near(back[1], t, 1e-4, `face->crop->face returns t=${t}`);
    }

    /* A tilted photograph is the same face. Rotating every mark 11 degrees
     * about the middle of the picture must not move a single zone — if it does,
     * the levelling is wrong and every photograph taken at an angle has its
     * makeup applied at an angle too. */
    const rot = (deg) => {
      const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const out = {};
      for (const [k, p] of Object.entries(FIXTURE)) {
        const dx = p[0] - W / 2, dy = p[1] - H / 2;
        out[k] = [W / 2 + dx * c - dy * s, H / 2 + dx * s + dy * c];
      }
      return out;
    };
    const tiltedPts = rot(11);
    const tilted = frameMod.makeFrame({ id: 'tilt', width: W, height: H, landmarks: marks(tiltedPts) });
    const tiltAt = (p) => tilted.cropToFace(...tilted.imageToCrop(p[0] / W, p[1] / H));
    near(tiltAt(tiltedPts.mouthL)[1], F.mouthT, 0.006, 'a tilted photograph still finds its mouth');
    near(tiltAt(tiltedPts.eyeR)[0], 0.5 + F.eyeS, 0.006, 'and still knows which eye is which');
    near(tilted.brushScale, frame.brushScale, 0.02, 'and is the same size as it was level');

    /* The outline: on the face, off the background, and cut at the hairline so
     * foundation does not go into the hair. */
    const midCrop = frame.imageToCrop(cx / W, 520 / H);
    check(frame.outline(...midCrop) > 0.99, 'the middle of the face is inside the outline');
    check(frame.outline(0.02, 0.02) === 0, 'the corner of the crop is not');
    /* Just above the marked hairline, which is inside the shape of a head and
     * has to be excluded by the hairline cut rather than by running out of
     * face — the point of the check is the cut. */
    check(frame.outline(...frame.imageToCrop(cx / W, 268 / H)) === 0, 'nor is the hair above the hairline');
    check(frame.outline(...frame.imageToCrop(cx / W, 900 / H)) === 0, 'nor is the neck below the chin');
    check(frame.brushScale > 0.3 && frame.brushScale < 1.6,
      `the brush scale is sane (${frame.brushScale.toFixed(3)})`);

    /* The crop transform has to agree with the crop map, because one of them
     * draws the photograph and the other one decides where the lipstick goes. */
    const m = frame.cropTransform(1024);
    const applyM = (u, v) => [m.a * u * W + m.c * v * H + m.e, m.b * u * W + m.d * v * H + m.f];
    const c00 = applyM(...frame.cropToImage(0, 0));
    const c11 = applyM(...frame.cropToImage(1, 1));
    near(c00[0], 0, 0.01, 'the crop transform puts the crop origin at the canvas origin');
    near(c00[1], 0, 0.01, 'in both axes');
    near(c11[0], 1024, 0.02, 'and the far corner at the far corner');
    near(c11[1], 1024, 0.02, 'in both axes');

    /* The masks. Same structure the modelled head produces, same consumers. */
    const pm = portraitMasks.buildPortraitMasks(frame, 192);
    check(face.ZONE_NAMES.every((z) => pm.zones[z] instanceof Uint8Array),
      'a photographed face produces the same mask structure as a modelled one');
    const share = (z) => {
      const buf = pm.zones[z];
      let n = 0;
      for (let i = 0; i < buf.length; i++) n += buf[i];
      return n / 255 / (pm.size * pm.size);
    };
    for (const zone of face.ZONE_NAMES) {
      check(share(zone) > 0.0004, `photographed zone "${zone}" has area to paint (${share(zone).toFixed(4)})`);
    }
    check(share('skin') > share('lip') * 6, 'her face is much larger than her lips');

    /* Where the zones ended up on the picture, which is the assertion that a
     * mask built through a broken map fails. */
    const centroid = (z) => {
      const buf = pm.zones[z];
      let sx = 0, sy = 0, w = 0;
      for (let y = 0; y < pm.size; y++) {
        for (let x = 0; x < pm.size; x++) {
          const a = buf[y * pm.size + x] / 255;
          if (a <= 0) continue;
          sx += (x + 0.5) / pm.size * a; sy += (y + 0.5) / pm.size * a; w += a;
        }
      }
      return [sx / w, sy / w];
    };
    const wantLip = frame.imageToCrop(cx / W, 668 / H);
    const lipAt = centroid('lip');
    near(lipAt[0], wantLip[0], 0.012, 'the lip mask is centred on the photographed mouth');
    near(lipAt[1], wantLip[1], 0.012, 'in both axes');
    const lidAt = centroid('lid');
    near(lidAt[0], frame.imageToCrop(cx / W, 470 / H)[0], 0.012, 'the lids are centred on the face');
    check(lidAt[1] < lipAt[1] - 0.05, 'and well above the mouth');

    /* Nothing may be paintable off the face. */
    let outside = 0;
    for (let y = 0; y < pm.size; y++) {
      for (let x = 0; x < pm.size; x++) {
        const on = frame.outline((x + 0.5) / pm.size, (y + 0.5) / pm.size);
        if (on <= 0 && pm.zones.skin[y * pm.size + x] > 0) outside++;
      }
    }
    check(outside === 0, 'no part of the paintable area falls outside her face');

    /* Rejections. Each of these is a marking mistake somebody will make, and
     * each produces a face that looks fine until the first stroke. */
    const broken = (mutate) => {
      const pts = JSON.parse(JSON.stringify(marks(FIXTURE)));
      mutate(pts);
      return frameMod.validateAvatar({ id: 'x', width: W, height: H, landmarks: pts }).length > 0;
    };
    check(broken((p) => { delete p.chin; }), 'a missing landmark is rejected');
    check(broken((p) => { const t = p.eyeL; p.eyeL = p.eyeR; p.eyeR = t; }),
      'eyes marked the wrong way round are rejected');
    check(broken((p) => { p.mouthL = [0.1, 0.1]; p.mouthR = [0.12, 0.1]; }),
      'a mouth above the nose is rejected');
    check(broken((p) => { p.eyeTop = [0.4, 0.9]; }), 'an upper lid below the lower one is rejected');
    check(broken((p) => { p.eyeOuterL = [0.6, 0.48]; }),
      'an outer eye corner marked on the wrong side is rejected');

    /* The normals, which are what gloss is lit against. */
    const shape = portraitMasks.buildPortraitNormals(frame, 64);
    let unit = true, forward = 0, faceCount = 0;
    for (let i = 0; i < shape.size * shape.size; i++) {
      const n = [
        shape.data[i * 4] / 255 * 2 - 1,
        shape.data[i * 4 + 1] / 255 * 2 - 1,
        shape.data[i * 4 + 2] / 255 * 2 - 1,
      ];
      const len = Math.hypot(n[0], n[1], n[2]);
      if (Math.abs(len - 1) > 0.02) unit = false;
      if (shape.data[i * 4 + 3] > 128) { faceCount++; if (n[2] > 0.2) forward++; }
    }
    check(unit, 'every baked normal is a unit vector');
    check(faceCount > 0 && forward === faceCount,
      'and every normal on the face points at the camera, not into her head');
  }

  /* ==================================================== imported heads == */

  /*
   * A head somebody else modelled, put into face space.
   *
   * The only mesh whose face-space coordinates are known in advance is the one
   * this game generates, so that is what these use: build a head, note the
   * (s, t) of every vertex, throw the parameterisation away, move the whole
   * thing somewhere arbitrary — rotated, scaled by thirty-seven, translated —
   * and hand the importer nothing but triangles and twenty marks. What comes
   * back has to be the coordinates it started from.
   *
   * The head is deliberately an extreme one, far from the average the importer
   * fits against: a fit that only works on faces shaped like the reference is a
   * fit that will not survive first contact with a download.
   */
  {
    const objMod = await load('model/import/obj.js');
    const unwrapMod = await load('model/import/unwrap.js');
    const { F } = face;
    const { MESH_EDGE_S, BROW_PEAK_T, LIP_TOP_T, LIP_BOTTOM_T,
      VERTICAL_ANCHORS, horizontalAnchors } = landmarkMod;

    const P = {
      width: 1.13, length: 1.10, depth: 0.92, jaw: 1.42, chin: 1.70, cheek: 1.75,
      brow: 1.62, nose: 1.52, noseBridge: 1.55, lip: 1.82, eyeSize: 1.18, eyeDeep: 1.45,
    };
    const built = head.buildHead(P);
    const src = built.mesh;

    /* The twenty marks, placed at the face-space coordinates they stand for. */
    const MARK_ST = {
      hairline: [0.5, F.hairline],
      browL: [0.5 - F.browS, BROW_PEAK_T], browR: [0.5 + F.browS, BROW_PEAK_T],
      eyeTop: [0.5 - F.eyeS, F.lidTopT],
      eyeL: [0.5 - F.eyeS, F.eyeT], eyeR: [0.5 + F.eyeS, F.eyeT],
      eyeBottom: [0.5 - F.eyeS, F.lidBotT],
      eyeOuterL: [0.5 - (F.eyeS + F.eyeHalfS), F.eyeT],
      eyeOuterR: [0.5 + (F.eyeS + F.eyeHalfS), F.eyeT],
      noseTip: [0.5, F.noseTipT],
      noseWingL: [0.5 - F.noseHalfS, F.noseBaseT], noseWingR: [0.5 + F.noseHalfS, F.noseBaseT],
      noseBase: [0.5, F.noseBaseT],
      lipTop: [0.5, LIP_TOP_T],
      mouthL: [0.5 - F.lipHalfS, F.mouthT], mouthR: [0.5 + F.lipHalfS, F.mouthT],
      lipBottom: [0.5, LIP_BOTTOM_T],
      chin: [0.5, F.chinT],
      faceL: [0.5 - MESH_EDGE_S, 0.5], faceR: [0.5 + MESH_EDGE_S, 0.5],
    };

    /* Somewhere arbitrary: yawed, pitched, scaled to centimetres, moved off the
     * origin — the state a model arrives in from any tool that is not this one. */
    const AY = 0.44, AX = -0.21, K = 37.2, TR = [120, -8, 55];
    const place = (p) => {
      const x1 = p[0] * Math.cos(AY) + p[2] * Math.sin(AY);
      const z1 = -p[0] * Math.sin(AY) + p[2] * Math.cos(AY);
      const y2 = p[1] * Math.cos(AX) - z1 * Math.sin(AX);
      const z2 = p[1] * Math.sin(AX) + z1 * Math.cos(AX);
      return [x1 * K + TR[0], y2 * K + TR[1], z2 * K + TR[2]];
    };

    const marks = {};
    for (const [k, st] of Object.entries(MARK_ST)) {
      marks[k] = place(head.evalSurface(P, st[0], st[1], head.NEUTRAL_EXPR, []));
    }
    const moved = new Float32Array(src.positions.length);
    for (let i = 0; i < src.positions.length; i += 3) {
      const q = place([src.positions[i], src.positions[i + 1], src.positions[i + 2]]);
      moved[i] = q[0]; moved[i + 1] = q[1]; moved[i + 2] = q[2];
    }

    /* ---- the file format ---- */
    const obj = objMod.parseOBJ(objMod.writeOBJ(moved, src.indices));
    check(obj.stats.triangles === src.triangles,
      `an OBJ round-trip keeps every triangle (${obj.stats.triangles})`);
    check(obj.stats.vertices > 0 && obj.stats.vertices <= src.positions.length / 3,
      `and no more vertices than it started with (${obj.stats.vertices})`);
    let objBox = [Infinity, -Infinity];
    for (let i = 0; i < obj.positions.length; i += 3) {
      objBox[0] = Math.min(objBox[0], obj.positions[i]);
      objBox[1] = Math.max(objBox[1], obj.positions[i]);
    }
    near(objBox[0], Math.min(...Array.from({ length: moved.length / 3 }, (_, i) => moved[i * 3])),
      0.01, 'and the geometry comes back where it went in');

    /* Negative indices count back from the end of the file, n-gons are fanned,
     * and a file with no vt/vn is still a mesh. All three appear in exports
     * from real tools and all three are silent corruption if mishandled. */
    const quirky = objMod.parseOBJ([
      'v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0',
      'f -4 -3 -2 -1',
    ].join('\n'));
    check(quirky.stats.triangles === 2, 'a negatively-indexed quad becomes two triangles');
    check(quirky.stats.ngons === 1, 'and is reported as the n-gon it was');
    check(quirky.normals === null && quirky.uvs === null,
      'a file with no normals or UVs does not pretend to have them');
    let rejected = false;
    try { objMod.parseOBJ('v 0 0 0\nf 1 2 3'); } catch { rejected = true; }
    check(rejected, 'a face pointing at a vertex that does not exist is rejected');

    /* ---- glTF ---- *
     *
     * Built here rather than read from a fixture file, so that each thing the
     * format does that a naive reader gets wrong is present on purpose: an
     * interleaved buffer with a stride, a node with a rotation on it, and an
     * index accessor of a different component type from the positions.
     */
    {
      const gltfMod = await load('model/import/gltf.js');
      /* Four vertices of a unit square in the XY plane, position and normal
       * interleaved — 24 bytes per vertex, which is the stride a reader that
       * assumes packed data will get wrong. */
      const f = new Float32Array([
        0, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 1,
        1, 1, 0, 0, 0, 1,
        0, 1, 0, 0, 0, 1,
      ]);
      const ind = new Uint16Array([0, 1, 2, 0, 2, 3]);
      const blob = new Uint8Array(f.byteLength + ind.byteLength);
      blob.set(new Uint8Array(f.buffer), 0);
      blob.set(new Uint8Array(ind.buffer), f.byteLength);
      const doc = (nodes) => ({
        asset: { version: '2.0' },
        buffers: [{ byteLength: blob.length, uri: 'data:application/octet-stream;base64,' + Buffer.from(blob).toString('base64') }],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: f.byteLength, byteStride: 24 },
          { buffer: 0, byteOffset: f.byteLength, byteLength: ind.byteLength },
        ],
        accessors: [
          { bufferView: 0, byteOffset: 0, componentType: 5126, count: 4, type: 'VEC3' },
          { bufferView: 0, byteOffset: 12, componentType: 5126, count: 4, type: 'VEC3' },
          { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
        nodes,
        scenes: [{ nodes: [0] }],
      });

      const flat = gltfMod.parseGLTF(doc([{ mesh: 0 }]));
      check(flat.stats.triangles === 2 && flat.stats.vertices === 4,
        'a glTF primitive reads back as the triangles it holds');
      check(Math.abs(flat.positions[3] - 1) < 1e-6 && Math.abs(flat.positions[4]) < 1e-6,
        'and an interleaved buffer is read at its stride, not packed');
      check(flat.normals !== null && Math.abs(flat.normals[2] - 1) < 1e-6,
        'and its normals come from the second half of each stride');

      /* A quarter turn about X, which is the transform a Z-up model arrives
       * with. Ignoring it lays the head on its side. */
      const q = Math.SQRT1_2;
      const turned = gltfMod.parseGLTF(doc([{ children: [1] }, { mesh: 0, rotation: [q, 0, 0, q] }]));
      near(turned.positions[3 * 2 + 1], 0, 1e-5, 'a node rotation is applied to the geometry under it');
      near(turned.positions[3 * 2 + 2], 1, 1e-5, 'so a Z-up model does not arrive lying down');
      near(turned.positions[3 * 3 + 2], 1, 1e-5, 'through a parent node as well as its own');

      /* The one failure a user will actually hit. Sketchfab's glTF export is
       * usually Draco-compressed, and the useful thing to do about it is say so
       * by name rather than hand back an empty mesh. */
      let dracoMsg = '';
      try {
        gltfMod.parseGLTF({ ...doc([{ mesh: 0 }]), extensionsRequired: ['KHR_draco_mesh_compression'] });
      } catch (err) { dracoMsg = err.message; }
      check(/draco/i.test(dracoMsg) && /uncompressed|OBJ/i.test(dracoMsg),
        'a Draco-compressed file is refused with an error that says what to do instead');

      /* And GLB, which is the same document in a container. */
      const jsonText = new TextEncoder().encode(JSON.stringify(doc([{ mesh: 0 }])));
      const pad = (4 - (jsonText.length % 4)) % 4;
      const glb = new Uint8Array(12 + 8 + jsonText.length + pad);
      const dv = new DataView(glb.buffer);
      dv.setUint32(0, 0x46546c67, true);
      dv.setUint32(4, 2, true);
      dv.setUint32(8, glb.length, true);
      dv.setUint32(12, jsonText.length + pad, true);
      dv.setUint32(16, 0x4e4f534a, true);
      glb.set(jsonText, 20);
      for (let i = 0; i < pad; i++) glb[20 + jsonText.length + i] = 0x20;
      const fromGlb = gltfMod.parseMesh(glb.buffer);
      check(fromGlb.stats.triangles === 2, 'a GLB container holds the same document');
    }

    /* ---- the pose ---- */
    const pose = unwrapMod.fitPose(marks);
    const det = pose.right[0] * (pose.up[1] * pose.forward[2] - pose.up[2] * pose.forward[1])
      - pose.right[1] * (pose.up[0] * pose.forward[2] - pose.up[2] * pose.forward[0])
      + pose.right[2] * (pose.up[0] * pose.forward[1] - pose.up[1] * pose.forward[0]);
    check(det > 0.99,
      `the fitted frame is right-handed (det ${det.toFixed(4)}) — a left-handed one mirrors the head`);
    near(pose.scale * K, 1, 0.08, 'the fit undoes the export scale');
    check(pose.residual < 0.06,
      `and lands the marks on the reference head (residual ${pose.residual.toFixed(4)} half-heights)`);

    let swapRejected = false;
    try {
      unwrapMod.fitPose({ ...marks, eyeL: marks.eyeR, eyeR: marks.eyeL });
    } catch { swapRejected = true; }
    check(swapRejected, 'marks with the eyes the wrong way round are rejected, not mirrored');

    /* ---- the unwrap ---- */
    const out = unwrapMod.unwrapHead({ positions: moved, indices: src.indices }, marks);
    check(out.stats.orderProblems.length === 0, 'the marks come out in the order a face has features');

    /*
     * Every anchor the fit targets has to land exactly on it. This is the check
     * the whole landmark correction exists for: without it the marks come back
     * where the sphere put them, which on this head is nearly two percent out —
     * enough to paint a lipstick along the line under the lip.
     */
    let worstV = 0;
    for (const a of VERTICAL_ANCHORS) {
      const got = a.keys.reduce((n, k) => n + out.marked[k][1], 0) / a.keys.length;
      worstV = Math.max(worstV, Math.abs(got - a.t));
    }
    let worstH = 0, worstRaw = 0;
    for (const a of horizontalAnchors(MESH_EDGE_S)) {
      for (const side of ['L', 'R']) {
        worstH = Math.max(worstH, Math.abs(Math.abs(out.marked[a.key + side][0] - 0.5) - a.s));
      }
    }
    for (const k of Object.keys(MARK_ST)) {
      worstRaw = Math.max(worstRaw,
        Math.hypot(out.raw[k][0] - MARK_ST[k][0], out.raw[k][1] - MARK_ST[k][1]));
    }
    check(worstV < 1e-9, `every vertical mark lands on its own coordinate (worst ${worstV.toExponential(1)})`);
    check(worstH < 1e-9, `and every horizontal one (worst ${worstH.toExponential(1)})`);
    check(worstRaw > 0.008,
      `and the sphere alone would not have (${worstRaw.toFixed(4)} out) — the correction is doing work`);

    /*
     * And the vertices between the marks, against the coordinates they were
     * generated from. Measured feature by feature, because that is where the
     * masks are: an error out by the ear moves nothing, an error on the mouth
     * moves the lipstick.
     */
    const n = src.positions.length / 3;
    const bandError = (inside) => {
      const e = [];
      for (let i = 0; i < n; i++) {
        const s0 = src.vertices[i * 9 + 6], t0 = src.vertices[i * 9 + 7];
        if (!inside(s0, t0)) continue;
        e.push(Math.hypot(out.mesh.vertices[i * 9 + 6] - s0, out.mesh.vertices[i * 9 + 7] - t0));
      }
      e.sort((a, b) => a - b);
      return { n: e.length, median: e[e.length >> 1], max: e[e.length - 1] };
    };
    const BANDS = [
      ['the lips', (s, t) => Math.abs(s - 0.5) < F.lipHalfS && Math.abs(t - F.mouthT) < 0.06],
      ['the eyes', (s, t) => Math.abs(Math.abs(s - 0.5) - F.eyeS) < 0.09 && Math.abs(t - F.eyeT) < 0.05],
      ['the cheeks', (s, t) => Math.abs(Math.abs(s - 0.5) - 0.22) < 0.09 && Math.abs(t - 0.52) < 0.07],
      ['the nose', (s, t) => Math.abs(s - 0.5) < 0.12 && t > 0.40 && t < 0.54],
      ['the forehead', (s, t) => Math.abs(s - 0.5) < 0.25 && t > 0.18 && t < 0.30],
    ];
    for (const [name, inside] of BANDS) {
      const e = bandError(inside);
      check(e.n > 500, `${name} has enough vertices to judge (${e.n})`);
      check(e.max < 0.025,
        `${name} come back where they started (worst ${e.max.toFixed(4)} in face space)`);
    }

    /* ---- folds and seams ---- */
    check(out.stats.flipped / out.stats.triangles < 0.02,
      `almost nothing folded (${out.stats.flipped} of ${out.stats.triangles})`);
    check(out.stats.degenerate === 0, 'and no triangle came out with no area at all');
    check(out.stats.seamSplit > 0,
      `the seam up the back was split (${out.stats.seamSplit} vertices duplicated)`);

    /*
     * A fold on the front of the face puts a product in two places, so what
     * matters there is how much *area* folded rather than how many triangles
     * did. A handful always do: the pocket under the nose is concave and faces
     * partly upwards, and no projection from inside a head can unwrap that
     * without a crease. Measured, it is four thousandths of a percent of the
     * face — far under a texel of any mask — and the threshold here is set two
     * orders above it so that a real fold, which would be a whole band, fails.
     */
    const V = out.mesh.vertices, I = out.mesh.indices;
    let frontArea = 0, foldedArea = 0, frontTris = 0, wideTris = 0;
    for (let f = 0; f < I.length; f += 3) {
      const a = I[f], b = I[f + 1], c = I[f + 2];
      const sa = V[a * 9 + 6], ta = V[a * 9 + 7];
      const sb = V[b * 9 + 6], tb = V[b * 9 + 7];
      const sc = V[c * 9 + 6], tc = V[c * 9 + 7];
      const midT = (ta + tb + tc) / 3;
      /* The two poles are excluded from the seam check and from nothing else:
       * every longitude meets at a point there, so a triangle spanning half the
       * texture is what the parameterisation *is* at the crown, not a tear. */
      if (Math.max(sa, sb, sc) - Math.min(sa, sb, sc) > 0.5
        && midT > 0.06 && midT < 0.94) wideTris++;
      const mid = (sa + sb + sc) / 3;
      if (Math.abs(mid - 0.5) > 0.30 || midT < 0.20 || midT > 0.78) continue;
      frontTris++;
      const area = (sb - sa) * (tc - ta) - (sc - sa) * (tb - ta);
      frontArea += Math.abs(area);
      if (area > 0) foldedArea += Math.abs(area);
    }
    check(frontTris > 5000, `the front of the face is most of the mesh (${frontTris} triangles)`);
    check(foldedArea / frontArea < 0.001,
      `and effectively none of it folded (${(foldedArea / frontArea).toExponential(1)} of its area)`);
    check(wideTris === 0, 'and no triangle away from the poles stretches across the texture');

    /* ---- the shape it hands back ---- */
    check(out.mesh.vertices.length === out.stats.vertices * 9,
      'the vertex buffer is in the layout the renderer binds');
    check(out.morph.length === out.stats.vertices * 12,
      'and there is a morph buffer, even though a downloaded head cannot smile');
    check(Array.from(out.morph).every((v) => v === 0), 'which is all zeroes, so it adds nothing');
    let unit = true, aoOk = true;
    for (let i = 0; i < out.stats.vertices; i++) {
      const o = i * 9;
      const l = Math.hypot(V[o + 3], V[o + 4], V[o + 5]);
      if (Math.abs(l - 1) > 1e-3) unit = false;
      if (!(V[o + 8] >= 0.2 && V[o + 8] <= 1.001)) aoOk = false;
    }
    check(unit, 'every normal it computed is a unit vector');
    check(aoOk, 'and every vertex carries usable occlusion');
    check(Array.from(out.mesh.indices).every((i) => i < out.stats.vertices),
      'no index points past the end of the buffer');

    /*
     * Size and proportion, which are two different questions.
     *
     * The fit scales an import to the size of the *average* head, on purpose:
     * a model that arrives twice as tall as the counter is not a stylistic
     * choice the game can honour, and the camera, the eyes and the lids are all
     * placed in those units. What it must not do is squash: a long face has to
     * stay a long face, so the aspect is checked far more tightly than the size.
     */
    const boxOf = (p) => {
      const b = [Infinity, -Infinity, Infinity, -Infinity];
      for (let i = 0; i < p.length; i += 3) {
        b[0] = Math.min(b[0], p[i]); b[1] = Math.max(b[1], p[i]);
        b[2] = Math.min(b[2], p[i + 1]); b[3] = Math.max(b[3], p[i + 1]);
      }
      return [b[1] - b[0], b[3] - b[2]];
    };
    const got = boxOf(out.mesh.positions);
    const was = boxOf(src.positions);
    const average = head.buildHead({
      width: 1, length: 1, depth: 1, jaw: 1, chin: 1, cheek: 1, brow: 1,
      nose: 1, noseBridge: 1, lip: 1, eyeSize: 1, eyeDeep: 1,
    }).mesh;
    const avg = boxOf(average.positions);
    /* ---- the hidden layers ---- *
     *
     * The step that makes a real downloaded head work, and the one whose
     * absence is invisible until somebody paints. A scan is not a single sheet:
     * the front of the neck sits behind the chin, the eyelids sit in front of
     * the socket, a nostril has a far wall. All of them get an (s, t) and all
     * of them land on top of the skin the player is aiming at.
     *
     * The test builds exactly that — a head with a second, smaller copy of
     * itself hidden inside — and asserts that the overlap measure sees it and
     * the cull removes it. It also asserts the cull leaves a clean head alone,
     * which is the failure that would quietly delete a cheek.
     */
    {
      const clean = unwrapMod.unwrapHead({ positions: moved, indices: src.indices }, marks);
      check(clean.stats.overlap < 0.001,
        `a single-sheet head has nothing lying on top of itself (${(clean.stats.overlap * 100).toFixed(3)}%)`);
      check(clean.stats.culled === 0,
        `and the cull takes nothing off it (${clean.stats.culled} triangles)`);

      /* The same head with a copy of itself at 80% of the radius inside it —
       * a stand-in for a neck behind a chin, and geometrically the same
       * problem. */
      const n = moved.length / 3;
      const doubled = new Float32Array(moved.length * 2);
      doubled.set(moved, 0);
      const centre = [0, 0, 0];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) centre[k] += moved[i * 3 + k] / n;
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) {
          doubled[(n + i) * 3 + k] = centre[k] + (moved[i * 3 + k] - centre[k]) * 0.8;
        }
      }
      const both = new Uint32Array(src.indices.length * 2);
      both.set(src.indices, 0);
      for (let i = 0; i < src.indices.length; i++) both[src.indices.length + i] = src.indices[i] + n;

      const layered = unwrapMod.unwrapHead({ positions: doubled, indices: both }, marks, { cull: false });
      check(layered.stats.overlap > 0.5,
        `a head with a second layer inside it is measured as covered twice (${(layered.stats.overlap * 100).toFixed(0)}%)`);

      const fixed = unwrapMod.unwrapHead({ positions: doubled, indices: both }, marks);
      check(fixed.stats.overlap < 0.02,
        `and the cull removes the layer (${(fixed.stats.overlap * 100).toFixed(2)}%)`);
      check(fixed.stats.culled > src.triangles * 0.7,
        `by dropping about half the triangles (${fixed.stats.culled} of ${both.length / 3})`);
      /* And what it kept is the outer one, not the inner one. */
      let maxR = 0;
      for (let i = 0; i < fixed.mesh.positions.length; i += 3) {
        maxR = Math.max(maxR, Math.hypot(fixed.mesh.positions[i],
          fixed.mesh.positions[i + 1], fixed.mesh.positions[i + 2]));
      }
      let cleanR = 0;
      for (let i = 0; i < clean.mesh.positions.length; i += 3) {
        cleanR = Math.max(cleanR, Math.hypot(clean.mesh.positions[i],
          clean.mesh.positions[i + 1], clean.mesh.positions[i + 2]));
      }
      near(maxR, cleanR, 0.02, 'and the shell it kept is the outer one');

      /*
       * And the other half of the rule, which depth alone cannot express: a
       * surface facing back towards the middle of the head. The inside of a
       * lip and the far wall of a nostril are exactly that, and they can sit
       * *outside* the skin in front of them, so the depth test keeps them. The
       * stand-in is the same head at 102% with its winding reversed.
       */
      const inward = new Float32Array(moved.length * 2);
      inward.set(moved, 0);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) {
          inward[(n + i) * 3 + k] = centre[k] + (moved[i * 3 + k] - centre[k]) * 1.02;
        }
      }
      const flippedIdx = new Uint32Array(src.indices.length * 2);
      flippedIdx.set(src.indices, 0);
      for (let f = 0; f < src.indices.length; f += 3) {
        flippedIdx[src.indices.length + f] = src.indices[f] + n;
        flippedIdx[src.indices.length + f + 1] = src.indices[f + 2] + n;
        flippedIdx[src.indices.length + f + 2] = src.indices[f + 1] + n;
      }
      const facing = unwrapMod.unwrapHead({ positions: inward, indices: flippedIdx }, marks);
      check(facing.stats.culled >= src.triangles * 0.9,
        `a shell facing back into the head is dropped whether or not it is in front (${facing.stats.culled})`);
      check(facing.stats.overlap < 0.02,
        `leaving one sheet behind (${(facing.stats.overlap * 100).toFixed(2)}%)`);
    }

    /* ---- packed and unpacked ---- *
     *
     * What ships is not the file that was imported, it is the unwrap: sixteen
     * bits per position and per texture coordinate. The quantisation is meant
     * to be invisible rather than merely small, so it is measured against the
     * thing it has to be invisible *to* — a texel of the paint layer, which at
     * 1024 across is one thousandth of a texture coordinate.
     */
    {
      const headsMod = await load('model/import/heads.js');
      const record = headsMod.packHead(out, {
        id: 'audit-head', name: 'בדיקה', credit: 'audit', skip: ['ears'],
        landmarks: marks,
      });
      check(record.vertexCount === out.stats.vertices && record.triangleCount === out.stats.triangles,
        `a packed head keeps its size (${record.vertexCount} vertices)`);
      const bytes = record.pos.length + record.uv.length + record.idx.length;
      check(bytes < out.stats.vertices * 60,
        `and is small enough to carry (${Math.round(bytes / 1024)} KB of base64)`);

      const rebuilt = headsMod.buildImportedHead(record);
      check(rebuilt.mesh.triangles === out.stats.triangles, 'unpacking gives back every triangle');
      /* The brush's ray-cast reads its hit's texture coordinates off `uvs` and
       * its early-out off the bounding box. A mesh without them is a head the
       * pointer throws on the instant it touches it — and the coverage numbers
       * keep moving anyway, because the arrival makeup is already on the face,
       * so it looks like the paint is landing. */
      check(rebuilt.mesh.uvs && rebuilt.mesh.uvs.length === record.vertexCount * 2,
        'and a UV array for the ray-cast the brush runs on');
      check(!!rebuilt.mesh.min && !!rebuilt.mesh.max, 'and a bounding box for it to reject against');
      check(rebuilt.mesh.uvs[12] === rebuilt.mesh.vertices[6 * 9 + 6],
        'which holds the same coordinates the vertex buffer does');
      let worstPos = 0, worstUV = 0, unitAgain = true;
      for (let i = 0; i < record.vertexCount; i++) {
        for (let k = 0; k < 3; k++) {
          worstPos = Math.max(worstPos,
            Math.abs(rebuilt.mesh.positions[i * 3 + k] - out.mesh.positions[i * 3 + k]));
        }
        worstUV = Math.max(worstUV,
          Math.abs(rebuilt.mesh.vertices[i * 9 + 6] - out.mesh.vertices[i * 9 + 6]),
          Math.abs(rebuilt.mesh.vertices[i * 9 + 7] - out.mesh.vertices[i * 9 + 7]));
        const l = Math.hypot(rebuilt.mesh.vertices[i * 9 + 3],
          rebuilt.mesh.vertices[i * 9 + 4], rebuilt.mesh.vertices[i * 9 + 5]);
        if (Math.abs(l - 1) > 1e-3) unitAgain = false;
      }
      check(worstPos < 1e-4,
        `positions survive the round trip (worst ${(worstPos * 115).toFixed(3)} mm on a face)`);
      check(worstUV < 1 / 1024,
        `and texture coordinates to inside a texel (worst ${worstUV.toExponential(1)})`);
      check(unitAgain, 'and the normals it recomputes are unit vectors');

      /* The eyes have to end up in the sockets, or the customer has two marbles
       * on her cheeks and there is no shape function left to ask. */
      const eyeGap = Math.hypot(record.eyeR.centre[0] - record.eyeL.centre[0],
        record.eyeR.centre[1] - record.eyeL.centre[1],
        record.eyeR.centre[2] - record.eyeL.centre[2]);
      const refL = head.eyeAnchor(P, -1), refR = head.eyeAnchor(P, 1);
      const refGap = Math.hypot(refR.centre[0] - refL.centre[0],
        refR.centre[1] - refL.centre[1], refR.centre[2] - refL.centre[2]);
      near(eyeGap, refGap, refGap * 0.12, 'the eyes come out the right distance apart');
      check(record.eyeL.centre[0] < 0 && record.eyeR.centre[0] > 0,
        'and on the correct sides of the face');
      check(record.eyeL.normal[2] > 0.5 && record.eyeR.normal[2] > 0.5,
        'with their sockets facing out of the head, not into it');
      check(record.eyeRadius > 0.05 && record.eyeRadius < 0.16,
        `and an eyeball the size of an eyeball (${record.eyeRadius.toFixed(3)})`);
      check(record.focus.lips[1] < record.focus.eyes[1],
        'the close-up on the lips is below the one on the eyes');
    }

    near(got[0] / got[1], was[0] / was[1], 0.03,
      'an imported head keeps its proportions — a long face stays a long face');
    near(got[1], avg[1], avg[1] * 0.12,
      'and comes back about the size the game builds a head, so the camera still frames it');
    check(got[1] > 1.5 && got[1] < 2.6, `which is a head, in head units (${got[1].toFixed(2)})`);
  }

  /* ============================================== aimed model matrices == */

  /*
   * Every model matrix built from a direction has to be right-handed.
   *
   * This is the winding bug's twin, and it is even better hidden. A
   * left-handed frame puts the object in the right place, pointing the right
   * way, at the right size — and mirrors it, which swaps the front and back of
   * every triangle in it. Under back-face culling the object then draws its own
   * far side. For an eyeball sitting in a socket that means it draws the half
   * inside the skull, so the eye simply is not there, and every measurement of
   * where it should be says it is fine.
   */
  {
    const m = math.mat4();
    const dirs = [
      [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0],
      [0.3, 0.2, 0.9], [-0.5, -0.4, 0.76], [0.1, 0.99, 0.05],
    ];
    for (const [x, y, z] of dirs) {
      math.aimedBasis(m, x, y, z, 1, 2, 3, 0.115);
      const det = math.basisDeterminant(m);
      check(det > 0, `aiming at (${x}, ${y}, ${z}) gives a right-handed frame (det ${det.toExponential(2)})`);
      /* And it really does point that way, at that place, at that size. */
      const l = Math.hypot(x, y, z);
      near(m[8] / 0.115, x / l, 1e-6, 'the forward axis is the direction asked for');
      near(m[12], 1, 1e-9, 'and the translation is where it was put');
      near(Math.hypot(m[0], m[1], m[2]), 0.115, 1e-6, 'and the scale is uniform');
    }
    /* Straight up, where the horizontal cross product collapses, must still
     * produce a usable frame rather than NaNs across the whole draw. */
    math.aimedBasis(m, 0, 1, 0, 0, 0, 0, 1);
    check(m.every(Number.isFinite) && math.basisDeterminant(m) > 0,
      'aiming straight up does not degenerate');
  }

  /* ========================================================== winding == */

  /*
   * Every closed mesh must be wound outwards.
   *
   * This is the check that found the worst bug in the project. Back-face
   * culling is on, so a mesh wound the wrong way does not vanish and does not
   * flicker — it renders as a smooth, solid, plausible object, because what is
   * on screen is the inside of its far wall with the near wall culled. On a
   * head that is devastating and almost invisible: the silhouette is still a
   * head, the eyeballs are separate meshes and still sit in front of it, the
   * skin texture still maps onto something. The face simply has no features,
   * and no makeup ever appears on it, because the surface being looked at is
   * the back of the skull seen from inside.
   *
   * The signed volume of a closed triangle mesh is positive exactly when its
   * triangles face outwards, which turns all of that into one number.
   */
  {
    const signedVolume = (m) => {
      const p = m.positions, idx = m.indices;
      let v = 0;
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
        v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
          - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
          + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
      }
      return v;
    };
    /* Built without recomputing normals, so the primitive's own idea of which
     * way it faces is what gets tested. */
    const solo = (fn) => {
      const b = new mesh.MeshBuilder();
      fn(b);
      return b.build();
    };
    const r = rng.makeRng(2024);
    const P = head.faceParams(r);
    const closed = {
      head: head.buildHead(P).mesh,
      eyeball: head.buildEyeball(0.1),
      'upper lid': head.buildLid(0.1, 1, false),
      'lower lid': head.buildLid(0.1, 1, true),
      hair: body.buildHair(P, 'bob', rng.makeRng(1)),
      neck: body.buildNeck(P),
      garment: body.buildGarment(P, 0),
      ears: body.buildEars(P),
      hands: body.buildHands(P),
      sphere: solo((b) => mesh.sphere(b, 0, 0, 0, 1, [24, 16])),
      box: solo((b) => mesh.box(b, 0, 0, 0, 1, 1, 1)),
      lathe: solo((b) => mesh.lathe(b, [[0.5, 0], [0.6, 0.4], [0.3, 1]], 20, 0, 0, 0, {})),
      cylinder: solo((b) => mesh.cylinder(b, 0, 0, 0, 0.5, 1, 20, {})),
      'rounded slab': solo((b) => mesh.roundedSlab(b, 0, 0, 0, 1, 0.2, 0.6, 0.05)),
      torus: solo((b) => mesh.torus(b, 0, 0, 0, 1, 0.2)),
    };
    for (const [name, m] of Object.entries(closed)) {
      check(signedVolume(m) > 0, `"${name}" is wound outwards, not inside out`);
    }

    /*
     * And the normals a primitive writes for itself have to agree with the way
     * it wound its triangles. Half the primitives here set their normals by
     * hand from the maths that generated the surface; if one of those is
     * flipped relative to its winding, the mesh lights as though it were inside
     * out while still being visible, which is a subtler version of the same
     * bug and just as hard to see on a curved surface.
     */
    for (const [name, m] of Object.entries(closed)) {
      const p = m.positions, idx = m.indices;
      let agree = 0, total = 0;
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i], b = idx[i + 1], c = idx[i + 2];
        const e1 = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
        const e2 = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
        const gx = e1[1] * e2[2] - e1[2] * e2[1];
        const gy = e1[2] * e2[0] - e1[0] * e2[2];
        const gz = e1[0] * e2[1] - e1[1] * e2[0];
        if (Math.hypot(gx, gy, gz) < 1e-12) continue;      /* degenerate at a pole */
        let nx = 0, ny = 0, nz = 0;
        for (const v of [a, b, c]) {
          nx += m.vertices[v * 9 + 3];
          ny += m.vertices[v * 9 + 4];
          nz += m.vertices[v * 9 + 5];
        }
        total++;
        if (gx * nx + gy * ny + gz * nz > 0) agree++;
      }
      check(agree / total > 0.95,
        `"${name}" writes normals that agree with its winding (${(agree / total * 100).toFixed(0)}%)`);
    }
  }

  /* ============================================================= head == */

  {
    const r = rng.makeRng(4242);
    const P = head.faceParams(r);
    const { mesh, morph } = head.buildHead(P);

    check(mesh.positions.every(Number.isFinite), 'every head vertex is a number');
    check(morph.every(Number.isFinite), 'every morph delta is a number');
    check(mesh.triangles > 20000, `the head has enough geometry (${mesh.triangles} triangles)`);

    /* Proportions, in head half-heights. A head 1.4 times as wide as it is tall
     * means a warp or a taper has gone the wrong way. */
    const w = mesh.max[0] - mesh.min[0];
    const h = mesh.max[1] - mesh.min[1];
    const d = mesh.max[2] - mesh.min[2];
    check(w / h > 0.55 && w / h < 0.95, `head width over height is plausible (${(w / h).toFixed(2)})`);
    check(d / h > 0.65 && d / h < 1.15, `head depth over height is plausible (${(d / h).toFixed(2)})`);

    /* The features actually stick out. Without this the shape function can be
     * silently zeroed and the audit would still pass on "it is an ellipsoid". */
    const at = (s, t) => head.evalSurface(P, s, t, head.NEUTRAL_EXPR, []);
    const noseTip = at(0.5, face.F.noseTipT);
    const cheek = at(0.5 + face.F.cheekS, face.F.noseTipT);
    check(noseTip[2] > cheek[2] + 0.06, 'the nose projects in front of the cheeks');

    /*
     * The nose has to be a nose, not a spike. Comparing the tip against the
     * cheek passes even when the nose is 4mm wide, because most of that
     * difference is the curvature of the head — so this measures the tip
     * against the face immediately beside it, and in millimetres, which is the
     * unit the mistake was made in. It was: the first nose was invisible on the
     * rendered head and every check still passed.
     */
    const beside = at(0.5 + 0.12, face.F.noseTipT);
    const projectionMm = (noseTip[2] - beside[2]) * 115;
    check(projectionMm > 7 && projectionMm < 26,
      `the nose stands off its own flank by a human amount (${projectionMm.toFixed(1)}mm)`);
    /* And it is as wide as one: measure where the bridge has fallen to half. */
    const widthAt = (frac) => {
      let lo = 0, hi = 0.35;
      const peak = noseTip[2] - beside[2];
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const h = at(0.5 + mid, face.F.noseTipT)[2] - beside[2];
        if (h > peak * frac) lo = mid; else hi = mid;
      }
      return (at(0.5 + lo, face.F.noseTipT)[0]) * 2 * 115;
    };
    const noseWidthMm = widthAt(0.5);
    check(noseWidthMm > 14 && noseWidthMm < 44,
      `and it is a nose's width across (${noseWidthMm.toFixed(1)}mm)`);
    const lip = at(0.5, face.F.mouthT - 0.02);
    const chin = at(0.5, face.F.chinT);
    check(lip[2] > chin[2], 'the lips are in front of the chin');
    const socket = at(0.5 + face.F.eyeS, face.F.eyeT);
    const brow = at(0.5 + face.F.eyeS, face.F.browT);
    check(brow[2] > socket[2], 'the brow ridge overhangs the eye socket');

    /* Left and right are mirror images. */
    for (const t of [0.3, 0.42, 0.58, 0.72]) {
      const l = at(0.5 - 0.18, t), rr = at(0.5 + 0.18, t);
      near(l[0], -rr[0], 1e-6, `the face is symmetrical at t=${t} (x)`);
      near(l[1], rr[1], 1e-6, `the face is symmetrical at t=${t} (y)`);
      near(l[2], rr[2], 1e-6, `the face is symmetrical at t=${t} (z)`);
    }

    /* Expressions move the face and do not tear it. */
    const smiling = head.evalSurface(P, 0.5 + face.F.lipHalfS * 0.9, face.F.mouthT,
      { smile: 1, concern: 0, squint: 0 }, []);
    const neutral = at(0.5 + face.F.lipHalfS * 0.9, face.F.mouthT);
    check(smiling[1] > neutral[1] + 0.005, 'a smile lifts the corner of the mouth');
    let maxDelta = 0;
    for (let i = 0; i < morph.length; i += 12) {
      maxDelta = Math.max(maxDelta, Math.abs(morph[i]), Math.abs(morph[i + 1]));
    }
    check(maxDelta > 0.004 && maxDelta < 0.15,
      `the smile morph is a movement, not a explosion (${maxDelta.toFixed(3)})`);

    /*
     * You have to be able to see the eyes.
     *
     * Both ways of getting this wrong look bad and only one of them is obvious.
     * Too far forward and the eyeball floats on the face like a bubble; too far
     * back and it vanishes behind the socket, leaving two dark holes on an
     * otherwise finished head — which is what happened here, and what a check
     * on the raw inset distance failed to catch because the number that matters
     * is the inset *relative to how deep the socket is*.
     *
     * So this asks the question directly: fire a ray at the eye from where the
     * player sits and see what it hits first.
     */
    const headMesh = head.buildHead(P).mesh;
    for (const side of [-1, 1]) {
      const anchor = head.eyeAnchor(P, side);
      const ray = {
        ox: anchor.centre[0], oy: anchor.centre[1], oz: 4,
        dx: 0, dy: 0, dz: -1,
      };
      const hit = {};
      const hitHead = math.rayMesh(ray, headMesh, hit);
      check(hitHead, 'a ray at the eye hits the head at all');
      /* Sphere intersection, analytically: the ray runs down -Z through the
       * eye's own centre line, so it enters at z = centre.z + r. */
      const tEye = 4 - (anchor.centre[2] + anchor.r);
      check(tEye < hit.t,
        `the eyeball is in front of the socket and visible (eye at ${tEye.toFixed(3)}, face at ${hit.t.toFixed(3)})`);
      /*
       * Being in front of the socket floor is not the same as bulging off the
       * face, because the socket floor is recessed on purpose. The face to
       * measure against is the one without a socket in it, which is a second
       * evaluation with the socket depth turned off.
       */
      const flat = head.evalSurface({ ...P, eyeDeep: 0 },
        0.5 + side * face.F.eyeS, face.F.eyeT, head.NEUTRAL_EXPR, []);
      const socketDepth = (flat[2] - (4 - hit.t)) * 115;
      const proud = (anchor.centre[2] + anchor.r - flat[2]) * 115;
      check(socketDepth > 2 && socketDepth < 14,
        `the socket is a socket (${socketDepth.toFixed(1)}mm deep)`);
      /* A cornea does stand proud of the bone around it — the lids are what
       * cover it — so this is a band, not a ceiling. */
      check(proud > -3 && proud < 6,
        `and the eye sits in it rather than on top of it (${proud.toFixed(1)}mm proud of the face)`);

      /*
       * The visible disc has to be big enough to read as an eye, and — the part
       * that is easy to miss — wide enough that some white shows around the
       * iris. Get that wrong and the geometry is defensible on every other
       * measure while the face has two black holes in it, because the whole
       * exposed cap is iris.
       */
      const centreDepth = flat[2] - anchor.centre[2];
      const capSin = Math.sqrt(Math.max(0, 1 - (centreDepth / anchor.r) ** 2));
      const capMm = capSin * anchor.r * 2 * 115;
      check(capMm > 14, `and shows a disc you can see (${capMm.toFixed(1)}mm across)`);
      /* A ring of white, not a hairline of it: at 1.25x the iris still reads as
       * a hole in the face from playing distance. */
      check(capSin > textures.IRIS_RADIUS * 1.8,
        `with sclera showing around the iris (cap ${capSin.toFixed(2)} vs iris ${textures.IRIS_RADIUS})`);

      /*
       * And the lids have to be out of the way of it. A lid swung back by less
       * than its own reach leaves its rim below the eye's forward axis — across
       * the pupil — and the customer looks half asleep at every camera angle.
       */
      const upperClear = head.LID.upperOpen - head.LID.upperTheta;
      const lowerClear = head.LID.lowerOpen - head.LID.lowerTheta;
      check(upperClear > 0.12,
        `the open upper lid clears the pupil (${(upperClear * 57.3).toFixed(0)} degrees above centre)`);
      check(lowerClear > 0.12,
        `the open lower lid clears the pupil (${(lowerClear * 57.3).toFixed(0)} degrees below centre)`);
      /* But not so far back that the eye has no lids on it at all. */
      const capAngle = Math.asin(Math.min(1, capSin));
      check(upperClear < capAngle && lowerClear < capAngle,
        'and both still overlap the visible eye rather than sitting off it');
    }

    /* Two different faces are actually different. */
    const P2 = head.faceParams(rng.makeRng(99));
    const other = head.evalSurface(P2, 0.5, face.F.chinT, head.NEUTRAL_EXPR, []);
    check(Math.abs(other[1] - chin[1]) + Math.abs(other[2] - chin[2]) > 0.002,
      'two seeds produce two different chins');
  }

  /* ======================================================== catalogue == */

  {
    const { PRODUCTS, CATEGORIES, FINISH_HE, FAMILY_HE } = products;
    const ids = new Set();
    const shadeIds = new Set();
    for (const p of PRODUCTS) {
      check(!ids.has(p.id), `product id "${p.id}" is unique`);
      ids.add(p.id);
      check(!!CATEGORIES[p.cat], `product "${p.id}" has a known category`);
      check(!!FINISH_HE[p.finish], `product "${p.id}" has a named finish`);
      check(p.shades.length > 0, `product "${p.id}" has at least one shade`);
      check(p.price >= 0, `product "${p.id}" has a price`);
      for (const s of p.shades) {
        check(!shadeIds.has(s.id), `shade id "${s.id}" is unique`);
        shadeIds.add(s.id);
        /* hexToRgb throws on a malformed colour, which is what we want: a typo
         * in the catalogue should stop the build, not ship a black lipstick. */
        const c = color.hexToRgb(s.hex);
        check(c.every((v) => v >= 0 && v <= 1), `shade "${s.id}" is a real colour`);
        check(!!FAMILY_HE[s.family], `shade "${s.id}" is in a named colour family`);
      }
    }

    /* The complexion ramp must cover every skin tone a customer can have,
     * closely enough that a careful player can find a match. Without this the
     * shade mechanic is unwinnable for whoever is at the ends of the range. */
    const people = await load('data/people.js');
    for (const tone of people.SKIN_TONES) {
      /* The undertone written next to a skin tone has to be the undertone that
       * colour actually has, or the game tells the player one thing and scores
       * them on another. */
      check(color.undertone(color.hexToRgb(tone.hex)) === tone.tone,
        `"${tone.he}" is labelled with the undertone it has`);
      const skin = color.hexToRgb(tone.hex);
      let best = Infinity;
      for (const p of PRODUCTS) {
        if (p.cat !== 'foundation') continue;
        for (const s of p.shades) best = Math.min(best, color.deltaE(color.hexToRgb(s.hex), skin));
      }
      check(best < 6.5, `a foundation exists for "${tone.he}" (best ΔE ${best.toFixed(1)})`);
    }

    /* And a wrong shade must be findably wrong: if every shade were within the
     * "perfect" threshold there would be nothing to get right. */
    const fm = products.product('found-matte').shades;
    check(color.deltaE(color.hexToRgb(fm[0].hex), color.hexToRgb(fm[fm.length - 1].hex)) > 40,
      'the foundation range spans a real distance');

    check(products.zoneOf(products.product('lip-matte')) === 'lip', 'a lipstick goes on the lips');
    check(products.zoneOf(products.product('mascara')) === 'lash', 'mascara goes on the lashes');
    check(products.zoneOf(products.product('blush-powder')) === 'cheek', 'blusher goes on the cheeks');
    check(products.product('wipe').erase === true, 'the remover erases');
  }

  /* ============================================================ looks == */

  {
    for (const l of looks.LOOKS) {
      check(l.wants.length >= 3, `look "${l.id}" asks for enough to be a look`);
      check(l.pay > 0, `look "${l.id}" pays`);
      for (const w of l.wants) {
        const stock = products.byCategory(w.cat);
        check(stock.length > 0, `look "${l.id}" wants ${w.cat}, and the shop stocks it`);
        if (w.finish) {
          const ok = stock.some((p) => [].concat(w.finish).includes(p.finish));
          check(ok, `look "${l.id}" can be filled with a ${[].concat(w.finish).join('/')} ${w.cat}`);
        }
        if (w.family) {
          const ok = stock.some((p) => p.shades.some((s) => [].concat(w.family).includes(s.family)));
          check(ok, `look "${l.id}" can be filled with a ${[].concat(w.family).join('/')} ${w.cat}`);
        }
        /* A want that also appears on the avoid list with the same finish is
         * an unwinnable request. */
        const contradiction = l.avoid.some((a) => a.cat === w.cat && !a.coverage
          && (!a.finish || (w.finish && [].concat(w.finish).length === 1 && w.finish[0] === a.finish))
          && !a.family);
        check(!contradiction, `look "${l.id}" does not both want and forbid ${w.cat}`);
      }
    }
    const covered = new Set(looks.requestedCategories());
    check(covered.has('lipstick') && covered.has('foundation'),
      'the looks between them exercise the two categories the game is about');
  }

  /* ======================================================== customers == */

  {
    const a = customerMod.generateCustomer(12345, { day: 3 });
    const b = customerMod.generateCustomer(12345, { day: 3 });
    check(a.name === b.name && a.lookId === b.lookId && a.tone.hex === b.tone.hex,
      'a customer is a pure function of her seed');
    check(a.face.jaw === b.face.jaw, 'so is her face');

    /* The preference must be reachable: it has to name a category she asked
     * for, or the player is guessing. */
    let reachable = 0;
    for (let i = 0; i < 200; i++) {
      const c = customerMod.generateCustomer(9000 + i, { day: 5 });
      if (c.look.wants.some((w) => w.cat === c.prefs.cat)) reachable++;
      check(c.patience > 20, `customer ${i} has a workable amount of patience`);
    }
    check(reachable === 200, 'every customer prefers something she actually asked for');

    /* Difficulty ramps. Day one must not hand out a bride. */
    let day1Max = 0, day9Max = 0;
    for (let i = 0; i < 120; i++) {
      day1Max = Math.max(day1Max, customerMod.generateCustomer(500 + i, { day: 1 }).look.difficulty);
      day9Max = Math.max(day9Max, customerMod.generateCustomer(500 + i, { day: 9 }).look.difficulty);
    }
    check(day1Max <= 2, `day one stays easy (hardest ${day1Max})`);
    check(day9Max >= 4, `later days get hard (hardest ${day9Max})`);

    /* Arrival makeup: some, not all. */
    let bare = 0;
    for (let i = 0; i < 200; i++) {
      if (customerMod.generateCustomer(7000 + i, { day: 4 }).arrival.length === 0) bare++;
    }
    check(bare > 40 && bare < 160, `some customers arrive bare and some do not (${bare}/200)`);

    /* Affinity does what its name says. */
    const c = customerMod.generateCustomer(31337, { day: 4 });
    const wanted = c.look.wants.find((w) => w.cat === 'lipstick');
    if (wanted) {
      const good = products.byCategory('lipstick')
        .find((p) => !wanted.finish || [].concat(wanted.finish).includes(p.finish));
      const bad = products.byCategory('lipstick')
        .find((p) => wanted.finish && !([].concat(wanted.finish).includes(p.finish)));
      if (good && bad) {
        const gi = { product: good, shade: good.shades[0] };
        const bi = { product: bad, shade: bad.shades[0] };
        check(customerMod.affinity(c, gi) > customerMod.affinity(c, bi),
          'she prefers the finish she asked for');
      }
    }
    const matched = customerMod.closestShade(products.product('found-matte').shades, c.skin);
    const others = products.product('found-matte').shades.filter((s) => s.id !== matched.id);
    const mi = { product: products.product('found-matte'), shade: matched };
    const wi = { product: products.product('found-matte'), shade: others[others.length - 1] };
    check(customerMod.affinity(c, mi) > customerMod.affinity(c, wi),
      'she prefers the base that matches her skin');
  }

  /* ============================================================ paint == */

  {
    const gl = stubGl();
    const masks = face.buildMasks(256);
    const paint = new paintMod.PaintLayer(gl, null, 512, masks);
    const lipstick = products.productShade('lip-matte', 'lm-red');

    const zoneCoverage = (p, z) => p.stats()[z].coverage;
    check(zoneCoverage(paint, 'lip') < 0.001, 'a fresh face has nothing on it');

    /* One dab in the middle of the mouth. */
    paint.splat(0.5, face.F.mouthT, lipstick, 1);
    check(zoneCoverage(paint, 'lip') > 0.02, 'a dab of lipstick lands on the lips');
    check(zoneCoverage(paint, 'cheek') < 0.005, 'and not on the cheeks');
    check(zoneCoverage(paint, 'lid') < 0.005, 'and not on the eyelids');

    /* Layering builds. Two passes must reach further than one, and neither may
     * exceed full coverage. */
    const after1 = zoneCoverage(paint, 'lip');
    paint.splat(0.5, face.F.mouthT, lipstick, 1);
    const after2 = zoneCoverage(paint, 'lip');
    check(after2 > after1, 'a second pass builds on the first');
    for (let i = 0; i < 30; i++) paint.splat(0.5, face.F.mouthT, lipstick, 1);
    check(zoneCoverage(paint, 'lip') <= 1.0001, 'coverage never exceeds one');

    /* The colour that comes back out is the colour that went on. */
    const stats = paint.stats();
    const measured = color.hexToRgb(stats.lip.hex);
    check(color.deltaE(measured, color.hexToRgb('#b81f2b')) < 12,
      `the lips measure as the shade applied (ΔE ${color.deltaE(measured, color.hexToRgb('#b81f2b')).toFixed(1)})`);
    check(stats.lip.gloss < 0.2, 'a matte lipstick reads as matte');

    /* A gloss over it changes the finish without repainting the colour — the
     * behaviour the separate fx buffer exists for. */
    const gloss = products.productShade('gloss', 'gl-clear');
    const beforeHex = stats.lip.hex;
    for (let i = 0; i < 8; i++) paint.splat(0.5, face.F.mouthT, gloss, 1);
    const after = paint.stats().lip;
    check(after.gloss > 0.5, 'a clear gloss makes the lips shine');
    check(color.deltaE(color.hexToRgb(after.hex), color.hexToRgb(beforeHex)) < 14,
      'and does not wash the colour out');

    /* The remover takes both away. This is the check that caught a wipe which
     * cleared the colour and left the shine behind. */
    const wipe = products.productShade('wipe', 'wipe');
    for (let i = 0; i < 40; i++) paint.splat(0.5, face.F.mouthT, wipe, 1);
    const wiped = paint.stats().lip;
    check(wiped.coverage < 0.06, `the remover clears the colour (${wiped.coverage.toFixed(3)})`);
    check(wiped.gloss < 0.12, 'and the shine with it');

    /* Nothing may be painted where there is no face. */
    const clean = new paintMod.PaintLayer(gl, null, 512, masks);
    const total = clean.splat(0.02, 0.02, lipstick, 1);
    check(total === 0, 'the brush cannot paint the back of the head');

    /* Assist. At full assist a stroke aimed off the lips leaves nothing behind;
     * at zero it makes a mess, which is what the setting is for. */
    const strict = new paintMod.PaintLayer(gl, null, 512, masks);
    strict.assist = 1;
    strict.splat(0.5, face.F.chinT, lipstick, 1);
    const loose = new paintMod.PaintLayer(gl, null, 512, masks);
    loose.assist = 0;
    loose.splat(0.5, face.F.chinT, lipstick, 1);
    const strictLedger = [...strict.ledger.values()][0];
    const looseLedger = [...loose.ledger.values()][0];
    check(!strictLedger || strictLedger.amount < 0.5,
      'full assist keeps lipstick off the chin');
    check(looseLedger && looseLedger.amount > 0.5, 'no assist lets it land there');
    check(looseLedger.offZone > 0, 'and records it as mess');

    /* Arrival makeup goes through the same brush and is not billed. */
    const arriving = customerMod.generateCustomer(24680, { day: 5 });
    const p2 = new paintMod.PaintLayer(gl, null, 512, masks);
    customerMod.applyArrival(p2, arriving);
    check(p2.applied().length === 0, 'nothing the customer arrived in is charged for');
    if (arriving.arrival.length) {
      check(p2.ledger.size > 0, 'but it is on her face');
    }
  }

  /* ========================================================== scoring == */

  {
    const gl = stubGl();
    const masks = face.buildMasks(256);
    const c = customerMod.generateCustomer(555001, { day: 6 });

    /* Fill everything the look asks for, choosing correctly each time. */
    const fill = (paint, correct) => {
      for (const want of c.look.wants) {
        const stock = products.byCategory(want.cat);
        let p = stock[0];
        if (want.finish) {
          const match = stock.find((x) => [].concat(want.finish).includes(x.finish));
          const miss = stock.find((x) => ![].concat(want.finish).includes(x.finish));
          p = correct ? (match || p) : (miss || match || p);
        }
        let s = p.shades[0];
        if (want.family) {
          const match = p.shades.find((x) => [].concat(want.family).includes(x.family));
          const miss = p.shades.find((x) => ![].concat(want.family).includes(x.family));
          s = correct ? (match || s) : (miss || s);
        }
        if (p.cat === 'foundation') {
          s = correct ? customerMod.closestShade(p.shades, c.skin)
            : p.shades[(p.shades.length - 1) - p.shades.indexOf(customerMod.closestShade(p.shades, c.skin))];
        }
        customerMod.fillZone(paint, { product: p, shade: s }, want.coverage + 0.15, null);
      }
    };

    const good = new paintMod.PaintLayer(gl, null, 512, masks);
    fill(good, true);
    const goodScore = scoring.scoreCustomer(c, good);

    const bad = new paintMod.PaintLayer(gl, null, 512, masks);
    fill(bad, false);
    const badScore = scoring.scoreCustomer(c, bad);

    const empty = new paintMod.PaintLayer(gl, null, 512, masks);
    const emptyScore = scoring.scoreCustomer(c, empty);

    check(goodScore.score > badScore.score,
      `doing what she asked beats doing the wrong thing (${goodScore.score} vs ${badScore.score})`);
    check(badScore.score > emptyScore.score,
      `doing something beats doing nothing (${badScore.score} vs ${emptyScore.score})`);
    check(emptyScore.score < 20, `a bare face scores badly (${emptyScore.score})`);
    check(goodScore.score >= 70, `a careful job scores well (${goodScore.score})`);
    check(goodScore.stars >= 3 && emptyScore.stars <= 1, 'the stars agree with the score');
    check(goodScore.parts.length === c.look.wants.length,
      'the breakdown explains every line of the request');
    check(emptyScore.parts.every((p) => p.note === 'לא הושם בכלל'),
      'and says plainly what was missing');

    /* Adding something she asked not to have must cost. */
    const violating = new paintMod.PaintLayer(gl, null, 512, masks);
    fill(violating, true);
    const ban = c.look.avoid[0];
    if (ban) {
      const stock = products.byCategory(ban.cat);
      const p = stock.find((x) => !ban.finish || x.finish === ban.finish) || stock[0];
      const s = ban.family
        ? (p.shades.find((x) => [].concat(ban.family).includes(x.family)) || p.shades[0])
        : p.shades[0];
      customerMod.fillZone(violating, { product: p, shade: s }, 0.9, null);
      const violated = scoring.scoreCustomer(c, violating);
      check(violated.violations.length > 0, 'the scoring notices what she asked not to have');
      check(violated.score < goodScore.score,
        `and it costs her opinion (${violated.score} vs ${goodScore.score})`);
    }

    /* The till: better work pays more, and reading her right pays more again. */
    const noMark = scoring.till(c, goodScore, null);
    const rightMark = scoring.till(c, goodScore, { bonus: 1 });
    const badTill = scoring.till(c, badScore, null);
    check(noMark.service > badTill.service, 'a better result earns a bigger service fee');
    check(rightMark.tip > noMark.tip, 'reading the customer right earns a bigger tip');
    check(noMark.take === noMark.products + noMark.service + noMark.tip,
      'the total adds up');
    check(noMark.lines.length > 0, 'the receipt lists what was used');

    /* The preference card. */
    const marking = scoring.scoreMarking(c, good, null, null);
    if (marking.favourite) {
      const right = scoring.scoreMarking(c, good, marking.favourite.key, c.prefs.finish);
      check(right.itemRight, 'marking her actual favourite is marked correct');
      check(right.bonus > marking.bonus, 'and is worth more than marking nothing');
      const wrong = scoring.scoreMarking(c, good, 'not-a-real-key', 'not-a-finish');
      check(!wrong.itemRight && !wrong.finishRight, 'a wrong mark is marked wrong');
    }
  }

  /* ============================================================ shift == */

  {
    const s = new shiftMod.Shift({ saveSeed: 7, day: 1 });
    check(s.customersToday >= 3, 'a day has customers in it');
    check(s.target > 0, 'a day has a target');

    const first = s.next();
    const again = new shiftMod.Shift({ saveSeed: 7, day: 1 }).next();
    check(first.seed === again.seed, 'the same save gives the same queue');

    /* Nobody can return before anybody has been served. */
    check(!first.returning, 'the first customer of a save is not a regular');

    let guard = 0;
    while (!s.done && guard++ < 20) {
      s.next();
      s.complete({ stars: 4, score: 80, applied: [] }, { itemRight: true, favourite: { key: 'k' } },
        { take: 300, lines: [], products: 0, service: 0, tip: 0, total: 0 });
    }
    check(s.done, 'a day ends');
    check(s.money > 0, 'and the money went in the till');
    const summary = s.endDay();
    check(summary.day === 1 && s.day === 2, 'the next day starts');
    check(s.index === 0, 'with a fresh queue');

    /* Now that somebody has been served and marked right, regulars can come
     * back — and only ones actually served. */
    let seenReturning = false;
    for (let i = 0; i < 40 && !seenReturning; i++) {
      const t = new shiftMod.Shift(s.toSave());
      t.day = 4 + i;
      const c = t.next();
      if (c.returning) {
        seenReturning = true;
        check(s.served.some((r) => r.seed === c.seed), 'a returning customer is somebody real');
      }
    }
    check(seenReturning, 'regulars do come back once there are any');

    /* A save round-trips. */
    const saved = JSON.parse(JSON.stringify(s.toSave()));
    const restored = new shiftMod.Shift(saved);
    check(restored.day === s.day && restored.money === s.money,
      'a save reloads to the same shift');
    check(restored.served.length <= 50, 'the save does not grow without bound');
  }

  /* ============================================================= shop == */

  {
    const groups = props.buildShop(rng.makeRng('audit-shop'));
    check(groups.length > 8, 'the shop is built out of several materials');
    let tris = 0;
    for (const g of groups) {
      check(g.mesh.positions.every(Number.isFinite), `"${g.name}" has real geometry`);
      tris += g.mesh.triangles;
    }
    check(tris > 5000, `the shop has enough geometry to look like one (${tris} triangles)`);
    check(props.SHOP.counterTopY > 0.8 && props.SHOP.counterTopY < 1.2,
      'the counter is at counter height');
    check(props.SHOP.customerHeadY > props.SHOP.counterTopY,
      'the customer is above the counter, not inside it');

    const tray = props.buildTray([
      products.product('lip-matte'), products.product('powder'),
    ]);
    check(tray.length === 2, 'the tray holds what was put on it');
    check(tray.every((t) => t.mesh.triangles > 0), 'and each item is a real object');
  }

  /* ============================================================ report == */

  if (process.argv.includes('--verbose')) for (const n of notes) console.log(n);
  console.log(`\n${checks} checks, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error('FAIL: ' + f);
    process.exit(1);
  }
  console.log('makeup audit passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
