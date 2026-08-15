/*
 * shaders.js — all the GLSL.
 *
 * One program draws the whole scene, switching on a mode uniform. That is a
 * deliberate choice over a program per material: the modes share the entire
 * lighting loop, and the alternative is the same forty lines of GGX pasted into
 * six files that then drift apart.
 *
 * The mode that earns its keep is SKIN. Makeup is not baked into the face
 * texture — it is a separate pair of textures composited here, every frame:
 *
 *   uPaint  rgb = the colour that has been brushed on, a = how much of it
 *   uFx     r   = finish, from flat matte to wet gloss
 *           g   = shimmer, the particles in a highlighter or a frost shadow
 *           b   = powder, which takes shine *away* and is the whole point of
 *                 setting a face
 *
 * Compositing rather than baking is what makes a wipe instantaneous, lets a
 * gloss go over a matte lipstick and change only its finish, and keeps the
 * scoring reading the same buffer the player is looking at.
 */

export const SCENE_VS = `#version 300 es
in vec3 aPos;
in vec3 aNrm;
in vec2 aUV;
in float aAO;

/* Expression morph targets, stored as deltas. Meshes that have none leave
 * these at the default generic attribute value of zero and add nothing. */
in vec3 aM1Pos;
in vec3 aM1Nrm;
in vec3 aM2Pos;
in vec3 aM2Nrm;

uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat3 uNormalMat;
uniform vec2 uMorph;

out vec3 vWorld;
out vec3 vNormal;
out vec2 vUV;
out float vAO;

void main() {
  vec3 p = aPos + aM1Pos * uMorph.x + aM2Pos * uMorph.y;
  vec3 n = aNrm + aM1Nrm * uMorph.x + aM2Nrm * uMorph.y;
  vec4 world = uModel * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(uNormalMat * n);
  vUV = aUV;
  vAO = aAO;
  gl_Position = uViewProj * world;
}`;

export const SCENE_FS = `#version 300 es
precision highp float;

#define MODE_STD 0
#define MODE_SKIN 1
#define MODE_BODY 2
#define MODE_HAIR 3
#define MODE_EYE 4
#define MODE_LASH 5
#define MODE_EMISSIVE 6
#define MODE_SCREEN 7

in vec3 vWorld;
in vec3 vNormal;
in vec2 vUV;
in float vAO;

out vec4 outColor;

uniform sampler2D uTex;
uniform sampler2D uPaint;
uniform sampler2D uFx;

uniform vec3 uCamPos;
uniform vec3 uTint;
uniform vec3 uEmissive;
uniform vec3 uSSS;
uniform vec2 uUVScale;
uniform float uRough;
uniform float uMetal;
uniform float uBump;
uniform float uOpacity;
uniform float uTime;
uniform int uMode;

uniform vec4 uLightPos[8];   /* xyz position, w radius */
uniform vec4 uLightCol[8];   /* rgb colour, a intensity */
uniform int uLightCount;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;

const float PI = 3.14159265359;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/*
 * Tangent frame from screen-space derivatives. There is no tangent attribute
 * anywhere in this game: the head is unwrapped by a warped sphere map and the
 * props are unwrapped per face, and a frame recovered here is correct for both
 * without a vertex ever carrying one.
 */
mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(dot(T, T), dot(B, B)) + 1e-9);
  return mat3(T * invmax, B * invmax, N);
}

/* Bump from a height channel, differenced in screen space. Cheaper than a
 * normal map and it cannot disagree with the colour it came from. */
vec3 bumpNormal(vec3 N, vec2 uv, float h, float scale) {
  if (scale < 0.001) return N;
  vec2 d = vec2(dFdx(h), dFdy(h)) * scale;
  mat3 tbn = cotangentFrame(N, vWorld, uv);
  return normalize(tbn * normalize(vec3(-d.x, -d.y, 0.12)));
}

float distributionGGX(float NdotH, float a) {
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}

float geometrySmith(float NdotV, float NdotL, float a) {
  float k = (a + 1.0) * (a + 1.0) / 8.0;
  float gv = NdotV / (NdotV * (1.0 - k) + k);
  float gl = NdotL / (NdotL * (1.0 - k) + k);
  return gv * gl;
}

vec3 fresnel(float c, vec3 f0) {
  return f0 + (1.0 - f0) * pow(1.0 - c, 5.0);
}

/*
 * Kajiya-Kay for hair. The strand direction is the V axis of the UV, which is
 * how every hair mesh here is laid out, so the frame above hands it over for
 * free — and the shifted highlight is the difference between hair and a helmet.
 */
float hairSpec(vec3 T, vec3 N, vec3 L, vec3 V, float shift, float exponent) {
  vec3 Ts = normalize(T + N * shift);
  vec3 H = normalize(L + V);
  float dotTH = dot(Ts, H);
  float sinTH = sqrt(max(0.0, 1.0 - dotTH * dotTH));
  return pow(sinTH, exponent);
}

void main() {
  vec2 uv = vUV * uUVScale;
  vec4 tex = texture(uTex, uv);

  /* The makeup layers are sampled at the top of main, not inside the branch
   * that uses them: a texture lookup takes its mip level from the screen-space
   * derivatives of its coordinate, and reaching a sampler through control flow
   * is a good way to lose them. Two fetches on draws that ignore them is a
   * rounding error. */
  vec4 paint = texture(uPaint, vUV);
  vec4 fxTex = texture(uFx, vUV);

  vec3 albedo = tex.rgb * uTint;
  float rough = uRough;
  float metal = uMetal;
  float height = tex.a;
  float bump = uBump;
  float shimmer = 0.0;
  float alpha = uOpacity;
  vec3 sss = vec3(0.0);

  if (uMode == MODE_EMISSIVE) {
    outColor = vec4(uEmissive, 1.0);
    return;
  }
  if (uMode == MODE_SCREEN) {
    outColor = vec4(tex.rgb * uEmissive, 1.0);
    return;
  }
  if (uMode == MODE_LASH) {
    /* Lashes taper and thin towards the tip. Everything about them is the
     * silhouette, so they are a colour and a falloff and nothing else. */
    float t = vUV.y;
    alpha = uOpacity * smoothstep(0.02, 0.35, t);
    outColor = vec4(uTint * (0.35 + 0.35 * (1.0 - t)), alpha);
    return;
  }

  if (uMode == MODE_SKIN) {
    /* ---- the makeup ---- */
    albedo = mix(tex.rgb, paint.rgb, paint.a);

    /* Finish. Bare skin is around 0.42; a matte product flattens it, a gloss
     * takes it to almost wet, and powder pushes it the other way. */
    float productRough = mix(0.72, 0.10, fxTex.r);
    rough = mix(0.42, productRough, paint.a);
    rough = clamp(rough + fxTex.b * 0.30, 0.06, 0.95);

    /* Product sits on skin, so the pores under it flatten as it builds. */
    bump = uBump * (1.0 - 0.75 * paint.a);
    shimmer = fxTex.g;
    sss = uSSS;
  } else if (uMode == MODE_BODY) {
    sss = uSSS;
  }

  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);
  if (uMode != MODE_EYE) N = bumpNormal(N, uv, height, bump);
  /* Two-sided: hair shells and lash cards are seen from behind at the edges. */
  if (!gl_FrontFacing) N = -N;

  float NdotV = max(dot(N, V), 1e-4);
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  if (uMode == MODE_EYE) f0 = vec3(0.05);

  mat3 frame = cotangentFrame(N, vWorld, uv);
  vec3 strand = normalize(frame[1]);

  vec3 diffuse = vec3(0.0);
  vec3 specular = vec3(0.0);

  for (int i = 0; i < 8; i++) {
    if (i >= uLightCount) break;
    vec3 toLight = uLightPos[i].xyz - vWorld;
    float dist = length(toLight);
    vec3 L = toLight / max(dist, 1e-5);
    /* Inverse-square with a radius so a lamp does not blow out at contact. */
    float r = uLightPos[i].w;
    float atten = 1.0 / (1.0 + (dist * dist) / (r * r));
    vec3 radiance = uLightCol[i].rgb * uLightCol[i].a * atten;

    float NdotL = dot(N, L);

    if (uMode == MODE_SKIN || uMode == MODE_BODY) {
      /*
       * Wrapped diffuse plus a red bleed at the terminator. Skin is the one
       * material in this shop where light goes in, bounces around and comes
       * back out somewhere else, and without an approximation of that the face
       * has a hard shadow edge that no amount of texture work can hide.
       */
      float wrapped = max((NdotL + 0.22) / 1.22, 0.0);
      float bleed = smoothstep(0.55, 0.0, NdotL) * smoothstep(-0.45, 0.05, NdotL);
      diffuse += radiance * (albedo * wrapped + sss * bleed * 0.55);
    } else if (uMode == MODE_HAIR) {
      float wrapped = max((NdotL + 0.55) / 1.55, 0.0);
      diffuse += radiance * albedo * wrapped * 0.85;
      float s1 = hairSpec(strand, N, L, V, -0.08, 42.0) * 0.85;
      float s2 = hairSpec(strand, N, L, V, 0.10, 14.0) * 0.35;
      specular += radiance * (s1 * mix(vec3(1.0), albedo, 0.25) + s2 * albedo);
      continue;
    } else {
      diffuse += radiance * albedo * max(NdotL, 0.0) * (1.0 - metal);
    }

    if (NdotL <= 0.0) continue;
    vec3 H = normalize(L + V);
    float NdotH = max(dot(N, H), 0.0);
    float a = max(rough * rough, 0.002);
    float D = distributionGGX(NdotH, a);
    float G = geometrySmith(NdotV, NdotL, rough);
    vec3 Fr = fresnel(max(dot(H, V), 0.0), f0);
    specular += radiance * (D * G * 0.25 / (NdotV * NdotL + 1e-5)) * Fr * NdotL;

    if (shimmer > 0.001) {
      /*
       * Glitter. Individual particles catching the light, not a broad sheen:
       * a hash on the texel picks which flecks exist, and each one only fires
       * when the half-vector comes within a few degrees of its own jittered
       * threshold.
       *
       * The falloff is normalised to end at 1. The first version raised an
       * unnormalised distance to a power and could reach several thousand,
       * which put two white discs the size of a fist on the cheeks the moment
       * anybody used a highlighter.
       */
      vec2 cellId = floor(vUV * 900.0);
      float cell = hash12(cellId);
      if (cell > 0.72) {
        float thresh = 0.86 + hash12(cellId + 3.7) * 0.10;
        float s = max(NdotH - thresh, 0.0) / max(1e-4, 1.0 - thresh);
        specular += radiance * s * s * shimmer * 1.8;
      }
    }
  }

  /* Hemispheric ambient: the ceiling above and the bounce off the counter
   * below. It is what fills the shadow side of a face in a lit shop. */
  float up = N.y * 0.5 + 0.5;
  vec3 ambient = mix(uAmbGround, uAmbSky, up) * albedo * vAO;
  if (uMode == MODE_HAIR) ambient *= 0.7;

  vec3 colour = diffuse * vAO + specular * mix(0.55, 1.0, vAO) + ambient;

  if (uMode == MODE_EYE) {
    /* A wet eye always has one small bright reflection in it. Faking it from
     * the ring light rather than reflecting the room is both cheaper and more
     * reliable — the reflection has to be there at every camera angle. */
    vec3 R = reflect(-V, N);
    float glint = pow(max(R.z * 0.35 + R.y * 0.55 + 0.35, 0.0), 24.0);
    colour += vec3(1.0, 0.98, 0.95) * glint * 1.6;
  }

  colour += uEmissive;
  outColor = vec4(colour, alpha);
}`;

/* ------------------------------------------------------------------ *
 * Post
 * ------------------------------------------------------------------ */

/* One oversized triangle; the UV comes out of the vertex id, so this pass
 * binds no buffers at all. */
export const FULLSCREEN_VS = `#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/* ------------------------------------------------------------------ *
 * Portrait
 * ------------------------------------------------------------------ */

/*
 * Makeup on a photograph.
 *
 * The one idea in this shader is that a product does not replace what is under
 * it, it takes the light that was already there. A lipstick laid on flat as a
 * colour reads as a sticker — the lip loses its crease, its wet edge and the
 * shadow at the corner all at once, and the eye notices instantly even when it
 * cannot say what is wrong. So the product colour is multiplied by how bright
 * this pixel is *relative to the rest of her skin*: in the shadow under the lip
 * the ratio is a half and the lipstick goes dark there too; on the round of the
 * lower lip it is one and a half and the lipstick catches the light.
 *
 * `uSkinLum` is what makes that possible, and it is measured off her own cheek
 * when the avatar is prepared rather than assumed — the same ratio against a
 * fixed grey would make every dark-skinned face's makeup fluoresce and every
 * pale one's turn to mud.
 *
 * On top of that sits the only thing the photograph genuinely cannot provide: a
 * specular. A photograph's own highlights are baked into its pixels and cannot
 * move, so gloss and shimmer are lit here, against a normal field reconstructed
 * from face space. It is an approximation of a face rather than this face — but
 * a highlight that travels when the product changes is worth far more than one
 * that is exactly right and never moves.
 */
export const PORTRAIT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uPhoto;   /* the crop, upright and square, sRGB */
uniform sampler2D uPaint;   /* rgb product colour, a coverage, sRGB */
uniform sampler2D uFx;      /* r finish, g shimmer, b powder */
uniform sampler2D uShape;   /* rgb normal, a on-face */

uniform vec2 uScale;        /* how much of the crop one screen covers */
uniform vec2 uCentre;       /* which point of the crop is in the middle */
uniform vec3 uKey;          /* direction to the key light */
uniform float uSkinLum;
uniform float uTime;
uniform float uSparkle;
uniform float uDim;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  /* The fullscreen triangle's v runs up the screen and every image in this
   * pass has row zero at the top, so the flip happens once, here, rather than
   * in four texture fetches and again in the pick that has to agree with them. */
  vec2 uv = vec2(vUV.x, 1.0 - vUV.y);
  vec2 p = uCentre + (uv - 0.5) * uScale;
  vec2 q = clamp(p, 0.0, 1.0);
  float inside = 1.0 - smoothstep(0.0, 0.004, distance(p, q));

  vec3 photo = texture(uPhoto, q).rgb;
  vec4 pnt = texture(uPaint, q);
  vec3 fx = texture(uFx, q).rgb;
  vec4 sh = texture(uShape, q);
  vec3 N = normalize(sh.xyz * 2.0 - 1.0);

  float lum = dot(photo, vec3(0.2126, 0.7152, 0.0722));
  float ratio = clamp(lum / max(uSkinLum, 1e-4), 0.26, 2.4);
  /* Slightly less than proportional. A product in shadow is darker than the
   * skin around it but not as much darker as the skin is, because some of the
   * light it is missing comes back off the pigment itself. */
  vec3 makeup = pnt.rgb * pow(ratio, 0.86);

  float cov = pnt.a * sh.a;
  vec3 col = mix(photo, makeup, cov);

  /* Specular. The view direction is straight on — the crop is a face looking at
   * the camera, and pretending otherwise buys nothing. */
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(uKey + V);
  float gloss = fx.r * (1.0 - fx.b * 0.75);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 260.0, gloss));
  float lit = 0.35 + 0.65 * max(dot(N, uKey), 0.0);
  col += spec * cov * lit * (0.05 + 0.95 * gloss) * (0.55 + 0.45 * ratio) * 1.7;

  /* Shimmer, as particles rather than a sheen: a shimmer eyeshadow is flat
   * powder with flecks in it, and a smooth glow where the flecks should be is
   * the thing that makes cheap CG makeup look like plastic. The flecks twinkle
   * slowly, which is what a head moving a centimetre would do to them. */
  if (fx.g > 0.001) {
    vec2 cell = floor(q * uSparkle);
    float h = hash21(cell);
    float tw = 0.5 + 0.5 * sin(uTime * 2.2 + h * 47.0);
    float fleck = smoothstep(0.955, 0.995, h) * tw;
    col += fleck * fx.g * cov * lit * 2.4 * (0.4 + 0.6 * pnt.rgb);
  }

  /* Powder takes shine off, including shine the photograph already had. */
  col -= max(0.0, lum - uSkinLum) * fx.b * cov * 0.55;

  vec3 back = mix(vec3(0.045, 0.026, 0.040), vec3(0.010, 0.006, 0.010),
                  smoothstep(0.15, 0.95, length(uv - vec2(0.5, 0.42))));
  col = mix(back, col, inside);

  outColor = vec4(max(col, 0.0) * uDim, 1.0);
}`;

export const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uSrc;
uniform float uThreshold;
void main() {
  vec3 c = texture(uSrc, vUV).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  /* Soft knee: a hard threshold makes the bloom flicker on and off as a
   * highlight crosses it, which on a moving glitter particle is a strobe. */
  float k = smoothstep(uThreshold, uThreshold * 2.0, lum);
  outColor = vec4(c * k, 1.0);
}`;

export const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uDir;
void main() {
  /* Nine taps folded into five with linear sampling between texel pairs. */
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  vec3 c = texture(uSrc, vUV).rgb * 0.2270270270;
  c += texture(uSrc, vUV + o1).rgb * 0.3162162162;
  c += texture(uSrc, vUV - o1).rgb * 0.3162162162;
  c += texture(uSrc, vUV + o2).rgb * 0.0702702703;
  c += texture(uSrc, vUV - o2).rgb * 0.0702702703;
  outColor = vec4(c, 1.0);
}`;

export const POST_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uSrc;
uniform sampler2D uBloom;
uniform float uExposure;
uniform float uBloomAmount;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uFilmic;
uniform vec2 uResolution;

/* ACES, fitted. Everything in this shop is either a warm fluorescent or a very
 * bright ring light, and a Reinhard curve turns both into flat grey. */
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 c = texture(uSrc, vUV).rgb;
  c += texture(uBloom, vUV).rgb * uBloomAmount;
  c *= uExposure;
  /* How much of the film curve to apply. The shop wants all of it — its lights
   * are far brighter than white and something has to bring them back. A
   * photograph wants very little: it was graded by whoever took it, and running
   * a second tone curve over an image that has already been through one lifts
   * the mid-tones and flattens exactly the contrast in a face that makes it
   * look like a face. */
  c = mix(c, aces(c), uFilmic);

  vec2 d = vUV - 0.5;
  c *= 1.0 - uVignette * dot(d, d) * 1.6;

  /* Grain, mostly to stop the large flat wall banding on an 8-bit output. */
  float n = fract(sin(dot(vUV * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * uGrain;

  /* Back to sRGB by hand: the default framebuffer here is not sRGB-encoded. */
  outColor = vec4(pow(max(c, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;
