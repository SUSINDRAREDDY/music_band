import test from 'node:test';
import assert from 'node:assert/strict';
import { periodicPitch } from '../public/pitch.mjs';
import { RecordingLookahead, sliceRecording } from '../public/lookahead.mjs';
import { validateContext } from '../public/music.mjs';
import { composerContext } from '../src/server/context.mjs';
test('periodic pitch follows isolated notes and does not invent a pitch for silence', () => {
  for (const note of [48, 60, 69, 76]) {
    const rate = 44100,
      f = 440 * 2 ** ((note - 69) / 12),
      x = Float32Array.from(
        { length: 8192 },
        (_, i) => 0.2 * Math.sin((2 * Math.PI * f * i) / rate),
      );
    const result = periodicPitch(x, rate);
    assert.equal(result.note, note);
    assert.ok(result.confidence > 0.85);
  }
  assert.equal(periodicPitch(new Float32Array(8192), 44100).note, null);
});
test('recording prepares all bars then uses one continuous source with shared anchors', () => {
  const starts = [],
    ctx = {
      currentTime: 10,
      createBufferSource: () => ({
        connect() {},
        disconnect() {},
        start(...args) {
          starts.push(args);
        },
        stop() {},
      }),
    };
  const player = new RecordingLookahead(ctx, { duration: 5 }),
    plan = { startSeconds: 0, secondsPerBar: 2, bpm: 120 };
  const notes = [{ instrument: 'piano', note: 60, beat: 0, duration: 4 }];
  for (let i = 0; i < 3; i++)
    assert.deepEqual(player.playBar(plan, i, notes, {}, 1), []);
  assert.equal(starts.length, 0);
  assert.equal(player.finished, true);
  const queued = player.startPlayback({});
  assert.equal(starts.length, 1);
  assert.equal(queued[0].time, starts[0][0]);
  assert.equal(queued[2].duration, 2);
  assert.deepEqual(player.startPlayback({}), []);
  player.stop();
});
test('lookahead context carries per-bar source positions and estimated ABC', () => {
  const evidence = {
    transcription: {
      events: [
        {
          kind: 'note',
          note: 60,
          startSeconds: 0,
          endSeconds: 0.5,
          confidence: 0.98,
        },
        {
          kind: 'silence',
          note: null,
          startSeconds: 0.5,
          endSeconds: 2,
          confidence: 0,
        },
      ],
    },
    durationSeconds: 2,
    onsetTimes: [0, 0.5, 1, 1.5],
    frames: [
      {
        seconds: 0.1,
        rms: 0.2,
        note: 60,
        confidence: 0.98,
        pitchClasses: [1, 0, 0, 0, 0.7, 0, 0, 0.6, 0, 0, 0, 0],
        peaks: [[60, 1]],
      },
    ],
  };
  const context = validateContext({
    bpm: 120,
    history: [],
    instruments: ['bass'],
    upcoming: Array.from({ length: 4 }, (_, index) => ({
      index,
      startSeconds: 10 + index * 2,
      evidence,
    })),
  });
  const sent = composerContext(context);
  assert.equal(sent.recordingLookahead, true);
  assert.equal(sent.upcoming[2].startSeconds, 14);
  assert.match(sent.upcoming[0].pitchCandidatesABC, /=C8 z24/);
  assert.throws(() => validateContext({ ...context, upcoming: [{}] }), /four/);
});

test('input ABC covers exactly one 4/4 bar at L:1/32', async () => {
  const { describeInputBar } = await import('../src/server/input-score.mjs');
  const { parseComposition } = await import('../src/server/abc.mjs');
  const score = describeInputBar(
    {
      index: 0,
      startSeconds: 0,
      evidence: {
        frames: [],
        onsetTimes: [],
        transcription: {
          events: [
            {
              kind: 'note',
              note: 60,
              startSeconds: 0,
              endSeconds: 1,
              confidence: 1,
            },
            {
              kind: 'silence',
              note: null,
              startSeconds: 1,
              endSeconds: 2,
              confidence: 0,
            },
          ],
        },
      },
    },
    120,
  );
  const abc = score.pitchCandidatesABC.replace('K:C\n', 'K:C\nV:piano\n');
  const parsed = parseComposition(abc, ['piano'], { bar: true });
  assert.equal(parsed.notes[0].duration, 2);
  assert.match(abc, /=C16 z16/);
});
