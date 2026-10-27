// scripts/process-ai-logo.mjs — 把作者提供的 AI 原图处理成可用素材
//
// 做的事：抠掉奶油底 → 按非透明区域自动裁边 → 导出 64/128/256/512/1024 六档透明 PNG
// 为什么在 Chrome 里做：项目不引图形库；用 canvas 的 getImageData 做色键 + drawImage 做缩放，
// 一次跑完，还能直接拿到 base64 供单文件内联。
//
// 用法：node scripts/process-ai-logo.mjs "C:\path\to\原图.png"
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'assets', 'logo', 'ai');
const SRC = process.argv[2] || 'C:\\Users\\27295\\Desktop\\屏幕截图 2026-10-27 180645.png';
const SIZES = [64, 128, 256, 512, 1024];

if (!fs.existsSync(SRC)) { console.error('找不到原图:', SRC); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const PORT = 9700 + Math.floor(Math.random() * 120);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ailogo-'));
const chrome = spawn(CH, ['--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, '--window-size=900,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
function send(m, p = {}) { const id = ++seq; ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise((res, rej) => pending.set(id, { res, rej })); }
const evalJs = async e => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.result?.value ?? r.result?.value;
};

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Page.enable');
  await send('Page.navigate', { url: 'file:///' + SRC.replace(/\\/g, '/') });
  await sleep(600);

  const result = await evalJs(`(function(){
    var img = document.querySelector('img');
    if (!img) return { err: '页面上没有 img（不是图片文件？）' };
    var w = img.naturalWidth, h = img.naturalHeight;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); g.drawImage(img, 0, 0);
    var d = g.getImageData(0, 0, w, h), p = d.data;

    // 1) 用左上角像素作为底色参考
    var bg = [p[0], p[1], p[2]];

    // 2) 色键：到底色距离越近 → 越透明（带羽化，避免边缘出现灰边）
    var THRESH = 34;
    for (var i = 0; i < p.length; i += 4) {
      var dr = p[i] - bg[0], dg = p[i+1] - bg[1], db = p[i+2] - bg[2];
      var dist = Math.sqrt(dr*dr + dg*dg + db*db);
      // 底纸有细微纹理，硬切到 20 才开始给不透明度，避免整张画布留一层半透明噪点
      var a = dist <= 30 ? 0 : (dist >= THRESH ? 255 : Math.round((dist - 30) / (THRESH - 30) * 255));
      p[i+3] = Math.min(p[i+3], a);
    }
    g.putImageData(d, 0, 0);

    // 3) 按非透明区域自动裁边
    var minX = w, minY = h, maxX = 0, maxY = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (p[(y*w + x)*4 + 3] > 90) { if (x<minX) minX=x; if (x>maxX) maxX=x; if (y<minY) minY=y; if (y>maxY) maxY=y; }
    }
    var pad = 2;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    var cw = maxX - minX + 1, chh = maxY - minY + 1;

    // 4) 导出多档尺寸
    var out = { bg: bg, src: [w, h], crop: [minX, minY, cw, chh], sizes: {} };
    ${''}
    return (function(){
      var res = out;
      var list = ${JSON.stringify(SIZES)};
      for (var k = 0; k < list.length; k++) {
        var s = list[k];
        var ratio = Math.min(s / cw, s / chh);
        var tw = Math.round(cw * ratio), th = Math.round(chh * ratio);
        var c2 = document.createElement('canvas'); c2.width = tw; c2.height = th;
        var g2 = c2.getContext('2d');
        g2.imageSmoothingQuality = 'high';
        g2.drawImage(c, minX, minY, cw, chh, 0, 0, tw, th);
        res.sizes[s] = { w: tw, h: th, url: c2.toDataURL('image/png') };
      }
      return res;
    })();
  })()`);

  if (result.err) throw new Error(result.err);
  console.log('原图:', result.src.join('×'), ' 底色 rgb(' + result.bg.join(',') + ')');
  console.log('裁边后:', result.crop[2] + '×' + result.crop[3]);
  for (const s of SIZES) {
    const item = result.sizes[s];
    const buf = Buffer.from(item.url.split(',')[1], 'base64');
    const f = path.join(OUT, 'ai-mark-' + s + '.png');
    fs.writeFileSync(f, buf);
    console.log('  ai-mark-' + String(s).padEnd(5) + item.w + '×' + item.h + '  ' + (buf.length / 1024).toFixed(1) + ' KB');
  }
  // 顺手把 64 / 256 两档的 base64 存成文本，方便内联进单文件
  fs.writeFileSync(path.join(OUT, 'inline-64.txt'), result.sizes[64].url, 'utf8');
  fs.writeFileSync(path.join(OUT, 'inline-256.txt'), result.sizes[256].url, 'utf8');
  fs.writeFileSync(path.join(OUT, 'inline-512.txt'), result.sizes[512].url, 'utf8');
  console.log('完成 →', OUT);
  chrome.kill();
  process.exit(0);
} catch (e) { console.error('失败:', e.message); try { chrome.kill(); } catch {} process.exit(1); }
