// 生成 TikTok 壳应用图标：src-tauri-tiktok/app-icon.png（1024×1024）
// TikTok 品牌黑底 + 三色偏移音符（青/红/白，近似官方字形）。纯 node 内置 zlib 手写 PNG 编码。
// 运行：node scripts/make-tiktok-icon.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const S = 1024;
const px = Buffer.alloc(S * S * 4, 0); // RGBA

const put = (x, y, [r, g, b, a]) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const ia = a / 255;
  const ib = px[i + 3] / 255;
  const oa = ia + ib * (1 - ia);
  if (oa === 0) return;
  px[i] = Math.round((r * ia + px[i] * ib * (1 - ia)) / oa);
  px[i + 1] = Math.round((g * ia + px[i + 1] * ib * (1 - ia)) / oa);
  px[i + 2] = Math.round((b * ia + px[i + 2] * ib * (1 - ia)) / oa);
  px[i + 3] = Math.round(oa * 255);
};
const fillCircle = (cx, cy, r, color) => {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, color);
    }
  }
};
const fillRect = (x0, y0, x1, y1, color) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, color);
};

// 背景：TikTok 品牌黑 #161823
fillRect(0, 0, S - 1, S - 1, [22, 24, 35, 255]);

// 音符（近似官方字形：左下圆 + 竖杆 + 右上圆钩），三色偏移 = TikTok 标志性残影
const drawNote = (dx, dy, color) => {
  fillCircle(470 + dx, 700 + dy, 150, color); // 左下圆
  fillRect(560 + dx, 300 + dy, 655 + dx, 720 + dy, color); // 竖杆
  fillCircle(607 + dx, 320 + dy, 95, color); // 右上圆钩
};
drawNote(-16, 12, [37, 244, 238, 255]); // 青 #25F4EE
drawNote(16, -12, [254, 44, 85, 255]); // 红 #FE2C55
drawNote(0, 0, [255, 255, 255, 255]); // 白

// ---- PNG 编码（8bit RGBA，filter 0） ----
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const stride = S * 4 + 1;
const raw = Buffer.alloc(S * stride);
for (let y = 0; y < S; y++) {
  raw[y * stride] = 0; // filter: none
  px.copy(raw, y * stride + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
const out = fileURLToPath(new URL("../src-tauri-tiktok/app-icon.png", import.meta.url));
writeFileSync(out, png);
console.log("icon written:", out);
