import { lerp, lerpAngle, normalizeAngle } from '../core/math';
import {
  MotionState,
  PackedTrack,
  RecordedEvent,
  RecordedEventKind,
  RecordedSample,
  TrackData,
} from '../core/types';

export const TRACK_VERSION = 2;

export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  motion: MotionState;
}

/**
 * A recorded visit. Stores sparse samples and plays them back with
 * interpolation, so the mimic moves smoothly no matter what frame rate the
 * recording was made at.
 */
export class ReplayTrack {
  readonly samples: RecordedSample[];
  readonly events: RecordedEvent[];
  readonly rooms: string[];
  readonly visit: number;
  readonly duration: number;

  constructor(data: TrackData) {
    this.samples = data.samples.slice().sort((a, b) => a.t - b.t);
    this.events = data.events.slice().sort((a, b) => a.t - b.t);
    this.rooms = data.rooms.slice();
    this.visit = data.visit;
    this.duration =
      data.duration > 0 ? data.duration : this.samples.length ? this.samples[this.samples.length - 1].t : 0;
  }

  static empty(visit = 0): ReplayTrack {
    return new ReplayTrack({ version: TRACK_VERSION, visit, duration: 0, samples: [], events: [], rooms: [] });
  }

  get isEmpty(): boolean {
    return this.samples.length === 0;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  /** Interpolated pose at time `t` (seconds since the visit began). */
  sampleAt(t: number): Pose | null {
    const samples = this.samples;
    if (samples.length === 0) return null;
    if (samples.length === 1 || t <= samples[0].t) return toPose(samples[0]);
    const last = samples[samples.length - 1];
    if (t >= last.t) return toPose(last);

    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = samples[lo];
    const b = samples[hi];
    const span = b.t - a.t;
    const f = span > 1e-6 ? (t - a.t) / span : 0;
    return {
      x: lerp(a.x, b.x, f),
      y: lerp(a.y, b.y, f),
      z: lerp(a.z, b.z, f),
      yaw: normalizeAngle(lerpAngle(a.yaw, b.yaw, f)),
      pitch: lerp(a.pitch, b.pitch, f),
      motion: f < 0.5 ? a.motion : b.motion,
    };
  }

  /** Events in the half-open window (from, to]. */
  eventsBetween(from: number, to: number): RecordedEvent[] {
    if (to <= from) return [];
    const result: RecordedEvent[] = [];
    for (const event of this.events) {
      if (event.t > from && event.t <= to) result.push(event);
      else if (event.t > to) break;
    }
    return result;
  }

  /** First time the given interactable was used, or null. */
  timeOfEvent(targetId: string, kind?: RecordedEventKind): number | null {
    for (const event of this.events) {
      if (event.targetId === targetId && (!kind || event.kind === kind)) return event.t;
    }
    return null;
  }

  toData(): TrackData {
    return {
      version: TRACK_VERSION,
      visit: this.visit,
      duration: this.duration,
      samples: this.samples.map((s) => ({ ...s })),
      events: this.events.map((e) => ({ ...e })),
      rooms: this.rooms.slice(),
    };
  }

  toPacked(): PackedTrack {
    return packTrack(this.toData());
  }

  static fromPacked(packed: PackedTrack | null | undefined): ReplayTrack {
    if (!packed) return ReplayTrack.empty();
    return new ReplayTrack(unpackTrack(packed));
  }
}

function toPose(sample: RecordedSample): Pose {
  return {
    x: sample.x,
    y: sample.y,
    z: sample.z,
    yaw: sample.yaw,
    pitch: sample.pitch,
    motion: sample.motion,
  };
}

/* ------------------------------------------------------------------ */
/* Compression                                                         */
/* ------------------------------------------------------------------ */

export interface CompressOptions {
  positionTolerance?: number;
  angleTolerance?: number;
  /** Times that must survive compression (event timestamps). */
  keepTimes?: number[];
}

/**
 * Drops samples that a straight interpolation between their neighbours already
 * reproduces. Typically removes 55-75% of a corridor walk without any visible
 * change to the replay.
 */
export function compressSamples(
  samples: readonly RecordedSample[],
  options: CompressOptions = {},
): RecordedSample[] {
  const positionTolerance = options.positionTolerance ?? 0.05;
  const angleTolerance = options.angleTolerance ?? 0.045;
  const keepTimes = options.keepTimes ?? [];
  if (samples.length <= 2) return samples.map((s) => ({ ...s }));

  const mustKeep = (t: number): boolean => keepTimes.some((keep) => Math.abs(keep - t) < 0.13);

  const output: RecordedSample[] = [{ ...samples[0] }];
  let anchor = samples[0];

  for (let i = 1; i < samples.length - 1; i++) {
    const current = samples[i];
    const next = samples[i + 1];
    const span = next.t - anchor.t;
    const f = span > 1e-6 ? (current.t - anchor.t) / span : 0;

    const predictedX = lerp(anchor.x, next.x, f);
    const predictedZ = lerp(anchor.z, next.z, f);
    const predictedY = lerp(anchor.y, next.y, f);
    const predictedYaw = lerpAngle(anchor.yaw, next.yaw, f);
    const predictedPitch = lerp(anchor.pitch, next.pitch, f);

    const positionError = Math.hypot(
      current.x - predictedX,
      current.z - predictedZ,
      current.y - predictedY,
    );
    const angleError =
      Math.abs(normalizeAngle(current.yaw - predictedYaw)) + Math.abs(current.pitch - predictedPitch);

    if (
      positionError > positionTolerance ||
      angleError > angleTolerance ||
      current.motion !== anchor.motion ||
      mustKeep(current.t)
    ) {
      output.push({ ...current });
      anchor = current;
    }
  }

  output.push({ ...samples[samples.length - 1] });
  return output;
}

const Q = 1000;

export function packTrack(track: TrackData): PackedTrack {
  const flat: number[] = [];
  for (const sample of track.samples) {
    flat.push(
      Math.round(sample.t * Q),
      Math.round(sample.x * Q),
      Math.round(sample.y * Q),
      Math.round(sample.z * Q),
      Math.round(sample.yaw * Q),
      Math.round(sample.pitch * Q),
      sample.motion,
    );
  }
  return {
    v: TRACK_VERSION,
    visit: track.visit,
    d: Math.round(track.duration * Q),
    s: flat,
    e: track.events.map((event) => [Math.round(event.t * Q), event.kind, event.targetId]),
    r: track.rooms.slice(),
  };
}

export function unpackTrack(packed: PackedTrack): TrackData {
  const samples: RecordedSample[] = [];
  const flat = Array.isArray(packed.s) ? packed.s : [];
  for (let i = 0; i + 6 < flat.length; i += 7) {
    samples.push({
      t: flat[i] / Q,
      x: flat[i + 1] / Q,
      y: flat[i + 2] / Q,
      z: flat[i + 3] / Q,
      yaw: flat[i + 4] / Q,
      pitch: flat[i + 5] / Q,
      motion: (flat[i + 6] as MotionState) ?? 0,
    });
  }
  return {
    version: packed.v ?? TRACK_VERSION,
    visit: packed.visit ?? 0,
    duration: (packed.d ?? 0) / Q,
    samples,
    events: (packed.e ?? []).map(([t, kind, targetId]) => ({ t: t / Q, kind, targetId })),
    rooms: packed.r ?? [],
  };
}
