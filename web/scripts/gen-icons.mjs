// Generates the PWA/app icons as PNGs with no external dependencies.
// Brand mark: dark panel (#10212b) with a centered green->blue diamond (◆).
// Run: node scripts/gen-icons.mjs   (writes into public/icons/)
import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

const BG = [16, 33, 43]; // #10212b
const TOP = [13, 122, 103]; // #0d7a67
const BOT = [21, 78, 159]; // #154e9f

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function png(size) {
  const c = size / 2;
  const r = size * 0.34;
  const edge = size * 0.012; // soft-ish edge
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    let off = y * (1 + size * 4);
    raw[off++] = 0; // filter: none
    const ty = y / size;
    const dr = Math.round(TOP[0] + (BOT[0] - TOP[0]) * ty);
    const dg = Math.round(TOP[1] + (BOT[1] - TOP[1]) * ty);
    const db = Math.round(TOP[2] + (BOT[2] - TOP[2]) * ty);
    for (let x = 0; x < size; x++) {
      const d = Math.abs(x - c) + Math.abs(y - c);
      const t = Math.max(0, Math.min(1, (r - d) / edge + 0.5)); // AA on the diamond edge
      raw[off++] = Math.round(BG[0] + (dr - BG[0]) * t);
      raw[off++] = Math.round(BG[1] + (dg - BG[1]) * t);
      raw[off++] = Math.round(BG[2] + (db - BG[2]) * t);
      raw[off++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(join(OUT, name), png(size));
  console.log("wrote", name);
}
