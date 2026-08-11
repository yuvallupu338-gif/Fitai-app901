# DailySpark

**ניצוץ אחד ביום.** One item a day — a thought, a two-minute action, or a
technique — picked for the person by a recommender that runs entirely on their
device. No account, no server, nothing leaves the phone.

Hebrew, RTL-first, offline-first. Vanilla ES modules, no framework, no build
step for development.

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
scrolling and never behind a confirmation.

**A mood check-in that changes the spark, not just the record.** It runs before
the reveal, and it is skippable.

**A book.** Every spark, as a timeline, a year heat map, and a saved list.

**Weekly insights** that refuse to speak with fewer than four days of data, and
end with exactly one action rather than six findings.

**A streak that counts showing up, not succeeding**, absorbs missed days with a
monthly freeze allowance, and resets without commentary when the allowance is
gone.

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
the *"למה קיבלת את זה"* line on the card true rather than decorative.

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
Thompson sample away from letting one through.

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
    data/    taxonomy and the spark library (three files, one validated index)
    engine/  vector, bandit, safety, framing, selection
    ui/      onboarding, home, book, insights, profile, share card, notifications
    styles/  tokens, base, components, embedded fonts
```

Two files are worth reading first: `core/day.js`, which is where "today" is
defined and why it rolls at 04:00 rather than midnight, and `engine/select.js`,
which is the whole pipeline in one place.

---

## Known limits, stated plainly

**Reminders only fire while a tab is alive.** A purely local web app cannot ask
to be woken at a chosen time — Notification Triggers never shipped, and push
requires a server. The scheduling model, the fatigue ladder and the send-time
bandit all work locally and are ready for a push sender to call instead of the
timer, but the app says this on the settings screen rather than implying
reminders that will not arrive.

**No language model.** The framing layer is rules-based. See above.

**Eighty sparks.** The product is designed around a library in the thousands;
this one ships with a seed. That is not only a content gap — it changed the
engine. The no-repeat rule was originally "never within 365 days", and a
sixty-day simulation showed the eligible pool emptying inside three months,
after which every day fell through to the relaxation ladder and learned
preferences stopped mattering at all. It is now a fraction of the library
(`REPEAT_FRACTION`), which behaves correctly at eighty items and restores the
original year-long intent at eight hundred without a code change.

---

## Checks

`tools/dailyspark-smoke.mjs` drives the real app in Chromium and asserts the
promises rather than the widgets: one spark per day and the same one after a
reload, a response that moves the model, a fragile mood that cannot be handed a
demanding item, a missed day absorbed rather than punished, a year grid that
renders.

It then runs the selector through **sixty simulated days** with a lopsided
response pattern, because the failures that matter in a once-a-day app do not
appear in a session — they appear in month three as *"it keeps giving me the
same thing"*. That run asserts every day produced a spark, repeats stayed at
least fifty days apart, coverage stayed broad across all twelve areas, no
category ran more than three days straight, not one unsafe spark reached a
fragile day, and the posterior ended up preferring what actually got acted on.

The library itself is validated at import time and throws on a bad row: unknown
category, over-length copy, an unknown topic, or a `safe` flag on something that
is not micro-sized. That check has already caught nine real inconsistencies in
this library — a spark the ranker could score but no filter could exclude is a
silent hole in the candidate pool, and the cheapest place to find it is at load.
