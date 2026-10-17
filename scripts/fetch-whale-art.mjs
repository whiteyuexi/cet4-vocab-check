import fs from 'node:fs';
import path from 'node:path';
const H = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/vnd.github+json' };
const REPO = '1TRYOUT/dsh-whale-pixel-pet';
const OUT = 'assets/whale-art';

const tree = await (await fetch('https://api.github.com/repos/' + REPO + '/git/trees/main?recursive=1', { headers: H })).json();
const files = (tree.tree || []).filter(x => /^assets\/art\/musume\/.*\.webp$/i.test(x.path));
console.log('立绘 ' + files.length + ' 张');

// 授权与出处文件
fs.mkdirSync(OUT, { recursive: true });
for (const f of ['assets/art/LICENSE-dsh-whale-musume.txt', 'assets/art/ATTRIBUTION.md']) {
  const r = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + f, { headers: H });
  if (r.ok) {
    const j = await r.json();
    fs.writeFileSync(path.join(OUT, path.basename(f)), Buffer.from(j.content, 'base64'));
    console.log('  已存 ' + path.basename(f));
  }
}

// 逐张下载（走 GitHub contents API，raw 被墙）
let ok = 0, bytes = 0;
const names = [];
for (const f of files) {
  const name = path.basename(f.path);
  names.push(name);
  const dest = path.join(OUT, name);
  if (fs.existsSync(dest)) { ok++; bytes += fs.statSync(dest).size; continue; }
  try {
    const r = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + f.path, { headers: H });
    if (!r.ok) { console.log('  失败 ' + name + ' HTTP ' + r.status); continue; }
    const j = await r.json();
    const buf = Buffer.from(j.content, 'base64');
    fs.writeFileSync(dest, buf);
    ok++; bytes += buf.length;
  } catch (e) { console.log('  失败 ' + name + ' ' + e.message); }
}
console.log('成功 ' + ok + ' / ' + files.length + '，合计 ' + (bytes / 1048576).toFixed(2) + ' MB');
const states = names.filter(n => /state-/.test(n)).map(n => n.replace('dsh-whale-state-', '').replace('.webp', ''));
console.log('可用状态 (' + states.length + '): ' + states.join(', '));
fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify(names, null, 1));
