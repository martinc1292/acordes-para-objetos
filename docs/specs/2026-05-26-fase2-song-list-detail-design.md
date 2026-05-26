# Fase 2 — Song List + Detail (Core MVP)

**Fecha:** 2026-05-26  
**Rama:** feat/F2-song-list-detail  
**Stack:** Preact + htm/preact, nanostores, Supabase, custom history router

---

## Alcance

Core MVP de canciones:
- Lista de canciones (cards con status, key, tempo)
- Detalle de canción (tabs: Acordes | Tabs | Letra | Notas, transposición, status)
- Admin CRUD inline (edición in-place desde el detalle, FAB "+" para crear)

Fuera de alcance en esta rama: modo presentación, sugerencias, comentarios, drag & drop para reordenar, metrónomo.

---

## Rutas

```
/band/:bandId                        band-home    → SongList
/band/:bandId/song/new               song-new     → SongDetail (modo crear)
/band/:bandId/song/:songId           song-detail  → SongDetail (modo ver/editar)
```

Las rutas `song-new` y `song-detail` deben registrarse **antes** de `band-home` en el array de rutas para que el router no las capture con el patrón más corto.

---

## Permisos

| Acción | Quién |
|--------|-------|
| Ver canciones | Cualquier miembro autenticado |
| Cambiar status (pending/rehearsing/ready) | Cualquier miembro |
| Crear / editar / borrar canciones | Solo `band.role === 'admin'` |
| Agregar / editar / borrar tabs | Solo admin |

---

## Archivos

### Nuevos

```
src/db/songs.js       Supabase queries
src/stores/songs.js   Nanostores atoms + actions (reemplaza el stub vacío)
src/views/SongList.js Vista lista
src/views/SongDetail.js Vista detalle
```

### Modificados

```
src/main.js    +2 rutas (song-new, song-detail)
src/app.js     +2 cases (song-new, song-detail), reemplaza band-home con SongList
src/views/Home.js   eliminado (inlining en app.js)
```

---

## Data layer

### `src/db/songs.js`

Wrappers delgados, mismo estilo que `db/bands.js`.

```
getSongs(supabase, { bandId })
  SELECT * FROM songs WHERE band_id = bandId ORDER BY sort_order

getSongWithTabs(supabase, { songId, bandId })
  SELECT song + JOIN tabs WHERE song_id = songId AND band_id = bandId

createSong(supabase, { bandId, title, artist, key, tempo, structure, progression, lyrics, notes })
  INSERT INTO songs → returns new song row

updateSong(supabase, { songId, bandId, fields })
  UPDATE songs SET ... WHERE id = songId AND band_id = bandId → returns updated row

deleteSong(supabase, { songId, bandId })
  DELETE FROM songs WHERE id = songId AND band_id = bandId

updateSongStatus(supabase, { songId, bandId, status })
  UPDATE songs SET status = ... — función separada para miembros no-admin

createTab(supabase, { songId, bandId, title, content, position })
updateTab(supabase, { tabId, songId, bandId, fields })
deleteTab(supabase, { tabId, songId, bandId })
```

### `src/stores/songs.js`

Nanostores atoms + actions. Los tabs no entran al store (37 canciones × ~300 bytes ≈ 11KB; los tabs se fetchan frescos en cada detalle).

```js
// Atoms
$songs       atom([])     // Song[] sin tabs, para la banda activa
$songsLoaded atom(false)
$songsError  atom(null)   // string | null

// Actions
loadSongs(supabase, bandId)      // fetch + set atoms
clearSongs()                     // reset a estado inicial
patchSongInStore(songId, fields) // actualización optimista
addSongToStore(song)             // post-create
removeSongFromStore(songId)      // post-delete
```

`loadSongs` guarda en qué `bandId` cargó. Si se llama de nuevo con el mismo `bandId`, no re-fetcha (guard de idempotencia). `clearSongs` se llama cuando cambia la banda activa.

---

## Vista SongList

**Ruta:** `/band/:bandId` (band-home)

**Lifecycle:**
1. Al montar: si `$songsLoaded === false` o el `bandId` cambió → llama `loadSongs`
2. Suscribe a `$songs`, `$songsLoaded`, `$songsError` via `useStoreValue`

**Layout:**
- Header: nombre de banda + botón "Ajustes" (ya existe) + botón "Salir"
- Input de búsqueda (filtra client-side por título y artista)
- Grid de cards (1 col mobile, 2 col tablet+)
- Cada card: título, artista, badges (key, tempo, status con color)
- Click en card → navega a `/band/:bandId/song/:songId`
- El badge de status es clickeable (solo miembros) → cicla pending → rehearsing → ready → pending con actualización optimista
- FAB "+" visible solo para admin → navega a `/band/:bandId/song/new`
- Loading: 3 skeleton cards
- Error: mensaje + botón "Reintentar"
- Empty: "Sin canciones todavía" + botón "Agregar" para admin

**Status colors:**
- `ready` → verde (`#22c55e`)
- `rehearsing` → amarillo (`#eab308`)
- `pending` → gris (`#666`)

---

## Vista SongDetail

**Rutas:** `/band/:bandId/song/:songId` y `/band/:bandId/song/new`

**Props:** `{ bandId, songId, navigate }` — `songId === null` indica modo crear.

**Lifecycle:**
1. Estado local: `song`, `tabs`, `loading`, `error`, `editMode`, `transpose` (entero, semitones)
2. Si `songId` existe: lee `$songs` para datos iniciales rápidos, luego fetch de `getSongWithTabs` para datos frescos + tabs
3. Si `songId === null`: arranca en `editMode = true` con campos vacíos

**Header fijo:**
- `← Volver` → navega a `/band/:bandId`
- Título y artista (inputs en edit mode)
- Key transpuesto: `originalKey` + `transpose` aplicado con `lib/transpose.js`
- Botones `−` / `+` para transponer (estado local, no persiste)
- Badge de status clickeable → llama `updateSongStatus` + `patchSongInStore` (todos los miembros)
- Botón "Editar" (solo admin, fuera de edit mode) → activa `editMode`
- En edit mode: "Guardar" / "Cancelar" / "Borrar" (con confirm)

**Tabs de contenido:**

| Tab | Contenido en lectura | Contenido en edición (admin) |
|-----|----------------------|------------------------------|
| Acordes | Progresión (monospace) + Estructura | Textareas editables |
| Tabs | Lista: título + contenido monospace | Agregar/editar/borrar tabs inline |
| Letra | Texto preformateado o "Sin letra" | Textarea |
| Notas | Texto libre o "Sin notas" | Textarea |

**Guardar (editar):**
1. `updateSong()` con los campos modificados
2. `patchSongInStore(songId, fields)` optimista
3. Mensaje "Guardado" inline, `editMode = false`

**Guardar (crear):**
1. `createSong()` → recibe nuevo song
2. `addSongToStore(newSong)`
3. Navega a `/band/:bandId/song/:newSong.id`

**Borrar:**
1. `confirm()` dialog
2. `deleteSong()`
3. `removeSongFromStore(songId)`
4. Navega a `/band/:bandId`

**Transposición:**
- `transpose` es un entero (semitones, puede ser negativo)
- Se aplica a la progresión con `lib/transpose.js` para mostrar acordes transpuestos
- El key en el header también se muestra transpuesto
- No persiste en DB

---

## Convenciones

- Todo sigue los patrones de `BandSettings.js`: `htm/preact`, `useStoreValue`, `useEffect` con flag de cancelación (`let active = true`)
- Inputs deshabilitados mientras `saving === true`
- Errores mostrados con `role="alert"` y clase `auth-error`
- Links SPA con `onClick` que llama `navigate` (igual que en `BandSettings`)
- Sin JSX, sin CSS modules: inline styles donde el CSS global no alcance
