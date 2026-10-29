// scripts/check-ai-offline.mjs —— 断网时 AI 面板到底还能不能用（真实 Chrome，CDP 模拟离线）
//
// 为什么要单独测：单文件交付的主场景就是"评委在自己电脑上、旁边没有后端"，
// 甚至可能整台机器都不联网。这时 AI 面板必须给出本地方案，而不是报错或停在"连接中…"。
//
// 用法: node scripts/check-ai-offline.mjs [被测文件]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const TARGET = process.argv[2] || path.join(ROOT, 'index.html');
const PORT = 9800 + Math.floor(Math.random() * 60);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aioff-'));
const chrome = spawn(CH, ['--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, seq = 0, fails = 0;
const pending = new Map();
function send(m, p = {}) { const id = ++seq; ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise((res, rej) => pending.set(id, { res, rej })); }
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  return r.result?.value;      // send() 已解包到 CDP 的 result
};
function ok(name, cond, detail) {
  if (!cond) fails++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined && detail !== '' ? '   [' + detail + ']' : ''));
}

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Page.navigate', { url: 'file:///' + TARGET.replace(/\\/g, '/') + '?intro=0&pet=none' });
  await sleep(1800);

  // 断网：CDP 直接模拟离线（含 file:// 之外的请求全部失败）
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  console.log('已切到离线模式，被测文件：' + path.basename(TARGET));

  // 造一点数据，否则本地方案只能说"先去测一次"
  await ev(`(function(){
    var A = window.__APP__, pool = A.activePool();
    for (var i = 0; i < 700; i++) A.setSt(pool[i], (i % 6 === 0) ? 0 : (i % 4 === 0 ? 1 : 2));
    A.addSample({ n: 96, k: 61, f: 12, bank: 'c4', mode: 'self',
      bands: { 1:{N:738,n:22,k:14,f:3}, 2:{N:610,n:18,k:11,f:2}, 3:{N:478,n:14,k:8,f:2},
               4:{N:874,n:16,k:9,f:2}, 5:{N:1556,n:14,k:8,f:1}, 6:{N:1598,n:8,k:4,f:1},
               0:{N:1321,n:4,k:2,f:1} } });
    A.save(); return 1;
  })()`);

  // 点开 AI 诊断（等价于用户点顶栏按钮）
  await ev(`(function(){ document.getElementById('aiBtn').click(); return 1; })()`);
  await sleep(2600);      // 够本地规则+B 后端探测超时

  const st = JSON.parse(await ev(`JSON.stringify((function(){
    var log = document.getElementById('aiLog');
    var pill = document.getElementById('aiMode');
    var errs = document.querySelectorAll('#aiLog .ai-err');
    var acts = document.querySelectorAll('#aiLog .ai-act');
    return {
      pill: pill ? pill.textContent : '(无)',
      len: log ? log.textContent.length : 0,
      text: log ? log.textContent.slice(0, 400) : '',
      errCount: errs.length,
      errText: errs.length ? errs[0].textContent.slice(0, 120) : '',
      acts: acts.length,
      loading: log ? /连接中|正在分析/.test(log.textContent) : false
    };
  })())`));

  ok('离线时面板给出了内容（不是空白）', st.len > 60, st.len + ' 字');
  ok('没有停在"连接中…/正在分析…"', !st.loading, st.loading ? '卡在加载态' : 'ok');
  ok('模式标签如实写着离线/本地', /离线|本地/.test(st.pill), st.pill);
  ok('回答了"依据"（用的是本机数据）', /依据|已测|覆盖率/.test(st.text), st.text.replace(/\s+/g, ' ').slice(0, 60));
  ok('给了可点的下一步动作', st.acts > 0, st.acts + ' 个按钮');
  ok('没有把"调用失败"当结论丢给用户', st.errCount === 0,
    st.errCount ? st.errText : '无红字报错');

  console.log('\n面板首段：' + st.text.replace(/\s+/g, ' ').slice(0, 220));
  console.log('模式标签：' + st.pill);
  console.log('\n' + (fails === 0 ? '断网可用性检查通过' : '断网可用性检查失败 ' + fails + ' 项'));
  ws.close(); chrome.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(fails === 0 ? 0 : 1);
} catch (e) {
  console.error('ERR ' + e.message);
  try { ws && ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  process.exit(1);
}
