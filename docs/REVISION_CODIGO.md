# Revisión de código — Acordes Para Objetos

> Fecha: 2026-05-29 · Rama: `chore/mvp-hardening`
> MVP para uso propio y pocas personas. Las prioridades reflejan ese contexto.

Este documento registra lo que **ya se aplicó** en esta rama, el **paso manual pendiente**
(migración de Supabase) y lo que quedó **deliberadamente diferido**.

---

## ⚠️ Acción manual requerida (sin esto, los miembros NO pueden editar)

El cambio de permisos toca la base de datos. Hay que **aplicar el SQL en tu proyecto Supabase**:

1. Abrí el SQL Editor de Supabase.
2. Pegá y ejecutá el contenido de
   [`supabase/migrations/202605290001_members_can_edit_songs.sql`](../supabase/migrations/202605290001_members_can_edit_songs.sql).

Esto relaja las políticas RLS de `songs`/`tabs` y el RPC `save_song_with_tabs` para que
**cualquier miembro** (no solo admin) pueda crear/editar/borrar canciones, y agrega el guard
que impide degradar al último admin. `schema.sql` y `rpcs.sql` ya quedaron sincronizados para
un setup desde cero.

### Después: invitar a la banda
- En *Ajustes → Miembros*, invitá por email (el invitado debe registrarse con **ese mismo email**).
- Podés invitarlos como **member**: ahora pueden editar canciones, pero **no** gestionar la
  banda (miembros, invitaciones, borrar banda) — eso sigue siendo admin-only.
- Los links de invitación caducan a los **7 días**.

---

## ✅ Aplicado en esta rama

| Commit | Qué |
|--------|-----|
| `4e2a2fa` | **Permisos backend**: RLS songs/tabs → `is_band_member`; RPC `save_song_with_tabs` exige membresía; `update_band_member_role` no deja degradar al último admin. Migración + schema/rpcs sincronizados. |
| `0e5538b` | **Permisos UI**: `isAdmin` → `canEdit` (cualquier miembro) en `SongList` y `SongDetail` (estado, FAB, agregar, editar, crear, guardar, borrar). Settings sigue admin-only. |
| `930ceae` | **Bugs**: `RouteLoader` ahora captura el fallo de `import()` (evita carga infinita tras deploy) y ofrece recargar; rollback de favoritos con snapshot completo; `loadSongs` resetea el guard en error para permitir reintento. |
| `cbbf259` | **db/**: `unwrap` compartido en `src/db/_unwrap.js`; copia solo `code/details/hint/status` (no pisa `message/stack`); `updateSong`/`updateTab` ignoran `undefined`. |
| `f660f5b` | **dedup**: `shouldHandleLinkClick` extraído a `src/lib/dom.js` (estaba repetido en 4 vistas). |
| `3178f30` | **limpieza/config**: borrado código muerto (`stores/sync.js`, `stores/bands.js`, dirs vacíos); quitada dep `idb`; `engines: node>=22`; headers de seguridad en `vercel.json`; `keepalive` con chequeo opcional `CRON_SECRET`. |
| `82311d3` | **i18n**: textos hardcodeados de `UpdateBanner`, `app.js` y aria-labels de `SongList` movidos a locales (ES+EN). |

Verificado: `npm test` (120/120) y `npm run build` OK en cada paso.

### Config opcional recomendada
- En Vercel, definí la env var **`CRON_SECRET`** (cualquier string) para proteger `/api/keepalive`.
  Vercel la inyecta como `Authorization: Bearer …` en el cron. Si no la definís, el endpoint
  sigue abierto (comportamiento actual).
- En Supabase Auth, exigí **confirmación de email** para que el match por email de las
  invitaciones sea sólido.

---

## ⏸️ Diferido a propósito (con motivo)

| Tema | Por qué se difirió |
|------|--------------------|
| **Dividir `SongDetail.js` (604 líneas) y migrar estilos inline → CSS** | Tenés WIP activo en ese archivo y en `BandSettings.js` yendo hacia estilos **inline**. Migrar a CSS iría en contra de tu dirección actual. Mejor hacerlo cuando cierres ese rediseño. |
| **Tocar `BandSettings.js`** | WIP tuyo sin commitear (rediseño de 169 líneas). No lo toqué para no pisarlo. Su `shouldHandleLinkClick` local queda para migrar a `lib/dom.js` cuando cierres el WIP. |
| **`search_path = ''` en RPCs antiguos** (`create_band`, `leave_band`, `delete_band`, helpers) | Requiere calificar cada referencia con `public.` y no puedo testearlo contra tu DB. Un error rompería `create_band` en silencio. Hardening de bajo impacto; mejor con una DB de prueba. |
| **aria-labels i18n dentro de `SongDetail.js`** (metrónomo, estado) | Para minimizar el diff en tu archivo con WIP. Pendiente junto con su refactor. |
| **Unificar fuente de verdad del locale** (`i18nextLng` vs `setlist.locale`) | Fiddly y de bajo valor; el idioma activo lo maneja i18next correctamente. |
| **Tests de RPCs SQL y de vistas; ESLint en CI; metrónomo look-ahead; join único en `listBandMembers`** | Esfuerzo mayor, no bloqueante para el MVP. |

---

## Checklist de lo que queda (cuando quieras)

```
[ ] Aplicar la migración SQL en Supabase   ← necesario para que members editen
[ ] Definir CRON_SECRET en Vercel (opcional)
[ ] Exigir confirmación de email en Supabase Auth (opcional)
--- más adelante ---
[ ] Cerrar WIP de BandSettings.js y migrar su shouldHandleLinkClick a lib/dom.js
[ ] Dividir SongDetail.js + i18n de sus aria-labels
[ ] ESLint + step en CI; engines ya declarado
[ ] Tests de los RPCs de autorización (accept_invitation, leave_band, save_song_with_tabs)
[ ] search_path='' en RPCs antiguos (con DB de prueba)
```
