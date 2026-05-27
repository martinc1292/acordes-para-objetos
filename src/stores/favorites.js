import { atom } from 'nanostores';
import { getFavoriteSongIds } from '../db/favorites.js';

export const $favoriteSongIds = atom([]);
export const $favoritesLoaded = atom(false);
export const $favoritesError = atom(null);

let _loadedKey = null;

function keyFor(bandId, userId) {
  return bandId && userId ? `${bandId}:${userId}` : null;
}

export function clearFavorites() {
  $favoriteSongIds.set([]);
  $favoritesLoaded.set(false);
  $favoritesError.set(null);
  _loadedKey = null;
}

export async function loadFavorites(client, { bandId, userId }) {
  const key = keyFor(bandId, userId);
  if (!key || !client) {
    clearFavorites();
    return;
  }
  if (_loadedKey === key && $favoritesLoaded.get()) return;
  _loadedKey = key;
  $favoritesLoaded.set(false);
  $favoritesError.set(null);
  try {
    const ids = await getFavoriteSongIds(client, { bandId, userId });
    if (_loadedKey !== key) return;
    $favoriteSongIds.set(ids);
    $favoritesLoaded.set(true);
  } catch (err) {
    if (_loadedKey !== key) return;
    $favoritesError.set(err?.message || String(err) || 'Error al cargar favoritos');
  }
}

export function addFavoriteToStore(songId) {
  if (!songId) return;
  const ids = $favoriteSongIds.get();
  if (ids.includes(songId)) return;
  $favoriteSongIds.set([...ids, songId]);
}

export function removeFavoriteFromStore(songId) {
  $favoriteSongIds.set($favoriteSongIds.get().filter((id) => id !== songId));
}
