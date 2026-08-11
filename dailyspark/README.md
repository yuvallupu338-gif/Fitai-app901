# DailySpark

**ניצוץ אחד ביום.** One item a day — a thought, a two-minute action, or a
technique — picked for the person by a recommender that runs entirely on their
device. No account, no server, nothing leaves the phone.

Hebrew, RTL-first, offline-first. Vanilla ES modules, no framework, no build
step for development. 260 sparks, 8 journeys, 51 checks.

```bash
# development — serve the repo root and open /dailyspark/
python3 -m http.server 8000

# single file you can open from disk, keep, or email
node tools/build-single.js dailyspark/index.html dist/dailyspark.html

# drive it in Chromium, including a simulated sixty days of use
NODE_PATH=/opt/node22/lib/node_modules node tools/dailyspark-smoke.mjs
NODE_PATH=/opt/node22/lib/node_modules node tools/dailyspark-smoke.mjs --single
NODE_PATH=/opt/node22/lib/node_modules node tools/dailyspark-smoke.mjs --shots
```

The full product specification this was built from is in
[`docs/dailyspark/`](../docs/dailyspark/).

---

## What it does

**One spark a day.** It appears on the home screen, it does not change when you
reopen the app, and there is no feed. Every spark carries a stated time budget
and a concrete action — the test each one had to pass is "what exactly do I do
in the next minute?"

**Three responses.** *עשיתי / לא היום / לא בשבילי.* This row is the product's
only labelled training data, which is why it is always visible without
scrolling and never behind a confirmation. Rejecting asks a reason, and each of
the four reasons corrects something different.

**A mood check-in that changes the spark, not just the record.** It runs before
the reveal, and it is skippable.

**Journeys** — 7- and 14-day arcs around one subject, written as constraints
rather than as a fixed playlist so the ordinary selector still picks the item
and every other rule still applies. They pause themselves on a bad day.

**A book** with a timeline, a year heat map, saved items, named collections,
search that falls back to meaning when the literal pass finds nothing, and a
print layout that turns a year into something you can put on a shelf.

**Weekly insights** that refuse to speak with fewer than four days of data, and
end with exactly one action rather than six findings.

**A streak that counts showing up, not succeeding**, absorbs missed days with a
monthly freeze allowance, and resets without commentary when the allowance is
gone.

**Read aloud**, when the device has a Hebrew voice — free for everyone, because
for a person who cannot comfortably read a phone screen it is not a premium
feature, it is the only way in.

---

## The engine

```
library → hard filters → bandit ranking + diversity → framing → safety gate
```

The order is the design. Filters run before ranking so no score can promote a
blocked topic or an unsafe item; safety runs last because framing is the only
step that assembles text at runtime.

**Topic space instead of embeddings** (`engine/vector.js`). There is no
embedding model in a static page, so similarity is cosine distance in an
explicit forty-axis topic space that a human tagged. It is a smaller claim than
a learned embedding and it buys two things in return: it works from the first
session with no download, and every score is inspectable — which is what makes
the *"למה קיבלת את זה"* line on the card true rather than decorative. The book's
fallback search uses the same space, so *"משהו על להתחיל כשאין כוח"* finds
things no substring match ever would.

**A per-user Bayesian logistic bandit** (`engine/bandit.js`), sampled with
Thompson sampling over 32 hand-built features. Chosen over anything deeper
because it works on day one, explores in proportion to genuine uncertainty,
updates in constant time on a phone, and can explain itself. A second, much
smaller Beta bandit picks the notification hour — and scores a reminder that
was *opened and acted on* above one that was merely opened.

**The safety layer** (`engine/safety.js`) is a hard filter, not a preference.
When the check-in reports overwhelmed, flat or exhausted, the pool is cut to
micro-sized, gently-toned, explicitly-marked items, the challenge lexicon is
banned, and exclamation marks are stripped. A bad day is exactly when a "crush
it today" card does the most damage, and a soft preference is one unlucky
Thompson sample away from letting one through. 87 of the 260 sparks qualify, so
a fragile day still gets real variety rather than the same three cards.

**Framing** (`engine/framing.js`) picks between the two author-written action
lines and prepends one short context clause. It deliberately does *not*
paraphrase the action: every action line in the app is text a human wrote and
checked. When a model is added later it goes behind the same `frame()` contract,
and its output still has to pass `checkCopy()` before anything is shown.

---

## Layout

```
dailyspark/
  index.html
  sw.js                    offline cache + the notification's action buttons
  manifest.webmanifest
  src/
    core/    dom helpers, persistent store, the definition of a day, streaks
    data/    taxonomy, six spark volumes behind one validated index, journeys
    engine/  vector, bandit, safety, framing, selection
    ui/      onboarding, home, book, insights, profile, journeys, voice,
             share card, notifications
    styles/  tokens, base, components, print, embedded fonts
```

Two files are worth reading first: `core/day.js`, which is where "today" is
defined and why it rolls at 04:00 rather than midnight, and `engine/select.js`,
which is the whole pipeline in one place.

---

## Two things the tests changed

Neither of these was visible from clicking around. Both came out of the
sixty-day simulation in the smoke test, which is the argument for having one.

**The no-repeat rule was killing personalisation.** It began as "never within
365 days" — correct for the eight-thousand-item library the product is designed
around. With a small library the eligible pool emptied inside three months,
every day fell through to the relaxation ladder, and the ranker's learned
preferences stopped mattering because there was nothing left to choose between.
It is now a fraction of the library (`REPEAT_FRACTION`), so it behaves
correctly at any size and restores the original year-long intent as the library
grows.

**A confident ranker got repetitive in a way the diversity term could not
see.** Topic cosine considers two focus sparks about different things to be
varied; a reader considers them "focus again". Added a run-length penalty over
the last five deliveries, which broke the runs without overriding a genuine
preference.

---

## Known limits, stated plainly

**Reminders only fire while a tab is alive.** A purely local web app cannot ask
to be woken at a chosen time — Notification Triggers never shipped, and push
requires a server. The scheduling model, the fatigue ladder and the send-time
bandit all work locally and are ready for a push sender to call instead of the
timer, but the app says this on the settings screen rather than implying
reminders that will not arrive.

**No language model.** The framing layer is rules-based, and says so both in the
code and in the app's own "about" text.

**Hebrew only.** The library is written in Hebrew and the interface is RTL-first.
English would need a second library, not a translation file — the copy rules
(no exclamation marks, no clichés, an action you could be seen doing) do not
survive machine translation.

**Read-aloud depends on the operating system.** The control only appears when a
Hebrew voice is actually installed, which on some desktops it is not.

---

## Checks

`tools/dailyspark-smoke.mjs` drives the real app in Chromium and asserts the
promises rather than the widgets: one spark per day and the same one after a
reload, a response that moves the model, a fragile mood that cannot be handed a
demanding item, a missed day absorbed rather than punished, a collection that
survives into storage, a journey that can be paused rather than only abandoned.

It then runs the selector through **sixty simulated days** with a lopsided
response pattern, because the failures that matter in a once-a-day app do not
appear in a session — they appear in month three as *"it keeps giving me the
same thing"*. That run asserts every day produced a spark, repeats stayed at
least fifty days apart, coverage stayed broad across all twelve areas, no
category ran more than three days straight, not one unsafe spark reached a
fragile day, and the posterior ended up preferring what actually got acted on.

A separate pass drives a journey through five days including a deliberately
fragile one, and asserts the arc **waited** rather than counting through it.

The library itself is validated at import time and throws on a bad row: unknown
category, over-length copy, an unknown topic, or a `safe` flag on something that
is not micro-sized. That check has caught twelve real inconsistencies in this
library — a spark the ranker could score but no filter could exclude is a silent
hole in the candidate pool, and the cheapest place to find it is at load.
