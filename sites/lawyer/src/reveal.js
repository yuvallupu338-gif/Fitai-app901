import { $$, calmly } from './dom.js';

const STEP = 70;   /* ms between siblings; four steps is the whole stagger */

/* The class is added here rather than in the HTML so that a page without
 * JavaScript never has anything sitting at opacity 0 with nothing left to
 * change it. */
export function reveal() {
  const targets = $$('[data-reveal]');
  if (!targets.length || calmly() || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  }, { threshold: 0.06, rootMargin: '0px 0px -6% 0px' });

  for (const el of targets) {
    const step = Math.min(Number(el.dataset.reveal) || 0, 4);
    el.style.setProperty('--delay', `${step * STEP}ms`);
    el.classList.add('reveal');
    io.observe(el);
  }
}
