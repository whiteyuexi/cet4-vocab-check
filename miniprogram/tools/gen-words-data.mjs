import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ======================================================================
   gen-words-data.mjs —— 由 words.json 生成 utils/words-data.js
   字段裁剪必须与网页版 build.js 完全一致，否则引擎算出来的频段/词库规模会变。
   用法： node miniprogram/tools/gen-words-data.mjs
   ====================================================================== */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'miniprogram', 'utils', 'words-data.js');

const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'words.json'), 'utf8'));
const words = raw.map(function (o) {
  const r = { w: o.w, t: o.t, b: o.b, f: o.f };   // 与 build.js 一致：b=词库掩码，f=频段
  if (o.p) r.p = o.p;
  if (o.x) r.x = 1;
  if (o.ph) r.ph = o.ph;
  return r;
});

const header = [
  '/* ======================================================================',
  '   词库数据（由 words.json 生成，勿手改）',
  '   生成方式见 miniprogram/IMPORT-NOTES.md；字段与网页版 build.js 的裁剪完全一致：',
  '     w 单词 / t 释义 / b 词库位掩码（1 四级 2 六级新增 3 两者都有）/ f 词频段',
  '     p 音标（可选）/ x 拓展派生词标记（可选）/ ph 短语（可选）',
  '   词条数: ' + words.length,
  '   ====================================================================== */',
  "'use strict';",
  '',
  'module.exports = ['
].join('\n');

fs.writeFileSync(OUT, header + words.map(function (o) { return JSON.stringify(o); }).join(',\n') + '\n];\n', 'utf8');
console.log('已生成 ' + OUT + '：' + words.length + ' 词条，' + fs.statSync(OUT).size + ' 字节');
