#!/usr/bin/env node
// make-logo.mjs — generate assets/logo.png (400x400) with zero dependencies.
// Rounded-square gradient background + bold white "GLM". Pure-Node PNG encoder.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const W = 400, H = 400;
const buf = Buffer.alloc(W * H * 4); // RGBA

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const A = hex("#6D5EF6"), B = hex("#22C7E0"), WHITE = [255, 255, 255];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// rounded-rect signed coverage: 1 inside, 0 outside, AA in between
function rrCoverage(x, y, w, h, r) {
  const dx = Math.max(r - x, x - (w - r), 0);
  const dy = Math.max(r - y, y - (h - r), 0);
  const dist = Math.hypot(dx, dy) - r; // <0 inside corner circle
  return clamp(0.5 - dist, 0, 1);
}
// distance from point to segment (for M diagonals)
function segDist(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const t = clamp(((px - x1) * vx + (py - y1) * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
}

// --- letter geometry ---
const S = 30, top = 135, bot = 285, ht = bot - top, mid = top + ht / 2;
const inRect = (x, y, rx, ry, rw, rh) => x >= rx && x < rx + rw && y >= ry && y < ry + rh ? 1 : 0;

// G at x=50, L at x=162, M at x=274 ; each 76 wide
function letterCoverage(x, y) {
  let c = 0;
  // G (x0=50)
  const gx = 50, gw = 76;
  c = Math.max(c, inRect(x, y, gx, top, gw, S));                 // top bar
  c = Math.max(c, inRect(x, y, gx, top, S, ht));                 // left bar
  c = Math.max(c, inRect(x, y, gx, bot - S, gw, S));             // bottom bar
  c = Math.max(c, inRect(x, y, gx + gw - S, mid, S, ht / 2));    // lower-right bar
  c = Math.max(c, inRect(x, y, gx + gw / 2 - 2, mid - S / 2, gw / 2 + 2, S)); // tongue
  // L (x0=162)
  const lx = 162, lw = 76;
  c = Math.max(c, inRect(x, y, lx, top, S, ht));                 // left bar
  c = Math.max(c, inRect(x, y, lx, bot - S, lw, S));             // bottom bar
  // M (x0=274)
  const mx = 274, mw = 76, cx = mx + mw / 2, apex = top + ht * 0.72;
  c = Math.max(c, inRect(x, y, mx, top, S, ht));                 // left bar
  c = Math.max(c, inRect(x, y, mx + mw - S, top, S, ht));        // right bar
  const hs = S / 2;
  c = Math.max(c, clamp(hs + 0.5 - segDist(x, y, mx + hs, top + hs, cx, apex), 0, 1));       // left diagonal
  c = Math.max(c, clamp(hs + 0.5 - segDist(x, y, mx + mw - hs, top + hs, cx, apex), 0, 1));  // right diagonal
  return c;
}

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const bgA = rrCoverage(x + 0.5, y + 0.5, W, H, 76);
    // diagonal gradient parameter
    const t = clamp(((x / W) + (y / H)) / 2, 0, 1);
    let r = lerp(A[0], B[0], t), g = lerp(A[1], B[1], t), b = lerp(A[2], B[2], t);
    const lc = letterCoverage(x + 0.5, y + 0.5);
    r = lerp(r, WHITE[0], lc); g = lerp(g, WHITE[1], lc); b = lerp(b, WHITE[2], lc);
    const i = (y * W + x) * 4;
    buf[i] = Math.round(r); buf[i + 1] = Math.round(g); buf[i + 2] = Math.round(b);
    buf[i + 3] = Math.round(bgA * 255);
  }
}

// --- minimal PNG encoder (RGBA, colortype 6) ---
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) { raw[y * (1 + W * 4)] = 0; buf.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4); }
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
]);
mkdirSync(join(ROOT, "assets"), { recursive: true });
const out = join(ROOT, "assets", "logo.png");
writeFileSync(out, png);
console.log("wrote " + out + " (" + png.length + " bytes, " + W + "x" + H + ")");
