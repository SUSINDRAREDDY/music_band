import { instruments } from './music.mjs';
const patches = {
  bass: 'electric_bass_finger',
  keys: 'electric_piano_1',
  piano: 'acoustic_grand_piano',
  pluck: 'acoustic_guitar_nylon',
  strings: 'string_ensemble_1',
  organ: 'drawbar_organ',
  vibes: 'vibraphone',
  flute: 'flute',
  lead: 'lead_1_square',
  drums: 'percussion',
};
// Level-match the soundfont recordings; leave MIDI timing, pitch and velocity intact.
export function sampleGainForPeak(peak) {
  return peak > 0 ? Math.min(32, 0.8 / peak) : 0;
}
const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export class Band {
  constructor(ctx) {
    this.ctx = ctx;
    this.voices = new Set();
    this.samples = new Map();
    this.sampleGains = new Map();
    this.volume = 1;
    this.levels = Object.fromEntries(
      Object.values(instruments).map((n) => [n, n === 'bass' ? 0.8 : 0.5]),
    );
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.channels = Object.fromEntries(
      Object.entries(this.levels).map(([name, level]) => {
        const gain = ctx.createGain();
        gain.gain.value = level;
        gain.connect(this.master);
        return [name, gain];
      }),
    );
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    this.output = ctx.createAnalyser();
    this.output.fftSize = 256;
    this.master.connect(limiter).connect(this.output).connect(ctx.destination);
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1.5, value));
    this.master.gain.setTargetAtTime(
      0.85 * this.volume,
      this.ctx.currentTime,
      0.015,
    );
  }
  setLevel(name, value) {
    this.levels[name] = Math.max(0, Math.min(1, value));
    this.channels[name].gain.setValueAtTime(
      this.levels[name],
      this.ctx.currentTime,
    );
  }
  key(n) {
    return `${patches[n.instrument]}/${names[n.note % 12]}${Math.floor(n.note / 12) - 1}`;
  }
  async preload(selected) {
    const notes = selected.flatMap((instrument) =>
      (instrument === 'drums'
        ? [36, 38, 42, 46, 49]
        : Array.from({ length: 49 }, (_, i) => 36 + i)
      ).map((note) => ({ instrument, note })),
    );
    // Limit background requests; foreground prepare shares the same cache.
    for (let i = 0; i < notes.length; i += 6)
      await this.prepare(notes.slice(i, i + 6));
  }
  async prepare(notes) {
    await Promise.all(
      [...new Map(notes.map((n) => [this.key(n), n])).values()].map(
        async (n) => {
          const key = this.key(n);
          if (this.samples.has(key)) return this.samples.get(key);
          const task = (async () => {
            const [patch, pitch] = key.split('/');
            const response = await fetch(
              `https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/${patch}-mp3/${pitch}.mp3`,
              { signal: AbortSignal.timeout(15000) },
            );
            if (!response.ok)
              throw Error(
                `Instrument sample unavailable: ${n.instrument} ${pitch}`,
              );
            return this.ctx.decodeAudioData(await response.arrayBuffer());
          })();
          this.samples.set(key, task);
          try {
            const buffer = await task;
            let peak = 0;
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
              const data = buffer.getChannelData(ch);
              for (let i = 0; i < data.length; i++)
                peak = Math.max(peak, Math.abs(data[i]));
            }
            const sampleGain = sampleGainForPeak(peak);
            if (!sampleGain)
              throw Error(`Silent instrument sample: ${n.instrument}`);
            this.sampleGains.set(key, sampleGain);
            this.samples.set(key, buffer);
          } catch (e) {
            this.samples.delete(key);
            throw e;
          }
        },
      ),
    );
  }
  play(n, time, bpm) {
    const buffer = this.samples.get(this.key(n));
    if (!buffer || buffer instanceof Promise)
      throw Error('Instrument sample was not prepared');
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain();
    source.buffer = buffer;
    const duration = (n.duration * 60) / bpm,
      level = n.velocity * (this.sampleGains.get(this.key(n)) ?? 1);
    gain.gain.setValueAtTime(level, time);
    gain.gain.setValueAtTime(level, time + duration);
    gain.gain.linearRampToValueAtTime(0, time + duration + 0.08);
    source.connect(gain).connect(this.channels[n.instrument]);
    this.voices.add(source);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.voices.delete(source);
    };
    source.start(time);
    source.stop(time + duration + 0.09);
  }
  hush() {
    for (const source of this.voices)
      try {
        source.stop();
      } catch {}
    this.voices.clear();
  }
}
