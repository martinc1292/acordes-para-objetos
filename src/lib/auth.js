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
  return Boolean(data?.session);
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(Boolean(session));
  });

  return () => data.subscription.unsubscribe();
}
