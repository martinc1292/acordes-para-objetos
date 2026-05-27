import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeChords, CHORD_REGEX } from './chords.js';

describe('CHORD_REGEX', () => {
  it('matches common chord shapes', () => {
    const samples = ['Em7', 'F#m', 'Cmaj7', 'D/F#', 'Bbmaj7', 'A7', 'G', 'C#m7b5'];
    for (const sample of samples) {
      assert.match(sample, new RegExp(`^${CHORD_REGEX.source}$`));
    }
  });

  it('does not match words that start with a chord letter', () => {
    const nonChords = ['Capo', 'Verse', 'Bridge', 'Hello', 'Apo', 'Drum'];
    for (const sample of nonChords) {
      assert.doesNotMatch(sample, new RegExp(`^${CHORD_REGEX.source}$`));
    }
  });
});

describe('tokenizeChords', () => {
  it('returns a single chord token for a bare chord', () => {
    assert.deepEqual(tokenizeChords('Em7'), [{ type: 'chord', value: 'Em7' }]);
  });

  it('splits a progression into alternating chord and text tokens', () => {
    assert.deepEqual(tokenizeChords('C - Am - F - G'), [
      { type: 'chord', value: 'C' },
      { type: 'text', value: ' - ' },
      { type: 'chord', value: 'Am' },
      { type: 'text', value: ' - ' },
      { type: 'chord', value: 'F' },
      { type: 'text', value: ' - ' },
      { type: 'chord', value: 'G' }
    ]);
  });

  it('detects sharps, sevenths, slash bass and complex extensions', () => {
    assert.deepEqual(tokenizeChords('F#m Cmaj7 D/F#'), [
      { type: 'chord', value: 'F#m' },
      { type: 'text', value: ' ' },
      { type: 'chord', value: 'Cmaj7' },
      { type: 'text', value: ' ' },
      { type: 'chord', value: 'D/F#' }
    ]);
  });

  it('detects half-diminished and altered chords', () => {
    assert.deepEqual(tokenizeChords('C#m7b5'), [
      { type: 'chord', value: 'C#m7b5' }
    ]);
  });

  it('keeps prose words as text and finds embedded chord', () => {
    assert.deepEqual(tokenizeChords('Capo en C'), [
      { type: 'text', value: 'Capo en ' },
      { type: 'chord', value: 'C' }
    ]);
  });

  it('returns the input as a single text token when no chords are present', () => {
    assert.deepEqual(tokenizeChords('Capo en traste 2'), [
      { type: 'text', value: 'Capo en traste 2' }
    ]);
  });

  it('returns an empty array for empty input', () => {
    assert.deepEqual(tokenizeChords(''), []);
    assert.deepEqual(tokenizeChords(null), []);
    assert.deepEqual(tokenizeChords(undefined), []);
  });

  it('handles consecutive chords without separators', () => {
    assert.deepEqual(tokenizeChords('Am-G-F-E'), [
      { type: 'chord', value: 'Am' },
      { type: 'text', value: '-' },
      { type: 'chord', value: 'G' },
      { type: 'text', value: '-' },
      { type: 'chord', value: 'F' },
      { type: 'text', value: '-' },
      { type: 'chord', value: 'E' }
    ]);
  });

  it('does not treat lowercase note-name letters as chords', () => {
    assert.deepEqual(tokenizeChords('a man on the moon'), [
      { type: 'text', value: 'a man on the moon' }
    ]);
  });
});
