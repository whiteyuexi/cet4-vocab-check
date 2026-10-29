// miniprogram/tools/gen-mini-data.mjs —— 由仓库数据生成小程序用的两份数据模块
//
// 为什么要单独生成：
//   · 小程序不能读外部文件，词库和例句必须编译进包里（.js 模块）；
//   · 主包有体积上限，所以字段要裁到"引擎真正会用的那几个"，例句也只取每词一句；
//   · 网页版的 build.js 已经做过同样的裁剪，这里保持字段一致，
//     否则引擎算出来的频段规模、词库规模会跟网页版对不上（一致性测试会挂）。
//
// 用法：node miniprogram/tools/gen-mini-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_WORDS = path.join(ROOT, 'miniprogram', 'utils', 'words-data.js');
const OUT_SENT = path.join(ROOT, 'miniprogram', 'utils', 'sentences-data.js');

/* ---------------- 词库 ---------------- */
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'words.json'), 'utf8'));
const words = raw.map((o) => {
  const r = { w: o.w, t: o.t, b: o.b, f: o.f };   // 与 build.js 一致：b=词库掩码，f=频段
  if (o.p) r.p = o.p;
  if (o.x) r.x = 1;
  if (o.ph) r.ph = o.ph;
  return r;
});

const wordsHeader = `/* ======================================================================
   词库数据（由 words.json 生成，勿手改；重新生成见 miniprogram/README.md）
   字段与网页版 build.js 的裁剪完全一致：
     w 单词 / t 释义 / b 词库位掩码（1 四级 2 六级新增 3 两者都有）/ f 词频段
     p 音标（可选）/ x 拓展派生词标记（可选）/ ph 短语（可选）
   词条数: ${words.length}
   ====================================================================== */
'use strict';

module.exports = [
${words.map((o) => JSON.stringify(o)).join(',\n')}
];
`;
fs.writeFileSync(OUT_WORDS, wordsHeader, 'utf8');

/* ---------------- 例句 ----------------
   原始 sentences.json 是 { 词: [{e,z,id}, ...] }，5,138 个词、每词可能多句。
   小程序只用得上"揭示答案时给一句"，所以每词取第一句，压成 [英文, 中文] 两元组；
   键用词本身（引擎里按词查，不依赖下标，词表变了也不会错位）。 */
const rawSent = JSON.parse(fs.readFileSync(path.join(ROOT, 'sentences.json'), 'utf8'));
const sent = {};
let wordsWithSent = 0;
for (const key of Object.keys(rawSent)) {
  const list = rawSent[key];
  if (!list || !list.length) continue;
  const first = list[0];
  if (!first || !first.e) continue;
  sent[key] = [first.e, first.z || ''];
  wordsWithSent++;
}

const sentHeader = `/* ======================================================================
   例句数据（由 sentences.json 生成，勿手改）
   语料来源：Tatoeba 英中对照句库（CC-BY 2.0 FR），每词保留一句最适合展示的；
   结构：{ 单词: [英文, 中文] }，共 ${wordsWithSent} 个词有例句。
   为什么只留一句：主包体积有限，一题只需要一句；要更多例句请回网页版。
   ====================================================================== */
'use strict';

module.exports = ${JSON.stringify(sent)};
`;
fs.writeFileSync(OUT_SENT, sentHeader, 'utf8');

const kb = (p) => Math.round(fs.statSync(p).size / 1024);
console.log('已生成 utils/words-data.js：' + words.length + ' 词条，' + kb(OUT_WORDS) + ' KB');
console.log('已生成 utils/sentences-data.js：' + wordsWithSent + ' 个词有例句，' + kb(OUT_SENT) + ' KB');
console.log('两份数据合计 ' + (kb(OUT_WORDS) + kb(OUT_SENT)) + ' KB（主包上限 2 MB，其余代码约 150 KB）');
