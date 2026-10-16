// 例句语料检索层（RAG 的 R）
// 语料来自 Tatoeba 英中对照数据，构建期由 build-corpus.js 索引成 sentences.json。
// 这里的职责：给定单词或句子片段，检索出最合适的例句作为"证据"喂给模型。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let corpus = null;
let stats = { words: 0, sentences: 0, loaded: false };

export function loadCorpus() {
  if (corpus) return stats;
  try {
    corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'sentences.json'), 'utf8'));
    let n = 0;
    for (const k in corpus) n += corpus[k].length;
    stats = { words: Object.keys(corpus).length, sentences: n, loaded: true };
  } catch (e) {
    corpus = {};
    stats = { words: 0, sentences: 0, loaded: false, error: '未找到 sentences.json（运行 node build-corpus.js 生成）' };
  }
  return stats;
}

export function corpusStats() { loadCorpus(); return stats; }

/** 单词 → 例句（精确匹配，词形还原为小写） */
export function examplesFor(word, limit = 2) {
  loadCorpus();
  const key = String(word || '').trim().toLowerCase();
  const hit = corpus[key];
  if (!hit) return [];
  return hit.slice(0, limit).map(s => ({ en: s.e, zh: s.z, source: 'Tatoeba #' + s.id }));
}

/** 批量取词：给 AI 诊断用，返回若干未掌握词的例句作为上下文 */
export function examplesForWords(words, perWord = 1) {
  const out = [];
  for (const w of (words || []).slice(0, 8)) {
    const ex = examplesFor(w, perWord);
    if (ex.length) out.push({ word: w, examples: ex });
  }
  return out;
}

/** 关键词检索：在语料里找包含该词的句子（用于"给我更多例句"这类需求） */
export function searchByText(query, limit = 5) {
  loadCorpus();
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const w in corpus) {
    if (w.indexOf(q) < 0) continue;
    for (const s of corpus[w]) {
      if (out.some(x => x.en === s.e)) continue;
      out.push({ en: s.e, zh: s.z, source: 'Tatoeba #' + s.id });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
