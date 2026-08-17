/**
 * Where the two halves of the app live.
 *
 * Served as files, they are two pages. Bundled into one HTML file there are no
 * pages left, only a hash — so the single-file entry point overwrites these two
 * values before anything mounts, and every generated link follows.
 *
 * Links written directly in the markup are rewritten by tools/build-single.mjs.
 * This object is only for the ones JavaScript builds.
 */
export const ROUTES = {
  site: 'index.html',
  admin: 'admin.html',
}
