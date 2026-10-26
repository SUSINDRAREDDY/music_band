import { estimateTempo } from '../../public/music.mjs';
import { describeInputBar, withoutConfidence } from './input-score.mjs';
// Share every measured frame and event; the arranger interprets the music.
export function composerContext(context) {
  const { audio, evidence, upcoming, previous = [], ...rest } = context;
  if (upcoming)
    return withoutConfidence({
      musicalDirection: context.musicalDirection,
      bpm: context.bpm,
      tempoMode: 'manual',
      instruments: context.instruments,
      phraseIndex: context.phraseIndex,
      recordingLookahead: true,
      upcoming: upcoming.map((bar) => describeInputBar(bar, context.bpm)),
    });
  if (!evidence) return withoutConfidence({ ...rest, previous });
  const inputTempo =
    context.tempoMode === 'auto'
      ? estimateTempo(evidence.onsetTimes)
      : context.bpm;
  const inputBars = [];
  if (inputTempo) {
    const length = 240 / inputTempo;
    for (
      let start = 0;
      start < (evidence.durationSeconds || 0) && inputBars.length < 12;
      start += length
    ) {
      const local = {
        ...evidence,
        transcription: {
          events: (evidence.transcription?.events || [])
            .filter(
              (e) => e.endSeconds > start && e.startSeconds < start + length,
            )
            .map((e) => ({
              ...e,
              startSeconds: Math.max(0, e.startSeconds - start),
              endSeconds: Math.min(length, e.endSeconds - start),
            })),
        },
        frames: evidence.frames
          .filter((f) => f.seconds >= start && f.seconds < start + length)
          .map((f) => ({ ...f, seconds: f.seconds - start })),
        onsetTimes: evidence.onsetTimes
          .filter((t) => t >= start && t < start + length)
          .map((t) => t - start),
      };
      inputBars.push(
        describeInputBar(
          { index: inputBars.length, startSeconds: start, evidence: local },
          inputTempo,
        ),
      );
    }
  }
  return withoutConfidence({
    ...rest,
    inputABC: inputBars.length
      ? inputBars.map((b) => ({
          startSeconds: b.startSeconds,
          abc: b.pitchCandidatesABC,
          caveat: b.caveat,
          noteEvents: b.noteEvents,
        }))
      : undefined,
    inputWindow:
      'Recent past; seconds are relative to the captured window, not future playback. ABC is a rounded representation; use event timestamps for timing.',
    ...(rest.tempoMode === 'auto' ? { bpm: undefined } : {}),
    evidence: { ...evidence, noteEvents: evidence.transcription?.events },
    previous: context.live ? undefined : previous,
  });
}
