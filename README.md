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

Or open a prebuilt single file, which works straight off the disk:

```bash
open dist/fitai.html            # the plan app
open dist/backrooms.html        # the game
open dist/laken.html            # LAKEN, with its corpora and a trained model inside
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

### Also in this repo: `app/`

`app/` is the other FitAI — the large single-file build with profiles, the skill
tree, the food log and the guided session — unpacked from one 24 MB
`index.html` into 62 files, and re-dressed in the design language from the
*Mobile Sport App Design* handoff bundle: near-black ground, one lime accent,
Archivo over Rubik, pills instead of rounded rectangles, and the FitAI mark
everywhere from the tab icon to the progress card. It is served at `/app/` and
keeps its own storage, so it does not touch anything above. See
[`app/README.md`](app/README.md).

### Also in this repo: `backrooms/`

`backrooms/` is a separate, self-contained app: a realistic first-person
Backrooms build covering levels 0–99, with a WebGL2 renderer, procedural
materials, an endless world generated as you walk it, and synthesised audio —
no libraries and no media files, same as everything else here. It is served at
`/backrooms/`, and its code touches neither the questionnaire, the plan, nor
any of FitAI's storage. See [`backrooms/README.md`](backrooms/README.md).

### Also in this repo: `lm/`

`lm/` is **LAKEN**, a character-level language model that trains in the browser: an
embedding table, one `tanh` layer and a softmax over the alphabet of whatever
text you paste in, with the backward pass written out by hand and checked
against numerically measured gradients. It is deliberately the dumbest thing
that still learns — thirty thousand weights at its defaults, eighty-six thousand
in the model that ships with it, no attention, no memory past its context window
— and it goes from random guessing to something that looks like Hebrew in under
a minute of watching the loss fall.

Its training text was written for it by 309 agents running in parallel: 163
wrote code across twenty file types, 105 wrote Hebrew questions and answers,
33 drew and 8 wrote conversation — 2,261,604 characters between them, and every
snippet a compiler exists for on this machine parses. Others then trained it,
one strategy each, scored against each other on the same held-out characters;
what won kept making the model *smaller*. Widening it lost three times over,
and past a certain amount of text it stops learning the language and starts
averaging it — both measured, both in `lm/README.md`. Those corpora ship as ES
modules rather than as text
files, and one already-trained model ships beside them, because the page talks
to nothing — `connect-src 'none'`, no key, no credits, nothing written to
storage — and a module is something it can import when asked. Served at `/lm/`.
See [`lm/README.md`](lm/README.md).

Its *code* does not, which is not the same as saying it cannot — see
[Security](#security) below. All four apps here share one browser origin, and
localStorage is scoped per origin, not per path.

## Rest days and declared injuries

Every task in `src/engine/restday.js` carries a `hurts` list, and `allowed()`
drops any task naming an injury the trainee declared. `tools/validate.js`
audits that with a table it states independently, because asking the module
whether it agrees with itself proves nothing — emptying every `hurts` list
would leave a self-referential check green.

Three tasks were reaching the people they were meant to avoid:

- **`swim_20` for a declared shoulder.** Its own description says swimming is
  the easiest thing there is on the joints, which is exactly right for knees and
  hips and is what makes the shoulder easy to miss. Twenty minutes of front
  crawl is several hundred rotations of a loaded arm overhead — the one movement
  the whole week was built to keep away from that shoulder, handed back on the
  recovery day.
- **`play` — half an hour of ball games — for a declared knee, ankle or hip.**
  The audit meant to rule this out and had been naming `ball_game`, an id that
  does not exist in the catalogue, so all three cases had been checking nothing
  since they were written.
- **`stairs_10` for a declared ankle** and **`row_15` for a declared shoulder**,
  both inconsistent with lighter tasks beside them that already carried those.

A fourth was the opposite mistake. `swim_20` declared `needs: []`, so the app
told everyone to go for a swim without ever asking whether they could reach a
pool — every other task in the catalogue is doable from the front door. `pool`
is now an equipment option, deliberately not defaulted into any location
(a "full gym" often has none), and swimming is offered only to someone who
ticked it: zero profiles get it without, 91 with — and they are the right
population, fat loss with a knee or an ankle, where the walking-heavy list
thins out and swimming is genuinely the best thing left.

The audit now asserts that every id in its own table resolves to a real task,
and sweeps the rule rather than sampling it: five goals × every single injury
and every pair × seven ages × a profile owning all the equipment, checking two
things that pull against each other — that nothing forbidden reaches a declared
injury, and that no profile ends up with a blank week, which is the failure the
module exists to prevent. The two halves want opposite profiles and get them:
starvation is checked against someone who owns nothing, leaks against someone
who owns everything — gate a task behind equipment the sweep lacks and it stops
being tested at all, so the sweep also asserts it owns every `needs` in the
catalogue.

Both halves were confirmed to fail before they were trusted: reverting the
`play` fix trips the leak check, and blocking the three tasks that need no
equipment trips the starvation check. A check nobody has watched fail is not a
check.

## Security

The four apps in this repo are served from one GitHub Pages origin —
`/` , `/app/`, `/backrooms/` and `/lm/` — and a browser origin is the security
boundary, not a directory. They share one localStorage jar, and this app's share
of it holds the vendor API keys under `fitai.key.*`. A scripting bug in any one
of the four could read the other three's data, so hardening one of them alone
would have been theatre.

All four now carry a Content-Security-Policy with **`script-src 'self'` and no
`'unsafe-inline'`**, which is the directive that decides whether HTML that
reaches the DOM is markup or code. This app and the game needed nothing but the
policy — no generated event handlers, no `eval`, and exactly one inline `style`
attribute each (in their `<noscript>` blocks, now a CSS class) — and `lm/` was
written to the same rule from its first line, so all three run `style-src 'self'`
with no inline styles at all. `connect-src` names the two vendors this app
actually calls and nothing else; the game's and the playground's are `'none'`.
`app/` needed a larger change and has [its own account](app/README.md#security).

The single-file builds in `dist/` inline their script and stylesheet, so they
cannot use `'self'` and must not use `'unsafe-inline'`. `tools/build-single.js`
names them **by hash** instead: exactly those two blocks run and nothing else,
which also works from `file://`, where `'self'` means nothing.

```bash
node tools/csp-check.mjs
```

drives all four pages, requires each to raise no violations of its own, and
then tries to execute code the way an injection would — an inline handler, a
`javascript:` URL, `eval`, and a remote script — and requires all four to fail.
Currently 32 of 32.

Two things this deliberately does not claim:

- **`frame-ancestors` is absent from every policy.** It is ignored in a `<meta>`
  tag and needs a real response header, which GitHub Pages cannot set. Writing
  it in anyway would only look like clickjacking was handled.
- **The keys are still on a shared origin.** The policies make it much harder to
  get script running on any of the four, but the honest fix for billable
  credentials sitting beside a game is a separate origin. Until then, an XSS
  anywhere here is a key-disclosure bug and should be treated at that severity.


## What it does

**Intake** — ten steps covering the basics, training history, goal and target
date, where you are aiming (two photos and how hard you intend to go at it),
realistic availability, location and equipment, injuries and refusals, current
benchmarks, whether you train with a partner, and optionally nutrition. Answers
are validated as you go and stored on the device.

There is no question about which track to train, because there is only one. The
app builds calisthenics, and the equipment list is the short one that goes with
it — a bar, rings, bands, a mat, parallettes. Asking somebody who picked
calisthenics whether their gym has a cable machine was the complaint that ended
the choice, and the filter now refuses barbell and machine work outright rather
than relying on the equipment list to happen to exclude it.

The age range is 12 to 90, and age is not a label on the plan — it changes the
weekly volume, the session length, which exercises are picked, the warm-up, the
cool-down, the rest-day tasks, whether calories are given a number at all, and
what counts as a realistic target. `src/engine/age.js` holds every threshold
with the reason attached.

**Generation** — the engine picks a split from your weekly availability,
allocates weekly set volume per muscle group, and fills each session from a
database of 269 movements. It never prescribes equipment you do not have and
never prescribes a movement that loads an injury you declared, unless nothing
else covers that pattern — in which case it drops to the easiest option and
says so. Verified across a 1500-profile sweep: no session repeats an exercise,
none comes out under four movements, and the same answers always produce the
same plan.

**Free-text intake** — ten steps is the main reason someone opens this app and
does not finish, and most people can describe their situation in four sentences.
Type a paragraph and a text model fills in what you actually said: age, where
you train, what equipment you named, what hurts, how many sessions you will
really do. What it could not extract stays at its default and is listed by name,
so nothing is silently assumed.

It fills the form and then gets out of the way — it does not submit, does not
skip a step, and shows every field it wrote. You walk the same ten steps
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

**Showing the movement** — each exercise card links to a YouTube search for that
exercise, by Hebrew and English name. It is one line of code and it is the part
of this app that most needed to not be clever: somebody who has never done a
scapular pull wants to watch a person do one, and a search result does that
better than anything generated here did.

What it replaced is gone from the repository, not merely unwired. `rig.js` was a
humanoid skeleton with two-link inverse kinematics, `poses.js` a base-pose
library, `anim.js` a shared requestAnimationFrame player, and `clips.*.js` some
11,000 lines of keyframed poses that animated every exercise as an SVG figure
with no download weight and no network. With the two audits that covered them and
the clip-assignment map, that is 14,500 lines deleted.

It worked, and it is worth being clear that it was not deleted for being broken.
It was deleted because nothing drew it any more, and code that nothing draws
still has to be read, kept compiling and kept honest by its audits every time
something near it changes. The `anim` field came off all 269 exercises and out of
the two engine modules that were still copying it into every prescription
nobody read.

The history has it if it is ever wanted back: `git log -- src/core/rig.js`.
Reviving it means restoring those files and importing the player in
`src/ui/exercise.js`, which is where it was removed from.

One thing left behind is worth knowing, because it is the general shape of the
trap. `reduceMotion` — a single `matchMedia` call asking whether the reader wants
less movement — lived in `anim.js`, which imported `rig.js` and `poses.js`. The
rest timer wanted it to decide between repainting four times a second and once,
and was pulling 1,159 lines of inverse kinematics into every build to ask. It
lives in `dom.js` now. Move a small utility out; do not reach into a large module
for it.

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
  core/      store, dom helpers, brand
  data/      exercise database, warm-up demands, and their registries
  engine/    volume, generator, progression, targets, nutrition, rest days, age
  intake/    question schema and validation
  ai/        provider table, the network client, and the free-text intake reader
  vision/    photo-scan prompt, response normaliser, plan translation
  ui/        wizard, quickstart, plan, exercise cards, nutrition, guide, scan
  styles/    design tokens and components
lm/
  index.html        the character-level model that trains in the browser
  src/              model, tokenizer, corpus, chart, seeded rng
  src/corpora/      the code, Hebrew, chat and drawing corpora the agents wrote
  src/models/       one trained model, as a module the page can import
tools/
  validate.js       cross-checks the data and engine layers
  vision-audit.mjs  proves a photo scan cannot break the engine's rules
  ai-audit.mjs      provider request shapes, and that a filled form stays legal
  smoke.mjs         drives the real app in Chromium
  lm-check.mjs      the toy model's gradients, against numeric ones
  lm-train.mjs      trains the toy model from the command line
  lm-corpus.mjs     assembles the agents' slices, and parses the code in them
  lm-smoke.mjs      drives the toy model's page in Chromium
  build-single.js   bundles any of the apps into one self-contained file
  fetch-fonts.js    regenerates the embedded font subsets
docs/
  CONTRACTS.md      the binding module spec
```

## Checks

```bash
node tools/validate.js                                  # data + engine contracts
node tools/vision-audit.mjs                             # photo-scan containment
node tools/ai-audit.mjs                                 # providers + intake containment
node tools/build-single.js                              # single-file bundle
node tools/build-single.js lm/index.html dist/laken.html
node tools/lm-check.mjs                                 # the toy model's arithmetic
node tools/lm-corpus.mjs --verify --audit               # the agent-written corpora
NODE_PATH=/opt/node22/lib/node_modules node tools/smoke.mjs --shots
NODE_PATH=/opt/node22/lib/node_modules node tools/lm-smoke.mjs
```

`validate.js` verifies exercise ids, equipment tokens, injury tags and warm-up
demands, then generates programs for four deliberately awkward profiles —
including a 30-minute bodyweight session for someone with a bad back, a bad knee
and a bad shoulder — and asserts each one is coherent and deterministic.

It also holds the rules that no single module can check on its own. Age is the
main one: that the weekly volume, session length and warm-up all still differ
between a fourteen-year-old and an eighty-two-year-old after every later step has
run, that a blank age is treated as an adult at all seven gates, that the bounds
in `age.js` match what the questionnaire field will actually accept, and that a
week never prescribes more sets than its own session budget can hold.

Those checks name the unsafe cases themselves rather than importing the tables
the engine reads. A check that asks the same table its subject asks can only ever
confirm the two agree — delete `jumping_jack` from `demands.js` and the drill
reappears in a ninety-year-old's warm-up while a table-driven check reports
everything is fine. Every one of them has been watched fail on a deliberate
mutation before being trusted; several caught bugs in their own fix.

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
renders, that every exercise card carries a YouTube link pointing at the right
search and opening away from the app, that the detail sheet still opens from the
exercise name, that the age floor holds where a trainee meets it, and that
swapping and ticking survive a reload.

`lm-check.mjs` covers the one thing in `lm/` that no amount of looking would
catch. A backward pass with a term missing still trains — a wrong gradient with
the right sign is still downhill — so the model still improves, the samples still
get better, and the bug shows up only as a plateau nobody can explain. So it
nudges individual weights and compares the slope it measures against the
gradient the code computed, to seven significant digits (or 1e-10 absolute,
where a gradient is too small for a difference quotient to resolve), on every
tensor. Each of the
mutations you would expect to matter (an embedding gradient that overwrites
instead of accumulating, a missing `1 - tanh²`, a factor of 1.0001 on one term)
was applied on purpose and watched fail here before the check was trusted.
`lm-smoke.mjs` then drives the page itself, including the round trip a trained
model makes through a file and back into a resumed run.

None of them is sufficient alone, and the gap is not the kind a tool closes. A
plan can satisfy every rule here and still be wrong for the person holding it —
the right sets of the right movement in an order nobody would coach, or a
sensible week that reads as a wall of text on a phone. Open it and use it before
believing the tools.

## Adding to the exercise library

Add an entry to the right file in `src/data/exercises.*.js` following the shape
in `docs/CONTRACTS.md`. Nothing needs drawing — the exercise card links to a
YouTube search built from the Hebrew and English names, so a new movement is
demonstrable the moment it has a name.

A warm-up drill needs one more thing. Tag it `warmup` and give it an entry in
`src/data/demands.js`, which says what the movement asks of a body apart from
injury: whether it leaves the ground, starts on the floor, hangs bodyweight from
the hands, or stands on one leg with nothing to hold. `contraindications` answers
whether a drill hurts a part that already hurts; it says nothing about whether a
healthy seventy-eight-year-old should be doing it. A drill with none of those
demands goes in `PLAIN_STANDING`, which is a list rather than an inference on
purpose — `validate.js` requires every warm-up drill to appear in one or the
other, so "fine for anybody" has to be something a person decided.

## Scope

This produces a training plan from stated principles. It is not medical advice,
it does not know your history, and it cannot see your technique. For anyone
under 18, or with a medical condition or a recent surgery, the plan is a
starting point to bring to a doctor — not a substitute for one.

The age range runs to 90 at the top and 12 at the bottom, and the bottom is the
one that carries conditions. Under 16 the app puts no number on food or on the
body — no calorie target, no macro split, no weekly weigh-in — because a weekly
number that rises is what growing looks like, and teaching a child to read that
as failure is the harm. Under 18 it will not build a calorie deficit whatever the
goal chip says, and the photo scan does not run at all. None of that is a setting.
