import test from 'node:test';
import assert from 'node:assert/strict';
import { BarStream } from '../src/server/abc.mjs';
import { joinSustains } from '../public/sustain.mjs';
const bar = 'X:1\nM:4/4\nL:1/4\nK:C\nV:piano\nC4|\n';
test('explicit hold survives chunk boundaries and rejects a nonexistent boundary note', () => {
  const events = [],
    stream = new BarStream(['piano'], (e) => events.push(e));
  for (const c of bar + '%hold piano 60\n%endbar\n') stream.push(c);
  assert.equal(events[0].notes[0].sustain, true);
  assert.throws(
    () =>
      new BarStream(['piano'], () => {}).push(
        bar + '%hold piano 62\n%endbar\n',
      ),
    /boundary/,
  );
});
test('only explicit, adjacent same-pitch same-instrument holds merge, across tempo changes', () => {
  const a = {
    instrument: 'piano',
    note: 60,
    time: 0,
    duration: 4,
    tempo: 120,
    sustain: true,
  };
  const b = { instrument: 'piano', note: 60, time: 2, duration: 2, tempo: 60 };
  const merged = joinSustains([a, b]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].duration, 8);
  assert.equal(a.duration, 4);
  for (const next of [
    { ...b, time: 2.1 },
    { ...b, note: 62 },
    { ...b, instrument: 'bass' },
  ])
    assert.equal(joinSustains([a, next]).length, 2);
  assert.equal(joinSustains([{ ...a, sustain: false }, b]).length, 2);
});
