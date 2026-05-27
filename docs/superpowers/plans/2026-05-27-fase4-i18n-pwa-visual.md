# Fase 4 — i18n, Visual, PWA y Optimización · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar i18n (es/en), aplicar el branding definitivo del mockup, hacer la app instalable como PWA y optimizar el bundle con lazy loading.

**Architecture:** Opción B — i18n primero (puramente aditivo), luego tokens visuales + tipografía, luego PWA, luego lazy loading. i18next se inicializa con recursos JSON bundleados por Vite (sin servidor). El visual se aplica actualizando variables CSS en `src/style.css`. La PWA usa `vite-plugin-pwa` con `registerType: 'prompt'`.

**Tech Stack:** Preact + htm, i18next v25 + i18next-browser-languagedetector, vite-plugin-pwa + workbox-window, @vite-pwa/assets-generator, rollup-plugin-visualizer, cross-env.

**Archivos CSS:** El CSS de la app está en `setlist-app/src/style.css` (no `index.css`).

---

## File Map

| Archivo | Acción |
|---|---|
| `src/lib/i18n.js` | Crear — init de i18next con recursos bundleados |
| `src/stores/useTranslation.js` | Crear — hook liviano de i18n |
| `src/locales/es/common.json` | Crear |
| `src/locales/es/songs.json` | Crear |
| `src/locales/es/bands.json` | Crear |
| `src/locales/es/auth.json` | Crear |
| `src/locales/en/common.json` | Crear |
| `src/locales/en/songs.json` | Crear |
| `src/locales/en/bands.json` | Crear |
| `src/locales/en/auth.json` | Crear |
| `src/main.js` | Modificar — import side-effect de i18n.js |
| `src/views/Login.js` | Modificar — strings por i18n |
| `src/views/AuthCallback.js` | Modificar — strings por i18n |
| `src/views/Onboarding.js` | Modificar — strings por i18n |
| `src/views/InviteAccept.js` | Modificar — strings por i18n |
| `src/views/BandSettings.js` | Modificar — strings por i18n |
| `src/views/SongList.js` | Modificar — strings + header + cards por i18n y visual |
| `src/views/SongDetail.js` | Modificar — strings + header por i18n y visual |
| `src/views/LanguageToggle.js` | Crear |
| `src/style.css` | Modificar — tokens actualizados + @font-face + nuevas variables |
| `index.html` | Modificar — anti-flash script + title + lang dinámico |
| `public/fonts/` | Crear — archivos .woff2 de JetBrains Mono |
| `public/icon.svg` | Crear |
| `public/pwa-*.png` | Generar via script |
| `vite.config.js` | Modificar — vite-plugin-pwa + visualizer |
| `src/views/UpdateBanner.js` | Crear |
| `src/views/RouteLoader.js` | Crear |
| `src/app.js` | Modificar — UpdateBanner + lazy imports |
| `package.json` | Modificar — deps y scripts |

---

## GRUPO 1 — i18n

---

### Task 1: Instalar dependencia y crear `src/lib/i18n.js`

**Files:**
- Modify: `setlist-app/package.json`
- Create: `setlist-app/src/lib/i18n.js`

- [ ] **Step 1.1: Instalar i18next-browser-languagedetector**

```bash
cd setlist-app && npm install i18next-browser-languagedetector
```

Verificar que `package.json` tenga `"i18next-browser-languagedetector"` en `dependencies`.

- [ ] **Step 1.2: Crear `src/lib/i18n.js`**

```js
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import commonEs from '@/locales/es/common.json';
import songsEs from '@/locales/es/songs.json';
import bandsEs from '@/locales/es/bands.json';
import authEs from '@/locales/es/auth.json';
import commonEn from '@/locales/en/common.json';
import songsEn from '@/locales/en/songs.json';
import bandsEn from '@/locales/en/bands.json';
import authEn from '@/locales/en/auth.json';

i18n.use(LanguageDetector).init({
  fallbackLng: 'es',
  defaultNS: 'common',
  ns: ['common', 'songs', 'bands', 'auth'],
  resources: {
    es: { common: commonEs, songs: songsEs, bands: bandsEs, auth: authEs },
    en: { common: commonEn, songs: songsEn, bands: bandsEn, auth: authEn }
  },
  interpolation: { escapeValue: false },
  detection: {
    order: ['localStorage', 'navigator'],
    caches: ['localStorage'],
    lookupLocalStorage: 'i18nextLng'
  }
});

export default i18n;
```

Nota: este archivo no puede ser testeado hasta que existan los JSON de locales (Task 2 y 3). Las importaciones de JSON las resuelve Vite en build time.

---

### Task 2: Crear archivos de locale en español

**Files:**
- Create: `setlist-app/src/locales/es/common.json`
- Create: `setlist-app/src/locales/es/songs.json`
- Create: `setlist-app/src/locales/es/bands.json`
- Create: `setlist-app/src/locales/es/auth.json`

- [ ] **Step 2.1: Crear `src/locales/es/common.json`**

```json
{
  "loading": "Cargando…",
  "saving": "Guardando…",
  "error": {
    "load_failed": "No pudimos cargar los datos.",
    "save_failed": "No pudimos guardar los cambios.",
    "delete_failed": "No pudimos eliminar."
  },
  "action": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "back": "← Volver",
    "retry": "Reintentar",
    "create": "Crear",
    "delete": "Borrar",
    "edit": "Editar",
    "accept": "Aceptar",
    "reject": "Rechazar"
  },
  "nav": {
    "settings": "Ajustes"
  },
  "theme": {
    "dark": "Oscuro",
    "light": "Claro",
    "system": "Sistema"
  },
  "lang": {
    "es": "ES",
    "en": "EN"
  }
}
```

- [ ] **Step 2.2: Crear `src/locales/es/songs.json`**

```json
{
  "status": {
    "pending": "Pendiente",
    "rehearsing": "Ensayando",
    "ready": "Lista"
  },
  "filter": {
    "all": "Todas",
    "favorites": "Favoritas",
    "pending": "Pendientes",
    "rehearsing": "Ensayando",
    "ready": "Listas"
  },
  "section": {
    "chords": "Acordes",
    "tabs": "Tabs",
    "lyrics": "Letra",
    "notes": "Notas",
    "progression": "Progresión",
    "structure": "Estructura"
  },
  "placeholder": {
    "search": "Buscar canción o artista…",
    "no_results": "Sin resultados.",
    "no_songs": "Sin canciones todavía.",
    "no_tabs": "Sin tabs.",
    "no_lyrics": "Sin letra.",
    "no_notes": "Sin notas.",
    "tab_name": "Nombre del tab",
    "tab_content": "e|---..."
  },
  "action": {
    "add_first": "+ Agregar primera canción",
    "add_tab": "+ Agregar tab",
    "title_required": "El título es requerido.",
    "new_song": "Nueva canción",
    "delete_confirm": "¿Borrar \"{{title}}\"? Esta acción no se puede deshacer.",
    "favorite_error": "No pudimos guardar el favorito.",
    "saved": "Guardado.",
    "not_found": "Canción no encontrada."
  },
  "field": {
    "title": "Título *",
    "artist": "Artista",
    "key": "Key",
    "tempo": "Tempo"
  }
}
```

- [ ] **Step 2.3: Crear `src/locales/es/bands.json`**

```json
{
  "eyebrow": "SALA DE ENSAYO",
  "settings": {
    "title": "Ajustes de banda",
    "name_required": "Nombre requerido.",
    "leave": "Salir de esta banda",
    "leave_confirm": "¿Salir de esta banda?",
    "name_mismatch": "El nombre no coincide.",
    "member": {
      "email_label": "Email",
      "loading": "Cargando..."
    }
  }
}
```

- [ ] **Step 2.4: Crear `src/locales/es/auth.json`**

```json
{
  "login": {
    "title": "Ingresar",
    "subtitle": "Te enviaremos un link al email para acceder.",
    "email_label": "Email",
    "submit": "Enviar magic link",
    "submitting": "Enviando...",
    "success": "Revisá tu email para continuar.",
    "config_missing": "Configuración incompleta",
    "config_detail": "Faltan variables de entorno de Supabase en .env.local.",
    "error": {
      "invalid_email": "Ingresá un email válido.",
      "send_failed": "No pudimos enviar el link."
    }
  },
  "callback": {
    "loading": "Completando ingreso…",
    "error": "No pudimos completar el ingreso.",
    "redirecting": "Redirigiendo…"
  },
  "onboarding": {
    "create_band": "Crear banda nueva",
    "band_name": "Nombre",
    "creating": "Creando...",
    "continue": "Continuar",
    "join_with_invite": "Unirme con invitación",
    "paste_invite": "Pegá un link o token de invitación válido.",
    "error": {
      "name_required": "Nombre requerido.",
      "invalid_token": "Token de invitación inválido."
    }
  },
  "invite": {
    "loading": "Cargando invitación...",
    "no_data": "No tenemos datos previos de esta invitación.",
    "accepting": "Aceptando...",
    "error": {
      "invalid_token": "Token de invitación inválido.",
      "load_failed": "No pudimos cargar la invitación."
    }
  }
}
```

---

### Task 3: Crear archivos de locale en inglés

**Files:**
- Create: `setlist-app/src/locales/en/common.json`
- Create: `setlist-app/src/locales/en/songs.json`
- Create: `setlist-app/src/locales/en/bands.json`
- Create: `setlist-app/src/locales/en/auth.json`

- [ ] **Step 3.1: Crear `src/locales/en/common.json`**

```json
{
  "loading": "Loading…",
  "saving": "Saving…",
  "error": {
    "load_failed": "Failed to load.",
    "save_failed": "Failed to save.",
    "delete_failed": "Failed to delete."
  },
  "action": {
    "save": "Save",
    "cancel": "Cancel",
    "back": "← Back",
    "retry": "Retry",
    "create": "Create",
    "delete": "Delete",
    "edit": "Edit",
    "accept": "Accept",
    "reject": "Decline"
  },
  "nav": {
    "settings": "Settings"
  },
  "theme": {
    "dark": "Dark",
    "light": "Light",
    "system": "System"
  },
  "lang": {
    "es": "ES",
    "en": "EN"
  }
}
```

- [ ] **Step 3.2: Crear `src/locales/en/songs.json`**

```json
{
  "status": {
    "pending": "Pending",
    "rehearsing": "Rehearsing",
    "ready": "Ready"
  },
  "filter": {
    "all": "All",
    "favorites": "Favorites",
    "pending": "Pending",
    "rehearsing": "Rehearsing",
    "ready": "Ready"
  },
  "section": {
    "chords": "Chords",
    "tabs": "Tabs",
    "lyrics": "Lyrics",
    "notes": "Notes",
    "progression": "Progression",
    "structure": "Structure"
  },
  "placeholder": {
    "search": "Search song or artist…",
    "no_results": "No results.",
    "no_songs": "No songs yet.",
    "no_tabs": "No tabs.",
    "no_lyrics": "No lyrics.",
    "no_notes": "No notes.",
    "tab_name": "Tab name",
    "tab_content": "e|---..."
  },
  "action": {
    "add_first": "+ Add first song",
    "add_tab": "+ Add tab",
    "title_required": "Title is required.",
    "new_song": "New song",
    "delete_confirm": "Delete \"{{title}}\"? This cannot be undone.",
    "favorite_error": "Could not save favorite.",
    "saved": "Saved.",
    "not_found": "Song not found."
  },
  "field": {
    "title": "Title *",
    "artist": "Artist",
    "key": "Key",
    "tempo": "Tempo"
  }
}
```

- [ ] **Step 3.3: Crear `src/locales/en/bands.json`**

```json
{
  "eyebrow": "REHEARSAL ROOM",
  "settings": {
    "title": "Band settings",
    "name_required": "Name is required.",
    "leave": "Leave this band",
    "leave_confirm": "Leave this band?",
    "name_mismatch": "Name doesn't match.",
    "member": {
      "email_label": "Email",
      "loading": "Loading..."
    }
  }
}
```

- [ ] **Step 3.4: Crear `src/locales/en/auth.json`**

```json
{
  "login": {
    "title": "Sign in",
    "subtitle": "We'll send you a magic link to your email.",
    "email_label": "Email",
    "submit": "Send magic link",
    "submitting": "Sending...",
    "success": "Check your email to continue.",
    "config_missing": "Incomplete configuration",
    "config_detail": "Missing Supabase environment variables in .env.local.",
    "error": {
      "invalid_email": "Enter a valid email.",
      "send_failed": "Could not send the link."
    }
  },
  "callback": {
    "loading": "Completing sign in…",
    "error": "Could not complete sign in.",
    "redirecting": "Redirecting…"
  },
  "onboarding": {
    "create_band": "Create new band",
    "band_name": "Name",
    "creating": "Creating...",
    "continue": "Continue",
    "join_with_invite": "Join with invitation",
    "paste_invite": "Paste a valid invite link or token.",
    "error": {
      "name_required": "Name is required.",
      "invalid_token": "Invalid invitation token."
    }
  },
  "invite": {
    "loading": "Loading invitation...",
    "no_data": "No invitation data found.",
    "accepting": "Accepting...",
    "error": {
      "invalid_token": "Invalid invitation token.",
      "load_failed": "Could not load the invitation."
    }
  }
}
```

---

### Task 4: Crear `src/stores/useTranslation.js`

**Files:**
- Create: `setlist-app/src/stores/useTranslation.js`

- [ ] **Step 4.1: Crear el hook**

```js
import { useEffect, useState } from 'preact/hooks';
import i18n from '@/lib/i18n.js';

export function useTranslation(ns = 'common') {
  const [, tick] = useState(0);
  useEffect(() => {
    const h = () => tick((n) => n + 1);
    i18n.on('languageChanged', h);
    return () => i18n.off('languageChanged', h);
  }, []);
  return i18n.getFixedT(null, ns);
}
```

No hay tests de unidad para este hook (depende de i18next, que tiene su propio suite de tests).

- [ ] **Step 4.2: Commit**

```bash
git add src/lib/i18n.js src/stores/useTranslation.js src/locales/
git commit -m "feat(i18n): add i18next init, useTranslation hook and locale files (es+en)"
```

---

### Task 5: Wire i18n en `src/main.js`

**Files:**
- Modify: `setlist-app/src/main.js`

- [ ] **Step 5.1: Agregar import side-effect de i18n.js al inicio**

Agregar como primera línea de imports (antes de cualquier import de componentes):

```js
import '@/lib/i18n.js';
```

El módulo se ejecuta como side-effect al importar, inicializando i18next antes del primer render. Los recursos JSON están bundleados por Vite, así que el init completa sincrónicamente.

- [ ] **Step 5.2: Verificar que la app sigue funcionando**

```bash
npm run dev
```

Abrir en el navegador. No debe haber errores en consola relacionados a i18next. La app debe cargar igual que antes.

- [ ] **Step 5.3: Commit**

```bash
git add src/main.js
git commit -m "feat(i18n): wire i18n init in main.js"
```

---

### Task 6: i18n en `src/views/Login.js`

**Files:**
- Modify: `setlist-app/src/views/Login.js`

- [ ] **Step 6.1: Reemplazar el contenido completo de `Login.js`**

```js
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { getSupabase, isSupabaseConfigured } from '@/db/supabase.js';
import { useTranslation } from '@/stores/useTranslation.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Login({ next = null }) {
  const t = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ kind: 'idle' });
  const describedBy = status.kind === 'error' || status.kind === 'sent' ? 'login-status' : undefined;

  if (!isSupabaseConfigured()) {
    return html`
      <main class="auth-shell">
        <h1>${t('login.config_missing')}</h1>
        <p>${t('login.config_detail')}</p>
      </main>
    `;
  }

  async function onSubmit(event) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setStatus({ kind: 'error', message: t('login.error.invalid_email') });
      return;
    }
    setStatus({ kind: 'sending' });
    const supabase = getSupabase();
    const redirect = `${window.location.origin}/auth/callback`
      + (next ? `?next=${encodeURIComponent(next)}` : '');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirect }
      });
      if (error) {
        setStatus({ kind: 'error', message: error.message });
        return;
      }
      setStatus({ kind: 'sent' });
    } catch (err) {
      setStatus({ kind: 'error', message: err.message || t('login.error.send_failed') });
    }
  }

  return html`
    <main class="auth-shell" aria-labelledby="login-title">
      <h1 id="login-title">${t('login.title')}</h1>
      <p>${t('login.subtitle')}</p>

      <form onSubmit=${onSubmit} class="auth-form">
        <label>
          ${t('login.email_label')}
          <input
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            spellCheck=${false}
            required
            value=${email}
            aria-invalid=${status.kind === 'error'}
            aria-describedby=${describedBy}
            onInput=${(event) => {
              setEmail(event.currentTarget.value);
              if (status.kind !== 'idle' && status.kind !== 'sending') setStatus({ kind: 'idle' });
            }}
            disabled=${status.kind === 'sending'}
          />
        </label>
        <button type="submit" disabled=${status.kind === 'sending'}>
          ${status.kind === 'sending' ? t('login.submitting') : t('login.submit')}
        </button>
      </form>

      <div id="login-status" aria-live="polite">
        ${status.kind === 'sent' && html`<p class="auth-success">${t('login.success')}</p>`}
        ${status.kind === 'error' && html`<p class="auth-error">${status.message}</p>`}
      </div>
    </main>
  `;
}
```

- [ ] **Step 6.2: Commit**

```bash
git add src/views/Login.js
git commit -m "feat(i18n): extract strings from Login"
```

---

### Task 7: i18n en `src/views/AuthCallback.js`

**Files:**
- Modify: `setlist-app/src/views/AuthCallback.js`

- [ ] **Step 7.1: Agregar import y reemplazar strings**

Agregar al inicio del archivo (después de los imports existentes):
```js
import { useTranslation } from '@/stores/useTranslation.js';
```

Dentro de la función `AuthCallback`, agregar como primera línea:
```js
const t = useTranslation('auth');
```

Luego reemplazar:
- `"Completando ingreso…"` → `{t('callback.loading')}`
- `"No pudimos completar el ingreso"` o similar → `{t('callback.error')}`
- `"Redirigiendo…"` → `{t('callback.redirecting')}`

- [ ] **Step 7.2: Commit**

```bash
git add src/views/AuthCallback.js
git commit -m "feat(i18n): extract strings from AuthCallback"
```

---

### Task 8: i18n en `src/views/Onboarding.js`

**Files:**
- Modify: `setlist-app/src/views/Onboarding.js`

- [ ] **Step 8.1: Agregar import y reemplazar strings**

Agregar import:
```js
import { useTranslation } from '@/stores/useTranslation.js';
```

Dentro de la función `Onboarding`, primera línea:
```js
const t = useTranslation('auth');
```

Reemplazos:
- `"Crear banda nueva"` → `{t('onboarding.create_band')}`
- `"Nombre"` → `{t('onboarding.band_name')}`
- `"Creando..."` → `{t('onboarding.creating')}`
- `"Continuar"` → `{t('onboarding.continue')}`
- `"Pega un link o token de invitacion valido."` → `{t('onboarding.paste_invite')}`
- `"Nombre requerido."` → `{t('onboarding.error.name_required')}`
- `"Token de invitacion invalido."` / token-related error → `{t('onboarding.error.invalid_token')}`

- [ ] **Step 8.2: Commit**

```bash
git add src/views/Onboarding.js
git commit -m "feat(i18n): extract strings from Onboarding"
```

---

### Task 9: i18n en `src/views/InviteAccept.js`

**Files:**
- Modify: `setlist-app/src/views/InviteAccept.js`

- [ ] **Step 9.1: Agregar import y reemplazar strings**

Agregar import:
```js
import { useTranslation } from '@/stores/useTranslation.js';
```

Dentro de `InviteAccept`, primera línea:
```js
const t = useTranslation('auth');
```

Reemplazos usando el namespace `auth.invite.*`:
- `"Cargando invitacion..."` → `{t('invite.loading')}`
- `"No tenemos datos previos de esta invitacion..."` → `{t('invite.no_data')}`
- `"Aceptando..."` → `{t('invite.accepting')}`
- `"Aceptar"` → `{t('common:action.accept')}`
- `"Rechazar"` → `{t('common:action.reject')}`
- `"Token de invitacion invalido."` → `{t('invite.error.invalid_token')}`
- `"No pudimos cargar la invitacion."` → `{t('invite.error.load_failed')}`

Nota: para acceder a `common` desde el namespace `auth`, usar el prefijo `common:` → `t('common:action.accept')`.

- [ ] **Step 9.2: Commit**

```bash
git add src/views/InviteAccept.js
git commit -m "feat(i18n): extract strings from InviteAccept"
```

---

### Task 10: i18n en `src/views/BandSettings.js`

**Files:**
- Modify: `setlist-app/src/views/BandSettings.js`

- [ ] **Step 10.1: Agregar import y reemplazar strings**

Agregar import:
```js
import { useTranslation } from '@/stores/useTranslation.js';
```

Dentro de `BandSettings`, primera línea:
```js
const t = useTranslation('bands');
```

Reemplazos:
- `"Banda"` / título de sección → `{t('settings.title')}`
- `"Nombre requerido."` → `{t('settings.name_required')}`
- `"Guardando..."` → `{t('common:saving')}`
- `"Guardar"` → `{t('common:action.save')}`
- `"Email"` (label de invitación) → `{t('settings.member.email_label')}`
- `"Cargando..."` → `{t('settings.member.loading')}`
- `"Salir de esta banda?"` → `{t('settings.leave_confirm')}`
- `"El nombre no coincide."` → `{t('settings.name_mismatch')}`

Para `common:` cross-namespace: `t('common:action.save')`.

- [ ] **Step 10.2: Commit**

```bash
git add src/views/BandSettings.js
git commit -m "feat(i18n): extract strings from BandSettings"
```

---

### Task 11: i18n en `src/views/SongList.js`

**Files:**
- Modify: `setlist-app/src/views/SongList.js`

- [ ] **Step 11.1: Agregar import**

```js
import { useTranslation } from '@/stores/useTranslation.js';
```

- [ ] **Step 11.2: Reemplazar las constantes hardcodeadas al inicio del archivo**

Las constantes `STATUS_LABEL` y `FILTERS` son strings que deben venir de i18n. Moverlas dentro del componente como valores derivados de `t`. Reemplazar:

```js
// ELIMINAR estas constantes de nivel de módulo:
// const STATUS_LABEL = { pending: 'Pendiente', rehearsing: 'Ensayando', ready: 'Lista' };
// const FILTERS = [
//   { id: 'all', label: 'Todas' }, ...
// ];
```

Dentro de `SongList`, primera línea:
```js
const t = useTranslation('songs');
```

Y usar funciones para los labels:
```js
// En lugar de STATUS_LABEL[song.status], usar:
t(`status.${song.status}`)

// En lugar del array FILTERS, derivarlo:
const FILTERS = [
  { id: 'all',        label: t('filter.all') },
  { id: 'favorites',  label: t('filter.favorites') },
  { id: 'pending',    label: t('filter.pending') },
  { id: 'rehearsing', label: t('filter.rehearsing') },
  { id: 'ready',      label: t('filter.ready') }
];
```

- [ ] **Step 11.3: Reemplazar strings inline**

Buscar y reemplazar en el JSX:
- `"Buscar canción o artista…"` → `{t('placeholder.search')}`
- `"Sin resultados."` → `{t('placeholder.no_results')}`
- `"Sin canciones todavía."` → `{t('placeholder.no_songs')}`
- `"+ Agregar primera canción"` → `{t('action.add_first')}`
- `"No pudimos guardar el favorito."` → `{t('action.favorite_error')}`
- `"Reintentar"` → `{t('common:action.retry')}`
- `"Ajustes"` → `{t('common:nav.settings')}`

- [ ] **Step 11.4: Commit**

```bash
git add src/views/SongList.js
git commit -m "feat(i18n): extract strings from SongList"
```

---

### Task 12: i18n en `src/views/SongDetail.js`

**Files:**
- Modify: `setlist-app/src/views/SongDetail.js`

- [ ] **Step 12.1: Agregar import**

```js
import { useTranslation } from '@/stores/useTranslation.js';
```

- [ ] **Step 12.2: Reemplazar constantes hardcodeadas**

Eliminar o mover las constantes `STATUS_LABEL` y `DETAIL_TABS` de nivel de módulo. Dentro de `SongDetail`, primera línea:
```js
const t = useTranslation('songs');
```

Reemplazar `DETAIL_TABS`:
```js
const DETAIL_TABS = [
  { id: 'acordes',  label: t('section.chords') },
  { id: 'tabs',     label: t('section.tabs') },
  { id: 'letra',    label: t('section.lyrics') },
  { id: 'notas',    label: t('section.notes') }
];
```

`STATUS_LABEL` inline: usar `t(`songs:status.${song.status}`)` o simplemente `t(`status.${song.status}`)` (mismo NS).

- [ ] **Step 12.3: Reemplazar strings inline**

- `"Cargando…"` → `{t('common:loading')}`
- `"Canción no encontrada."` → `{t('action.not_found')}`
- `"← Volver"` → `{t('common:action.back')}`
- `"Nueva canción"` → `{t('action.new_song')}`
- `"Editar"` → `{t('common:action.edit')}`
- `"Guardar"` / `"Guardando…"` / `"Crear"` → `{t('common:action.save')}` / `{t('common:saving')}` / `{t('common:action.create')}`
- `"Cancelar"` → `{t('common:action.cancel')}`
- `"Borrar"` → `{t('common:action.delete')}`
- `"Guardado."` → `{t('action.saved')}`
- `"El título es requerido."` → `{t('action.title_required')}`
- `"Error al cargar la canción."` → `{t('common:error.load_failed')}`
- `"Error al guardar."` → `{t('common:error.save_failed')}`
- `"Error al borrar."` → `{t('common:error.delete_failed')}`
- `"Progresión"` → `{t('section.progression')}`
- `"Estructura"` → `{t('section.structure')}`
- `"Sin tabs."` → `{t('placeholder.no_tabs')}`
- `"Sin letra."` → `{t('placeholder.no_lyrics')}`
- `"Sin notas."` → `{t('placeholder.no_notes')}`
- `"Nombre del tab"` → `{t('placeholder.tab_name')}`
- `"e|---..."` → `{t('placeholder.tab_content')}`
- `"+ Agregar tab"` → `{t('action.add_tab')}`
- `"Título *"` / `"Artista"` / `"Key"` / `"Tempo"` → usando `t('field.title')`, etc.
- El `confirm()` de borrar: `confirm(t('action.delete_confirm', { title: song?.title }))`

- [ ] **Step 12.4: Commit**

```bash
git add src/views/SongDetail.js
git commit -m "feat(i18n): extract strings from SongDetail"
```

---

### Task 13: Crear `LanguageToggle.js` y agregarlo a `BandSettings`

**Files:**
- Create: `setlist-app/src/views/LanguageToggle.js`
- Modify: `setlist-app/src/views/BandSettings.js`

- [ ] **Step 13.1: Crear `src/views/LanguageToggle.js`**

```js
import { html } from 'htm/preact';
import i18n from '@/lib/i18n.js';
import { useTranslation } from '@/stores/useTranslation.js';

export function LanguageToggle() {
  const t = useTranslation('common');
  const current = i18n.language?.slice(0, 2) ?? 'es';

  function setLang(lang) {
    i18n.changeLanguage(lang);
  }

  const btnStyle = (lang) => `
    padding:6px 14px;border-radius:4px;border:1px solid var(--line);cursor:pointer;font:inherit;
    background:${current === lang ? 'var(--accent)' : 'transparent'};
    color:${current === lang ? 'var(--accent-contrast)' : 'var(--text)'};
  `;

  return html`
    <div style="display:flex;gap:8px;align-items:center">
      <button type="button" style=${btnStyle('es')} onClick=${() => setLang('es')}
        aria-pressed=${current === 'es'}>${t('lang.es')}</button>
      <button type="button" style=${btnStyle('en')} onClick=${() => setLang('en')}
        aria-pressed=${current === 'en'}>${t('lang.en')}</button>
    </div>
  `;
}
```

- [ ] **Step 13.2: Agregar `LanguageToggle` en BandSettings**

En `BandSettings.js`, agregar el import:
```js
import { LanguageToggle } from '@/views/LanguageToggle.js';
```

Y en el JSX, agregar una sección "Idioma" en el tab General (o al final del panel si no hay tab General):
```js
html`
  <div style="margin-top:24px">
    <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:8px">
      ${t('common:lang.es')}/${t('common:lang.en')}
    </div>
    <${LanguageToggle} />
  </div>
`
```

- [ ] **Step 13.3: Commit**

```bash
git add src/views/LanguageToggle.js src/views/BandSettings.js
git commit -m "feat(i18n): add LanguageToggle, wire in BandSettings"
```

---

## GRUPO 2 — Visual

---

### Task 14: Actualizar tokens CSS en `src/style.css`

**Files:**
- Modify: `setlist-app/src/style.css`

- [ ] **Step 14.1: Reemplazar el bloque `.app-shell` (variables dark) con los nuevos tokens**

Reemplazar la sección que empieza con `.app-shell {` y termina antes de `.app-shell[data-theme='light']`:

```css
.app-shell {
  --bg: #0f0f0f;
  --panel: #1a1a1a;
  --panel-strong: #242424;
  --text: #f5f1e8;
  --muted: #8a8580;
  --accent: #ff5722;
  --accent-text: #ff5722;
  --accent-soft: #ff572220;
  --accent-contrast: #1a0f0a;
  --line: #2a2a2a;
  --green: #4ade80;
  --yellow: #fbbf24;
  --serif: 'Georgia', 'Times New Roman', serif;
  --mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Consolas, monospace;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
  gap: 24px;
  min-height: 100vh;
  padding: clamp(24px, 5vw, 72px);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--line), transparent 78%) 1px, transparent 1px),
    linear-gradient(180deg, color-mix(in srgb, var(--line), transparent 84%) 1px, transparent 1px),
    var(--bg);
  background-size: 44px 44px;
  color: var(--text);
}
```

- [ ] **Step 14.2: Reemplazar el bloque de light mode**

Reemplazar `.app-shell[data-theme='light']` y el `@media (prefers-color-scheme: light) .app-shell[data-theme='system']`:

```css
.app-shell[data-theme='light'] {
  --bg: #faf7f2;
  --panel: #f2ede6;
  --panel-strong: #e8e0d4;
  --text: #1a1a1a;
  --muted: #6f675f;
  --accent: #ff5722;
  --accent-text: #a33500;
  --accent-soft: #ff572215;
  --accent-contrast: #1a0f0a;
  --line: #d6cfc5;
  --green: #15803d;
  --yellow: #b45309;
  color-scheme: light;
}

@media (prefers-color-scheme: light) {
  .app-shell[data-theme='system'] {
    --bg: #faf7f2;
    --panel: #f2ede6;
    --panel-strong: #e8e0d4;
    --text: #1a1a1a;
    --muted: #6f675f;
    --accent: #ff5722;
    --accent-text: #a33500;
    --accent-soft: #ff572215;
    --accent-contrast: #1a0f0a;
    --line: #d6cfc5;
    --green: #15803d;
    --yellow: #b45309;
    color-scheme: light;
  }
}
```

- [ ] **Step 14.3: Verificar en el navegador**

```bash
npm run dev
```

Verificar que los colores dark/light se ven correctos. Cambiar el tema desde devtools para verificar light mode.

- [ ] **Step 14.4: Commit**

```bash
git add src/style.css
git commit -m "feat(visual): update CSS tokens to match mockup branding"
```

---

### Task 15: Self-host JetBrains Mono + `@font-face`

**Files:**
- Create: `setlist-app/public/fonts/` (directorio + archivos .woff2)
- Modify: `setlist-app/src/style.css`

- [ ] **Step 15.1: Descargar JetBrains Mono**

Descargar `JetBrainsMono-2.304.zip` (o la versión más reciente) desde:
```
https://github.com/JetBrains/JetBrainsMono/releases
```

Extraer y copiar a `setlist-app/public/fonts/`:
- `JetBrainsMono-Regular.woff2`
- `JetBrainsMono-Medium.woff2`

Verificar que los archivos existen:
```bash
ls setlist-app/public/fonts/
```

Esperado: `JetBrainsMono-Regular.woff2  JetBrainsMono-Medium.woff2`

- [ ] **Step 15.2: Agregar `@font-face` al inicio de `src/style.css`**

Agregar antes de `:root` o antes de `.app-shell`:

```css
@font-face {
  font-family: 'JetBrains Mono';
  src: url('/fonts/JetBrainsMono-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'JetBrains Mono';
  src: url('/fonts/JetBrainsMono-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
```

- [ ] **Step 15.3: Verificar en el navegador**

En DevTools → Network → Fonts: verificar que `JetBrainsMono-Regular.woff2` se carga. Los labels/eyebrows deben mostrar la fuente monoespaciada (verificar en el inspector de elementos que `font-family` resuelve a JetBrains Mono).

- [ ] **Step 15.4: Commit**

```bash
git add public/fonts/ src/style.css
git commit -m "feat(visual): self-host JetBrains Mono with @font-face"
```

---

### Task 16: Anti-flash de tema en `index.html` + metadatos

**Files:**
- Modify: `setlist-app/index.html`

- [ ] **Step 16.1: Reemplazar el contenido de `index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Letras, acordes y notas para músicos. Colaborativa por banda." />
    <title>Setlist &amp; Acordes</title>
    <script>
      (function () {
        var stored = localStorage.getItem('theme') || 'dark';
        var resolved = stored;
        if (stored === 'system') {
          resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
        document.documentElement.setAttribute('data-initial-theme', resolved);
      }());
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

Nota: usamos `data-initial-theme` en `<html>` para que el Preact app pueda leerlo en el mount y aplicar el `data-theme` correcto al `.app-shell` sin flash. La tienda de tema debe leer `document.documentElement.getAttribute('data-initial-theme')` como valor inicial.

Verificar en `src/stores/ui.js` (o donde esté la lógica de tema) que el valor inicial se lee de `localStorage` o de `data-initial-theme`. Si la tienda ya lee de `localStorage`, el script sirve para los CSS variables antes del mount (si se mueve el data-theme a html).

- [ ] **Step 16.2: Commit**

```bash
git add index.html
git commit -m "feat(visual): add anti-flash theme script and update metadata in index.html"
```

---

### Task 17: Rediseñar SongList (header + cards)

**Files:**
- Modify: `setlist-app/src/views/SongList.js`

- [ ] **Step 17.1: Actualizar el header de SongList**

En el `return html` de `SongList`, reemplazar el bloque `<header>`:

```js
html`
  <main style="padding:16px;max-width:900px;margin:0 auto">
    <header style="margin-bottom:20px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-family:var(--mono);font-size:0.7rem;letter-spacing:0.25em;text-transform:uppercase;color:var(--accent);margin-bottom:4px">
            ${t('bands:eyebrow')}
          </div>
          <h1 style="margin:0;font-family:var(--serif);font-style:italic;font-weight:400;font-size:clamp(1.5rem,4vw,2.25rem);letter-spacing:-0.02em;line-height:1">
            ${band?.name ?? 'Setlist'}
          </h1>
        </div>
        <nav style="display:flex;gap:10px;align-items:center;margin-top:4px">
          <a
            href=${`/band/${bandId}/settings`}
            onClick=${(e) => { if (!shouldHandleLinkClick(e)) return; e.preventDefault(); navigate(`/band/${bandId}/settings`); }}
            style="color:var(--muted);font-family:var(--mono);font-size:0.8rem;letter-spacing:0.05em"
          >${t('common:nav.settings')}</a>
        </nav>
      </div>
    </header>
    ...
  </main>
`
```

- [ ] **Step 17.2: Actualizar estilos de cards de canciones**

En el bloque que renderiza cada song card (`<a key=...>`), reemplazar el `style` inline con los tokens del spec:

```js
html`
  <a
    key=${song.id}
    href=${`/band/${bandId}/song/${song.id}`}
    onClick=${(e) => onCardClick(e, song.id)}
    style="
      display:block;text-decoration:none;color:inherit;
      background:var(--panel);
      border:1px solid var(--line);
      border-left:3px solid ${STATUS_COLOR[song.status] ?? 'var(--muted)'};
      border-radius:8px;padding:16px;cursor:pointer;
      transition:background 120ms ease;
    "
    onMouseEnter=${(e) => { e.currentTarget.style.background = 'var(--panel-strong)'; }}
    onMouseLeave=${(e) => { e.currentTarget.style.background = 'var(--panel)'; }}
  >
    <div style="font-family:var(--serif);font-style:italic;font-weight:400;font-size:1rem;margin-bottom:4px">
      ${song.title}
    </div>
    <div style="font-family:var(--mono);font-size:0.8rem;color:var(--muted);margin-bottom:12px">
      ${song.artist ?? ''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${song.key && html`
        <span style="font-family:var(--mono);background:var(--panel-strong);padding:2px 8px;border-radius:4px;font-size:0.8rem">
          ${song.key}
        </span>
      `}
      ${song.tempo && html`
        <span style="font-family:var(--mono);background:var(--panel-strong);padding:2px 8px;border-radius:4px;font-size:0.8rem;color:var(--muted)">
          ${song.tempo}
        </span>
      `}
      <button
        type="button"
        onClick=${(e) => onStatusClick(e, song)}
        disabled=${statusBusy === song.id}
        style="
          padding:2px 8px;border-radius:4px;
          border:1px solid ${STATUS_COLOR[song.status] ?? 'var(--muted)'};
          background:transparent;
          color:${STATUS_COLOR[song.status] ?? 'var(--muted)'};
          font-family:var(--mono);font-size:0.75rem;cursor:pointer;margin-left:auto;
        "
        aria-label=${`${t(`status.${song.status}`)}. Click para cambiar.`}
      >${t(`status.${song.status}`)}</button>
    </div>
  </a>
`
```

Nota: `STATUS_COLOR` puede permanecer como objeto JS con colores hex (no necesita ser variable CSS porque cambia por cada canción).

- [ ] **Step 17.3: Commit**

```bash
git add src/views/SongList.js
git commit -m "feat(visual): redesign SongList header with eyebrow + serif h1, update card styles"
```

---

### Task 18: Rediseñar SongDetail (header)

**Files:**
- Modify: `setlist-app/src/views/SongDetail.js`

- [ ] **Step 18.1: Actualizar el header de SongDetail**

En el bloque del header donde se muestra el título y artista (en modo lectura), reemplazar:

```js
// ANTES (modo lectura):
// html`<h1 style="margin:0 0 2px;font-size:1.4rem;">${song?.title}</h1>`
// html`<div style="color:var(--muted);">${song.artist}</div>`

// DESPUÉS:
html`
  <div>
    <h1 style="
      margin:0 0 4px;
      font-family:var(--serif);font-style:italic;font-weight:400;
      font-size:clamp(1.4rem,4vw,2rem);letter-spacing:-0.02em;line-height:1.1
    ">
      ${isCreate ? t('action.new_song') : song?.title}
    </h1>
    ${song?.artist && html`
      <div style="font-family:var(--mono);font-size:0.85rem;color:var(--muted);margin-top:2px">
        ${song.artist}
      </div>
    `}
  </div>
`
```

- [ ] **Step 18.2: Actualizar inputs del modo edición**

En el input de título en edit mode, asegurarse de que el estilo es consistente:

```js
html`
  <input
    name="title"
    value=${form.title}
    onInput=${updateField('title')}
    placeholder=${t('field.title')}
    required
    disabled=${saving}
    style="
      width:100%;background:var(--panel);border:1px solid var(--line);
      border-radius:4px;color:var(--text);font:inherit;
      font-family:var(--serif);font-style:italic;font-size:1.25rem;font-weight:400;
      padding:4px 8px;margin-bottom:6px;
    "
  />
`
```

- [ ] **Step 18.3: Commit**

```bash
git add src/views/SongDetail.js
git commit -m "feat(visual): redesign SongDetail header with serif title and mono artist"
```

---

## GRUPO 3 — PWA

---

### Task 19: Instalar dependencias PWA + actualizar `package.json`

**Files:**
- Modify: `setlist-app/package.json`

- [ ] **Step 19.1: Instalar dependencias**

```bash
cd setlist-app && npm install workbox-window && npm install -D vite-plugin-pwa @vite-pwa/assets-generator cross-env rollup-plugin-visualizer
```

- [ ] **Step 19.2: Agregar scripts a `package.json`**

En la sección `scripts`, agregar:

```json
"generate:pwa-assets": "pwa-assets-generator --preset minimal-2023 public/icon.svg",
"build:analyze": "cross-env ANALYZE=true vite build"
```

- [ ] **Step 19.3: Verificar instalación**

```bash
npm run build
```

Esperado: build exitoso (sin errores de imports). El plugin PWA aún no está configurado en vite.config.js.

- [ ] **Step 19.4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add PWA, analysis and cross-env dependencies"
```

---

### Task 20: Crear `public/icon.svg`

**Files:**
- Create: `setlist-app/public/icon.svg`

- [ ] **Step 20.1: Crear el SVG del ícono**

El ícono es el ampersand `&` de la marca "Setlist & Acordes" en naranja sobre fondo oscuro:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#0f0f0f"/>
  <text
    x="256"
    y="360"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="340"
    font-style="italic"
    font-weight="400"
    fill="#ff5722"
    text-anchor="middle"
  >&amp;</text>
</svg>
```

- [ ] **Step 20.2: Verificar el SVG**

Abrir `public/icon.svg` en el navegador (arrastrar al browser). Debe mostrar un `&` naranja sobre fondo oscuro redondeado.

---

### Task 21: Generar PNG assets de la PWA

**Files:**
- Create: `setlist-app/public/pwa-64x64.png` (y demás PNGs generados)

- [ ] **Step 21.1: Ejecutar el generador**

```bash
cd setlist-app && npm run generate:pwa-assets
```

Verificar que se generaron en `public/`:
```bash
ls public/*.png
```

Esperado (preset `minimal-2023`):
- `pwa-64x64.png`
- `pwa-192x192.png`
- `pwa-512x512.png`
- `maskable-icon-512x512.png`
- `apple-touch-icon-180x180.png`

Los nombres exactos pueden variar levemente según la versión del generador. Verificar los nombres reales antes de escribir la config del manifest en el siguiente task.

---

### Task 22: Configurar `vite-plugin-pwa` en `vite.config.js`

**Files:**
- Modify: `setlist-app/vite.config.js`

- [ ] **Step 22.1: Reemplazar `vite.config.js` completo**

Verificar los nombres de íconos generados en Task 21 antes de configurar `icons`. Ajustar los `src` si difieren:

```js
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['fonts/**', 'pwa-*.png', 'maskable-*.png', 'apple-touch-icon-*.png'],
      manifest: {
        name: 'Setlist & Acordes',
        short_name: 'Setlist',
        description: 'Letras, acordes y notas para músicos. Colaborativa por banda.',
        theme_color: '#ff5722',
        background_color: '#0f0f0f',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png',          sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',           sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\//,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /\/fonts\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-v1',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    }),
    process.env.ANALYZE === 'true' && visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html'
    })
  ].filter(Boolean)
}));
```

- [ ] **Step 22.2: Verificar build con PWA**

```bash
npm run build
```

Esperado: build exitoso. En `dist/` debe aparecer `sw.js`, `manifest.webmanifest` y los PNGs de íconos.

Verificar que Supabase no está en la lista de precaché:
```bash
grep "supabase" dist/sw.js
```
Esperado: sin resultados (NetworkOnly lo excluye).

- [ ] **Step 22.3: Commit**

```bash
git add vite.config.js
git commit -m "feat(pwa): configure vite-plugin-pwa with manifest and workbox cache strategy"
```

---

### Task 23: Crear `src/views/UpdateBanner.js`

**Files:**
- Create: `setlist-app/src/views/UpdateBanner.js`

- [ ] **Step 23.1: Crear el componente**

```js
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';
import { useTranslation } from '@/stores/useTranslation.js';

export function UpdateBanner() {
  const t = useTranslation('common');
  const [dismissed, setDismissed] = useState(false);

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegistered(r) {
      if (r) console.info('[SW] registered');
    },
    onRegisterError(err) {
      console.error('[SW] registration error', err);
    }
  });

  if (!needRefresh || dismissed) return null;

  return html`
    <div
      role="alert"
      style="
        position:fixed;bottom:0;left:0;right:0;z-index:999;
        background:var(--panel);border-top:1px solid var(--line);
        padding:12px 16px;display:flex;align-items:center;
        justify-content:space-between;gap:12px;flex-wrap:wrap;
        font-family:var(--mono);font-size:0.85rem;
      "
    >
      <span style="color:var(--text)">
        Hay una nueva versión disponible.
      </span>
      <div style="display:flex;gap:8px">
        <button
          type="button"
          onClick=${() => updateServiceWorker(true)}
          style="
            background:var(--accent);color:var(--accent-contrast);
            border:none;border-radius:4px;padding:6px 14px;
            cursor:pointer;font:inherit;font-weight:600;
          "
        >
          Recargar
        </button>
        <button
          type="button"
          onClick=${() => setDismissed(true)}
          style="
            background:transparent;color:var(--muted);
            border:1px solid var(--line);border-radius:4px;
            padding:6px 14px;cursor:pointer;font:inherit;
          "
        >
          Después
        </button>
      </div>
    </div>
  `;
}
```

Nota: el banner usa `updateServiceWorker(true)` para forzar la activación inmediata. El `dismissed` es estado local — no persiste entre sesiones (si el usuario ignora la actualización, el banner vuelve en la siguiente visita).

El texto "Hay una nueva versión disponible." / "Recargar" / "Después" puede i18nizarse en un task posterior si se necesita. Por ahora quedan hardcodeados como texto de sistema.

---

### Task 24: Montar `UpdateBanner` en `src/app.js`

**Files:**
- Modify: `setlist-app/src/app.js`

- [ ] **Step 24.1: Agregar import**

```js
import { UpdateBanner } from '@/views/UpdateBanner.js';
```

- [ ] **Step 24.2: Agregar `UpdateBanner` al JSX del `App`**

En el `return` del componente `App` (después de los guards de `!ready` y `redirect`), envolver el switch en un fragmento y montar el banner debajo:

```js
return html`
  <>
    ${(() => {
      switch (route.name) {
        case 'login':       return html`<${Login} next=${getNext(getSearch())} />`;
        case 'auth-callback': return html`<${AuthCallback} navigate=${navigate} />`;
        case 'onboarding':  return html`<${Onboarding} navigate=${navigate} />`;
        case 'invite-accept': return html`<${InviteAccept} token=${route.params.token} navigate=${navigate} />`;
        case 'band-settings': return html`<${BandSettings} bandId=${route.params.bandId} navigate=${navigate} />`;
        case 'band-home':   return html`<${SongList} bandId=${route.params.bandId} navigate=${navigate} />`;
        case 'song-detail': return html`<${SongDetail} bandId=${route.params.bandId} songId=${route.params.songId} navigate=${navigate} />`;
        case 'song-new':    return html`<${SongDetail} bandId=${route.params.bandId} songId=${null} navigate=${navigate} />`;
        default:            return html`<main style="padding:24px"><p>Redirigiendo…</p></main>`;
      }
    })()}
    <${UpdateBanner} />
  </>
`;
```

Nota: `htm/preact` soporta fragments con `<></>`. Verificar que la versión de htm instalada lo soporta; si no, envolver en `<div style="position:relative">` o usar `html` con array.

- [ ] **Step 24.3: Verificar que el build funciona**

```bash
npm run build
```

Esperado: sin errores. El módulo `virtual:pwa-register/preact` es provisto por `vite-plugin-pwa` y solo existe en el contexto de Vite.

- [ ] **Step 24.4: Commit**

```bash
git add src/views/UpdateBanner.js src/app.js
git commit -m "feat(pwa): add UpdateBanner with needRefresh detection"
```

---

## GRUPO 4 — Optimización

---

### Task 25: Configurar `build:analyze` (ya hecho en Task 19/22)

Este task está cubierto por Task 19 (deps) y Task 22 (vite.config.js). Verificar que funciona:

- [ ] **Step 25.1: Correr análisis de bundle**

```bash
cd setlist-app && npm run build:analyze
```

Esperado: build completa y se abre `dist/stats.html` en el browser con el treemap de módulos. Verificar columnas gzip y brotli.

---

### Task 26: Crear `src/views/RouteLoader.js`

**Files:**
- Create: `setlist-app/src/views/RouteLoader.js`

- [ ] **Step 26.1: Crear el componente**

```js
import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';

export function RouteLoader({ load, props }) {
  const [Component, setComponent] = useState(null);

  useEffect(() => {
    let active = true;
    load().then((mod) => {
      if (active) setComponent(() => mod.default ?? Object.values(mod)[0]);
    });
    return () => { active = false; };
  }, [load]);

  if (!Component) {
    return html`
      <main style="padding:24px;max-width:900px;margin:0 auto">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="height:24px;width:40%;background:var(--panel);border-radius:4px;opacity:0.6"></div>
          <div style="height:16px;width:60%;background:var(--panel);border-radius:4px;opacity:0.4"></div>
          <div style="height:16px;width:50%;background:var(--panel);border-radius:4px;opacity:0.4"></div>
        </div>
      </main>
    `;
  }

  return html`<${Component} ...${props} />`;
}
```

`load` es una función que retorna un `import()` dinámico. `props` son las props que se pasan al componente cargado. Estado local `loading` con `useEffect`, sin Suspense.

---

### Task 27: Lazy imports en `src/app.js`

**Files:**
- Modify: `setlist-app/src/app.js`

- [ ] **Step 27.1: Reemplazar imports estáticos de vistas lazy por funciones de carga**

Eliminar estos imports estáticos:
```js
// ELIMINAR:
import { BandSettings } from '@/views/BandSettings.js';
import { InviteAccept } from '@/views/InviteAccept.js';
import { SongDetail } from '@/views/SongDetail.js';
```

Mantener como estáticos: `Login`, `SongList`, `AuthCallback`, `Onboarding`, `UpdateBanner`.

- [ ] **Step 27.2: Agregar import de `RouteLoader` y definir las funciones de carga**

```js
import { RouteLoader } from '@/views/RouteLoader.js';

const loadSongDetail  = () => import('@/views/SongDetail.js').then(m => ({ default: m.SongDetail }));
const loadBandSettings = () => import('@/views/BandSettings.js').then(m => ({ default: m.BandSettings }));
const loadInviteAccept = () => import('@/views/InviteAccept.js').then(m => ({ default: m.InviteAccept }));
```

Nota: las funciones de carga se definen fuera del componente para que sean estables (no se recreen en cada render).

- [ ] **Step 27.3: Actualizar el switch de rutas**

Reemplazar los casos lazy en el switch:

```js
case 'band-settings':
  return html`<${RouteLoader} load=${loadBandSettings} props=${{ bandId: route.params.bandId, navigate }} />`;
case 'invite-accept':
  return html`<${RouteLoader} load=${loadInviteAccept} props=${{ token: route.params.token, navigate }} />`;
case 'song-detail':
  return html`<${RouteLoader} load=${loadSongDetail} props=${{ bandId: route.params.bandId, songId: route.params.songId, navigate }} />`;
case 'song-new':
  return html`<${RouteLoader} load=${loadSongDetail} props=${{ bandId: route.params.bandId, songId: null, navigate }} />`;
```

- [ ] **Step 27.4: Verificar en DevTools**

```bash
npm run build && npm run preview
```

En DevTools → Network → JS: al navegar a SongList, los chunks de SongDetail/BandSettings/InviteAccept NO deben aparecer. Al navegar a una canción, debe aparecer el chunk de SongDetail cargando por separado.

- [ ] **Step 27.5: Commit**

```bash
git add src/views/RouteLoader.js src/app.js
git commit -m "feat(opt): lazy load SongDetail, BandSettings, InviteAccept with RouteLoader"
```

---

## Verificación final

- [ ] `npm test` — todos los tests pasan sin errores
- [ ] `npm run build` — build limpio sin warnings
- [ ] `npm run build:analyze` — genera `dist/stats.html`
- [ ] Lighthouse PWA audit ≥ 90 en `npm run preview`
- [ ] Cambiar idioma a EN: todos los strings visibles cambian
- [ ] Cambiar idioma a ES: vuelven los strings en español
- [ ] Light mode: colores correctos, sin flash al cargar
- [ ] Dark mode: colores del mockup aplicados
- [ ] Navegar a SongList en Network: SongDetail NO está en el bundle inicial
- [ ] Service Worker registrado en DevTools → Application → Service Workers
- [ ] Manifest sin errores en DevTools → Application → Manifest
