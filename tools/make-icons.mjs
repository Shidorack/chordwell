// Draws the app icon (a guitar pick with strings) and writes icons/icon-192.png and icon-512.png.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, px) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const BG = [22, 19, 15], PICK = [242, 163, 58], PICK2 = [224, 123, 36], LINE = [26, 18, 9];
function color(u, v) {
  // pick: wide rounded top, narrow bottom. u,v in [-1,1]
  const vv = (v + 0.08) / 0.62, half = 0.62 * (1 - 0.42 * (vv + 1) / 2) * Math.sqrt(Math.max(0, 1 - Math.max(0, vv) ** 2.6));
  const inside = vv > -1 && vv < 1 && Math.abs(u) < half * (vv < 0 ? Math.sqrt(1 - vv * vv) * 0.55 + 0.45 : 1);
  if (!inside) return BG;
  // three strings across the pick
  for (const sy of [-0.24, -0.06, 0.12]) if (Math.abs(v - sy) < 0.022 && Math.abs(u) < 0.5) return LINE;
  const t = (v + 0.6) / 1.2;
  return PICK.map((c, i) => Math.round(c * (1 - t) + PICK2[i] * t));
}
for (const size of [192, 512]) {
  const px = Buffer.alloc(size * size * 4), SS = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = ((x + (sx + 0.5) / SS) / size) * 2 - 1, v = ((y + (sy + 0.5) / SS) / size) * 2 - 1;
      const c = color(u, v); r += c[0]; g += c[1]; b += c[2];
    }
    const o = (y * size + x) * 4, n = SS * SS;
    px[o] = r / n; px[o + 1] = g / n; px[o + 2] = b / n; px[o + 3] = 255;
  }
  writeFileSync(`icons/icon-${size}.png`, png(size, px));
}
console.log('icons written');
