# TomorrowAI

<div dir="rtl">

TomorrowAI לומד איך היום שלך באמת עובד — מתי יש לך אנרגיה, מתי אתה מרוכז, כמה
זמן משימות באמת לוקחות לך — ומראה לך איך מחר צפוי להיראות עוד לפני שהוא מתחיל.
ואז מציע שינוי אחד קונקרטי שיכול לשפר אותו.

</div>

It is not a to-do list with a calendar attached. The product is one loop:

```
evening   plan → analyse → predict → improve
morning   check in → recalculate
during    adapt
next day  compare what was predicted against what happened → learn
```

Everything else exists to serve that loop, and the app is supposed to get more
accurate the longer somebody uses it.

## The magic moment

Open it in the evening and see:

```
Tomorrow Score      74
Best focus          09:50–11:20
Main risk           the afternoon is overloaded
Highest impact      sleep 45 minutes earlier
```

Press **Improve Tomorrow**, watch 74 become 86, and read exactly which four
changes did it and why. That moment is what the rest of the app is built around.

## Running it

Plain ES modules, no build step, no dependencies. It needs to be served over
http, because ES modules do not load from `file://`:

```bash
npx http-server -p 8080 .        # from the repository root
open http://localhost:8080/tomorrow/
```

There is nothing to install and nothing to configure. The app makes no network
requests at all — the page's Content-Security-Policy sets `connect-src 'none'`,
so it could not phone home even if a bug tried to.

## Prediction, not magic

The one rule the whole product is written against: **TomorrowAI never claims to
know the future.** Every prediction is an estimate carrying a confidence, and
the copy says so.

> Wrong: "You will be tired at 14:00."
> Right: "Going by your recent days, a dip in energy is likely around 14:00."

The same discipline runs through the numbers. Confidence does not rise on day
count alone — twenty inconsistent days score lower than seven consistent ones.
Accuracy reports `—` rather than a flattering default when there is nothing to
compare. An insight needs at least three comparable samples before it is allowed
to exist, and it always shows the evidence behind it.

## How it is put together

```
tomorrow/
  index.html            strict CSP, RTL, one mount point
  CONTRACTS.md          the spec every module is written against
  src/
    core/               time, formatting, DOM helpers, store, motion, memo
    storage/            schema, adapter, migration — swappable for a backend
    engine/             the whole model. Pure, deterministic, Node-importable
    ui/                 one module per screen
    data/               catalog of enums, and the demo world
    styles/             tokens, base, components, views
```

`src/engine/` is the part worth knowing about. It is **pure**: no `Math.random`,
no `Date.now`, no DOM, no storage, no mutation of its arguments. The current time
is always passed in. Given the same input it returns byte-identical output, which
is what lets the what-if sandbox run it on cloned state and the optimiser run it
a few hundred times inside one button press.

| module | what it decides |
|---|---|
| `energy.js` | a curve across the day: circadian shape, sleep debt, accumulated load, workouts, how you said you feel |
| `focus.js` | a *separate* curve — you can be energetic and unfocused, and the model can produce that |
| `scoring.js` | six weighted factors into one number, and the reasons behind it |
| `risk.js` | overload, conflicts, low energy, procrastination, no free time, sleep |
| `scheduler.js` | where a task should go, and seven invariants about where it may not |
| `learning.js` | the personal model, and how much of it to trust yet |
| `confidence.js` | how much any of this is worth |
| `insights.js` | patterns, gated on evidence |
| `accuracy.js` | predicted against actual |
| `optimize.js` | Improve Tomorrow, and the single highest-impact change |
| `simulate.js` | What If, on a clone that can never reach the store |
| `predict.js` | the order they run in |

## Learning

The headline is duration. The app watches how long things actually take against
what you estimated, and after a few comparable samples it starts scheduling the
real number instead of the optimistic one — visibly, as a suggestion you can
accept, never by silently rewriting your estimate.

The blend between the default model and your personal one moves as evidence
accumulates: roughly 10% personal on day one, about 45% after a week, about 75%
after a month — and less than that if your days are inconsistent. New
observations outweigh old ones through an exponential moving average, so a habit
that changed last week wins over one from last month.

## The AI chat

There is no language model connected to this app, and the chat screen says so.
Answers are built locally from the forecast already on screen, which is why they
quote exact times and exact scores. `engine/chat.js` exposes `setAdapter()` for
the day a real model is added, and the screen reads the current mode rather than
assuming — but nothing here fakes a request that is not happening.

## Verifying it

```bash
node tools/tomorrow-validate.mjs                              # engine, pure Node
NODE_PATH=/opt/node22/lib/node_modules \
  node tools/tomorrow-smoke.mjs                               # the real app, real browser
```

Both were written against `CONTRACTS.md` before the modules existed, so they test
what the app promised rather than what it happened to do.

The validator fails the build on non-determinism, on a scenario that mutates the
store, on an `Improvement` whose changes do not reproduce the score it promised,
on a scheduler invariant being broken, on an insight below its sample gate, on
confidence rising from day count alone, on accuracy reported with nothing behind
it, and on demo data whose derived numbers disagree with its own history.

The smoke test drives a real browser through onboarding, the evening ritual,
Improve → Apply → Undo, What-If → Cancel, quick add in Hebrew, the check-in, the
review, every screen, a reload with the data intact, deliberately corrupted
storage, and six viewport widths asserting nothing overflows.

## Data

Everything is local. One `localStorage` key, a `schemaVersion` and a migration
seam, and a storage adapter that a backend can replace without touching a call
site. The app is honest when the browser refuses to store anything — private
mode or a full quota — and says so *before* you spend a minute on the evening
ritual you are about to lose.
