import { $, $$, on, lessMotion } from './dom.js';

/* The flicker, the swing and the breathing vignette are attached by adding
   one class. Somebody who asked for less motion never gets the class, so the
   keyframes are not merely shortened to nothing — they are never bound to an
   element at all. An arrhythmic flicker at .001ms is still a flicker, and
   photosensitivity is the reason this is a hard gate rather than a nicety. */
function bindHouseLights() {
  const apply = () => document.documentElement.classList.toggle('is-lit', !lessMotion.matches);
  apply();
  on(lessMotion, 'change', apply);
}

function bindReveal() {
  const targets = $$('[data-reveal]');
  if (!targets.length || !('IntersectionObserver' in window)) return;

  const counts = new Map();
  for (const el of targets) {
    const group = el.closest('section') || document.body;
    const n = counts.get(group) || 0;
    counts.set(group, n + 1);
    // Capped, so a long section does not end with an element that arrives a
    // second and a half after the one above it.
    el.style.setProperty('--delay', `${Math.min(n, 4) * 80}ms`);
    el.classList.add('reveal');
  }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });

  for (const el of targets) io.observe(el);
}

function bindScrollState() {
  const head = $('.head');
  const cue = $('#cue');
  if (!head) return;

  let queued = false;
  const read = () => {
    queued = false;
    const y = window.scrollY;
    head.classList.toggle('is-stuck', y > 80);
    if (cue) cue.classList.toggle('is-gone', y > 40);
  };

  read();
  on(window, 'scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(read);
  }, { passive: true });
}

export function initMotion() {
  bindHouseLights();
  bindScrollState();
  if (!lessMotion.matches) bindReveal();
}
