import { $, $$ } from './dom.js';
import { load, save } from './store.js';

const WA = '97236100420';
const MAIL = 'office@lavi-law.example';

/* Israeli numbers: an area or mobile prefix and seven digits, written by real
 * people with spaces, dashes, brackets and sometimes +972. All of those are the
 * same number, so they are normalised before being judged. */
function normalise(raw) {
  const v = raw.replace(/[\s\-().]/g, '');
  if (v.startsWith('+972')) return `0${v.slice(4)}`;
  if (v.startsWith('972')) return `0${v.slice(3)}`;
  return v;
}
const telOk = (raw) => /^0\d{8,9}$/.test(normalise(raw));

const fieldOf = (control) => control.closest('.field');

function mark(control, bad) {
  const field = fieldOf(control);
  if (!field) return;
  field.classList.toggle('is-bad', bad);
  if (bad) control.setAttribute('aria-invalid', 'true');
  else control.removeAttribute('aria-invalid');
}

function invalid(control) {
  const value = control.value.trim();
  if (control.name === 'tel') return !telOk(value);
  return value.length < 2;
}

function summary(form) {
  const val = (name) => (form.elements[name]?.value || '').trim();
  const lines = ['שלום, הגעתי מהאתר.', `שם: ${val('name')}`, `טלפון: ${val('tel')}`];

  if (val('kind')) lines.push(`סוג המקרה: ${val('kind')}`);
  if (val('when')) lines.push(`מתי קרה: ${val('when')}`);
  if (val('msg')) lines.push(`פרטים: ${val('msg')}`);

  // A checker run from an earlier visit is only worth attaching while it is
  // still about the same case; otherwise the message would contradict itself.
  const check = load().check;
  if (check?.q1 && (!val('kind') || check.q1 === val('kind'))) {
    lines.push(`בדיקת הזכאות בדף: ${[check.q1, check.q2, `נזק שטופל: ${check.q3}`, `דיווח: ${check.q4}`].join(' · ')}`);
  }
  return lines.join('\n');
}

export function forms() {
  for (const form of $$('[data-form]')) {
    const controls = $$('.input, .select, .textarea', form).filter((el) => el.required);
    const handoff = $('[data-handoff]', form);
    const wa = $('[data-wa]', form);
    const mail = $('[data-mail]', form);

    restore(form);

    const build = () => {
      const text = summary(form);
      wa.href = `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;
      mail.href = `mailto:${MAIL}?subject=${encodeURIComponent('פנייה מהאתר')}&body=${encodeURIComponent(text)}`;
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = controls.filter((control) => {
        const isBad = invalid(control);
        mark(control, isBad);
        return isBad;
      });

      if (bad.length) {
        handoff.hidden = true;
        bad[0].focus();
        return;
      }

      build();
      handoff.hidden = false;
      handoff.focus();
      keep(form);
    });

    /* Clearing an error the moment it is fixed, rather than on the next submit,
     * is the difference between a form that argues and one that helps. */
    form.addEventListener('input', (e) => {
      const control = e.target;
      if (control.required && control.getAttribute('aria-invalid') === 'true' && !invalid(control)) mark(control, false);
      if (!handoff.hidden) build();
      keep(form);
    });
    form.addEventListener('change', () => { if (!handoff.hidden) build(); keep(form); });
  }
}

function keep(form) {
  const box = {};
  for (const control of $$('.input, .select, .textarea', form)) box[control.name] = control.value;
  save({ [form.dataset.form]: box });
}

function restore(form) {
  const box = load()[form.dataset.form];
  if (!box) return;
  for (const control of $$('.input, .select, .textarea', form)) {
    const value = box[control.name];
    if (typeof value !== 'string' || !value) continue;
    if (control.tagName === 'SELECT' && ![...control.options].some((o) => o.value === value)) continue;
    control.value = value;
  }
}
