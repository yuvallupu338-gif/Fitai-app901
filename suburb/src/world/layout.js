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

/* House numbers: evens on the north side, odds on the south, ascending east.
 * The mailbox puzzle does arithmetic on these, so they have to be somewhere a
 * player can read them — they are on the mailbox and over the front door. */
function houseNumber(side, col) {
  return side === 'north' ? (col + 1) * 2 : col * 2 + 1;
}

export const HOME_NUMBER = 5;        /* south side, third from the west     */
export const ABANDONED_NUMBER = 11;  /* south side, far east                */

/* ------------------------------------------------------------------ *
 * Occupants
 *
 * Twelve names, twelve one-line characters. They exist for the daylight
 * half of the game: they are who tells you the things the puzzles need, and
 * they are who is asleep behind the window you are about to walk past.
 * ------------------------------------------------------------------ */

const OCCUPANTS = [
  { name: 'מר קלמן', trait: 'גוזם את הגדר בשלוש בבוקר לפעמים' },
  { name: 'משפחת ורדי', trait: 'שלושה ילדים, אף אחד לא בחוץ' },
  { name: 'גברת אלוני', trait: 'מכינה עוגת גבינה ומדברת הרבה' },
  { name: 'הזוג נחמיאס', trait: 'חדשים כאן. כמעט כמוך' },
  { name: 'דוד ומירי', trait: 'הכלב שלהם לא ישן אף פעם' },
  { name: 'את הבית שלך', trait: 'המיטה שלך. השעון על השידה' },
  { name: 'מר בכר', trait: 'שומר על הדשא כאילו הוא ילד' },
  { name: 'משפחת אזולאי', trait: 'המכונית תמיד נעולה' },
  { name: 'גברת שוורץ', trait: 'יודעת מה קרה כאן. לא תגיד' },
  { name: 'הזוג מלכה', trait: 'תיבת הדואר שלהם עם מנעול' },
  { name: 'רון מהפינה', trait: 'עובד לילות. מחייך יותר מדי' },
  { name: 'אף אחד', trait: 'הבית הזה ריק כבר עשרים שנה' },
];

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
        occupant: OCCUPANTS[idx - 1] || OCCUPANTS[0],
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
  const dogCandidates = houses.filter((h) => !h.home && !h.abandoned
    && Math.abs(h.x - homeOf(houses).x) > 30);
  const dogHouse = rng.pick(dogCandidates);
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

  for (const h of houses) {
    const s = h.sign;
    const gx = h.x + h.garageSide * (h.w / 2 - 1.8);

    /* Mailbox at the kerb, on the driveway side. */
    props.push({
      kind: 'mailbox', houseId: h.id, number: h.number,
      x: gx, z: s * (PLAN.roadHalf + PLAN.pave + 0.8), yaw: s > 0 ? Math.PI : 0,
    });
    /* The flag pole every house has, and nobody mentions. */
    props.push({
      kind: 'flagpole', houseId: h.id,
      x: h.x - h.garageSide * 3.2, z: s * (PLAN.frontZ - 3.0), yaw: 0,
      flying: !h.abandoned,
    });
    /* Bins, out for collection, on about half the plots. */
    if (rng.chance(0.5)) {
      props.push({
        kind: 'bin', houseId: h.id,
        x: h.x + rng.range(-3.5, 3.5), z: s * (PLAN.roadHalf + PLAN.pave + 0.5),
        yaw: rng.range(0, Math.PI * 2),
      });
    }
    /* A car on most driveways — and always on number 6's, because the flag
     * spends one night of every seven locked inside it. */
    if (!h.abandoned && (h.number === 6 || rng.chance(0.7))) {
      props.push({
        kind: 'car', houseId: h.id,
        x: gx, z: s * (PLAN.frontZ - 4.2), yaw: h.sign > 0 ? 0 : Math.PI,
        locked: true,
      });
    }
    /* A hedge down one plot boundary — the side the garage is not on, since
     * the garage and its crates take up the whole of the other one. */
    props.push({
      kind: 'hedgeRow', houseId: h.id,
      x: h.x - h.garageSide * (PLAN.houseW / 2 + PLAN.plotEdge),
      z0: s * (PLAN.frontZ - 6), z1: s * (PLAN.frontZ + h.d + 4), axis: 'z',
    });
    /* A tree in most front gardens. */
    if (rng.chance(0.65)) {
      props.push({
        kind: 'tree', houseId: h.id,
        x: h.x + rng.range(-4, 4), z: s * (PLAN.frontZ - rng.range(5.5, 7.5)),
        r: rng.range(0.9, 1.35), h: rng.range(5.5, 7.5),
      });
    }
    if (h.dog) {
      props.push({
        kind: 'doghouse', houseId: h.id,
        x: h.x + 3, z: s * (PLAN.frontZ + h.d + 3.5), yaw: h.sign > 0 ? 0 : Math.PI,
      });
    }
    /*
     * Garden gnomes. Four of them, in number 6's front garden and nowhere
     * else, because they are the lock on number 6's car and a second identical
     * row two doors down would make the puzzle unsolvable by exactly the
     * player who was paying attention. They stand there on every night of
     * every save, including the six nights they are not needed — a puzzle
     * object that only appears on the night it matters is a puzzle you can see
     * coming.
     */
    if (h.number === 6) {
      const gz = s * (PLAN.frontZ - 2.2);
      for (let i = 0; i < 4; i++) {
        props.push({ kind: 'gnome', houseId: h.id, x: h.x - 3 + i * 2, z: gz, slot: i });
      }
    }
  }

  /* The park: a fountain, benches, and the biggest tree in the neighbourhood. */
  const p = PLAN.park;
  props.push({ kind: 'fountain', x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2 - 2, r: 3.2 });
  props.push({ kind: 'tree', x: p.x0 + 3, z: p.z0 + 5, r: 1.7, h: 9.5, big: true });
  props.push({ kind: 'tree', x: p.x1 - 3.5, z: p.z0 + 8, r: 1.2, h: 7 });
  props.push({ kind: 'bench', x: (p.x0 + p.x1) / 2 - 4.6, z: (p.z0 + p.z1) / 2 - 2, yaw: Math.PI / 2 });
  props.push({ kind: 'bench', x: (p.x0 + p.x1) / 2 + 4.6, z: (p.z0 + p.z1) / 2 - 2, yaw: -Math.PI / 2 });
  props.push({ kind: 'sign', x: 2.5, z: p.z1 + 1.5, yaw: 0, text: 'גן האורנים' });

  /* The green at the south end, which is where the bus never comes. */
  const g = PLAN.green;
  props.push({ kind: 'shelter', x: (g.x0 + g.x1) / 2, z: g.z0 + 3, yaw: Math.PI });
  props.push({ kind: 'tree', x: g.x0 + 4, z: g.z0 + 9, r: 1.1, h: 6.5 });

  /* Three music boxes on a lawn — the sound puzzle's furniture. Always the
   * same lawn, so a player who learned it in daylight on night two can walk
   * to it in the dark on night five. */
  const musicHouse = houses.find((h) => h.number === 3);
  for (let i = 0; i < 3; i++) {
    props.push({
      kind: 'musicbox', houseId: musicHouse.id, slot: i,
      x: musicHouse.x - 2.4 + i * 2.4, z: musicHouse.sign * (PLAN.frontZ - 5.4),
    });
  }
  /* The mirror in the garden of the abandoned house: a wardrobe mirror
   * somebody left leaning against the fence twenty years ago. */
  const ab = houses.find((h) => h.abandoned);
  props.push({
    kind: 'mirror', houseId: ab.id,
    x: ab.x - 4.4, z: ab.sign * (PLAN.frontZ + ab.d + 2.2), yaw: ab.sign > 0 ? 0 : Math.PI,
  });
  /* Your own porch, marked, so the goal is a thing in the world and not a
   * number on the HUD. */
  props.push({ kind: 'homeMark', houseId: home.id, x: home.x, z: home.frontZ - home.sign * 1.4 });

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
 * Ten sites, fixed to the street rather than scattered randomly. Fixed is the
 * point: a player who has played four nights knows all ten places, and the
 * tension stops being "where could it possibly be" and becomes "which of the
 * ten, and can I get there and back". Random placement would make every night
 * the same search.
 *
 * `lock` names a puzzle in puzzles.js, or null for a site that is guarded by
 * where it is rather than by a lock.
 */
function flagSites(houses) {
  const byNumber = (n) => houses.find((h) => h.number === n);
  const p = PLAN.park;
  const sites = [];

  const abandoned = byNumber(ABANDONED_NUMBER);
  sites.push({
    id: 'abandoned', lock: 'mirror', houseId: abandoned.id,
    x: abandoned.x - 2.2, y: 0.9, z: abandoned.sign * (PLAN.frontZ + 3.5),
    inside: abandoned.id,
    label: 'הבית הנטוש',
    hint: 'בתוך הבית שאף אחד לא גר בו. הדלת האחורית נעולה בקוד.',
  });

  const garage = byNumber(4);
  const G = garage.garage;
  sites.push({
    id: 'garage', lock: null, houseId: garage.id,
    x: G.x, y: G.roof + 0.3, z: (G.z0 + G.z1) / 2,
    climb: true,
    label: 'גג המוסך',
    hint: 'על גג המוסך. יש ארגזים בצד, ומהם אפשר לעלות.',
  });

  const pitHouse = byNumber(10);
  sites.push({
    id: 'pit', lock: null, houseId: pitHouse.id,
    /*
     * On the side away from the garage. Somebody dug a hole in the lawn; a
     * hole through the middle of their own concrete drive is a different
     * story, and worse, the drive is a slab in the collision world — it lies
     * across the hole and fills it in, which leaves the flag under solid
     * ground with no way to reach it.
     */
    x: pitHouse.x - pitHouse.garageSide * 3.4, y: -0.9,
    z: pitHouse.sign * (PLAN.frontZ - 6.4),
    crouch: true,
    label: 'הבור בדשא',
    hint: 'בבור שמישהו חפר בדשא הקדמי ולא כיסה.',
  });

  const mail = byNumber(9);
  sites.push({
    id: 'mailbox', lock: 'code', houseId: mail.id,
    x: mail.x + mail.garageSide * (mail.w / 2 - 1.8), y: 1.05,
    z: mail.sign * (PLAN.roadHalf + PLAN.pave + 0.8),
    label: 'תיבת הדואר הנעולה',
    hint: 'בתיבת דואר עם מנעול ספרות.',
  });

  sites.push({
    id: 'tree', lock: null,
    x: p.x0 + 3, y: 2.4, z: p.z0 + 5,
    climb: true,
    label: 'העץ הגדול בגן',
    hint: 'על ענף של העץ הגדול בגן. אפשר לעלות מהספסל.',
  });

  const carHouse = byNumber(6);
  sites.push({
    id: 'car', lock: 'gnomes', houseId: carHouse.id,
    x: carHouse.x + carHouse.garageSide * (carHouse.w / 2 - 1.8), y: 1.0,
    z: carHouse.sign * (PLAN.frontZ - 4.2),
    label: 'המכונית הנעולה',
    hint: 'במושב האחורי של מכונית נעולה.',
  });

  sites.push({
    id: 'fountain', lock: null,
    x: (p.x0 + p.x1) / 2, y: 0.35, z: (p.z0 + p.z1) / 2 - 2 + 2.4,
    crouch: true,
    label: 'מתחת למזרקה',
    hint: 'מתחת לשפה של המזרקה בגן. צריך להתכופף.',
  });

  const binHouse = byNumber(2);
  sites.push({
    id: 'bin', lock: null, houseId: binHouse.id,
    x: binHouse.x, y: 0.7, z: binHouse.sign * (PLAN.roadHalf + PLAN.pave + 0.5),
    loud: true,
    label: 'בתוך פח האשפה',
    hint: 'בתוך פח על המדרכה. הפח יעשה רעש.',
  });

  const fenceHouse = byNumber(3);
  sites.push({
    id: 'fence', lock: 'sound', houseId: fenceHouse.id,
    x: fenceHouse.x - 2, y: 1.4, z: fenceHouse.sign * (PLAN.frontZ + fenceHouse.d + 5.2),
    label: 'הגדר האחורית',
    hint: 'תלוי על הגדר האחורית, מאחורי הבית עם תיבות הנגינה.',
  });

  const dogHouse = houses.find((h) => h.dog) || byNumber(1);
  sites.push({
    id: 'doghouse', lock: null, houseId: dogHouse.id,
    x: dogHouse.x + 3, y: 0.5, z: dogHouse.sign * (PLAN.frontZ + dogHouse.d + 3.5),
    crouch: true, loud: true,
    label: 'בתוך המלונה',
    hint: 'בתוך המלונה של הכלב. כן, באמת.',
  });

  return sites;
}

/*
 * Which site tonight.
 *
 * The whole seven-night schedule is drawn at once, from the save seed alone,
 * and then indexed by night. Drawing it per night would be simpler and would
 * be wrong twice over: the same site could come up three nights running, and
 * the puzzles could go the whole game without ever being the thing in the way.
 *
 * The shape of the schedule is the difficulty curve. Night one is the closest
 * site you can walk to and pick up — no climb, no crouch, no lock — because a
 * first night that opens with a padlock teaches the player that the game is
 * unfair rather than that it is tense. Nights three and four are locked, in
 * increasing order of how much the lock asks of you. After that it is
 * whatever is left, and by then "whatever is left" is the far side of the
 * neighbourhood.
 */
function siteSchedule(sites, houses, seed) {
  const home = homeOf(houses);
  const dist = (s) => Math.hypot(s.x - home.x, s.z - home.frontZ);
  const deck = rngFrom(((seed | 0) ^ 0x5bf03635) | 0).shuffle(sites);
  const used = new Set();
  const take = (pred) => {
    const found = deck.find((s) => !used.has(s.id) && pred(s));
    if (found) used.add(found.id);
    return found;
  };

  const plan = [];
  /*
   * 1 — the nearest unlocked site, ranked by how much it asks of you before
   * distance is even considered. Every one of the ten sites asks for
   * something; crouching under a fountain is the cheapest thing to be asked
   * on a first night, waking a dog is the dearest, and there is no site that
   * asks for nothing — which is the point of the first night.
   */
  const cost = (s) => (s.loud ? 4 : 0) + (s.climb ? 2 : 0) + (s.crouch ? 1 : 0);
  const easy = sites
    .filter((s) => !s.lock)
    .sort((a, b) => (cost(a) - cost(b)) || (dist(a) - dist(b)))[0] || sites[0];
  used.add(easy.id);
  plan.push(easy);
  /* 2 — still no lock, but now it is across the street or up something. */
  plan.push(take((s) => !s.lock) || take(() => true));
  /* 3, 4 — the locks, easiest first: the mailbox is arithmetic you can do
   * standing in front of the answer; everything else needs a second trip. */
  const lockOrder = ['code', 'sound', 'gnomes', 'mirror'];
  for (const want of [0, 1]) {
    const picked = lockOrder
      .map((l) => sites.find((s) => s.lock === l && !used.has(s.id)))
      .filter(Boolean)[want === 0 ? 0 : 0];
    if (picked) { used.add(picked.id); plan.push(picked); }
    else plan.push(take(() => true));
  }
  /* 5, 6, 7 — whatever is left, furthest last. */
  const rest = deck.filter((s) => !used.has(s.id)).sort((a, b) => dist(a) - dist(b));
  while (plan.length < 7) plan.push(rest.pop() || deck[plan.length % deck.length]);
  return plan;
}

function chooseSite(sites, houses, seed, night) {
  const plan = siteSchedule(sites, houses, seed);
  return plan[Math.min(Math.max(night, 1), 7) - 1];
}

/* ------------------------------------------------------------------ *
 * Puzzles
 *
 * The answers are generated here, from things that are visible in the world,
 * and the clue text says how to get from the visible thing to the answer.
 * That is the whole contract: a puzzle whose answer is not derivable from
 * something you can walk up to and look at is a guessing game.
 * ------------------------------------------------------------------ */

function buildPuzzles(houses, sites, rng) {
  const byNumber = (n) => houses.find((h) => h.number === n);

  /* The mailbox: arithmetic on the house number, which is stamped on the box
   * you are standing in front of and painted over the door behind it. */
  const mailHouse = byNumber(9);
  const codeAnswer = String((mailHouse.number - 3) * 2);

  /*
   * The padlock on the abandoned house. Four digits, written on the inside of
   * the kitchen window in something that has been there a long time — so from
   * outside you read it backwards, and the only way to see it the right way
   * round is the wardrobe mirror leaning on the back fence.
   */
  const digits = [];
  for (let i = 0; i < 4; i++) digits.push(rng.irange(1, 9));
  const mirrorAnswer = digits.join('');

  /*
   * The gnomes. Four of them, each with an age on the base, to be stood in
   * order. The ages are on little brass plates you can only read close up,
   * which is the risk: they are in a front garden under a street lamp.
   */
  const ages = rng.shuffle([4, 11, 27, 63]);
  const gnomeNames = ['הגמד עם הדלי', 'הגמד עם החכה', 'הגמד הישן', 'הגמד עם הפנס'];
  const gnomes = ages.map((age, i) => ({ id: i, name: gnomeNames[i], age }));
  const gnomeAnswer = gnomes.slice().sort((a, b) => a.age - b.age).map((g) => g.id);

  /*
   * The music boxes. Three of them; one plays in the same key as the whistle.
   * The whistle's root moves by night, so the answer does too, and the only
   * way to know it is to have stood still and listened to her — which costs
   * time you do not have. That is the trade the puzzle is about.
   */
  const soundAnswer = rng.int(3);
  const soundNotes = [0, 0, 0].map((_, i) => (i === soundAnswer ? 0 : rng.pick([-3, -1, 2, 5])));

  return {
    code: {
      id: 'code',
      title: 'המנעול על תיבת הדואר',
      note: `על התיבה חרוט: "המספר של הבית שלי, פחות 3, כפול 2".`,
      kind: 'keypad',
      answer: codeAnswer,
      digits: codeAnswer.length,
      houseNumber: mailHouse.number,
      solved: false,
    },
    mirror: {
      id: 'mirror',
      title: 'המנעול על הדלת האחורית',
      note: 'ארבע ספרות. מישהו כתב אותן על החלון מבפנים.',
      kind: 'keypad',
      answer: mirrorAnswer,
      digits: 4,
      /* What the window shows from outside: the same digits, reversed. */
      windowText: mirrorAnswer.split('').reverse().join(''),
      solved: false,
    },
    gnomes: {
      id: 'gnomes',
      title: 'ארבעת הגמדים',
      note: 'מהצעיר לזקן. הגילים חרוטים על הבסיסים.',
      kind: 'order',
      items: gnomes,
      answer: gnomeAnswer,
      solved: false,
    },
    sound: {
      id: 'sound',
      title: 'שלוש תיבות נגינה',
      note: 'אחת מהן מנגנת באותו סולם כמו השריקה.',
      kind: 'choice',
      options: soundNotes.map((semi, i) => ({ id: i, semitone: semi })),
      answer: soundAnswer,
      solved: false,
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
