import { $$, on } from './dom.js';

const NAMES = { 1: 'צופה', 2: 'משתתף', 3: 'מטרה', 4: 'ללא רחמים' };
const DREAD = { 1: 0, 2: 0.34, 3: 0.67, 4: 1 };

const levels = () => $$('input[name="level"]');
const touches = () => $$('input[name="touch"]');

export function currentIntensity() {
  const level = levels().find((el) => el.checked)?.value || '2';
  const touch = touches().find((el) => el.checked)?.value === 'yes';
  return { level, name: NAMES[level], touch };
}

/* The panels, the warning line and the readout in the booking form all follow
   the checked radio in CSS, so they keep working with scripting off. --dread
   is set here as well as there: an inline value on :root wins over the
   stylesheet's, the two agree on the same number, and this is the copy that
   the rest of the page can be pointed at when the mapping is ever argued
   about. */
export function initIntensity() {
  const inputs = [...levels(), ...touches()];
  if (!inputs.length) return;

  const sync = () => {
    const { level } = currentIntensity();
    document.documentElement.style.setProperty('--dread', String(DREAD[level] ?? 0.34));
  };

  sync();
  for (const input of inputs) on(input, 'change', sync);
}
