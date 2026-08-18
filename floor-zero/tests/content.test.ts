import { describe, expect, it } from 'vitest';
import {
  LINES,
  NOTES,
  OBJECTIVES,
  PHOTOS,
  PHOTO_BONUS,
  TAPES,
  type LocalizedText,
} from '../src/data/dialogue';
import { CHAPTERS } from '../src/data/chapters';

/**
 * Everything the player reads is authored in two languages by hand, which is
 * exactly the kind of data that rots silently: a missing translation shows up
 * as a blank subtitle in the middle of a scare, not as a crash.
 */

function everyLocalized(): Array<[string, LocalizedText]> {
  const entries: Array<[string, LocalizedText]> = [];
  for (const [key, value] of Object.entries(LINES)) entries.push([`LINES.${key}`, value]);
  for (const [key, value] of Object.entries(OBJECTIVES)) entries.push([`OBJECTIVES.${key}`, value]);
  for (const note of Object.values(NOTES)) {
    entries.push([`NOTES.${note.id}.title`, note.title]);
    entries.push([`NOTES.${note.id}.body`, note.body]);
  }
  for (const photo of [...PHOTOS, PHOTO_BONUS]) {
    entries.push([`PHOTOS.${photo.id}.caption`, photo.caption]);
    entries.push([`PHOTOS.${photo.id}.title`, photo.title]);
    entries.push([`PHOTOS.${photo.id}.body`, photo.body]);
  }
  for (const tape of Object.values(TAPES)) {
    entries.push([`TAPES.${tape.id}.title`, tape.title]);
    for (const [index, entry] of tape.lines.entries()) {
      entries.push([`TAPES.${tape.id}.lines[${index}]`, entry.text]);
    }
  }
  return entries;
}

describe('authored text', () => {
  it('has a non-empty Hebrew and English string for every entry', () => {
    const missing = everyLocalized()
      .filter(([, text]) => !text.he?.trim() || !text.en?.trim())
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it('does not leave the English identical to the Hebrew', () => {
    const untranslated = everyLocalized()
      .filter(([key, text]) => text.he === text.en && !key.startsWith('LINES.tutorial'))
      .map(([key]) => key);
    expect(untranslated).toEqual([]);
  });

  it('gives every chapter an objective that exists', () => {
    for (const chapter of CHAPTERS) {
      expect(OBJECTIVES[chapter.startObjective], chapter.id).toBeDefined();
    }
  });

  it('ships the hint lines each puzzle escalates through', () => {
    for (const key of [
      'hint_clocks_1',
      'hint_clocks_2',
      'hint_clocks_3',
      'hint_shutter',
      'hint_shutter_2',
      'hint_toys',
    ]) {
      expect(LINES[key], key).toBeDefined();
    }
  });

  it('leaves the counted clock line a placeholder to fill', () => {
    expect(LINES.c3_clock_locked.he).toContain('{0}');
    expect(LINES.c3_clock_locked.en).toContain('{0}');
  });
});

describe('the photographs', () => {
  it('has five collectibles plus one bonus, all with distinct ids', () => {
    expect(PHOTOS).toHaveLength(5);
    const ids = new Set([...PHOTOS, PHOTO_BONUS].map((photo) => photo.id));
    expect(ids.size).toBe(6);
  });

  it('draws a different artwork for each one', () => {
    const kinds = new Set([...PHOTOS, PHOTO_BONUS].map((photo) => photo.kind));
    expect(kinds.size).toBe(6);
  });

  it('keeps captions short enough to fit the white border', () => {
    for (const photo of [...PHOTOS, PHOTO_BONUS]) {
      expect(photo.caption.he.length, photo.id).toBeLessThanOrEqual(18);
      expect(photo.caption.en.length, photo.id).toBeLessThanOrEqual(18);
    }
  });
});
