// scripts/cdp-eval.mjs — 在真实 Chrome 里跑一段表达式，把结果打回来
//
// 为什么单独做一个：cdp-shot 只能截图 + 读 #log，想确认 DOM/计算样式/JS 状态时
// 没有别的口子。用法：
//   node scripts/cdp-eval.mjs <url> "<js表达式>" [waitExpr] [timeoutMs] [w] [h]
// 表达式返回值会 JSON 化后打印；想跑多步就用 IIFE 返回对象：
//   node scripts/cdp-eval.mjs "http://x/y.html" "(function(){return {a:document.title}})()"
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const [url, expr, waitExpr = 'document.readyState === "complete"', timeoutMs = '30000', W = '1200', H = '820'] = process.argv.slice(2);
if (!url || !expr) {
  console.error('用法: node scripts/cdp-eval.mjs <url> "<expr>" [waitExpr] [timeoutMs] [w] [h]');
  process.exit(1);
}

const PORT = 9333 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpe-'));
const chrome = spawn(CH, [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT,
  '--window-size=' + W + ',' + H, 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
function cleanup(code) {
  try { chrome.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

let ws;
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {}
    await sleep(150);
  }
  const tab = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 连接失败')); });

  let id = 0; const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });

  const deadline = Date.now() + Number(timeoutMs);
  let hit = false;
  while (Date.now() < deadline) {
    const r = await send('Runtime.evaluate', { expression: 'String(' + waitExpr + ')', returnByValue: true });
    if (r.result?.result?.value === 'true') { hit = true; break; }
    await sleep(250);
  }
  if (!hit) console.log('[警告] 等待条件超时，仍然尝试求值');

  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const res = r.result?.result;
  if (r.result?.exceptionDetails) {
    console.error('表达式抛错: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    cleanup(1);
  }
  if (res && 'value' in res) {
    const v = res.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  } else {
    console.log('(无返回值) ' + JSON.stringify(res));
  }
  cleanup(0);
} catch (e) {
  console.error('ERR: ' + e.message);
  try { ws && ws.close(); } catch {}
  cleanup(1);
}
