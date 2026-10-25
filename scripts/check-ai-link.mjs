// scripts/check-ai-link.mjs — AI ↔ 可视化 双向联动的验收
//
// 验的是"两张皮有没有合成一张"：
//   反向：图表上点「问」/ Shift+点格子 → 对话框带着那一格的真实数字开场
//   正向：回答末尾给出可点击动作 → 真的点了会执行（不是装饰按钮）
// 这条链路在**没有后端**时也必须成立（离线规则诊断同样给动作），所以本脚本不需要起服务。
//
// 用法：node scripts/check-ai-link.mjs [页面]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'index.html'));
const PORT = 9700 + Math.floor(Math.random() * 120);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ailink-'));
const chrome = spawn(CH, ['--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 等 AI 回答稳定。离线规则诊断是瞬时返回，走后端时是流式——
   固定 sleep 只能在其中一种形态下正确，所以统一轮询"最后一条机器人消息不再变长"。 */
async function waitAnswer(evalJs, maxRounds = 50) {
  let prev = '', stable = 0;
  for (let i = 0; i < maxRounds; i++) {
    await sleep(400);
    const cur = await evalJs(`(function(){
      var b = document.querySelectorAll('#aiLog .ai-msg.bot');
      var e = b[b.length - 1];
      return e ? e.innerText : '';
    })()`);
    const acts = await evalJs(`document.querySelectorAll('.ai-act').length`);
    if (cur.length > 60 && cur === prev && acts >= 0) { stable++; if (stable >= 2) return cur; } else stable = 0;
    prev = cur;
  }
  return prev;
}
let ws, seq = 0, fails = 0;
const pending = new Map();
function send(m, p = {}) { const id = ++seq; ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise((res, rej) => pending.set(id, { res, rej })); }
const evalJs = async e => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.result?.value ?? r.result?.value;
};
function ok(name, cond, detail) {
  if (!cond) fails++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined && detail !== '' ? '   [' + detail + ']' : ''));
}
function cleanup(code) {
  try { chrome.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + SRC.replace(/\\/g, '/') });
  await evalJs('new Promise(function(r){ if(document.readyState==="complete") r(1); else addEventListener("load",function(){r(1)}); })');
  await sleep(1200);
  await evalJs('window.__APP__.enterApp && window.__APP__.enterApp(true)');
  await sleep(400);

  /* 造一点数据，让频段条与地图都有内容（否则没有可问的东西） */
  await evalJs(`(function(){
    var A = window.__APP__, pool = A.activePool();
    for (var i = 0; i < 400; i++) {
      var v = i % 5 === 0 ? 0 : i % 3 === 0 ? 1 : 2;   // 认识/模糊/不认识都有
      A.setSt(pool[i], v);
    }
    A.save(); A.go('stats'); A.render();
    return 1;
  })()`);
  await sleep(600);

  /* ---------- 1. 反向联动：频段条的「问」 ---------- */
  const bandBtn = await evalJs(`(function(){
    var b = document.querySelector('[data-act=ai-band]');
    return b ? b.getAttribute('data-band') : null;
  })()`);
  ok('频段条上有「问 AI」按钮', bandBtn !== null, 'data-band=' + bandBtn);
  await evalJs(`document.querySelector('[data-act=ai-band]').click()`);
  await waitAnswer(evalJs);
  const bandDlg = JSON.parse(await evalJs(`JSON.stringify((function(){
    var log = document.getElementById('aiLog');
    return { open: !!document.getElementById('aiLog'),
             q: log ? log.innerText.split('\\n')[0] : '',
             hasActs: !!document.querySelector('.ai-act') };
  })())`));
  ok('点「问」能带着该段数据开场（问题里含界面数字）',
    bandDlg.open && /界面显示/.test(bandDlg.q) && /掌握率|抽到/.test(bandDlg.q), bandDlg.q.slice(0, 56));
  ok('离线诊断也会给可点击的下一步', bandDlg.hasActs === true);

  /* ---------- 2. 正向联动：点动作按钮真的执行 ---------- */
  const acts = JSON.parse(await evalJs(`JSON.stringify(Array.prototype.map.call(
    document.querySelectorAll('.ai-act'), function(b){ return b.textContent.trim(); }))`));
  ok('动作按钮有文字且不超过 4 个', acts.length >= 1 && acts.length <= 4, acts.join(' / '));
  const before = await evalJs(`window.__APP__.getRoute()`);
  // 找"开一轮摸底"这个动作（act=start），点它应当关闭对话框并进入答题
  const started = await evalJs(`(function(){
    var list = Array.prototype.slice.call(document.querySelectorAll('.ai-act'));
    for (var i = 0; i < list.length; i++) {
      var t = list[i].textContent;
      if (/测一轮|摸底|开一轮/.test(t)) { list[i].click(); return t; }
    }
    if (list[0]) { list[0].click(); return list[0].textContent; }
    return '';
  })()`);
  await sleep(800);
  const after = JSON.parse(await evalJs(`JSON.stringify((function(){
    var A = window.__APP__;
    return { route: A.getRoute(), hasSession: !!(A.S && A.S.session),
             dialogOpen: !!document.getElementById('aiLog') };
  })())`));
  ok('点动作按钮后对话框关闭并真的执行了', after.dialogOpen === false &&
    (after.hasSession === true || after.route !== before),
    '点击「' + started + '」→ route=' + before + '→' + after.route + ' session=' + after.hasSession);

  /* ---------- 3. 反向联动：Shift + 点地图格子 ---------- */
  await evalJs(`(function(){ if (window.__APP__.S.session) { window.__APP__.S.session = null; } window.__APP__.go('stats'); window.__APP__.render(); return 1; })()`);
  await sleep(500);
  const cellInfo = JSON.parse(await evalJs(`JSON.stringify((function(){
    var c = document.querySelector('.vmap-c[data-act=map-review]');
    if (!c) return { none: true };
    var r = c.getBoundingClientRect();
    var d = document.createEvent('MouseEvents');
    d.initMouseEvent('click', true, true, window, 0, 0, 0,
      Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2),
      false, false, true, false, 0, null);      // shiftKey = true
    c.dispatchEvent(d);
    return { band: c.getAttribute('data-band'), letter: c.getAttribute('data-letter') };
  })())`));
  await waitAnswer(evalJs);
  const cellDlg = JSON.parse(await evalJs(`JSON.stringify((function(){
    var log = document.getElementById('aiLog');
    return { open: !!log, q: log ? log.innerText.split('\\n')[0] : '',
             hasActs: !!document.querySelector('.ai-act') };
  })())`));
  ok('Shift+点格子会带着这一格去问 AI',
    cellDlg.open && /首字母/.test(cellDlg.q) && /界面显示/.test(cellDlg.q),
    cellDlg.q.slice(0, 64));
  ok('格子的上下文里有真实数字', /共 \d+ 词/.test(cellDlg.q) && /缺口|没测/.test(cellDlg.q), cellDlg.q.slice(0, 64));

  /* ---------- 4. 反向联动：整张地图 ---------- */
  await evalJs(`(function(){ var b=document.querySelector('[data-act=modal-close]'); if(b)b.click(); return 1; })()`);
  await sleep(300);
  await evalJs(`document.querySelector('[data-act=ai-map]').click()`);
  await waitAnswer(evalJs);
  const mapDlg = JSON.parse(await evalJs(`JSON.stringify((function(){
    var log = document.getElementById('aiLog');
    return { q: log ? log.innerText.split('\\n')[0] : '',
             hasActs: !!document.querySelector('.ai-act') };
  })())`));
  ok('地图工具条能带着"缺口最大的几块"去问 AI',
    /词汇地图/.test(mapDlg.q) && /缺口|没测/.test(mapDlg.q), mapDlg.q.slice(0, 64));

  /* ---------- 5. 动作白名单：非法动作必须被丢掉，参数必须被规整 ----------
     这一段不是走 UI，而是直接打安全边界（A._normAction）。
     为什么值得单独测：动作按钮会真的驱动前端（跳页、开一轮检测），
     模型给出的字符串是"不可信输入"，必须当成注入面来对待。 */
  const norm = JSON.parse(await evalJs(`JSON.stringify((function(){
    var n = window.__APP__._normAction;
    if (!n) return { missing: true };
    return {
      evilAct: n({ act: 'eval', label: '删库' }),
      badRoute: n({ act: 'go', label: '去外站', route: 'https://evil.example' }),
      goodRoute: n({ act: 'go', label: '看剖面', route: 'stats' }),
      badBand: n({ act: 'review', band: 99, label: '越界' }),
      goodBand: n({ act: 'review', band: 1, letter: 'a', label: '复测' }),
      clampTarget: n({ act: 'start', target: 999, label: '乱写' }),
      longLabel: n({ act: 'go', route: 'home', label: '这是一个特别特别特别特别特别长的按钮文字' }),
      noLabel: n({ act: 'go', route: 'home' })
    };
  })())`));
  ok('非法 act 被拒绝', norm.missing !== true && norm.evilAct === null, JSON.stringify(norm.evilAct));
  ok('非白名单路由被拒绝、合法路由被保留',
    norm.badRoute === null && !!norm.goodRoute && norm.goodRoute.route === 'stats');
  ok('越界频段被拒绝、合法频段被保留',
    norm.badBand === null && !!norm.goodBand && norm.goodBand.band === 1);
  ok('越界 target 被规整到合法值', !!norm.clampTarget && norm.clampTarget.target === 250,
    JSON.stringify(norm.clampTarget));
  ok('超长文字被截断', !!norm.longLabel && norm.longLabel.label.length <= 26,
    norm.longLabel ? norm.longLabel.label.length + ' 字' : 'null');
  ok('没有文字的动作为被拒绝', norm.noLabel === null);

  console.log('\n' + (fails === 0 ? 'AI↔可视化 联动验收通过' : 'AI↔可视化 联动验收失败 ' + fails + ' 项'));
  cleanup(fails === 0 ? 0 : 1);
} catch (e) {
  console.error('失败:', e.message);
  cleanup(1);
}
