# Fase 1 — Backend y Autenticación (Design Spec)

**Fecha:** 2026-05-25
**Proyecto:** setlist-app (Preact + Vite, rama `setlist-app/`)
**Alcance:** F1-1 a F1-10 del PLAN_DESARROLLO.md

---

## Contexto

`setlist-app/` es la nueva versión de la app, construida sobre la base de Fase 0 (libs puras + router + stores). La Fase 1 agrega el backend Supabase con un modelo multi-banda. El proyecto Supabase existente se reutiliza con un reset limpio del schema (no migración incremental). El schema anterior del `main` branch queda obsoleto.

---

## Sección 1 — Schema de base de datos

**Archivo:** `setlist-app/supabase/schema.sql`

### Tablas

```
profiles(id → auth.users, email, created_at, updated_at)
bands(id, name, description, created_at, updated_at)
band_members(band_id → bands, user_id → auth.users, role[admin|member], joined_at)
invitations(id, band_id → bands, email, role[admin|member], token UNIQUE, expires_at, accepted_at)

songs(id, band_id → bands, title, artist, key, tempo, structure, progression,
      lyrics, notes, status[pending|rehearsing|ready], sort_order, created_at, updated_at)
tabs(id, song_id → songs, band_id → bands, title, content, position)
song_images(id, song_id → songs, band_id → bands, user_id → auth.users, storage_path, created_at)
comments(id, song_id → songs, band_id → bands, user_id → auth.users nullable,
         author_name_snapshot, text, color[yellow|pink|blue|green|orange], created_at)
favorites(user_id → auth.users, song_id → songs, band_id → bands)

example_seed_songs(id, title, artist, key, tempo, structure, progression, lyrics, notes, sort_order)
example_seed_tabs(id, song_id → example_seed_songs, title, content, position)
```

**Tipos:** UUID con `gen_random_uuid()`, `timestamptz`, `text` con CHECK para role/status/color. No enums.

**Claves primarias:**
- `band_members`: PK compuesta `(band_id, user_id)`
- `favorites`: PK compuesta `(user_id, song_id)`
- Resto: UUID `id`

**Cascades:**
- Borrar `bands` → borra `band_members`, `invitations`, `songs`
- Borrar `songs` → borra `tabs`, `song_images`, `comments` (FK cascades), favoritos
- Borrar usuario → borra `band_members`, `favorites`; `comments.user_id` → SET NULL (conserva `author_name_snapshot`)

**Triggers:**
- `set_updated_at()` en `bands`, `songs`, `profiles`
- `handle_new_user()` en `auth.users` → inserta en `profiles(id, email)`

### Índices

```sql
band_members(user_id, band_id)
songs(band_id, sort_order)
tabs(song_id, position)
comments(song_id, created_at)
favorites(song_id)
invitations(token) UNIQUE
```

### RLS y helpers

RLS habilitado en todas las tablas excepto `example_seed_songs` y `example_seed_tabs` (solo acceso via RPC).

**Helpers (`SECURITY DEFINER`, `SET search_path = public`):**
```sql
is_band_member(band_id uuid) → boolean
is_band_admin(band_id uuid) → boolean
```

**Políticas base por tabla:**

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | miembros de la misma banda | — | propio | — |
| `bands` | `is_band_member` | via RPC | `is_band_admin` | via RPC |
| `band_members` | `is_band_member` | via RPC | `is_band_admin` | via RPC |
| `invitations` | `is_band_admin` | via RPC | — | `is_band_admin` |
| `songs` | `is_band_member` | `is_band_admin` | `is_band_admin` | `is_band_admin` |
| `tabs` | `is_band_member` | `is_band_admin` | `is_band_admin` | `is_band_admin` |
| `song_images` | `is_band_member` | `is_band_member` | — | propio o admin |
| `comments` | `is_band_member` | `is_band_member` | propio | propio o admin |
| `favorites` | `user_id = auth.uid()` | propio | — | propio |

---

## Sección 2 — Cliente Supabase + Auth Magic Link

### Cliente (`src/db/supabase.js`)

Init lazy: retorna `null` si faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`. La UI muestra un error controlado en ese caso.

```js
createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'pkce',
    detectSessionInUrl: false   // el callback hace el exchange manual
  }
})
```

**Env files:**
- `.env.example` — en git con placeholders (`VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`)
- `.env.local` — fuera de git

### Magic link flow (PKCE)

1. `views/Login.js` — valida email, llama `signInWithOtp({ email, options: { emailRedirectTo: origin + '/auth/callback' } })`, muestra estado "revisá tu email".
2. Usuario hace click en el email → redirige a `/auth/callback?code=...`
3. `views/AuthCallback.js` — lee `code` desde `window.location.search`, llama `exchangeCodeForSession(code)`, redirige con `replace` al home (o a `?next=...` si existe).
4. Si no hay `code` o hay error, muestra estado de error con link a `/login`.

> **Nota:** mantener el email template default de Supabase. Si en el futuro se usa `token_hash`, el callback debe usar `verifyOtp({ token_hash, type: 'email' })` en vez de `exchangeCodeForSession`.

### Auth store (`src/stores/auth.js`)

Al inicializar:
1. `getSession()` → carga `$currentUser` si hay sesión persistida
2. Consulta `band_members` del usuario → actualiza `$bands` y `$activeBandId`
3. Escucha `onAuthStateChange()` para mantener estado sincronizado

Logout: `signOut()` → clear `$currentUser`, `$bands`, `$activeBandId` → `navigate('/login', { replace: true })`.

**Redirect URLs en Supabase Dashboard** (configurar manualmente):
- `http://localhost:5173/auth/callback`
- URL de producción cuando esté disponible

---

## Sección 3 — Bandas, Onboarding y Miembros

### Post-login routing

```
autenticado?
  no → /login
  sí → tiene ?next= → ir a ?next
       tiene bandas → /band/:bandId (primera por joined_at)
       no tiene bandas → /onboarding
```

### RPCs (todas `SECURITY DEFINER`, `SET search_path = public`)

**`create_band(name text, description text) → band_id uuid`**
- Requiere usuario autenticado
- Inserta en `bands` + inserta en `band_members` con `role='admin'` en una operación atómica
- Retorna `band_id`

**`create_invitation(band_id uuid, email text, role text) → token uuid`**
- Requiere `is_band_admin(band_id)`
- Normaliza email a minúsculas
- Genera token con `gen_random_uuid()`, guarda `expires_at = now() + interval '7 days'`
- Retorna token (la UI construye el link `/invite/:token`)

**`accept_invitation(token uuid) → void`**
- Requiere usuario autenticado
- Valida: token existe, `accepted_at IS NULL`, `expires_at > now()`, `email = auth.jwt()->>'email'`
- Inserta en `band_members`; marca `accepted_at = now()`

**`leave_band(band_id uuid) → void`**
- Si NO soy el único admin → se remueve de `band_members`
- Si soy el único admin pero hay otros miembros → promueve al miembro con `joined_at` más antiguo, luego se remueve
- Si soy el único miembro → borra la banda (cascade se encarga del resto)

**`delete_band(band_id uuid, confirmation_name text) → void`**
- Requiere `is_band_admin(band_id)`
- Valida `confirmation_name = bands.name` (comparación exacta)
- Ejecuta `DELETE FROM bands WHERE id = band_id`

### Vistas

**`/onboarding`** — pantalla post-login sin banda. Dos acciones:
- "Crear banda nueva" → form nombre + descripción + checkbox seed → llama `create_band()`
- "Tengo un link de invitación" → input de URL o token → navega a `/invite/:token`

**`/band/:bandId/settings`** — `BandSettings.js` con tres tabs:
- **General**: nombre + descripción. Lectura para members; edición para admins.
- **Members**: lista `profiles.email` + rol. Botones cambiar rol / expulsar (admin only). Botón "Generar invitación" → modal con link para copiar.
- **Advanced**: "Abandonar banda" (todos) + "Borrar banda" con confirmación por nombre (admin only).

**`/invite/:token`** — `InviteAccept.js`:
- Si no hay sesión → `navigate('/login?next=/invite/:token')`
- Muestra nombre de banda + invitador + rol ofrecido
- Botones: Aceptar → `accept_invitation(token)` + navigate al home de la banda; Rechazar → navigate a `/`

### Tabla `profiles`

```sql
profiles(id references auth.users, email text, created_at, updated_at)
```
Trigger `handle_new_user()` en `after insert on auth.users` → inserta `(new.id, new.email)`.
RLS: un usuario puede leer perfiles de quienes comparten al menos una banda.

---

## Sección 4 — Seeds (F1-10)

### Script de dev/admin

**`setlist-app/scripts/seed-band.js`**

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-band.js <band_id>
```

- Usa service role key (bypassa RLS)
- Valida que `band_id` exista
- Aborta si la banda ya tiene canciones
- Inserta 37 canciones en batch (`band_id`, `sort_order`, `status='pending'`)
- Inserta tabs en batch, mapeando `tab` → `content`, `title`, `position`

### Tablas internas (solo lectura por RPC)

```sql
example_seed_songs(id, title, artist, key, tempo, structure, progression, lyrics, notes, sort_order)
example_seed_tabs(id, song_id → example_seed_songs, title, content, position)
```

Pobladas mediante SQL generado desde `seeds/songs.json` durante la implementación. Sin RLS (no expuestas al cliente).

### RPC `seed_example_songs(band_id uuid) → int`

- `SECURITY DEFINER`, `SET search_path = public`
- Requiere `is_band_admin(band_id)`
- Bloquea la fila de la banda durante la operación (`SELECT id FROM bands WHERE id = band_id FOR UPDATE`) para evitar seeds en paralelo
- Aborta si la banda ya tiene canciones
- Copia desde `example_seed_songs` / `example_seed_tabs` a `songs` / `tabs`
- Retorna cantidad de canciones insertadas

### En `/onboarding`

Checkbox "Empezar con canciones de ejemplo" (desmarcado por defecto):
- Si marcado: `create_band()` → si OK → `seed_example_songs(band_id)`
- Si el seed falla pero la banda se creó → mostrar error recuperable, la banda queda creada

---

## Fuera del alcance de Fase 1

- Edge Function para envío de email de invitaciones (Resend) → Fase posterior
- Supabase Storage policies para `song_images` → Fase 3
- i18n, PWA, dark/light theme → Fase 4

---

## Dependencias externas (configuración manual)

1. **Supabase Dashboard → Authentication → Redirect URLs**: agregar `http://localhost:5173/auth/callback`
2. **Supabase Dashboard → SQL Editor**: ejecutar `supabase/schema.sql` (reset limpio)
3. **`.env.local`**: configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
4. **`@supabase/supabase-js`**: instalar en `setlist-app/`
