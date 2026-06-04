import { unwrap } from './_unwrap.js';

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB

export async function getMyProfile(client, { userId }) {
  const rows = unwrap(await client
    .from('profiles')
    .select('id, email, display_name, avatar_url')
    .eq('id', userId)
    .limit(1)) ?? [];
  return rows[0] ?? null;
}

export async function updateMyProfile(client, { userId, displayName, avatarUrl }) {
  const patch = {};
  if (displayName !== undefined) patch.display_name = displayName?.trim() || null;
  if (avatarUrl !== undefined) patch.avatar_url = avatarUrl || null;
  if (Object.keys(patch).length === 0) return;
  unwrap(await client.from('profiles').update(patch).eq('id', userId));
}

// Sube la foto al bucket `avatars` en la carpeta del usuario y devuelve la URL publica.
// Nombre con timestamp para evitar que el navegador cachee la imagen vieja.
export async function uploadAvatar(client, { userId, file }) {
  if (!file) throw new Error('avatar: no file');
  if (!ACCEPTED_TYPES.has(file.type)) {
    const err = new Error('avatar: unsupported type');
    err.code = 'unsupported_type';
    throw err;
  }
  if (file.size > MAX_BYTES) {
    const err = new Error('avatar: too large');
    err.code = 'too_large';
    throw err;
  }
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await client.storage.from('avatars').upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: true
  });
  if (error) throw error;
  const { data } = client.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}