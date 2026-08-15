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
else to orbit the head (or, on a photographed customer, to move the picture),
wheel or pinch to zoom. On a phone: one finger paints, two fingers orbit and
pinch.

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

## Photographs

The counter serves a modelled head by default. Give it a photograph and it
serves that instead — full screen, upright, with the makeup composited onto the
picture the way a try-on app does it:

```bash
node tools/makeup-avatar.mjs add photo.jpg     # opens a page; click twenty points
node tools/makeup-avatar.mjs list
node tools/makeup-avatar.mjs remove <id>
```

The page it opens serves the repository, so it imports the game's own frame and
mask code: the preview it draws is not an approximation of what the game will
do, it *is* what the game will do. Save, and it writes
`src/data/avatars/<id>.js` — the picture scaled down, re-encoded (which drops
the EXIF, including where it was taken) and embedded as a data URL, so a
single-file build is still a single file. Anything in that directory is
readable by anyone who can read the repository and stays in the history after
it is deleted, so: only pictures you own.

Nothing else in the game changes, and that is the whole design. Every zone,
every brush, every coverage figure and every scoring rule is written in face
space, so a photograph only has to answer one question: which part of a face is
this pixel? Twenty landmarks answer it —

- **The fit.** Rotate the picture so the eyes are level, then two monotone
  curves, one across and one down, through the landmarks. Monotone by
  construction, because a map that folds puts one part of a face in two places
  and the lipstick appears in both. Where a mark and the model disagree — face
  space has the inner corner of the eye a hair further out than the wing of the
  nose, and a real face has it the other way — the conflicting pair is pooled
  into its average rather than allowed to cross. `src/portrait/frame.js`.
- **The outline.** A separable fit cannot express a jaw closing towards the
  chin, so it does not try: a face-shaped field, derived from the same marks,
  cuts every zone at the silhouette and at the hairline. That is what stops
  foundation going onto the background and into the hair.
- **Her colour.** Measured off her own cheek at load — away from the mouth, the
  lids, the brows and anywhere makeup is likely to already be — and the whole
  shade-matching mechanic then judges against the face in the picture rather
  than against a colour someone typed into a table. `src/portrait/avatars.js`.
- **The compositing.** A product does not replace what is under it, it takes the
  light that was already there: the colour is multiplied by how bright the pixel
  is relative to the rest of her skin, so the shadow under the lip stays a
  shadow and the round of it still catches the light. Gloss and shimmer are lit
  here rather than taken from the photograph, against a normal field
  reconstructed from face space — a highlight that travels when the product
  changes is worth more than one that is exactly right and never moves.
  `src/render/shaders.js`, `src/portrait/masks.js`.

What is lost is what a photograph cannot do: she does not smile, and she does
not close her eyes for an eyeshadow. What she liked still arrives as a line.

## Modelled heads

A head somebody else made, on the counter:

```bash
node tools/makeup-head.mjs add head.glb      # opens a page; click twenty points
node tools/makeup-head.mjs list
node tools/makeup-head.mjs remove <id>
```

The page reads .glb, .gltf and .obj, shows the model, and lets you turn it round
and click the same twenty landmarks the photographs use — the click fires a ray
at the mesh, so a mark lands on the surface rather than near it. When all twenty
are down it runs the real fit and shows the real zone masks painted onto the
model, so what you approve is what the game will do.

The interesting part is what it does with the UVs: it throws them away.

Face space is not an arbitrary atlas, it is a warped spherical parameterisation
with a closed-form forward direction — so it has a backward one, and any head
can be given face-space coordinates whether or not it arrived with a UV layout
at all. Twenty marks give a rotation, a scale and an origin, which puts a model
in centimetres and Z-up exactly where the generated head lives. The sphere runs
backwards for a first (s, t). Then two monotone curves through the marks move
each feature onto its own coordinate, because the sphere that was inverted is
the shape *before* a nose and a chin were displaced out of it — without that
step a mark comes back nearly two percent of a head out, which is enough to run
a lipstick along the line under the lip.

What it cannot do is unwrap geometry that is not star-shaped about the middle of
a head. Ears fold; so does the pocket under the nose, which is concave and faces
partly upwards. That is a property of projecting a sphere rather than a bug, so
the folded area is counted and reported instead of hidden: on the front of a
carefully marked face it is four thousandths of a percent, all of it in that
dimple, and a head where a whole band folds is a head whose marks are wrong.

What gets written to `src/data/heads/` is not the file you imported — it is the
result: positions already in head space, texture coordinates already in face
space, packed as sixteen-bit arrays. Sixteen bits is fourteen microns on a face
and a fortieth of a texel of the paint layer. The reading, the fitting and the
unwrapping happen once, in the tool; the game decodes three arrays and computes
normals.

Two things the tool refuses. **Draco-compressed glTF**, which is what
Sketchfab's own glTF export usually is — decoding it needs a decompressor larger
than this whole game, so download the uncompressed glTF or the OBJ. And **a
model with no licence line**: nearly every head worth importing is Creative
Commons Attribution, which is free to use *on the condition that the credit is
shown*, so the credit is required, it is stored with the model, and the game
puts it on screen while she is being served. A model whose licence does not
permit use in a game does not go in that directory whatever its download button
says.

With photographs and heads both present, a customer's face is drawn from her own
seed out of everything the counter has, with generated faces still in the pool —
a shop where every customer is one of the same three faces is worse than one
where some of them are new.

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

`makeup-audit.mjs` runs about thirteen hundred and thirty assertions over the
parts that are arithmetic: that every closed mesh is wound outwards, that the face warps are
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
texture binding and the shader compositing in a single assertion. It then does
the same thing again on a photographic customer — a face drawn on a canvas
rather than a photograph of a person, because its landmarks are known exactly
and nobody's picture belongs in a test suite. Both halves run on any working
copy: the test ignores whatever photographs are committed and registers its own,
so adding a face does not quietly retire half the suite.

The two importers are tested against the only mesh whose face-space coordinates
are known in advance: the one the game generates. The audit builds a head far
from the average, notes every vertex's (s, t), throws the parameterisation away,
moves the whole thing somewhere arbitrary — rotated, scaled by thirty-seven,
translated — and hands the importer nothing but triangles and twenty marks.
Every anchor has to come back on its own coordinate exactly, and the lips, eyes,
cheeks, nose and forehead within 0.025 of where they started. The smoke test
then plays a customer whose head went through all of it, and drags the same red
lipstick across a mouth that never had a UV layout.

That last one has already earned its place. An imported head was handed to the
renderer without the separate UV array the brush's ray-cast reads, so every
stroke threw inside the pointer handler — and the coverage numbers kept moving,
because the arrival makeup was already on the face. It looked exactly like
paint landing.

The portrait fit has its own assertions, and they exist because its worst
failure is silent. A map that is slightly wrong puts the lip mask *most* of the
way onto the lips, looks entirely fine, and scores every lipstick as half
missed. So each landmark is asserted to come back out of the map where it went
in, the marks that fix a size rather than a position — how full the lips are,
how open the eyes — are checked against the masks themselves rather than against
the constants they aim at, and the whole set is refitted from landmarks rotated
eleven degrees to prove that a picture taken at an angle does not get its makeup
applied at an angle.

## Layout

```
index.html
src/
  core/     gl, math (with the ray-cast the brush runs on), rng, colour science
  model/    face space, the head, the body and hair, the shop's props
  portrait/ fitting a photograph into face space, and its masks and normals
  model/import/  reading OBJ and glTF, and unwrapping a head into face space
  render/   shaders, the frame, and every texture in the game
  data/     the product catalogue, the looks customers ask for, the people,
            avatars/ — the photographs, and heads/ — the modelled ones
  game/     paint, customers, scoring, the shift, audio, input
  ui/       the DOM half, and the save file
  styles/   game.css
```
