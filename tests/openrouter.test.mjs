import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OpenRouterComposer,
  OPENROUTER_MODEL,
} from '../src/server/openrouter.mjs';
const sessionId = 'session',
  header = 'X:1\nM:4/4\nL:1/8\nQ:1/4=120\nK:C\n',
  bar = 'V:piano\nC2 E2 G2 z2|\n%endbar\n';
const context = {
  sessionId,
  bpm: 120,
  tempoMode: 'manual',
  history: [],
  instruments: ['piano'],
};
function stream(text, reason = 'stop', done = true) {
  return new Response(
    'data: ' +
      JSON.stringify({
        choices: [{ delta: { content: text }, finish_reason: null }],
      }) +
      '\n\ndata: ' +
      JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] }) +
      '\n\n' +
      (done ? 'data: [DONE]\n\n' : ''),
  );
}

test('OpenRouter streams four recording bars with the shared prompt and server-only key', async () => {
  let request;
  const events = [];
  const c = new OpenRouterComposer({
    apiKey: 'test-secret',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-secret');
      request = JSON.parse(options.body);
      return stream(header + bar.repeat(4));
    },
  });
  await c.startSession(sessionId);
  await c.compose(context, (e) => events.push(e), new AbortController().signal);
  assert.equal(request.model, OPENROUTER_MODEL);
  assert.equal(request.reasoning.effort, 'low');
  assert.match(request.messages[0].content, /PLAY AS A BAND/);
  assert.doesNotMatch(JSON.stringify(request), /test-secret|confidence/i);
  assert.equal(events.filter((e) => e.type === 'bar').length, 4);
  assert.equal(events.at(-1).type, 'done');
  assert.equal(c.job, null);
});

test('live budget accepts variable sections and saves only delivered music', async () => {
  const events = [],
    c = new OpenRouterComposer({
      apiKey: 'test',
      fetchImpl: async () => stream(header + bar.repeat(10)),
    });
  await c.startSession(sessionId);
  await c.compose(
    {
      ...context,
      live: { requestId: 'request', generation: { secondsNeeded: 3 } },
    },
    (e) => events.push(e),
    new AbortController().signal,
  );
  assert.equal(events.filter((e) => e.type === 'bar').length, 2);
  assert.equal(events.at(-1).generatedSeconds, 4);
  assert.equal((c.flow.messages[1].content.match(/%endbar/g) || []).length, 2);
});

test('updates are retained for the next request and old requests cannot update a new one', async () => {
  let release;
  const requests = [];
  const c = new OpenRouterComposer({
    apiKey: 'test',
    fetchImpl: async (_, options) => {
      requests.push(JSON.parse(options.body));
      if (requests.length === 1)
        await new Promise((r) => {
          release = r;
        });
      return stream(header + bar.repeat(4));
    },
  });
  await c.startSession(sessionId);
  const current = {
    ...context,
    live: { requestId: 'request', generation: { secondsNeeded: 3 } },
  };
  const first = c.compose(current, () => {}, new AbortController().signal);
  assert.equal(
    (await c.steer({ ...current, live: { ...current.live, requestId: 'old' } }))
      .accepted,
    false,
  );
  assert.deepEqual(
    await c.steer({
      ...current,
      musicalDirection: 'Answer the changed melody',
    }),
    { accepted: true, delivery: 'next-request' },
  );
  release();
  await first;
  await c.compose(current, () => {}, new AbortController().signal);
  assert.equal(requests[1].messages.length, 4);
  const input = JSON.parse(requests[1].messages.at(-1).content);
  assert.equal(
    input.interveningObservations[0].musicalDirection,
    'Answer the changed melody',
  );
  assert.equal(c.flow.pending.length, 0);
  c.endSession(sessionId);
  assert.equal(c.flow, null);
});

test('HTTP and streaming errors never reveal provider error bodies or falsely finish', async () => {
  for (const response of [
    () => new Response('test-secret', { status: 401 }),
    () => new Response('data: {"error":{"message":"test-secret"}}\n\n'),
  ]) {
    const c = new OpenRouterComposer({
        apiKey: 'test-secret',
        fetchImpl: async () => response(),
      }),
      events = [];
    await c.startSession(sessionId);
    await assert.rejects(
      c.compose(context, (e) => events.push(e), new AbortController().signal),
      (e) => !/test-secret/.test(e.message),
    );
    assert.equal(c.job, null);
    assert.equal(
      events.some((e) => e.type === 'done'),
      false,
    );
  }
});

test('truncated output preserves playable bars but does not report completion', async () => {
  const c = new OpenRouterComposer({
      apiKey: 'test',
      fetchImpl: async () => stream(header + bar, 'length', false),
    }),
    events = [];
  await c.startSession(sessionId);
  await assert.rejects(
    c.compose(context, (e) => events.push(e), new AbortController().signal),
    /incomplete/,
  );
  assert.equal(events.filter((e) => e.type === 'bar').length, 1);
  assert.equal(
    events.some((e) => e.type === 'done'),
    false,
  );
});

test('Stop aborts the active HTTP request and releases session state', async () => {
  const c = new OpenRouterComposer({
    apiKey: 'test',
    fetchImpl: async (_, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => reject(Error('Cancelled')),
          { once: true },
        );
      }),
  });
  await c.startSession(sessionId);
  const result = c.compose(context, () => {}, new AbortController().signal);
  const rejected = assert.rejects(result, /Cancelled/);
  c.endSession(sessionId);
  await rejected;
  assert.equal(c.job, null);
  assert.equal(c.flow, null);
});
