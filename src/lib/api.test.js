import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addSongComment,
  getSongComments,
  mapRemoteComment,
  mapRemoteSong,
  normalizeCommentInput,
  normalizeMetaPatch,
  normalizeSongs,
  updateSongMeta
} from './api.js';

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

test('normalizes song meta patches for Supabase columns', () => {
  assert.deepEqual(normalizeMetaPatch({ isFavorite: true, status: 'ready' }), {
    is_favorite: true,
    status: 'ready'
  });

  assert.deepEqual(normalizeMetaPatch({ isFavorite: false, status: 'unknown' }), {
    is_favorite: false
  });
});

test('normalizes and maps song comments', () => {
  assert.deepEqual(normalizeCommentInput({ author: '  Martin  ', text: '  Subir medio tono  ', color: 'pink' }), {
    author: 'Martin',
    text: 'Subir medio tono',
    color: 'pink'
  });

  assert.deepEqual(normalizeCommentInput({ author: '', text: 'Listo', color: 'purple' }), {
    author: 'Ensayo',
    text: 'Listo',
    color: 'yellow'
  });

  assert.deepEqual(mapRemoteComment({
    id: 'comment-1',
    song_id: 'song-1',
    author: 'Martin',
    text: 'Revisar intro',
    color: 'blue',
    created_at: '2026-05-22T15:00:00.000Z'
  }), {
    id: 'comment-1',
    songId: 'song-1',
    author: 'Martin',
    text: 'Revisar intro',
    color: 'blue',
    createdAt: '2026-05-22T15:00:00.000Z'
  });
});

test('updates song meta through Supabase and returns local shape', async () => {
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return {
        upsert(payload, options) {
          calls.push(['upsert', payload, options]);
          return {
            select(columns) {
              calls.push(['select', columns]);
              return {
                single: async () => ({
                  data: { is_favorite: true, status: 'rehearsing' },
                  error: null
                })
              };
            }
          };
        }
      };
    }
  };

  assert.deepEqual(await updateSongMeta('song-1', { isFavorite: true, status: 'rehearsing' }, client), {
    isFavorite: true,
    status: 'rehearsing'
  });
  assert.deepEqual(calls, [
    ['from', 'song_meta'],
    ['upsert', { song_id: 'song-1', is_favorite: true, status: 'rehearsing' }, { onConflict: 'song_id' }],
    ['select', 'is_favorite,status']
  ]);
});

test('lists and creates comments through Supabase', async () => {
  const calls = [];
  const rows = [{
    id: 'comment-1',
    song_id: 'song-1',
    author: 'Martin',
    text: 'Cierre en seco',
    color: 'green',
    created_at: '2026-05-22T15:00:00.000Z'
  }];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            eq(column, value) {
              calls.push(['eq', column, value]);
              return {
                order(column, options) {
                  calls.push(['order', column, options]);
                  return Promise.resolve({ data: rows, error: null });
                }
              };
            }
          };
        },
        insert(payload) {
          calls.push(['insert', payload]);
          return {
            select(columns) {
              calls.push(['insertSelect', columns]);
              return {
                single: async () => ({ data: rows[0], error: null })
              };
            }
          };
        }
      };
    }
  };

  assert.deepEqual(await getSongComments('song-1', client), [{
    id: 'comment-1',
    songId: 'song-1',
    author: 'Martin',
    text: 'Cierre en seco',
    color: 'green',
    createdAt: '2026-05-22T15:00:00.000Z'
  }]);
  assert.deepEqual(await addSongComment('song-1', {
    author: ' Martin ',
    text: ' Cierre en seco ',
    color: 'green'
  }, client), {
    id: 'comment-1',
    songId: 'song-1',
    author: 'Martin',
    text: 'Cierre en seco',
    color: 'green',
    createdAt: '2026-05-22T15:00:00.000Z'
  });
  assert.deepEqual(calls, [
    ['from', 'comments'],
    ['select', 'id,song_id,author,text,color,created_at'],
    ['eq', 'song_id', 'song-1'],
    ['order', 'created_at', { ascending: true }],
    ['from', 'comments'],
    ['insert', { song_id: 'song-1', author: 'Martin', text: 'Cierre en seco', color: 'green' }],
    ['insertSelect', 'id,song_id,author,text,color,created_at']
  ]);
});
