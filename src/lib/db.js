import { openDB } from 'idb';

const DB_NAME = 'setlist';
const DB_VERSION = 1;

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
    }
  });

  return _db;
}

// ── Songs ─────────────────────────────────────────────────────────────────────

export async function dbGetSongs() {
  const db = await getDB();
  const songs = await db.getAll('songs');
  return songs.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function dbPutSongs(songs) {
  const db = await getDB();
  const tx = db.transaction('songs', 'readwrite');
  await Promise.all(songs.map((s) => tx.store.put(s)));
  await tx.done;
}

export async function dbPutSong(song) {
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
  const db = await getDB();
  await db.put('comments', comment);
}

export async function dbPutComments(comments) {
  const db = await getDB();
  const tx = db.transaction('comments', 'readwrite');
  await Promise.all(comments.map((c) => tx.store.put(c)));
  await tx.done;
}

// ── Suggestions ───────────────────────────────────────────────────────────────

export async function dbPutSuggestions(suggestions) {
  const db = await getDB();
  const tx = db.transaction('suggestions', 'readwrite');
  await Promise.all(suggestions.map((s) => tx.store.put(s)));
  await tx.done;
}

export async function dbGetSuggestions() {
  const db = await getDB();
  const all = await db.getAll('suggestions');
  return all.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
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
