# Diseño: Refactorización de main.js por vistas

**Fecha:** 2026-05-23  
**Estado:** Aprobado

## Contexto

`src/main.js` tiene ~1874 líneas que mezclan vistas, modales, estado, handlers, helpers y la inicialización de la app. El objetivo es mejorar legibilidad, mantenibilidad y escalabilidad sin cambiar el stack (vanilla JS, sin frameworks).

La carpeta `src/lib/` ya tiene la capa de datos separada (api, auth, db, metronome, router, supabase).

## Enfoque elegido

**Split por vista** — un archivo por ruta/vista, más un módulo de helpers compartidos. Sin introducir frameworks ni cambios de arquitectura profundos.

## Estructura de archivos resultante

```
src/
  views/
    list-view.js          ← renderListView, renderListLoading, renderListError,
                             openCreateSongModal
    song-view.js          ← loadSongView, renderSongView, y todo lo relativo a
                             detalle de canción: edición inline, comentarios,
                             collab, suscripciones realtime
    admin-view.js         ← renderAdminView, renderSuggestionsSection,
                             attachAdminHandlers, openEditSongModal, songFormHtml
    login-view.js         ← renderLoginView
    favorites-view.js     ← renderFavoritesView
    suggestions-view.js   ← renderSuggestionsView, openSuggestModal
    chat-view.js          ← renderChatView, renderChatMessages
  utils/
    helpers.js            ← escapeHtml, highlightChords, formatDate,
                             getStatusLabel, getStoredAuthor, setStoredAuthor,
                             STATUS_OPTIONS, COMMENT_COLORS, AUTHOR_STORAGE_KEY
  main.js                 ← shell HTML, estado global, barra de conectividad,
                             prompt PWA, drawer, metrónomo flotante,
                             modo presentación, definición de rutas, init()
```

## Estado

### Estado global (vive en main.js)

```js
let songs = [];
let adminMode = false;
```

Se pasa como parámetro a cada vista en el momento de registrar la ruta.

### Estado local de vista (vive en cada archivo de vista)

Cada vista declara sus propias variables de módulo:

- `song-view.js`: `currentSongId`, `currentComments`, `commentsState`, `songDetailEdit`, `realtimeMetaChannel`, `realtimeCommentsChannel`
- `chat-view.js`: `chatMessages`, `chatState`, `realtimeChatChannel`

### Estado de UI persistente

- `presentMode` (booleano) permanece en `main.js` ya que es controlado desde `song-view` pero afecta el layout global (`document.body.classList`).

## Comunicación entre módulos

Las vistas **importan** directamente de:
- `../lib/api.js` — operaciones de datos
- `../lib/auth.js` — login/logout
- `../lib/router.js` — navigate()
- `../lib/metronome.js` — getBpm, setBpm, etc.
- `../utils/helpers.js` — utilidades compartidas

Las vistas **reciben callbacks** de `main.js` para:
- `onSongsChanged(newSongs)` — cuando una vista crea, edita o borra una canción y necesita actualizar el array global `songs`
- `updateConnectivityBar()` — para que vistas como song-view y admin-view puedan disparar la actualización del indicador

Ejemplo de registro de ruta en main.js:
```js
route('/', () => {
  renderListView(view, songs, {
    adminMode,
    onSongsChanged: (fresh) => { songs = fresh; },
    updateConnectivityBar,
    openDrawer,
  });
});
```

## main.js resultante (~80 líneas)

Contiene únicamente:
- Inyección del shell HTML (`app.innerHTML = ...`)
- Variables globales: `songs`, `adminMode`
- Barra de conectividad (`updateConnectivityBar`, listeners online/offline, interval)
- Prompt de instalación PWA (`beforeinstallprompt`, `appinstalled`)
- Drawer (`openDrawer`, `closeDrawer`, `initDrawer`)
- Metrónomo flotante (`renderFloatPanel`, `initMetronomeFloat`, `hideFab`)
- Modo presentación (`openPresentMode`, `closePresentMode`)
- Definición de rutas (`route(...)`)
- Función `init()`

## Qué NO cambia

- La lógica de negocio no se modifica, solo se reorganiza
- El comportamiento del usuario es idéntico
- No se introduce ninguna dependencia nueva
- Los archivos en `src/lib/` no se tocan

## Criterios de éxito

- `main.js` queda por debajo de 100 líneas
- Ningún archivo de vista supera las 400 líneas
- La app funciona igual que antes (mismas rutas, mismo comportamiento)
- No hay imports circulares
