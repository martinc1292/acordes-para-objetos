create extension if not exists pgcrypto;

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
  author text not null,
  text text not null,
  color text default 'yellow' check (color in ('yellow', 'pink', 'blue', 'green', 'orange')),
  created_at timestamptz default now()
);

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

drop policy if exists songs_admin_write on public.songs;
create policy songs_admin_write on public.songs
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

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
create policy comments_public_delete on public.comments
for delete using (true);

drop policy if exists sugg_public_read on public.suggestions;
create policy sugg_public_read on public.suggestions
for select using (true);

drop policy if exists sugg_public_insert on public.suggestions;
create policy sugg_public_insert on public.suggestions
for insert with check (true);

drop policy if exists sugg_admin_update on public.suggestions;
create policy sugg_admin_update on public.suggestions
for update using (auth.role() = 'authenticated');

drop policy if exists sugg_admin_delete on public.suggestions;
create policy sugg_admin_delete on public.suggestions
for delete using (auth.role() = 'authenticated');

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  text text not null,
  created_at timestamptz default now()
);

alter table public.chat_messages enable row level security;

drop policy if exists chat_public_read on public.chat_messages;
create policy chat_public_read on public.chat_messages
for select using (true);

drop policy if exists chat_public_insert on public.chat_messages;
create policy chat_public_insert on public.chat_messages
for insert with check (true);

drop policy if exists chat_admin_delete on public.chat_messages;
create policy chat_admin_delete on public.chat_messages
for delete using (auth.role() = 'authenticated');
