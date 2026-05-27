import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const songs = JSON.parse(readFileSync(join(here, 'songs.json'), 'utf8'));

describe('seeds/songs.json', () => {
  it('contains every song extracted from the legacy HTML', () => {
    assert.ok(songs.length >= 36, `expected at least 36 songs, got ${songs.length}`);
  });

  it('every song has the required shape', () => {
    for (const [index, song] of songs.entries()) {
      assert.equal(typeof song.title, 'string', `song[${index}].title`);
      assert.ok(song.title.length > 0, `song[${index}].title not empty`);
      assert.equal(typeof song.artist, 'string', `song[${index}].artist`);
      assert.equal(typeof song.key, 'string', `song[${index}].key`);
      assert.equal(typeof song.progression, 'string', `song[${index}].progression`);
      assert.ok(Array.isArray(song.tabs), `song[${index}].tabs is an array`);
      for (const [tabIndex, tab] of song.tabs.entries()) {
        assert.equal(typeof tab.title, 'string', `song[${index}].tabs[${tabIndex}].title`);
        assert.equal(typeof tab.tab, 'string', `song[${index}].tabs[${tabIndex}].tab`);
      }
    }
  });

  it('has no duplicate (title, artist) pairs', () => {
    const seen = new Set();
    for (const song of songs) {
      const key = `${song.title} :: ${song.artist}`;
      assert.equal(seen.has(key), false, `duplicate: ${key}`);
      seen.add(key);
    }
  });
});
