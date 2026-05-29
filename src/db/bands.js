import { unwrap } from './_unwrap.js';

export async function createBand(client, { name, description = null }) {
  return unwrap(await client.rpc('create_band', { p_name: name, p_description: description }));
}

export async function createInvitation(client, { bandId, email, role }) {
  return unwrap(await client.rpc('create_invitation', { p_band_id: bandId, p_email: email, p_role: role }));
}

export async function acceptInvitation(client, { token }) {
  return unwrap(await client.rpc('accept_invitation', { p_token: token }));
}

export async function leaveBand(client, { bandId }) {
  unwrap(await client.rpc('leave_band', { p_band_id: bandId }));
}

export async function deleteBand(client, { bandId, confirmationName }) {
  unwrap(await client.rpc('delete_band', { p_band_id: bandId, p_confirmation_name: confirmationName }));
}

export async function updateBandMemberRole(client, { bandId, userId, role }) {
  unwrap(await client.rpc('update_band_member_role', { p_band_id: bandId, p_user_id: userId, p_role: role }));
}

export async function removeBandMember(client, { bandId, userId }) {
  unwrap(await client.rpc('remove_band_member', { p_band_id: bandId, p_user_id: userId }));
}

export async function seedExampleSongs(client, { bandId }) {
  return unwrap(await client.rpc('seed_example_songs', { p_band_id: bandId }));
}

export async function listMyBands(client, { userId }) {
  const rows = unwrap(await client
    .from('band_members')
    .select('band_id, role, joined_at, bands ( id, name, description )')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })) ?? [];
  return rows.map((row) => ({
    id: row.bands?.id ?? row.band_id,
    name: row.bands?.name ?? null,
    description: row.bands?.description ?? null,
    role: row.role,
    joinedAt: row.joined_at
  }));
}

export async function listBandMembers(client, { bandId }) {
  const rows = unwrap(await client
    .from('band_members')
    .select('user_id, role, joined_at')
    .eq('band_id', bandId)
    .order('joined_at', { ascending: true })) ?? [];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const profiles = unwrap(await client
    .from('profiles')
    .select('id, email')
    .in('id', userIds)) ?? [];
  const emailByUserId = new Map(profiles.map((profile) => [profile.id, profile.email]));

  return rows.map((row) => ({
    userId: row.user_id,
    email: emailByUserId.get(row.user_id) ?? null,
    role: row.role,
    joinedAt: row.joined_at
  }));
}

export async function listInvitations(client, { bandId }) {
  const rows = unwrap(await client
    .from('invitations')
    .select('id, email, role, token, expires_at')
    .eq('band_id', bandId)
    .is('accepted_at', null)
    .order('expires_at', { ascending: true })) ?? [];
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    token: row.token,
    expiresAt: row.expires_at
  }));
}
