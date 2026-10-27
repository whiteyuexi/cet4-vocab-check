// scripts/make-logo-from-font.mjs — 用真字体的「3」+ 仪表盘拼成标识
//
// 为什么用字体：手工几何凑出来的 3 会读成 Ξ / Ǝ / ヨ（试过四种构造），
// 而字形是专业字体设计师画的，天然好看。这里把字形**转成路径**再写进 SVG，
// 所以产物不依赖用户电脑装了什么字体，任意缩放都清晰。
//
// 用法：node scripts/make-logo-from-font.mjs [字体文件] [输出SVG]
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FONT = process.argv[2] || 'C:\\Windows\\Fonts\\ariblk.ttf';           // Arial Black
const OUT = process.argv[3] || path.join(ROOT, 'assets', 'logo', 'mark-font.svg');

/* ---------- 画布与比例（照着作者那张 logo 的观感定的） ---------- */
const VB_W = 132, VB_H = 64;
const DIGIT_H = 60;                  // 数字视觉高度
const BASELINE = 61.5;               // 基线（略低于画布底，留一点光学下沉）
const DIGIT_X = 1;                   // 数字左边距
const GAP = 7;                       // 数字与仪表盘的间隙

// opentype.js 新版：loadSync 已废弃，改成读字节再 parse
const font = opentype.parse(fs.readFileSync(FONT).buffer.slice(0));
console.log('字体:', path.basename(FONT), '| unitsPerEm', font.unitsPerEm);

/* ---------- 取「3」的轮廓并缩放 ---------- */
const glyph = font.charToGlyph('3');
const p3 = glyph.getPath(0, 0, font.unitsPerEm);
const bb = p3.getBoundingBox();      // 以 em 为单位（y 向上）
const scale = DIGIT_H / Math.abs(bb.y2 - bb.y1);
const digitW = (bb.x2 - bb.x1) * scale;

// 把字形放到画布坐标：x = DIGIT_X，垂直方向翻转（SVG y 向下）
const d3 = p3.toPathData(3);
const g3 = `<g fill="#1A5FD0" transform="translate(${DIGIT_X - bb.x1 * scale} ${BASELINE}) scale(${scale} ${scale})">
    <path d="${d3}"/>
  </g>`;

/* ---------- 仪表盘（比例取自作者原图实测） ---------- */
const CX = DIGIT_X + digitW + GAP + 32;   // 圆心 x：数字右边 + 间隙 + 半径
const CY = VB_H / 2;
const R = 32;            // 外半径
const RING = 10.6;       // 环厚
const R_MID = R - RING / 2;
const R_IN = R - RING;
const HUB = 4.6;
const local = (deg, r) => [CX + r * Math.cos(deg * Math.PI / 180), CY + r * Math.sin(deg * Math.PI / 180)];

// 橙色环带扇区：-95° → -10°
const A0 = -95, A1 = -10;
const [ox0, oy0] = local(A0, R);
const [ox1, oy1] = local(A1, R);
const [ix1, iy1] = local(A1, R_IN);
const [ix0, iy0] = local(A0, R_IN);
const large = (A1 - A0) > 180 ? 1 : 0;
const sector = `M${ox0.toFixed(2)} ${oy0.toFixed(2)}
  A${R} ${R} 0 ${large} 1 ${ox1.toFixed(2)} ${oy1.toFixed(2)}
  L${ix1.toFixed(2)} ${iy1.toFixed(2)}
  A${R_IN} ${R_IN} 0 ${large} 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)} Z`;

// 指针：指向扇区中线
const [nx, ny] = local((A0 + A1) / 2, R_IN - 2.4);

const gauge = `<g>
    <circle cx="${CX}" cy="${CY}" r="${R_MID}" fill="none" stroke="#1A5FD0" stroke-width="${RING}"/>
    <path d="${sector}" fill="#FF6B4A"/>
    <line x1="${CX}" y1="${CY}" x2="${nx.toFixed(2)}" y2="${ny.toFixed(2)}"
          stroke="#FF6B4A" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="${CX}" cy="${CY}" r="${HUB}" fill="#FF6B4A"/>
  </g>`;

/* ---------- 组装 ---------- */
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  词汇账户余额查询 · 标识「30」
  「3」取自 ${path.basename(FONT)} 的字形轮廓（已转路径，不依赖系统字体）；
  「0」是仪表盘，比例取自作者原图实测：外径 64 / 环厚 10.6 / 内孔约占直径 34% / 橙扇区右上约 85°。
  为什么这么做：手工几何拼的 3 会读成 Ξ / Ǝ / ヨ（四种构造都试过），字形必须交给字体设计师。
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="${VB_W}" height="${VB_H}" role="img" aria-label="30 · 词汇账户余额查询">
  <title>词汇账户余额查询</title>
  ${g3}
  ${gauge}
</svg>
`;
fs.writeFileSync(OUT, svg, 'utf8');
console.log('已生成:', OUT, '(' + (svg.length / 1024).toFixed(1) + ' KB)');
console.log('  数字宽 %.1f / 圆盘圆心 x=%.1f（画布宽 %d）', digitW, CX, VB_W);
