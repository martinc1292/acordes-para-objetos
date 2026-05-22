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

> En el sótano sin señal, si la app ya fue abierta una vez con wifi, funciona desde caché del navegador.

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

---

## Estructura del repositorio

```
/
├── setlist.html    # La app completa (todo en un solo archivo)
└── README.md       # Este archivo
```

---

## Canciones actuales

| # | Canción | Artista | Tono |
|---|---------|---------|------|
| 01 | Careless Whisper | George Michael / Wham! | Dm |
| 02 | Heart of Glass | Blondie | E |
| 03 | Hot Stuff | Donna Summer | Am |
| 04 | Smalltown Boy | Bronski Beat | Cm |
| 05 | Georgy Porgy | Toto | F#m7 |
| 06 | Love Her Madly | The Doors | Am |
| 07 | Call Mr. Lee | Television | G |
| 08 | My Favourite Game | The Cardigans | F#m |
| 09 | In Bloom | Nirvana | Bb |
| 10 | Lithium | Nirvana | D |
| 11 | Vicar in a Tutu | The Smiths | G |
| 12 | Fell in Love with a Girl | The White Stripes | E |
| 13 | White Wedding | Billy Idol | Am |
| 14 | Breed | Nirvana | B |
| 15 | Rebel Yell | Billy Idol | F#m |
| 16 | Muskrat Love | America | G |
| 17 | Tin Man | America | G |
| 18 | You Can Do Magic | America | D |
| 19 | Ventura Highway | America | B |
| 20 | No Podrás | Cristian Castro | G |
| 21 | Young Turks | Rod Stewart | A |
| 22 | It Could Happen to You | Chet Baker | Eb |
| 23 | Something | The Beatles | C |
| 24 | While My Guitar Gently Weeps | The Beatles | Am |
| 25 | Golden Slumbers | The Beatles | C |
| 26 | L.A. Woman | The Doors | A |
| 27 | Self Control | Laura Branigan | Am |
| 28 | Toxic Girl | Kings of Convenience | G |
| 29 | Aún Estás en Mis Sueños | Rata Blanca | Em |
| 30 | Eyes Without a Face | Billy Idol | C#m |
| 31 | That Girl | Stevie Wonder | Bbm |
| 32 | Honesty | Billy Joel | Bb |
| 33 | Just the Way You Are | Billy Joel | D |
| 34 | What You Won't Do for Love | Bobby Caldwell | F#m |
| 35 | Bad Girls | Donna Summer | G |
| 36 | Chega de Saudade | Antônio Carlos Jobim | Dm |
| 37 | Bigmouth Strikes Again | The Smiths | D |

---

> Los acordes y tabs son aproximaciones para referencia rápida durante el ensayo. Para versiones exactas, consultar [Ultimate Guitar](https://www.ultimate-guitar.com).
