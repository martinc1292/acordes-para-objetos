import { createClient } from '@supabase/supabase-js';

function readEnv(name) {
  // Vite injects import.meta.env at build time; Node tests use process.env.
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name] !== undefined) {
    return import.meta.env[name];
  }
  return typeof process !== 'undefined' ? process.env[name] : undefined;
}

let cached = null;
let cachedKey = null;

export function getSupabase() {
  const url = readEnv('VITE_SUPABASE_URL');
  const anonKey = readEnv('VITE_SUPABASE_ANON_KEY');
  if (!url || !anonKey) return null;
  const key = `${url}::${anonKey}`;
  if (cached && cachedKey === key) return cached;
  cached = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'pkce',
      detectSessionInUrl: false
    }
  });
  cachedKey = key;
  return cached;
}

export function isSupabaseConfigured() {
  return Boolean(readEnv('VITE_SUPABASE_URL') && readEnv('VITE_SUPABASE_ANON_KEY'));
}
