import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
export async function saveRequest(root, context) {
  const id = randomUUID(),
    dir = path.join(root, id);
  await mkdir(dir, { recursive: true });
  const { audio, ...analysis } = context;
  const bytes = audio ? Buffer.from(audio.split(',')[1], 'base64') : null;
  if (bytes) await writeFile(path.join(dir, 'input.wav'), bytes);
  await writeFile(
    path.join(dir, 'request.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        ...analysis,
        audioBytes: bytes?.length || 0,
        audioSha256: bytes
          ? createHash('sha256').update(bytes).digest('hex')
          : null,
      },
      null,
      2,
    ),
  );
  return { id, dir };
}
export async function saveEvents(dir, events) {
  await appendFile(
    path.join(dir, 'events.ndjson'),
    events.map((x) => JSON.stringify(x)).join('\n') + '\n',
  );
}
