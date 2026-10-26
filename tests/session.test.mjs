import test from 'node:test';
import assert from 'node:assert/strict';
import { Composer } from '../src/server/composer.mjs';

const abc =
  'X:1\nM:4/4\nL:1/8\nQ:1/4=150\nK:C\n' +
  Array(4).fill('V:pluck\nC2 E2 G2 z2 |\n%endbar\n').join('');
function mock() {
  const c = new Composer('/tmp'),
    calls = [];
  let threads = 0,
    turns = 0;
  c.connect = async () => {};
  c.credentialStamp = () => 'same';
  c.rpc = async (method, params) => {
    calls.push({ method, params });
    if (method === 'account/read') return { account: { type: 'chatgpt' } };
    if (method === 'thread/start')
      return { thread: { id: 'thread-' + ++threads } };
    if (method === 'turn/start') {
      const id = 'turn-' + ++turns;
      setImmediate(() => {
        c.message({
          method: 'item/agentMessage/delta',
          params: { threadId: params.threadId, turnId: id, delta: abc },
        });
        c.message({
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: { id, status: 'completed' },
          },
        });
      });
      return { turn: { id } };
    }
    return {};
  };
  return { c, calls };
}
test('multiple phrases reuse one thread; Stop releases it and Start creates a fresh one', async () => {
  const { c, calls } = mock(),
    events = [];
  await c.startSession('flow-a');
  for (let phraseIndex = 0; phraseIndex < 2; phraseIndex++)
    await c.compose(
      {
        sessionId: 'flow-a',
        bpm: 150,
        history: [],
        instruments: ['pluck'],
        phraseIndex,
      },
      (e) => events.push(e),
      new AbortController().signal,
    );
  assert.equal(calls.filter((x) => x.method === 'thread/start').length, 1);
  assert.equal(calls.filter((x) => x.method === 'account/read').length, 1);
  assert.equal(events.filter((x) => x.type === 'bar').length, 8);
  assert.deepEqual(
    calls
      .filter((x) => x.method === 'turn/start')
      .map((x) => x.params.threadId),
    ['thread-1', 'thread-1'],
  );
  assert.equal(
    calls.filter((x) => x.method === 'thread/unsubscribe').length,
    0,
  );
  c.endSession('old-flow');
  assert.equal(c.flow.id, 'flow-a');
  c.endSession('flow-a');
  await c.startSession('flow-b');
  assert.equal(c.flow.threadId, 'thread-2');
  assert.equal(
    calls.filter((x) => x.method === 'thread/unsubscribe').length,
    1,
  );
  await assert.rejects(
    c.compose(
      { sessionId: 'flow-a', instruments: ['pluck'] },
      () => {},
      new AbortController().signal,
    ),
    /expired/,
  );
  c.endSession('flow-b');
});
test('Stop during thread setup releases the late thread and concurrent starts share setup', async () => {
  const { c, calls } = mock(),
    rpc = c.rpc;
  let release;
  c.rpc = async (method, params) =>
    method === 'thread/start'
      ? new Promise((resolve) => {
          release = resolve;
        })
      : rpc(method, params);
  const first = c.startSession('flow'),
    second = c.startSession('flow');
  const rejected = Promise.allSettled([first, second]);
  await new Promise((resolve) => setImmediate(resolve));
  c.endSession('flow');
  release({ thread: { id: 'late' } });
  assert.ok((await rejected).every((x) => x.status === 'rejected'));
  assert.equal(c.flow, null);
  assert.equal(
    calls.filter(
      (x) => x.method === 'thread/unsubscribe' && x.params.threadId === 'late',
    ).length,
    1,
  );
});
test('invalid notation interrupts the turn, then corrects within the same session', async () => {
  const { c, calls } = mock(),
    message = c.message.bind(c);
  let corrupt = true;
  c.message = (m) => {
    if (corrupt && m.method === 'item/agentMessage/delta') {
      corrupt = false;
      m.params.delta = m.params.delta.replace('C2 E2 G2 z2', 'C2');
    }
    message(m);
  };
  await c.startSession('flow');
  const context = {
    sessionId: 'flow',
    bpm: 150,
    history: [],
    instruments: ['pluck'],
  };
  await assert.rejects(
    c.compose(context, () => {}, new AbortController().signal),
    /exactly one/,
  );
  await c.compose(context, () => {}, new AbortController().signal);
  assert.equal(calls.filter((x) => x.method === 'thread/start').length, 1);
  assert.equal(calls.filter((x) => x.method === 'turn/interrupt').length, 1);
  const turns = calls.filter((x) => x.method === 'turn/start');
  assert.match(
    JSON.parse(turns[1].params.input[0].text).notationCorrection,
    /exactly one/,
  );
  c.endSession('flow');
});
