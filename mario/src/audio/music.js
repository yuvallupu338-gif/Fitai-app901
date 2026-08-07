/*
 * music.js — the songs, written as text.
 *
 * Every track is a string of steps at sixteenth-note resolution, read left to
 * right by the sequencer in audio.js:
 *
 *   C5    strike this note
 *   .     hold whatever is sounding
 *   -     rest
 *   k h   on a noise track: kick, hat
 *
 * These are original tunes written to sit in the same idiom as the era — a
 * pulse lead, a pulse harmony a third or a sixth under it, a triangle bass
 * walking the root and fifth, and a noise channel keeping time. They are not
 * transcriptions of anything; the point is that the *shape* is familiar, in
 * the way that a level made of pipes and blocks is familiar.
 *
 * The arrangement rules are the ones the hardware imposed and which still
 * make chip music read clearly at low volume: the lead never leaves the
 * octave it started in for long, the bass only ever plays roots and fifths,
 * and nothing ever plays more than four notes at once.
 */

const seq = (s) => s.trim().split(/\s+/);

/* Length in steps is however long the longest track is; shorter tracks loop
   inside it, which is how a one-bar drum pattern sits under a four-bar tune
   without being written out four times. */
function song(spec) {
  const length = spec.tracks.reduce((n, t) => Math.max(n, t.data.length), 0);
  return { ...spec, length };
}

/* ------------------------------------------------------------------ *
 * Level themes
 * ------------------------------------------------------------------ */

export const SONGS = {
  /* Bright, four bars, the tune you hear most. Kept deliberately simple:
     it repeats every twelve seconds for as long as a level lasts. */
  overworld: song({
    bpm: 152,
    loop: true,
    tracks: [
      { wave: 'square', gain: 0.15, data: seq(`
        C5 . E5 . G5 . E5 .  C5 . D5 . E5 . -  .
        F5 . E5 . D5 . C5 .  D5 . .  . -  . -  .
        E5 . G5 . C6 . G5 .  E5 . F5 . G5 . -  .
        A5 . G5 . F5 . E5 .  C5 . .  . -  . -  .
      `) },
      { wave: 'square', gain: 0.07, data: seq(`
        E4 . G4 . C5 . G4 .  E4 . F4 . G4 . -  .
        A4 . G4 . F4 . E4 .  F4 . .  . -  . -  .
        G4 . C5 . E5 . C5 .  G4 . A4 . B4 . -  .
        C5 . B4 . A4 . G4 .  E4 . .  . -  . -  .
      `) },
      { wave: 'triangle', gain: 0.2, legato: true, data: seq(`
        C3 . . . G3 . . .  C3 . . . G3 . . .
        F3 . . . C3 . . .  G3 . . . G3 . . .
        C3 . . . G3 . . .  C3 . . . E3 . . .
        F3 . . . G3 . . .  C3 . . . C3 . . .
      `) },
      { wave: 'noise', gain: 0.06, data: seq('k - h - - - h -  k - h - h - h -') },
    ],
  }),

  /* Underground: fewer notes, lower, and a rest where you expect a note.
     The silence is the effect. */
  underground: song({
    bpm: 132,
    loop: true,
    tracks: [
      { wave: 'square', gain: 0.16, data: seq(`
        G4 - F4 - D#4 - C4 -  -  -  -  -  -  -  -  -
        A#3 - C4 - D#4 - C4 -  -  -  -  -  -  -  -  -
        G4 - A#4 - G4 - F4 -  D#4 - -  -  -  -  -  -
        C4 - -  -  C4 - -  -  -  -  -  -  -  -  -  -
      `) },
      { wave: 'triangle', gain: 0.22, legato: true, data: seq(`
        C2 . . . . . . .  G2 . . . . . . .
        A#1 . . . . . . .  F2 . . . . . . .
        C2 . . . . . . .  G2 . . . . . . .
        C2 . . . . . . .  C2 . . . . . . .
      `) },
    ],
  }),

  /* Water: a swung arpeggio that never lands hard, so the level feels like
     it is drifting rather than marching. */
  water: song({
    bpm: 120,
    loop: true,
    tracks: [
      { wave: 'triangle', gain: 0.14, legato: true, data: seq(`
        E5 . C5 . G4 . C5 .  E5 . G5 . E5 . C5 .
        D5 . B4 . G4 . B4 .  D5 . F5 . D5 . B4 .
        C5 . A4 . F4 . A4 .  C5 . E5 . C5 . A4 .
        G4 . B4 . D5 . G5 .  E5 . D5 . C5 . -  .
      `) },
      { wave: 'square', gain: 0.06, data: seq(`
        -  -  -  -  G5 .  -  -  -  -  -  -  C6 .  -  -
        -  -  -  -  F5 .  -  -  -  -  -  -  B5 .  -  -
        -  -  -  -  E5 .  -  -  -  -  -  -  A5 .  -  -
        -  -  -  -  D5 .  -  -  -  -  -  -  G5 .  -  -
      `) },
      { wave: 'triangle', gain: 0.18, legato: true, data: seq(`
        C3 . . . . . . .  C3 . . . . . . .
        G2 . . . . . . .  G2 . . . . . . .
        F2 . . . . . . .  F2 . . . . . . .
        G2 . . . . . . .  G2 . . . . . . .
      `) },
    ],
  }),

  /* Castle: chromatic, fast, and low. Two bars, because a castle is short
     and the loop wants to feel like it is closing in. */
  castle: song({
    bpm: 168,
    loop: true,
    tracks: [
      { wave: 'square', gain: 0.13, data: seq(`
        C4 C#4 D4 D#4 E4 F4 F#4 G4  G4 F#4 F4 E4 D#4 D4 C#4 C4
        F4 F#4 G4 G#4 A4 A#4 B4 C5  C5 B4 A#4 A4 G#4 G4 F#4 F4
      `) },
      { wave: 'triangle', gain: 0.24, legato: true, data: seq(`
        C2 . . . . . . .  C2 . . . . . . .
        F2 . . . . . . .  F2 . . . . . . .
      `) },
      { wave: 'noise', gain: 0.05, data: seq('k - - - k - - - k - - - k - h h') },
    ],
  }),

  /* Star: the same key, twice the speed, all eighths. It has to be obvious
     from the first note that the rules changed. */
  star: song({
    bpm: 220,
    loop: true,
    tracks: [
      { wave: 'square', gain: 0.15, data: seq(`
        C5 E5 G5 C6 G5 E5 C5 E5  G5 C6 E6 C6 G5 E5 C5 G4
        D5 F5 A5 D6 A5 F5 D5 F5  A5 D6 F6 D6 A5 F5 D5 A4
      `) },
      { wave: 'triangle', gain: 0.2, data: seq(`
        C3 C3 G3 G3 C3 C3 G3 G3  C3 C3 G3 G3 C3 C3 G3 G3
        D3 D3 A3 A3 D3 D3 A3 A3  D3 D3 A3 A3 D3 D3 A3 A3
      `) },
      { wave: 'noise', gain: 0.07, data: seq('k h k h k h k h  k h k h k h k h') },
    ],
  }),

  /* The overworld tune with the lead an octave down and the drums out:
     played on snow and night levels so those worlds sound like themselves
     without needing another song. */
  night: song({
    bpm: 128,
    loop: true,
    tracks: [
      { wave: 'triangle', gain: 0.16, legato: true, data: seq(`
        C4 . E4 . G4 . E4 .  C4 . D4 . E4 . -  .
        F4 . E4 . D4 . C4 .  D4 . .  . -  . -  .
        E4 . G4 . C5 . G4 .  E4 . F4 . G4 . -  .
        A4 . G4 . F4 . E4 .  C4 . .  . -  . -  .
      `) },
      { wave: 'triangle', gain: 0.18, legato: true, data: seq(`
        C2 . . . G2 . . .  C2 . . . G2 . . .
        F2 . . . C2 . . .  G2 . . . G2 . . .
        C2 . . . G2 . . .  C2 . . . E2 . . .
        F2 . . . G2 . . .  C2 . . . C2 . . .
      `) },
    ],
  }),

  /* The level-select and title screen. Slow, major, and content to sit
     under a menu for a while. */
  title: song({
    bpm: 108,
    loop: true,
    tracks: [
      { wave: 'square', gain: 0.12, data: seq(`
        G4 .  .  .  C5 .  .  .  E5 .  D5 .  C5 .  .  .
        A4 .  .  .  D5 .  .  .  F5 .  E5 .  D5 .  .  .
        B4 .  .  .  E5 .  .  .  G5 .  F5 .  E5 .  .  .
        C5 .  E5 .  G5 .  E5 .  C5 .  .  .  -  .  .  .
      `) },
      { wave: 'triangle', gain: 0.18, legato: true, data: seq(`
        C3 . . . . . . .  G2 . . . . . . .
        F2 . . . . . . .  C3 . . . . . . .
        G2 . . . . . . .  D3 . . . . . . .
        C3 . . . . . . .  G2 . . . . . . .
      `) },
    ],
  }),
};

/* ------------------------------------------------------------------ *
 * Jingles — played once, then control goes back to whatever was asked for.
 * ------------------------------------------------------------------ */

export const JINGLES = {
  levelStart: song({
    bpm: 150,
    loop: false,
    tracks: [
      { wave: 'square', gain: 0.16, data: seq('C5 . E5 . G5 . C6 . -  . -  .') },
      { wave: 'triangle', gain: 0.18, data: seq('C3 . . . G3 . . . C4 . . . -  .') },
    ],
  }),

  clear: song({
    bpm: 150,
    loop: false,
    tracks: [
      { wave: 'square', gain: 0.17, data: seq(`
        C5 . E5 . G5 . C6 .  E6 . C6 . G5 . E5 .
        F5 . A5 . C6 . F6 .  A6 . -  . -  . -  .
      `) },
      { wave: 'triangle', gain: 0.2, legato: true, data: seq(`
        C3 . . . C3 . . .  G3 . . . G3 . . .
        F3 . . . F3 . . .  C3 . . . -  . . .
      `) },
    ],
  }),

  worldClear: song({
    bpm: 140,
    loop: false,
    tracks: [
      { wave: 'square', gain: 0.17, data: seq(`
        G4 . C5 . E5 . G5 .  C6 . G5 . E5 . C5 .
        F5 . A5 . C6 . A5 .  G5 . E5 . C5 . .  .
        C5 . E5 . G5 . C6 .  E6 . G6 . C7 . .  .
      `) },
      { wave: 'triangle', gain: 0.2, legato: true, data: seq(`
        C3 . . . . . . .  C3 . . . . . . .
        F3 . . . . . . .  G3 . . . . . . .
        C3 . . . . . . .  C3 . . . . . . .
      `) },
    ],
  }),

  death: song({
    bpm: 140,
    loop: false,
    tracks: [
      { wave: 'square', gain: 0.16, data: seq(`
        C5 . -  . B4 . A#4 .  A4 . G#4 . G4 . -  .
        F4 . -  . D4 . -  .  C4 . .  . -  . -  .
      `) },
      { wave: 'triangle', gain: 0.16, data: seq(`
        -  . -  . -  . -  .  C3 . . . -  . -  .
        A#2 . . . G2 . . .  C2 . . . -  . -  .
      `) },
    ],
  }),

  gameOver: song({
    bpm: 96,
    loop: false,
    tracks: [
      { wave: 'square', gain: 0.16, data: seq(`
        E4 . -  . E4 . -  .  D4 . -  . C4 . -  .
        A#3 . -  . A3 . -  .  G3 . .  . -  . -  .
      `) },
      { wave: 'triangle', gain: 0.2, legato: true, data: seq(`
        C3 . . . . . . .  G2 . . . . . . .
        F2 . . . . . . .  C2 . . . . . . .
      `) },
    ],
  }),

  oneUp: song({
    bpm: 190,
    loop: false,
    tracks: [
      { wave: 'square', gain: 0.2, data: seq('E5 G5 E6 C6 D6 G6 -  -') },
    ],
  }),

  ending: song({
    bpm: 128,
    loop: false,
    tracks: [
      { wave: 'square', gain: 0.16, data: seq(`
        C5 . E5 . G5 . C6 .  B5 . G5 . E5 . C5 .
        D5 . F5 . A5 . D6 .  C6 . A5 . F5 . D5 .
        E5 . G5 . C6 . E6 .  G6 . E6 . C6 . G5 .
        C6 . .  . .  . .  .  -  . -  . -  . -  .
      `) },
      { wave: 'square', gain: 0.07, data: seq(`
        E4 . G4 . C5 . E5 .  D5 . C5 . G4 . E4 .
        F4 . A4 . D5 . F5 .  E5 . D5 . A4 . F4 .
        G4 . C5 . E5 . G5 .  C6 . G5 . E5 . C5 .
        E5 . .  . .  . .  .  -  . -  . -  . -  .
      `) },
      { wave: 'triangle', gain: 0.2, legato: true, data: seq(`
        C3 . . . G3 . . .  C3 . . . G3 . . .
        D3 . . . A3 . . .  D3 . . . A3 . . .
        C3 . . . G3 . . .  C3 . . . G3 . . .
        C3 . . . . . . .  -  . . . . . . .
      `) },
    ],
  }),
};

/* Which song a level's theme asks for. Kept here rather than in the catalogue
   so adding a theme cannot leave a level silent. */
export function musicForTheme(theme, castle) {
  if (castle) return 'castle';
  switch (theme) {
    case 'underground': case 'volcano': return 'underground';
    case 'water': return 'water';
    case 'castle': return 'castle';
    case 'night': case 'snow': return 'night';
    default: return 'overworld';
  }
}
