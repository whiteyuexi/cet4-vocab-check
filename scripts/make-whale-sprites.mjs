// scripts/make-whale-sprites.mjs — 把 MIT 立绘压成可内联的尺寸
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8787';
const STATES = ['idle-cute', 'greet', 'celebrate', 'failure', 'curious', 'angry', 'levelup', 'eat'];
const PORT = 9300 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'spr-'));
const chrome = spawn(CH, ['--headless=new', '--no-first-run', '--user-data-dir=' + profile,
  '--remote-debugging-port=' + PORT, '--window-size=600,600', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const tab = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const n = ++id; pend.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(2500);
  console.log('页面 origin: ' + await ev('location.origin'));

  const out = {};
  for (const st of STATES) {
    const url = BASE + '/assets/whale-art/dsh-whale-state-' + st + '.webp';
    const js = '(async()=>{try{' +
      'const r=await fetch(' + JSON.stringify(url) + ');if(!r.ok)return "HTTP "+r.status;' +
      'const b=await r.blob();const bmp=await createImageBitmap(b);' +
      'const c=document.createElement("canvas");c.width=256;c.height=256;' +
      'const x=c.getContext("2d");x.imageSmoothingQuality="high";' +
      'x.drawImage(bmp,0,0,256,256);return c.toDataURL("image/webp",0.82);' +
      '}catch(e){return "ERR:"+e.message}})()';
    const d = await ev(js);
    if (typeof d === 'string' && d.indexOf('data:image') === 0) {
      out[st] = d; console.log('  ' + st.padEnd(12) + Math.round(d.length / 1024) + ' KB');
    } else console.log('  失败 ' + st + '  ' + String(d).slice(0, 90));
  }
  fs.writeFileSync('_sprites.json', JSON.stringify(out));
  const total = Object.values(out).reduce((a, v) => a + v.length, 0);
  console.log('合计 ' + (total / 1024).toFixed(0) + ' KB / ' + Object.keys(out).length + ' 个状态');
  ws.close(); chrome.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
} catch (e) { console.error('ERR ' + e.message); try { ws && ws.close(); } catch {} try { chrome.kill(); } catch {} process.exit(1); }
