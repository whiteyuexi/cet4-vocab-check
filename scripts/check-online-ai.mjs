// scripts/check-online-ai.mjs — 验证「连上后端」时 AI 诊断这条主路径没被离线降级改坏
//
// 为什么需要：为了让单文件（评委自己的电脑）不出现死胡同，AI 面板加了离线本地诊断。
// 那条路径一改，就会有人担心"联网版是不是也被绕过了"。这个脚本专门盯联网版：
// 后端要在跑（node server/index.mjs，默认 127.0.0.1:8787），断言模式标记是「在线」、
// 回答是流式返回的、能出工具调用与依据面板，并留一张截图。
//
// 用法：node scripts/check-online-ai.mjs [基础地址]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const OUT = path.join(ROOT, 'shots');

const health = await (await fetch(BASE + '/api/health').catch(() => null))?.json?.().catch(() => null);
if (!health || !health.ok) {
  console.error('后端没在跑或不可用：' + BASE + '（先执行 node server/index.mjs）');
  process.exit(1);
}
console.log('后端:', health.provider + '/' + health.model, '语料', health.corpus.words, '词 /', health.corpus.sentences, '句');

const PORT = 9633 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'onlineai-'));
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
  for (let i = 0; i < 120; i++) {
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
  await send('Page.navigate', { url: BASE + '/' });
  await evalJs('new Promise(function(r){ if(document.readyState==="complete") r(1); else addEventListener("load",function(){r(1)}); })');
  await sleep(1200);

  // 先答几题，让诊断有数据可用
  await evalJs(`document.querySelector('[data-kind=probe]').click()`);
  for (let i = 0; i < 8; i++) {
    await evalJs(`(function(){var b=document.querySelectorAll('.jbtn');if(b[0])b[0].click();return 1})()`);
    await sleep(120);
    await evalJs(`(function(){var n=document.querySelector('[data-act=next]');if(n)n.click();return 1})()`);
    await sleep(120);
  }

  await evalJs(`window.__APP__.openAIDialog('我这几次测下来最该补哪一段？给个具体方案')`);
  // 等流式回答结束：正文不再变长就算完
  let last = '', stable = 0;
  for (let i = 0; i < 90; i++) {
    await sleep(400);
    const now = await evalJs(`(document.getElementById('aiLog')||{}).innerText||''`);
    if (now.length > 120 && now === last) { stable++; if (stable >= 2) break; } else stable = 0;
    last = now;
  }
  const st = JSON.parse(await evalJs(`JSON.stringify({
    pill: (document.getElementById('aiMode')||{}).textContent||'',
    log: (document.getElementById('aiLog')||{}).innerText||'',
    tools: document.querySelectorAll('.ai-tool, .ai-tools *').length,
    evidence: document.querySelectorAll('.ai-ev, .ai-evidence *').length,
    err: !!document.querySelector('.ai-err'),
    offline: /离线规则诊断/.test((document.getElementById('aiLog')||{}).innerText||'')
  })`));

  ok('模式标记是「在线」（没有误走离线分支）', /在线|模型：/.test(st.pill), st.pill);
  ok('回答是模型生成的（不是离线规则文本）', st.offline === false);
  ok('回答有实质内容', st.log.length > 150, st.log.length + ' 字');
  ok('没有报错块', st.err === false);
  ok('带工具调用/依据面板', st.tools > 0 || st.evidence > 0, 'tool=' + st.tools + ' ev=' + st.evidence);

  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, '_ai_online.png');
  fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
  console.log('截图:', f);
  console.log('');
  console.log(st.log.replace(/\s+/g, ' ').slice(0, 220) + '…');
  console.log('');
  console.log(fails === 0 ? '联网 AI 路径正常' : '联网 AI 路径失败 ' + fails + ' 项');
  cleanup(fails === 0 ? 0 : 1);
} catch (e) {
  console.error('失败:', e.message);
  cleanup(1);
}
