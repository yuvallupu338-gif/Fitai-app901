import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/GameState';
import { rememberedNote, rememberedRoomLine } from '../src/world/Memory';

/**
 * The notice board quotes the behaviour profile back at the player, so these
 * tests care about one thing above all: it must never print a placeholder, an
 * id, or an empty slip, no matter how sparse the profile is.
 */

function stateWith(mutate: (state: GameState) => void): GameState {
  const state = new GameState();
  mutate(state);
  return state;
}

const NOT_FILLED = /\{0\}/;

describe('rememberedNote', () => {
  it('falls back to the generic notice when nothing has been observed', () => {
    const note = rememberedNote(new GameState());
    expect(note.board.he.length).toBeGreaterThan(0);
    expect(note.board.en.length).toBeGreaterThan(0);
    expect(note.body.he).toContain('00:17');
  });

  it('names the room the player actually lingered in', () => {
    const state = stateWith((s) => {
      s.behavior.roomDwell = { corridor: 400, apt02kids: 120, apt01: 30 };
    });
    const note = rememberedNote(state);
    // The corridor is where everyone spends their time; it says nothing.
    expect(note.board.he).toContain('חדר הילדים');
    expect(note.board.en).toContain("children's room");
  });

  it('names the door the player actually kept opening', () => {
    const state = stateWith((s) => {
      s.behavior.roomDwell = {};
      s.behavior.doorUse = { door_apt03: 7, door_apt01: 2 };
    });
    const note = rememberedNote(state);
    expect(note.board.he).toContain('03');
  });

  it('reads the junction bias in both directions', () => {
    const east = rememberedNote(
      stateWith((s) => {
        s.behavior.junctionBias = 0.8;
      }),
    );
    const west = rememberedNote(
      stateWith((s) => {
        s.behavior.junctionBias = -0.8;
      }),
    );
    expect(east.body.en).not.toBe(west.body.en);
  });

  it('ignores a junction bias too small to mean anything', () => {
    const note = rememberedNote(
      stateWith((s) => {
        s.behavior.junctionBias = 0.02;
      }),
    );
    expect(note.board.en).toBe('The floor logged your visit.');
  });

  it('changes what it says from one visit to the next', () => {
    const build = (visit: number): string =>
      rememberedNote(
        stateWith((s) => {
          s.run.visit = visit;
          s.behavior.roomDwell = { apt03: 90 };
          s.behavior.doorUse = { door_apt03: 4 };
          s.behavior.junctionBias = 0.6;
        }),
      ).board.en;
    const seen = new Set([build(1), build(2), build(3)]);
    expect(seen.size).toBe(3);
  });

  it('never leaves a placeholder unfilled', () => {
    const state = stateWith((s) => {
      s.behavior.roomDwell = { service: 50 };
      s.behavior.doorUse = { door_service: 3 };
      s.behavior.junctionBias = 0.9;
      s.behavior.observations = 200;
      s.behavior.averageSpeed = 2.6;
      s.run.notesRead = ['a', 'b', 'c'];
    });
    for (let visit = 0; visit < 8; visit++) {
      state.run.visit = visit;
      const note = rememberedNote(state);
      for (const text of [note.board, note.title, note.body]) {
        expect(text.he).not.toMatch(NOT_FILLED);
        expect(text.en).not.toMatch(NOT_FILLED);
        expect(text.he.trim().length).toBeGreaterThan(0);
        expect(text.en.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('never surfaces a raw room id when the room is unknown', () => {
    const note = rememberedNote(
      stateWith((s) => {
        s.behavior.roomDwell = { some_room_that_does_not_exist: 999 };
      }),
    );
    expect(note.board.he).not.toContain('some_room');
    expect(note.board.en).not.toContain('some_room');
  });
});

describe('rememberedRoomLine', () => {
  it('names a known room', () => {
    expect(rememberedRoomLine('control').en).toContain('control room');
    expect(rememberedRoomLine('apt01').he).toContain('01');
  });

  it('stays vague rather than printing an id it does not know', () => {
    const line = rememberedRoomLine('nowhere');
    expect(line.en).toBe('We know where you are.');
    expect(line.he).not.toContain('nowhere');
  });

  it('never leaves a placeholder unfilled', () => {
    for (const room of ['corridor', 'apt02kids', 'service', 'elevator', '']) {
      const line = rememberedRoomLine(room);
      expect(line.he).not.toMatch(NOT_FILLED);
      expect(line.en).not.toMatch(NOT_FILLED);
    }
  });
});
