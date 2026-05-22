export function getSupabaseConfig(env = import.meta.env ?? {}) {
  const url = env.VITE_SUPABASE_URL?.trim() || '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() || '';

  return {
    isConfigured: Boolean(url && anonKey),
    url,
    anonKey
  };
}
