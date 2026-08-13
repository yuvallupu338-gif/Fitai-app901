/* main.js — the page's behaviour, in the order the reader meets it.
 *
 * Nothing here is required for the page to be read: the copy, the six practice
 * areas, the process, the results and every FAQ answer are in the HTML, and the
 * collapsed states are applied only under the `js` class the document sets for
 * itself. What this layer adds is the drawer, the checker, the two handoffs and
 * one fade per section.
 */
import { header, drawer, callbar, heroCta, focusTargets } from './nav.js';
import { disclosures } from './disclose.js';
import { checker } from './checker.js';
import { forms } from './forms.js';
import { reveal } from './reveal.js';

header();
drawer();
callbar();
heroCta();
focusTargets();
disclosures();
forms();
checker();
reveal();
