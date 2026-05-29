-- ============================================================================
-- Members can edit songs/tabs (not just admins) + last-admin guard.
-- Apply in the Supabase SQL editor. Idempotent.
-- ============================================================================

-- ---------- songs / tabs: members can now write ----------
drop policy if exists songs_insert on songs;
drop policy if exists songs_update on songs;
drop policy if exists songs_delete on songs;
create policy songs_insert on songs for insert with check (is_band_member(band_id));
create policy songs_update on songs for update using (is_band_member(band_id)) with check (is_band_member(band_id));
create policy songs_delete on songs for delete using (is_band_member(band_id));

drop policy if exists tabs_insert on tabs;
drop policy if exists tabs_update on tabs;
drop policy if exists tabs_delete on tabs;
create policy tabs_insert on tabs for insert with check (is_band_member(band_id));
create policy tabs_update on tabs for update using (is_band_member(band_id)) with check (is_band_member(band_id));
create policy tabs_delete on tabs for delete using (is_band_member(band_id));

-- ---------- save_song_with_tabs: require membership, not admin ----------
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
    where band_id = p_band_id and user_id = v_user_id
    for update;
  if not found then
    raise exception 'band membership required' using errcode = '42501';
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

-- ---------- update_band_member_role: never demote the last admin ----------
create or replace function public.update_band_member_role(p_band_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_admin_count int;
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

  -- Block demoting the only remaining admin to keep every band manageable.
  if p_role = 'member' then
    select count(*) into v_admin_count
      from public.band_members
      where band_id = p_band_id and role = 'admin';
    if v_admin_count <= 1 and exists (
      select 1 from public.band_members
      where band_id = p_band_id and user_id = p_user_id and role = 'admin'
    ) then
      raise exception 'cannot demote the last admin' using errcode = '42501';
    end if;
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
