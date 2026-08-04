# FitAI

<div dir="rtl">

אפליקציה שמראיינת אותך — גיל, גובה, משקל, ותק, מטרה, זמינות, ציוד, מגבלות,
מצב נוכחי ותזונה — ובונה ממש התוכנית המלאה: אימונים, תזונה, מפת התקדמות
ויעדים ריאליים. עם אנימציה חיה לכל תרגיל.

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

Deploying to GitHub Pages needs no configuration — point Pages at the branch
root and `index.html` works as-is.

## What it does

**Intake** — nine steps covering the basics, training history, goal and target
date, realistic availability, location and equipment, whether you want to train
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

**Animation** — every exercise animates. The figures are not images or video:
`src/core/rig.js` is a humanoid skeleton with two-link inverse kinematics, each
clip is a handful of keyframed poses, and the renderer draws a body with volume
over that skeleton. The whole library adds no download weight and works offline.
Fonts are embedded too, so the single-file build renders identically with no
network at all.

Clips resolve per exercise first, then per movement family, then per pattern, so
a new exercise animates sensibly before anyone draws it a bespoke one. Run
`node tools/validate.js` for the current split between exercises with an
animation of their own and those borrowing a family clip.
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

Everything is stored in `localStorage` on the device. Nothing is sent anywhere.

## Layout

```
index.html
src/
  core/      rig, animation player, pose library, store, dom helpers
  data/      exercise database and animation clips, plus their registries
  engine/    volume, generator, progression, targets, nutrition
  intake/    question schema and validation
  ui/        wizard, plan, exercise cards, nutrition, guide, progress
  styles/    design tokens and components
tools/
  validate.js       cross-checks the data and engine layers
  clip-audit.mjs    geometry, loops and distinctiveness of the animations
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
body exactly like a bar pull-up.

`smoke.mjs` walks the intake wizard in a real browser, then checks that the plan
renders, that the rig draws finite on-canvas geometry, that the figures actually
move, and that swapping and ticking survive a reload.

Neither is sufficient alone. An animation can pass every measurement and still
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
