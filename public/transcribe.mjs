import { periodicPitch } from './pitch.mjs';
// Deterministic monophonic analysis. Never modifies the source sample arrays.
export function transcribeNotes({ channels, sampleRate }) {
  const length = channels[0]?.length || 0,
    hop = Math.max(1, Math.round(sampleRate * 0.01)),
    window = Math.round(sampleRate * 0.046);
  const segments = [],
    onsets = [];
  let current = null,
    previousRms = 0,
    lastAttack = -1;
  for (let offset = 0; offset < length; offset += hop) {
    const count = Math.min(hop, length - offset);
    let energy = 0;
    for (let i = 0; i < count; i++) {
      let v = 0;
      for (const channel of channels)
        v += (channel[offset + i] || 0) / channels.length;
      energy += v * v;
    }
    const rms = Math.sqrt(energy / count),
      start = offset / sampleRate,
      end = Math.min(length, offset + hop) / sampleRate;
    const samples = new Float32Array(window);
    for (let i = 0; i < window; i++) {
      const at = offset + i - Math.floor(window / 2);
      if (at >= 0 && at < length)
        for (const channel of channels)
          samples[i] += (channel[at] || 0) / channels.length;
    }
    const pitch =
      rms > 0.002
        ? periodicPitch(samples, sampleRate)
        : { note: null, confidence: 0 };
    const kind =
      rms <= 0.002
        ? 'silence'
        : pitch.note !== null && pitch.confidence >= 0.85
          ? 'note'
          : 'unknown';
    const attack =
      rms > 0.004 &&
      rms > Math.max(0.002, previousRms) * 2 &&
      start - lastAttack > 0.08;
    if (attack) {
      onsets.push(+start.toFixed(4));
      lastAttack = start;
    }
    const note = kind === 'note' ? pitch.note : null;
    if (
      !current ||
      current.kind !== kind ||
      current.note !== note ||
      (attack && kind === 'note')
    ) {
      current = {
        kind,
        note,
        startSeconds: start,
        endSeconds: end,
        confidence: kind === 'note' ? pitch.confidence : 0,
      };
      segments.push(current);
    } else {
      current.endSeconds = end;
      current.confidence = Math.min(current.confidence, pitch.confidence || 0);
    }
    previousRms = rms;
  }
  return {
    method: 'YIN + 10ms energy attacks; monophonic estimates',
    events: segments.map((e) => ({
      ...e,
      startSeconds: +e.startSeconds.toFixed(4),
      endSeconds: +e.endSeconds.toFixed(4),
    })),
    onsets,
  };
}
