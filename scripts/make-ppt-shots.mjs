// scripts/make-ppt-shots.mjs — 为 PPT 批量截「网页实拍」（2 倍分辨率局部特写）
//
// 为什么不用整屏截图：投到 10 米外，整屏图里的字基本看不清；局部特写 + 2x 才可读。
// 两个坐标系的坑（都踩过）：
//   · 固定定位元素（模态）→ 视口坐标 + captureBeyondViewport:false
//   · 页面流里的元素（深处）→ 文档坐标（rect + scrollY）+ captureBeyondViewport:true
// 混用会截出纯白图。
//
// 产出（docs/screenshots/）：ppt-intro / ppt-home / ppt-groups / ppt-bands / ppt-map /
//   ppt-test / ppt-report / ppt-next / ppt-ladder / ppt-ai / ppt-settings / ppt-daily / ppt-dark
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
async function shot(file, sel, pad = 12, mode = 'viewport', scale = 2) {
  // sel 可以是 CSS 选择器，也可以用 "js:" 前缀写任意表达式（比如取最近的 .card 容器）
  const pick = sel.startsWith('js:')
    ? `(${sel.slice(3)})`
    : `document.querySelector(${JSON.stringify(sel)})`;
  const box = JSON.parse(await evalJs(`JSON.stringify((function(){
    var e = ${pick};
    if (!e) return null;
    var r = e.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height,
             sx: window.scrollX || 0, sy: window.scrollY || 0 };
  })())`));
  if (!box) { console.log('  跳过（没找到 ' + sel + '）'); return false; }
  await sleep(400);
  const doc = mode === 'document';
  const x = (doc ? box.x + box.sx : box.x) - pad;
  const y = (doc ? box.y + box.sy : box.y) - pad;
  const r = await send('Page.captureScreenshot', {
    format: 'jpeg', quality: 90,
    clip: { x: Math.max(0, x), y: Math.max(0, y), width: box.w + pad * 2, height: box.h + pad * 2, scale },
    captureBeyondViewport: doc,
  });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('  ' + path.basename(file) + '  ' + Math.round(box.w) + 'x' + Math.round(box.h) +
    ' @' + scale + 'x  ' + (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
  return true;
}

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['http://127.0.0.1:8787/*'] });

  // 1 入场页
  await send('Page.navigate', { url: 'file:///' + SRC.replace(/\\/g, '/') });
  await sleep(3600);
  console.log('1 入场页');
  await shot(path.join(OUT, 'ppt-intro.jpg'), '.intro-stage', 40, 'viewport', 2);

  // 造演示数据
  await send('Page.navigate', { url: 'file:///' + SRC.replace(/\\/g, '/') + '?intro=0&pet=none' });
  await sleep(1700);
  await evalJs('window.__APP__.enterApp(true)');
  await sleep(300);
  await evalJs(`(function(){
    var A = window.__APP__, pool = A.activePool();
    for (var i = 0; i < 620; i++) A.setSt(pool[i], (i % 7 === 0) ? 0 : (i % 5 === 0 ? 1 : 2));
    A.addSample({ n: 96, k: 61, f: 12, pre: 0, bank: 'c4', mode: 'self',
      bands: { 1: { N: 738, n: 22, k: 14, f: 3 }, 2: { N: 610, n: 18, k: 11, f: 2 },
               3: { N: 478, n: 14, k: 8, f: 2 }, 4: { N: 874, n: 16, k: 9, f: 2 },
               5: { N: 1556, n: 14, k: 8, f: 1 }, 6: { N: 1598, n: 8, k: 4, f: 1 },
               0: { N: 1321, n: 4, k: 2, f: 1 } } });
    A.save(); A.go('home'); A.render(); return 1;
  })()`);
  await sleep(900);

  console.log('2 首页词汇量');
  await shot(path.join(OUT, 'ppt-home.jpg'), '.hero', 14, 'document', 2);

  console.log('3 分组页');
  await evalJs(`(function(){var A=window.__APP__;A.go('groups');A.render();return 1;})()`);
  await sleep(700);
  await shot(path.join(OUT, 'ppt-groups.jpg'), '#view', 8, 'viewport', 1.6);

  console.log('4 词频分布');
  await evalJs(`(function(){var A=window.__APP__;A.go('stats');A.render();return 1;})()`);
  await sleep(700);
  await shot(path.join(OUT, 'ppt-bands.jpg'), '.bandlist', 16, 'document', 2);

  console.log('5 词汇地图');
  await shot(path.join(OUT, 'ppt-map.jpg'), '.vmap-card', 14, 'document', 2);

  console.log('6 答题页');
  await evalJs(`(function(){var A=window.__APP__;A.S.settings.mode='choice';A.save();A.startSession('probe',{target:250});return 1;})()`);
  await sleep(800);
  await evalJs(`(function(){var o=document.querySelector('.opt');if(o)o.click();return 1;})()`);
  await sleep(900);
  await shot(path.join(OUT, 'ppt-test.jpg'), '#view', 6, 'viewport', 1.5);

  console.log('7 等级报告');
  await evalJs(`(function(){
    var A = window.__APP__; A.S.session = null;
    var pool = A.activePool();
    for (var i = 0; i < pool.length; i++) A.setSt(pool[i], i % 40 === 0 ? 1 : 2);
    A.save(); A.go('report'); A.render(); return 1;
  })()`);
  await sleep(900);
  await shot(path.join(OUT, 'ppt-report.jpg'), '.rpt-hero', 12, 'document', 1.8);
  await shot(path.join(OUT, 'ppt-ladder.jpg'), 'js:document.querySelector(\'.rpt-rk\').parentElement', 18, 'document', 2);
  /* 报告页的「下一步：先补哪一段」清单单独截一块，PPT 里那一页讲的是这张清单，
     以前直接用了整页截图，结果截到的是还没渲染完的半空页面。 */
  await shot(path.join(OUT, 'ppt-next.jpg'),
    'js:(document.querySelector(\'.rpt-step\') || document.querySelector(\'.rpt-hero\')).closest(\'.card\')', 14, 'document', 2);

  console.log('8 AI 面板');
  await evalJs(`window.__APP__.openAIDialog('我最该补哪一段？给个具体方案')`);
  await sleep(2400);
  await evalJs(`(function(){var l=document.getElementById('aiLog');if(l)l.scrollTop=0;return 1;})()`);
  await shot(path.join(OUT, 'ppt-ai.jpg'), '#modal .box', 8, 'viewport', 2);
  await evalJs(`(function(){var b=document.querySelector('[data-act=modal-close]');if(b)b.click();return 1;})()`);
  await sleep(400);

  console.log('9 设置页（AI 与额度）');
  await evalJs(`(function(){var A=window.__APP__;A.go('settings');A.render();return 1;})()`);
  await sleep(800);
  await shot(path.join(OUT, 'ppt-settings.jpg'), 'js:document.querySelector(\'#userKeyInput\').closest(\'.card\')', 16, 'document', 2);

  /* 「每日可投入时间」是另一块卡片，和 AI 额度不是同一张图——第一版直接用 AI 那张，
     结果"每日时间"那页配的是 API Key 的截图，图文对不上。这里单独截一块。 */
  console.log('9b 设置页（每日可投入时间）');
  await shot(path.join(OUT, 'ppt-daily.jpg'), 'js:document.getElementById(\'dailyMinInput\').closest(\'.card\')', 16, 'document', 2);

  console.log('10 暗色模式');
  await evalJs(`(function(){var A=window.__APP__;A.setTheme('dark');A.go('home');A.render();return 1;})()`);
  await sleep(900);
  await shot(path.join(OUT, 'ppt-dark.jpg'), '.hero', 14, 'document', 2);

  // 11 桌宠（单独开一次，桌宠在 ?pet=none 下是关掉的）
  console.log('11 桌宠');
  await send('Page.navigate', { url: 'file:///' + SRC.replace(/\\/g, '/') + '?intro=0' });
  await sleep(2000);
  await evalJs('window.__APP__.enterApp(true)');
  await sleep(1200);
  await evalJs(`(function(){
    var A = window.__APP__;
    A.go('home'); A.render();
    // 让她说句话，气泡里是真实数据
    if (A.petSay) A.petSay('帮你算好了：词汇量 4,449 词，最该补最高频 1k 段。');
    return 1;
  })()`);
  await sleep(900);
  await shot(path.join(OUT, 'ppt-pet.jpg'), 'js:document.getElementById("pet")', 26, 'viewport', 2);

  chrome.kill();
  process.exit(0);
} catch (e) { console.error('失败:', e.message); try { chrome.kill() } catch {} process.exit(1); }
