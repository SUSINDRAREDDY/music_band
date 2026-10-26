import test from 'node:test';
import assert from 'node:assert/strict';
import { readSSE } from '../src/server/sse.mjs';

test('SSE preserves UTF-8 across single-byte chunks and CRLF boundaries', async () => {
  const bytes = new TextEncoder().encode(
    'data: {"text":"café"}\r\n\r\ndata: [DONE]\r\n\r\n',
  );
  const body = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const events = [];
  await readSSE(body, (event) => events.push(event));
  assert.deepEqual(events, [{ text: 'café' }, { done: true }]);
});

test('SSE flushes the final event and ignores heartbeat comments', async () => {
  const events = [];
  await readSSE(
    new Response(': heartbeat\n\ndata: {"ok":true}').body,
    (event) => events.push(event),
  );
  assert.deepEqual(events, [{ ok: true }]);
});
