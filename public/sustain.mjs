// Merge only explicit continuation requests, never repeated notes by guesswork.
export function joinSustains(notes) {
  const out = [];
  for (const n of [...notes].sort((a, b) => a.time - b.time)) {
    const previous = out.findLast(
      (p) =>
        p.instrument === n.instrument &&
        p.note === n.note &&
        p.sustain &&
        Math.abs(p.time + (p.duration * 60) / p.tempo - n.time) < 0.025,
    );
    if (previous) {
      previous.duration +=
        (((n.duration * 60) / n.tempo) * previous.tempo) / 60;
      previous.sustain = n.sustain;
    } else out.push({ ...n });
  }
  return out;
}
