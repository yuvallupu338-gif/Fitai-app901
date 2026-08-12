/*
 * savewarn.js — what the app says when the device would not keep the answer.
 *
 * Two screens write to storage and both can fail the same two ways, so the
 * wording lives in one place. It matters that the two are told apart: "delete a
 * photograph" is useless advice to somebody whose browser has storage switched
 * off entirely, and "download the file before you close the tab" is the wrong
 * advice to somebody who simply has six pictures in one work.
 */

import { h, clear } from '../../../src/core/dom.js';

const TEXT = {
  quota: 'אין מקום לשמור את זה במכשיר — כנראה בגלל התמונות. מחקו תמונה, או הורידו גיבוי מהלשונית "הקובץ" לפני שתסגרו.',
  blocked: 'הדפדפן הזה לא נותן לשמור. אפשר להמשיך לעבוד ולהוריד את הקובץ, אבל אל תסגרו את הלשונית לפני שהורדתם אותו.',
};

/** Paints the message for `kind` into `box`, or empties it when nothing failed. */
export function paintSaveError(box, kind) {
  clear(box);
  if (!kind) return false;
  box.appendChild(h('div.warnbox.hot', TEXT[kind] || TEXT.blocked));
  return true;
}
