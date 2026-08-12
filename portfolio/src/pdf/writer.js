/*
 * writer.js — the PDF file format, as much of it as one document needs.
 *
 * A PDF is a list of numbered objects, a table of where each one starts, and a
 * trailer pointing at the catalogue. Text is drawn by choosing a font, setting
 * a position, and handing over a string of glyph numbers. There is no layout in
 * the format at all — no lines, no paragraphs, no direction — which is why
 * `layout.js` and `bidi.js` exist and why this file is only the writing down.
 *
 * The font is embedded whole, as a CID font with Identity-H encoding, which is
 * the arrangement that lets a string be glyph ids rather than characters. That
 * matters for Hebrew: with a simple encoding a PDF reader would have to map
 * characters to glyphs itself, using tables that assume Latin, and the result
 * is the well-known PDF that shows Hebrew as a row of blanks on somebody else's
 * machine. Identity-H asks nothing of the reader — the glyphs are named by
 * number and the numbers come from the font in the file.
 *
 * Every string also goes into a ToUnicode map, which is what makes the text
 * selectable, searchable and extractable rather than a picture of writing. It
 * is the difference between a portfolio an employer's software can read and one
 * it silently scores as empty, and it costs about thirty lines.
 *
 * Streams are not compressed. A portfolio is a few pages of text and its size
 * is decided by the photographs in it, which arrive already compressed as JPEG
 * and are copied through untouched; deflating the text would save a few
 * kilobytes and cost a compression implementation.
 */

import { drawnChar } from './bidi.js';

const LATIN = new TextEncoder();

/** One glyph run, encoded as the hex string a Tj operator takes. */
export function encodeGlyphs(font, text, rtl) {
  let hex = '';
  for (const ch of String(text)) {
    const drawn = drawnChar(ch, rtl);
    const gid = font.gidFor(drawn.codePointAt(0));
    /* A character the font does not have is dropped rather than drawn as glyph
     * zero, which every reader shows as a hollow box. The audit asserts the
     * font covers the alphabets this app writes in, so reaching here means
     * somebody pasted an emoji into their portfolio. */
    if (!gid) continue;
    hex += gid.toString(16).padStart(4, '0');
    if (!font.toUnicode.has(gid)) font.toUnicode.set(gid, ch.codePointAt(0));
  }
  return hex;
}

/* ------------------------------------------------------------------ *
 * Content stream operators
 * ------------------------------------------------------------------ */

const n = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export const op = {
  text: (x, y, fontId, size, hex) => `BT /${fontId} ${n(size)} Tf 1 0 0 1 ${n(x)} ${n(y)} Tm <${hex}> Tj ET`,
  fill: (rgb) => `${n(rgb[0])} ${n(rgb[1])} ${n(rgb[2])} rg`,
  stroke: (rgb) => `${n(rgb[0])} ${n(rgb[1])} ${n(rgb[2])} RG`,
  rect: (x, y, w, h) => `${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`,
  line: (x1, y1, x2, y2, w) => `${n(w)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`,
  image: (id, x, y, w, h) => `q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(y)} cm /${id} Do Q`,
  /* A rounded rectangle, drawn as four corners of bezier. Chips are the only
   * thing in the document with a radius, and a square chip reads as a table. */
  roundedRect: (x, y, w, h, r) => {
    const k = r * 0.5523;
    return [
      `${n(x + r)} ${n(y)} m`,
      `${n(x + w - r)} ${n(y)} l`,
      `${n(x + w - r + k)} ${n(y)} ${n(x + w)} ${n(y + r - k)} ${n(x + w)} ${n(y + r)} c`,
      `${n(x + w)} ${n(y + h - r)} l`,
      `${n(x + w)} ${n(y + h - r + k)} ${n(x + w - r + k)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)} c`,
      `${n(x + r)} ${n(y + h)} l`,
      `${n(x + r - k)} ${n(y + h)} ${n(x)} ${n(y + h - r + k)} ${n(x)} ${n(y + h - r)} c`,
      `${n(x)} ${n(y + r)} l`,
      `${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)} c`,
      'f',
    ].join(' ');
  },
};

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

/**
 * Reads a JPEG's size and colour space out of its own header.
 *
 * The bytes go into the PDF exactly as they arrived — a JPEG is already the
 * compression a PDF calls DCTDecode, so re-encoding it would cost quality to
 * achieve nothing. What the PDF still needs is the three numbers the format
 * keeps inside the frame header.
 */
export function readJpeg(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at < bytes.length - 9) {
    if (bytes[at] !== 0xff) { at += 1; continue; }
    const marker = bytes[at + 1];
    /* The frame headers: baseline, extended, progressive and their friends.
     * C4, C8 and CC are tables and code definitions, not frames. */
    const isFrame = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (isFrame) {
      const height = (bytes[at + 5] << 8) | bytes[at + 6];
      const width = (bytes[at + 7] << 8) | bytes[at + 8];
      const components = bytes[at + 9];
      const space = components === 1 ? 'DeviceGray' : components === 4 ? 'DeviceCMYK' : 'DeviceRGB';
      if (!width || !height) return null;
      return { width, height, space, bytes };
    }
    at += 2 + length;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The file
 * ------------------------------------------------------------------ */

/**
 * Assembles the document.
 *
 * @param {Object} spec  { title, lang, fonts: [{id, name, font}], images: [{id, jpeg}],
 *                         pages: [{width, height, ops: [String]}] }
 * @returns {Uint8Array}
 */
export function buildPdf(spec) {
  const chunks = [];
  const offsets = [0];
  let length = 0;

  const push = (bytes) => { chunks.push(bytes); length += bytes.length; };
  const pushText = (text) => push(LATIN.encode(text));
  const object = (body) => {
    offsets.push(length);
    const id = offsets.length - 1;
    pushText(`${id} 0 obj\n`);
    if (typeof body === 'string') pushText(body);
    else body();
    pushText('\nendobj\n');
    return id;
  };
  /* Object numbers have to be known before the objects that point at them are
   * written, so ids are reserved first and filled in as we go. */
  const reserve = () => {
    offsets.push(-1);
    return offsets.length - 1;
  };
  const fill = (id, body) => {
    offsets[id] = length;
    pushText(`${id} 0 obj\n`);
    if (typeof body === 'string') pushText(body);
    else body();
    pushText('\nendobj\n');
  };

  pushText('%PDF-1.7\n');
  /* Four bytes over 127 tell every tool that has ever existed that this file is
   * binary and must not be transferred as text. */
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const catalogId = reserve();
  const pagesId = reserve();
  const pageIds = spec.pages.map(() => reserve());
  const fontIds = new Map(spec.fonts.map((f) => [f.id, reserve()]));
  const imageIds = new Map((spec.images || []).map((im) => [im.id, reserve()]));
  const infoId = reserve();

  /* Fonts: the Type0 wrapper, the CID font, the descriptor, the file itself and
   * the ToUnicode map — five objects each, which is what a font costs. */
  for (const face of spec.fonts) {
    const font = face.font;
    const fileId = reserve();
    const descriptorId = reserve();
    const cidId = reserve();
    const toUnicodeId = reserve();

    fill(fileId, () => {
      pushText(`<< /Length ${font.bytes.length} /Length1 ${font.bytes.length} >>\nstream\n`);
      push(font.bytes);
      pushText('\nendstream');
    });

    const scale = 1000 / font.unitsPerEm;
    fill(descriptorId, `<< /Type /FontDescriptor /FontName /${face.name} /Flags 4`
      + ` /FontBBox [${font.bbox.map((v) => Math.round(v * scale)).join(' ')}]`
      + ` /ItalicAngle 0 /Ascent ${Math.round(font.ascent * scale)}`
      + ` /Descent ${Math.round(font.descent * scale)} /CapHeight ${Math.round(font.ascent * scale)}`
      + ` /StemV ${face.bold ? 140 : 80} /FontFile2 ${fileId} 0 R >>`);

    fill(cidId, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${face.name}`
      + ' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>'
      + ` /FontDescriptor ${descriptorId} 0 R /DW 1000 /W [${widthsArray(font, scale)}]`
      + ' /CIDToGIDMap /Identity >>');

    fill(toUnicodeId, () => {
      const cmap = toUnicodeCmap(font);
      pushText(`<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`);
    });

    fill(fontIds.get(face.id), `<< /Type /Font /Subtype /Type0 /BaseFont /${face.name}`
      + ` /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${toUnicodeId} 0 R >>`);
  }

  for (const image of spec.images || []) {
    fill(imageIds.get(image.id), () => {
      pushText(`<< /Type /XObject /Subtype /Image /Width ${image.jpeg.width} /Height ${image.jpeg.height}`
        + ` /ColorSpace /${image.jpeg.space} /BitsPerComponent 8 /Filter /DCTDecode`
        + ` /Length ${image.jpeg.bytes.length} >>\nstream\n`);
      push(image.jpeg.bytes);
      pushText('\nendstream');
    });
  }

  const fontResources = spec.fonts.map((f) => `/${f.id} ${fontIds.get(f.id)} 0 R`).join(' ');
  const imageResources = (spec.images || []).map((im) => `/${im.id} ${imageIds.get(im.id)} 0 R`).join(' ');

  spec.pages.forEach((page, i) => {
    const contentId = object(() => {
      const body = page.ops.join('\n');
      pushText(`<< /Length ${LATIN.encode(body).length} >>\nstream\n${body}\nendstream`);
    });
    fill(pageIds[i], `<< /Type /Page /Parent ${pagesId} 0 R`
      + ` /MediaBox [0 0 ${n(page.width)} ${n(page.height)}]`
      + ` /Resources << /Font << ${fontResources} >>`
      + (imageResources ? ` /XObject << ${imageResources} >>` : '')
      + ' /ProcSet [/PDF /Text /ImageC] >>'
      + ` /Contents ${contentId} 0 R >>`);
  });

  fill(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}]`
    + ` /Count ${pageIds.length} >>`);
  fill(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R /Lang (${spec.lang || 'he-IL'})`
    + ' /ViewerPreferences << /Direction /R2L >> >>');
  fill(infoId, `<< /Title ${utf16(spec.title || '')} /Producer (portfolio) /Creator (portfolio) >>`);

  const xrefAt = length;
  const count = offsets.length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i += 1) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pushText(xref);
  pushText(`trailer\n<< /Size ${count} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`);
  pushText(`startxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

/* Widths, one entry per glyph the document actually drew. The format is a list
 * of [firstCid [w w w …]] groups; consecutive glyphs share a group. */
function widthsArray(font, scale) {
  const gids = Array.from(font.toUnicode.keys()).sort((a, b) => a - b);
  const groups = [];
  let run = null;
  for (const gid of gids) {
    if (run && gid === run.first + run.widths.length) run.widths.push(Math.round(font.advance(gid) * scale));
    else {
      run = { first: gid, widths: [Math.round(font.advance(gid) * scale)] };
      groups.push(run);
    }
  }
  return groups.map((g) => `${g.first} [${g.widths.join(' ')}]`).join(' ');
}

/*
 * The map from glyph number back to the character it was.
 *
 * Without it a PDF reader has nothing to copy, nothing to search and nothing to
 * hand a screen reader: the file would be a picture of Hebrew. bfchar takes at
 * most 100 pairs per block, which is the only reason this is chunked.
 */
function toUnicodeCmap(font) {
  const entries = Array.from(font.toUnicode.entries()).sort((a, b) => a[0] - b[0]);
  const head = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n'
    + '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n'
    + '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
  let body = '';
  for (let i = 0; i < entries.length; i += 100) {
    const block = entries.slice(i, i + 100);
    body += `${block.length} beginbfchar\n`;
    for (const [gid, cp] of block) {
      body += `<${gid.toString(16).padStart(4, '0')}> <${utf16Hex(cp)}>\n`;
    }
    body += 'endbfchar\n';
  }
  return head + body + 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
}

function utf16Hex(codePoint) {
  if (codePoint <= 0xffff) return codePoint.toString(16).padStart(4, '0').toUpperCase();
  const v = codePoint - 0x10000;
  const hi = 0xd800 + (v >> 10);
  const lo = 0xdc00 + (v & 0x3ff);
  return (hi.toString(16) + lo.toString(16)).toUpperCase();
}

/* A PDF string in UTF-16BE, which is how a title stops being ASCII-only. */
function utf16(text) {
  let hex = 'FEFF';
  for (const ch of String(text)) hex += utf16Hex(ch.codePointAt(0));
  return `<${hex}>`;
}
