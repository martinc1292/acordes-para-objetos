-- ============================================================================
-- Acordes Para Objetos - Fase 1 schema
-- Multi-band model with row-level security.
-- Apply by pasting the whole file into the Supabase SQL editor (clean reset).
-- ============================================================================

-- Reset (Fase 1 starts fresh; no incremental migration from legacy schema)
drop table if exists favorites cascade;
drop table if exists comments cascade;
drop table if exists song_images cascade;
drop table if exists tabs cascade;
drop table if exists songs cascade;
drop table if exists invitations cascade;
drop table if exists band_members cascade;
drop table if exists bands cascade;
drop table if exists profiles cascade;
drop table if exists example_seed_tabs cascade;
drop table if exists example_seed_songs cascade;
drop function if exists is_band_member(uuid) cascade;
drop function if exists is_band_admin(uuid) cascade;
drop function if exists set_updated_at() cascade;
drop function if exists handle_new_user() cascade;

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- Tables ----------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table bands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table band_members (
  band_id uuid not null references bands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (band_id, user_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references bands(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member')),
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

create table songs (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references bands(id) on delete cascade,
  title text not null,
  artist text,
  key text,
  tempo text,
  structure text,
  progression text,
  lyrics text,
  notes text,
  status text not null default 'pending' check (status in ('pending','to_rehearse','rehearsing','ready')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tabs (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs(id) on delete cascade,
  band_id uuid not null references bands(id) on delete cascade,
  title text not null,
  content text not null,
  position integer not null default 0
);

create table song_images (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs(id) on delete cascade,
  band_id uuid not null references bands(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs(id) on delete cascade,
  band_id uuid not null references bands(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author_name_snapshot text,
  text text not null,
  color text not null default 'yellow' check (color in ('yellow','pink','blue','green','orange')),
  created_at timestamptz not null default now()
);

create table favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  band_id uuid not null references bands(id) on delete cascade,
  primary key (user_id, song_id)
);

-- Internal seed tables (no RLS; only accessed via SECURITY DEFINER RPCs)
create table example_seed_songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  key text,
  tempo text,
  structure text,
  progression text,
  lyrics text,
  notes text,
  sort_order integer not null default 0
);

create table example_seed_tabs (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references example_seed_songs(id) on delete cascade,
  title text not null,
  content text not null,
  position integer not null default 0
);

-- ---------- Indexes ----------
create index band_members_user_band_idx on band_members(user_id, band_id);
create index songs_band_sort_idx on songs(band_id, sort_order);
create index tabs_song_position_idx on tabs(song_id, position);
create index comments_song_created_idx on comments(song_id, created_at);
create index invitations_band_pending_idx on invitations(band_id, expires_at) where accepted_at is null;
create index favorites_user_band_idx on favorites(user_id, band_id);
create index favorites_song_idx on favorites(song_id);

-- ---------- Triggers ----------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger bands_set_updated_at before update on bands
  for each row execute function set_updated_at();
create trigger songs_set_updated_at before update on songs
  for each row execute function set_updated_at();

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- RLS helpers ----------

create or replace function is_band_member(p_band_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from band_members
    where band_id = p_band_id and user_id = auth.uid()
  );
$$;

create or replace function is_band_admin(p_band_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from band_members
    where band_id = p_band_id and user_id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- RLS ----------

alter table profiles enable row level security;
alter table bands enable row level security;
alter table band_members enable row level security;
alter table invitations enable row level security;
alter table songs enable row level security;
alter table tabs enable row level security;
alter table song_images enable row level security;
alter table comments enable row level security;
alter table favorites enable row level security;

-- profiles: a user can read profiles of users who share at least one band
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from band_members bm1
    join band_members bm2 on bm1.band_id = bm2.band_id
    where bm1.user_id = auth.uid() and bm2.user_id = profiles.id
  )
);
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- bands: members can read; INSERT/DELETE only via RPC; UPDATE only admins
create policy bands_select on bands for select using (is_band_member(id));
create policy bands_update on bands for update using (is_band_admin(id)) with check (is_band_admin(id));

-- band_members: members can read; writes go through RPCs so role/self-leave
-- invariants stay server-side.
create policy band_members_select on band_members for select using (is_band_member(band_id));

-- invitations: admins only
create policy invitations_select on invitations for select using (is_band_admin(band_id));
create policy invitations_delete on invitations for delete using (is_band_admin(band_id));

-- songs / tabs: any band member can read and write (admins manage the band only)
create policy songs_select on songs for select using (is_band_member(band_id));
create policy songs_insert on songs for insert with check (is_band_member(band_id));
create policy songs_update on songs for update using (is_band_member(band_id)) with check (is_band_member(band_id));
create policy songs_delete on songs for delete using (is_band_member(band_id));

create policy tabs_select on tabs for select using (is_band_member(band_id));
create policy tabs_insert on tabs for insert with check (is_band_member(band_id));
create policy tabs_update on tabs for update using (is_band_member(band_id)) with check (is_band_member(band_id));
create policy tabs_delete on tabs for delete using (is_band_member(band_id));

-- song_images: members read/write; only uploader or admin can delete
create policy song_images_select on song_images for select using (is_band_member(band_id));
create policy song_images_insert on song_images for insert with check (is_band_member(band_id) and user_id = auth.uid());
create policy song_images_delete on song_images for delete using (user_id = auth.uid() or is_band_admin(band_id));

-- comments: members read/write; users edit/delete own; admins delete any
create policy comments_select on comments for select using (is_band_member(band_id));
create policy comments_insert on comments for insert with check (is_band_member(band_id) and user_id = auth.uid());
create policy comments_update on comments for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy comments_delete on comments for delete using (user_id = auth.uid() or is_band_admin(band_id));

-- favorites: own only
create policy favorites_select on favorites for select using (user_id = auth.uid());
create policy favorites_insert on favorites for insert with check (user_id = auth.uid() and is_band_member(band_id));
create policy favorites_delete on favorites for delete using (user_id = auth.uid());

-- example_seed_* tables intentionally have no RLS and no policies; access via RPC only.
