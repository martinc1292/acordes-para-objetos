-- ============================================================================
-- setlist-app - Fase 1 RPCs
-- All SECURITY DEFINER with explicit search_path.
-- ============================================================================

-- ---------- create_band ----------
create or replace function create_band(p_name text, p_description text default null)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_band_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'band name required' using errcode = '22023';
  end if;

  insert into bands (name, description)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''))
  returning id into v_band_id;

  insert into band_members (band_id, user_id, role)
  values (v_band_id, v_user_id, 'admin');

  return v_band_id;
end;
$$;

revoke all on function create_band(text, text) from public;
grant execute on function create_band(text, text) to authenticated;

-- ---------- leave_band ----------
create or replace function leave_band(p_band_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_admin_count int;
  v_member_count int;
  v_promote uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform 1 from bands where id = p_band_id for update;

  if not exists (
    select 1 from band_members where band_id = p_band_id and user_id = v_user_id
  ) then
    raise exception 'band membership required' using errcode = '42501';
  end if;

  select count(*) into v_member_count from band_members where band_id = p_band_id;
  select count(*) into v_admin_count from band_members where band_id = p_band_id and role = 'admin';

  if v_member_count = 1 then
    delete from bands where id = p_band_id;
    return;
  end if;

  if v_admin_count = 1 and exists (
    select 1 from band_members where band_id = p_band_id and user_id = v_user_id and role = 'admin'
  ) then
    select user_id into v_promote
      from band_members
      where band_id = p_band_id and user_id <> v_user_id
      order by joined_at asc
      limit 1;
    update band_members set role = 'admin' where band_id = p_band_id and user_id = v_promote;
  end if;

  delete from band_members where band_id = p_band_id and user_id = v_user_id;
end;
$$;

revoke all on function leave_band(uuid) from public;
grant execute on function leave_band(uuid) to authenticated;

-- ---------- delete_band ----------
create or replace function delete_band(p_band_id uuid, p_confirmation_name text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
begin
  if not is_band_admin(p_band_id) then
    raise exception 'admin required' using errcode = '42501';
  end if;

  select name into v_name from bands where id = p_band_id;
  if v_name is null then
    raise exception 'band not found' using errcode = '22023';
  end if;
  if v_name <> p_confirmation_name then
    raise exception 'confirmation name does not match' using errcode = '22023';
  end if;

  delete from bands where id = p_band_id;
end;
$$;

revoke all on function delete_band(uuid, text) from public;
grant execute on function delete_band(uuid, text) to authenticated;

-- ---------- create_invitation ----------
create or replace function public.create_invitation(p_band_id uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_token uuid;
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform 1
    from public.band_members
    where band_id = p_band_id and user_id = v_user_id and role = 'admin'
    for update;

  if not found then
    raise exception 'admin required' using errcode = '42501';
  end if;
  if v_email = '' then
    raise exception 'email required' using errcode = '22023';
  end if;
  if coalesce(p_role, '') not in ('admin', 'member') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  insert into public.invitations (band_id, email, role, expires_at)
  values (p_band_id, v_email, p_role, now() + interval '7 days')
  returning token into v_token;

  return v_token;
end;
$$;

revoke all on function public.create_invitation(uuid, text, text) from public;
grant execute on function public.create_invitation(uuid, text, text) to authenticated;

-- ---------- accept_invitation ----------
create or replace function public.accept_invitation(p_token uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_band_id uuid;
  v_role text;
  v_invite_email text;
  v_accepted_at timestamptz;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select band_id, role, lower(email), accepted_at, expires_at
    into v_band_id, v_role, v_invite_email, v_accepted_at, v_expires_at
    from public.invitations
    where token = p_token
    for update;

  if v_band_id is null then
    raise exception 'invitation not found' using errcode = '22023';
  end if;
  if v_accepted_at is not null then
    raise exception 'invitation already accepted' using errcode = '22023';
  end if;
  if v_expires_at < now() then
    raise exception 'invitation expired' using errcode = '22023';
  end if;
  if v_invite_email <> v_user_email then
    raise exception 'invitation email does not match account' using errcode = '42501';
  end if;

  insert into public.band_members as bm (band_id, user_id, role)
  values (v_band_id, v_user_id, v_role)
  on conflict (band_id, user_id) do update
    set role = case
      when bm.role = 'admin' then 'admin'
      else excluded.role
    end;

  update public.invitations set accepted_at = now() where token = p_token;

  return v_band_id;
end;
$$;

revoke all on function public.accept_invitation(uuid) from public;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- ---------- seed_example_songs ----------
create or replace function public.seed_example_songs(p_band_id uuid)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing int;
  v_inserted int;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Row-level lock on the band to prevent concurrent seed runs.
  perform 1 from public.bands where id = p_band_id for update;

  if not found then
    raise exception 'band not found' using errcode = '22023';
  end if;

  perform 1
    from public.band_members
    where band_id = p_band_id and user_id = v_user_id and role = 'admin'
    for update;

  if not found then
    raise exception 'admin required' using errcode = '42501';
  end if;

  select count(*) into v_existing from public.songs where band_id = p_band_id;
  if v_existing > 0 then
    raise exception 'band already has songs' using errcode = '22023';
  end if;

  with src as (
    select
      gen_random_uuid() as new_song_id,
      id as seed_song_id,
      title,
      artist,
      key,
      tempo,
      structure,
      progression,
      lyrics,
      notes,
      sort_order
      from public.example_seed_songs
      order by sort_order
  ),
  inserted_songs as (
    insert into public.songs (id, band_id, title, artist, key, tempo, structure, progression, lyrics, notes, status, sort_order)
    select new_song_id, p_band_id, title, artist, key, tempo, structure, progression, lyrics, notes, 'pending', sort_order
      from src
      returning id
  )
  insert into public.tabs (song_id, band_id, title, content, position)
  select src.new_song_id, p_band_id, t.title, t.content, t.position
    from public.example_seed_tabs t
    join src on src.seed_song_id = t.song_id
    join inserted_songs s on s.id = src.new_song_id;

  select count(*) into v_inserted from public.songs where band_id = p_band_id;
  return v_inserted;
end;
$$;

revoke all on function public.seed_example_songs(uuid) from public;
grant execute on function public.seed_example_songs(uuid) to authenticated;
