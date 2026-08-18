import { describe, expect, it } from 'vitest';
import { PlayerRecorder } from '../src/player/PlayerRecorder';
import { ReplayTrack, unpackTrack } from '../src/mimic/ReplayTrack';
import { MotionState } from '../src/core/types';

function pose(x: number, z: number, yaw = 0, motion: MotionState = 1) {
  return { x, y: 0, z, yaw, pitch: 0, motion };
}

/** Feed the recorder a straight walk of `steps` frames at 60 fps. */
function walk(recorder: PlayerRecorder, steps: number, speed = 0.03): void {
  for (let i = 0; i < steps; i++) {
    recorder.update(1 / 60, pose(i * speed, 0, 0, 1));
  }
}

describe('PlayerRecorder', () => {
  it('records nothing before start() and everything after', () => {
    const recorder = new PlayerRecorder({ interval: 0.1 });
    recorder.update(0.5, pose(1, 1));
    expect(recorder.sampleCount).toBe(0);
    expect(recorder.isRecording).toBe(false);

    recorder.start(1);
    expect(recorder.isRecording).toBe(true);
    walk(recorder, 60);
    expect(recorder.sampleCount).toBeGreaterThan(0);
  });

  it('samples position and rotation at the configured interval', () => {
    const recorder = new PlayerRecorder({ interval: 0.1 });
    recorder.start(1);
    // 2 seconds of constant motion → about 20 samples at 100ms.
    for (let i = 0; i < 120; i++) {
      recorder.update(1 / 60, pose(i * 0.02, 0, i * 0.01, 1));
    }
    const track = recorder.peek();
    expect(track.samples.length).toBeGreaterThanOrEqual(18);
    expect(track.samples.length).toBeLessThanOrEqual(24);

    const first = track.samples[0];
    const last = track.samples[track.samples.length - 1];
    expect(first.x).toBeCloseTo(0, 5);
    expect(last.x).toBeGreaterThan(2.0);
    expect(last.yaw).toBeGreaterThan(0.9);
  });

  it('writes monotonically increasing timestamps', () => {
    const recorder = new PlayerRecorder({ interval: 0.1 });
    recorder.start(2);
    walk(recorder, 200);
    const samples = recorder.peek().samples;
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].t).toBeGreaterThan(samples[i - 1].t);
    }
  });

  it('forces a sample the moment the motion state changes', () => {
    const recorder = new PlayerRecorder({ interval: 5 });
    recorder.start(1);
    recorder.update(0.016, pose(0, 0, 0, 0));
    const before = recorder.sampleCount;
    recorder.update(0.016, pose(0, 0, 0, 2)); // idle → run
    expect(recorder.sampleCount).toBe(before + 1);
    expect(recorder.peek().samples.at(-1)?.motion).toBe(2);
  });

  it('records interaction events with timestamps and targets', () => {
    const recorder = new PlayerRecorder();
    recorder.start(3);
    walk(recorder, 30);
    recorder.recordEvent('switch', 'shutter_switch');
    walk(recorder, 30);
    recorder.recordEvent('door_open', 'door_apt01');

    const track = recorder.peek();
    expect(track.events).toHaveLength(2);
    expect(track.events[0].targetId).toBe('shutter_switch');
    expect(track.events[0].kind).toBe('switch');
    expect(track.events[1].t).toBeGreaterThan(track.events[0].t);
  });

  it('tracks rooms without duplicating consecutive entries', () => {
    const recorder = new PlayerRecorder();
    recorder.start(1);
    recorder.enterRoom('corridor');
    recorder.enterRoom('corridor');
    recorder.enterRoom('apt01');
    expect(recorder.peek().rooms).toEqual(['corridor', 'apt01']);
  });

  it('compresses a straight walk without losing its shape', () => {
    const recorder = new PlayerRecorder({ interval: 0.1 });
    recorder.start(1);
    for (let i = 0; i < 1800; i++) {
      recorder.update(1 / 60, pose(i * 0.02, 0, 0, 1));
    }
    const raw = recorder.peek().samples.length;
    const track = recorder.stop();

    expect(track.sampleCount).toBeLessThan(raw * 0.5);
    // The endpoints must survive compression exactly.
    expect(track.samples[0].x).toBeCloseTo(0, 4);
    expect(track.samples.at(-1)!.x).toBeCloseTo(1799 * 0.02, 4);
    // And an interpolated midpoint must still land on the original line.
    const midTime = track.duration / 2;
    const posed = track.sampleAt(midTime)!;
    expect(Math.abs(posed.x - midTime * 1.2)).toBeLessThan(0.35);
  });

  it('keeps samples near recorded events even when compressing hard', () => {
    const recorder = new PlayerRecorder({ interval: 0.1 });
    recorder.start(1);
    for (let i = 0; i < 300; i++) {
      recorder.update(1 / 60, pose(i * 0.02, 0, 0, 1));
      if (i === 150) recorder.recordEvent('switch', 'shutter_switch');
    }
    const track = recorder.stop();
    const eventTime = track.events[0].t;
    const nearest = track.samples.reduce((best, sample) =>
      Math.abs(sample.t - eventTime) < Math.abs(best.t - eventTime) ? sample : best,
    );
    expect(Math.abs(nearest.t - eventTime)).toBeLessThan(0.15);
  });

  it('can stop and start again cleanly', () => {
    const recorder = new PlayerRecorder();
    recorder.start(1);
    walk(recorder, 120);
    const first = recorder.stop();
    expect(recorder.isRecording).toBe(false);
    expect(first.duration).toBeGreaterThan(1.5);

    recorder.start(2);
    expect(recorder.sampleCount).toBe(0);
    expect(recorder.elapsed).toBe(0);
    walk(recorder, 30);
    const second = recorder.stop();
    expect(second.visit).toBe(2);
    expect(second.duration).toBeLessThan(first.duration);
  });

  it('cancel() throws the visit away', () => {
    const recorder = new PlayerRecorder();
    recorder.start(1);
    walk(recorder, 60);
    recorder.cancel();
    expect(recorder.isRecording).toBe(false);
    expect(recorder.sampleCount).toBe(0);
  });

  it('round-trips through the packed save format', () => {
    const recorder = new PlayerRecorder();
    recorder.start(7);
    for (let i = 0; i < 240; i++) {
      recorder.update(1 / 60, pose(i * 0.02, i * 0.01, i * 0.004, 1));
    }
    recorder.recordEvent('switch', 'shutter_switch');
    const track = recorder.stop();

    const packed = track.toPacked();
    const restored = new ReplayTrack(unpackTrack(packed));

    expect(restored.visit).toBe(7);
    expect(restored.sampleCount).toBe(track.sampleCount);
    expect(restored.events[0].targetId).toBe('shutter_switch');
    expect(restored.duration).toBeCloseTo(track.duration, 2);

    const a = track.sampleAt(1.0)!;
    const b = restored.sampleAt(1.0)!;
    expect(b.x).toBeCloseTo(a.x, 2);
    expect(b.z).toBeCloseTo(a.z, 2);
  });

  it('respects the sample cap so a save can never grow without bound', () => {
    const recorder = new PlayerRecorder({ interval: 0.001, maxSamples: 50 });
    recorder.start(1);
    for (let i = 0; i < 500; i++) recorder.update(0.01, pose(i * 0.01, 0));
    expect(recorder.sampleCount).toBe(50);
  });
});
