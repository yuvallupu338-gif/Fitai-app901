# SkillTree

A skill tree for real abilities. Skills unlock when you meet their
requirements — a quiz you passed, a challenge whose tests went green, a
standard you can actually hit — not when you press "done".

Three trees ship with it: Web Development (33 skills), Mathematics (21) and
Calisthenics (22), with 154 activities between them.

## Running it

Plain ES modules. No build step, no dependencies, no `package.json`. It needs
to be served over http, because ES modules do not load from `file://`:

```bash
npx http-server -p 8080 .        # from the repo root
open http://localhost:8080/skilltree/
```

Or open the prebuilt single file, which works straight off the disk with no
server at all:

```bash
open dist/skilltree.html
```

### See the whole product immediately

```
http://localhost:8080/skilltree/#/demo
```

That installs a populated profile — level 6, 33 skills across all three trees,
11 mastered, a 15-day streak, ten achievements, a goal path and a review queue.
It is created as a *separate* profile, so trying it cannot cost you real
progress. See [Demo data](#demo-data) for why none of it is hand-written.

## What it actually does

Everything below is wired up. There are no buttons that do nothing.

- **Interactive graph** — drag to pan, wheel or pinch to zoom, click a node to
  open it, hover or focus to light its whole dependency chain in both
  directions, arrow keys to move between nodes.
- **Real dependencies** — a skill can require several others at different
  levels. React needs JavaScript ≥ 3, the DOM ≥ 3 and Flexbox ≥ 2.
- **Graded activities** — lessons, quizzes, numeric practice, code challenges,
  checklists. Code challenges execute your function against test cases.
- **XP, levels and mastery** — earned from graded work, stored as an event
  ledger, and recomputed rather than trusted.
- **Unlocks** — gates evaluated from the same function that renders the
  requirements list, so the two can never disagree.
- **Achievements, streaks, goal paths, daily missions, a review queue.**
- **Progress analytics** — daily XP and a skill radar, both with a table view.
- **Dark and light themes**, a designed mobile layout, keyboard operation.
- **AI coach and tree generation** — optional. See [AI](#ai).

## How progression works

Three decisions are worth knowing, because they are what stop this being a
to-do list with a graph on top.

**A skill level is the minimum of two ladders.** XP measures how much work you
have done; a mastery score measures how well it went. Your level in a skill is
the highest level for which you have *both*. Replaying the cheapest activity
forty times cannot move you past level 2, because mastery is computed from
graded work and repeats are worth almost nothing.

**Level thresholds scale with the skill.** Each skill has a capacity — the XP
it yields from one clean pass of everything in it — and the level thresholds
are fractions of that: a quarter for level 2, half for 3, three quarters for 4,
all of it for 5. Passing everything once at 100% lands exactly on the level-5
XP threshold. (Absolute thresholds were tried first and were badly wrong: a
skill offering 25 XP needed 300 for level 3, so nothing ever unlocked. The
tests caught it; the app looked fine.)

**Mastery and confidence are separate numbers.** Mastery is what you earned and
it does not decay. Confidence is how much of it still reflects today, and it
falls with time away, with a half-life that stretches the better you learned
the thing. So the app says "you mastered this — a review would bring it back"
instead of quietly deleting progress.

The mastery score itself is a weighted blend of assessment performance,
challenge performance, retention (how you did on attempts made after a real
gap) and consistency (distinct active days). Components with no evidence yet
are dropped and the remaining weights renormalised, so a learner's first
assessment is not averaged against a history they have not had time to build.
Weights live in `domain/mastery.js` and are overridable per profile.

## Architecture

```
skilltree/
  index.html
  src/
    core/       store, session, router, dom helpers
    domain/     pure logic — no storage, no DOM, no clock
    data/       the three trees, the catalogue, the demo profile
    ai/         provider abstraction, coach, tree generator, validation
    ui/         screens and components
    styles/     tokens, base, components
```

The layering is strict and it is the thing to preserve:

- **`domain/`** is pure. Functions take state and return state. The clock
  arrives as an argument. Nothing there imports storage or touches the DOM,
  which is why all of it is unit-tested without a browser.
- **`core/session.js`** is the only place a UI component may change learner
  state. Every screen calls it; none of them compose the steps themselves.
- **`ui/`** renders and collects input. It never decides an outcome — the
  activity screen reports *what happened*, and `domain/progress.js` decides
  what it was worth. A learner cannot award themselves XP by editing the page.

`applyAttempt` in `domain/progress.js` is the single function that changes
progress. It grades nothing, trusts nothing from the caller beyond the answers,
and returns a list of what changed so the UI can announce it rather than
re-deriving it by comparing snapshots.

### On the absence of a server

The brief this was built from asked for Next.js, Prisma and PostgreSQL, with
XP validated server-side. This repository is a zero-dependency static site
served from GitHub Pages, and after auditing it we built SkillTree to match —
so it deploys where the rest of the repo deploys, runs offline as a single
file, and could be verified end to end rather than only typechecked.

The honest consequence: **there is no server-side validation, because there is
no server.** Progression is deterministic and centralised in `domain/`, which
is the strongest guarantee available client-side, but a determined user can
edit their own localStorage. That is a real limitation, not a solved problem.
Everything else the brief asked for in that area — a single authoritative
progression path, an append-only XP ledger, idempotent attempts, validation of
all AI output — is implemented and tested.

"Accounts" are likewise local: named profiles on this device, switchable, with
JSON export and import. The interface says so plainly rather than implying
authentication it does not have.

## Data model

Stored under one localStorage key, `skilltree.v1`.

```
root
  activeProfileId
  profiles[id]
    name, createdAt, onboarded
    skills[skillId]        see below
    xpEvents[]             append-only ledger: amount, reason, skillId, kind, at, key
    achievements[id]       -> earned timestamp
    streak                 current, longest, lastDay
    goal                   treeId, targetSkillId, text
    missions               day, items[], completed[]
    analytics[]            internal event trail, bounded
    settings               theme, intensity, aiRecommendations, leaderboard
```

A `skills[skillId]` record:

```
skillId, difficulty, capacity        capacity = XP available from a clean pass
xp, level, masteryScore, confidence  all derived, all recomputed on read
attempts[]                           id, activityId, kind, score, passed, at
passCounts{}                         per-activity passes, drives repeat decay
startedAt, lastPracticedAt, completedAt, masteredAt
```

Totals are never stored on their own. Every XP figure in the app is folded from
`xpEvents`, which is what makes the charts, the streak and the analytics agree
with each other by construction.

## Content and grading

Grading is deterministic and needs no model:

| Activity | How it is graded |
|---|---|
| Lesson | Reading it is the completion. |
| Quiz | Known answers, scored exactly. 70% to pass. |
| Practice (maths) | Exact answers with tolerance. `0.5`, `1/2` and `50%` all parse. |
| Challenge (code) | Your function is executed against test cases. All must pass. |
| Checklist | Self-attested, labelled as such in the interface. |

Two details worth knowing about the code grader. Test fixtures are deep-copied
before every run, because several challenges deliberately check that you did
*not* mutate the input — without the copy, one mutating submission corrupts the
fixture for every later attempt. And loop conditions in submitted code are
rewritten to check a deadline, because racing a promise against a timer cannot
interrupt a synchronous `while (true) {}`: JavaScript is single-threaded, the
timer never fires, and the tab freezes.

Multiple-choice options are permuted deterministically at registration, seeded
from the question text. Every question in this repo was authored with its
answer first, which would have made the whole quiz system beatable by always
clicking the top option.

## AI

Optional, and additive. **Core progression works with no API key** — every gate,
score, level and unlock in the app is deterministic. AI is used for:

- the skill coach (chat and code hints),
- generating a new skill tree from a plain-language goal,
- qualitative commentary on a submission — which cannot change a score the
  tests already decided.

Three providers behind one interface (`ai/provider.js`): Anthropic, OpenAI and
Google Gemini. Keys are stored in your browser and sent straight to the
provider from your device; there is no server in between, which also means any
script on the page could read them. The settings screen says so.

Without a key the coach still answers, from the skill's own lesson text, hint,
prerequisites and your recent failures — and labels itself offline. Only tree
generation genuinely requires a key.

Every generated tree is validated before it is accepted (`ai/schema.js`): field
types and bounds, duplicate ids, prerequisites pointing at skills that do not
exist, and cycles. Dangling edges and circular requirements are repaired and
reported rather than silently accepted or thrown away; a tree with no starting
point is rejected. Malformed JSON is retried once with the failure quoted back
to the model, then given up on.

### Environment variables

There are none, and nothing to configure. There is no build step and no server,
so API keys are entered in the app's Settings screen and stored on the device.
The app never crashes or degrades for want of a key.

## Demo data

`#/demo` replays about a hundred real attempts through `applyAttempt`, with
uneven scores spread over eleven weeks and a recent run of daily review
sessions. Everything downstream is therefore genuinely derived: the ledger, the
level, mastery from actual scores, retention from attempts separated by real
gaps, streaks from real calendar days, achievements from the same predicates a
learner triggers, unlocks from the same gates.

Writing the numbers by hand would have been a tenth of the code and would have
produced a profile whose charts disagreed with its own totals. The demo
learner has two skills they failed before passing, and several going stale,
because a demo where everything is 95% demonstrates nothing.

## Testing

```bash
node tools/skilltree-logic.mjs                              # 264 logic checks
NODE_PATH=/opt/node22/lib/node_modules \
  node tools/skilltree-smoke.mjs                            # drives a real browser
NODE_PATH=/opt/node22/lib/node_modules \
  node tools/skilltree-smoke.mjs --single                   # the single-file build
NODE_PATH=/opt/node22/lib/node_modules \
  node tools/skilltree-smoke.mjs --shots                    # + screenshots
```

`skilltree-logic.mjs` covers the unlock gate, XP awards and the ledger, the
level curves, the mastery algorithm, dependency validation, achievements,
grading, AI response validation, recommendations, missions and the demo
profile — including the edge cases the brief calls out: circular dependencies,
duplicate XP events, an assessment submitted twice, several skills unlocking at
once, and skills with several prerequisites.

`skilltree-smoke.mjs` clicks through onboarding, drives the graph, answers a
quiz from its real answer key, runs a wrong and then a correct code
submission, checks XP survives a reload, verifies every screen renders on a
populated profile, and checks for horizontal overflow and console errors at
375px, 768px and 1440px.

## Building the single file

```bash
node tools/build-single.js skilltree/index.html dist/skilltree.html
```

Inlines every module and stylesheet into one HTML file that runs from
`file://`. Two things the bundler will not accept: `export default` and dynamic
module loading. It scans raw source, so a prose comment containing the literal
token `import(` will also stop it.

## Deployment

Served by GitHub Pages from the repository root, alongside FitAI and Backrooms.
Every path is relative, so it works from a project subpath
(`/Fitai-app901/skilltree/`) rather than only from a domain root.

## What V2 would add

- **A server**, which is the honest answer to server-side validation, real
  accounts, and progress that follows you between devices.
- **Spaced repetition with scheduling** — the review queue currently ranks by
  urgency but does not schedule.
- **A creator mode.** The data model and the validation layer already support
  authored trees; what is missing is the editing interface.
- **More content per skill.** The graph is deep; several skills have a lesson
  and a quiz where they want a project.
- **Verification levels.** The model has room for self / AI / teacher /
  official verification (`selfReported` already flows through grading); only
  self-verification is implemented.
