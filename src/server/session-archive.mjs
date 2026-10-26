import { mkdir, appendFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Append while running so Stop, a page reload, or a later server restart cannot
// discard a completed turn. Audio bytes are deliberately excluded.
export class SessionArchive {
  constructor(root) {
    this.root = root;
    this.pending = Promise.resolve();
  }
  file(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('Invalid session');
    return path.join(this.root, id + '.ndjson');
  }
  append(id, event) {
    const file = this.file(id),
      line = JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n';
    const write = this.pending.then(async () => {
      await mkdir(this.root, { recursive: true });
      await appendFile(file, line);
    });
    this.pending = write.catch(() => {});
    return write;
  }
  async read(id) {
    await this.pending;
    return readFile(this.file(id), 'utf8');
  }
  async list() {
    await this.pending;
    let files;
    try {
      files = await readdir(this.root);
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    return files
      .filter((f) => /^[a-f0-9-]{36}\.ndjson$/.test(f))
      .map((f) => ({
        sessionId: f.slice(0, -7),
        url: '/sessions/' + f.slice(0, -7),
      }));
  }
}
