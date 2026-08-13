export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const on = (el, type, fn, opts) => el && el.addEventListener(type, fn, opts);

/* Asked once and shared, because three separate modules make the same decision
   from it and they must not disagree halfway down the page. */
export const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
