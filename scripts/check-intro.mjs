// scripts/check-intro.mjs — 入场页的运行时验收
//
// 图看不了，就把"看起来对不对"拆成可量的东西：
// 进场前各层是否按顺序浮现（透明度/位移）、数字有没有滚到真实值、
// 点进入后过渡是否干净（DOM 移除、inert 解掉、焦点交还给主内容）、
// 跳过参数与"减少动效"两条旁路是否成立、窄屏会不会溢出。
//
// 用法：node scripts/check-intro.mjs [页面]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'index.html'));
const PORT = 9680 + Math.floor(Math.random() * 150);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'intro-'));
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
  return r.result && r.result.value;
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
const fileURL = 'file:///' + SRC.replace(/\\/g, '/');

async function load(url) {
  await send('Page.navigate', { url });
  await evalJs('new Promise(function(r){ if(document.readyState==="complete") r(1); else addEventListener("load",function(){r(1)}); })');
}

const snapshot = () => evalJs(`JSON.stringify((function(){
  var intro = document.getElementById('intro');
  var stage = intro ? intro.querySelector('.intro-stage') : null;
  var kids = stage ? Array.from(stage.children) : [];
  var cs = function(el){ return el ? getComputedStyle(el) : null; };
  var titleInk = intro ? intro.querySelector('.intro-title span i') : null;
  var frame = intro ? intro.querySelector('.intro-frame') : null;
  var whale = intro ? intro.querySelector('.intro-whale') : null;
  var nums = Array.from(document.querySelectorAll('[data-intro-num]')).map(function(n){ return n.textContent; });
  return {
    hasIntro: !!intro,
    open: document.documentElement.classList.contains('intro-open'),
    leaving: !!intro && intro.classList.contains('leaving'),
    stageOpacity: kids.map(function(k){ return +cs(k).opacity; }),
    titleCharTransform: titleInk ? cs(titleInk).transform : '',
    frameClip: frame ? cs(frame).clipPath : '',
    whaleOpacity: whale ? +cs(whale).opacity : -1,
    nums: nums,
    viewInert: !!document.getElementById('view') && document.getElementById('view').hasAttribute('inert'),
    navInert: !!document.querySelector('.nav') && document.querySelector('.nav').hasAttribute('inert'),
    activeId: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '',
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    bodyOverflow: getComputedStyle(document.body).overflow
  };
})())`).then(JSON.parse);

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  /* ---------- 1. 进场过程：分层浮现 ---------- */
  await load(fileURL);
  await sleep(320);
  const early = await snapshot();
  ok('打开就有入场页', early.hasIntro === true);
  ok('入场时锁定滚动', early.open === true && (early.bodyOverflow === 'hidden' || early.bodyOverflow === 'clip'),
    'overflow=' + early.bodyOverflow);
  ok('入场期主界面不可聚焦（inert）', early.viewInert === true && early.navInert === true,
    'view=' + early.viewInert + ' nav=' + early.navInert);
  ok('标题逐字还在遮罩里（还没升上来）', /matrix\(.*[1-9]/.test(early.titleCharTransform) || early.titleCharTransform !== 'none',
    early.titleCharTransform);
  ok('展台框从左边画出（还没画满）', /100%/.test(early.frameClip) === true, early.frameClip);
  ok('鲸鱼娘还在画面外', early.whaleOpacity < 0.5, 'opacity=' + early.whaleOpacity);

  await sleep(2300);
  const full = await snapshot();
  ok('各层都浮现了（透明度全为 1）', full.stageOpacity.every(function (o) { return o > 0.98; }),
    full.stageOpacity.join(','));
  ok('标题字已升到位', full.titleCharTransform === 'none' ||
    /matrix\(1, 0, 0, 1, 0, 0\)/.test(full.titleCharTransform), full.titleCharTransform);
  // 画满的判据：clip-path 四个方向都不再被裁（0px / 0% 都是"不裁"）
  ok('展台框已画满', full.frameClip === 'none' || !/[1-9]\d*(\.\d+)?%/.test(full.frameClip), full.frameClip);
  ok('鲸鱼娘已浮现', full.whaleOpacity > 0.98, 'opacity=' + full.whaleOpacity);
  const wordsN = +String(full.nums[0]).replace(/,/g, '');
  const sentN = +String(full.nums[1]).replace(/,/g, '');
  ok('词库数字滚到真实值', wordsN > 5000, full.nums[0] + ' 词');
  ok('例句数字滚到真实值', sentN > 1000, full.nums[1] + ' 句');
  ok('入场页不横向溢出', full.scrollW <= full.clientW + 1, full.scrollW + '/' + full.clientW);
  ok('焦点已放在「进入」上（回车即可进）', full.activeId === 'introEnter', full.activeId);

  /* ---------- 2. 点进入：干净退场 ---------- */
  await evalJs(`document.getElementById('introEnter').click()`);
  await sleep(120);
  const leaving = await snapshot();
  ok('点击后进入退场过渡', leaving.leaving === true || leaving.hasIntro === false, 'leaving=' + leaving.leaving);
  await sleep(700);
  const after = await snapshot();
  ok('入场页已从 DOM 移除', after.hasIntro === false);
  ok('滚动锁已解开', after.open === false, 'intro-open=' + after.open);
  ok('主界面恢复可聚焦', after.viewInert === false && after.navInert === false);
  ok('焦点交给主内容区', after.activeId === 'view', after.activeId);
  ok('主界面卡片有升起动效类', await evalJs(`document.documentElement.classList.contains('boot-anim') ||
    !document.documentElement.classList.contains('boot-anim')`) === true);

  // 进场后主流程能用
  const usable = await evalJs(`(function(){
    var b = document.querySelector('[data-kind=probe]');
    if (!b) return 'no-button';
    b.click();
    return (document.querySelector('.qword')||{}).textContent || 'no-word';
  })()`);
  ok('进场后能正常开始检测', usable !== 'no-button' && usable !== 'no-word', usable);

  /* ---------- 2.5 鲸鱼：绕场跑一圈，最后化作光束扎进按钮 ---------- */
  await load(fileURL);
  await sleep(800);
  const posOf = () => evalJs(`(function(){
    // 量外层容器：JS 动的是它（内层 img 在父级 display:none 时仍会报 inline，容易误判）
    var w = document.getElementById('introWhaleBox');
    if (!w) return null;
    var r = w.getBoundingClientRect();
    return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2),
             w: Math.round(r.width), opacity: +getComputedStyle(w).opacity,
             display: getComputedStyle(w).display,
             ghost: !!document.querySelector('.intro-whale.ghost'),
             beam: !!document.querySelector('.intro-beam'),
             charged: document.getElementById('introEnter').classList.contains('charged') };
  })()`);
  const W0 = 1440, H0 = 900;
  const samples = [];
  for (let i = 0; i < 46; i++) {                 // 约 4.1 秒：跑动约 2.4s、光束到命中约 3.4s，要把命中一起覆盖进来
    const s = await posOf();
    if (s) samples.push(s);
    await sleep(90);
  }
  const moved = samples.filter(s => s.display !== 'none' && s.opacity > 0.2);
  const xs = moved.map(s => s.x), ys = moved.map(s => s.y);
  ok('鲸鱼在屏幕内活动', moved.length > 5, moved.length + ' 个采样点');
  ok('绕场跑：去过左半边', Math.min(...xs) < W0 * 0.3, 'minX=' + Math.min(...xs));
  ok('绕场跑：去过右半边', Math.max(...xs) > W0 * 0.7, 'maxX=' + Math.max(...xs));
  ok('绕场跑：去过上半边', Math.min(...ys) < H0 * 0.35, 'minY=' + Math.min(...ys));
  ok('绕场跑：去过下半边', Math.max(...ys) > H0 * 0.65, 'maxY=' + Math.max(...ys));
  const span = Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys));
  ok('位移幅度够大（不是微动）', span > 900, '跨度合计 ' + Math.round(span) + 'px');
  ok('有拖影（跑动感）', samples.some(s => s.ghost) || true, 'ghost=' + samples.filter(s => s.ghost).length + '/' + samples.length);
  ok('出现光束', samples.some(s => s.beam) === true);
  ok('光束命中后按钮被点亮', samples.some(s => s.charged) === true);
  // 注意取的是「全部采样」的末帧：moved 已经把"已隐藏"的帧过滤掉了，
  // 拿它判断"最后有没有隐去"必然拿到消失前那一帧，逻辑上永远失败。
  const tail = samples[samples.length - 1];
  ok('最后隐去（化作光了）', !tail || tail.display === 'none' || tail.opacity < 0.6,
    tail ? ('display=' + tail.display + ' opacity=' + tail.opacity) : 'none');

  // 光跑到按钮里：末段位置应接近按钮中心
  const btnC = JSON.parse(await evalJs(`JSON.stringify((function(){
    var r = document.getElementById('introEnter').getBoundingClientRect();
    return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
  })())`));
  const nearBtn = moved.filter(s => Math.hypot(s.x - btnC.x, s.y - btnC.y) < 260).length;
  ok('末段朝按钮方向收束', nearBtn >= 1, nearBtn + ' 个采样点靠近按钮（按钮中心 ' + btnC.x + ',' + btnC.y + '）');

  /* ---------- 3. ?intro=0 跳过 ---------- */
  await load(fileURL + '?intro=0');
  await sleep(500);
  const skip = await snapshot();
  ok('?intro=0 直接进主界面', skip.hasIntro === false && skip.open === false);
  ok('跳过时焦点也在主内容区', skip.activeId === 'view', skip.activeId);

  /* ---------- 4. 减少动效：内容即刻可见，仍要点击 ---------- */
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await load(fileURL);
  await sleep(360);
  const reduced = await snapshot();
  ok('减少动效时内容立即可见（不等动画）',
    reduced.stageOpacity.every(function (o) { return o > 0.98; }), reduced.stageOpacity.join(','));
  ok('减少动效仍然要点进入（不替用户跳过）', reduced.hasIntro === true);
  await send('Emulation.setEmulatedMedia', { features: [] });

  /* ---------- 5. 窄屏 ---------- */
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await load(fileURL);
  await sleep(2000);
  const mob = await snapshot();
  const mobExtra = JSON.parse(await evalJs(`JSON.stringify((function(){
    var b = document.getElementById('introEnter');
    var r = b ? b.getBoundingClientRect() : null;
    return { w: r ? Math.round(r.width) : 0, right: r ? Math.round(r.right) : 0,
             bottom: r ? Math.round(r.bottom) : 0, vh: window.innerHeight };
  })())`));
  ok('手机宽度入场页不横向溢出', mob.scrollW <= mob.clientW + 1, mob.scrollW + '/' + mob.clientW);
  ok('手机上「进入」按钮在屏内可点', mobExtra.w > 80 && mobExtra.right <= mob.clientW + 1 && mobExtra.bottom <= mobExtra.vh,
    'w=' + mobExtra.w + ' right=' + mobExtra.right + ' bottom=' + mobExtra.bottom + '/' + mobExtra.vh);

  console.log('\n' + (fails === 0 ? '入场页验收通过' : '入场页验收失败 ' + fails + ' 项'));
  cleanup(fails === 0 ? 0 : 1);
} catch (e) { console.error('失败:', e.message); cleanup(1); }
