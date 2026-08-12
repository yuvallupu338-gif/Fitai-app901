# FitAI

<div dir="rtl">

מאמן קליסטניקס ותזונה אישי שרץ בדפדפן. הכל משקל גוף — אין משקולות, אין מוט,
אין מכונות. אתה אומר כמה ימים אתה מתאמן, כמה זמן יש לך ומה יש לך בבית —
והאפליקציה מרכיבה לך את השבוע: היא אומרת לך על אילו שרירים עובדים בכל אימון,
בוחרת את התרגילים בעצמה לפי הציוד והפציעות שלך, מחליפה אותם לבד פעם בשבוע,
ונותנת לך להחליף כל תרגיל בודד בתרגיל אחר לאותו שריר.

</div>

It is calisthenics only, and it is bodyweight only. Nothing in it asks for a
dumbbell, a barbell, a machine or a weight belt; the heaviest thing it will ever
suggest is your own body, and there is no kilo field anywhere. You progress by
moving to a harder variation, not by adding load. Everything runs on the
device — nothing is uploaded, there is no account, and the whole app is one file.

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

**The exercises are chosen for you.** A library of 123 calisthenics movements,
each tagged with the muscle it trains, the kit it needs and the level it belongs
at — from wall push-ups to the one-arm push-up, from table rows to the muscle-up,
from a chair squat to a pistol. The generator walks the day's muscles in rotation
and takes compounds before accessories, so a wall sit never opens a leg day.

**It only ever offers what you can actually do.** The kit is five things — a
pull-up bar, dip bars, rings, bands and an ab wheel — and it is a hard filter.
Tick nothing and you still get a full week from a floor, a wall and a doorway.
Declared injuries filter on top.

**It refreshes itself once a week.** The selection is seeded from the ISO week,
so it is identical every time you open the app inside one week and different the
next — the app says so when it turns over. `🔄 החלף אימונים` forces it early.

**Any exercise can be swapped.** Press `⇄` and the app names the muscle that
exercise is there for and lists other exercises that train the same muscle, each
with what it needs, what else it works, a demo and a video. Your pick sticks for
the rest of the week. When your kit and your injuries genuinely leave nothing
clean — a shoulder injury removes every press — it says so plainly and shows the
closest options flagged, instead of a dead end.

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

## The rest of the app

The planner sits on top of an app that was already there: a ten-level skill
tree — now laddering wall push-ups to the one-arm push-up, prone Y raises to the
muscle-up, chair squats to the pistol, and knee planks to the dragon flag — food
logging against calculated targets with a recipe bank per diet, dynamic and
static stretch routines, weight and measurement tracking, streaks and XP, a
four-week mesocycle, a four-week ramp for coming back after a layoff, reminders,
and profile export/import. Hebrew, English and Spanish.

## Checking it still works

The planner is covered by headless-Chromium scripts that drive the real page
rather than the functions in isolation. The sweep builds every session across six
kits × one-to-seven days × three levels × three injury states — 1,512 sessions —
and asserts that each one has six exercises, that every exercise is in the
library and satisfiable with the kit, that no session ever contains anything
matching a gym movement, and that no prescription anywhere carries a load. It
passes clean, as does an audit of the library, the skill tree, and all ninety
skill-tree popovers, none of which offer a kilo field.

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

`index.html` is ~18 MB because the fonts, the exercise clips and the food photos
are all embedded as data URIs. That is a deliberate trade — one file, no network,
works offline — but it is a real first-load cost and worth knowing before adding
more images. Going calisthenics-only took about 7.4 MB off it: the gym machine
directory and the twenty-three clips of loaded lifts nothing would prescribe any
more.

The information in the app is not medical advice.
