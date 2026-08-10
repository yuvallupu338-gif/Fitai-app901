# FitAI

<div dir="rtl">

מאמן כושר ותזונה אישי שרץ בדפדפן. אתה אומר כמה ימים אתה מתאמן, כמה זמן יש לך
ואיפה אתה מתאמן — והאפליקציה מרכיבה לך את השבוע: היא אומרת לך על אילו שרירים
עובדים בכל אימון, בוחרת את התרגילים בעצמה לפי הציוד והפציעות שלך, מחליפה אותם
לבד פעם בשבוע, ונותנת לך להחליף כל תרגיל בודד בתרגיל אחר לאותו שריר.

</div>

Everything runs on the device. Nothing is uploaded, there is no account, and the
whole app is one file.

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
weekly card does the same for each of your training days with the exercises
underneath. The muscle vocabulary is ten groups — chest, back, shoulders,
biceps, triceps, quads, hamstrings, glutes, calves, core — and every exercise
carries its own badge for the one it is in the session for, plus what else it
hits.

**The exercises are chosen for you.** A library of ~120 movements, each tagged
with the muscle it trains, the equipment it needs and the level it belongs at.
The generator walks the day's muscles in rotation and takes compounds before
accessories — a loaded compound first when you have weights, so a wall sit never
opens a leg day in a gym.

**It only ever offers what you can actually do.** Equipment is a hard filter:
a gym gets the machines, a home setup gets dumbbells, a bar and bands, a
bodyweight-only setup gets movements that need nothing but a floor and a
doorway, and a studio gets exactly what you ticked. Declared injuries are a
second hard filter on top.

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
figure stands beside it. The home screen carries the same figure for the
session as a whole, with a legend naming the primary muscles and the secondary
ones that only assist.

**Every exercise has a demo and a video.** Bundled clips where one exists,
the animated coach doing the movement pattern where one does not, and a video
button on every exercise everywhere it appears: the plan preview, the workout
screen, the swap sheet, the skill tree and the machine guide.

## The rest of the app

The planner sits on top of an app that was already there: a ten-level skill
tree, a 47-machine gym guide with steps, tips and common mistakes, food logging
against calculated targets with a recipe bank per diet, dynamic and static
stretch routines, weight and measurement tracking, streaks and XP, a four-week
mesocycle that moves sets and loads through build / volume / peak / deload, a
four-week ramp for coming back after a layoff, reminders, and profile
export/import. Hebrew, English and Spanish.

## Checking it still works

The planner is covered by two headless-Chromium scripts that drive the real page
rather than the functions in isolation. The sweep builds every session across
four environments × one-to-seven days × three levels × four injury states —
1,344 sessions — and asserts that each one has six exercises, no repeats, a
muscle and a video on every exercise, nothing that needs equipment you do not
have, and at least one same-muscle alternative to swap to. It passes clean.

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

A browser-driven audit walks every tab, every sheet, all 47 machine guides, the
food search and every recipe in both English and Spanish, collecting any text
node still holding Hebrew. It reports zero.

## Notes

`index.html` is ~26 MB because the fonts, the exercise clips, the machine photos
and the food photos are all embedded as data URIs. That is a deliberate
trade — one file, no network, works offline — but it is a real first-load cost
and worth knowing before adding more images.

The information in the app is not medical advice.
