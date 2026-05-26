# Setlist App

Base nueva para el refactor definido en `docs/PLAN_DESARROLLO.md`.

## Estado

- Rama: `refactor-F0-1-setup-preact`
- Fase iniciada: F0 - Extraccion + setup
- Ticket cubierto: F0-1 - Vite + Preact + htm

## Scripts

```bash
npm install
npm run dev
npm run build
npm test
```

## Estructura inicial

- `src/app.js`: primera pantalla Preact.
- `src/main.js`: entrypoint Vite.
- `src/stores/`: stores base con Nanostores.
- `src/lib/`, `src/db/`, `src/repositories/`, `src/views/`, `src/components/`: carpetas preparadas para las fases siguientes.
- `seeds/`: destino para migrar las canciones hardcodeadas.

## Siguiente paso

F0-2: extraer la logica de transposicion a `src/lib/transpose.js` y cubrirla con tests.
