import { CHORD_REGEX, SINGLE_CHORD_REGEX } from './chords.js';

export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_INDEX = {
  C: 0, 'C#': 1, Db: 1,
  D: 2, 'D#': 3, Eb: 3,
  E: 4, Fb: 4, 'E#': 5,
  F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10,
  B: 11, Cb: 11, 'B#': 0
};

function noteToIndex(note) {
  return Object.prototype.hasOwnProperty.call(NOTE_INDEX, note) ? NOTE_INDEX[note] : null;
}

function indexToNote(index, preferFlats) {
  const normalized = ((index % 12) + 12) % 12;
  return preferFlats ? NOTES_FLAT[normalized] : NOTES_SHARP[normalized];
}

function resolvePreferFlats(rootRaw, explicit) {
  if (explicit === undefined) return /b$/.test(rootRaw);
  return Boolean(explicit);
}

function shiftRoot(rootRaw, semitones, explicitPreferFlats) {
  const index = noteToIndex(rootRaw);
  if (index === null) return null;
  return indexToNote(index + semitones, resolvePreferFlats(rootRaw, explicitPreferFlats));
}

function buildTransposed(rootRaw, suffix, bassPart, semitones, explicitPreferFlats) {
  const newRoot = shiftRoot(rootRaw, semitones, explicitPreferFlats);
  if (newRoot === null) return null;
  let result = newRoot + (suffix || '');
  if (bassPart) {
    const bassRaw = bassPart.slice(1);
    const newBass = shiftRoot(bassRaw, semitones, explicitPreferFlats);
    result += '/' + (newBass ?? bassRaw);
  }
  return result;
}

export function transposeNote(input, semitones, preferFlats) {
  if (typeof input !== 'string' || !input) return null;
  const match = SINGLE_CHORD_REGEX.exec(input);
  if (!match) return null;
  const [, rootRaw, suffix, bassPart] = match;
  return buildTransposed(rootRaw, suffix, bassPart, semitones, preferFlats);
}

function isTabLine(line) {
  return /^\s*[a-gA-G]\|[-\d]/.test(line);
}

function transposeChordLine(line, semitones, preferFlats) {
  CHORD_REGEX.lastIndex = 0;
  return line.replace(CHORD_REGEX, (match, rootRaw, suffix, bassPart) => {
    const transposed = buildTransposed(rootRaw, suffix, bassPart, semitones, preferFlats);
    return transposed ?? match;
  });
}

export function transposeText(text, semitones, preferFlats) {
  if (typeof text !== 'string' || !text) return '';
  return text
    .split('\n')
    .map((line) => (isTabLine(line) ? line : transposeChordLine(line, semitones, preferFlats)))
    .join('\n');
}
