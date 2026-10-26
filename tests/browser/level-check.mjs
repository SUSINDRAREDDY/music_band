import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
const baseURL = process.env.BEAT_URL || 'http://localhost:4318';
await mkdir(new URL('../../diagnostics/browser/', import.meta.url), {
  recursive: true,
});
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage();
  await page.goto(baseURL);
  const results = await page.evaluate(async () => {
    const { Band } = await import('/audio.mjs');
    const results = [];
    for (const instrument of [
      'pluck',
      'bass',
      'drums',
      'keys',
      'piano',
      'strings',
      'organ',
      'vibes',
      'flute',
      'lead',
    ]) {
      const note = {
        instrument,
        note: instrument === 'drums' ? 36 : instrument === 'bass' ? 48 : 60,
        beat: 0,
        duration: 2,
        velocity: 0.5,
      };
      const render = async (normalized) => {
        const ctx = new OfflineAudioContext(2, 48000 * 2, 48000),
          band = new Band(ctx);
        await band.prepare([note]);
        const gain = band.sampleGains.get(band.key(note));
        if (!normalized) {
          band.sampleGains.set(band.key(note), 1);
          band.master.gain.value = 0.65;
        }
        band.play(note, 0.1, 120);
        const out = await ctx.startRendering();
        let peak = 0,
          energy = 0;
        for (let ch = 0; ch < out.numberOfChannels; ch++) {
          const data = out.getChannelData(ch);
          for (let i = 4800; i < 52800; i++) {
            peak = Math.max(peak, Math.abs(data[i]));
            energy += data[i] * data[i];
          }
        }
        return { peak, rms: Math.sqrt(energy / (48000 * 2)), sampleGain: gain };
      };
      const before = await render(false),
        after = await render(true);
      results.push({
        instrument,
        before,
        after,
        increaseDb: 20 * Math.log10(after.rms / before.rms),
      });
    }
    return results;
  });
  await writeFile(
    new URL(
      '../../diagnostics/browser/level-verification.json',
      import.meta.url,
    ),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
  if (
    results.some(
      (r) =>
        r.after.peak < 0.01 ||
        r.after.peak >= 1 ||
        !Number.isFinite(r.increaseDb),
    )
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
