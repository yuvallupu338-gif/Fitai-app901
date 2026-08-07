# FitAI

<div dir="rtl">

אפליקציית קליסטניקס שמראיינת אותך — גיל, גובה, משקל, ותק, מטרה, זמינות, ציוד,
מגבלות, מצב נוכחי ותזונה — ובונה ממש התוכנית המלאה: אימונים, תזונה, מפת
התקדמות, משימות ליום מנוחה ויעדים ריאליים. מגיל 12 עד 90.

</div>

The reference this grew out of was a single hand-written training document for
one person. This app generates that same document — same structure, same design
language — from whatever the user actually answers.

## Running it

It is plain ES modules with no build step and no dependencies. It needs to be
served over http (ES modules do not load from `file://`):

```bash
npx http-server -p 8080 .     # or: python3 -m http.server 8080
open http://localhost:8080
```

Or open the prebuilt single file, which works straight off the disk:

```bash
open dist/fitai.html
```

### On GitHub Pages

Pages serves a project site from a subpath (`/Fitai-app901/`, not a domain
root), which is where a static app usually breaks: one absolute `/src/app.js`
and every module 404s. Every path here is relative, so it works — verified by
serving the repo under that prefix and walking the whole questionnaire against
it, with the server asserting that no request escaped the subpath.

`.nojekyll` sits at the root. Nothing here starts with an underscore today, so
Jekyll would not eat anything, but a file that did would vanish silently and the
failure would look like a bug in the app.

Point Pages at the branch root; `index.html` is the entry. `dist/fitai.html` is
served alongside it as a single-file copy that also works offline.

## What it does

**Intake** — nine steps covering the basics, training history, goal and target
date, where you are aiming (two photos and how hard you intend to go at it),
realistic availability, location and equipment, whether you want to train
calisthenics or with weights, injuries and refusals, current benchmarks, whether
you train with a partner, and optionally nutrition. Answers are validated as you
go and stored on the device.

**Generation** — the engine picks a split from your weekly availability,
allocates weekly set volume per muscle group, and fills each session from a
database of 267 movements. It never prescribes equipment you do not have and
never prescribes a movement that loads an injury you declared, unless nothing
else covers that pattern — in which case it drops to the easiest option and
says so. Verified across a 1500-profile sweep: no session repeats an exercise,
none comes out under four movements, and the same answers always produce the
same plan.

**Free-text intake** — nine steps is the main reason someone opens this app and
does not finish, and most people can describe their situation in four sentences.
Type a paragraph and a text model fills in what you actually said: age, where
you train, what equipment you named, what hurts, how many sessions you will
really do. What it could not extract stays at its default and is listed by name,
so nothing is silently assumed.

It fills the form and then gets out of the way — it does not submit, does not
skip a step, and shows every field it wrote. You walk the same nine steps
afterwards with most of them already answered, which is where a wrong reading
gets caught.

**Photo scan** — the other part of the app that opens a network connection. Give
it two pictures, you today and the physique you are aiming at, and a vision
model reads the gap: how reasonable that aim is in the time you gave it (the app
shows this as a score out of ten), what is already built and what is not, and
which movement patterns close the distance.

The model does not write the program. It returns a small structured judgement
and `src/vision/apply.js` turns that into per-group volume multipliers, which is
the only thing that crosses the boundary. Equipment filters, injury exclusions,
the training track and the volume ceilings all still run afterwards, unchanged —
so a read can move where the week's sets go and cannot add a barbell to a plan
built for a bare floor. Every field coming back is re-checked against closed
enums before it is used; `node tools/vision-audit.mjs` drives that with hostile
responses and asserts the engine's rules hold.

**Providers** — `src/ai/providers.js` describes each vendor and the shape it
wants its request in; they differ in more than a hostname. Anthropic takes the
system prompt as a top-level field and returns a tool call as a parsed object.
The OpenAI-compatible ones — DeepSeek among them — take system as the first
message and return the tool arguments as a JSON *string*, which means a
perfectly good HTTP 200 can still carry unparseable content.

Vision is a capability, not a preference. The photo scan reads two photographs,
and a text-only model cannot do that — not slowly, not badly, not at all — so
text-only providers are excluded from that job by the code rather than offered
with a warning someone can click past. They serve the text jobs instead.

Keys are per vendor, each under its own storage key, so exporting a profile
never carries one and adding a second vendor never overwrites the first. Each
key goes to exactly one host. Skipping all of it costs nothing — the plan is
built from the questionnaire either way.

A caveat worth knowing before you pick: Anthropic documents calling its API
straight from a browser. Most others do not, and a browser may refuse the
request before it leaves the machine. There is no server here to proxy through,
so if that happens the app says so rather than pretending the key is wrong.

**Animation** — every exercise animates. The figures are not images or video:
`src/core/rig.js` is a humanoid skeleton with two-link inverse kinematics, each
clip is a handful of keyframed poses, and the renderer draws a body with volume
over that skeleton. The whole library adds no download weight and needs no
network. Fonts are embedded too, so the single-file build renders identically
offline; only the photo scan requires a connection.

Clips resolve per exercise first, then per movement family, then per pattern, so
a new exercise animates sensibly before anyone draws it a bespoke one. Run
`node tools/validate.js` for the current split between exercises with an
animation of their own and those borrowing a family clip.

The rig draws from two cameras. Profile is the default and suits most things,
but a movement that happens across the frontal plane is exactly the movement a
profile view cannot show: side-on, a lateral raise and a front raise trace the
same arc, both arms of a reverse fly overlap into one, and a wide grip looks
like a narrow one. Setting `spread` on a pose turns the figure to face the
viewer — shoulders and hips separate, and the limb angles read in the frontal
plane instead.

Counting exercises understates how visible a gap is. What matters is how often a
borrowed clip actually leads a slot in a generated program, and — worse — how
often the clip it borrows is named after a *different* movement. That was 28% of
all slots and is now 0.1%; the regressions were the worst of it, since a
beginner given a wall push-up was shown a picture of the incline push-up the app
had just decided they were not ready for.

`docs/clip-assignments.json` lists what is still borrowed; dropping in a
`clips.x*.js` batch keyed by exercise id gives those their own without touching
the exercise database.

**Autoregulation** — every exercise carries "too easy" and "too hard" controls
that move it up or down a rung and remember the choice. The step searches the
slot's own variants, then the exercise's progression chain, then the same
movement pattern — always through the registry filter, so escalating can never
introduce equipment you lack or load an injury you declared.

**Partner training** — if you train with someone at the same time, exercise
selection runs against both people's injuries at the lower experience level, and
each slot says whether to alternate sets or take full rest, and who spots.

**Honesty** — `src/engine/targets.js` checks the target weight against the
target date and says plainly when the ask is not achievable, along with the
version that is.

Everything is stored in `localStorage` on the device. Two things leave it, both
only when you press a button yourself: the paragraph you typed, if you use the
free-text intake, and the two photos plus the basic numbers, if you run the
scan. The scan deliberately does not send your name, medical notes or
allergies — they do not help read a photograph. Nothing is sent in the
background, and there is no server of ours in the path.

## Layout

```
index.html
src/
  core/      rig, animation player, pose library, store, dom helpers
  data/      exercise database and animation clips, plus their registries
  engine/    volume, generator, progression, targets, nutrition
  intake/    question schema and validation
  ai/        provider table, the network client, and the free-text intake reader
  vision/    photo-scan prompt, response normaliser, plan translation
  ui/        wizard, quickstart, plan, exercise cards, nutrition, guide, scan
  styles/    design tokens and components
tools/
  validate.js       cross-checks the data and engine layers
  clip-audit.mjs    geometry, loops and distinctiveness of the animations
  vision-audit.mjs  proves a photo scan cannot break the engine's rules
  ai-audit.mjs      provider request shapes, and that a filled form stays legal
  smoke.mjs         drives the real app in Chromium
  build-single.js   bundles everything into dist/fitai.html
  fetch-fonts.js    regenerates the embedded font subsets
docs/
  CONTRACTS.md      the binding module spec
```

## Checks

```bash
node tools/validate.js                                  # data + engine contracts
node tools/clip-audit.mjs                               # animation quality
node tools/vision-audit.mjs                             # photo-scan containment
node tools/ai-audit.mjs                                 # providers + intake containment
node tools/build-single.js                              # single-file bundle
NODE_PATH=/opt/node22/lib/node_modules node tools/smoke.mjs --shots
```

`validate.js` verifies exercise ids, animation references, equipment tokens and
injury tags, then generates programs for four deliberately awkward profiles —
including a 30-minute bodyweight session for someone with a bad back, a bad knee
and a bad shoulder — and asserts each one is coherent and deterministic.

`clip-audit.mjs` samples every animation across its cycle and rejects joints
that leave the canvas or pass through the floor, loops that jump, and clips that
merely copy the family clip they were meant to replace — where "copy" means the
same motion AND the same equipment, since a ring pull-up legitimately moves the
body exactly like a bar pull-up. It also rejects a clip that poses a limb by
joint angle in one key and by IK target in the next: the interpolator can only
blend a field present in both, so it swaps at the midpoint and the limb
teleports. That one is invisible to every other check and had been shipping in
fifteen clips.

`vision-audit.mjs` drives the photo-scan normaliser with garbage, hostile values
and injection attempts, then asserts that the most aggressive read the schema
allows still cannot add equipment, undo an injury filter, change the training
track or push weekly volume past its ceiling.

`ai-audit.mjs` covers the second vendor: that each request is built in its own
vendor's shape, that malformed tool arguments are caught rather than read as an
empty answer, that a text-only provider can never be selected into a job that
needs eyes, and that a hostile intake patch still yields a program with no
equipment the user lacks and nothing contraindicated for a declared injury.

`smoke.mjs` walks the intake wizard in a real browser, then checks that the plan
renders, that the rig draws finite on-canvas geometry, that the figures actually
move, and that swapping and ticking survive a reload.

None of them is sufficient alone. An animation can pass every measurement and still
be unrecognisable — a hip thrust that reads as someone lying on a bench passes
geometry, loop and distinctiveness checks without complaint. Render the clips
and look at them before believing the tools.

## Adding to the exercise library

Add an entry to the right file in `src/data/exercises.*.js` following the shape
in `docs/CONTRACTS.md`. Set `anim` to an existing clip id, or leave it as the
movement pattern name — every pattern has a generic fallback clip, so a new
exercise animates sensibly before anyone draws it a bespoke one.

## Scope

This produces a training plan from stated principles. It is not medical advice,
it does not know your history, and it cannot see your technique. For anyone
under 18, or with a medical condition or a recent surgery, the plan is a
starting point to bring to a doctor — not a substitute for one.
