// scripts/make-ppt-shots.mjs — 为 PPT 截"局部特写"（2 倍分辨率，比整屏截图清晰得多）
// 产出：docs/screenshots/ppt-map.png / ppt-ai.png / ppt-test.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const PORT = 9700 + Math.floor(Math.random() * 120);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pptshot-'));
const W = 1440, H = 900;
const chrome = spawn(CH, ['--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, '--window-size=' + W + ',' + H, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
function send(m, p = {}) { const id = ++seq; ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise((res, rej) => pending.set(id, { res, rej })); }
const evalJs = async e => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.result?.value ?? r.result?.value;
};
/* 裁剪截图有两个坐标系，混用就会截到空白：
     · 固定定位的元素（模态）→ 用**视口坐标**，且 captureBeyondViewport:false
     · 页面流里的元素（深在文档下方）→ 用**文档坐标**（rect + scrollY），且 captureBeyondViewport:true
   之前就是拿视口坐标配 beyond-viewport，结果地图卡片（y≈1090，视口只有 802 高）截图全白。 */
async function clipShot(file, sel, pad = 10, mode = 'viewport', scale = 2) {
  const box = JSON.parse(await evalJs(`JSON.stringify((function(){
    var e = document.querySelector(${JSON.stringify(sel)});
    if (!e) return null;
    var r = e.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height,
             sx: window.scrollX || 0, sy: window.scrollY || 0 };
  })())`));
  if (!box) { console.log('  跳过（没找到 ' + sel + '）'); return; }
  await sleep(350);
  const doc = mode === 'document';
  const x = (doc ? box.x + box.sx : box.x) - pad;
  const y = (doc ? box.y + box.sy : box.y) - pad;
  const r = await send('Page.captureScreenshot', {
    format: 'jpeg', quality: 90,
    clip: { x: Math.max(0, x), y: Math.max(0, y), width: box.w + pad * 2, height: box.h + pad * 2, scale: scale },
    captureBeyondViewport: doc,
  });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('  已存', path.basename(file), (fs.statSync(file).size / 1024).toFixed(0) + ' KB',
    '（裁剪 ' + Math.round(box.w) + '×' + Math.round(box.h) + ' @2x / ' + mode + '）');
}

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['http://127.0.0.1:8787/*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: 'file:///' + SRC.replace(/\\/g, '/') + '?intro=0&pet=none' });
  await sleep(1800);

  // 造演示数据
  await evalJs(`(function(){
    var A = window.__APP__, pool = A.activePool();
    for (var i = 0; i < 620; i++) A.setSt(pool[i], (i % 7 === 0) ? 0 : (i % 5 === 0 ? 1 : 2));
    A.addSample({ n: 96, k: 61, f: 12, pre: 0, bank: 'c4', mode: 'self',
      bands: { 1: { N: 738, n: 22, k: 14, f: 3 }, 2: { N: 610, n: 18, k: 11, f: 2 },
               3: { N: 478, n: 14, k: 8, f: 2 }, 4: { N: 874, n: 16, k: 9, f: 2 },
               5: { N: 1556, n: 14, k: 8, f: 1 }, 6: { N: 1598, n: 8, k: 4, f: 1 },
               0: { N: 1321, n: 4, k: 2, f: 1 } } });
    A.save(); A.go('stats'); A.render();
    return 1;
  })()`);
  await sleep(900);

  console.log('① 词汇地图卡片');
  await clipShot(path.join(OUT, 'ppt-map.jpg'), '.vmap-card', 14, 'document', 2);

  console.log('② AI 诊断面板');
  await evalJs(`window.__APP__.openAIDialog('我最该补哪一段？给个具体方案')`);
  await sleep(2200);
  await evalJs(`(function(){ var l = document.getElementById('aiLog'); if (l) l.scrollTop = 0; return 1; })()`);
  await clipShot(path.join(OUT, 'ppt-ai.jpg'), '#modal .box', 8, 'viewport', 2);

  console.log('③ 答题卡（四选一揭示态）');
  await evalJs(`(function(){var b=document.querySelector('[data-act=modal-close]'); if(b)b.click(); return 1;})()`);
  await sleep(400);
  await evalJs(`(function(){
    var A = window.__APP__;
    A.S.settings.mode = 'choice'; A.save();
    A.startSession('probe', { target: 250 });
    return 1;
  })()`);
  await sleep(800);
  await evalJs(`(function(){ var o = document.querySelector('.opt'); if (o) o.click(); return 1; })()`);
  await sleep(700);
  await clipShot(path.join(OUT, 'ppt-test.jpg'), '#view', 6, 'viewport', 1);

  chrome.kill();
  process.exit(0);
} catch (e) { console.error('失败:', e.message); try { chrome.kill() } catch {} process.exit(1); }