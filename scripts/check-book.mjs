// scripts/check-book.mjs — 自定义词书（导入外部词书）的端到端验收
//
// 要验的是一条完整链路，而不是"有没有渲染出按钮"：
//   解析（txt/csv/粘贴、去重、跳过表头）→ 预览统计（命中/新增/频段）→ 保存并切换
//   → 词池真的变成这本书 → 抽样/作答/统计都在这本书上跑 → 口径提示可见 → 删除回退到四级
//
// 用法：node scripts/check-book.mjs [页面]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'index.html'));
const PORT = 9700 + Math.floor(Math.random() * 120);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'book-'));
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
  await evalJs('window.__APP__ && window.__APP__.enterApp && window.__APP__.enterApp(true)');
  await sleep(400);
  await evalJs(`window.__APP__.go('home')`);
  await sleep(300);

  /* ---------- 1. 首页有入口 ---------- */
  const bar = JSON.parse(await evalJs(`JSON.stringify((function(){
    var add = document.querySelector('[data-act=book-import]');
    return { hasAdd: !!add, text: add ? add.innerText.replace(/\\n/g,' ') : '' };
  })())`));
  ok('首页有「导入词书」入口', bar.hasAdd === true, bar.text);

  /* ---------- 2. 解析：宽松格式 + 去重 + 跳过表头 ---------- */
  const sample = [
    '单词,释义',
    'abandon,放弃',
    'benefit\t益处；使受益',
    'curious',
    'abandon,放弃',
    '# 注释行',
    '',
    'photosynthesis',
    '机器学习',
    'quantum-entanglement'
  ].join('\n');
  const parsed = JSON.parse(await evalJs(`JSON.stringify(window.__APP__.bookParse(${JSON.stringify(sample)}))`));
  ok('解析出正确的词数（去重 + 跳过表头/注释/中文行）', parsed.entries.length === 5,
    parsed.entries.map(e => e.w).join(','));
  ok('去重计数正确', parsed.dup >= 1, 'dup=' + parsed.dup);
  ok('带释义的条目保住了释义', parsed.entries.some(e => e.w === 'benefit' && /益处/.test(e.t)),
    (parsed.entries.find(e => e.w === 'benefit') || {}).t || '-');

  /* ---------- 3. 预览统计 ---------- */
  const pv = JSON.parse(await evalJs(`JSON.stringify(window.__APP__.bookPreview(window.__APP__.bookParse(${JSON.stringify(sample)}).entries))`));
  ok('预览区分「命中内置词库」与「新增词条」', pv.inDict >= 2 && pv.fresh >= 2,
    'hit=' + pv.inDict + ' new=' + pv.fresh + ' total=' + pv.total);
  ok('新增词落在「20k 以外」段', (pv.bands['0'] || 0) === pv.fresh, 'band0=' + pv.bands['0']);

  /* ---------- 4. 走完整 UI：打开窗口 → 粘贴 → 预览 → 保存 ---------- */
  await evalJs(`document.querySelector('[data-act=book-import]').click()`);
  await sleep(400);
  ok('导入窗口能打开（含拖放区与文本框）',
    await evalJs(`!!document.getElementById('bookDrop') && !!document.getElementById('bookText')`) === true);
  await evalJs(`(function(){
    var ta = document.getElementById('bookText');
    ta.value = ${JSON.stringify(sample)};
    document.querySelector('[data-act=book-preview]').click();
    return 1;
  })()`);
  await sleep(300);
  const ui = JSON.parse(await evalJs(`JSON.stringify((function(){
    var p = document.getElementById('bookPreview');
    return { stats: (p.innerText||'').replace(/\\n+/g,' / ').slice(0, 120),
             hasName: !!document.getElementById('bookName'),
             hasSave: !!document.querySelector('[data-act=book-save]'),
             warn: /不能换算成词汇量|有偏样本/.test(p.innerText||'') };
  })())`));
  ok('预览给出统计与命名框', ui.hasName && ui.hasSave, ui.stats.slice(0, 60));
  ok('预览里明确写了口径警告（不能换算词汇量）', ui.warn === true);

  await evalJs(`(function(){
    document.getElementById('bookName').value = '测试词书';
    document.querySelector('[data-act=book-save]').click();
    return 1;
  })()`);
  await sleep(700);

  /* ---------- 5. 生效：词池变成这本书 + 口径提示 ---------- */
  const after = JSON.parse(await evalJs(`JSON.stringify((function(){
    var A = window.__APP__;
    var pool = A.activePool();
    return {
      isUser: A.isUserBank(), bankName: A.bankName(), bankKey: A.bankKey(),
      poolSize: pool.length, poolWords: pool.map(function(i){ return A.WORDS[i].w; }),
      books: A.userBooks().length,
      banner: (document.querySelector('.book-banner')||{}).innerText || '',
      chips: document.querySelectorAll('.book-use').length
    };
  })())`));
  ok('切到了自定义词书', after.isUser === true && /测试词书/.test(after.bankName), after.bankName);
  ok('词池就是这本书（5 词）', after.poolSize === 5, after.poolWords.join(','));
  ok('首页出现口径提示条', /对这本书的掌握率/.test(after.banner), after.banner.replace(/\s+/g, ' ').slice(0, 46));
  ok('词书条里能看到这本书', after.chips >= 1, after.chips + ' 本');

  /* ---------- 6. 在这本书上真的能测 ---------- */
  const tested = JSON.parse(await evalJs(`JSON.stringify((function(){
    var A = window.__APP__;
    var pool = A.activePool();
    A.setSt(pool[0], 2); A.setSt(pool[1], 0);
    var t = A.tally(pool);
    // 取那个确实不在内置词表里的词（不能拿 pool 末位碰运气）
    var newIdx = -1;
    for (var q = 0; q < pool.length; q++) if (A.WORDS[pool[q]].u) { newIdx = pool[q]; break; }
    return { tested: t.tested, total: t.total, k: t.k, u: t.u,
             bandOfNew: newIdx >= 0 ? A.BAND_NAMES[A.bandOf(newIdx)] : 'none' };
  })())`));
  ok('作答在这本书上计数正确', tested.tested === 2 && tested.total === 5, JSON.stringify(tested));
  ok('新增词的频段是「20k 以外」', tested.bandOfNew === '20k 以外', tested.bandOfNew);

  /* ---------- 7. 刷新后仍在（词表追加与状态都已落盘） ---------- */
  await send('Page.reload');
  await evalJs('new Promise(function(r){ if(document.readyState==="complete") r(1); else addEventListener("load",function(){r(1)}); })');
  await sleep(1200);
  await evalJs('window.__APP__.enterApp(true)');
  await sleep(300);
  const reloaded = JSON.parse(await evalJs(`JSON.stringify((function(){
    var A = window.__APP__;
    return { isUser: A.isUserBank(), pool: A.activePool().length, words: A.WORDS.length,
             tested: A.tally(A.activePool()).tested };
  })())`));
  ok('刷新后词书与作答都还在', reloaded.isUser === true && reloaded.pool === 5 && reloaded.tested === 2,
    JSON.stringify(reloaded));

  /* ---------- 8. 删除后回退到四级 ---------- */
  const del = await evalJs(`(function(){
    var A = window.__APP__;
    var b = A.userBooks()[0];
    A.removeBook(b.id);
    return 1;
  })()`);
  await sleep(300);
  await evalJs(`document.querySelector('[data-act=book-del-confirm]').click()`);
  await sleep(500);
  const gone = JSON.parse(await evalJs(`JSON.stringify((function(){
    var A = window.__APP__;
    return { books: A.userBooks().length, bank: A.bankKey(), pool: A.activePool().length };
  })())`));
  ok('删除词书后自动回退到四级', gone.books === 0 && gone.bank === 'c4' && gone.pool > 4000, JSON.stringify(gone));

  console.log('\n' + (fails === 0 ? '自定义词书验收通过' : '自定义词书验收失败 ' + fails + ' 项'));
  cleanup(fails === 0 ? 0 : 1);
} catch (e) {
  console.error('失败:', e.message);
  cleanup(1);
}
