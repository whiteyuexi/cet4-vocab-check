// scripts/check-no-key.mjs — 提交前把关：仓库里的产物绝不能含任何 API Key
//
// 为什么必须有它：仓库是公开的。一旦把带 Key 的 index.html 提交上去，
// 等于把 Key 公开发布——网上有大量机器人专门扫这类东西，通常几小时内就会被抓去滥用。
// 这个脚本把"别手滑"变成一个会失败的检查：
//   1) 扫 index.html 里有没有 sk- 形态的明文
//   2) 拿 private/ai-key.json 与 .env 里的真实 Key 逐字比对
//   3) 断言 window.AI_AUTHOR_KEY 是 null（演示版才允许内联）
//
// 用法：node scripts/check-no-key.mjs [额外要扫的文件...]
//      发现泄漏时退出码 1，可直接接进提交前流程或 CI。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const targets = process.argv.slice(2);
const files = targets.length ? targets : [
  path.join(ROOT, 'index.html'),
  path.join(ROOT, 'README.md'),
  path.join(ROOT, 'NEXT.md'),
  path.join(ROOT, 'LICENSING.md'),
];

let fails = 0;
function ok(name, cond, detail) {
  if (!cond) fails++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
}

// 收集"绝对不能出现在产物里"的真实 Key（来自本地、永不入库的配置文件）
const secrets = [];
function collect(file, extract) {
  try {
    const txt = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const v = extract(txt);
    if (v) secrets.push({ file, value: v });
  } catch (e) { /* 没有这个文件是正常的 */ }
}
collect('private/ai-key.json', t => {
  try { return JSON.parse(t).key || ''; } catch (e) { return (/"key"\s*:\s*"([^"]+)"/.exec(t) || [])[1] || ''; }
});
collect('.env', t => (/DEEPSEEK_API_KEY\s*=\s*(\S+)/.exec(t) || [])[1] || '');

console.log('待扫描文件:', files.map(f => path.relative(ROOT, f)).join(', '));
console.log('已知密钥来源:', secrets.length ? secrets.map(s => s.file + '（' + s.value.length + ' 位）').join(', ') : '无（本地没有 Key 配置文件）');

for (const f of files) {
  const rel = path.relative(ROOT, f) || f;
  let txt = '';
  try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { console.log('跳过（不存在）', rel); continue; }

  // 1) 明文 sk- 形态
  const leak = txt.match(/\bsk-[A-Za-z0-9_-]{16,}/);
  ok(rel + ' 不含明文 sk- Key', !leak, leak ? leak[0].slice(0, 12) + '…' : '');

  // 2) 与真实 Key 逐字比对
  let hit = null;
  for (const s of secrets) if (s.value && txt.indexOf(s.value) >= 0) hit = s;
  ok(rel + ' 不含本机真实 Key', !hit, hit ? '命中了 ' + hit.file + ' 的内容' : '');

  // 3) 作者 Key 内联位必须是 null
  if (/window\.AI_AUTHOR_KEY/.test(txt)) {
    const m = /window\.AI_AUTHOR_KEY = ([^;]{0,20});/.exec(txt);
    ok(rel + ' 的作者 Key 内联位为 null（仓库版）', !!m && m[1] === 'null', m ? m[1].slice(0, 16) : '未匹配');
  }
}

// 4) 密文锁也不该出现在仓库版里（它虽然安全，但会让"无密码"的说法自相矛盾）
try {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('仓库版未启用授权锁（window.AI_LOCK = null）', /window\.AI_LOCK = null;/.test(html));
} catch (e) {}

console.log('');
if (fails) {
  console.error('发现 ' + fails + ' 处问题：请勿提交含 Key 的产物！演示版请用 node build.js --with-key 单独生成。');
  process.exit(1);
}
console.log('没有发现任何 Key 泄漏');
