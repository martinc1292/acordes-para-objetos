import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBand,
  createInvitation,
  acceptInvitation,
  leaveBand,
  deleteBand,
  seedExampleSongs,
  listMyBands,
  listBandMembers,
  listInvitations
} from './bands.js';

function fakeClient({ rpcImpl, fromImpl } = {}) {
  return {
    rpc(name, args) {
      return Promise.resolve(rpcImpl ? rpcImpl(name, args) : { data: null, error: null });
    },
    from(table) {
      return fromImpl ? fromImpl(table) : {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        is() { return this; },
        order() { return this; },
        then(resolve) { return resolve({ data: [], error: null }); }
      };
    }
  };
}

describe('db/bands wrappers', () => {
  it('createBand calls rpc with trimmed name + description', async () => {
    const calls = [];
    const client = fakeClient({
      rpcImpl(name, args) {
        calls.push({ name, args });
        return { data: 'band-uuid', error: null };
      }
    });
    const result = await createBand(client, { name: '  My Band  ', description: 'desc' });
    assert.equal(result, 'band-uuid');
    assert.deepEqual(calls, [{ name: 'create_band', args: { p_name: '  My Band  ', p_description: 'desc' } }]);
  });

  it('createBand throws when the RPC returns an error', async () => {
    const client = fakeClient({
      rpcImpl: () => ({ data: null, error: { message: 'boom' } })
    });
    await assert.rejects(() => createBand(client, { name: 'X' }), /boom/);
  });

  it('preserves Supabase error metadata', async () => {
    const client = fakeClient({
      rpcImpl: () => ({ data: null, error: { message: 'nope', code: '42501', details: 'policy' } })
    });
    await assert.rejects(
      () => createBand(client, { name: 'X' }),
      (err) => err.message === 'nope' && err.code === '42501' && err.details === 'policy'
    );
  });

  it('createInvitation passes band, email, role', async () => {
    const seen = [];
    const client = fakeClient({
      rpcImpl(name, args) {
        seen.push({ name, args });
        return { data: 'token-uuid', error: null };
      }
    });
    const token = await createInvitation(client, { bandId: 'b1', email: 'x@y.z', role: 'member' });
    assert.equal(token, 'token-uuid');
    assert.deepEqual(seen, [{ name: 'create_invitation', args: { p_band_id: 'b1', p_email: 'x@y.z', p_role: 'member' } }]);
  });

  it('acceptInvitation returns band id', async () => {
    const client = fakeClient({
      rpcImpl: (name, args) => {
        assert.equal(name, 'accept_invitation');
        assert.deepEqual(args, { p_token: 'tok' });
        return { data: 'band-uuid', error: null };
      }
    });
    assert.equal(await acceptInvitation(client, { token: 'tok' }), 'band-uuid');
  });

  it('leaveBand and deleteBand return void', async () => {
    const client = fakeClient({
      rpcImpl: () => ({ data: null, error: null })
    });
    assert.equal(await leaveBand(client, { bandId: 'b1' }), undefined);
    assert.equal(await deleteBand(client, { bandId: 'b1', confirmationName: 'My Band' }), undefined);
  });

  it('seedExampleSongs returns inserted count', async () => {
    const client = fakeClient({
      rpcImpl: () => ({ data: 37, error: null })
    });
    assert.equal(await seedExampleSongs(client, { bandId: 'b1' }), 37);
  });

  it('listMyBands queries band_members joined with bands', async () => {
    const calls = [];
    const client = fakeClient({
      fromImpl(table) {
        assert.equal(table, 'band_members');
        const builder = {
          select(value) { calls.push(['select', value]); return builder; },
          eq(column, value) { calls.push(['eq', column, value]); return builder; },
          order(column, options) { calls.push(['order', column, options]); return builder; },
          then(resolve) {
            return resolve({
              data: [
                { band_id: 'b1', role: 'admin', joined_at: '2026-01-01', bands: { id: 'b1', name: 'A', description: null } }
              ],
              error: null
            });
          }
        };
        return builder;
      }
    });
    const bands = await listMyBands(client, { userId: 'u1' });
    assert.deepEqual(calls, [
      ['select', 'band_id, role, joined_at, bands ( id, name, description )'],
      ['eq', 'user_id', 'u1'],
      ['order', 'joined_at', { ascending: true }]
    ]);
    assert.deepEqual(bands, [
      { id: 'b1', name: 'A', description: null, role: 'admin', joinedAt: '2026-01-01' }
    ]);
  });

  it('listBandMembers queries members then profiles by user ids', async () => {
    const calls = [];
    const client = fakeClient({
      fromImpl(table) {
        const builder = {
          select(value) { calls.push([table, 'select', value]); return builder; },
          eq(column, value) { calls.push([table, 'eq', column, value]); return builder; },
          in(column, value) { calls.push([table, 'in', column, value]); return builder; },
          order(column, options) { calls.push([table, 'order', column, options]); return builder; },
          then(resolve) {
            if (table === 'profiles') {
              return resolve({ data: [{ id: 'u1', email: 'a@b.c' }], error: null });
            }
            return resolve({
              data: [{ user_id: 'u1', role: 'admin', joined_at: 't' }],
              error: null
            });
          }
        };
        return builder;
      }
    });
    const members = await listBandMembers(client, { bandId: 'b1' });
    assert.deepEqual(calls, [
      ['band_members', 'select', 'user_id, role, joined_at'],
      ['band_members', 'eq', 'band_id', 'b1'],
      ['band_members', 'order', 'joined_at', { ascending: true }],
      ['profiles', 'select', 'id, email'],
      ['profiles', 'in', 'id', ['u1']]
    ]);
    assert.deepEqual(members, [{ userId: 'u1', email: 'a@b.c', role: 'admin', joinedAt: 't' }]);
  });

  it('listInvitations returns pending invitations', async () => {
    const calls = [];
    const client = fakeClient({
      fromImpl(table) {
        assert.equal(table, 'invitations');
        const builder = {
          select(value) { calls.push(['select', value]); return builder; },
          eq(column, value) { calls.push(['eq', column, value]); return builder; },
          is(column, value) { calls.push(['is', column, value]); return builder; },
          order(column, options) { calls.push(['order', column, options]); return builder; },
          then(resolve) {
            return resolve({
              data: [{ id: 'i1', email: 'x@y.z', role: 'member', token: 't', expires_at: '2026-12-31' }],
              error: null
            });
          }
        };
        return builder;
      }
    });
    const invites = await listInvitations(client, { bandId: 'b1' });
    assert.deepEqual(calls, [
      ['select', 'id, email, role, token, expires_at'],
      ['eq', 'band_id', 'b1'],
      ['is', 'accepted_at', null],
      ['order', 'expires_at', { ascending: true }]
    ]);
    assert.equal(invites.length, 1);
    assert.equal(invites[0].token, 't');
  });
});
