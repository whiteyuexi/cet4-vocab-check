// scripts/check-ai-tiers.mjs — 三档通路与额度的验收
//
// 要验的是一套"谁付费、谁限次"的规则，而不是界面好不好看：
//   ① 本地方案：没有 Key、没有额度时仍然可用且不限次
//   ② 作者额度：完成一次有效检测才授予（含下限保护），用一次扣一次，用完自动回落
//   ③ 自带 Key：接上后不限次，且吃掉了作者额度的优先级
//   ④ 仓库版绝不含 Key（与 check-no-key.mjs 互补：这里验运行时，那里验文件）
//
// 用法：node scripts/check-ai-tiers.mjs [页面]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'index.html'));
const PORT = 9700 + Math.floor(Math.random() * 120);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tiers-'));
const chrome = spawn(CH, ['--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
  await sleep(300);

  /* ---------- ① 初始状态：本地方案 ---------- */
  const init = JSON.parse(await evalJs(`JSON.stringify({
    tier: window.__APP__.aiTier(), label: window.__APP__.aiTierLabel(),
    quota: window.__APP__.aiQuota(), hasAuthorKey: !!window.AI_AUTHOR_KEY
  })`));
  ok('仓库版没有内联作者 Key', init.hasAuthorKey === false);
  ok('没有 Key、没有额度时是「本地方案」', init.tier === 'local', init.label);
  ok('额度初始为 0', init.quota.granted === 0 && init.quota.left === 0, JSON.stringify(init.quota));

  /* ---------- ② 授予规则：下游下限保护 ---------- */
  const grant = JSON.parse(await evalJs(`JSON.stringify((function(){
    var A = window.__APP__;
    var out = {};
    // 只有 5 个词的小词书：覆盖率能到 100%，但不该给额度
    A.S.settings.bank = 'c4';
    var pool = A.activePool();
    for (var i = 0; i < 40; i++) A.setSt(pool[i], 2);        // 40 词 < 100 下限
    A.S.session = null;
    out.smallTest = A.maybeGrantAiQuota('round');
    out.afterSmall = A.aiQuota();
    // 测满 120 词，但覆盖率还很低（远不到 95%）→ 仍然不给
    for (var j = 40; j < 120; j++) A.setSt(pool[j], 2);
    out.lowCoverage = A.maybeGrantAiQuota('round');
    out.afterLow = A.aiQuota();
    // 手动授予一次，模拟"完成整库检测"
    A.grantAiQuota('测试');
    out.afterGrant = A.aiQuota();
    return out;
  })())`));
  ok('测过 <100 词不给额度（防小额刷额度）', grant.smallTest === false, JSON.stringify(grant.afterSmall));
  ok('覆盖率不足 95% 不给额度', grant.lowCoverage === false, JSON.stringify(grant.afterLow));
  ok('授予后额度 +1', grant.afterGrant.granted === 1 && grant.afterGrant.left === 1, JSON.stringify(grant.afterGrant));

  /* ---------- ② 消耗与回落 ---------- */
  const spend = JSON.parse(await evalJs(`JSON.stringify((function(){
    var A = window.__APP__;
    var out = {};
    out.first = A.spendAiQuota();          // 应该成功
    out.afterFirst = A.aiQuota();
    out.second = A.spendAiQuota();         // 没钱了，应该失败
    out.afterSecond = A.aiQuota();
    return out;
  })())`));
  ok('有额度时能扣一次', spend.first === true && spend.afterFirst.used === 1, JSON.stringify(spend.afterFirst));
  ok('额度用完不能再扣', spend.second === false && spend.afterSecond.left === 0, JSON.stringify(spend.afterSecond));

  /* ---------- ③ 自带 Key 优先 ---------- */
  const own = JSON.parse(await evalJs(`JSON.stringify((function(){
    var A = window.__APP__;
    var before = A.aiTier();
    A.setUserKey({ key: 'sk-userFAKE0000000000000000000000xyz', model: 'deepseek-chat' });
    var after = A.aiTier();
    var label = A.aiTierLabel();
    A.setUserKey(null);
    var cleared = A.aiTier();
    return { before: before, after: after, label: label, cleared: cleared };
  })())`));
  ok('接上自带 Key 后档位变成 user（不限次）', own.after === 'user' && /不限次/.test(own.label), own.label);
  ok('清除 Key 后回落', own.cleared === 'local' || own.cleared === 'author', own.cleared);

  /* ---------- ④ 设置页与指南入口 ---------- */
  await evalJs(`window.__APP__.go('settings')`);
  await sleep(500);
  const set = JSON.parse(await evalJs(`JSON.stringify((function(){
    var t = document.getElementById('view').innerText;
    return {
      hasSection: /AI 与额度/.test(t),
      hasKeyInput: !!document.getElementById('userKeyInput'),
      hasGuideBtn: !!document.querySelector('[data-act=ai-guide]'),
      hasDaily: document.querySelectorAll('[data-act=set-daily]').length,
      tierText: (document.querySelector('#view .pill') || {}).textContent || ''
    };
  })())`));
  ok('设置页有「AI 与额度」区块与 Key 输入框', set.hasSection && set.hasKeyInput);
  ok('设置页有接入指南入口', set.hasGuideBtn === true);
  ok('每日可投入时间有三档', set.hasDaily === 3, set.hasDaily + ' 档');
  ok('设置页显示当前档位', /本地方案|作者额度|自带/.test(set.tierText), set.tierText);

  const guide = await evalJs(`(function(){
    document.querySelector('[data-act=ai-guide]').click();
    return (document.querySelector('.guide')||{}).innerText || '';
  })()`);
  await sleep(300);
  ok('指南提到 CORS 与推荐厂商', /CORS|跨域/.test(guide) && /DeepSeek/.test(guide), guide.slice(0, 40).replace(/\s+/g, ' '));
  ok('指南有安全提示', /安全提示|只存在/.test(guide));

  /* ---------- ⑤ 每日时间预算生效 ---------- */
  const daily = await evalJs(`(function(){
    var b = document.querySelector('[data-act=set-daily][data-min="15"]');
    if (!b) return 'no-btn';
    b.click();
    return window.__APP__.S.settings.dailyMinutes;
  })()`);
  ok('点击 15 分钟能写入设置', daily === 15, String(daily));

  console.log('\n' + (fails === 0 ? '三档通路与额度验收通过' : '三档通路与额度验收失败 ' + fails + ' 项'));
  cleanup(fails === 0 ? 0 : 1);
} catch (e) {
  console.error('失败:', e.message);
  cleanup(1);
}
