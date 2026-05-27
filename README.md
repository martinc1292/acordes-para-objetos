# Acordes Para Objetos

App web para repertorios de banda con letras, acordes, tabs, favoritos, estados e invitaciones. La app actual vive en la raiz del repo y usa Vite, Preact, htm, Nanostores, i18next, Supabase y PWA.

## Desarrollo

```bash
npm install
npm run dev
npm test
npm run build
```

Scripts utiles:

- `npm run preview`: sirve el build de produccion.
- `npm run generate:pwa-assets`: regenera los iconos PWA desde `public/icon.svg`.
- `npm run build:analyze`: genera el analisis del bundle.

## Configuracion

Copia `.env.example` a `.env.local` y completa las variables de Supabase.

- `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se usan en el navegador.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son solo para scripts locales/admin.

## Estructura

- `src/`: app Preact, vistas, stores y librerias puras.
- `supabase/`: schema, RPCs, seed SQL y migraciones.
- `seeds/`: repertorio de ejemplo usado por tests y scripts.
- `scripts/`: utilidades de seed.
- `api/keepalive.js`: cron de Vercel para mantener Supabase activo.

El HTML autocontenido original quedo archivado en `docs/archive/legacy-setlist.html`.
