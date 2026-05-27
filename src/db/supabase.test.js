import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const ORIGINAL_ENV = { ...process.env };

async function loadFresh() {
  // Bust the module cache by appending a query string on the import URL.
  const url = new URL('./supabase.js', import.meta.url).href + `?t=${Date.now()}`;
  return import(url);
}

describe('db/supabase', () => {
  beforeEach(() => {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns null when env vars are missing', async () => {
    const mod = await loadFresh();
    assert.equal(mod.getSupabase(), null);
    assert.equal(mod.isSupabaseConfigured(), false);
  });

  it('returns a client instance when env vars are present', async () => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    const mod = await loadFresh();
    const client = mod.getSupabase();
    assert.ok(client, 'client should not be null');
    assert.equal(typeof client.auth, 'object');
    assert.equal(mod.isSupabaseConfigured(), true);
  });

  it('memoises the client across calls', async () => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    const mod = await loadFresh();
    assert.strictEqual(mod.getSupabase(), mod.getSupabase());
  });
});
