/*
 * app.js — bootstrap and router.
 *
 * Three stages: welcome -> intake -> plan. The plan stage has four tabs.
 * Everything is client side; nothing leaves the device.
 */

import { h, clear, qs, announce } from './core/dom.js';
import { mountClip, pauseAll } from './core/anim.js';
import { clipById } from './data/clips.index.js';
import * as store from './core/store.js';

import { renderWizard } from './ui/wizard.js';
import { renderPlan } from './ui/plan.js';
import { renderNutrition } from './ui/nutrition.js';
import { renderGuide } from './ui/guide.js';
import { renderProgress } from './ui/progress.js';
import { releaseAll } from './ui/exercise.js';

import { generateProgram } from './engine/generator.js';
import { nutritionPlan } from './engine/nutrition.js';
import { facts } from './engine/targets.js';

const root = qs('#app');

const TABS = [
  { id: 'plan', label: 'אימונים' },
  { id: 'nutrition', label: 'תזונה' },
  { id: 'guide', label: 'איך זה בנוי' },
  { id: 'progress', label: 'מעקב' },
];

let animsPaused = false;

function boot() {
  const st = store.get();
  if (st.stage === 'plan' && st.program && st.profile) return renderApp();
  if (st.stage === 'intake' && st.profile) return renderIntake();
  return renderWelcome();
}

/* ------------------------------------------------------------------ *
 * Welcome
 * ------------------------------------------------------------------ */

function renderWelcome() {
  releaseAll();
  clear(root);

  const demos = h('div', {
    style: {
      display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '9px', marginTop: '26px',
    },
  });
  for (const id of ['pullup', 'squat', 'pushup']) {
    const box = h('div.anim', { style: { width: '100%', height: 'auto', aspectRatio: '1' } });
    demos.appendChild(box);
    mountClip(box, clipById(id), { label: 'הדגמת תרגיל' });
  }

  root.appendChild(h('section.hero-in', { style: { paddingTop: '52px' } },
    h('div.eyebrow', 'FitAI · תוכנית אישית'),
    h('h1', 'התוכנית נבנית ', h('em', 'ממך'), '.', h('br'), 'לא מתבנית.'),
    h('p.sub',
      'כמה שאלות על הגוף, המטרה, הזמן והציוד שיש לך — ואתה מקבל תוכנית אימונים מלאה, '
      + 'תזונה שמתאימה לך, ואנימציה לכל תרגיל כדי שתדע בדיוק איך הוא נראה.'),
    demos,
    h('div.facts', { style: { marginTop: '26px' } },
      h('span.fact', 'שאלון של ', h('b', '3 דק׳')),
      h('span.fact', 'תוכנית מלאה ', h('b', 'מיידית')),
      h('span.fact', 'נשמר ', h('b', 'במכשיר')),
      h('span.fact', 'עובד ', h('b', 'אופליין')),
    ),
    h('div.toolbar', { style: { marginTop: '30px' } },
      h('button.btn.primary.lg', {
        type: 'button',
        onclick: () => { store.set({ stage: 'intake', step: 0 }); renderIntake(); },
      }, 'בוא נתחיל', h('span.ico', '←')),
    ),
    h('p', { style: { color: 'var(--dimmer)', fontSize: '12.5px', marginTop: '4px' } },
      'התוכנית היא נקודת פתיחה מבוססת עקרונות אימון — לא ייעוץ רפואי.'),
  ));
}

/* ------------------------------------------------------------------ *
 * Intake
 * ------------------------------------------------------------------ */

function renderIntake() {
  releaseAll();
  clear(root);
  root.appendChild(h('header', { style: { padding: '26px 0 0' } },
    h('div.eyebrow', 'FitAI')));

  const host = h('div');
  root.appendChild(host);

  renderWizard(host, (profile) => {
    build(profile);
  });
}

function build(profile) {
  clear(root);
  root.appendChild(h('section', { style: { padding: '80px 0', textAlign: 'center' } },
    h('div.eyebrow', 'בונה את התוכנית'),
    h('h2', 'רגע…')));

  // Let the paint land before the synchronous generation work.
  setTimeout(() => {
    try {
      const program = generateProgram(profile);
      const nutrition = profile.wantsNutrition ? nutritionPlan(profile) : null;
      store.set({
        stage: 'plan',
        profile,
        program,
        nutrition,
        startedAt: store.get().startedAt || new Date().toISOString(),
        ui: Object.assign({}, store.get().ui, { tab: 'plan', activeDay: 0 }),
      });
      renderApp();
      announce('התוכנית מוכנה');
    } catch (e) {
      console.error(e);
      renderFailure(e, profile);
    }
  }, 30);
}

function renderFailure(e, profile) {
  clear(root);
  root.appendChild(h('section', { style: { paddingTop: '60px' } },
    h('div.eyebrow', 'שגיאה'),
    h('h2', 'לא הצלחתי לבנות את התוכנית'),
    h('p.sub', 'משהו בשילוב התשובות הפיל את המנוע. אפשר לחזור לשאלון ולשנות תשובה, או להתחיל מחדש.'),
    h('pre', {
      style: {
        marginTop: '18px', padding: '13px', background: 'var(--steel)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-sm)', color: 'var(--dim)', fontSize: '12px', overflowX: 'auto',
        fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap',
      },
    }, String(e && e.stack ? e.stack : e)),
    h('div.toolbar',
      h('button.btn.primary', {
        type: 'button',
        onclick: () => { store.set({ stage: 'intake', profile }); renderIntake(); },
      }, 'חזרה לשאלון'),
      h('button.btn.danger', {
        type: 'button',
        onclick: () => { store.reset(); location.reload(); },
      }, 'התחל מחדש'),
    ),
  ));
}

/* ------------------------------------------------------------------ *
 * Plan
 * ------------------------------------------------------------------ */

function renderApp() {
  releaseAll();
  clear(root);

  const st = store.get();
  const { profile, program } = st;
  const nutrition = st.nutrition;

  root.appendChild(planHeader(profile, program));

  const tabsAvailable = TABS.filter((t) => t.id !== 'nutrition' || nutrition);
  const tabBar = h('nav.tabs', { 'aria-label': 'תצוגות' });
  root.appendChild(tabBar);

  const body = h('div');
  root.appendChild(body);
  root.appendChild(appFooter());

  function paintTabs(active) {
    clear(tabBar);
    for (const t of tabsAvailable) {
      tabBar.appendChild(h('button.btn' + (t.id === active ? '.on' : ''), {
        type: 'button', 'aria-pressed': t.id === active ? 'true' : 'false',
        onclick: () => show(t.id),
      }, t.label));
    }
    tabBar.appendChild(h('button.btn.ghost' + (animsPaused ? '.on' : ''), {
      type: 'button',
      title: 'עצור או הפעל אנימציות',
      onclick: (e) => {
        animsPaused = !animsPaused;
        pauseAll(animsPaused);
        e.currentTarget.classList.toggle('on', animsPaused);
        e.currentTarget.lastChild.textContent = animsPaused ? 'הפעל תנועה' : 'עצור תנועה';
      },
    }, h('span.ico', '❙❙'), h('span', animsPaused ? 'הפעל תנועה' : 'עצור תנועה')));
  }

  function show(tab) {
    releaseAll();
    clear(body);
    paintTabs(tab);
    store.set({ ui: Object.assign({}, store.get().ui, { tab }) });

    try {
      if (tab === 'plan') renderPlan(body, program, profile);
      else if (tab === 'nutrition' && nutrition) renderNutrition(body, nutrition, profile);
      else if (tab === 'guide') renderGuide(body, program, profile);
      else if (tab === 'progress') renderProgress(body, program, profile);
    } catch (e) {
      console.error(e);
      body.appendChild(h('p.empty', 'לא הצלחתי להציג את המסך הזה. נסה מסך אחר.'));
    }
    if (animsPaused) pauseAll(true);
  }

  show(st.ui.tab && tabsAvailable.some((t) => t.id === st.ui.tab) ? st.ui.tab : 'plan');
}

function planHeader(profile, program) {
  let chips = [];
  try { chips = facts(profile) || []; } catch (e) { console.error(e); }

  const goalWord = {
    fatloss: 'ירידה בשומן', muscle: 'עלייה במסה', strength: 'כוח',
    fitness: 'כושר כללי', sport: profile.sport || 'ספורט',
  }[profile.goal] || 'כושר';

  return h('header', { style: { padding: '28px 0 6px' } },
    h('div.eyebrow', [
      profile.name || 'התוכנית שלך',
      goalWord,
      `${program.meta.daysPerWeek} אימונים בשבוע`,
    ].join(' · ')),
    h('h1', program.meta.splitName, h('br'), h('em', goalWord), '.'),
    program.meta.rationale ? h('p.sub', program.meta.rationale) : null,
    chips.length ? h('div.facts', chips.map((f) => h('span.fact', `${f.label} `, h('b', String(f.value))))) : null,
    h('div.toolbar', { style: { margin: '18px 0 0' } },
      h('button.btn', {
        type: 'button',
        onclick: () => {
          store.set({ stage: 'intake', step: 0 });
          renderIntake();
        },
      }, h('span.ico', '✎'), 'ערוך תשובות ובנה מחדש'),
      h('button.btn.ghost', { type: 'button', onclick: () => window.print() },
        h('span.ico', '⎙'), 'הדפס'),
    ),
  );
}

function appFooter() {
  return h('footer',
    h('span.fbrand', 'FitAI'),
    'לחיצה על ⇄ ליד תרגיל מחליפה אותו לחלופה עם עומס דומה על אותם שרירים. ',
    'לחיצה על האיור פותחת הסבר מלא, קיוז ורישום סטים. הסימון ✓ נשמר במכשיר.',
    h('br'),
    'שינה של 7–9 שעות היא החלק החזק ביותר בתוכנית הזאת. אל תוותר עליה.',
  );
}

/* ------------------------------------------------------------------ */

try {
  boot();
} catch (e) {
  console.error(e);
  clear(root);
  root.appendChild(h('section', { style: { paddingTop: '60px' } },
    h('h2', 'האפליקציה לא עלתה'),
    h('p.sub', 'נסה לרענן. אם זה חוזר, אפס את הנתונים.'),
    h('pre', {
      style: {
        marginTop: '18px', padding: '13px', background: 'var(--steel)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-sm)', color: 'var(--dim)', fontSize: '12px', fontFamily: 'var(--mono)',
        whiteSpace: 'pre-wrap', overflowX: 'auto',
      },
    }, String(e && e.stack ? e.stack : e)),
    h('div.toolbar', h('button.btn.danger', {
      type: 'button', onclick: () => { store.reset(); location.reload(); },
    }, 'אפס הכל'))));
}
