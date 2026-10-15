// scripts/fetch-data.mjs — 拉取构建词库所需的第三方原始数据
// 为什么不在仓库里直接放 data/：① 共 13MB，② 各来源授权不同（详见 data/README.md），
// ③ 用固定 commit SHA 拉取，任何人任何时候都能复现出同一个词库。
//
// 用法：node scripts/fetch-data.mjs   （或 npm run data）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

// 固定到具体 commit，保证可复现
const SOURCES = [
  { file: 'mahavivo_cet4.txt',  repo: 'mahavivo/english-wordlists',       sha: 'f2f9fd51d613cd90ebd925e9d666844e6d109252', desc: '四级大纲单词表（含音标）' },
  { file: 'mahavivo_cet6.txt',  repo: 'mahavivo/english-wordlists',       sha: 'b2031911c6edefbf2ce901cab287c9ea3ef63135', desc: '六级大纲单词表（含音标）' },
  { file: 'kylebing_cet4.json', repo: 'KyleBing/english-vocabulary',      sha: '81f04585de32e3269275e8323bfe3489bbadd984', desc: '四级词书（补充派生词与短语）' },
  { file: 'kylebing_cet6.json', repo: 'KyleBing/english-vocabulary',      sha: 'b8d6fd3ba826b2f69757c5da70adda717eb09542', desc: '六级词书（补充派生词与短语）' },
  { file: 'ipa_en_UK.txt',      repo: 'open-dict-data/ipa-dict',          sha: 'f33a9d08cba10e434e20b0a6d417857e11680030', desc: '英式音标库' },
  { file: 'ipa_en_US.txt',      repo: 'open-dict-data/ipa-dict',          sha: 'f7cdfe30714777ad3f928977586e7425881687b4', desc: '美式音标库' },
  { file: 'freq_20k.txt',       repo: 'first20hours/google-10000-english', sha: '11432858e83b52d62740ca173551904611bec5c6', desc: '2 万词频表（用于频段分层）' },
];

async function download(repo, sha) {
  // 优先走 GitHub API 的 raw 模式（国内网络比 raw.githubusercontent 稳定）
  const api = `https://api.github.com/repos/${repo}/git/blobs/${sha}`;
  const raw = `https://raw.githubusercontent.com/${repo}/${sha}/`;
  for (const [url, headers] of [
    [api, { Accept: 'application/vnd.github.raw', 'User-Agent': 'cet-vocab-checker' }],
    [raw, { 'User-Agent': 'cet-vocab-checker' }],
  ]) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow' });
      if (!res.ok) continue;
      return Buffer.from(await res.arrayBuffer());
    } catch (e) { /* 换下一个源 */ }
  }
  return null;
}

fs.mkdirSync(DATA, { recursive: true });
let ok = 0, skip = 0;
for (const s of SOURCES) {
  const target = path.join(DATA, s.file);
  if (fs.existsSync(target) && fs.statSync(target).size > 1000) {
    console.log('已存在，跳过  ' + s.file);
    skip++;
    continue;
  }
  process.stdout.write('拉取 ' + s.file + ' … ');
  const buf = await download(s.repo, s.sha);
  if (!buf) { console.log('失败（网络受限？可手动下载到 data/ 目录）'); continue; }
  fs.writeFileSync(target, buf);
  console.log((buf.length / 1048576).toFixed(2) + ' MB');
  ok++;
}
console.log(`\n完成：新拉取 ${ok} 个，已存在 ${skip} 个`);
if (ok + skip < SOURCES.length) {
  console.log('提示：缺文件时 build-data.js 会跳过对应来源，但词库会不完整。');
  process.exitCode = 1;
} else {
  console.log('下一步：node build-data.js  （或 npm run data 一条龙）');
}
