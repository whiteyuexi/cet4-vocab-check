// scripts/render-pet-frames.mjs — 从 Live2D 模型渲染桌宠帧（离线版内联用）
//
// 为什么要有这一步：手绘 SVG 形象质量不达标，改成直接从模型渲染透明 PNG，
// 这样离线单文件版和联网 Live2D 版是同一个形象。
//
// 前置：先启动本地服务（node server/index.mjs），渲染页由它托管。
// 产物：assets/pet-frames/idle0.png（464x428，透明背景，2 倍分辨率）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.PET_BASE || 'http://127.0.0.1:8787';
const OUT = path.join(process.cwd(), 'assets', 'pet-frames');
const PORT = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pfr-'));
const chrome = spawn(CH, ['--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle',
  '--use-angle=swiftshader', '--hide-scrollbars', '--no-first-run', '--user-data-dir=' + profile,
  '--remote-debugging-port=' + PORT, '--window-size=600,600'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

let ws;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const tab = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(BASE + '/scripts/pet-render.html'), { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('DevTools 连接失败')); });
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '/scripts/pet-render.html' });
  await sleep(400);
  // 透明背景必须在导航之后设，否则会被新文档重置
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send('Runtime.evaluate', { expression: 'document.documentElement.style.background="transparent";document.body.style.background="transparent";' });

  for (let i = 0; i < 60; i++) { if (await evalJs('window.__ready === true')) break; await sleep(300); }
  const err = await evalJs('window.__err');
  if (err) throw new Error('渲染页报错: ' + err);
  await sleep(1800);

  const r = await send('Page.captureScreenshot', {
    format: 'png', fromSurface: true,
    clip: { x: 0, y: 0, width: 232, height: 214, scale: 2 }
  });
  if (!r.result?.data) throw new Error('截图失败');
  const buf = Buffer.from(r.result.data, 'base64');
  fs.writeFileSync(path.join(OUT, 'idle0.png'), buf);
  console.log('已渲染 assets/pet-frames/idle0.png  ' + (buf.length / 1024).toFixed(1) + ' KB  (464x428 透明)');
  console.log('校验透明度：node scripts/png-alpha.mjs assets/pet-frames/idle0.png');

  ws.close(); chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
} catch (e) {
  console.error('ERR: ' + e.message);
  console.error('提示：需要先运行 node server/index.mjs');
  try { ws && ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  process.exit(1);
}
