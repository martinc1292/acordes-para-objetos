import { openDB } from 'idb';

const DB_NAME = 'setlist';
const DB_VERSION = 2;

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

export async function dbPutComments(comments, songId) {
  const db = await getDB();
  const tx = db.transaction('comments', 'readwrite');
  if (songId) {
    const existing = await tx.store.index('by_song').getAllKeys(songId);
    await Promise.all(existing.map((k) => tx.store.delete(k)));
  }
  await Promise.all(comments.map((c) => tx.store.put(c)));
  await tx.done;
}

export async function dbDeleteComment(id) {
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
  const db = await getDB();
  await db.put('chat_messages', msg);
}

export async function dbPutChatMessages(msgs) {
  const db = await getDB();
  const tx = db.transaction('chat_messages', 'readwrite');
  await tx.store.clear();
  await Promise.all(msgs.map((m) => tx.store.put(m)));
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

export async function dbDeleteSuggestion(id) {
  const db = await getDB();
  await db.delete('suggestions', id);
}

export async function dbDeleteChatMessage(id) {
  const db = await getDB();
  await db.delete('chat_messages', id);
}

export async function dbDeleteSong(id) {
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
