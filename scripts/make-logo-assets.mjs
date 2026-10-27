// scripts/make-logo-assets.mjs — 从 assets/logo/*.svg 导出 PNG（PPT / 视频 / 商店图标用）
//
// 用 Chrome 把 SVG 渲染成位图，避免引入任何图形库（与项目"零运行时依赖"一致）。
// 产出 assets/logo/png/：
//   mark-256 / mark-512 / mark-1024        透明底，品牌色
//   mark-cream-512                         米白圆角方块（PPT 封面/角标用）
//   favicon-32 / favicon-64                浏览器标签页
//   mono-dark-512 / mono-light-512         单色（浅底 / 深底）
//
// 用法：node scripts/make-logo-assets.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const LOGO = path.join(ROOT, 'assets', 'logo');
const OUT = path.join(LOGO, 'png');
fs.mkdirSync(OUT, { recursive: true });

const PORT = 9700 + Math.floor(Math.random() * 120);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-'));
const chrome = spawn(CH, ['--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, '--window-size=1200,1200', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
function send(m, p = {}) { const id = ++seq; ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise((res, rej) => pending.set(id, { res, rej })); }

// 把某个 SVG 包进一个恰好 size×size 的页面里，页面背景按需透明/米白
function page(svgText, size, bg) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${bg || 'transparent'};}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${svgText.replace(/width="[^"]*"/, `width="${size}"`).replace(/height="[^"]*"/, `height="${size}"`)}</body></html>`;
  const f = path.join(os.tmpdir(), 'logo-page-' + size + '-' + Math.random().toString(36).slice(2) + '.html');
  fs.writeFileSync(f, html, 'utf8');
  return f;
}

async function shoot(svgPath, size, outName, bg) {
  const svg = fs.readFileSync(path.join(LOGO, svgPath), 'utf8');
  const f = page(svg, size, bg);
  await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///' + f.replace(/\\/g, '/') });
  await sleep(500);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const out = path.join(OUT, outName);
  fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
  console.log('  ' + outName.padEnd(22) + size + '×' + size + '  ' + (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
  try { fs.unlinkSync(f); } catch (e) {}
}

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Page.enable');

  console.log('导出 logo 资源：');
  await shoot('mark.svg', 256, 'mark-256.png', null);
  await shoot('mark.svg', 512, 'mark-512.png', null);
  await shoot('mark.svg', 1024, 'mark-1024.png', null);
  await shoot('mark.svg', 512, 'mark-cream-512.png', '#FAF8F4');
  await shoot('favicon.svg', 32, 'favicon-32.png', null);
  await shoot('favicon.svg', 64, 'favicon-64.png', null);
  await shoot('mark-mono-dark.svg', 512, 'mono-dark-512.png', null);
  await shoot('mark-mono-dark.svg', 512, 'mono-light-512.png', '#0F1116');   // 深底上反白
  console.log('完成 →', OUT);
  chrome.kill();
  process.exit(0);
} catch (e) { console.error('失败:', e.message); try { chrome.kill() } catch {} process.exit(1); }
