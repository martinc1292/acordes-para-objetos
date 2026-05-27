import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addFavorite, getFavoriteSongIds, removeFavorite } from './favorites.js';

function trackingBuilder(calls, data, error = null) {
  const b = {
    select(value) { calls.push(['select', value]); return b; },
    eq(column, value) { calls.push(['eq', column, value]); return b; },
    insert(payload) { calls.push(['insert', payload]); return b; },
    delete() { calls.push(['delete']); return b; },
    then(resolve) { calls.push(['then']); return Promise.resolve(resolve({ data, error })); }
  };
  return b;
}

function fakeClient(fromImpl) {
  return { from: fromImpl };
}

describe('favorites db wrappers', () => {
  it('getFavoriteSongIds queries favorites by band and user', async () => {
    const calls = [];
    const client = fakeClient((table) => {
      assert.equal(table, 'favorites');
      return trackingBuilder(calls, [{ song_id: 's1' }, { song_id: 's2' }]);
    });

    const ids = await getFavoriteSongIds(client, { bandId: 'b1', userId: 'u1' });

    assert.deepEqual(ids, ['s1', 's2']);
    assert.ok(calls.some(([op, value]) => op === 'select' && value === 'song_id'));
    assert.ok(calls.some(([op, column, value]) => op === 'eq' && column === 'band_id' && value === 'b1'));
    assert.ok(calls.some(([op, column, value]) => op === 'eq' && column === 'user_id' && value === 'u1'));
  });

  it('throws when Supabase returns an error', async () => {
    const client = fakeClient(() => trackingBuilder([], null, { message: 'RLS denied', code: '42501' }));
    await assert.rejects(() => getFavoriteSongIds(client, { bandId: 'b1', userId: 'u1' }), /RLS denied/);
  });

  it('addFavorite inserts the composite favorite row', async () => {
    const calls = [];
    const client = fakeClient((table) => {
      assert.equal(table, 'favorites');
      return trackingBuilder(calls, null);
    });

    await addFavorite(client, { bandId: 'b1', songId: 's1', userId: 'u1' });

    const insertCall = calls.find(([op]) => op === 'insert');
    assert.deepEqual(insertCall[1], { band_id: 'b1', song_id: 's1', user_id: 'u1' });
  });

  it('removeFavorite deletes by band, song and user', async () => {
    const calls = [];
    const client = fakeClient((table) => {
      assert.equal(table, 'favorites');
      return trackingBuilder(calls, null);
    });

    await removeFavorite(client, { bandId: 'b1', songId: 's1', userId: 'u1' });

    assert.ok(calls.some(([op]) => op === 'delete'));
    assert.ok(calls.some(([op, column, value]) => op === 'eq' && column === 'band_id' && value === 'b1'));
    assert.ok(calls.some(([op, column, value]) => op === 'eq' && column === 'song_id' && value === 's1'));
    assert.ok(calls.some(([op, column, value]) => op === 'eq' && column === 'user_id' && value === 'u1'));
  });
});
