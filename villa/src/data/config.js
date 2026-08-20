/*
 * config.js — every number the game is balanced on, in one file.
 *
 * Nothing else in this codebase hard-codes a tunable. The three engine ports
 * under villa/ports/ carry copies of this table, and the headless test asserts
 * the ones the spec fixed — fifteen rounds, two calls, five minutes — so a
 * change here that breaks one of them is caught rather than discovered.
 *
 * Times are in seconds. Rates are "fraction of an opening's integrity per
 * second, per attacker", so 0.055 means a bare opening with one thing working
 * on it gives out in about eighteen seconds.
 */

export const GAME_CONFIG = {
  /* ---------------------------------------------------------- the run */
  NIGHTS_TOTAL: 7,

  /* Nights get longer as well as harder. A longer night is not padding: the
   * neighbour's five minutes is a fixed 300, so the fraction of the night he
   * can cover shrinks from "all of it" to about two thirds, without changing
   * the number the spec fixed. */
  NIGHT_SECONDS_BASE: 210,
  NIGHT_SECONDS_PER_NIGHT: 45,

  /* ------------------------------------------------------------- the gun */
  /* Dawn sets ammo TO this. It does not add it. A player who spent nothing
   * last night starts today on fifteen, exactly like one who spent it all —
   * hoarding across nights is the one thing that would break the ceiling. */
  GUN_AMMO_PER_DAY: 15,
  GUN_RELOADS_EACH_DAY: true,
  GUN_SHOT_SECONDS: 2,          // what a shot costs
  GUN_STAGGER_SECONDS: 4.5,     // how long a hit threat stops working
  GUN_REPEL_CHANCE: 0.34,       // chance it gives up the opening entirely
  GUN_INTRUDER_HITS: 2,         // shots to drive something back out of the house

  /* --------------------------------------------------------- barricades */
  /* Multipliers on the breach rate. Tape is fast and weak and wears through;
   * boards are slow and strong and cost nails. Both are multiplicative, with
   * a floor so that no stack is ever literally impenetrable. */
  /*
   * Set from the sustain arithmetic rather than by feel. One person repairing
   * pushes back about 0.021 of an opening per second once walking between
   * rooms is counted; night six throws 6 x 0.0281 = 0.169 per second at the
   * house. For the player to be able to hold it, the barricade multiplier has
   * to bring that under the repair rate — which means about 0.12 or better.
   *
   * A first board at 0.30 (the first guess) gives 0.051 and loses; at 0.20 it
   * gives 0.034 and a roll of tape over it gives 0.017, so a boarded and taped
   * opening is holdable and a boarded one alone is not quite. That is exactly
   * the decision the game wants to be about, and it is why boards are strong
   * here: a bare opening on night seven is thirty-four seconds and a boarded
   * one is nearly three minutes.
   */
  TAPE_MUL: [1.0, 0.50, 0.38],
  PLANK_MUL: [1.0, 0.20, 0.10, 0.06],
  BARRICADE_MIN_MUL: 0.04,
  TAPE_MAX: 2,
  PLANK_MAX: 3,

  /*
   * What an action costs in game seconds. These are the night figures, and
   * they are set so that a night is playable rather than watchable: a board
   * goes up in twenty seconds, during which a doubled-up opening gains about
   * a quarter and the board takes its rate down by half, so intervening is
   * clearly worth it. An earlier pass had a board at forty-five seconds and
   * the arithmetic came out the other way — nothing done during a night could
   * outrun what the night did back, which made the whole phase a spectator
   * sport and put the entire game in the afternoon.
   */
  TAPE_SECONDS: 10,
  PLANK_SECONDS: 20,
  REPAIR_SECONDS: 12,
  SEARCH_SECONDS: 15,
  MOVE_SECONDS: 8,
  GATHER_SECONDS: 8,
  CALL_SECONDS: 8,
  WAIT_SECONDS: 10,

  NAILS_PER_PLANK: 2,
  /* A shove is worth half an opening, and it takes twenty-five seconds. That
   * is a losing trade on a bare door — the attacker takes more back than that
   * while your shoulder is against it — and a winning one behind boards, which
   * is the rule the whole barricade economy rests on: repair what you have
   * boarded, board what you have not. */
  REPAIR_AMOUNT: 0.5,
  PLANK_REBUILD_INTEGRITY: 0.65,// where a boarded-up breach restarts

  /* Wear. Tape erodes under attack and snaps; a board takes much longer but
   * eventually pops off too, which is what stops night 7 from being solved
   * once at dusk and then watched. */
  /* Tape is the only barricade that wears out on its own — see the note in
   * sim/barricade.js for why boards deliberately do not. PLANK_HP is kept
   * because a board still carries a condition the interface shows, and because
   * an expansion that wants brittle boards should have one number to change. */
  TAPE_HP: 120,
  TAPE_WEAR_PER_SEC: 2.2,       // about fifty-five seconds under one attacker
  PLANK_HP: 220,
  PLANK_WEAR_PER_SEC: 0,

  /* ---------------------------------------------------------- pressure */
  /* Tuned against the reference policy in tools/villa-sim.mjs rather than
   * guessed. At this rate a bare opening on night one gives way in about
   * forty-eight seconds and a double-boarded one outlasts the night; by night
   * seven the same bare opening lasts twenty-two seconds and two boards buy
   * just over two minutes, which is the difference between a house you can
   * seal and a house you can only triage. */
  BREACH_RATE_BASE: 0.021,
  /*
   * Gentle on purpose. Threat *count* already rises from one to six across the
   * week, so a rate that also compounded at 1.14 multiplied the two together
   * and gave night seven thirteen times night one's pressure — against a
   * player whose hands work at exactly the same speed on both. Every test run
   * hit a wall at night five and no supply table moved it, because the ceiling
   * was throughput and not timber. At 1.06 the count carries the curve and the
   * rate only sharpens it.
   */
  BREACH_RATE_GROWTH: 1.06,
  THREAT_APPROACH_MIN: 6,       // seconds between choosing an opening and working on it
  THREAT_APPROACH_MAX: 18,
  THREAT_RETARGET_SECONDS: 8,

  /* How a threat picks an opening: how far along it already is, against how
   * many other things are already working on it. Both matter. Weighted heavily
   * towards damage, everything piles onto the first opening that slips and the
   * player — who can only be in one room — watches a death spiral they cannot
   * outrun. Weighted the other way, pressure spreads evenly, nothing ever
   * quite breaks, and the night has no shape. */
  TARGET_INTEGRITY_WEIGHT: 2.0,
  TARGET_BUSY_WEIGHT: 0.9,

  /* --------------------------------------------------------- the breach */
  /* A breach is not instant death. Something comes through it after a delay,
   * moves through the house towards you, and only then can catch you — which
   * is what gives the gun a second job and a breach a countdown you can act on. */
  /* Ten seconds in the room with you, which is two shots or one walk out of
   * the door — deliberately enough time to do exactly one thing about it. At
   * four seconds it was neither: a single shot did not clear a room with two
   * things in it, and leaving took longer than the timer allowed. */
  INTRUDER_DELAY: 8,
  INTRUDER_STEP_SECONDS: 6,     // one room per this many seconds
  CAUGHT_SECONDS: 10,
  INTRUDER_REPEL_SECONDS: 10,

  /* ------------------------------------------------------ danger meter */
  /*
   * The meter is a net rate, not a ratchet: decay is subtracted every second,
   * always, and what is wrong with the house is added on top. An earlier
   * version only decayed when absolutely nothing was wrong, which meant one
   * opening sitting at 0.81 stopped recovery dead — and by night five, where
   * something is always at 0.81, the meter simply climbed all night and became
   * the only loss condition that ever fired.
   *
   * As tuned: one breach nets +1.0/s, so a single hole is a problem with about
   * a hundred seconds on it — time to cross the house and board it, and not
   * time to ignore it. Two net +4.0/s and give twenty-five; three net +7.0/s
   * and give fourteen, by which point the count above has usually ended it
   * anyway. The curve is deliberately convex: one is trouble, two is an
   * emergency, three is over. Four openings
   * merely near breaching net slightly negative and the meter drifts down —
   * being in trouble is not the same as losing. Eight of them net +1.6/s,
   * which is a house coming apart, and it should be.
   */
  DANGER_MAX: 100,
  DANGER_PER_BREACH: 3.0,       // per second, per breached opening
  DANGER_PER_CRITICAL: 0.45,    // per second, per opening past CRITICAL_AT
  DANGER_DECAY: 2.0,            // per second, always
  CRITICAL_AT: 0.8,

  /* -------------------------------------------------------- losing it */
  /* Every grace here is set from what the answer to it actually costs. Closing
   * a breach is a board — twenty seconds — plus up to two rooms of walking, so
   * forty-five is time to cross the house and do it, and twenty-five (the
   * first guess) was less than the repair it was demanding. */
  /*
   * "Too many openings breached" is a fraction of the house, not a fixed
   * count. A flat three works on night one, where the villa has four openings
   * and losing three of them plainly is the end; on night seven it means the
   * player must hold all fifteen simultaneously, which no amount of timber
   * makes possible, and it was the single thing capping every test run at
   * night five. A third of the house, minimum three:
   *
   *     night   1  2  3  4  5  6  7
   *     limit   3  3  3  3  4  4  5
   *
   * The late nights become what they should be — the house is being opened
   * faster than one person can close it, and the game is how long you keep up.
   */
  BREACH_LIMIT_MIN: 3,
  BREACH_LIMIT_FRACTION: 0.3,
  MAIN_BREACH_GRACE: 45,        // a main door or window, breached and ignored
  DEFENSELESS_GRACE: 20,
  DEFENSELESS_AT: 0.75,         // an opening this far gone makes "no defence" fatal

  /* -------------------------------------------------------- the neighbour */
  NEIGHBOR_CALLS_TOTAL: 2,
  NEIGHBOR_HELP_SECONDS: 300,   // five minutes, capped at whatever is left of the night
  NEIGHBOR_TRAVEL_SECONDS: 20,  // he is not a panic button
  NEIGHBOR_WARN_SECONDS: 45,    // "he is leaving soon"
  NEIGHBOR_WORK_SECONDS: 12,    // per door, before he moves to the next one
  NEIGHBOR_MOVE_SECONDS: 4,
  NEIGHBOR_RELIEF_RATE: 0.06,   // integrity he pulls back per second on his door
  PHONE_LOCATION: 'entrance',
  NEIGHBOR_NUMBER_LOCATION: 'bedroom_drawer',
  NEIGHBOR_CAN_HELP_WITH: 'doors',

  /* ------------------------------------------------------- the drawer */
  DRAWER_SEARCHES: 3,           // searches of the bedroom drawer before the number turns up

  /* ------------------------------------------- hidden openings */
  HIDDEN_SELF_REVEAL: 15,       // seconds of being worked on before it gives itself away
  /* Something squeezing through a crack it has not been caught at yet works
   * more quietly, and more slowly, than something with its shoulder against a
   * door. Without this the hidden openings are unanswerable rather than
   * urgent: the hint gives twelve seconds' warning, crossing the house and
   * searching takes about forty, and a bare opening on night three gives way
   * in thirty-seven — so the race was lost before it started. Halving the rate
   * until it is found turns that into a race the player can win by moving. */
  HIDDEN_UNFOUND_MUL: 0.5,
  HIDDEN_PERSIST_CHANCE: 0.5,   // chance one carries over into the next night
  HIDDEN_HINT_LEAD: 20,         // noise this long before it wakes up

  /* ------------------------------------------------------------ supply */
  /* Deliberately short of full coverage from night four on. Whatever is not
   * carried out of the equipment room stays there; whatever is carried and not
   * used stays in the pack. Nails are the bottleneck, on purpose. */
  /*
   * Nails are the budget; boards are deliberately in surplus. The real number
   * is NAILS / 2 — how many boards can actually go up — against that night's
   * opening count:
   *
   *     night        1   2   3   4   5   6   7
   *     openings     4   6   8   9  11  13  15
   *     boardable    6  10  13  15  17  20  22
   *     boards each 1.5 1.6 1.6 1.6 1.5 1.5 1.4
   *
   * Read the last row rather than the second: what matters is not whether
   * every opening gets *a* board but whether the ones under attack get a
   * *second* one, because one board only takes the breach rate to 0.30 and two
   * take it to 0.16 — and 0.30 across six simultaneous threats is more damage
   * than one person can repair, while 0.16 is less. The budget is set so that
   * roughly half the house can be doubled up and the player has to choose
   * which half.
   *
   * The first three nights can be sealed completely, which is what makes them
   * the tutorial: the player learns what a fully prepared house feels like
   * before the game starts taking it away. From night four the gap opens by
   * one a night and never closes, so every later evening is a triage decision
   * about which openings get boards, which get tape, and which get watched.
   *
   * Note that "sealed" is only ever true of the doors and windows. The hidden
   * openings are not visible at dusk, so even on night three part of that nail
   * budget has to survive until whatever wakes up in the walls is found.
   *
   * Surplus timber matters for a second reason: a breach can only be closed
   * with a board, so keeping two nails back is the difference between
   * recovering from one and losing the run to it.
   */
  SUPPLY_TAPE:   [ 4,  6,  8, 10, 12, 14, 16],
  SUPPLY_PLANKS: [ 8, 12, 15, 17, 19, 22, 24],
  SUPPLY_NAILS:  [12, 20, 26, 30, 34, 40, 44],

  /* -------------------------------------------------------------- time */
  /* Preparation is on a clock too, so that "search the drawer" and "board the
   * kitchen door" compete for the same afternoon. Work goes a little faster in
   * daylight — you are not stopping to listen every few seconds — which is all
   * DAY_ACTION_SCALE is.
   *
   * The two together are the real curve. Putting up night one's whole supply
   * takes about 190 of the 300 seconds, leaving room to go through the drawer
   * as well; night seven's takes about 310, so the last evenings cannot be
   * fully prepared for and have to be triaged before dark. */
  /* The afternoon grows with the house — there is more of it to board every
   * day, and a fixed afternoon would mean the later nights were decided by how
   * much could physically be reached before dark rather than by any decision.
   * It still never quite covers night seven's whole supply. */
  DAY_PREP_SECONDS_BASE: 240,
  DAY_PREP_SECONDS_PER_NIGHT: 40,
  DAY_ACTION_SCALE: 0.8,

  TICK_MAX: 0.25,               // largest dt the sim will integrate in one go
};

/* The spec fixed these three. They are asserted in tools/villa-sim.mjs rather
 * than trusted, because they are exactly the kind of number that drifts when
 * someone is tuning difficulty at two in the morning. */
export const FIXED_BY_SPEC = {
  NIGHTS_TOTAL: 7,
  GUN_AMMO_PER_DAY: 15,
  NEIGHBOR_CALLS_TOTAL: 2,
  NEIGHBOR_HELP_SECONDS: 300,
};

/* Openings, per night, from the two formulas the balance document derives.
 * Regular openings are the villa's own doors and windows; hidden ones are the
 * things that are not supposed to be there. */
export function regularCount(night) {
  return night + 3;                      //  4  5  6  7  8  9 10
}

export function hiddenCount(night) {
  return Math.round(0.8 * (night - 1));  //  0  1  2  2  3  4  5
}

export function threatCount(night) {
  return Math.round(1 + 0.9 * (night - 1)); // 1  2  3  4  5  6  6
}

export function breachRate(night) {
  return GAME_CONFIG.BREACH_RATE_BASE
    * Math.pow(GAME_CONFIG.BREACH_RATE_GROWTH, night - 1);
}

/* How many openings may stand open at once before the house stops being one.
 * Scales with the villa, for the reason set out beside BREACH_LIMIT_FRACTION. */
export function breachLimit(night) {
  return Math.max(
    GAME_CONFIG.BREACH_LIMIT_MIN,
    Math.ceil((regularCount(night) + hiddenCount(night)) * GAME_CONFIG.BREACH_LIMIT_FRACTION),
  );
}

export function nightSeconds(night) {
  return GAME_CONFIG.NIGHT_SECONDS_BASE
    + GAME_CONFIG.NIGHT_SECONDS_PER_NIGHT * (night - 1);
}

export function daySeconds(night) {
  return GAME_CONFIG.DAY_PREP_SECONDS_BASE
    + GAME_CONFIG.DAY_PREP_SECONDS_PER_NIGHT * (night - 1);
}
