// scripts/check-recipient.mjs — 模拟"别人收到这个 HTML 之后能不能用"
//
// 为什么要这个脚本：用户会把这个文件发给同学/评委，对方的环境和我们完全不同——
// 没有 assets 目录、没有本地后端、可能没装语音引擎、可能用手机打开。
// 功能测试是在我们自己的环境里跑的，证明不了对方的体验。这里刻意构造最苛刻的收件环境：
//   1) 只拷 index.html 到一个空目录（没有 assets/、没有 data/、没有 server/）
//   2) 全新 Chrome 配置（没有 localStorage、没有缓存）
//   3) Network.setBlockedURLs 屏蔽全部 http/https（等价于"没有本地后端、断网"）
//   4) 分别用桌面 1440×900 和手机 390×844 两种视口
// 检查"能用的部分真的能用"，并如实记录"降级的部分降级成什么样"。
//
// 用法：node scripts/check-recipient.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');

// 收件人拿到的目录：只有一个 HTML
const inbox = fs.mkdtempSync(path.join(os.tmpdir(), 'recipient-'));
const shared = path.join(inbox, '词汇账户余额查询.html');
fs.copyFileSync(path.join(ROOT, 'index.html'), shared);
const url = 'file:///' + shared.replace(/\\/g, '/');

const PORT = 9833 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'recipientprof-'));
const chrome = spawn(CH, [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
chrome.on('error', e => console.error('spawn 失败:', e.message));
chrome.on('exit', (code, sig) => { if (code !== 0 && code !== null) console.error('chrome 退出 code=', code, sig); });
console.log('调试端口:', PORT);
function cleanup(code) {
  try { chrome.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(inbox, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

let ws, seq = 0, fails = 0;
const pending = new Map();
const consoleErrors = [];
const blocked = new Set();
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
const evalJs = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result && r.result.value;
};
function ok(name, cond, detail) {
  if (!cond) fails++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined && detail !== '' ? '   [' + detail + ']' : ''));
}
function note(text) { console.log('       ' + text); }

try {
  // 这台机器上 Chrome 冷启动偶尔要十几秒，别用固定短等待，边等边看进程是否已经退出
  let up = false, lastErr = '';
  for (let i = 0; i < 160; i++) {
    try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) { up = true; break; } }
    catch (e) { lastErr = e.message; }
    if (chrome.exitCode !== null) throw new Error('Chrome 提前退出，code=' + chrome.exitCode);
    await sleep(150);
  }
  if (!up) throw new Error('调试端口 ' + PORT + ' 没起来（最后一次错误: ' + lastErr + '）');
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  const page = list.find(t => t.type === 'page');
  if (!page) throw new Error('没有可用的页面目标');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push('console.error: ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    }
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      if (/^https?:/.test(u)) blocked.add(u);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  // 等价于"这台机器上没有本地后端、也没有外网"
  await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });

  console.log('收件环境:', inbox);
  console.log('被测文件: 词汇账户余额查询.html (' + (fs.statSync(shared).size / 1024 / 1024).toFixed(2) + ' MB)');
  console.log('网络: 已屏蔽全部 http/https\n');

  /* ---------- 桌面视口 ---------- */
  await send('Page.navigate', { url });
  await evalJs('new Promise(function(r){ if(document.readyState==="complete") r(1); else addEventListener("load",function(){r(1)}); })');
  // 跳过入场页：这些脚本要直接操作主界面（入场页本身由 scripts/check-intro.mjs 验收）
  await evalJs("window.__APP__ && window.__APP__.enterApp && window.__APP__.enterApp(true)");
  await sleep(160);
  await sleep(1200);

  const boot = JSON.parse(await evalJs(`JSON.stringify({
    words: window.__APP__.WORDS.length,
    route: window.__APP__.getRoute(),
    hasPet: !!document.getElementById('petFig'),
    petArt: (function(){var i=document.querySelector('#petAnim img');
      return i ? i.src.slice(0, 22) : '';})(),
    local: (function(){try{localStorage.setItem('__p','1');var v=localStorage.getItem('__p')==='1';
      localStorage.removeItem('__p');return v;}catch(e){return false;}})(),
    voice: typeof speechSynthesis !== 'undefined',
    cta: document.querySelectorAll('.hero-cta button').length,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth
  })`));
  ok('打开就能用：词库已内嵌', boot.words > 5000, boot.words + ' 词');
  ok('file:// 下设 localStorage 可用（能记住进度）', boot.local === true);
  ok('桌宠立绘是内联的（不依赖同目录资源）', boot.petArt.indexOf('data:image/webp') === 0, boot.petArt);
  ok('首屏给出可点的开始按钮', boot.cta >= 2, boot.cta + ' 个');
  ok('桌面无横向溢出', boot.scrollW <= boot.clientW + 1, boot.scrollW + '/' + boot.clientW);

  // 走一遍真实作答流程
  await evalJs(`document.querySelector('[data-kind=probe]').click()`);
  await sleep(200);
  const first = await evalJs(`(document.querySelector('.qword')||{}).textContent||''`);
  ok('能进入答题', first.length > 0, first);
  for (let i = 0; i < 5; i++) {
    await evalJs(`(function(){var b=document.querySelectorAll('.jbtn');if(b[0])b[0].click();return 1})()`);
    await sleep(120);
    await evalJs(`(function(){var n=document.querySelector('[data-act=next]');if(n)n.click();return 1})()`);
    await sleep(120);
  }
  const prog = JSON.parse(await evalJs(`JSON.stringify({
    tested: window.__APP__.tally(window.__APP__.activePool()).tested,
    stored: (function(){try{return (localStorage.getItem('cet4vocab_v1')||'').length}catch(e){return -1}})()
  })`));
  ok('答题进度会算数并落盘', prog.tested >= 5 && prog.stored > 100, '已测 ' + prog.tested + ' 词，存储 ' + prog.stored + ' 字节');

  /* ---------- 断网时 AI 面板：必须是"给出结论"，不是"报错" ---------- */
  await evalJs(`window.__APP__.openAIDialog('帮我分析一下，我该怎么提升？')`);
  await sleep(2200);
  const aiNow = JSON.parse(await evalJs(`JSON.stringify({
    pill: (document.getElementById('aiMode') || {}).textContent || '',
    log: (document.getElementById('aiLog') || {}).innerText || '',
    hasErrClass: !!document.querySelector('.ai-err')
  })`));
  ok('断网时 AI 面板不报错、不白屏', !aiNow.hasErrClass && aiNow.log.length > 80,
    '正文 ' + aiNow.log.length + ' 字');
  ok('模式标记如实显示为离线', /离线/.test(aiNow.pill), aiNow.pill);
  ok('离线也能给出基于本机数据的结论', /依据/.test(aiNow.log) && /已测/.test(aiNow.log),
    aiNow.log.replace(/\s+/g, ' ').slice(0, 60) + '…');
  ok('结论里有可执行的下一步', /下一步|最该先动|计划|没测过/.test(aiNow.log));
  ok('不再出现"请执行 node server/index.mjs"这种开发者死胡同',
    !/无法连接后端服务/.test(aiNow.log));

  // 追问也要能用（离线走同一套本地规则）
  const followUp = await evalJs(`(function(){
    var inp = document.getElementById('aiInput2');
    if (!inp) return 'no-input';
    inp.value = '给我一个两周计划';
    var btn = document.querySelector('[data-act=ai-send2]');
    if (!btn) return 'no-btn';
    btn.click();
    return 'sent';
  })()`);
  await sleep(1200);
  const followLog = await evalJs(`(document.getElementById('aiLog')||{}).innerText||''`);
  ok('离线状态下还能继续追问', followUp === 'sent' && /两周|计划/.test(followLog),
    followUp + ' / 共 ' + followLog.length + ' 字');
  await evalJs(`(function(){var b=document.querySelector('[data-act=modal-close]');if(b)b.click();return 1})()`);
  await sleep(300);
  /* ---------- 换人用：新使用者档案 ---------- */
  const who = await evalJs(`(function(){
    var b = document.getElementById('whoBtn');
    if (!b) return 'no-whoBtn';
    b.click();
    return document.querySelectorAll('.who-row').length + '';
  })()`);
  ok('有使用者入口（同一台电脑换人也不串数据）', who !== 'no-whoBtn', who + ' 个档案');

  /* ---------- 刷新后进度还在 ---------- */
  await send('Page.reload');
  await sleep(1600);
  const afterReload = await evalJs(`window.__APP__.tally(window.__APP__.activePool()).tested`);
  ok('刷新/重开后进度还在', afterReload >= 5, '已测 ' + afterReload + ' 词');

  /* ---------- 手机视口 ---------- */
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await sleep(900);
  const mob = JSON.parse(await evalJs(`JSON.stringify({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    cta: (function(){var b=document.querySelector('.hero-cta button');if(!b)return null;
      var r=b.getBoundingClientRect();return {w:Math.round(r.width),right:Math.round(r.right)};})(),
    pet: getComputedStyle(document.getElementById('pet')).display
  })`));
  ok('手机宽度无横向溢出', mob.scrollW <= mob.clientW + 1, mob.scrollW + '/' + mob.clientW);
  ok('手机上主按钮可点且在屏内', !!mob.cta && mob.cta.w > 80 && mob.cta.right <= mob.clientW + 1,
    mob.cta ? mob.cta.w + 'px right=' + mob.cta.right : 'null');
  ok('窄屏自动收起桌宠（不挡内容）', mob.pet === 'none', mob.pet);

  /* ---------- 汇总 ---------- */
  console.log('');
  const realBlocked = [...blocked].filter(u => !/^https?:\/\/127\.0\.0\.1/.test(u));
  console.log('页面尝试过的外部请求:', realBlocked.length ? realBlocked.slice(0, 5).join('\n  ') : '无（除 AI 面板外没有联网需求）');
  console.log('页面未捕获异常:', consoleErrors.length ? consoleErrors.slice(0, 4).join('\n  ') : '无');
  console.log('');
  console.log(fails === 0 ? '收件人环境检查通过' : '收件人环境检查失败 ' + fails + ' 项');
  cleanup(fails === 0 ? 0 : 1);
} catch (e) {
  console.error('失败:', e.message);
  cleanup(1);
}
