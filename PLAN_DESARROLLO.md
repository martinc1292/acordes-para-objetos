# Plan de Desarrollo · Setlist Banda

App web colaborativa para gestionar el setlist de la banda, con letras, acordes, tabs, comentarios y modo presentación. Funciona offline y sincroniza cuando hay internet.

---

## Índice

1. [Contexto y objetivos](#contexto-y-objetivos)
2. [Stack tecnológico](#stack-tecnológico)
3. [Arquitectura general](#arquitectura-general)
4. [Modelo de datos](#modelo-de-datos)
5. [Roles y permisos](#roles-y-permisos)
6. [Fases de desarrollo](#fases-de-desarrollo)
   - [Fase 0 — Setup](#fase-0--setup-inicial)
   - [Fase 1 — Schema y migración](#fase-1--schema-y-migración-de-datos)
   - [Fase 2 — App vanilla con Vite](#fase-2--app-vanilla-con-vite)
   - [Fase 3 — Realtime](#fase-3--realtime)
   - [Fase 4 — Offline + PWA](#fase-4--offline--pwa)
   - [Fase 5 — Pulido](#fase-5--pulido-continuo)
7. [Cronograma](#cronograma-estimado)
8. [Riesgos y mitigaciones](#riesgos-y-mitigaciones)
9. [Costos](#costos)

---

## Contexto y objetivos

### Caso de uso

- **Banda con 3 integrantes:** cantante, baterista y yo (admin)
- **Dispositivos:** iPhone, Android, iPad viejo (a adaptar después)
- **Uso principal:** durante ensayos y posiblemente en vivo
- **Conectividad:** muchas veces sin WiFi en sala de ensayo

### Requerimientos funcionales

- Ver lista de canciones con letra, acordes, tabs, notas
- Modo presentación para mostrar en pantalla grande
- Transponer acordes
- Metrónomo integrado
- Comentarios/notas colaborativas tipo pizarra
- Marcar canciones como favoritas
- Estado por canción (pendiente / ensayando / lista)
- Reordenar setlist (drag & drop)
- Sugerencias de canciones (cualquiera sugiere, admin aprueba)
- Búsqueda y filtros

### Requerimientos no funcionales

- **Offline-first:** funciona sin internet con los datos ya descargados
- **Multiplataforma:** una sola app para iOS y Android
- **Gratis:** sin costos de hosting ni base de datos
- **Instalable:** PWA, se instala como app nativa
- **Colaborativo:** cambios visibles en tiempo real cuando hay internet

---

## Stack tecnológico

| Capa | Tecnología | Por qué |
|------|------------|---------|
| Frontend | HTML/CSS/JS vanilla | Sin overhead de framework, control total |
| Build tool | Vite | Dev server rápido, build optimizado, módulos ES6 |
| Backend/DB | Supabase | PostgreSQL gestionado, auth, realtime, free tier generoso |
| Hosting | Vercel | Free ilimitado, deploy automático desde GitHub, HTTPS |
| Repositorio | GitHub | Estándar, integración con Vercel |
| Offline | Service Worker + IndexedDB | APIs nativas del navegador |
| Auth | Supabase Auth | Email/password, JWT, integrado con RLS |
| Realtime | Supabase Realtime | WebSockets para cambios en vivo |

### Dependencias npm

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x",
    "idb": "^8.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "vite-plugin-pwa": "^0.x"
  }
}
```

Nada más. Stack minimalista intencionalmente.

---

## Arquitectura general

```
┌─────────────────────────────────────────────────────────┐
│                  Cliente (navegador)                    │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │   UI Layer   │  │  Data Layer  │  │   PWA       │  │
│  │  (views/)    │  │  (lib/api)   │  │  (SW + IDB) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │
│         │                 │                 │          │
│         └─────────────────┴─────────────────┘          │
└─────────────────────────────┬───────────────────────────┘
                              │ HTTPS / WebSocket
                              ▼
┌─────────────────────────────────────────────────────────┐
│                      Supabase                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │PostgreSQL│  │   Auth   │  │ Realtime │  │  RLS   │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Flujo de datos offline-first

```
App abre
  │
  ├── ¿hay internet?
  │     ├── SÍ → fetch Supabase → guarda en IndexedDB → renderiza
  │     └── NO → lee IndexedDB → renderiza
  │
Usuario hace cambio (comentario, status, etc)
  │
  ├── 1. Guarda en IndexedDB inmediatamente (UI no espera)
  ├── 2. ¿hay internet?
  │     ├── SÍ → POST a Supabase → marca como sincronizado
  │     └── NO → guarda en cola "pending"
  │
Evento online (vuelve internet)
  │
  └── Procesa cola de pending → POST cada uno → marca como sincronizado
```

---

## Modelo de datos

### Tablas

#### `songs`

Canciones del setlist. Solo admin escribe.

```sql
create table songs (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  artist       text not null,
  song_key     text not null,           -- "song_key" porque "key" es palabra reservada
  tempo        text,                     -- "120 BPM", "Slow", etc
  structure    text,
  progression  text,
  tabs         jsonb default '[]',       -- [{title, tab}, ...]
  lyrics       text,
  notes        text,
  sort_order   int default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index songs_sort_order_idx on songs(sort_order);
```

#### `song_meta`

Estado por canción. Compartido entre todos (no por usuario).

```sql
create table song_meta (
  song_id      uuid primary key references songs(id) on delete cascade,
  is_favorite  boolean default false,
  status       text default 'pending' check (status in ('pending','rehearsing','ready')),
  updated_at   timestamptz default now()
);
```

#### `comments`

Pizarra colaborativa por canción.

```sql
create table comments (
  id          uuid primary key default gen_random_uuid(),
  song_id     uuid references songs(id) on delete cascade,
  author      text not null,
  text        text not null,
  color       text default 'yellow' check (color in ('yellow','pink','blue','green','orange')),
  created_at  timestamptz default now()
);

create index comments_song_id_idx on comments(song_id);
```

#### `suggestions`

Canciones sugeridas, esperando aprobación del admin.

```sql
create table suggestions (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  artist        text not null,
  suggested_by  text not null,
  notes         text,
  status        text default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz default now()
);
```

### Row Level Security (RLS)

Activar RLS en todas las tablas y definir políticas:

```sql
-- SONGS: lectura pública, escritura solo admin autenticado
alter table songs enable row level security;
create policy "songs_public_read" on songs for select using (true);
create policy "songs_admin_write" on songs for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- SONG_META: lectura y escritura públicas (todos cambian status)
alter table song_meta enable row level security;
create policy "meta_public_read" on song_meta for select using (true);
create policy "meta_public_write" on song_meta for all using (true) with check (true);

-- COMMENTS: lectura y escritura públicas, borrar solo admin
alter table comments enable row level security;
create policy "comments_public_read" on comments for select using (true);
create policy "comments_public_insert" on comments for insert with check (true);
create policy "comments_admin_delete" on comments for delete
  using (auth.role() = 'authenticated');

-- SUGGESTIONS: lectura y inserción públicas, update/delete solo admin
alter table suggestions enable row level security;
create policy "sugg_public_read" on suggestions for select using (true);
create policy "sugg_public_insert" on suggestions for insert with check (true);
create policy "sugg_admin_update" on suggestions for update
  using (auth.role() = 'authenticated');
create policy "sugg_admin_delete" on suggestions for delete
  using (auth.role() = 'authenticated');
```

---

## Roles y permisos

### Visitante anónimo (cantante, baterista, cualquiera con el link)

Puede:
- Ver todas las canciones
- Buscar y filtrar
- Cambiar status de canciones (pendiente/ensayando/lista)
- Marcar favoritas
- Agregar comentarios
- Sugerir canciones nuevas
- Usar modo presentación
- Transponer (visual, no persiste)
- Usar metrónomo

NO puede:
- Crear, editar o borrar canciones
- Borrar comentarios (los propios sí, vía soft-delete opcional)
- Aprobar sugerencias
- Reordenar el setlist permanentemente

### Admin autenticado (yo)

Todo lo anterior, más:
- CRUD completo de canciones
- Reordenar setlist
- Aprobar/rechazar sugerencias
- Borrar comentarios

---

## Fases de desarrollo

---

### Fase 0 — Setup inicial

**Duración estimada:** 0.5 día (~2-3 horas)
**Objetivo:** Tener todas las cuentas, repositorio y deploy automático funcionando.

#### Tareas

1. **Crear cuentas** (gratis, sin tarjeta)
   - GitHub: https://github.com
   - Supabase: https://supabase.com
   - Vercel: https://vercel.com (loguear con GitHub directamente)

2. **Crear proyecto Supabase**
   - Region: South America (São Paulo) — latencia más baja desde Argentina
   - Anotar de Settings > API:
     - `Project URL`
     - `anon public key`
     - `service_role key` (solo para scripts admin, nunca exponer)

3. **Crear repo GitHub** `setlist-banda` (privado o público, indistinto)

4. **Inicializar proyecto Vite**
   ```bash
   npm create vite@latest setlist-banda -- --template vanilla
   cd setlist-banda
   npm install
   npm install @supabase/supabase-js idb
   npm install -D vite-plugin-pwa
   ```

5. **Configurar variables de entorno**
   - Archivo `.env.local` (NO commitear, ya está en `.gitignore` por defecto)
     ```
     VITE_SUPABASE_URL=https://xxx.supabase.co
     VITE_SUPABASE_ANON_KEY=eyJxxx...
     ```

6. **Push inicial a GitHub**
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin git@github.com:USUARIO/setlist-banda.git
   git push -u origin main
   ```

7. **Conectar Vercel al repo**
   - Import Project → seleccionar el repo
   - Framework Preset: Vite
   - En Environment Variables agregar las mismas dos del `.env.local`
   - Deploy

8. **Verificar**
   - URL `https://setlist-banda.vercel.app` muestra la página default de Vite
   - `git push` a main re-deploya automáticamente

#### Entregable

URL pública con app vacía funcionando. Pipeline de deploy automático activo.

---

### Fase 1 — Schema y migración de datos

**Duración estimada:** 1 día
**Objetivo:** Base de datos lista con todas las canciones actuales migradas.

#### Tareas

1. **Crear tablas en Supabase**
   - Ir al SQL Editor de Supabase
   - Pegar y ejecutar el SQL completo de [Modelo de datos](#modelo-de-datos)
   - Verificar en Table Editor que aparecen las 4 tablas

2. **Activar RLS y políticas**
   - Ejecutar el SQL de [Row Level Security](#row-level-security-rls)
   - Verificar en Authentication > Policies

3. **Crear usuario admin**
   - Authentication > Users > Add user
   - Email + password (anotar bien)

4. **Script de migración**
   - Crear archivo `scripts/migrate.js` en el proyecto
   - Parsea el array `SONGS` del HTML actual (`setlist.html`)
   - Inserta cada canción en Supabase usando `service_role key` (bypass RLS)
   - Asigna `sort_order` incremental (0, 1, 2, ...)
   - Crea registro en `song_meta` para cada una con defaults
   - Ejecutar una sola vez: `node scripts/migrate.js`

   ```javascript
   // Ejemplo simplificado
   import { createClient } from '@supabase/supabase-js'
   import { SONGS } from './songs-data.js'

   const supabase = createClient(URL, SERVICE_ROLE_KEY)

   for (let i = 0; i < SONGS.length; i++) {
     const s = SONGS[i]
     const { data, error } = await supabase.from('songs').insert({
       title: s.title,
       artist: s.artist,
       song_key: s.key,
       tempo: s.tempo,
       structure: s.structure,
       progression: s.progression,
       tabs: s.tabs || [],
       lyrics: s.lyrics || '',
       notes: s.notes || '',
       sort_order: i
     }).select().single()

     if (data) {
       await supabase.from('song_meta').insert({ song_id: data.id })
     }
   }
   ```

5. **Verificar datos**
   - Table Editor > songs: 36 filas (las del HTML actual)
   - Table Editor > song_meta: 36 filas

#### Entregable

Base de datos poblada y accesible vía API REST automática de Supabase.

---

### Fase 2 — App vanilla con Vite

**Duración estimada:** 4 días (~8-10 horas)
**Objetivo:** App funcional online con todas las features actuales + admin panel + sugerencias.

#### Estructura de archivos

```
setlist-banda/
├── public/
│   ├── icons/              ← íconos PWA
│   └── manifest.json       ← (Fase 4)
├── src/
│   ├── main.js             ← entry, inicializa router
│   ├── style.css           ← estilos (heredados del HTML actual)
│   ├── lib/
│   │   ├── supabase.js     ← cliente configurado
│   │   ├── auth.js         ← login/logout/isAdmin
│   │   ├── api.js          ← getSongs, addComment, etc
│   │   └── router.js       ← hash router simple
│   ├── views/
│   │   ├── list.js         ← lista principal
│   │   ├── song.js         ← detalle canción
│   │   ├── present.js      ← modo presentación
│   │   ├── suggestions.js  ← lista sugerencias
│   │   └── admin.js        ← CRUD canciones
│   ├── components/
│   │   ├── metronome.js
│   │   ├── transpose.js
│   │   ├── comments.js
│   │   └── modal.js
│   └── utils/
│       ├── chords.js       ← transposición
│       ├── format.js       ← fechas, etc
│       └── escape.js
├── scripts/
│   └── migrate.js
├── index.html
├── package.json
├── vite.config.js
└── .env.local
```

#### Tareas

1. **Cliente Supabase** (`src/lib/supabase.js`)
   ```javascript
   import { createClient } from '@supabase/supabase-js'
   export const supabase = createClient(
     import.meta.env.VITE_SUPABASE_URL,
     import.meta.env.VITE_SUPABASE_ANON_KEY
   )
   ```

2. **Capa de API** (`src/lib/api.js`)
   - `getSongs()` → SELECT con JOIN a song_meta
   - `getSong(id)` → un detalle + comentarios
   - `createSong(data)` → admin
   - `updateSong(id, data)` → admin
   - `deleteSong(id)` → admin
   - `reorderSongs(ids[])` → admin (update batch)
   - `updateMeta(songId, {status, is_favorite})`
   - `addComment(songId, {author, text, color})`
   - `deleteComment(id)` → admin
   - `addSuggestion(data)`
   - `getSuggestions()`
   - `approveSuggestion(id)` → admin, crea canción
   - `rejectSuggestion(id)` → admin

3. **Auth** (`src/lib/auth.js`)
   - `login(email, password)`
   - `logout()`
   - `isAdmin()` → bool basado en sesión activa
   - `onAuthChange(callback)`

4. **Router simple** (`src/lib/router.js`)
   - Rutas: `#/`, `#/song/:id`, `#/present`, `#/suggest`, `#/admin`, `#/admin/song/:id`
   - Escucha `hashchange`, llama al render correspondiente

5. **Migrar vistas del HTML actual**
   - Cada vista exporta una función `render(container, params)`
   - Reutilizar todos los estilos CSS (ya están bien pensados)
   - Reemplazar `localStorage` por llamadas a `api.js`

6. **Vista admin** (nueva)
   - Login form si no autenticado
   - Tabla con todas las canciones, botones editar/borrar
   - Formulario crear/editar (similar al modal actual pero con todos los campos: tabs, etc)
   - Drag & drop para reordenar (persiste en `sort_order`)
   - Tab "Sugerencias" con pendientes, botones aprobar/rechazar

7. **Botón "Sugerir canción"** en vista lista
   - Modal con campos: título, artista, tu nombre, notas
   - Submit → `addSuggestion()`

8. **Estados de UI**
   - Loading skeletons mientras fetcha
   - Mensajes de error si falla red
   - Empty states

9. **Testing manual**
   - Probar todos los flujos desde otro dispositivo
   - Verificar que el admin puede editar y los demás no

#### Entregable

App pública en `https://setlist-banda.vercel.app` con todas las features, accesible desde cualquier dispositivo con internet.

---

### Fase 3 — Realtime

**Duración estimada:** 1 día
**Objetivo:** Cambios visibles en vivo entre dispositivos sin recargar.

#### Tareas

1. **Suscripciones Supabase Realtime**
   ```javascript
   // En vista song.js
   const channel = supabase
     .channel(`song-${songId}`)
     .on('postgres_changes',
       { event: 'INSERT', schema: 'public', table: 'comments', filter: `song_id=eq.${songId}` },
       (payload) => addCommentToUI(payload.new)
     )
     .on('postgres_changes',
       { event: 'UPDATE', schema: 'public', table: 'song_meta', filter: `song_id=eq.${songId}` },
       (payload) => updateStatusUI(payload.new)
     )
     .subscribe()

   // Cleanup al salir de la vista
   return () => supabase.removeChannel(channel)
   ```

2. **Habilitar replicación** en Supabase
   - Database > Replication > activar para tablas: `comments`, `song_meta`, `suggestions`

3. **Indicadores visuales sutiles**
   - "Pedro escribió una nota" toast efímero
   - Highlight breve cuando algo cambia

4. **Manejar reconexión**
   - Si se cae el WebSocket, intentar reconectar
   - Al reconectar, hacer un fetch para asegurar consistencia

#### Entregable

Durante un ensayo, cuando el baterista marca una canción como "lista", el cantante lo ve en su pantalla al instante.

---

### Fase 4 — Offline + PWA

**Duración estimada:** 4 días
**Objetivo:** App instalable, funciona sin internet, sincroniza al volver.

#### Tareas

1. **Manifest PWA** (`public/manifest.json`)
   ```json
   {
     "name": "Setlist Banda",
     "short_name": "Setlist",
     "description": "Setlist y acordes de la banda",
     "start_url": "/",
     "display": "standalone",
     "background_color": "#0e0e0e",
     "theme_color": "#ff5722",
     "orientation": "portrait",
     "icons": [
       { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
       { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
       { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
     ]
   }
   ```

2. **Generar íconos**
   - Diseñar uno de 1024x1024
   - Generar versiones con https://realfavicongenerator.net o similar
   - Versión "maskable" para Android

3. **Service Worker con vite-plugin-pwa**
   ```javascript
   // vite.config.js
   import { VitePWA } from 'vite-plugin-pwa'

   export default {
     plugins: [
       VitePWA({
         registerType: 'autoUpdate',
         workbox: {
           globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
           runtimeCaching: [
             {
               urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/,
               handler: 'NetworkFirst',
               options: {
                 cacheName: 'supabase-api',
                 networkTimeoutSeconds: 3,
                 expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 }
               }
             }
           ]
         }
       })
     ]
   }
   ```

4. **IndexedDB con `idb`** (`src/lib/db.js`)
   - Stores: `songs`, `song_meta`, `comments`, `suggestions`, `pending_changes`
   - Función `syncFromRemote()`: trae todo de Supabase y reemplaza en IDB
   - Función `getLocal()`: lee de IDB
   - Esquema versionado por si cambia

5. **Refactor de API a "local-first"**
   - `getSongs()`:
     1. Lee de IDB (instantáneo)
     2. En paralelo, fetch a Supabase
     3. Si difiere, actualiza IDB y emite evento
   - Mutaciones:
     1. Aplica cambio local en IDB
     2. Intenta POST a Supabase
     3. Si falla: agrega a `pending_changes`

6. **Cola de cambios pendientes**
   ```javascript
   // pending_changes schema
   {
     id: auto,
     type: 'insert_comment' | 'update_meta' | 'insert_suggestion',
     payload: {...},
     created_at: timestamp
   }
   ```
   - Función `processPendingQueue()` itera y reintenta
   - Se ejecuta:
     - Al cargar la app si hay internet
     - En evento `window.online`
     - Cada N segundos como fallback

7. **Indicador de estado**
   - Badge en header: 🟢 Online | 🟡 Sincronizando | 🔴 Offline
   - Tooltip con cantidad de cambios pendientes
   - Botón manual "Forzar sync"

8. **Detección de conexión**
   ```javascript
   window.addEventListener('online', () => {
     processPendingQueue()
     syncFromRemote()
   })
   window.addEventListener('offline', () => {
     showOfflineIndicator()
   })
   ```

9. **Estrategia de conflictos**
   - **Comentarios:** append-only, no hay conflicto
   - **song_meta:** last-write-wins por `updated_at`
   - **songs:** solo admin edita, raramente offline
   - **suggestions:** append-only, no hay conflicto

10. **Prompt de instalación**
    - Detectar evento `beforeinstallprompt` (Chrome/Edge/Android)
    - Para iOS: instrucciones manuales ("Compartir → Agregar a pantalla de inicio")
    - Banner discreto la primera vez

11. **Testing offline**
    - Chrome DevTools > Network > Offline
    - Probar: abrir app, navegar, agregar comentario, volver online, verificar sync
    - Probar en celular real con modo avión

#### Entregable

App instalable. Funciona en sala de ensayo sin WiFi. Cuando volvés a casa, sincroniza automáticamente.

---

### Fase 5 — Pulido (continuo)

**Duración:** ongoing
**Objetivo:** Mejorar según uso real.

#### Posibles tareas

- **Keep-alive Supabase:** Vercel Cron Job semanal que hace un fetch para evitar pausa por inactividad (gratis)
- **Backup automático:** script que exporta a JSON y commitea al repo o sube a Google Drive
- **Mejoras UX según feedback de la banda**
- **Analytics:** Plausible (free tier) o nada
- **Atajos de teclado** en modo presentación
- **Modo claro** (opcional)
- **Compartir canción** vía link directo
- **PDF export** de una canción para imprimir
- **Setlist por show:** crear varios setlists distintos (gig del viernes vs ensayo)
- **Adaptar al iPad viejo:** probar qué funciona, agregar polyfills si hace falta


## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Free tier Supabase pausa proyecto por inactividad (7 días) | Alta | Medio | Vercel Cron Job semanal con fetch trivial |
| Combinación realtime + offline genera bugs sutiles | Media | Alto | Testear exhaustivamente. Realtime solo si online |
| Conflictos de sync entre dispositivos | Baja | Bajo | Last-write-wins alcanza para este uso |
| iPad viejo no soporta features modernas | Alta | Bajo | Fase 5, no bloquea MVP |
| Olvidarse de variables de entorno en Vercel | Alta | Alto | Documentar en README, checklist al deployar |
| Cambios accidentales en producción sin testing | Media | Medio | Branch `dev` con preview deploys de Vercel |

---

## Costos

### Free tier — todo gratis indefinidamente

| Servicio | Free tier | Lo que vamos a usar |
|----------|-----------|---------------------|
| Supabase | 500 MB DB, 1 GB storage, 2 GB egress/mes, 50K MAU | <10 MB DB, ~3 usuarios, mínimo egress |
| Vercel | 100 GB bandwidth/mes, builds ilimitados | <1 GB/mes |
| GitHub | Repos privados ilimitados | 1 repo |
| Dominio | `*.vercel.app` gratis | Sin dominio custom inicialmente |



