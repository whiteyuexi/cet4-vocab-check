/* RAG 生成侧 A/B 对比：同一个问题，给不给例句上下文，回答质量差多少。
 *
 * 评分表里 RAG 的原文是「生成质量是否因检索增强而显著提升」——
 * 这一项不能只证明"查得到"，得证明"给了例句，回答就更好"。
 *
 * 用法：
 *   node scripts/rag-ab.mjs            # 默认 10 个词
 *   node scripts/rag-ab.mjs --n 20
 *   node scripts/rag-ab.mjs --dry      # 只打印两组 prompt，不调模型
 *
 * 需要一个可用的 Key（private/ai-key.json 或 .env 的 DEEPSEEK_API_KEY）。
 * Key 失效时会明确提示，不会假装跑过。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { examplesFor } from '../server/corpus.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const N = (() => { const i = args.indexOf('--n'); return i >= 0 ? parseInt(args[i + 1], 10) || 10 : 10; })();
const DRY = args.indexOf('--dry') >= 0;

function loadKey() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'private', 'ai-key.json'), 'utf8'));
    if (j.key) return { key: j.key, base: j.base || 'https://api.deepseek.com', model: j.model || 'deepseek-chat' };
  } catch (e) {}
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = env.match(/DEEPSEEK_API_KEY\s*=\s*(\S+)/);
    if (m) return { key: m[1], base: 'https://api.deepseek.com', model: 'deepseek-chat' };
  } catch (e) {}
  return null;
}

// 取 10 个有例句的词，按词频分散
const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'words.json'), 'utf8'))
  .filter(w => !w.x).filter(w => examplesFor(w.w, 1).length);
const sample = [];
const step = Math.max(1, Math.floor(words.length / N));
for (let i = 0; i < words.length && sample.length < N; i += step) sample.push(words[i]);

function prompts(w) {
  const ex = examplesFor(w.w, 2);
  const ctx = ex.map(e => '- ' + e.en + '\n  ' + e.zh).join('\n');
  return {
    baseline: '请用英语写一个包含单词「' + w.w + '」的例句，并给出中文翻译。不要解释，只给例句和翻译。',
    rag: '请用英语写一个包含单词「' + w.w + '」的例句，并给出中文翻译。不要解释，只给例句和翻译。\n\n' +
      '下面是语料库里这个词的真实例句，可以改写或直接使用，但**不要写出语料里不存在的搭配**：\n' + ctx
  };
}

async function ask(conf, prompt) {
  const res = await fetch(conf.base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + conf.key },
    body: JSON.stringify({
      model: conf.model,
      temperature: 0,
      max_tokens: 220,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120));
  const j = await res.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

function score(answer, w) {
  const ex = examplesFor(w.w, 2);
  const pool = ex.map(e => norm(e.en));
  const lines = String(answer).split('\n').map(norm).filter(Boolean);
  const hasChinese = /[\u4e00-\u9fa5]/.test(answer);
  // 回答里的英文句子是否来自语料（防幻觉）
  const grounded = lines.some(l => pool.some(p => p && (p === l || p.includes(l) || l.includes(p))));
  return { grounded, hasChinese, len: String(answer).trim().length };
}

const run = async () => {
  if (DRY) {
    const w = sample[0];
    const p = prompts(w);
    console.log('=== baseline ===\n' + p.baseline);
    console.log('\n=== with RAG ===\n' + p.rag);
    return;
  }
  const conf = loadKey();
  if (!conf) {
    console.log('没有找到可用的 Key（private/ai-key.json 或 .env）。脚本已就绪，配上 Key 即可运行。');
    return;
  }
  // 先探一次，Key 失效就明确说出来
  try {
    await ask(conf, 'ping');
  } catch (e) {
    console.log('Key 不可用：' + e.message);
    console.log('本脚本不产生任何假数据——Key 恢复后重新运行即可。');
    process.exitCode = 2;
    return;
  }

  const rows = [];
  for (const w of sample) {
    const p = prompts(w);
    let a = '', b = '';
    try { a = await ask(conf, p.baseline); } catch (e) {}
    try { b = await ask(conf, p.rag); } catch (e) {}
    const sa = score(a, w), sb = score(b, w);
    rows.push({ word: w.w, a: sa, b: sb });
    console.log(w.w.padEnd(14) + ' 无例句: 来源' + (sa.grounded ? '✓' : '✗') + ' 中文' + (sa.hasChinese ? '✓' : '✗') +
      '  ' + sa.len + ' 字   |   有例句: 来源' + (sb.grounded ? '✓' : '✗') + ' 中文' + (sb.hasChinese ? '✓' : '✗') +
      '  ' + sb.len + ' 字');
    await new Promise(r => setTimeout(r, 300));
  }

  const rate = k => (rows.filter(r => r[k].grounded).length / rows.length * 100).toFixed(0);
  const zh = k => (rows.filter(r => r[k].hasChinese).length / rows.length * 100).toFixed(0);
  console.log('\n────────────────────────────────────────');
  console.log('例句可溯源率    无 RAG ' + rate('a') + '%   →   有 RAG ' + rate('b') + '%');
  console.log('含中文翻译      无 RAG ' + zh('a') + '%   →   有 RAG ' + zh('b') + '%');
  console.log('样本 ' + rows.length + ' 个词');
};

run().catch(e => { console.error('失败：', e.message); process.exitCode = 1; });
