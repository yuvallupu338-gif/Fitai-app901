# FitAI — the app, split up and re-dressed

<div dir="rtl">

האפליקציה שהייתה קובץ אחד של 24MB — עכשיו מפוצלת ל‑58 קבצים ולבושה בשפת
העיצוב שהגיעה בקובץ ה‑ZIP: רקע כמעט שחור, אקסנט ליים אחד, Archivo ל‑latin
ו‑Rubik לעברית, וכפתורי גלולה.

</div>

This started as a single `index.html`: 24 MB, 5,086 lines, one `<style>` block,
one `<script>` block and about 23 MB of base64 sitting on 38 of those lines.
It is now 58 files — one HTML shell, 7 stylesheets, 50 scripts — and it wears
the design language from the *Mobile Sport App Design* handoff bundle.

Nothing about what the app *does* changed.

```
app/
  index.html              the shell, and the load order
  styles/                 7 stylesheets — the design language
  src/                    41 files of application code, in
  src/, src/data/, src/plan/, src/screens/
  i18n/                   3 files of English and Spanish strings
  assets/                 6 files, 23 MB — photographs, animations, the logo
  tools/                  regenerate the fonts, check the load order, drive the app
```

---

## Running it

Plain ES5-era classic scripts, no build step and no dependencies — but it must
be served over http, because the single file's `Content-Security-Policy`
(`default-src 'self'`) blocks same-origin subresources under `file://`.

```bash
npx http-server -p 8099 -c-1 .     # or: python3 -m http.server 8099
open http://localhost:8099/app/
```

The original opened straight off the disk because everything was inlined. That
is the one thing splitting it costs.

---

## The split

### How it was cut

The `<script>` was sliced at 48 line boundaries, each one checked first by a
scanner that tracks brace, paren and bracket depth through strings, template
literals, comments and regex literals, and only allows a cut where the depth is
zero. The splitter then glued the slices back together and asserted the result
was the byte-identical input before writing anything out. So the code in
`src/` and `i18n/` **is** the original text, in the original order — just in
more files.

Two things are not slices, and both are called out in the code:

- `assets/meal-photos.js` — 5.9 MB of dish photography sat inside an IIFE in
  `src/data/meals.js`, where no line boundary could reach it. It is lifted by
  name into `MEAL_PHOTOS`, and the IIFE reads that instead.
- `computeLevelFromAssessment` moved from `src/targets.js` to `src/store.js`.
  See below.

### Why they are classic scripts, not modules

The app is 4,500 lines of globals calling each other in every direction, with
`typeof X !== 'undefined'` guards throughout. Turning that into ES modules
means inventing an import graph for several hundred names — a rewrite, with a
rewrite's bug budget. Classic scripts share one global scope and run in
document order, which is *exactly* what the single file did. The split is
therefore semantically free.

### The one hazard, and the tool that guards it

In one file, every function declaration in all 4,500 lines is hoisted before
the first statement runs, so load-time code can call anything. In fifty files,
hoisting stops at the file boundary. Code that runs *while a file loads* can
only call what an earlier file already declared.

`src/store.js` broke on exactly this: it repairs every stored profile as it
loads, and that repair called `computeLevelFromAssessment`, which lived 600
lines later. Hence the move.

`tools/check-load-order.mjs` finds this class of fault for good. It parses each
file with acorn, works out what actually executes at load time — top-level
statements, IIFEs, and the callbacks of `forEach`/`map`, but *not* the bodies
handed to `setTimeout` or `addEventListener` — and reports any name a later
file declares:

```bash
node app/tools/check-load-order.mjs
# ✓ 50 files: nothing runs at load time that a later file declares
```

Run it after moving anything between files, or after reordering `index.html`.

### The order in index.html is load-bearing

It is the original file's order, top to bottom, with each asset immediately
before the code that reads it. `assets/food-thumbs.js` has to define `FOOD_IMG`
before `src/data/meals.js` builds the recipe bank out of it; `MEAL_PHOTOS`
before the IIFE that consumes it; `STRETCHFR` before `STRETCH`. Reordering the
tags is a real change, not a cosmetic one — which is what the checker is for.

### What splitting bought

Chromium, localhost, median of three cold loads:

| | first paint | `window.load` |
|---|---|---|
| the single file | 108 ms | 1841 ms |
| split | 96 ms | 572 ms |

Both paint the splash early — the shell is above the payload in either case.
What changes is everything after: the browser no longer has to tokenise a
13 MB line inside an HTML document, and it fetches fifty files in parallel
instead of one 24 MB stream. The larger practical win is not in that table:
editing a screen now invalidates a 12 KB file in the cache rather than 24 MB.

---

## The design

From `mobile-sport-app-design/project/FitAI.dc.html` in the handoff bundle.

| | before | after |
|---|---|---|
| ground | `#0a0b0d` / `#16181d` | `#0B0C0E` / `#131519` / `#16181C` |
| accent | teal `#2dd4bf` → emerald gradient | lime `#D9FF3D`, flat |
| ink on accent | `#06231e` | `#0B0C0E` |
| display face | Rubik 900 | Archivo 800, `-.025em` |
| labels | Rubik 12px | IBM Plex Mono 10px, `.14em`, upper-case |
| pressables | 11–14px radius | 99px |
| cards | 18px radius | 22px, `1px solid rgba(255,255,255,.07)` |
| secondary hues | tan, sage, dusty blue, dusty red | the bundle's own alternates: `#FF6B3D`, `#4DE1FF`, `#FF4D8D` |

Almost all of it landed by re-pointing tokens. The screens already drew through
`var(--…)`, so `styles/tokens.css` re-dressed 4,500 lines of markup on its own;
`tools/recolor.mjs` handled the 76 literals that were spelled out by hand — the
share card painted on a canvas, the vector coach, the clipboard animation — and
is kept as the record of which colour became which.

### Hebrew in a Latin design

Archivo draws no Hebrew. That is the whole trick rather than a problem: the
font stack is `'Archivo', 'Rubik'`, so the browser falls through per glyph.
Latin and — more to the point — every digit in this app comes out in Archivo;
Hebrew comes out in Rubik; on the same line. The bundle's numerals are half of
what makes it look like itself, and this is how a right-to-left Hebrew
interface gets to wear them.

Same for `'IBM Plex Mono', 'Rubik'` on the small labels. Hebrew has no
upper case, so `text-transform` is a no-op there and the letter-spacing carries
the label on its own.

### Where the bundle was not followed, and why

- **Secondary text.** The bundle sets it at 50% and its labels at 40% of
  `#F4F5F6`. On `#131519` at the sizes this app uses, 40% measures 3.9:1 —
  under AA for text that small. `--muted` is 62% and `--muted2` 55%, which
  measure 6.2:1 and 5.8:1. Same greys, a little less shy.
- **Inputs at 16px, not 99px.** The bundle has one text field and rounds it
  fully. This app has number fields, selects and textareas, where a fully round
  box reads as a mistake.
- **Padding.** The bundle breathes at 22–24px. This interface is much denser,
  and every extra pixel of gutter costs a line of wrapped Hebrew further down,
  so `.app` keeps its 14px and `.card` its 16.
- **The light theme.** The bundle is dark only. Lime is unreadable as text on
  white, so on light it keeps its job as a *fill* — with the same near-black ink
  on top — and hands the text job to `#4F6B00`, which clears AA on both white
  and the card.

### The stylesheets

Cascade order, and `index.html` links them in it:

| | |
|---|---|
| `fonts.css` | Rubik (Latin + Hebrew), Archivo and IBM Plex Mono (Latin), all base64 |
| `tokens.css` | every surface, line, hue, face and radius, dark and light |
| `base.css` | reset, page, display type, top bar, splash |
| `components.css` | cards, buttons, chips, stats, inputs, nav, sheets, toast |
| `screens.css` | skill tree, muscle figure, menu, stretches, demo stage |
| `motion.css` | every keyframe and transition, last so components stay unaware |

`rubik.css` is not linked — it is the Rubik source that `fetch-fonts.mjs` folds
into `fonts.css`, kept because those subsets came out of the original file and
cannot be re-fetched byte for byte.

---

## Tools

```bash
node app/tools/check-load-order.mjs   # the guard described above
node app/tools/fetch-fonts.mjs        # rebuild styles/fonts.css from Google Fonts
node app/tools/smoke.mjs              # drive the whole app in Chromium
node app/tools/recolor.mjs .          # the design pass's colour map (already applied)
```

`smoke.mjs` completes the questionnaire by pressing the real controls, walks
all six tabs and eight sheets, opens the skill tree and an exercise, flips the
theme and the language, reloads to check the profile persisted, and fails on
any console error, page error or failed request. Screenshots land in
`dist/shots/`. Point it at the original single file to compare behaviour
side by side — it was written to run against both.

Current state: **no errors**, every screen renders, the profile survives a
reload. The one console line is a 404 for `sw.js` from the PWA registration —
present in the original too, and swallowed by its own `.catch`.
