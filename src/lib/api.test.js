import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addSongComment,
  deleteSuggestion,
  getChatMessages,
  getSongComments,
  getSuggestions,
  mapRemoteComment,
  mapRemoteSong,
  normalizeCommentInput,
  normalizeMetaPatch,
  normalizeSongs,
  updateSong,
  updateSongMeta
} from './api.js';
import {
  dbDeleteChatMessage,
  dbDeleteComment,
  dbDeleteSuggestion,
  dbGetComments,
  dbGetChatMessages,
  dbGetSongs,
  dbGetSuggestions,
  dbPutChatMessages,
  dbPutComments,
  dbPutSongs,
  dbPutSuggestions
} from './db.js';

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

test('updates a song through Supabase and refreshes the local cache', async () => {
  await dbPutSongs([{
    id: 'song-update',
    title: 'Viejo titulo',
    artist: 'Banda',
    key: 'C',
    tempo: '80 bpm',
    structure: '',
    progression: '',
    tabs: [{ title: 'Intro', tab: 'e|--0--|' }],
    lyrics: '',
    notes: '',
    sortOrder: 2,
    meta: { isFavorite: false, status: 'pending' }
  }]);

  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return {
        update(payload) {
          calls.push(['update', payload]);
          return {
            eq: async (column, value) => {
              calls.push(['eq', column, value]);
              return { error: null };
            }
          };
        }
      };
    }
  };

  await updateSong('song-update', {
    title: '  Nuevo titulo  ',
    key: 'Am',
    lyrics: 'Letra nueva'
  }, client);

  const updated = (await dbGetSongs()).find((song) => song.id === 'song-update');
  assert.equal(updated.title, 'Nuevo titulo');
  assert.equal(updated.key, 'Am');
  assert.equal(updated.lyrics, 'Letra nueva');
  assert.deepEqual(updated.tabs, [{ title: 'Intro', tab: 'e|--0--|' }]);
  assert.deepEqual(calls, [
    ['from', 'songs'],
    ['update', { title: 'Nuevo titulo', song_key: 'Am', lyrics: 'Letra nueva' }],
    ['eq', 'id', 'song-update']
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

// Reproduce la race condition: tras borrar, un fetch en vuelo que leyó la fila
// ANTES del DELETE reescribe la caché. Sin tombstones la fila revive.

test('a stale background fetch cannot resurrect a deleted comment', async () => {
  const songId = 'song-race-comment';
  const stale = {
    id: 'comment-race',
    songId,
    author: 'Martin',
    text: 'Comentario viejo',
    color: 'blue',
    createdAt: '2026-05-22T15:00:00.000Z'
  };

  await dbPutComments([stale], songId);
  await dbDeleteComment('comment-race');
  assert.deepEqual(await dbGetComments(songId), []);

  // El fetch en background termina tarde y trae la fila ya borrada.
  await dbPutComments([stale], songId);
  assert.deepEqual(await dbGetComments(songId), [], 'comment must stay deleted');
});

test('a stale background fetch cannot resurrect a deleted suggestion', async () => {
  const stale = {
    id: 'suggestion-race',
    title: 'Sugerencia vieja',
    artist: 'Artista',
    suggestedBy: 'Banda',
    notes: '',
    status: 'pending',
    createdAt: '2026-05-22T15:00:00.000Z'
  };

  await dbPutSuggestions([stale]);
  await dbDeleteSuggestion('suggestion-race');
  assert.deepEqual(await dbGetSuggestions(), []);

  await dbPutSuggestions([stale]);
  assert.deepEqual(await dbGetSuggestions(), [], 'suggestion must stay deleted');
});

test('a stale background fetch cannot resurrect a deleted chat message', async () => {
  const stale = {
    id: 'chat-race',
    author: 'Martin',
    text: 'Mensaje viejo',
    createdAt: '2026-05-22T15:00:00.000Z'
  };

  await dbPutChatMessages([stale]);
  await dbDeleteChatMessage('chat-race');
  assert.deepEqual(await dbGetChatMessages(), []);

  await dbPutChatMessages([stale]);
  assert.deepEqual(await dbGetChatMessages(), [], 'chat message must stay deleted');
});

// Las funciones get* devuelven la respuesta de red directo a la UI. Si una capa
// intermedia (p. ej. el cache del Service Worker) sirve un listado viejo con la
// fila borrada, lo retornado debe filtrarla igual.

test('getSuggestions does not return a tombstoned row served by a stale source', async () => {
  const deletedRow = {
    id: 'suggestion-stale',
    title: 'Sugerencia borrada',
    artist: 'Artista',
    suggested_by: 'Banda',
    notes: '',
    status: 'pending',
    created_at: '2026-05-22T15:00:00.000Z'
  };
  // El cliente devuelve la fila borrada en ambas llamadas, como haría una
  // respuesta cacheada vieja.
  const client = {
    from() {
      return {
        select() {
          return {
            order: async () => ({ data: [deletedRow], error: null })
          };
        },
        delete() {
          return { eq: async () => ({ error: null }) };
        }
      };
    }
  };

  await deleteSuggestion('suggestion-stale', client);
  const result = await getSuggestions(client);
  assert.deepEqual(result, [], 'returned list must not include the deleted suggestion');
});

test('getChatMessages does not return a tombstoned message served by a stale source', async () => {
  const deletedRow = {
    id: 'chat-stale',
    author: 'Martin',
    text: 'Mensaje borrado',
    created_at: '2026-05-22T15:00:00.000Z'
  };
  const client = {
    from() {
      return {
        select() {
          return {
            order() {
              return { limit: async () => ({ data: [deletedRow], error: null }) };
            }
          };
        },
        delete() {
          return { eq: async () => ({ error: null }) };
        }
      };
    }
  };

  // Caché vacía → getChatMessages hace el fetch de red de forma síncrona.
  await dbPutChatMessages([]);
  await dbDeleteChatMessage('chat-stale');
  const result = await getChatMessages(client);
  assert.deepEqual(result, [], 'returned list must not include the deleted chat message');
});
