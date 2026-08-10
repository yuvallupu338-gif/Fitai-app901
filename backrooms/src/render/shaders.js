/*
 * shaders.js — every GLSL source in the game, as tagged strings.
 *
 * The look this is chasing is a specific one: a cheap camcorder in a room lit
 * only by fluorescent tubes. That is almost entirely a lighting-and-lens
 * problem, not a geometry problem, so the effort here goes into
 *
 *   - punchy local point lights with real falloff and a cheap occlusion march,
 *     so a doorway actually reads as a doorway and rooms fall off into black;
 *   - normal-mapped surfaces, because flat carpet and flat wallpaper are the
 *     single biggest tell that something is a video game;
 *   - blown-out highlights that bleed (bloom) and a lens that is not perfect
 *     (vignette, chromatic aberration, grain).
 *
 * Everything is rendered linear into a half-float target and tone-mapped once,
 * at the end. Doing the tone map anywhere else is what makes fluorescent light
 * look like grey paint.
 */

/* ------------------------------------------------------------------ *
 * Shared GLSL
 * ------------------------------------------------------------------ */

const COMMON = `
const float PI = 3.14159265359;

/* Fluorescent tubes do not blink on and off. They sit at ~99% and drop out for
 * a few milliseconds at a time, with a slow beat under it from the ballast.
 * The phase argument is per-fixture so a corridor does not pulse in unison. */
float flicker(float t, float phase) {
  if (phase < 0.0) return 1.0;
  float p = phase * 37.0;
  float slow = 0.94 + 0.06 * sin(t * 1.7 + p * 6.283);
  float beat = sin(t * 27.0 + p * 12.0) * 0.5 + 0.5;
  float dropout = step(0.985, fract(sin(floor(t * 11.0 + p * 50.0) * 12.9898) * 43758.5453));
  return slow * (1.0 - 0.10 * beat * beat) * (1.0 - 0.75 * dropout);
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
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
  /* Models are rigid (translate + yaw only), so the normal matrix is the model
   * matrix — no inverse-transpose needed and no per-draw CPU work. */
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

uniform sampler2DArray uAlbedo;   /* rgb albedo (sRGB), a = roughness         */
uniform sampler2DArray uNormalTex;/* rg normal, b = height/mask, a = emissive  */
uniform sampler2D uOcc;           /* wall height field around the player       */

uniform vec3  uCamPos;
uniform float uTime;

#define MAX_LIGHTS 16
uniform int   uLightCount;
uniform vec4  uLightPos[MAX_LIGHTS];    /* xyz position, w radius              */
uniform vec4  uLightColor[MAX_LIGHTS];  /* rgb colour, w intensity             */

uniform vec3  uAmbient;
uniform vec3  uAmbientDir;              /* where the ambient mostly comes from */
uniform vec3  uFogColor;
uniform float uFogDensity;
uniform float uFogHeight;               /* 0 = uniform fog, >0 = ground fog    */

#define MAX_MATS 12
uniform vec4 uMatA[MAX_MATS];  /* uvScale, roughnessMul, emissive, specular    */
uniform vec4 uMatB[MAX_MATS];  /* water, normalStrength, alphaCut, tintAmount  */
uniform vec4 uMatTint[MAX_MATS];

uniform vec4 uOccRect;      /* originX, originZ, cellSize, texels             */
uniform int  uShadowLights; /* how many of the nearest lights cast            */

uniform vec4 uFlash;        /* intensity, cosInner, cosOuter, range           */
uniform vec3 uFlashDir;

${COMMON}

/*
 * Occlusion march. The world is a height field on a grid, so "is this point in
 * shadow" is a 2D walk with a height compare — no shadow maps, no extra passes,
 * and it costs nothing when the level has no walls (outdoor levels set
 * uShadowLights to 0).
 *
 * Counting blocked samples instead of stopping at the first one gives a soft
 * edge for free. It is not a real penumbra, but at fog distances nobody has
 * ever noticed, and a hard stencil edge here looks instantly synthetic.
 */
float visibility(vec3 P, vec3 L) {
  vec3 d = L - P;
  float len = length(d);
  if (len < 0.05) return 1.0;
  const int STEPS = 10;
  float blocked = 0.0;
  for (int i = 1; i <= STEPS; i++) {
    float t = float(i) / float(STEPS + 1);
    vec3 p = P + d * t;
    vec2 uv = (p.xz - uOccRect.xy) / (uOccRect.z * uOccRect.w);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
    float h = texture(uOcc, uv).r * 12.0;
    blocked += step(p.y + 0.06, h);
  }
  return clamp(1.0 - blocked / float(STEPS) * 1.6, 0.0, 1.0);
}

/*
 * Wrapped diffuse. A fluorescent fixture is a metre-long panel, not a point,
 * and a point light gets one thing badly wrong: everything at a grazing angle
 * goes black. That is why a naive version of this renderer draws a pitch-black
 * ceiling with a bright rectangle in it — the ceiling is coplanar with its own
 * fixtures, so N·L is ~0 everywhere except directly beneath them.
 *
 * Wrapping the diffuse term pushes the terminator past ninety degrees, which
 * is what an area source actually does. It is one instruction and it is the
 * difference between "a room" and "a hole with a light in it".
 */
#define WRAP 0.32

vec3 shade(vec3 P, vec3 N, vec3 V, vec3 albedo, float rough, float spec, float ao) {
  float shin = exp2(11.0 * (1.0 - rough) + 1.0);
  vec3 sum = vec3(0.0);

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

    /* Inverse-square with a window that reaches exactly zero at the radius, so
     * a light can be culled at its radius without a visible seam. */
    float w = clamp(1.0 - dist / radius, 0.0, 1.0);
    float atten = w * w / (1.0 + dist * dist * 0.35);

    float vis = 1.0;
    if (i < uShadowLights) vis = visibility(P, Lp);

    vec3 H = normalize(L + V);
    float s = pow(max(dot(N, H), 0.0), shin) * spec * (0.25 + 0.75 * rough * rough);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(H, V), 0.0), 5.0);

    sum += uLightColor[i].rgb * uLightColor[i].w * atten * vis
         * (albedo * ndl + vec3(s * fres * 4.0));
  }

  /* Flashlight: a cone from the eye. Held low and slightly right, which is why
   * it is offset from the camera rather than dead centre — a torch exactly on
   * the view axis produces a flat, shadowless image. */
  if (uFlash.x > 0.0) {
    vec3 origin = uCamPos + vec3(0.0, -0.18, 0.0);
    vec3 d = origin - P;
    float dist = length(d);
    vec3 L = d / max(dist, 0.001);
    float ndl = max(dot(N, L), 0.0);
    float cone = smoothstep(uFlash.z, uFlash.y, dot(-L, uFlashDir));
    float atten = clamp(1.0 - dist / uFlash.w, 0.0, 1.0);
    atten = atten * atten / (1.0 + dist * dist * 0.08);
    vec3 H = normalize(L + V);
    float s = pow(max(dot(N, H), 0.0), shin) * spec;
    sum += vec3(1.0, 0.96, 0.88) * uFlash.x * cone * atten
         * (albedo * ndl + vec3(s * 2.0));
  }

  /* Hemisphere ambient: full strength facing the sky (or the ceiling), a bit
   * under half facing the ground. Flat ambient is the other big tell — it
   * erases every normal map in the frame the moment the point lights fall off
   * — but a hemisphere that reaches zero underneath is just as wrong, because
   * every floor in the world bounces something back up. */
  float amb = mix(0.46, 1.0, dot(N, uAmbientDir) * 0.5 + 0.5);
  sum += uAmbient * albedo * amb * ao;
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

  if (mb.z > 0.0 && nrm.b < mb.z) discard;   /* cutout foliage, fences, mesh   */

  vec3 albedo = mix(alb.rgb, alb.rgb * uMatTint[vMat].rgb, mb.w);
  float rough = clamp(alb.a * ma.y, 0.04, 1.0);
  float emissive = nrm.a * ma.z;

  /* Tangent-space normal. The strength control matters more than it looks:
   * carpet wants a lot, painted drywall wants almost none, and using the same
   * number for both is what makes everything read as plastic. */
  vec3 tn = vec3(nrm.rg * 2.0 - 1.0, 0.0);
  tn.xy *= mb.y;
  tn.z = sqrt(max(0.0001, 1.0 - dot(tn.xy, tn.xy)));
  mat3 TBN = mat3(normalize(vTan), normalize(vBit), N);
  N = normalize(TBN * tn);

  /* Water: two scrolling wave trains, a hard specular and a fresnel sheen.
   * Standing water is everywhere in these rooms and it is the one surface that
   * gives away a flat-lit renderer instantly. */
  if (mb.x > 0.0) {
    float t = uTime * 0.6;
    vec2 w1 = vec2(sin(vPos.x * 2.1 + t * 1.3), cos(vPos.z * 1.9 - t * 1.1));
    vec2 w2 = vec2(sin(vPos.z * 3.7 - t * 0.7), cos(vPos.x * 3.1 + t * 0.9));
    vec3 wn = normalize(vec3((w1 + w2 * 0.5) * 0.06 * mb.x, 1.0));
    N = normalize(mix(N, TBN * wn, mb.x));
    rough = mix(rough, 0.04, mb.x);
    albedo = mix(albedo, albedo * 0.35, mb.x);
  }

  float ao = vAO;
  vec3 color = shade(vPos, N, V, albedo, rough, ma.w, ao);

  /* Emissive surfaces are the light fixtures themselves. They are pushed well
   * past 1.0 on purpose: that is what gives the bloom something to grab and
   * what makes a ceiling panel read as "too bright to look at". */
  color += albedo * emissive * 6.0 * flicker(uTime, vFlick);

  if (mb.x > 0.0) {
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    color += uFogColor * fres * 1.4 * mb.x;
  }

  /* Fog. Height falloff lets outdoor levels keep a clear sky while the ground
   * haze closes in, which is the whole trick for "endless field". */
  float dist = length(uCamPos - vPos);
  float density = uFogDensity;
  if (uFogHeight > 0.0) {
    density *= exp(-max(0.0, vPos.y - 1.0) / uFogHeight);
  }
  float f = 1.0 - exp(-pow(dist * density, 2.0));
  color = mix(color, uFogColor, clamp(f, 0.0, 1.0));

  oColor = vec4(color, 1.0);
}
`;

/* ------------------------------------------------------------------ *
 * Sky / backdrop
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
uniform vec2 uScale;    /* tan(fov/2)*aspect, tan(fov/2) */
uniform float uTime;
uniform float uStars;

${COMMON}

void main() {
  /* View ray straight from the camera basis. Cheaper than unprojecting, and
   * it cannot go wrong when the projection is unusual. */
  vec2 ndc = vUV * 2.0 - 1.0;
  vec3 dir = normalize(uFwd + uRight * ndc.x * uScale.x + uUp * ndc.y * uScale.y);

  float h = dir.y;
  vec3 col = h > 0.0
    ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.65))
    : mix(uHorizon, uGround, pow(clamp(-h, 0.0, 1.0), 0.5));

  if (uStars > 0.0 && h > -0.02) {
    /* Cheap stars: quantise the direction and light one cell in a few hundred.
     * Under the grain and the tone map, that is indistinguishable from a real
     * star field and costs two instructions. */
    vec2 g = floor(dir.xz / max(0.02, 0.02) + dir.y * 13.0);
    float s = hash12(g);
    float star = smoothstep(0.9975, 1.0, s) * clamp(h * 3.0, 0.0, 1.0);
    col += vec3(0.9, 0.93, 1.0) * star * uStars
         * (0.6 + 0.4 * sin(uTime * 2.0 + s * 90.0));
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
  /* 4-tap box downsample with a soft knee. The knee is what keeps the bloom
   * from popping on and off as a highlight crosses the threshold. */
  vec3 c = vec3(0.0);
  c += texture(uTex, vUV + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uTex, vUV + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture(uTex, vUV + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;

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
uniform vec2 uDir;      /* texel-sized step, horizontal or vertical */

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
uniform float uVHS;         /* 0 = clean digital, 1 = tape                     */
uniform float uSanity;      /* 1 = fine, 0 = coming apart                      */
uniform float uDamage;      /* red flash on being hurt                         */
uniform vec3  uTint;

${COMMON}

/* ACES filmic curve (Narkowicz fit). The important part is the toe: it keeps
 * the shadows from crushing to pure black, which is what a real camera does in
 * a dark room, and what makes the fog read as air rather than as paint. */
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = vUV;

  /* Tape wobble: a slow horizontal offset that varies down the frame, plus the
   * occasional torn line. Off by default; the levels that switch it on are the
   * ones where the conceit is that you are watching a recording. */
  if (uVHS > 0.0) {
    float line = floor(uv.y * uResolution.y);
    float jitter = (hash12(vec2(line, floor(uTime * 24.0))) - 0.5) * 0.0025;
    float tear = step(0.9985, hash12(vec2(line * 0.7, floor(uTime * 12.0))));
    uv.x += (jitter + tear * (hash12(vec2(line, uTime)) - 0.5) * 0.05) * uVHS;
  }

  /* Sanity pulls the image apart: the lens breathes and the edges swim. */
  float ins = 1.0 - uSanity;
  if (ins > 0.001) {
    float wob = sin(uTime * 1.7 + uv.y * 9.0) * 0.0016 * ins;
    uv.x += wob;
    uv += (uv - 0.5) * sin(uTime * 0.9) * 0.01 * ins;
  }

  /* Chromatic aberration, radial and stronger at the edges like a real cheap
   * lens rather than uniform across the frame. */
  vec2 dir = uv - 0.5;
  float r2 = dot(dir, dir);
  float ab = (uAberration + ins * 0.004) * (0.3 + r2 * 2.0);
  vec3 scene;
  scene.r = texture(uScene, uv + dir * ab).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - dir * ab).b;

  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 col = scene + bloom * uBloomAmount;

  col *= uExposure;
  col *= uTint;
  col = aces(col);

  /* Vignette. Two terms: the lens falloff, and a much tighter one driven by
   * sanity that closes the frame down to a tunnel. */
  float vig = 1.0 - uVignette * r2 * 2.2;
  vig *= 1.0 - ins * r2 * 3.0;
  col *= clamp(vig, 0.0, 1.0);

  if (uDamage > 0.0) {
    col = mix(col, vec3(0.45, 0.03, 0.03), uDamage * (0.25 + r2 * 1.6));
  }

  /* Grain, scaled by how dark the pixel is — sensor noise lives in the
   * shadows, and uniform grain over a bright panel looks like dirt. */
  float g = hash12(gl_FragCoord.xy + fract(uTime) * 719.0) - 0.5;
  col += g * uGrain * (1.25 - luma(col)) * (1.0 + ins);

  if (uVHS > 0.0) {
    float scan = 0.94 + 0.06 * sin(vUV.y * uResolution.y * 3.14159);
    col *= mix(1.0, scan, uVHS * 0.6);
  }

  /* Ordered dither before the 8-bit write: without it, the fog gradient bands
   * badly on a dark screen, which is exactly where this game lives. */
  col += (hash12(gl_FragCoord.xy * 1.7) - 0.5) / 255.0;

  oColor = vec4(col, 1.0);
}
`;
