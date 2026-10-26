import { BarStream } from './abc.mjs';
import { composerContext } from './context.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { selectedInstruments } from '../../public/music.mjs';
export { MUSIC_INSTRUCTIONS } from './music-prompt.mjs';
import { MUSIC_INSTRUCTIONS } from './music-prompt.mjs';
export const COMPOSER_MODEL = 'gpt-6.1-sol';
export const COMPOSER_TIER = 'fast';
export class Composer {
  constructor(cwd) {
    this.cwd = cwd;
    this.pending = new Map();
    this.sequence = 0;
    this.job = null;
    this.ready = null;
  }
  async connect() {
    if (this.ready) return this.ready;
    this.ready = this.initialize().catch((e) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }
  async initialize() {
    const env = Object.fromEntries(
      ['PATH', 'HOME', 'CODEX_HOME', 'USER', 'TMPDIR', 'LANG']
        .filter((k) => process.env[k])
        .map((k) => [k, process.env[k]]),
    );
    const args = ['app-server'];
    for (const key of [
      'shell_tool',
      'unified_exec',
      'apps',
      'plugins',
      'multi_agent',
      'hooks',
      'browser_use',
      'computer_use',
      'image_generation',
      'view_image',
    ])
      args.push('-c', `features.${key}=false`);
    args.push('-c', 'features.skip_host_skill_discovery=true');
    try {
      const s = readFileSync(
        path.join(
          process.env.CODEX_HOME || path.join(homedir(), '.codex'),
          'config.toml',
        ),
        'utf8',
      );
      for (const m of s.matchAll(
        /^\[mcp_servers\.(?:"([^"]+)"|([A-Za-z0-9_-]+))\]/gm,
      ))
        args.push('-c', `mcp_servers.${m[1] || m[2]}.enabled=false`);
    } catch {}
    this.proc = spawn(process.env.CODEX_PATH || 'codex', args, {
      cwd: this.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const processInstance = this.proc;
    this.proc.stderr.resume();
    let buffer = '';
    this.proc.stdout.on('data', (data) => {
      buffer += data;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        try {
          this.message(JSON.parse(line));
        } catch {}
      }
    });
    const fail = () => {
      if (this.proc !== processInstance) return;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error('Codex disconnected'));
      }
      this.pending.clear();
      this.job?.finish(Error('Codex disconnected'));
      this.flow = null;
      this.ready = null;
    };
    this.proc.on('error', fail);
    this.proc.on('exit', fail);
    await this.rpc('initialize', {
      clientInfo: { name: 'find_the_beat', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized', params: {} });
  }
  send(msg) {
    this.proc.stdin.write(JSON.stringify(msg) + '\n');
  }
  rpc(method, params) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error('Codex connection timed out'));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  message(m) {
    if (m.id !== undefined && this.pending.has(m.id)) {
      const p = this.pending.get(m.id);
      this.pending.delete(m.id);
      clearTimeout(p.timer);
      m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
      return;
    }
    if (m.id !== undefined && m.method) {
      this.send({
        id: m.id,
        error: {
          code: -32601,
          message: 'Tools and approvals are disabled for the music composer',
        },
      });
      return;
    }
    const j = this.job;
    if (!j || m.params?.threadId !== j.threadId) return;
    const incomingTurn = m.params?.turnId || m.params?.turn?.id;
    if (
      this.flow?.ignoredTurns?.has(incomingTurn) ||
      (j.turnId && incomingTurn && incomingTurn !== j.turnId)
    )
      return;
    if (m.method === 'item/agentMessage/delta') {
      j.emit({ type: 'abc-delta', text: m.params.delta });
      j.text += m.params.delta;
      if (j.text.length > 24000) {
        j.finish(Error('ABC score exceeds size limit'));
        return;
      }
      try {
        j.bars?.push(m.params.delta);
      } catch (e) {
        j.finish(e);
      }
    }
    if (m.method === 'turn/completed')
      j.finish(
        m.params.turn.status === 'completed'
          ? null
          : Error(m.params.turn.error?.message || 'Composition interrupted'),
      );
  }
  credentialStamp() {
    // Metadata only: never read, copy, log, or manage OAuth tokens ourselves.
    try {
      const s = statSync(
        path.join(
          process.env.CODEX_HOME || path.join(homedir(), '.codex'),
          'auth.json',
        ),
      );
      return `${s.ino}:${s.mtimeMs}:${s.size}`;
    } catch {
      return 'keychain-or-unavailable';
    }
  }
  async restart() {
    const flowId = this.flow?.id;
    this.flow = null;
    const old = this.proc;
    this.proc = null;
    this.ready = null;
    if (old && old.exitCode === null)
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          old.kill('SIGKILL');
          resolve();
        }, 2000);
        old.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
        old.kill('SIGTERM');
      });
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error('Codex connection restarted'));
    }
    this.pending.clear();
    if (flowId) await this.startSession(flowId);
  }
  async compose(context, emit, signal) {
    const stamp = this.credentialStamp();
    if (this.authStamp !== undefined && stamp !== this.authStamp)
      await this.restart();
    this.authStamp = stamp;
    for (let attempt = 0; attempt < 2; attempt++) {
      let delivered = 0;
      try {
        await this.connect();
        if (context.sessionId && !this.flow)
          throw Error('Listening session expired. Press Stop and Start.');
        await this.composeOnce(
          context,
          (event) => {
            if (event.type === 'note' || event.type === 'bar') delivered++;
            emit(event);
          },
          signal,
        );
        this.authStamp = this.credentialStamp();
        return;
      } catch (error) {
        const authError =
          /access token|refresh token|sign in|logged out|unauthorized|401/i.test(
            error.message,
          );
        if (!authError || attempt || delivered || signal.aborted) throw error;
        emit({
          type: 'status',
          message: 'Reconnecting Codex to reload the current login…',
        });
        await this.restart();
        this.authStamp = this.credentialStamp();
      }
    }
  }
  async startSession(id) {
    if (this.flow?.id === id) return this.flow.ready;
    if (this.flow) throw Error('Another listening session is active');
    const flow = { id, ignoredTurns: new Set() };
    this.flow = flow;
    flow.ready = (async () => {
      await this.connect();
      const account = await this.rpc('account/read', { refreshToken: false });
      if (!account.account && account.requiresOpenaiAuth)
        throw Error('Codex sign in required. Run codex login.');
      this.authStamp = this.credentialStamp();
      const t = await this.rpc('thread/start', {
        model: COMPOSER_MODEL,
        serviceTier: COMPOSER_TIER,
        cwd: this.cwd,
        ephemeral: true,
        sandbox: 'read-only',
        approvalPolicy: 'never',
        baseInstructions: MUSIC_INSTRUCTIONS,
        config: { model_reasoning_effort: 'low' },
      });
      if (this.flow !== flow) {
        await this.rpc('thread/unsubscribe', { threadId: t.thread.id });
        throw Error('Listening session stopped');
      }
      flow.threadId = t.thread.id;
      return t;
    })().catch((e) => {
      if (this.flow === flow) this.flow = null;
      throw e;
    });
    return flow.ready;
  }
  endSession(id) {
    if (!this.flow || this.flow.id !== id) return;
    const flow = this.flow;
    this.flow = null;
    if (this.job && this.job.threadId === flow.threadId)
      this.job.finish(Error('Cancelled'));
    if (flow.threadId)
      void this.rpc('thread/unsubscribe', { threadId: flow.threadId }).catch(
        () => {},
      );
  }
  async steer(context) {
    const flow = this.flow,
      j = this.job;
    if (!flow || flow.id !== context.sessionId)
      throw Error('Listening session expired');
    // An update captured for an old request must never land in a later turn.
    if (
      !context.live ||
      !j?.live ||
      j.requestId !== context.live.requestId ||
      j.steering
    )
      return { accepted: false };
    j.steering = true;
    try {
      await j.turnReady;
      if (this.job !== j || this.flow !== flow || j.bars.closed)
        return { accepted: false };
      const { sessionId, previous, ...input } = composerContext(context);
      input.live.generation = j.generation;
      input.updateOnly = true;
      const result = await this.rpc('turn/steer', {
        threadId: j.threadId,
        expectedTurnId: j.turnId,
        input: [{ type: 'text', text: JSON.stringify(input) }],
      });
      j.emit({
        type: 'model-update',
        threadId: j.threadId,
        turnId: result.turnId,
        input,
      });
      return { accepted: true, turnId: result.turnId };
    } catch (error) {
      if (
        this.job !== j ||
        this.flow !== flow ||
        /no active turn|turn.*(?:mismatch|not found|not active)/i.test(
          error.message,
        )
      )
        return { accepted: false };
      throw error;
    } finally {
      j.steering = false;
    }
  }
  async composeOnce(context, emit, signal) {
    await this.connect();
    if (signal.aborted) throw Error('Cancelled');
    if (this.job) throw Error('Composer busy');
    const { sessionId, ...analysis } = composerContext(context);
    const allowed = selectedInstruments(context.instruments);
    const setupStart = performance.now();
    const flow = this.flow;
    if (!flow || flow.id !== context.sessionId)
      throw Error('Listening session expired. Press Stop and Start.');
    const t = await flow.ready;
    await flow.idle;
    if (signal.aborted) throw Error('Cancelled');
    if (this.flow !== flow)
      throw Error(
        'Listening session changed while preparing the turn. Retry composer.',
      );
    emit({
      type: 'session',
      threadId: t.thread.id,
      setupMs: Math.round(performance.now() - setupStart),
    });
    await new Promise((resolve, reject) => {
      let finished = false,
        budgetFilled = false,
        generatedSeconds = 0;
      const finish = (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        let count = 0;
        if (!error) {
          try {
            bars.finish();
            count = bars.notes.length;
          } catch (e) {
            error = e;
          }
        }
        this.job = null;
        if (error || budgetFilled) {
          flow.idle = turnStarted
            .then((r) => {
              flow.ignoredTurns.add(r.turn.id);
              return this.rpc('turn/interrupt', {
                threadId: t.thread.id,
                turnId: r.turn.id,
              });
            })
            .catch(() => {});
        }
        if (error) {
          flow.lastError = error.message;
          reject(error);
        } else {
          emit({
            type: 'done',
            count,
            sections: bars.count,
            generatedSeconds,
            elapsedMs: Math.round(performance.now() - start),
          });
          resolve();
        }
      };
      const abort = () => finish(Error('Cancelled'));
      const start = performance.now(),
        timeout = setTimeout(() => {
          finish(
            Error(
              'Composition timed out after 45 seconds. Retry the composer.',
            ),
          );
        }, 45000);
      const bars = new BarStream(
        allowed,
        (event) => {
          if (event.type === 'bar') {
            generatedSeconds +=
              (event.durationBeats * 60) /
              (context.tempoMode === 'manual'
                ? context.bpm
                : event.tempo || context.bpm);
            event.sectionId = `${context.live?.requestId || context.phraseIndex || 0}:${event.index}`;
          }
          emit({ ...event, elapsedMs: Math.round(performance.now() - start) });
          if (
            context.live &&
            event.type === 'bar' &&
            generatedSeconds >= context.live.generation.secondsNeeded
          ) {
            budgetFilled = true;
            bars.closed = true;
            queueMicrotask(() => finish());
          }
        },
        { live: !!context.live },
      );
      const correction = flow.lastError;
      flow.lastError = null;
      const job = {
        bars,
        allowed,
        threadId: t.thread.id,
        text: '',
        emit,
        start,
        finish,
        live: !!context.live,
        requestId: context.live?.requestId,
        generation: context.live?.generation,
      };
      this.job = job;
      signal.addEventListener('abort', abort, { once: true });
      const payload = {
        ...analysis,
        previous: undefined,
        notationCorrection: correction || undefined,
      };
      emit({
        type: 'model-input',
        threadId: t.thread.id,
        instructions: MUSIC_INSTRUCTIONS,
        input: payload,
      });
      const turnStarted = this.rpc('turn/start', {
        threadId: t.thread.id,
        model: COMPOSER_MODEL,
        effort: 'low',
        serviceTier: COMPOSER_TIER,
        input: [{ type: 'text', text: JSON.stringify(payload) }],
      });
      job.turnReady = turnStarted.then((r) => {
        job.turnId = r.turn.id;
      });
      job.turnReady.catch(finish);
    });
  }
  close() {
    this.endSession(this.flow?.id);
    this.proc?.kill();
  }
}
