// scripts/shot-revisit.mjs —— 回访卡的视觉验证：桌面 + 手机两档，各一张
//
// 为什么单独一个脚本：回访卡依赖"距上次检测 ≥3 天"，正常截图流程（刚造完数据）
// 是看不到它的。这里造一份 5 天前的抽样 + 一条上一轮归档（用来看"变化"那行），
// 把卡片按文档坐标裁切出来，桌面与 390px 手机各拍一张。
//
// 用法: node scripts/shot-revisit.mjs [输出目录]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'index.html');
const OUT = process.argv[2] || path.join(ROOT, 'shots');
const PORT = 9800 + Math.floor(Math.random() * 120);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'revisit-'));
const chrome = spawn(CH, ['--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
function send(m, p = {}) { const id = ++seq; ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise((res, rej) => pending.set(id, { res, rej })); }
const evalJs = async e => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.result?.value ?? r.result?.value;
};

const SEED = `(function(){
  var A = window.__APP__, pool = A.activePool();
  for (var i = 0; i < 620; i++) {
    var v = (i % 7 === 0) ? 0 : (i % 5 === 0 ? 1 : 2);
    A.setSt(pool[i], v);
  }
  var old = Date.now() - 5 * 86400000;
  A.S.samples = [];
  A.addSample({ n: 96, k: 61, f: 12, pre: 0, bank: 'c4', mode: 'self', ts: old,
    bands: { 1: { N: 738, n: 22, k: 12, f: 3 }, 2: { N: 610, n: 18, k: 11, f: 2 },
             3: { N: 478, n: 14, k: 8, f: 2 }, 4: { N: 874, n: 16, k: 9, f: 2 },
             5: { N: 1556, n: 14, k: 8, f: 1 }, 6: { N: 1598, n: 8, k: 4, f: 1 },
             0: { N: 1321, n: 4, k: 2, f: 1 } } });
  // 一条上一轮归档：用来验证"与上一轮相比"那一行
  A.S.rounds = [{ n: 1, bank: 'c4', bankName: '四级大纲', startedAt: old - 86400000,
    finishedAt: Date.now() - 12 * 86400000, bankSize: 4540, tested: 4540, coverage: 1,
    k: 3900, f: 780, u: 0, loose: 4290, strict: 3900, ratio: 0.86, rank: 'A', rankName: '优秀',
    capped: false, bands: [], fp: '', snap: '' }];
  A._revisitForce = false; A._revisitHidden = false;
  A.S.settings.revisitOff = false;
  A.save(); A.go('home'); A.render();
  return A.revisitShow();
})()`;

async function clipOfCard() {
  return await evalJs(`(function(){
    var el = document.getElementById('revisitCard');
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height });
  })()`);
}

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + SRC.replace(/\\/g, '/') + '?intro=0&pet=none' });
  await sleep(1800);
  const shown = await evalJs(SEED);
  console.log('回访卡显示：' + shown);
  await sleep(700);

  const shots = [
    { name: 'revisit-desktop.png', w: 1440, h: 900 },
    { name: 'revisit-mobile.png', w: 390, h: 844 }
  ];
  for (const s of shots) {
    await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: 2, mobile: s.w < 500 });
    await evalJs('(function(){ window.__APP__.render(); return 1; })()');
    await sleep(400);
    /* 把卡片滚到视口正中再截：底部导航是 fixed 定位，会在"视口坐标"上作画，
       如果裁切区域越过视口底部，导航条就会盖在卡片上（假图，不是布局问题）。 */
    await evalJs('(function(){ var el=document.getElementById("revisitCard"); if(el) el.scrollIntoView({block:"center"}); return 1; })()');
    await sleep(500);
    const clip = JSON.parse(await clipOfCard() || 'null');
    if (!clip) { console.log('  ' + s.name + '：卡片没有出现'); continue; }
    const pad = 14;
    const r = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: Math.max(0, clip.x - pad), y: Math.max(0, clip.y - pad), width: clip.w + pad * 2, height: clip.h + pad * 2, scale: 2 }
    });
    const f = path.join(OUT, s.name);
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    console.log('  已存 ' + s.name + '  ' + Math.round(clip.w) + '×' + Math.round(clip.h) + ' CSS px @2x');

    /* 再来一张「整个视口」：固定定位的顶栏/底部导航只有在这种截法里才会出现在真实位置，
       裁切越界时它们会被画到裁切原点（Chrome 的已知行为），容易误判成布局错。
       这里重新把卡片对到视口顶部（避开 sticky 顶栏），保证整屏图里能看全这张卡。 */
    await evalJs(`(function(){
      var el = document.getElementById('revisitCard'), tb = document.querySelector('.topbar');
      if (!el) return 0;
      var top = el.getBoundingClientRect().top + window.scrollY - (tb ? tb.offsetHeight + 10 : 10);
      window.scrollTo(0, Math.max(0, top));
      return 1;
    })()`);
    await sleep(350);
    const full = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const ff = path.join(OUT, s.name.replace('.png', '-full.png'));
    fs.writeFileSync(ff, Buffer.from(full.data, 'base64'));
    console.log('  已存 ' + path.basename(ff) + '  ' + s.w + '×' + s.h + ' CSS px @2x（整屏）');
  }
  ws.close(); chrome.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
} catch (e) {
  console.error('ERR ' + e.message);
  try { ws && ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  process.exit(1);
}
