import { pulseAlignment, nextBarAnchor } from './music.mjs';
// Transport timing only. This module never chooses or changes musical notes.
export class LivePulse {
  constructor() {
    this.onsets = [];
  }
  observe(recording, evidence) {
    const end = recording.endTime;
    for (const relative of evidence.onsetTimes) {
      const time = recording.startTime + relative;
      if (
        time > end ||
        time < end - 8 ||
        this.onsets.some((t) => Math.abs(t - time) < 0.08)
      )
        continue;
      this.onsets.push(time);
    }
    this.onsets = this.onsets.filter((t) => t >= end - 8).sort((a, b) => a - b);
  }
  anchor(now, queuedEnd, bpm) {
    const earliest = nextBarAnchor(now, queuedEnd);
    // Preserve continuous sections; align only an entry or a restart after a gap.
    if (queuedEnd >= now + 0.15) return earliest;
    const pulse = pulseAlignment(this.onsets, bpm, now);
    if (!pulse) return earliest;
    return (
      pulse.phase +
      Math.ceil((earliest - pulse.phase) / pulse.period) * pulse.period
    );
  }
}
export const INITIAL_LISTEN_SECONDS = 5;
export const INPUT_UPDATE_SECONDS = 1;
export class LiveTiming {
  constructor() {
    this.delays = [];
  }
  observe(seconds) {
    if (Number.isFinite(seconds) && seconds > 0) {
      this.delays.push(seconds);
      this.delays = this.delays.slice(-12);
    }
  }
  get leadSeconds() {
    return Math.max(
      0.5,
      Math.min(20, this.delays.length ? Math.max(...this.delays) + 0.25 : 3),
    );
  }
  needsMusic(now, end) {
    return end - now < this.leadSeconds;
  }
  request(now, end) {
    return {
      secondsNeeded: Math.max(
        0.5,
        2 * this.leadSeconds - Math.max(0, end - now),
      ),
      leadSeconds: this.leadSeconds,
    };
  }
}
export function evidenceSignature(evidence) {
  const frames = evidence.frames.slice(-5),
    chroma = Array(12).fill(0);
  let energy = 0;
  for (const f of frames) {
    energy += f.rms;
    f.pitchClasses.forEach((v, i) => (chroma[i] += v * f.rms));
  }
  const total = chroma.reduce((a, b) => a + b, 0) || 1;
  return {
    energy: energy / Math.max(1, frames.length),
    chroma: chroma.map((v) => v / total),
  };
}
export function inputChanged(previous, next) {
  if (!previous) return true;
  if (previous.energy < 0.003 !== next.energy < 0.003) return true;
  if (next.energy < 0.003) return false;
  return (
    next.chroma.reduce(
      (sum, v, i) => sum + Math.abs(v - previous.chroma[i]),
      0,
    ) > 0.3 ||
    Math.abs(Math.log((next.energy + 0.001) / (previous.energy + 0.001))) > 0.7
  );
}
