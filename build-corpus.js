// build-corpus.js — 用 Tatoeba 英中对照语料构建例句库
// 输出: sentences.json  { "单词": [{ e: 英文例句, z: 中文翻译, id: Tatoeba 句子ID }] }
// 说明：只保留"能覆盖到词库里的词"的句子，并按句子质量排序取前 2 条。

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TMP = path.join(process.env.TEMP || '/tmp', 'tatoeba');
const OUT = path.join(ROOT, 'sentences.json');

const read = f => fs.readFileSync(path.join(TMP, f), 'utf8').split('\n');

/* ---------- 1. 载入中文句子 ---------- */
const zh = new Map();
for (const line of read('cmn_sentences.tsv')) {
  const p = line.split('\t');
  if (p.length < 3) continue;
  zh.set(p[0], p[2]);
}
console.log('中文句子:', zh.size);

/* ---------- 2. 载入英中对照关系 ---------- */
const pairs = [];               // [engId, cmnId]
const needEng = new Set();
for (const line of read('eng-cmn_links.tsv')) {
  const p = line.split('\t');
  if (p.length < 2) continue;
  if (!zh.has(p[1])) continue;   // 中文缺失的跳过
  pairs.push([p[0], p[1]]);
  needEng.add(p[0]);
}
console.log('英中对照:', pairs.length, '| 需要的英文句子:', needEng.size);

/* ---------- 3. 只挑出用得上的英文句子 ---------- */
const en = new Map();
for (const line of read('eng_sentences.tsv')) {
  const i = line.indexOf('\t');
  if (i < 0) continue;
  const id = line.slice(0, i);
  if (!needEng.has(id)) continue;
  // 格式可能是 id\ttext 或 id\tlang\ttext
  const rest = line.slice(i + 1);
  const parts = rest.split('\t');
  const text = parts.length >= 2 ? parts.slice(1).join('\t') : parts[0];
  en.set(id, text.trim());
  if (en.size === needEng.size) break;
}
console.log('匹配到英文句子:', en.size);

/* ---------- 4. 索引：单词 → 候选例句 ---------- */
const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'words.json'), 'utf8'));
const known = new Set(words.map(w => w.w.toLowerCase()));

const index = new Map();
let usable = 0;
for (const [engId, cmnId] of pairs) {
  const e = en.get(engId);
  const z = zh.get(cmnId);
  if (!e || !z) continue;
  if (e.length > 110 || e.length < 18) continue;          // 太短没语境，太长占地方
  if (/[^\x00-\x7F]/.test(e)) continue;                   // 英文句子里混了非 ASCII，跳过
  if (!/[.!?]$/.test(e)) continue;                        // 必须是完整句子
  usable++;

  // 提取句子里出现的、且在我们词库中的单词
  const toks = new Set(String(e).toLowerCase().match(/[a-z][a-z'-]{1,}/g) || []);
  for (const t of toks) {
    if (!known.has(t)) continue;
    if (!index.has(t)) index.set(t, []);
    const arr = index.get(t);
    if (arr.length >= 6) continue;
    if (arr.some(x => x.e === e)) continue;
    arr.push({ e: e, z: z, id: +engId });
  }
}

/* ---------- 5. 每个词挑最好的 2 条 ---------- */
function score(s) {
  const n = s.e.split(/\s+/).length;
  let v = 0;
  v -= Math.abs(n - 11) * 2;                  // 11 词左右最好读
  v -= Math.abs(s.e.length - 62) * 0.15;      // 长度接近 62 字符
  if (/^(The|A|An|I|You|He|She|We|They)\b/.test(s.e)) v += 2;   // 以主语开头更像例句
  if (s.e.split(/\s+/).length < 6) v -= 3;
  return v;
}
const out = {};
let covered = 0, total = 0;
for (const [w, arr] of index) {
  arr.sort((a, b) => score(b) - score(a));
  const pick = arr.slice(0, 2).sort((a, b) => score(a) - score(b)).reverse();
  out[w] = pick;
  covered++;
  total += pick.length;
}
console.log('可用句子:', usable);
console.log('覆盖到的词:', covered, '/', known.size, '(' + Math.round(covered / known.size * 100) + '%)');
console.log('例句总数:', total);
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('sentences.json:', (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB');
const sample = Object.keys(out).slice(3000, 3005);
sample.forEach(w => { const s = out[w][0]; console.log('  ' + w + ': ' + s.e + '  中译: ' + s.z); });
