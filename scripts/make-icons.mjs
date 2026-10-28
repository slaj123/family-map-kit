// Draws the home-screen icons (a terracotta pin on paper) as PNGs with no dependencies.
// iPhones need a PNG apple-touch-icon; they ignore SVG icons.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const PAPER = [0xf4, 0xef, 0xe6];
const INK = [0x1f, 0x2a, 0x2e];
const PIN = [0xd9, 0x61, 0x2b];

function inPin(x, y, grow) {
  const cx = 0.5, cy = 0.4, r = 0.25 + grow, tip = 0.86 + grow * 1.6;
  if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
  if (y > cy && y < tip) return Math.abs(x - cx) <= (r * 0.93 * (tip - y)) / (tip - cy);
  return false;
}

function colorAt(x, y) {
  if ((x - 0.5) ** 2 + (y - 0.4) ** 2 <= 0.105 ** 2) return PAPER;
  if (inPin(x, y, 0)) return PIN;
  if (inPin(x, y, 0.02)) return INK;
  return PAPER;
}

function png(size) {
  const ss = 4;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = colorAt((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
        }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(acc[i] / (ss * ss));
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

for (const [name, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size));
  console.log(`public/${name}`);
}
