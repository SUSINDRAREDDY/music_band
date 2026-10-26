// SSE may split at any byte, line, or event boundary.
export async function readSSE(body, onEvent) {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let pending = '',
    data = [];
  function line(value) {
    if (value === '') {
      if (data.length) {
        const payload = data.join('\n');
        data = [];
        onEvent(payload === '[DONE]' ? { done: true } : JSON.parse(payload));
      }
    } else if (value.startsWith('data:')) data.push(value.slice(5).trimStart());
  }
  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let i;
      while ((i = pending.indexOf('\n')) >= 0) {
        line(pending.slice(0, i).replace(/\r$/, ''));
        pending = pending.slice(i + 1);
      }
      if (done) break;
    }
    if (pending) line(pending.replace(/\r$/, ''));
    line('');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
