import { SONGS } from '../data/songs.js';
import { supabase } from './supabase.js';
import {
  dbCountPending,
  dbDeleteComment,
  dbDeletePending,
  dbEnqueue,
  dbGetChatMessages,
  dbGetComments,
  dbGetPending,
  dbGetSongs,
  dbGetSuggestions,
  dbPutChatMessage,
  dbPutChatMessages,
  dbPutComment,
  dbPutComments,
  dbPutMeta,
  dbPutSong,
  dbPutSongs,
  dbPutSuggestions
} from './db.js';

const DEFAULT_META = {
  isFavorite: false,
  status: 'pending'
};
const VALID_STATUSES = new Set(['pending', 'rehearsing', 'ready']);
const VALID_COMMENT_COLORS = new Set(['yellow', 'pink', 'blue', 'green', 'orange']);
const COMMENT_COLUMNS = 'id,song_id,author,text,color,created_at';

// ── Normalizers ───────────────────────────────────────────────────────────────

function optionalText(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeTabs(value) {
  return Array.isArray(value) ? value : [];
}

function mapMeta(row) {
  return {
    isFavorite: Boolean(row?.is_favorite ?? row?.isFavorite),
    status: VALID_STATUSES.has(row?.status) ? row.status : DEFAULT_META.status
  };
}

export function normalizeSongs(songs) {
  return songs.map((song, index) => ({
    id: song.id || `local-${index}`,
    title: optionalText(song.title),
    artist: optionalText(song.artist),
    key: optionalText(song.key),
    tempo: optionalText(song.tempo),
    structure: optionalText(song.structure),
    progression: optionalText(song.progression),
    tabs: normalizeTabs(song.tabs),
    lyrics: optionalText(song.lyrics),
    notes: optionalText(song.notes),
    sortOrder: Number.isInteger(song.sortOrder) ? song.sortOrder : index,
    meta: { ...DEFAULT_META, ...song.meta }
  }));
}

export function mapRemoteSong(row) {
  const meta = Array.isArray(row.song_meta) ? row.song_meta[0] : row.song_meta;
  return {
    id: row.id,
    title: optionalText(row.title),
    artist: optionalText(row.artist),
    key: optionalText(row.song_key),
    tempo: optionalText(row.tempo),
    structure: optionalText(row.structure),
    progression: optionalText(row.progression),
    tabs: normalizeTabs(row.tabs),
    lyrics: optionalText(row.lyrics),
    notes: optionalText(row.notes),
    sortOrder: Number.isInteger(row.sort_order) ? row.sort_order : 0,
    meta: mapMeta(meta)
  };
}

export function normalizeMetaPatch(patch) {
  const normalized = {};
  if (typeof patch?.isFavorite === 'boolean') normalized.is_favorite = patch.isFavorite;
  if (VALID_STATUSES.has(patch?.status)) normalized.status = patch.status;
  return normalized;
}

export function normalizeCommentInput(comment) {
  const author = optionalText(comment?.author).trim();
  const text = optionalText(comment?.text).trim();
  const color = optionalText(comment?.color).trim();
  return {
    author: author || 'Ensayo',
    text,
    color: VALID_COMMENT_COLORS.has(color) ? color : 'yellow'
  };
}

export function mapRemoteComment(row) {
  return {
    id: row.id,
    songId: row.song_id,
    author: optionalText(row.author),
    text: optionalText(row.text),
    color: VALID_COMMENT_COLORS.has(row.color) ? row.color : 'yellow',
    createdAt: optionalText(row.created_at)
  };
}

// ── getSongs — local-first ────────────────────────────────────────────────────

export async function getSongs() {
  if (!supabase) return normalizeSongs(SONGS);

  // 1. Lee IDB inmediatamente
  const cached = await dbGetSongs();
  if (cached.length > 0) {
    // 2. Fetch remoto en paralelo; actualiza IDB en background
    fetchAndCacheSongs().catch(() => {});
    return cached;
  }

  // Sin caché: esperar red
  return fetchAndCacheSongs();
}

async function fetchAndCacheSongs() {
  const { data, error } = await supabase
    .from('songs')
    .select(`
      id, title, artist, song_key, tempo, structure, progression,
      tabs, lyrics, notes, sort_order,
      song_meta ( is_favorite, status )
    `)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);

  const songs = data.map(mapRemoteSong);
  await dbPutSongs(songs);
  return songs;
}

// ── syncFromRemote — fuerza sync completo desde Supabase ──────────────────────

export async function syncFromRemote() {
  if (!supabase) return;
  return fetchAndCacheSongs();
}

// ── updateSongMeta — local-first con cola ─────────────────────────────────────

export async function updateSongMeta(songId, patch, client = supabase) {
  const metaPatch = normalizeMetaPatch(patch);
  const normalized = mapMeta({
    is_favorite: metaPatch.is_favorite ?? DEFAULT_META.isFavorite,
    status: metaPatch.status ?? DEFAULT_META.status
  });

  // 1. Actualizar IDB inmediatamente
  await dbPutMeta(songId, normalized);

  if (!client) return normalized;

  try {
    const { data, error } = await client
      .from('song_meta')
      .upsert({ song_id: songId, ...metaPatch }, { onConflict: 'song_id' })
      .select('is_favorite,status')
      .single();

    if (error) throw new Error(error.message);
    const remote = mapMeta(data);
    await dbPutMeta(songId, remote);
    return remote;
  } catch {
    // Offline → encolar
    await dbEnqueue('update_meta', { songId, patch });
    return normalized;
  }
}

// ── getSongComments — local-first ─────────────────────────────────────────────

export async function getSongComments(songId, client = supabase) {
  if (!client) return dbGetComments(songId);

  // Lee IDB primero
  const cached = await dbGetComments(songId);

  if (cached.length > 0) {
    // Refresca en background
    fetchAndCacheComments(songId, client).catch(() => {});
    return cached;
  }

  // Sin caché: esperar red
  return fetchAndCacheComments(songId, client);
}

async function fetchAndCacheComments(songId, client) {
  const { data, error } = await client
    .from('comments')
    .select(COMMENT_COLUMNS)
    .eq('song_id', songId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  const comments = data.map(mapRemoteComment);
  await dbPutComments(comments);
  return comments;
}

// ── addSongComment — local-first con cola ─────────────────────────────────────

export async function addSongComment(songId, comment, client = supabase) {
  const input = normalizeCommentInput(comment);
  if (!input.text) throw new Error('El comentario no puede estar vacío.');

  const optimistic = {
    id: `local-${Date.now()}`,
    songId,
    author: input.author,
    text: input.text,
    color: input.color,
    createdAt: new Date().toISOString()
  };

  // 1. Guardar en IDB optimísticamente
  await dbPutComment(optimistic);

  if (!client) return optimistic;

  try {
    const { data, error } = await client
      .from('comments')
      .insert({ song_id: songId, ...input })
      .select(COMMENT_COLUMNS)
      .single();

    if (error) throw new Error(error.message);

    const persisted = mapRemoteComment(data);
    await dbPutComment(persisted);
    return persisted;
  } catch {
    // Offline → encolar
    await dbEnqueue('insert_comment', { songId, comment: input });
    return optimistic;
  }
}

// ── deleteSongComment ─────────────────────────────────────────────────────────

export async function deleteSongComment(commentId, client = supabase) {
  await dbDeleteComment(commentId);

  if (!client || commentId.startsWith('local-')) return;

  try {
    await client.from('comments').delete().eq('id', commentId);
  } catch {
    // best-effort
  }
}

// ── Chat global ───────────────────────────────────────────────────────────────

const CHAT_COLUMNS = 'id,author,text,created_at';

export function mapRemoteChatMessage(row) {
  return {
    id: row.id,
    author: optionalText(row.author),
    text: optionalText(row.text),
    createdAt: optionalText(row.created_at)
  };
}

export async function getChatMessages(client = supabase) {
  if (!client) return dbGetChatMessages();

  const cached = await dbGetChatMessages();

  const doFetch = async () => {
    const { data, error } = await client
      .from('chat_messages')
      .select(CHAT_COLUMNS)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    const msgs = data.map(mapRemoteChatMessage);
    await dbPutChatMessages(msgs);
    return msgs;
  };

  if (cached.length > 0) {
    doFetch().catch(() => {});
    return cached;
  }

  return doFetch();
}

export async function addChatMessage(data, client = supabase) {
  const author = optionalText(data.author).trim() || 'Anónimo';
  const text = optionalText(data.text).trim();
  if (!text) throw new Error('El mensaje no puede estar vacío.');

  const optimistic = {
    id: `local-chat-${Date.now()}`,
    author,
    text,
    createdAt: new Date().toISOString()
  };

  await dbPutChatMessage(optimistic);

  if (!client) return optimistic;

  try {
    const { data: inserted, error } = await client
      .from('chat_messages')
      .insert({ author, text })
      .select(CHAT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    const persisted = mapRemoteChatMessage(inserted);
    await dbPutChatMessage(persisted);
    return persisted;
  } catch {
    return optimistic;
  }
}

// ── addSuggestion — local-first con cola ─────────────────────────────────────

export async function addSuggestion(data, client = supabase) {
  const suggestion = {
    title: optionalText(data.title).trim(),
    artist: optionalText(data.artist).trim(),
    suggested_by: optionalText(data.suggestedBy).trim() || 'Banda',
    notes: optionalText(data.notes).trim()
  };

  if (!suggestion.title || !suggestion.artist) {
    throw new Error('Título y artista son obligatorios.');
  }

  const optimistic = {
    id: `local-suggestion-${Date.now()}`,
    title: suggestion.title,
    artist: suggestion.artist,
    suggestedBy: suggestion.suggested_by,
    notes: suggestion.notes,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  if (!client) {
    await dbEnqueue('insert_suggestion', suggestion);
    return optimistic;
  }

  try {
    const { data: inserted, error } = await client
      .from('suggestions')
      .insert(suggestion)
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    return inserted;
  } catch {
    await dbEnqueue('insert_suggestion', suggestion);
    return optimistic;
  }
}

// ── getSuggestions ────────────────────────────────────────────────────────────

export async function getSuggestions(client = supabase) {
  if (!client) return dbGetSuggestions();

  try {
    const { data, error } = await client
      .from('suggestions')
      .select('id,title,artist,suggested_by,notes,status,created_at')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const suggestions = data.map((row) => ({
      id: row.id,
      title: optionalText(row.title),
      artist: optionalText(row.artist),
      suggestedBy: optionalText(row.suggested_by),
      notes: optionalText(row.notes),
      status: row.status,
      createdAt: row.created_at
    }));

    await dbPutSuggestions(suggestions);
    return suggestions;
  } catch {
    return dbGetSuggestions();
  }
}

// ── Cola de pendientes ────────────────────────────────────────────────────────

export async function processPendingQueue(client = supabase) {
  if (!client || !navigator.onLine) return;

  const pending = await dbGetPending();
  for (const item of pending) {
    try {
      await dispatchPending(item, client);
      await dbDeletePending(item.id);
    } catch {
      // Deja el item en cola para el próximo intento
    }
  }
}

async function dispatchPending(item, client) {
  const { type, payload } = item;

  if (type === 'update_meta') {
    const metaPatch = normalizeMetaPatch(payload.patch);
    await client
      .from('song_meta')
      .upsert({ song_id: payload.songId, ...metaPatch }, { onConflict: 'song_id' });
  }

  if (type === 'insert_comment') {
    const { songId, comment } = payload;
    await client
      .from('comments')
      .insert({ song_id: songId, ...comment });
  }

  if (type === 'insert_suggestion') {
    await client.from('suggestions').insert(payload);
  }
}

export async function getPendingCount() {
  return dbCountPending();
}

// ── CRUD (admin) ──────────────────────────────────────────────────────────────

export async function createSong(data, client = supabase) {
  if (!client) throw new Error('Supabase no configurado.');

  const row = {
    title: optionalText(data.title).trim(),
    artist: optionalText(data.artist).trim(),
    song_key: optionalText(data.key).trim(),
    tempo: optionalText(data.tempo).trim(),
    structure: optionalText(data.structure).trim(),
    progression: optionalText(data.progression).trim(),
    tabs: normalizeTabs(data.tabs),
    lyrics: optionalText(data.lyrics).trim(),
    notes: optionalText(data.notes).trim(),
    sort_order: Number.isInteger(data.sortOrder) ? data.sortOrder : 0
  };

  const { data: inserted, error } = await client.from('songs').insert(row).select('id').single();
  if (error) throw new Error(error.message);

  await client.from('song_meta').insert({ song_id: inserted.id });
  return inserted.id;
}

export async function updateSong(id, data, client = supabase) {
  if (!client) throw new Error('Supabase no configurado.');

  const row = {};
  if (typeof data.title === 'string') row.title = data.title.trim();
  if (typeof data.artist === 'string') row.artist = data.artist.trim();
  if (typeof data.key === 'string') row.song_key = data.key.trim();
  if (typeof data.tempo === 'string') row.tempo = data.tempo.trim();
  if (typeof data.structure === 'string') row.structure = data.structure.trim();
  if (typeof data.progression === 'string') row.progression = data.progression.trim();
  if (Array.isArray(data.tabs)) row.tabs = data.tabs;
  if (typeof data.lyrics === 'string') row.lyrics = data.lyrics.trim();
  if (typeof data.notes === 'string') row.notes = data.notes.trim();
  if (Number.isInteger(data.sortOrder)) row.sort_order = data.sortOrder;

  const { error } = await client.from('songs').update(row).eq('id', id);
  if (error) throw new Error(error.message);

  // Actualizar IDB
  const cached = await dbGetSongs();
  const song = cached.find((s) => s.id === id);
  if (song) {
    const updated = { ...song, ...Object.fromEntries(
      Object.entries(row).map(([k, v]) => {
        const map = { song_key: 'key', sort_order: 'sortOrder' };
        return [map[k] ?? k, v];
      })
    )};
    await dbPutSong(updated);
  }
}

export async function deleteSong(id, client = supabase) {
  if (!client) throw new Error('Supabase no configurado.');

  const { error } = await client.from('songs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Realtime ──────────────────────────────────────────────────────────────────

export function subscribeToSongMeta(songId, onChange, client = supabase) {
  if (!client) return null;

  const channel = client
    .channel(`song-meta-${songId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'song_meta', filter: `song_id=eq.${songId}` },
      (payload) => {
        const row = payload.new ?? payload.old;
        const meta = mapMeta(row);
        dbPutMeta(songId, meta).catch(() => {});
        onChange(meta);
      }
    )
    .subscribe();

  return channel;
}

export function subscribeToComments(songId, onInsert, client = supabase) {
  if (!client) return null;

  const channel = client
    .channel(`comments-${songId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'comments', filter: `song_id=eq.${songId}` },
      (payload) => {
        const comment = mapRemoteComment(payload.new);
        dbPutComment(comment).catch(() => {});
        onInsert(comment);
      }
    )
    .subscribe();

  return channel;
}

export function unsubscribe(channel, client = supabase) {
  if (client && channel) client.removeChannel(channel);
}
