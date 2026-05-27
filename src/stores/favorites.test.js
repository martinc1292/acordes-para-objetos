import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  $favoriteSongIds,
  $favoritesLoaded,
  $favoritesError,
  addFavoriteToStore,
  clearFavorites,
  loadFavorites,
  removeFavoriteFromStore
} from './favorites.js';

function fakeSupabase(ids = ['s1'], error = null) {
  return {
    from() {
      const b = {
        select() { return b; },
        eq() { return b; },
        then(resolve) {
          if (error) return resolve({ data: null, error });
          return resolve({ data: ids.map((id) => ({ song_id: id })), error: null });
        }
      };
      return b;
    }
  };
}

describe('stores/favorites', () => {
  beforeEach(() => {
    clearFavorites();
  });

  it('loadFavorites fetches and populates favorite song ids', async () => {
    await loadFavorites(fakeSupabase(['s1', 's2']), { bandId: 'b1', userId: 'u1' });
    assert.deepEqual($favoriteSongIds.get(), ['s1', 's2']);
    assert.equal($favoritesLoaded.get(), true);
    assert.equal($favoritesError.get(), null);
  });

  it('loadFavorites is idempotent for the same band and user', async () => {
    let fetchCount = 0;
    const client = {
      from() {
        fetchCount += 1;
        const b = {
          select() { return b; },
          eq() { return b; },
          then(resolve) { return resolve({ data: [], error: null }); }
        };
        return b;
      }
    };
    await loadFavorites(client, { bandId: 'b1', userId: 'u1' });
    await loadFavorites(client, { bandId: 'b1', userId: 'u1' });
    assert.equal(fetchCount, 1);
  });

  it('loadFavorites re-fetches when the user changes', async () => {
    let fetchCount = 0;
    const client = {
      from() {
        fetchCount += 1;
        const b = {
          select() { return b; },
          eq() { return b; },
          then(resolve) { return resolve({ data: [], error: null }); }
        };
        return b;
      }
    };
    await loadFavorites(client, { bandId: 'b1', userId: 'u1' });
    await loadFavorites(client, { bandId: 'b1', userId: 'u2' });
    assert.equal(fetchCount, 2);
  });

  it('loadFavorites sets an error on failure', async () => {
    await loadFavorites(fakeSupabase([], { message: 'network error' }), { bandId: 'b1', userId: 'u1' });
    assert.equal($favoritesLoaded.get(), false);
    assert.ok($favoritesError.get()?.includes('network error'));
  });

  it('clearFavorites resets all state', async () => {
    await loadFavorites(fakeSupabase(['s1']), { bandId: 'b1', userId: 'u1' });
    clearFavorites();
    assert.deepEqual($favoriteSongIds.get(), []);
    assert.equal($favoritesLoaded.get(), false);
    assert.equal($favoritesError.get(), null);
  });

  it('addFavoriteToStore appends once and removeFavoriteFromStore removes by id', () => {
    addFavoriteToStore('s1');
    addFavoriteToStore('s1');
    addFavoriteToStore('s2');
    assert.deepEqual($favoriteSongIds.get(), ['s1', 's2']);
    removeFavoriteFromStore('s1');
    assert.deepEqual($favoriteSongIds.get(), ['s2']);
  });
});
