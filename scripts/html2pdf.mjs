// scripts/html2pdf.mjs — 把桌面报告目录里的技术文档打成 PDF，并打印页数
//
// 为什么需要它：技术文档是 HTML 交付的，但大赛要求 ≤30 页的 PDF。
// 每次改文档都得重打一遍并确认没超页，手动点"打印"既慢又容易忘记检查页数。
// 用法：node scripts/html2pdf.mjs <input.html> <output.pdf>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('用法: node scripts/html2pdf.mjs <input.html> <output.pdf>');
  process.exit(1);
}
const src = path.resolve(input);
const dst = path.resolve(output);
const url = 'file:///' + src.replace(/\\/g, '/');

const PORT = 9633 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'h2p-'));
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
  const targets = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  const page = targets.find(t => t.type === 'page');
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
  await send('Page.navigate', { url });
  // 等字体与内联图片都就位，否则会打出一页空白或方块字
  for (let i = 0; i < 120; i++) {
    await sleep(200);
    const r = await send('Runtime.evaluate', {
      expression: 'document.readyState === "complete" && document.fonts.status === "loaded"',
      returnByValue: true,
    }).catch(() => ({ result: { value: false } }));
    if (r.result && r.result.value) break;
  }
  await sleep(600);

  const pdf = await send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  });
  const buf = Buffer.from(pdf.data, 'base64');
  fs.writeFileSync(dst, buf);

  // 页数：直接数 PDF 里的 /Type /Page（技术文档不用压缩对象流，够准且零依赖）
  const raw = buf.toString('latin1');
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`PDF: ${dst}`);
  console.log(`大小: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`页数: ${pages}`);
  cleanup(pages > 30 ? 2 : 0);
} catch (e) {
  console.error('失败:', e.message);
  cleanup(1);
}
