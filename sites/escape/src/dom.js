/* dom.js — the four helpers every other module here would otherwise redefine. */

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');

/* Asked at call time rather than cached at load: someone can turn the setting
   on halfway down the page, and the next hover should already respect it. */
export const reduced = () => motionQuery.matches;

export const onMotionChange = (fn) => motionQuery.addEventListener('change', fn);
