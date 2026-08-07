# Super Jump Bros

<div dir="rtl">

פלטפורמר בסגנון סופר מריו הקלאסי — 100 שלבים, פיזיקה של ה־NES, בלי תלויות
ובלי שלב בנייה. הכל נצבע ומנוגן בדפדפן: אין אף קובץ תמונה ואף קובץ סאונד.

**לשחק:** פותחים את `dist/mario.html` בדפדפן. קובץ אחד, עובד גם בלי אינטרנט.
או מריצים שרת מקומי ופותחים את `mario/index.html`.

**מקשים:** ←→ ללכת · Z / Shift לרוץ ולירות · X / רווח / ↑ לקפוץ ·
↓ להתכופף · Enter התחלה ופאוזה · F מסך מלא · M השתקה.
אפשר לחבר שלט USB או Bluetooth — לוחצים כפתור אחד בשלט והוא מתחבר לבד.
במסך מגע מופיעה מקלדת מסך אוטומטית.

</div>

---

## Running it

Plain ES modules, no build step, no dependencies. Modules do not load over
`file://`, so it needs to be served:

```bash
npx http-server -p 8080 .        # or: python3 -m http.server 8080
open http://localhost:8080/mario/
```

Or build the single-file version, which does open straight off the disk:

```bash
node tools/mario-build.mjs       # writes dist/mario.html (~300 KB, one file)
```

## What it is

A homage, built from scratch. The physics constants are the ones the 1985
game used — they are public, they are what makes the movement feel the way it
does, and they are in `src/game/constants.js` with the original hex values in
the comments. Everything else is original work: the art is hand-drawn pixel by
pixel in `src/render/art.*.js`, the music is composed in `src/audio/music.js`,
and the hundred levels are generated from a seeded vocabulary of hand-authored
set pieces. No asset from the original is used or reproduced.

### The movement

This is most of the project. In rough order of how obvious each one is by its
absence:

- **A fixed 60Hz simulation.** Every velocity is per-frame, integrated in whole
  1/60 steps. Running the same numbers against a variable `dt` changes every
  jump arc with the refresh rate — a jump that clears a four-tile pit on one
  machine stops clearing it on another.
- **Momentum, with a separate skid.** Acceleration, release friction and
  turn-around deceleration are three different numbers. The gap between the
  last two is the skid, and the skid is why running has weight.
- **A jump table indexed by speed.** How high you go and how hard you come
  down are both chosen at take-off from how fast you were already moving, and
  a weaker gravity applies for exactly as long as you hold the button and are
  still rising. Tap for a hop, hold at a sprint for the long arc.
- **Air control without air friction.** You can steer mid-jump; nothing slows
  you down up there. A jump is a commitment.
- **Semi-solid platforms** you can jump up through, with the "your feet were
  above it last frame" rule that stops you popping onto one you meant to run
  underneath.
- **Stomp chains.** Each enemy killed without landing is worth more than the
  last, and the eleventh is a life. The bounce sets your velocity rather than
  adding to it, and sets it higher with the button held.
- **Enemies dormant until seen**, so the Goomba you can see coming is always
  where it was.
- **The camera never scrolls back**, which makes the left edge of the screen a
  wall — the rule every level here is built assuming.

### The hundred levels

Twenty-five worlds of four, the fourth of each a castle. Ten tilesets
(overworld, underground, water, castle, sky, snow, desert, night, forest,
volcano), each of which is the same tile art through a different five-colour
palette — the same trick, and for the same reason, as the machine being
imitated.

They are generated rather than hand-placed, from a seed stored per level in
`src/levels/catalog.js`. That is not a shortcut around design work; the design
work is in `src/levels/chunks.js`, which holds about thirty hand-authored set
pieces with the rules that make them safe built in: no pit wider than a
running jump clears, nothing to be jumped onto more than four tiles up, and
every piece starts and ends at the same floor height so any two compose.
Difficulty is one number from 0 to 1 across the hundred, and it changes how
often the hard pieces come up rather than what they are allowed to be.

Same seed, same level, forever — which is what makes a best time mean
something.

### Sound

Three oscillators and a noise channel driven by a step sequencer, written in
`src/audio/music.js` as text: `C5` strikes, `.` holds, `-` rests. Six themes
and seven jingles, all original. The jump is a square wave sweeping up, the
coin is two notes a fifth apart, the brick is filtered noise. Nothing is
loaded, because there is nothing to load.

## Checking it

```bash
node tools/mario-validate.mjs --verbose     # art + levels + reachability (~25s)
node tools/mario-validate.mjs --quick       # skip the proof (~1s)

NODE_PATH=/opt/node22/lib/node_modules \
  node tools/mario-smoke.mjs                # play it in a real browser
  node tools/mario-smoke.mjs --all          # ...and bot every level headless
  node tools/mario-smoke.mjs --shots        # ...and write screenshots
```

`mario-validate.mjs` does three things. It checks every frame of art — a
mistyped row is a column of pixels shifted sideways for the life of the sprite
and is invisible in a diff. It walks every level for unjumpable gaps, steps
that are too tall, and things spawned inside walls. And then it does the one
that matters:

**every level is proved finishable.** `tools/mario-reach.mjs` runs a
breadth-first search over the states the real `Player` class can reach —
nodes are places you can stand, edges are runs and jumps with a range of
run-ups and hold lengths, each simulated against the real tile map. Both body
sizes, because a corridor a small player fits through is not necessarily one a
big player fits through. A hundred levels is a hundred chances to ship one
that cannot be finished, and no amount of playing them by hand would find the
one that cannot. It found eleven.

`mario-smoke.mjs` boots the real page in Chromium and plays it, which is the
only thing that proves the loop, the input and the renderer work *together*.
The bot it uses lives in `tools/mario-bot.js` and plays with star power on
permanently — the question it answers is whether a body can get from the start
to the flag, and enemies would only add noise to that.

## Layout

```
mario/
  index.html            the page: one canvas and some chrome
  src/
    main.js             boot, and the state machine above the levels
    core/               loop, input, save, seeded rng
    game/               constants, tiles, physics, player, entities, world
    levels/             catalog (the 100), chunks (the vocabulary), generator
    render/             palettes, art, atlas, font, scene, hud
    audio/              synth and songs
    screens.js          title, the 10x10 level grid, the ending
tools/
  mario-validate.mjs    art + level checks + the reachability proof
  mario-reach.mjs       the proof itself
  mario-smoke.mjs       plays it in a real browser
  mario-bot.js          the test player, shared by both smoke modes
  mario-build.mjs       bundles it into one HTML file
```

## Notes

The on-screen text is the arcade set — `WORLD`, `TIME`, `GAME OVER` — in a 5x7
bitmap font. Hebrew lives on the page around the canvas, where it can be set
in a real font at a readable size, rather than crammed into a five-pixel box
where it would be unreadable in every direction.

Progress is saved to `localStorage`: which levels are unlocked and cleared,
best time and coins for each, and the high score. The level select is a ten by
ten grid of the whole run, because twenty-five worlds is not a thing anybody
can navigate one stage at a time.
