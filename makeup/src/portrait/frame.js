/*
 * frame.js — fitting a photograph into face space.
 *
 * The 3D counter and a photograph have nothing in common except the one thing
 * that matters: both are a face, and everything this game knows about faces is
 * written in the (s, t) coordinates of `model/face.js`. Where a lipstick may
 * go, how much of the lid is covered, what counts as mess — all of it is a
 * formula in (s, t). So a photograph does not need its own masks, its own
 * brushes or its own scoring. It needs a map.
 *
 * That map is built from landmarks a human clicked once: the pupils, the
 * corners of the mouth, the tip of the nose, the chin. Each landmark is a
 * *pair* — a place in the picture and the place in face space it stands for —
 * and a monotone curve through those pairs is the map. Feed it the middle of
 * the photographed mouth and it returns F.mouthT, which is what the lip mask
 * is drawn around; feed it a pixel on the cheek and it returns the (s, t) the
 * blusher mask is a function of.
 *
 * Three properties are worth stating because the rest of the file exists to
 * keep them:
 *
 *   Monotone. The map may stretch and squash but must never fold. A fold puts
 *   two different parts of the face at the same (s, t) and the lipstick appears
 *   in two places. Fritsch-Carlson gives monotone by construction, and the
 *   landmark pairs are pooled into monotone order before they reach it.
 *
 *   Separable. One curve for x, one for y, after rotating the picture so the
 *   eyes are level. A full 2D warp would fit better and needs forty landmarks
 *   and a triangulation; two curves need twenty clicks and cannot fold. The
 *   error it leaves — the face narrows towards the chin faster than a single x
 *   curve can express — is absorbed by the outline, below, which is what stops
 *   foundation at the jaw.
 *
 *   Reversible. `faceToCrop` exists so the game can put a hint on the lips
 *   without knowing anything about photographs.
 *
 * Coordinates, and there are four of them, so they are named:
 *
 *   image     u, v — 0..1 across and down the photograph as stored.
 *   pixel     the same thing multiplied by the photograph's size, which is the
 *             only space in which "rotate" and "distance" mean anything.
 *   rotated   pixel space turned so the eye line is horizontal, and the space
 *             the crop is axis-aligned to — a picture taken at a tilt is shown
 *             upright.
 *   crop      0..1 across the square window on the face. Masks and the paint
 *             layer live here; this is the space the player's pointer lands in.
 */

import { clamp, smoothstep } from '../core/math.js';
import { F } from '../model/face.js';
import {
  LANDMARKS, LANDMARK_KEYS, PHOTO_EDGE_S, VERTICAL_ANCHORS, horizontalAnchors,
  fitMonotone, invertMonotone, orderProblems,
} from '../model/landmarks.js';

/* Re-exported so the marking page and the audit can ask the photographic side
 * for its own vocabulary without knowing that it shares one with the mesh. */
export { LANDMARKS, LANDMARK_KEYS };
export const FACE_EDGE_S = PHOTO_EDGE_S;

/*
 * How much of the crop window the face fills, across and down.
 *
 * The crop is square and screens are not, and the vertical number is set by the
 * worst case rather than the nicest: on a 16:9 laptop a square image shows only
 * 56% of its own height, so a face any taller than that in the crop arrives
 * with its chin off the bottom of the screen. A face is about a third taller
 * than it is wide, so the height is nearly always the binding constraint and
 * the horizontal number rarely does anything — it is there for the unusually
 * wide face, which would otherwise touch both edges.
 *
 * What the margin costs is resolution: the face ends up across about 40% of the
 * paint texture rather than the 72% it gets on the modelled head. `brushScale`
 * hands that back to the brushes so that a lipstick still covers a lip.
 */
const FACE_FRACTION_X = 0.68;
const FACE_FRACTION_Y = 0.56;

/* ------------------------------------------------------------------ *
 * Landmarks in, problems out
 * ------------------------------------------------------------------ */

/*
 * Every avatar goes through this before it is allowed near the renderer. A
 * missing landmark is a crash three modules later inside a texture upload; a
 * mirrored one is a face whose lipstick goes on its forehead and no error at
 * all. Both are cheap to catch here and expensive to debug anywhere else.
 */
export function validateAvatar(avatar) {
  const bad = [];
  if (!avatar || typeof avatar !== 'object') return ['avatar is not an object'];
  if (!(avatar.width > 0) || !(avatar.height > 0)) bad.push('width/height missing');
  const lm = avatar.landmarks || {};
  for (const key of LANDMARK_KEYS) {
    const p = lm[key];
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      bad.push(`landmark ${key} missing or malformed`);
    } else if (p[0] < -0.05 || p[0] > 1.05 || p[1] < -0.05 || p[1] > 1.05) {
      bad.push(`landmark ${key} outside the picture`);
    }
  }
  if (bad.length) return bad;

  /* Orientation. Anything below this is a picture marked back to front, and it
   * produces a face that looks fine until the first stroke. */
  if (lm.eyeR[0] <= lm.eyeL[0]) bad.push('eyeR must be to the right of eyeL in the picture');
  if (lm.mouthR[0] <= lm.mouthL[0]) bad.push('mouthR must be to the right of mouthL');
  if (lm.faceR[0] <= lm.faceL[0]) bad.push('faceR must be to the right of faceL');
  if (lm.eyeOuterL[0] >= lm.eyeL[0]) bad.push('eyeOuterL must be outside eyeL');
  if (lm.eyeOuterR[0] <= lm.eyeR[0]) bad.push('eyeOuterR must be outside eyeR');

  /* And the order a face has its features in, which is shared with the mesh
   * side: y runs down a picture, so "below" is a larger number here. */
  bad.push(...orderProblems((key) => lm[key][1]));
  return bad;
}

function median3(a, b, c) {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

/* ------------------------------------------------------------------ *
 * The frame
 * ------------------------------------------------------------------ */

/*
 * Build every map an avatar needs, once. Nothing in here runs per frame or per
 * stroke: the masks are rasterised through it at load and the pointer path uses
 * two multiplications and two curve evaluations.
 */
export function makeFrame(avatar) {
  const problems = validateAvatar(avatar);
  if (problems.length) {
    throw new Error(`avatar "${avatar && avatar.id}" is not usable:\n  ` + problems.join('\n  '));
  }

  const W = avatar.width, H = avatar.height;
  const lm = avatar.landmarks;

  /* Into pixels, because the rotation that follows is only a rotation if both
   * axes are the same unit — on a 3:4 photograph a "rotation" applied to
   * normalised uv is a shear, and the eye line comes out crooked in the
   * direction nobody thinks to check. */
  const P = {};
  for (const key of LANDMARK_KEYS) P[key] = [lm[key][0] * W, lm[key][1] * H];

  const eyeMid = [(P.eyeL[0] + P.eyeR[0]) / 2, (P.eyeL[1] + P.eyeR[1]) / 2];
  const tilt = Math.atan2(P.eyeR[1] - P.eyeL[1], P.eyeR[0] - P.eyeL[0]);
  const ct = Math.cos(tilt), st = Math.sin(tilt);

  /* Pixel -> rotated, about the midpoint between the pupils. */
  const rotX = (x, y) => (x - eyeMid[0]) * ct + (y - eyeMid[1]) * st + eyeMid[0];
  const rotY = (x, y) => -(x - eyeMid[0]) * st + (y - eyeMid[1]) * ct + eyeMid[1];
  /* And back. */
  const unrotX = (x, y) => (x - eyeMid[0]) * ct - (y - eyeMid[1]) * st + eyeMid[0];
  const unrotY = (x, y) => (x - eyeMid[0]) * st + (y - eyeMid[1]) * ct + eyeMid[1];

  const R = {};
  for (const key of LANDMARK_KEYS) R[key] = [rotX(...P[key]), rotY(...P[key])];

  /*
   * The centre line. Five estimates, weighted by how reliably each one sits on
   * it: the pupils are the steadiest pair on a face, the chin wanders with the
   * jaw and with any turn of the head.
   */
  const centreOf = [
    [(R.eyeL[0] + R.eyeR[0]) / 2, 0.30],
    [(R.mouthL[0] + R.mouthR[0]) / 2, 0.22],
    [(R.noseWingL[0] + R.noseWingR[0]) / 2, 0.18],
    [(R.faceL[0] + R.faceR[0]) / 2, 0.15],
    [R.noseTip[0], 0.10],
    [R.chin[0], 0.05],
  ];
  let cx = 0, wsum = 0;
  for (const [v, w] of centreOf) { cx += v * w; wsum += w; }
  cx /= wsum;

  /*
   * Two half-maps, one per side, sharing the centre line. Independent sides
   * are not symmetry-breaking for its own sake: a portrait is never perfectly
   * square to the camera, and the small yaw that survives shows up as one cheek
   * being wider in the picture than the other. Two maps absorb it. One map
   * would push the whole face a few millimetres to one side and put every
   * blusher slightly off the cheekbone it belongs on.
   */
  const halfMap = (side) => fitMonotone([
    [0, 0],
    ...horizontalAnchors(FACE_EDGE_S).map((a) => {
      const mark = R[a.key + (side < 0 ? 'L' : 'R')];
      return [Math.abs(mark[0] - cx), a.s];
    }),
  ]);
  const mapL = halfMap(-1);
  const mapR = halfMap(1);

  const mapY = fitMonotone(VERTICAL_ANCHORS.map((a) => [
    a.keys.reduce((n, k) => n + R[k][1], 0) / a.keys.length, a.t,
  ]));

  /* ---------------------------------------------------------------- *
   * The crop
   * ---------------------------------------------------------------- */

  const faceWidth = R.faceR[0] - R.faceL[0];
  const faceHeight = R.chin[1] - R.hairline[1];
  /* Square, and large enough for whichever of the two is the binding
   * constraint — a long face crops on its height, a wide one on its width. */
  const cropSize = Math.max(faceWidth / FACE_FRACTION_X, faceHeight / FACE_FRACTION_Y);
  const cropCy = (R.hairline[1] + R.chin[1]) / 2;
  const cropX0 = cx - cropSize / 2;
  const cropY0 = cropCy - cropSize / 2;

  /* ---------------------------------------------------------------- *
   * The outline
   * ---------------------------------------------------------------- */

  const cheekY = (R.faceL[1] + R.faceR[1]) / 2;
  const outRx = faceWidth / 2 * 1.03;
  const feather = Math.max(1e-6, outRx * 0.055);

  /*
   * The shape of a face, as a width that varies with height. Below the
   * cheekbones it closes towards the chin; above them it stays nearly full
   * across the temples and rounds off at the hairline, where it is cut — hair
   * is not skin and foundation does not go on it.
   *
   * This is a field rather than a traced polygon because it is derived from
   * marks that already exist. An avatar that wants the real jaw, a fringe, or a
   * hand against the cheek can supply `outline` and get exactly that instead.
   */
  const impliedOutline = (x, y) => {
    let half;
    if (y >= cheekY) {
      const u = (y - cheekY) / Math.max(1e-6, R.chin[1] - cheekY);
      half = outRx * Math.pow(Math.max(0, 1 - u * u), 0.45);
    } else {
      const span = Math.max(1e-6, (cheekY - R.hairline[1]) / 0.82);
      const v = (cheekY - y) / span;
      half = outRx * Math.pow(Math.max(0, 1 - v * v), 0.30);
    }
    if (half <= 0) return 0;
    const across = 1 - smoothstep(half - feather, half, Math.abs(x - cx));
    const above = smoothstep(R.hairline[1] - feather * 1.2, R.hairline[1] + feather * 0.4, y);
    return across * above;
  };

  /* A traced outline, if there is one. Point-in-polygon for the side of it and
   * distance to the nearest edge for the feather, so a hand-drawn jaw gets the
   * same soft edge as the implied one rather than a staircase. */
  let polygon = null;
  if (Array.isArray(avatar.outline) && avatar.outline.length >= 3) {
    polygon = avatar.outline.map(([u, v]) => {
      const px = u * W, py = v * H;
      return [rotX(px, py), rotY(px, py)];
    });
  }

  const polyOutline = (x, y) => {
    let inside = false, best = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      const dx = xj - xi, dy = yj - yi;
      const len2 = dx * dx + dy * dy;
      const h = len2 > 0 ? clamp(((x - xi) * dx + (y - yi) * dy) / len2, 0, 1) : 0;
      best = Math.min(best, Math.hypot(x - (xi + dx * h), y - (yi + dy * h)));
    }
    if (!inside) return 0;
    return smoothstep(0, feather, best);
  };

  const outlineRot = polygon ? polyOutline : impliedOutline;

  /* ---------------------------------------------------------------- *
   * Scale
   * ---------------------------------------------------------------- */

  /*
   * How much bigger a feature is in the crop than in face space. The brush
   * radii in `paint.js` are fractions of the texture — a lipstick is 0.030 of
   * it — and they were tuned against the face-space layout, so without this a
   * lipstick on a photograph is a third too wide or too narrow depending on how
   * the picture was framed.
   *
   * Three features, and the median of them, because the warp is not linear:
   * measured on the mouth alone the answer is a few percent off what the eyes
   * say, and the median lands between them without letting one bad mark decide.
   */
  const brushScale = median3(
    (R.mouthR[0] - R.mouthL[0]) / cropSize / (2 * F.lipHalfS),
    (R.eyeR[0] - R.eyeL[0]) / cropSize / (2 * F.eyeS),
    faceWidth / cropSize / (2 * FACE_EDGE_S));

  /* ---------------------------------------------------------------- *
   * The public map
   * ---------------------------------------------------------------- */

  const rotToFace = (x, y) => {
    const d = x - cx;
    const s = d < 0 ? 0.5 - mapL(-d) : 0.5 + mapR(d);
    return [s, mapY(y)];
  };

  const cropToRot = (p, q) => [cropX0 + p * cropSize, cropY0 + q * cropSize];

  const frame = {
    avatar,
    width: W,
    height: H,
    tilt,
    brushScale,
    /*
     * The crop as a canvas transform: the six numbers that draw the photograph
     * into a square of `size` pixels, rotated upright and cut to the face.
     *
     * Baking the crop once, rather than sampling the photograph through a
     * rotation in the shader, is what lets everything downstream be a
     * one-to-one lookup: photo texel, mask texel and paint texel are the same
     * texel. It also means the tilt is paid for once at load instead of per
     * fragment per frame, and that a picture taken at an angle is displayed
     * straight without the compositor knowing there was an angle.
     */
    cropTransform(size) {
      const k = size / cropSize;
      return {
        a: k * ct, b: -k * st,
        c: k * st, d: k * ct,
        e: k * (eyeMid[0] * (1 - ct) - eyeMid[1] * st - cropX0),
        f: k * (eyeMid[0] * st + eyeMid[1] * (1 - ct) - cropY0),
      };
    },

    /* crop uv -> face space. The one every mask is built through. */
    cropToFace(p, q) {
      const [x, y] = cropToRot(p, q);
      return rotToFace(x, y);
    },

    /* face space -> crop uv, by inverting the same curves. Used to put a hint
     * where the lips are without the UI knowing what a photograph is. */
    faceToCrop(s, t) {
      const d = Math.abs(s - 0.5);
      const map = s < 0.5 ? mapL : mapR;
      const reach = invertMonotone(map, d, 0, cropSize * 2);
      const x = s < 0.5 ? cx - reach : cx + reach;
      const y = invertMonotone(mapY, t, cropY0 - cropSize, cropY0 + cropSize * 2);
      return [(x - cropX0) / cropSize, (y - cropY0) / cropSize];
    },

    /* image uv -> crop uv, for anything that starts from the photograph. */
    imageToCrop(u, v) {
      const x = rotX(u * W, v * H), y = rotY(u * W, v * H);
      return [(x - cropX0) / cropSize, (y - cropY0) / cropSize];
    },

    /* crop uv -> image uv, which is what the renderer samples the photo with
     * and what the marking tool draws its overlay through. */
    cropToImage(p, q) {
      const [x, y] = cropToRot(p, q);
      return [unrotX(x, y) / W, unrotY(x, y) / H];
    },

    /* 1 on the face, 0 off it, feathered across the edge. */
    outline(p, q) {
      const [x, y] = cropToRot(p, q);
      return outlineRot(x, y);
    },

    /* Where the landmarks ended up, in crop uv — the marking tool draws these
     * back over the photograph so a bad click is visible as a dot in the wrong
     * place rather than as a strange-looking mask. */
    marks() {
      const out = {};
      for (const key of LANDMARK_KEYS) {
        out[key] = [(R[key][0] - cropX0) / cropSize, (R[key][1] - cropY0) / cropSize];
      }
      return out;
    },
  };

  return frame;
}
