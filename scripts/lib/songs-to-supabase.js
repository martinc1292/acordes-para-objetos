function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeSongForSupabase(song, sortOrder) {
  return {
    title: text(song.title),
    artist: text(song.artist),
    song_key: text(song.key),
    tempo: text(song.tempo),
    structure: text(song.structure),
    progression: text(song.progression),
    tabs: Array.isArray(song.tabs) ? song.tabs : [],
    lyrics: text(song.lyrics),
    notes: text(song.notes),
    sort_order: sortOrder
  };
}

export function buildSongRows(songs) {
  return songs.map((song, index) => normalizeSongForSupabase(song, index));
}

export function buildMetaRows(insertedSongs) {
  return insertedSongs.map((song) => {
    if (!song.id) {
      throw new Error('Inserted song is missing id');
    }

    return { song_id: song.id };
  });
}
