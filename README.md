# FitAI

<div dir="rtl">

מאמן כושר ותזונה אישי שרץ בדפדפן. אתה בוחר איך אתה מתאמן — קליסטניקס, חדר
כושר, או שילוב של שניהם — אומר כמה ימים בשבוע, כמה זמן יש לך ומה הציוד שזמין
לך, והאפליקציה מרכיבה לך את השבוע: היא אומרת לך על אילו שרירים עובדים בכל
אימון, בוחרת את התרגילים בעצמה לפי הסגנון, הציוד והפציעות שלך, מחליפה אותם
לבד פעם בשבוע, ונותנת לך להחליף כל תרגיל בודד בתרגיל אחר לאותו שריר.

</div>

There are three ways to train and you pick one: **calisthenics**, where nothing
asks for a weight and you progress by moving to a harder variation;
**gym**, which is barbells, dumbbells, machines and cables and logs the kilos;
and **both**, where a single session is built from the two together. The style
is the only thing that decides which pool a session draws from — the rest of the
app does not know the difference. Everything runs on the device: nothing is
uploaded, there is no account, and the whole app is one file.

## Running it

`index.html` is the app. Open it straight off the disk, or serve the folder:

```bash
npx http-server -p 8080 .     # or: python3 -m http.server 8080
open http://localhost:8080
```

On GitHub Pages, point Pages at the branch root. `sw.js` sits next to
`index.html` and caches the page so the app keeps working offline once it has
been opened, which is what makes "add to home screen" behave like an app rather
than a bookmark that breaks on the train.

## How the week gets built

**The split comes from the number of days you picked.** Choose three days and
you get push / pull / legs. Choose five and you get chest+triceps, back+biceps,
legs, shoulders+core, arms+core. One through seven are all defined, and the
calendar days you tick decide only *when*, never *what*.

**Every session is announced by its muscles before you start it.** The home
screen names today's session and lists the muscle groups it trains, and the
weekly card gives every training day a line naming its own, with the exercises
folded underneath. The muscle vocabulary is ten groups — chest, back,
shoulders, biceps, triceps, quads, hamstrings, glutes, calves, core — and every
exercise carries its own badge for the one it is in the session for, plus what
else it hits.

**The exercises are chosen for you.** A library of 204 movements — 123
bodyweight and 81 gym — each tagged with the muscle it trains, the kit it needs,
the level it belongs at and which of the two pools it is in. Bodyweight runs
from wall push-ups to the one-arm push-up, from table rows to the muscle-up,
from a chair squat to a pistol; the gym half runs from a machine chest press to
a front squat. The generator walks the day's muscles in rotation and takes
compounds before accessories, so a wall sit never opens a leg day.

**It only ever offers what you can actually do.** The kit question changes with
the style: five things for calisthenics — a pull-up bar, dip bars, rings, bands
and an ab wheel — and seven for a gym: barbell, dumbbells, bench, machines,
cables, kettlebell and something to hang off a belt. It is a hard filter. Tick
nothing on calisthenics and you still get a full week from a floor, a wall and a
doorway. Declared injuries filter on top.

A thin gym is the awkward case: dumbbells and nothing else have no glute
movement at level 1, and a room with one machine per muscle has no second
option to swap to. Rather than hand over a two-exercise day, the generator
widens in steps — first core work, then the same muscles above the level cap,
then, for a gym profile, the bodyweight movements that kit already allows. The
kit and the injuries are never given up. A full gym never reaches that far.

**It refreshes itself once a week.** The selection is seeded from the ISO week,
so it is identical every time you open the app inside one week and different the
next — the app says so when it turns over. `🔄 החלף אימונים` forces it early.

**Any exercise can be swapped.** Press `⇄` and the app names the muscle that
exercise is there for and lists other exercises that train the same muscle, each
with what it needs, what else it works, a demo and a video. Your pick sticks for
the rest of the week. When your kit and your injuries genuinely leave nothing
clean — a shoulder injury removes every press — it says so plainly and shows the
closest options flagged, instead of a dead end. When it is the kit that is in
the way, it shows what exists for that muscle and names the piece of equipment
that would unlock each, with no button, because picking one would be quietly
undone the next time the session is built.

**The coach shows you where it lands.** The animated figure marks the muscles
in red — bright for what the exercise is chosen for, faint for what it also
hits — and the marks sit inside the animated limb groups, so they move with the
arm that is pressing. Where a bundled clip replaces the figure, the marked
figure stands beside it. The home screen carries one such figure, for the
session as a whole, with a legend naming the primary muscles and the secondary
ones that only assist.

**Every exercise has a demo and a video.** Bundled clips where one exists,
the animated coach doing the movement pattern where one does not, and a video
button on every exercise everywhere it appears: the plan preview, the workout
screen, the swap sheet, the skill tree and the machine guide.

## Recovery

A muscle worked hard yesterday is not ready to be worked hard today, and how
long it needs depends on which muscle it is. Each of the ten now carries its
own window: chest, back, glutes, quads and hamstrings want **48–72 hours**;
shoulders, biceps, triceps, calves and core want **24–48**.

**The clock is per muscle, and it starts when a session ends.** Finishing a
workout stamps every muscle it was built around; the muscles it only leaned on
are stamped as if they were already half-recovered, because assisting is not
the same as leading. A muscle's clock only ever moves forward, so a light day
never undoes a hard one. Three states come out of it: **recovering** while it
is still inside its minimum, **good to train** past the minimum, **recovered**
past the maximum.

**The window is not a constant.** It moves with training intensity, sleep,
food, age and training age — and the two of those the app actually knows are
age and level, so those are the two that move it. A 68-year-old at level 2 sees
chest at 59–89 hours instead of 48–72; a trained 27-year-old sees 44–66. The
numbers on screen are the adjusted ones, and the card says so when they differ
from the baseline.

**Three places read it.** Today's card warns before you load a muscle that has
not served its minimum, naming the muscle and the hours left. The weekly plan
flags a day pattern that comes back to a muscle too soon. And a card on the
home screen lists what is still recovering — nothing at all once everything has
cleared — with the full table behind a fold, including the note that a muscle
still very sore or weak wants more time regardless of what the clock says.

**The splits were checked against it rather than assumed compliant.** Every one
of the 127 ways to pick training days, against both a young trained profile and
an older untrained one. The young profile collides nowhere. The older one
collides in 20 of them by six hours, all at five days a week or more, which is
exactly the case the warning exists to name. One real collision turned up in
the seven-day split and was fixed rather than warned about: the mobility day
listed glutes the day after the second leg day, inside their 48-hour window. It
lists calves now, which the week last touched three days earlier.

## Restraint

One accent colour. The palette had five — orange, teal, blue, green, purple —
plus nine hues of muscle badge, and the words already said what the colours
were trying to say, so chips, stat tiles and badges are neutral now and teal is
reserved for things you can press. The muscle marks on the figure stay red,
because they are the one thing that should shout, and they no longer pulse.

Each thing is said once. Today's card used to name the session's muscles in a
headline, again in a legend, and again as chips; the weekly card repeated its
own muscle line above the same legend, and carried a figure per day. The
headline and the chips are gone, and one figure remains.

The home screen is seven blocks and about 1,500px, down from twelve and 2,800.
What went: a profile summary that was a read-only copy of Settings; a pep-talk
banner directly under a line already opening with the same two words; a
training-days line the weekly plan lists anyway; and a second button for
swapping the workouts. The week used to be a card per training day, each
repeating counts identical to its neighbours and carrying its own legend — it
is one row per day now, the day and its muscles, and the exercises open
underneath. Progress keeps the streak, the level and three numbers; the week
bars and the sixteen badges moved into the sheet already called "charts and
badges", which is one tap away.

And the emoji came off. A neutral palette does not read as calm when every
heading, button and line still opens with a coloured pictogram, so the home
screen has none.

## Under the finger

`.btn` has always answered a press with a scale to 98% and a white ripple
expanding from the touch point; the nav tabs scale to 90% and pop when they
become the active tab; chips and the FAB scale too. Everything else that you
press did not move at all — the pills, the segmented controls, the day picker,
the skill-tree rows and the disclosures all had `transition` declared and no
`:active` rule to transition to, which is declared motion with nothing to move.
They answer now, in the same language the rest of the app already spoke: small
controls scale to 94%, wide rows to 99%. A skill-tree row also finally admits
it is pressable — it was `cursor:auto`.

Three things are deliberately still flat. A meal card is not a button, it is a
card with buttons in it. A settings toggle already animates — its knob slides.
And a link inside a sentence should not scale, because scaling it would shove
the words around it.

A browser-driven audit walks every tab, the workout screen and the sheets,
forces `:active` on each control and reads back the computed transform once the
transition has settled: 581 of the 602 pressable elements answer, and the 21
that do not are exactly those three groups.

## Reminders

They are timers inside the page, and that is the whole truth about them. The
screen says so: reminders arrive while the app is open — in front of you, or in
a live background tab — and nothing arrives while it is fully closed, because
that needs a push server and this app deliberately has none. The footnote used
to point at the install button as the fix, which does nothing: there is no push
subscription anywhere in the file and a closed PWA runs no JavaScript.

What can be salvaged inside that constraint is salvaged. A background tab gets
throttled hard enough to skip the one minute a reminder was due, and the old
code matched the exact `HH:MM` and lost it for good; anything whose time has
passed fires up to an hour late instead, and the fired-state lives in the
profile so a reload cannot repeat it or a stale morning greeting arrive at
night.

The switch tells the truth too. It used to draw itself from the stored
preference while the line under it and the test button read the browser
permission, so revoking permission in site settings left a green switch on
something that could not fire — and the test button answered "enable browser
notifications first" underneath it. `notifOn()` is the only thing the UI asks
now, a blocked permission says where to un-block it, and the stored flag is
reconciled against the browser at boot rather than drifting until someone
happens to tap the switch.

Water reminders shipped on by default under a master that ships off, and "every
N hours" meant "on clock hours divisible by N" — every 2 hours gave you 10, 12,
14, 16, 18, 20 and skipped the first one of the day. It is a real interval from
09:00 now, and the screen prints the times it will actually use.

## The workout clocks

Same bug, worse place. Every countdown did `phaseLeft--` once per `setInterval`
callback, so it counted how often the browser ran the timer rather than how much
time had passed — and a throttled tab coalesces the callbacks it owes you. Six
seconds of real time moved the rest counter by one. Lock the screen during a set
and the rest is still sitting at 55.

Each tick takes the seconds actually elapsed since the last one and subtracts
those, so a tab that was away catches up the moment it comes back. A gap long
enough to cross several warm-up moves advances through all of them, and one that
outlasts the warm-up carries the overflow through the build screen into the main
phase instead of parking you at a stage that finished while you were gone.
Pausing still banks no time — the elapsed clock is reset by hand wherever a
countdown is set, so a freeze during a pause is not charged on resume.

The upper/lower/full selector is gone. Its three settings produced byte-identical
sessions: since the planner rewrite the split comes from the number of training
days and nothing in exercise selection ever read it. The pills themselves had
already gone when the card was rewritten, but the handler stayed live and the
build screen kept printing "adapted to level 4 · 45 min · full body" off a value
no one could set and nothing consulted.

## The skill tree and the nutrition screen

Mastering an exercise pays 25 XP once, tracked in `xpAwarded` — otherwise
un-marking and re-marking would farm it. But the burst and the toast fired on
"you marked it", which is true every time, so marking something you had already
earned played "+25 XP" over a counter that did not move. The celebration is tied
to the payment now, and re-marking says so.

That was the only thing wrong with either screen. The tree really is 10 levels
of 9 exercises with no id used twice, over exactly the four categories its header
names; a level opens at exactly the fifth exercise of the one below, which is
what its footnote says; with nothing done only level 1's nine rows are tappable
out of ninety; a shoulder injury flags rows; and syncing to your strength adds
marks without touching one it would never have made itself, as it promises.

Nutrition holds up throughout. Across all 115 meals in the four pools there is no
meat or fish in the vegetarian bank, no meat in the pescatarian one, and nothing
animal in the vegan one — and swapping never leaves the pool it started in. An
allergy changes the menu and no meal left on it contains the allergen; a dislike
is kept out. The four meals sum to exactly the day's calorie and macro targets.
The water target matches the rule its own comment states. Logging a meal records
the calories the card displayed. The shopping list carries every ingredient of
every meal on today's menu, and its quantities really are scaled to the target —
a 60 kg cutting profile is told 3 eggs and 45 g of oats where a 110 kg building
one is told 6 and 80.

The rest of the surface holds too. All thirteen sheets — the coach, the trends,
the install guide, help, the daily view, quick-add, the vegan guide, the shopping
list, the day picker, the legal text, the exercise video, the skill popover and
the swap sheet — open with content and controls and no console error. The
dynamic and static stretch routines share no exercise and the segmented control
really swaps them. Text size is a real setting: it drives `zoom` on the screen
element, so levels 1, 3 and 10 render a heading at 29, 36 and 61 px. A profile
serialised and read back is identical, profiles can be added, duplicated and
removed, and a clean browser lands on a working onboarding screen.

## The light theme

`html.light` redefined the neutrals — background, card, line, text, muted — and
left every accent at its dark value. Those accents are pale pastels picked to
glow on near-black: `#5fe3d1` teal measures 1.6:1 on white. Measured across the
six tabs with a scanner that composites alpha down the ancestor chain and skips
gradients, the light theme had **102 pieces of text below WCAG AA in the file as
uploaded**, and the active nav tab was white on a pale wash. Dark was clean at
zero throughout.

The accents now have light-theme values of their own — same hues, dark enough to
read on white and on the card colour. Both themes measure zero.

The restraint pass had already taken light from 102 to 70 as a side effect, by
making chips, badges and stat tiles follow the neutral tokens instead of carrying
their own colour. That is worth knowing: a palette that goes through tokens
adapts to a theme for free, and every hard-coded colour is a place a theme
switch can break. One survived — `.btn.danger` spelled its pink out — and needed
its own light-mode line.

## Narrow windows and large text

Measured rather than eyeballed, at 320×568 and 430×932, in three languages, at
the default text size and the largest one, across all six tabs and all three
styles — 216 configurations, each scanned at the top of the page and again
scrolled to the bottom. What it looks for: the page scrolling sideways, an
element hanging off an edge, text cut off by its own box, a tap target under
28px, a control that can never be scrolled clear of the fixed nav, and text
under 11px.

**A track written `1fr` is `minmax(auto, 1fr)`** — it never gets narrower than
the longest word inside it. Four macro tiles wanted 338px of a 320px screen, so
the row hung off the side, and every font step made it worse. The floors are in
`em` now, so the number of columns follows the text size: the row keeps its
shape while the tiles still fit their words, and drops to fewer columns instead
of off the screen. Same fix for the seven-day bar chart, where each bar refused
to shrink below its own label and pushed the last two past the edge.

**Six nav labels do not fit 320px in any language.** Settings sat 7px past the
window and the page scrolled sideways to reach it. Each label is its own
element now, ellipsised so no language can overflow its tab, and below 380px
the labels give way entirely — the icons carry the nav, and every button still
names itself through `aria-label`.

**Buttons sharing a `.row` are `flex:1`**, so at the largest font they shrank
below their own text, and `.btn`'s `overflow:hidden` — which is there for the
ripple — cut the labels in half. They stop shrinking at their longest word now
and the row wraps instead. Exercise rows wrap too, rather than pushing their
video button off the screen, and a single long word in a heading breaks rather
than dragging the page sideways: at the largest font, "Notificaciones" alone
was 22px wider than the heading holding it.

Four targets measured under 28px — an inline link at 15px tall, a small button
and the toggle switch a hair under, and the disclosure rows. All four clear it
now. **The result is zero findings, on every check, in all 216
configurations.**

Getting to a zero that means anything took fixing the scanner five times, and
every one of those was the scanner being wrong rather than a defect being
waved off. Content passing beneath a fixed nav on its way up the page is not
content stuck under it — that only means anything at the bottom of the page,
and only when the element really intersects the nav's band rather than sitting
below it. A fixed element floating above the page overlaps every control that
scrolls past it, which is not two controls on top of each other. A chip is a
tap target only when it does something; the nutrition screen uses the same
look for read-only labels. A form field scrolling its own value is not clipped
text.

The last one is worth writing down. **A closed `<details>` keeps the rectangle
its body had when it was last open.** Chromium hides collapsed content with
`content-visibility`, and everything a script can normally ask — computed
`display`, computed `visibility`, `getBoundingClientRect`, even
`checkVisibility({contentVisibilityAuto: true})` — still describes a laid-out,
visible element. So the seven collapsed days of the weekly plan read as a
stack of video buttons sitting on top of each other and on top of each day's
summary: 750 findings out of 823, none of them real, and all of them
disappearing the moment the check skips anything inside `details:not([open])`.

## Stretches

`injuryFlags` reports five injuries; the stretch screen knew three. Declare a
wrist or elbow injury and the banner still announced "adapted to your injuries —
sensitive areas are marked" over a list with nothing marked on it. Wrist and
elbow map to the upper-body groups now, and the banner is gated on something
actually being marked rather than on an injury merely being declared.

## What was checked and is fine

Auditing for more of the same turned up a lot that holds up, which is worth
writing down so nobody re-checks it. Session length is real (30/45/60/90 give
5/6/8/10 exercises). So are level, kit, training days, goal, pace and diet. The
injury filter is live and correctly selective — a shoulder injury rewrites the
push days and leaves pull and legs alone. All fourteen settings the UI writes are
read by real logic; there is no dead field. Food and water roll over daily, on
boot and on a timer. Restore points really are daily and really are capped at
four, and the two storage layers are a primary key plus a backup with a fallback
on read. Offline works: cut the network, reload, the app comes up. The share card
falls back to a download where Web Share is missing, and the XP a toast promises
is the XP the code adds.

## The skill tree climbs whatever you train

Picking "gym" changed which exercises the planner prescribed and nothing else:
the tree stayed four bodyweight ladders, the accessory pool stayed bodyweight,
and a gym profile was climbing wall push-ups. There is a gym ladder per category
now — machine chest press up to weighted dips, machine row up to a weighted
pull-up, leg extension up to a deadlift, machine crunch up to a weighted hanging
leg raise. Calisthenics climbs the bodyweight ladders, gym climbs the gym ones,
and hybrid takes four of each per level, which keeps the nine slots, the progress
bars and the "five to open the next level" rule exactly as they were.

Three places recovered an exercise's base name by reaching straight into `PROG`,
the bodyweight ladder, rather than the one the slot actually climbed. On a gym
tree that answered with the wrong movement — wrong demo, wrong video, wrong
muscle marks, and no kilo field on a lift that takes one. They ask the style
now. The working weight itself is back too, and appears only on rungs that are
actually loaded, which is why it is on a machine press and not on a wall
push-up.

## The rest of the app

The planner sits on top of an app that was already there: a ten-level skill
tree, food
logging against calculated targets with a recipe bank per diet, dynamic and
static stretch routines, weight and measurement tracking, streaks and XP, a
four-week mesocycle, a four-week ramp for coming back after a layoff, reminders,
and profile export/import. Hebrew, English and Spanish.

## Errors and logic errors

A sweep that fires every action the app binds — 759 of them — on every screen,
under all three styles, ten edge-case profiles (blank, no training days, every
injury declared, no kit, 95 years old, 190 kg, level 10, mid-comeback, vegan
with allergies), then all three languages against both themes, and drives a
whole workout from warm-up to finish including a swap and an undo. Zero
exceptions, zero console errors.

Alongside it, the invariants that have to hold whatever the profile: calories
positive and above a floor, the four meals summing to exactly the day's target,
macros multiplying back to the same number, the XP curve monotonic with its
progress never outside its own bracket, streaks never negative or longer than
the days ever logged, water between 1.5 and 12 litres, the assessment always
landing in 1–10, every session matching the exercise count its duration
promises, warm-up plus strength plus cool-down equalling the chosen minutes, no
prescription with zero sets or zero rest, the return-from-a-break ramp never
cutting below one set and expiring after four weeks, the ISO week seed stable
inside a week and different across one, a swapped exercise surviving a rebuild,
and the level gate opening at exactly five. Nothing rendering NaN, undefined or
[object Object] — with the base64 blobs excluded, because "NaN" occurs in base64
often enough to make a naive scan useless.

What that turned up, and what was fixed:

**A gym profile from an older build arrived with no gym.** The pre-styles model
derived a gym from `location==='gym'` and never stored equipment for it, so
upgrading landed you on style "gym" with an empty kit — the screen said gym
while the generator, having nothing to work with, fell back to bodyweight and
showed no kilos. The kit is seeded from the style on the first boot that finds
it missing. Not in `migrateDB`, though: that runs at the top of the script and
the kit lists are `const`s in a block injected further down, so reaching for
them there is a temporal dead zone that takes the whole boot with it. It was
written that way first, and the migration test caught it.

**"Both" was true about nine times in ten.** The setting says a hybrid session
is built from bodyweight and gym movements together, and picking purely by tier
then level made that a tendency rather than a rule — a hybrid leg day at level
10 came out entirely bodyweight, 47 of 420 sessions across the kits and levels
measured. A one-sided session now gives its lowest-priority pick to the best
candidate from the missing side. It is 420 of 420.

**Two dead generators that did not know about styles.** `generateWorkout()` and
`woSwap()` are what `buildSession()` and `openSwapSheet()` replaced, and neither
has had a caller since — the action named `woSwap` calls `openSwapSheet`, which
is what made the name look live. They were also the only three places left
testing `style==='bodyweight'`, a value no profile can hold any more, which made
them the only code in the file that would silently ignore the training style if
anything ever called them again. Removed.

Also checked and clean: every `data-act` the HTML emits has a handler (no button
that does nothing), no duplicate `case` labels, no duplicate keys in any object
literal, no assignment where a comparison was meant, and every one of the seven
remaining unreferenced functions is a one-line helper rather than a second
implementation of something.

## Checking it still works

The planner is covered by headless-Chromium scripts that drive the real page
rather than the functions in isolation. The sweep builds every session across
three styles × their kits × one-to-seven days × three levels × three injury
states — 3,024 sessions — and asserts that each one is full, that no exercise
repeats, that every exercise is in the library and satisfiable with the kit,
that a same-muscle alternative exists, that a calisthenics session never
contains a gym movement, and that a full gym never falls back to bodyweight.
It passes clean.

Two bugs in this change were caught by that sweep and by nothing else. The
gym library reused two names the bodyweight library already had — a Bulgarian
split squat and a hanging leg raise — and `MOVE_BY_BASE` keys on the name, so
the gym entries silently shadowed the bodyweight ones everywhere in the app.
The generator asserts unique base names now. The second was depth: several
thin-kit combinations produced sessions of one or two exercises, which is what
the step-wise widening above exists to prevent.

A third surfaced later, from a count that did not add up: the sweep reported a
library of 206 movements, 123 bodyweight and 81 gym, which is 204. **The array
literal had two holes in it** — `},,,` where the two halves were spliced
together. A hole is an index `length` counts and every iteration method skips,
so `forEach`, `filter` and `map` all saw the right 204 and only `MOVES.length`
was wrong; nothing indexes the array directly, so nothing had broken yet. The
cause was the splice being run more than once: each pass strips the previous
run's gym lines and leaves that run's separator comma behind. It trims to a
single comma now and asserts that no `,,` survives.

## Languages

Hebrew, English and Spanish. The planner picks its own wording per language
rather than going through the app-wide word substitution, and every exercise in
the library carries its own Spanish name. The content the app ships — 208
foods, 47 machines with their steps, tips and common mistakes, 110 recipes with
ingredients and method, the stretches, the daily tips and the achievements — is
translated as whole strings, 1,187 of them, which `translateEl` matches exactly
and swaps wholesale.

That exact-match path exists because the fallback is word-by-word: it rewrites
known Hebrew words wherever they appear, so a phrase it only half knows comes
out as salad ("ירך קדמית" once rendered as "Thigh קדמית"). A whole-string entry
skips the substitution entirely. Anything a user typed themselves is marked
`data-notr` and is never touched — the food glossary used to translate the
author's own name, Yuval, into "jubilee".

Its sharp edge is that the key is the *whole* string, emoji included, so taking
an emoji off a heading silently drops it back into word-by-word and it comes
out as "טיפ today". Those headings pick their own wording per language now and
do not consult the dictionary at all.

The audit only sees what is on screen when it runs, which is a real limit: the
coach's caption ("Your coach trains with you · משיכה") went untranslated for as
long as the coach happened not to be doing a pull on the day anyone looked. It
picks its own wording now, like the rest.

A browser-driven audit walks every tab, every sheet, all 47 machine guides, the
food search and every recipe in both English and Spanish, collecting any text
node still holding Hebrew. It reports zero.

## Notes

`index.html` is ~24 MB because the fonts, the exercise clips and the food photos
are all embedded as data URIs. That is a deliberate trade — one file, no network,
works offline — but it is a real first-load cost and worth knowing before adding
more images. Supporting the gym put about 5.5 MB back: the eighteen clips that
demonstrate the loaded lifts the generator now prescribes. The five that only
ever illustrated skill-tree feats — a yoke carry, a double-bodyweight bench, a
human flag — are still out, because nothing prescribes them.

The 47-machine guide came back too, at 0.14 MB. It was dead code in the file as
uploaded: a catalogue with steps, cues and common mistakes that nothing linked
to. It now has a button on the skills tab for anyone not training bodyweight
only, and the coach figure beside each machine marks the muscles it works,
read in the order the entry names them — which is what keeps a leg press filed
under quads and a lying leg curl out of quads entirely.

The information in the app is not medical advice.
