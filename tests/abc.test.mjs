import test from 'node:test';
import assert from 'node:assert/strict';
import { parseComposition } from '../src/server/abc.mjs';
const header = 'X:1\nM:4/4\nL:1/4\nK:G\n';
test('ABC preserves key signatures, chords, ties and independent instrument voices', () => {
  const { notes } = parseComposition(
    header + 'V:piano\n[GBd]2 F2|G2-G2|z4|G4|\nV:bass\nG,4|D,4|E,4|G,4|',
    ['piano', 'bass'],
  );
  assert(notes.some((n) => n.note === 66));
  assert(notes.some((n) => n.beat === 4 && n.duration === 4));
  assert.equal(notes.filter((n) => n.instrument === 'bass').length, 4);
  assert.equal(
    notes.filter((n) => n.beat === 0 && n.instrument === 'piano').length,
    3,
  );
});
test('rejects unselected instruments and directives instead of substituting music', () => {
  assert.throws(() => parseComposition(header + 'V:flute\nG4|', ['piano']));
  assert.throws(() =>
    parseComposition(header + 'V:piano\n%%MIDI program 73\nG4|', ['piano']),
  );
  assert.throws(() => parseComposition('not a score', ['piano']));
});

test('repairs trailing sharp spelling and chord whitespace without altering key headers', () => {
  const score = parseComposition(
    'X:1\nM:4/4\nL:1/8\nK:Eb\nV:piano\n[D#GB]4 [G#B D#]4|',
    ['piano'],
    { bar: true },
  );
  assert(score.abc.includes('K:Eb'));
  assert(score.abc.includes('[^DGB]'));
  assert(score.abc.includes('[^GB^D]'));
  assert(score.notes.some((n) => n.note === 63));
});
