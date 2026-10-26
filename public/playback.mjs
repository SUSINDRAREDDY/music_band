// Submit complete prepared sections to the audio clock. Browser timer throttling
// must not decide whether a note is heard.
export function scheduleSection(band, notes, anchor, tempo, version) {
  const scheduled = [],
    failed = [];
  for (const note of notes) {
    const event = {
      ...note,
      time: anchor + (note.beat * 60) / tempo,
      tempo,
      version,
      scheduled: true,
    };
    try {
      band.play(event, event.time, tempo);
      scheduled.push(event);
    } catch (error) {
      failed.push({ note, error: error.message });
    }
  }
  return { scheduled, failed };
}
export function audioStatus({
  state,
  muted,
  loading,
  peak,
  lastSignalAge,
  queued,
  hasSections,
  expectedSound,
  error,
}) {
  if (state !== 'running')
    return 'Audio paused by the browser · click Enable audio';
  if (muted) return 'Band muted · raise an instrument volume';
  if (peak >= 0.003 || lastSignalAge < 0.6) return 'Playing accompaniment';
  if (peak > 0.00001) return 'Band output is very quiet · raise Band volume';
  if (error) return 'Audio problem · ' + error;
  if (loading) return 'Loading instrument sounds…';
  if (expectedSound)
    return 'No band output detected · check Audio status in settings';
  if (queued) return 'Accompaniment queued · waiting for the next note';
  if (hasSections) return 'Band resting · waiting for the next notes';
  return null;
}
