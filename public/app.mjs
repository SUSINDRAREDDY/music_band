import { periodicPitch } from './pitch.mjs';
import { RecordingLookahead, analyseClip } from './lookahead.mjs';
import { wavDataUrl } from './recording.mjs';
import { ScoreView } from './score.mjs';
import { instruments, canContinue, nextBarAnchor } from './music.mjs';
import { Band } from './audio.mjs';
import { readMusicStream } from './stream.mjs';
import { scheduleSection, audioStatus } from './playback.mjs';
import {
  LiveTiming,
  LivePulse,
  INITIAL_LISTEN_SECONDS,
  INPUT_UPDATE_SECONDS,
  evidenceSignature,
  inputChanged,
} from './live.mjs';
let diagnosticsEnabled = false;
let providerInfo = { model: 'connecting', reasoning: '' };
const $ = (id) => document.getElementById(id),
  logs = [],
  modelTurns = [];
const musicalStyles = {
  auto: '',
  warm: 'Warm and intimate accompaniment. Use flowing, singable answering phrases, smooth voice leading and expressive middle dynamics. Leave space for the source melody.',
  groove:
    'Rhythmic and playful accompaniment. Build an interlocking groove with tasteful syncopation and short melodic answers. Follow the source pulse without forcing a beat onto rubato playing.',
  cinematic:
    'Spacious cinematic accompaniment. Shape lyrical phrases and gradual dynamic swells with a clear melodic arc. Keep the source prominent and avoid dense unsupported harmony.',
  jazz: 'Relaxed jazz-inspired accompaniment. Use conversational phrasing, tasteful rhythmic displacement and economical voicings grounded in the source harmony. Do not force swing or unrelated chord changes.',
  minimal:
    'Minimal and delicate accompaniment. Make each phrase intentional, with breathing room and subtle melodic development. Keep the instrument clearly audible even with a sparse texture.',
};
try {
  $('musicalDirection').value = localStorage.getItem('musical-direction') || '';
} catch {}
function syncMusicalStyle() {
  const text = $('musicalDirection').value;
  $('musicalStyle').value =
    Object.keys(musicalStyles).find((key) => musicalStyles[key] === text) ||
    'custom';
}
function saveMusicalDirection() {
  try {
    localStorage.setItem('musical-direction', $('musicalDirection').value);
  } catch {}
  syncMusicalStyle();
}
syncMusicalStyle();
$('musicalDirection').oninput = saveMusicalDirection;
$('musicalStyle').onchange = () => {
  const style = $('musicalStyle').value;
  if (style === 'custom') {
    $('musicalDirection').focus();
    return;
  }
  $('musicalDirection').value = musicalStyles[style];
  saveMusicalDirection();
};
function showModelInput(msg) {
  $('modelInstructions').textContent = msg.instructions;
  const item = { threadId: msg.threadId, input: msg.input, outputABC: '' };
  modelTurns.push(item);
  const box = document.createElement('details'),
    title = document.createElement('summary'),
    input = document.createElement('pre'),
    output = document.createElement('pre');
  title.textContent = `Phrase ${msg.input.phraseIndex ?? 0} · ${msg.threadId}`;
  input.textContent = JSON.stringify(msg.input, null, 2);
  input.style.whiteSpace = output.style.whiteSpace = 'pre-wrap';
  box.append(
    title,
    document.createTextNode('Exact composer input'),
    input,
    document.createTextNode('Raw ABC received'),
    output,
  );
  $('modelTrace').append(box);
  while (modelTurns.length > 8) {
    modelTurns.shift();
    $('modelTrace').firstChild.remove();
  }
  return { item, input, output };
}
let inputSink, rhythmAnalyser, capture;
function originalAudio(sinceFrame = 0) {
  const node = capture;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error('Audio capture timed out')),
      2000,
    );
    node.port.onmessage = ({ data }) => {
      clearTimeout(timer);
      try {
        resolve({
          audio: diagnosticsEnabled ? wavDataUrl(data) : undefined,
          recording: data,
        });
      } catch (e) {
        reject(e);
      }
    };
    node.port.postMessage({ type: 'snapshot', sinceFrame });
  });
}
let lookahead = null;
let flowId = null,
  sessionReady = Promise.resolve(),
  sessionClosing = Promise.resolve();
let ctx,
  band,
  analyser,
  stream,
  inputNode,
  frameTimer,
  scheduleTimer,
  controller;
let audioMetrics = {
    sections: 0,
    scheduled: 0,
    played: 0,
    failed: 0,
    peak: 0,
    lastSignal: -Infinity,
    expectedUntil: 0,
    error: null,
    loading: false,
  },
  lastAudioReport = 0,
  resumingAudio = false,
  resumeError = null;
function resetAudioMetrics() {
  resumeError = null;
  audioMetrics = {
    sections: 0,
    scheduled: 0,
    played: 0,
    failed: 0,
    peak: 0,
    lastSignal: -Infinity,
    expectedUntil: 0,
    error: null,
    loading: false,
  };
}
async function resumeAudio() {
  if (!ctx || ctx.state === 'running' || resumingAudio) return;
  resumingAudio = true;
  try {
    await Promise.race([
      ctx.resume(),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
  } catch (e) {
    resumeError = e.message;
    log('Audio resume failed: ' + e.message);
  } finally {
    resumingAudio = false;
    if (running || starting) $('enableAudio').hidden = ctx.state === 'running';
  }
}
$('enableAudio').onclick = () => void resumeAudio();
$('bandVolume').oninput = () => {
  if (band) band.setVolume(Number($('bandVolume').value) / 100);
  $('bandVolumeValue').textContent = $('bandVolume').value + '%';
};
function watchAudioContext() {
  ctx.addEventListener('statechange', () => {
    if (!running && !starting) return;
    log('Audio context: ' + ctx.state);
    if (ctx.state === 'running') resumeError = null;
    $('enableAudio').hidden = ctx.state === 'running';
    if (ctx.state !== 'running') void resumeAudio();
  });
}
function reportAudio(peak) {
  const wall = performance.now() / 1000;
  if (peak >= 0.003) audioMetrics.lastSignal = wall;
  audioMetrics.peak = Math.max(audioMetrics.peak, peak);
  const muted =
    band.volume === 0 ||
    [...enabledInstruments].every((n) => band.levels[n] <= 0);
  const message = audioStatus({
    state: ctx.state,
    muted,
    loading: audioMetrics.loading,
    peak,
    lastSignalAge: wall - audioMetrics.lastSignal,
    queued: queue.length,
    hasSections: audioMetrics.sections > 0,
    expectedSound: audioMetrics.expectedUntil > ctx.currentTime,
    error: audioMetrics.error || resumeError,
  });
  $('enableAudio').hidden = ctx.state === 'running';
  if (
    !composerError &&
    message &&
    (!lookahead || lookahead.started) &&
    (ctx.state !== 'running' ||
      muted ||
      audioMetrics.sections > 0 ||
      audioMetrics.error)
  )
    status(message);
  if (wall - lastAudioReport < 1) return;
  lastAudioReport = wall;
  const report = {
    sessionId: flowId,
    source: $('source').value,
    state: ctx.state,
    composerError,
    outputPeak: audioMetrics.peak,
    outputDb: audioMetrics.peak > 0 ? 20 * Math.log10(audioMetrics.peak) : -120,
    bandVolume: band.volume,
    tempo: bpm,
    selectedInstruments: [...enabledInstruments],
    instrumentLevels: Object.fromEntries(
      [...enabledInstruments].map((n) => [n, band.levels[n]]),
    ),
    sections: audioMetrics.sections,
    scheduledNotes: audioMetrics.scheduled,
    playedNotes: audioMetrics.played,
    failedNotes: audioMetrics.failed,
    queuedNotes: queue.length,
    muted,
    error: audioMetrics.error || resumeError,
    status: $('status').textContent,
  };
  $('playbackDetails').textContent = JSON.stringify(report, null, 2);
  if (flowId)
    void fetch('/playback-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    }).catch(() => {});
  audioMetrics.peak = 0;
}
let lastDiagnostic = null,
  diagnosticEvents = [];
function recordDiagnostic(event) {
  if (diagnosticsEnabled && diagnosticEvents.length < 400)
    diagnosticEvents.push(event);
}
function flushDiagnostics() {
  if (!lastDiagnostic || !diagnosticEvents.length) return;
  const events = diagnosticEvents.splice(0, 400);
  fetch('/diagnostics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: lastDiagnostic, events }),
    keepalive: true,
  }).catch(() => log('Could not save playback diagnostics.'));
}
setInterval(flushDiagnostics, 2000);

let liveState = null;
function newLiveState() {
  return {
    timing: new LiveTiming(),
    pulse: new LivePulse(),
    cursor: 0,
    analysisBusy: false,
    updateBusy: false,
    lastCheck: 0,
    lastSent: 0,
    signature: null,
    requestId: null,
    acceptedRequest: null,
    generation: null,
    skippedNotes: 0,
    lastPlayedSection: null,
    direction: '',
    lastEvidenceEnd: 0,
  };
}
function playbackState(state) {
  return {
    nowSeconds: Math.max(0, ctx.currentTime - startAt),
    queuedUntilSeconds: Math.max(0, phraseEnd - startAt),
    lastPlayedSection: state.lastPlayedSection,
    skippedNotes: state.skippedNotes,
  };
}
function liveContext(recording, state, requestId, generation) {
  return {
    requestId,
    window: {
      startSeconds: Math.max(0, recording.startTime - startAt),
      endSeconds: Math.max(0, recording.endTime - startAt),
      overlapSeconds: recording.overlapSeconds,
      droppedSeconds: recording.droppedSeconds,
    },
    playback: playbackState(state),
    generation,
  };
}
function inputContext(evidence) {
  return {
    sessionId: flowId,
    musicalDirection: $('musicalDirection').value,
    instruments: [...enabledInstruments],
    evidence,
    tempoMode: manualBpm === null ? 'auto' : 'manual',
    bpm,
    history: [],
    continueThroughPause: $('continuous').checked && wasSilent,
    phraseIndex,
  };
}
async function measureInput(state) {
  state.analysisBusy = true;
  try {
    const captured = await originalAudio(state.cursor),
      evidence = await analyseClip(captured.recording);
    state.pulse.observe(captured.recording, evidence);
    return { ...captured, evidence };
  } finally {
    state.analysisBusy = false;
  }
}
function acceptInput(state, captured, direction) {
  state.cursor = Math.max(state.cursor, captured.recording.endFrame);
  state.signature = evidenceSignature(captured.evidence);
  state.lastSent = ctx.currentTime;
  state.lastCheck = ctx.currentTime;
  state.lastEvidenceEnd = captured.recording.endTime;
  state.direction = direction;
}
async function updateLiveInput() {
  const state = liveState,
    own = session,
    revision = version,
    requestId = state?.requestId;
  if (
    !state ||
    state.analysisBusy ||
    state.updateBusy ||
    !busy ||
    state.acceptedRequest !== requestId ||
    !requestId
  )
    return;
  state.updateBusy = true;
  state.lastCheck = ctx.currentTime;
  try {
    const captured = await measureInput(state);
    if (
      own !== session ||
      revision !== version ||
      !running ||
      !busy ||
      state.requestId !== requestId
    )
      return;
    const direction = $('musicalDirection').value,
      changed = inputChanged(
        state.signature,
        evidenceSignature(captured.evidence),
      );
    // Coalesce observations. The cadence is transport pacing, never a musical pattern.
    if (
      !changed &&
      direction === state.direction &&
      ctx.currentTime - state.lastSent < 2 * INPUT_UPDATE_SECONDS
    )
      return;
    const res = await fetch('/live/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...inputContext(captured.evidence),
        live: liveContext(
          captured.recording,
          state,
          requestId,
          state.generation,
        ),
      }),
      signal: controller?.signal,
    });
    if (!res.ok) throw Error('Live input update failed (' + res.status + ')');
    const result = await res.json();
    if (result.accepted && own === session && revision === version)
      acceptInput(state, captured, direction);
  } catch (e) {
    if (e.name !== 'AbortError' && own === session && revision === version) {
      log(e.message);
    }
  } finally {
    state.updateBusy = false;
  }
}
let authBlocked = false,
  composerError = null,
  phraseIndex = 0,
  lastPhrase = [];
function composerFailed(message) {
  composerError = String(message);
  authBlocked = true;
  log('Composer: ' + composerError);
  $('retryComposer').hidden = false;
  status('Composer: ' + composerError);
}
async function connectComposer(id) {
  const res = await fetch('/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: id }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw Error(
      detail.error || 'Could not start composer session. Stop and try again.',
    );
  }
}
$('retryComposer').onclick = async () => {
  if (!running || busy) return;
  const own = session,
    id = flowId;
  $('retryComposer').disabled = true;
  status('Reconnecting composer…');
  try {
    sessionReady = connectComposer(id);
    await sessionReady;
    if (own !== session || !running) return;
    composerError = null;
    authBlocked = false;
    $('retryComposer').hidden = true;
    lastRequest = 0;
    status('Retrying composer…');
    void compose();
  } catch (e) {
    if (own === session) composerFailed(e.message);
  } finally {
    $('retryComposer').disabled = false;
  }
};
let auditioning = false,
  auditionTimer;
let starting = false,
  previewing = false;
function syncTransport() {
  const active = starting || running || auditioning || previewing;
  $('start').disabled = false;
  $('start').innerHTML = active
    ? '<span aria-hidden="true">■</span> Stop'
    : '<span aria-hidden="true">▶</span> Start';
  $('start').setAttribute('aria-pressed', String(active));
  $('start').setAttribute(
    'aria-label',
    active ? 'Stop session' : 'Start session',
  );
  $('source').disabled = active;
  $('manualTempo').disabled = active;
}
let running = false,
  session = 0,
  startAt = 0,
  lastSound = 0,
  lastRequest = 0,
  busy = false;
let manualBpm = null,
  bpm = 100,
  queue = [],
  played = [],
  version = 0,
  wasSilent = true,
  phraseEnd = 0;
const canvas = $('scope'),
  paint = canvas.getContext('2d');
const scoreView = new ScoreView($('score'), $('notation'), $('scoreStatus'));
const labels = {
  bass: 'Bass',
  keys: 'Electric keys',
  drums: 'Drum kit',
  piano: 'Piano',
  pluck: 'Guitar / pluck',
  strings: 'String pad',
  organ: 'Organ',
  vibes: 'Vibraphone',
  flute: 'Flute',
  lead: 'Synth lead',
};
let enabledInstruments = new Set(['pluck', 'bass', 'drums', 'keys']);
try {
  const saved = JSON.parse(localStorage.getItem('band-instruments'));
  if (
    Array.isArray(saved) &&
    saved.some((n) => Object.values(instruments).includes(n))
  )
    enabledInstruments = new Set(
      saved.filter((n) => Object.values(instruments).includes(n)),
    );
} catch {}
function updateBandCount() {
  $('bandCount').textContent =
    enabledInstruments.size +
    ' ' +
    (enabledInstruments.size === 1 ? 'player' : 'players');
}
updateBandCount();
let stage;
import('/stage.mjs')
  .then(({ createStage }) => {
    stage = createStage($('stage'), {
      clock: () => ctx?.currentTime ?? performance.now() / 1000,
      onPreviewChange: (value) => {
        previewing = value;
        syncTransport();
        $('previewAnimations').innerHTML = value
          ? 'Stop preview'
          : '<span aria-hidden="true">✧</span> Preview animations';
        status(
          value
            ? 'A little doodle dance · animation preview'
            : 'Preview finished',
        );
      },
      onSelect: (name) => {
        $('settingsMenu').open = false;
        $('instrumentMenu').open = true;
        const control = $('enable-' + name);
        control.focus();
      },
    });
    stage.select([...enabledInstruments]);
    $('view').onclick = () => stage.view();
    $('resetView').onclick = () => stage.resetView();
    $('reduceMotion').checked = matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    $('reduceMotion').onchange = (e) => stage.reduce(e.target.checked);
    void stage.ready.catch((e) => status(e.message));
  })
  .catch((e) => {
    $('stageError').textContent =
      'The doodles could not load. Please refresh the page.';
    console.error(e);
  });
for (const name of Object.values(instruments)) {
  const row = $('enable-' + name).closest('.channel');
  $('enable-' + name).checked = enabledInstruments.has(name);
  row.classList.toggle('inactive', !enabledInstruments.has(name));
  $('enable-' + name).onchange = () => {
    if (!$('enable-' + name).checked && enabledInstruments.size === 1) {
      $('enable-' + name).checked = true;
      status('Keep at least one instrument selected.');
      log('Keep at least one instrument selected.');
      return;
    }
    $('enable-' + name).checked
      ? enabledInstruments.add(name)
      : enabledInstruments.delete(name);
    row.classList.toggle('inactive', !enabledInstruments.has(name));
    updateBandCount();
    localStorage.setItem(
      'band-instruments',
      JSON.stringify([...enabledInstruments]),
    );
    if (starting || auditioning || (running && lookahead)) stop();
    else invalidate();
    lastRequest = 0;
    stage?.select([...enabledInstruments]);
    if (band)
      void band.preload([...enabledInstruments]).catch((e) => log(e.message));
    log(
      'Selected instruments: ' +
        [...enabledInstruments].map((n) => labels[n]).join(', '),
    );
    if (running) status('Ensemble changed · composing for your selection');
  };
}
function log(message) {
  const at = new Date().toLocaleTimeString([], { hour12: false });
  logs.push({ at, message });
  if (logs.length > 500) logs.shift();
  const p = document.createElement('p'),
    t = document.createElement('time');
  t.textContent = at;
  p.append(t, document.createTextNode(message));
  $('log').prepend(p);
  while ($('log').children.length > 40) $('log').lastChild.remove();
}
function status(s) {
  $('status').textContent = composerError ? 'Composer: ' + composerError : s;
}
function invalidate() {
  if (liveState) {
    liveState.requestId = null;
    liveState.acceptedRequest = null;
  }
  stage?.reset();
  scoreView.cancel();
  version++;
  queue = [];
  phraseEnd = 0;
  phraseIndex = 0;
  lastPhrase = [];
  band?.hush();
  controller?.abort();
}
async function compose() {
  if (
    busy ||
    !running ||
    (!lookahead &&
      (liveState?.analysisBusy ||
        liveState?.updateBusy ||
        (wasSilent && !lastPhrase.length)))
  )
    return;
  const own = session,
    revision = version,
    state = liveState;
  let phraseBpm = bpm,
    plan = null,
    captured = null;
  const received = [];
  busy = true;
  lastRequest = ctx.currentTime;
  controller = new AbortController();
  let failed = false,
    completed = false;
  const requestStarted = performance.now();
  let firstBar = true,
    trace = null,
    previousSectionAt = requestStarted;
  const requestId = crypto.randomUUID();
  if (state) {
    state.requestId = requestId;
    state.acceptedRequest = null;
  }
  log('Measuring input for the continuing composer session.');
  status(
    queue.length
      ? 'Accompaniment queued · composing ahead'
      : 'Listening · generating accompaniment',
  );
  try {
    let audio, evidence;
    if (lookahead) {
      const current = lookahead;
      plan = await current.plan(manualBpm, phraseIndex ? bpm : null);
      if (own !== session || revision !== version || !running) return;
      phraseBpm = plan.bpm;
      evidence = plan.bars[0].evidence;
      log(
        `Preparing recording ${plan.startSeconds.toFixed(1)}s onward at ${plan.bpm} BPM.`,
      );
    } else {
      captured = await measureInput(state);
      audio = captured.audio;
      evidence = captured.evidence;
    }
    if (own !== session || revision !== version || !running) return;
    await sessionReady;
    if (own !== session || revision !== version || !running) return;
    if (!plan)
      state.generation = state.timing.request(ctx.currentTime, phraseEnd);
    const payload = {
      ...inputContext(evidence),
      audio,
      ...(plan
        ? { upcoming: plan.bars, tempoMode: 'manual', bpm: phraseBpm }
        : {
            live: liveContext(
              captured.recording,
              state,
              requestId,
              state.generation,
            ),
          }),
    };
    const res = await fetch('/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok)
      throw Error(
        res.status === 429
          ? 'Composer finishing the previous request.'
          : res.status === 409
            ? 'Listening session expired. Press Stop and Start.'
            : 'Composer connection failed.',
      );
    for await (const msg of readMusicStream(res.body)) {
      if (own !== session || revision !== version || !running) continue;
      if (msg.type === 'model-input') {
        trace = showModelInput(msg);
        if (captured) {
          acceptInput(state, captured, payload.musicalDirection);
          state.acceptedRequest = requestId;
        }
      }
      if (msg.type === 'model-update' && trace) {
        (trace.item.updates ||= []).push(msg.input);
        trace.input.textContent = JSON.stringify(
          { initial: trace.item.input, updates: trace.item.updates },
          null,
          2,
        );
      }
      if (msg.type === 'abc-delta' && trace) {
        trace.item.outputABC += msg.text;
        trace.output.textContent = trace.item.outputABC;
      }
      if (msg.type === 'diagnostic') {
        flushDiagnostics();
        lastDiagnostic = msg.id;
        log(`Saved input and composition: ${msg.id}`);
      }
      if (msg.type === 'error') {
        failed = true;
        scoreView.cancel('Composer: ' + msg.message);
        composerFailed(msg.message);
      }
      if (msg.type === 'session')
        recordDiagnostic({
          action: 'composer-session',
          threadId: msg.threadId,
          setupMs: msg.setupMs,
        });
      if (msg.type === 'status' || msg.type === 'notation-warning') {
        log(msg.message);
        if (msg.type === 'status') status(msg.message);
      }
      if (msg.type === 'bar') {
        const sampleStart = performance.now();
        let playable = msg.notes;
        audioMetrics.loading = true;
        if (plan) await band.prepare(playable);
        else {
          const prepared = await Promise.allSettled(
            playable.map((n) => band.prepare([n])),
          );
          playable = playable.filter(
            (n, i) => prepared[i].status === 'fulfilled',
          );
          const skipped = msg.notes.length - playable.length;
          state.skippedNotes += skipped;
          audioMetrics.failed += skipped;
          const failure = prepared.find((r) => r.status === 'rejected');
          if (failure) {
            audioMetrics.error =
              failure.reason?.message || 'Instrument sounds could not load';
            log(`Skipped ${skipped} notes: ${audioMetrics.error}`);
          } else if (playable.length) audioMetrics.error = null;
        }
        audioMetrics.loading = false;
        if (own !== session || revision !== version || !running) return;
        audioMetrics.sections++;
        const now = ctx.currentTime,
          tempo = plan?.bpm ?? manualBpm ?? msg.tempo ?? bpm,
          step = 60 / tempo;
        bpm = tempo;
        const anchor = plan
            ? nextBarAnchor(now, phraseEnd)
            : state.pulse.anchor(now, phraseEnd, tempo),
          gap = phraseEnd ? Math.max(0, anchor - phraseEnd) : 0;
        if (plan) {
          queue.push(
            ...lookahead.playBar(
              plan,
              msg.index,
              playable,
              inputNode,
              revision,
            ),
          );
          phraseEnd = lookahead.end;
        } else {
          const preparedSection = scheduleSection(
            band,
            playable.map((n) => ({
              ...n,
              sectionId: msg.sectionId,
              diagnosticId: lastDiagnostic,
            })),
            anchor,
            tempo,
            revision,
          );
          queue.push(...preparedSection.scheduled);
          audioMetrics.scheduled += preparedSection.scheduled.length;
          if (preparedSection.failed.length) {
            audioMetrics.failed += preparedSection.failed.length;
            audioMetrics.error = preparedSection.failed[0].error;
            log('Playback failed: ' + audioMetrics.error);
          }
          for (const event of preparedSection.scheduled)
            stage?.note(event, event.time, tempo);
          phraseEnd = anchor + msg.durationBeats * step;
          state.timing.observe((performance.now() - previousSectionAt) / 1000);
          previousSectionAt = performance.now();
        }
        received.push(...playable);
        // Keep notation continuous across response boundaries; bound only the display history.
        scoreView.appendBar(msg.abc);
        const timing = {
          action: 'bar-scheduled',
          sectionId: msg.sectionId,
          index: msg.index,
          anchor,
          gap,
          requestToScheduleMs: performance.now() - requestStarted,
          sampleMs: performance.now() - sampleStart,
          ...(state
            ? { latestInputAgeSeconds: now - state.lastEvidenceEnd }
            : {}),
          durationSeconds: msg.durationBeats * step,
        };
        recordDiagnostic(timing);
        if (trace) (trace.item.playback ||= []).push(timing);
        if (firstBar) {
          firstBar = false;
          $('latency').textContent =
            ((performance.now() - requestStarted) / 1000).toFixed(1) + ' s';
        }
        status(
          plan && !lookahead.started
            ? 'Preparing recording accompaniment…'
            : audioMetrics.error
              ? 'Audio problem · ' + audioMetrics.error
              : playable.length
                ? 'Accompaniment queued'
                : 'Band resting · composer returned rests',
        );
      }
      if (msg.type === 'done') {
        if (plan && lookahead.finished) {
          queue.push(...lookahead.startPlayback(inputNode));
          phraseEnd = lookahead.end;
          log(
            'Prepared accompaniment complete. Starting continuous recording playback.',
          );
        }
        completed = true;
        log(
          `${msg.sections} sections generated in ${(msg.elapsedMs / 1000).toFixed(1)} s.`,
        );
      }
    }
    if (own === session && revision === version) {
      lastPhrase = received;
      if (completed) phraseIndex++;
      if (!failed && !completed)
        throw Error(
          'Composer connection closed before completion. Retry composer to reconnect; already scheduled notes are preserved.',
        );
    }
  } catch (e) {
    if (e.name !== 'AbortError' && own === session) composerFailed(e.message);
  } finally {
    if (own === session) {
      busy = false;
      controller = null;
      if (state?.requestId === requestId) state.acceptedRequest = null;
    }
  }
}
function analyse() {
  if (!running) return;
  if (lookahead?.started && !busy && ctx.currentTime >= lookahead.end) {
    stop();
    status('Recording and accompaniment finished');
    return;
  }
  const now = ctx.currentTime,
    wave = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(wave);
  const rhythmWave = new Float32Array(rhythmAnalyser.fftSize);
  rhythmAnalyser.getFloatTimeDomainData(rhythmWave);
  const rms = Math.sqrt(
      rhythmWave.reduce((s, x) => s + x * x, 0) / rhythmWave.length,
    ),
    audible = rms > 0.003;
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (
    canvas.width !== Math.round(w * devicePixelRatio) ||
    canvas.height !== Math.round(h * devicePixelRatio)
  ) {
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    paint.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  paint.clearRect(0, 0, w, h);
  paint.strokeStyle = audible ? '#d6e5a9' : '#586149';
  paint.lineWidth = 1.4;
  paint.beginPath();
  for (let i = 0; i < w; i++) {
    const y = h / 2 + wave[Math.floor((i / w) * wave.length)] * h * 1.7;
    i ? paint.lineTo(i, y) : paint.moveTo(i, y);
  }
  paint.stroke();
  const out = new Float32Array(band.output.fftSize);
  band.output.getFloatTimeDomainData(out);
  const peak = Math.max(...out.map(Math.abs));
  $('audioHealth').textContent =
    `Audio: ${ctx.state} · input ${(rms * 100).toFixed(1)}% · band output ${(peak * 100).toFixed(1)}% · ${played.length} recent notes played`;
  reportAudio(peak);
  $('elapsed').textContent = new Date((now - startAt) * 1000)
    .toISOString()
    .slice(14, 19);
  if (audible) {
    lastSound = now;
    if (wasSilent) {
      wasSilent = false;
      status('Listening to your playing');
    }
  }
  if (!lookahead && now - lastSound > 2 && !wasSilent) {
    wasSilent = true;
    log(
      $('continuous').checked
        ? 'Input quiet. Continuing the band from its previous phrase.'
        : 'Input quiet. Letting the generated music finish.',
    );
  }

  const pitch = periodicPitch(wave, ctx.sampleRate);
  const detected = audible && pitch.note !== null && pitch.confidence > 0.65;
  $('chord').textContent = detected
    ? ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][
        pitch.note % 12
      ] +
      (Math.floor(pitch.note / 12) - 1)
    : '—';
  $('frequency').textContent = detected
    ? pitch.frequency.toFixed(1) + ' Hz'
    : '— Hz';
  $('confidence').textContent = detected
    ? Math.round(pitch.confidence * 100) +
      '% clarity · ' +
      (pitch.cents >= 0 ? '+' : '') +
      pitch.cents +
      ' cents'
    : 'Play a single clear note';
  $('tuningNeedle').style.left = detected
    ? Math.max(0, Math.min(100, 50 + pitch.cents)) + '%'
    : '50%';
  $('inputLevel').textContent =
    'INPUT ' +
    (rms > 0 ? Math.max(-96, 20 * Math.log10(rms)).toFixed(1) : '−∞') +
    ' dB';
  $('tempo').textContent = bpm;
  $('tempoSource').textContent =
    manualBpm === null ? 'Following input' : 'Manual tempo';
  $('queue').textContent = `${queue.length} notes queued`;
  if (
    !lookahead &&
    ctx.state === 'running' &&
    now - startAt < INITIAL_LISTEN_SECONDS
  )
    status(
      `Listening · ${Math.ceil(INITIAL_LISTEN_SECONDS - (now - startAt))} seconds before the band enters`,
    );
  if (
    !authBlocked &&
    !lookahead &&
    busy &&
    now - (liveState?.lastCheck || 0) >= INPUT_UPDATE_SECONDS
  )
    void updateLiveInput();
  if (
    !authBlocked &&
    (lookahead
      ? !lookahead.finished
      : canContinue(
          wasSilent,
          $('continuous').checked,
          audible ? 1 : 0,
          lastPhrase.length,
        )) &&
    (lookahead || now - startAt >= INITIAL_LISTEN_SECONDS) &&
    !busy &&
    now - lastRequest >= 1 &&
    (lookahead || liveState.timing.needsMusic(now, phraseEnd))
  )
    void compose();
}
function schedule() {
  if (!running || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  queue.sort((a, b) => a.time - b.time);
  while (queue.length && queue[0].time < now + 0.09) {
    const n = queue.shift();
    if (
      !enabledInstruments.has(n.instrument) ||
      n.version !== version ||
      (!n.scheduled && n.time < now - 0.2)
    ) {
      if (liveState) liveState.skippedNotes++;
      audioMetrics.failed++;
      recordDiagnostic({
        action: 'skipped',
        at: now,
        reason: 'late-or-invalidated',
        note: n,
      });
      continue;
    }
    try {
      if (!n.scheduled) {
        band.play(n, Math.max(n.time, now + 0.005), n.tempo || bpm);
        audioMetrics.scheduled++;
        stage?.note(n, Math.max(n.time, now + 0.005), n.tempo || bpm);
      }
      audioMetrics.played++;
      audioMetrics.expectedUntil = Math.max(
        audioMetrics.expectedUntil,
        n.time + (n.duration * 60) / (n.tempo || bpm),
      );
      if (liveState) liveState.lastPlayedSection = n.sectionId;
      recordDiagnostic({ action: 'played', at: now, note: n });
      played.push(n);
      played = played.slice(-24);
      const own = session;
      setTimeout(
        () => {
          if (own !== session) return;
          $(n.instrument + 'Activity').classList.add('lit');
          setTimeout(
            () => $(n.instrument + 'Activity').classList.remove('lit'),
            100,
          );
        },
        Math.max(0, (n.time - now) * 1000),
      );
    } catch (e) {
      audioMetrics.failed++;
      audioMetrics.error = e.message;
      log('Playback failed: ' + e.message);
      status('Audio problem · ' + e.message);
    }
  }
}
async function start() {
  authBlocked = false;
  composerError = null;
  $('retryComposer').hidden = true;
  starting = true;
  resetAudioMetrics();
  syncTransport();
  status('Getting ready…');
  const own = ++session;
  try {
    if (!$('manualTempo').checkValidity())
      throw Error('Choose a session tempo between 45 and 200 BPM.');
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      band = new Band(ctx);
      watchAudioContext();
    }
    band.setVolume(Number($('bandVolume').value) / 100);
    for (const name of Object.values(instruments))
      band.setLevel(name, Number($(name).value) / 100);
    await ctx.resume();
    if (own !== session) return;
    $('sampleRate').textContent = ctx.sampleRate / 1000 + ' kHz / STEREO';
    void band.preload([...enabledInstruments]).catch((e) => log(e.message));
    analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0.15;
    rhythmAnalyser = ctx.createAnalyser();
    rhythmAnalyser.fftSize = 1024;
    // Keep microphone analysis in an actively rendered graph without monitoring it.
    inputSink = ctx.createGain();
    inputSink.gain.value = 0;
    analyser.connect(inputSink).connect(ctx.destination);
    const source = $('source').value;
    if (source === 'file') {
      if (!$('file').files[0]) throw Error('Choose an audio recording first.');
      status('Decoding recording for lookahead…');
      const buffer = await ctx.decodeAudioData(
        await $('file').files[0].arrayBuffer(),
      );
      if (own !== session) return;
      lookahead = new RecordingLookahead(ctx, buffer);
      $('recording').hidden = true;
      inputNode = ctx.createGain();
      inputNode.connect(analyser);
      inputNode.connect(ctx.destination);
      log(
        'Preparing the recording accompaniment before continuous playback. ABC appears as it arrives; audio starts when the recording is ready.',
      );
    } else {
      const requestedStream =
        source === 'tab'
          ? await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true,
            })
          : await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              },
            });
      if (own !== session) {
        requestedStream.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = requestedStream;
      // Opening the microphone can interrupt the output context on some browsers.
      await resumeAudio();
      if (own !== session) {
        requestedStream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!stream.getAudioTracks().length)
        throw Error(
          'No audio was shared. Select a browser tab and enable Share tab audio.',
        );
      inputNode = ctx.createMediaStreamSource(stream);
      inputNode.connect(analyser);
      stream.getAudioTracks()[0].onended = stop;
    }
    await ctx.audioWorklet.addModule('/capture.mjs');
    if (own !== session) return;
    capture = new AudioWorkletNode(ctx, 'original-input', {
      channelCountMode: 'max',
    });
    inputNode.connect(capture);
    capture.connect(inputSink);
    inputNode.connect(rhythmAnalyser);
    rhythmAnalyser.connect(inputSink);
    if (own !== session) return;
    flowId = crypto.randomUUID();
    const startingFlow = flowId;
    sessionReady = sessionClosing.then(() => connectComposer(startingFlow));
    void sessionReady.catch((e) => {
      if (own === session) composerFailed(e.message);
    });
    liveState = lookahead ? null : newLiveState();
    starting = false;
    running = true;
    syncTransport();
    startAt = lastSound = ctx.currentTime;
    phraseEnd = 0;
    phraseIndex = 0;
    lastPhrase = [];
    queue = [];
    played = [];
    lastRequest = 0;
    wasSilent = true;
    busy = false;
    manualBpm = $('manualTempo').value.trim()
      ? Number($('manualTempo').value)
      : null;
    bpm = manualBpm ?? 100;
    $('manualTempo').disabled = true;
    version++;
    scoreView.reset();
    lastDiagnostic = null;
    diagnosticEvents = [];
    $('stop').disabled = false;
    $('source').disabled = true;
    $('liveDot').classList.add('on');
    status(
      lookahead
        ? 'Preparing recording…'
        : `Listening · play for ${INITIAL_LISTEN_SECONDS} seconds`,
    );
    log(
      'Listening started. The composer receives measured pitch and rhythm evidence. Each generated bar plays as it arrives.',
    );
    frameTimer = setInterval(analyse, 50);
    scheduleTimer = setInterval(schedule, 20);
  } catch (e) {
    if (own === session) {
      log(e.message);
      stop();
      status(e.message);
    }
  }
}
function stop() {
  composerError = null;
  $('retryComposer').hidden = true;
  $('enableAudio').hidden = true;
  starting = false;
  clearTimeout(auditionTimer);
  auditioning = false;
  $('soundcheck').disabled = false;
  lookahead?.stop();
  lookahead = null;
  const endingFlow = flowId;
  flowId = null;
  if (endingFlow)
    sessionClosing = sessionReady
      .catch(() => {})
      .then(() =>
        fetch('/session/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: endingFlow }),
          keepalive: true,
        }),
      )
      .catch(() => {});
  recordDiagnostic({ action: 'stop', at: ctx?.currentTime });
  flushDiagnostics();
  session++;
  running = false;
  invalidate();
  clearInterval(frameTimer);
  clearInterval(scheduleTimer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  inputNode?.disconnect();
  analyser?.disconnect();
  rhythmAnalyser?.disconnect();
  capture?.disconnect();
  inputSink?.disconnect();
  $('recording').pause();
  busy = false;
  $('start').disabled = false;
  $('stop').disabled = true;
  $('source').disabled = false;
  $('manualTempo').disabled = false;
  $('liveDot').classList.remove('on');
  $('queue').textContent = 'No notes queued';
  $('chord').textContent = '—';
  $('frequency').textContent = '— Hz';
  $('confidence').textContent = 'Play a single clear note';
  $('inputLevel').textContent = 'INPUT — dB';
  $('tuningNeedle').style.left = '50%';
  $('audioHealth').textContent = 'Audio ready';
  drawIdleWave();
  for (const n of Object.values(instruments))
    $(n + 'Activity').classList.remove('lit');
  status('Session stopped');
  syncTransport();
}
$('start').onclick = () => {
  if (starting || running || auditioning || previewing) {
    stop();
    return;
  }
  $('instrumentMenu').open = false;
  $('settingsMenu').open = false;
  if ($('source').value === 'demo') $('soundcheck').click();
  else if ($('source').value === 'file' && !$('file').files[0]) {
    status('Choose a recording, then press Start.');
    $('file').click();
  } else void start();
};
$('stop').onclick = stop;
$('previewAnimations').onclick = () => {
  if (starting || running || auditioning) stop();
  $('instrumentMenu').open = false;
  $('settingsMenu').open = false;
  stage?.preview();
};
$('file').onchange = () => {
  if ($('file').files[0]) {
    log('Recording selected. Press Start to begin playback.');
    status('Recording ready · press Start');
  }
};
$('source').onchange = () => {
  $('recording').hidden = true;
  $('hint').textContent =
    $('source').value === 'file'
      ? 'Prepare accompaniment before playing your recording.'
      : $('source').value === 'demo'
        ? 'Hear a short preview with your selected instruments.'
        : 'Use headphones for a clean input.';
};
for (const id of ['instrumentMenu', 'settingsMenu'])
  $(id)
    .querySelector('summary')
    .addEventListener('click', () => {
      $(id === 'instrumentMenu' ? 'settingsMenu' : 'instrumentMenu').open =
        false;
    });
for (const id of ['instrumentMenu', 'settingsMenu'])
  $(id).addEventListener('toggle', () => {
    if ($(id).open)
      $(id === 'instrumentMenu' ? 'settingsMenu' : 'instrumentMenu').open =
        false;
  });
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.dock') && !e.target.closest('.doodle')) {
    $('instrumentMenu').open = false;
    $('settingsMenu').open = false;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('instrumentMenu').open = false;
    $('settingsMenu').open = false;
  }
});
$('recording').onended = () => {
  log('Recording finished. Letting the fresh accompaniment finish.');
};
$('recording').onseeking = () => {
  if (running) {
    invalidate();
  }
};
for (const name of Object.values(instruments))
  $(name).oninput = () => {
    if (band) band.setLevel(name, Number($(name).value) / 100);
  };
$('export').onclick = () => {
  const blob = new Blob(
      [
        JSON.stringify(
          {
            ...providerInfo,
            logs,
            instructions: $('modelInstructions').textContent,
            modelTurns,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = 'find-the-beat-session.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
fetch('/health')
  .then((r) => r.json())
  .then((d) => {
    providerInfo = d;
    diagnosticsEnabled = d.diagnostics === true;
    $('model').textContent = d.model + ' · ' + d.provider;
    $('connection').classList.add('on');
  })
  .catch(() => {
    $('model').textContent = 'Local composer offline';
  });
window.addEventListener('pagehide', stop);

$('soundcheck').onclick = async () => {
  if (starting || running || auditioning) return;
  const own = ++session;
  auditioning = true;
  $('soundcheck').disabled = true;
  $('start').disabled = true;
  $('source').disabled = true;
  $('stop').disabled = false;
  syncTransport();
  status('Loading band preview…');
  try {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      band = new Band(ctx);
      watchAudioContext();
    }
    band.setVolume(Number($('bandVolume').value) / 100);
    await ctx.resume();
    for (const name of enabledInstruments)
      band.setLevel(name, Number($(name).value) / 100);
    const notes = [];
    const previewTempo = 100;
    for (const instrument of enabledInstruments) {
      for (let beat = 0; beat < 8; beat++) {
        if (instrument === 'drums') {
          notes.push(
            {
              instrument,
              note: beat % 2 ? 38 : 36,
              beat,
              duration: 0.25,
              velocity: 0.65,
            },
            {
              instrument,
              note: 42,
              beat: beat + 0.5,
              duration: 0.2,
              velocity: 0.35,
            },
          );
        } else if (instrument === 'bass')
          notes.push({
            instrument,
            note: [45, 45, 52, 43, 41, 41, 48, 43][beat],
            beat,
            duration: 0.8,
            velocity: 0.65,
          });
        else if (['keys', 'piano', 'organ', 'strings'].includes(instrument)) {
          if (beat % 2 === 0)
            for (const note of beat < 4 ? [57, 60, 64] : [53, 57, 60])
              notes.push({
                instrument,
                note,
                beat,
                duration: 1.7,
                velocity: 0.4,
              });
        } else
          notes.push({
            instrument,
            note: [64, 67, 69, 72, 69, 67, 64, 60][beat],
            beat,
            duration: 0.7,
            velocity: 0.5,
          });
      }
    }
    await band.prepare(notes);
    if (own !== session || !auditioning) return;
    const anchor = ctx.currentTime + 0.12;
    for (const note of notes) {
      const at = anchor + (note.beat * 60) / previewTempo;
      band.play(note, at, previewTempo);
      stage?.note(note, at, previewTempo);
    }
    status('Band audition · A minor');
    $('audioHealth').textContent = 'Playing selected instruments';
    $('sampleRate').textContent = ctx.sampleRate / 1000 + ' kHz / STEREO';
    auditionTimer = setTimeout(() => {
      if (own === session) stop();
    }, 5600);
  } catch (e) {
    if (own === session) {
      stop();
      status(e.message);
    }
  }
};

function drawIdleWave() {
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  canvas.width = Math.round(w * devicePixelRatio);
  canvas.height = Math.round(h * devicePixelRatio);
  paint.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  paint.clearRect(0, 0, w, h);
  paint.strokeStyle = '#586149';
  paint.lineWidth = 1;
  paint.beginPath();
  paint.moveTo(0, h / 2);
  paint.lineTo(w, h / 2);
  paint.stroke();
}
new ResizeObserver(() => {
  if (!running) drawIdleWave();
}).observe(canvas);
$('chooseFile').onclick = () => {
  if (starting || running || auditioning) stop();
  $('source').value = 'file';
  $('source').dispatchEvent(new Event('change'));
  $('file').click();
};
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) {
    status('Full screen unavailable');
  }
};
document.addEventListener('keydown', (e) => {
  if (
    e.code === 'Space' &&
    !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(
      document.activeElement.tagName,
    )
  ) {
    e.preventDefault();
    if (starting || running || auditioning || previewing) stop();
    else $('start').click();
  }
});
