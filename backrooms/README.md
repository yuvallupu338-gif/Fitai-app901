# The Backrooms — 100 Levels

<div dir="rtl">

שכפול ריאליסטי של הבאקרומס לדפדפן: מנוע תלת־ממד שנכתב מאפס ב־WebGL2, מאה הרמות
הראשונות (0–99), עולם אינסופי שנבנה סביבך תוך כדי הליכה, טקסטורות שנוצרות
פרוצדורלית וסאונד מסונתז בזמן אמת. בלי ספריות, בלי קבצי מדיה, בלי שרת.

</div>

Open `backrooms/index.html` over http (ES modules do not load from `file://`):

```bash
npx http-server -p 8080 .      # or: python3 -m http.server 8080
open http://localhost:8080/backrooms/
```

**Controls** — `WASD` move, mouse look, `Shift` sprint, `C` crouch, `Space` jump,
`F` flashlight, `E` interact, `Esc` pause. On a phone: left half of the screen is
a stick, right half is look.

## What it actually is

A first-person renderer with no dependencies and no assets. Everything you see
is computed at runtime:

- **Rendering** — hand-written WebGL2 forward renderer. Up to sixteen point
  lights per frame with real inverse-square falloff, a ten-step occlusion march
  through a height field for cheap shadows, a flashlight cone, normal-mapped
  surfaces, exponential-squared fog, and an HDR pass tone-mapped through ACES
  with bloom, vignette, chromatic aberration, film grain and an optional VHS
  mode. Ambient occlusion is baked per vertex at mesh time — the dark line where
  a wall meets the floor is doing most of the work.
- **Materials** — `src/render/textures.js` generates every surface from noise:
  wallpaper with seams and damp rising from the skirting, loop-pile carpet,
  mineral-fibre ceiling tile with a T-bar grid, concrete, glazed tile, brick,
  rusted sheet metal, marble, asphalt, cave rock, wheat. Each recipe writes a
  height field and the normal map is Sobel-differenced out of it, so the bump
  always agrees with the colour. All of it tiles seamlessly.
- **World** — the level is generated, not stored. A chunk is a pure function of
  `(level seed, cx, cz)`, so walking away and back regenerates the identical
  rooms down to which tube was flickering. Sixteen archetypes — room mazes,
  corridor blocks, pillared halls, maintenance bores, caves, poolrooms, street
  grids, cubicle floors, terraces, platforms over nothing — carry all hundred
  levels between them.
- **Audio** — no sound files. Room tone is filtered noise plus a ballast hum;
  the reverb is an impulse response generated per level from its declared size;
  footsteps are noise bursts shaped by whatever the floor is made of.

## About the levels

Levels **0 to 11** are the ones the community has documented consistently for
years, and they are built to match: the Lobby's yellow rooms and buzzing tubes,
the Habitable Zone's concrete and pillars, Pipe Dreams, the Electrical Station,
the Abandoned Office, the hotel, the dark, the ocean, the caves, the suburbs,
the wheat field, the endless city. The Poolrooms sit at **37**, where they are
usually filed. Those are marked with a ★ in the level list.

**Everything else — 12 through 99 — is original to this build.** Numbering past
11 is not stable across sources, so rather than invent citations these are
written as new levels in the same voice, following the same descent: an office
you cannot leave, then industry, then water, then earth, then a city, then
institutions, then places that were never buildings at all. If you want the real
wiki's version of a number, it is not what you will find here, and that is on
purpose.

Each level declares a survival class (Safe → Terminal), an archetype, a palette,
fog, lighting, hazards, an entity, and an audio profile. That is the whole of a
level — there is no geometry anywhere in `src/data/levels.js`.

## Getting out

Each level generates rare **no-clip points**: a rift lit in a colour that
belongs to no fixture in that level. You usually see the wrong-coloured glow on
a wall before you see the thing making it. Walk into one and press `E` to drop a
level. Falling through a hole in the floor does the same thing, less politely.

**Almond water** restores sanity, which drains in the dark and takes your health
with it once it is gone. Batteries refill the torch. Notes are notes.

Three things live down here. A **hound** hunts on sight and does not stop. A
**watcher** only moves when you are not looking at it. A **crawler** is fast, low,
and comes towards your torch. They can be switched off in settings.

## Layout

```
backrooms/
  index.html            shell: canvas, HUD, menus
  src/
    main.js             boot, the loop, level transitions
    core/               math, deterministic noise, WebGL helpers
    render/             shaders, procedural materials, the renderer
    world/              grid, archetypes, chunk generation, mesher, streaming
    game/               player, entities, audio, input
    ui/                 menus, HUD, saved progress
    data/levels.js      all 100 levels
```

## Testing it

```bash
NODE_PATH=/opt/node22/lib/node_modules node tools/backrooms-smoke.mjs
NODE_PATH=/opt/node22/lib/node_modules node tools/backrooms-smoke.mjs --all --shots
```

The smoke test drives a real browser: it enters a sample of levels, waits for
streaming to settle, and reads the framebuffer back. A renderer cannot be
asserted into correctness — the failure modes are "the screen is black",
"everything is inside out" and "the walls have no texture" — so the checks are
about pixels: the frame has real detail, it is not uniformly dark, geometry was
built, the player is standing on the floor, and walking for a second and a half
does not drop them out of the world.

## Performance

Renders at a scaled resolution (adjustable in settings) and streams a couple of
chunks per frame so walking never hitches. On a weak machine, drop render
resolution to 70%, set texture quality to low and turn light shadows off — the
look survives all three, because it comes from the lighting and the lens rather
than from resolution.
