/*
 * heads/index.js — the modelled heads the counter can serve.
 *
 * A list, like avatars/index.js next door, and written the same way:
 *
 *   node tools/makeup-head.mjs add <model.glb|model.obj>
 *
 * opens a page, you turn the head round and click twenty points on it, and it
 * writes a module here plus the two lines that bring it in.
 *
 * A head module exports one object, and it does not contain the file you
 * imported. It contains the *result* of importing it: positions already in head
 * space, texture coordinates already in face space, packed as base64 typed
 * arrays. The fitting and the unwrap happen once, in the tool. What the game
 * does at boot is decode three arrays and compute normals.
 *
 *   id             stable, and the seed a customer is generated from
 *   name           what she is called at the counter
 *   credit         the model's author and licence — see below
 *   provides       which of the game's own parts the model already has, out of
 *                  'ears', 'hair', 'neck'; the game skips building those
 *   vertexCount    what the packed arrays hold
 *   triangleCount
 *   eyeL/eyeR      pupil centres in head space, from the marks
 *   eyeRadius      scaled from the marked eye width
 *   focus          where the camera looks for face, eyes and lips
 *   fit            how well the marks fitted — residual, folds, seam splits
 *   pos/uv/idx     the geometry
 *
 * On licences, because this is the one directory in the repository that holds
 * somebody else's work: almost every model worth importing is Creative Commons
 * Attribution, which is free to use and *requires* the credit to be shown.
 * `credit` is displayed in the game, so filling it in is not paperwork — it is
 * the condition on which the model may be here at all. A model whose licence
 * does not permit use in a game does not go in this directory, whatever its
 * download button says.
 */

export const HEADS = [];
