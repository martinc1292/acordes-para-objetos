import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  $songs, $songsLoaded, $songsError,
  loadSongs, clearSongs,
  patchSongInStore, addSongToStore, removeSongFromStore
} from './songs.js';

const SONG = {
  id: 's1', bandId: 'b1', title: 'Careless Whisper', artist: 'George Michael',
  key: 'Dm', tempo: '76 BPM', structure: '', progression: 'Dm Bbmaj7',
  lyrics: '', notes: '', status: 'pending', sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
};

function fakeSupabase(songs = [SONG], error = null) {
  return {
    from() {
      const b = {
        select() { return b; },
        eq() { return b; },
        order() { return b; },
        then(resolve) {
          if (error) return resolve({ data: null, error });
          const rows = songs.map((s) => ({
            id: s.id, band_id: s.bandId, title: s.title, artist: s.artist,
            key: s.key, tempo: s.tempo, structure: s.structure,
            progression: s.progression, lyrics: s.lyrics, notes: s.notes,
            status: s.status, sort_order: s.sortOrder,
            created_at: s.createdAt, updated_at: s.updatedAt
          }));
          return resolve({ data: rows, error: null });
        }
      };
      return b;
    }
  };
}

describe('stores/songs', () => {
  beforeEach(() => {
    $songs.set([]);
    $songsLoaded.set(false);
    $songsError.set(null);
    clearSongs();
  });

  it('loadSongs fetches and populates $songs', async () => {
    await loadSongs(fakeSupabase([SONG]), 'b1');
    assert.equal($songs.get().length, 1);
    assert.equal($songs.get()[0].title, 'Careless Whisper');
    assert.equal($songsLoaded.get(), true);
    assert.equal($songsError.get(), null);
  });

  it('loadSongs idempotent: does not re-fetch for same bandId', async () => {
    let fetchCount = 0;
    const client = {
      from() {
        fetchCount += 1;
        const b = {
          select() { return b; }, eq() { return b; }, order() { return b; },
          then(resolve) { return resolve({ data: [], error: null }); }
        };
        return b;
      }
    };
    await loadSongs(client, 'b1');
    await loadSongs(client, 'b1');
    assert.equal(fetchCount, 1, 'should only fetch once for the same band');
  });

  it('loadSongs re-fetches when bandId changes', async () => {
    let fetchCount = 0;
    const client = {
      from() {
        fetchCount += 1;
        const b = {
          select() { return b; }, eq() { return b; }, order() { return b; },
          then(resolve) { return resolve({ data: [], error: null }); }
        };
        return b;
      }
    };
    await loadSongs(client, 'b1');
    await loadSongs(client, 'b2');
    assert.equal(fetchCount, 2);
  });

  it('loadSongs sets $songsError on failure and $songsLoaded stays false', async () => {
    await loadSongs(fakeSupabase([], { message: 'network error' }), 'b1');
    assert.equal($songsLoaded.get(), false);
    assert.ok($songsError.get()?.includes('network error'));
  });

  it('clearSongs resets all state and allows re-fetch for same bandId', async () => {
    await loadSongs(fakeSupabase([SONG]), 'b1');
    assert.equal($songsLoaded.get(), true);
    clearSongs();
    assert.deepEqual($songs.get(), []);
    assert.equal($songsLoaded.get(), false);
    let fetched = false;
    const client = {
      from() {
        fetched = true;
        const b = { select() { return b; }, eq() { return b; }, order() { return b; }, then(resolve) { return resolve({ data: [], error: null }); } };
        return b;
      }
    };
    await loadSongs(client, 'b1');
    assert.ok(fetched, 'should re-fetch after clearSongs');
  });

  it('patchSongInStore updates matching song, leaves others unchanged', () => {
    const s2 = { ...SONG, id: 's2', title: 'Other' };
    $songs.set([SONG, s2]);
    patchSongInStore('s1', { status: 'ready', title: 'Updated' });
    const songs = $songs.get();
    assert.equal(songs.find((s) => s.id === 's1').status, 'ready');
    assert.equal(songs.find((s) => s.id === 's1').title, 'Updated');
    assert.equal(songs.find((s) => s.id === 's2').title, 'Other');
  });

  it('addSongToStore appends song', () => {
    $songs.set([SONG]);
    const newSong = { ...SONG, id: 's2', title: 'New' };
    addSongToStore(newSong);
    assert.equal($songs.get().length, 2);
    assert.equal($songs.get()[1].id, 's2');
  });

  it('removeSongFromStore removes by id', () => {
    const s2 = { ...SONG, id: 's2' };
    $songs.set([SONG, s2]);
    removeSongFromStore('s1');
    assert.equal($songs.get().length, 1);
    assert.equal($songs.get()[0].id, 's2');
  });
});
