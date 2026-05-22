# Setlist · Sala de Ensayo

App web para tener el repertorio de la banda con letras, acordes, tabs y notas. Este repo ahora arranca la migración desde el HTML autocontenido original hacia una app Vite modular.

## Estado actual

- Entrada principal nueva: `index.html` + `src/main.js`
- Datos del repertorio: `src/data/songs.js`
- Estilos base: `src/style.css`
- Respaldo legacy intacto: `setlist.html`

El primer incremento todavía no incluye Supabase, realtime, IndexedDB ni PWA. La app usa datos locales exportados desde `src/data/songs.js`.

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

Cuando llegue la migración a Supabase, el script de carga deberá leer desde `src/data/songs.js`, no desde `setlist.html`.
