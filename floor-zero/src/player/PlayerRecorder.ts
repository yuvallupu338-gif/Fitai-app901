import { MotionState, RecordedEvent, RecordedEventKind, RecordedSample, TrackData } from '../core/types';
import { ReplayTrack, TRACK_VERSION, compressSamples } from '../mimic/ReplayTrack';

export interface RecorderOptions {
  /** Seconds between samples. 0.1 keeps a 6-minute visit under 40 KB packed. */
  interval?: number;
  /** Hard cap so a player who wanders forever cannot fill localStorage. */
  maxSamples?: number;
}

/**
 * Records what the player did during one visit to Floor 0. This is the input to
 * everything the mimic does, so it stores intent (which switch, which door,
 * where they stopped) and not just a position curve.
 */
export class PlayerRecorder {
  private samples: RecordedSample[] = [];
  private events: RecordedEvent[] = [];
  private rooms: string[] = [];
  private recording = false;
  private visit = 0;
  private time = 0;
  private nextSampleAt = 0;
  private lastMotion: MotionState = 0;
  private lastPose: RecordedSample | null = null;
  private readonly interval: number;
  private readonly maxSamples: number;

  constructor(options: RecorderOptions = {}) {
    this.interval = options.interval ?? 0.1;
    this.maxSamples = options.maxSamples ?? 6000;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  get elapsed(): number {
    return this.time;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  get eventCount(): number {
    return this.events.length;
  }

  start(visit: number): void {
    this.recording = true;
    this.visit = visit;
    this.time = 0;
    this.nextSampleAt = 0;
    this.samples = [];
    this.events = [];
    this.rooms = [];
    this.lastMotion = 0;
    this.lastPose = null;
  }

  /**
   * Advance the recorder. Call every frame; it decides itself when to keep a
   * sample. A change of motion state always forces one so starts, stops and
   * sprints land on the exact frame they happened.
   */
  update(
    delta: number,
    pose: { x: number; y: number; z: number; yaw: number; pitch: number; motion: MotionState },
  ): void {
    if (!this.recording) return;
    this.time += delta;

    this.lastPose = {
      t: this.time,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      yaw: pose.yaw,
      pitch: pose.pitch,
      motion: pose.motion,
    };

    const motionChanged = pose.motion !== this.lastMotion;
    if (this.time >= this.nextSampleAt || motionChanged) {
      this.pushSample(pose);
      this.nextSampleAt = this.time + this.interval;
      this.lastMotion = pose.motion;
    }
  }

  private pushSample(pose: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    motion: MotionState;
  }): void {
    if (this.samples.length >= this.maxSamples) return;
    this.samples.push({
      t: this.time,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      yaw: pose.yaw,
      pitch: pose.pitch,
      motion: pose.motion,
    });
  }

  /** Record an interaction. Also forces a positional sample at the same moment. */
  recordEvent(kind: RecordedEventKind, targetId: string): void {
    if (!this.recording) return;
    this.events.push({ t: this.time, kind, targetId });
  }

  enterRoom(roomId: string): void {
    if (!this.recording) return;
    if (this.rooms[this.rooms.length - 1] === roomId) return;
    this.rooms.push(roomId);
    this.events.push({ t: this.time, kind: 'enter_room', targetId: roomId });
  }

  /** Snapshot without ending the recording. */
  peek(): TrackData {
    return {
      version: TRACK_VERSION,
      visit: this.visit,
      duration: this.time,
      samples: this.samples.map((s) => ({ ...s })),
      events: this.events.map((e) => ({ ...e })),
      rooms: this.rooms.slice(),
    };
  }

  /** Finish the visit and return the compressed track. */
  stop(): ReplayTrack {
    this.recording = false;
    // Always close the recording on the player's final pose, so the mimic ends
    // its walk exactly where the player stopped rather than up to one sampling
    // interval short of it.
    const last = this.samples[this.samples.length - 1];
    if (this.lastPose && (!last || this.lastPose.t - last.t > 1e-4) && this.samples.length < this.maxSamples) {
      this.samples.push({ ...this.lastPose });
    }
    const keepTimes = this.events.map((event) => event.t);
    const compressed = compressSamples(this.samples, { keepTimes });
    const track = new ReplayTrack({
      version: TRACK_VERSION,
      visit: this.visit,
      duration: this.time,
      samples: compressed,
      events: this.events.slice(),
      rooms: this.rooms.slice(),
    });
    return track;
  }

  cancel(): void {
    this.recording = false;
    this.samples = [];
    this.events = [];
    this.rooms = [];
    this.time = 0;
    this.lastPose = null;
  }
}
