/*
 * clues.js — the things left on the seats.
 *
 * The rule the whole file is written to: never let a clue answer a question.
 * A clue is allowed to be specific, dated, mundane and verifiable — a receipt,
 * a rota, a text message — and it is allowed to be *adjacent* to the answer.
 * The player assembles the story or does not, and the game never once confirms
 * which of the two happened.
 *
 * `after` is the station index from which the object exists; things do not
 * appear before they are meant to, and one or two appear where the player has
 * already looked.
 */

export const CLUES = [
  {
    id: 'travelcard',
    title: 'Travelcard',
    kind: 'card',
    after: 0,
    car: 2,
    spot: { type: 'seat', slot: 22 },
    label: 'A travelcard',
    verb: 'Pick up',
    lines: [
      { class: 'card-head', text: 'CITY TRANSIT · MONTHLY' },
      { class: 'card-name', text: 'Zones 1–4' },
      { class: 'card-row', text: 'HOME STATION: ELMWOOD' },
      { class: 'card-row', text: 'VALID UNTIL: 31 / 10' },
      { class: 'card-foot', text: 'Not transferable. Photograph required.' },
      { class: 'note', text: 'There is no photograph in the window. There is a space where one has been.' },
    ],
    /* Knowing where you live is the difference between getting off at Elmwood
       and getting off somewhere that has the same name as where you live. */
    flags: ['knowsHome'],
  },
  {
    id: 'phone',
    title: 'A phone, face down',
    kind: 'phone',
    after: 1,
    car: 1,
    spot: { type: 'seat', slot: 9 },
    label: 'A phone',
    verb: 'Pick up',
    lines: [
      { class: 'phone-head', text: '7 missed calls' },
      { class: 'phone-msg them', text: 'are you on it' },
      { class: 'phone-msg them', text: 'the last one, the 00:47' },
      { class: 'phone-msg me', text: 'yes. doors just shut' },
      { class: 'phone-msg them', text: 'ok. text me at elmwood' },
      { class: 'phone-msg them', text: 'text me at elmwood' },
      { class: 'phone-msg them', text: 'text me at elmwood' },
      { class: 'phone-msg them', text: 'text me at elmwood' },
      { class: 'note', text: 'The last four are identical, and they are two minutes apart, and they were sent tonight.' },
    ],
  },
  {
    id: 'newspaper',
    title: 'An evening paper',
    kind: 'paper',
    after: 1,
    car: 2,
    spot: { type: 'seat', slot: 40 },
    label: 'A folded newspaper',
    verb: 'Read',
    lines: [
      { class: 'paper-masthead', text: 'THE EVENING LINE' },
      { class: 'paper-date', text: 'Thursday' },
      { class: 'paper-head', text: 'LINE 4 RETURNS TO FULL SERVICE' },
      {
        class: 'paper-body',
        text: 'Overnight running resumed on Line 4 last night for the first time since the incident, with the operator confirming that all six stations north of Central are open as normal.',
      },
      {
        class: 'paper-body',
        text: 'A spokesperson declined to say how many passengers had been on board the withdrawn service, describing the figure as “subject to the review”.',
      },
      { class: 'note', text: 'The masthead has no date on it. Only the day.' },
    ],
  },
  {
    id: 'rota',
    title: 'A duty sheet',
    kind: 'paper',
    after: 2,
    car: 0,
    spot: { type: 'floor', x: -0.35, z: -2.1 },
    label: 'A duty sheet',
    verb: 'Read',
    lines: [
      { class: 'form-head', text: 'NIGHT ROSTER — LINE 4' },
      { class: 'form-row', text: '23:47   CENTRAL → MARSH LANE     D. KEEL' },
      { class: 'form-row', text: '00:17   CENTRAL → MARSH LANE     D. KEEL' },
      { class: 'form-row strike', text: '00:47   CENTRAL → MARSH LANE     —' },
      { class: 'form-note', text: 'Handwritten under the last line, in pencil:' },
      { class: 'hand', text: 'do not crew. runs anyway.' },
    ],
  },
  {
    id: 'bulletin',
    title: 'A service bulletin',
    kind: 'notice',
    after: 2,
    car: 3,
    spot: { type: 'wall', side: -1, z: 3.4, y: 1.5 },
    label: 'A service bulletin',
    verb: 'Read',
    lines: [
      { class: 'form-head', text: 'STAFF NOTICE 114' },
      {
        class: 'form-body',
        text: 'Drivers are reminded that the platform designated “0” is not in passenger use and is not shown on public materials. Doors must not be released on the west face.',
      },
      {
        class: 'form-body',
        text: 'Any member of staff observing a person on that platform should not attempt to make contact and should report the sighting at the end of the shift.',
      },
      { class: 'form-foot', text: 'Issued to all depots. Do not display in public areas.' },
      { class: 'note', text: 'It is displayed in a public area.' },
    ],
    flags: ['knowsPlatform0'],
  },
  {
    id: 'notebook',
    title: 'A page from a notebook',
    kind: 'paper',
    after: 3,
    car: 1,
    spot: { type: 'seat', slot: 33 },
    label: 'A page torn from a notebook',
    verb: 'Read',
    lines: [
      { class: 'hand', text: 'central — got on' },
      { class: 'hand strike', text: 'riverside — no' },
      { class: 'hand strike', text: 'north end — no' },
      { class: 'hand strike', text: 'the one with no name — NO' },
      { class: 'hand', text: 'platform 0 — he is still there' },
      { class: 'hand', text: 'elmwood — ??? it looks right' },
      { class: 'hand big', text: 'IT IS NOT THE LAST STOP THAT GETS YOU' },
      { class: 'note', text: 'The handwriting is yours. You are certain of it, and you cannot say why.' },
    ],
    flags: ['knowsList'],
  },
  {
    id: 'poster',
    title: 'The missing person notice',
    kind: 'poster',
    after: 3,
    car: 2,
    spot: { type: 'ad', slot: 1 },
    label: 'A notice',
    verb: 'Read',
    lines: [
      { class: 'poster-head', text: 'HAVE YOU SEEN' },
      { class: 'poster-body', text: 'Last seen boarding the 00:47 service at Central.' },
      { class: 'poster-body', text: 'Wearing a dark coat. Carrying nothing.' },
      { class: 'poster-foot', text: 'TRANSIT POLICE · 8800' },
      { class: 'note', text: 'The photograph is a photograph of the inside of a carriage. There is nobody in it.' },
    ],
  },
  {
    id: 'button',
    title: 'A coat button',
    kind: 'object',
    after: 4,
    car: 3,
    spot: { type: 'floor', x: 0.3, z: 6.2 },
    label: 'A coat button',
    verb: 'Pick up',
    lines: [
      { class: 'object-body', text: 'Horn, four holes, a thread still through two of them. It is warm.' },
      { class: 'object-body', text: 'The passenger at the end of the carriage is missing one, third from the top.' },
      { class: 'note', text: 'You have not been near enough to the end of the carriage to know that.' },
    ],
    flags: ['touchedStranger'],
  },
  {
    id: 'drawing',
    title: 'A child’s drawing',
    kind: 'paper',
    after: 4,
    car: 0,
    spot: { type: 'seat', slot: 5 },
    label: 'A drawing',
    verb: 'Look at',
    lines: [
      { class: 'object-body', text: 'A train, in green pencil, with a great many windows.' },
      { class: 'object-body', text: 'In every window there is a face. The faces are careful and take a long time. In the last window there is no face, and the window has been gone over so many times the paper has torn.' },
      { class: 'hand', text: 'thats where i sit' },
    ],
  },
  {
    id: 'ticketstub',
    title: 'A ticket stub',
    kind: 'card',
    after: 1,
    car: 3,
    spot: { type: 'floor', x: -0.5, z: -5.8 },
    label: 'A ticket stub',
    verb: 'Pick up',
    lines: [
      { class: 'card-head', text: 'SINGLE · OFF PEAK' },
      { class: 'card-row', text: 'CENTRAL → LAST STOP' },
      { class: 'card-row', text: 'ISSUED 00:41' },
      { class: 'note', text: '“Last Stop” is not a station. It is what a station is when there are no more of them.' },
    ],
  },
  {
    id: 'log',
    title: 'A driver’s log page',
    kind: 'paper',
    after: 5,
    car: 0,
    spot: { type: 'floor', x: 0.4, z: -7.4 },
    label: 'A page of a log book',
    verb: 'Read',
    lines: [
      { class: 'form-head', text: 'RUNNING LOG — 00:47' },
      { class: 'form-row', text: '00:47  CENTRAL             dep.  on time' },
      { class: 'form-row', text: '00:53  RIVERSIDE           dep.  on time' },
      { class: 'form-row', text: '01:02  NORTH END           dep.  on time' },
      { class: 'form-row', text: '01:11  ——                  dep.  on time' },
      { class: 'form-row', text: '01:20  ——                  dep.  on time' },
      { class: 'form-row', text: '01:29  ELMWOOD             dep.  on time' },
      { class: 'form-row', text: '01:38  ——' },
      { class: 'form-row', text: '01:47  CENTRAL             dep.  on time' },
      { class: 'form-row', text: '01:53  RIVERSIDE           dep.  on time' },
      { class: 'note', text: 'It goes on for eleven pages. It is always on time.' },
    ],
    flags: ['knowsLoop'],
  },
  {
    id: 'umbrella',
    title: 'An umbrella',
    kind: 'object',
    after: 2,
    car: 1,
    spot: { type: 'floor', x: 0.55, z: 1.4 },
    label: 'An umbrella',
    verb: 'Pick up',
    lines: [
      { class: 'object-body', text: 'Dry. There is a luggage tag knotted to the handle with the name worn off it, and on the back, in biro:' },
      { class: 'hand', text: 'if found please keep it. i am not getting off.' },
    ],
  },
  {
    id: 'photograph',
    title: 'A photograph',
    kind: 'object',
    after: 5,
    car: 2,
    spot: { type: 'seat', slot: 30 },
    label: 'A photograph',
    verb: 'Look at',
    lines: [
      { class: 'object-body', text: 'A platform at night, taken from inside a carriage, through the glass.' },
      { class: 'object-body', text: 'Reflected in the glass, quite clearly, is the person taking it. They are standing where you are standing.' },
      { class: 'note', text: 'You have taken no photographs tonight.' },
    ],
    secret: true,
  },
  {
    id: 'mirror',
    title: 'A compact mirror',
    kind: 'object',
    after: 3,
    car: 2,
    spot: { type: 'floor', x: -0.45, z: 4.6 },
    label: 'A compact mirror',
    verb: 'Pick up',
    lines: [
      { class: 'object-body', text: 'Cheap enamel, the hinge gone stiff. It opens with a click that is louder than it should be.' },
      { class: 'object-body', text: 'You check your face in it, because that is what a mirror is for.' },
      { class: 'note', text: 'It is a fraction late. Not enough to prove. Enough to check again, and to find that the second time it is not.' },
    ],
    flags: ['sawReflection'],
  },
  {
    id: 'timetable',
    title: 'The last timetable',
    kind: 'notice',
    after: 6,
    car: 3,
    spot: { type: 'wall', side: 1, z: -3.4, y: 1.5 },
    label: 'A timetable',
    verb: 'Read',
    lines: [
      { class: 'form-head', text: 'LINE 4 · NORTHBOUND · WEEKDAYS' },
      { class: 'form-row', text: '23:47   00:17   00:47' },
      { class: 'form-body', text: 'The 00:47 does not stop at every station shown. The 00:47 does not stop.' },
      { class: 'form-foot', text: 'Times shown are for guidance only.' },
      { class: 'note', text: 'The sentence is broken across the line, and it can be read two ways, and one of them is not a mistake.' },
    ],
    secret: true,
  },
];

export function clueById(id) {
  return CLUES.find((c) => c.id === id) || null;
}

export function cluesAvailableAt(stationIndex) {
  return CLUES.filter((c) => c.after <= stationIndex);
}

export const TOTAL_CLUES = CLUES.length;
