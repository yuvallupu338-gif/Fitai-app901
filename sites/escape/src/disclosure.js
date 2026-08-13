/* disclosure.js — the room script peeks and the FAQ.
 *
 * The button owns one attribute and the stylesheet reads it with :has(), so
 * there is no second source of truth about whether a panel is open.
 */

import { qsa } from './dom.js';

export function initDisclosures() {
  for (const btn of qsa('.disc__btn, .acc__btn')) {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
    });
  }
}
