# Fase 4 — i18n, Visual, PWA y Optimización · Design Spec

> Orden de implementación: i18n → visual → PWA → optimización

---

## Contexto

La app tiene las features core del MVP funcionando (auth, bandas, SongList, SongDetail). Esta fase cierra la cara visible del producto: traducciones, identidad visual definitiva según el mockup, instalabilidad como PWA y carga eficiente.

El branding de referencia está en `docs/setlist-mockup-completo.html`.

---

## Grupo 1 — i18n (F4-1 + F4-2)

### Dependencias

```
i18next
i18next-browser-languagedetector
```

Sin `react-i18next`. Se usa i18next directamente con un hook propio.

### Inicialización — `src/lib/i18n.js`

- `i18next.use(LanguageDetector).init(...)` se llama una vez al arrancar la app (antes del primer render).
- `fallbackLng: 'es'`
- Namespaces: `['common', 'songs', 'bands', 'auth']`, `defaultNS: 'common'`
- Recursos importados directamente desde `src/locales/{es,en}/{ns}.json` — no `public/locales/`, para que Vite los bundlee sin servidor.
- El detector persiste el idioma elegido en `localStorage` automáticamente.

### Hook — `src/stores/useTranslation.js`

```js
export function useTranslation(ns = 'common') {
  const [, tick] = useState(0);
  useEffect(() => {
    const h = () => tick(n => n + 1);
    i18n.on('languageChanged', h);
    return () => i18n.off('languageChanged', h);
  }, []);
  return i18n.getFixedT(null, ns);
}
```

Re-renderiza solo cuando cambia el idioma. Los componentes llaman `const t = useTranslation('songs')` y usan `t('key')`.

### Estructura de locales

```
src/locales/
  es/
    common.json    ← nav, acciones genéricas, estados, errores
    songs.json     ← campos y acciones de canciones
    bands.json     ← gestión de banda y miembros
    auth.json      ← login, onboarding, invitaciones
  en/
    (misma estructura)
```

### Selector de idioma

- Componente `LanguageToggle.js` en perfil/settings: botones ES / EN.
- Llama `i18n.changeLanguage(lang)` — el detector persiste en localStorage.
- El selector muestra el idioma activo.

### F4-2 — Extracción de strings

- Todos los strings visibles al usuario en SongList, SongDetail, BandSettings, Login, Onboarding, InviteAccept se extraen a las claves correspondientes.
- Mensajes de error de Supabase se wrappean en claves genéricas: `error.load_failed`, `error.save_failed`, `error.delete_failed`. El mensaje técnico va solo a `console.error`.
- AC: búsqueda de strings en español hardcodeados en `src/` no encuentra nada visible al usuario (excluidos comentarios y consola).

---

## Grupo 2 — Visual (F4-3 + F4-4 + F4-5)

### F4-3 — Tokens de color

Se mantienen los nombres existentes (`--bg`, `--panel`, etc.) y se actualizan los valores para coincidir con el mockup. Se agrega un set de tokens derivados del accent.

**Dark mode (default):**

| Variable | Valor |
|---|---|
| `--bg` | `#0f0f0f` |
| `--panel` | `#1a1a1a` |
| `--panel-strong` | `#242424` |
| `--text` | `#f5f1e8` |
| `--muted` | `#8a8580` |
| `--accent` | `#ff5722` |
| `--accent-text` | `#ff5722` (ratio ~4.8:1 sobre `#0f0f0f` — pasa WCAG AA) |
| `--accent-soft` | `#ff572220` |
| `--accent-contrast` | `#ffffff` |
| `--line` | `#2a2a2a` |
| `--green` | `#4ade80` |
| `--yellow` | `#fbbf24` |

**Light mode:**

| Variable | Valor |
|---|---|
| `--bg` | `#faf7f2` |
| `--panel` | `#f2ede6` |
| `--panel-strong` | `#e8e0d4` |
| `--text` | `#1a1a1a` |
| `--muted` | `#6f675f` |
| `--accent` | `#ff5722` |
| `--accent-text` | `#c94300` (contraste WCAG AA sobre fondo claro) |
| `--accent-soft` | `#ff572215` |
| `--accent-contrast` | `#ffffff` |
| `--line` | `#d6cfc5` |
| `--green` | `#16a34a` |
| `--yellow` | `#d97706` |

Regla: nunca usar `--accent` directamente para texto pequeño sobre fondo claro — usar `--accent-text`.

El verde de accent en light mode (`#1f7a64`) queda eliminado.

### F4-4 — Tipografía y componentes clave

**Fuente:**
- Self-host de JetBrains Mono en `.woff2` (un peso: 400; un peso: 500 si se necesita bold).
- `@font-face` en el CSS global con `font-display: swap`.
- `--mono` pasa a `'JetBrains Mono', ui-monospace, Consolas, monospace`.
- Los archivos van en `public/fonts/`.

**SongList — header:**
- Eyebrow: `SALA DE ENSAYO` en mono uppercase, `font-size: 0.7rem`, `letter-spacing: 0.25em`, color `--accent`.
- Título de banda: serif italic (`font-family: var(--serif)`), `font-weight: 400`, `letter-spacing: -0.02em`.

**SongDetail — header:**
- Título de canción: serif italic, grande.
- Artista: mono, `color: var(--muted)`.

**Cards de canciones:**
- Border-left de 3px con color del status.
- Hover: `background: var(--panel-strong)`, transición 120ms.
- Título en serif, artista en mono.
- Status pill con `border: 1px solid <color-status>`, texto en el mismo color, sin fondo sólido.

**Botones primarios:**
- `background: var(--accent)`, `color: var(--accent-contrast)`, `border-radius: 4px`.
- Hover: `opacity: 0.9`.

**Botones secundarios:**
- `background: transparent`, `border: 1px solid var(--line)`, `color: var(--text)`.

**Inputs / textareas:**
- `background: var(--panel)`, `border: 1px solid var(--line)`, `color: var(--text)`.
- Focus: `border-color: var(--accent)`, `outline: none`.

**Bloques musicales (tabs, progresión):**
- `font-family: var(--mono)`, `background: var(--panel)`, `border: 1px solid var(--line)`.
- `border-radius: 4px`, `padding: 12px`.

### F4-5 — Theme toggle

- La lógica dark/light/system ya existe; solo se actualizan los valores de las variables CSS.
- Para evitar flash en carga inicial: leer el tema desde localStorage antes del primer render e inyectar el atributo `data-theme` en el `<html>` via un `<script>` inline en `index.html` (antes del bundle).
- Verificar contraste WCAG AA en ambos temas para: texto principal, muted, accent-text sobre fondo, texto sobre accent.

---

## Grupo 3 — PWA (F4-6 + F4-7)

### F4-6 — Service Worker + Manifest

**Dependencias:**
```
vite-plugin-pwa   (devDep)
@vite-pwa/assets-generator   (devDep)
```

**Script de generación de assets:**
```
"generate:pwa-assets": "pwa-assets-generator --preset minimal public/icon.svg"
```

Genera `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png` en `public/`.

**Manifest** (en `vite.config.js` dentro del plugin):

```js
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
    { src: 'icon-192.png',           sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png',           sizes: '512x512', type: 'image/png' },
    { src: 'icon-maskable-192.png',  sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: 'icon-maskable-512.png',  sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}
```

**Plugin config:**

```js
VitePWA({
  registerType: 'prompt',           // no recarga automática
  injectRegister: 'auto',
  includeAssets: ['fonts/**', 'icon*.png'],
  manifest: { /* ver arriba */ },
  workbox: {
    cleanupOutdatedCaches: true,
    navigateFallback: '/index.html',
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\//,
        handler: 'NetworkOnly'       // Supabase nunca se cachea
      },
      {
        urlPattern: /\/fonts\//,
        handler: 'CacheFirst',
        options: { cacheName: 'fonts', expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } }
      }
    ]
  }
})
```

El app shell, JS y CSS quedan en precache automático de Workbox. El fallback SPA a `/index.html` cubre rutas del router client-side.

### F4-7 — Banner de actualización

**Componente `UpdateBanner.js`** montado en `app.js` sobre toda la UI:

- Usa `useRegisterSW` de `virtual:pwa-register/preact`.
- Cuando `needRefresh` es `true`, muestra barra fija abajo con:
  - "Hay una nueva versión disponible"
  - Botón **Recargar** → `updateServiceWorker()` (recarga con nuevo SW)
  - Botón **Después** → oculta el banner en la sesión (`offlineReady` o estado local)
- No autoUpdate — el usuario decide cuándo recargar para no perder datos de formularios.

---

## Grupo 4 — Optimización (F4-8)

### Lazy loading

Permanecen en el bundle inicial: shell visual, router, auth bootstrap, `Login`, `SongList`.

Se carga con `import()` dinámico en `app.js`:

| Vista | Condición de carga |
|---|---|
| `SongDetail` | Route `song-detail` o `song-new` |
| `BandSettings` | Route `band-settings` |
| `InviteAccept` | Route `invite-accept` |

Cada ruta lazy muestra un skeleton/spinner simple mientras carga (componente `RouteLoader.js` reutilizable). Sin Suspense — usa estado local `loading` con `useEffect`, consistente con el resto de la app.

### Bundle analysis

```
rollup-plugin-visualizer   (devDep)
```

Script:
```
"build:analyze": "ANALYZE=true vite build"
```

Activado con variable de entorno en `vite.config.js` para no afectar el build normal. Genera `dist/stats.html` con tamaños gzip y brotli. No bloquea CI.

### Fonts en caché

Los archivos `.woff2` de `public/fonts/` quedan cubiertos por la regla `CacheFirst` del SW (TTL 1 año). Se sirven offline desde el primer load posterior.

---

## Criterios de aceptación globales

| Feature | AC |
|---|---|
| i18n | Cambiar a EN traduce todos los strings visibles; ES es el default |
| i18n | `localStorage` persiste el idioma entre sesiones |
| i18n | Sin strings en español hardcodeados en `src/` (visibles al usuario) |
| Visual | Lighthouse: colores actualizados visibles en ambos temas |
| Visual | No hay flash de tema incorrecto al cargar |
| Visual | Contraste WCAG AA en text/muted/accent-text sobre sus fondos respectivos |
| PWA | Lighthouse PWA score ≥ 90 |
| PWA | App instalable en Chrome mobile y desktop |
| PWA | SW registrado, manifest sin errores en DevTools |
| PWA | Íconos 192, 512 y maskable correctos |
| PWA | Supabase no aparece en la caché de Workbox |
| PWA | Banner de actualización aparece después de un nuevo deploy |
| PWA | `npm run generate:pwa-assets` regenera íconos desde `icon.svg` |
| Opt | Lazy routes no incluidas en el bundle inicial (verificar en DevTools Network) |
| Opt | `npm run build:analyze` genera `dist/stats.html` |

---

## Archivos críticos

| Archivo | Acción |
|---|---|
| `setlist-app/src/lib/i18n.js` | Crear |
| `setlist-app/src/stores/useTranslation.js` | Crear |
| `setlist-app/src/locales/{es,en}/{common,songs,bands,auth}.json` | Crear |
| `setlist-app/src/views/*.js` | Modificar (extraer strings) |
| `setlist-app/src/index.css` | Modificar (tokens + @font-face) |
| `setlist-app/index.html` | Modificar (script inline de tema) |
| `setlist-app/public/fonts/` | Crear (archivos .woff2) |
| `setlist-app/public/icon.svg` | Crear |
| `setlist-app/public/icon-*.png` | Generar via script |
| `setlist-app/vite.config.js` | Modificar (vite-plugin-pwa, visualizer) |
| `setlist-app/src/app.js` | Modificar (lazy imports, UpdateBanner) |
| `setlist-app/src/views/UpdateBanner.js` | Crear |
| `setlist-app/src/views/RouteLoader.js` | Crear |
| `setlist-app/package.json` | Agregar deps y scripts |
