// scripts/make-pet-art-inline.mjs — 把桌宠要用的情绪立绘压小，生成可内联的 data URI 表
//
// 为什么要这一步：单文件交付的 index.html 旁边没有 assets/ 目录，
// 而构建时只内联了「待机」一张，于是换表情的代码一直在跑、图却永远加载失败，
// 用户看到的就是"脸一点没变，只有整张图在转"。
//
// 为什么用 Chrome 编码：项目零依赖（连 node_modules 都没有），
// 但 Chrome 自带 WebP 解码与 canvas.toDataURL('image/webp', q) 编码，
// 已经有一套 CDP 工具了，就复用它，不额外装 sharp。
//
// 用法：node scripts/make-pet-art-inline.mjs [边长] [质量]
// 产物：assets/whale-art/_inline.json   { "angry": "data:image/webp;base64,...", ... }
//      （assets/ 整个目录已 gitignore；构建时读不到就退回只内联待机图）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const ART = path.join(ROOT, 'assets', 'whale-art');
const SIZE = +(process.argv[2] || 320);
const Q = +(process.argv[3] || 0.62);

// 桌宠真正会用到的情绪/动作，和 src/app.part5.js 里的 MOOD_ART / POKE_ART / STRUGGLE_ART 对齐
const WANT = ['idle-cute', 'celebrate', 'levelup', 'blush', 'curious',
              'meme-doubt', 'meme-cry', 'achievement', 'greet', 'angry'];

const PORT = 9433 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'art-'));
const chrome = spawn(CH, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank',
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
  await send('Runtime.enable');

  // 在页面里解码 → 缩到 SIZE 见方 → 重新编码成 webp。
  // 保留透明通道（立绘是抠好的透明背景，丢了会变成黑底方块）。
  const ENCODE = `(function(src, size, q){
    return new Promise(function(res, rej){
      var img = new Image();
      img.onload = function(){
        var c = document.createElement('canvas');
        c.width = size; c.height = size;
        var g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, size, size);
        res({ url: c.toDataURL('image/webp', q) });
      };
      img.onerror = function(){ rej(new Error('decode failed')); };
      img.src = src;
    });
  })`;

  const out = {};
  let raw = 0, enc = 0;
  for (const name of WANT) {
    const file = path.join(ART, 'dsh-whale-state-' + name + '.webp');
    if (!fs.existsSync(file)) { console.log('跳过（本地没有）:', name); continue; }
    const buf = fs.readFileSync(file);
    const dataURI = 'data:image/webp;base64,' + buf.toString('base64');
    const r = await send('Runtime.evaluate', {
      expression: `${ENCODE}(${JSON.stringify(dataURI)}, ${SIZE}, ${Q})`,
      awaitPromise: true, returnByValue: true,
    });
    const url = r.result && r.result.value && r.result.value.url;
    if (!url || !url.startsWith('data:image/webp')) throw new Error('编码失败: ' + name);
    out[name] = url;
    raw += buf.length;
    enc += url.length;
    console.log(`${name.padEnd(14)} ${(buf.length / 1024).toFixed(0).padStart(4)} KB -> ${(url.length / 1024).toFixed(0).padStart(4)} KB (base64)`);
  }

  fs.writeFileSync(path.join(ART, '_inline.json'), JSON.stringify(out));
  console.log('---');
  console.log(`原图合计 ${(raw / 1024 / 1024).toFixed(2)} MB -> 内联合计 ${(enc / 1024).toFixed(0)} KB`);
  console.log('已写入 assets/whale-art/_inline.json（%d 张）', Object.keys(out).length);
  cleanup(0);
} catch (e) {
  console.error('失败:', e.message);
  cleanup(1);
}
