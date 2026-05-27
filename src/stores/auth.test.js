import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  $currentUser,
  $bands,
  $activeBandId,
  $authReady,
  initAuthStore,
  refreshBands,
  setActiveBand,
  signOut
} from './auth.js';

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fakeSupabase({ session = null, bands = [], bandsByUser, getSessionError = null, bandsError = null } = {}) {
  const handlers = new Set();
  let unsubscribeCount = 0;
  return {
    get unsubscribeCount() { return unsubscribeCount; },
    emit(event, nextSession) {
      for (const handler of [...handlers]) handler(event, nextSession);
    },
    auth: {
      async getSession() { return { data: { session }, error: getSessionError }; },
      onAuthStateChange(cb) {
        handlers.add(cb);
        return {
          data: {
            subscription: {
              unsubscribe() {
                unsubscribeCount += 1;
                handlers.delete(cb);
              }
            }
          }
        };
      },
      async signOut() {
        for (const handler of [...handlers]) handler('SIGNED_OUT', null);
        return { error: null };
      }
    },
    from() {
      const filters = {};
      return {
        select() { return this; },
        eq(column, value) { filters[column] = value; return this; },
        order() { return this; },
        then(resolve) {
          if (bandsError) return resolve({ data: null, error: bandsError });
          const source = bandsByUser ? bandsByUser(filters.user_id) : bands;
          return Promise.resolve(source).then((items) => {
            const rows = items.map((b, i) => ({
              band_id: b.id,
              role: b.role || 'admin',
              joined_at: b.joinedAt || `2026-01-${String(i + 1).padStart(2, '0')}`,
              bands: { id: b.id, name: b.name, description: null }
            }));
            return resolve({ data: rows, error: null });
          });
        }
      };
    }
  };
}

describe('stores/auth', () => {
  beforeEach(() => {
    $currentUser.set(null);
    $bands.set([]);
    $activeBandId.set(null);
    $authReady.set(false);
  });

  it('initAuthStore loads no user when there is no session', async () => {
    const supabase = fakeSupabase({ session: null });
    await initAuthStore(supabase);
    assert.equal($currentUser.get(), null);
    assert.deepEqual($bands.get(), []);
    assert.equal($activeBandId.get(), null);
    assert.equal($authReady.get(), true);
  });

  it('initAuthStore loads user, bands and selects first band by joined_at', async () => {
    const supabase = fakeSupabase({
      session: { user: { id: 'u1', email: 'a@b.c' } },
      bands: [
        { id: 'b2', name: 'Older', joinedAt: '2026-01-01' },
        { id: 'b1', name: 'Newer', joinedAt: '2026-02-01' }
      ]
    });
    await initAuthStore(supabase);
    assert.equal($currentUser.get().email, 'a@b.c');
    assert.equal($bands.get().length, 2);
    assert.equal($activeBandId.get(), 'b2', 'first by joined_at ascending');
    assert.equal($authReady.get(), true);
  });

  it('signOut clears user/bands and routes intent', async () => {
    const supabase = fakeSupabase({ session: { user: { id: 'u1', email: 'a@b.c' } } });
    await initAuthStore(supabase);
    assert.ok($currentUser.get());
    await signOut(supabase);
    assert.equal($currentUser.get(), null);
    assert.deepEqual($bands.get(), []);
    assert.equal($activeBandId.get(), null);
  });

  it('loads bands after a post-init sign-in without awaiting inside the auth callback', async () => {
    const supabase = fakeSupabase({
      session: null,
      bandsByUser: () => [{ id: 'b1', name: 'Band' }]
    });
    await initAuthStore(supabase);
    supabase.emit('SIGNED_IN', { user: { id: 'u1', email: 'a@b.c' } });
    assert.equal($currentUser.get().id, 'u1');
    assert.deepEqual($bands.get(), [], 'band load is deferred out of the callback');
    await nextTick();
    await nextTick();
    assert.equal($activeBandId.get(), 'b1');
  });

  it('ignores stale band loads after sign-out', async () => {
    let resolveBands;
    const pendingBands = new Promise((resolve) => { resolveBands = resolve; });
    const supabase = fakeSupabase({
      session: null,
      bandsByUser: () => pendingBands
    });
    await initAuthStore(supabase);
    supabase.emit('SIGNED_IN', { user: { id: 'u1', email: 'a@b.c' } });
    supabase.emit('SIGNED_OUT', null);
    resolveBands([{ id: 'b1', name: 'Stale' }]);
    await nextTick();
    await nextTick();
    assert.equal($currentUser.get(), null);
    assert.deepEqual($bands.get(), []);
    assert.equal($activeBandId.get(), null);
  });

  it('unsubscribes a previous auth listener on repeated init', async () => {
    const first = fakeSupabase({ session: null });
    const second = fakeSupabase({ session: null });
    await initAuthStore(first);
    await initAuthStore(second);
    assert.equal(first.unsubscribeCount, 1);
  });

  it('marks auth ready even when getSession fails', async () => {
    const supabase = fakeSupabase({ getSessionError: new Error('session boom') });
    await assert.rejects(() => initAuthStore(supabase), /session boom/);
    assert.equal($authReady.get(), true);
  });

  it('preserves active band while it still exists and replaces it when removed', async () => {
    let bands = [
      { id: 'b1', name: 'One' },
      { id: 'b2', name: 'Two' }
    ];
    const supabase = fakeSupabase({
      session: { user: { id: 'u1', email: 'a@b.c' } },
      bandsByUser: () => bands
    });
    await initAuthStore(supabase);
    setActiveBand('b2');
    await refreshBands(supabase);
    assert.equal($activeBandId.get(), 'b2');
    bands = [{ id: 'b3', name: 'Three' }];
    await refreshBands(supabase);
    assert.equal($activeBandId.get(), 'b3');
  });

  it('initAuthStore tolerates a null client (env not configured)', async () => {
    await initAuthStore(null);
    assert.equal($currentUser.get(), null);
    assert.equal($authReady.get(), true);
  });
});
