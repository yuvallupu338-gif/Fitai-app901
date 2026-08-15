/*
 * landmarks.js — the twenty points that tie a face to face space.
 *
 * A photograph and a downloaded head mesh have nothing in common, and the same
 * problem: face space says a lipstick goes at t = F.mouthT, and neither of them
 * knows where that is. Both answer it the same way — somebody marks twenty
 * places once, and a monotone curve through the marks is the map.
 *
 * So the marks live here rather than in either of them. What each landmark
 * *means* in face space is a statement about face space, and having the
 * photographic side and the mesh side each carry their own copy of it is how
 * they end up disagreeing about where a lip is by a percent and a half.
 *
 * The two consumers differ in exactly one place, and it is worth naming: the
 * silhouette. On a photograph the cheek is flat and fully visible to its edge;
 * on a head it is curving away, and the same mark means a different s. Both
 * numbers are here, next to each other, with the reason.
 */

import { F, faceU, monotoneMap } from './face.js';

/*
 * L and R are the *viewer's* left and right — the side of the face that appears
 * on the left of the picture, or of the screen with the head facing you. Not
 * the subject's own left, which is the opposite and has caused more
 * wrong-way-round faces than every other kind of marking mistake put together.
 * It also lines up with face space, where s < 0.5 is the viewer's left.
 */
export const LANDMARKS = [
  { key: 'hairline', he: 'קו השיער במרכז המצח', hint: 'איפה השיער מתחיל, בדיוק באמצע' },
  { key: 'browL', he: 'שיא הגבה — צד שמאל', hint: 'הנקודה הגבוהה של הקשת' },
  { key: 'browR', he: 'שיא הגבה — צד ימין', hint: 'הנקודה הגבוהה של הקשת' },
  { key: 'eyeTop', he: 'קצה העפעף העליון', hint: 'על קו הריסים העליון, במרכז העין' },
  { key: 'eyeL', he: 'אישון — עין שמאלית', hint: 'מרכז האישון' },
  { key: 'eyeR', he: 'אישון — עין ימנית', hint: 'מרכז האישון' },
  { key: 'eyeBottom', he: 'קצה העפעף התחתון', hint: 'על קו הריסים התחתון, באותה עין' },
  { key: 'eyeOuterL', he: 'זווית חיצונית — עין שמאלית', hint: 'הפינה הרחוקה מהאף' },
  { key: 'eyeOuterR', he: 'זווית חיצונית — עין ימנית', hint: 'הפינה הרחוקה מהאף' },
  { key: 'noseTip', he: 'קצה האף', hint: 'הנקודה הבולטת ביותר' },
  { key: 'noseWingL', he: 'כנף האף — צד שמאל', hint: 'הקצה הרחב של הנחיר' },
  { key: 'noseWingR', he: 'כנף האף — צד ימין', hint: 'הקצה הרחב של הנחיר' },
  { key: 'noseBase', he: 'בסיס האף', hint: 'מתחת לאף, במרכז' },
  { key: 'lipTop', he: 'שיא השפה העליונה', hint: 'אחת הפסגות של קשת קופידון' },
  { key: 'mouthL', he: 'זווית הפה — צד שמאל', hint: 'הפינה שבה השפתיים נפגשות' },
  { key: 'mouthR', he: 'זווית הפה — צד ימין', hint: 'הפינה שבה השפתיים נפגשות' },
  { key: 'lipBottom', he: 'קצה השפה התחתונה', hint: 'הגבול התחתון של השפה, במרכז' },
  { key: 'chin', he: 'קצה הסנטר', hint: 'הנקודה התחתונה של הפנים' },
  { key: 'faceL', he: 'קו הפנים — צד שמאל', hint: 'הצללית בגובה עצם הלחי' },
  { key: 'faceR', he: 'קו הפנים — צד ימין', hint: 'הצללית בגובה עצם הלחי' },
];

export const LANDMARK_KEYS = LANDMARKS.map((l) => l.key);

/* ------------------------------------------------------------------ *
 * Where each mark lands
 * ------------------------------------------------------------------ */

/*
 * The three vertical targets that are not landmarks in F but are derived from
 * the fields drawn around them, so a marked lip is the lip the mask paints:
 * `lipMask` reaches 0.040 above the mouth line at the bow and 0.055 below it,
 * and `browMask` arches a full 0.020 above browT at its peak — which is the
 * point the landmark asks for, so that is the number here.
 */
export const BROW_PEAK_T = F.browT - 0.020;
export const LIP_TOP_T = F.mouthT - 0.040;
export const LIP_BOTTOM_T = F.mouthT + 0.055;

/*
 * The silhouette, on a photograph.
 *
 * Face space runs the skin zone out to |s - 0.5| = 0.46 and feathers it from
 * 0.253 outwards, because on a head that band is curving away from the light. A
 * photograph is flat and its cheek is fully visible to the edge, so mapping the
 * marked silhouette to 0.46 would leave the outer third of every cheek with
 * half-strength foundation and no way to fix it.
 *
 * 0.36 puts the silhouette inside the feather instead: full coverage across the
 * central 70% of the face, tapering to about half at the jaw — which is where a
 * base is meant to fade anyway — and the traced outline is what actually stops
 * it going onto the background.
 */
export const PHOTO_EDGE_S = 0.360;

/*
 * faceU is `0.5 + 0.5·sign(d)·|d|^p` with d = 2(s - 0.5). The exponent is
 * private to face.js and there is no reason for a second copy of it to live
 * here, so it is measured off the function itself: faceU(0.75) = 0.5 + 0.5·0.5^p.
 */
export const U_POWER = Math.log(2 * (faceU(0.75) - 0.5)) / Math.log(0.5);

/*
 * The silhouette, on a head, as a distance from the centre line.
 *
 * Here it is not a judgement call, it is a fact about the parameterisation: the
 * outline of a head seen from the front is where the surface turns away from
 * the camera, which is a quarter turn of longitude from the centre line. Run
 * that back through the warp and it is the s the marked silhouette has to land
 * on — anything else and the whole side of the face is stretched or squashed
 * against the front of it.
 */
export const MESH_EDGE_S = 0.5 * Math.pow(0.5, 1 / U_POWER);

/* The inverse of the longitude warp, in closed form — the mesh side runs it for
 * every vertex of a forty-thousand-triangle head. */
export function faceUInverse(u) {
  const d = 2 * (u - 0.5);
  return 0.5 + 0.5 * Math.sign(d) * Math.pow(Math.abs(d), 1 / U_POWER);
}

/*
 * The vertical marks and the t each stands for, top of the head down. Both
 * consumers build their control points from this list and neither of them
 * writes a number.
 */
export const VERTICAL_ANCHORS = [
  { keys: ['hairline'], t: F.hairline },
  { keys: ['browL', 'browR'], t: BROW_PEAK_T },
  { keys: ['eyeTop'], t: F.lidTopT },
  { keys: ['eyeL', 'eyeR'], t: F.eyeT },
  { keys: ['eyeBottom'], t: F.lidBotT },
  { keys: ['noseTip'], t: F.noseTipT },
  { keys: ['noseBase'], t: F.noseBaseT },
  { keys: ['lipTop'], t: LIP_TOP_T },
  { keys: ['mouthL', 'mouthR'], t: F.mouthT },
  { keys: ['lipBottom'], t: LIP_BOTTOM_T },
  { keys: ['chin'], t: F.chinT },
];

/*
 * The horizontal marks, as a distance from the centre line and the |s - 0.5| it
 * stands for. `key` is the pair's stem: the mark itself is key + 'L' or 'R'.
 *
 * The inner corners of the eyes are deliberately absent. Face space puts them a
 * shade further out than the wing of the nose and a real face has it the other
 * way round; the difference is under a millimetre and invisible, but it is
 * enough to make a curve non-monotone, and the pupils are a steadier mark than
 * a tear duct anyway.
 */
export function horizontalAnchors(edgeS) {
  return [
    { key: 'noseWing', s: F.noseHalfS },
    { key: 'mouth', s: F.lipHalfS },
    { key: 'eye', s: F.eyeS },
    { key: 'eyeOuter', s: F.eyeS + F.eyeHalfS },
    { key: 'face', s: edgeS },
  ];
}

/* ------------------------------------------------------------------ *
 * Fitting
 * ------------------------------------------------------------------ */

/*
 * Sort the pairs and force them into strictly increasing order, merging any
 * that disagree into their average.
 *
 * They do disagree, and not only through bad marking: two landmarks a
 * millimetre apart on a real face can be the other way round in face space, and
 * a pair that crosses makes the curve fold. A fold puts one part of a face in
 * two places and the lipstick appears in both. Pooling adjacent violators is
 * the standard answer — it is the closest monotone sequence in the
 * least-squares sense, and it degrades a conflict into a slightly softer fit
 * instead of a crease.
 */
export function poolMonotone(pairs) {
  const sorted = pairs.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [x, y] of sorted) {
    let cur = { x, y, n: 1 };
    while (out.length) {
      const prev = out[out.length - 1];
      if (prev.x < cur.x - 1e-9 && prev.y < cur.y - 1e-9) break;
      out.pop();
      const n = prev.n + cur.n;
      cur = { x: (prev.x * prev.n + cur.x * cur.n) / n, y: (prev.y * prev.n + cur.y * cur.n) / n, n };
    }
    out.push(cur);
  }
  if (out.length < 2) {
    throw new Error('landmark curve collapsed to a point — the marks are unusable');
  }
  return [out.map((o) => o.x), out.map((o) => o.y)];
}

/* A monotone curve through pooled landmark pairs — the one operation both the
 * photograph and the mesh are built out of. */
export function fitMonotone(pairs) {
  return monotoneMap(...poolMonotone(pairs));
}

/* A monotone increasing function inverted by bisection. Forty iterations take a
 * double to the last bit it has. */
export function invertMonotone(fn, target, lo, hi) {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/*
 * The order a face has its features in, checked against the marks.
 *
 * Marked out of order they would still map — the pooling above silently merges
 * the offenders — but a mouth above a nose means the wrong point was clicked,
 * and quietly averaging it away hides that from whoever marked it. `axis` picks
 * the component to compare, so the same rules serve a picture (y down the
 * image) and a mesh (y up the model, hence the sign).
 */
export function orderProblems(get) {
  const bad = [];
  const rows = [
    ['hairline', get('hairline')],
    ['brow', (get('browL') + get('browR')) / 2],
    ['eye', (get('eyeL') + get('eyeR')) / 2],
    ['noseBase', get('noseBase')],
    ['mouth', (get('mouthL') + get('mouthR')) / 2],
    ['chin', get('chin')],
  ];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] <= rows[i - 1][1]) bad.push(`${rows[i][0]} is not below ${rows[i - 1][0]}`);
  }
  if (get('eyeTop') >= get('eyeBottom')) bad.push('eyeTop is not above eyeBottom');
  if (get('lipTop') >= get('lipBottom')) bad.push('lipTop is not above lipBottom');
  return bad;
}
