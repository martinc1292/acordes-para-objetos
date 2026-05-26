import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTES_SHARP,
  NOTES_FLAT,
  transposeNote,
  transposeText
} from './transpose.js';

describe('NOTES_SHARP / NOTES_FLAT', () => {
  it('expose 12 sharp note names starting at C', () => {
    assert.equal(NOTES_SHARP.length, 12);
    assert.deepEqual(NOTES_SHARP.slice(0, 3), ['C', 'C#', 'D']);
    assert.equal(NOTES_SHARP[11], 'B');
  });

  it('expose 12 flat note names starting at C', () => {
    assert.equal(NOTES_FLAT.length, 12);
    assert.deepEqual(NOTES_FLAT.slice(0, 3), ['C', 'Db', 'D']);
    assert.equal(NOTES_FLAT[11], 'B');
  });
});

describe('transposeNote', () => {
  it('shifts a natural note by N semitones using sharps by default', () => {
    assert.equal(transposeNote('C', 2), 'D');
    assert.equal(transposeNote('C', 1), 'C#');
    assert.equal(transposeNote('F', 1), 'F#');
  });

  it('uses flats when preferFlats is true', () => {
    assert.equal(transposeNote('C', 1, true), 'Db');
    assert.equal(transposeNote('F', 1, true), 'Gb');
  });

  it('wraps around the chromatic scale', () => {
    assert.equal(transposeNote('B', 1), 'C');
    assert.equal(transposeNote('A', 4), 'C#');
  });

  it('accepts flat notes as input', () => {
    assert.equal(transposeNote('Eb', 1), 'E');
    assert.equal(transposeNote('Bb', 2), 'C');
    assert.equal(transposeNote('Db', 2, true), 'Eb');
  });

  it('supports negative semitones', () => {
    assert.equal(transposeNote('D', -2), 'C');
    assert.equal(transposeNote('C', -1), 'B');
    assert.equal(transposeNote('C', -1, true), 'B');
  });

  it('preserves chord quality suffixes', () => {
    assert.equal(transposeNote('Am', 2), 'Bm');
    assert.equal(transposeNote('Cmaj7', 2), 'Dmaj7');
    assert.equal(transposeNote('F#m7', 1), 'Gm7');
    assert.equal(transposeNote('Dsus4', 2), 'Esus4');
    assert.equal(transposeNote('Cadd9', 5), 'Fadd9');
  });

  it('preserves slash bass notes', () => {
    assert.equal(transposeNote('G/B', 2), 'A/C#');
    assert.equal(transposeNote('C/E', 5), 'F/A');
    assert.equal(transposeNote('D/F#', 2, true), 'E/Ab');
  });

  it('returns the same chord when shifting by 0 or 12', () => {
    assert.equal(transposeNote('Cmaj7', 0), 'Cmaj7');
    assert.equal(transposeNote('Am', 12), 'Am');
    assert.equal(transposeNote('G/B', -12), 'G/B');
  });

  it('returns null for non-chord input', () => {
    assert.equal(transposeNote('', 2), null);
    assert.equal(transposeNote('Hello', 2), null);
    assert.equal(transposeNote(null, 2), null);
    assert.equal(transposeNote('H', 1), null);
  });
});

describe('transposeText', () => {
  it('transposes every chord token in a progression line', () => {
    assert.equal(
      transposeText('C - Am - F - G', 2),
      'D - Bm - G - A'
    );
  });

  it('respects preferFlats globally', () => {
    assert.equal(
      transposeText('C - F - G', 1, true),
      'Db - Gb - Ab'
    );
  });

  it('handles complex chords with extensions and slashes', () => {
    assert.equal(
      transposeText('Cmaj7 - G/B - Am7 - F#m7b5', 2),
      'Dmaj7 - A/C# - Bm7 - G#m7b5'
    );
  });

  it('does not touch numeric tab notation', () => {
    const tab = [
      'e|----------------------------------------|',
      'B|----------------------------------------|',
      'G|--10-7-5-3---5-3-2-0--------------------|',
      'D|-----------5---------5-3-2-0------------|',
      'A|----------------------------3-2-0-------|',
      'E|----------------------------------------|'
    ].join('\n');
    assert.equal(transposeText(tab, 2), tab);
  });

  it('leaves prose words untouched', () => {
    assert.equal(
      transposeText('Verse in C, then chorus in Am', 2),
      'Verse in D, then chorus in Bm'
    );
    assert.equal(
      transposeText('Capo en traste 2', 2),
      'Capo en traste 2'
    );
  });

  it('handles empty input gracefully', () => {
    assert.equal(transposeText('', 2), '');
    assert.equal(transposeText(null, 2), '');
    assert.equal(transposeText(undefined, 2), '');
  });

  it('round-trips when transposing up and down by the same amount', () => {
    const original = 'Cmaj7 - G/B - Am7 - F';
    assert.equal(transposeText(transposeText(original, 5), -5), original);
  });
});
