import { BarStream } from './abc.mjs';
import { composerContext } from './context.mjs';
import { selectedInstruments } from '../../public/music.mjs';
import { MUSIC_INSTRUCTIONS } from './music-prompt.mjs';
import { readSSE } from './sse.mjs';

export const OPENROUTER_MODEL = 'google/gemini-3.8-flash';
// HTTP requests cannot be steered after dispatch. New observations inform the next request.
const instructions = MUSIC_INSTRUCTIONS.replace(
  'Updates may arrive while you generate: apply them to the next uncommitted block and never rewrite emitted blocks.',
  'Observations collected while the previous request was generating appear in interveningObservations on the next request. They preserve the intervening musical movement; the latest input describes the current source. Never rewrite emitted blocks.',
);
export class OpenRouterComposer {
  constructor({
    apiKey = process.env.OPENROUTER_API_KEY,
    model = process.env.OPENROUTER_MODEL || OPENROUTER_MODEL,
    fetchImpl = fetch,
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
  }
  async connect() {}
  async startSession(id) {
    if (this.flow?.id === id) return;
    if (this.flow) throw Error('Another listening session is active');
    if (!this.apiKey) throw Error('Set OPENROUTER_API_KEY in .env.local');
    this.flow = { id, threadId: `openrouter-${id}`, messages: [], pending: [] };
  }
  endSession(id) {
    if (this.flow?.id !== id) return;
    this.flow = null;
    this.job?.controller.abort();
  }
  close() {
    this.endSession(this.flow?.id);
  }
  async steer(context) {
    const flow = this.flow,
      job = this.job;
    if (!flow || flow.id !== context.sessionId)
      throw Error('Listening session expired');
    if (
      !context.live ||
      !job ||
      job.flow !== flow ||
      job.requestId !== context.live.requestId
    )
      return { accepted: false };
    const { sessionId, previous, ...input } = composerContext(context);
    flow.pending.push(input);
    return { accepted: true, delivery: 'next-request' };
  }
  async compose(context, emit, signal) {
    const flow = this.flow;
    if (!flow || flow.id !== context.sessionId)
      throw Error('Listening session expired. Press Stop and Start.');
    if (this.job) throw Error('Composer busy');
    const controller = new AbortController(),
      combined = AbortSignal.any([
        signal,
        controller.signal,
        AbortSignal.timeout(45000),
      ]);
    const job = { flow, controller, requestId: context.live?.requestId };
    this.job = job;
    const start = performance.now(),
      allowed = selectedInstruments(context.instruments);
    const { sessionId, previous, ...analysis } = composerContext(context),
      pendingCount = flow.pending.length;
    const input = {
      ...analysis,
      interveningObservations: pendingCount ? flow.pending.slice() : undefined,
    };
    let text = '',
      delivered = [],
      finishReason,
      streamDone = false,
      budgetFilled = false,
      generatedSeconds = 0,
      firstTokenMs = null,
      firstBarMs = null;
    const bars = new BarStream(
      allowed,
      (event) => {
        const elapsedMs = Math.round(performance.now() - start);
        if (event.type === 'bar') {
          firstBarMs ??= elapsedMs;
          delivered.push(
            (delivered.length
              ? event.abc.slice(event.abc.indexOf('V:'))
              : event.abc) + '\n%endbar\n',
          );
          generatedSeconds +=
            (event.durationBeats * 60) /
            (context.tempoMode === 'manual'
              ? context.bpm
              : event.tempo || context.bpm);
          event.sectionId = `${context.live?.requestId || context.phraseIndex || 0}:${event.index}`;
        }
        emit({ ...event, elapsedMs });
        if (
          context.live &&
          event.type === 'bar' &&
          generatedSeconds >= context.live.generation.secondsNeeded
        ) {
          budgetFilled = true;
          bars.closed = true;
          controller.abort();
        }
      },
      { live: !!context.live },
    );
    try {
      signal.throwIfAborted();
      emit({ type: 'session', threadId: flow.threadId, setupMs: 0 });
      emit({
        type: 'model-input',
        threadId: flow.threadId,
        instructions,
        input,
      });
      const response = await this.fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          signal: combined,
          body: JSON.stringify({
            model: this.model,
            stream: true,
            max_tokens: 8192,
            reasoning: { effort: 'low', exclude: true },
            messages: [
              { role: 'system', content: instructions },
              ...flow.messages,
              { role: 'user', content: JSON.stringify(input) },
            ],
          }),
        },
      );
      // Provider error bodies can echo credentials; expose status only.
      if (!response.ok) {
        await response.body?.cancel();
        throw Error(
          `OpenRouter HTTP ${response.status}${response.status === 402 ? ' — insufficient credits' : response.status === 429 ? ' — rate limit' : response.status === 401 || response.status === 403 ? ' — check API key and model access' : ''}`,
        );
      }
      try {
        await readSSE(response.body, (message) => {
          if (budgetFilled) return;
          if (message.error) throw Error('OpenRouter returned a stream error');
          if (message.done) {
            streamDone = true;
            return;
          }
          const choice = message.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta?.content;
          if (typeof delta !== 'string' || !delta) return;
          firstTokenMs ??= Math.round(performance.now() - start);
          text += delta;
          if (text.length > 48000) throw Error('ABC exceeds size limit');
          emit({ type: 'abc-delta', text: delta });
          bars.push(delta);
        });
      } catch (error) {
        if (!budgetFilled || signal.aborted || this.flow !== flow) throw error;
      }
      signal.throwIfAborted();
      if (this.flow !== flow) throw Error('Listening session stopped');
      if (!budgetFilled) {
        combined.throwIfAborted();
        if (!streamDone || finishReason !== 'stop')
          throw Error(
            `OpenRouter response incomplete (${finishReason || 'disconnected'})`,
          );
      }
      bars.finish();
      flow.pending.splice(0, pendingCount);
      flow.messages.push(
        { role: 'user', content: JSON.stringify(input) },
        { role: 'assistant', content: delivered.join('\n') },
      );
      emit({
        type: 'done',
        model: this.model,
        count: bars.notes.length,
        sections: bars.count,
        generatedSeconds,
        elapsedMs: Math.round(performance.now() - start),
        firstTokenMs,
        firstBarMs,
      });
    } finally {
      if (this.job === job) this.job = null;
    }
  }
}
