# One-minute browser test

Original synthesized solo melody, 60 seconds, 96 BPM, downbeat at zero. Real GPT-6.1 Sol, low reasoning, Fast tier. One session/thread; six successful four-bar responses plus one failed attempt. Exact instructions and model payloads are in model-input events within test-trace.json; all raw response deltas and parser events are retained. response-01.abc through response-07.abc contain raw model text, including the invalid second response.

| Attempt | Phrase | Generation seconds | Valid bars | Result |
|---|---|---|---|---|
| 1 | 1 | 7.98 | 4 | accepted |
| 2 | 2 | failed | 0 | ABC notation: Music Line:11:11: Duration not representable: z5 :  !p!C,3 z5 | |
| 3 | 2 | 7.08 | 4 | accepted |
| 4 | 3 | 4.07 | 4 | accepted |
| 5 | 4 | 4.64 | 4 | accepted |
| 6 | 5 | 8.70 | 4 | accepted |
| 7 | 6 | 4.56 | 4 | accepted |

Playback completed in the browser: one continuous source start, 24 bars, 107 generated notes. GPT used piano and bass, omitting the allowed drums. No marked cross-bar holds were generated in this run; those are verified by unit tests instead. Browser recording was converted from WebM to WAV without changing the arrangement. The mix capture duration is 60.36 seconds including the recorder margin.

Artifacts: test-input.wav (source), test-mix.wav (source plus GPT accompaniment), test-mix.webm (original browser capture), test-trace.json (requests and all responses).

Limits: This controlled recording test uses the real backend, transcription worker and sample player through a dedicated browser harness. It is not a microphone test or a test of automatic beat/downbeat alignment. Accompaniment is prepared before the source starts, so no inference is required during playback. Microphone response latency remains. No perceptual quality claim or music score is made. No fallback music was used.

Validation: npm test: 46 passed; public/app.mjs and server.mjs syntax checks passed.
