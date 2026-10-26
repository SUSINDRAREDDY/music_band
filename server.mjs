import { SessionArchive } from './src/server/session-archive.mjs';
import { saveRequest, saveEvents } from './src/server/diagnostics.mjs';
import http from 'node:http';
import {
  Composer,
  COMPOSER_MODEL,
  COMPOSER_TIER,
} from './src/server/composer.mjs';
import {
  OpenRouterComposer,
  OPENROUTER_MODEL,
} from './src/server/openrouter.mjs';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContext } from './public/music.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(root, '.env.local'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const diagnosticsEnabled = process.env.BEAT_DIAGNOSTICS === '1';
const cwd = await mkdtemp(path.join(tmpdir(), 'find-the-beat-'));
const port = Number(process.env.BEAT_PORT || 4318),
  provider =
    process.env.MUSIC_PROVIDER === 'openrouter' ? 'OpenRouter' : 'Codex';
const model =
  provider === 'OpenRouter'
    ? process.env.OPENROUTER_MODEL || OPENROUTER_MODEL
    : COMPOSER_MODEL;
const serviceTier = provider === 'OpenRouter' ? 'standard' : COMPOSER_TIER;
let active = null,
  saving = false;
const archive = new SessionArchive(path.join(root, 'diagnostics', 'sessions'));
function archiveEvent(id, event) {
  return archive.append(id, event).catch((error) => {
    console.error('Session archive failed:', error.message);
    throw error;
  });
}
const reportFile = path.join(root, 'diagnostics', `recent-status-${port}.json`);
let previousReports = {};
try {
  previousReports = JSON.parse(await readFile(reportFile, 'utf8'));
} catch {}
const playbackReports = Array.isArray(previousReports.playback)
  ? previousReports.playback.slice(-120)
  : [];
const composerReports = Array.isArray(previousReports.composer)
  ? previousReports.composer.slice(-80)
  : [];
let reportTimer,
  reportWrites = Promise.resolve();
function persistReports() {
  if (reportTimer) return;
  reportTimer = setTimeout(() => {
    reportTimer = null;
    const data = JSON.stringify({
      playback: playbackReports,
      composer: composerReports,
    });
    reportWrites = reportWrites
      .then(async () => {
        await mkdir(path.dirname(reportFile), { recursive: true });
        await writeFile(reportFile, data);
      })
      .catch((e) => console.error('Status log write failed:', e.message));
  }, 250);
  reportTimer.unref();
}
function reportComposer(sessionId, event) {
  const report = { at: new Date().toISOString(), sessionId, type: event.type };
  for (const key of ['message', 'threadId'])
    if (typeof event[key] === 'string') report[key] = event[key].slice(0, 1000);
  if (event.type === 'bar') {
    report.tempo = event.tempo;
    report.notes = event.notes?.length;
    report.pitches = [...new Set((event.notes || []).map((n) => n.note))];
    report.instruments = [
      ...new Set((event.notes || []).map((n) => n.instrument)),
    ];
    report.meanVelocity = event.notes?.length
      ? event.notes.reduce((s, n) => s + n.velocity, 0) / event.notes.length
      : 0;
  }
  composerReports.push(report);
  persistReports();
  if (composerReports.length > 80) composerReports.shift();
  if (event.type === 'error')
    console.error('[composer]', JSON.stringify(report));
}
const composer =
  provider === 'OpenRouter' ? new OpenRouterComposer() : new Composer(cwd);
composer.connect().catch(() => {});
const server = http.createServer(async (req, res) => {
  try {
    if (
      !['localhost:' + port, '127.0.0.1:' + port].includes(req.headers.host)
    ) {
      res.writeHead(403).end();
      return;
    }
    if (
      req.headers.origin &&
      !['http://localhost:' + port, 'http://127.0.0.1:' + port].includes(
        req.headers.origin,
      )
    ) {
      res.writeHead(403).end();
      return;
    }
    if (
      process.env.BEAT_TEST === '1' &&
      req.url === '/test-artifact' &&
      req.method === 'POST'
    ) {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 30000000) {
          res.writeHead(413).end();
          return;
        }
      }
      const { name, data } = JSON.parse(body);
      if (
        !['test-input.wav', 'test-mix.webm', 'test-trace.json'].includes(name)
      )
        throw Error('Invalid artifact');
      await mkdir(path.join(root, 'diagnostics', 'browser', 'one-minute'), {
        recursive: true,
      });
      await writeFile(
        path.join(root, 'diagnostics', 'browser', 'one-minute', name),
        Buffer.from(data, 'base64'),
      );
      res.writeHead(204).end();
      return;
    }
    if (process.env.BEAT_TEST === '1' && req.url === '/one-minute-test') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        await readFile(path.join(root, 'tests', 'browser', 'one-minute.html')),
      );
      return;
    }
    if (
      req.method === 'GET' &&
      (req.url === '/sessions' || /^\/sessions\/[a-f0-9-]{36}$/.test(req.url))
    ) {
      res.setHeader('Cache-Control', 'no-store');
      if (req.url === '/sessions') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(await archive.list()));
      } else {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.end(await archive.read(req.url.split('/')[2]));
      }
      return;
    }
    if (req.url === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          model,
          provider,
          diagnostics: diagnosticsEnabled,
          reasoning: 'low',
          serviceTier,
          busy: !!active,
        }),
      );
      return;
    }
    if (req.url === '/composer-status' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(composerReports));
      return;
    }
    if (req.url === '/playback-status' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(playbackReports));
      return;
    }
    if (req.url === '/playback-status' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) {
          res.writeHead(413).end();
          return;
        }
      }
      const data = JSON.parse(body);
      if (
        typeof data.sessionId !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(data.sessionId)
      ) {
        res.writeHead(400).end();
        return;
      }
      const report = {
        at: new Date().toISOString(),
        sessionId: data.sessionId,
        sessionExpired: data.sessionId !== composer.flow?.id,
      };
      for (const key of ['source', 'state', 'error', 'composerError', 'status'])
        if (typeof data[key] === 'string')
          report[key] = data[key].slice(0, 250);
      for (const key of [
        'bandVolume',
        'tempo',
        'outputPeak',
        'sections',
        'scheduledNotes',
        'playedNotes',
        'failedNotes',
        'queuedNotes',
      ])
        if (Number.isFinite(data[key]) && data[key] >= 0)
          report[key] = data[key];
      if (Number.isFinite(data.outputDb))
        report.outputDb = Math.max(-120, Math.min(24, data.outputDb));
      if (Array.isArray(data.selectedInstruments))
        report.selectedInstruments = data.selectedInstruments.filter((n) =>
          [
            'piano',
            'keys',
            'bass',
            'pluck',
            'drums',
            'organ',
            'strings',
            'vibes',
            'flute',
            'lead',
          ].includes(n),
        );
      if (data.instrumentLevels && report.selectedInstruments)
        report.instrumentLevels = Object.fromEntries(
          report.selectedInstruments
            .filter((n) => Number.isFinite(data.instrumentLevels[n]))
            .map((n) => [
              n,
              Math.max(0, Math.min(1, data.instrumentLevels[n])),
            ]),
        );
      report.muted = data.muted === true;
      await archiveEvent(data.sessionId, { type: 'playback', report });
      playbackReports.push(report);
      persistReports();
      if (playbackReports.length > 120) playbackReports.shift();
      res.writeHead(204).end();
      return;
    }
    if (req.url === '/live/update' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1000000) {
          res.writeHead(413).end();
          return;
        }
      }
      const context = validateContext(JSON.parse(body));
      if (
        !context.live ||
        context.upcoming ||
        !context.sessionId ||
        composer.flow?.id !== context.sessionId
      ) {
        res.writeHead(409).end();
        return;
      }
      const result = await composer.steer(context);
      await archiveEvent(context.sessionId, {
        type: 'input-update',
        context: (({ audio, ...rest }) => rest)(context),
        result,
      });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return;
    }
    if (
      ['/session/start', '/session/stop'].includes(req.url) &&
      req.method === 'POST'
    ) {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 200) {
          res.writeHead(413).end();
          return;
        }
      }
      const { sessionId } = JSON.parse(body);
      if (typeof sessionId !== 'string' || !/^[a-f0-9-]{36}$/.test(sessionId))
        throw Error('Invalid session');
      if (req.url === '/session/stop') {
        if (composer.flow?.id === sessionId) {
          active?.abort();
          composer.endSession(sessionId);
        }
        await archiveEvent(sessionId, { type: 'session-stop' });
        res.writeHead(204).end();
        return;
      }
      if (composer.flow && composer.flow.id !== sessionId) {
        res.writeHead(409).end('Another listening session is active');
        return;
      }
      await archiveEvent(sessionId, {
        type: 'session-start',
        model,
        provider,
        serviceTier,
      });
      try {
        await composer.startSession(sessionId);
        res.writeHead(204).end();
      } catch (error) {
        await archiveEvent(sessionId, {
          type: 'error',
          message: error.message,
        });
        reportComposer(sessionId, { type: 'error', message: error.message });
        res
          .writeHead(503, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: error.message }));
      }
      return;
    }
    if (req.url === '/compose' && req.method === 'POST') {
      if (active || saving) {
        res.writeHead(429).end('Composer busy');
        return;
      }
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 12000000) {
          res.writeHead(413).end();
          return;
        }
      }
      if (active || saving) {
        res.writeHead(429).end();
        return;
      }
      const context = validateContext(JSON.parse(body));
      if (!context.sessionId || composer.flow?.id !== context.sessionId) {
        res.writeHead(409).end('Listening session expired');
        return;
      }
      saving = true;
      let saved;
      try {
        await archiveEvent(context.sessionId, {
          type: 'compose-request',
          context: (({ audio, ...rest }) => rest)(context),
        });
        if (diagnosticsEnabled)
          saved = await saveRequest(path.join(root, 'diagnostics'), context);
      } finally {
        saving = false;
      }
      const events = [];
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      const emit = (o) => {
        void archiveEvent(context.sessionId, {
          ...o,
          requestId: context.live?.requestId,
        }).catch(() => {});
        if (
          ['error', 'notation-warning', 'session', 'bar', 'done'].includes(
            o.type,
          )
        )
          reportComposer(context.sessionId, o);
        if (saved) events.push({ ...o, at: new Date().toISOString() });
        if (!res.destroyed) res.write(JSON.stringify(o) + '\n');
      };
      if (saved) emit({ type: 'diagnostic', id: saved.id });
      const abort = new AbortController();
      active = abort;
      let done = false;
      res.on('close', () => {
        if (!done) abort.abort();
      });
      let terminal = false;
      const trackedEmit = (o) => {
        if (o.type === 'done' || o.type === 'error') terminal = true;
        emit(o);
      };
      try {
        await composer.compose(context, trackedEmit, abort.signal);
        if (!terminal && !abort.signal.aborted)
          trackedEmit({
            type: 'error',
            message:
              'Composer ended without a completion event. Retry composer to reconnect.',
          });
      } catch (e) {
        if (!abort.signal.aborted) emit({ type: 'error', message: e.message });
      } finally {
        await archiveEvent(context.sessionId, {
          type: 'request-end',
          requestId: context.live?.requestId,
          aborted: abort.signal.aborted,
        }).catch(() => {});
        done = true;
        if (active === abort) active = null;
        res.end();
        if (saved) {
          events.push({ type: 'requestEnd', aborted: abort.signal.aborted });
          await saveEvents(saved.dir, events);
        }
      }
      return;
    }
    if (req.url === '/diagnostics' && req.method === 'POST') {
      if (!diagnosticsEnabled) {
        res.writeHead(204).end();
        return;
      }
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 250000) {
          res.writeHead(413).end();
          return;
        }
      }
      const data = JSON.parse(body);
      if (
        !/^[a-f0-9-]{36}$/.test(data.id) ||
        !Array.isArray(data.events) ||
        data.events.length > 500
      )
        throw Error('Invalid diagnostics');
      const dir = path.join(root, 'diagnostics', data.id);
      await readFile(path.join(dir, 'request.json'));
      await saveEvents(
        dir,
        data.events.map((event) => ({ type: 'playback', event })),
      );
      res.writeHead(204).end();
      return;
    }
    if (req.url === '/abcjs.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(
        await readFile(
          path.join(root, 'node_modules/abcjs/dist/abcjs-basic-min.js'),
        ),
      );
      return;
    }
    if (req.url.startsWith('/assets/') || req.url.startsWith('/vendor/')) {
      const relative = decodeURIComponent(req.url.split('?')[0]).slice(1),
        asset = path.resolve(root, 'public', relative),
        allowed =
          path.resolve(
            root,
            'public',
            relative.startsWith('assets/') ? 'assets' : 'vendor',
          ) + path.sep;
      if (!asset.startsWith(allowed)) {
        res.writeHead(403).end();
        return;
      }
      const types = {
        '.glb': 'model/gltf-binary',
        '.gltf': 'model/gltf+json',
        '.bin': 'application/octet-stream',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.webp': 'image/webp',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.txt': 'text/plain',
      };
      if (!types[path.extname(asset)]) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader('Content-Type', types[path.extname(asset)]);
      res.setHeader('Cache-Control', 'no-cache');
      res.end(await readFile(asset));
      return;
    }
    const files = {
      '/stream.mjs': 'stream.mjs',
      '/playback.mjs': 'playback.mjs',
      '/live.mjs': 'live.mjs',
      '/sustain.mjs': 'sustain.mjs',
      '/transcribe.mjs': 'transcribe.mjs',
      '/pitch.mjs': 'pitch.mjs',
      '/lookahead.mjs': 'lookahead.mjs',
      '/stage.mjs': 'stage.mjs',
      '/boot.mjs': 'boot.mjs',
      '/features.mjs': 'features.mjs',
      '/feature-worker.mjs': 'feature-worker.mjs',
      '/capture.mjs': 'capture.mjs',
      '/recording.mjs': 'recording.mjs',
      '/score.mjs': 'score.mjs',
      '/': 'index.html',
      '/app.mjs': 'app.mjs',
      '/music.mjs': 'music.mjs',
      '/audio.mjs': 'audio.mjs',
      '/style.css': 'style.css',
    };
    res.setHeader('Cache-Control', 'no-store');
    const file = files[req.url];
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      'Content-Type',
      file.endsWith('.mjs')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    );
    res.end(await readFile(path.join(root, 'public', file)));
  } catch {
    if (!res.headersSent) res.writeHead(400);
    res.end();
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    `Find the Beat: http://localhost:${port} — ${model} via ${provider}, low reasoning`,
  ),
);
const shutdown = () => {
  active?.abort();
  composer.close();
  server.close();
  rm(cwd, { recursive: true, force: true }).finally(() => process.exit());
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
