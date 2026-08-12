/*
 * app.js — boot and the three tabs.
 *
 * The shape of the app is the shape of the job: say who you are, list what you
 * made, take the file. Nothing is a wizard here — unlike a questionnaire, a
 * portfolio is written over weeks, one work at a time, and a flow that insists
 * on an order would be wrong on the second visit.
 *
 * This is the only file in the app that touches the DOM at module top level.
 */

import { h, clear, qs, announce } from '../../src/core/dom.js';
import * as store from './core/store.js';
import { renderOwner } from './ui/owner.js';
import { renderWorks } from './ui/works.js';
import { renderFile } from './ui/file.js';
import { toHtml } from './export/html.js';

const root = qs('#app');

const TABS = [
  { id: 'owner', label: 'פרטים' },
  { id: 'works', label: 'העבודות' },
  { id: 'file', label: 'הקובץ' },
];

function renderApp() {
  clear(root);

  root.appendChild(h('header.head', [
    h('p.eyebrow', 'תיק עבודות'),
    h('h1', ['מה שעשית, ', h('em', 'כתוב'), '.']),
    h('p.sub', 'עונים על כמה שאלות לכל עבודה, והאפליקציה כותבת מזה קובץ אחד שאפשר לשלוח, להדפיס או לשמור כ-PDF.'),
  ]));

  if (!store.persists()) {
    root.appendChild(h('div.warnbox', [
      h('b', 'הדפדפן הזה לא שומר.'),
      ' מה שתכתבו כאן יעלם ברענון. אפשר לעבוד ולהוריד את הקובץ עכשיו, אבל אל תסגרו את הלשונית באמצע.',
    ]));
  }

  const tabsBar = h('nav.tabs', { 'aria-label': 'מסכים' });
  const body = h('div');
  root.appendChild(tabsBar);
  root.appendChild(body);

  function paintTabs(active) {
    clear(tabsBar);
    for (const t of TABS) {
      tabsBar.appendChild(h('button.btn', {
        class: t.id === active ? 'on' : '',
        type: 'button',
        'aria-pressed': t.id === active ? 'true' : 'false',
        onclick: () => show(t.id),
      }, t.label));
    }
  }

  /*
   * One tab at a time, each rebuilt from the store, each wrapped — a screen that
   * throws should cost its own tab and not the page, because the other two are
   * the ones holding the way out (the export, and the backup).
   *
   * The screen being left is released first. Two of the three hold something
   * that outlives their DOM — a pending save on a timer, and the pagehide
   * listener that guarantees it — and a screen that is painted over without
   * being told leaves both behind. Opening the editor four times would then
   * leave four listeners holding four drafts, and the last one to fire wins.
   */
  let open = null;

  function show(tab) {
    if (open && open.release) {
      try { open.release(); } catch (e) { console.error(e); }
    }
    open = null;
    clear(body);
    paintTabs(tab);
    store.setUi({ tab });
    try {
      if (tab === 'owner') open = renderOwner(body, { onDone: () => show('works') });
      else if (tab === 'works') open = renderWorks(body, { onDone: () => show('file') });
      else open = renderFile(body);
    } catch (e) {
      console.error(e);
      body.appendChild(h('p.empty', 'לא הצלחתי להציג את המסך הזה. נסו מסך אחר.'));
    }
    window.scrollTo(0, 0);
  }

  const st = store.get();
  show(TABS.some((t) => t.id === st.ui.tab) ? st.ui.tab : 'owner');

  /*
   * The handle the Chromium check drives the app through. It is the same store
   * and the same exporter the buttons use — a test hook that reaches a second
   * copy of anything proves the second copy works.
   */
  window.portfolio = {
    store,
    show,
    html: (opts) => toHtml(store.get(), opts || { now: new Date() }),
  };
  announce('תיק עבודות מוכן');
}

try {
  renderApp();
} catch (e) {
  console.error(e);
  clear(root);
  root.appendChild(h('div.warnbox', 'משהו נשבר בטעינה. אפשר לאפס ולהתחיל מחדש — הגיבוי, אם ירד, נשאר אצלכם.'));
  root.appendChild(h('pre', String(e && e.stack ? e.stack : e)));
  root.appendChild(h('button.btn.danger', {
    onclick: () => { store.reset(); location.reload(); },
  }, 'אפס הכל'));
}
