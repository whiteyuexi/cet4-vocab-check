// scripts/pet-test.mjs — 用 DevTools 协议验证桌宠的拖动 / 重力 / 溜达
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2] || 'http://127.0.0.1:8787/';
const PORT = 9700 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-'));
const chrome = spawn(CH, ['--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle',
  '--use-angle=swiftshader', '--hide-scrollbars', '--no-first-run', '--user-data-dir=' + profile,
  '--remote-debugging-port=' + PORT, '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const tab = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')); });
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { if (await evalJs('!!document.documentElement.dataset.pet')) break; await sleep(300); }
  await sleep(1200);

  const out = [];
  const ok = (n, c, e) => out.push((c ? 'PASS' : 'FAIL') + '  ' + n + (e ? '   [' + e + ']' : ''));

  const info = () => evalJs('JSON.stringify(window.__APP__.petInfo())').then(JSON.parse);
  const a = await info();
  ok('桌宠已挂载并有初始位置', a.x > 0 && a.y > 0, 'x=' + a.x + ' y=' + a.y);
  ok('默认出现在屏幕右侧', a.x > 800, 'x=' + a.x);
  const fig = await evalJs('JSON.stringify((function(){var r=document.getElementById("petFig").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})())').then(JSON.parse);
  ok('角色可点区域尺寸正确', fig.w > 100 && fig.h > 100, Math.round(fig.w) + 'x' + Math.round(fig.h));

  // 模拟拖动：从角色中心拖到左上
  const cx = Math.round(fig.x + fig.w / 2), cy = Math.round(fig.y + fig.h / 2);
  const fire = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, pointerType: 'mouse' });
  await fire('mousePressed', cx, cy, 1);
  for (let i = 1; i <= 6; i++) await fire('mouseMoved', cx - i * 55, cy - i * 40, 1);
  const drag = await info();
  ok('拖动后位置跟着走', Math.abs(drag.x - a.x) > 200 && drag.y < a.y, 'x=' + drag.x + ' y=' + drag.y);
  ok('拖动中标记为悬空', drag.air === false, 'air=' + drag.air);

  await fire('mouseReleased', cx - 330, cy - 240, 0);
  await sleep(200);
  const justDropped = await info();
  await sleep(2500);
  const landed = await info();
  ok('松手后开始下落', landed.y > justDropped.y, justDropped.y + ' -> ' + landed.y);
  ok('最终落到地面（导航条上沿）', Math.abs(landed.y - a.y) < 4, 'y=' + landed.y + ' 初始 y=' + a.y);

  // 戳一下（不移动的点击）
  const f2 = await evalJs('JSON.stringify((function(){var r=document.getElementById("petFig").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})())').then(JSON.parse);
  const px = Math.round(f2.x + f2.w / 2), py = Math.round(f2.y + f2.h / 2);
  await fire('mousePressed', px, py, 1);
  await fire('mouseReleased', px, py, 0);
  await sleep(120);
  const poked = await evalJs('document.getElementById("pet").classList.contains("poked")');
  ok('点一下有反应', poked === true, 'poked=' + poked);

  // 溜达：等一段时间看 x 是否自己变过
  const before = (await info()).x;
  let moved = false;
  for (let i = 0; i < 28; i++) { await sleep(1000); const n = (await info()).x; if (Math.abs(n - before) > 20) { moved = true; break; } }
  ok('会自己溜达（等待 ≤28s）', moved, 'x ' + before + ' -> ' + (await info()).x);

  ok('署名跟着形态走', /SVG|CC BY-NC-SA/.test(await evalJs('document.getElementById("petCredit").textContent')), await evalJs('document.getElementById("petCredit").textContent'));

  console.log(out.join('\n'));
  console.log('\n通过 ' + out.filter(x => x.startsWith('PASS')).length + ' / ' + out.length);
  ws.close(); chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}   // Chrome 句柄释放有延迟，清理失败不影响结果
  process.exit(0);
} catch (e) {
  console.error('ERR: ' + e.message);
  try { ws && ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  process.exit(1);
}
