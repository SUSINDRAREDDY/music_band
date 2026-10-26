export async function* readMusicStream(body) {
  if (!body) throw Error('Composer response had no stream');
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let pending = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let index;
      while ((index = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, index).trim();
        pending = pending.slice(index + 1);
        if (line) yield JSON.parse(line);
      }
      if (done) {
        if (pending.trim()) yield JSON.parse(pending);
        return;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}
    reader.releaseLock();
  }
}
