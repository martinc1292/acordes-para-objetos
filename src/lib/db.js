import { openDB } from 'idb';

const DB_NAME = 'setlist';
const DB_VERSION = 3;

// Cuánto tiempo retener un tombstone antes de podarlo. Debe superar holgadamente
// la latencia de cualquier fetch en vuelo para que un refresh lento no pueda
// resucitar un registro recién borrado.
const TOMBSTONE_TTL_MS = 24 * 60 * 60 * 1000;

let _db = null;

export async function getDB() {
  if (_db) return _db;

  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('song_meta')) {
        db.createObjectStore('song_meta', { keyPath: 'songId' });
      }
      if (!db.objectStoreNames.contains('comments')) {
        const cs = db.createObjectStore('comments', { keyPath: 'id' });
        cs.createIndex('by_song', 'songId');
      }
      if (!db.objectStoreNames.contains('suggestions')) {
        db.createObjectStore('suggestions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pending_changes')) {
        db.createObjectStore('pending_changes', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('chat_messages')) {
        db.createObjectStore('chat_messages', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('tombstones')) {
        db.createObjectStore('tombstones', { keyPath: 'key' });
      }
    }
  });

  return _db;
}

// ── Tombstones ────────────────────────────────────────────────────────────────
// Registran IDs eliminados localmente. Un fetch remoto puede traer una fila que
// ya fue borrada — porque leyó Supabase antes de que el DELETE llegara, o porque
// una capa intermedia sirvió una respuesta vieja. Los dbPut* filtran tombstones
// antes de escribir, y dbFilterTombstoned filtra cualquier lista recién traída
// antes de devolverla a la UI.

function tombstoneKey(store, id) {
  return `${store}:${id}`;
}

export async function dbAddTombstone(store, id) {
  const db = await getDB();
  await db.put('tombstones', {
    key: tombstoneKey(store, id),
    store,
    id,
    createdAt: Date.now()
  });
}

async function dbGetTombstoneIds(store) {
  const db = await getDB();
  const all = await db.getAll('tombstones');
  const now = Date.now();
  return new Set(
    all
      .filter((t) => t.store === store && now - t.createdAt < TOMBSTONE_TTL_MS)
      .map((t) => t.id)
  );
}

// Filtra de una lista las filas cuyo id fue tombstoneado. Las funciones get*
// devuelven la respuesta de red directamente a la UI, así que sin esto una fila
// borrada reaparece aunque IndexedDB ya esté limpio.
export async function dbFilterTombstoned(store, rows) {
  const tombstoned = await dbGetTombstoneIds(store);
  return rows.filter((row) => !tombstoned.has(row.id));
}

export async function dbPruneTombstones() {
  const db = await getDB();
  const tx = db.transaction('tombstones', 'readwrite');
  const all = await tx.store.getAll();
  const now = Date.now();
  await Promise.all(
    all
      .filter((t) => now - t.createdAt >= TOMBSTONE_TTL_MS)
      .map((t) => tx.store.delete(t.key))
  );
  await tx.done;
}

// ── Songs ─────────────────────────────────────────────────────────────────────

export async function dbGetSongs() {
  const db = await getDB();
  const songs = await db.getAll('songs');
  return songs.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function dbPutSongs(songs) {
  const tombstoned = await dbGetTombstoneIds('songs');
  const db = await getDB();
  const tx = db.transaction('songs', 'readwrite');
  await tx.store.clear();
  await Promise.all(
    songs.filter((s) => !tombstoned.has(s.id)).map((s) => tx.store.put(s))
  );
  await tx.done;
}

export async function dbPutSong(song) {
  const tombstoned = await dbGetTombstoneIds('songs');
  if (tombstoned.has(song.id)) return;
  const db = await getDB();
  await db.put('songs', song);
}

// ── Song Meta ─────────────────────────────────────────────────────────────────

export async function dbGetMeta(songId) {
  const db = await getDB();
  return db.get('song_meta', songId);
}

export async function dbPutMeta(songId, meta) {
  const db = await getDB();
  await db.put('song_meta', { songId, ...meta });
}

// ── Comments ─────────────────────────────────────────────────────────────────

export async function dbGetComments(songId) {
  const db = await getDB();
  return db.getAllFromIndex('comments', 'by_song', songId);
}

export async function dbPutComment(comment) {
  const tombstoned = await dbGetTombstoneIds('comments');
  if (tombstoned.has(comment.id)) return;
  const db = await getDB();
  await db.put('comments', comment);
}

export async function dbPutComments(comments, songId) {
  const tombstoned = await dbGetTombstoneIds('comments');
  const db = await getDB();
  const tx = db.transaction('comments', 'readwrite');
  if (songId) {
    const existing = await tx.store.index('by_song').getAllKeys(songId);
    await Promise.all(existing.map((k) => tx.store.delete(k)));
  }
  await Promise.all(
    comments.filter((c) => !tombstoned.has(c.id)).map((c) => tx.store.put(c))
  );
  await tx.done;
}

export async function dbDeleteComment(id) {
  await dbAddTombstone('comments', id);
  const db = await getDB();
  await db.delete('comments', id);
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export async function dbGetChatMessages() {
  const db = await getDB();
  const all = await db.getAll('chat_messages');
  return all.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
}

export async function dbPutChatMessage(msg) {
  const tombstoned = await dbGetTombstoneIds('chat_messages');
  if (tombstoned.has(msg.id)) return;
  const db = await getDB();
  await db.put('chat_messages', msg);
}

export async function dbPutChatMessages(msgs) {
  const tombstoned = await dbGetTombstoneIds('chat_messages');
  const db = await getDB();
  const tx = db.transaction('chat_messages', 'readwrite');
  await tx.store.clear();
  await Promise.all(
    msgs.filter((m) => !tombstoned.has(m.id)).map((m) => tx.store.put(m))
  );
  await tx.done;
}

// ── Suggestions ───────────────────────────────────────────────────────────────

export async function dbPutSuggestions(suggestions) {
  const tombstoned = await dbGetTombstoneIds('suggestions');
  const db = await getDB();
  const tx = db.transaction('suggestions', 'readwrite');
  await tx.store.clear();
  await Promise.all(
    suggestions.filter((s) => !tombstoned.has(s.id)).map((s) => tx.store.put(s))
  );
  await tx.done;
}

export async function dbGetSuggestions() {
  const db = await getDB();
  const all = await db.getAll('suggestions');
  return all.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

export async function dbDeleteSuggestion(id) {
  await dbAddTombstone('suggestions', id);
  const db = await getDB();
  await db.delete('suggestions', id);
}

export async function dbDeleteChatMessage(id) {
  await dbAddTombstone('chat_messages', id);
  const db = await getDB();
  await db.delete('chat_messages', id);
}

export async function dbDeleteSong(id) {
  await dbAddTombstone('songs', id);
  const db = await getDB();
  await db.delete('songs', id);
}

// ── Pending changes ───────────────────────────────────────────────────────────

export async function dbEnqueue(type, payload) {
  const db = await getDB();
  return db.add('pending_changes', { type, payload, createdAt: new Date().toISOString() });
}

export async function dbGetPending() {
  const db = await getDB();
  return db.getAll('pending_changes');
}

export async function dbDeletePending(id) {
  const db = await getDB();
  await db.delete('pending_changes', id);
}

export async function dbCountPending() {
  const db = await getDB();
  return db.count('pending_changes');
}
