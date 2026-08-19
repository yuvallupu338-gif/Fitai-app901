/*
 * layout.js — Pine Court, as numbers.
 *
 * Everything the game knows about the neighbourhood is decided here and
 * nowhere else: where the roads are, where the twelve houses stand, which
 * windows are lit, where the whistler can walk, where the flag can appear, and
 * what the answer to tonight's puzzle is. The builder turns this into
 * triangles, the collision world turns it into boxes, the map draws it, and
 * the tests read it — four consumers of one description, which is the only
 * reason the map cannot lie about the street.
 *
 * It is a pure function of (night, seed) and touches no browser API, so
 * `tools/suburb-world.mjs` can check the whole thing in node: that every flag
 * site is reachable, that no house overlaps a road, that the puzzle answer is
 * derivable from something the player can actually see.
 *
 * The plan is a cross, not a grid. Pine Street runs east-west with six houses
 * on each side; Elm Court crosses it and dead-ends north into a small park.
 * A cross is the largest layout a person can hold in their head after one
 * daylight walk, and holding it in your head is the game: at 3:31 you have
 * four minutes and you cannot afford to be lost.
 */

import { rngFrom } from '../core/rng.js';

/* ------------------------------------------------------------------ *
 * The street plan
 * ------------------------------------------------------------------ */

export const PLAN = {
  roadHalf: 4,            /* carriageway half-width                        */
  pave: 1.7,              /* pavement width outside the kerb               */
  kerb: 0.14,             /* how far the kerb stands proud of the road     */
  pineX: [-78, 78],       /* extent of Pine Street                         */
  elmZ: [-30, 52],        /* extent of Elm Court, north end at the park    */
  lotX: [-62, -38, -14, 14, 38, 62],
  frontZ: 14,             /* |z| of a house's front wall                   */
  houseW: 11,
  houseD: 9,
  wallTop: 3.25,          /* eaves height, measured from the lawn          */
  roofRise: 2.1,
  garage: { w: 4.4, d: 5.4, wall: 2.9, roof: 3.1 },
  /*
   * How far the fence line stands out from the wall of the house. It has to
   * clear the garage — which reaches 9.5m from the centre of the plot — or the
   * garage is built through the boundary fence and everything beside it,
   * including the crates you climb, ends up in the neighbour's garden behind a
   * boarded fence.
   */
  plotEdge: 4.6,
  park: { x0: -12, x1: 12, z0: -54, z1: -31 },
  green: { x0: -12, x1: 12, z0: 33, z1: 52 },
  bounds: { x0: -80, x1: 80, z0: -60, z1: 60 },
  boundaryHeight: 3.4,
};

/*
 * House numbers. Odds on the south side ascending east — 11, 13, 15, 17, 19,
 * 21 — and evens on the north side ascending *west*: 12 opposite 21, then 14,
 * 16, 18, 20, 22 going away from it.
 *
 * The two sides running opposite ways is unusual for a street and deliberate
 * here, because the numbers are load-bearing in three separate places and they
 * all pull the same way. Adam lives at 21, at the end of the road, which is
 * where the map has always put him. The mailbox puzzle does arithmetic on the
 * number 14 and it is the first lock the game ever gives you, so number 14 has
 * to be a short walk from his front door rather than a hundred metres away.
 * And the empty house at 17 has to be far enough to be a journey. Numbering
 * the north side the other way round gets all three; numbering it the obvious
 * way gets none of them.
 */
function houseNumber(side, col) {
  return side === 'south' ? 11 + col * 2 : 22 - col * 2;
}

export const HOME_NUMBER = 21;       /* Adam, south side, the end of the road */
export const ABANDONED_NUMBER = 17;  /* empty for twenty years                */
export const BOB_NUMBER = 16;        /* the neighbour who waters his lawn     */

/*
 * How many white hedge panels stand along number 12's boundary. One of the ten
 * locks is a chain with a code on that gate and the code is the count, so the
 * fence has to actually have this many panels in it: a player who does not
 * trust the neighbour's answer can stand there and count them, which is
 * exactly what the puzzle is about — twenty seconds in the open at 3:33.
 */
export const HEDGE_PANELS = 47;

/* ------------------------------------------------------------------ *
 * Occupants
 *
 * Twelve names, twelve one-line characters. They exist for the daylight
 * half of the game: they are who tells you the things the puzzles need, and
 * they are who is asleep behind the window you are about to walk past.
 * ------------------------------------------------------------------ */

const OCCUPANTS = {
  11: { name: 'מר קלמן', trait: 'הגדר האחורית שלו נשענת על הגן' },
  12: { name: 'משפחת ורדי', trait: 'ארגזים ליד המוסך כבר שנתיים' },
  13: { name: 'גברת שוורץ', trait: 'הבובות בגינה היו כאן לפניה' },
  14: { name: 'גברת רוזנברג', trait: 'מתלוננת שכולם שוכחים את הקוד' },
  15: { name: 'דוד ומירי', trait: 'הכלב שלהם לא ישן אף פעם' },
  16: { name: 'בוב', trait: 'משקה את הדשא בשעות מוזרות ומחייך' },
  17: { name: 'אף אחד', trait: 'הבית הזה ריק כבר עשרים שנה' },
  18: { name: 'הזוג נחמיאס', trait: 'הפחים שלהם בסמטה מאחור' },
  19: { name: 'מר בכר', trait: 'שומר על הדשא כאילו הוא ילד' },
  20: { name: 'משפחת אזולאי', trait: 'המכונית תמיד נעולה' },
  21: { name: 'הבית שלך', trait: 'המיטה שלך. השעון על השידה' },
  22: { name: 'רון מהפינה', trait: 'עובד לילות. מחייך יותר מדי' },
};

/* ------------------------------------------------------------------ *
 * The layout
 * ------------------------------------------------------------------ */

export function buildLayout(night, seed) {
  /*
   * Two streams, and the split between them is load-bearing.
   *
   * `rng` is seeded from the save alone and decides the street: where the
   * garages are, what colour each house is painted, which lamp is failing,
   * whose garden the gnomes stand in. That has to be identical on every night
   * of a save, because the game asks you to walk the neighbourhood in daylight
   * and then find something in it in the dark — and a street that quietly
   * rearranged itself between the day and the night would make that a lie.
   * It is also what lets the seven-night flag schedule be drawn once.
   *
   * `nrng` is seeded from the save and the night, and decides only what is
   * genuinely different tonight: which windows are lit, which two doors are
   * unlocked, and tonight's codes.
   */
  const rng = rngFrom((seed | 0) * 2654435761 | 0);
  const nrng = rngFrom(((seed | 0) * 2654435761 + night * 40503) | 0);
  const houses = [];

  let idx = 0;
  for (const side of ['north', 'south']) {
    const sign = side === 'north' ? -1 : 1;
    for (let col = 0; col < PLAN.lotX.length; col++) {
      const x = PLAN.lotX[col];
      const frontZ = sign * PLAN.frontZ;
      const backZ = sign * (PLAN.frontZ + PLAN.houseD);
      const number = houseNumber(side, col);
      const home = number === HOME_NUMBER;
      const abandoned = number === ABANDONED_NUMBER;

      /* Which side of the plot the garage sits on. Alternating it stops the
       * street looking stamped out, and it is what makes the driveways read
       * as belonging to particular houses rather than as a repeating pattern. */
      const garageSide = rng.chance(0.5) ? -1 : 1;

      houses.push({
        id: idx++,
        number,
        side,
        sign,
        x,
        /* z0/z1 are the front and back walls, always ordered low to high so
         * every consumer can treat them as a box without checking the side. */
        z0: Math.min(frontZ, backZ),
        z1: Math.max(frontZ, backZ),
        frontZ,
        backZ,
        w: PLAN.houseW,
        d: PLAN.houseD,
        /* Facing the street: north-side houses look south (+Z), south-side
         * houses look north (-Z). Yaw 0 looks down -Z. */
        yaw: side === 'north' ? Math.PI : 0,
        wallTop: PLAN.wallTop + (rng.chance(0.25) ? 0.35 : 0),
        roofRise: PLAN.roofRise + rng.range(-0.2, 0.35),
        siding: rng.int(3),
        garageSide,
        home,
        abandoned,
        /* Entering a house is the riskiest thing in the game, so most doors
         * are simply locked. The player's own house is always open, the
         * abandoned one always is, and two others are picked per night. */
        enterable: home || abandoned,
        /*
         * The garage, as numbers rather than as something the builder works
         * out for itself. Two things need to agree about where it is — the
         * geometry and the flag site on its roof — and when they were derived
         * separately they disagreed by three and a half metres, which put one
         * night in seven inside the roof of the house next to it with nothing
         * to climb and no way to see why.
         */
        garage: {
          x: x + garageSide * (PLAN.houseW / 2 + PLAN.garage.w / 2 - 0.4),
          z0: frontZ,
          z1: frontZ + sign * PLAN.garage.d,
          w: PLAN.garage.w,
          d: PLAN.garage.d,
          wallTop: PLAN.garage.wall,
          roof: PLAN.garage.roof,
        },
        occupant: OCCUPANTS[number] || { name: 'שכן', trait: '' },
        /* Four front windows and two on each side, lit or not. Two in the
         * whole street stay lit all night; the rest go out between 3:30 and
         * 3:33, which is the only thing in the neighbourhood that changes
         * while you are looking at it. */
        windows: [],
        porchLight: !abandoned && rng.chance(0.55),
        dog: false,
        awake: false,
      });
    }
  }

  /* Two extra open doors per night, never the same two on consecutive nights
   * because the night index is in the stream. Night 6 opens everything: that
   * is the night she starts coming inside, and a locked street would make
   * that change unreadable. */
  const openable = houses.filter((h) => !h.home && !h.abandoned);
  const extra = night >= 6 ? openable.length : 2;
  for (const h of nrng.shuffle(openable).slice(0, extra)) h.enterable = true;

  /* The dog. One back garden, never the player's, and never next door to it —
   * a barking dog fifteen metres from your own front door on night one is not
   * a hazard, it is a wall. */
  /* The dog is at 15 and nowhere else: it is the family dog that barked that
   * night and did not stop, and one of the ten locks is getting past it. */
  const dogHouse = houses.find((h) => h.number === 15);
  dogHouse.dog = true;

  for (const h of houses) {
    h.windows = windowsFor(h, nrng, night);
    h.interior = interiorOf(h);
  }

  const lamps = streetLamps(rng);
  const props = propsFor(houses, rng, night);
  const graph = walkGraph(houses);
  const sites = flagSites(houses);
  const puzzles = buildPuzzles(houses, sites, nrng);
  const chosen = chooseSite(sites, houses, seed, night);

  const home = homeOf(houses);

  return {
    night,
    seed,
    plan: PLAN,
    bounds: PLAN.bounds,
    houses,
    lamps,
    props,
    graph,
    sites,
    puzzles,
    flagSite: chosen,
    home,
    /*
     * Where you wake up: standing beside your own bed in the back bedroom,
     * facing the bedroom door. Beside it, not on it — spawning inside the bed
     * box wedges the player against their own furniture, and the first thing
     * a horror game must not be is fiddly.
     */
    spawn: {
      x: home.x + 0.5,
      z: home.interior.backRoomZ,
      /* Facing the way the house faces, which is the way out. Yaw 0 looks
       * down -Z, so this is the same value the house itself carries. */
      yaw: home.yaw,
    },
    /* Where the flag has to end up: just inside your own front door. */
    goal: { x: home.x, z: home.frontZ - home.sign * 1.6, radius: 2.4 },
  };
}

function homeOf(houses) { return houses.find((h) => h.home); }

/* ------------------------------------------------------------------ *
 * Windows
 * ------------------------------------------------------------------ */

/*
 * Window openings, in the wall's own coordinates: `u` along the wall from its
 * start, `y` up from the ground. The front wall gets a door as well, and the
 * door is always centred because a suburb is a place where the door is always
 * centred.
 */
function windowsFor(h, rng, night) {
  const out = [];
  const w = h.w, d = h.d;
  const sillY = 1.0, winH = 1.25;

  /* Front: two windows either side of the door. */
  out.push({ wall: 'front', u: w * 0.22, y: sillY, w: 1.5, h: winH, lit: false });
  out.push({ wall: 'front', u: w * 0.78, y: sillY, w: 1.5, h: winH, lit: false });
  /* Back: one big one over the kitchen sink, one small. */
  out.push({ wall: 'back', u: w * 0.3, y: sillY, w: 1.8, h: winH, lit: false });
  out.push({ wall: 'back', u: w * 0.72, y: sillY + 0.15, w: 1.0, h: winH * 0.8, lit: false });
  /* One per side wall. */
  out.push({ wall: 'left', u: d * 0.5, y: sillY, w: 1.3, h: winH, lit: false });
  out.push({ wall: 'right', u: d * 0.5, y: sillY, w: 1.3, h: winH, lit: false });

  if (h.abandoned) return out;              /* nothing is lit in there      */

  /*
   * How many rooms are still awake at half past three. Almost none — and the
   * ones that are matter, because a lit window is the only thing that lights
   * the ground under it, and the only place she is guaranteed to look.
   */
  const n = h.home ? 1 : rng.chance(0.22 + night * 0.02) ? rng.irange(1, 2) : 0;
  const order = rng.shuffle(out.map((_, i) => i));
  for (let i = 0; i < n; i++) out[order[i]].lit = true;
  /* Lights that go out while you are standing there. Deliberately not the
   * ones lit at the start of the night: this is a light going ON, at 3:32,
   * in a house you have already walked past. */
  if (!h.home && rng.chance(0.18)) {
    const j = order[order.length - 1];
    out[j].wakesAt = 60 + rng.range(0, 110);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Street furniture
 * ------------------------------------------------------------------ */

function streetLamps(rng) {
  const lamps = [];
  /* Pine Street: staggered either side, so the pools of light overlap along
   * the middle of the road and leave the gardens dark. That gap is where the
   * whole game is played. */
  let i = 0;
  for (let x = -70; x <= 70; x += 20) {
    const z = (i % 2 === 0 ? 1 : -1) * (PLAN.roadHalf + PLAN.pave - 0.5);
    lamps.push({ x, z, yaw: z > 0 ? 0 : Math.PI, flicker: -1 });
    i++;
  }
  for (let z = -22; z <= 46; z += 18) {
    const x = (i % 2 === 0 ? 1 : -1) * (PLAN.roadHalf + PLAN.pave - 0.5);
    lamps.push({ x, z, yaw: x > 0 ? Math.PI / 2 : -Math.PI / 2, flicker: -1 });
    i++;
  }
  /* Exactly one lamp in the neighbourhood is failing. One is a detail; three
   * is a haunted house, and this street is trying to look normal. */
  const bad = rng.int(lamps.length);
  lamps[bad].flicker = rng();
  return lamps;
}

/*
 * Everything else standing in the street or the gardens. Kept as flat data
 * with a `kind` so the builder, the collision world and the interaction code
 * all agree about what a thing is — an interactable prop that the mesher drew
 * but collision never heard of is the classic way a puzzle becomes
 * unsolvable.
 */
function propsFor(houses, rng, night) {
  const props = [];
  const home = homeOf(houses);
  const byNumber = (n) => houses.find((h) => h.number === n);

  for (const h of houses) {
    const s = h.sign;
    const gx = h.x + h.garageSide * (h.w / 2 - 1.8);

    /* Mailbox at the kerb, on the driveway side. Number 14's has a combination
     * lock on it and everyone else's does not, which is a thing you can see
     * from the pavement in daylight. */
    props.push({
      kind: 'mailbox', houseId: h.id, number: h.number,
      x: gx, z: s * (PLAN.roadHalf + PLAN.pave + 0.8), yaw: s > 0 ? Math.PI : 0,
      locked: h.number === 14,
    });
    /* The flag pole every house has, and nobody mentions. */
    props.push({
      kind: 'flagpole', houseId: h.id,
      x: h.x - h.garageSide * 3.2, z: s * (PLAN.frontZ - 3.0), yaw: 0,
      flying: !h.abandoned,
    });
    /* A car on most driveways — and always on 13's, which is the one with the
     * radio and the piano sticker on the sun visor. */
    if (!h.abandoned && (h.number === 13 || rng.chance(0.6))) {
      props.push({
        kind: 'car', houseId: h.id,
        x: gx, z: s * (PLAN.frontZ - 4.2), yaw: h.sign > 0 ? 0 : Math.PI,
        radio: h.number === 13,
      });
    }
    /* A hedge down the boundary the garage is not on. Number 12's is the one
     * with the chain lock on its gate, and it is exactly as long as the puzzle
     * says it is — see hedgePanels() below. */
    props.push({
      kind: 'hedgeRow', houseId: h.id,
      x: h.x - h.garageSide * (PLAN.houseW / 2 + PLAN.plotEdge),
      z0: s * (PLAN.frontZ - 6), z1: s * (PLAN.frontZ + h.d + 4), axis: 'z',
      panels: h.number === 12 ? HEDGE_PANELS : 0,
    });
    if (rng.chance(0.65)) {
      props.push({
        kind: 'tree', houseId: h.id,
        x: h.x + rng.range(-4, 4), z: s * (PLAN.frontZ - rng.range(5.5, 7.5)),
        r: rng.range(0.9, 1.35), h: rng.range(5.5, 7.5),
      });
    }
  }

  /* --- the ten locks, each of them a thing standing in a garden --- */

  /* Three music boxes on Bob's lawn at 16. One of them plays the lullaby the
   * way she actually sang it. */
  const bob = byNumber(BOB_NUMBER);
  for (let i = 0; i < 3; i++) {
    props.push({
      kind: 'musicbox', houseId: bob.id, slot: i,
      x: bob.x - 2.4 + i * 2.4, z: bob.sign * (PLAN.frontZ - 5.4),
    });
  }

  /* Four garden dolls at 13, in a row, in the wrong order. They are Adam's
   * toys from the photograph, which is not something the game ever says. */
  const dollHouse = byNumber(13);
  for (let i = 0; i < 4; i++) {
    props.push({
      kind: 'doll', houseId: dollHouse.id, slot: i,
      x: dollHouse.x - 3 + i * 2, z: dollHouse.sign * (PLAN.frontZ - 2.2),
    });
  }
  /* And the bone, buried under 13's porch, for the dog at 15. */
  props.push({
    kind: 'digspot', houseId: dollHouse.id,
    x: dollHouse.x + 2.4, z: dollHouse.sign * (PLAN.frontZ - 1.4),
  });

  /* The wardrobe mirror somebody left leaning on the back fence of the empty
   * house twenty years ago. */
  const ab = byNumber(ABANDONED_NUMBER);
  props.push({
    kind: 'mirror', houseId: ab.id,
    x: ab.x - 4.4, z: ab.sign * (PLAN.frontZ + ab.d + 2.2), yaw: ab.sign > 0 ? 0 : Math.PI,
  });
  /* The third board of its porch, which is what the mirror is about. */
  props.push({
    kind: 'board', houseId: ab.id,
    x: ab.x + 1.1, z: ab.sign * (PLAN.frontZ - 1.4),
  });

  /* The dog at 15. */
  const dogHouse = houses.find((h) => h.dog) || byNumber(15);
  props.push({
    kind: 'doghouse', houseId: dogHouse.id,
    x: dogHouse.x + 3, z: dogHouse.sign * (PLAN.frontZ + dogHouse.d + 3.5),
    yaw: dogHouse.sign > 0 ? 0 : Math.PI,
  });

  /* Three bins in the alley behind 18, chained one to the next. */
  const binHouse = byNumber(18);
  for (let i = 0; i < 3; i++) {
    props.push({
      kind: 'bin', houseId: binHouse.id, slot: i,
      x: binHouse.x - 2.2 + i * 2.2,
      z: binHouse.sign * (PLAN.frontZ + binHouse.d + 5.2),
      yaw: rng.range(0, Math.PI * 2),
    });
  }
  /* Everyone else's bins are just bins, out for collection. */
  for (const h of houses) {
    if (h.number === 18 || !rng.chance(0.4)) continue;
    props.push({
      kind: 'bin', houseId: h.id, slot: -1,
      x: h.x + rng.range(-3.5, 3.5), z: h.sign * (PLAN.roadHalf + PLAN.pave + 0.5),
      yaw: rng.range(0, Math.PI * 2),
    });
  }

  /* The park: a fountain, the tall tree, the ladder against it, the fuse
   * cabinet that drives the fountain pump, and somewhere to sit. */
  const p = PLAN.park;
  const px = (p.x0 + p.x1) / 2;
  props.push({ kind: 'fountain', x: px, z: (p.z0 + p.z1) / 2 - 2, r: 3.2 });
  props.push({ kind: 'tree', x: p.x0 + 3, z: p.z0 + 5, r: 1.7, h: 9.5, big: true });
  props.push({ kind: 'ladder', x: p.x0 + 5.2, z: p.z0 + 5, yaw: 0 });
  props.push({ kind: 'panel', x: p.x1 - 1.6, z: p.z0 + 2.4, yaw: -Math.PI / 2 });
  props.push({ kind: 'tree', x: p.x1 - 3.5, z: p.z0 + 8, r: 1.2, h: 7 });
  props.push({ kind: 'bench', x: px - 4.6, z: (p.z0 + p.z1) / 2 - 2, yaw: Math.PI / 2 });
  props.push({ kind: 'bench', x: px + 4.6, z: (p.z0 + p.z1) / 2 - 2, yaw: -Math.PI / 2 });
  props.push({ kind: 'sign', x: 2.5, z: p.z1 + 1.5, yaw: 0, text: 'גן האורנים' });

  /* The green at the south end, which is where the bus never comes. */
  const g = PLAN.green;
  props.push({ kind: 'shelter', x: (g.x0 + g.x1) / 2, z: g.z0 + 3, yaw: Math.PI });
  props.push({ kind: 'tree', x: g.x0 + 4, z: g.z0 + 9, r: 1.1, h: 6.5 });

  /* Your own front door, marked, so the goal is a thing in the world. */
  props.push({
    kind: 'homeMark', houseId: home.id, x: home.x,
    z: home.frontZ - home.sign * 1.4,
  });

  void night;
  return props;
}


/* ------------------------------------------------------------------ *
 * The walk graph
 *
 * She does not path-find. She drifts between waypoints, and the graph is
 * shaped so that drifting looks like searching: along the road, up a drive,
 * round the side of a house, along the back fence, out again. A grid of
 * waypoints would have her walking through the middle of lawns in straight
 * lines, which reads as a robot on rails.
 * ------------------------------------------------------------------ */

function walkGraph(houses) {
  const nodes = [];
  const edges = [];
  const add = (x, z, kind, houseId = -1) => {
    nodes.push({ x, z, kind, houseId });
    return nodes.length - 1;
  };
  const link = (a, b) => {
    if (a === b) return;
    edges.push([a, b]);
  };

  /* Pine Street, down the middle. */
  const pine = [];
  for (let x = -72; x <= 72; x += 12) pine.push(add(x, 0, 'road'));
  for (let i = 1; i < pine.length; i++) link(pine[i - 1], pine[i]);

  /* Elm Court. */
  const elm = [];
  for (let z = -26; z <= 48; z += 12) {
    if (Math.abs(z) < 6) continue;          /* the junction is a Pine node  */
    elm.push({ id: add(0, z, 'road'), z });
  }
  const north = elm.filter((n) => n.z < 0).sort((a, b) => b.z - a.z);
  const south = elm.filter((n) => n.z > 0).sort((a, b) => a.z - b.z);
  const junction = pine[Math.round((pine.length - 1) / 2)];
  for (const chain of [north, south]) {
    let prev = junction;
    for (const n of chain) { link(prev, n.id); prev = n.id; }
  }

  /* The park, at the top of Elm. */
  const p = PLAN.park;
  const parkGate = add((p.x0 + p.x1) / 2, p.z1 - 1, 'park');
  link(north.length ? north[north.length - 1].id : junction, parkGate);
  const parkA = add(p.x0 + 3.5, (p.z0 + p.z1) / 2, 'park');
  const parkB = add(p.x1 - 3.5, (p.z0 + p.z1) / 2, 'park');
  const parkC = add((p.x0 + p.x1) / 2, p.z0 + 3, 'park');
  link(parkGate, parkA); link(parkGate, parkB);
  link(parkA, parkC); link(parkB, parkC);

  /* Each house: the front path, both side passages, the back garden. */
  const backs = [];
  for (const h of houses) {
    const s = h.sign;
    const nearest = pine.reduce((best, id) =>
      Math.abs(nodes[id].x - h.x) < Math.abs(nodes[best].x - h.x) ? id : best, pine[0]);
    const front = add(h.x, s * (PLAN.frontZ - 5.5), 'front', h.id);
    link(nearest, front);
    const left = add(h.x - h.w / 2 - 1.4, s * (PLAN.frontZ + h.d / 2), 'side', h.id);
    const right = add(h.x + h.w / 2 + 1.4, s * (PLAN.frontZ + h.d / 2), 'side', h.id);
    link(front, left); link(front, right);
    const back = add(h.x, s * (PLAN.frontZ + h.d + 3.5), 'back', h.id);
    link(left, back); link(right, back);
    backs.push({ id: back, x: h.x, side: h.side });
  }
  /* Back gardens of neighbouring houses connect over the fence, which is how
   * she gets from one plot to the next without going back out to the road. */
  for (const side of ['north', 'south']) {
    const row = backs.filter((b) => b.side === side).sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) link(row[i - 1].id, row[i].id);
  }

  /* Undirected: store both directions once, so the walker can pick any
   * neighbour without checking which end of the edge it is on. */
  const adj = nodes.map(() => []);
  for (const [a, b] of edges) {
    if (!adj[a].includes(b)) adj[a].push(b);
    if (!adj[b].includes(a)) adj[b].push(a);
  }
  return { nodes, edges, adj };
}

/* ------------------------------------------------------------------ *
 * The ten places a flag can be
 * ------------------------------------------------------------------ */

/*
 * The ten places a flag can be, and the ten locks on them.
 *
 * Fixed to the street rather than scattered randomly, and that is the point: a
 * player who has played four nights knows all ten, and the tension stops being
 * "where could it possibly be" and becomes "which of the ten, and can I get
 * there and back". Random placement would make every night the same search.
 *
 * Every one of them is guarded by something, and every guard is a piece of the
 * same night twenty years ago: the toys in the garden are Adam's toys, the dog
 * is the dog that barked, the red tape on the fuse is where his mother marked
 * it so he would not be afraid of the dark.
 *
 * `lock` names a puzzle in buildPuzzles(). `kind` is how the game asks for it:
 *   keypad  digits on a panel
 *   choice  one of three or four things in the world
 *   order   put things in the right order
 *   world   done entirely by pressing E on things, no panel at all
 */
function flagSites(houses) {
  const byNumber = (n) => houses.find((h) => h.number === n);
  const p = PLAN.park;
  const sites = [];

  /* 1 — the mailbox at 14. The first lock the game ever gives you, thirty
   * metres from Adam's front door, and the answer is written on the box. */
  const mail = byNumber(14);
  sites.push({
    id: 'mailbox', lock: 'code', houseId: mail.id,
    x: mail.x + mail.garageSide * (mail.w / 2 - 1.8), y: 1.05,
    z: mail.sign * (PLAN.roadHalf + PLAN.pave + 0.8),
    label: 'תיבת הדואר של מספר 14',
    hint: 'בתיבת הדואר הנעולה של גברת רוזנברג, מספר 14.',
  });

  /* 2 — under the third board of the empty house's porch. */
  const ab = byNumber(ABANDONED_NUMBER);
  sites.push({
    id: 'boards', lock: 'mirror', houseId: ab.id,
    x: ab.x + 1.1, y: 0.5, z: ab.sign * (PLAN.frontZ - 1.4),
    crouch: true,
    label: 'מתחת למרפסת של הבית הנטוש',
    hint: 'מתחת לקרש במרפסת של הבית הריק, מספר 17. כתוב על החלון איזה.',
  });

  /* 3 — the roof of 12's garage, behind a gate with a chain on it. */
  const garage = byNumber(12);
  const G = garage.garage;
  sites.push({
    id: 'garage', lock: 'hedges', houseId: garage.id,
    x: G.x, y: G.roof + 0.3, z: (G.z0 + G.z1) / 2,
    climb: true,
    label: 'גג המוסך של מספר 12',
    hint: 'על גג המוסך של מספר 12. השער נעול בשרשרת עם קוד.',
  });

  /* 4 — the hole in Bob's lawn. */
  const bob = byNumber(BOB_NUMBER);
  sites.push({
    id: 'pit', lock: 'sound', houseId: bob.id,
    x: bob.x - bob.garageSide * 3.4, y: -0.9,
    z: bob.sign * (PLAN.frontZ - 6.4),
    crouch: true,
    label: 'הבור בדשא של בוב',
    hint: 'בבור שבוב חפר בדשא הקדמי שלו ולא כיסה.',
  });

  /* 5 — a branch of the big tree in the park, and a ladder that shrieks. */
  sites.push({
    id: 'tree', lock: 'ladder',
    x: p.x0 + 3, y: 3.4, z: p.z0 + 5,
    climb: true,
    label: 'העץ הגבוה בגן',
    hint: 'על ענף גבוה בעץ הגדול שבגן. יש שם סולם.',
  });

  /* 6 — the back seat of the locked car at 13. */
  const carHouse = byNumber(13);
  sites.push({
    id: 'car', lock: 'radio', houseId: carHouse.id,
    x: carHouse.x + carHouse.garageSide * (carHouse.w / 2 - 1.8), y: 1.0,
    z: carHouse.sign * (PLAN.frontZ - 4.2),
    label: 'המכונית של מספר 13',
    hint: 'במושב האחורי של המכונית הנעולה מול 13. הרדיו שלה דולק.',
  });

  /* 7 — under the fountain, which is full of water until you find the pump. */
  sites.push({
    id: 'fountain', lock: 'panel',
    x: (p.x0 + p.x1) / 2, y: 0.35, z: (p.z0 + p.z1) / 2 - 2 + 2.4,
    crouch: true,
    label: 'מתחת למזרקה',
    hint: 'מתחת למזרקה בגן. צריך לכבות את המשאבה קודם.',
  });

  /* 8 — the third bin in the alley behind 18. */
  const binHouse = byNumber(18);
  sites.push({
    id: 'bin', lock: 'bins', houseId: binHouse.id,
    x: binHouse.x + 2.2, y: 0.7,
    z: binHouse.sign * (PLAN.frontZ + binHouse.d + 5.2),
    loud: true,
    label: 'הפח בסמטה מאחורי 18',
    hint: 'באחד הפחים בסמטה מאחורי 18. הם נעולים זה בזה.',
  });

  /* 9 — the back fence at 11, at the far end of the road. */
  const fenceHouse = byNumber(11);
  sites.push({
    id: 'fence', lock: 'dolls', houseId: fenceHouse.id,
    x: fenceHouse.x - 2, y: 1.4,
    z: fenceHouse.sign * (PLAN.frontZ + fenceHouse.d + 5.2),
    label: 'הגדר האחורית של 11',
    hint: 'תלוי על הגדר האחורית של 11, בקצה הרחוב.',
  });

  /* 10 — inside the kennel at 15, with the dog in it. */
  const dogHouse = byNumber(15);
  sites.push({
    id: 'kennel', lock: 'bone', houseId: dogHouse.id,
    x: dogHouse.x + 3, y: 0.5, z: dogHouse.sign * (PLAN.frontZ + dogHouse.d + 3.5),
    crouch: true, loud: true,
    label: 'המלונה בחצר של 15',
    hint: 'בתוך המלונה של הכלב בחצר האחורית של 15. כן, באמת.',
  });

  return sites;
}

/*
 * Which site tonight.
 *
 * Night one is always the mailbox at 14 — it is thirty metres from Adam's
 * front door, the arithmetic is stamped on the box itself, and a first night
 * spent learning that the game has locks in it is worth more than a first
 * night spent lost. Everything after that is drawn from the save seed, so the
 * seven nights of a save never repeat a place, and the six after the first are
 * sorted so the walk grows.
 */
function siteSchedule(sites, houses, seed) {
  const home = homeOf(houses);
  const dist = (s) => Math.hypot(s.x - home.x, s.z - home.frontZ);
  const first = sites.find((s) => s.id === 'mailbox') || sites[0];
  const rest = rngFrom(((seed | 0) ^ 0x5bf03635) | 0)
    .shuffle(sites.filter((s) => s !== first))
    .slice(0, 6)
    .sort((x, y) => dist(x) - dist(y));
  return [first, ...rest];
}

function chooseSite(sites, houses, seed, night) {
  const plan = siteSchedule(sites, houses, seed);
  const n = Math.min(Math.max(night, 1), 7);
  return plan[n - 1] || plan[plan.length - 1];
}

/* ------------------------------------------------------------------ *
 * The ten locks
 *
 * Everything here is derivable from something the player can walk up to and
 * look at, and — for the four that are numbers — from something a neighbour
 * says in daylight. That is the whole contract: a puzzle whose answer is not
 * derivable from something in the world is a guessing game, and a guessing
 * game with a woman walking towards you is just a way of losing.
 *
 * The three fixed answers (22, 47, 3576) are fixed on purpose. They are
 * properties of the neighbourhood — a house number, a fence, a sticker on a
 * sun visor — and a neighbourhood whose house numbers changed nightly would
 * not be a neighbourhood. What rotates per night is which lock is in the way.
 * ------------------------------------------------------------------ */

function buildPuzzles(houses, sites, rng) {
  const byNumber = (n) => houses.find((h) => h.number === n);
  const mail = byNumber(14);

  /* 1 — the mailbox. The number is on the box you are standing at and painted
   * over the door behind it, and the arithmetic is engraved on the lock. */
  const codeAnswer = String((mail.number - 3) * 2);

  /* 2 — the empty house. Somebody wrote on the inside of the kitchen window a
   * long time ago, so from the garden it reads backwards, and the only way to
   * read it the right way round is the wardrobe mirror on the back fence. */
  const boardIndex = 3;

  /* 3 — the chain on 12's gate. The code is how many white hedge panels there
   * are, and there are exactly that many, and counting them takes twenty
   * seconds of standing still in the open. */
  const hedgeAnswer = String(HEDGE_PANELS);

  /* 4 — three music boxes on Bob's lawn. Two of them play the tune with the
   * wrong fourth note, the way she whistles it now; one plays it the way she
   * actually sang it. Which box is which moves, because the boxes get wound
   * and put back. */
  const soundAnswer = rng.int(3);

  /* 5 — the ladder against the tree. Not a code: it shrieks when you drag it,
   * and the only cover is the whistle itself, so it has to be dragged in the
   * loud half of her phrase and left alone in the quiet half. */

  /* 6 — the car radio at 13. Four notes, and a piano sticker on the sun visor
   * numbering the white keys from C. E G B A becomes 3 5 7 6. */
  const NOTE_DIGITS = { C: 1, D: 2, E: 3, F: 4, G: 5, A: 6, B: 7 };
  const radioNotes = ['E', 'G', 'B', 'A'];
  const radioAnswer = radioNotes.map((n) => NOTE_DIGITS[n]).join('');

  /* 7 — the fuse cabinet in the park. Four switches, and the one that stops
   * the fountain pump is the one with a strip of red tape on it, which is in
   * one of the photographs. The wrong one sets off a buzzer. */
  const panelAnswer = rng.int(4);

  /* 8 — three bins in the alley, chained one to the next. Read, drink, ring:
   * newspapers, then the milk bottles, then the tins. */
  const bins = [
    { id: 0, name: 'הפח עם העיתונים' },
    { id: 1, name: 'הפח עם בקבוקי החלב' },
    { id: 2, name: 'הפח עם הפחיות' },
  ];

  /* 9 — four garden dolls at 13, in the wrong order. The clues are on three
   * plaques in the same garden, and the order is a thing about their ages
   * rather than their sizes. */
  const dolls = [
    { id: 0, name: 'הדובי' },
    { id: 1, name: 'הכובע האדום' },
    { id: 2, name: 'הכדור' },
    { id: 3, name: 'הספר' },
  ];

  /* 10 — the dog. There is no code and no order: there is a bone buried under
   * the porch at 13, and a dog at 15 that has been barking for twenty years. */

  void sites;
  return {
    code: {
      id: 'code', kind: 'keypad', title: 'המנעול על תיבת הדואר',
      note: 'חרוט על המכסה: "המספר של הבית שלי, פחות 3, כפול 2".',
      answer: codeAnswer, digits: codeAnswer.length,
      houseNumber: mail.number, solved: false,
    },
    mirror: {
      id: 'mirror', kind: 'world', title: 'הקרש במרפסת',
      note: 'על החלון של הבית הריק כתוב משהו, מבפנים.',
      board: boardIndex,
      /* Written on the glass from the inside, so from the garden every word of
       * it is back to front. */
      windowText: `הדגל מתחת לקרש ה${boardIndex} במרפסת`.split('').reverse().join(''),
      readable: `הדגל מתחת לקרש ה${boardIndex} במרפסת`,
      read: false, solved: false,
    },
    hedges: {
      id: 'hedges', kind: 'keypad', title: 'השרשרת על השער',
      note: 'על הפתק שקשור לשרשרת: "כמה משוכות לבנות יש לי?"',
      answer: hedgeAnswer, digits: hedgeAnswer.length,
      counted: false, solved: false,
    },
    sound: {
      id: 'sound', kind: 'choice', title: 'שלוש תיבות הנגינה',
      note: 'אחת מהן מנגנת את השיר כמו שהוא באמת. שתיים מנגנות אותו כמו שהיא שורקת אותו עכשיו.',
      options: [0, 1, 2].map((i) => ({ id: i, memory: i === soundAnswer })),
      answer: soundAnswer, solved: false,
    },
    ladder: {
      id: 'ladder', kind: 'world', title: 'הסולם',
      note: 'הסולם צורח כשגוררים אותו. השריקה מכסה עליו — אבל רק בחצי הראשון שלה.',
      progress: 0, solved: false,
    },
    radio: {
      id: 'radio', kind: 'keypad', title: 'הקודן במכונית',
      note: 'הרדיו מנגן ארבעה תווים. על מגן השמש מדבקה של פסנתר, והקלידים ממוספרים מ-C.',
      answer: radioAnswer, digits: 4, notes: radioNotes, solved: false,
    },
    panel: {
      id: 'panel', kind: 'choice', title: 'ארון החשמל',
      note: 'ארבעה מפסקים. אחד מהם מכבה את המשאבה של המזרקה.',
      options: [0, 1, 2, 3].map((i) => ({ id: i, tape: i === panelAnswer })),
      answer: panelAnswer, solved: false,
    },
    bins: {
      id: 'bins', kind: 'order', title: 'שלושת הפחים',
      note: 'פתק על השרשרת: "תתחיל עם מה שקוראים, תמשיך עם מה ששותים, תסיים עם מה שמצלצל".',
      items: bins, answer: [0, 1, 2], solved: false,
    },
    dolls: {
      id: 'dolls', kind: 'order', title: 'ארבע הבובות',
      note: 'מהמבוגר לצעיר. הרמזים על הלוחיות בגינה.',
      items: dolls,
      /* Teddy, hat, ball, book — from the three plaques: the hat is not the
       * oldest but is older than the ball, the ball is older than the book,
       * and the book is the youngest. */
      answer: [0, 1, 2, 3],
      clues: [
        '"הכובע לא הכי מבוגר, אבל מבוגר מהכדור."',
        '"הכדור מבוגר מהספר."',
        '"הספר הכי צעיר מכולם."',
      ],
      solved: false,
    },
    bone: {
      id: 'bone', kind: 'world', title: 'הכלב',
      note: 'הוא נובח על כל מי שמתקרב. יש עצם קבורה מתחת למרפסת של 13.',
      dug: false, solved: false,
    },
  };
}

/*
 * Where the furniture stands inside a house.
 *
 * This lives here rather than in the builder because four things need to
 * agree about it: the geometry, the collision boxes, where the player wakes
 * up, and where she looks when she comes inside. It is a pure function of the
 * house, so it is the same in the daylight walk-through and in the dark.
 */
export function interiorOf(h) {
  const s = h.sign;
  const z0 = h.z0 + 0.24, z1 = h.z1 - 0.24;
  const midZ = (z0 + z1) / 2 + s * 0.6;
  const backRoomZ = s > 0 ? (midZ + z1) / 2 : (midZ + z0) / 2;
  const frontRoomZ = s > 0 ? (midZ + z0) / 2 : (midZ + z1) / 2;
  /*
   * `away` is which side of the house the bed is on, and everything else in
   * the bedroom is placed relative to it — because the one arrangement that
   * must never happen is the bed standing in front of the bedroom door. It
   * did, on exactly the half of the seeds where the garage was on the other
   * side, and the result was a player sealed in their own bedroom with no
   * way to tell why.
   */
  const away = h.garageSide > 0 ? -1 : 1;
  return {
    x0: h.x - h.w / 2 + 0.24, x1: h.x + h.w / 2 - 0.24,
    z0, z1, midZ, backRoomZ, frontRoomZ,
    /* The internal doorway, in wall coordinates from the west corner: always
     * on the opposite side of the room from the bed. */
    doorU: h.w / 2 - away * 2.2,
    bed: { x: h.x + away * 2.6, z: backRoomZ },
    wardrobe: { x: h.x - away * 4.3, z: backRoomZ },
    sofa: { x: h.x - 2.4, z: frontRoomZ },
    table: { x: h.x + 0.4, z: frontRoomZ },
    tv: { x: h.x + 3.2, z: frontRoomZ },
  };
}

/* Which puzzle, if any, tonight's flag is behind. Exposed because three
 * different places need it and none of them should be re-deriving it. */
export function activePuzzle(layout) {
  const lock = layout.flagSite && layout.flagSite.lock;
  return lock ? layout.puzzles[lock] : null;
}
