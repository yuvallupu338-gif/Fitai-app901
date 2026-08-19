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

The ten places are fixed and so are the ten things guarding them. Fixed is the
point: a player who has played four nights knows all ten, and the question
stops being *where could it possibly be* and becomes *which one, and can I get
there and back*. Which one it is on which night is drawn once per save, so the
seven nights never repeat a place — except the first, which is always the
mailbox at number 14, thirty metres from Adam's own door, with the arithmetic
stamped on the lid.

| | where | what is in the way |
| --- | --- | --- |
| 1 | the locked mailbox at 14 | a combination: *my house number, minus 3, times 2* |
| 2 | under the porch of the empty house at 17 | a sentence written on the inside of the kitchen window, which from the garden reads backwards. There is a mirror on the back fence |
| 3 | the garage roof at 12 | a chain on the side gate, and the code is how many white hedge panels there are. There are exactly that many, and counting them is twenty seconds standing still in the open |
| 4 | the hole in Bob's lawn at 16 | three music boxes. Two play the tune with the wrong fourth note. One plays it the way she actually sang it |
| 5 | a branch of the big tree in the park | a ladder that shrieks when you drag it. The whistle covers six seconds in every twelve |
| 6 | the back seat of the locked car at 13 | the radio plays four notes and there is a piano sticker on the sun visor numbering the keys from C |
| 7 | under the fountain | the fountain is full. The fuse cabinet at the edge of the park has four switches and one strip of red tape |
| 8 | a bin in the alley behind 18 | three bins chained one to the next: *start with what you read, then what you drink, then what rings* |
| 9 | the back fence at 11, the far end of the road | four garden dolls in the wrong order, and three plaques about their ages |
| 10 | the kennel at 15 | a dog that has been barking for twenty years, and a bone buried under the porch at 13 |

None of the answers is invented on the spot. The house number is on the box you
are standing at; the panels are really there to be counted; the notes are
really being played. Everything you need is said by somebody in a garden that
afternoon — which is what the afternoon is for.

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
not colour: **the answers to that night's lock are in their small talk.** Mrs
Rosenberg at 14 will tell you what her son set the combination to. The Vardi
family at 12 painted their own fence and counted the panels twice because they
did not believe it the first time. Bob at 16 will tell you that only one of the
three music boxes was ever in tune. The couple at 18 will tell you that
somebody wrote on the empty house's kitchen window from the inside, and that
there is a mirror on its back fence.

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

## What it is about

The player is Adam, twenty-six, who has just moved into number 21. The woman is
Evelyn Marlowe, a music teacher, who went out at half past three one foggy
night twenty years ago to look for a six-year-old who had run out of the house,
whistling so that he could find her in the dark, and did not come back. The
neighbourhood is his, not hers: a memory built as a prison, with neighbours
who keep the routine going and never mention the flags. She only sees movement
because she is looking for a child who ran, which is why standing still works.
The flag is the paper one he left at her marker, so she would know where home
was.

None of that is narrated. It is in twelve objects lying around the
neighbourhood — a diary, three tapes, some photographs — and in what the
neighbours say without knowing they are saying it. A player who picks up
nothing finishes all seven nights and gets an ending that means nothing to
them. That is the deal, and the game does not hedge it.

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

And it runs whole nights. Five minutes at thirty frames a second with a
scripted player — once standing still, once walking a lap of the street — and
then asks what she did with it: how far she got, how many ten-metre squares of
the neighbourhood she stood in, whether she spent any of it wedged against
something. That check exists because the first version of her patrol failed it
badly and nothing about the code looked wrong: she stepped to a random
neighbouring node whenever she arrived at one, which sounds like wandering and
is in fact loitering — 175 metres in five minutes, six squares out of sixty,
and a player could walk the whole street twice, past their own front door,
without ever being noticed. She now picks somewhere thirty-five metres off and
walks the whole way to it. Reverting that change fails the check, which is the
only reason to trust it.

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
