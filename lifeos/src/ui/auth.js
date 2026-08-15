/*
 * auth.js — the door, and the notice on it.
 *
 * One card, two modes. There is no forgotten-password flow and no verification
 * mail, because there is no server to send either from; pretending otherwise
 * would be the first thing this app lied about.
 *
 * THE NOTICE IS PART OF THE SCREEN, NOT PART OF THE SETTINGS.
 *
 * A password here separates profiles on one browser; it does not protect them
 * from anyone holding the device. That is a real difference and it decides what
 * a person is willing to type into a note, so it is said here, before the first
 * account exists, rather than in an About page nobody opens. session.js and the
 * README say the same thing at greater length.
 */

import { h, replace, qs, field, announce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { toastError } from '../core/toast.js';
import * as session from '../core/session.js';
import * as store from '../core/store.js';

const { AUTH_ERRORS } = session;

const ERROR_TEXT = {
  [AUTH_ERRORS.EMAIL_TAKEN]: 'auth.errEmailTaken',
  [AUTH_ERRORS.EMAIL_INVALID]: 'auth.errEmailInvalid',
  [AUTH_ERRORS.NAME_REQUIRED]: 'auth.errNameRequired',
  [AUTH_ERRORS.PASSWORD_SHORT]: 'auth.errPasswordShort',
  [AUTH_ERRORS.BAD_CREDENTIALS]: 'auth.errBadCredentials',
};

/* Which box the message belongs over. Wrong credentials belongs to neither —
 * the whole point of that message is that it does not say which half failed. */
const ERROR_FIELD = {
  [AUTH_ERRORS.NAME_REQUIRED]: 'displayName',
  [AUTH_ERRORS.EMAIL_INVALID]: 'email',
  [AUTH_ERRORS.EMAIL_TAKEN]: 'email',
  [AUTH_ERRORS.PASSWORD_SHORT]: 'password',
};

export function renderAuth(onDone) {
  const done = onDone || (() => {});

  const state = {
    /* An empty device has nobody to sign in as, so the useful form is the one
     * that creates somebody. */
    mode: session.listAccounts().length ? 'signIn' : 'signUp',
    values: { displayName: '', email: '', password: '' },
    fieldError: null,
    formError: null,
    reveal: false,
    pending: false,
  };

  const host = h('div.centered');
  const box = h('div.centered-box');
  host.appendChild(box);

  /* ---------------- fields ---------------- */

  function errorFor(name) {
    return state.fieldError && ERROR_FIELD[state.fieldError] === name
      ? t(ERROR_TEXT[state.fieldError])
      : null;
  }

  function textField(name, opts) {
    return field({
      label: opts.label,
      hint: opts.hint,
      error: errorFor(name),
      control: h('input', {
        type: opts.type || 'text',
        dir: opts.dir || null,
        value: state.values[name],
        maxlength: opts.maxlength,
        placeholder: opts.placeholder || null,
        autocomplete: opts.autocomplete,
        'data-field': name,
        oninput: (e) => { state.values[name] = e.target.value; },
      }),
    });
  }

  /**
   * The password box, built by hand rather than through field(), because the
   * reveal toggle sits beside the input and field() labels a single control.
   */
  function passwordField() {
    const id = 'auth-password';
    const hintId = `${id}-hint`;
    const error = errorFor('password');
    const isNew = state.mode === 'signUp';

    const note = error
      ? h('p.field-error', { id: hintId, role: 'alert' }, error)
      : isNew ? h('p.field-hint', { id: hintId }, t('auth.passwordHint')) : null;

    const input = h('input.grow', {
      id,
      type: state.reveal ? 'text' : 'password',
      dir: 'ltr',
      value: state.values.password,
      autocomplete: isNew ? 'new-password' : 'current-password',
      'aria-describedby': note ? hintId : null,
      'aria-invalid': error ? 'true' : null,
      'data-field': 'password',
      oninput: (e) => { state.values.password = e.target.value; },
    });

    /* Flipped in place instead of through a repaint: repainting would rebuild
     * the input and drop the caret in the middle of a password. */
    const toggle = h('button.btn-icon.shrink0', {
      type: 'button',
      'aria-pressed': state.reveal ? 'true' : 'false',
      'aria-label': state.reveal ? t('auth.passwordHide') : t('auth.passwordShow'),
      onclick: () => {
        state.reveal = !state.reveal;
        input.type = state.reveal ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', state.reveal ? 'true' : 'false');
        toggle.setAttribute('aria-label', state.reveal ? t('auth.passwordHide') : t('auth.passwordShow'));
        replace(toggle, icon(state.reveal ? 'eyeOff' : 'eye'));
        input.focus();
      },
    }, icon(state.reveal ? 'eyeOff' : 'eye'));

    return h('div.field',
      h('label.field-label', { for: id }, isNew ? t('auth.passwordNew') : t('auth.password')),
      h('div.row', input, toggle),
      note);
  }

  /* ---------------- submit ---------------- */

  /**
   * Hashing costs a visible fifth of a second — 210,000 PBKDF2 rounds by
   * design — so the button says so and stops accepting presses. A button that
   * looks idle while it works gets pressed three more times.
   *
   * The pending state is written onto the existing button rather than painted,
   * because a repaint would rebuild the form and throw away focus while
   * somebody is still standing in it.
   */
  async function submit(button) {
    if (state.pending) return;
    state.pending = true;
    state.fieldError = null;
    state.formError = null;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    replace(button, t('auth.working'));

    const { displayName, email, password } = state.values;

    try {
      if (state.mode === 'signUp') await session.signUp({ displayName, email, password });
      else await session.signIn(email, password);
      done();
      return;
    } catch (e) {
      state.pending = false;
      const code = e && e.message;
      if (!ERROR_TEXT[code]) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        replace(button, t(state.mode === 'signUp' ? 'auth.createAccount' : 'auth.signIn'));
        toastError(t('errors.generic'));
        return;
      }
      if (ERROR_FIELD[code]) state.fieldError = code;
      else state.formError = t(ERROR_TEXT[code]);
      announce(t(ERROR_TEXT[code]), true);
      paint(ERROR_FIELD[code] || 'password');
    }
  }

  /* ---------------- pieces ---------------- */

  function accountsBlock() {
    const accounts = session.listAccounts();
    if (!accounts.length) return null;

    return h('div', { style: { marginBlockEnd: 'var(--sp-4)' } },
      h('div.eyebrow', { style: { marginBlockEnd: '8px' } }, t('auth.accounts')),
      h('div.card.card-flat', { style: { overflow: 'hidden' } },
        accounts.map((account) => h('button.trow', {
          type: 'button',
          style: { width: '100%' },
          /* Filling the address in and letting the person type the password is
           * the whole of what this can honestly do — there is nothing here that
           * could unlock an account on its own. */
          onclick: () => {
            state.values.email = account.email;
            state.mode = 'signIn';
            state.fieldError = null;
            state.formError = null;
            paint('password');
          },
        },
        h('span.avatar', (account.displayName || account.email).trim().charAt(0)),
        h('div.grow.ellipsis', { style: { textAlign: 'start' } },
          h('div.trow-title.ellipsis', account.displayName || account.email),
          h('div.tiny.quiet.ellipsis', { dir: 'ltr' }, account.email))))));
  }

  function localNotice() {
    return h('div.notice', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('div.row-top',
        h('span.shrink0', { style: { color: 'var(--ink-3)' } }, icon('lock', { size: 16 })),
        h('div.grow',
          h('strong', t('auth.localNoticeTitle')),
          h('p.tiny', { style: { marginBlockStart: '4px' } }, t('auth.localNotice')))));
  }

  function storageNotice() {
    if (store.persists()) return null;
    return h('div.notice.notice-warn', { role: 'status', style: { marginBlockEnd: 'var(--sp-4)' } },
      h('div.row-top',
        h('span.shrink0', icon('alert', { size: 16 })),
        h('p.grow.tiny', t('auth.storageBroken'))));
  }

  /* ---------------- painting ---------------- */

  function paint(focusField) {
    const isNew = state.mode === 'signUp';

    const submitButton = h('button.btn.btn-primary.btn-lg.btn-block', {
      type: 'submit',
    }, t(isNew ? 'auth.createAccount' : 'auth.signIn'));

    const form = h('form', {
      novalidate: true,
      onsubmit: (e) => { e.preventDefault(); submit(submitButton); },
    },
    isNew
      ? textField('displayName', {
        label: t('auth.name'),
        placeholder: t('auth.namePlaceholder'),
        maxlength: '60',
        autocomplete: 'name',
      })
      : null,
    textField('email', {
      label: t('auth.email'),
      placeholder: t('auth.emailPlaceholder'),
      type: 'email',
      dir: 'ltr',
      maxlength: '120',
      autocomplete: 'email',
    }),
    passwordField(),
    state.formError
      ? h('p.field-error', { role: 'alert', style: { marginBlockEnd: 'var(--sp-3)' } }, state.formError)
      : null,
    submitButton);

    const switcher = h('div.row', {
      style: { justifyContent: 'center', marginBlockStart: 'var(--sp-4)' },
    },
    h('span.tiny.quiet', isNew ? t('auth.haveAccount') : t('auth.noAccount')),
    h('button.btn.btn-ghost.btn-sm', {
      type: 'button',
      onclick: () => {
        state.mode = isNew ? 'signIn' : 'signUp';
        state.fieldError = null;
        state.formError = null;
        paint(isNew ? 'email' : 'displayName');
      },
    }, isNew ? t('auth.signIn') : t('auth.signUp')));

    replace(box,
      h('div', { style: { textAlign: 'center', marginBlockEnd: 'var(--sp-6)' } },
        h('h1', t('auth.welcomeTitle')),
        h('p.quiet', { style: { marginBlockStart: '6px' } }, t('auth.welcomeLead'))),
      storageNotice(),
      accountsBlock(),
      h('div.card.card-pad-lg', form, switcher),
      localNotice());

    const target = focusField
      ? qs(`[data-field="${focusField}"]`, box)
      : null;
    if (target) target.focus();
  }

  paint();
  return host;
}
