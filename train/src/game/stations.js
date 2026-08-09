/*
 * stations.js — the line.
 *
 * Seven stops, and the shape of the night is in the order of them. The first
 * is a working station with people on it. The second is the same station with
 * one thing wrong that the player will probably not notice until later. By the
 * fourth there is no pretence left.
 *
 * `decay`, `lights` and `tiled` do most of the work. Nothing here says "make
 * this scary"; it says the fittings are older, three of the lamps are out, and
 * the tiling was never finished.
 *
 * The route map is a separate list, because the map is not a description of
 * the line — it is a *claim* about the line, and by the fourth stop it is
 * wrong in ways the player can check.
 */

export const MAX_SPEED = 22;          // metres per second at full line speed

export const STATIONS = [
  {
    id: 'central',
    name: 'CENTRAL',
    signSub: 'Line 4 · Zone 1',
    side: 1,
    tiled: true,
    decay: 0,
    lights: 1,
    lightIntensity: 0.62,
    benches: true,
    crowd: 5,
    fog: 0.016,
    dwell: 26,
    legSeconds: 62,
    arrival: 'This is Central. Change here for the night bus.',
    departure: 'The next station is Riverside. Please stand clear of the doors.',
    onboard: 'This is the last service tonight. Please mind the gap between the train and the platform.',
    exitEnding: 'ordinary',
    intensity: 0,
  },
  {
    id: 'riverside',
    name: 'RIVERSIDE',
    signSub: 'Line 4 · Zone 2',
    side: -1,
    tiled: true,
    decay: 0.12,
    lights: 1,
    lightIntensity: 0.55,
    benches: true,
    crowd: 2,
    fog: 0.019,
    dwell: 25,
    legSeconds: 68,
    arrival: 'This is Riverside.',
    departure: 'The next station is North End.',
    exitEnding: 'ordinary',
    intensity: 1,
  },
  {
    id: 'northend',
    name: 'NORTH END',
    signSub: 'Line 4 · Zone 3',
    side: 1,
    tiled: false,
    decay: 0.55,
    lights: 0.45,
    lightIntensity: 0.42,
    lightColor: [0.90, 0.78, 0.55],
    benches: true,
    crowd: 0,
    fog: 0.026,
    dwell: 26,
    legSeconds: 74,
    arrival: 'This is North End. This station is not staffed after eleven.',
    departure: 'The next station is …',
    exitEnding: 'wrong_station',
    intensity: 2,
  },
  {
    id: 'unknown',
    name: 'UNKNOWN',
    signName: ' ',
    signSub: '',
    displayOverride: 'STATION NOT FOUND',
    side: -1,
    tiled: false,
    decay: 0.8,
    lights: 0.3,
    lightIntensity: 0.34,
    lightColor: [0.72, 0.78, 0.86],
    benches: false,
    crowd: 0,
    fog: 0.034,
    dwell: 28,
    legSeconds: 76,
    arrival: '',
    departure: '',
    exitEnding: 'wrong_station',
    intensity: 3,
    silent: true,
  },
  {
    id: 'platform0',
    name: 'PLATFORM 0',
    signSub: 'no scheduled services',
    side: 1,
    tiled: true,
    decay: 0.45,
    lights: 0.6,
    lightIntensity: 0.30,
    lightColor: [0.78, 0.84, 0.98],
    benches: false,
    crowd: 0,
    watcher: true,
    fog: 0.030,
    dwell: 30,
    legSeconds: 80,
    arrival: 'This is Platform Zero. Please do not alight here.',
    departure: 'The next station is Elmwood.',
    exitEnding: 'wrong_station',
    intensity: 4,
  },
  {
    id: 'elmwood',
    name: 'ELMWOOD',
    signSub: 'Line 4 · Zone 4',
    side: -1,
    tiled: true,
    decay: 0.2,
    lights: 0.85,
    lightIntensity: 0.58,
    benches: true,
    crowd: 0,
    fog: 0.020,
    dwell: 30,
    legSeconds: 72,
    arrival: 'This is Elmwood. This is your stop.',
    departure: 'The next station is the last stop on this line.',
    exitEnding: 'home',
    intensity: 5,
    /* Elmwood is built from Central's parts, mirrored. Whether the player
       notices that is the whole of the scene. */
    familiar: true,
  },
  {
    id: 'laststop',
    name: 'LAST STOP',
    signName: 'LAST STOP',
    signSub: '',
    side: 1,
    tiled: false,
    decay: 0.35,
    lights: 0.5,
    lightIntensity: 0.26,
    lightColor: [0.70, 0.76, 0.88],
    benches: false,
    crowd: 0,
    fog: 0.028,
    dwell: 40,
    legSeconds: 90,
    arrival: 'This train terminates here. All passengers must leave the train.',
    departure: '',
    exitEnding: 'loop',
    intensity: 6,
    terminus: true,
  },
];

export function stationById(id) {
  return STATIONS.find((s) => s.id === id) || null;
}

/*
 * What the route map above the doors claims, at each point in the journey.
 * Stage 0 is the printed map that was in the car when the player boarded.
 * Later stages are what is there when they next look.
 */
export const ROUTE_STAGES = [
  {
    title: 'LINE 4 — NORTHBOUND',
    subtitle: 'LAST SERVICE 00:47',
    stations: [
      { id: 'central', name: 'Central' },
      { id: 'riverside', name: 'Riverside' },
      { id: 'northend', name: 'North End' },
      { id: 'ashgrove', name: 'Ashgrove' },
      { id: 'elmwood', name: 'Elmwood' },
      { id: 'marsh', name: 'Marsh Lane' },
    ],
  },
  {
    /* Ashgrove is gone. Nobody announces it. */
    title: 'LINE 4 — NORTHBOUND',
    subtitle: 'LAST SERVICE 00:47',
    stations: [
      { id: 'central', name: 'Central' },
      { id: 'riverside', name: 'Riverside' },
      { id: 'northend', name: 'North End' },
      { id: 'elmwood', name: 'Elmwood' },
      { id: 'marsh', name: 'Marsh Lane' },
    ],
  },
  {
    title: 'LINE 4 — NORTHBOUND',
    subtitle: 'LAST SERVICE 00:47',
    stations: [
      { id: 'central', name: 'Central' },
      { id: 'riverside', name: 'Riverside' },
      { id: 'northend', name: 'North End' },
      { id: 'unknown', name: '—', ghost: true },
      { id: 'elmwood', name: 'Elmwood' },
      { id: 'marsh', name: 'Marsh Lane' },
    ],
  },
  {
    title: 'LINE 4 — NORTHBOUND',
    subtitle: 'LAST SERVICE 00:47',
    stations: [
      { id: 'central', name: 'Central' },
      { id: 'riverside', name: 'Riverside' },
      { id: 'northend', name: 'North End' },
      { id: 'unknown', name: '—', ghost: true },
      { id: 'platform0', name: 'Platform 0', ghost: true },
      { id: 'elmwood', name: 'Elmwood' },
      { id: 'marsh', name: 'Marsh Lane' },
    ],
    scrawl: { text: 'don’t get off at elmwood', rotate: -0.04 },
  },
  {
    title: 'LINE 4 — NORTHBOUND',
    subtitle: 'SERVICE WITHDRAWN',
    lineColor: '#7c7c82',
    stations: [
      { id: 'central', name: 'Central', ghost: true },
      { id: 'riverside', name: 'Riverside', ghost: true },
      { id: 'northend', name: 'North End', ghost: true },
      { id: 'unknown', name: '—', ghost: true },
      { id: 'platform0', name: 'Platform 0', ghost: true },
      { id: 'elmwood', name: 'Elmwood' },
      { id: 'laststop', name: 'Last Stop' },
    ],
  },
];

/* The dot-matrix strip. Two lines: where we are going, and the time. */
export function displayLines(state) {
  if (state.override) return [state.override, ''];
  const time = state.clock || '00:47';
  if (state.phase === 'stopped') return [state.stationName || '', `${time}   DOORS OPEN`];
  if (state.phase === 'arriving') return [`APPROACHING`, state.stationName || ''];
  return [`NEXT STOP`, `${state.nextName || ''}`.trim() || '—'];
}

/*
 * The clock. It reads 00:47 when the player boards and it does not
 * particularly care what happens after that.
 */
export function clockFor(stationIndex, elapsed, corrupted) {
  if (corrupted) return CORRUPT_CLOCKS[stationIndex % CORRUPT_CLOCKS.length];
  const base = 47 + Math.floor(elapsed / 60);
  const hours = Math.floor(base / 60);
  const mins = base % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

const CORRUPT_CLOCKS = ['00:47', '00:47', '00:47', '--:--', '00:47', '25:61', '00:47'];
