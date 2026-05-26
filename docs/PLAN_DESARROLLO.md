# PLAN DE DESARROLLO — Setlist App MVP

> Basado en `PLAN_FUNCIONAL.md`
> Estructura: fases con tickets accionables y criterios de aceptación
> Nivel técnico: medio (sin código, decisiones claras)

---

## Sobre el código actual

El `setlist.html` tiene ~1800 líneas con lógica útil ya probada en uso real:
transposición, metrónomo Web Audio, comentarios sticky, drag&drop, modo presentación.
**No la tiramos** — la rescatamos en Fase 0 como módulos puros antes de migrar a Preact.

---

## Resumen de fases

| Fase | Nombre | Duración | Bloquea a |
|---|---|---|---|
| 0 | Extracción + setup | 1-2 sem | Todas |
| 1 | Backend + Auth | 1 sem | 2, 3 |
| 2 | Offline-first engine | 2 sem | 3 |
| 3 | Features MVP completas | 2-3 sem | 4 |
| 4 | i18n + PWA + diseño | 1-2 sem | 5 |
| 5 | Lanzamiento | 1 sem | — |

Total: 8-12 semanas part-time.

---

## FASE 0 — Extracción y setup base

**Objetivo:** rescatar la lógica pura del HTML actual, montar la nueva estructura de proyecto, dejar la base lista sin agregar features nuevas.

### F0-1 · Inicializar proyecto con Vite + Preact + htm
- Crear proyecto nuevo `setlist-app/` con Vite vanilla.
- Instalar Preact, htm, nanostores, idb, i18next.
- Configurar `vite.config.js` con alias `@/` para `src/`.
- Crear estructura de carpetas tal cual el plan funcional (§9).
- **AC:** `npm run dev` levanta una página "Hello" en Preact desde `app.js`.

### F0-2 · Extraer lógica de transposición a `lib/transpose.js`
- Sacar `NOTES_SHARP`, `NOTES_FLAT`, `transposeNote`, `transposeText` del HTML actual.
- Pasarlo a módulo puro sin dependencias del DOM.
- Tests con node test runner: subir/bajar semitonos, preferencia bemoles, no tocar tabs numéricas.
- **AC:** 100% cobertura en `transpose.js`, todos los tests pasan.

### F0-3 · Extraer lógica de acordes a `lib/chords.js`
- Mover `highlightChords` (regex de detección de acordes).
- Función debe devolver array de `{type: 'chord'|'text', value}` en vez de HTML directo (separamos lógica de render).
- Tests: detecta `Em7`, `F#m`, `Cmaj7`, `D/F#`, ignora texto.
- **AC:** función pura testeada, render se hace en componente.

### F0-4 · Extraer motor de metrónomo a `lib/metronome.js`
- Encapsular `getAudioCtx`, `metroTick`, lógica de start/stop/BPM como clase o factory.
- API: `createMetronome({bpm, beatsPerBar, onBeat})` → `.start() .stop() .setBPM()`.
- `parseBPM` (extrae número de string libre) va acá también.
- Tests sin DOM: `onBeat` recibe el beat correcto, `setBPM` ajusta el intervalo.
- **AC:** API limpia, testeable, usa Web Audio solo en `start()` (lazy).

### F0-5 · Setup de routing con `lib/router.js`
- Router minimalista basado en `history.pushState` y `popstate`.
- Soportar rutas: `/`, `/login`, `/band/:id`, `/song/:id`, `/song/new`, `/settings`.
- API: `navigate(path)`, hook `useRoute()`.
- **AC:** navegar entre 2 rutas dummy funciona con back/forward del navegador.

### F0-6 · Stores base con nanostores
- `stores/ui.js`: tema (dark/light/system), locale (es/en), modo presentación abierto.
- `stores/auth.js`: usuario actual (null inicial).
- Estructura preparada para `bands.js`, `songs.js`, `sync.js` (vacíos por ahora).
- **AC:** cambiar tema desde devtools re-renderiza la UI.

### F0-7 · Migrar canciones hardcodeadas a seed JSON
- Las 36 canciones del array `SONGS` actual → `seeds/songs.json`.
- Script que las sube a Supabase en Fase 1 (placeholder en F0).
- **AC:** archivo JSON válido con todas las canciones del HTML actual.

### F0-8 · Sistema de testing
- Configurar node test runner + `fake-indexeddb` + happy-dom (para componentes).
- Script `npm test` corre todos los tests.
- CI mínima: GitHub Actions corre tests en cada push.
- **AC:** workflow verde en `main`.

---

## FASE 1 — Backend y autenticación

**Objetivo:** Supabase configurado con schema, RLS y auth funcionando. Crear bandas e invitar miembros.

### F1-1 · Setup Supabase project
- Crear proyecto en supabase.com.
- Configurar variables de entorno (`.env.local`, `.env.example`).
- Cliente Supabase en `db/supabase.js`.
- **AC:** conexión exitosa desde dev, errores claros si faltan envs.

### F1-2 · Schema inicial vía migrations
- Migration 001: tablas `users`, `bands`, `band_members`, `invitations`.
- Migration 002: tablas `songs`, `tabs`, `song_images`, `comments`, `favorites`.
- Campos según §3 del plan funcional.
- Triggers para `updated_at` automático.
- **AC:** `supabase db reset` aplica todas las migrations sin error.

### F1-3 · Row-Level Security policies
- Política: solo miembros de la banda ven sus canciones/comentarios/imágenes.
- Política: solo admins pueden borrar canciones, expulsar miembros, borrar la banda.
- Política: cada user solo ve/edita sus propios favoritos.
- Tests de RLS con dos usuarios dummy: A no ve datos de B.
- **AC:** intento de leer/escribir cross-banda devuelve error de Postgres.

### F1-4 · Magic link auth flow
- Vista `Login.js`: input email + botón "Enviar link".
- Callback handler en `/auth/callback` que setea sesión.
- Persistencia de sesión en localStorage.
- Logout desde menú de usuario.
- **AC:** flujo completo login → recibo email → click → entro autenticado.

### F1-5 · Crear banda + onboarding post-login
- Si usuario no tiene bandas, modal: "Crear banda nueva" o "Aceptar invitación".
- Form crear banda: nombre + descripción.
- Al crear, el creador se vuelve admin automáticamente.
- **AC:** usuario nuevo termina dentro de una banda en máximo 3 clicks.

### F1-6 · Gestión de miembros (vista admin)
- `BandSettings.js` con tabs: General | Miembros | Avanzado.
- Tab Miembros: lista con rol, botones cambiar rol / expulsar (solo si soy admin).
- Confirmación antes de expulsar.
- **AC:** admin puede degradar a member, member no ve los botones de admin.

### F1-7 · Sistema de invitaciones
- Botón "Invitar" → modal: email + selector de rol.
- Crear fila en `invitations` con token único, expiración 7 días.
- Edge Function `send-invitation` que envía email vía Resend con link `/invite/:token`.
- Vista `InviteAccept.js`: muestra banda, botones aceptar/rechazar.
- Si no estoy logueado, redirige a login primero.
- **AC:** flujo end-to-end: admin invita → invitado recibe email → acepta → aparece en miembros.

### F1-8 · Abandonar banda + sucesión de admin
- Botón "Abandonar banda" en BandSettings.
- Confirmación.
- Lógica de sucesión: si era único admin, promover al miembro más antiguo. Si era único miembro, borrar banda.
- **AC:** los 3 escenarios (un admin entre varios, único admin, único miembro) funcionan correctamente.

### F1-9 · Borrar banda
- Solo admin. Modal pide escribir el nombre exacto de la banda para confirmar.
- Cascade delete de songs, comments, members, invitations.
- **AC:** confirmación incorrecta no borra nada; correcta borra todo y redirige.

### F1-10 · Seed inicial de canciones
- Script que toma `seeds/songs.json` y las inserta en la banda demo del usuario.
- Solo se ejecuta en banda nueva con flag `seed: true`.
- **AC:** banda nueva opcional puede arrancar con las 36 canciones del HTML actual.

---

## FASE 2 — Offline-first engine

**Objetivo:** IndexedDB espejo del schema Supabase, sync engine bidireccional, indicadores visuales.

### F2-1 · Schema IndexedDB en `db/indexed.js`
- Object stores: `songs`, `tabs`, `images`, `comments`, `favorites`, `bands`, `members`.
- Object store extra: `pending_sync` (cola de operaciones a sincronizar).
- Versiones con migrations propias.
- **AC:** abrir DB en navegador limpio crea todas las stores.

### F2-2 · Capa de repositorio
- Funciones `getSongs(bandId)`, `saveSong(song)`, `deleteSong(id)`, etc.
- Cada función escribe primero a IndexedDB y luego encola sync.
- API uniforme para todas las entidades.
- **AC:** los stores de Preact solo hablan con el repositorio, nunca directo con IndexedDB ni Supabase.

### F2-3 · Sync engine — pull (servidor → local)
- Al login y cada N minutos: bajar cambios del servidor desde `last_sync_at`.
- Aplicar a IndexedDB.
- Notificar a stores para re-render.
- **AC:** abrir app en otro browser muestra cambios hechos en el primero.

### F2-4 · Sync engine — push (local → servidor)
- Procesar `pending_sync` en orden FIFO.
- Cada operación: intentar push, si éxito marcar como sincronizada, si falla reintentar con backoff.
- Eventos online/offline disparan el procesamiento.
- **AC:** offline edito 3 canciones → online → todo aparece en Supabase en <10s.

### F2-5 · Resolución de conflictos last-write-wins
- Comparar `updated_at` local vs servidor.
- Si servidor es más nuevo: descartar cambio local, notificar al usuario qué se perdió.
- Si local es más nuevo: pisar servidor.
- Log de conflictos en localStorage para debugging.
- **AC:** test con dos pestañas editando misma canción: una pierde, la otra ve aviso.

### F2-6 · Indicador visual de estado de sync
- Componente `SyncIndicator.js` en header: 🟢 sincronizado / 🟡 pendiente / 🔴 offline.
- Badge en canción con cambios pendientes locales.
- Toast al volver online: "Sincronizando X cambios..."
- **AC:** desconectar wifi cambia el ícono en <2s, reconectar lo vuelve verde.

### F2-7 · Listener de online/offline + reintentos
- `window.addEventListener('online')` dispara sync push.
- Backoff exponencial si falla: 1s, 2s, 4s, hasta máximo 60s.
- Detección de errores 4xx (no reintentar) vs 5xx/red (reintentar).
- **AC:** cortar internet por 5 min, escribir cambios, reconectar → todo se sincroniza.

### F2-8 · Tests de sync con fake-indexeddb
- Suite de tests que simula: offline edit → online → conflicto → resolución.
- Mock de Supabase client.
- **AC:** suite cubre los flows críticos, todos pasan en CI.

---

## FASE 3 — Features MVP completas

**Objetivo:** todas las features del usuario final funcionando sobre la base offline-first.

### F3-1 · Vista lista de canciones (`SongList.js`)
- Render desde store `songs`.
- Búsqueda por título/artista (debounced).
- Filtros: Todas / Favoritas / Listas / Ensayando.
- Contador de canciones.
- **AC:** búsqueda filtra en <100ms, los filtros se combinan correctamente.

### F3-2 · Vista detalle de canción (`SongDetail.js`)
- Migrar el render del HTML actual a componente Preact.
- Secciones: header, estructura, progresión, tabs, letra, notas, comentarios.
- Botones: back, status pills, favorito.
- **AC:** todas las canciones seed se ven idénticas al HTML actual.

### F3-3 · Form de crear/editar canción (`SongForm.js`)
- Página propia (no modal), ruta `/song/new` y `/song/:id/edit`.
- Campos: title, artist, key, tempo, structure, progression, lyrics, notes.
- Autoguardado de borrador en localStorage cada 5s.
- Recuperar borrador si vuelvo sin guardar.
- **AC:** cierro tab a mitad de edición, vuelvo, recupera lo escrito.

### F3-4 · Borrar canción (solo admin)
- Botón en SongDetail si soy admin.
- Modal de confirmación.
- Borrado optimista + sync.
- **AC:** member no ve el botón; admin borra y la lista se actualiza.

### F3-5 · Reordenar con drag & drop
- Migrar la lógica de DnD del HTML actual.
- Persistir `position` en backend.
- Funciona en mobile (touch events).
- **AC:** reordenar en mobile, recargar, orden se mantiene.

### F3-6 · Subir imágenes a canción
- Botón "Agregar imagen" en SongDetail.
- Upload a Supabase Storage en bucket `song-images/`.
- Si offline: encolar con blob en IndexedDB, subir al reconectar.
- Galería con lightbox.
- Solo admin puede borrar imágenes de otros.
- **AC:** subir foto desde mobile funciona, se ve en otro device tras sync.

### F3-7 · Tabs múltiples por canción
- En SongForm: sección "Tabs" con add/remove de bloques.
- Cada tab: title + content (textarea monospace).
- Render en SongDetail respetando orden.
- **AC:** canción con 3 tabs se guarda y muestra correctamente.

### F3-8 · Metrónomo integrado
- Componente `Metronome.js` usa `lib/metronome.js`.
- UI igual a la actual: BPM display, ±1 ±5, play/stop, beat dots.
- BPM inicial extraído del campo `tempo` de la canción.
- Se detiene al salir de la vista o cerrar modo presentación.
- **AC:** play durante 30s, dots animan en cada beat, sonido del beat 1 distinto.

### F3-9 · Transposición de acordes
- Componente `Transposer.js` usa `lib/transpose.js`.
- Controles: − / valor / + / reset.
- Aplica a `key` y `progression`.
- No persiste (es preferencia de sesión).
- **AC:** transponer +3, key Em pasa a Gm, progresión actualiza, reset vuelve a Em.

### F3-10 · Modo presentación
- Componente `PresentationMode.js` overlay full-screen.
- Navegación: flechas teclado, swipe en mobile, botones en pantalla.
- **Botón "Salir" siempre visible** (mobile no tiene ESC).
- Request fullscreen al abrir, exit al cerrar.
- Recorre todas las canciones de la banda en orden.
- **AC:** funciona en mobile sin teclado, salir con un toque.

### F3-11 · Comentarios estilo pizarra
- Componente `CommentBoard.js`.
- Migrar look sticky notes del HTML actual.
- Form: nombre + color + texto.
- Persistencia del autor en localStorage.
- Editar comentario propio (nueva feature respecto al HTML actual).
- Borrar: propio siempre, ajeno solo si admin.
- **AC:** crear, editar, borrar comment funciona offline y se sincroniza al reconectar.

### F3-12 · Favoritos personales
- Toggle de estrella en SongList y SongDetail.
- Persisten en tabla `favorites` por user.
- Filtro "Favoritas" usa este dato.
- **AC:** marcar fav en device A, abrir en B, sigue marcada.

### F3-13 · Cambio de status global
- Status pills en SongDetail.
- Cambio se persiste a nivel banda (todos lo ven).
- Dot de status en SongList con color (verde/amarillo/gris).
- **AC:** admin cambia a "ready", member en otra sesión lo ve actualizado tras sync.

---

## FASE 4 — i18n, PWA y rediseño

**Objetivo:** terminar la cara visible: traducciones, instalable, look definitivo.

### F4-1 · Sistema i18n con i18next
- Inicializar con detección automática del navegador.
- Archivos `public/locales/es.json` y `en.json`.
- Helper `t()` disponible en todos los componentes.
- Switch manual en perfil de usuario.
- **AC:** cambiar a inglés traduce todos los textos visibles, persiste tras refresh.

### F4-2 · Extracción de strings traducibles
- Auditar todos los componentes, sacar literales hardcodeados.
- Organizar por namespace: `common`, `songs`, `bands`, `auth`, etc.
- **AC:** búsqueda de strings españoles en `src/` no encuentra nada visible al usuario.

### F4-3 · Definición de branding
- Nombre del producto (pendiente del plan funcional).
- Logo en SVG.
- Paleta de colores final (revisar el naranja `#ff5722` actual).
- Tipografías (revisar serif italic + mono actual).
- **AC:** style guide en `docs/branding.md`.

### F4-4 · Rediseño visual de componentes
- Aplicar nuevo branding a todos los componentes.
- Variables CSS reorganizadas por capas: primitive → semantic → component.
- Mantener identidad "sala de ensayo" del diseño actual si funciona.
- **AC:** screenshot before/after de cada vista clave.

### F4-5 · Dark/Light theme con toggle
- Componente `ThemeToggle.js`: system / dark / light.
- CSS variables duplicadas para light mode.
- Persiste en localStorage + `prefers-color-scheme` por defecto.
- **AC:** toggle cambia tema en <100ms sin flash.

### F4-6 · Service Worker + manifest
- Configurar `vite-plugin-pwa`.
- Estrategia: cache-first para shell, network-first para datos.
- Manifest con íconos 192/512, theme color, display standalone.
- Pantalla offline custom.
- **AC:** Lighthouse PWA score >90, instalable en Chrome móvil/desktop.

### F4-7 · Pantalla de "actualización disponible"
- Detectar nueva versión del SW.
- Banner: "Hay una nueva versión, recargá".
- Auto-skip-waiting opcional.
- **AC:** deploy nuevo, usuario activo ve banner en <1 min.

### F4-8 · Optimización de assets
- Lazy load de vistas no críticas con `import()`.
- Compresión de imágenes en `public/`.
- Bundle analysis para detectar bloat.
- **AC:** First Contentful Paint <1.5s en 3G simulado.

---

## FASE 5 — Lanzamiento

**Objetivo:** salir a producción con todo lo legal/operativo cubierto.

### F5-1 · Landing page pública
- Vista en `/` para no logueados.
- Pitch corto, screenshots, "Crear cuenta".
- Sin tracking de terceros.
- **AC:** landing renderiza sin login, copy en es+en.

### F5-2 · Política de privacidad y términos
- Documento mínimo viable: qué datos guardamos, cómo, cuánto, cómo borrar cuenta.
- Vista `/privacy` y `/terms`.
- Link desde footer y registro.
- **AC:** revisión legal básica hecha, textos publicados.

### F5-3 · Borrar cuenta (GDPR)
- Botón en perfil: "Borrar mi cuenta".
- Confirmación doble.
- Cascade: salir de todas las bandas (aplicando sucesión), borrar favoritos, anonimizar comentarios (`author_name_snapshot` queda, `user_id` se setea null).
- **AC:** flujo completo testeado, datos del user desaparecen excepto comentarios anonimizados.

### F5-4 · Deploy a Vercel
- Conectar repo a Vercel.
- Variables de entorno de producción.
- Dominio custom + HTTPS.
- Deploy preview por PR.
- **AC:** push a main publica en producción, preview deploys funcionan.

### F5-5 · Monitoreo mínimo
- Health check endpoint o página.
- Alerta básica si Supabase está caído (UptimeRobot o similar gratis).
- Logs de Supabase revisados manualmente la primera semana.
- **AC:** caída de >5min dispara alerta a tu email.

### F5-6 · Beta con tu banda
- Invitar a los miembros reales.
- Sesión de ensayo usando la app.
- Bug bash + feedback.
- **AC:** lista de issues priorizados post-prueba.

### F5-7 · Lanzamiento público
- Post en redes / comunidades de músicos.
- README del repo si va open source.
- **AC:** primer usuario externo (fuera de tu círculo) se registra.

---

## Convenciones de tickets

- **ID:** `F<fase>-<num>` (ej: F2-5).
- **Branch:** `feat/F2-5-conflict-resolution`.
- **PR:** título con ID, descripción con AC checkeados.
- **Merge a main** solo si: CI verde + AC cumplidos.

## Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| Sync engine es complejo, puede explotar | Fase 2 dedicada, tests con fake-indexeddb, beta con tu banda antes de lanzar |
| Quota de Supabase free se queda corta | Monitorear desde día 1, plan B: self-host |
| PWA install rates bajos | Banner de "instalar" tras 2da visita |
| Conflictos de edición frustran usuarios | Empezar con LWW + log, migrar a merge por campo en v2 si duele |

---

## Próximos pasos inmediatos

1. Revisar este plan, ajustar prioridades si algo no cierra.
2. Crear repo nuevo + project board (GitHub Projects, Linear, lo que uses).
3. Cargar tickets de Fase 0.
4. Empezar por **F0-1** (setup) y **F0-2** (extraer transpose).
