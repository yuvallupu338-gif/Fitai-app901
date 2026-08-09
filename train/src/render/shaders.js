/*
 * shaders.js — every GLSL program in the game.
 *
 * Forward shading with a bounded point-light array. A carriage is a corridor
 * lit by six fluorescent strips and nothing else reaches it, so there is never
 * a reason for a deferred pass; picking the nearest lights per draw keeps the
 * loop short even when four carriages are in view.
 *
 * There is no shadow map. Shadows here are baked: the geometry builder writes
 * an occlusion term into the vertex colour's alpha, and characters drop a
 * cheap contact blob. Under flat overhead fluorescents that reads correctly,
 * and it leaves the frame budget for the reflections, which are the effect the
 * game actually depends on.
 */

export const MAX_LIGHTS = 12;

const COMMON = `
precision highp float;
precision highp int;
const int MAX_LIGHTS = ${MAX_LIGHTS};
`;

export const SCENE_VS = `#version 300 es
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
layout(location = 3) in vec4 aColor;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform vec4 uUVTransform;   // xy scale, zw offset
uniform float uTime;
/* Amplitude, frequency, phase, and the height the object hangs from. Used by
   the grab handles, which swing from an overhead rail: displacement grows with
   distance below the pivot, and the phase runs along the carriage so the whole
   row does not move as one bar. */
uniform vec4 uWobble;

out vec3 vWorld;
out vec3 vNormal;
out vec2 vUV;
out vec4 vColor;

void main() {
  vec3 p = aPos;
  if (uWobble.x > 0.0) {
    float hang = max(0.0, uWobble.w - p.y);
    float w = sin(uTime * uWobble.y + p.z * 1.7 + uWobble.z);
    p.x += w * uWobble.x * hang;
    p.z += cos(uTime * uWobble.y * 0.83 + p.z * 1.3 + uWobble.z) * uWobble.x * hang * 0.5;
  }
  vec4 world = uModel * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(uNormalMat * aNormal);
  vUV = aUV * uUVTransform.xy + uUVTransform.zw;
  vColor = aColor;
  gl_Position = uProj * uView * world;
}
`;

export const SCENE_FS = `#version 300 es
${COMMON}
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUV;
in vec4 vColor;

uniform sampler2D uMap;
uniform vec4 uBaseColor;        // rgb tint, a alpha
uniform vec3 uEmissive;
uniform float uEmissiveScale;
uniform float uSpecular;
uniform float uShininess;
uniform float uUnlit;
uniform vec3 uAmbient;
uniform vec3 uCameraPos;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uLightScale;      // global dimmer, driven by flicker + blackouts
uniform int uLightCount;
uniform vec4 uLightPos[MAX_LIGHTS];    // xyz position, w radius
uniform vec4 uLightColor[MAX_LIGHTS];  // rgb colour * intensity, w unused
uniform float uAlphaCutoff;
uniform float uTime;

out vec4 fragColor;

void main() {
  vec4 tex = texture(uMap, vUV);
  vec3 albedo = tex.rgb * uBaseColor.rgb * vColor.rgb;
  float alpha = tex.a * uBaseColor.a;
  if (alpha < uAlphaCutoff) discard;

  float ao = vColor.a;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorld);
  if (!gl_FrontFacing) N = -N;

  vec3 lit = uAmbient * ao;

  if (uUnlit < 0.5) {
    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= uLightCount) break;
      vec3 lp = uLightPos[i].xyz;
      float radius = uLightPos[i].w;
      vec3 toLight = lp - vWorld;
      float dist = length(toLight);
      if (dist > radius) continue;
      vec3 L = toLight / max(dist, 0.0001);
      float att = 1.0 - dist / radius;
      att = att * att;
      float ndl = max(dot(N, L), 0.0);
      /* A little wrap-around: bare tubes in a metal tube bounce enough that a
         face turned away is dim rather than black. Kept small — at 0.35 the
         ceiling directly above the fittings came back brighter than the walls
         they were actually pointed at, and the eye went straight to it. */
      float wrapped = (ndl + 0.16) / 1.16;
      vec3 contrib = uLightColor[i].rgb * wrapped * att;

      if (uSpecular > 0.0) {
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), uShininess) * uSpecular;
        contrib += uLightColor[i].rgb * spec * att;
      }
      lit += contrib * mix(0.74, 1.0, ao);
    }
    lit *= uLightScale;
  } else {
    lit = vec3(1.0);
  }

  vec3 color = albedo * lit + uEmissive * uEmissiveScale * tex.rgb;

  float dist = length(uCameraPos - vWorld);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

  fragColor = vec4(color, alpha);
}
`;

/*
 * Glass. The reflection texture holds the carriage rendered from a camera
 * mirrored through this pane, so the fragment only has to work out where it
 * lands in that image and how strongly to show it. Fresnel does the rest: at a
 * glancing angle a night train window is a mirror, straight on it is a hole
 * into the tunnel.
 */
export const GLASS_VS = `#version 300 es
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
layout(location = 3) in vec4 aColor;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform mat4 uReflProjView;
uniform vec4 uUVTransform;

out vec3 vWorld;
out vec3 vNormal;
out vec2 vUV;
out vec4 vColor;
out vec4 vReflCoord;

void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(uNormalMat * aNormal);
  vUV = aUV * uUVTransform.xy + uUVTransform.zw;
  vColor = aColor;
  vReflCoord = uReflProjView * world;
  gl_Position = uProj * uView * world;
}
`;

export const GLASS_FS = `#version 300 es
${COMMON}
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUV;
in vec4 vColor;
in vec4 vReflCoord;

uniform sampler2D uReflection;
uniform sampler2D uSmudge;
uniform vec3 uCameraPos;
uniform vec3 uGlassTint;
uniform float uReflStrength;
uniform float uSmudgeAmount;
uniform float uTime;
uniform float uRainSpeed;
uniform float uWarp;          // anomaly hook: bends what the glass shows back

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorld);
  if (!gl_FrontFacing) N = -N;
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
  /* A high floor on purpose. Physically a pane seen head-on reflects a few
     per cent, but at night, with a lit carriage on one side and a tunnel on
     the other, the eye reads the window as a mirror from almost every angle —
     and the reflection is a mechanic here, not a garnish. */
  fres = mix(0.30, 1.0, fres);

  vec4 smudge = texture(uSmudge, vUV);
  /* Condensation streaks drift down while the train is moving. */
  float streak = texture(uSmudge, vUV * vec2(1.0, 0.5) + vec2(0.0, uTime * uRainSpeed)).g;

  vec3 refl = vec3(0.0);
  if (uReflStrength > 0.0 && vReflCoord.w > 0.0) {
    vec2 uv = vReflCoord.xy / vReflCoord.w * 0.5 + 0.5;
    uv += (smudge.rg - 0.5) * 0.012 * uSmudgeAmount;
    uv.x += sin(uv.y * 30.0 + uTime * 1.7) * 0.004 * uWarp;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      refl = texture(uReflection, uv).rgb;
    }
  }

  vec3 color = refl * uReflStrength * fres + uGlassTint * 0.5;
  color += vec3(0.55, 0.62, 0.7) * streak * 0.05 * uSmudgeAmount;

  /* Capped below opaque. A pane at a grazing angle really does mirror almost
     everything, but the near windows then become the brightest thing in the
     carriage and the eye never gets past them. */
  float alpha = clamp(fres * uReflStrength * 1.05 + uSmudgeAmount * smudge.a * 0.20 + 0.06, 0.0, 0.85);
  fragColor = vec4(color, alpha);
}
`;

export const POST_VS = `#version 300 es
${COMMON}
layout(location = 0) in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const BRIGHT_FS = `#version 300 es
${COMMON}
in vec2 vUV;
uniform sampler2D uSource;
uniform float uThreshold;
uniform float uKnee;
uniform float uExposure;
out vec4 fragColor;
void main() {
  /* Thresholded after exposure, the same as the composite sees it. Against the
     raw scene the whole carriage sat above the threshold and the "bloom" was a
     blurred copy of the entire frame laid back over itself. */
  vec3 c = texture(uSource, vUV).rgb * uExposure;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w = clamp((lum - uThreshold) / max(uKnee, 0.0001), 0.0, 1.0);
  fragColor = vec4(c * w, 1.0);
}
`;

export const BLUR_FS = `#version 300 es
${COMMON}
in vec2 vUV;
uniform sampler2D uSource;
uniform vec2 uDirection;   // texel-sized step along one axis
out vec4 fragColor;
void main() {
  vec3 sum = texture(uSource, vUV).rgb * 0.227027;
  vec2 o1 = uDirection * 1.3846153846;
  vec2 o2 = uDirection * 3.2307692308;
  sum += texture(uSource, vUV + o1).rgb * 0.3162162162;
  sum += texture(uSource, vUV - o1).rgb * 0.3162162162;
  sum += texture(uSource, vUV + o2).rgb * 0.0702702703;
  sum += texture(uSource, vUV - o2).rgb * 0.0702702703;
  fragColor = vec4(sum, 1.0);
}
`;

export const COMPOSITE_FS = `#version 300 es
${COMMON}
in vec2 vUV;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomAmount;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;
uniform float uChromatic;
uniform float uBrightness;
uniform float uFade;          // 1 = fully black, used for blinks and cuts
uniform vec3 uFadeColor;
uniform float uDistort;       // anomaly hook: a slow lens breathing
uniform float uScanline;      // security-camera look
uniform float uDesaturate;
uniform vec2 uResolution;
uniform float uPulse;         // heartbeat-ish edge darkening
uniform float uSharpen;       // unsharp mask against the softening of the chain
uniform float uContrast;
uniform float uExposure;
uniform vec2 uTexel;

out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

/*
 * Soft shoulder. Everything under 0.7 is left exactly alone and everything
 * above it is compressed toward white instead of hitting it. A carriage has
 * two bare fluorescent tubes and a platform full of them in the same frame,
 * and without this the tubes clip flat and drag every surface near them up
 * with them — which is what turns a lit train into a white smear.
 */
vec3 shoulder(vec3 c) {
  vec3 over = max(c - 0.66, vec3(0.0));
  return min(c, vec3(0.66)) + over / (1.0 + over * 2.2);
}

/*
 * Soft toe. Whatever the contrast pushes below the toe height comes back as a
 * very dark value instead of as a hole: the curve keeps its slope at the knee
 * and decays from there, so it never actually reaches zero. A carriage with
 * holes punched in it is a carriage whose shape the player cannot read, and
 * the corners of this one are where the game keeps everything worth seeing.
 */
vec3 toe(vec3 c, float t) {
  /* The exponent is clamped at zero before exp sees it. Unclamped, a highlight
     at 0.7 asks for exp(24) — which overflows mediump to infinity, and
     mix(inf, c, 1.0) is NaN, not c. The whole ceiling came back as flat red
     and green confetti. */
  vec3 e = min((c - t) / t, vec3(0.0));
  return mix(t * exp(e), c, step(vec3(t), c));
}

void main() {
  vec2 uv = vUV;
  vec2 centered = uv - 0.5;
  float r2 = dot(centered, centered);

  if (uDistort != 0.0) {
    float breathe = sin(uTime * 0.7) * 0.5 + 0.5;
    uv = 0.5 + centered * (1.0 + uDistort * (0.02 + breathe * 0.03) * r2 * 4.0);
  }

  vec3 color;
  if (uSharpen > 0.0) {
    /* A four-tap unsharp mask. Bloom, aberration and grain each take a little
       definition out of the image and together they take a lot; this puts the
       edges back without pretending to be more resolution than there is. */
    vec3 c = texture(uScene, uv).rgb;
    vec3 blur = texture(uScene, uv + vec2(uTexel.x, 0.0)).rgb
              + texture(uScene, uv - vec2(uTexel.x, 0.0)).rgb
              + texture(uScene, uv + vec2(0.0, uTexel.y)).rgb
              + texture(uScene, uv - vec2(0.0, uTexel.y)).rgb;
    color = c + (c - blur * 0.25) * uSharpen;
  } else if (uChromatic > 0.0) {
    /* Aberration grows toward the edges — at the centre the image stays
       clean, which is what keeps it from reading as a filter. */
    vec2 shift = centered * uChromatic * (0.0016 + r2 * 0.006);
    color.r = texture(uScene, uv + shift).r;
    color.g = texture(uScene, uv).g;
    color.b = texture(uScene, uv - shift).b;
  } else {
    color = texture(uScene, uv).rgb;
  }

  if (uSharpen > 0.0 && uChromatic > 0.0) {
    /* Aberration on top of the sharpened image, as a small offset rather than
       a second full resample. */
    vec2 shift = centered * uChromatic * (0.0016 + r2 * 0.006);
    color.r = mix(color.r, texture(uScene, uv + shift).r, 0.85);
    color.b = mix(color.b, texture(uScene, uv - shift).b, 0.85);
  }

  color = max(color, vec3(0.0)) * uExposure;

  if (uBloomAmount > 0.0) {
    color += texture(uBloom, uv).rgb * uBloomAmount;
  }
  /* The shoulder used to live here, ahead of the grade, so the contrast below
     was working on an image whose highlights had already been flattened into
     one another. It is at the end of the chain now, where a tone curve
     belongs. */

  /* Cold night grade: lift the shadows toward blue, pull warmth out of the
     highlights so the fluorescent tubes stay clinical. */
  vec3 graded = color;
  graded = pow(max(graded, 0.0), vec3(1.02, 1.0, 0.98));
  graded += vec3(-0.004, 0.0, 0.014) * (1.0 - smoothstep(0.0, 0.45, dot(color, vec3(0.33))));
  graded *= vec3(0.98, 1.0, 1.04);

  if (uDesaturate > 0.0) {
    float g = dot(graded, vec3(0.299, 0.587, 0.114));
    graded = mix(graded, vec3(g), uDesaturate);
  }

  /*
   * Contrast around the level this carriage actually sits at, which is a long
   * way below mid-grey. Pivoting at 0.5 subtracted from nearly every pixel in
   * the frame: the seats, the floor and the passengers clipped to black while
   * the only two things above the pivot — the ceiling and the tubes — blew
   * out, and the picture came apart into a white lid over a black box.
   */
  graded = (graded - 0.34) * uContrast + 0.34;
  graded = toe(graded, 0.028);
  graded *= uBrightness;
  graded = shoulder(graded);

  float vig = 1.0 - uVignette * smoothstep(0.18, 0.78, r2) * 1.05;
  vig -= uPulse * smoothstep(0.05, 0.6, r2) * 0.5;
  graded *= clamp(vig, 0.0, 1.0);

  if (uScanline > 0.0) {
    float line = sin(uv.y * uResolution.y * 1.7) * 0.5 + 0.5;
    graded *= mix(1.0, 0.82 + line * 0.28, uScanline);
  }

  if (uGrain > 0.0) {
    float n = hash(uv * uResolution + fract(uTime) * 573.13);
    /* Grain rides the darks harder than the lights, the way real film does,
       and that is exactly where this game spends its time. */
    float weight = mix(0.055, 0.012, smoothstep(0.0, 0.5, dot(graded, vec3(0.33))));
    graded += (n - 0.5) * weight * uGrain * 2.0;
  }

  /* Ordered dither before the 8-bit write. Without it every gradient in a
     dark carriage bands into visible steps. */
  float dither = hash(uv * uResolution * 1.37) - 0.5;
  graded += dither / 255.0;

  graded = mix(graded, uFadeColor, clamp(uFade, 0.0, 1.0));
  fragColor = vec4(clamp(graded, 0.0, 1.0), 1.0);
}
`;
