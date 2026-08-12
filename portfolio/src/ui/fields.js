/*
 * fields.js — the form controls, once.
 *
 * Two screens ask questions here: the person's details and a work. They share
 * every control except the ones only a work needs, so the controls live in one
 * place and the screens are left as a list of questions, which is what they
 * should read like.
 *
 * The controls all follow the same rule about redrawing: they never do it. Each
 * takes an `onChange` and reports the new value, and the screen decides what to
 * repaint — because repainting a field while somebody is typing in it moves the
 * caret to the end of the line, and there is no version of that a person does
 * not notice immediately.
 */

import { h, shrinkImage } from '../../../src/core/dom.js';
import { MONTHS, YEAR_MIN, YEAR_MAX, cleanChips, MAX_IMAGES_PER_WORK, MAX_LINKS_PER_WORK } from '../data/schema.js';

/* A photograph, resized on the way in. localStorage holds a few megabytes and a
 * phone picture is several, so an original would fill the whole portfolio's
 * budget with one image — and nothing in a document 780px wide can show it. */
const IMAGE_MAX_PX = 1400;
const IMAGE_QUALITY = 0.72;

let seq = 0;

/**
 * A labelled question.
 *
 * The label is tied to its control rather than just sitting above it, which is
 * what makes tapping the words focus the box and what lets a screen reader say
 * the question before the answer. Where the "control" is really several — two
 * dates, a list of links — there is nothing single to tie it to, so the group
 * is named instead. Both forms are one line of markup and neither is optional:
 * a form is the part of an app that is hardest to use without sight.
 */
export function field(label, control, help) {
  seq += 1;
  const id = 'f' + seq;
  const labelNode = h('label', { id: id + '-l' }, label);
  const helpNode = help ? h('p.help', { id: id + '-h' }, help) : null;
  const single = isControl(control) ? control : onlyControlIn(control);

  if (single) {
    single.id = id;
    labelNode.setAttribute('for', id);
    if (helpNode) single.setAttribute('aria-describedby', id + '-h');
  } else {
    control.setAttribute('role', 'group');
    control.setAttribute('aria-labelledby', id + '-l');
    if (helpNode) control.setAttribute('aria-describedby', id + '-h');
  }

  return h('div.field', [labelNode, control, helpNode]);
}

function isControl(node) {
  return node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT');
}

/*
 * A wrapper says which of its controls the label belongs to, if any.
 *
 * Counting them instead — "one control, so label that one" — was wrong in a way
 * that only appears later: the pictures field holds exactly one control until
 * the first picture is added, so the label would bind to the file input and
 * then, on the repaint that follows, point at an element that no longer exists.
 * Saying so explicitly cannot drift with the contents.
 */
function onlyControlIn(node) {
  return node && node.querySelector ? node.querySelector('[data-label-target]') : null;
}

export function textInput(value, onChange, attrs) {
  const node = h('input', Object.assign({
    type: 'text',
    value: value || '',
    oninput: (e) => onChange(e.target.value),
  }, attrs || {}));
  return node;
}

export function textArea(value, onChange, attrs) {
  return h('textarea', Object.assign({
    rows: 4,
    oninput: (e) => onChange(e.target.value),
  }, attrs || {}), value || '');
}

/**
 * A closed list.
 *
 * Rendered as a `select` rather than the app's chip buttons because these lists
 * run to fifteen items — the chip grid that suits four options becomes a wall
 * at fifteen, and a native select on a phone is a scrollable sheet the person
 * already knows how to use.
 */
export function picker(options, value, onChange) {
  const node = h('select', { onchange: (e) => onChange(e.target.value) });
  /*
   * A value that matches nothing — which a hand-edited backup can carry, and
   * backups are text files people edit — would otherwise leave the browser
   * showing the first option while the work holds none. The control would be
   * lying about the answer, and these controls never redraw to correct it.
   */
  if (!options.some((o) => o.id === value)) {
    node.appendChild(h('option', { value: '', selected: true }, '— בחרו —'));
  }
  for (const o of options) {
    node.appendChild(h('option', { value: o.id, selected: o.id === value ? true : null }, o.he));
  }
  return node;
}

/**
 * Free-form tags, typed as one line.
 *
 * A tag editor with an add button and an × on every chip is more code and more
 * taps than a comma. What the person typed stays in the box; the chips under it
 * are what the document will actually show, which is the part worth seeing.
 */
export function chipsInput(list, onChange) {
  const wrap = h('div');
  const preview = h('div.chipline');
  const paint = (items) => {
    preview.textContent = '';
    for (const t of items) preview.appendChild(h('span.chip', t));
  };
  const node = h('input', {
    type: 'text',
    'data-label-target': '',
    value: (list || []).join(', '),
    oninput: (e) => {
      const items = cleanChips(e.target.value, 20);
      paint(items);
      onChange(items);
    },
  });
  paint(list || []);
  wrap.appendChild(node);
  wrap.appendChild(preview);
  return wrap;
}

/**
 * When the work happened.
 *
 * Month is optional on purpose. People remember the year of a job from four
 * years ago and not the month, and a date input that demands a day would get an
 * invented one — so the smallest true answer the person has is the one the
 * control accepts, and the writer downstream says as much as it was given.
 */
export function periodInput(period, onChange) {
  const p = Object.assign({ fromYear: null, fromMonth: null, toYear: null, toMonth: null, ongoing: false }, period || {});
  const box = h('div');

  /*
   * The control owns the period while it is on screen.
   *
   * Five inputs write into one value, and the screen around them does not
   * redraw while somebody is filling it in — so a handler that built its patch
   * from the value this function was called with would undo every earlier
   * answer as soon as the second one was given. It reads as the month erasing
   * the year, which is exactly what it was.
   */
  const emit = (patch) => {
    Object.assign(p, patch);
    onChange(Object.assign({}, p));
  };

  const monthSel = (value, key) => {
    const sel = h('select', { 'aria-label': key === 'fromMonth' ? 'חודש התחלה' : 'חודש סיום', onchange: (e) => emit({ [key]: e.target.value ? Number(e.target.value) : null }) });
    sel.appendChild(h('option', { value: '' }, 'חודש'));
    MONTHS.forEach((m, i) => {
      sel.appendChild(h('option', { value: String(i + 1), selected: value === i + 1 ? true : null }, m));
    });
    return sel;
  };

  const yearInput = (value, key) => h('input', {
    type: 'number',
    min: String(YEAR_MIN),
    max: String(YEAR_MAX),
    step: '1',
    placeholder: 'שנה',
    'aria-label': key === 'fromYear' ? 'שנת התחלה' : 'שנת סיום',
    value: value === null || value === undefined ? '' : String(value),
    oninput: (e) => emit({ [key]: e.target.value ? Number(e.target.value) : null }),
  });

  /* Repainted only when "still going" is ticked, because that is the one answer
   * that changes which questions are on the screen — and it is a checkbox, so
   * nobody is mid-word when it happens. */
  function paint() {
    box.textContent = '';
    box.appendChild(h('div.daterow', [
      h('span.rowlabel', 'מ־'), monthSel(p.fromMonth, 'fromMonth'), yearInput(p.fromYear, 'fromYear'),
    ]));
    if (!p.ongoing) {
      box.appendChild(h('div.daterow', [
        h('span.rowlabel', 'עד'), monthSel(p.toMonth, 'toMonth'), yearInput(p.toYear, 'toYear'),
      ]));
    }
    box.appendChild(h('label.checkline', [
      h('input', {
        type: 'checkbox',
        checked: p.ongoing ? true : null,
        onchange: (e) => { emit({ ongoing: e.target.checked }); paint(); },
      }),
      'עוד עובדים על זה',
    ]));
  }

  paint();
  return box;
}

/**
 * Links to the work itself.
 *
 * The label is optional and defaults to the address, because "לצפייה באתר" is
 * better than a URL in a printed document and a URL is better than nothing.
 * Rows are added and removed by the caller's repaint — this control reports the
 * whole list every time, which keeps the caller from having to track indices.
 */
export function linksInput(links, onChange) {
  const list = (links || []).slice();
  const box = h('div');
  const emit = () => onChange(list.slice());

  const row = (link, i) => h('div.linkrow', [
    h('input', {
      type: 'text', value: link.label || '', placeholder: 'מה זה', 'aria-label': 'תיאור הקישור',
      oninput: (e) => { list[i] = Object.assign({}, list[i], { label: e.target.value }); emit(); },
    }),
    h('input', {
      type: 'text', dir: 'ltr', value: link.url || '', placeholder: 'https://', 'aria-label': 'כתובת',
      oninput: (e) => { list[i] = Object.assign({}, list[i], { url: e.target.value }); emit(); },
    }),
    h('button.iconbtn', {
      type: 'button', 'aria-label': 'מחיקת הקישור',
      onclick: () => { list.splice(i, 1); paint(); emit(); },
    }, '×'),
  ]);

  function paint() {
    box.textContent = '';
    list.forEach((l, i) => box.appendChild(row(l, i)));
    if (list.length < MAX_LINKS_PER_WORK) {
      box.appendChild(h('button.btn.ghost', {
        type: 'button',
        onclick: () => { list.push({ label: '', url: '' }); paint(); },
      }, '+ קישור'));
    }
  }

  paint();
  return box;
}

/**
 * Pictures of the work.
 *
 * They are stored as data URLs and travel inside the exported file, which is
 * the only arrangement where the document still shows them after it has been
 * emailed. The cost is the quota, which is why they are resized here and capped
 * at six, and why the app says so rather than letting a save fail quietly.
 */
export function imagesInput(images, onChange, onError) {
  const list = (images || []).slice();
  const box = h('div');
  let cancelled = false;
  const emit = () => { if (!cancelled) onChange(list.slice()); };

  function paint() {
    box.textContent = '';
    const grid = h('div.thumbs');
    list.forEach((img, i) => {
      grid.appendChild(h('figure.thumb', [
        h('img', { src: img.src, alt: img.caption || '' }),
        h('input', {
          type: 'text', value: img.caption || '', placeholder: 'כיתוב (לא חובה)', 'aria-label': 'כיתוב לתמונה',
          oninput: (e) => { list[i] = Object.assign({}, list[i], { caption: e.target.value }); emit(); },
        }),
        h('button.iconbtn', {
          type: 'button', 'aria-label': 'מחיקת התמונה',
          onclick: () => { list.splice(i, 1); paint(); emit(); },
        }, '×'),
      ]));
    });
    box.appendChild(grid);

    if (list.length < MAX_IMAGES_PER_WORK) {
      /* The native file input renders its own English label — "Choose Files",
       * "No file chosen" — which is the one place in this app where the browser
       * writes the copy. The input still does the work; it is behind a label
       * that says what it does in the app's language. */
      box.appendChild(h('label.btn.ghost.filebtn', [
        '+ תמונות',
        h('input', {
          type: 'file',
          accept: 'image/*',
          multiple: true,
          'aria-label': 'הוספת תמונות',
          onchange: (e) => add(Array.from(e.target.files || []), e.target),
        }),
      ]));
    } else {
      box.appendChild(h('p.help', 'זה המקסימום. כדי להוסיף עוד, מחקו אחת.'));
    }
  }

  async function add(files, input) {
    for (const file of files) {
      if (cancelled) return;
      if (list.length >= MAX_IMAGES_PER_WORK) break;
      try {
        const src = await shrinkImage(file, IMAGE_MAX_PX, IMAGE_QUALITY);
        list.push({ src, caption: '' });
      } catch (e) {
        console.error(e);
        if (onError) onError('לא הצלחתי לקרוא את ' + (file.name || 'הקובץ') + '.');
      }
    }
    /* The input keeps the file it just read, and a second pick of the same file
     * fires no change event at all — so it is cleared before the repaint. */
    if (input) input.value = '';
    if (cancelled) return;
    paint();
    emit();
  }

  /*
   * Reading a photograph takes long enough to outlive the screen it was started
   * from. The editor calls this when it is released, so a file that finishes
   * decoding afterwards is dropped rather than reported to a form that is no
   * longer on the page — the alternative was a stale draft being written over
   * newer edits a second after the person had moved on.
   */
  box.cancelPending = () => { cancelled = true; };

  paint();
  return box;
}
