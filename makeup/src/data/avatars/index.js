/*
 * avatars/index.js — the photographs the counter has faces for.
 *
 * This file is a list and nothing else. Each entry is written by
 *
 *   node tools/makeup-avatar.mjs add <photo.jpg>
 *
 * which drops a module next to this one and adds the two lines that bring it
 * in: an import at the top, and its name in the array. Adding a face by hand is
 * the same two lines — there is no registration step and no manifest to keep in
 * step with the directory.
 *
 * An avatar module exports one object:
 *
 *   id          stable, and the seed the customer is generated from, so the
 *               same photograph is the same person every time
 *   name        what she is called at the counter, in Hebrew
 *   width       the photograph's pixel size, used to make the tilt a rotation
 *   height      rather than a shear
 *   image       a data: URL — the photograph itself, so a single-file build is
 *               still a single file
 *   landmarks   the twenty marks of `portrait/frame.js`, in 0..1 image space
 *   outline     optional, a traced face outline; without it the shape is
 *               implied from the marks
 *   credit      optional, where the picture came from
 *
 * A word about what goes in here, because it is the one part of this repository
 * that is a picture of a person: anything committed to this directory is
 * readable by anybody who can read the repository, and it stays in the history
 * after it is deleted. Only photographs you own or have permission for.
 */

export const PHOTOS = [];
