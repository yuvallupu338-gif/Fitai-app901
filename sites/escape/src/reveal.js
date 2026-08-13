/* reveal.js — scroll reveal, and the one count-up on the stat band.
 *
 * The .reveal class is added here rather than sitting in the HTML: it is what
 * makes an element start invisible, and a page whose content depends on JS to
 * become visible is a page that breaks badly the one time JS fails to run.
 */

import { qsa, reduced } from './dom.js';

export function initReveal() {
  const items = qsa('[data-reveal]');
  if (!items.length || !('IntersectionObserver' in window)) return;

  for (const el of items) el.classList.add('reveal');

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });

  for (const el of items) io.observe(el);
}

const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function initCounters() {
  const nums = qsa('[data-count]');
  if (!nums.length || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      count(entry.target);
    }
  }, { threshold: 0.4 });

  for (const el of nums) io.observe(el);
}

function count(el) {
  const to = Number(el.dataset.count);
  const suffix = el.dataset.suffix || '';
  /* Under reduced motion the number is already correct in the markup, so the
     honest thing is to leave it alone rather than animate it faster. */
  if (!Number.isFinite(to) || reduced()) return;

  const span = 1100;
  const started = performance.now();

  const frame = (now) => {
    const t = Math.min(1, (now - started) / span);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = group(Math.round(to * eased)) + suffix;
    if (t < 1) requestAnimationFrame(frame);
  };

  el.textContent = group(0) + suffix;
  requestAnimationFrame(frame);
}
