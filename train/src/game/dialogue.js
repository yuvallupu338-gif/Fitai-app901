/*
 * dialogue.js — what people say when you speak to them, which is mostly
 * nothing.
 *
 * The stranger is the exception, and he is written to a rule: he never lies,
 * he never explains, and he answers a question the player did not ask. By the
 * last stop he has told them everything they need and nothing they want.
 *
 * Talking to him at all is a decision. Doing it five times is a different one.
 */

export const STRANGER_LINES = [
  [
    'He does not look up. “Long night.”',
    '“You always get this one, don’t you. The last one.”',
    '“I don’t sleep much either.”',
  ],
  [
    '“Riverside.” He says it like a word he is checking for damage.',
    '“Count them. It helps. Some people count the stations, some people count the passengers.”',
    '“I count the passengers.”',
  ],
  [
    '“Three,” he says, before you have asked anything.',
    '“There were nine at Central. You can check. Nobody checks.”',
    '“Don’t take the seat by the door.”',
  ],
  [
    '“You noticed,” he says. It is not a question.',
    '“That one isn’t on the map because it isn’t on the line. It is just where the train goes.”',
    '“Whatever you do, when the doors open here, stay exactly where you are.”',
  ],
  [
    'He is looking past you, at the window. “He has been on that platform since before I started riding.”',
    '“He isn’t waiting for a train. He is waiting for someone to get off.”',
    '“Don’t make eye contact through the glass. It counts as getting off.”',
  ],
  [
    '“Elmwood,” he says, and for the first time he sounds tired rather than careful.',
    '“If it is yours, go. Go quickly and do not look back at the train.”',
    '“If you are not sure it is yours — and you are not sure, or you would not be asking me — then it is not.”',
    '“I got off at a station that looked like mine. Nineteen eighty-four. I have been coming back ever since.”',
  ],
  [
    '“Don’t get off.”',
    '“I know what the announcement says. I have heard it four thousand times. Don’t get off.”',
    '“It only needs one of us on board. That is the whole arrangement. One.”',
    'He turns to face you fully, and there is a button missing from his coat, third from the top.',
    '“Sit down,” he says gently. “It is not far now.”',
  ],
];

export const STRANGER_REPEAT = [
  'He has said what he is going to say.',
  'He shakes his head, once.',
  '“Ask me at the next one.”',
  'He is looking at the window again.',
];

/* Everyone else. They are not characters and they are not going to become
   characters, and the flatness of these is the point. */
export const PASSENGER_LINES = {
  reader: [
    'He turns a page. The page is blank on both sides.',
    'He does not look up.',
    '“Mm,” he says, to nobody.',
  ],
  worker: [
    'He is asleep, or doing a very good impression of it.',
    'His eyes are open. He does not seem to know that.',
  ],
  elder: [
    '“Is this the last one?” she asks, and does not wait for an answer.',
    'She smiles at you with great warmth and no recognition at all.',
    '“I get off at the end,” she says. “I always get off at the end.”',
  ],
  student: [
    'The headphones are not plugged into anything.',
    'She does not react.',
    'You can hear what she is listening to. It is the sound of this carriage.',
  ],
  sleeper: [
    'He does not wake.',
    'You are close enough to see that he is not breathing, and then close enough to see that he is.',
  ],
  default: [
    'They do not look up.',
    'Nothing.',
    'They are looking at the window, and the window is looking back at the carriage.',
  ],
};

/* Things the train says to itself. */
export const AMBIENT_ANNOUNCEMENTS = [
  'Please keep your belongings with you at all times.',
  'CCTV is in operation on this service for your safety.',
  'This train is for {DEST} only.',
  'Please move down inside the carriage.',
  'The next station is {NEXT}.',
];

export function passengerLine(id, count) {
  const pool = PASSENGER_LINES[id] || PASSENGER_LINES.default;
  return pool[Math.min(count, pool.length - 1)];
}
