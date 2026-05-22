// Genera los 3 íconos PNG para la PWA sin dependencias externas.
// Usa la API Resvg via @resvg/resvg-js si está disponible, o escribe un PNG mínimo.
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import { deflateSync, crc32 } from 'zlib';

// ── PNG encoder mínimo ────────────────────────────────────────────────────────
function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  return Buffer.concat([u32be(data.length), typeBuffer, data, u32be(crc >>> 0)]);
}

function encodePNG(pixels, size) {
  // pixels: Uint8Array RGBA, row by row
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB (sin alpha para simplificar, pero usamos 6=RGBA)
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Build raw scanlines (filter byte 0 + RGBA per pixel)
  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * rowBytes + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2];
      raw[dst+3] = pixels[src+3];
    }
  }

  const compressed = deflateSync(raw);
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, chunk('IHDR', ihdr), idat, iend]);
}

// ── Dibuja el ícono ───────────────────────────────────────────────────────────
function drawIcon(size, maskable = false) {
  const pixels = new Uint8Array(size * size * 4);

  // Paleta
  const BG     = [14, 14, 14, 255];       // #0e0e0e
  const ACCENT = [255, 87, 34, 255];      // #ff5722
  const WHITE  = [255, 255, 255, 255];
  const BG_MASK= [14, 14, 14, 255];

  function setPixel(x, y, color) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i]   = color[0];
    pixels[i+1] = color[1];
    pixels[i+2] = color[2];
    pixels[i+3] = color[3];
  }

  function fillRect(x, y, w, h, color) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        setPixel(x + dx, y + dy, color);
  }

  function fillCircle(cx, cy, r, color) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx*dx + dy*dy <= r*r)
          setPixel(cx + dx, cy + dy, color);
  }

  // Fondo
  fillRect(0, 0, size, size, maskable ? ACCENT : BG);

  // Círculo central de acento (o de fondo en maskable)
  const r = Math.floor(size * 0.38);
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  fillCircle(cx, cy, r, maskable ? BG_MASK : ACCENT);

  // Letra "S" simplificada como barras horizontales gruesas
  const barH = Math.max(2, Math.floor(size * 0.07));
  const barW = Math.floor(size * 0.24);
  const bx = cx - Math.floor(barW / 2);
  const iconColor = maskable ? ACCENT : WHITE;

  // Top bar
  fillRect(bx, cy - Math.floor(size*0.14), barW, barH, iconColor);
  // Mid bar
  fillRect(bx, cy - Math.floor(barH/2), barW, barH, iconColor);
  // Bot bar
  fillRect(bx, cy + Math.floor(size*0.14) - barH, barW, barH, iconColor);

  // Líneas verticales: izquierda arriba, derecha abajo
  const lineH = Math.floor(size * 0.14);
  const lineW = Math.max(2, Math.floor(size * 0.035));
  fillRect(bx, cy - Math.floor(size*0.14), lineW, lineH, iconColor);
  fillRect(bx + barW - lineW, cy, lineW, lineH, iconColor);

  return encodePNG(pixels, size);
}

// ── Salida ────────────────────────────────────────────────────────────────────
const out = '/Users/martincarrera/Desktop/Proyectos/acordes-para-objetos/public/icons';

writeFileSync(`${out}/icon-192.png`, drawIcon(192, false));
writeFileSync(`${out}/icon-512.png`, drawIcon(512, false));
writeFileSync(`${out}/icon-512-maskable.png`, drawIcon(512, true));

console.log('Íconos generados correctamente.');
