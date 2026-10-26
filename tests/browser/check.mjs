import { chromium } from 'playwright';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
const baseURL = process.env.BEAT_URL || 'http://localhost:4318';
await mkdir(new URL('../../diagnostics/browser/', import.meta.url), {
  recursive: true,
});
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errors = [],
  requests = [],
  updates = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().endsWith('/compose'))
    requests.push({ at: Date.now(), ...r.postDataJSON() });
  if (r.url().endsWith('/live/update')) updates.push(r.postDataJSON());
});
await page.addInitScript(
  (selected) => {
    localStorage.setItem('band-instruments', JSON.stringify(selected));
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext(),
        sink = ctx.createMediaStreamDestination(),
        osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.frequency.value = 220;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(sink);
      osc.start();
      await ctx.resume();
      window.testSource = ctx;
      // A clear pitch change after startup exercises in-flight updates.
      osc.frequency.setValueAtTime(293.6648, ctx.currentTime + 13);
      for (let t = 0; t < 45; t += 0.5) {
        gain.gain.setValueAtTime(0.08, ctx.currentTime + t);
        gain.gain.setValueAtTime(0.025, ctx.currentTime + t + 0.3);
      }
      return sink.stream;
    };
  },
  process.env.BEAT_CHECK_INSTRUMENTS?.split(',') || ['piano'],
);
try {
  await page.goto(baseURL);
  await page.evaluate(() => {
    document.querySelector('#manualTempo').value = '120';
  });
  const started = Date.now();
  await page.click('#start');
  await page.waitForTimeout(4000);
  if (requests.length) throw Error('A request started before five seconds');
  await page.waitForTimeout(31000);
  const traces = await page.locator('#modelTrace pre').allTextContents();
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => document.querySelector('#export').click());
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  const scheduled = exported.modelTurns.flatMap((t) => t.playback || []);
  const threadIds = [...new Set(exported.modelTurns.map((t) => t.threadId))];
  const acceptedUpdates = exported.modelTurns.reduce(
    (n, t) =>
      n +
      (t.updates?.length || 0) +
      (t.input.interveningObservations?.length || 0),
    0,
  );
  const outputReports = await (
    await fetch(baseURL + '/playback-status')
  ).json();
  const currentReports = outputReports.filter(
    (r) => r.sessionId === requests[0]?.sessionId,
  );
  const result = {
    outputPeak: Math.max(0, ...currentReports.map((r) => r.outputPeak || 0)),
    outputReports,
    errors,
    threadIds,
    acceptedUpdates,
    scheduledSections: scheduled.length,
    underrunGaps: scheduled.filter((s) => s.gap > 0).map((s) => s.gap),
    firstSectionLatencySeconds: scheduled[0]?.requestToScheduleMs / 1000,
    exported,
    requestCount: requests.length,
    updateCount: updates.length,
    firstRequestDelaySeconds: requests[0]
      ? (requests[0].at - started) / 1000
      : null,
    requests: requests.map(({ audio, evidence, ...r }) => ({
      ...r,
      evidenceDuration: evidence.durationSeconds,
      eventEnd: evidence.transcription.events.at(-1)?.endSeconds,
    })),
    updates: updates.map(({ evidence, ...r }) => ({
      ...r,
      evidenceDuration: evidence.durationSeconds,
    })),
    traces,
    log: await page.locator('#log').textContent(),
    health: await page.locator('#audioHealth').textContent(),
  };
  await page.click('#start');
  await page.waitForTimeout(700);
  result.serverAfterStop = await (await fetch(baseURL + '/health')).json();
  await writeFile(
    new URL('../../diagnostics/browser/browser-result.json', import.meta.url),
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        ...result,
        traces: undefined,
        exported: undefined,
        requests: undefined,
        updates: undefined,
        outputReports: undefined,
      },
      null,
      2,
    ),
  );
  if (
    errors.length ||
    !requests.length ||
    result.requests[0].evidenceDuration < 5 ||
    threadIds.length !== 1 ||
    !acceptedUpdates ||
    !scheduled.length ||
    result.serverAfterStop.busy ||
    result.outputPeak <= 0.00001
  )
    process.exitCode = 1;
} finally {
  await page.evaluate(() => window.testSource?.close()).catch(() => {});
  await browser.close();
}
