# Testing

Run `npm run check`, `npm run format:check`, and `npm test` first. Unit tests cover input preservation, context construction, streaming boundaries, ABC timing, session lifecycle, provider errors, and audio scheduling. Provider calls are mocked in unit tests.

## Browser checks

Install dependencies with `npm ci`, start the app with `npm start`, and install Google Chrome. These scripts use Playwright with the installed Chrome channel. Set `BEAT_URL` to use a different local origin (default: `http://localhost:4318`).

```sh
npm run test:browser
npm run test:levels
```

`test:browser` mocks composition requests and synthesizes microphone input. It checks audible sample output, delayed timers, audio-context recovery, muted channels, unavailable samples, rests, visible errors, and retry behavior. It does not incur model charges, but downloads soundfont samples.

`test:levels` renders each of the ten instrument samples through an OfflineAudioContext and records measured levels. Generated reports go under `diagnostics/browser/` and are ignored by Git.

## Real-model test

```sh
npm run test:live
```

This uses the configured provider and may incur charges. It supplies synthesized microphone input and checks delivered sections, output levels, session reuse, and Stop. It also checks accepted input updates: with OpenRouter these are queued for the next request, not applied to an in-flight response. Inspect `diagnostics/browser/browser-result.json` for model input, notation, and timing.

## Recording harness

Start with `BEAT_TEST=1 npm start` and open `/one-minute-test`. The page synthesizes a one-minute solo input, prepares real model accompaniment, and records the combined playback. Output is written under `diagnostics/browser/one-minute/`. This is a controlled 96 BPM input starting on a known beat; it does not demonstrate commercial-song transcription or downbeat accuracy.

## Listening evaluation

Use the same source and settings for comparisons. Listen for chord alignment, shared pulse, meaningful melodic responses, and whether parts adapt when the source changes. Keep software transport success separate from these musical judgments. Real-model tests and recordings are not automated quality ratings.
