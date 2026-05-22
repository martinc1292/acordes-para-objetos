# Setlist · Sala de Ensayo

App web para tener el repertorio de la banda con letras, acordes, tabs y notas. Este repo ahora arranca la migración desde el HTML autocontenido original hacia una app Vite modular.

## Estado actual

- Entrada principal nueva: `index.html` + `src/main.js`
- Capa de datos: `src/lib/api.js` usa Supabase cuando hay env vars y fallback local cuando no
- Datos del repertorio: `src/data/songs.js`
- Estilos base: `src/style.css`
- Respaldo legacy intacto: `setlist.html`

La app puede correr sin Supabase usando los datos locales de `src/data/songs.js`. Supabase ya tiene schema, script de migración y cliente opcional preparados.

## Desarrollo local

Instalar dependencias:

```bash
npm install
```

Levantar la app:

```bash
npm run dev
```

Crear build de producción:

```bash
npm run build
```

Previsualizar el build:

```bash
npm run preview
```

Validar que el repertorio mantiene el shape esperado:

```bash
npm run check:songs
```

La validación espera 37 canciones y falla si falta `title`, `artist`, `key` o si `tabs` no es un array.

Ejecutar tests de scripts:

```bash
npm test
```

## Cómo editar canciones

Editá `src/data/songs.js`. Cada canción conserva esta estructura:

```js
{
  title: "Nombre de la canción",
  artist: "Artista o banda",
  key: "Dm",
  tempo: "120 BPM",
  structure: "Intro → Verse → Chorus",
  progression: "Dm - Bb - Gm - A7",
  tabs: [
    {
      title: "Riff principal",
      tab: `e|--0-2-3--|`
    }
  ],
  lyrics: "",
  notes: "Notas de ejecución."
}
```

## Setup Supabase

1. Crear un proyecto en Supabase.
2. Abrir SQL Editor y ejecutar `supabase/schema.sql`.
3. Copiar `.env.example` a `.env.local`.
4. Completar:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

La `SUPABASE_SERVICE_ROLE_KEY` es solo para scripts locales. No debe usarse en código del navegador ni subirse al repo.

Antes de insertar datos reales, hacer un dry-run:

```bash
npm run migrate:songs
```

Cuando el schema esté creado y `.env.local` tenga las claves reales:

```bash
npm run migrate:songs -- --apply
```

El script de migración lee desde `src/data/songs.js`, no desde `setlist.html`.
