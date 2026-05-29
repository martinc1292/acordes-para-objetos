import { unwrap } from './_unwrap.js';

function mapSong(row) {
  return {
    id: row.id,
    bandId: row.band_id,
    title: row.title,
    artist: row.artist ?? null,
    key: row.key ?? null,
    tempo: row.tempo ?? null,
    structure: row.structure ?? null,
    progression: row.progression ?? null,
    lyrics: row.lyrics ?? null,
    notes: row.notes ?? null,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTab(row) {
  return {
    id: row.id,
    songId: row.song_id,
    bandId: row.band_id,
    title: row.title,
    content: row.content,
    position: row.position
  };
}

function mapSongWithTabs(row) {
  return {
    ...mapSong(row),
    tabs: (row.tabs ?? []).map(mapTab)
  };
}

function toSongPayload(fields) {
  const payload = {};
  const fieldMap = {
    title: 'title',
    artist: 'artist',
    key: 'key',
    tempo: 'tempo',
    structure: 'structure',
    progression: 'progression',
    lyrics: 'lyrics',
    notes: 'notes',
    sortOrder: 'sort_order',
    sort_order: 'sort_order'
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in fields && fields[key] !== undefined) {
      payload[column] = fields[key];
    }
  }

  return payload;
}

function toTabPayload(tab, index) {
  const payload = {
    title: tab.title,
    content: tab.content,
    position: tab.position ?? index
  };

  if (tab.id) payload.id = tab.id;
  return payload;
}

export async function getSongs(client, { bandId }) {
  const rows = unwrap(await client
    .from('songs')
    .select('*')
    .eq('band_id', bandId)
    .order('sort_order', { ascending: true })) ?? [];
  return rows.map(mapSong);
}

export async function getSongWithTabs(client, { songId, bandId }) {
  const row = unwrap(await client
    .from('songs')
    .select('*, tabs(id, song_id, band_id, title, content, position)')
    .eq('id', songId)
    .eq('band_id', bandId)
    .single());
  if (!row) return null;
  return mapSongWithTabs(row);
}

export async function saveSongWithTabs(client, { bandId, songId = null, fields, tabs = [] }) {
  const row = unwrap(await client.rpc('save_song_with_tabs', {
    p_band_id: bandId,
    p_song_id: songId,
    p_song: toSongPayload(fields),
    p_tabs: tabs.map(toTabPayload)
  }));
  return mapSongWithTabs(row);
}

export async function createSong(client, {
  bandId, title, artist, key, tempo, structure, progression, lyrics, notes, sortOrder = 0
}) {
  const row = unwrap(await client
    .from('songs')
    .insert({
      band_id: bandId,
      title,
      artist: artist || null,
      key: key || null,
      tempo: tempo || null,
      structure: structure || null,
      progression: progression || null,
      lyrics: lyrics || null,
      notes: notes || null,
      sort_order: sortOrder
    })
    .select()
    .single());
  return mapSong(row);
}

export async function updateSong(client, { songId, bandId, fields }) {
  const allowed = ['title', 'artist', 'key', 'tempo', 'structure', 'progression', 'lyrics', 'notes'];
  const payload = {};
  for (const k of allowed) {
    if (k in fields && fields[k] !== undefined) payload[k] = fields[k];
  }
  const row = unwrap(await client
    .from('songs')
    .update(payload)
    .eq('id', songId)
    .eq('band_id', bandId)
    .select()
    .single());
  return mapSong(row);
}

export async function deleteSong(client, { songId, bandId }) {
  unwrap(await client
    .from('songs')
    .delete()
    .eq('id', songId)
    .eq('band_id', bandId));
}

export async function updateSongStatus(client, { songId, bandId, status }) {
  const row = unwrap(await client
    .from('songs')
    .update({ status })
    .eq('id', songId)
    .eq('band_id', bandId)
    .select()
    .single());
  return mapSong(row);
}

export async function createTab(client, { songId, bandId, title, content, position }) {
  const row = unwrap(await client
    .from('tabs')
    .insert({ song_id: songId, band_id: bandId, title, content, position })
    .select()
    .single());
  return mapTab(row);
}

export async function updateTab(client, { tabId, songId, fields }) {
  const allowed = ['title', 'content', 'position'];
  const payload = {};
  for (const k of allowed) {
    if (k in fields && fields[k] !== undefined) payload[k] = fields[k];
  }
  const row = unwrap(await client
    .from('tabs')
    .update(payload)
    .eq('id', tabId)
    .eq('song_id', songId)
    .select()
    .single());
  return mapTab(row);
}

export async function deleteTab(client, { tabId, songId }) {
  unwrap(await client
    .from('tabs')
    .delete()
    .eq('id', tabId)
    .eq('song_id', songId));
}
