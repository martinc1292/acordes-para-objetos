import { SONGS } from '../data/songs.js';
import { supabase } from './supabase.js';

const DEFAULT_META = {
  isFavorite: false,
  status: 'pending'
};
const VALID_STATUSES = new Set(['pending', 'rehearsing', 'ready']);
const VALID_COMMENT_COLORS = new Set(['yellow', 'pink', 'blue', 'green', 'orange']);
const COMMENT_COLUMNS = 'id,song_id,author,text,color,created_at';
const localComments = new Map();

function optionalText(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeTabs(value) {
  return Array.isArray(value) ? value : [];
}

function mapMeta(row) {
  return {
    isFavorite: Boolean(row?.is_favorite),
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
    meta: {
      ...DEFAULT_META,
      ...song.meta
    }
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

  if (typeof patch?.isFavorite === 'boolean') {
    normalized.is_favorite = patch.isFavorite;
  }

  if (VALID_STATUSES.has(patch?.status)) {
    normalized.status = patch.status;
  }

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

export async function getSongs() {
  if (!supabase) {
    return normalizeSongs(SONGS);
  }

  const { data, error } = await supabase
    .from('songs')
    .select(`
      id,
      title,
      artist,
      song_key,
      tempo,
      structure,
      progression,
      tabs,
      lyrics,
      notes,
      sort_order,
      song_meta (
        is_favorite,
        status
      )
    `)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data.map(mapRemoteSong);
}

export async function updateSongMeta(songId, patch, client = supabase) {
  const metaPatch = normalizeMetaPatch(patch);

  if (!client) {
    return mapMeta({
      is_favorite: metaPatch.is_favorite ?? DEFAULT_META.isFavorite,
      status: metaPatch.status ?? DEFAULT_META.status
    });
  }

  const { data, error } = await client
    .from('song_meta')
    .upsert({ song_id: songId, ...metaPatch }, { onConflict: 'song_id' })
    .select('is_favorite,status')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapMeta(data);
}

export async function getSongComments(songId, client = supabase) {
  if (!client) {
    return localComments.get(songId) ?? [];
  }

  const { data, error } = await client
    .from('comments')
    .select(COMMENT_COLUMNS)
    .eq('song_id', songId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data.map(mapRemoteComment);
}

export async function createSong(data, client = supabase) {
  if (!client) {
    throw new Error('Supabase no configurado.');
  }

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

  const { data: inserted, error } = await client
    .from('songs')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await client.from('song_meta').insert({ song_id: inserted.id });

  return inserted.id;
}

export async function updateSong(id, data, client = supabase) {
  if (!client) {
    throw new Error('Supabase no configurado.');
  }

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

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteSong(id, client = supabase) {
  if (!client) {
    throw new Error('Supabase no configurado.');
  }

  const { error } = await client.from('songs').delete().eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function addSongComment(songId, comment, client = supabase) {
  const input = normalizeCommentInput(comment);

  if (!input.text) {
    throw new Error('El comentario no puede estar vacío.');
  }

  if (!client) {
    const localComment = {
      id: `local-comment-${Date.now()}`,
      songId,
      author: input.author,
      text: input.text,
      color: input.color,
      createdAt: new Date().toISOString()
    };
    localComments.set(songId, [...(localComments.get(songId) ?? []), localComment]);
    return localComment;
  }

  const { data, error } = await client
    .from('comments')
    .insert({ song_id: songId, ...input })
    .select(COMMENT_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRemoteComment(data);
}

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

  if (!client) {
    return { id: `local-suggestion-${Date.now()}`, ...suggestion, status: 'pending' };
  }

  const { data: inserted, error } = await client
    .from('suggestions')
    .insert(suggestion)
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return inserted;
}

export async function getSuggestions(client = supabase) {
  if (!client) return [];

  const { data, error } = await client
    .from('suggestions')
    .select('id,title,artist,suggested_by,notes,status,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data.map((row) => ({
    id: row.id,
    title: optionalText(row.title),
    artist: optionalText(row.artist),
    suggestedBy: optionalText(row.suggested_by),
    notes: optionalText(row.notes),
    status: row.status,
    createdAt: row.created_at
  }));
}
