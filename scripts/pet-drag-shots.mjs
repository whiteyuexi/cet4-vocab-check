// scripts/pet-drag-shots.mjs — 按"真人速度"把桌宠拖一遍，连拍几张看手感
//
// 为什么单独做：pet-test 用的是瞬时 pointermove（速度上千 px/s，直接把弹簧顶到上限），
// 断言只能证明"数值有变化"，证明不了"看着自然"。这里按 60fps、约 750px/s 地发移动事件，
// 在【拖动中 / 手停住 / 松手落地】三个时刻各拍一张，人眼过一遍。
//
// 用法：node scripts/pet-drag-shots.mjs [宽] [高]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'shots');
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900);
const PORT = 9733 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'petdrag-'));
fs.mkdirSync(OUT, { recursive: true });

const chrome = spawn(CH, [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT,
  '--window-size=' + W + ',' + H, 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
function cleanup(code) { try { chrome.kill(); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }

let ws, seq = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
const evalJs = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result && r.result.value;
};

// 每张截图都重新算裁剪框：她是被拖着的，位置一直在变，用一开始那个框会把她切掉半边
async function shot(name) {
  const r0 = JSON.parse(await evalJs('JSON.stringify(document.getElementById("petFig").getBoundingClientRect())'));
  const clip = {
    x: Math.max(0, r0.x - 110), y: Math.max(0, r0.y - 250),
    width: r0.width + 220, height: r0.height + 300, scale: 1.6,
  };
  const r = await send('Page.captureScreenshot', { format: 'png', clip });
  const f = path.join(OUT, name);
  fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
  console.log('shot:', f);
}

try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {}
    await sleep(150);
  }
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  const page = list.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') });
  for (let i = 0; i < 100; i++) {
    await sleep(150);
    if (await evalJs('document.readyState==="complete" && !!document.getElementById("petFig")')) break;
  }
  await sleep(700);

  const rect = JSON.parse(await evalJs('JSON.stringify(document.getElementById("petFig").getBoundingClientRect())'));
  const cx = Math.round(rect.x + rect.width / 2), cy = Math.round(rect.y + rect.height / 2);
  // 只截桌宠所在的那一块（连气泡），画面里其他东西对判断手感没帮助
  const clip = { x: rect.x - 120, y: rect.y - 260, width: rect.width + 240, height: rect.height + 300 };

  const fire = (type, x, y, buttons) =>
    send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, pointerType: 'mouse' });

  await fire('mousePressed', cx, cy, 1);
  // 约 750 px/s：每 16ms 走 12px，同时略微上抬（真人拖拽一般不会笔直）
  let x = cx, y = cy;
  for (let i = 0; i < 46; i++) {
    x -= 12; y -= 0.6;
    await fire('mouseMoved', x, y, 1);
    await sleep(16);
    if (i === 18) {
      const st = JSON.parse(await evalJs('JSON.stringify(window.__APP__.petInfo())'));
      console.log('拖动中: swing=' + st.swing + '° hangX=' + st.hangX + 'px sprite=' + st.sprite);
      await shot('_pet_drag_moving.png');
    }
  }
  await shot('_pet_drag_held.png');

  // 再把她高高拎起来：这一段是看「影子有没有留在地面」——贴纸感全在这个细节上
  for (let i = 0; i < 26; i++) {
    y -= 14;
    await fire('mouseMoved', x - 4, y, 1);
    await sleep(16);
  }
  await sleep(220);
  const hi = JSON.parse(await evalJs('JSON.stringify(window.__APP__.petInfo())'));
  console.log('高高拎起: y=' + hi.y + ' floor=' + hi.floor + ' swing=' + hi.swing + '°');
  await shot('_pet_drag_lifted.png');

  // 手停住 → 应该自己回摆归位
  await sleep(900);
  const st2 = JSON.parse(await evalJs('JSON.stringify(window.__APP__.petInfo())'));
  console.log('手停住: swing=' + st2.swing + '° hangX=' + st2.hangX + 'px');
  await shot('_pet_drag_still.png');

  await fire('mouseReleased', x, y, 0);
  await sleep(1400);
  const st3 = JSON.parse(await evalJs('JSON.stringify(window.__APP__.petInfo())'));
  console.log('落地后: swing=' + st3.swing + '° air=' + st3.air + ' sprite=' + st3.sprite);
  await shot('_pet_drag_landed.png');
  cleanup(0);
} catch (e) {
  console.error('失败:', e.message);
  cleanup(1);
}
