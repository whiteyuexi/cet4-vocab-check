// scripts/cdp-shot.mjs — 用 DevTools 协议截图，可等待页面自定义条件（避免虚拟时钟与 Worker 死锁）
// 用法: node scripts/cdp-shot.mjs <url> <out.png> [waitExpr] [timeoutMs] [width] [height] [clipX,clipY,clipW,clipH[,scale]]
//   最后一段给了就只截那块区域（逗号分隔），第 5 个数是放大倍数，默认 2。
//   例：只想看右下角桌宠 → node scripts/cdp-shot.mjs <url> out.png "..." 30000 1500 950 "1120,470,380,420"
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const [url, out, waitExpr = 'document.readyState === "complete"', timeoutMs = '30000', W = '1400', H = '900', clipArg = ''] = process.argv.slice(2);
if (!url || !out) { console.error('用法: node scripts/cdp-shot.mjs <url> <out.png> [waitExpr] [timeoutMs] [w] [h]'); process.exit(1); }

const PORT = 9333 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
const chrome = spawn(CH, [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT,
  '--window-size=' + W + ',' + H, 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitPort() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) return; } catch {}
    await sleep(150);
  }
  throw new Error('Chrome 调试端口未就绪');
}
function cleanup(code) {
  try { chrome.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

let ws;
try {
  await waitPort();
  const tab = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = e => rej(new Error('ws 连接失败')); });

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
  let hit = false, last = '';
  while (Date.now() < deadline) {
    const r = await send('Runtime.evaluate', { expression: 'String(' + waitExpr + ')', returnByValue: true });
    last = r.result?.result?.value;
    if (last === 'true') { hit = true; break; }
    await sleep(300);
  }
  const title = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
  const body = await send('Runtime.evaluate', { expression: '(document.getElementById("log")||{}).textContent || ""', returnByValue: true });
  console.log('等待条件: ' + (hit ? '已满足' : '超时（' + last + '）') + '  title=' + title.result?.result?.value);
  if (body.result?.result?.value) console.log('--- 页面日志 ---\n' + body.result.result.value);

  const shotParams = { format: 'png', captureBeyondViewport: false };
  if (clipArg) {
    const p = clipArg.split(',').map(Number);
    if (p.length >= 4 && p.slice(0, 4).every(n => isFinite(n))) {
      shotParams.clip = { x: p[0], y: p[1], width: p[2], height: p[3], scale: p[4] || 2 };
    } else {
      console.log('提示：clip 参数格式不对，已忽略（应为 "x,y,w,h[,scale]"）');
    }
  }
  const shot = await send('Page.captureScreenshot', shotParams);
  if (shot.result?.data) { fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64')); console.log('截图已保存 ' + out); }
  else console.log('截图失败');
  cleanup(hit ? 0 : 2);
} catch (e) {
  console.error('ERR: ' + e.message);
  cleanup(1);
}
