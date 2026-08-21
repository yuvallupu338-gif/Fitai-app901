/*
 * viewmodel.js — the rifle, in your hands.
 *
 * The game talks constantly about fifteen rounds and about a weapon that
 * cannot solve anything, and until you can see it none of that is real. So it
 * is on screen, it moves when you move, it kicks when it fires, and it goes
 * empty visibly.
 *
 * There is no separate view-space pass in this renderer — every mesh it draws
 * is in world coordinates. Rather than add a second projection and a second
 * depth range for one object, the rifle is built *into the world* each frame,
 * at a position derived from the camera basis. It costs one dynamic buffer
 * upload of about three hundred triangles, and it buys something better than
 * a view-space model would have: the rifle is lit by the room it is in. Walk
 * from the lit hall into a dark bedroom and it goes dark in your hands.
 *
 * The three motions are all lag, and they are what stop it looking glued to
 * the camera:
 *
 *   sway     the rifle chases the camera's rotation a few frames behind, so
 *            turning swings it and stopping settles it;
 *   bob      tied to walking distance, not to time, in step with the footfall;
 *   recoil   a hard kick back and up on the shot, decaying fast.
 */

import { MeshBuilder, addQuad } from '../render/meshbuilder.js';

/*
 * Where the rifle sits relative to the eye, in metres: right, down, forward.
 *
 * `fwd` is the number that decides whether it reads as a weapon or as a stick
 * in the distance. The barrel runs another 0.6 m beyond the origin, so holding
 * it far forward puts the muzzle a metre out and the whole thing shrinks into
 * perspective. Held close and turned a few degrees inward, it fills the corner
 * of the frame the way a rifle does when you are actually carrying one.
 */
const HOLD = { right: 0.175, down: 0.190, fwd: 0.31 };
const LOWER = { right: 0.22, down: 0.42, fwd: 0.20 };   /* while hands are busy */
const TOE_IN = 0.10;   /* radians the muzzle is turned towards the centre */

export class ViewModel {
  constructor() {
    this.swayYaw = 0;
    this.swayPitch = 0;
    this.recoil = 0;
    this.flash = 0;
    this.bob = 0;
    this.lowered = 0;
  }

  fire() {
    this.recoil = 1;
    this.flash = 1;
  }

  update(dt, player, busy) {
    /* Sway: a first-order lag on the camera angles. The difference between
     * where the camera is looking and where the rifle has got to is the whole
     * effect. */
    const k = 1 - Math.exp(-11 * dt);
    this.swayYaw += (player.yaw - this.swayYaw) * k;
    this.swayPitch += (player.pitch - this.swayPitch) * k;

    this.recoil *= Math.exp(-11 * dt);
    this.flash *= Math.exp(-26 * dt);
    this.bob = player.bob;

    /* Both hands are on the hammer, so the rifle drops out of the way. */
    const want = busy ? 1 : 0;
    this.lowered += (want - this.lowered) * (1 - Math.exp(-7 * dt));
  }

  /*
   * Build it. `mat` is the material index table; returns mesh data plus the
   * muzzle's world position so the caller can hang a light on it.
   */
  build(player, ammo, mat) {
    const mb = new MeshBuilder(600);
    /*
     * The flash goes in its own builder. It is a cut-out material, and the
     * renderer runs cut-outs as a separate pass with a discard threshold — a
     * flash submitted with the opaque rifle never gets that discard, its mask
     * is baked and thrown away, and every shot draws a flat yellow rectangle
     * across the corner of the screen.
     */
    const flashMb = new MeshBuilder(64);

    /* Camera basis, matching core/math.js viewFromEuler exactly. Using the
     * swayed angles rather than the live ones is what produces the lag. */
    const cy = Math.cos(this.swayYaw), sy = Math.sin(this.swayYaw);
    const cp = Math.cos(this.swayPitch), sp = Math.sin(this.swayPitch);
    const right = [cy, 0, -sy];
    const up = [sy * sp, cp, cy * sp];
    const fwd = [-sy * cp, sp, -cy * cp];

    const lower = this.lowered;
    const hold = {
      right: HOLD.right + (LOWER.right - HOLD.right) * lower,
      down: HOLD.down + (LOWER.down - HOLD.down) * lower,
      fwd: HOLD.fwd + (LOWER.fwd - HOLD.fwd) * lower,
    };

    /* Recoil drives the rifle back along its own axis and tips the muzzle up. */
    const kick = this.recoil;
    const originX = player.x + right[0] * hold.right - up[0] * (hold.down - this.bob * 0.6) + fwd[0] * (hold.fwd - kick * 0.09);
    const originY = player.y + right[1] * hold.right - up[1] * (hold.down - this.bob * 0.6) + fwd[1] * (hold.fwd - kick * 0.09);
    const originZ = player.z + right[2] * hold.right - up[2] * (hold.down - this.bob * 0.6) + fwd[2] * (hold.fwd - kick * 0.09);

    /* Tip the whole rifle up around its own right axis by the recoil. */
    const tip = kick * 0.17 - lower * 0.55;
    const ct = Math.cos(tip), st = Math.sin(tip);
    let f = [
      fwd[0] * ct + up[0] * st, fwd[1] * ct + up[1] * st, fwd[2] * ct + up[2] * st,
    ];
    const u = [
      up[0] * ct - fwd[0] * st, up[1] * ct - fwd[1] * st, up[2] * ct - fwd[2] * st,
    ];

    /*
     * Toe the muzzle in towards the centre of the frame, around the up axis.
     * A rifle held exactly parallel to the view direction looks like a prop
     * bolted to the camera.
     *
     * Both axes rotate out of the ORIGINAL pair. Overwriting `f` first and
     * then deriving the new right from it is not a rotation — it leaves the
     * frame non-orthonormal (the right axis came out 1% short), which shears
     * every box built in it.
     */
    const cw = Math.cos(TOE_IN), sw = Math.sin(TOE_IN);
    const f0 = f;
    f = [
      f0[0] * cw - right[0] * sw, f0[1] * cw - right[1] * sw, f0[2] * cw - right[2] * sw,
    ];
    const r2 = [
      right[0] * cw + f0[0] * sw, right[1] * cw + f0[1] * sw, right[2] * cw + f0[2] * sw,
    ];

    /*
     * The camera basis is LEFT-handed: for viewFromEuler's right/up/forward,
     * `right x up` comes out as MINUS forward, because the view looks down its
     * own -Z. orientedBox needs a right-handed triple or every face it emits is
     * wound inside-out — the box then draws its own interior, and with the
     * normals pointing inwards the rifle is lit by nothing. Handing it the
     * backward axis makes the triple right-handed; the box is symmetric in
     * depth, so the geometry is unchanged.
     */
    const nf = [-f[0], -f[1], -f[2]];

    const O = [originX, originY, originZ];
    /* eslint-disable-next-line no-unused-vars -- read through `box` below */
    const box = (offR, offU, offF, hw, hh, hd, m) =>
      orientedBox(mb, at(O, r2, u, f, offR, offU, offF), r2, u, nf, hw, hh, hd, m);

    /* barrel */
    box(0, 0.016, 0.32, 0.018, 0.018, 0.32, mat.gunMetal);
    /* magazine tube under it */
    box(0, -0.018, 0.26, 0.014, 0.014, 0.26, mat.gunMetal);
    /* receiver */
    box(0, 0, -0.02, 0.028, 0.042, 0.11, mat.gunMetal);
    /* fore-end */
    box(0, -0.006, 0.15, 0.030, 0.032, 0.14, mat.gunStock);
    /* stock, dropping away towards the shoulder */
    box(0, -0.038, -0.21, 0.027, 0.052, 0.14, mat.gunStock);
    /* comb */
    box(0, 0.014, -0.17, 0.024, 0.019, 0.10, mat.gunStock);
    /* trigger guard */
    box(0, -0.047, -0.03, 0.009, 0.016, 0.032, mat.gunMetal);
    /* front sight */
    box(0, 0.042, 0.615, 0.005, 0.018, 0.008, mat.gunMetal);
    /* bolt handle, out to the right */
    box(0.038, 0.008, -0.045, 0.019, 0.008, 0.008, mat.gunMetal);

    /*
     * Hands. Two blocks and four stubs, and they are worth more than every
     * other detail on the rifle put together: without them the weapon floats
     * in the corner of the frame like a decal, and with them it is being
     * carried. They are the same dark fabric as the rest of the player, who is
     * otherwise never seen.
     */
    /* forward hand, wrapped under the fore-end */
    box(0.004, -0.038, 0.150, 0.026, 0.024, 0.040, mat.hand);
    for (let i = 0; i < 4; i++) {
      box(-0.020 + i * 0.002, -0.020, 0.128 + i * 0.019, 0.030, 0.012, 0.008, mat.hand);
    }
    /* trigger hand, at the grip */
    box(0.004, -0.050, -0.055, 0.025, 0.025, 0.042, mat.hand);
    for (let i = 0; i < 3; i++) {
      box(-0.018, -0.034, -0.082 + i * 0.020, 0.028, 0.011, 0.008, mat.hand);
    }
    /* the wrist and forearm running off the bottom of the frame */
    box(0.026, -0.098, -0.155, 0.030, 0.030, 0.12, mat.sleeve);

    const muzzle = at(O, r2, u, f, 0, 0.016, 0.655);

    /*
     * The flash, as a pair of crossed quads at the muzzle. Two planes rather
     * than one so it does not vanish when seen edge-on, and cut out so the
     * quad's corners are not a visible rectangle of light.
     */
    if (this.flash > 0.04) {
      const s = 0.09 * (0.6 + this.flash * 0.9);
      /*
       * A disc across the muzzle and a flame along the barrel. The two used to
       * be (right, up) and (up, right), which are the same plane written twice
       * — two coplanar quads, z-fighting, and no cross at all. These share
       * only the up axis, so the flash reads whether you are behind the rifle
       * or beside it.
       */
      const planes = [[r2, u, s, s], [f, u, s * 1.5, s * 0.7]];
      for (const [a, b, sa, sb] of planes) {
        const P = (x, y) => [
          muzzle[0] + a[0] * sa * x + b[0] * sb * y,
          muzzle[1] + a[1] * sa * x + b[1] * sb * y,
          muzzle[2] + a[2] * sa * x + b[2] * sb * y,
        ];
        addQuad(flashMb, P(-1, -1), P(1, -1), P(1, 1), P(-1, 1),
          [0, 0], [1, 0], [1, 1], [0, 1], mat.muzzleFlash, { ao: () => 1 });
      }
    }

    /*
     * Rounds left, shown on the rifle itself rather than only in the corner:
     * a short row of brass in the side of the receiver. Reading your ammunition
     * off the weapon is one less thing to take your eyes off the room for.
     */
    const shown = Math.min(5, Math.ceil(ammo / 3));
    for (let i = 0; i < shown; i++) {
      box(0.030, -0.008, -0.07 + i * 0.020, 0.004, 0.007, 0.008, mat.metalPale);
    }

    return {
      data: mb.finish(),
      flashData: flashMb.empty ? null : flashMb.finish(),
      muzzle,
      flash: this.flash,
    };
  }
}

function at(O, right, up, fwd, r, u, f) {
  return [
    O[0] + right[0] * r + up[0] * u + fwd[0] * f,
    O[1] + right[1] * r + up[1] * u + fwd[1] * f,
    O[2] + right[2] * r + up[2] * u + fwd[2] * f,
  ];
}

/* Same construction as world/barricade.js: right x up = normal(forward). */
function orientedBox(mb, c, right, up, fwd, hw, hh, hd, mat) {
  const P = (sx, sy, sz) => [
    c[0] + right[0] * hw * sx + up[0] * hh * sy + fwd[0] * hd * sz,
    c[1] + right[1] * hw * sx + up[1] * hh * sy + fwd[1] * hd * sz,
    c[2] + right[2] * hw * sx + up[2] * hh * sy + fwd[2] * hd * sz,
  ];
  const A = P(-1, -1, 1), B = P(1, -1, 1), C = P(1, 1, 1), D = P(-1, 1, 1);
  const E = P(-1, -1, -1), F = P(1, -1, -1), G = P(1, 1, -1), H = P(-1, 1, -1);
  const uvF = [[0, 0], [hw * 2, 0], [hw * 2, hh * 2], [0, hh * 2]];
  const uvE = [[0, 0], [hd * 2, 0], [hd * 2, hh * 2], [0, hh * 2]];
  const uvT = [[0, 0], [hw * 2, 0], [hw * 2, hd * 2], [0, hd * 2]];
  const o = { ao: () => 0.92 };
  addQuad(mb, A, B, C, D, ...uvF, mat, o);
  addQuad(mb, F, E, H, G, ...uvF, mat, o);
  addQuad(mb, B, F, G, C, ...uvE, mat, o);
  addQuad(mb, E, A, D, H, ...uvE, mat, o);
  addQuad(mb, D, C, G, H, ...uvT, mat, o);
  addQuad(mb, E, F, B, A, ...uvT, mat, o);
}
