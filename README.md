# Find the Beat



Live accompaniment composed as ABC notation, with sheet music rendered while the model writes.



## Run



`npm install`, then `npm start`. Open http://localhost:4318. Requires Node 20+ and a signed-in Codex CLI. Set CODEX_PATH if needed. Generation uses GPT-6.1 Sol with low reasoning and your Codex account allowance.



Select instruments and an input (microphone, shared tab audio, or recording), then Start listening. Use headphones. Test speaker checks output independently. Stop cancels generation and playback.



## Current pipeline



A rolling five-second input window supplies measured spectral and onset evidence to the composer. The model cannot hear audio directly. Original WAV windows remain in local diagnostics; only compact measured evidence is sent to the model.



Each Start-to-Stop listening flow prewarms one ephemeral Codex thread, using GPT-6.1 Sol, low reasoning and the requested Fast tier. Every phrase is a new turn on that same thread. Stop interrupts generation and releases the thread; a new Start creates a fresh thread. Instrument changes remain in the same thread and the latest selection overrides previous turns. Authentication recovery may require replacing a disconnected thread.

Each response has one ABC header (X:1, M:4/4, L:1/8, Q:1/4=BPM, K:key), then four one-bar ensemble blocks ending in `%endbar`. The server restores the shared header for each block, validates exact durations, assigns instrument programs and streams playable bars through NDJSON. No music scoring is performed. The prompt includes valid rhythm, chord, rest and accidental examples and excludes unsupported notation.

The browser preloads selected instrument samples and appends each validated bar to the audio queue as it arrives. No fallback loops are generated; sustained generation slower than playback can still cause gaps. Samples load from the FluidR3_GM soundfont hosted by paulrosen.github.io.

## Xiaomi research



The [MiMo-V2.6-RL-oss dataset](https://huggingface.co/datasets/XiaomiMiMo/MiMo-V2.6-RL-oss) contains a music subset of composition briefs and metadata, not paired reference ABC answers. Rows contain prompt, data_source, ability, reward_model, and extra_info (including requested voice count, BPM, and meter). The first inspected brief requests 56 bars in E major at 129 BPM for violin, flute, and cello.



The [dataset builder](https://github.com/XiaomiMiMo/verl/blob/mimo-oss/recipes/design/music/build_parquet.py) explicitly leaves ground truth empty. The [scorer pipeline](https://github.com/XiaomiMiMo/verl/blob/mimo-oss/recipes/design/music/scorer/pipeline.py) extracts ABC, compiles it using abc2midi, rejects compiler errors, ten or more bar warnings, internal blank lines, and conflicting channel programs, then scores MIDI features against a reference baseline. It does not evaluate brief compliance.



This app adopts ABC output and the no-blank-lines rule. Its live four-bar format and abcjs validation are application constraints; it does not run Xiaomi's RL scorer or claim equivalent validation or music quality.



## Validation and diagnostics



`npm test` checks ABC parsing, streaming preview boundaries, authentication recovery, evidence extraction, tempo handling, and diagnostics. Input estimates are experimental, especially on polyphonic or ambiguous material.



Each request is saved under diagnostics/<request-id>/ with input.wav, request.json and events.ndjson. These local files persist until manually deleted. Evaluation scripts and source attribution remain in evaluation/; historical trial claims are not current validation.



## Continuous bar playback



The composer now emits four standalone one-bar ABC tunes per request. Each tune contains the complete ensemble for that bar and ends with `%endbar`. The server validates each voice's duration and emits a `bar` event as soon as its delimiter arrives. This is notation validation only, not music scoring. All-rest bars retain their four-beat duration. Cross-bar ties are excluded from this transport.



The browser prepares samples and appends bars at the queued audio end. Selected instrument samples (MIDI 36–84, plus common drum hits) preload with six background requests at a time during listening; other notes load on demand. First generation starts after two seconds of input. Subsequent requests begin when queued duration falls below the measured previous request time plus four seconds. Bar diagnostics record sample wait, request-to-schedule time, anchor, and underrun gap. Network or model stalls can still cause gaps. Earlier full-response playback descriptions above are superseded by this section.



## Google AI Studio provider



The server loads gitignored `.env.local` (Node 20.12+). Set MUSIC_PROVIDER=gemini and GEMINI_API_KEY to an AI Studio key. Keys stay on the Node server and are sent only in the x-goog-api-key header to Google's generativelanguage.googleapis.com endpoint. The browser never receives the key. Remove MUSIC_PROVIDER or set it to codex to restore the previous provider; there is no automatic cross-provider fallback.



Direct Google model ID: gemini-3.1-flash-lite-preview (OpenRouter labels the same model google/gemini-3.1-flash-lite-preview but requires a different key). Uses streamGenerateContent with SSE, minimal thinking, a concise instruction and shared ABC headers across four bar blocks. Preserves per-bar notation validation, cancellation, preloading and adaptive scheduling; adds first-token and first-bar timing. Raw audio is not sent to Google; compact measured musical context is.



Documentation: https://ai.google.dev/gemini-api/docs/generate-content/gemini-3 and https://ai.google.dev/gemini-api/docs/openai .



Live synthetic Em-context tests at 100 BPM for pluck/bass/drums, after clarifying the delimiter format: 3/3 complete valid responses; first playable bar 2.330 / 1.677 / 3.875 seconds; complete four bars 2.639 / 2.053 / 4.264 seconds (9.6 seconds of playback). Earlier prompt attempts failed formatting. These are small-sample API timings, not browser audio latency or music-quality scores. Real performance still depends on sample loading, network variance and musical validity.


Session diagnostics include the reused thread ID and setup wait per request. Lifecycle tests cover reuse, Stop during setup, new sessions, and notation-error recovery within the same thread.

## Simplified streaming flow

Choose a session tempo (default 100 BPM) before Start. It stays fixed until Stop; queued notes are never automatically retimed. Only the worker spectral/onset evidence goes to GPT, without a competing browser chord estimate. GPT chooses the music; validated bars are played directly without fallback loops. Notation appends one bar at a time within each phrase.

Recording diagnostics are off by default. Set `BEAT_DIAGNOSTICS=1` before starting the server to enable local WAV and event capture for debugging. Normal playback does not encode or upload WAV snapshots, or write request diagnostics. Older diagnostics are retained.

Tempo is now automatic by default: GPT infers pace from measured onsets and recent spectral detail, writes it in ABC Q:1/4, and each streamed bar carries that tempo into playback. A manual BPM remains an optional session override. Previously queued bars keep their original timing. Selected instruments are an allowed palette, not mandatory voices. The four-bar transport still uses 4/4; arbitrary meters are not yet supported.

## Recording lookahead

Recording input is decoded locally and analysed before its matching source sections play. Each request describes the next four source sections with absolute recording timestamps, per-section onset/pitch evidence, provisional ABC dominant notes and chord confidence. YIN estimates periodic pitch for clear solo input; it does not separate voices in a full mix. Uncertain notes are marked as rests in the candidate ABC, and spectral/chord estimates remain explicitly uncertain.

Each validated generated bar and its original audio section share one AudioContext start time. If the model is late, both wait together at the section boundary. This preserves their relative alignment but can interrupt recording playback. No prerecorded accompaniment or fallback patterns are substituted. At the end, playback stops; Stop cancels all scheduled source sections. Instrument selection changes stop recording mode so a new selection can start cleanly. If a pulse cannot be estimated, a manual tempo is required. Tempo and 4/4 section boundaries are estimates, not a full beat/downbeat transcription; rubato and dense mixes remain experimental.

Tests cover isolated pitch detection, silence, lookahead context, shared audio anchors, late bars, end truncation and cancellation. Browser verification uses the original synthetic `evaluation/live-pace-test.wav`, not a claim of perceptually verified accompaniment quality.

## Model-free note tracking

Input analysis now tracks monophonic note events at 10 ms hops using YIN and energy attacks. Original samples are unchanged. Each event retains start/end seconds and confidence. ABC uses a 1/32-note grid, explicit accidentals, z for measured silence and x for unknown/unobserved spans. Raw event timing accompanies the ABC so rounding is visible, not hidden. No trained transcription model is used. This is intended for clear single-note input, not reliable chord/voice separation from full songs. Short ornaments, noisy attacks and legato boundaries remain approximate.

## Continuous recording playback and phrase memory (current)

Recording mode now prepares the full accompaniment before playback. It starts the original recording once, continuously, and schedules GPT notes against that same audio clock. This trades preparation time for uninterrupted playback; it does not eliminate live microphone inference latency. Notes and the original samples are not replaced with fallback patterns.

Each session retains the last four delivered ABC bars, the first pitched motif and a delivered-bar position. The prompt asks for a related counter-melody, phrase development and an optional subset of allowed instruments. User musical direction is supplied separately on each turn. Recording-only `%hold instrument MIDI_PITCH` comments join explicitly continued boundary notes; ordinary repeated notes remain separate attacks. Sample length can still limit audible sustain.

The reproducible browser test is `/one-minute-test` when the server starts with `BEAT_TEST=1`. Click Run test; it synthesizes an original 60-second solo input, runs six real GPT phrases in one session, prepares samples, plays the full source continuously and records the mix. The gated artifact endpoint writes only its three named test files into `evaluation/one-minute`. The trace includes exact model inputs, instructions, streamed ABC, parsed notes and errors. This controlled test supplies 96 BPM and starts on a downbeat; it does not establish robust downbeat detection or accuracy on polyphonic commercial recordings. No musical quality score is computed.
