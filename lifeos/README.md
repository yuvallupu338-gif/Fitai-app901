# LifeOS

<div dir="rtl">

מערכת הפעלה אישית לחיים. לא עוד אפליקציית משימות — מערכת שמחברת בין מה שחשוב
לך לבין מה שאתה עושה עכשיו, ויודעת לענות על השאלה שבגללה נבנתה:

**מה כדאי לי לעשות עכשיו?**

</div>

The answer it gives is not a list. It is one task, a duration, and a reason
made of facts:

<div dir="rtl">

> תעבוד 35 דקות על הניווט באתר. יש לך כרגע חלון פנוי של 50 דקות, המשימה חוסמת
> את הבדיקות שתכננת למחר והיא שייכת לפרויקט בעל העדיפות הגבוהה ביותר שלך.

</div>

Every clause there is a field in the database. Nothing in it was written by a
language model, and nothing in it changes if you unplug the network.

## Running it

Plain ES modules. No build step, no dependencies, no bundler. It needs to be
served over http — ES modules do not load from `file://`:

```bash
npx http-server -p 8080 .      # from the repository root
open http://localhost:8080/lifeos/
```

Or open `../dist/lifeos.html`, the single-file build, straight off the disk.

That is the whole setup. There is no database to provision, no `.env` to fill
in, and no `npm install`.

## What it is

The hierarchy the product rests on:

```
תחום חיים  →  מטרה  →  פרויקט  →  אבן דרך  →  משימה
```

Every arrow is optional downwards — most captured tasks have no project — and
every level answers a different question. An area never ends. A goal is a
result. A project has a finish. A milestone is a real step, not another task.

Around that: a calendar with time blocking, habits with a minimum version,
routines, focus sessions, notes, an inbox, weekly and monthly reviews, and a
planner that fits the work into the day you actually have.

### The core loop

```
קליטה → ארגון → תעדוף → תכנון → מיקוד → ביצוע → למידה → התאמה
```

It closes. Completing a task in focus mode moves the project's progress, which
moves the goal's, which changes what Today recommends, which changes what the
next-action button says — all from the same records, with no separate
denormalised copy to fall out of step.

## Architecture

```
lifeos/
  index.html
  src/
    app.js            boot, routes, keyboard
    core/             dom, time, storage, db, session, router, i18n, icons
    domain/           entity schemas and a small validator
    engine/           all the deterministic logic — pure functions
    services/         the layer that owns writes and the activity log
    ai/               provider abstraction, retrieval, guards, local rules
    ui/               one module per screen
    styles/           tokens, base, components, layout
    locales/he.js     every string the app can say
  tests/              node:test suites, no browser required
```

The dependency direction is strict and one-way:

```
ui  →  services  →  engine
        ↓             ↑
       core        (pure, imports only core/time)
```

`engine/` never imports `db.js` or `session.js`. It takes a context object and
returns a value. That is what lets 259 tests run in two and a half seconds with
no browser, and it is why the planner can be reasoned about at all.

### The planner

```
collect constraints
   ↓
find free windows          real instants, never "1440 minutes"
   ↓
rank eligible tasks        deterministic score, five weighted terms
   ↓
fit tasks into windows     greedy by rank; deep work prefers the focus window
   ↓
reserve buffer             15% of the day, held back on purpose
   ↓
validate                   conflicts, overload, deadlines
   ↓
explain                    reason codes → Hebrew sentences
```

The priority score is the specification's, with the weights configurable and
normalised so that dragging every slider to maximum expresses no preference:

```
priorityScore =
    importance        × 0.30
  + urgency           × 0.25
  + goalImpact        × 0.20
  + deadlinePressure  × 0.15
  + unlockPotential   × 0.10
```

The first three are values a person set. The last two are computed, which is
the point of having them — a deadline moves closer every day whether or not
anyone re-rates the task, and how many other tasks are waiting behind this one
changes every time the graph changes.

Deadline pressure is a hyperbola rather than a ramp (`1 / (1 + days/3)`), so
the difference between due-today and due-tomorrow is large and the difference
between three weeks and four is almost nothing. A linear countdown gets that
backwards, and produces the familiar failure where something three weeks out
quietly outranks this afternoon's deadline.

The score decomposes, and the interface shows the decomposition. A ranking you
can argue with is a ranking people trust; an opinion is one they ignore.

### Time

`core/time.js` is the file most likely to be underestimated.

Nothing in this app uses the machine's local timezone. A day is an ISO string
in `Asia/Jerusalem`, a time of day is minutes after midnight, an instant is a
UTC millisecond count, and conversion goes through `Intl` with an explicit
zone. A planner that reasons in the traveller's laptop timezone silently builds
the day for the wrong seven hours.

Israel's clocks move at 02:00 on a Friday in March and a Sunday in October,
making one day 23 hours long and another 25. `dayLengthMinutes()` asks the
calendar instead of assuming, and the tests assert both dates. Two subtler
cases are handled and pinned by tests: a repeated hour resolves deterministically
to the second occurrence, and a nonexistent hour clamps **forward** — because
the naive arithmetic maps 02:30 later than 03:00, which makes every window
computed as `end − start` across that hour come out negative.

Times are 24-hour. Dates are day-month-year. The week starts on Sunday. Friday
and Saturday are the weekend. None of these are settings that default that way;
the audit fails the build on an `AM`, an `hour12: true`, or an `en-US` format.

### AI

The provider interface is the specification's, and every method has the same
shape:

```
1. compute the answer locally, with the engines           (always)
2. if the assistant is off or has no key, return that     (done)
3. otherwise ask a model, with a context built for this question only
4. validate the reply against a schema
5. check every id it returned against the database
6. on any failure at 3, 4 or 5 — return the local answer
```

Step 1 running unconditionally is what makes step 6 free. There is no degraded
mode to design and no error state to show: a network failure, a rejected key, a
malformed reply and a hallucinated id all land on an answer that was already
computed. What changes is a label — *מחושב מהנתונים שלך* or *נוסח על ידי מודל* —
because a person should know which one is talking to them.

**Without an API key nothing is missing.** Plan the day, rank the tasks, break
down a goal, split a task, read a captured Hebrew sentence, summarise the week,
suggest what to do now, explain why — all of it runs offline and deterministically.
A model adds better phrasing and handles a goal that resembles nothing in the
template library. That is a real improvement. It is not the product.

Three guards sit between a model and the data:

- **Retrieval, not dumping.** One context builder per request type, each
  assembling the minimum. "What should I do now" sends the clock, the free
  window, the top eight ranked tasks and their deadlines. Not four hundred
  tasks, not notes, not history. The privacy screen can state what leaves the
  device because `ai/context.js` is the only place that decides.
- **Identifier checking.** Every id in every response is validated against the
  actual collection, and against the set that was offered — a guess that happens
  to be a real id is more dangerous than one that is not.
- **Injection.** User text is fenced and labelled as data, which helps. What
  actually holds is that the schema has no field capable of destroying
  anything: the model returns ids and enum values, and every mutation goes
  through a service function a person triggered. The worst outcome of a
  successful injection is a bad suggestion in a preview somebody declines.

Providers: Anthropic, OpenAI, Google Gemini. Keys are stored per vendor at
device scope, sent to exactly one host, and never included in an export.

### The app writes the tasks itself

§13 asked for a preview: propose the projects, milestones and first steps, and
let a person tick what they want. That is the cautious design, and it has a
cost that only shows up in use — a new goal drops you into a review screen with
fourteen checkboxes before you have done any thinking about the goal itself.
The common outcome is "select all", which is a confirmation dialog wearing a
plan's clothes.

So the default is inverted. **Creating a goal creates the work under it**, and
**finishing the last task in a project produces the next ones.** The app takes
the first move.

Three things make writing directly safe, and all three are load-bearing:

- **It is undoable, exactly.** Every auto-creation returns a token naming the
  records it made, and undo removes precisely those — not "the last N tasks",
  which would take somebody's own work with it if they typed one in between.
  Anything since started, completed, scheduled or edited is left alone; by the
  time somebody presses undo they may already have begun one of the tasks.
- **It is visible.** Records are stamped with actor `AI` or `SYSTEM` and appear
  in the activity log, so *where did these six tasks come from* has an answer
  on a screen.
- **It can be turned off.** `autoPlan` in settings restores the preview. An app
  that writes to your database without asking needs an off switch, and one that
  hides it is worse than one that always asks.

It never touches a task a person wrote, never deletes, never reschedules, caps
a refill at four tasks — a refill of twenty is a wall, not a next step — and
stops asking a project whose plan is exhausted, so a finished project does not
cost a generation pass on every tick.

All of this works with no API key: the local template library is what produces
the plan, and a model only produces a better one.

### Hebrew

Not a translation layer. One catalogue, `src/locales/he.js`, and every string in
it was held to one test: would an Israeli write this?

That rules out most of what a productivity app usually says. "הפעולה שלך
הושלמה בהצלחה" is grammatical and nobody has ever said it; "המשימה הושלמה" is
what a person writes. The possessive is the clearest tell — English attaches
*your* to everything and Hebrew mostly does not, so it appears only where
dropping it would change the meaning.

Counted nouns carry three forms, because Hebrew numerals agree with gender:
one task is *משימה אחת*, two are *שתי משימות*, while one day is *יום אחד* and
two are *יומיים*. There is no rule that derives one from the other without
knowing the noun, so the catalogue holds all three.

RTL is structural, not a stylesheet. Every rule uses the logical axis —
`margin-inline-start`, `inset-inline-end`, `text-align: start` — so the sidebar
lands on the right without a single direction-specific rule. Directional icons
are a named hazard: `next`/`prev` mirror with the writing direction,
`chevronRight`/`chevronLeft` never do, and they are different names for the
same drawing. Clock times and signed numbers are direction-isolated; **ranges
deliberately are not**, because "8–12" in an RTL paragraph is read start-first
and forcing it LTR reverses the reading order.

`node tools/lifeos-audit.mjs` checks all of this mechanically and exits non-zero.

## Storage, and what this is honest about

Everything is in `localStorage`, one serialised blob per account. There is no
server; this is a static site.

That has a consequence worth stating plainly, and the sign-in screen states it
in Hebrew too:

**The account separation is real, but it is not protection.** Every read and
write resolves its owner through the session, `db.js` refuses any record whose
`userId` does not match, and no service function takes a `userId` argument — so
there is no parameter for a caller to lie in, and two profiles on one browser
cannot see each other through the app's API. That is tested from both
directions, including by id, which is the case that matters.

What it is not is protection against somebody with the device. Anything in
`localStorage` is readable from a devtools console regardless of who is signed
in. Passwords are still hashed rather than stored — salted PBKDF2-SHA256 at
210,000 iterations — because people reuse passwords and a plaintext one is a
gift to anything that reads the origin. But a password here separates profiles;
it does not defend them.

The specification asks for server-side authorization (§140–141). Half of that
is achievable without a server and half is not. The half that is, is
implemented and tested. The other half is a backend, and `core/store.js` is the
seam it goes behind — everything above it asks for "the data for this account"
and writes it back.

### Persistence

`store.js` reports honestly when the browser refuses to keep anything — private
browsing, a full quota — because an app that pretends otherwise loses somebody's
afternoon. The session continues from memory and the interface says so, before
the first question rather than after the tenth.

## Testing

```bash
cd lifeos && node --test "tests/*.test.mjs"     # 259 tests, ~2.5s
node tools/lifeos-audit.mjs                     # Hebrew, RTL, i18n keys
node tools/lifeos-e2e.mjs                       # the full flow in Chromium
```

The suites:

| file | what it pins |
|---|---|
| `time.test.mjs` | timezone, both DST transitions, the repeated and the nonexistent hour, monotonicity |
| `engine.test.mjs` | priority, dependencies, capacity, deadlines, health, progress, recurrence, learning, alignment |
| `planner.test.mjs` | §174's scenarios, plus: never propose what cannot be placed, never move a fixed block |
| `nlp.test.mjs` | every Hebrew capture pattern on a real sentence |
| `services.test.mjs` | user isolation from both directions, CRUD invariants, the §178 loop end to end |
| `ai.test.mjs` | §176 — malformed JSON, missing fields, invented ids, deleted records, duplicate proposals |

The E2E walk drives a real Chromium: sign up, onboarding, capture in Hebrew,
plan, focus, complete, and the numbers moving — plus the five widths from §180,
light and dark, the RTL geometry, and a scan of every rendered screen for
English that was never meant to ship.

## Demo data

```
Settings → הנתונים שלך → לטעון נתוני הדגמה
```

Creates a separate account, so your own data is untouched. It seeds a fortnight
of real history — completed tasks with timestamps, focus sessions with
durations, habit completions, backdated activity events — rather than writing
statistics onto a review record. Every number on every screen is then derived
by the same code path as for a real account, which makes the demo a test as
well as a demonstration.

The estimates are seeded to run about 35% light, because that is the finding
§53 describes. It is seeded as data, not as a conclusion: `learn.js` derives
the percentage itself, or does not, depending on whether the numbers really say
so.

One project is deliberately behind — and behind for a reason the rest of the
demo tells, since the website has been eating the afternoons the exam needed.
`health.js` works that out from the estimates and the calendar. Nothing in the
seed says "at risk".

## Environment variables

None. There is no server, no build and no secret. API keys are entered in the
settings screen and stored on the device.

## Deployment

It is a static site. Point GitHub Pages at the branch root and it is served at
`/lifeos/`; every path in the app is relative, so a project subpath works. The
theme is applied by nine inline lines before the stylesheets load, so a dark-mode
reader does not get a white flash at 23:00.

## Known limitations

- **No server, so no real authorization.** Discussed above at length. This is
  the one gap between what the specification asked for and what a static site
  can be.
- **No calendar sync.** `CalendarEvent` carries `source` and `externalId`, and
  the service layer is shaped for it, but nothing imports from Google or
  Outlook. Two-way sync needs a server for the OAuth exchange.
- **Notifications are in-app only.** A static page cannot wake a phone. The
  deadline warnings and the daily brief appear when the app is open, which is
  honest; a fake notification setting would not be.
- **OpenAI cannot be called from the browser.** Its API refuses cross-origin
  requests. The provider is in the table because somebody behind their own
  proxy has a working setup, and because the error message can then say what
  actually happened rather than "network error".
- **Storage is bounded.** Roughly 5 MB. The activity log is capped at 2,000
  events — about a year of heavy use — and older entries are dropped from the
  head. Nothing displayed reads further back than ninety days.
- **Recurring tasks are not materialised.** One record and a rule; the next
  occurrence is computed. This is the right trade, but it means a recurring
  task cannot be edited for one specific future occurrence only.

## Recommendations for V2

In the order they would actually pay off:

1. **A backend.** Not for features — for authorization, multi-device sync, and
   a server-held API key. `store.js` and `session.js` are the only two files
   that change.
2. **Google Calendar, read first.** Reading external events makes every free
   window and every feasibility check correct for people whose real commitments
   live elsewhere. Writing back can come later.
3. **Estimate suggestion.** The calibration already knows that development tasks
   run 40% over. Offering that number when a person types an estimate is a
   small change to the task editor and the most directly useful thing the
   learning layer could do.
4. **Capacity forecasting.** The feasibility check answers "will this project
   finish". The same arithmetic across every project answers "what will I
   actually get done this month", which is the question people ask in January.
5. **A knowledge graph over notes.** Only once notes are genuinely being used —
   building it first produces a graph of an empty set.

Deliberately not planned: collaboration, and anything that turns notes into a
document editor. Both change what the product is.

## License

The fonts (Rubik, Heebo, IBM Plex Mono) are licensed under the SIL Open Font
License 1.1 and embedded as base64 by `tools/lifeos-fonts.mjs`.
