create extension if not exists pgcrypto;

-- ─── Profiles (rol admin) ─────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  is_admin boolean default false not null
);

alter table public.profiles enable row level security;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles
for select using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
as $$
begin
  insert into public.profiles (id, is_admin) values (new.id, false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ─── Helper para verificar admin ─────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean
language sql security definer stable
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  song_key text not null,
  tempo text,
  structure text,
  progression text,
  tabs jsonb default '[]'::jsonb,
  lyrics text,
  notes text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists songs_sort_order_idx on public.songs(sort_order);

drop trigger if exists set_songs_updated_at on public.songs;
create trigger set_songs_updated_at
before update on public.songs
for each row execute function public.set_updated_at();

create table if not exists public.song_meta (
  song_id uuid primary key references public.songs(id) on delete cascade,
  is_favorite boolean default false,
  status text default 'pending' check (status in ('pending', 'rehearsing', 'ready')),
  updated_at timestamptz default now()
);

drop trigger if exists set_song_meta_updated_at on public.song_meta;
create trigger set_song_meta_updated_at
before update on public.song_meta
for each row execute function public.set_updated_at();

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs(id) on delete cascade,
  user_id uuid references auth.users,
  author text not null,
  text text not null,
  color text default 'yellow' check (color in ('yellow', 'pink', 'blue', 'green', 'orange')),
  created_at timestamptz default now()
);

-- Migración segura: agrega la columna si ya existe la tabla sin ella
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'comments' and column_name = 'user_id'
  ) then
    alter table public.comments add column user_id uuid references auth.users;
  end if;
end$$;

create index if not exists comments_song_id_idx on public.comments(song_id);

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  suggested_by text not null,
  notes text,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now()
);

alter table public.songs enable row level security;
alter table public.song_meta enable row level security;
alter table public.comments enable row level security;
alter table public.suggestions enable row level security;

drop policy if exists songs_public_read on public.songs;
create policy songs_public_read on public.songs
for select using (true);

drop policy if exists songs_public_insert on public.songs;
drop policy if exists songs_admin_write on public.songs;
drop policy if exists songs_admin_insert on public.songs;
drop policy if exists songs_admin_update on public.songs;
drop policy if exists songs_admin_delete on public.songs;

create policy songs_admin_insert on public.songs
for insert with check (public.is_admin());

create policy songs_admin_update on public.songs
for update using (public.is_admin());

create policy songs_admin_delete on public.songs
for delete using (public.is_admin());

drop policy if exists meta_public_read on public.song_meta;
create policy meta_public_read on public.song_meta
for select using (true);

drop policy if exists meta_public_write on public.song_meta;
create policy meta_public_write on public.song_meta
for all using (true) with check (true);

drop policy if exists comments_public_read on public.comments;
create policy comments_public_read on public.comments
for select using (true);

drop policy if exists comments_public_insert on public.comments;
create policy comments_public_insert on public.comments
for insert with check (true);

drop policy if exists comments_admin_delete on public.comments;
drop policy if exists comments_public_delete on public.comments;
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
for delete using (
  user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists sugg_public_read on public.suggestions;
create policy sugg_public_read on public.suggestions
for select using (true);

drop policy if exists sugg_public_insert on public.suggestions;
create policy sugg_public_insert on public.suggestions
for insert with check (true);

drop policy if exists sugg_admin_update on public.suggestions;
create policy sugg_admin_update on public.suggestions
for update using (public.is_admin());

drop policy if exists sugg_admin_delete on public.suggestions;
create policy sugg_admin_delete on public.suggestions
for delete using (public.is_admin());

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  author text not null,
  text text not null,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_messages' and column_name = 'user_id'
  ) then
    alter table public.chat_messages add column user_id uuid references auth.users;
  end if;
end$$;

alter table public.chat_messages enable row level security;

drop policy if exists chat_public_read on public.chat_messages;
create policy chat_public_read on public.chat_messages
for select using (true);

drop policy if exists chat_public_insert on public.chat_messages;
create policy chat_public_insert on public.chat_messages
for insert with check (true);

drop policy if exists chat_admin_delete on public.chat_messages;
drop policy if exists chat_delete on public.chat_messages;
create policy chat_delete on public.chat_messages
for delete using (
  user_id = auth.uid()
  or public.is_admin()
);
