# Find the Beat — music prototype

Local-only experiment. The existing AI Hunger Games application is untouched.

## Run

From this directory, run `npm start`, then open http://localhost:4318 in Chrome.
Requires Node 20+ and a signed-in `codex` CLI (`codex login status`). Set CODEX_PATH if the executable is not on PATH. No API key is used. The model is explicitly `gpt-6.1-sol`, reasoning `low`. This uses your Codex account usage allowance.

Use headphones. Select microphone/audio interface, a browser tab with its audio-sharing checkbox enabled, or an incoming recording. Recordings are played in real time; the model never receives future audio. For files, choose a file then press Start listening. Microphone uses the browser's chosen input device. No audio is written to disk or sent to Codex; only estimated musical state is sent. Stop cancels pending generation and releases the notes.

## Implementation

Browser Web Audio analyser (8192-sample FFT) → peak-weighted pitch-class chroma, major/minor triad ranking, attack interval tempo estimate → rolling five seconds of musical context → local Node bridge → persistent Codex app-server over stdio → incremental compact note rows → validated events → local Web Audio instrument synthesis.

A new ephemeral model thread has minimal music-only instructions for each phrase. Shell, apps, plugins, hooks, multi-agent and configured MCP servers are disabled. Server is loopback-only, validates Origin/Host and musical context, and allows one composition at a time. Credentials remain in Codex's own authentication storage. The current app-server protocol is experimental.

Each row is `[beat, instrument, MIDI_or_chord_array, durationBeats, velocity, optionalRepeatCount, optionalRepeatEveryBeats]`. The model chooses all notes and repetition patterns; the parser expands up to 256 events per phrase. Ten instrument voices are available. Notes are generated, not selected from stored songs or loops. Local sound generation uses synthesized bass, electric-piano-like tones and drum hits. No prerecorded backing track or fallback progression exists.

Playback accepts streamed model events but commits each completed response as one fresh phrase. It schedules that phrase after the current phrase ends, using the request's captured tempo so later tempo estimates cannot distort durations. It requests an update at most every five seconds while input is active, with one request in flight and no stale request backlog. Generation continues while the current phrase plays. Recent played notes plus the current queue's ending are supplied as continuation context. Chord/tempo changes and input pauses do not cancel generation. Only Stop, a new session, or seeking in a recording invalidates playback. Silence stops new requests; an already requested phrase can finish. No backing track or repeated fallback is inserted if the model falls behind.

## What has and has not been proven

- Unit tests cover 24 clean major/minor chroma templates, a spectral Em fixture, basic consistent tempo, malformed/partial notes and input validation.
- Real authenticated GPT-6.1 Sol / low runs returned fresh valid notes.
- Initial exec path: first notes 11.638 s, complete 12.167 s.
- Persistent verbose stream: first note 3.643 s, complete 7.838 s.
- Persistent compact stream: first note 2.884 s, complete 5.330 s.
- These are individual observations, not latency percentiles or guarantees. First audible playback requires additional grouping and scheduling delay. Initial listening adds approximately five seconds.
- Browser integration test streamed a synthetic Em → Am → silence recording through the real Codex backend: both harmony estimates were observed, fresh notes were scheduled, and silence cancelled playback. The initial one-beat buffering test dropped five late notes in one phrase; buffering was increased to two beats. The subsequent browser run scheduled all 12 notes in its first phrase with no late-note log; Stop cancelled the next request and the backend reported busy=false. Offline audio rendering produced finite, nonzero samples (peak 0.0435 for the tested bass note). Browser runtime errors: none; mobile horizontal overflow: none.
- Clean synthetic audio is not validation on a real polyphonic guitar. Harmonics, open strings, inversions, room noise, swing, rubato, and ambiguous half/double tempo can defeat this basic estimator. It is not a trained guitar transcription system.
- Audio scheduling is local; musical decisions still depend on network and model latency. This architecture does NOT currently deliver a seamless low-latency live band. It is a working experiment to expose and measure the limitation, with honest gaps instead of canned replacement music.
- Instrument sounds are basic synthesis, not professional sample libraries. No 3D character work was started.

## Tests

`npm test`

Export log in the UI saves analysis transitions and response timings, not microphone audio. Browser audio permissions and live instrument quality must be verified on the actual demonstration setup.

## References

- https://developers.openai.com/codex/app-server
- https://developers.openai.com/codex/noninteractive
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

## Longer listening trial

Responses request eight bars in 4/4 (32 beats, 19.2 seconds at 100 BPM), using compact chord and rhythm rows. The full previous phrase and recent input attack times are carried forward. Playback keeps the initial band tempo stable and joins phrases on bar boundaries; note releases may cross those boundaries. This buffer trades immediate reaction for continuity. The composer timeout is 45 seconds to accommodate the longer output. Streaming, cancellation, and late-note rejection remain enabled. This does not guarantee gapless playback.

## Current listening behavior

Refresh the page after updates. The initial five-second listening period is followed by generation of a complete ten-second phrase. This is a deliberate initial wait to avoid dropping notes during token streaming. Audio is newly composed after receiving live musical analysis; no song or progression is hardcoded. Continuity depends on completing subsequent phrases before the queue runs out, and is not guaranteed.

## Expanded ensemble

The composer may choose any subset of ten synthesized instruments: bass, electric keys, drums, piano, plucked strings, string pad, organ, vibraphone, flute, and synth lead. The model chooses instrumentation, notes and arrangement; the synthesizer defines only timbres and envelopes. Instructions ask for motif development, changing voicings, dynamics and varied rhythm informed by recent band output. This encourages variation but is not a musical-quality guarantee. All ten voices passed finite/nonzero offline audio-render checks; the ten-channel mixer has no browser runtime errors or mobile horizontal overflow in the check. These are synthesis approximations, not sampled acoustic instruments.

## Audio diagnostics

Test speaker plays one explicitly labeled reference tone independently of Codex (never used as accompaniment). Input analysis now connects through a zero-gain sink to the destination to keep the microphone graph active without feedback. Input threshold is 0.003 RMS; master gain is 1.2 before compression. Live diagnostics show AudioContext state, input RMS, band output peak, and recent played-note count. The scheduler tolerates up to 200 ms of timer lateness rather than silently dropping every late callback. Physical device audibility still requires the user's speaker test.

## Codex authentication recovery

Codex owns managed ChatGPT authentication (official reference: https://developers.openai.com/codex/app-server#auth-endpoints). Before generation the bridge checks account/read without forcing refresh. It checks auth.json file metadata only, never token contents; a changed stamp restarts the local composer process to reload current credentials. Authentication failure before any delivered notes triggers one clean process restart and retry. Persistent failure requires signing in again; non-auth failures and partially delivered responses are not retried. Four regression tests cover these behaviors. Metadata-based detection applies to file-backed credentials; keychain changes are handled by the bounded error recovery. This fixes the observed stale-process behavior, not revoked account credentials.


## Original input and responsive tempo
The browser captures a rolling five-second AudioWorklet buffer and sends an IEEE float WAV audio attachment to Codex alongside musical estimates. Sample values and channels are preserved at the browser AudioContext sample rate; browser/device decoding or resampling can already have occurred. No pitch shifting, quantization, transcription replacement, or AI backing mix is applied to this capture. The buffer is kept in memory. Use headphones to prevent acoustic feedback entering the microphone.
Tempo now follows measured attacks instead of locking to the first response. A separate short analysis window tracks attacks; sustained estimates retime future unscheduled accompaniment. Already sounding notes are not time-stretched. Fast pulses up to 200 BPM are not folded at 170 BPM. Beat-vs-subdivision ambiguity remains possible; tempo assist overrides the estimate. Reliable chord changes suppress stale pitched events and a matching fresh response replaces future stale accompaniment. This avoids clashes but can temporarily leave percussion alone while composing.

## Responsive player and persisted diagnostics
New compositions cover four bars and replace future queued events at the next bar boundary. While a request is pending, the player can reuse the final bar of the current AI-generated phrase at most twice; there are no stored musical patterns. Silence prevents these bridges. Tempo updates require a stable majority over at least 2.5 seconds and move by at most 3 BPM per accepted observation. Manual tempo remains immediate. Uncertain chord labels no longer suppress all pitched playback.
Each request is saved in `diagnostics/<request-id>/`: `input.wav` (original submitted bytes), `request.json` (analysis, audio hash and timestamp), and `events.ndjson` (model events, scheduling, played/skipped events, tempo changes and bridges). Playback events include the originating composition ID. The UI reports each saved ID. Recordings remain local and are gitignored; requests still send audio to Codex as before. The saved clips are the windows actually submitted, not a continuous session recording. Diagnostics are retained until manually deleted.

## Audio modality correction and measured evidence
Direct listening tests on four web excerpts all reported audio unavailable. The installed GPT-6.1 Sol metadata lists text/image inputs. Earlier successful audio-attached responses were NOT proof of audio understanding. The composer now receives instrument-independent measured spectral frames and onset timings, computed in a Web Worker. The original WAV is preserved locally unchanged and is no longer represented as audible to the model. Spectral peaks may contain harmonics; this is not reliable polyphonic transcription or a substitute for an audio-native composer.
The full evidence is retained locally in request diagnostics; context.mjs compacts it for inference. No sample names, known keys, fixture melodies or instrument-specific templates enter the live prompt. Evaluation sources and licenses are in evaluation/samples/SOURCES.md. Local trial outputs are kept in evaluation/results and are not included in this repository. A failed quota-limited trial is not a zero-latency success. Generated WAVs are accompaniment-only renderings, not listening-quality certification.
