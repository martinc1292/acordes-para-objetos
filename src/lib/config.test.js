import test from 'node:test';
import assert from 'node:assert/strict';
import { getSupabaseConfig } from './config.js';

test('returns unconfigured Supabase config when env values are missing', () => {
  assert.deepEqual(getSupabaseConfig({}), {
    isConfigured: false,
    url: '',
    anonKey: ''
  });
});

test('returns configured Supabase config when url and anon key exist', () => {
  assert.deepEqual(getSupabaseConfig({
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key'
  }), {
    isConfigured: true,
    url: 'https://example.supabase.co',
    anonKey: 'anon-key'
  });
});
