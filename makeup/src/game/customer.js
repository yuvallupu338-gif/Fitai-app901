/*
 * customer.js — who is sitting at the counter, and what they arrived wearing.
 *
 * A customer is a seed. Face, colouring, hair, clothes, personality, the look
 * they want, the makeup already on their face and the preference they are not
 * going to tell you about all come out of it, so the same seed is the same
 * person on any machine and a shift can be replayed exactly.
 *
 * The hidden preference is the part the game is built around. Every customer
 * likes one *kind* of product more than the others — a matte lip, a dewy base,
 * a shimmer on the eye — and the only way to find out is to put things on their
 * face and watch. At the till the player writes down what they think it was.
 * Getting it right is worth a tip now and a returning customer later; getting it
 * wrong costs nothing except that she comes back asking for the wrong thing.
 */

import { makeRng } from '../core/rng.js';
import { hexToRgb, deltaE, shadeMiss, rgbToLab, labToRgb } from '../core/color.js';
import { clamp } from '../core/math.js';
import {
  faceParams, buildHead, buildEyeball, buildLid, buildLashes, eyeAnchor,
  surfaceFrame,
} from '../model/head.js';
import { F } from '../model/face.js';
import {
  buildNeck, buildGarment, buildEars, buildHands, buildHair, HAIR_STYLE_NAMES,
} from '../model/body.js';
import { skinTexture, irisTexture, hairTexture, fabricTexture } from '../render/textures.js';
import { PRODUCTS, product, productShade, byCategory, zoneOf } from '../data/products.js';
import { LOOKS, look } from '../data/looks.js';
import {
  SKIN_TONES, HAIR_COLORS, EYE_COLORS, GARMENT_COLORS, NAMES, PERSONAS,
  PERSONA_NAMES, LINES, say,
} from '../data/people.js';

/* ------------------------------------------------------------------ *
 * Generation
 * ------------------------------------------------------------------ */

/*
 * `previous` is the roster of customers already served this save. Every so
 * often one of them walks back in — same face, same seed, and an opinion about
 * whether the player got her right last time. A shop where nobody ever returns
 * has no memory, and the preference card is pointless without one.
 */
export function generateCustomer(seed, opts = {}) {
  const returning = opts.returning || null;
  if (returning) {
    const c = generateCustomer(returning.seed, { day: opts.day, index: opts.index });
    c.returning = true;
    c.rememberedLook = returning.lookId;
    c.markedRight = returning.markedRight;
    c.persona = PERSONAS.regular;
    /* She asks for what worked last time, if it worked. */
    if (returning.markedRight && returning.favouriteKey) {
      c.requestedItemKey = returning.favouriteKey;
    }
    c.greeting = say(pickFrom(makeRng(seed + 5), LINES.returning), c.gender);
    return c;
  }

  const rng = makeRng(seed);
  const name = rng.pick(NAMES);
  const tone = rng.pick(SKIN_TONES);
  const hair = rng.pick(HAIR_COLORS);
  const eye = rng.pick(EYE_COLORS);
  const persona = PERSONAS[rng.pick(PERSONA_NAMES)];
  const chosen = pickLook(rng, opts.day || 1);

  const skin = hexToRgb(tone.hex);
  /* Subsurface tint: where light comes back out of skin it is red, and how red
   * depends on how much melanin it went through on the way. */
  const lab = rgbToLab(skin);
  const sss = labToRgb([clamp(lab[0] * 0.55, 6, 55), lab[1] + 26, lab[2] + 10]);

  const c = {
    seed,
    name: name.he,
    gender: name.g,
    persona,
    face: faceParams(rng),
    tone,
    skin,
    sss,
    hairStyle: rng.pick(HAIR_STYLE_NAMES),
    hairRgb: hexToRgb(hair.hex),
    hairName: hair.he,
    eyeRgb: hexToRgb(eye.hex),
    eyeName: eye.he,
    garmentRgb: hexToRgb(rng.pick(GARMENT_COLORS)),
    garmentStyle: rng.int(0, 2),
    /* Texture inputs. */
    lipDepth: rng.range(0, 1),
    browDensity: rng.range(0.45, 1.0),
    freckles: rng.chance(0.35) ? rng.range(0.3, 1) : 0,
    flush: rng.range(-0.15, 0.35),
    lookId: chosen.id,
    age: rng.int(16, 68),
  };

  c.look = look(c.lookId);
  c.prefs = choosePreference(rng, c.look);
  c.arrival = chooseArrival(rng, c);
  c.greeting = say(rng.pick(LINES.greet), c.gender);
  c.patience = 70 * c.persona.patience * rng.range(0.85, 1.2);
  return c;
}

function pickFrom(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

/* Early days stay near the easy end of the list; later ones open up. A shift
 * that opens with a bride is a shift nobody finishes. */
function pickLook(rng, day) {
  const cap = clamp(1 + Math.floor(day / 1.6), 1, 5);
  const pool = LOOKS.filter((l) => l.difficulty <= cap);
  return rng.pick(pool.length ? pool : LOOKS);
}

/*
 * The hidden preference. It is drawn from the look she asked for rather than at
 * random, so it is always something the player could plausibly have put on her
 * face — a preference for a gloss on a customer who asked for a matte lip is
 * unguessable and therefore not a mechanic, it is a dice roll.
 */
function choosePreference(rng, chosenLook) {
  const withFinish = chosenLook.wants.filter((w) => w.finish && w.finish.length);
  const source = withFinish.length ? rng.pick(withFinish) : rng.pick(chosenLook.wants);
  const finish = source.finish ? rng.pick([].concat(source.finish)) : null;
  const family = source.family ? rng.pick([].concat(source.family)) : null;
  return {
    cat: source.cat,
    finish,
    family,
    /* How strongly she shows it. A quiet customer still has a preference; she
     * just does not announce it, and the player has to read the face. */
    tell: rng.range(0.45, 1.0),
  };
}

/*
 * What she walked in wearing.
 *
 * This is the reason the wipe exists. Roughly half of customers arrive with
 * something on — the tail end of yesterday, a base in the wrong shade, or a
 * whole look done somewhere else that they now want changed — and the request
 * is only fair once the player can see what they are starting from.
 */
function chooseArrival(rng, c) {
  const roll = rng();
  const items = [];
  const say2 = (t) => { c.arrivalNote = t; };

  const wrongShade = () => {
    /*
     * A base a few steps off her own depth, or one undertone row across — the
     * two mistakes a counter actually makes, and the ones people come in to
     * have fixed.
     *
     * One or the other, not both. The shade list runs eight depths per
     * undertone, so an offset large enough to change the row also changes the
     * depth, and a customer who arrives wearing something six steps and a row
     * away does not look like somebody was sold the wrong shade — she looks
     * painted.
     */
    const line = rng.chance(0.5) ? 'found-matte' : 'found-dewy';
    const shades = product(line).shades;
    const idx = shades.indexOf(closestShade(shades, c.skin));
    const off = idx + rng.pick([-3, -2, 2, 3, 8, -8]);
    return { id: line, shadeId: shades[clamp(off, 0, shades.length - 1)].id };
  };

  if (roll < 0.40) {
    say2('הגיעה עם פנים נקיות.');
  } else if (roll < 0.66) {
    const lip = rng.pick(byCategory('lipstick'));
    items.push({ id: 'mascara', shadeId: 'ms-black', coverage: rng.range(0.35, 0.6) });
    items.push({ id: lip.id, shadeId: rng.pick(lip.shades).id, coverage: rng.range(0.3, 0.55) });
    say2('שאריות מאתמול — מסקרה ושפתון שכבר ירד חצי.');
  } else if (roll < 0.86) {
    const f = wrongShade();
    items.push({ id: f.id, shadeId: f.shadeId, coverage: rng.range(0.6, 0.85) });
    items.push({ id: 'blush-powder', shadeId: rng.pick(byCategory('blush')[0].shades).id, coverage: rng.range(0.4, 0.7) });
    say2('מגיעה עם בסיס בגוון לא נכון. אפשר לראות את קו הלסת.');
  } else {
    const f = wrongShade();
    const lip = rng.pick(byCategory('lipstick'));
    const shadow = rng.pick(byCategory('eyeshadow'));
    items.push({ id: f.id, shadeId: f.shadeId, coverage: rng.range(0.55, 0.8) });
    items.push({ id: shadow.id, shadeId: rng.pick(shadow.shades).id, coverage: rng.range(0.5, 0.9) });
    items.push({ id: 'liner', shadeId: 'ln-black', coverage: rng.range(0.4, 0.8) });
    items.push({ id: lip.id, shadeId: rng.pick(lip.shades).id, coverage: rng.range(0.6, 0.95) });
    say2('הגיעה מאופרת לגמרי — עשו לה משהו אחר, והיא רוצה משהו אחר.');
  }
  return items;
}

/*
 * Give a customer the colouring of a photograph instead of the one she was
 * generated with.
 *
 * Called after generation rather than before it, which is a deliberate trade.
 * Doing it properly — feeding the measured tone in at the top so the arrival
 * makeup is chosen against it — would mean decoding an image before a customer
 * exists, and the customer is generated synchronously from a seed on purpose:
 * that is what makes a shift replayable. What is lost by retoning afterwards is
 * only which *particular* wrong shade she walked in wearing, and an arrival
 * foundation is deliberately wrong either way. Everything the player is scored
 * on — the match, the affinity, the till — reads `c.skin` at the time it is
 * asked, so all of it judges against her real face.
 */
export function retoneCustomer(c, tone) {
  c.tone = tone;
  c.skin = hexToRgb(tone.hex);
  const lab = rgbToLab(c.skin);
  c.sss = labToRgb([clamp(lab[0] * 0.55, 6, 55), lab[1] + 26, lab[2] + 10]);
  return c;
}

/* The shade in a line that is closest to a skin tone, measured perceptually.
 * This is the answer the player is trying to find by eye. */
export function closestShade(shades, skin) {
  let best = shades[0], bestD = Infinity;
  for (const s of shades) {
    const d = deltaE(hexToRgb(s.hex), skin);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Opinions
 * ------------------------------------------------------------------ */

/*
 * How much she likes one product on her face, from -1 to 1. The three things
 * she has an opinion about, in the order she notices them: is this the kind of
 * thing I asked for, is the finish the one I like, and — for anything that
 * matches my skin rather than sits on it — is the shade right.
 */
export function affinity(c, item) {
  const p = item.product;
  let score = 0;

  const want = c.look.wants.find((w) => w.cat === p.cat);
  const avoid = c.look.avoid.find((a) => a.cat === p.cat
    && (!a.finish || a.finish === p.finish)
    && (!a.family || [].concat(a.family).includes(item.shade.family)));

  if (avoid) score -= 0.85;
  if (want) {
    score += 0.35;
    if (want.finish && [].concat(want.finish).includes(p.finish)) score += 0.20;
    else if (want.finish) score -= 0.30;
    if (want.family && [].concat(want.family).includes(item.shade.family)) score += 0.25;
    else if (want.family) score -= 0.35;
  }

  if (c.prefs.cat === p.cat) {
    if (!c.prefs.finish || c.prefs.finish === p.finish) score += 0.45 * c.prefs.tell;
    if (c.prefs.family && c.prefs.family === item.shade.family) score += 0.30 * c.prefs.tell;
  }

  if (item.shade.family === 'complexion') {
    const miss = shadeMiss(hexToRgb(item.shade.hex), c.skin);
    score += 0.5 - clamp(miss.deltaE / 9, 0, 1.1);
  }

  return clamp(score, -1, 1);
}

/* What she would name as her favourite, out of what actually went on. The
 * preference card is scored against this. */
export function favourite(c, applied) {
  let best = null, bestScore = 0.25;
  for (const e of applied) {
    const a = affinity(c, e.item) * Math.min(1, e.amount / 6);
    if (a > bestScore) { bestScore = a; best = e; }
  }
  return best;
}

/* The line she says when something lands. Returns null when she has nothing to
 * say, which for a shy customer is most of the time — her face still moves. */
export function reactionTo(c, item, rng) {
  const a = affinity(c, item);
  const expr = a > 0.45 ? { smile: clamp(a, 0, 1) } : a < -0.3 ? { concern: clamp(-a, 0, 1) } : {};
  let line = null;
  const chatty = c.persona.talk * (a > 0.45 || a < -0.3 ? 1.6 : 0.25);
  if (rng.chance(clamp(chatty, 0, 0.95))) {
    if (a > 0.45) line = say(rng.pick(LINES.love), c.gender);
    else if (a < -0.3) {
      const shadeProblem = item.shade.family === 'complexion'
        && shadeMiss(hexToRgb(item.shade.hex), c.skin).deltaE > 8;
      line = say(rng.pick(shadeProblem ? LINES.wrongShade : LINES.hate), c.gender);
    }
  }
  return { affinity: a, expr, line };
}

/* ------------------------------------------------------------------ *
 * Assets
 * ------------------------------------------------------------------ */

/*
 * Turn a customer into meshes and pixels. This is the expensive part of a
 * customer — a head is twenty thousand vertices and the skin texture is a
 * quarter of a million texels — so it happens once, behind the walk-up
 * animation, and never during a stroke.
 */
export function buildCustomerAssets(c, opts = {}) {
  const rng = makeRng(c.seed + 991);
  const skinSize = opts.skinSize || 512;
  const P = c.face;
  const { mesh: head, morph } = buildHead(P);

  const eyeL = eyeAnchor(P, -1);
  const eyeR = eyeAnchor(P, 1);

  /* Where the camera looks when the player asks for a close-up. Taken off the
   * built surface rather than from constants, so a long face and a round one
   * both frame correctly. */
  const focus = {
    face: [0, -0.25, 0],
    eyes: [0, (eyeL.centre[1] + eyeR.centre[1]) / 2, 0.30],
    lips: surfaceFrame(P, 0.5, F.mouthT).p,
  };

  return {
    focus,
    head,
    morph,
    neck: buildNeck(P),
    garment: buildGarment(P, c.garmentStyle),
    ears: buildEars(P),
    hands: buildHands(P),
    hair: buildHair(P, c.hairStyle, rng),
    eye: buildEyeball(eyeL.r),
    lidL: buildLid(eyeL.r, -1),
    lidR: buildLid(eyeR.r, 1),
    lowL: buildLid(eyeL.r, -1, true),
    lowR: buildLid(eyeR.r, 1, true),
    lashL: buildLashes(eyeL.r, -1),
    lashR: buildLashes(eyeR.r, 1),
    eyeL,
    eyeR,
    skinSize,
    skinPixels: skinTexture(skinSize, c),
    irisPixels: irisTexture(256, c),
    hairPixels: hairTexture(256, c.hairRgb),
    garmentPixels: fabricTexture(256, c.garmentRgb),
    skinRgb: c.skin,
    sssRgb: c.sss,
    lashRgb: [0.09, 0.08, 0.10],
    lashOpacity: 0.55,
    anim: {
      t: 0, yaw: 0, pitch: 0, morph: [0, 0],
      blink: 0, blinkTimer: 1.5, lid: 0,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Arrival makeup
 * ------------------------------------------------------------------ */

/*
 * Lay the customer's existing makeup onto the paint layer by brushing it on the
 * same way the player would. Going through the real brush rather than writing
 * the texture directly means arrival makeup obeys every rule the player's does
 * — it feathers at the zone edges, it builds, and it can be wiped off — and it
 * gives the audit a way to drive the paint layer without a pointer.
 */
export function applyArrival(paint, c) {
  const rng = makeRng(c.seed + 4242);
  paint.recordingArrival = true;
  for (const entry of c.arrival) {
    fillZone(paint, productShade(entry.id, entry.shadeId), entry.coverage, rng);
  }
  paint.recordingArrival = false;
  paint.flush(true);
}

/*
 * Cover a zone to roughly a target coverage, by walking a grid over the zone's
 * own mask. Slightly ragged on purpose: a face that arrives with makeup applied
 * to a perfect uniform coverage looks like a decal, and the player is meant to
 * be able to see that yesterday's eyeliner has worn unevenly.
 */
export function fillZone(paint, item, coverage, rng) {
  const zone = zoneOf(item.product);
  if (!zone) return;
  const bounds = paint.bounds[zone];
  const n = paint.masks.size;
  const step = Math.max(2, Math.floor((BRUSH_STEP[item.product.cat] || 0.03) * n));
  const passes = Math.max(1, Math.round(coverage * 3));
  for (let pass = 0; pass < passes; pass++) {
    for (let y = bounds[1]; y < bounds[3]; y += step) {
      for (let x = bounds[0]; x < bounds[2]; x += step) {
        const s = (x + 0.5) / n, t = (y + 0.5) / n;
        const m = paint.masks.zones[zone][y * n + x] / 255;
        if (m < 0.25) continue;
        const jitter = rng ? rng.range(0.55, 1.15) : 1;
        paint.splat(s, t, item, clamp(coverage * jitter, 0.05, 1.4));
      }
    }
  }
}

const BRUSH_STEP = {
  foundation: 0.05, powder: 0.05, prep: 0.05, concealer: 0.03,
  contour: 0.035, blush: 0.04, highlighter: 0.028, brow: 0.012,
  eyeshadow: 0.025, liner: 0.006, mascara: 0.010, lipstick: 0.018, gloss: 0.020,
};
