# Fase 1 — Backend y Autenticación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar `setlist-app/` con Supabase, implementar magic link auth, modelo multi-banda con RLS, RPCs de gestión de bandas/invitaciones, y seeds opcionales.

**Architecture:** Vite + Preact + nanostores en el frontend. Supabase (Postgres + Auth) en el backend. Schema multi-tenant con `band_id` denormalizado en tablas hijas para RLS performante. Auth Magic Link con flujo PKCE (`exchangeCodeForSession`). RPCs `SECURITY DEFINER` para operaciones que cruzan tablas o requieren bypass de RLS. Seeds dobles: tablas internas `example_seed_*` consumidas por RPC `seed_example_songs`, y script dev/admin `seed-band.js` con service role key.

**Tech Stack:**
- `@supabase/supabase-js` v2 (cliente JS)
- PostgreSQL 15+ (Supabase managed)
- Preact + htm + nanostores (existente en Fase 0)
- `node --test` + happy-dom para tests

**Spec de referencia:** [`docs/superpowers/specs/2026-05-25-fase1-backend-auth-design.md`](../specs/2026-05-25-fase1-backend-auth-design.md)

---

## File Structure

**Nuevos archivos:**

| Path | Responsabilidad |
|---|---|
| `setlist-app/.env.example` | Placeholders de env vars (en git) |
| `setlist-app/.env.local` | Valores reales (gitignored) |
| `setlist-app/supabase/schema.sql` | Schema completo: tablas, índices, helpers, RLS, triggers |
| `setlist-app/supabase/rpcs.sql` | RPCs: create_band, invitaciones, leave/delete band, seed_example_songs |
| `setlist-app/supabase/seed_example_data.sql` | INSERTs en `example_seed_songs` / `example_seed_tabs` (generado) |
| `setlist-app/scripts/generate-seed-sql.js` | Convierte `seeds/songs.json` → `seed_example_data.sql` |
| `setlist-app/scripts/seed-band.js` | CLI dev/admin para sembrar canciones en una banda existente |
| `setlist-app/src/db/supabase.js` | Init lazy del cliente Supabase |
| `setlist-app/src/db/supabase.test.js` | Tests del init lazy |
| `setlist-app/src/db/bands.js` | Wrappers JS sobre RPCs de bandas |
| `setlist-app/src/db/bands.test.js` | Tests de wrappers (mock supabase) |
| `setlist-app/src/views/Login.js` | Magic link form |
| `setlist-app/src/views/AuthCallback.js` | PKCE exchange |
| `setlist-app/src/views/Onboarding.js` | Crear banda / aceptar invitación |
| `setlist-app/src/views/InviteAccept.js` | Aceptar invitación con token |
| `setlist-app/src/views/BandSettings.js` | Tabs General/Members/Advanced |
| `setlist-app/src/views/Home.js` | Placeholder mientras Fase 2 no llega |

**Archivos modificados:**

| Path | Cambio |
|---|---|
| `setlist-app/package.json` | Añadir `@supabase/supabase-js` |
| `setlist-app/.gitignore` | Añadir `.env.local` |
| `setlist-app/src/stores/auth.js` | Init de sesión + onAuthStateChange + bands loading |
| `setlist-app/src/stores/auth.test.js` | Tests del init |
| `setlist-app/src/app.js` | Reemplazar shell de Fase 0 por router-based shell |
| `setlist-app/src/main.js` | Inicializar router antes de render |

---

## Sprint A — Setup + Schema

### Task 1: Instalar @supabase/supabase-js y configurar env files

**Files:**
- Modify: `setlist-app/package.json`
- Create: `setlist-app/.env.example`
- Modify: `setlist-app/.gitignore` (crear si no existe)

- [ ] **Step 1: Instalar dependencia**

Run desde la raíz del repo:
```bash
cd setlist-app && npm install @supabase/supabase-js
```
Expected: `package.json` ahora tiene `"@supabase/supabase-js": "^2.x.x"` en `dependencies`.

- [ ] **Step 2: Crear `.env.example`**

Contenido completo de `setlist-app/.env.example`:
```
# Supabase project credentials
# Get these from: https://app.supabase.com/project/_/settings/api
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 3: Verificar/crear `.gitignore`**

Verificar que `setlist-app/.gitignore` contiene `.env.local`. Si no existe el archivo, crearlo con:
```
node_modules
dist
.env.local
```

- [ ] **Step 4: Commit**

```bash
git add setlist-app/package.json setlist-app/package-lock.json setlist-app/.env.example setlist-app/.gitignore
git commit -m "chore(setlist-app): add @supabase/supabase-js and env scaffolding"
```

---

### Task 2: Cliente Supabase con init lazy (TDD)

**Files:**
- Create: `setlist-app/src/db/supabase.js`
- Test: `setlist-app/src/db/supabase.test.js`

- [ ] **Step 1: Escribir tests**

Contenido completo de `setlist-app/src/db/supabase.test.js`:
```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const ORIGINAL_ENV = { ...process.env };

async function loadFresh() {
  // Bust the module cache by appending a query string on the import URL.
  const url = new URL('./supabase.js', import.meta.url).href + `?t=${Date.now()}`;
  return import(url);
}

describe('db/supabase', () => {
  beforeEach(() => {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns null when env vars are missing', async () => {
    const mod = await loadFresh();
    assert.equal(mod.getSupabase(), null);
    assert.equal(mod.isSupabaseConfigured(), false);
  });

  it('returns a client instance when env vars are present', async () => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    const mod = await loadFresh();
    const client = mod.getSupabase();
    assert.ok(client, 'client should not be null');
    assert.equal(typeof client.auth, 'object');
    assert.equal(mod.isSupabaseConfigured(), true);
  });

  it('memoises the client across calls', async () => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    const mod = await loadFresh();
    assert.strictEqual(mod.getSupabase(), mod.getSupabase());
  });
});
```

- [ ] **Step 2: Correr tests para verificar que fallan**

Run:
```bash
cd setlist-app && node --test src/db/supabase.test.js
```
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar el cliente**

Contenido completo de `setlist-app/src/db/supabase.js`:
```js
import { createClient } from '@supabase/supabase-js';

function readEnv(name) {
  // Vite injects import.meta.env at build time; Node tests use process.env.
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name] !== undefined) {
    return import.meta.env[name];
  }
  return process.env[name];
}

let cached = null;
let cachedKey = null;

export function getSupabase() {
  const url = readEnv('VITE_SUPABASE_URL');
  const anonKey = readEnv('VITE_SUPABASE_ANON_KEY');
  if (!url || !anonKey) return null;
  const key = `${url}::${anonKey}`;
  if (cached && cachedKey === key) return cached;
  cached = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'pkce',
      detectSessionInUrl: false
    }
  });
  cachedKey = key;
  return cached;
}

export function isSupabaseConfigured() {
  return getSupabase() !== null;
}
```

- [ ] **Step 4: Correr tests para verificar que pasan**

Run:
```bash
cd setlist-app && node --test src/db/supabase.test.js
```
Expected: PASS (3/3 tests).

- [ ] **Step 5: Commit**

```bash
git add setlist-app/src/db/supabase.js setlist-app/src/db/supabase.test.js
git commit -m "feat(setlist-app): add lazy Supabase client init"
```

---

### Task 3: Schema SQL — tablas, índices, triggers, helpers

**Files:**
- Create: `setlist-app/supabase/schema.sql`

- [ ] **Step 1: Crear directorio y archivo**

Run:
```bash
mkdir -p setlist-app/supabase
```

- [ ] **Step 2: Escribir schema completo**

Contenido completo de `setlist-app/supabase/schema.sql`:
```sql
-- ============================================================================
-- setlist-app — Fase 1 schema
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
  status text not null default 'pending' check (status in ('pending','rehearsing','ready')),
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

-- band_members: members can read; INSERT/DELETE/UPDATE only via RPC + admin
create policy band_members_select on band_members for select using (is_band_member(band_id));
create policy band_members_update on band_members for update using (is_band_admin(band_id)) with check (is_band_admin(band_id));

-- invitations: admins only
create policy invitations_select on invitations for select using (is_band_admin(band_id));
create policy invitations_delete on invitations for delete using (is_band_admin(band_id));

-- songs / tabs: members read; admins write
create policy songs_select on songs for select using (is_band_member(band_id));
create policy songs_insert on songs for insert with check (is_band_admin(band_id));
create policy songs_update on songs for update using (is_band_admin(band_id)) with check (is_band_admin(band_id));
create policy songs_delete on songs for delete using (is_band_admin(band_id));

create policy tabs_select on tabs for select using (is_band_member(band_id));
create policy tabs_insert on tabs for insert with check (is_band_admin(band_id));
create policy tabs_update on tabs for update using (is_band_admin(band_id)) with check (is_band_admin(band_id));
create policy tabs_delete on tabs for delete using (is_band_admin(band_id));

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
```

- [ ] **Step 3: Aplicar manualmente al proyecto Supabase**

Pegar el contenido completo en el SQL Editor de Supabase Dashboard y ejecutar. Verificar en `Table Editor` que aparecen todas las tablas listadas.

- [ ] **Step 4: Commit**

```bash
git add setlist-app/supabase/schema.sql
git commit -m "feat(setlist-app): add Supabase schema with multi-band RLS"
```

---

## Sprint B — RPCs y Seeds

### Task 4: RPCs de gestión de banda

**Files:**
- Create: `setlist-app/supabase/rpcs.sql`

- [ ] **Step 1: Crear rpcs.sql con create_band, leave_band, delete_band**

Contenido inicial de `setlist-app/supabase/rpcs.sql`:
```sql
-- ============================================================================
-- setlist-app — Fase 1 RPCs
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
```

- [ ] **Step 2: Aplicar manualmente al proyecto Supabase**

Pegar en SQL Editor y ejecutar.

- [ ] **Step 3: Verificar manual via SQL**

En el SQL Editor (como un usuario autenticado vía Dashboard impersonation, o mediante `select set_config('request.jwt.claims', '{"sub":"<uuid>"}', true)`):
```sql
select create_band('Test Band', 'desc');
```
Expected: retorna un UUID y aparece la banda en `bands` con el usuario como admin.

- [ ] **Step 4: Commit**

```bash
git add setlist-app/supabase/rpcs.sql
git commit -m "feat(setlist-app): add band management RPCs"
```

---

### Task 5: RPCs de invitaciones

**Files:**
- Modify: `setlist-app/supabase/rpcs.sql` (append)

- [ ] **Step 1: Append create_invitation y accept_invitation**

Añadir al final de `setlist-app/supabase/rpcs.sql`:
```sql

-- ---------- create_invitation ----------
create or replace function create_invitation(p_band_id uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_token uuid;
  v_email text := lower(trim(p_email));
begin
  if not is_band_admin(p_band_id) then
    raise exception 'admin required' using errcode = '42501';
  end if;
  if v_email = '' then
    raise exception 'email required' using errcode = '22023';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  insert into invitations (band_id, email, role, expires_at)
  values (p_band_id, v_email, p_role, now() + interval '7 days')
  returning token into v_token;

  return v_token;
end;
$$;

revoke all on function create_invitation(uuid, text, text) from public;
grant execute on function create_invitation(uuid, text, text) to authenticated;

-- ---------- accept_invitation ----------
create or replace function accept_invitation(p_token uuid)
returns uuid
language plpgsql
security definer set search_path = public
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
    from invitations
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

  insert into band_members (band_id, user_id, role)
  values (v_band_id, v_user_id, v_role)
  on conflict (band_id, user_id) do nothing;

  update invitations set accepted_at = now() where token = p_token;

  return v_band_id;
end;
$$;

revoke all on function accept_invitation(uuid) from public;
grant execute on function accept_invitation(uuid) to authenticated;
```

- [ ] **Step 2: Aplicar manualmente al proyecto Supabase**

Pegar los nuevos bloques en SQL Editor y ejecutar.

- [ ] **Step 3: Commit**

```bash
git add setlist-app/supabase/rpcs.sql
git commit -m "feat(setlist-app): add invitation RPCs"
```

---

### Task 6: Generador SQL desde seeds/songs.json

**Files:**
- Create: `setlist-app/scripts/generate-seed-sql.js`
- Create (generado): `setlist-app/supabase/seed_example_data.sql`

- [ ] **Step 1: Escribir el generador**

Contenido completo de `setlist-app/scripts/generate-seed-sql.js`:
```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const songs = JSON.parse(readFileSync(join(root, 'seeds', 'songs.json'), 'utf8'));

function escape(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const lines = [
  '-- Generated by scripts/generate-seed-sql.js. Do not edit by hand.',
  '-- Reset and repopulate example seed tables.',
  '',
  'truncate table example_seed_tabs, example_seed_songs restart identity cascade;',
  ''
];

songs.forEach((song, index) => {
  const songId = `'00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}'`;
  lines.push(
    `insert into example_seed_songs (id, title, artist, key, tempo, structure, progression, lyrics, notes, sort_order)`
  );
  lines.push(
    `values (${songId}, ${escape(song.title)}, ${escape(song.artist)}, ${escape(song.key)}, ${escape(song.tempo)}, ${escape(song.structure)}, ${escape(song.progression)}, ${escape(song.lyrics || '')}, ${escape(song.notes || '')}, ${index});`
  );
  (song.tabs || []).forEach((tab, tabIndex) => {
    lines.push(
      `insert into example_seed_tabs (song_id, title, content, position) values (${songId}, ${escape(tab.title)}, ${escape(tab.tab)}, ${tabIndex});`
    );
  });
  lines.push('');
});

writeFileSync(join(root, 'supabase', 'seed_example_data.sql'), lines.join('\n'), 'utf8');
console.log(`Wrote ${songs.length} songs to supabase/seed_example_data.sql`);
```

- [ ] **Step 2: Ejecutar el generador**

Run:
```bash
cd setlist-app && node scripts/generate-seed-sql.js
```
Expected: imprime `Wrote 37 songs...` y crea `setlist-app/supabase/seed_example_data.sql`.

- [ ] **Step 3: Aplicar manualmente al proyecto Supabase**

Pegar `seed_example_data.sql` en SQL Editor y ejecutar. Verificar:
```sql
select count(*) from example_seed_songs; -- expect 37
select count(*) from example_seed_tabs;  -- expect >0
```

- [ ] **Step 4: Commit**

```bash
git add setlist-app/scripts/generate-seed-sql.js setlist-app/supabase/seed_example_data.sql
git commit -m "feat(setlist-app): generate example seed SQL from songs.json"
```

---

### Task 7: RPC `seed_example_songs` + script CLI `seed-band.js`

**Files:**
- Modify: `setlist-app/supabase/rpcs.sql` (append)
- Create: `setlist-app/scripts/seed-band.js`

- [ ] **Step 1: Append seed_example_songs RPC**

Añadir al final de `setlist-app/supabase/rpcs.sql`:
```sql

-- ---------- seed_example_songs ----------
create or replace function seed_example_songs(p_band_id uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing int;
  v_inserted int;
begin
  if not is_band_admin(p_band_id) then
    raise exception 'admin required' using errcode = '42501';
  end if;

  -- Row-level lock on the band to prevent concurrent seed runs.
  perform 1 from bands where id = p_band_id for update;

  select count(*) into v_existing from songs where band_id = p_band_id;
  if v_existing > 0 then
    raise exception 'band already has songs' using errcode = '22023';
  end if;

  with src as (
    select id, title, artist, key, tempo, structure, progression, lyrics, notes, sort_order
      from example_seed_songs
      order by sort_order
  ),
  inserted_songs as (
    insert into songs (band_id, title, artist, key, tempo, structure, progression, lyrics, notes, status, sort_order)
    select p_band_id, title, artist, key, tempo, structure, progression, lyrics, notes, 'pending', sort_order
      from src
      returning id, sort_order
  ),
  -- Re-fetch matching seed songs to copy tabs (the join by sort_order is safe
  -- because example_seed_songs.sort_order is unique within the seed dataset).
  pairs as (
    select s.id as new_song_id, e.id as seed_song_id
      from inserted_songs s
      join example_seed_songs e on e.sort_order = s.sort_order
  )
  insert into tabs (song_id, band_id, title, content, position)
  select p.new_song_id, p_band_id, t.title, t.content, t.position
    from example_seed_tabs t
    join pairs p on p.seed_song_id = t.song_id;

  select count(*) into v_inserted from songs where band_id = p_band_id;
  return v_inserted;
end;
$$;

revoke all on function seed_example_songs(uuid) from public;
grant execute on function seed_example_songs(uuid) to authenticated;
```

- [ ] **Step 2: Aplicar manualmente al proyecto Supabase**

Pegar el nuevo bloque en SQL Editor y ejecutar.

- [ ] **Step 3: Escribir script CLI `seed-band.js`**

Contenido completo de `setlist-app/scripts/seed-band.js`:
```js
#!/usr/bin/env node
// Dev/admin tool. Seeds songs into an existing band using the service role key.
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-band.js <band_id>
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bandId = process.argv[2];

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!bandId) {
  console.error('Usage: node scripts/seed-band.js <band_id>');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const songs = JSON.parse(readFileSync(join(root, 'seeds', 'songs.json'), 'utf8'));

async function main() {
  const { data: band, error: bandErr } = await supabase.from('bands').select('id, name').eq('id', bandId).maybeSingle();
  if (bandErr) throw bandErr;
  if (!band) {
    console.error(`Band ${bandId} not found`);
    process.exit(1);
  }
  const { count, error: countErr } = await supabase
    .from('songs')
    .select('*', { count: 'exact', head: true })
    .eq('band_id', bandId);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    console.error(`Band "${band.name}" already has ${count} songs. Aborting.`);
    process.exit(1);
  }

  const songRows = songs.map((song, index) => ({
    band_id: bandId,
    title: song.title,
    artist: song.artist || null,
    key: song.key || null,
    tempo: song.tempo || null,
    structure: song.structure || null,
    progression: song.progression || null,
    lyrics: song.lyrics || null,
    notes: song.notes || null,
    status: 'pending',
    sort_order: index
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from('songs')
    .insert(songRows)
    .select('id, sort_order');
  if (insertErr) throw insertErr;

  const songIdBySort = new Map(inserted.map((s) => [s.sort_order, s.id]));
  const tabRows = [];
  songs.forEach((song, index) => {
    const songId = songIdBySort.get(index);
    (song.tabs || []).forEach((tab, tabIndex) => {
      tabRows.push({
        song_id: songId,
        band_id: bandId,
        title: tab.title,
        content: tab.tab,
        position: tabIndex
      });
    });
  });

  if (tabRows.length > 0) {
    const { error: tabsErr } = await supabase.from('tabs').insert(tabRows);
    if (tabsErr) throw tabsErr;
  }

  console.log(`Inserted ${inserted.length} songs and ${tabRows.length} tabs into band "${band.name}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Commit**

```bash
git add setlist-app/supabase/rpcs.sql setlist-app/scripts/seed-band.js
git commit -m "feat(setlist-app): add seed_example_songs RPC and admin seed CLI"
```

---

## Sprint C — Auth Flow

### Task 8: Wrappers JS sobre RPCs de banda (TDD)

**Files:**
- Create: `setlist-app/src/db/bands.js`
- Test: `setlist-app/src/db/bands.test.js`

- [ ] **Step 1: Escribir tests**

Contenido completo de `setlist-app/src/db/bands.test.js`:
```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBand,
  createInvitation,
  acceptInvitation,
  leaveBand,
  deleteBand,
  seedExampleSongs,
  listMyBands,
  listBandMembers,
  listInvitations
} from './bands.js';

function fakeClient({ rpcImpl, fromImpl } = {}) {
  return {
    rpc(name, args) {
      return Promise.resolve(rpcImpl ? rpcImpl(name, args) : { data: null, error: null });
    },
    from(table) {
      return fromImpl ? fromImpl(table) : {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        then(resolve) { return resolve({ data: [], error: null }); }
      };
    }
  };
}

describe('db/bands wrappers', () => {
  it('createBand calls rpc with trimmed name + description', async () => {
    const calls = [];
    const client = fakeClient({
      rpcImpl(name, args) {
        calls.push({ name, args });
        return { data: 'band-uuid', error: null };
      }
    });
    const result = await createBand(client, { name: '  My Band  ', description: 'desc' });
    assert.equal(result, 'band-uuid');
    assert.deepEqual(calls, [{ name: 'create_band', args: { p_name: '  My Band  ', p_description: 'desc' } }]);
  });

  it('createBand throws when the RPC returns an error', async () => {
    const client = fakeClient({
      rpcImpl: () => ({ data: null, error: { message: 'boom' } })
    });
    await assert.rejects(() => createBand(client, { name: 'X' }), /boom/);
  });

  it('createInvitation passes band, email, role', async () => {
    const seen = [];
    const client = fakeClient({
      rpcImpl(name, args) {
        seen.push({ name, args });
        return { data: 'token-uuid', error: null };
      }
    });
    const token = await createInvitation(client, { bandId: 'b1', email: 'x@y.z', role: 'member' });
    assert.equal(token, 'token-uuid');
    assert.deepEqual(seen, [{ name: 'create_invitation', args: { p_band_id: 'b1', p_email: 'x@y.z', p_role: 'member' } }]);
  });

  it('acceptInvitation returns band id', async () => {
    const client = fakeClient({
      rpcImpl: (name, args) => {
        assert.equal(name, 'accept_invitation');
        assert.deepEqual(args, { p_token: 'tok' });
        return { data: 'band-uuid', error: null };
      }
    });
    assert.equal(await acceptInvitation(client, { token: 'tok' }), 'band-uuid');
  });

  it('leaveBand and deleteBand return void', async () => {
    const client = fakeClient({
      rpcImpl: () => ({ data: null, error: null })
    });
    assert.equal(await leaveBand(client, { bandId: 'b1' }), undefined);
    assert.equal(await deleteBand(client, { bandId: 'b1', confirmationName: 'My Band' }), undefined);
  });

  it('seedExampleSongs returns inserted count', async () => {
    const client = fakeClient({
      rpcImpl: () => ({ data: 37, error: null })
    });
    assert.equal(await seedExampleSongs(client, { bandId: 'b1' }), 37);
  });

  it('listMyBands queries band_members joined with bands', async () => {
    const client = fakeClient({
      fromImpl(table) {
        assert.equal(table, 'band_members');
        const builder = {
          select() { return builder; },
          eq() { return builder; },
          order() { return builder; },
          then(resolve) {
            return resolve({
              data: [
                { band_id: 'b1', role: 'admin', joined_at: '2026-01-01', bands: { id: 'b1', name: 'A', description: null } }
              ],
              error: null
            });
          }
        };
        return builder;
      }
    });
    const bands = await listMyBands(client, { userId: 'u1' });
    assert.deepEqual(bands, [
      { id: 'b1', name: 'A', description: null, role: 'admin', joinedAt: '2026-01-01' }
    ]);
  });

  it('listBandMembers returns rows from band_members joined with profiles', async () => {
    const client = fakeClient({
      fromImpl(table) {
        assert.equal(table, 'band_members');
        return {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          then(resolve) {
            return resolve({
              data: [{ user_id: 'u1', role: 'admin', joined_at: 't', profiles: { email: 'a@b.c' } }],
              error: null
            });
          }
        };
      }
    });
    const members = await listBandMembers(client, { bandId: 'b1' });
    assert.deepEqual(members, [{ userId: 'u1', email: 'a@b.c', role: 'admin', joinedAt: 't' }]);
  });

  it('listInvitations returns pending invitations', async () => {
    const client = fakeClient({
      fromImpl(table) {
        assert.equal(table, 'invitations');
        return {
          select() { return this; },
          eq() { return this; },
          is() { return this; },
          order() { return this; },
          then(resolve) {
            return resolve({
              data: [{ id: 'i1', email: 'x@y.z', role: 'member', token: 't', expires_at: '2026-12-31' }],
              error: null
            });
          }
        };
      }
    });
    const invites = await listInvitations(client, { bandId: 'b1' });
    assert.equal(invites.length, 1);
    assert.equal(invites[0].token, 't');
  });
});
```

- [ ] **Step 2: Correr tests para verificar que fallan**

Run:
```bash
cd setlist-app && node --test src/db/bands.test.js
```
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar wrappers**

Contenido completo de `setlist-app/src/db/bands.js`:
```js
function unwrap({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

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
    .select('user_id, role, joined_at, profiles ( email )')
    .eq('band_id', bandId)
    .order('joined_at', { ascending: true })) ?? [];
  return rows.map((row) => ({
    userId: row.user_id,
    email: row.profiles?.email ?? null,
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
```

- [ ] **Step 4: Correr tests para verificar que pasan**

Run:
```bash
cd setlist-app && node --test src/db/bands.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add setlist-app/src/db/bands.js setlist-app/src/db/bands.test.js
git commit -m "feat(setlist-app): add JS wrappers for band RPCs and queries"
```

---

### Task 9: Auth store con init de sesión y bands loading (TDD)

**Files:**
- Modify: `setlist-app/src/stores/auth.js`
- Create: `setlist-app/src/stores/auth.test.js`

- [ ] **Step 1: Escribir tests**

Contenido completo de `setlist-app/src/stores/auth.test.js`:
```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { $currentUser, $bands, $activeBandId, $authReady, initAuthStore, signOut } from './auth.js';

function fakeSupabase({ session = null, bands = [], onAuthChange } = {}) {
  let handler = null;
  return {
    auth: {
      async getSession() { return { data: { session }, error: null }; },
      onAuthStateChange(cb) {
        handler = cb;
        if (onAuthChange) onAuthChange(cb);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signOut() { handler && handler('SIGNED_OUT', null); return { error: null }; }
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        then(resolve) {
          const rows = bands.map((b, i) => ({
            band_id: b.id,
            role: b.role || 'admin',
            joined_at: b.joinedAt || `2026-01-${String(i + 1).padStart(2, '0')}`,
            bands: { id: b.id, name: b.name, description: null }
          }));
          return resolve({ data: rows, error: null });
        }
      };
    }
  };
}

describe('stores/auth', () => {
  beforeEach(() => {
    $currentUser.set(null);
    $bands.set([]);
    $activeBandId.set(null);
    $authReady.set(false);
  });

  it('initAuthStore loads no user when there is no session', async () => {
    const supabase = fakeSupabase({ session: null });
    await initAuthStore(supabase);
    assert.equal($currentUser.get(), null);
    assert.deepEqual($bands.get(), []);
    assert.equal($activeBandId.get(), null);
    assert.equal($authReady.get(), true);
  });

  it('initAuthStore loads user, bands and selects first band by joined_at', async () => {
    const supabase = fakeSupabase({
      session: { user: { id: 'u1', email: 'a@b.c' } },
      bands: [
        { id: 'b2', name: 'Older', joinedAt: '2026-01-01' },
        { id: 'b1', name: 'Newer', joinedAt: '2026-02-01' }
      ]
    });
    await initAuthStore(supabase);
    assert.equal($currentUser.get().email, 'a@b.c');
    assert.equal($bands.get().length, 2);
    assert.equal($activeBandId.get(), 'b2', 'first by joined_at ascending');
    assert.equal($authReady.get(), true);
  });

  it('signOut clears user/bands and routes intent', async () => {
    const supabase = fakeSupabase({ session: { user: { id: 'u1', email: 'a@b.c' } } });
    await initAuthStore(supabase);
    assert.ok($currentUser.get());
    await signOut(supabase);
    assert.equal($currentUser.get(), null);
    assert.deepEqual($bands.get(), []);
    assert.equal($activeBandId.get(), null);
  });

  it('initAuthStore tolerates a null client (env not configured)', async () => {
    await initAuthStore(null);
    assert.equal($currentUser.get(), null);
    assert.equal($authReady.get(), true);
  });
});
```

- [ ] **Step 2: Correr tests para verificar que fallan**

Run:
```bash
cd setlist-app && node --test src/stores/auth.test.js
```
Expected: FAIL (exports faltan).

- [ ] **Step 3: Implementar auth store**

Contenido completo (reemplaza) de `setlist-app/src/stores/auth.js`:
```js
import { atom } from 'nanostores';
import { listMyBands } from '@/db/bands.js';

export const $currentUser = atom(null);
export const $bands = atom([]);
export const $activeBandId = atom(null);
export const $authReady = atom(false);

export function setCurrentUser(user) {
  $currentUser.set(user ?? null);
}

export function clearCurrentUser() {
  $currentUser.set(null);
  $bands.set([]);
  $activeBandId.set(null);
}

async function loadBandsFor(client, userId) {
  if (!client || !userId) {
    $bands.set([]);
    $activeBandId.set(null);
    return;
  }
  const bands = await listMyBands(client, { userId });
  $bands.set(bands);
  if (bands.length > 0) {
    const current = $activeBandId.get();
    const stillThere = bands.find((b) => b.id === current);
    $activeBandId.set(stillThere ? current : bands[0].id);
  } else {
    $activeBandId.set(null);
  }
}

export async function initAuthStore(client) {
  if (!client) {
    $authReady.set(true);
    return;
  }
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const session = data?.session ?? null;
  if (session?.user) {
    $currentUser.set(session.user);
    await loadBandsFor(client, session.user.id);
  } else {
    clearCurrentUser();
  }
  client.auth.onAuthStateChange(async (event, nextSession) => {
    if (event === 'SIGNED_OUT' || !nextSession?.user) {
      clearCurrentUser();
      return;
    }
    $currentUser.set(nextSession.user);
    await loadBandsFor(client, nextSession.user.id);
  });
  $authReady.set(true);
}

export async function signOut(client) {
  if (client) await client.auth.signOut();
  clearCurrentUser();
}

export function setActiveBand(bandId) {
  $activeBandId.set(bandId ?? null);
}

export async function refreshBands(client) {
  const user = $currentUser.get();
  if (!user || !client) return;
  await loadBandsFor(client, user.id);
}
```

- [ ] **Step 4: Correr tests para verificar que pasan**

Run:
```bash
cd setlist-app && node --test src/stores/auth.test.js
```
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add setlist-app/src/stores/auth.js setlist-app/src/stores/auth.test.js
git commit -m "feat(setlist-app): init auth store with session and bands loading"
```

---

### Task 10: Vista `Login.js` (magic link)

**Files:**
- Create: `setlist-app/src/views/Login.js`

- [ ] **Step 1: Implementar la vista**

Contenido completo de `setlist-app/src/views/Login.js`:
```js
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { getSupabase, isSupabaseConfigured } from '@/db/supabase.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Login({ next = null }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ kind: 'idle' });

  if (!isSupabaseConfigured()) {
    return html`
      <main class="auth-shell">
        <h1>Configuracion incompleta</h1>
        <p>Faltan <code>VITE_SUPABASE_URL</code> o <code>VITE_SUPABASE_ANON_KEY</code> en <code>.env.local</code>.</p>
      </main>
    `;
  }

  async function onSubmit(event) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setStatus({ kind: 'error', message: 'Ingresa un email valido.' });
      return;
    }
    setStatus({ kind: 'sending' });
    const supabase = getSupabase();
    const redirect = `${window.location.origin}/auth/callback`
      + (next ? `?next=${encodeURIComponent(next)}` : '');
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirect }
    });
    if (error) {
      setStatus({ kind: 'error', message: error.message });
      return;
    }
    setStatus({ kind: 'sent' });
  }

  return html`
    <main class="auth-shell" aria-labelledby="login-title">
      <h1 id="login-title">Ingresar</h1>
      <p>Te enviaremos un link al email para acceder.</p>

      <form onSubmit=${onSubmit} class="auth-form">
        <label>
          Email
          <input
            type="email"
            required
            value=${email}
            onInput=${(e) => setEmail(e.currentTarget.value)}
            disabled=${status.kind === 'sending'}
          />
        </label>
        <button type="submit" disabled=${status.kind === 'sending'}>
          ${status.kind === 'sending' ? 'Enviando…' : 'Enviar magic link'}
        </button>
      </form>

      ${status.kind === 'sent' && html`<p class="auth-success">Revisa tu email para continuar.</p>`}
      ${status.kind === 'error' && html`<p class="auth-error">${status.message}</p>`}
    </main>
  `;
}
```

- [ ] **Step 2: Commit**

```bash
git add setlist-app/src/views/Login.js
git commit -m "feat(setlist-app): add Login view with magic link"
```

---

### Task 11: Vista `AuthCallback.js` (PKCE exchange)

**Files:**
- Create: `setlist-app/src/views/AuthCallback.js`

- [ ] **Step 1: Implementar la vista**

Contenido completo de `setlist-app/src/views/AuthCallback.js`:
```js
import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { getSupabase } from '@/db/supabase.js';

export function AuthCallback({ navigate }) {
  const [status, setStatus] = useState('exchanging');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const next = params.get('next') || '/';
      if (!code) {
        setStatus('error');
        setErrorMessage('Link invalido o expirado. Volve a /login.');
        return;
      }
      const supabase = getSupabase();
      if (!supabase) {
        setStatus('error');
        setErrorMessage('Supabase no esta configurado.');
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setStatus('error');
        setErrorMessage(error.message);
        return;
      }
      navigate(next, { replace: true });
    }
    run();
  }, []);

  if (status === 'error') {
    return html`
      <main class="auth-shell">
        <h1>No pudimos completar el ingreso</h1>
        <p>${errorMessage}</p>
        <a href="/login" onClick=${(e) => { e.preventDefault(); navigate('/login', { replace: true }); }}>Volver a /login</a>
      </main>
    `;
  }

  return html`
    <main class="auth-shell">
      <p>Validando…</p>
    </main>
  `;
}
```

- [ ] **Step 2: Commit**

```bash
git add setlist-app/src/views/AuthCallback.js
git commit -m "feat(setlist-app): add AuthCallback view with PKCE exchange"
```

---

## Sprint D — Router y Routes

### Task 12: Vista `Home.js` placeholder

**Files:**
- Create: `setlist-app/src/views/Home.js`

- [ ] **Step 1: Implementar placeholder**

Contenido completo de `setlist-app/src/views/Home.js`:
```js
import { html } from 'htm/preact';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $currentUser, $bands, $activeBandId, signOut } from '@/stores/auth.js';
import { getSupabase } from '@/db/supabase.js';

export function Home({ navigate }) {
  const user = useStoreValue($currentUser);
  const bands = useStoreValue($bands);
  const activeBandId = useStoreValue($activeBandId);
  const activeBand = bands.find((b) => b.id === activeBandId);

  return html`
    <main class="app-shell">
      <header class="app-header">
        <h1>${activeBand ? activeBand.name : 'Setlist'}</h1>
        <nav>
          ${activeBand && html`
            <a href=${`/band/${activeBand.id}/settings`} onClick=${(e) => { e.preventDefault(); navigate(`/band/${activeBand.id}/settings`); }}>Ajustes</a>
          `}
          <button type="button" onClick=${async () => { await signOut(getSupabase()); navigate('/login', { replace: true }); }}>Salir</button>
        </nav>
      </header>
      <section>
        <p>Hola ${user?.email}. Las canciones llegan en Fase 2.</p>
      </section>
    </main>
  `;
}
```

- [ ] **Step 2: Commit**

```bash
git add setlist-app/src/views/Home.js
git commit -m "feat(setlist-app): add Home placeholder view"
```

---

### Task 13: Reescribir `app.js` con router

**Files:**
- Modify: `setlist-app/src/app.js`

- [ ] **Step 1: Reemplazar el shell de Fase 0**

Contenido completo (reemplaza) de `setlist-app/src/app.js`:
```js
import { html } from 'htm/preact';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $currentUser, $bands, $authReady } from '@/stores/auth.js';
import { Login } from '@/views/Login.js';
import { AuthCallback } from '@/views/AuthCallback.js';
import { Onboarding } from '@/views/Onboarding.js';
import { InviteAccept } from '@/views/InviteAccept.js';
import { BandSettings } from '@/views/BandSettings.js';
import { Home } from '@/views/Home.js';

function decidePostLogin({ route, bands, search }) {
  const REENTRY = new Set(['login', 'auth-callback', 'home']);
  if (!REENTRY.has(route.name)) return null;
  const next = new URLSearchParams(search).get('next');
  if (next && next !== route.path) return { path: next, replace: true };
  if (bands.length === 0) {
    return route.name === 'onboarding' ? null : { path: '/onboarding', replace: true };
  }
  return { path: `/band/${bands[0].id}`, replace: true };
}

function decideUnauthRedirect({ route }) {
  const PUBLIC = new Set(['login', 'auth-callback']);
  if (PUBLIC.has(route.name)) return null;
  const target = route.name === 'invite-accept'
    ? `/login?next=${encodeURIComponent(route.path)}`
    : '/login';
  return { path: target, replace: true };
}

export function App({ router }) {
  const route = useStoreValue(router.$route);
  const user = useStoreValue($currentUser);
  const bands = useStoreValue($bands);
  const ready = useStoreValue($authReady);

  if (!ready) {
    return html`<main class="app-shell"><p>Cargando…</p></main>`;
  }

  if (!route) {
    return html`<main class="app-shell"><h1>404</h1></main>`;
  }

  if (!user) {
    const redirect = decideUnauthRedirect({ route });
    if (redirect) {
      router.navigate(redirect.path, { replace: true });
      return null;
    }
  } else {
    const redirect = decidePostLogin({ route, bands, search: window.location.search });
    if (redirect) {
      router.navigate(redirect.path, { replace: true });
      return null;
    }
  }

  const navigate = (path, opts) => router.navigate(path, opts);

  switch (route.name) {
    case 'login':
      return html`<${Login} next=${new URLSearchParams(window.location.search).get('next')} />`;
    case 'auth-callback':
      return html`<${AuthCallback} navigate=${navigate} />`;
    case 'onboarding':
      return html`<${Onboarding} navigate=${navigate} />`;
    case 'invite-accept':
      return html`<${InviteAccept} token=${route.params.token} navigate=${navigate} />`;
    case 'band-settings':
      return html`<${BandSettings} bandId=${route.params.bandId} navigate=${navigate} />`;
    case 'band-home':
      return html`<${Home} navigate=${navigate} />`;
    case 'home':
    default:
      return html`<${Home} navigate=${navigate} />`;
  }
}
```

- [ ] **Step 2: Commit (sin correr aun: las views faltantes vienen en Sprint E)**

No correr el dev server todavia — faltan `Onboarding`, `InviteAccept`, `BandSettings`.
```bash
git add setlist-app/src/app.js
git commit -m "feat(setlist-app): rewrite app shell as router-based"
```

---

### Task 14: Wiring del router en `main.js`

**Files:**
- Modify: `setlist-app/src/main.js`

- [ ] **Step 1: Reescribir main.js**

Contenido completo (reemplaza) de `setlist-app/src/main.js`:
```js
import { render } from 'preact';
import { html } from 'htm/preact';
import { App } from './app.js';
import { exposeDevtools } from './devtools.js';
import { createRouter } from '@/lib/router.js';
import { initAuthStore } from '@/stores/auth.js';
import { getSupabase } from '@/db/supabase.js';
import './style.css';

const root = document.querySelector('#app');

if (!root) {
  throw new Error('Missing #app root element');
}

const routes = [
  { pattern: '/', name: 'home' },
  { pattern: '/login', name: 'login' },
  { pattern: '/auth/callback', name: 'auth-callback' },
  { pattern: '/onboarding', name: 'onboarding' },
  { pattern: '/invite/:token', name: 'invite-accept' },
  { pattern: '/band/:bandId/settings', name: 'band-settings' },
  { pattern: '/band/:bandId', name: 'band-home' }
];

const router = createRouter(routes, { window });

exposeDevtools();
initAuthStore(getSupabase()).catch((err) => {
  console.error('initAuthStore failed', err);
});

render(html`<${App} router=${router} />`, root);
```

- [ ] **Step 2: Commit**

```bash
git add setlist-app/src/main.js
git commit -m "feat(setlist-app): wire router and auth init in entrypoint"
```

---

## Sprint E — Vistas de Banda

### Task 15: Vista `Onboarding.js`

**Files:**
- Create: `setlist-app/src/views/Onboarding.js`

- [ ] **Step 1: Implementar la vista**

Contenido completo de `setlist-app/src/views/Onboarding.js`:
```js
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { getSupabase } from '@/db/supabase.js';
import { createBand, seedExampleSongs } from '@/db/bands.js';
import { refreshBands } from '@/stores/auth.js';

function parseToken(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/invite\/([a-z0-9-]+)/i);
  return match ? match[1] : trimmed;
}

export function Onboarding({ navigate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [withSeed, setWithSeed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [tokenInput, setTokenInput] = useState('');

  async function onCreate(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Nombre requerido.');
      return;
    }
    setError('');
    setWarning('');
    setCreating(true);
    try {
      const supabase = getSupabase();
      const bandId = await createBand(supabase, { name: trimmed, description: description.trim() || null });
      if (withSeed) {
        try {
          await seedExampleSongs(supabase, { bandId });
        } catch (err) {
          setWarning(`Banda creada, pero el seed fallo: ${err.message}`);
        }
      }
      await refreshBands(supabase);
      navigate(`/band/${bandId}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function onGoToInvite() {
    const token = parseToken(tokenInput);
    if (!token) {
      setError('Pegá un link o token de invitación.');
      return;
    }
    navigate(`/invite/${token}`);
  }

  return html`
    <main class="onboarding-shell">
      <h1>Bienvenido</h1>

      <section>
        <h2>Crear banda nueva</h2>
        <form onSubmit=${onCreate}>
          <label>
            Nombre
            <input value=${name} onInput=${(e) => setName(e.currentTarget.value)} required />
          </label>
          <label>
            Descripcion
            <input value=${description} onInput=${(e) => setDescription(e.currentTarget.value)} />
          </label>
          <label>
            <input
              type="checkbox"
              checked=${withSeed}
              onInput=${(e) => setWithSeed(e.currentTarget.checked)}
            />
            Empezar con canciones de ejemplo
          </label>
          <button type="submit" disabled=${creating}>
            ${creating ? 'Creando…' : 'Crear banda'}
          </button>
        </form>
        ${error && html`<p class="auth-error">${error}</p>`}
        ${warning && html`<p class="auth-warning">${warning}</p>`}
      </section>

      <section>
        <h2>Tengo un link de invitación</h2>
        <label>
          Link o token
          <input value=${tokenInput} onInput=${(e) => setTokenInput(e.currentTarget.value)} />
        </label>
        <button type="button" onClick=${onGoToInvite}>Continuar</button>
      </section>
    </main>
  `;
}
```

- [ ] **Step 2: Commit**

```bash
git add setlist-app/src/views/Onboarding.js
git commit -m "feat(setlist-app): add Onboarding view (create band + invite intake)"
```

---

### Task 16: Vista `InviteAccept.js`

**Files:**
- Create: `setlist-app/src/views/InviteAccept.js`

- [ ] **Step 1: Implementar la vista**

Contenido completo de `setlist-app/src/views/InviteAccept.js`:
```js
import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { getSupabase } from '@/db/supabase.js';
import { acceptInvitation } from '@/db/bands.js';
import { refreshBands } from '@/stores/auth.js';

export function InviteAccept({ token, navigate }) {
  const [invite, setInvite] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const supabase = getSupabase();
      // Read minimal invite data via select; RLS on invitations only allows admins,
      // so this select will likely return nothing for non-admins. We still attempt
      // accept_invitation and rely on its server-side validation.
      const { data } = await supabase
        .from('invitations')
        .select('band_id, role, expires_at, bands ( name )')
        .eq('token', token)
        .maybeSingle();
      setInvite(data);
      setStatus('ready');
    }
    load();
  }, [token]);

  async function onAccept() {
    setStatus('accepting');
    setError('');
    try {
      const supabase = getSupabase();
      const bandId = await acceptInvitation(supabase, { token });
      await refreshBands(supabase);
      navigate(`/band/${bandId}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setStatus('ready');
    }
  }

  if (status === 'loading') {
    return html`<main class="auth-shell"><p>Cargando invitación…</p></main>`;
  }

  return html`
    <main class="auth-shell">
      <h1>Invitación</h1>
      ${invite
        ? html`<p>Te invitaron a unirte a <strong>${invite.bands?.name ?? 'una banda'}</strong> como ${invite.role}.</p>`
        : html`<p>No tenemos datos previos de esta invitación. Si el token es válido, podés intentar aceptarla igualmente.</p>`}
      ${error && html`<p class="auth-error">${error}</p>`}
      <div class="auth-actions">
        <button type="button" onClick=${onAccept} disabled=${status === 'accepting'}>
          ${status === 'accepting' ? 'Aceptando…' : 'Aceptar'}
        </button>
        <button type="button" onClick=${() => navigate('/', { replace: true })}>Rechazar</button>
      </div>
    </main>
  `;
}
```

- [ ] **Step 2: Commit**

```bash
git add setlist-app/src/views/InviteAccept.js
git commit -m "feat(setlist-app): add InviteAccept view"
```

---

### Task 17: Vista `BandSettings.js` con tres tabs

**Files:**
- Create: `setlist-app/src/views/BandSettings.js`

- [ ] **Step 1: Implementar la vista completa**

Contenido completo de `setlist-app/src/views/BandSettings.js`:
```js
import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { getSupabase } from '@/db/supabase.js';
import {
  listBandMembers,
  listInvitations,
  createInvitation,
  leaveBand,
  deleteBand
} from '@/db/bands.js';
import { refreshBands, $currentUser, $bands } from '@/stores/auth.js';
import { useStoreValue } from '@/stores/useStoreValue.js';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'members', label: 'Miembros' },
  { id: 'advanced', label: 'Avanzado' }
];

export function BandSettings({ bandId, navigate }) {
  const [tab, setTab] = useState('general');
  const currentUser = useStoreValue($currentUser);
  const bands = useStoreValue($bands);
  const band = bands.find((b) => b.id === bandId);
  const isAdmin = band?.role === 'admin';

  return html`
    <main class="settings-shell">
      <header class="settings-header">
        <h1>${band?.name ?? 'Banda'}</h1>
        <button type="button" onClick=${() => navigate(`/band/${bandId}`)}>Volver</button>
      </header>
      <nav class="settings-tabs" role="tablist">
        ${TABS.map((t) => html`
          <button
            type="button"
            role="tab"
            aria-selected=${tab === t.id}
            onClick=${() => setTab(t.id)}
            class=${tab === t.id ? 'tab tab-active' : 'tab'}
          >${t.label}</button>
        `)}
      </nav>
      <section>
        ${tab === 'general' && html`<${GeneralTab} bandId=${bandId} band=${band} isAdmin=${isAdmin} />`}
        ${tab === 'members' && html`<${MembersTab} bandId=${bandId} currentUserId=${currentUser?.id} isAdmin=${isAdmin} />`}
        ${tab === 'advanced' && html`<${AdvancedTab} bandId=${bandId} band=${band} isAdmin=${isAdmin} navigate=${navigate} />`}
      </section>
    </main>
  `;
}

function GeneralTab({ bandId, band, isAdmin }) {
  const [name, setName] = useState(band?.name ?? '');
  const [description, setDescription] = useState(band?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(band?.name ?? '');
    setDescription(band?.description ?? '');
  }, [band?.id]);

  async function onSave(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const supabase = getSupabase();
    const { error } = await supabase
      .from('bands')
      .update({ name: name.trim(), description: description.trim() || null })
      .eq('id', bandId);
    if (error) setMessage(error.message);
    else {
      setMessage('Guardado.');
      await refreshBands(supabase);
    }
    setSaving(false);
  }

  return html`
    <form onSubmit=${onSave}>
      <label>
        Nombre
        <input value=${name} onInput=${(e) => setName(e.currentTarget.value)} disabled=${!isAdmin} />
      </label>
      <label>
        Descripcion
        <input value=${description} onInput=${(e) => setDescription(e.currentTarget.value)} disabled=${!isAdmin} />
      </label>
      ${isAdmin && html`
        <button type="submit" disabled=${saving}>${saving ? 'Guardando…' : 'Guardar'}</button>
      `}
      ${message && html`<p>${message}</p>`}
    </form>
  `;
}

function MembersTab({ bandId, currentUserId, isAdmin }) {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [generatedLink, setGeneratedLink] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const supabase = getSupabase();
    try {
      const [m, i] = await Promise.all([
        listBandMembers(supabase, { bandId }),
        isAdmin ? listInvitations(supabase, { bandId }) : Promise.resolve([])
      ]);
      setMembers(m);
      setInvites(i);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [bandId]);

  async function onGenerate(event) {
    event.preventDefault();
    setError('');
    setGeneratedLink('');
    try {
      const supabase = getSupabase();
      const token = await createInvitation(supabase, { bandId, email: inviteEmail, role: inviteRole });
      setGeneratedLink(`${window.location.origin}/invite/${token}`);
      setInviteEmail('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onRoleChange(member, role) {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('band_members')
      .update({ role })
      .eq('band_id', bandId)
      .eq('user_id', member.userId);
    if (error) setError(error.message);
    else load();
  }

  async function onRemove(member) {
    if (!confirm(`Quitar a ${member.email}?`)) return;
    const supabase = getSupabase();
    const { error } = await supabase
      .from('band_members')
      .delete()
      .eq('band_id', bandId)
      .eq('user_id', member.userId);
    if (error) setError(error.message);
    else load();
  }

  if (loading) return html`<p>Cargando…</p>`;

  return html`
    <div>
      <h2>Miembros</h2>
      <ul class="members-list">
        ${members.map((m) => html`
          <li key=${m.userId}>
            <span>${m.email}</span>
            ${isAdmin && m.userId !== currentUserId ? html`
              <select value=${m.role} onChange=${(e) => onRoleChange(m, e.currentTarget.value)}>
                <option value="admin">admin</option>
                <option value="member">member</option>
              </select>
              <button type="button" onClick=${() => onRemove(m)}>Quitar</button>
            ` : html`<span>(${m.role})</span>`}
          </li>
        `)}
      </ul>

      ${isAdmin && html`
        <section>
          <h3>Invitaciones</h3>
          <form onSubmit=${onGenerate}>
            <label>
              Email
              <input type="email" required value=${inviteEmail} onInput=${(e) => setInviteEmail(e.currentTarget.value)} />
            </label>
            <label>
              Rol
              <select value=${inviteRole} onChange=${(e) => setInviteRole(e.currentTarget.value)}>
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <button type="submit">Generar invitación</button>
          </form>
          ${generatedLink && html`
            <p>Link generado: <input readonly value=${generatedLink} onClick=${(e) => e.currentTarget.select()} /></p>
          `}
          <ul>
            ${invites.map((i) => html`
              <li key=${i.id}>${i.email} (${i.role}) — expira ${i.expiresAt}</li>
            `)}
          </ul>
        </section>
      `}

      ${error && html`<p class="auth-error">${error}</p>`}
    </div>
  `;
}

function AdvancedTab({ bandId, band, isAdmin, navigate }) {
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onLeave() {
    if (!confirm('¿Salir de esta banda?')) return;
    setBusy(true);
    setError('');
    try {
      const supabase = getSupabase();
      await leaveBand(supabase, { bandId });
      await refreshBands(supabase);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function onDelete(event) {
    event.preventDefault();
    if (confirmName.trim() !== band?.name) {
      setError('El nombre no coincide.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const supabase = getSupabase();
      await deleteBand(supabase, { bandId, confirmationName: confirmName.trim() });
      await refreshBands(supabase);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return html`
    <div>
      <section>
        <h2>Abandonar banda</h2>
        <button type="button" onClick=${onLeave} disabled=${busy}>Abandonar</button>
      </section>
      ${isAdmin && html`
        <section>
          <h2>Borrar banda</h2>
          <p>Escribi <strong>${band?.name}</strong> para confirmar.</p>
          <form onSubmit=${onDelete}>
            <input value=${confirmName} onInput=${(e) => setConfirmName(e.currentTarget.value)} />
            <button type="submit" disabled=${busy}>Borrar</button>
          </form>
        </section>
      `}
      ${error && html`<p class="auth-error">${error}</p>`}
    </div>
  `;
}
```

- [ ] **Step 2: Commit**

```bash
git add setlist-app/src/views/BandSettings.js
git commit -m "feat(setlist-app): add BandSettings view (general/members/advanced)"
```

---

### Task 18: Validacion end-to-end manual + tests completos

**Files:** (sin cambios; solo verificacion)

- [ ] **Step 1: Correr toda la suite de tests**

Run:
```bash
cd setlist-app && npm test
```
Expected: PASS para todos los archivos `.test.js` (al menos: chords, transpose, metronome, router, songs.json seed, supabase, bands wrappers, auth store).

- [ ] **Step 2: Configurar `.env.local` real**

Crear `setlist-app/.env.local` con los valores reales del proyecto Supabase:
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

- [ ] **Step 3: Configurar redirect URL en Supabase Dashboard**

Dashboard → Authentication → URL Configuration → Redirect URLs: agregar `http://localhost:5173/auth/callback`.

- [ ] **Step 4: Levantar dev server y validar flujo completo**

Run:
```bash
cd setlist-app && npm run dev
```

Validar manualmente en el browser:
1. Visitar `http://localhost:5173/` → redirige a `/login`.
2. Enviar magic link → recibir email → click → vuelve a `/auth/callback` y luego a `/onboarding`.
3. En `/onboarding`, crear banda con checkbox de seed activo → debe quedar en `/band/<id>` con 37 canciones en DB.
4. Ir a `/band/<id>/settings` → tab Members → generar invitación → copiar link.
5. Logout. Abrir link de invitación en otra sesión (otro email) → aceptar → quedar en `/band/<id>`.
6. Probar Advanced → leave / delete con confirmación por nombre.

- [ ] **Step 5: Documentar findings (si los hay)**

Si encontrás bugs durante validación manual, abrir issues o tasks adicionales, NO arreglar inline sin commit.

- [ ] **Step 6: Commit final solo si hubo cambios menores en validacion**

```bash
# Si no hay cambios, omitir este paso.
git status
```

---

## Notas finales

- Las migraciones SQL (`schema.sql`, `rpcs.sql`, `seed_example_data.sql`) se aplican manualmente al proyecto Supabase. No hay CLI; el control de versiones del schema vive en este repo.
- El email template default de Supabase debe quedar como está (genera `code`, no `token_hash`). Si en el futuro se personaliza el template, `AuthCallback.js` necesita cambiar a `verifyOtp({ token_hash, type })`.
- El service role key de `seed-band.js` JAMÁS debe llegar al frontend. Solo usar en CLI local o entornos admin.
- Edge Function para envío de emails de invitación queda explícitamente fuera de scope de Fase 1.
