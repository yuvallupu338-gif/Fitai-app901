import { $$ } from './dom.js';

/* Both disclosure patterns on the page are the same object: a button that owns
 * a panel and reports its own state. The panels animate with 0fr → 1fr in CSS,
 * which leaves their text in the accessibility tree while collapsed — hence the
 * visibility flip that goes with it there. */
export function disclosures() {
  for (const btn of $$('.disc__btn, .acc__btn')) {
    const item = btn.closest('.disc, .acc__item');
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!item || !panel) continue;

    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      item.classList.toggle('is-open', !open);
    });
  }
}
