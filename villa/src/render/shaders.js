/*
 * shaders.js — the villa's lighting, and the lens it is seen through.
 *
 * Four programs and no more:
 *
 *   scene       every surface, lit by up to sixteen point lights and the
 *               torch, into a half-float target;
 *   bright      threshold for bloom;
 *   blur        separable gaussian, run a few times;
 *   composite   bloom back in, ACES, vignette, aberration, grain, dither.
 *
 * There is no shadow map and no deferred pass. In a house this small the
 * budget is better spent on the lighting itself: real inverse-square falloff,
 * per-vertex ambient occlusion baked at mesh time, normal maps that agree with
 * the albedo because both come out of the same height field, and a torch cone
 * with a soft edge. The dark line where a wall meets the floor is doing more
 * work than any shadow map would.
 *
 * The one thing this does that a brighter game would not bother with: every
 * surface carries a *flicker group*. A villa where one bulb is failing is
 * worth more than a villa with perfect lighting, and grouping it per-vertex
 * means the kitchen tube can stutter while the hall lamp holds steady, at no
 * cost beyond a float already in the vertex.
 */

export const MAX_LIGHTS = 16;

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

out vec3 vPos;
out vec3 vNrm;
out vec2 vUV;
out vec3 vTan;
out vec3 vBit;
out float vAO;
out float vFlick;
flat out int vMat;

void main() {
  vPos = aPos;
  vNrm = aNrm;
  vUV = aUV;
  vTan = aTan.xyz;
  vBit = cross(aNrm, aTan.xyz) * aTan.w;
  vAO = aAO;
  vFlick = aFlick;
  vMat = int(aMat + 0.5);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

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

uniform sampler2DArray uAlbedo;
uniform sampler2DArray uNormal;

uniform vec3 uEye;
uniform vec3 uAmbient;

uniform int  uLightCount;
uniform vec3 uLightPos[${MAX_LIGHTS}];
uniform vec3 uLightColor[${MAX_LIGHTS}];
uniform float uLightRange[${MAX_LIGHTS}];

/* The torch. A cone with a soft edge and its own falloff, because it is the
 * player's only reliable light and it has to feel like it is in their hands. */
uniform vec3 uTorchPos;
uniform vec3 uTorchDir;
uniform float uTorchInner;
uniform float uTorchOuter;
uniform float uTorchRange;
uniform float uTorchLevel;

uniform vec3 uFogColor;
uniform float uFogDensity;

/* Per-group flicker, computed once on the CPU and handed in. Index 0 is
 * always 1.0 — surfaces that do not flicker. */
uniform float uFlicker[8];

uniform float uCutout;

out vec4 fragColor;

void main() {
  vec4 alb = texture(uAlbedo, vec3(vUV, float(vMat)));
  vec4 nsm = texture(uNormal, vec3(vUV, float(vMat)));

  /* Cut-out materials (the tape, chiefly) put coverage in the normal map's
   * blue channel. Discarding rather than blending keeps them out of the depth
   * buffer's way and avoids sorting an alpha pass. */
  if (uCutout > 0.0 && nsm.b < uCutout) discard;

  vec3 nT = vec3(nsm.rg * 2.0 - 1.0, 0.0);
  nT.z = sqrt(max(0.0, 1.0 - dot(nT.xy, nT.xy)));
  vec3 N = normalize(vTan * nT.x + vBit * nT.y + vNrm * nT.z);

  vec3 V = normalize(uEye - vPos);
  float rough = clamp(alb.a, 0.05, 1.0);
  float shine = mix(90.0, 4.0, rough);
  float specK = mix(0.35, 0.02, rough);

  int group = int(clamp(vFlick, 0.0, 7.0) + 0.5);
  float flick = uFlicker[group];

  vec3 lit = uAmbient * vAO;

  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 d = uLightPos[i] - vPos;
    float dist = length(d);
    if (dist > uLightRange[i]) continue;
    vec3 L = d / max(dist, 0.0001);
    float ndl = max(dot(N, L), 0.0);
    if (ndl <= 0.0) continue;

    /* Real inverse square, windowed so it reaches zero at the range rather
     * than being clipped there — a light that stops abruptly draws a visible
     * circle on the floor. */
    float t = dist / uLightRange[i];
    float win = clamp(1.0 - t * t * t * t, 0.0, 1.0);
    float atten = win * win / (1.0 + dist * dist);

    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), shine) * specK;
    lit += uLightColor[i] * atten * (ndl + spec) * mix(1.0, flick, 0.85);
  }

  if (uTorchLevel > 0.0) {
    vec3 d = uTorchPos - vPos;
    float dist = length(d);
    vec3 L = d / max(dist, 0.0001);
    float cone = dot(-L, uTorchDir);
    float edge = smoothstep(uTorchOuter, uTorchInner, cone);
    if (edge > 0.0 && dist < uTorchRange) {
      float ndl = max(dot(N, L), 0.0);
      float t = dist / uTorchRange;
      float win = clamp(1.0 - t * t * t * t, 0.0, 1.0);
      float atten = win * win / (1.0 + dist * dist * 0.6);
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), shine) * specK;
      lit += vec3(1.0, 0.94, 0.84) * uTorchLevel * edge * atten * (ndl + spec) * 3.2;
    }
  }

  vec3 color = alb.rgb * lit;
  color += alb.rgb * nsm.a * 2.4;          /* emissive rides in normal.a */

  /* Exponential-squared fog. In a house it is not weather — it is the reason
   * the far end of the hall goes to nothing. */
  float dist = length(uEye - vPos);
  float f = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  color = mix(color, uFogColor, clamp(f, 0.0, 1.0));

  fragColor = vec4(color, 1.0);
}`;

/* ------------------------------------------------------------------ *
 * Post
 * ------------------------------------------------------------------ */

/*
 * One oversized triangle, with no vertex buffer at all: the position comes out
 * of gl_VertexID. A quad would need two triangles and put a diagonal seam
 * down the middle of every full-screen pass, which the blur finds.
 */
export const POST_VERT = `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 fragColor;
void main() {
  vec3 c = texture(uTex, vUV).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(0.0, l - uThreshold) / max(l, 0.0001);
  fragColor = vec4(c * k, 1.0);
}`;

export const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 fragColor;
void main() {
  /* Nine taps, five samples, using the hardware's bilinear filter to get two
   * taps for the price of one. */
  vec3 c = texture(uTex, vUV).rgb * 0.2270270270;
  c += texture(uTex, vUV + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUV - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUV + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uTex, vUV - uDir * 3.2307692308).rgb * 0.0702702703;
  fragColor = vec4(c, 1.0);
}`;

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomAmount;
uniform float uExposure;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;
uniform float uAberration;
/* Rises with the danger meter: the edges close in and the grain comes up.
 * The cheapest way to make a player feel something is to make the room feel
 * it first. */
uniform float uStress;
out vec4 fragColor;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = vUV;
  vec2 fromCentre = uv - 0.5;

  float ab = uAberration * (1.0 + uStress * 3.0);
  vec3 col;
  col.r = texture(uScene, uv + fromCentre * ab).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - fromCentre * ab).b;

  col += texture(uBloom, uv).rgb * uBloomAmount;
  col = aces(col * uExposure);

  float d = length(fromCentre * vec2(1.0, 0.86));
  float vig = smoothstep(0.86, 0.28, d);
  col *= mix(1.0, vig, uVignette * (1.0 + uStress * 0.5));

  float g = hash(uv * 1024.0 + fract(uTime) * 91.7) - 0.5;
  col += g * (uGrain + uStress * 0.05);

  /* Ordered dither, so a very dark room does not band. Almost the whole game
   * happens below 0.1 luminance, where eight bits is not many. */
  float dither = hash(uv * 512.0 + 7.0) / 255.0;
  fragColor = vec4(col + dither, 1.0);
}`;
