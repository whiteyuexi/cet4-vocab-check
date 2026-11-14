/* 把参考图里的城楼抠成透明贴图，并生成 弱 / 中 / 强 / 未测 四种变体。
   做法：从四边泛洪去掉黑底（不按亮度硬切，否则屋顶暗部会被打穿），
   裁到内容边界，缩到统一高度，再按变体做去饱和 / 压暗 / 染色。

   用法：node scripts/prep-city-sprite.mjs <输入.png> [输出目录]
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
const outDir = process.argv[3] || path.join(ROOT, 'assets', 'map');
if (!input) {
  console.error('用法: node scripts/prep-city-sprite.mjs <输入.png> [输出目录]');
  process.exit(1);
}

const TARGET_H = Number(process.env.CITY_H || 256);

const src = PNG.sync.read(fs.readFileSync(input));
const { width: W, height: H, data } = src;

// 1) 泛洪去黑底：只用「与边界连通的暗像素」判为背景
const isDark = i => {
  const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
  return Math.max(r, g, b) < 52;
};
const bg = new Uint8Array(W * H);
const queue = [];
for (let x = 0; x < W; x++) { queue.push(x); queue.push((H - 1) * W + x); }
for (let y = 0; y < H; y++) { queue.push(y * W); queue.push(y * W + W - 1); }
while (queue.length) {
  const i = queue.pop();
  if (bg[i] || !isDark(i)) continue;
  bg[i] = 1;
  const x = i % W, y = (i - x) / W;
  if (x > 0) queue.push(i - 1);
  if (x < W - 1) queue.push(i + 1);
  if (y > 0) queue.push(i - W);
  if (y < H - 1) queue.push(i + W);
}

// 2) 写 alpha：背景透明；与背景相邻的边缘给半透明，避免硬锯齿
let minX = W, minY = H, maxX = -1, maxY = -1;
for (let i = 0; i < W * H; i++) {
  const x = i % W, y = (i - x) / W;
  let a = 255;
  if (bg[i]) a = 0;
  else {
    let near = false;
    if (x > 0 && bg[i - 1]) near = true;
    if (x < W - 1 && bg[i + 1]) near = true;
    if (y > 0 && bg[i - W]) near = true;
    if (y < H - 1 && bg[i + W]) near = true;
    if (near) a = 190;
  }
  data[i * 4 + 3] = a;
  if (a > 0) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

// 3) 裁到内容边界
const cw = maxX - minX + 1, chh = maxY - minY + 1;
const box = new PNG({ width: cw, height: chh });
for (let y = 0; y < chh; y++) {
  for (let x = 0; x < cw; x++) {
    const s = ((y + minY) * W + (x + minX)) * 4;
    const d = (y * cw + x) * 4;
    box.data[d] = data[s]; box.data[d + 1] = data[s + 1];
    box.data[d + 2] = data[s + 2]; box.data[d + 3] = data[s + 3];
  }
}

// 4) 双线性缩放到目标高度
function resize(pngIn, targetH) {
  const sw = pngIn.width, sh = pngIn.height;
  const scale = targetH / sh;
  const tw = Math.max(1, Math.round(sw * scale)), th = targetH;
  const out = new PNG({ width: tw, height: th });
  for (let y = 0; y < th; y++) {
    const sy = y / scale;
    const y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < tw; x++) {
      const sx = x / scale;
      const x0 = Math.floor(sx), x1 = Math.min(sw - 1, x0 + 1), fx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const p00 = pngIn.data[(y0 * sw + x0) * 4 + c];
        const p10 = pngIn.data[(y0 * sw + x1) * 4 + c];
        const p01 = pngIn.data[(y1 * sw + x0) * 4 + c];
        const p11 = pngIn.data[(y1 * sw + x1) * 4 + c];
        out.data[(y * tw + x) * 4 + c] =
          (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
      }
    }
  }
  return out;
}
const base = resize(box, TARGET_H);

// 5) 变体：strong 原色；mid 略去饱和；weak 去饱和+压暗；untested 灰化+半透明
function variant(png, { sat = 1, dark = 1, tint = null, alpha = 1 }) {
  const out = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.width * png.height; i++) {
    const o = i * 4;
    let r = png.data[o], g = png.data[o + 1], b = png.data[o + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = lum + (r - lum) * sat;
    g = lum + (g - lum) * sat;
    b = lum + (b - lum) * sat;
    r *= dark; g *= dark; b *= dark;
    if (tint) {
      r = r * (1 - tint.a) + tint.r * tint.a;
      g = g * (1 - tint.a) + tint.g * tint.a;
      b = b * (1 - tint.a) + tint.b * tint.a;
    }
    out.data[o] = Math.max(0, Math.min(255, r));
    out.data[o + 1] = Math.max(0, Math.min(255, g));
    out.data[o + 2] = Math.max(0, Math.min(255, b));
    out.data[o + 3] = png.data[o + 3] * alpha;
  }
  return out;
}

const files = {
  'city-strong.png': variant(base, {}),
  'city-mid.png': variant(base, { sat: 0.82, dark: 0.94 }),
  'city-weak.png': variant(base, { sat: 0.55, dark: 0.80, tint: { r: 120, g: 40, b: 30, a: 0.18 } }),
  'city-untested.png': variant(base, { sat: 0.12, dark: 0.92, alpha: 0.55 })
};

fs.mkdirSync(outDir, { recursive: true });
for (const name of Object.keys(files)) {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, PNG.sync.write(files[name]));
  console.log(name, files[name].width + '×' + files[name].height, Math.round(fs.statSync(p).size / 1024) + ' KB');
}
console.log('已写入', outDir);
