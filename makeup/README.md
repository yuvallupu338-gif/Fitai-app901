# BELLA — דוכן האיפור

<div dir="rtl">

משחק תלת־ממד לדפדפן: את/ה מאחורי דוכן האיפור בקניון. לקוחות מגיעות אחת אחרי
השנייה — כל אחת עם פנים משלה, עם איפור שהיא כבר מגיעה איתו, ועם בקשה. מאפרים
אותן במוצרים שעל הדלפק, ואז — בקופה — מסמנים בכרטיס **מה הן הכי אהבו**: איזה
מוצר, ואיזה סוג. מי שקוראים אותה נכון, חוזרת.

מנוע WebGL2 שנכתב מאפס, פנים שנוצרות פרוצדורלית מזרע אחד, איפור שנמרח על
טקסטורה חיה, וסאונד מסונתז. בלי ספריות, בלי קבצי מדיה, בלי שרת.

</div>

Open `makeup/index.html` over http (ES modules do not load from `file://`):

```bash
npx http-server -p 8080 .      # or: python3 -m http.server 8080
open http://localhost:8080/makeup/
```

**Controls** — drag on the customer to apply the selected product, drag anywhere
else to orbit, wheel or pinch to zoom. On a phone: one finger paints, two
fingers orbit and pinch.

## The loop

1. **Read the card.** Who she is, what she asked for, what she explicitly does
   not want, and — if she arrived wearing something — what is already on her
   face.
2. **Pick a product and a shade.** The tray goes category → line → shade, the
   same three steps as picking something off a counter. Anything that has to
   disappear into her skin is judged on whether it *matches her*, not on whether
   it looks nice in the bottle.
3. **Apply it.** Drag on the face. A slower brush lays down more. Products stick
   to their own area but not completely — what goes outside is counted as mess.
4. **Watch her.** When something lands well she smiles, and sometimes says so.
   That is the only clue to the preference she is not going to state.
5. **Ring it up.** The till charges for what went on her face, and the card next
   to it asks the two questions the game is named after. Marking right is worth
   a tip now and a returning customer later.

## What it actually is

Everything below is computed at runtime. There are no models, no textures and no
audio files in the repository.

- **Face space.** The head is a deformed sphere, and the obvious texture layout
  — the sphere's own longitude and latitude — is unusable for a game about
  painting a face: the lips come out twenty texels wide. So the mesh is built on
  a uniform grid of *texture* coordinates instead, each mapped through a warp to
  the sphere angle it stands for. The warp spends texture area where a person
  looks and takes it back from the top of the skull. The lips end up about
  290×90 texels, and because the grid is uniform in texture space the mesh also
  gets its triangles where the features are. `src/model/face.js`.
- **Faces.** A customer is a seed. A dozen multipliers drive the displacements
  that carve a jaw, a brow ridge, a nose, two lip lobes and a pair of eye
  sockets out of an ellipsoid; the eyeballs, the lids and the lashes are hung off
  the same shape function the mesh is made of, so nothing floats. Two expression
  morph targets ride along as vertex deltas. `src/model/head.js`.
- **Makeup.** Not baked into the face texture — a separate pair of textures
  composited in the shader every frame: one holds colour and coverage, the other
  holds finish, shimmer and powder. That is why a clear gloss over a matte
  lipstick changes the shine and not the colour, why wiping a face clean is
  instant, and why the scoring can read exactly the buffer the player is looking
  at. `src/game/paint.js`, `src/render/shaders.js`.
- **Lashes.** Mascara is the one product whose result is geometry rather than
  colour on skin, so the lashes are a real fan of tapered fins on the lid rim
  that thicken and darken as the lash line fills in. A product you can buy and
  apply and see no change from is a product that should not be in the
  catalogue.
- **Colour.** Shade matching is measured in CIE L\*a\*b\*, and the complaint the
  customer makes is the one a person makes: too light, too dark, too warm, too
  cool. The foundation range is generated from a small model of what skin looks
  like in Lab, because a straight interpolation between a light hex and a dark
  one runs under the arc real skin follows and leaves the middle of the range
  unmatched. `src/core/color.js`.
- **Rendering.** A hand-written forward renderer: eight point lights with real
  inverse-square falloff, wrapped diffuse with a red bleed at the terminator for
  skin, GGX specular whose roughness comes out of the makeup's finish buffer,
  per-particle glitter for shimmer products, Kajiya-Kay hair, and an HDR pass
  tone-mapped through ACES with bloom and vignette. Surface detail is bumped
  from a height channel using screen-space derivatives, so no mesh carries a
  tangent. `src/render/renderer.js`.
- **Audio.** No files. The brush is filtered noise whose band moves with how
  fast you are dragging, the till is two tones and a thump, and the room is a
  hum with some air in it. `src/game/audio.js`.

## On a phone

One finger paints, two orbit and pinch. The request card collapses to a tab so
the face is never behind it, and the first run picks its own quality from the
device — 72% render scale, a 512-texel paint layer — which is adjustable in
settings. It is the same renderer and the same generator, at a lower resolution.

## Checks

```bash
node tools/makeup-audit.mjs                                # logic, without a GPU
NODE_PATH=/opt/node22/lib/node_modules node tools/makeup-smoke.mjs --shots
node tools/build-single.js makeup/index.html dist/makeup.html
```

`makeup-audit.mjs` runs about twelve hundred assertions over the parts that are
arithmetic: that every closed mesh is wound outwards, that the face warps are
monotone (a warp that folds turns a band of the head inside out), that the mouth
is below the eyes and the lips do not overlap the eyelids, that a ray fired at
an eye hits the eyeball before it hits the face, that the nose is a nose's width
across, that the shop stocks a foundation within a barely-visible distance of
every skin tone in the game, that no look both wants and forbids the same thing,
that layering builds and the remover removes, and that doing what she asked
scores better than doing the wrong thing which scores better than doing nothing.

Every one of those exists because it failed first. The most instructive was the
winding check. Back-face culling is on, so a mesh built the wrong way round does
not vanish or flicker — it renders as a smooth, solid, entirely plausible
object, because what is on screen is the inside of its far wall with the near
wall culled away. On a head that is devastating and nearly invisible: the
silhouette is still a head, the eyes are separate meshes and still sit in front
of it, the skin texture still maps onto something. The face just has no
features, and no makeup ever appears on it. Hours went into the shader, the
texture upload and the sampler before a one-line measurement — the signed volume
of a closed mesh is positive exactly when it faces outwards — named it in a
second, and named four other primitives with the same fault at the same time,
including the box whose top and bottom faces meant the shop had never had a
visible floor.

Its twin, found the same way and even better hidden, was that the model
matrices aiming the eyeballs and the lids were left-handed. A left-handed frame
puts an object in the right place, pointing the right way, at the right size —
and mirrors it, which swaps the front and back of every triangle in it. So the
eyeballs drew the half of themselves that was inside the skull, and every
measurement of where the eye *should* be came back correct. `aimedBasis` in
`core/math.js` is now the only way to build one, and the audit checks the sign
of its determinant.

The others: a foundation range with a hole in the middle that no medium skin
tone could be matched from; a `warmth` term with its sign inverted, so the game
said "too cool" when it meant "too warm"; a clear gloss that washed the colour
off the lipstick it was only supposed to add shine to; a nose 4mm wide; and
tints written in sRGB and multiplied into linear texture samples, which left
every customer's neck a different colour from her face.

`makeup-smoke.mjs` drives the real build in Chromium and checks pixels, because
"the screen is black" and "the lipstick went on and nothing changed" are not
things a headless assertion notices. The one that carries the most weight
photographs the face, drags a red lipstick across the mouth with the actual
mouse, photographs it again, and asserts the frame got redder — which covers the
ray-cast from pointer to face space, the brush, the dirty-rectangle upload, the
texture binding and the shader compositing in a single assertion.

## Layout

```
index.html
src/
  core/     gl, math (with the ray-cast the brush runs on), rng, colour science
  model/    face space, the head, the body and hair, the shop's props
  render/   shaders, the frame, and every texture in the game
  data/     the product catalogue, the looks customers ask for, the people
  game/     paint, customers, scoring, the shift, audio, input
  ui/       the DOM half, and the save file
  styles/   game.css
```
