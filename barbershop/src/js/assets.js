/**
 * Photograph lookup.
 *
 * In the served build a photograph is a file on disk and this is a thin path
 * helper. In the single-file build tools/build-single.mjs replaces the map below
 * with base64 data URIs, and the same call sites keep working without knowing
 * which build they are in.
 */

/** Replaced wholesale by the single-file build. Do not add entries by hand. */
export const INLINE_PHOTOS = {}

export function photoSrc(name) {
  return INLINE_PHOTOS[name] ?? `assets/img/${name}.jpg`
}
