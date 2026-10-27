// scripts/trace-ai-logo.mjs — 把 AI 原图**精确描边**成矢量（解决放大发糊）
//
// 为什么这么做：原图只有 274×274，标识本身约 216×122。放大到 216px 显示就是 1:1 硬撑，
// 再大就更糊。手绘近似又不像原图（试过：三角凹口读成"Ξ"）。
// 正解是沿着原图轮廓描边：颜色分类出「蓝色部分」和「橙色部分」两张二值图，
// 分别用 potrace 描成路径，再拼成一个双色 SVG —— 形状 100% 是原图，且任意尺寸清晰。
//
// 用法：node scripts/trace-ai-logo.mjs [源PNG] [输出SVG]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import potrace from 'potrace';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = process.argv[2] || path.join(ROOT, 'assets', 'logo', 'ai', 'ai-mark-1024.png');
const OUT = process.argv[3] || path.join(ROOT, 'assets', 'logo', 'mark-traced.svg');

const png = PNG.sync.read(fs.readFileSync(SRC));
const { width: W, height: H, data } = png;
console.log('源图:', W + '×' + H);

/* ---------- 1. 颜色分类：蓝 / 橙 ---------- */
function classify(r, g, b, a) {
  if (a < 120) return 0;                 // 透明
  // 橙：红显著大于蓝；蓝：蓝显著大于红
  if (r > 150 && b < 140 && r - b > 40) return 2;
  if (b > 90 && b - r > 20) return 1;
  return 1;                              // 其余（暗部）归蓝，避免出现漏白
}
/* 软灰度掩膜：值 = alpha（该像素属于这个颜色的置信度），而不是 0/1。
   二值掩膜会让 potrace 沿着像素台阶描边，放大后全是锯齿（第一版就是这样）。
   带 alpha 的软边 + 轻度模糊之后，potrace 在 128 灰阶处取到的是亚像素级的平滑轮廓。 */
const masks = { 1: new Uint8Array(W * H), 2: new Uint8Array(W * H) };
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const k = classify(data[i], data[i + 1], data[i + 2], data[i + 3]);
    if (k) masks[k][y * W + x] = data[i + 3];
  }
}
// 3×3 盒式模糊一轮，进一步抹掉像素台阶
function blur(mask) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
          sum += mask[yy * W + xx]; n++;
        }
      }
      out[y * W + x] = Math.round(sum / n);
    }
  }
  return out;
}
for (const k of [1, 2]) {
  // 八轮 3×3 ≈ 高斯半径 4：源图是放大过的低分辨率位图，边缘本身有台阶，必须糊掉到亚像素级别\n  for (let r = 0; r < 8; r++) masks[k] = blur(masks[k]);
  let n = 0;
  for (let i = 0; i < masks[k].length; i++) if (masks[k][i] > 128) n++;
  console.log('  ' + (k === 1 ? '蓝色' : '橙色') + '覆盖像素:', n);
}

/* ---------- 2. 用 potrace 描边 ---------- */
// potrace 接受 Buffer（灰度位图，1 字节/像素）或 dataUrl；按「目标色=255，其余=0」喂进去
function traceMask(mask) {
  /* potrace v2 的 Node API 收的是"图片字节"（PNG/JPG buffer 或路径），不是裸位图。
     所以先用 pngjs 把掩膜编成黑白 PNG 再喂给它——直接传 Buffer(Uint8) 会报
     "Cannot read properties of undefined (reading 'bitmap')"（试过了）。 */
  const out = new PNG({ width: W, height: H });
  for (let i = 0; i < mask.length; i++) {
    // 反过来：置信度高（255）→ 涂黑（0）；置信度低 → 留白（255）
    const v = 255 - mask[i];
    const j = i * 4;
    out.data[j] = v; out.data[j + 1] = v; out.data[j + 2] = v; out.data[j + 3] = 255;
  }
  const buf = PNG.sync.write(out);
  // optTolerance 放大到 1.2：允许更多"拉直"，轮廓更顺（0.35 会保留一堆像素台阶）
  const opts = { turdSize: 30, alphaMax: 1, optCurve: true, optTolerance: 3.5, threshold: 128, blackOnWhite: true };
  return new Promise((res, rej) => {
    potrace.trace(buf, opts, (err, svg) => {
      if (err) return rej(err);
      // 取第一个 <path d="...">
      const m = /<path[^>]*\sd="([^"]+)"/.exec(svg);
      res(m ? m[1] : '');
    });
  });
}
const dBlue = await traceMask(masks[1]);
const dOrange = await traceMask(masks[2]);
console.log('路径长度: 蓝', dBlue.length, '字符 / 橙', dOrange.length, '字符');

/* ---------- 3. 拼成双色 SVG（potrace 输出以 1px = 1 单位，正好对上源图尺寸） ---------- */
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  词汇账户余额查询 · 标识（由 AI 原图精确描边而来）
  来源：作者提供的 AI 生成图，经 scripts/trace-ai-logo.mjs 用 potrace 描边。
  为什么矢量化：原图仅 274px，放大即糊；描边后任意尺寸清晰，且形状与原图一致（非手绘近似）。
  两色分层：蓝 #1A5FD0（主形）/ 橙 #FF6B4A（仪表扇区 + 指针）。
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="30 · 词汇账户余额查询">
  <title>词汇账户余额查询</title>
  <path fill="#FF6B4A" fill-rule="evenodd" d="${dOrange}"/>
  <path fill="#1A5FD0" fill-rule="evenodd" d="${dBlue}"/>
</svg>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg, 'utf8');
console.log('已生成:', OUT, '(' + (svg.length / 1024).toFixed(1) + ' KB)');
