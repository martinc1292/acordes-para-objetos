import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config.js';

export const supabaseConfig = getSupabaseConfig();

export const supabase = supabaseConfig.isConfigured
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;
