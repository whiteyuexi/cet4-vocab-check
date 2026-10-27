// scripts/make-readme-shots.mjs — 按当前产物重拍 README 用的 6 张截图（docs/screenshots/*.png）
// 产物换品牌或改文案后，跑一次这个脚本，README 里的图就不会还挂着旧名字。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const PORT = 9700 + Math.floor(Math.random() * 120);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
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
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const f = path.join(OUT, name);
  fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
  console.log('  已存', name, (fs.statSync(f).size / 1024).toFixed(0) + ' KB');
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < 120; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  // 截图时屏蔽本地后端：AI 段走确定性的「本地方案」，截图可复现、也顺带展示离线能力
  await send('Network.setBlockedURLs', { urls: ['http://127.0.0.1:8787/*'] });
  // 先关掉桌宠，截图更干净（README 里桌宠单独讲）
  await send('Page.navigate', { url: 'file:///' + SRC.replace(/\\/g, '/') + '?intro=0&pet=none' });
  await sleep(1800);

  // 造一份"看起来有内容"的演示数据：600 词不同状态 + 一条样本
  await evalJs(`(function(){
    var A = window.__APP__, pool = A.activePool();
    for (var i = 0; i < 620; i++) {
      var v = (i % 7 === 0) ? 0 : (i % 5 === 0 ? 1 : 2);
      A.setSt(pool[i], v);
    }
    A.addSample({ n: 96, k: 61, f: 12, pre: 0, bank: 'c4', mode: 'self',
      bands: { 1: { N: 738, n: 22, k: 14, f: 3 }, 2: { N: 610, n: 18, k: 11, f: 2 },
               3: { N: 478, n: 14, k: 8, f: 2 }, 4: { N: 874, n: 16, k: 9, f: 2 },
               5: { N: 1556, n: 14, k: 8, f: 1 }, 6: { N: 1598, n: 8, k: 4, f: 1 },
               0: { N: 1321, n: 4, k: 2, f: 1 } } });
    A.save(); A.go('home'); A.render();
    return 1;
  })()`);
  await sleep(900);

  console.log('① 首页');
  await shot('01-home.png');

  console.log('② 答题（四选一 + 揭示例句）');
  await evalJs(`(function(){
    var A = window.__APP__;
    A.S.settings.mode = 'choice'; A.save();
    A.startSession('probe', { target: 250 });
    return 1;
  })()`);
  await sleep(700);
  await evalJs(`(function(){ var o = document.querySelector('.opt'); if (o) o.click(); return 1; })()`);
  await sleep(700);
  await shot('02-testing.png');

  console.log('③ 报告');
  await evalJs(`(function(){ var A = window.__APP__; A.S.session = null; A.save(); A.go('report'); A.render(); return 1; })()`);
  await sleep(800);
  await shot('03-report.png');

  console.log('④ 总览（频段剖面 + 词汇地图）');
  await evalJs(`(function(){ var A = window.__APP__; A.go('stats'); A.render(); return 1; })()`);
  await sleep(800);
  await shot('04-overview.png');

  console.log('⑤ AI 诊断（本地方案 + 可执行动作）');
  await evalJs(`window.__APP__.openAIDialog('我最该补哪一段？给个具体方案')`);
  await sleep(2200);
  // 截图前把回答滚到顶部，README 里看起来才完整
  await evalJs(`(function(){ var l = document.getElementById('aiLog'); if (l) l.scrollTop = 0; return 1; })()`);
  await sleep(300);
  await shot('05-ai-diagnose.png');
  await evalJs(`(function(){var b=document.querySelector('[data-act=modal-close]'); if(b)b.click(); return 1;})()`);
  await sleep(400);

  console.log('⑥ 例句与释义（答题揭示态）');
  /* autoNext 必须关掉：它默认开着，点完作答会在 850ms 后自动跳下一题，
     截图拍到的是下一题的未揭示态——README 里那张"例句与释义"一直是错的。 */
  /* 三个坑一起修：
     ① autoNext 默认开着，点完 850ms 就跳下一题 → 截到的是未揭示态，先关掉；
     ② 随机抽到的词可能没有例句（比如 generator），这张图要的是"例句" → 手动挑一个必有例句的词；
     ③ 用 list 会话只放这一个词，避免"再点一下就到下一题"。 */
  await evalJs(`(function(){
    var A = window.__APP__;
    A.S.settings.mode = 'self'; A.S.settings.autoNext = false; A.save();
    var pool = A.activePool(), pick = null;
    for (var i = 0; i < pool.length; i++) {
      var w = A.WORDS[pool[i]].w;
      if (window.SENTENCES && window.SENTENCES[w]) { pick = pool[i]; break; }
    }
    if (pick === null) pick = pool[0];
    A.startSession('list', { list: [pick], label: '例句展示 · ' + A.WORDS[pick].w });
    return 1;
  })()`);
  await sleep(700);
  await evalJs(`(function(){ var b = document.querySelectorAll('.jbtn'); if (b[2]) b[2].click(); return 1; })()`);
  await sleep(900);
  await shot('06-example.png');

  chrome.kill();
  process.exit(0);
} catch (e) { console.error('失败:', e.message); try { chrome.kill() } catch {} process.exit(1); }
