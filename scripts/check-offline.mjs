// scripts/check-offline.mjs — 用"旁边没有 assets 目录"的单文件验证离线交付
//
// 为什么必须有这一步：桌宠的表情立绘一度只在联网时可用，单文件里换表情的代码照跑、
// 图全部加载失败，静默回退成待机图。功能测试全绿也发现不了——它只测"代码有没有执行"。
// 这里直接拿桌面上的那份 HTML（孤立文件）打开，检查：
//   1) 立绘是从 data: URI 来的（不依赖外部文件）
//   2) 抓起后真的换成了挣扎表情
//   3) 摆动角不是 0（弹簧在跑）
//
// 用法：node scripts/check-offline.mjs [路径]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const target = path.resolve(process.argv[2] || path.join(ROOT, 'index.html'));
if (!fs.existsSync(target)) { console.error('找不到文件:', target); process.exit(1); }

const PORT = 9533 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-'));
const chrome = spawn(CH, [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT,
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
function cleanup(code) { try { chrome.kill(); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }

let ws, seq = 0, fails = 0;
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
function ok(name, cond, detail) {
  if (!cond) fails++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined && detail !== '' ? '   [' + detail + ']' : ''));
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
  await send('Page.navigate', { url: 'file:///' + target.replace(/\\/g, '/') });
  await evalJs('new Promise(function(r){ if(document.readyState==="complete") r(1); else addEventListener("load",function(){r(1)}); })');
  // 跳过入场页：这些脚本要直接操作主界面（入场页本身由 scripts/check-intro.mjs 验收）
  await evalJs("window.__APP__ && window.__APP__.enterApp && window.__APP__.enterApp(true)");
  await sleep(160);
  await sleep(1200);

  console.log('被测文件:', target, '(' + (fs.statSync(target).size / 1024).toFixed(0) + ' KB)');
  ok('立绘已内联（不依赖旁边的 assets 目录）',
    await evalJs('(function(){var i=document.querySelector("#petAnim img");return !!i && i.src.indexOf("data:image/webp")===0;})()') === true);

  // 抓起：换表情 + 弹簧启动
  await evalJs(`(function(){
    var f=document.getElementById('petFig'); var r=f.getBoundingClientRect();
    var cx=Math.round(r.x+r.width/2), cy=Math.round(r.y+r.height/2);
    function pe(t,x,y,b,tg){(tg||window).dispatchEvent(new PointerEvent(t,{clientX:x,clientY:y,
      buttons:b,pointerId:1,bubbles:true,cancelable:true,pointerType:'mouse'}));}
    pe('pointerdown',cx,cy,1,f);
    for(var i=1;i<=8;i++) pe('pointermove',cx-i*26,cy-i*9,1,window);
    return 1;})()`);
  await sleep(320);
  const held = JSON.parse(await evalJs('JSON.stringify(window.__APP__.petInfo())'));
  ok('抓起后换成挣扎表情', /^(angry|meme-doubt)$/.test(held.sprite), held.sprite);
  ok('悬空弹簧在跑（摆角 ≠ 0）', Math.abs(held.swing) > 1.5, held.swing + 'deg');
  ok('身体落后于抓点', Math.abs(held.hangX) > 2, 'hangX=' + held.hangX);
  ok('影子留在地面（离地后不再贴脚）',
    await evalJs('(function(){var s=document.getElementById("petShadow");return parseFloat(s.style.getPropertyValue("--shy"))>10;})()') === true,
    await evalJs('document.getElementById("petShadow").style.getPropertyValue("--shy")'));

  await evalJs(`(function(){window.dispatchEvent(new PointerEvent('pointerup',{clientX:5,clientY:5,buttons:0,pointerId:1,bubbles:true}));return 1;})()`);
  await sleep(2000);
  const after = JSON.parse(await evalJs('JSON.stringify(window.__APP__.petInfo())'));
  ok('松手后落回地面', Math.abs(after.y - after.floor) < 4, 'y=' + after.y + ' floor=' + after.floor);
  ok('落地后摆角归零', Math.abs(after.swing) < 3, after.swing + 'deg');

  console.log(fails === 0 ? '\n离线交付检查通过' : '\n离线交付检查失败 ' + fails + ' 项');
  cleanup(fails === 0 ? 0 : 1);
} catch (e) {
  console.error('失败:', e.message);
  cleanup(1);
}
