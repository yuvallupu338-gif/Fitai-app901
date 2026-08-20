/*
 * materials.js — the material table, and what each slot is for.
 *
 * Every surface in the neighbourhood is one of seventeen materials, baked once
 * per night into a single array texture. The slot index rides along in the
 * vertex data, which is why the entire street — road, kerb, twelve houses,
 * their roofs, every fence picket and every window — draws in one call.
 *
 * Seventeen is more slots than the sibling app uses, and the extra ones are
 * all earning their place:
 *
 *   - three sidings rather than one, because a row of identical houses reads
 *     as a corridor with a sky over it. Painting them by tint would not do it:
 *     the tint multiplies one baked texture, so all twelve houses would still
 *     have the same weather in the same places.
 *   - two glasses, dark and lit. A window is either a black hole or somebody
 *     is awake behind it, and which is which changes from night to night; two
 *     slots costs one extra bake and lets the mesher decide per window.
 *
 * Emissive is scaled per slot at scene time (see EMISSIVE), so the same baked
 * textures serve the day, where nothing glows, and the night, where the lit
 * windows and the flag are the only things that do.
 */

export const MAT = {
  GRASS: 0,
  ROAD: 1,
  PATH: 2,
  SIDING_A: 3,
  SIDING_B: 4,
  SIDING_C: 5,
  BRICK: 6,
  ROOF: 7,
  WOOD: 8,
  GLASS: 9,
  GLASS_LIT: 10,
  LEAF: 11,
  BARK: 12,
  METAL: 13,
  CLOTH: 14,
  SKIN: 15,
  GLOW: 16,
  /*
   * Her eyes, and nothing else in the game. They are not the flag's red: the
   * design is milky and pupil-less, and sharing a slot with the flag would
   * have made the one red thing in the neighbourhood into three.
   */
  EYE: 17,
  /*
   * Two more dressing gowns. CLOTH stays hers alone — the whole design of her
   * silhouette is that it is not one of theirs — so the neighbours are dressed
   * out of these three, three looks across ten people. Ten figures in one colour standing in ten gardens reads as one
   * asset placed ten times, which is exactly what it is, and the eye says so
   * before it has finished counting them.
   */
  CLOTH_B: 18,
  CLOTH_C: 19,
  CLOTH_D: 20,
};

export const MAT_COUNT = 21;

/* The three house colours, in slot order, so the builder can pick a siding by
 * index and the map can colour a house to match what you will actually see. */
export const SIDING_SLOTS = [MAT.SIDING_A, MAT.SIDING_B, MAT.SIDING_C];
export const SIDING_COLORS = ['#d9d2bd', '#9fb2bb', '#b3bfa4'];

/*
 * Material definitions, in slot order. `tile` is metres per texture repeat —
 * UVs are authored in metres everywhere in this game, so this is the only
 * place that decides how big a brick is. Getting it wrong is the most common
 * way a procedural surface reads as wallpaper: brick at tile 4 gives bricks
 * the size of paving slabs and nobody can say why the house looks wrong.
 */
export function materialDefs(seed) {
  const s = (n) => (seed | 0) + n * 977;
  return [
    /* 0 GRASS — the largest surface in the game by a wide margin. */
    {
      kind: 'grass', color: '#4e6a37', tile: 3.6, bump: 1.6, seed: s(0),
      stripes: 4, roughMul: 1, specular: 0.06, normalStrength: 1.1,
    },
    /* 1 ROAD */
    {
      kind: 'asphalt', color: '#33353a', tile: 3.2, bump: 1.1, seed: s(1),
      line: 0, specular: 0.22, roughMul: 0.95,
    },
    /* 2 PATH — pavement, driveways, the front path, the kerb. */
    {
      kind: 'concrete', color: '#9a978f', tile: 2.8, bump: 0.9, seed: s(2),
      slabs: 2, specular: 0.18,
    },
    /* 3,4,5 SIDING — clapboard, three colours. The board count is per metre
     * of texture, so all three agree about how wide a board is. */
    {
      kind: 'siding', color: SIDING_COLORS[0], tile: 2.0, bump: 1.35, seed: s(3),
      boards: 8, specular: 0.14, normalStrength: 1.15,
    },
    {
      kind: 'siding', color: SIDING_COLORS[1], tile: 2.0, bump: 1.35, seed: s(4),
      boards: 8, specular: 0.14, normalStrength: 1.15,
    },
    {
      kind: 'siding', color: SIDING_COLORS[2], tile: 2.0, bump: 1.35, seed: s(5),
      boards: 8, specular: 0.14, normalStrength: 1.15,
    },
    /* 6 BRICK — chimneys, the low garden walls, the fountain. */
    {
      kind: 'brick', color: '#8d5a48', tile: 2.0, bump: 1.5, seed: s(6),
      courses: 8, specular: 0.12,
    },
    /* 7 ROOF */
    {
      kind: 'shingle', color: '#4a4640', tile: 2.2, bump: 1.5, seed: s(7),
      courses: 7, specular: 0.1, normalStrength: 1.2,
    },
    /* 8 WOOD — the picket fences and the porch decking, painted white. It is
     * the single most-repeated small object in the frame, so its grain is at
     * a much finer tile than anything else. */
    {
      kind: 'wood', color: '#e6e3d8', tile: 0.9, bump: 1.0, seed: s(8),
      planks: 4, paint: 0.75, specular: 0.2,
    },
    /* 9 GLASS — a dark pane. Low roughness and high specular: at night the
     * only thing a window does is catch the street lamp. */
    {
      kind: 'glass', color: '#0f151b', tile: 1.4, bump: 0.5, seed: s(9),
      muntins: 2, lit: 0, specular: 1.6, roughMul: 0.18, normalStrength: 0.5,
    },
    /* 10 GLASS_LIT — somebody is awake. Warm, and pushed hard enough past 1.0
     * that the bloom grabs it, because a lit window at the end of a dark
     * street is the only landmark the player has. */
    {
      kind: 'glass', color: '#8a6a3c', tile: 1.4, bump: 0.5, seed: s(10),
      muntins: 2, lit: 1, specular: 1.0, roughMul: 0.3, emissive: 1,
      normalStrength: 0.5,
    },
    /* 11 LEAF — cut out. */
    {
      kind: 'foliage', color: '#3f5a30', tile: 1.1, bump: 1.2, seed: s(11),
      cutout: true, alphaCut: 0.42, specular: 0.12,
    },
    /* 12 BARK */
    { kind: 'bark', color: '#4b4136', tile: 1.2, bump: 1.8, seed: s(12), specular: 0.08 },
    /* 13 METAL — cars, mailboxes, bins, lamp posts. */
    {
      kind: 'metal', color: '#6d7278', tile: 1.6, bump: 0.7, seed: s(13),
      polish: 0.55, rust: 0.25, specular: 0.9, roughMul: 0.6,
    },
    /*
     * 14 CLOTH — her dress, and nothing else; the neighbours have 18 and 19.
     * The tile is deliberately tiny:
     * limb UVs are in metres, so a value near 1 stretches one repeat across a
     * whole body and the weave turns into vertical streaks that read as
     * varnished wood. 0.35 puts about three repeats across a shoulder.
     */
    {
      kind: 'cloth', color: '#b6ae98', tile: 0.35, bump: 1.1, seed: s(14),
      specular: 0.05, roughMul: 1, normalStrength: 0.9,
    },
    /*
     * 15 SKIN — hers, and the neighbours'. Far darker than a colour picker
     * suggests, for the reason the sibling app writes down: anything light
     * enough to read as skin in isolation comes back from the tonemap as pale
     * plaster under a sodium lamp, and the figure at the end of the street
     * turns into a shop mannequin.
     */
    {
      kind: 'skin', color: '#6d5c52', tile: 0.14, bump: 0.8, seed: s(15),
      specular: 0.14, roughMul: 1, normalStrength: 0.85,
    },
    /* 16 GLOW — the flag, and the glass of a street lamp. */
    {
      kind: 'glow', color: '#c0261f', tile: 1, bump: 0.1, seed: s(16),
      emissive: 1, specular: 0.3, roughMul: 0.5,
    },
    /*
     * 17 EYE — milky, no pupil, and only just emissive. Bright enough to be
     * the one thing that resolves at thirty metres in fog, dim enough that it
     * reads as an eye catching the light rather than as a lamp.
     */
    {
      kind: 'glow', color: '#d9d6cc', tile: 1, bump: 0.15, seed: s(17),
      emissive: 0.5, specular: 0.6, roughMul: 0.4,
    },
    /*
     * 18 and 19 — the neighbours' clothes. Same weave as hers at the same tiny
     * tile, because the tile is a fact about how limb UVs are measured rather
     * than a fact about the garment. The colours are chosen to separate under
     * a sodium lamp, which is a harder test than daylight: it collapses hue
     * and leaves only lightness, so these two are picked to sit either side of
     * her #b6ae98 in value rather than beside it in hue.
     */
    {
      kind: 'cloth', color: '#54606b', tile: 0.35, bump: 1.1, seed: s(18),
      specular: 0.05, roughMul: 1, normalStrength: 0.9,
    },
    {
      kind: 'cloth', color: '#8a6f5c', tile: 0.35, bump: 1.1, seed: s(19),
      specular: 0.05, roughMul: 1, normalStrength: 0.9,
    },
    {
      kind: 'cloth', color: '#7d8272', tile: 0.35, bump: 1.1, seed: s(20),
      specular: 0.05, roughMul: 1, normalStrength: 0.9,
    },
  ];
}

/*
 * How much each slot glows, by scene. In daylight nothing does — a lit window
 * at noon is a darker rectangle, not a brighter one, and leaving the night's
 * emissive on is what makes a daytime build look like a video game.
 */
export const EMISSIVE = {
  day: { [MAT.GLASS_LIT]: 0, [MAT.GLOW]: 0.15, [MAT.EYE]: 0.1 },
  night: { [MAT.GLASS_LIT]: 1.35, [MAT.GLOW]: 1, [MAT.EYE]: 0.5 },
};

/* What a footstep on this material sounds like. The audio module speaks in
 * these names; keeping the mapping here means the collision surface and the
 * sound can never disagree about what you are standing on. */
export const FOOTSTEP = {
  [MAT.GRASS]: 'grass',
  [MAT.ROAD]: 'road',
  [MAT.PATH]: 'path',
  [MAT.WOOD]: 'wood',
  [MAT.LEAF]: 'grass',
};
