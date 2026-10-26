import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleSection, audioStatus } from '../public/playback.mjs';

test('all prepared notes reach the audio clock immediately, without waiting for scheduler timers', () => {
  const calls = [],
    band = { play: (note, time, tempo) => calls.push({ note, time, tempo }) };
  const notes = [
    { instrument: 'piano', note: 60, beat: 0, duration: 1, velocity: 0.5 },
    { instrument: 'piano', note: 64, beat: 3, duration: 1, velocity: 0.5 },
  ];
  const result = scheduleSection(band, notes, 10, 120, 7);
  assert.deepEqual(
    calls.map((n) => n.time),
    [10, 11.5],
  );
  assert.ok(result.scheduled.every((n) => n.scheduled && n.version === 7));
  assert.deepEqual(result.failed, []);
});
test('one unavailable sample does not discard playable notes in the section', () => {
  const band = {
    play: (n) => {
      if (n.note === 64) throw Error('Sample missing');
    },
  };
  const result = scheduleSection(
    band,
    [
      { note: 60, beat: 0 },
      { note: 64, beat: 1 },
      { note: 67, beat: 2 },
    ],
    10,
    120,
    1,
  );
  assert.deepEqual(
    result.scheduled.map((n) => n.note),
    [60, 67],
  );
  assert.equal(result.failed[0].error, 'Sample missing');
});
test('queued notes, rests, muted channels and suspended contexts never falsely report playing', () => {
  const base = {
    state: 'running',
    muted: false,
    loading: false,
    peak: 0,
    lastSignalAge: 10,
    queued: 2,
    hasSections: true,
    expectedSound: false,
    error: null,
  };
  assert.match(audioStatus(base), /queued/);
  assert.match(audioStatus({ ...base, state: 'suspended' }), /Enable audio/);
  assert.match(audioStatus({ ...base, muted: true }), /muted/);
  assert.match(audioStatus({ ...base, queued: 0 }), /resting/);
  assert.match(audioStatus({ ...base, expectedSound: true }), /No band output/);
  assert.match(
    audioStatus({ ...base, error: 'Sample missing' }),
    /Sample missing/,
  );
  assert.equal(audioStatus({ ...base, peak: 0.01 }), 'Playing accompaniment');
});

test('quiet soundfont samples are level-matched with a bounded boost', async () => {
  const { sampleGainForPeak } = await import('../public/audio.mjs');
  assert.equal(sampleGainForPeak(0.1), 8);
  assert.equal(sampleGainForPeak(0.8), 1);
  assert.equal(sampleGainForPeak(1), 0.8);
  assert.equal(sampleGainForPeak(0.0001), 32);
  assert.equal(sampleGainForPeak(0), 0);
});
test('very faint output is reported as quiet rather than normal playback', () => {
  assert.match(
    audioStatus({
      state: 'running',
      peak: 0.0007,
      lastSignalAge: 10,
      hasSections: true,
    }),
    /very quiet/,
  );
});
