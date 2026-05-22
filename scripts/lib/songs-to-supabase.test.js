import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMetaRows,
  buildSongRows,
  planSongMigration,
  normalizeSongForSupabase
} from './songs-to-supabase.js';

test('normalizes local song fields to Supabase column names', () => {
  const row = normalizeSongForSupabase({
    title: '  Careless Whisper  ',
    artist: 'George Michael / Wham!',
    key: 'Dm',
    tempo: '76 BPM',
    structure: 'Intro -> Verse',
    progression: 'Dm - Bbmaj7 - Gm7 - A7',
    tabs: [{ title: 'Sax riff', tab: 'G|--10--|' }],
    lyrics: '',
    notes: 'Saxo en Dm.'
  }, 4);

  assert.deepEqual(row, {
    title: 'Careless Whisper',
    artist: 'George Michael / Wham!',
    song_key: 'Dm',
    tempo: '76 BPM',
    structure: 'Intro -> Verse',
    progression: 'Dm - Bbmaj7 - Gm7 - A7',
    tabs: [{ title: 'Sax riff', tab: 'G|--10--|' }],
    lyrics: '',
    notes: 'Saxo en Dm.',
    sort_order: 4
  });
});

test('builds ordered song rows from local songs', () => {
  const rows = buildSongRows([
    {
      title: 'A',
      artist: 'Artist A',
      key: 'C',
      tempo: '',
      structure: '',
      progression: '',
      tabs: [],
      lyrics: '',
      notes: ''
    },
    {
      title: 'B',
      artist: 'Artist B',
      key: 'G',
      tempo: '120 BPM',
      structure: '',
      progression: '',
      tabs: [],
      lyrics: '',
      notes: ''
    }
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].sort_order, 0);
  assert.equal(rows[1].sort_order, 1);
  assert.equal(rows[1].song_key, 'G');
});

test('builds one song_meta row per inserted song id', () => {
  assert.deepEqual(
    buildMetaRows([{ id: 'song-1' }, { id: 'song-2' }]),
    [{ song_id: 'song-1' }, { song_id: 'song-2' }]
  );
});

test('plans an insert only when the remote songs table is empty', () => {
  assert.deepEqual(planSongMigration({ existingSongCount: 0, localSongCount: 37 }), {
    shouldInsert: true,
    message: 'Ready to migrate 37 songs.'
  });

  assert.deepEqual(planSongMigration({ existingSongCount: 37, localSongCount: 37 }), {
    shouldInsert: false,
    message: 'Supabase already has 37 songs; skipping migration.'
  });
});
