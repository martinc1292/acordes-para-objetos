# 🎸 Setlist · Sala de Ensayo

App offline para tener letras, acordes y tabs siempre disponibles — sin wifi, sin apps, directo desde el celu.

---

## ¿Qué es esto?

Un archivo HTML autocontenido con todas las canciones del repertorio. Incluye por canción:

- Tonalidad y tempo
- Estructura del tema (intro → verse → chorus, etc.)
- Progresión de acordes
- Tab del riff / intro principal
- Espacio para la letra
- Notas de ejecución

---

## Cómo usarlo

### En el celu (modo app offline)

1. Abrí [la URL de GitHub Pages](#) en el navegador del celu
2. Entrá al sitio con wifi al menos una vez para que cargue
3. En iOS: **Compartir → Agregar a pantalla de inicio**
4. En Android: **Menú → Agregar a pantalla de inicio**
5. Listo — la próxima vez abrís la app sin necesidad de wifi

### En la compu

Simplemente abrí `setlist.html` con cualquier navegador. No necesita servidor ni instalación.

---

## Cómo agregar o editar canciones

Editá el archivo `setlist.html` directamente desde GitHub (botón ✏️ Edit) o en cualquier editor de texto.

Buscá el array `const SONGS = [...]` cerca del comienzo del script. Cada canción tiene esta estructura:

```js
{
  title: "Nombre de la canción",
  artist: "Artista o banda",
  key: "Dm",                        // tonalidad
  tempo: "120 BPM",                 // tempo o feel
  structure: "Intro → Verse → Chorus → Outro",
  progression: "Dm  -  Bb  -  Gm  -  A7",
  tabs: [
    {
      title: "Nombre del riff",
      tab:
`e|--0-2-3--|
B|---------|
G|---------|`
    }
  ],
  lyrics: `Primera línea
Segunda línea
Estribillo...`,
  notes: "Alguna nota de ejecución o contexto."
}
```

Para **agregar una canción nueva**, copiá cualquier bloque `{ ... }` existente, pegalo al final del array (antes del `]`), y modificá los campos. Recordá separar con coma.

Para **agregar la letra**, pegala en el campo `lyrics` usando backticks (\`) para respetar los saltos de línea.

---

## Cómo contribuir (workflow de la banda)

1. Entrás a este repositorio en GitHub desde el celu o la compu
2. Abrís `setlist.html` y clickeás el ícono de lápiz (✏️ Edit this file)
3. Hacés los cambios (nueva canción, letra, corrección de acordes, etc.)
4. Abajo, en **Commit changes**, escribís una descripción breve (ej: `Agrego letra de Lithium`)
5. Click en **Commit changes** — en ~30 segundos la página se actualiza para todos

No hace falta saber de programación. Es editar texto y guardar.

