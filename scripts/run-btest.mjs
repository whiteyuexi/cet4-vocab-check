// scripts/run-btest.mjs —— 真正把浏览器断言跑起来并给出结论
//
// 背景：`node btest.js` 只负责生成 shots/btest.html（一份注入了断言脚本的产物副本），
// 断言本身要在真实 Chrome 里执行，结果渲染成页面里的 <pre>。
// 以前这一步靠"人肉打开页面看一眼"，结果 btest.js 里一处语法错误（跨行单引号字符串）
// 挂了很久都没人发现——脚本自己只打印 ok。所以补上这个自动跑分器：
//   1) 起一个只读静态服务器（避免 file:// 下 localStorage 被限制）
//   2) headless Chrome 打开 /shots/btest.html
//   3) 轮询 <pre> 文本，收集 PASS/FAIL 行，有任何 FAIL 就以非 0 退出
//
// 用法: node scripts/run-btest.mjs [--headful] [--timeout 60000]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const args = process.argv.slice(2);
const HEADFUL = args.includes('--headful');
const TIMEOUT = Number((args[args.indexOf('--timeout') + 1] || 60000)) || 60000;

// 1) 先生成最新的 btest.html，保证测的是当前产物
await new Promise((res, rej) => {
  const p = spawn(process.execPath, [path.join(ROOT, 'btest.js')], { cwd: ROOT, stdio: 'inherit' });
  p.on('exit', c => (c === 0 ? res() : rej(new Error('btest.js 生成失败'))));
});

const PAGE = path.join(ROOT, 'shots', 'btest.html');
if (!fs.existsSync(PAGE)) { console.error('缺少 shots/btest.html'); process.exit(1); }

// 2) 静态服务器：只提供 btest.html（它是自包含单文件）
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const file = path.join(ROOT, rel === '' ? 'index.html' : rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

// 3) Chrome + CDP
const PORT_CDP = 9600 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'btest-'));
const chromeArgs = [
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT_CDP, '--window-size=1500,950',
];
if (!HEADFUL) chromeArgs.unshift('--headless=new');
const chrome = spawn(CH, chromeArgs.concat('about:blank'), { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, code = 1;
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:' + PORT_CDP + '/json/version')).ok) break; } catch {}
    await sleep(150);
  }
  const tab = await (await fetch('http://127.0.0.1:' + PORT_CDP + '/json/new?' + encodeURIComponent('about:blank'), { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP 连接失败')); });
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const n = ++id; pend.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/shots/btest.html' });

  // 4) 等断言跑完：<pre> 出现且不再增长
  let text = '', stable = 0, last = '';
  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT) {
    text = (await ev("(function(){var p=document.querySelector('pre');return p?p.textContent:'';})()")) || '';
    if (text && text === last) { if (++stable >= 3) break; } else { stable = 0; }
    last = text;
    await sleep(400);
  }
  if (!text) throw new Error('没等到断言结果（页面里的 <pre> 一直是空的）');

  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const pass = lines.filter(l => l.startsWith('PASS'));
  const info = lines.filter(l => l.startsWith('INFO'));
  const fail = lines.filter(l => !l.startsWith('PASS') && !l.startsWith('INFO'));
  console.log(lines.join('\n'));
  console.log('\n浏览器断言：通过 ' + pass.length + ' / ' + (lines.length - info.length) +
    (fail.length ? '，失败 ' + fail.length : '，失败 0') + (info.length ? '（另有 ' + info.length + ' 条 INFO 不计分）' : ''));
  code = fail.length ? 1 : 0;
} catch (e) {
  console.error('ERR ' + e.message);
} finally {
  try { ws && ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { server.close(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.exit(code);
