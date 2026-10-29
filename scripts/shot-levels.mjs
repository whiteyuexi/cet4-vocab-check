// scripts/shot-levels.mjs —— 六个等级各截一张（给演示视频 / PPT / 评委看数据）
//
// 做法：打开产物 → 调 A.buildDemoProfiles() 生成 6 个演示档案 → 逐个切换 →
// 截「等级阶梯 + 等级头」那一块（文档坐标），桌面宽度 1440。
//
// 用法: node scripts/shot-levels.mjs [输出目录]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'index.html');
const OUT = process.argv[2] || path.join(ROOT, 'shots');
const PORT = 9900 + Math.floor(Math.random() * 80);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'levels-'));
const chrome = spawn(CH, ['--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
function send(m, p = {}) { const id = ++seq; ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise((res, rej) => pending.set(id, { res, rej })); }
const evalJs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.result?.value ?? r.result?.value;
};

try {
  fs.mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < 120; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + SRC.replace(/\\/g, '/') + '?intro=0&pet=none' });
  await sleep(1800);

  const made = await evalJs(`JSON.stringify(window.__APP__.buildDemoProfiles().map(function(m){return {id:m.id,name:m.name,rank:m.rank,rankName:m.rankName,ratio:m.ratio};}))`);
  const list2 = JSON.parse(made);
  console.log('生成演示档案：' + list2.map(m => m.rank + ' ' + m.rankName + ' ' + Math.round(m.ratio * 100) + '%').join(' / '));

  for (const m of list2) {
    await evalJs(`(function(){var A=window.__APP__;A.switchProfile(${JSON.stringify(m.id)});A.go('report');A.render();return 1;})()`);
    await sleep(700);
    // 取「等级头 + 阶梯 + 补词清单」这一段：从 .rpt-hero 到 .rpt-rk 的父容器底部
    const box = JSON.parse(await evalJs(`(function(){
      var hero = document.querySelector('.rpt-hero');
      var rk = document.querySelector('.rpt-rk');
      if (!hero) return 'null';
      var a = hero.getBoundingClientRect(), b = rk ? rk.parentElement.getBoundingClientRect() : a;
      return JSON.stringify({ x: Math.min(a.left, b.left) + window.scrollX, y: a.top + window.scrollY,
        w: Math.max(a.width, b.width), h: (b.bottom - a.top), rank: '${m.rank}' });
    })()`));
    if (!box) { console.log('  跳过 ' + m.rank + '：找不到报告元素'); continue; }
    const r = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 12), width: box.w + 24, height: Math.min(box.h + 24, 1500), scale: 2 }
    });
    const f = path.join(OUT, 'level-' + m.rank.replace('+', 'p') + '.png');
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    console.log('  ' + path.basename(f) + '  ' + Math.round(box.w) + '×' + Math.round(box.h) + ' CSS px');
  }

  // 回到第一个档案，方便直接录屏
  await evalJs(`(function(){var A=window.__APP__;A.switchProfile(${JSON.stringify(list2[0].id)});A.go('report');A.render();return 1;})()`);
  ws.close(); chrome.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
} catch (e) {
  console.error('ERR ' + e.message);
  try { ws && ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  process.exit(1);
}
