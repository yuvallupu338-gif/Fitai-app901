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
twelve-second loop. The tune is a table, not a mood:

| | note | starts | holds | |
| --- | --- | --- | --- | --- |
| 1 | E | 0.0 | 0.8 | clean |
| 2 | G | 1.2 | 0.8 | clean |
| 3 | B | 2.4 | 1.4 | trembling |
| 4 | **A#** | 4.2 | 1.4 | wrong, and it is the whole game |
| 5 | E | 6.0 | 0.8 | weaker |
| 6 | F | 7.2 | 0.8 | |
| 7 | E | 8.4 | 2.0 | choked off |
| 8 | — | 10.4 | 1.6 | silence |

The fourth note is the instrument. It is A# where the ear is waiting for A, and
the closer she is the more it goes: fifteen cents of beat at about twenty
metres, and inside that the slide into it lengthens, the breath under it comes
up, and she leans on it up to three tenths of a second longer. Nothing else
feeds that number — not suspicion, not whether she is hunting — because the
player is being taught to read one distance off one note, and a cue that
answers two questions answers neither.

Which ear it is in matters too. She is panned by where she actually is, so a
whistle that swaps sides between one phrase and the next is her having walked
round behind you, and it is the only warning you get.

You hear the tune the way it really was exactly once, in the dream on the first
night: same eight notes, same table, fourth note back to A. Everything from
3:30 onwards is that, remembered by somebody who blames himself. The three
music boxes in Bob's garden are the same joke made playable — two have the
fourth tine bent, one does not.

Four things decide whether tonight ends badly:

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

## The first night

Night one is scripted, and it is the only one that is. Six moments, in order,
each of them skippable with `Esc` from the first press:

| | |
| --- | --- |
| 16:00 | Bob is watering a lawn that is already wet. There is a small red flag on a stick on his porch. *"What is that flag?"* — two seconds, the same smile — *"Decoration."* |
| 22:30 | An old photograph is on the kitchen table that was not there in the morning. A woman holding a child, her face rubbed away in the paper itself. Under it, in a child's handwriting: *bring the flag home.* |
| 00:00 | Twenty seconds of dream over black. A child laughing, close. The lullaby, warm, in the right order. A car horn. Seven seconds of silence, and the silence is meant to be too long. |
| 03:29 | You are awake. No alarm, no noise, no reason. |
| 03:32 | The first time she is on the screen. She does nothing at all: the shoulders do not move, the dress does not move, the light on the dress does not move. Only the head turns. |
| 07:00 | Sun, a sprinkler, and Bob over the fence saying the next one will be even better. |

From night two the game hands you the afternoon and gets out of the way.

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

## The afternoon has a clock now

The evening runs at **an hour a minute**: four real minutes from four in the
afternoon to eight, and at eight the street goes indoors and stays there. The
neighbours mill about their own front gardens until then — walk a few metres,
stand for a few seconds, walk somewhere else — and at eight they all turn for
their own front doors at once and are gone inside within a minute.

Nothing announces it twice. Everything tonight's lock needs is in those four
minutes and in nobody's mouth afterwards, so the daylight walk is no longer
free: you can talk to all ten neighbours or none, and now that choice costs
something.

The compression is why the two clocks run at different rates and it is the only
place in the game that happens. An hour a minute is a summary of an afternoon.
The night is one real second to one game second — 3:30 to 3:35 is five real
minutes — because the player has to be able to feel what a minute of it costs.

## The way round the back

Every back garden is closed on three sides by boarded fence you cannot see over
or climb, so the honest way into one is down the corridor between two plots and
through the metre-wide gap at the front. Which means getting from a garden on
one side of the street to a garden four houses along is a walk out to the road
and all the way back in — and at 3:31, with four minutes on the clock and her
somewhere in the middle of it, that walk is the night.

So one board in the back fence of every house is loose. Behind those fences is
the open ground the whole row backs onto, and once you are on it you can run
the length of the street out of sight of the road and come back in through
somebody else's garden. Nothing in the game mentions this anywhere.

Two rules make it a discovery rather than a checklist. **Where** the loose
board is comes from the save seed, so it is in the same place every night and
can be learned. **Whether** it opens tonight comes from the night, exactly like
the unlocked doors — and the count falls as the week goes on, from ten of the
twelve on the first night to three on the last. The street is being nailed shut
around you one board at a time, and nobody ever says so.

The tell is a track worn in the grass at the foot of a board that is loose
tonight. It is on the ground rather than on the fence, because a player running
a back garden at 3:33 is looking at where their feet are going. From the road
there is nothing to see; from three metres it is obvious, once you know what it
means. Pushing the board is loud, which is the price of the short cut.

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

Once an ending has been reached — either one — the archive grows a second half
that says what each rule of the game actually was: why 3:30, why five minutes,
why the flag, why standing still works, why the dolls are in that order, why
there is red tape on a fuse switch, and why the neighbours are always in their
gardens and never mention any of it. It is behind the ending on purpose. Read
any earlier it turns every mechanic into a puzzle about the plot instead of a
thing you do in the dark with two minutes left.

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
- **Audio** — no sound files. The whistle is a pair of detuned sines through a
  bandpass with a breath layer, portamento and vibrato, scheduled on the
  AudioContext's own clock a phrase at a time and panned and filtered by where
  she is and whether anything is between you. The fourth note is scheduled
  separately and as late as the clock allows, so its dirt answers *how far away
  is she now* rather than *how far away was she six seconds ago*. Around it:
  crickets that stop when she is close, a wind bed, a distant dog, a clock tick
  under the last minute, and one car horn that is only ever heard in a dream.

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
    ui/                 HUD, menus, the map, the puzzle panel, cutscenes, the save
```

## Testing it

Two tools, because they catch completely different things.

```bash
node --experimental-default-type=module tools/suburb-world.mjs
node --experimental-default-type=module tools/suburb-world.mjs --seeds 8
```

Around 1500 headless checks per neighbourhood, over all seven nights. The one
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
lists the ages in the order it claims to, that the neighbour who is supposed to
hold tonight's clue actually says the word for it, that the walk graph is
connected,
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

The smoke test plays the game in a real browser: it skips the opening scene,
walks the afternoon, talks to a neighbour, goes to bed, escapes out of the
dream, waits for 3:31, solves the mailbox keypad by clicking the keys — wrong
code first — takes the flag out of the box and carries it home, then gets
itself caught on the next night, lifts the porch board at the empty house by
way of the mirror, and opens the fuse cabinet to check that the strip of red
tape is on the switch that actually works. It drives the game the way a player does rather than calling the
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
