import { SONGS } from '../data/songs.js';
import { supabase } from './supabase.js';

const DEFAULT_META = {
  isFavorite: false,
  status: 'pending'
};

function optionalText(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeTabs(value) {
  return Array.isArray(value) ? value : [];
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
    meta: {
      isFavorite: Boolean(meta?.is_favorite),
      status: meta?.status || DEFAULT_META.status
    }
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
