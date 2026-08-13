import { $, $$ } from './dom.js';
import { save } from './store.js';

/* The four-question checker.
 *
 * The one rule that governs this file: it returns a direction, never a number.
 * Four clicks cannot value a claim — the medical file does, and it takes weeks
 * — so an amount here would be an invention dressed as an assessment. Each
 * outcome is qualitative, and each one ends at the same disclaimer, which lives
 * in the HTML precisely so no branch here can forget to print it.
 */

const OUTCOMES = {
  good: {
    cls: 'result--good',
    tag: 'התוצאה',
    title: 'סביר שיש כאן עילה',
    body: 'מהתשובות עולה תמונה שמצדיקה בדיקה של עורך דין: יש אירוע, יש פגיעה שטופלה, ויש למי לפנות. זה לא אומר שהתיק מובטח. זה אומר שיש ממה להתחיל.',
    steps: [
      'אספו את מה שכבר קיים — סיכום מיון, אישורי מחלה, אישור על הדיווח, ותמונות אם צילמתם',
      'אל תחתמו על כתב ויתור או על הצעת פשרה לפני שמישהו קרא אותה',
      'אם המצב הרפואי עדיין משתנה, זה לא מאחר את התיק. זה בדיוק הזמן להיכנס אליו',
    ],
  },
  check: {
    cls: 'result--check',
    tag: 'התוצאה',
    title: 'צריך לבדוק לעומק',
    body: 'מהתשובות לא ברור מספיק אם יש עילה, וזה לא בהכרח סימן רע. תיקים כאלה עומדים או נופלים על כמה פרטים שאי אפשר לברר מטופס.',
    steps: [
      'תיעוד רפואי סמוך לאירוע: מה נרשם, מי רשם, ומתי',
      'מי אחראי לאירוע, והאם יש מאחוריו ביטוח',
      'איזה מועד חל עליכם — לנזיקין, לביטוח הלאומי ולחברת הביטוח יש מועדים שונים לגמרי',
    ],
  },
  time: {
    cls: 'result--time',
    tag: 'התוצאה',
    title: 'ייתכן שחלה התיישנות',
    body: 'בתביעות נזיקין ההתיישנות היא 7 שנים מיום האירוע, ולקטין המניין מתחיל רק בגיל 18 — כך שילד שנפגע יכול להגיש עד גיל 25. יש חריגים, בין השאר לנזק שהתגלה מאוחר. רק בדיקה של המקרה הספציפי יכולה לשלול התיישנות.',
    steps: [
      'בדקו את התאריך המדויק של האירוע, לא את השנה בערך',
      'אם הנפגע היה קטין באותו יום — סופרים מגיל 18',
      'התקשרו לפני שאתם סוגרים את זה לעצמכם. זו שיחה של חמש דקות',
    ],
  },
};

/* Over three years is not yet time-barred in tort, but the contractual clock
 * against an insurer is often three years and may already have run — which is
 * the difference between "call us" and "call us today". */
function decide(a) {
  if (a.q2 === 'y7p') return 'time';
  if (a.q3 === 'no') return 'check';
  if (a.q4 === 'none') return 'check';
  if (a.q2 === 'y3p') return 'check';
  return 'good';
}

export function checker() {
  const root = $('[data-checker]');
  if (!root) return;

  const steps = $$('.checker__step', root);
  const segs = $$('.checker__seg', root);
  const foot = $('.checker__foot', root);
  const count = $('.checker__count', root);
  const live = $('[data-live]', root);
  const back = $('[data-back]', root);
  const now = $('[data-step-now]', root);
  const result = $('[data-result]', root);
  if (!steps.length || !result) return;

  const picked = {};        /* q1..q4 → the answer key */
  const labels = {};        /* q1..q4 → the Hebrew label, for the summary */
  let at = 0;
  let viaPointer = false;
  let timer = 0;
  let announce = false;     /* stays quiet on load; a status region that speaks
                               before the reader has done anything is noise */

  const firstInput = (step) => $('.opt__in:checked', step) || $('.opt__in', step);

  function show(n, { focus = false } = {}) {
    at = n;
    steps.forEach((step, k) => step.classList.toggle('is-current', k === n));
    segs.forEach((seg, k) => seg.classList.toggle('is-on', k <= n));
    now.textContent = String(n + 1);
    back.hidden = n === 0;
    if (focus) firstInput(steps[n])?.focus({ preventScroll: true });
    if (announce) live.textContent = `שאלה ${n + 1} מתוך ${steps.length}: ${$('.checker__q', steps[n]).textContent.trim()}`;
    announce = true;
  }

  function finish() {
    const key = decide(picked);
    const out = OUTCOMES[key];

    result.className = `result ${out.cls}`;
    $('[data-result-tag]', result).textContent = out.tag;
    $('[data-result-h]', result).textContent = out.title;
    $('[data-result-p]', result).textContent = out.body;

    const list = $('[data-result-steps]', result);
    list.textContent = '';
    for (const line of out.steps) {
      const li = document.createElement('li');
      li.textContent = line;
      list.append(li);
    }

    steps.forEach((step) => step.classList.remove('is-current'));
    segs.forEach((seg) => seg.classList.add('is-on'));
    foot.hidden = true;
    count.hidden = true;
    result.hidden = false;
    live.textContent = `סיום הבדיקה. ${out.title}. ${$('.result__disc', result).textContent.trim()}`;
    result.focus({ preventScroll: true });

    carry(labels.q1);
    save({ check: { ...labels, outcome: out.title } });
  }

  function restart() {
    for (const input of $$('.opt__in', root)) input.checked = false;
    for (const q of Object.keys(picked)) { delete picked[q]; delete labels[q]; }
    result.hidden = true;
    foot.hidden = false;
    count.hidden = false;
    segs.forEach((seg, k) => seg.classList.toggle('is-on', k === 0));
    show(0, { focus: true });
  }

  function advance() {
    if (at < steps.length - 1) show(at + 1, { focus: true });
    else finish();
  }

  const queue = () => { clearTimeout(timer); timer = setTimeout(advance, 170); };

  function record(input) {
    picked[input.name] = input.dataset.k;
    labels[input.name] = input.value;
  }

  /* Chromium fires a click when a radio is chosen with an arrow key, so a plain
   * click handler would jump a keyboard user forward on every arrow press. The
   * pointer flag is what separates the two, and any keydown clears it. */
  root.addEventListener('pointerdown', () => { viaPointer = true; });
  root.addEventListener('keydown', () => { viaPointer = false; }, true);

  root.addEventListener('change', (e) => {
    const input = e.target.closest('.opt__in');
    if (!input) return;
    record(input);
    if (viaPointer) { viaPointer = false; queue(); }
  });

  /* Re-clicking the answer that is already selected fires no change event.
   * Without this, going back and then forward again is a dead end. */
  root.addEventListener('click', (e) => {
    const input = e.target;
    if (!input.classList || !input.classList.contains('opt__in')) return;
    if (!viaPointer || picked[input.name] !== input.dataset.k) return;
    viaPointer = false;
    queue();
  });

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const step = e.target.closest('.checker__step');
    if (!step) return;
    e.preventDefault();
    const focused = e.target.closest('.opt__in');
    if (focused && !focused.checked) {
      focused.checked = true;
      record(focused);
    }
    if (picked[`q${steps.indexOf(step) + 1}`]) advance();
  });

  back.addEventListener('click', () => show(Math.max(0, at - 1), { focus: true }));
  $('[data-restart]', root).addEventListener('click', restart);

  show(0);
}

function carry(kind) {
  if (!kind) return;
  for (const select of $$('select[name="kind"]')) {
    if ([...select.options].some((o) => o.value === kind)) select.value = kind;
  }
}
