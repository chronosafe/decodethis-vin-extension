// Generates icons/icon16.png, icon48.png and icon128.png: a white magnifying glass on a
// rounded teal square. No dependencies; the PNG is written by hand with node:zlib.
//
//   node scripts/make-icons.mjs
//
// These are functional placeholders. Replace the PNGs with final artwork any time; the
// manifest only needs files of the right size at the same paths.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BACKGROUND = [14, 124, 134]; // teal
const FOREGROUND = [255, 255, 255];
const SUPERSAMPLE = 4;

// Shapes in a unit square, so one description serves every size.
const ring = { cx: 0.43, cy: 0.43, outer: 0.25, inner: 0.13 };
const handle = { x1: 0.61, y1: 0.61, x2: 0.8, y2: 0.8, halfWidth: 0.065 };
const cornerRadius = 0.22;

const inRoundedSquare = (x, y) => {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - cornerRadius), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - cornerRadius), 0);
  return dx * dx + dy * dy <= cornerRadius * cornerRadius;
};
const inRing = (x, y) => {
  const d = Math.hypot(x - ring.cx, y - ring.cy);
  return d <= ring.outer && d >= ring.inner;
};
const inHandle = (x, y) => {
  const { x1, y1, x2, y2, halfWidth } = handle;
  const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2)));
  return Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1))) <= halfWidth;
};

function render(size) {
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4); // leading 0 = PNG filter "none"
    for (let px = 0; px < size; px++) {
      let alpha = 0, r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / size;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / size;
          if (!inRoundedSquare(x, y)) continue;
          const [cr, cg, cb] = inRing(x, y) || inHandle(x, y) ? FOREGROUND : BACKGROUND;
          alpha += 1; r += cr; g += cg; b += cb;
        }
      }
      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const o = 1 + px * 4;
      row[o] = alpha ? Math.round(r / alpha) : 0;
      row[o + 1] = alpha ? Math.round(g / alpha) : 0;
      row[o + 2] = alpha ? Math.round(b / alpha) : 0;
      row[o + 3] = Math.round((255 * alpha) / samples);
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};
const png = (size) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(render(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  const file = new URL(`icon${size}.png`, outDir);
  writeFileSync(file, png(size));
  console.log(`wrote ${fileURLToPath(file)}`);
}
