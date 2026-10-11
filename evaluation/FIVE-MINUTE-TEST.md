# Reproduce the five-minute live-input test

1. Open http://localhost:4318 and refresh before starting.
2. Under The band select Guitar / pluck, Bass, Electric keys and Drum kit. Disable the other six instruments.
3. Leave Tempo assist empty. Default levels: bass 80, other selected voices 50.
4. Choose Play an incoming recording, then select `evaluation/samples/guitar-five-minute-input.wav`.
5. Press Start listening and allow all five minutes to play. Use headphones.

The input is RyGuy's public-domain AcousticGuitarSample.ogg repeated to five minutes at original playback speed, decoded to 48 kHz PCM16. No time stretching, pitch shifting or AI accompaniment is baked in. Loop boundaries are part of this test, not natural performance transitions. Source: https://commons.wikimedia.org/wiki/File:AcousticGuitarSample.ogg

File playback uses the same analysis, rolling capture, composition and scheduler as microphone input. The model receives only measured evidence from the latest five-second window, not future audio. This tests live timing with repeatable input, not microphone noise, room acoustics or unrepeatable playing. For your guitar, change only the source to Microphone / audio interface.

The automated runner is `node find-the-beat/evaluation/five-minute.mjs` from the repository root. It uses this machine's bundled Playwright and installed Chrome, starts an isolated browser, selects the ensemble, records the actual Web Audio output and saves `results/five-minute-four-instrument.webm` plus a JSON log. The local app server must already be running. The runner captures real generation delays and does not accelerate playback. Model outputs and response times can vary between runs.

Per-request WAV inputs, notes and played/skipped events are in ../diagnostics/. Test output is not a claim of musical quality or guaranteed gapless playback.
