import test from 'node:test';
import assert from 'node:assert/strict';
import { mapRemoteSong, normalizeSongs } from './api.js';

test('maps Supabase song rows to the local song shape', () => {
  assert.deepEqual(mapRemoteSong({
    id: 'song-id',
    title: 'Careless Whisper',
    artist: 'George Michael / Wham!',
    song_key: 'Dm',
    tempo: '76 BPM',
    structure: 'Intro',
    progression: 'Dm - Bbmaj7',
    tabs: [{ title: 'Sax riff', tab: 'G|--10--|' }],
    lyrics: '',
    notes: 'Saxo en Dm.',
    sort_order: 3,
    song_meta: {
      is_favorite: true,
      status: 'ready'
    }
  }), {
    id: 'song-id',
    title: 'Careless Whisper',
    artist: 'George Michael / Wham!',
    key: 'Dm',
    tempo: '76 BPM',
    structure: 'Intro',
    progression: 'Dm - Bbmaj7',
    tabs: [{ title: 'Sax riff', tab: 'G|--10--|' }],
    lyrics: '',
    notes: 'Saxo en Dm.',
    sortOrder: 3,
    meta: {
      isFavorite: true,
      status: 'ready'
    }
  });
});

test('normalizes local fallback songs with generated ids and sort order', () => {
  assert.deepEqual(normalizeSongs([
    {
      title: 'Song A',
      artist: 'Artist A',
      key: 'C',
      tempo: '',
      structure: '',
      progression: '',
      tabs: [],
      lyrics: '',
      notes: ''
    }
  ]), [{
    id: 'local-0',
    title: 'Song A',
    artist: 'Artist A',
    key: 'C',
    tempo: '',
    structure: '',
    progression: '',
    tabs: [],
    lyrics: '',
    notes: '',
    sortOrder: 0,
    meta: {
      isFavorite: false,
      status: 'pending'
    }
  }]);
});
