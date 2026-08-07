/*
 * demands.js — what a warm-up drill asks of a body, apart from injury.
 *
 * Every drill already carries `contraindications`, and those answer one
 * question: does this hurt a part that is already hurt. They say nothing about
 * the demands that decide whether a drill belongs in a particular person's
 * warm-up when nothing at all is wrong with them — whether it leaves the ground,
 * whether it needs getting down to the floor and back up, whether it hangs
 * bodyweight from two hands.
 *
 * That gap was why the warm-up came out identical from 12 to 90. The filter had
 * only injuries to work with, and a healthy 78-year-old ticks no boxes, so they
 * were handed the same four lines as a healthy 25-year-old — opening with
 * marching, then a floor drill, then another floor drill.
 *
 *   impact     the drill leaves the ground; landing is a deceleration
 *   floor      needs getting down to the floor and back up again
 *   deep_knee  needs full knee flexion under bodyweight, and getting out of it
 *   hang       hangs bodyweight from the hands
 *   balance    stands on one leg with nothing to hold
 *
 * A drill with no entry demands none of these: it is done standing, or leaning
 * on a wall, and anybody who can walk into the session can do it. That is the
 * common case, so the table lists only the exceptions — and validate.js checks
 * that every warm-up drill is either listed here or deliberately not, so a drill
 * added later cannot inherit "standing, safe for everyone" by being forgotten.
 */

export const DEMANDS = {
  /* Leaves the ground. */
  pogo_hop: ['impact'],
  jumping_jack: ['impact'],
  jog: ['impact'],
  high_knees: ['impact'],

  /* Lying, kneeling or on all fours — the floor is the starting position. */
  prone_w_raise: ['floor'],
  prone_ytw_raise: ['floor'],
  prone_lat_pull_slide: ['floor'],
  bird_dog: ['floor'],
  dead_bug: ['floor'],
  cat_cow: ['floor'],
  thoracic_rotation: ['floor'],
  quadruped_scap_pushup: ['floor'],
  scap_pushup: ['floor'],
  wrist_prep: ['floor'],
  glute_bridge: ['floor'],
  glute_bridge_activation: ['floor'],
  hip_switch_90_90: ['floor'],
  childs_pose_reach: ['floor', 'deep_knee'],
  hip_flexor_stretch_kneeling: ['floor'],
  worlds_greatest_stretch: ['floor'],

  /* Full knee flexion under bodyweight, and standing back up out of it. */
  deep_squat_hold: ['deep_knee'],

  /* Bodyweight through the hands. */
  dead_hang: ['hang'],
  passive_bar_hang: ['hang'],
  scap_pull: ['hang'],

  /* One leg, nothing to hold. The leg swings are not here on purpose: their
   * own cues put a hand on the wall, which is what makes them not this. */
  toy_soldier: ['balance'],
  standing_knee_to_elbow: ['balance'],
};

/*
 * Drills confirmed to demand nothing beyond standing up.
 *
 * Listed rather than inferred from absence, so that "this drill needs nothing"
 * is a statement somebody made, not the default a new drill falls into by
 * nobody having looked at it.
 */
export const PLAIN_STANDING = [
  'wall_slide', 'arm_circles', 'db_scaption_raise', 'wall_angel', 'band_pull_apart',
  'sit_to_stand', 'hip_hinge_drill', 'band_pull_through', 'tibialis_raise',
  'march_in_place', 'shoulder_circles', 'torso_twist_standing', 'hip_circles',
  'leg_swings_front', 'leg_swings_side', 'ankle_rocks', 'band_dislocates',
  'band_scap_pulldown',
];

/** What a drill demands. Unknown ids return an empty list, same as a plain one. */
export function demandsOf(id) {
  return DEMANDS[id] || [];
}

/** True when the drill asks for any of the given demands. */
export function asks(id, ...what) {
  const d = demandsOf(id);
  return what.some((w) => d.indexOf(w) >= 0);
}
