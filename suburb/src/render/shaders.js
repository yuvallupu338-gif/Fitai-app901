/*
 * shaders.js — every GLSL source in the game.
 *
 * The picture this is chasing is a specific one: a suburban street at half
 * past three in the morning, shot on a camera that is not quite good enough
 * for the light it is being asked to work in. Almost all of that is a lighting
 * problem rather than a geometry problem, so the effort goes into four things:
 *
 *   - one directional light that is the moon, with real shadows marched
 *     through a height field of the whole neighbourhood. Moonlight through a
 *     gable roof onto a lawn is the shape that says "outdoors at night", and
 *     nothing else in the frame does that job;
 *   - sodium street lamps as point lights with an honest inverse-square
 *     falloff, because the gap between two lamps — where the orange has fallen
 *     off and the moon has not taken over — is where the whole game is played;
 *   - ground fog that lies in a layer rather than filling the scene, so the
 *     sky stays clear and the far end of the street does not;
 *   - a lens that is doing badly: bloom on the lamps, chromatic aberration,
 *     grain that lives in the shadows, and a tonemap with a real toe so the
 *     blacks never crush to nothing.
 *
 * Everything is rendered linear into a half-float target and tone-mapped once,
 * at the end. Tone-mapping anywhere else is what turns a sodium lamp into a
 * patch of orange paint.
 */

import { MAT_COUNT } from '../world/materials.js';

const COMMON = `
const float PI = 3.14159265359;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/* A failing sodium lamp. It does not blink: it drops out for a few hundred
 * milliseconds, comes back at half brightness, and settles. The phase is
 * per-fixture so that when there are two of them they never agree. A negative
 * phase means "this one is fine", which is nearly all of them. */
float flicker(float t, float phase) {
  if (phase < 0.0) return 1.0;
  float p = phase * 37.0;
  float slow = 0.93 + 0.07 * sin(t * 1.3 + p * 6.283);
  float warm = 0.55 + 0.45 * sin(t * 0.7 + p * 3.1);
  float drop = step(0.972, fract(sin(floor(t * 7.0 + p * 50.0) * 12.9898) * 43758.5453));
  return slow * mix(1.0, warm, 0.25) * (1.0 - 0.8 * drop);
}
`;

/* ------------------------------------------------------------------ *
 * Scene
 * ------------------------------------------------------------------ */

export const SCENE_VERT = `#version 300 es
precision highp float;

in vec3 aPos;
in vec3 aNrm;
in vec2 aUV;
in vec4 aTan;
in float aAO;
in float aMat;
in float aFlick;

uniform mat4 uViewProj;
uniform mat4 uModel;

out vec3 vPos;
out vec3 vNrm;
out vec2 vUV;
out vec3 vTan;
out vec3 vBit;
out float vAO;
out float vFlick;
flat out int vMat;

void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vPos = world.xyz;
  /* Models are rigid (translate, yaw, pitch, uniform scale), so the normal
   * matrix is the model matrix with the scale divided out — and since the
   * scale is uniform, normalising afterwards is the same thing for free. */
  vNrm = mat3(uModel) * aNrm;
  vTan = mat3(uModel) * aTan.xyz;
  vBit = cross(vNrm, vTan) * aTan.w;
  vUV = aUV;
  vAO = aAO;
  vFlick = aFlick;
  vMat = int(aMat + 0.5);
  gl_Position = uViewProj * world;
}
`;

export const SCENE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;

in vec3 vPos;
in vec3 vNrm;
in vec2 vUV;
in vec3 vTan;
in vec3 vBit;
in float vAO;
in float vFlick;
flat in int vMat;

out vec4 oColor;

uniform sampler2DArray uAlbedo;    /* rgb albedo (sRGB), a = roughness       */
uniform sampler2DArray uNormalTex; /* rg normal, b = height/mask, a = emissive*/
uniform sampler2D uOcc;            /* height field of the whole neighbourhood */

uniform vec3  uCamPos;
uniform float uTime;

/* The moon, or the sun. One directional light, always. */
uniform vec3  uSunDir;             /* towards the light                       */
uniform vec3  uSunColor;
uniform float uSunIntensity;
uniform float uSunShadow;          /* 0 = no marched shadows                  */

#define MAX_LIGHTS 16
uniform int   uLightCount;
uniform vec4  uLightPos[MAX_LIGHTS];   /* xyz position, w radius              */
uniform vec4  uLightColor[MAX_LIGHTS]; /* rgb colour, w intensity             */

uniform vec3  uSkyColor;           /* ambient from above                      */
uniform vec3  uGroundColor;        /* ambient bounced from below              */
uniform vec3  uFogColor;
uniform float uFogDensity;
uniform float uFogHeight;          /* the fog lies in a layer this deep       */
uniform float uFogFloor;           /* and starts at this height               */

/* Sized from the material table itself rather than typed in here. It was
 * typed in here, at 18, and the table grew to 21 the day the neighbours got
 * clothes of their own — which does not fail loudly, it silently hands the
 * last three materials somebody else's roughness. */
#define MAX_MATS ${MAT_COUNT}
uniform vec4 uMatA[MAX_MATS];      /* uvScale, roughnessMul, emissive, specular */
uniform vec4 uMatB[MAX_MATS];      /* water, normalStrength, alphaCut, unused   */

uniform vec4 uOccRect;             /* x0, z0, width, depth of the height field  */
uniform float uOccMaxH;
uniform int  uShadowLights;        /* how many point lights cast              */

uniform vec4 uTorch;               /* intensity, cosInner, cosOuter, range    */
uniform vec3 uTorchDir;

${COMMON}

/*
 * Shadowing, by marching the neighbourhood's height field.
 *
 * The whole world is bounded and static, so it fits in one 256x256 texture
 * where each texel is the height of the tallest opaque thing standing there.
 * That makes "is this point in shadow" a walk along the light direction with a
 * height compare — no shadow maps, no second pass, no cascade seams, and it
 * costs nothing on the lawn where the field is empty.
 *
 * Counting blocked samples rather than stopping at the first gives a soft edge
 * for free. It is not a real penumbra, but a hard stencil edge on a lawn at
 * night reads as synthetic instantly, and this does not.
 */
float sampleHeight(vec2 p) {
  vec2 uv = (p - uOccRect.xy) / uOccRect.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return -1.0;
  return texture(uOcc, uv).r * uOccMaxH;
}

float sunVisibility(vec3 P, vec3 L) {
  if (uSunShadow < 0.5) return 1.0;
  const int STEPS = 14;
  float blocked = 0.0;
  /* 1.1m a step: coarse enough for 14 steps to reach past a house, fine
   * enough that a picket fence still throws something. */
  for (int i = 1; i <= STEPS; i++) {
    vec3 p = P + L * (float(i) * 1.1);
    float h = sampleHeight(p.xz);
    blocked += step(p.y + 0.10, h);
  }
  return clamp(1.0 - blocked / float(STEPS) * 2.2, 0.0, 1.0);
}

float lightVisibility(vec3 P, vec3 Lp) {
  vec3 d = Lp - P;
  float len = length(d);
  if (len < 0.05) return 1.0;
  const int STEPS = 8;
  float blocked = 0.0;
  for (int i = 1; i <= STEPS; i++) {
    float t = float(i) / float(STEPS + 1);
    vec3 p = P + d * t;
    float h = sampleHeight(p.xz);
    blocked += step(p.y + 0.10, h);
  }
  return clamp(1.0 - blocked / float(STEPS) * 1.7, 0.0, 1.0);
}

/*
 * Wrapped diffuse. A street lamp is a half-metre of glass five metres up, not
 * a point, and a point light gets one thing badly wrong: everything at a
 * grazing angle goes black — which on a lawn, seen from eye height, is most of
 * the visible surface. Wrapping pushes the terminator past ninety degrees,
 * which is what an area source does. One instruction, and it is the difference
 * between a lit street and a hole with a lamp in it.
 */
#define WRAP 0.30

vec3 shade(vec3 P, vec3 N, vec3 V, vec3 albedo, float rough, float spec, float ao) {
  float shin = exp2(11.0 * (1.0 - rough) + 1.0);
  vec3 sum = vec3(0.0);

  /* ---- the moon ---- */
  {
    vec3 L = uSunDir;
    float ndl = (dot(N, L) + WRAP) / (1.0 + WRAP);
    if (ndl > 0.0) {
      float vis = sunVisibility(P + N * 0.05, L);
      vec3 H = normalize(L + V);
      float s = pow(max(dot(N, H), 0.0), shin) * spec;
      sum += uSunColor * uSunIntensity * vis * (albedo * ndl + vec3(s * 1.6));
    }
  }

  /* ---- lamps, porch lights, lit windows ---- */
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 Lp = uLightPos[i].xyz;
    float radius = uLightPos[i].w;
    vec3 d = Lp - P;
    float dist = length(d);
    if (dist > radius) continue;
    vec3 L = d / max(dist, 0.001);

    float ndl = (dot(N, L) + WRAP) / (1.0 + WRAP);
    if (ndl <= 0.0) continue;

    /*
     * Inverse-square with a window that reaches exactly zero at the radius, so
     * a light can be culled at its radius with no visible seam.
     *
     * The 0.13 on the distance term is the number that decides whether this
     * looks like a street. A true point light falls off far too fast for a
     * lamp on a five-metre column: at 0.35 the pavement is black four paces
     * from the post and the road looks like a stage. 0.13 is what a sodium
     * lamp actually does to a road.
     */
    float w = clamp(1.0 - dist / radius, 0.0, 1.0);
    float atten = w * w / (1.0 + dist * dist * 0.13);

    float vis = 1.0;
    if (i < uShadowLights) vis = lightVisibility(P + N * 0.05, Lp);

    vec3 H = normalize(L + V);
    float s = pow(max(dot(N, H), 0.0), shin) * spec * (0.25 + 0.75 * rough * rough);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(H, V), 0.0), 5.0);

    sum += uLightColor[i].rgb * uLightColor[i].w * atten * vis
         * (albedo * ndl + vec3(s * fres * 3.5));
  }

  /* ---- the torch ---- */
  if (uTorch.x > 0.0) {
    /* Held low and to the right of the eye. A torch exactly on the view axis
     * produces a flat, shadowless image and gives the player nothing to read
     * the ground with. */
    vec3 origin = uCamPos + vec3(0.0, -0.22, 0.0);
    vec3 d = origin - P;
    float dist = length(d);
    vec3 L = d / max(dist, 0.001);
    float ndl = max(dot(N, L), 0.0);
    float cone = smoothstep(uTorch.z, uTorch.y, dot(-L, uTorchDir));
    float atten = clamp(1.0 - dist / uTorch.w, 0.0, 1.0);
    atten = atten * atten / (1.0 + dist * dist * 0.09);
    vec3 H = normalize(L + V);
    float s = pow(max(dot(N, H), 0.0), shin) * spec;
    sum += vec3(1.0, 0.95, 0.86) * uTorch.x * cone * atten
         * (albedo * ndl + vec3(s * 2.0));
  }

  /* Hemisphere ambient: the sky above, the ground below. Flat ambient is the
   * single biggest tell in an outdoor night scene — it erases every normal map
   * the moment the lamps fall off — and an ambient that reaches zero
   * underneath is just as wrong, because a lawn bounces plenty back up. */
  float up = dot(N, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
  sum += mix(uGroundColor, uSkyColor, up) * albedo * ao;
  return sum;
}

void main() {
  vec4 ma = uMatA[vMat];
  vec4 mb = uMatB[vMat];
  vec2 uv = vUV * ma.x;

  vec3 N = normalize(vNrm);
  vec3 V = normalize(uCamPos - vPos);

  vec4 alb = texture(uAlbedo, vec3(uv, float(vMat)));
  vec4 nrm = texture(uNormalTex, vec3(uv, float(vMat)));

  /*
   * Cut-out hedges and canopies. Not a bare threshold against the mask: the
   * mask is mipmapped like every other channel, so at any distance it is an
   * average of the leaves and the gaps between them, and a hard test against
   * an averaged mask is what turned every hedge in the street into a field of
   * black-and-white static that boiled as the player walked.
   *
   * Rescaling the test by the mask's own screen-space rate of change fixes
   * both ends of it at once. Close up fwidth is tiny, so this stays the same
   * hard edge it always was. Far away fwidth is large, the comparison
   * flattens towards the middle, and the mip's average decides the pixel
   * instead of the noise riding on it — so a distant hedge thins out evenly
   * rather than dissolving into speckle. It also stops the canopies eroding
   * with distance, which a plain threshold does the moment the average of a
   * leafy mip falls under the cut.
   */
  if (mb.z > 0.0) {
    float cov = (nrm.b - mb.z) / max(fwidth(nrm.b), 1e-5) + 0.5;
    if (cov < 0.5) discard;
  }

  vec3 albedo = alb.rgb;
  float rough = clamp(alb.a * ma.y, 0.04, 1.0);
  float emissive = nrm.a * ma.z;

  /* Tangent-space normal. The strength control matters more than it looks:
   * a lawn wants a great deal of it and a window pane wants almost none, and
   * one value for both is what makes everything read as plastic. */
  /*
   * Scaled against a unit Z rather than renormalised in the plane. The old
   * form multiplied XY and then solved Z from them, which cannot represent a
   * strength above one at all: once XY reaches unit length Z is zero and
   * everything past that clamps flat. At the shipping texture size that
   * flattened about a tenth of the grass and the siding; at the "high" setting
   * a player is likely to pick it flattened nearly three quarters of the lawn,
   * so turning the texture quality up made the largest surface in the game
   * visibly worse. This form is monotone in the strength and never degenerate.
   */
  /*
   * And faded out as the texel footprint grows, because normal maps do not
   * mip in any useful sense. The albedo goes soft with distance — that is what
   * the mip chain is for — but the normal keeps handing back centimetre-scale
   * bumps long after a centimetre is smaller than a pixel, so every one of
   * them is a coin toss per frame. That is what boiled the road and the far
   * lawn into salt and pepper that crawled as the player walked, and no amount
   * of anisotropy fixes it, because the aliasing is in the lighting rather
   * than in the colour. Past about a texel and a half per pixel the bump is on
   * its way out; by a dozen it is gone and the mipped albedo carries the
   * surface on its own, which is the right answer at that distance anyway.
   */
  float foot = max(length(dFdx(uv)), length(dFdy(uv)));
  float bump = mb.y * (1.0 - smoothstep(0.006, 0.05, foot));
  vec3 tn = normalize(vec3((nrm.rg * 2.0 - 1.0) * bump, 1.0));
  mat3 TBN = mat3(normalize(vTan), normalize(vBit), N);
  N = normalize(TBN * tn);

  /* Standing water: the fountain, and the puddle at the kerb. Two scrolling
   * wave trains and a fresnel sheen. */
  if (mb.x > 0.0) {
    float t = uTime * 0.5;
    vec2 w1 = vec2(sin(vPos.x * 2.3 + t * 1.1), cos(vPos.z * 2.0 - t * 0.9));
    vec2 w2 = vec2(sin(vPos.z * 3.9 - t * 0.6), cos(vPos.x * 3.3 + t * 0.8));
    vec3 wn = normalize(vec3((w1 + w2 * 0.5) * 0.05 * mb.x, 1.0));
    N = normalize(mix(N, TBN * wn, mb.x));
    rough = mix(rough, 0.04, mb.x);
    albedo = mix(albedo, albedo * 0.4, mb.x);
  }

  vec3 color = shade(vPos, N, V, albedo, rough, ma.w, vAO);

  /* Emissive surfaces — lit windows, the lamp glass, the flag. Pushed well
   * past 1.0 on purpose: that is what the bloom grabs, and a lit window at the
   * end of a dark street is the only landmark the player has. */
  color += albedo * emissive * 5.0 * flicker(uTime, vFlick);

  if (mb.x > 0.0) {
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    color += uFogColor * fres * 1.5 * mb.x;
  }

  /*
   * Fog, as a layer rather than a volume.
   *
   * The optical depth through a horizontal slab, integrated along the view
   * ray, is what makes a lawn at ankle height disappear while the roofline
   * above it stays sharp — and that difference is most of why a night scene
   * reads as outdoors. Uniform distance fog gives a flat grey wash and the
   * street looks like it is indoors in a large room.
   */
  vec3 d = vPos - uCamPos;
  float dist = length(d);
  float y0 = min(uCamPos.y, vPos.y), y1 = max(uCamPos.y, vPos.y);
  float top = uFogFloor + uFogHeight;
  float inLayer = max(0.0, min(y1, top) - max(y0, uFogFloor)) / max(1e-4, y1 - y0 + 1e-4);
  /* A ray entirely inside the layer gets the full density; one that only
   * clips the top of it gets a fraction. */
  float density = uFogDensity * mix(0.25, 1.0, clamp(inLayer, 0.0, 1.0));
  float f = 1.0 - exp(-pow(dist * density, 2.0));
  color = mix(color, uFogColor, clamp(f, 0.0, 1.0));

  oColor = vec4(color, 1.0);
}
`;

/* ------------------------------------------------------------------ *
 * Sky
 * ------------------------------------------------------------------ */

export const SKY_VERT = `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  /* Fullscreen triangle from the vertex id — no buffers bound. */
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SKY_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 oColor;

uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uGround;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform vec2 uScale;      /* tan(fov/2)*aspect, tan(fov/2) */
uniform float uTime;
uniform float uStars;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uMoonSize;  /* 0 = no disc                                   */

${COMMON}

void main() {
  vec2 ndc = vUV * 2.0 - 1.0;
  vec3 dir = normalize(uFwd + uRight * ndc.x * uScale.x + uUp * ndc.y * uScale.y);

  float h = dir.y;
  vec3 col = h > 0.0
    ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.6))
    : mix(uHorizon, uGround, pow(clamp(-h, 0.0, 1.0), 0.45));

  if (uStars > 0.0 && h > -0.02) {
    /*
     * Stars placed inside cells of a spherical grid rather than being the
     * cells themselves. The obvious version — hash a quantised direction and
     * light one cell in a few hundred — puts a *cell* on screen, and near the
     * horizon those are enormous, so the sky fills with white squares.
     */
    vec2 sph = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0)));
    vec2 g = sph * 104.0;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float s = hash12(id);
    vec2 jitter = vec2(hash12(id + 7.3), hash12(id + 19.1)) - 0.5;
    float d = length(f - jitter * 0.7);
    float star = step(0.988, s) * smoothstep(0.15, 0.0, d)
               * clamp(h * 4.0, 0.0, 1.0);
    col += vec3(0.85, 0.9, 1.0) * star * uStars
         * (0.55 + 0.45 * sin(uTime * 1.7 + s * 90.0));
  }

  if (uMoonSize > 0.0) {
    /* A low moon, and a halo around it that is doing most of the work: the
     * disc alone reads as a sticker, and the haze is what puts it behind the
     * same air the street is standing in. */
    float c = dot(dir, uMoonDir);
    float disc = smoothstep(1.0 - uMoonSize, 1.0 - uMoonSize * 0.55, c);
    float halo = pow(max(c, 0.0), 220.0) * 0.6 + pow(max(c, 0.0), 26.0) * 0.10;
    col += uMoonColor * (disc * 1.6 + halo);
  }
  oColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ *
 * Post chain
 * ------------------------------------------------------------------ */

export const POST_VERT = SKY_VERT;

export const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 oColor;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uSoft;

${COMMON}

void main() {
  vec3 c = vec3(0.0);
  c += texture(uTex, vUV + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uTex, vUV + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture(uTex, vUV + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;

  /* A soft knee, so a highlight crossing the threshold fades in rather than
   * popping — which on a flickering lamp is the difference between a lamp and
   * a strobe. */
  float l = luma(c);
  float knee = uThreshold * uSoft + 1e-5;
  float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  float contrib = max(soft, l - uThreshold) / max(l, 1e-4);
  oColor = vec4(c * contrib, 1.0);
}
`;

export const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 oColor;
uniform sampler2D uTex;
uniform vec2 uDir;

void main() {
  /* Nine-tap gaussian folded into five linear samples. */
  vec3 c = texture(uTex, vUV).rgb * 0.2270270270;
  c += texture(uTex, vUV + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUV - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUV + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uTex, vUV - uDir * 3.2307692308).rgb * 0.0702702703;
  oColor = vec4(c, 1.0);
}
`;

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 oColor;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2  uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uBloomAmount;
uniform float uVignette;
uniform float uGrain;
uniform float uAberration;
uniform float uFear;        /* 0 = fine, 1 = she is looking at you           */
uniform float uGlitch;      /* the reset, and nothing else                   */
uniform float uFlashAmt;
uniform vec3  uTint;

${COMMON}

/* ACES filmic curve (Narkowicz fit). The toe is the important part: it keeps
 * the shadows off pure black, which is what a real camera does in a dark
 * street, and what makes the fog read as air rather than as paint. */
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = vUV;

  /*
   * The reset glitch. Only ever runs for about half a second, when she has
   * caught you and the night is being taken away: the frame tears into
   * horizontal bands that slide, which is the cheapest honest way to say
   * "this is not a cut, something has gone wrong with the recording".
   */
  if (uGlitch > 0.0) {
    float band = floor(uv.y * 22.0 + uTime * 3.0);
    float shift = (hash12(vec2(band, floor(uTime * 18.0))) - 0.5);
    uv.x += shift * 0.12 * uGlitch;
    uv.y += (hash12(vec2(band * 1.7, 3.0)) - 0.5) * 0.02 * uGlitch;
  }

  /* Fear pulls the image in and lets it breathe. It is driven by how much of
   * her attention you have, so the player feels it before the HUD says it. */
  if (uFear > 0.001) {
    float wob = sin(uTime * 2.3 + uv.y * 11.0) * 0.0018 * uFear;
    uv.x += wob;
    uv += (uv - 0.5) * sin(uTime * 1.1) * 0.008 * uFear;
  }

  /* Radial chromatic aberration, stronger at the edges like a real cheap lens
   * rather than uniform across the frame. */
  vec2 dir = uv - 0.5;
  float r2 = dot(dir, dir);
  float ab = (uAberration + uFear * 0.004) * (0.3 + r2 * 2.0);
  vec3 scene;
  scene.r = texture(uScene, uv + dir * ab).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - dir * ab).b;

  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 col = scene + bloom * uBloomAmount;

  col *= uExposure;
  col *= uTint;
  col = aces(col);

  float vig = 1.0 - uVignette * r2 * 2.2;
  vig *= 1.0 - uFear * r2 * 2.4;
  col *= clamp(vig, 0.0, 1.0);

  /* Grain, scaled by how dark the pixel is: sensor noise lives in the
   * shadows, and uniform grain over a lamp looks like dirt on the lens. */
  float g = hash12(gl_FragCoord.xy + fract(uTime) * 719.0) - 0.5;
  col += g * uGrain * (1.3 - luma(col)) * (1.0 + uFear * 1.5);

  if (uFlashAmt > 0.0) col = mix(col, vec3(1.0), uFlashAmt);

  /* Ordered dither before the 8-bit write. Without it the fog gradient bands
   * badly on a dark screen, which is exactly where this game lives. */
  col += (hash12(gl_FragCoord.xy * 1.7) - 0.5) / 255.0;

  oColor = vec4(col, 1.0);
}
`;
