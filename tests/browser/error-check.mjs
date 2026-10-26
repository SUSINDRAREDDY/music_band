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
try {
  const results = [];
  for (const setupFailure of [false, true]) {
    const page = await browser.newPage(),
      sessions = [],
      reports = [],
      errors = [];
    let calls = 0,
      startCalls = 0;
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext(),
          sink = ctx.createMediaStreamDestination(),
          osc = ctx.createOscillator();
        osc.connect(sink);
        osc.start();
        await ctx.resume();
        window.input = ctx;
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
        ).replace(/INITIAL_LISTEN_SECONDS=\d+/, 'INITIAL_LISTEN_SECONDS=.1'),
      }),
    );
    await page.route('**/session/start', async (route) => {
      sessions.push(route.request().postDataJSON().sessionId);
      startCalls++;
      await route.fulfill(
        setupFailure && startCalls === 1
          ? { status: 503, json: { error: 'Session setup unavailable' } }
          : { status: 204 },
      );
    });
    await page.route('**/session/stop', (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route('**/playback-status', async (route) => {
      reports.push(route.request().postDataJSON());
      await route.fulfill({ status: 204 });
    });
    await page.route('**/compose', async (route) => {
      calls++;
      const input = route.request().postDataJSON();
      const events =
        !setupFailure && calls === 1
          ? [
              {
                type: 'error',
                message:
                  'Composition timed out after 45 seconds. Retry the composer.',
              },
            ]
          : [
              {
                type: 'model-input',
                threadId: 'same-thread',
                instructions: 'test',
                input,
              },
              {
                type: 'bar',
                index: 0,
                sectionId: 's',
                notes: [],
                durationBeats: 4,
                tempo: 60,
                abc: 'X:1\nK:C\nV:keys\nz8|',
              },
              { type: 'done', sections: 1, elapsedMs: 1 },
            ];
      await route.fulfill({
        contentType: 'application/x-ndjson',
        body: events.map((e) => JSON.stringify(e)).join('\n') + '\n',
      });
    });
    await page.goto(baseURL);
    await page.click('#start');
    await page.waitForFunction(
      () => !document.querySelector('#retryComposer').hidden,
    );
    const error = await page.locator('#status').textContent();
    if (
      !error.includes(setupFailure ? 'Session setup unavailable' : 'timed out')
    )
      throw Error('Lost error detail');
    await page.waitForTimeout(1600);
    if ((await page.locator('#status').textContent()) !== error)
      throw Error('Error overwritten');
    await page.click('#retryComposer');
    await page.waitForFunction(() =>
      document.querySelector('#status').textContent.includes('Band resting'),
    );
    if (new Set(sessions).size !== 1) throw Error('Retry changed session');
    if (!reports.some((r) => r.composerError))
      throw Error('Missing reported error');
    results.push({
      setupFailure,
      error,
      recovered: true,
      sameSession: true,
      errors,
    });
    await page.click('#start');
    await page.evaluate(() => window.input.close());
    await page.close();
  }
  await writeFile(
    new URL(
      '../../diagnostics/browser/error-verification.json',
      import.meta.url,
    ),
    JSON.stringify(results, null, 2),
  );
  console.log(results);
} finally {
  await browser.close();
}
