/*
 * pdfimages.js — the photographs, on their way into the PDF.
 *
 * The only part of the PDF path that needs a browser. A stored picture is a
 * data URL of whatever the person's phone produced; a PDF wants raw JPEG bytes
 * and the dimensions that go with them. Turning one into the other is a decode
 * and an encode, which is a canvas, which is not something a checking script
 * has — so it lives here on its own and everything else stays testable.
 *
 * Re-encoding rather than passing the stored bytes through is deliberate. The
 * app stores at 1400px because that is what a screen wants; a page is 360pt
 * wide at most, and printing at 300dpi makes 1200px the last useful pixel. A
 * portfolio with six photographs at full size is a mail attachment that bounces.
 */

const MAX_PX = 1200;
const QUALITY = 0.82;

/**
 * Reads every picture in the portfolio and returns src -> JPEG bytes.
 *
 * A picture that fails to decode is left out rather than thrown over: the file
 * is worth having with five of its six pictures, and the one that failed was
 * already broken before this app saw it.
 */
export async function preparePdfImages(portfolio) {
  const out = new Map();
  const works = (portfolio && portfolio.works) || [];
  for (const work of works) {
    for (const picture of work.images || []) {
      if (out.has(picture.src)) continue;
      try {
        out.set(picture.src, await toJpegBytes(picture.src));
      } catch (e) {
        console.error(e);
      }
    }
  }
  return out;
}

function toJpegBytes(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        /* A PNG with transparency becomes black where it was clear unless
         * something is painted under it, and a portfolio full of black squares
         * is a worse bug than a slightly larger file. */
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/jpeg', QUALITY);
        const base64 = url.slice(url.indexOf(',') + 1);
        const raw = atob(base64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
        resolve(bytes);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('the picture could not be decoded'));
    img.src = src;
  });
}
