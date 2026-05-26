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
