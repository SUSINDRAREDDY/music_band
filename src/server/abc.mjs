// Convert unambiguous trailing sharp typos only in music lines, never headers/comments.
export function normalizeAccidentals(text) {
  return text
    .split('\n')
    .map((line) =>
      /^[A-Za-z]:|^%/.test(line)
        ? line
        : line
            .replace(/([A-Ga-g])#/g, '^$1')
            .replace(
              /\[([A-Ga-g^_=, '0-9/]+)\]/g,
              (_, notes) => '[' + notes.replace(/\s/g, '') + ']',
            ),
    )
    .join('\n');
}
import ABC from 'abcjs';
export const programs = {
  piano: 0,
  keys: 4,
  pluck: 24,
  bass: 33,
  strings: 48,
  organ: 16,
  vibes: 11,
  flute: 73,
  lead: 80,
  drums: 128,
};
export function parseComposition(
  text,
  allowed,
  { bar = false, tolerant = false } = {},
) {
  const abc = normalizeAccidentals(text)
    .replace(/\r/g, '')
    .trim()
    .replace(/^```(?:abc)?\s*\n/i, '')
    .replace(/\n```\s*$/, '');
  if (abc.length > 24000 || !/^X:\s*1\s*$/m.test(abc) || !/^K:/m.test(abc))
    throw Error('Incomplete ABC score');
  if (!tolerant && /\n[ \t]*\n/.test(abc))
    throw Error('Blank lines terminate an ABC tune');
  if (/%%|\[V:|\[I:|\[K:|\[M:|\[Q:/.test(abc))
    throw Error('Use standalone voices and plain ABC only');
  const voices = [...abc.matchAll(/^V:\s*([a-z]+)(?:\s.*)?$/gm)].map(
    (m) => m[1],
  );
  if (new Set(voices).size !== voices.length)
    throw Error('Duplicate instrument voice');
  if (
    !voices.length ||
    voices.some((v) => !allowed.includes(v) || !(v in programs))
  )
    throw Error('ABC contains an unselected or missing instrument voice');
  const prepared = abc.replace(
    /^V:\s*([a-z]+).*$/gm,
    (_, id) => `V:${id}\n%%MIDI program ${programs[id]}`,
  );
  const tunes = ABC.parseOnly(
    tolerant ? prepared.replace(/\n[ \t]*\n/g, '\n') : prepared,
    {},
  );
  if (tunes.length !== 1)
    throw Error('ABC must contain exactly one tune per block');
  const warnings = (tunes[0].warnings || []).map((w) =>
    String(w)
      .replace(/<[^>]*>/g, '')
      .slice(0, 220),
  );
  if (!tolerant && warnings.length) throw Error('ABC notation: ' + warnings[0]);
  const lengths = new Map();
  for (const line of tunes[0].lines)
    for (const [staffIndex, staff] of (line.staff || []).entries())
      for (const [voiceIndex, voice] of staff.voices.entries()) {
        const key = staffIndex + ':' + voiceIndex;
        lengths.set(
          key,
          (lengths.get(key) || 0) +
            voice
              .filter((e) => e.el_type === 'note')
              .reduce((sum, e) => sum + e.duration, 0),
        );
      }
  if (
    bar &&
    !tolerant &&
    (!lengths.size || [...lengths.values()].some((n) => Math.abs(n - 1) > 1e-6))
  )
    throw Error('Each streamed voice must fill exactly one 4/4 bar');
  const durationBeats = Math.max(0, ...lengths.values()) * 4;
  if (
    !Number.isFinite(durationBeats) ||
    durationBeats <= 0 ||
    durationBeats > 64
  )
    throw Error('Unreadable section timing');
  if (tolerant && [...lengths.values()].some((n) => Math.abs(n - 1) > 1e-6))
    warnings.push(
      'Played the written durations; section is not exactly one 4/4 bar.',
    );
  const sequence = tunes[0].setUpAudio({ chordsOff: true });
  let notes = sequence.tracks.flatMap((track) =>
    track
      .filter((e) => e.cmd === 'note')
      .map((e) => ({
        beat: e.start * 4,
        instrument: Object.keys(programs).find(
          (k) => programs[k] === e.instrument,
        ),
        note: e.pitch,
        duration: e.duration * 4,
        velocity: Math.min(0.85, (e.volume / 127) * 0.8),
      })),
  );
  if (tolerant) {
    const count = notes.length;
    notes = notes.filter(
      (n) =>
        allowed.includes(n.instrument) &&
        Number.isInteger(n.note) &&
        n.note >= 0 &&
        n.note <= 127 &&
        Number.isFinite(n.beat) &&
        n.beat >= 0 &&
        Number.isFinite(n.duration) &&
        n.duration > 0 &&
        n.beat + n.duration <= durationBeats + 0.00001 &&
        Number.isFinite(n.velocity),
    );
    if (count !== notes.length)
      warnings.push(`Skipped ${count - notes.length} unreadable note events.`);
  }
  if (
    (!bar && !notes.length) ||
    notes.length > 512 ||
    (!tolerant &&
      notes.some(
        (n) =>
          !allowed.includes(n.instrument) ||
          !Number.isFinite(n.beat) ||
          n.beat < 0 ||
          n.beat >= 16 ||
          n.note < 0 ||
          n.note > 127 ||
          n.duration <= 0 ||
          n.duration > 16,
      ))
  )
    throw Error('ABC score is outside the playable four-bar phrase');
  const tempoMatch = abc.match(/^Q:\s*1\/4\s*=\s*(\d+(?:\.\d+)?)\s*$/m);
  const tempo = tempoMatch ? Number(tempoMatch[1]) : null;
  if (tempo !== null && (tempo < 45 || tempo > 200))
    throw Error('ABC tempo must be 45–200 BPM');
  return { abc, notes, tempo, durationBeats, warnings };
}

// Each committed block is a standalone one-bar ensemble, delimited by an ABC comment.
export class BarStream {
  constructor(allowed, emit, { live = false } = {}) {
    this.allowed = allowed;
    this.emit = emit;
    this.live = live;
    this.buffer = '';
    this.count = 0;
    this.notes = [];
    this.beats = 0;
    this.closed = false;
  }
  push(delta) {
    this.buffer += delta;
    let match;
    while ((match = /^%endbar[ \t]*\r?\n/m.exec(this.buffer))) {
      if (this.closed) {
        this.buffer = '';
        return;
      }
      if (this.count >= (this.live ? 64 : 4))
        throw Error('Too many streamed bars');
      let text = this.buffer.slice(0, match.index).trim();
      if (/^X:/m.test(text)) {
        const v = text.search(/^V:/m);
        if (v >= 0) this.header = text.slice(0, v);
      } else if (this.header) text = this.header + text;
      const holds = [...text.matchAll(/^%hold ([a-z]+) (\d+)$/gm)].map((m) => ({
        instrument: m[1],
        note: Number(m[2]),
      }));
      let score;
      try {
        score = parseComposition(text, this.allowed, {
          bar: true,
          tolerant: this.live,
        });
      } catch (error) {
        if (!this.live) throw error;
        this.emit({
          type: 'notation-warning',
          message: 'Skipped unreadable section: ' + error.message,
        });
        this.buffer = this.buffer.slice(match.index + match[0].length);
        continue;
      }
      if (!this.live && score.notes.some((n) => n.beat + n.duration > 4.00001))
        throw Error('Streamed bar exceeds four beats');
      for (const hold of this.live ? [] : holds) {
        const note = score.notes.find(
          (n) =>
            n.instrument === hold.instrument &&
            n.note === hold.note &&
            Math.abs(n.beat + n.duration - 4) < 0.00001,
        );
        if (!note)
          throw Error('Hold must identify a note ending at the bar boundary');
        note.sustain = true;
      }
      const index = this.count++;
      this.notes.push(
        ...score.notes.map((n) => ({ ...n, beat: n.beat + this.beats })),
      );
      this.beats += score.durationBeats;
      for (const message of score.warnings)
        this.emit({ type: 'notation-warning', message });
      this.emit({
        type: 'bar',
        index,
        abc: score.abc,
        notes: score.notes,
        tempo: score.tempo,
        durationBeats: score.durationBeats,
      });
      this.buffer = this.buffer.slice(match.index + match[0].length);
    }
  }
  finish() {
    if (this.closed) return;
    this.push('\n');
    if (this.live) {
      if (this.buffer.trim())
        this.emit({
          type: 'notation-warning',
          message:
            'Ignored an unfinished trailing section; completed sections remain playable.',
        });
      if (!this.count) throw Error('No playable sections received');
    } else if (this.buffer.trim() || this.count !== 4)
      throw Error('Expected four complete ABC bars');
  }
}
