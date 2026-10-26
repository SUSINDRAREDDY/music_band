// Scores remain in local analysis; never gate or annotate composer evidence with them.
export function withoutConfidence(value) {
  if (Array.isArray(value)) return value.map(withoutConfidence);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/confidence/i.test(key))
        .map(([key, item]) => [key, withoutConfidence(item)]),
    );
  return value;
}
const names = [
  '=C',
  '^C',
  '=D',
  '^D',
  '=E',
  '=F',
  '^F',
  '=G',
  '^G',
  '=A',
  '^A',
  '=B',
];
function abcPitch(midi) {
  const oct = Math.floor(midi / 12) - 5;
  return names[midi % 12] + (oct < 0 ? ','.repeat(-oct) : "'".repeat(oct));
}
export function describeInputBar(bar, bpm) {
  const frames = bar.evidence.frames,
    events = bar.evidence.transcription?.events || [];
  const unit = 60 / bpm / 8,
    total = 32,
    tokens = [];
  let cursor = 0;
  for (const event of events) {
    const start = Math.max(
        cursor,
        Math.min(total, Math.round(event.startSeconds / unit)),
      ),
      end = Math.max(
        start,
        Math.min(total, Math.round(event.endSeconds / unit)),
      );
    if (start > cursor) tokens.push('x' + (start - cursor));
    if (end > start)
      tokens.push(
        (event.kind === 'note'
          ? abcPitch(event.note)
          : event.kind === 'silence'
            ? 'z'
            : 'x') +
          (end - start),
      );
    cursor = end;
  }
  if (cursor < total) tokens.push('x' + (total - cursor));
  return withoutConfidence({
    index: bar.index,
    startSeconds: bar.startSeconds,
    onsetsSeconds: bar.evidence.onsetTimes,
    pitchCandidatesABC: `X:1\nM:4/4\nL:1/32\nQ:1/4=${bpm}\nK:C\n${tokens.join(' ')} |`,
    noteEvents: events,
    caveat:
      'Model-free monophonic estimates. Raw noteEvents preserve seconds; ABC boundaries are rounded to 1/32 notes. z is measured silence, x is unknown/unobserved audio, NOT silence. K:C is explicit-accidental encoding, not inferred key. Polyphonic voices are not separated',
    evidence: bar.evidence,
    frames,
  });
}
