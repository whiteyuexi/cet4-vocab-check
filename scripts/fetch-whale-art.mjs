// scripts/fetch-whale-art.mjs — 拉取 Sutera-Diffusus 的 MIT 立绘（92 张）
//
// 两条通道，按顺序试：
//   1. raw.githubusercontent.com（不经 API，不占限流）
//   2. api.github.com（未认证 60 次/小时，容易 403）
//
// 注意：清单文件 _index.json 只在"真的拿到清单"时才重写。
// 之前这里有过一个坑——API 被限流拿回空列表，脚本照样把 _index.json 覆盖成 []，
// 于是本地已有的 40 多个素材全部"失去索引"。现在失败就保留原位。
import fs from 'node:fs';
import path from 'node:path';

const H = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/vnd.github+json' };
const REPO = '1TRYOUT/dsh-whale-pixel-pet';
const DIR = 'assets/art/musume/';
const OUT = 'assets/whale-art';
const INDEX = path.join(OUT, '_index.json');

fs.mkdirSync(OUT, { recursive: true });

/* ---------- 1. 拿清单 ---------- */
function readLocalIndex() {
  try {
    const j = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
    return Array.isArray(j) ? j.filter(x => typeof x === 'string' && x.endsWith('.webp')) : [];
  } catch { return []; }
}

async function listFromApi() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, { headers: H });
  if (!r.ok) throw new Error('API HTTP ' + r.status);
  const tree = await r.json();
  const files = (tree.tree || []).filter(x => new RegExp('^' + DIR + '.*\\.webp$', 'i').test(x.path));
  return files.map(f => path.basename(f.path));
}

let remote = [];
try {
  remote = await listFromApi();
  console.log(`远端清单 ${remote.length} 张`);
} catch (e) {
  console.log('远端清单拿不到（' + e.message + '），改用本地 _index.json');
}
const local = readLocalIndex();
const names = remote.length ? remote : local;
if (!names.length) {
  console.error('没有任何可用清单，中止——不会覆盖 _index.json');
  process.exit(1);
}

/* ---------- 2. 授权文件 ---------- */
const META = ['assets/art/LICENSE-dsh-whale-musume.txt', 'assets/art/ATTRIBUTION.md'];
for (const f of META) {
  const dest = path.join(OUT, path.basename(f));
  if (fs.existsSync(dest)) continue;
  for (const u of [
    `https://raw.githubusercontent.com/${REPO}/main/${f}`,
    `https://api.github.com/repos/${REPO}/contents/${f}`
  ]) {
    try {
      const r = await fetch(u, { headers: u.includes('api.github.com') ? H : {} });
      if (!r.ok) continue;
      const buf = u.includes('api.github.com')
        ? Buffer.from((await r.json()).content, 'base64')
        : Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(dest, buf);
      console.log('  已存 ' + path.basename(f));
      break;
    } catch { /* 换下一条通道 */ }
  }
}

/* ---------- 3. 逐张下载 ---------- */
const toGet = names.filter(n => !fs.existsSync(path.join(OUT, n)));
console.log(`本地已有 ${names.length - toGet.length} 张，待拉 ${toGet.length} 张`);

let ok = 0, fail = 0;
for (const name of toGet) {
  const dest = path.join(OUT, name);
  let done = false;
  for (const u of [
    `https://raw.githubusercontent.com/${REPO}/main/${DIR}${name}`,
    `https://api.github.com/repos/${REPO}/contents/${DIR}${name}`
  ]) {
    try {
      const r = await fetch(u, { headers: u.includes('api.github.com') ? H : {} });
      if (!r.ok) continue;
      const buf = u.includes('api.github.com')
        ? Buffer.from((await r.json()).content, 'base64')
        : Buffer.from(await r.arrayBuffer());
      if (buf.length < 200) continue;              // 明显不是图片
      fs.writeFileSync(dest, buf);
      ok++; done = true;
      break;
    } catch { /* 换下一条通道 */ }
  }
  if (!done) { fail++; console.log('  失败 ' + name); }
}

const have = fs.readdirSync(OUT).filter(f => f.endsWith('.webp')).length;
console.log(`本次新增 ${ok} 张，失败 ${fail} 张，本地合计 ${have} / ${names.length}`);

/* ---------- 4. 清单只在远端成功时更新 ---------- */
if (remote.length) {
  fs.writeFileSync(INDEX, JSON.stringify(names, null, 1));
  console.log('已更新 _index.json');
} else {
  console.log('保留原有 _index.json（未拿到远端清单）');
}

const states = names.filter(n => /state-/.test(n))
  .map(n => n.replace('dsh-whale-state-', '').replace('.webp', ''));
console.log('可用状态 (' + states.length + '): ' + states.join(', '));
