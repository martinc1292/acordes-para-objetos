import { atom } from 'nanostores';
import { getSongs } from '../db/songs.js';

export const $songs = atom([]);
export const $songsLoaded = atom(false);
export const $songsError = atom(null);

let _loadedBandId = null;

export function clearSongs() {
  $songs.set([]);
  $songsLoaded.set(false);
  $songsError.set(null);
  _loadedBandId = null;
}

export async function loadSongs(client, bandId) {
  if (_loadedBandId === bandId && $songsLoaded.get()) return;
  _loadedBandId = bandId;
  $songsLoaded.set(false);
  $songsError.set(null);
  try {
    const songs = await getSongs(client, { bandId });
    if (_loadedBandId !== bandId) return;
    $songs.set(songs);
    $songsLoaded.set(true);
  } catch (err) {
    if (_loadedBandId !== bandId) return;
    _loadedBandId = null; // let a retry re-run cleanly after a failure
    $songsError.set(err?.message || String(err) || 'Error al cargar canciones');
  }
}

export function patchSongInStore(songId, fields) {
  $songs.set($songs.get().map((s) => (s.id === songId ? { ...s, ...fields } : s)));
}

export function addSongToStore(song) {
  $songs.set([...$songs.get(), song]);
}

export function removeSongFromStore(songId) {
  $songs.set($songs.get().filter((s) => s.id !== songId));
}
