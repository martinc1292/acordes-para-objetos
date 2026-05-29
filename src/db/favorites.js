import { unwrap } from './_unwrap.js';

export async function getFavoriteSongIds(client, { bandId, userId }) {
  const rows = unwrap(await client
    .from('favorites')
    .select('song_id')
    .eq('band_id', bandId)
    .eq('user_id', userId)) ?? [];
  return rows.map((row) => row.song_id);
}

export async function addFavorite(client, { bandId, songId, userId }) {
  unwrap(await client
    .from('favorites')
    .insert({ band_id: bandId, song_id: songId, user_id: userId }));
}

export async function removeFavorite(client, { bandId, songId, userId }) {
  unwrap(await client
    .from('favorites')
    .delete()
    .eq('band_id', bandId)
    .eq('song_id', songId)
    .eq('user_id', userId));
}
