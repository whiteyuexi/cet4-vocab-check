/* RAG 评估：把"我们实现了 RAG"变成可验证的数字。
   评分表里 RAG 占 6%，评委看的是"检索策略是否合理、生成质量是否因检索而提升"。
   这里量三件事：
     1. 语料覆盖率  —— 词库里有百分之多少的词能检索到例句
     2. 命中正确率  —— 检索回来的例句里，确实包含目标词的比例
     3. 检索延迟    —— p50 / p95，证明它是内存查表而不是每次现扫

   用法：node scripts/eval-rag.mjs [--json]
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { examplesFor, loadCorpus, corpusStats } from '../server/corpus.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.indexOf('--json') >= 0;

loadCorpus();
const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'words.json'), 'utf8'));
const vocab = words.filter(w => !w.x);              // 只统计核心词条，和产品口径一致

// 1) 覆盖率
let covered = 0;
for (const w of vocab) if (examplesFor(w.w, 1).length) covered++;
const coverage = covered / vocab.length;

// 2) 命中正确率：抽样检查返回的例句里是否真的含这个词
function containsWord(sentence, word) {
  const w = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\b' + w + '(s|es|ed|ing|d)?\\b', 'i').test(sentence);
}
const step = Math.max(1, Math.floor(vocab.length / 300));
let checked = 0, hit = 0;
for (let i = 0; i < vocab.length && checked < 300; i += step) {
  const ex = examplesFor(vocab[i].w, 2);
  if (!ex.length) continue;
  checked++;
  if (ex.some(e => containsWord(e.en, vocab[i].w))) hit++;
}
const precision = checked ? hit / checked : 0;

// 3) 延迟
const sample = vocab.filter(w => examplesFor(w.w, 1).length).slice(0, 500);
const times = [];
for (let round = 0; round < 4; round++) {
  for (const w of sample) {
    const t0 = process.hrtime.bigint();
    examplesFor(w.w, 2);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);   // ms
  }
}
times.sort((a, b) => a - b);
const p = q => times[Math.min(times.length - 1, Math.floor(times.length * q))];

// 分频段覆盖率：语料在哪一段变稀，评委一眼能看出边界
const byBand = {};
for (const w of vocab) {
  const b = w.b;
  if (!byBand[b]) byBand[b] = { total: 0, covered: 0 };
  byBand[b].total++;
  if (examplesFor(w.w, 1).length) byBand[b].covered++;
}
const bandRows = Object.keys(byBand).sort().map(b => ({
  band: b, total: byBand[b].total, covered: byBand[b].covered,
  pct: +(byBand[b].covered / byBand[b].total * 100).toFixed(1)
}));

const stats = corpusStats();
const report = {
  vocabWords: vocab.length,
  corpusWords: stats.words,
  corpusSentences: stats.sentences,
  coveredWords: covered,
  coverage: +(coverage * 100).toFixed(1),
  sampleChecked: checked,
  sampleHit: hit,
  precision: +(precision * 100).toFixed(1),
  latencyP50ms: +p(0.5).toFixed(4),
  latencyP95ms: +p(0.95).toFixed(4),
  calls: times.length,
  byBand: bandRows
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('RAG 评估 · 例句检索层');
  console.log('  词库核心词条      ' + report.vocabWords);
  console.log('  语料覆盖          ' + report.corpusWords + ' 词 / ' + report.corpusSentences + ' 句');
  console.log('  覆盖率            ' + report.coverage + '%  （' + report.coveredWords + ' / ' + report.vocabWords + ' 词可检索到例句）');
  console.log('  命中正确率        ' + report.precision + '%  （抽样 ' + report.sampleChecked + ' 词，' + report.sampleHit + ' 个例句确实含目标词）');
  console.log('  检索延迟          p50 ' + report.latencyP50ms + ' ms · p95 ' + report.latencyP95ms + ' ms（' + report.calls + ' 次调用）');
  console.log('');
  console.log('');
  for (const r of bandRows) {
    console.log('    频段 ' + r.band + '  覆盖 ' + r.pct + '%  (' + r.covered + '/' + r.total + ')');
  }
  console.log('');
  console.log('  用途：AI 诊断时把「这个词的例句」作为证据注入上下文，模型据此解释用法，不自造例句。');
}
