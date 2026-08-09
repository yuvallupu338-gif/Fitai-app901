/*
 * endings.js — how the night finishes, and how the game decides which one.
 *
 * Nothing is labelled good or bad, including in here. The resolver takes the
 * decision the player made, the things they found, and the things they did,
 * and picks the outcome that follows from them. Two players who both "stayed
 * on at the last stop" can get three different endings depending on whether
 * they ever spoke to anyone.
 *
 * The text is written to close the scene and not the mystery.
 */

export const ENDINGS = {
  ordinary: {
    id: 'ordinary',
    title: 'AN ORDINARY NIGHT',
    order: 1,
    lines: [
      'You step off, and the doors close behind you, and the train goes on without you.',
      'The platform smells of rain and iron. Somewhere above, a bus pulls away from a stop it has been standing at all night.',
      'You walk home. You are asleep before one.',
      'In the morning you will read that the last service on Line 4 was cancelled, and you will assume you are thinking of a different night.',
    ],
    epilogue: 'You got off early. Nothing happened to you. That is not the same as nothing happening.',
  },

  wrong_station: {
    id: 'wrong_station',
    title: 'THE WRONG STATION',
    order: 2,
    lines: [
      'Your shoes find the platform. It takes the sound out of them.',
      'Behind you the doors close, unhurried, and the train pulls out, and the light of it runs away down the tunnel and does not come back.',
      'There is no exit sign. There are stairs. The stairs go up for a long time and arrive at a corridor with a platform at the end of it, and the platform is this one.',
      'The board says a train is due. The board has always said a train is due.',
    ],
    epilogue: 'Some of these platforms are on the map. This one was not.',
  },

  home: {
    id: 'home',
    title: 'HOME',
    order: 3,
    lines: [
      'ELMWOOD. You have come up these stairs ten thousand times and your feet know every one of them.',
      'The barrier reads your card and lets you through without comment, which is the most extraordinary thing that has happened tonight.',
      'Behind you the 00:47 leaves, and it is very quiet, and through the last window of the last carriage somebody who is still on it raises one hand.',
      'You do not wave back. You are almost certain that you do not wave back.',
    ],
    epilogue: 'You knew which station was yours, because you checked. That is the entire trick.',
    good: true,
  },

  loop: {
    id: 'loop',
    title: 'THE LOOP',
    order: 4,
    lines: [
      'LAST STOP. Everyone must leave the train, and you are everyone.',
      'The platform runs to a staircase, and the staircase to a passage, and the passage opens onto a concourse you know: the clock, the closed kiosk, the four white letters over the arch.',
      'CENTRAL.',
      'On the indicator board, one service. 00:47. Two minutes.',
      'You could wait on the bench. People do. You can tell which ones, because they do not look up when a train comes in.',
    ],
    epilogue: 'The log book was right. It is always on time.',
  },

  empty_train: {
    id: 'empty_train',
    title: 'THE EMPTY TRAIN',
    order: 5,
    lines: [
      'You stay where you are. The doors stand open on a platform with nothing on it, and then they close, and the train moves off.',
      'You walk the length of it. Four carriages, fifty-four seats each, and every one of them empty, and every one of them warm.',
      'The display gives up somewhere after the second hour and shows only the time, which does not change.',
      'You stop being frightened at some point. You could not say when. It is a long way to the next station and you have started to hope there is not one.',
    ],
    epilogue: 'Nobody ever told you to get off. Nobody was left to.',
  },

  last_passenger: {
    id: 'last_passenger',
    title: 'THE LAST PASSENGER',
    order: 6,
    lines: [
      '“Don’t get off,” he says again, and this time you do not.',
      'The doors close on the empty platform and he lets out a breath he has been holding for a very long time.',
      '“Forty years,” he says. “You are the fourth one who listened. I could not tell you at Elmwood, you understand. If I tell you at Elmwood you get off at Elmwood, and Elmwood at this hour is not Elmwood.”',
      'He stands, at last, and works a coat button loose between his fingers, and puts it in your hand.',
      '“Someone has to be on it,” he says. “That is all it wants. Somebody on it.”',
      'At the next station he steps down onto the platform without looking back, and the doors close, and you are alone in the carriage, and the train pulls out.',
    ],
    epilogue: 'He was on this train before you were born, and he is not on it now.',
  },

  secret: {
    id: 'secret',
    title: 'THE 00:47',
    order: 7,
    secret: true,
    lines: [
      'You stay. You have the ticket, and the log, and the photograph in which you are standing exactly where you are standing.',
      'The alarm you pulled between Platform Zero and Elmwood is still lit above the door, and nothing came, because there has never been anybody to come.',
      'The display clears itself and holds two words for a long time. NOT SCHEDULED.',
      'And then the tunnel ends. Not a station: the tunnel simply stops, in a cutting, under an ordinary sky going grey at one edge, and the train stops with it in a siding full of grass.',
      'The doors open on a morning. There is a fence, and a gate in the fence, and beyond the gate a road going into a town you have never been to and recognise immediately.',
      'You look back once from the gate. The carriage lights are off. The 00:47 has been out of service for forty years, and it is a very long time since anyone ran it.',
    ],
    epilogue: 'It only had to be found out. That was all it was waiting for.',
    good: true,
  },
};

export const ENDING_ORDER = Object.values(ENDINGS).sort((a, b) => a.order - b.order).map((e) => e.id);
export const TOTAL_ENDINGS = ENDING_ORDER.length;

/*
 * Works out which ending a decision produces.
 *
 * `decision` is 'off' or 'stay'; `station` is the stop it was made at; `state`
 * carries the flags, the clue set and the interaction counters.
 */
export function resolveEnding(decision, station, state) {
  const clues = state.clues instanceof Set ? state.clues : new Set(state.clues || []);
  const flags = state.flags || {};

  if (decision === 'off') {
    if (station.id === 'elmwood') {
      /* Elmwood is only home if you had some way of knowing it was. Getting
         off at a station because the sign is reassuring is how the others got
         where they are. */
      return clues.has('travelcard') ? 'home' : 'wrong_station';
    }
    return station.exitEnding || 'wrong_station';
  }

  /* Staying on only resolves at the terminus. */
  if (!station.terminus) return null;

  const deepClues = clues.size >= 8;
  const secret = deepClues
    && clues.has('timetable')
    && clues.has('photograph')
    && flags.pulledAlarm
    && flags.sawReflection;
  if (secret) return 'secret';

  if ((state.strangerTalks || 0) >= 3) return 'last_passenger';
  return 'empty_train';
}

export function endingById(id) {
  return ENDINGS[id] || null;
}
