import { supabase } from './supabase.js';

export async function login(email, password) {
  if (!supabase) {
    throw new Error('Supabase no configurado.');
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(error.message);
  }
}

export async function logout() {
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}

export async function isAdmin() {
  if (!supabase) return false;

  const { data } = await supabase.auth.getSession();
  if (!data?.session) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', data.session.user.id)
    .single();

  return profile?.is_admin === true;
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};

  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session) { callback(false); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', session.user.id)
      .single();

    callback(profile?.is_admin === true);
  });

  return () => data.subscription.unsubscribe();
}
