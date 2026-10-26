import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import {
  LiveTiming,
  LivePulse,
  inputChanged,
  evidenceSignature,
} from '../public/live.mjs';
import { validateContext } from '../public/music.mjs';
import { analyseRecording } from '../public/features.mjs';
import { composerContext } from '../src/server/context.mjs';
import { BarStream } from '../src/server/abc.mjs';
import { Composer } from '../src/server/composer.mjs';
const requestId = '00000000-0000-4000-8000-000000000001';
const live = {
  requestId,
  window: {
    startSeconds: 0,
    endSeconds: 10,
    overlapSeconds: 0,
    droppedSeconds: 0,
  },
  playback: {
    nowSeconds: 10,
    queuedUntilSeconds: 0,
    lastPlayedSection: null,
    skippedNotes: 0,
  },
  generation: { secondsNeeded: 6, leadSeconds: 3 },
};
const header = 'X:1\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\n';
const section = 'V:piano\nC4|\n%endbar\n';

test('live entry uses captured audio clock and pulse; queued sections stay continuous', () => {
  const p = new LivePulse(),
    onsetTimes = Array.from({ length: 10 }, (_, i) => 0.23 + i * 0.5);
  p.observe({ startTime: 100, endTime: 105 }, { onsetTimes });
  assert.ok(Math.abs(p.anchor(104.9, 0, 120) - 105.23) < 1e-8);
  assert.equal(p.anchor(104.9, 106.07, 120), 106.07);
  assert.ok(Math.abs(p.anchor(105.4, 105, 120) - 105.73) < 1e-8);
  // The capture overlap must not count a previous attack twice.
  p.observe({ startTime: 104.5, endTime: 105.5 }, { onsetTimes: [0.23, 0.73] });
  assert.equal(p.onsets.length, 11);
  assert.equal(p.anchor(120, 0, 120), 120.15);
});

test('ambiguous or absent pulse never forces an alignment', () => {
  const p = new LivePulse();
  assert.equal(p.anchor(10, 0, 120), 10.15);
  p.observe(
    { startTime: 0, endTime: 1 },
    {
      onsetTimes: [
        0, 0.08, 0.17, 0.26, 0.34, 0.43, 0.51, 0.6, 0.69, 0.77, 0.86, 0.94,
      ],
    },
  );
  assert.equal(p.anchor(1, 0, 120), 1.15);
});

test('worklet retains ten seconds and sends timestamped increments with explicit overlap and overflow', () => {
  let Capture, message;
  const sandbox = {
    sampleRate: 10,
    currentTime: 0,
    Float32Array,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = {
          postMessage: (m) => {
            message = m;
          },
        };
      }
    },
    registerProcessor: (_, ctor) => {
      Capture = ctor;
    },
  };
  vm.runInNewContext(
    readFileSync(new URL('../public/capture.mjs', import.meta.url), 'utf8'),
    sandbox,
  );
  const capture = new Capture();
  capture.process([[Float32Array.from({ length: 100 }, (_, i) => i)]]);
  capture.port.onmessage({ data: { type: 'snapshot', sinceFrame: 0 } });
  assert.equal(message.channels[0].length, 100);
  assert.equal(message.endTime, 10);
  assert.equal(message.startFrame, 0);
  assert.equal(message.channels[0][99], 99);
  capture.process([[Float32Array.from({ length: 10 }, (_, i) => i + 100)]]);
  capture.port.onmessage({ data: { type: 'snapshot', sinceFrame: 100 } });
  assert.deepEqual(
    [...message.channels[0]],
    Array.from({ length: 12 }, (_, i) => i + 98),
  );
  assert.equal(message.overlapSeconds, 0.2);
  assert.equal(message.startTime, 9.8);
  assert.equal(message.endTime, 11);
  capture.process([[new Float32Array(150)]]);
  capture.port.onmessage({ data: { type: 'snapshot', sinceFrame: 110 } });
  assert.equal(message.channels[0].length, 120);
  assert.equal(message.droppedSeconds, 3);
  assert.equal(message.overlapSeconds, 0);
});

test('ten-second evidence survives validation and compression, including its final events', () => {
  const sampleRate = 12000,
    channels = [
      Float32Array.from(
        { length: sampleRate * 10 },
        (_, i) => 0.1 * Math.sin((2 * Math.PI * 220 * i) / sampleRate),
      ),
    ];
  const evidence = analyseRecording({ channels, sampleRate });
  const checked = validateContext({
    live,
    bpm: 120,
    tempoMode: 'manual',
    history: [],
    instruments: ['piano'],
    evidence,
  });
  assert.equal(checked.evidence.durationSeconds, 10);
  assert.equal(checked.evidence.transcription.events.at(-1).endSeconds, 10);
  const input = composerContext(checked);
  assert.equal(input.inputABC.length, 5);
  assert.equal(input.previous, undefined);
  assert.equal(input.live.window.endSeconds, 10);
  assert.throws(
    () =>
      validateContext({
        ...checked,
        live: { ...live, window: { ...live.window, endSeconds: 100 } },
      }),
    /timing/,
  );
});

test('live stream accepts variable section count and written durations without rewriting notes', () => {
  for (const count of [1, 2, 5]) {
    const events = [],
      stream = new BarStream(['piano'], (e) => events.push(e), { live: true });
    for (const char of header + section.repeat(count)) stream.push(char);
    stream.finish();
    assert.equal(events.filter((e) => e.type === 'bar').length, count);
  }
  const events = [],
    stream = new BarStream(['piano'], (e) => events.push(e), { live: true });
  stream.push(
    header +
      section.replace('C4', 'C2') +
      section.replace('C4', 'D4') +
      section.replace('C4', 'z4'),
  );
  stream.finish();
  const bars = events.filter((e) => e.type === 'bar');
  assert.deepEqual(
    bars.map((e) => e.durationBeats),
    [2, 4, 4],
  );
  assert.equal(bars[0].notes[0].duration, 2);
  assert.equal(stream.notes[1].beat, 2);
  assert.equal(bars[2].notes.length, 0);
});

test('live stream skips unreadable sections and unfinished tail without losing later playable music', () => {
  const events = [],
    stream = new BarStream(['piano'], (e) => events.push(e), { live: true });
  stream.push(
    header +
      section +
      section.replace('piano', 'unknown') +
      section +
      'V:piano\n[CE',
  );
  stream.finish();
  assert.equal(events.filter((e) => e.type === 'bar').length, 2);
  assert.equal(events.filter((e) => e.type === 'notation-warning').length, 2);
  assert.throws(
    () => new BarStream(['piano'], () => {}, { live: true }).finish(),
    /No playable/,
  );
});

test('adaptive buffering follows measured delivery latency and introduces no fixed bar count', () => {
  const timing = new LiveTiming();
  assert.equal(timing.needsMusic(10, 20), false);
  timing.observe(1);
  assert.equal(timing.leadSeconds, 1.25);
  assert.equal(timing.needsMusic(10, 11), true);
  assert.equal(timing.request(10, 11).secondsNeeded, 1.5);
  timing.observe(5);
  assert.equal(timing.leadSeconds, 5.25);
  assert.equal(timing.needsMusic(10, 14), true);
  assert.equal(timing.request(10, 14).secondsNeeded, 6.5);
});

test('input changes distinguish pitch changes and silence without inventing chords', () => {
  const evidence = (note) => ({
    frames: [
      {
        rms: 0.1,
        pitchClasses: Array.from({ length: 12 }, (_, i) =>
          i === note ? 1 : 0,
        ),
      },
    ],
  });
  const a = evidenceSignature(evidence(0));
  assert.equal(inputChanged(a, evidenceSignature(evidence(0))), false);
  assert.equal(inputChanged(a, evidenceSignature(evidence(7))), true);
  assert.equal(inputChanged(a, evidenceSignature({ frames: [] })), true);
});

async function activeComposer() {
  const c = new Composer('/tmp'),
    calls = [],
    events = [];
  c.connect = async () => {};
  c.credentialStamp = () => 'same';
  c.rpc = async (method, params) => {
    calls.push({ method, params });
    if (method === 'account/read') return { account: {} };
    if (method === 'thread/start') return { thread: { id: 'thread' } };
    if (method === 'turn/start') return { turn: { id: 'turn' } };
    if (method === 'turn/steer') return { turnId: 'turn' };
    return {};
  };
  await c.startSession('session');
  const abort = new AbortController();
  const context = {
    sessionId: 'session',
    live: structuredClone(live),
    bpm: 120,
    tempoMode: 'manual',
    history: [],
    instruments: ['piano'],
  };
  const done = c.compose(context, (e) => events.push(e), abort.signal);
  await new Promise((resolve) => setImmediate(resolve));
  return { c, calls, events, context, done, abort };
}

test('steers the same active thread with a turn precondition; old requests cannot steer the next turn', async () => {
  const { c, calls, events, context, done } = await activeComposer();
  assert.deepEqual(
    await c.steer({ ...context, live: { ...live, requestId: 'stale' } }),
    { accepted: false },
  );
  const result = await c.steer(context);
  assert.equal(result.accepted, true);
  const call = calls.find((x) => x.method === 'turn/steer');
  assert.equal(call.params.threadId, 'thread');
  assert.equal(call.params.expectedTurnId, 'turn');
  const input = JSON.parse(call.params.input[0].text);
  assert.equal(input.updateOnly, true);
  assert.equal(input.continuity, undefined);
  assert.equal(input.previous, undefined);
  c.message({
    method: 'item/agentMessage/delta',
    params: { threadId: 'thread', turnId: 'turn', delta: header + section },
  });
  c.message({
    method: 'turn/completed',
    params: { threadId: 'thread', turn: { id: 'turn', status: 'completed' } },
  });
  await done;
  assert.equal(events.filter((e) => e.type === 'bar').length, 1);
  assert.equal((await c.steer(context)).accepted, false);
  for (const call of calls.filter((x) =>
    ['thread/start', 'turn/start'].includes(x.method),
  )) {
    assert.equal(call.params.model, 'gpt-6.1-sol');
    assert.equal(call.params.serviceTier, 'fast');
  }
  c.endSession('session');
});

test('buffer budget commits only complete sections even when a model delta contains excessive music', async () => {
  const { c, calls, events, done } = await activeComposer();
  c.message({
    method: 'item/agentMessage/delta',
    params: {
      threadId: 'thread',
      turnId: 'turn',
      delta: header + section.repeat(12),
    },
  });
  await done;
  await c.flow.idle;
  assert.equal(events.filter((e) => e.type === 'bar').length, 3);
  assert.equal(events.find((e) => e.type === 'done').generatedSeconds, 6);
  assert.equal(calls.filter((x) => x.method === 'turn/interrupt').length, 1);
  assert.equal(c.job, null);
  c.endSession('session');
});

test('Stop during steering rejects stale input safely and does not resurrect the session', async () => {
  const { c, context, done } = await activeComposer();
  let release;
  const rpc = c.rpc;
  c.rpc = (method, params) =>
    method === 'turn/steer'
      ? new Promise((resolve, reject) => {
          release = reject;
        })
      : rpc(method, params);
  const update = c.steer(context);
  await new Promise((resolve) => setImmediate(resolve));
  const ended = assert.rejects(done, /Cancelled/);
  c.endSession('session');
  release(Error('No active turn'));
  assert.equal((await update).accepted, false);
  await ended;
  assert.equal(c.flow, null);
  assert.equal(c.job, null);
});

test('a malformed first section retains the header for the next readable section', () => {
  const events = [],
    stream = new BarStream(['piano'], (e) => events.push(e), { live: true });
  stream.push(header + section.replace('piano', 'unknown') + section);
  stream.finish();
  assert.equal(events.filter((e) => e.type === 'bar').length, 1);
  assert.equal(events.find((e) => e.type === 'bar').notes[0].note, 60);
});
