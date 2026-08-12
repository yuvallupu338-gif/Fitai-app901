/*
 * download.js — handing the file to the person.
 *
 * The only module in the export path that touches the DOM, kept apart from the
 * three that build strings so those stay importable by Node and testable
 * without a browser.
 */

/** Saves bytes as a file. The PDF is the one thing here that is not text. */
export function downloadBytes(fileName, bytes, mime) {
  return downloadBlob(fileName, new Blob([bytes], { type: mime || 'application/octet-stream' }));
}

/**
 * Saves text as a file.
 *
 * The object URL is revoked on a timer rather than immediately after the click:
 * a browser that has not finished reading the blob when the URL is released
 * saves an empty file, and the failure looks exactly like an app bug to the
 * person watching. A second is far longer than any browser needs and costs
 * nothing to hold.
 */
export function downloadText(fileName, text, mime) {
  return downloadBlob(fileName, new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }));
}

function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/**
 * Prints the document, which on every desktop browser is also "save as PDF".
 *
 * It prints a copy in a hidden frame rather than the app's own page, because
 * what should come out is the document — the file the person is about to send —
 * and not the app around it with its tabs and buttons hidden by a print
 * stylesheet that has to be maintained forever.
 *
 * The frame is deliberately not sandboxed. `sandbox` without `allow-modals`
 * makes `print()` a no-op, and the content here is a document this app just
 * built with no script in it at all.
 */
export function printHtml(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.inset = '0 auto auto 0';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.opacity = '0';
  frame.style.border = '0';
  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (e) {
      console.error(e);
    }
    /* Removed on a timer because the print dialog is modal in some browsers and
     * synchronous in others; pulling the frame out from under an open dialog
     * cancels the job. */
    setTimeout(() => frame.remove(), 60000);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
  return frame;
}
