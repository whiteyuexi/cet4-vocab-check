/* 把 Live2D 模型压成一份可内联的 JS：window.L2D_INLINE
   —— 目的：单文件双击也能跑，不依赖 http 服务。

   做的事：
   1. 读 model3.json，把里面所有 FileReferences 换成 data: URI
      （Cubism 的加载器按 URL 解析，data: 是绝对地址，能原样透传）
   2. 贴图超过 1024 的用 pngjs 做一次盒式降采样——桌宠显示只有 240px，
      2048 的贴图纯属浪费体积
   3. 输出 assets/whale-girl/_l2d-inline.js

   用法：node scripts/make-live2d-inline.mjs
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'assets', 'whale-girl');
const MAXTEX = 1024;

const modelRel = 'c_0120.model3.json';
const model = JSON.parse(fs.readFileSync(path.join(DIR, modelRel), 'utf8'));

function dataURI(buf, mime) {
  return 'data:' + mime + ';base64,' + buf.toString('base64');
}

function shrinkPNG(file, max) {
  const raw = fs.readFileSync(file);
  const src = PNG.sync.read(raw);
  if (src.width <= max) return raw;
  const w = max, h = Math.round(src.height * max / src.width);
  const dst = new PNG({ width: w, height: h });
  const sx = src.width / w, sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(src.height, Math.ceil((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(src.width, Math.ceil((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          const al = src.data[i + 3];
          r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al;
          a += al; n++;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        dst.data[o] = Math.round(r / a);
        dst.data[o + 1] = Math.round(g / a);
        dst.data[o + 2] = Math.round(b / a);
        dst.data[o + 3] = Math.round(a / n);
      }
    }
  }
  return PNG.sync.write(dst);
}

const F = model.FileReferences;
let before = 0, after = 0;

// 贴图
F.Textures = F.Textures.map(function (rel) {
  const p = path.join(DIR, rel);
  const raw = fs.readFileSync(p);
  before += raw.length;
  const out = shrinkPNG(p, MAXTEX);
  after += out.length;
  return dataURI(out, 'image/png');
});

// moc3
const moc = fs.readFileSync(path.join(DIR, F.Moc));
before += moc.length; after += moc.length;
F.Moc = dataURI(moc, 'application/octet-stream');

// 物理
if (F.Physics) {
  const b = fs.readFileSync(path.join(DIR, F.Physics));
  before += b.length; after += b.length;
  F.Physics = dataURI(b, 'application/json');
}

// 动作：只保留 Idle（其余动作每个几十 KB，桌宠用不上）
const keep = ['Idle'];
const motions = F.Motions || {};
const kept = {};
keep.forEach(function (k) { if (motions[k]) kept[k] = motions[k]; });
Object.keys(kept).forEach(function (k) {
  kept[k] = kept[k].map(function (m) {
    const b = fs.readFileSync(path.join(DIR, m.File));
    before += b.length; after += b.length;
    return Object.assign({}, m, { File: dataURI(b, 'application/json') });
  });
});
F.Motions = kept;
delete F.DisplayInfo;
delete F.Expressions;
delete F.Pose;
delete F.UserData;

const json = JSON.stringify(model);
const out =
  '/* 自动生成，勿手改：node scripts/make-live2d-inline.mjs */\n' +
  'window.L2D_INLINE = ' + JSON.stringify({ model3: dataURI(Buffer.from(json, 'utf8'), 'application/json') }) + ';\n';

const dest = path.join(DIR, '_l2d-inline.js');
fs.writeFileSync(dest, out);

console.log('模型 JSON: ' + (json.length / 1024).toFixed(0) + ' KB');
console.log('原始资源: ' + (before / 1024 / 1024).toFixed(2) + ' MB → 内联后 ' + (after / 1024 / 1024).toFixed(2) + ' MB');
console.log('产物: ' + dest + '（' + (out.length / 1024 / 1024).toFixed(2) + ' MB）');
