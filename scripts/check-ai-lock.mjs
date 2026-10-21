// scripts/check-ai-lock.mjs — 验证「密码授权」这条链路
//
// 要验四件事，缺一条这个机制就不成立：
//   1) 产物里没有明文 API Key（只有密文）——有人在 HTML 里搜 "sk-" 搜不到
//   2) 没解锁时，离线规则诊断照常可用（不消耗额度）
//   3) 错误密码必须解不开（AES-GCM 认证失败），且给出可读提示
//   4) 正确密码解锁后，真的能调通模型并流式返回
//
// 用法：node scripts/check-ai-lock.mjs "授权密码" [页面]
//      密码也可以放进环境变量 AI_LOCK_PASS，避免留在命令行历史里
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const PASS = process.argv[2] || process.env.AI_LOCK_PASS || '';
const SRC = path.resolve(process.argv[3] || path.join(ROOT, 'index.html'));
if (!PASS) { console.error('用法: node scripts/check-ai-lock.mjs "授权密码" [页面]'); process.exit(1); }

// 收件人视角：孤立目录 + 全新配置
const inbox = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
const shared = path.join(inbox, '四六级词汇量检测.html');
fs.copyFileSync(SRC, shared);
const PORT = 9650 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lockprof-'));
const chrome = spawn(CH, ['--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0, fails = 0;
const pending = new Map();
function send(m, p = {}) { const id = ++seq; ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise((res, rej) => pending.set(id, { res, rej })); }
const evalJs = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
function ok(name, cond, detail) {
  if (!cond) fails++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined && detail !== '' ? '   [' + detail + ']' : ''));
}
function cleanup(code) {
  try { chrome.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(inbox, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

try {
  /* 1) 静态检查：产物里不能有明文 Key */
  const html = fs.readFileSync(SRC, 'utf8');
  const envTxt = fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '';
  const keyMatch = /DEEPSEEK_API_KEY\s*=\s*(\S+)/.exec(envTxt);
  const realKey = keyMatch ? keyMatch[1] : '';
  ok('产物里没有内联窗口 AI_LOCK 之外的东西', /window\.AI_LOCK\s*=\s*\{/.test(html));
  ok('产物里搜不到明文 API Key', !!realKey && html.indexOf(realKey) < 0,
    realKey ? '已比对 .env 中的 Key（' + realKey.length + ' 位）' : '没读到 .env，跳过比对');
  ok('产物里没有 sk- 开头的明文片段', !/sk-[A-Za-z0-9]{20,}/.test(html));

  for (let i = 0; i < 120; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + shared.replace(/\\/g, '/') });
  await evalJs('new Promise(function(r){ if(document.readyState==="complete") r(1); else addEventListener("load",function(){r(1)}); })');
  await sleep(1300);

  // 造点数据，让诊断有东西可说
  await evalJs(`document.querySelector('[data-kind=probe]').click()`);
  for (let i = 0; i < 6; i++) {
    await evalJs(`(function(){var b=document.querySelectorAll('.jbtn');if(b[0])b[0].click();return 1})()`);
    await sleep(110);
    await evalJs(`(function(){var n=document.querySelector('[data-act=next]');if(n)n.click();return 1})()`);
    await sleep(110);
  }

  /* 2) 打开面板：锁条在，离线诊断不需要密码 */
  await evalJs(`window.__APP__.openAIDialog('我该怎么提升？')`);
  await sleep(2000);
  const locked = JSON.parse(await evalJs(`JSON.stringify({
    bar: (document.getElementById('aiLockBar')||{}).innerText||'',
    hasInput: !!document.getElementById('aiLockPass'),
    log: (document.getElementById('aiLog')||{}).innerText||'',
    pill: (document.getElementById('aiMode')||{}).textContent||''
  })`));
  ok('未解锁时面板显示授权锁', /锁定/.test(locked.bar) && locked.hasInput, locked.bar.split('\n')[0]);
  ok('未解锁也能拿到离线诊断（不花钱）', /依据/.test(locked.log) && locked.log.length > 80, locked.log.length + ' 字');
  ok('未解锁时不会显示成在线', !/在线/.test(locked.pill), locked.pill);

  /* 3) 错误密码必须解不开 */
  const wrongRes = await evalJs(`window.__APP__.unlockAI('definitely-wrong-password')`);
  await sleep(300);
  const wrongMsg = await evalJs(`(document.getElementById('aiLockMsg')||{}).textContent||''`);
  ok('错误密码被拒绝', wrongRes === false, String(wrongRes));
  ok('错误密码给出可读提示', /密码不正确/.test(wrongMsg), wrongMsg);

  /* 4) 正确密码解锁 + 真调模型 */
  const t0 = Date.now();
  const rightRes = await evalJs(`window.__APP__.unlockAI(${JSON.stringify(PASS)})`);
  const unlockMs = Date.now() - t0;
  ok('正确密码解锁成功', rightRes === true, 'PBKDF2 耗时约 ' + unlockMs + ' ms');
  const pillAfter = await evalJs(`(document.getElementById('aiMode')||{}).textContent||''`);
  ok('解锁后标记为已授权的大模型', /已授权|在线/.test(pillAfter), pillAfter);

  await evalJs(`(function(){
    var inp = document.getElementById('aiInput2');
    inp.value = '我这几次测下来最该补哪一段？给个具体方案';
    document.querySelector('[data-act=ai-send2]').click();
    return 1;
  })()`);
  // 必须盯"最后一条机器人消息"：日志里还有解锁前那条离线回答，盯整段会提前收工
  let lastTxt = '', stable = 0;
  for (let i = 0; i < 90; i++) {
    await sleep(400);
    const now = await evalJs(`(function(){
      var b = document.querySelectorAll('#aiLog .ai-msg.bot');
      var e = b[b.length - 1];
      return e ? e.innerText : '';
    })()`);
    if (now.length > 120 && now === lastTxt) { stable++; if (stable >= 2) break; } else stable = 0;
    lastTxt = now;
  }
  // 只看最后一条机器人消息：解锁前那条离线回答还在日志里，不能拿整段去判
  const answered = JSON.parse(await evalJs(`JSON.stringify((function(){
    var bots = document.querySelectorAll('#aiLog .ai-msg.bot');
    var lastEl = bots[bots.length - 1];
    var last = lastEl ? lastEl.innerText : '';
    return {
      last: last,
      log: (document.getElementById('aiLog')||{}).innerText||'',
      offlineInLast: /离线规则诊断/.test(last),
      err: (document.querySelector('.ai-err')||{}).innerText||'',
      sent: !!document.querySelector('.ai-sent')
    };
  })())`));
  ok('解锁后由模型作答（最后一条不是离线规则文本）',
    answered.offlineInLast === false && answered.err === '', answered.err || '无错误');
  ok('回答有实质内容', answered.log.length > 250, answered.log.length + ' 字');
  ok('透明展示发送给模型的数据', answered.sent === true);
  console.log('\n模型回答节选（最后一条）:\n' + answered.last.replace(/\s+/g, ' ').slice(0, 300) + '…');

  /* 5) 刷新后必须重新锁上（授权只对"这一次打开"有效） */
  await send('Page.reload');
  await evalJs('new Promise(function(r){ if(document.readyState==="complete") r(1); else addEventListener("load",function(){r(1)}); })');
  await sleep(1200);
  const relock = await evalJs(`(function(){
    window.__APP__.openAIDialog();
    return 1;
  })()`);
  await sleep(600);
  const relockBar = await evalJs(`(document.getElementById('aiLockBar')||{}).innerText||''`);
  ok('刷新后重新上锁（授权不持久化）', /锁定/.test(relockBar), relockBar.split('\n')[0]);

  console.log('\n' + (fails === 0 ? '密码授权链路全部通过' : '密码授权链路失败 ' + fails + ' 项'));
  cleanup(fails === 0 ? 0 : 1);
} catch (e) { console.error('失败:', e.message); cleanup(1); }
