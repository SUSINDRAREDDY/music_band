// Rolling original input samples; no pitch correction, quantization or effects.
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = [];
    this.offset = 0;
    this.filled = 0;
    this.total = 0;
    this.origin = null;
    this.size = sampleRate * 12;
    this.port.onmessage = ({ data }) => {
      if (data !== 'snapshot' && data?.type !== 'snapshot') return;
      const since = Math.max(0, Math.floor(data.sinceFrame || 0)),
        overlap = since ? Math.round(sampleRate * 0.2) : 0;
      const startFrame = Math.max(this.total - this.filled, since - overlap),
        count = Math.max(0, this.total - startFrame);
      const result = this.channels.map((channel) => {
        const out = new Float32Array(count);
        const start = (this.offset - count + this.size) % this.size;
        for (let i = 0; i < count; i++)
          out[i] = channel[(start + i) % this.size];
        return out;
      });
      this.port.postMessage(
        {
          channels: result,
          sampleRate,
          startFrame,
          endFrame: this.total,
          startTime: (this.origin || 0) + startFrame / sampleRate,
          endTime: (this.origin || 0) + this.total / sampleRate,
          overlapSeconds: Math.max(0, since - startFrame) / sampleRate,
          droppedSeconds: Math.max(0, startFrame - since) / sampleRate,
        },
        result.map((x) => x.buffer),
      );
    };
  }
  process(inputs) {
    const input = inputs[0];
    if (!input?.length) return true;
    if (this.origin === null) this.origin = currentTime;
    while (this.channels.length < input.length)
      this.channels.push(new Float32Array(this.size));
    for (let i = 0; i < input[0].length; i++) {
      for (let ch = 0; ch < this.channels.length; ch++)
        this.channels[ch][this.offset] = input[ch]?.[i] || 0;
      this.offset = (this.offset + 1) % this.size;
      this.filled = Math.min(this.size, this.filled + 1);
      this.total++;
    }
    return true;
  }
}
registerProcessor('original-input', Capture);
