/*
 * ttf.js — the four questions a PDF asks of a font, and nothing else.
 *
 * Embedding a font in a PDF does not require understanding it. It requires the
 * bytes, verbatim, plus four things about them: how many units are in an em,
 * which glyph a character is, how wide that glyph is, and the box the glyphs
 * live in. Outlines, hinting, kerning, ligatures and every other table are
 * copied through untouched and read by the PDF reader, not by this.
 *
 * That is why there is no font subsetting here either. Subsetting means
 * rebuilding `glyf`, `loca`, `cmap` and `hmtx` and getting all four consistent,
 * which is a real piece of work to save 40KB in a file that already carries
 * photographs — and a rebuilt font that is subtly wrong fails in the worst way
 * available, which is a document that looks fine on the machine that made it.
 */

/** Reads the tables a PDF font object needs out of a TrueType file. */
export function parseTtf(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(4);
  const tables = new Map();
  for (let i = 0; i < numTables; i += 1) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
    tables.set(tag, { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) });
  }
  for (const need of ['head', 'hhea', 'hmtx', 'maxp', 'cmap']) {
    if (!tables.has(need)) throw new Error('the font has no ' + need + ' table');
  }

  const head = tables.get('head').offset;
  const hhea = tables.get('hhea').offset;
  const unitsPerEm = view.getUint16(head + 18);
  const bbox = [
    view.getInt16(head + 36), view.getInt16(head + 38),
    view.getInt16(head + 40), view.getInt16(head + 42),
  ];
  const ascent = view.getInt16(hhea + 4);
  const descent = view.getInt16(hhea + 6);
  const numberOfHMetrics = view.getUint16(hhea + 34);
  const numGlyphs = view.getUint16(tables.get('maxp').offset + 4);
  const hmtx = tables.get('hmtx').offset;
  const cmap = readCmap(view, tables.get('cmap').offset);

  /*
   * The last entry of `hmtx` is the advance of every glyph after it. Monospaced
   * and near-monospaced fonts use that to store one width for a long tail of
   * glyphs, and reading past the end of the array is the bug it causes.
   */
  function advance(gid) {
    const i = gid < numberOfHMetrics ? gid : numberOfHMetrics - 1;
    return view.getUint16(hmtx + i * 4);
  }

  return {
    bytes,
    /*
     * Filled by the writer as it encodes: glyph number to the character it came
     * from. It lives on the font because that is what the PDF's ToUnicode map
     * is per, and because the map has to hold exactly the glyphs the document
     * used — a map of all 445 would list glyphs the file never draws.
     */
    toUnicode: new Map(),
    unitsPerEm,
    bbox,
    ascent,
    descent,
    numGlyphs,
    advance,
    gidFor: (codePoint) => cmap.get(codePoint) || 0,
    /** True when every character of the string has a glyph in this font. */
    covers: (text) => Array.from(String(text)).every((ch) => (cmap.get(ch.codePointAt(0)) || 0) !== 0),
  };
}

/*
 * The character-to-glyph map.
 *
 * A font carries several, for platforms that stopped existing. The two worth
 * reading are format 4, which is the Basic Multilingual Plane in a segmented
 * array and covers Hebrew and Latin, and format 12, which is a flat list of
 * ranges and reaches past U+FFFF. Both are read here and merged, with format 12
 * winning where they disagree, because a font that ships both means the wide
 * one to be authoritative.
 */
function readCmap(view, offset) {
  const map = new Map();
  const numSubtables = view.getUint16(offset + 2);
  const candidates = [];
  for (let i = 0; i < numSubtables; i += 1) {
    const at = offset + 4 + i * 8;
    candidates.push({
      platform: view.getUint16(at),
      encoding: view.getUint16(at + 2),
      at: offset + view.getUint32(at + 4),
    });
  }
  /* Windows Unicode subtables first, then anything else that parses. */
  const wanted = candidates.filter((c) => (c.platform === 3 && (c.encoding === 1 || c.encoding === 10))
    || c.platform === 0);
  const order = wanted.length ? wanted : candidates;

  for (const sub of order.sort((a, b) => format(view, a.at) - format(view, b.at))) {
    const f = format(view, sub.at);
    if (f === 4) readFormat4(view, sub.at, map);
    else if (f === 12) readFormat12(view, sub.at, map);
  }
  if (!map.size) throw new Error('the font has no character map this can read');
  return map;
}

function format(view, at) {
  return view.getUint16(at);
}

function readFormat4(view, at, map) {
  const segCountX2 = view.getUint16(at + 6);
  const segCount = segCountX2 / 2;
  const endAt = at + 14;
  const startAt = endAt + segCountX2 + 2;
  const deltaAt = startAt + segCountX2;
  const rangeAt = deltaAt + segCountX2;

  for (let s = 0; s < segCount; s += 1) {
    const end = view.getUint16(endAt + s * 2);
    const start = view.getUint16(startAt + s * 2);
    if (start > end) continue;
    const delta = view.getInt16(deltaAt + s * 2);
    const rangeOffset = view.getUint16(rangeAt + s * 2);
    for (let cp = start; cp <= end && cp !== 0xffff; cp += 1) {
      let gid;
      if (rangeOffset === 0) {
        gid = (cp + delta) & 0xffff;
      } else {
        /* The glyph id array is addressed from the range offset's own slot,
         * which is the one piece of format 4 that reads like a mistake and is
         * not one. */
        const gidAt = rangeAt + s * 2 + rangeOffset + (cp - start) * 2;
        gid = view.getUint16(gidAt);
        if (gid !== 0) gid = (gid + delta) & 0xffff;
      }
      if (gid) map.set(cp, gid);
    }
  }
}

function readFormat12(view, at, map) {
  const groups = view.getUint32(at + 12);
  for (let g = 0; g < groups; g += 1) {
    const rec = at + 16 + g * 12;
    const start = view.getUint32(rec);
    const end = view.getUint32(rec + 4);
    const startGid = view.getUint32(rec + 8);
    for (let cp = start; cp <= end; cp += 1) map.set(cp, startGid + (cp - start));
  }
}

/** base64 to bytes, in a way that works in a browser and in Node. */
export function decodeBase64(b64) {
  if (typeof atob === 'function') {
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }
  /* eslint-disable-next-line no-undef -- Node's Buffer, on the checking path. */
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
