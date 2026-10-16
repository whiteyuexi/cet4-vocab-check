// scripts/fetch-live2d.mjs — 下载 DS鲸鱼娘 Live2D 模型与运行时
// 模型版权链见 assets/whale-girl/ATTRIBUTION.md，授权 CC BY-NC-SA 4.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = 'dsh-pet-live2d@3.1.3';
const BASE = 'https://cdn.jsdelivr.net/npm/' + PKG;
const DEST = path.join(ROOT, 'assets', 'whale-girl');

async function grab(url, out, label) {
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
      console.log('  OK   ' + (label || path.basename(out)) + '  ' + (buf.length / 1024).toFixed(0) + ' KB');
      return true;
    } catch (e) {
      if (i === 3) { console.log('  失败 ' + (label || out) + ' : ' + e.message); return false; }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

const flat = await (await fetch('https://data.jsdelivr.com/v1/package/npm/' + PKG + '/flat')).json();
const wanted = flat.files.filter(f => f.name.startsWith('/pets/ds-whale-girl/'));
console.log('模型文件 ' + wanted.length + ' 个：');
let n = 0;
for (const f of wanted) {
  const rel = f.name.replace('/pets/ds-whale-girl/', '');
  if (await grab(BASE + '/pets/ds-whale-girl/' + rel, path.join(DEST, rel), null)) n++;
}
console.log('模型完成 ' + n + '/' + wanted.length);

console.log('运行时：');
await grab(BASE + '/lib/live2d-vendor.js', path.join(ROOT, 'vendor', 'live2d-vendor.js'));
// Cubism Core 是 Live2D 公司的专有软件，不经 npm 分发，从官方 CDN 取
await grab('https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
  path.join(ROOT, 'vendor', 'live2dcubismcore.min.js'));
console.log('全部完成。');
