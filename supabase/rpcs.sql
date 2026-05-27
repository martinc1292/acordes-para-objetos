-- ============================================================================
-- Acordes Para Objetos - Fase 1 RPCs
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

-- ---------- update_band_member_role ----------
create or replace function public.update_band_member_role(p_band_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_user_id = v_user_id then
    raise exception 'use leave_band to change your own membership' using errcode = '42501';
  end if;
  if coalesce(p_role, '') not in ('admin', 'member') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

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

  update public.band_members
    set role = p_role
    where band_id = p_band_id and user_id = p_user_id;
  if not found then
    raise exception 'member not found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.update_band_member_role(uuid, uuid, text) from public;
grant execute on function public.update_band_member_role(uuid, uuid, text) to authenticated;

-- ---------- remove_band_member ----------
create or replace function public.remove_band_member(p_band_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_user_id = v_user_id then
    raise exception 'use leave_band to leave the band' using errcode = '42501';
  end if;

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

  delete from public.band_members
    where band_id = p_band_id and user_id = p_user_id;
  if not found then
    raise exception 'member not found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.remove_band_member(uuid, uuid) from public;
grant execute on function public.remove_band_member(uuid, uuid) to authenticated;

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

-- ---------- save_song_with_tabs ----------
create or replace function public.save_song_with_tabs(
  p_band_id uuid,
  p_song_id uuid,
  p_song jsonb,
  p_tabs jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_song_id uuid := p_song_id;
  v_song public.songs%rowtype;
  v_tabs jsonb := coalesce(p_tabs, '[]'::jsonb);
  v_tab jsonb;
  v_tab_id uuid;
  v_keep_ids uuid[] := '{}';
  v_position int;
  v_index int := 0;
  v_saved_tabs jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_song, '{}'::jsonb)) <> 'object' then
    raise exception 'song payload must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(v_tabs) <> 'array' then
    raise exception 'tabs payload must be an array' using errcode = '22023';
  end if;
  if coalesce(trim(p_song ->> 'title'), '') = '' then
    raise exception 'song title required' using errcode = '22023';
  end if;

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

  if v_song_id is null then
    insert into public.songs (
      band_id, title, artist, key, tempo, structure, progression, lyrics, notes, sort_order
    )
    values (
      p_band_id,
      trim(p_song ->> 'title'),
      nullif(trim(coalesce(p_song ->> 'artist', '')), ''),
      nullif(trim(coalesce(p_song ->> 'key', '')), ''),
      nullif(trim(coalesce(p_song ->> 'tempo', '')), ''),
      nullif(trim(coalesce(p_song ->> 'structure', '')), ''),
      nullif(trim(coalesce(p_song ->> 'progression', '')), ''),
      nullif(trim(coalesce(p_song ->> 'lyrics', '')), ''),
      nullif(trim(coalesce(p_song ->> 'notes', '')), ''),
      coalesce(
        nullif(p_song ->> 'sort_order', '')::int,
        (select coalesce(max(sort_order) + 1, 0) from public.songs where band_id = p_band_id)
      )
    )
    returning * into v_song;
    v_song_id := v_song.id;
  else
    update public.songs
      set title = trim(p_song ->> 'title'),
          artist = nullif(trim(coalesce(p_song ->> 'artist', '')), ''),
          key = nullif(trim(coalesce(p_song ->> 'key', '')), ''),
          tempo = nullif(trim(coalesce(p_song ->> 'tempo', '')), ''),
          structure = nullif(trim(coalesce(p_song ->> 'structure', '')), ''),
          progression = nullif(trim(coalesce(p_song ->> 'progression', '')), ''),
          lyrics = nullif(trim(coalesce(p_song ->> 'lyrics', '')), ''),
          notes = nullif(trim(coalesce(p_song ->> 'notes', '')), '')
      where id = v_song_id and band_id = p_band_id
      returning * into v_song;
    if not found then
      raise exception 'song not found' using errcode = '22023';
    end if;
  end if;

  for v_tab in select value from jsonb_array_elements(v_tabs)
  loop
    if coalesce(trim(v_tab ->> 'title'), '') = '' and coalesce(v_tab ->> 'content', '') = '' then
      v_index := v_index + 1;
      continue;
    end if;

    v_position := coalesce(nullif(v_tab ->> 'position', '')::int, v_index);

    if coalesce(v_tab ->> 'id', '') <> '' then
      v_tab_id := (v_tab ->> 'id')::uuid;
      update public.tabs
        set title = coalesce(nullif(trim(v_tab ->> 'title'), ''), 'Tab'),
            content = coalesce(v_tab ->> 'content', ''),
            position = v_position
        where id = v_tab_id and song_id = v_song_id and band_id = p_band_id
        returning id into v_tab_id;
      if not found then
        raise exception 'tab not found' using errcode = '22023';
      end if;
    else
      insert into public.tabs (song_id, band_id, title, content, position)
      values (
        v_song_id,
        p_band_id,
        coalesce(nullif(trim(v_tab ->> 'title'), ''), 'Tab'),
        coalesce(v_tab ->> 'content', ''),
        v_position
      )
      returning id into v_tab_id;
    end if;

    v_keep_ids := array_append(v_keep_ids, v_tab_id);
    v_index := v_index + 1;
  end loop;

  delete from public.tabs
    where song_id = v_song_id
      and band_id = p_band_id
      and not (id = any(v_keep_ids));

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'song_id', song_id,
        'band_id', band_id,
        'title', title,
        'content', content,
        'position', position
      )
      order by position
    ),
    '[]'::jsonb
  )
  into v_saved_tabs
  from public.tabs
  where song_id = v_song_id and band_id = p_band_id;

  return jsonb_build_object(
    'id', v_song.id,
    'band_id', v_song.band_id,
    'title', v_song.title,
    'artist', v_song.artist,
    'key', v_song.key,
    'tempo', v_song.tempo,
    'structure', v_song.structure,
    'progression', v_song.progression,
    'lyrics', v_song.lyrics,
    'notes', v_song.notes,
    'status', v_song.status,
    'sort_order', v_song.sort_order,
    'created_at', v_song.created_at,
    'updated_at', v_song.updated_at,
    'tabs', v_saved_tabs
  );
end;
$$;

revoke all on function public.save_song_with_tabs(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.save_song_with_tabs(uuid, uuid, jsonb, jsonb) to authenticated;
