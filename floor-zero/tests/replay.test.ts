import { describe, expect, it } from 'vitest';
import { ReplayTrack, compressSamples, packTrack, unpackTrack } from '../src/mimic/ReplayTrack';
import { RecordedSample, TrackData } from '../src/core/types';

function sample(t: number, x: number, z: number, yaw = 0): RecordedSample {
  return { t, x, y: 0, z, yaw, pitch: 0, motion: 1 };
}

function makeTrack(samples: RecordedSample[], events: TrackData['events'] = []): ReplayTrack {
  return new ReplayTrack({
    version: 2,
    visit: 1,
    duration: samples.length ? samples[samples.length - 1].t : 0,
    samples,
    events,
    rooms: [],
  });
}

describe('ReplayTrack', () => {
  it('interpolates position between two samples', () => {
    const track = makeTrack([sample(0, 0, 0), sample(1, 10, 4)]);
    const mid = track.sampleAt(0.5)!;
    expect(mid.x).toBeCloseTo(5, 5);
    expect(mid.z).toBeCloseTo(2, 5);
  });

  it('interpolates yaw the short way around the circle', () => {
    // From 170° to -170°: the shortest path crosses 180°, not back through 0°.
    const track = makeTrack([sample(0, 0, 0, Math.PI - 0.1), sample(1, 0, 0, -Math.PI + 0.1)]);
    const mid = track.sampleAt(0.5)!;
    expect(Math.abs(mid.yaw)).toBeCloseTo(Math.PI, 3);
  });

  it('clamps to the first and last samples outside the track', () => {
    const track = makeTrack([sample(1, 2, 2), sample(3, 6, 6)]);
    expect(track.sampleAt(-5)!.x).toBe(2);
    expect(track.sampleAt(99)!.x).toBe(6);
  });

  it('returns null for an empty track and reports isEmpty', () => {
    const empty = ReplayTrack.empty(4);
    expect(empty.isEmpty).toBe(true);
    expect(empty.sampleAt(0)).toBeNull();
    expect(empty.duration).toBe(0);
    expect(empty.visit).toBe(4);
  });

  it('handles a single-sample track', () => {
    const track = makeTrack([sample(0, 3, 3)]);
    expect(track.sampleAt(0)!.x).toBe(3);
    expect(track.sampleAt(12)!.x).toBe(3);
  });

  it('fires events exactly once inside a half-open window', () => {
    const track = makeTrack(
      [sample(0, 0, 0), sample(5, 5, 0)],
      [
        { t: 1.0, kind: 'switch', targetId: 'a' },
        { t: 2.5, kind: 'door_open', targetId: 'b' },
        { t: 4.0, kind: 'pickup', targetId: 'c' },
      ],
    );

    expect(track.eventsBetween(0, 1).map((e) => e.targetId)).toEqual(['a']);
    expect(track.eventsBetween(1, 2.5).map((e) => e.targetId)).toEqual(['b']);
    // The boundary must not double-fire.
    expect(track.eventsBetween(1, 1)).toEqual([]);
    expect(track.eventsBetween(2.5, 5).map((e) => e.targetId)).toEqual(['c']);
  });

  it('replays every event exactly once when stepped frame by frame', () => {
    const events: TrackData['events'] = Array.from({ length: 12 }, (_, i) => ({
      t: i * 0.37 + 0.05,
      kind: 'switch' as const,
      targetId: `id_${i}`,
    }));
    const track = makeTrack([sample(0, 0, 0), sample(5, 5, 0)], events);

    const seen: string[] = [];
    let playhead = 0;
    while (playhead < 5) {
      const next = playhead + 1 / 60;
      for (const event of track.eventsBetween(playhead, next)) seen.push(event.targetId);
      playhead = next;
    }
    expect(seen).toEqual(events.map((event) => event.targetId));
  });

  it('finds the time an interactable was used', () => {
    const track = makeTrack(
      [sample(0, 0, 0), sample(4, 4, 0)],
      [
        { t: 1.2, kind: 'door_open', targetId: 'door_apt01' },
        { t: 3.4, kind: 'switch', targetId: 'shutter_switch' },
      ],
    );
    expect(track.timeOfEvent('shutter_switch')).toBeCloseTo(3.4, 5);
    expect(track.timeOfEvent('shutter_switch', 'door_open')).toBeNull();
    expect(track.timeOfEvent('nope')).toBeNull();
  });

  it('plays back at a different rate without dropping events', () => {
    const track = makeTrack(
      [sample(0, 0, 0), sample(10, 20, 0)],
      [{ t: 5, kind: 'switch', targetId: 'x' }],
    );
    const seen: string[] = [];
    let playhead = 0;
    const speed = 2.5;
    while (playhead < track.duration) {
      const next = playhead + (1 / 60) * speed;
      for (const event of track.eventsBetween(playhead, next)) seen.push(event.targetId);
      playhead = next;
    }
    expect(seen).toEqual(['x']);
    expect(track.sampleAt(track.duration)!.x).toBe(20);
  });

  it('sorts samples and events that arrive out of order', () => {
    const track = makeTrack(
      [sample(2, 2, 0), sample(0, 0, 0), sample(1, 1, 0)],
      [
        { t: 1.5, kind: 'switch', targetId: 'late' },
        { t: 0.5, kind: 'switch', targetId: 'early' },
      ],
    );
    expect(track.samples.map((s) => s.t)).toEqual([0, 1, 2]);
    expect(track.events[0].targetId).toBe('early');
    expect(track.sampleAt(1.5)!.x).toBeCloseTo(1.5, 5);
  });
});

describe('compressSamples', () => {
  it('keeps very short tracks untouched', () => {
    const samples = [sample(0, 0, 0), sample(1, 1, 1)];
    expect(compressSamples(samples)).toHaveLength(2);
  });

  it('drops points that lie on a straight line', () => {
    const samples = Array.from({ length: 50 }, (_, i) => sample(i * 0.1, i * 0.2, 0));
    const compressed = compressSamples(samples);
    expect(compressed.length).toBeLessThan(6);
    expect(compressed[0].t).toBe(0);
    expect(compressed.at(-1)!.t).toBeCloseTo(4.9, 5);
  });

  it('keeps points on a curve', () => {
    const samples = Array.from({ length: 50 }, (_, i) =>
      sample(i * 0.1, Math.sin(i * 0.35) * 4, Math.cos(i * 0.35) * 4),
    );
    expect(compressSamples(samples).length).toBeGreaterThan(12);
  });

  it('never drops a motion-state change', () => {
    const samples = Array.from({ length: 30 }, (_, i) => {
      const s = sample(i * 0.1, i * 0.2, 0);
      s.motion = i === 15 ? 2 : 1;
      return s;
    });
    const compressed = compressSamples(samples);
    expect(compressed.some((s) => s.motion === 2)).toBe(true);
  });

  it('honours keepTimes', () => {
    const samples = Array.from({ length: 60 }, (_, i) => sample(i * 0.1, i * 0.2, 0));
    const compressed = compressSamples(samples, { keepTimes: [3.0] });
    expect(compressed.some((s) => Math.abs(s.t - 3.0) < 0.11)).toBe(true);
  });
});

describe('pack/unpack', () => {
  it('survives a full round trip within quantisation error', () => {
    const data: TrackData = {
      version: 2,
      visit: 5,
      duration: 12.345,
      samples: [sample(0, 1.2345, -2.3456, 1.5708), sample(6.1, 9.8765, 4.4444, -2.1)],
      events: [{ t: 3.3, kind: 'pickup', targetId: 'fuse' }],
      rooms: ['corridor', 'apt01'],
    };
    const restored = unpackTrack(packTrack(data));

    expect(restored.visit).toBe(5);
    expect(restored.duration).toBeCloseTo(12.345, 2);
    expect(restored.rooms).toEqual(['corridor', 'apt01']);
    expect(restored.events[0]).toEqual({ t: 3.3, kind: 'pickup', targetId: 'fuse' });
    expect(restored.samples[0].x).toBeCloseTo(1.2345, 2);
    expect(restored.samples[1].yaw).toBeCloseTo(-2.1, 2);
  });

  it('is meaningfully smaller than raw JSON', () => {
    const samples = Array.from({ length: 400 }, (_, i) => sample(i * 0.1, i * 0.2, Math.sin(i)));
    const data: TrackData = { version: 2, visit: 1, duration: 40, samples, events: [], rooms: [] };
    const rawSize = JSON.stringify(data).length;
    const packedSize = JSON.stringify(packTrack(data)).length;
    expect(packedSize).toBeLessThan(rawSize * 0.55);
  });

  it('tolerates a malformed packed payload', () => {
    const restored = unpackTrack({ v: 2, visit: 0, d: 0, s: [1, 2, 3], e: [], r: [] });
    expect(restored.samples).toHaveLength(0);
    expect(ReplayTrack.fromPacked(null).isEmpty).toBe(true);
  });
});
