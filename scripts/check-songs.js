import { SONGS } from '../src/data/songs.js';

const REQUIRED_FIELDS = ['title', 'artist', 'key'];
const EXPECTED_SONG_COUNT = 37;

function fail(message) {
  console.error(`check:songs failed: ${message}`);
  process.exitCode = 1;
}

if (!Array.isArray(SONGS)) {
  fail('SONGS must be an array');
} else {
  if (SONGS.length !== EXPECTED_SONG_COUNT) {
    fail(`expected ${EXPECTED_SONG_COUNT} songs, found ${SONGS.length}`);
  }

  SONGS.forEach((song, index) => {
    const label = `song ${index + 1}`;

    REQUIRED_FIELDS.forEach((field) => {
      if (typeof song[field] !== 'string' || song[field].trim() === '') {
        fail(`${label} is missing required field "${field}"`);
      }
    });

    if (!Array.isArray(song.tabs)) {
      fail(`${label} "${song.title || '(untitled)'}" must have tabs as an array`);
    }
  });
}

if (process.exitCode) {
  process.exit();
}

console.log(`check:songs passed: ${SONGS.length} songs validated`);
