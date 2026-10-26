import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionArchive } from '../src/server/session-archive.mjs';
test('full sessions survive Stop and a new archive instance without truncating earlier turns', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'beat-archive-')),
    id = '00000000-0000-4000-8000-000000000001';
  try {
    const archive = new SessionArchive(root);
    await archive.append(id, { type: 'session-start' });
    await Promise.all(
      Array.from({ length: 20 }, (_, turn) =>
        archive.append(id, { type: 'model-input', turn }),
      ),
    );
    await archive.append(id, { type: 'session-stop' });
    const restored = new SessionArchive(root),
      events = (await restored.read(id)).trim().split('\n').map(JSON.parse);
    assert.equal(events.length, 22);
    assert.deepEqual(
      events.slice(1, -1).map((e) => e.turn),
      Array.from({ length: 20 }, (_, i) => i),
    );
    assert.equal(events.at(-1).type, 'session-stop');
    assert.equal((await restored.list())[0].sessionId, id);
    assert.throws(() => restored.file('../outside'), /Invalid session/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
