import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const baseURL = process.env.BEAT_URL || 'http://localhost:4318';
await mkdir(new URL('../../diagnostics/browser/', import.meta.url), {
  recursive: true,
});
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const results = [];
async function setup(mode) {
  const page = await browser.newPage();
  const errors = [],
    reports = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.testContexts = [];
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        window.testContexts.push(this);
      }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new Native(),
        sink = ctx.createMediaStreamDestination(),
        osc = ctx.createOscillator(),
        gain = ctx.createGain();
      gain.gain.value = 0.06;
      osc.frequency.value = 220;
      osc.connect(gain).connect(sink);
      osc.start();
      await ctx.resume();
      window.testInput = ctx;
      return sink.stream;
    };
  });
  await page.route('**/live.mjs', async (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: (
        await readFile(
          new URL('../../public/live.mjs', import.meta.url),
          'utf8',
        )
      ).replace(/INITIAL_LISTEN_SECONDS=\d+/, 'INITIAL_LISTEN_SECONDS=.2'),
    }),
  );
  await page.route('**/session/*', (route) => route.fulfill({ status: 204 }));
  await page.route('**/playback-status', async (route) => {
    if (route.request().method() === 'POST')
      reports.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await page.route('**/live/update', (route) =>
    route.fulfill({ json: { accepted: false } }),
  );
  if (mode === 'failed-samples')
    await page.route('https://paulrosen.github.io/**', (route) =>
      route.abort('failed'),
    );
  await page.route('**/compose', async (route) => {
    const input = route.request().postDataJSON();
    const notes =
      mode === 'rests'
        ? []
        : input.instruments.flatMap((instrument) =>
            [0, 2, 4, 6, 8, 10].map((beat) => ({
              instrument,
              note: instrument === 'drums' ? 36 : 60,
              beat,
              duration: 1.9,
              velocity: 0.8,
            })),
          );
    const messages = [
      {
        type: 'model-input',
        threadId: 'test-thread',
        instructions: 'Test transport',
        input,
      },
      {
        type: 'bar',
        index: 0,
        sectionId: 'test-section',
        durationBeats: 12,
        tempo: 120,
        notes,
        abc: 'X:1\nM:4/4\nL:1/4\nK:C\nV:keys\nC4|',
        elapsedMs: 1,
      },
      { type: 'done', sections: 1, elapsedMs: 2 },
    ];
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: messages.map((x) => JSON.stringify(x)).join('\n') + '\n',
    });
  });
  await page.goto(baseURL);
  await page.click('#start');
  return { page, errors, reports };
}
try {
  const { page, errors, reports } = await setup('normal');
  await page.waitForFunction(
    () =>
      document.querySelector('#status').textContent === 'Playing accompaniment',
    null,
    { timeout: 20000 },
  );
  // The main-thread observer can be late without dropping audio-clock notes.
  await page.evaluate(() => {
    const end = performance.now() + 1200;
    while (performance.now() < end) {}
  });
  await page.waitForTimeout(1100);
  const peak = Math.max(...reports.map((r) => r.outputPeak));
  if (!(peak > 0.00001) || reports.some((r) => r.failedNotes))
    throw Error('Default ensemble did not produce clean audio output');
  await page.evaluate(async () => {
    const ctx = window.testContexts[0];
    window.originalResume = ctx.resume.bind(ctx);
    ctx.resume = async () => {
      throw Error('Autoplay requires user activation');
    };
    await ctx.suspend();
  });
  await page.waitForFunction(
    () =>
      !document.querySelector('#enableAudio').hidden &&
      document.querySelector('#status').textContent.includes('Audio paused'),
  );
  await page.evaluate(
    () => (window.testContexts[0].resume = window.originalResume),
  );
  await page.click('#enableAudio');
  await page.waitForFunction(() => window.testContexts[0].state === 'running');
  await page.evaluate(() => {
    for (const name of ['pluck', 'bass', 'keys', 'drums']) {
      const e = document.getElementById(name);
      e.value = 0;
      e.dispatchEvent(new Event('input'));
    }
  });
  await page.waitForFunction(() =>
    document.querySelector('#status').textContent.includes('Band muted'),
  );
  await page.waitForTimeout(1000);
  results.push({
    case: 'default ensemble, delayed timers, suspended output recovery, live mute',
    peak,
    errors,
    recovered: await page.evaluate(() => window.testContexts[0].state),
    mutedStatus: await page.locator('#status').textContent(),
    reports,
  });
  await page.click('#start');
  await page.evaluate(() => window.testInput.close());
  await page.close();
  for (const mode of ['failed-samples', 'rests']) {
    const { page, errors, reports } = await setup(mode);
    await page.waitForFunction(
      (expected) =>
        document.querySelector('#status').textContent.includes(expected),
      mode === 'rests' ? 'Band resting' : 'Audio problem',
      { timeout: 20000 },
    );
    await page.waitForTimeout(1100);
    results.push({
      case: mode,
      errors,
      status: await page.locator('#status').textContent(),
      reports,
    });
    if ((await page.locator('#status').textContent()).includes('Playing'))
      throw Error('False playing status');
    await page.click('#start');
    await page.evaluate(() => window.testInput.close());
    await page.close();
  }
  await writeFile(
    new URL(
      '../../diagnostics/browser/audio-verification.json',
      import.meta.url,
    ),
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify(
      results.map(({ reports, ...r }) => ({
        ...r,
        lastReport: reports.at(-1),
      })),
      null,
      2,
    ),
  );
  if (results.some((r) => r.errors.length)) process.exitCode = 1;
} finally {
  await browser.close();
}
