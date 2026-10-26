import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseRecording } from '../public/features.mjs';
import { validateContext } from '../public/music.mjs';
test('spectral evidence follows source pitches without changing input samples', () => {
  const rate = 24000;
  for (const midi of [48, 57, 64, 72]) {
    const input = Float32Array.from(
        { length: rate },
        (_, i) =>
          0.3 *
          Math.sin((2 * Math.PI * 440 * 2 ** ((midi - 69) / 12) * i) / rate),
      ),
      original = input.slice();
    const e = analyseRecording({ channels: [input], sampleRate: rate });
    assert.deepEqual(input, original);
    const f = e.frames[1];
    assert.equal(
      f.pitchClasses.indexOf(Math.max(...f.pitchClasses)),
      midi % 12,
    );
    assert.equal(f.peaks[0][0], midi);
    assert.ok(
      validateContext({ bpm: 100, history: [], evidence: e }).evidence.frames
        .length,
    );
  }
});
test('silence carries no invented pitch energy', () => {
  const e = analyseRecording({
    channels: [new Float32Array(24000)],
    sampleRate: 24000,
  });
  assert.ok(
    e.frames.every((f) => f.rms === 0 && f.pitchClasses.every((v) => v === 0)),
  );
  assert.deepEqual(e.onsetTimes, []);
});

test('composer retains every frame of harmonic changes and silence', async () => {
  const { composerContext } = await import('../src/server/context.mjs');
  const frame = (seconds, pitches) => ({
    seconds,
    rms: pitches.length ? 0.2 : 0,
    pitchClasses: Array.from({ length: 12 }, (_, i) =>
      pitches.includes(i) ? 1 : 0,
    ),
    peaks: [],
  });
  const evidence = {
    durationSeconds: 3,
    frames: [frame(0.2, [0, 4, 7]), frame(1.2, [2, 5, 9]), frame(2.2, [])],
    onsetTimes: [],
  };
  const out = composerContext({ bpm: 100, tempoMode: 'auto', evidence });
  assert.deepEqual(out.evidence.frames, evidence.frames);
  assert.equal(out.evidence.harmonicTimeline, undefined);
  assert.equal(out.bpm, undefined);
});
test('full model evidence excludes audio bytes and retains measured pitch ordering', async () => {
  const { composerContext } = await import('../src/server/context.mjs');
  const frames = Array.from({ length: 6 }, (_, i) => ({
    seconds: i * 0.2,
    rms: 0.3,
    pitchClasses: [1, 0, 0.2, 0, 0.5, 0, 0, 0.6, 0, 0.1, 0, 0],
    peaks: [],
  }));
  const out = composerContext({
    bpm: 120,
    audio: 'private-bytes',
    history: [],
    previous: [],
    evidence: {
      frames,
      onsetTimes: [0.1, 0.6],
      pitchClassOrder: 'C C# D D# E F F# G G# A A# B',
    },
  });
  assert.equal(out.audio, undefined);
  assert.deepEqual(out.evidence.frames, frames);
  assert.deepEqual(out.evidence.onsetTimes, [0.1, 0.6]);
});

test('live input carries provisional ABC without silently assigning C major or tempo', async () => {
  const { composerContext } = await import('../src/server/context.mjs');
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
        pitchClasses: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        peaks: [[60, 1]],
      },
    ],
  };
  const sent = composerContext({ bpm: 120, tempoMode: 'manual', evidence });
  assert.match(sent.inputABC[0].abc, /=C/);
  assert.equal(sent.evidence.frames[0].note, 60);
  const uncertain = composerContext({
    bpm: 100,
    tempoMode: 'auto',
    evidence: { ...evidence, onsetTimes: [] },
  });
  assert.equal(uncertain.inputABC, undefined);
  assert.equal(uncertain.bpm, undefined);
});

test('live and recording inputs retain low-score music without confidence fields or gating', async () => {
  const { composerContext } = await import('../src/server/context.mjs');
  const { MUSIC_INSTRUCTIONS } = await import('../src/server/music-prompt.mjs');
  const events = [
    {
      kind: 'note',
      note: 66,
      startSeconds: 0,
      endSeconds: 0.5,
      confidence: 0.01,
    },
    {
      kind: 'unknown',
      note: null,
      startSeconds: 0.5,
      endSeconds: 1,
      confidence: 0,
    },
  ];
  const frames = Array.from({ length: 12 }, (_, i) => ({
    seconds: i * 0.1,
    rms: 0.03,
    note: 66,
    confidence: 0.01,
    pitchClasses: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    peaks: [
      [66, 1],
      [78, 0.6],
    ],
  }));
  const evidence = {
    durationSeconds: 1.2,
    frames,
    onsetTimes: [0.1, 0.6],
    transcription: { events },
  };
  const context = {
    bpm: 120,
    tempoMode: 'manual',
    history: [{ chord: 'F#', at: 0.2, energy: 0.03, confidence: 0.01 }],
    instruments: ['drums', 'keys'],
    evidence,
  };
  const live = composerContext(context);
  assert.equal(live.history.length, 1);
  assert.equal(live.evidence.frames.length, 12);
  assert.deepEqual(
    live.evidence.frames.map((f) => f.peaks),
    frames.map((f) => f.peaks),
  );
  assert.deepEqual(
    live.evidence.frames.map((f) => f.pitchClasses),
    frames.map((f) => f.pitchClasses),
  );
  assert.equal(live.evidence.noteEvents[0].note, 66);
  assert.equal(live.evidence.noteEvents.length, 2);
  const recording = composerContext({
    ...context,
    upcoming: Array.from({ length: 4 }, (_, index) => ({
      index,
      startSeconds: index * 2,
      evidence,
    })),
  });
  for (const bar of recording.upcoming) {
    assert.equal(bar.frames.length, 12);
    assert.equal(bar.noteEvents[0].note, 66);
    assert.deepEqual(bar.evidence.onsetTimes, evidence.onsetTimes);
  }
  assert.doesNotMatch(JSON.stringify(live), /confidence/i);
  assert.doesNotMatch(JSON.stringify(recording), /confidence/i);
  assert.doesNotMatch(MUSIC_INSTRUCTIONS, /confidence/i);
  // Local observations remain untouched for analysis and diagnostics.
  assert.equal(evidence.transcription.events[0].confidence, 0.01);
});
