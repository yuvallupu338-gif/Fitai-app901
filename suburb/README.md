# שכונת השקט · The Quiet Neighborhood

<div dir="rtl">

משחק אימה בגוף ראשון בדפדפן. שכונה פרברית אמריקאית משנות התשעים, שנבנית מחדש
בזמן אמת: מנוע תלת־ממד שנכתב מאפס ב־WebGL2, טקסטורות שנוצרות פרוצדורלית, וסאונד
מסונתז — בלי ספריות, בלי קבצי מדיה, בלי שרת.

ביום זו השכונה הכי שקטה שראית. בשלוש וחצי בלילה מתחילה שריקה, בשלוש ושלושים
ואחת מופיע דגל אדום איפשהו בין הבתים, ובשלוש שלושים וחמש הכל מתחיל מהתחלה.
שבעה לילות.

</div>

Open `suburb/index.html` over http (ES modules do not load from `file://`):

```bash
npx http-server -p 8080 .      # or: python3 -m http.server 8080
open http://localhost:8080/suburb/
```

Or open the prebuilt single file, which works straight off the disk:

```bash
open dist/suburb.html
```

**Controls** — `WASD` move, mouse look, `Shift` run, `C` crouch, `Space` jump,
`F` torch, `E` interact, `M` map, `Esc` pause.

## The night

The clock is the game. One game second is one real second, the HUD shows it,
and every night runs to the same last number:

| time | what happens |
| --- | --- |
| 3:30:00 | the whistle starts and you wake up. From night four it starts at 3:28 |
| 3:31:00 | a red flag appears at one of ten places in the neighbourhood |
| 3:31–3:35 | find it, get past whatever is guarding it, carry it home |
| 3:35:00 | the whistle stops. If the flag is not through your own front door, the night restarts |
| any time | if she sees you, the whistle stops dead, she screams, and the night restarts |

The ten places are fixed — a locked mailbox, the roof of a garage, a hole
somebody dug in a lawn, a locked car, a branch in the park, under the fountain,
inside a wheelie bin, on a back fence, in the doghouse, and the empty house at
the end of the road. Fixed is the point: after four nights you know all ten,
and the question stops being *where could it possibly be* and becomes *which
one, and can I get there and back*. Which one it is on which night is drawn
once per save, so the seven nights never repeat a place and never open with a
lock.

## Her

She drifts along the street on a walk graph — up a drive, round the side of a
house, along the back fence, out again — whistling an eight-note lullaby on a
twelve-second loop. Four things decide whether tonight ends badly:

- **She hears.** Every footstep is an event with a loudness. Tarmac is a
  quarter louder than a lawn, running is twice walking, crouching is nearly
  silent, and gasping when your breath has run out carries about as far as a
  footstep — and you cannot choose not to. A loud enough noise brings her to
  where it happened.
- **She sees, but not instantly.** Suspicion fills at a rate that depends on
  distance, on what you are doing and on what is lighting you: the torch is
  worse than running, running is worse than standing up. The ring on the HUD
  is that number. A player who is caught should always be able to say what
  they did wrong, and an instant fail at thirty metres cannot be argued with.
- **She does not resolve someone who is not moving**, past about eight metres.
  That is the game's one real defence and it is a hard one to use, because the
  correct response to seeing her is to stand perfectly still while she comes
  towards you. Inside eight metres it barely helps.
- **She goes over fences and through hedges, but not through walls.** That is
  why a back garden is never safe and a locked house is — until the sixth
  night, when every door in the street is open, including the ones she uses.

Carrying the flag makes all of it worse. It is red, it catches every lamp on
the street, and it is the hardest part of the night rather than the victory
lap.

## The afternoon

Every night starts in daylight, with no clock and nothing hunting you. The
neighbours are in their gardens and they will talk to you, and what they say is
not colour: **the answers to that night's puzzles are in their small talk.**
The code on the mailbox is arithmetic on a house number; the gnomes have to be
stood in order of ages that are on their bases and unreadable in the dark; one
of three music boxes is in the same key as the whistle; and the four digits on
the padlock of the empty house are written on the inside of its kitchen window,
which from the garden reads backwards — there is a mirror leaning on the back
fence.

You can skip all of it and still play the night. You will just be solving it
blind, which is the trade the design is about.

## The seven nights

| night | what changes |
| --- | --- |
| 1 | she is slow, the flag is close, and it is the only night that asks nothing of you but walking |
| 2 | twenty percent faster, and further to go |
| 3 | people are standing in their own front gardens in the dark. They are asleep. They wake |
| 4 | the whistle starts at 3:28. The flag still appears at 3:31, so it is two extra minutes of being outside with nothing to fetch |
| 5 | the flag moves if you leave it more than a minute |
| 6 | every door in the street is open, and hiding stops working |
| 7 | the last one. She is not searching any more |

## What it actually is

A first-person renderer with no dependencies and no assets. Everything you see
is computed at runtime:

- **Rendering** — a hand-written WebGL2 forward pass. One directional light
  (the moon, or the afternoon sun) with shadows marched through a height field
  of the entire neighbourhood, up to sixteen sodium lamps and lit windows with
  real inverse-square falloff, a torch cone, normal-mapped surfaces, ground fog
  that lies in a layer rather than filling the scene, and an HDR pass
  tone-mapped through ACES with bloom, vignette, chromatic aberration and
  grain. Ambient occlusion is baked per vertex at build time — the dark line
  where a wall meets a lawn is doing most of the work.
- **Materials** — `src/render/textures.js` generates every surface from noise:
  mown grass, asphalt with a painted line, poured concrete, painted clapboard,
  brick, roof shingle, planked timber, glass, cut-out foliage, bark, metal,
  linen, skin. Each recipe writes a height field and the normal map is
  Sobel-differenced out of it, so the bump always agrees with the colour, and
  all of it tiles seamlessly.
- **World** — twelve houses, two streets, a park and a green, all a pure
  function of one integer. The same save always has the same street: the same
  garage on the same side, the same gnomes in the same garden, the same lamp
  failing. Only the lit windows, the unlocked doors and the codes change from
  night to night — which is what makes the daylight walk worth anything.
- **Audio** — no sound files. The whistle is a sine through a bandpass with a
  breath layer, portamento and vibrato, panned and filtered by where she is and
  whether anything is between you; crickets that stop when she is close; a wind
  bed, a distant dog, a clock tick under the last minute.

## Layout

```
suburb/
  index.html            shell: canvas, HUD, menus, puzzle panel
  src/
    main.js             boot, the loop, the day/night cycle
    core/               math, deterministic noise, WebGL helpers
    render/             shaders, procedural materials, the renderer
    world/              the plan, the geometry, collision, materials
    game/               player, whistler, neighbours, flag, clock, nights, audio, story
    ui/                 HUD, menus, the map, the puzzle panel, the save
```

## Testing it

Two tools, because they catch completely different things.

```bash
node --experimental-default-type=module tools/suburb-world.mjs
node --experimental-default-type=module tools/suburb-world.mjs --seeds 8
```

Around 1100 headless checks per neighbourhood, over all seven nights. The one
that earns its keep is reachability: it flood-fills the whole neighbourhood
from the player's own bed using the player controller's own rules — 62cm step
up, 34cm of clearance — and asserts that every night's flag can be reached from
somewhere you can stand, at a height you can reach it from. It has already
caught three things that looked completely normal on screen: a bed standing in
front of the only bedroom door, a collision shell with no gap where the front
door is, and a flag on a garage roof that was actually floating inside the roof
of the house next to it, with the crates you were meant to climb parked in the
neighbour's garden behind a boarded fence.

It also checks the things that are true or false rather than visible: that the
street does not move between nights, that the clue for tonight's lock comes out
of a mouth that is actually in a garden that afternoon, that the gnome clue
lists the ages in the order it claims to, that the walk graph is connected,
that she starts far enough away, and that the round trip fits in the window
with a minute to spare.

```bash
NODE_PATH=/opt/node22/lib/node_modules node tools/suburb-smoke.mjs
NODE_PATH=/opt/node22/lib/node_modules node tools/suburb-smoke.mjs --shots
```

The smoke test plays the game in a real browser: it walks the afternoon, talks
to a neighbour, goes to bed, waits for 3:31, presses `E` on the flag, carries
it home, then gets itself caught on the next night, then solves the mailbox
keypad by clicking the keys — wrong code first — and takes the flag out of the
box. It drives the game the way a player does rather than calling the
functions, and it reads the framebuffer back, because a renderer that draws
nothing passes every logic check ever written. `--shots` writes PNGs to
`dist/shots/suburb`, which is the only way to review the things no assertion
covers.

The origin's CSP audit covers this page too:

```bash
NODE_PATH=/opt/node22/lib/node_modules node tools/csp-check.mjs http://localhost:8080
```

## Performance

Renders at a scaled resolution (adjustable in settings) and drops it on its own
if the frame rate cannot hold. The whole street is about 30k triangles split
into twelve sectors and frustum-culled, so what you pay for is the lighting and
the lens rather than the geometry. On a weak machine: render scale 70%, texture
quality low, shadows to moon-only — the look survives all three, because it
comes from the lighting and not from resolution.

One honest limitation: only Chromium is installed here, so **iOS Safari is not
covered by any test in this repo**. What the code does about that is avoid the
known WebKit traps rather than discover them — no `desynchronized` context
attribute, a working path when `EXT_color_buffer_float` is missing, pointer
events rather than touch-only handlers, the AudioContext created inside the
user gesture, and every fullscreen and orientation call wrapped so that iOS
refusing them changes nothing.
