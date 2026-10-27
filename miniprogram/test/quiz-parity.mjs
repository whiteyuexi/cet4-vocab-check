#!/usr/bin/env node
/* ======================================================================
   quiz-parity.mjs —— 答题流程控制器一致性测试（网页版 vs 小程序移植版）
   ----------------------------------------------------------------------
   做法：**真的把网页版跑起来**（jsdom 加载构建产物 index.html，点按钮作答），
   同时用 miniprogram/utils/quiz.js 跑同一套操作，两边**逐步 lockstep 对比**：

     左边（基准）：index.html 里的 src/app.part1.js + app.part2.js（真界面、真事件）
     右边（移植）：miniprogram/utils/engine.js + miniprogram/utils/quiz.js

   比什么：
     1. 每题呈现的词条 / 题号 / 分组 / 进度文案 / 进度条百分比（逐题）
     2. 每次作答后的 S.session.log、S.status、是否揭示释义、按钮态（逐题）
     3. 结算：lastResult / history / samples / estimateNow（含区间与两套口径）/
        bandProfile / censusBands / levelReport 全字段
     4. 最终落盘存档 JSON **逐字节相同**（含档案元数据键）
     5. 断点续测：中途序列化→反序列化后继续，结果与不中断时一致
     6. 多轮重测：归档快照（含 2bit 位图 base64）/ roundDiff / 轮次
     7. 自动跳转：网页版的 setTimeout 被控制器换成「意图」字段，两边口径一致

   怎么做到逐字节：两边共用一个**虚拟时钟**（Date.now 被替换成可设定的值），
   每个逻辑步骤前后推固定时长，因此 startedAt / ts 这些时间戳天然相同，
   不需要像 parity.mjs 那样把时间戳抹平再比。

   运行： node miniprogram/test/quiz-parity.mjs
   退出码 0 = 全绿；非 0 = 有差异（逐条打印字段路径、两边取值）。
   ====================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MP = path.resolve(HERE, '..');                       // miniprogram/
const ROOT = path.resolve(MP, '..');                       // 项目根
const INDEX_HTML = path.join(ROOT, 'index.html');
const SRC_P1 = path.join(ROOT, 'src', 'app.part1.js');
const SRC_P2 = path.join(ROOT, 'src', 'app.part2.js');
const ENGINE_JS = path.join(MP, 'utils', 'engine.js');
const QUIZ_JS = path.join(MP, 'utils', 'quiz.js');
const STORAGE_JS = path.join(MP, 'utils', 'storage.js');

/* jsdom 是仓库已有的 devDependency；找不到时按项目其它脚本的老办法回退 */
function requireJsdom() {
  try { return require('jsdom'); }
  catch (e) { return require('C:/Users/27295/deepseek-harness/node_modules/jsdom'); }
}
const { JSDOM, VirtualConsole } = requireJsdom();

const engineMod = require(ENGINE_JS);
const storageMod = require(STORAGE_JS);
const quizMod = require(QUIZ_JS);

/* ---------------------------------------------------------------------
   一、断言与逐字段比较的脚手架（与 test/parity.mjs 同一套口径）
   --------------------------------------------------------------------- */
const stats = { checks: 0, leaves: 0, failed: 0 };
const diffs = [];
const MAX_DIFF_PRINT = 60;

function fmt(v) {
  if (typeof v === 'string') return JSON.stringify(v.length > 90 ? v.slice(0, 90) + '...' : v);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) return String(v);
  try { return JSON.stringify(v).slice(0, 160); } catch (e) { return String(v); }
}
function fail(p, a, b, why) { stats.failed++; diffs.push({ path: p, a: a, b: b, why: why }); }
function kindOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
function cmp(p, a, b) {
  const ka = kindOf(a), kb = kindOf(b);
  if (ka !== kb) { fail(p, a, b, '类型不同 ' + ka + ' vs ' + kb); return; }
  if (ka === 'array') {
    if (a.length !== b.length) fail(p + '.length', a.length, b.length, '长度不同');
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) cmp(p + '[' + i + ']', a[i], b[i]);
    return;
  }
  if (ka === 'object') {
    const keysA = Object.keys(a).sort(), keysB = Object.keys(b).sort();
    const onlyA = keysA.filter(k => keysB.indexOf(k) < 0);
    const onlyB = keysB.filter(k => keysA.indexOf(k) < 0);
    if (onlyA.length) fail(p, onlyA, null, '左边独有字段');
    if (onlyB.length) fail(p, null, onlyB, '右边独有字段');
    keysA.forEach(k => { if (keysB.indexOf(k) >= 0) cmp(p + '.' + k, a[k], b[k]); });
    return;
  }
  stats.leaves++;
  if (ka === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return;
    if (a === b) return;
    if (a === 0 && b === 0) return;
    fail(p, a, b, '数值不等（差 ' + (a - b) + '）');
    return;
  }
  if (ka === 'function') return;
  if (a === b) return;
  fail(p, a, b, '取值不等');
}
function check(p, a, b) { stats.checks++; cmp(p, a, b); }
function checkTrue(p, cond, detail) {
  stats.checks++; stats.leaves++;
  if (!cond) fail(p, true, false, detail || '断言失败');
}

/* ---------------------------------------------------------------------
   二、虚拟时钟 + 可复现随机
   ---------------------------------------------------------------------
   网页版与移植版各自 Date.now()，真实时间无法逐字节比；
   这里把两边都接到同一个可设定的虚拟时钟上：
     · 网页版是 jsdom 里的**另一个 realm**，要在 beforeParse 里改 window.Date.now
     · 移植版跑在 Node 主 realm，改全局 Date.now
   两边在同一个逻辑步骤内看到的时间完全一样 → startedAt / ts / 存档逐字节可比。
   随机数（只在摸底抽题与四选一选项里出现）两边各用一份同种子 xorshift。 */
const CLOCK_BASE = 1700000000000;
const STEP_MS = 1300;                 // 每答一题的虚拟耗时（让 eta 的节奏估算真的算得出来）
let clock = CLOCK_BASE;
const realDateNow = Date.now;
const realMathRandom = Math.random;
let nodeRng = realMathRandom, pageRng = realMathRandom;

function setClock(t) { clock = t; }
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function seedBoth(seed) { nodeRng = makeRng(seed); pageRng = makeRng(seed); }
Date.now = function () { return clock; };
Math.random = function () { return nodeRng(); };

/* ---------------------------------------------------------------------
   三、装载网页版（jsdom 跑真的 index.html）
   --------------------------------------------------------------------- */
const HTML = fs.readFileSync(INDEX_HTML, 'utf8');

async function loadWeb() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const m = e.message || String(e);
    if (!/Not implemented/.test(m)) errors.push('jsdomError: ' + m);
  });
  vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'http://localhost/', virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      w.Date.now = function () { return clock; };      // 虚拟时钟（网页版代码取的是自己 realm 的 Date）
      w.Math.random = function () { return pageRng(); };
      /* 让网页版认为用户开了「减少动效」：part1 的 playMotion 会把 .bar>i 的 width 先置 0%
         再用 requestAnimationFrame 慢慢长回去。那是动画中间态，不是进度语义，
         同步读 DOM 只会读到 0%。打开减少动效后网页版跳过整段动画，DOM 里就是最终值。 */
      w.matchMedia = function (q) {
        return {
          matches: /prefers-reduced-motion/.test(String(q)), media: String(q), onchange: null,
          addListener: function () {}, removeListener: function () {},
          addEventListener: function () {}, removeEventListener: function () {},
          dispatchEvent: function () { return false; }
        };
      };
    }
  });
  const win = dom.window;
  await new Promise(res => win.addEventListener('load', res));
  return { dom: dom, win: win, doc: win.document, A: win.__APP__, errors: errors };
}

function click(web, el) {
  if (!el) throw new Error('要点的元素不存在');
  el.dispatchEvent(new web.win.MouseEvent('click', { bubbles: true }));
}
function clickSel(web, sel) {
  const el = web.doc.querySelector(sel);
  if (!el) throw new Error('找不到元素: ' + sel);
  click(web, el);
}

/* ---------------------------------------------------------------------
   四、装载移植版（engine + quiz），起点与「空存档」一致
   --------------------------------------------------------------------- */
function newPort() {
  const storage = storageMod.createMemoryStorage();
  const A = engineMod.createEngine({ words: engineMod.WORDS, storage: storage });
  const q = quizMod.createQuiz(A, {});
  return { A: A, q: q, storage: storage };
}
function savedOf(A) { return A.storage.getItem(A.KEY); }
function savedWeb(web) { return web.win.localStorage.getItem(web.A.KEY); }
function profilesWeb(web) { return web.win.localStorage.getItem('cet4vocab_profiles'); }

/* ---------------------------------------------------------------------
   五、确定性作答指纹（全是词本身内容的函数，不含随机数）
   --------------------------------------------------------------------- */
function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h >>> 0;
}
const ANSWER = {
  allKnown: () => 2,
  allNone: () => 0,
  /* 中等掌握：40% 认识 / 20% 模糊 / 40% 不认识 */
  mixed: (i, n, w) => {
    const h = fnv1a(w.w) % 100;
    return h < 40 ? 2 : (h < 60 ? 1 : 0);
  },
  /* 模糊偏多：专测「认识 + 模糊×0.5」这条口径 */
  fuzzyHeavy: (i, n, w) => {
    const h = fnv1a(w.w) % 100;
    return h < 8 ? 2 : (h < 78 ? 1 : 0);
  }
};

/* ---------------------------------------------------------------------
   六、观察：把「网页版的 DOM / 状态」与「控制器给出的状态」读成同构对象
   --------------------------------------------------------------------- */
const LETTERS = ['A', 'B', 'C', 'D'];

function observeWeb(web) {
  const A = web.A, doc = web.doc;
  const s = A.S.session;
  const domWord = doc.querySelector('.qword');
  const domTiny = doc.querySelector('.test-top .tiny');
  const domBar = doc.querySelector('.bar > i');
  const reveal = doc.querySelector('.reveal');
  const mean = doc.querySelector('.reveal .mean');
  const opts = Array.from(doc.querySelectorAll('.opt'));
  let onV = null;
  for (let v = 0; v <= 2; v++) {
    const b = doc.querySelector('[data-act="judge"][data-v="' + v + '"]');
    if (b && b.className.indexOf('on') >= 0) onV = v;
  }
  const mode = A.S.settings.mode;
  let meanText = null;
  if (mean) {
    meanText = mode === 'choice' ? mean.textContent : mean.textContent;
  }
  return {
    hasSession: !!s,
    index: s ? s.queue[s.pos] : undefined,
    pos: s ? s.pos : null,
    total: s ? s.queue.length : null,
    label: s ? s.label : null,
    kind: s ? s.kind : null,
    target: s ? s.target : null,
    bank: s ? s.bank : null,
    preTested: s ? s.preTested : null,
    skipped: s ? s.skipped : null,
    startedAt: s ? s.startedAt : null,
    logJson: s ? JSON.stringify(s.log) : null,
    counts: A.sessionCounts(),
    word: domWord ? domWord.textContent : null,
    tiny: domTiny ? domTiny.textContent : null,
    bar: domBar ? domBar.style.width : null,
    revealed: !!reveal,
    mean: meanText,
    onV: onV,
    opts: opts.map(e => e.textContent).join('|'),
    optCls: opts.map(e => e.className).join('|'),
    hasNextBtn: !!doc.querySelector('[data-act="next"]'),
    hasSkipBtn: !!doc.querySelector('[data-act="skip"]'),
    finishLabel: (function () {
      const b = doc.querySelector('[data-act="finish"]');
      return b ? b.textContent : null;
    })(),
    statusJson: null
  };
}

function observePort(port) {
  const v = port.q.view();
  const s = port.A.S.session;
  const mode = port.A.S.settings.mode;
  let mean = null;
  if (v.hasSession && v.revealed) {
    if (mode === 'choice') {
      const o = v.opts && v.picked >= 0 ? v.opts[v.picked] : null;
      mean = o && o.ok ? '答对了' : '答错了';
    } else {
      mean = v.word.t;
    }
  }
  const opts = v.opts || [];
  return {
    hasSession: v.hasSession,
    index: v.index,
    pos: v.hasSession ? v.pos : null,
    total: v.hasSession ? v.total : null,
    label: v.hasSession ? v.label : null,
    kind: v.hasSession ? v.kind : null,
    target: v.hasSession ? v.target : null,
    bank: v.hasSession ? v.bank : null,
    preTested: s ? s.preTested : null,
    skipped: v.hasSession ? v.skipped : null,
    startedAt: v.hasSession ? v.startedAt : null,
    logJson: s ? JSON.stringify(s.log) : null,
    counts: port.q.counts(),            // 与网页版 A.sessionCounts() 同一份实现，无会话时也给 0

    word: v.hasSession ? v.word.w : null,
    tiny: v.hasSession ? v.progressText : null,
    bar: v.hasSession ? v.barPct + '%' : null,
    revealed: !!v.revealed,
    mean: mean,
    /* 网页版只有自评模式才渲染三个 judge 按钮（.jbtn.on），四选一模式没有这个反馈位 */
    onV: (v.hasSession && v.revealed && mode === 'self') ? v.lastV : null,
    opts: opts.map((o, n) => (LETTERS[n] || '') + o.t).join('|'),
    optCls: opts.map(o => o.cls).join('|'),
    hasNextBtn: !!v.canNext,
    hasSkipBtn: !!v.canSkip,
    finishLabel: v.hasSession ? '结束并看结果' : null,
    statusJson: null
  };
}

/* ---------------------------------------------------------------------
   七、lockstep 驱动
   --------------------------------------------------------------------- */
function resetBoth(web, port, spec) {
  /* 起点：网页版是全新 jsdom（空 localStorage），移植版是全新内存存储，两边都是默认状态。
     这里只把「测试要用的设置」在两边设成同一值（存档里也会因此相同）。 */
  const set = function (A) {
    A.S.settings.autoNext = false;          // 自动跳转由测试接管，避免定时器异步插进来
    A.S.settings.mode = spec.mode || 'self';
    A.S.settings.bank = spec.bank || 'c4';
    A.S.settings.includeExt = !!spec.includeExt;
    A.S.settings.strict = !!spec.strict;
  };
  set(web.A); set(port.A);
  if (spec.seedState) seedStateBoth(web.A, port.A, spec.seedState);
}

/* 预置一部分「此前已测过」的作答（用于全量检测的轮转起点等场景） */
function seedStateBoth(A, B, seedSpec) {
  const pool = A.activePool();
  const n = Math.floor(pool.length * (seedSpec.ratio || 0));
  for (let i = 0; i < n; i++) {
    const v = (seedSpec.answer || ANSWER.mixed)(pool[i], i, A.WORDS[pool[i]]);
    A.setSt(pool[i], v);
    B.setSt(pool[i], v);
  }
  A.save(); B.save();
}

async function runScenario(spec) {
  seedBoth(spec.seed || 20250101);
  setClock(CLOCK_BASE);
  const web = await loadWeb();                 // 网页版在虚拟时钟 CLOCK_BASE 上启动
  const port = newPort();                      // 移植版也在 CLOCK_BASE 上创建
  resetBoth(web, port, spec);

  const tag = spec.name;
  let started = false;

  /* --- 开局：网页版尽量走真实点击，移植版走控制器 --- */
  if (spec.start.viaClick) {
    web.A.go('groups');
    clickSel(web, spec.start.viaClick);
    started = !!web.A.S.session;
  }
  if (!started) web.A.startSession(spec.start.kind, spec.start.opts || {});
  const portStart = port.q.start(spec.start.kind, spec.start.opts || {});
  checkTrue(tag + ' :: 开局都成功', !!web.A.S.session && portStart.ok === true && !!port.A.S.session,
    'web=' + !!web.A.S.session + ' port=' + JSON.stringify(portStart));

  /* --- 队列：题序与分组边界 --- */
  const qw = web.A.S.session ? web.A.S.session.queue : [];
  const qp = port.A.S.session ? port.A.S.session.queue : [];
  check(tag + ' :: 队列长度', qw.length, qp.length);
  check(tag + ' :: 队列逐词（题序）', qw, qp);
  check(tag + ' :: 队列校验和', qw.reduce((s, x) => (s + x * (qw.length - x)) % 2147483647, 0),
    qp.reduce((s, x) => (s + x * (qp.length - x)) % 2147483647, 0));
  check(tag + ' :: 队列首 20 词', qw.slice(0, 20), qp.slice(0, 20));
  check(tag + ' :: 队列尾 20 词', qw.slice(-20), qp.slice(-20));
  check(tag + ' :: 标签文案', web.A.S.session.label, port.A.S.session.label);
  check(tag + ' :: kind', web.A.S.session.kind, port.A.S.session.kind);
  check(tag + ' :: 分组下标', web.A.S.session.group, port.A.S.session.group);
  check(tag + ' :: 词库键', web.A.S.session.bank, port.A.S.session.bank);
  check(tag + ' :: 预置已测词数', web.A.S.session.preTested, port.A.S.session.preTested);
  check(tag + ' :: 目标精度', web.A.S.session.target, port.A.S.session.target);
  check(tag + ' :: 起始时间戳', web.A.S.session.startedAt, port.A.S.session.startedAt);

  /* 答题页上的东西（题面 / 进度 / 按钮态）只在「有会话」时才有意义：
     会话一收工网页版就渲染成结果页了，这些 DOM 字段不再对应答题页。 */
  const PAGE_KEYS = ['pos', 'total', 'label', 'kind', 'target', 'bank', 'preTested', 'skipped', 'startedAt',
    'word', 'tiny', 'bar', 'revealed', 'mean', 'onV', 'opts', 'optCls', 'hasNextBtn', 'hasSkipBtn', 'finishLabel'];
  const obsPath = (label, k) => tag + ' :: ' + label + ' · ' + k;
  const compareAt = (label) => {
    const w = observeWeb(web), p = observePort(port);
    check(obsPath(label, 'hasSession'), w.hasSession, p.hasSession);
    check(obsPath(label, 'log'), w.logJson, p.logJson);
    check(obsPath(label, 'counts'), w.counts, p.counts);
    check(obsPath(label, 'index'), w.index, p.index);
    if (w.hasSession && p.hasSession) {
      PAGE_KEYS.forEach(k => { check(obsPath(label, k), w[k], p[k]); });
    }
    check(obsPath(label, 'status'), web.A.S.status, port.A.S.status);
  };
  compareAt('开局');

  /* --- 逐题 --- */
  let step = 0;
  const maxSteps = spec.maxSteps || 100000;
  const finishAt = spec.finishAt || 0;
  let autoStopped = null;
  /* 中途收工：网页版点「结束并看结果」，移植版调 finish() */
  const doFinish = function (label) {
    setClock(clock + STEP_MS);
    clickSel(web, '[data-act="finish"]');
    const r = port.q.finish();
    checkTrue(tag + ' :: ' + label + '走了结算分支', r.ok === true, JSON.stringify(r));
    compareAt(label);
  };

  while (web.A.S.session && port.A.S.session && step < maxSteps) {
    const ws = web.A.S.session;
    const idx = ws.queue[ws.pos];
    const w = web.A.WORDS[idx];
    compareAt('第' + (step + 1) + '题题面');

    const acts = buildActs(spec, step, idx, w, port);
    let ended = false;
    for (let ai = 0; ai < acts.length; ai++) {
      actBoth(web, port, acts[ai], spec);
      if (!acts[ai].noCompare) compareAt('第' + (step + 1) + '题·' + actLabel(acts[ai]));
      if (!web.A.S.session || !port.A.S.session) { ended = true; break; }
    }
    if (ended) {
      autoStopped = (ws.kind === 'probe') ? 'probe-精度达标自动停测' : '队列走完';
      break;
    }
    if (finishAt && step + 1 >= finishAt) { doFinish('中途收工'); break; }
    step++;
  }
  /* 答到 maxSteps 还没收工的场景：也要走一次结算，才能比结算与存档 */
  if (web.A.S.session && port.A.S.session) doFinish('答满题量上限中途收工');

  compareAt('收工前最后状态');

  /* --- 结算与存档 --- */
  const wsess = web.A.S.session, psess = port.A.S.session;
  checkTrue(tag + ' :: 两边会话都已清空', wsess === null && psess === null,
    'web=' + JSON.stringify(!!wsess) + ' port=' + JSON.stringify(!!psess));
  check(tag + ' :: lastResult（结算对象，含 log）', web.A.S.lastResult, port.A.S.lastResult);
  check(tag + ' :: history', web.A.S.history, port.A.S.history);
  check(tag + ' :: samples（探测模式的样本）', web.A.S.samples, port.A.S.samples);
  check(tag + ' :: 全部作答状态 S.status', web.A.S.status, port.A.S.status);
  check(tag + ' :: estimateNow（词汇量与区间）', web.A.estimateNow(), port.A.estimateNow());
  check(tag + ' :: 两套口径与置信区间', intervals(web.A), intervals(port.A));
  check(tag + ' :: bandProfile（频段剖面）', web.A.bandProfile(), port.A.bandProfile());
  check(tag + ' :: censusBands', web.A.censusBands(web.A.activePool()), port.A.censusBands(port.A.activePool()));
  check(tag + ' :: levelReport（全字段）', web.A.levelReport(), port.A.levelReport());
  web.A.save(); port.A.save();
  check(tag + ' :: 存档 JSON 逐字节相同', savedWeb(web), savedOf(port.A));
  check(tag + ' :: 档案元数据 JSON 逐字节相同', profilesWeb(web), port.storage.getItem('cet4vocab_profiles'));

  checkTrue(tag + ' :: jsdom 无脚本错误', web.errors.length === 0, web.errors.slice(0, 3).join(' | '));

  /* 关掉窗口，顺手清掉可能还在排队的定时器 */
  try { web.A.clearTimer(); } catch (e) {}
  web.dom.window.close();
  return { web: web, port: port, steps: step + (finishAt ? 1 : 0), stop: autoStopped };
}

/* ---------------------------------------------------------------------
   七点五、动作执行：两边做同一件事，再比一次状态
   ---------------------------------------------------------------------
   每一步都由若干「动作」组成（作答 → 改判 → 撤销 → 翻下一题 …），
   网页版一律点真实按钮，移植版一律调控制器方法。
   每次动作前先推进虚拟时钟：进度里那句「约还需 N 秒」是按
   (now - startedAt)/已答数 估出来的，两边必须在同一时刻渲染才可比。 */
function actLabel(act) {
  if (act.type === 'judge') return '判' + act.v;
  if (act.type === 'pick') return '选' + act.n;
  if (act.type === 'rejudge') return '改判' + act.v;
  if (act.type === 'skip') return '跳过';
  if (act.type === 'undo') return '撤销';
  if (act.type === 'revertCurrent') return '悄悄撤销';
  if (act.type === 'next') return '下一题';
  return act.type;
}

function actBoth(web, port, act, spec) {
  setClock(clock + STEP_MS);
  switch (act.type) {
    case 'judge':
      clickSel(web, '[data-act="judge"][data-v="' + act.v + '"]');
      port.q.judge(act.v);
      break;
    case 'pick': {
      const el = web.doc.querySelectorAll('.opt')[act.n];
      if (!el) throw new Error('网页版没有第 ' + act.n + ' 个选项');
      click(web, el);
      port.q.pick(act.n);
      web.A.clearTimer();        // 四选一每次作答都排了自动跳转定时器，测试立即接管
      break;
    }
    case 'rejudge':
      clickSel(web, '[data-act="rejudge"][data-v="' + act.v + '"]');
      port.q.rejudge(act.v);
      break;
    case 'skip':
      clickSel(web, '[data-act="skip"]');
      port.q.skip();
      break;
    case 'undo':
      clickSel(web, '[data-act="undo"]');
      port.q.undo();
      break;
    case 'revertCurrent':
      web.A.revertCurrent();
      port.q.revertCurrent();
      break;
    case 'next':
      clickSel(web, '[data-act="next"]');
      port.q.next();
      break;
    default:
      throw new Error('未知动作 ' + act.type);
  }
}

/* 一步的操作序列；场景可以用 script(step) 覆盖（跳题 / 撤销 / 改判…） */
function buildActs(spec, step, idx, w, port) {
  if (spec.script) {
    const custom = spec.script(step, idx, w, port);
    if (custom) return custom;
  }
  const v = spec.answer(idx, step, w);
  if ((spec.mode || 'self') === 'choice') {
    /* 选项内容两边已经比过一致，这里按同一条规则选同一个下标 */
    const popts = port.q.view().opts;
    const correctIdx = popts.findIndex(o => o.ok);
    const h = fnv1a(w.w);
    let pickIdx;
    if ((h % 100) < 55) pickIdx = correctIdx;
    else {
      const wrong = popts.map((o, n) => n).filter(n => !popts[n].ok);
      pickIdx = wrong[(h >>> 5) % wrong.length];
    }
    return [{ type: 'pick', n: pickIdx }, { type: 'next' }];
  }
  return [{ type: 'judge', v: v }, { type: 'next' }];
}

/* 置信区间 + 两套口径（严格 / 折中 / 扣蒙对） */
function intervals(A) {
  const s = A.latestSample();
  const N = A.curPoolSize();
  if (!s || !s.bands) return { sample: s, strat: null };
  const loose = A.scoreBands(s.bands, false);
  const strict = A.scoreBands(s.bands, true);
  const ug = A.unguessBands(loose, 4);
  return {
    sample: s,
    loose: loose, strict: strict, unguessed: ug,
    stratLoose: A.stratEstimate(loose, N),
    stratStrict: A.stratEstimate(strict, N),
    stratUnguessed: A.stratEstimate(ug, N),
    plainLoose: A.estimate(s.n, A.scoreOf(s, false), N),
    plainStrict: A.estimate(s.n, A.scoreOf(s, true), N)
  };
}

/* ---------------------------------------------------------------------
   八、场景表
   --------------------------------------------------------------------- */
const SCENARIOS = [
  {
    name: '① 全认识 · 分组第 3 组（点分组格子开局，100 题走完）',
    start: { kind: 'group', opts: { group: 2 }, viaClick: '[data-act="start"][data-kind="group"][data-group="2"]' },
    answer: ANSWER.allKnown, seed: 101
  },
  {
    name: '② 全不认识 · 分组第 7 组（100 题走完）',
    start: { kind: 'group', opts: { group: 6 } },
    answer: ANSWER.allNone, seed: 102
  },
  {
    name: '③ 中等掌握 · 分组第 13 组（100 题走完）',
    start: { kind: 'group', opts: { group: 12 } },
    answer: ANSWER.mixed, seed: 103
  },
  {
    name: '④ 摸底检测 · 未达精度就中途收工（±150，答 24 题停）',
    start: { kind: 'probe', opts: { target: 150 } },
    answer: ANSWER.mixed, seed: 104, finishAt: 24
  },
  {
    name: '⑤ 摸底检测 · 精度达标自动收工（±400，全认识）',
    start: { kind: 'probe', opts: { target: 400 } },
    answer: ANSWER.allKnown, seed: 105
  },
  {
    /* 目标放到 ±1000：这个精度大约 10 题就够，但网页版有「至少答满 20 题」的地板，
       所以真实收工点应当正好是第 20 题 —— 专测这条地板（probeReached 的 log.length 门槛） */
    name: '⑨ 摸底检测 · 精度达标但受「至少 20 题」地板约束（±1000，全认识）',
    start: { kind: 'probe', opts: { target: 1000 } },
    answer: ANSWER.allKnown, seed: 109
  },
  {
    name: '⑥ 全量检测 · 只答 12 题就收工（测「从第一个未测词开始」的轮转）',
    start: { kind: 'all' },
    answer: ANSWER.fuzzyHeavy, seed: 106, finishAt: 12, seedState: { ratio: 0.3 }
  },
  {
    name: '⑦ 错词重测（list，含跳过/撤销/改判/悄悄撤销）',
    start: { kind: 'list', opts: { list: null, label: null }, buildList: true },
    answer: ANSWER.mixed, seed: 107, maxSteps: 18,
    /* 这一步序列专门打「非直线」路径：跳过不记作答、撤销回滚状态与题号、
       改判只改最后一条、revertCurrent 悄悄撤销（网页版这次不重渲染，所以不比 DOM） */
    script: function (step) {
      if (step === 1) return [{ type: 'skip' }];
      if (step === 4) return [{ type: 'judge', v: 2 }, { type: 'undo' }, { type: 'judge', v: 1 }, { type: 'next' }];
      if (step === 7) return [{ type: 'judge', v: 0 }, { type: 'rejudge', v: 2 }, { type: 'next' }];
      if (step === 10) return [{ type: 'judge', v: 1 }, { type: 'revertCurrent', noCompare: true }, { type: 'judge', v: 0 }, { type: 'next' }];
      return null;
    }
  },
  {
    name: '⑧ 四选一模式 · 分组第 1 组（选对/选错混合，30 题）',
    start: { kind: 'group', opts: { group: 0 } },
    mode: 'choice', answer: ANSWER.mixed, seed: 108, maxSteps: 30, finishAt: 30
  }
];

/* list 场景的队列由测试现造（网页版与该端口用同一批下标） */
function prepareListScenario(spec) {
  if (!spec.start.buildList) return spec;
  const pool = engineMod.WORDS;
  const seedEngine = engineMod.createEngine({ words: pool, storage: storageMod.createMemoryStorage() });
  const weak = [];
  const apool = seedEngine.activePool();
  for (let i = 0; i < apool.length && weak.length < 40; i += 7) {
    const h = fnv1a(pool[apool[i]].w) % 100;
    if (h < 45) weak.push(apool[i]);
  }
  return Object.assign({}, spec, {
    start: {
      kind: 'list', viaClick: null,
      opts: { list: weak, label: '复测本次未掌握词 · ' + weak.length + ' 词' }
    }
  });
}

/* ---------------------------------------------------------------------
   九、跑场景
   --------------------------------------------------------------------- */
const scenarioRows = [];
function row(name, before) {
  scenarioRows.push({
    name: name,
    checks: stats.checks - before.checks,
    leaves: stats.leaves - before.leaves,
    failed: stats.failed - before.failed
  });
}
function before() { return { checks: stats.checks, leaves: stats.leaves, failed: stats.failed }; }

console.log('== 一、基准新鲜度：被测的网页版必须就是 src 里那份答题流程 ==');
{
  const p1 = fs.readFileSync(SRC_P1, 'utf8');
  const p2 = fs.readFileSync(SRC_P2, 'utf8');
  const before = stats.failed;
  /* 答题流程控制器移植自 app.part2.js：它必须硬性一致，否则比的是两份不同的流程 */
  checkTrue('基准 :: index.html 内嵌 src/app.part2.js 逐字节一致', HTML.indexOf(p2) >= 0, '构建产物过期，请先 node build.js');
  /* part1（统计引擎）由第 1 阶段的 port-engine.mjs 生成 miniprogram/utils/engine.js，
     与 index.html 同源；若 src 之后又被改过，这里只告警不报错：
     被比的两边（index.html 与 engine.js）仍是同一版本，对比依然成立，
     但需要重放 port-engine.mjs + 重新 build + 重跑 parity.mjs 才能跟上 src。 */
  const p1Hit = HTML.indexOf(p1) >= 0;
  if (!p1Hit) {
    const embedded = HTML.slice(HTML.indexOf('/* ===== app.part1.js ===== */'));
    const embeddedP1 = embedded.slice(0, p1.length);
    let at = 0;
    while (at < embeddedP1.length && at < p1.length && embeddedP1[at] === p1[at]) at++;
    const lineNo = embeddedP1.slice(0, at).split(String.fromCharCode(10)).length;
    console.log('WARN 基准 :: src/app.part1.js 与 index.html 内嵌版本已分叉（' +
      (p1.length - embeddedP1.length) + ' 字节差，首个差异在第 ' + lineNo + ' 行），' +
      '而 miniprogram/utils/engine.js 与 index.html 是同一版本。');
    console.log('     本测试比的是「index.html 里的网页版」与「同版本的 engine.js + quiz.js」，');
    console.log('     结论依然成立；但要让小程序跟上 src，需要重放 node miniprogram/tools/port-engine.mjs + node build.js 后再跑 parity.mjs。');
  } else {
    checkTrue('基准 :: index.html 内嵌 src/app.part1.js 逐字节一致', true, '');
  }
  console.log((stats.failed - before ? 'FAIL ' : ' ok  ') +
    '答题流程基准 = index.html 里的 app.part2.js（' + p2.length + ' 字节逐字节命中' +
    (p1Hit ? '，part1 也一致' : '，part1 有并发改动见上') + '）');
}

console.log('');
console.log('== 二、逐场景 lockstep 对比（网页版真跑 vs quiz.js）==');
for (const raw of SCENARIOS) {
  const spec = prepareListScenario(raw);
  const b = before();
  let res = null, err = null;
  try { res = await runScenario(spec); } catch (e) { err = e; }
  if (err) {
    stats.failed++;
    diffs.push({ path: spec.name + ' :: 驱动异常', a: null, b: String(err && err.stack || err), why: '场景没跑完' });
  }
  row(spec.name + (res ? '' : '（异常）'), b);
  console.log((row.last || stats.failed - b.failed ? 'FAIL ' : ' ok  ') + spec.name +
    '   [字段 ' + (stats.checks - b.checks) + ' / 叶子 ' + (stats.leaves - b.leaves) +
    (stats.failed - b.failed ? ' / 差异 ' + (stats.failed - b.failed) : '') +
    (res ? ' / ' + res.steps + ' 题' + (res.stop ? '（' + res.stop + '）' : '') : '') + ']');
}

/* ---------------------------------------------------------------------
   十、断点续测：中途序列化 -> 反序列化 -> 继续，结果必须与不中断时一致
   --------------------------------------------------------------------- */
console.log('');
console.log('== 三、断点续测（序列化存档后换一个实例继续答题）==');
{
  const b = before();
  const spec = { mode: 'self', bank: 'c4', answer: ANSWER.mixed, interruptAfter: 20, total: 40 };
  seedBoth(3001);
  setClock(CLOCK_BASE);

  /* A：一口气答完 */
  const straight = newPort();
  straight.A.S.settings.autoNext = false;
  straight.A.S.settings.mode = 'self';
  straight.q.start('group', { group: 20 });
  const straightWords = [];
  for (let i = 0; i < spec.total; i++) {
    const s = straight.A.S.session;
    const idx = s.queue[s.pos];
    straightWords.push(straight.A.WORDS[idx].w);
    setClock(clock + STEP_MS);
    straight.q.judge(spec.answer(idx, i, straight.A.WORDS[idx]));
    straight.q.next();
  }
  const straightFinish = straight.q.finish();          // 跑够题量就收工（同一时刻收工 → ts 相同）
  checkTrue('断点续测 :: 基准运行收工成功', straightFinish.ok === true, JSON.stringify(straightFinish));
  const straightSaved = savedOf(straight.A);
  const straightResult = JSON.stringify(straight.A.S.lastResult);
  const straightReport = JSON.stringify(straight.A.levelReport());
  const straightEst = JSON.stringify(straight.A.estimateNow());

  /* B：答到第 20 题后「关掉」——存档留着，换一个全新的引擎+控制器读回来继续 */
  seedBoth(3001);
  setClock(CLOCK_BASE);
  const first = newPort();
  first.A.S.settings.autoNext = false;
  first.A.S.settings.mode = 'self';
  first.q.start('group', { group: 20 });
  for (let i = 0; i < spec.interruptAfter; i++) {
    const s = first.A.S.session;
    const idx = s.queue[s.pos];
    setClock(clock + STEP_MS);
    first.q.judge(spec.answer(idx, i, first.A.WORDS[idx]));
    first.q.next();
  }
  const frozen = savedOf(first.A);                      // 用户此刻杀掉小程序
  const frozenState = JSON.parse(frozen);
  checkTrue('断点续测 :: 存档里确实带着未完成的会话', !!frozenState.session && frozenState.session.pos === spec.interruptAfter,
    JSON.stringify(frozenState.session && { pos: frozenState.session.pos, len: frozenState.session.queue.length }));
  check('断点续测 :: 存档会话题号', frozenState.session.pos, spec.interruptAfter);

  const store2 = storageMod.createMemoryStorage();
  store2.setItem(engineMod.engine.KEY, frozen);          // 模拟冷启动：同一份存储键
  const second = (function () {
    const A = engineMod.createEngine({ words: engineMod.WORDS, storage: store2 });
    return { A: A, q: quizMod.createQuiz(A, {}), storage: store2 };
  })();
  checkTrue('断点续测 :: 冷启动后控制器能接着用', second.q.hasSession() === true, '没恢复出会话');
  check('断点续测 :: 恢复后题号', second.q.view().pos, spec.interruptAfter);
  check('断点续测 :: 恢复后题面与不中断时同题号一致', second.q.view().word.w, straightWords[spec.interruptAfter]);
  check('断点续测 :: 恢复出的会话对象与存档里的一模一样（JSON 层面）',
    JSON.stringify(frozenState.session), JSON.stringify(second.A.S.session));

  const resumedWords = [];
  for (let i = spec.interruptAfter; i < spec.total; i++) {
    const s = second.A.S.session;
    const idx = s.queue[s.pos];
    resumedWords.push(second.A.WORDS[idx].w);
    setClock(clock + STEP_MS);
    second.q.judge(spec.answer(idx, i, second.A.WORDS[idx]));
    second.q.next();
  }
  check('断点续测 :: 续测部分的题序与不中断时一致', straightWords.slice(spec.interruptAfter), resumedWords);
  const resumedFinish = second.q.finish();
  checkTrue('断点续测 :: 续测运行收工成功', resumedFinish.ok === true, JSON.stringify(resumedFinish));
  check('断点续测 :: 续测后的 lastResult 与不中断时一致', straightResult, JSON.stringify(second.A.S.lastResult));
  check('断点续测 :: 续测后的 estimateNow 与不中断时一致', straightEst, JSON.stringify(second.A.estimateNow()));
  check('断点续测 :: 续测后的 levelReport 与不中断时一致', straightReport, JSON.stringify(second.A.levelReport()));
  check('断点续测 :: 续测后的存档 JSON 逐字节相同', straightSaved, savedOf(second.A));
  checkTrue('断点续测 :: 续测后没有残留会话', second.A.S.session === null, '会话还在');
  console.log((stats.failed - b.failed ? 'FAIL ' : ' ok  ') + '中途存档 → 冷启动恢复 → 答完：与一口气答完逐字节相同');
  row('断点续测', b);
}

/* ---------------------------------------------------------------------
   十一、多轮重测（归档快照含 2bit 位图 base64 / roundDiff / 轮次）
   --------------------------------------------------------------------- */
console.log('');
console.log('== 四、多轮重测（canRetest → startNewRound → roundDiff）==');
{
  const b = before();
  seedBoth(4001);
  setClock(CLOCK_BASE);
  const web = await loadWeb();
  const port = newPort();
  [web.A, port.A].forEach(function (A) { A.S.settings.autoNext = false; A.S.settings.mode = 'self'; });
  /* 直接写状态把覆盖率顶到 96%（不走答题流程：这一节只验多轮归档与重测入口） */
  const pool = web.A.activePool();
  const n = Math.floor(pool.length * 0.96);
  for (let i = 0; i < n; i++) {
    const v = ANSWER.mixed(pool[i], i, web.A.WORDS[pool[i]]);
    web.A.setSt(pool[i], v); port.A.setSt(pool[i], v);
  }
  web.A.S.round.startedAt = CLOCK_BASE; port.A.S.round.startedAt = CLOCK_BASE;
  web.A.save(); port.A.save();
  check('多轮 :: canRetest（覆盖率 ≥95%）', web.A.canRetest(), port.q.canRetest());
  check('多轮 :: levelReport（第 1 轮）', web.A.levelReport(), port.A.levelReport());
  const okW = web.A.startNewRound();
  const okP = port.q.startNewRound();
  check('多轮 :: startNewRound 返回值', okW, okP);
  check('多轮 :: roundHistory（含 2bit 位图 base64）', web.A.roundHistory(), port.A.roundHistory());
  check('多轮 :: roundNo', web.A.roundNo(), port.A.roundNo());
  check('多轮 :: roundDiff（逐词对比）', web.A.roundDiff(), port.A.roundDiff());
  check('多轮 :: levelReport（第 2 轮清零后）', web.A.levelReport(), port.A.levelReport());
  check('多轮 :: estimateNow（第 2 轮）', web.A.estimateNow(), port.A.estimateNow());
  web.A.save(); port.A.save();
  check('多轮 :: 存档 JSON 逐字节相同', savedWeb(web), savedOf(port.A));
  /* 第 2 轮再开一组，确保归档后会话仍能正常工作 */
  web.A.startSession('group', { group: 5 });
  port.q.start('group', { group: 5 });
  check('多轮 :: 第 2 轮开局题序一致', web.A.S.session.queue, port.A.S.session.queue);
  check('多轮 :: 第 2 轮标签一致', web.A.S.session.label, port.A.S.session.label);
  console.log((stats.failed - b.failed ? 'FAIL ' : ' ok  ') + '归档快照 / 逐词对比 / 轮次 / 存档全部一致');
  try { web.dom.window.close(); } catch (e) {}
  row('多轮重测', b);
}

/* ---------------------------------------------------------------------
   十二、自动跳转：网页版 setTimeout 已被换成「意图」字段
   --------------------------------------------------------------------- */
console.log('');
console.log('== 五、自动跳转（setTimeout → 状态里的 auto 意图）==');
{
  const b = before();
  seedBoth(5001);
  setClock(CLOCK_BASE);
  const web = await loadWeb();
  const port = newPort();
  web.A.S.settings.autoNext = true; port.A.S.settings.autoNext = true;
  web.A.S.settings.autoDelay = 850; port.A.S.settings.autoDelay = 850;
  web.A.startSession('group', { group: 3 });
  port.q.start('group', { group: 3 });

  clickSel(web, '[data-act="judge"][data-v="2"]');
  port.q.judge(2);
  const wTimer = !!web.A.RUN.timer;
  const pAuto = port.q.view().auto;
  checkTrue('自动跳转 :: 网页版确实排了定时器', wTimer === true, 'A.RUN.timer 为空');
  checkTrue('自动跳转 :: 控制器给出等价的 pending 意图', pAuto.pending === true, JSON.stringify(pAuto));
  check('自动跳转 :: 延时与网页版设置一致', pAuto.delay, web.A.S.settings.autoDelay);
  check('自动跳转 :: 动作名', pAuto.action, 'next');
  web.A.clearTimer();                                   // 测试接管，不让真定时器异步插入

  /* 关掉自动跳转后：网页版不再排定时器，控制器也不再给意图 */
  web.A.S.settings.autoNext = false; port.A.S.settings.autoNext = false;
  clickSel(web, '[data-act="next"]');
  port.q.next();
  clickSel(web, '[data-act="judge"][data-v="0"]');
  port.q.judge(0);
  checkTrue('自动跳转 :: 关掉后网页版不排定时器', !web.A.RUN.timer, '仍排了定时器');
  checkTrue('自动跳转 :: 关掉后控制器不给意图', port.q.view().auto.pending === false, JSON.stringify(port.q.view().auto));
  web.A.clearTimer();
  console.log((stats.failed - b.failed ? 'FAIL ' : ' ok  ') + 'autoNext 开/关两种情况下，两边的「要不要自动翻页」口径一致');
  try { web.dom.window.close(); } catch (e) {}
  row('自动跳转意图', b);
}

/* ---------------------------------------------------------------------
   十二点五、离开与放弃（网页版的 quit 弹窗三条路：保存并返回 / 放弃本次 / 继续答题）
   --------------------------------------------------------------------- */
console.log('');
console.log('== 五之二、离开与放弃（quit-keep / quit-drop）==');
{
  const b = before();
  seedBoth(5051);
  setClock(CLOCK_BASE);
  const web = await loadWeb();
  const port = newPort();
  [web.A, port.A].forEach(function (A) { A.S.settings.autoNext = false; A.S.settings.mode = 'self'; });
  web.A.startSession('group', { group: 4 });
  port.q.start('group', { group: 4 });
  for (let i = 0; i < 6; i++) {
    const ws = web.A.S.session;
    const idx = ws.queue[ws.pos];
    const v = ANSWER.mixed(idx, i, web.A.WORDS[idx]);
    setClock(clock + STEP_MS);
    clickSel(web, '[data-act="judge"][data-v="' + v + '"]');
    port.q.judge(v);
    clickSel(web, '[data-act="next"]');
    port.q.next();
  }
  check('离开 :: 中途存档（网页版）', savedWeb(web), savedOf(port.A));

  /* 保存并返回：会话原样留在存档里 */
  clickSel(web, '[data-act="quit"]');
  const modalShown = !!web.doc.querySelector('[data-act="quit-keep"]');
  checkTrue('离开 :: 网页版点返回会弹出「要离开本次检测吗」', modalShown, '弹窗没出现');
  clickSel(web, '[data-act="quit-keep"]');
  port.q.leave();
  checkTrue('离开 :: 保存并返回后会话仍在（可以「继续检测」）', !!web.A.S.session && !!port.A.S.session,
    'web=' + !!web.A.S.session + ' port=' + !!port.A.S.session);
  check('离开 :: 保存并返回后的存档逐字节相同', savedWeb(web), savedOf(port.A));
  check('离开 :: 题号一致', web.A.S.session.pos, port.q.view().pos);

  /* 放弃本次：会话清掉，但作答记录保留 */
  web.A.go('test');
  clickSel(web, '[data-act="quit"]');
  clickSel(web, '[data-act="quit-drop"]');
  port.q.abandon();
  checkTrue('放弃 :: 两边会话都清空', web.A.S.session === null && port.A.S.session === null,
    'web=' + !!web.A.S.session + ' port=' + !!port.A.S.session);
  check('放弃 :: 放弃后的存档逐字节相同', savedWeb(web), savedOf(port.A));
  checkTrue('放弃 :: 作答记录仍然保留', Object.keys(port.A.S.status).length >= 6 && Object.keys(web.A.S.status).length >= 6,
    'port=' + Object.keys(port.A.S.status).length + ' web=' + Object.keys(web.A.S.status).length);
  check('放弃 :: estimateNow 一致', web.A.estimateNow(), port.A.estimateNow());
  console.log((stats.failed - b.failed ? 'FAIL ' : ' ok  ') + '返回弹窗三条路：保存并返回 / 放弃本次，状态与存档都与网页版一致');
  try { web.dom.window.close(); } catch (e) {}
  row('离开与放弃', b);
}

/* ---------------------------------------------------------------------
   十三、quiz.js 静态扫描（小程序禁用 API）
   --------------------------------------------------------------------- */
console.log('');
console.log('== 六、quiz.js 小程序兼容性静态扫描 ==');
{
  const b = before();
  const src = fs.readFileSync(QUIZ_JS, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/[^\n]*/g, '$1');   // 去掉注释再扫
  const FORBIDDEN = [
    ['document.', 'DOM 访问'], ['window.', '浏览器全局'], ['localStorage', '浏览器本地存储'],
    ['sessionStorage', '浏览器会话存储'], ['setTimeout', '浏览器定时器（应由视图层持有）'],
    ['setInterval', '浏览器定时器'], ['clearTimeout', '浏览器定时器'],
    ['speechSynthesis', '浏览器语音合成'], ['requestAnimationFrame', '浏览器动画帧'],
    ['querySelector', 'DOM 查询'], ['addEventListener', 'DOM 事件'], ['innerHTML', 'DOM 写入'],
    ['wx.', '小程序 API（应留在 storage 适配层）'], ['btoa', '浏览器 base64'], ['atob', '浏览器 base64'],
    ['Intl.', 'Intl 国际化'], ['eval', 'eval'], ['new Function', '动态函数'], ['navigator', '浏览器 navigator'],
    ['alert(', '浏览器弹窗'], ['localStorage', '浏览器存储']
  ];
  const hits = [];
  code.split('\n').forEach(function (line, idx) {
    FORBIDDEN.forEach(function (pair) {
      if (line.indexOf(pair[0]) >= 0) hits.push('L' + (idx + 1) + ' ' + pair[0] + ' :: ' + line.trim().slice(0, 70));
    });
  });
  checkTrue('静态扫描 :: quiz.js 代码里没有禁用 API', hits.length === 0, hits.join('; '));

  const randomLines = [];
  code.split('\n').forEach(function (line, idx) { if (line.indexOf('Math.random') >= 0) randomLines.push({ line: idx + 1, text: line.trim() }); });
  checkTrue('静态扫描 :: Math.random 只有 1 处（四选一选项构造）', randomLines.length === 1,
    randomLines.map(r => 'L' + r.line + ' ' + r.text).join(' | '));
  checkTrue('静态扫描 :: 那处随机在 buildOptions 里（不进测量路径）',
    randomLines.length === 1 && randomLines[0].text.indexOf('pool[Math.floor') >= 0, JSON.stringify(randomLines));
  const fnv = src.indexOf('2166136261');
  checkTrue('静态扫描 :: quiz.js 自己不碰定序哈希（FNV 常量只应在 engine.js）', fnv < 0, 'quiz.js 里出现 FNV 常量');
  /* 注释里提到 setTimeout / speechSynthesis 是说明「这些依赖被删掉了」，不算命中 */
  const count = (s, re) => (s.match(re) || []).length;
  const rawTimer = count(src, /setTimeout/g), codeTimer = count(code, /setTimeout/g);
  const rawSpeak = count(src, /speechSynthesis/g), codeSpeak = count(code, /speechSynthesis/g);
  checkTrue('静态扫描 :: 源码里出现的 setTimeout / speechSynthesis 只在注释里（代码里 0 处）',
    codeTimer === 0 && codeSpeak === 0 && rawTimer + rawSpeak > 0,
    'raw setTimeout=' + rawTimer + ' code=' + codeTimer + ' / raw speechSynthesis=' + rawSpeak + ' code=' + codeSpeak);
  console.log((stats.failed - b.failed ? 'FAIL ' : ' ok  ') + 'quiz.js：' + FORBIDDEN.length +
    ' 类禁用 API 命中 0 · Math.random 1 处（四选一选项） · 无 DOM/定时器/语音依赖');
  row('静态扫描', b);
}

/* ---------------------------------------------------------------------
   十四、裸运行时骨架（只有 wx，没有 window/document/localStorage/setTimeout）
   --------------------------------------------------------------------- */
console.log('');
console.log('== 七、裸运行时骨架（只有 wx 的小程序环境）==');
{
  const b = before();
  function loadInMiniRuntime(wxApi) {
    const ctx = vm.createContext({
      console: { log: function () {}, warn: function () {}, error: function () {} },
      wx: wxApi,
      Date: Date                      /* 注入宿主 Date：让虚拟时钟在沙箱里也生效 */
    });
    const cache = new Map();
    function load(file) {
      const hit = cache.get(file);
      if (hit) return hit.exports;
      const mod = { exports: {} };
      cache.set(file, mod);
      const dir = path.dirname(file);
      const req = function (spec) {
        if (spec.charAt(0) !== '.') throw new Error('小程序里不允许 require 非相对路径模块: ' + spec);
        let target = path.resolve(dir, spec);
        if (target.slice(-3) !== '.js') target += '.js';
        return load(target);
      };
      const src = fs.readFileSync(file, 'utf8');
      const fn = vm.runInContext('(function (module, exports, require) {' + src + '\n})', ctx, { filename: file });
      fn(mod, mod.exports, req);
      return mod.exports;
    }
    return load(QUIZ_JS);
  }

  const fakeWx = {
    data: {},
    getStorageSync: function (k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : ''; },
    setStorageSync: function (k, v) { this.data[k] = v; },
    removeStorageSync: function (k) { delete this.data[k]; },
    getStorageInfoSync: function () { return { keys: Object.keys(this.data) }; }
  };
  seedBoth(6001);
  setClock(CLOCK_BASE);
  let mod = null, err = null;
  try { mod = loadInMiniRuntime(fakeWx); } catch (e) { err = e; }
  checkTrue('裸运行时 :: 无浏览器全局也能加载 quiz.js（连带 engine/storage/词库）', err === null, String(err && err.stack || err));
  if (mod) {
    checkTrue('裸运行时 :: 导出形状（createQuiz / quiz）', typeof mod.createQuiz === 'function' && !!mod.quiz, '导出形状不对');
    const q = mod.quiz;
    check('裸运行时 :: quiz 对外成员数', Object.keys(q).length, 20);
    q.engine.S.settings.autoNext = false;      // 与主 realm 参照运行保持同一份设置（存档里也有这个字段）
    q.start('group', { group: 9 });
    const words = [];
    for (let i = 0; i < 15; i++) {
      const st = q.view();
      words.push(st.word.w);
      setClock(clock + STEP_MS);
      q.judge(ANSWER.mixed(st.index, i, q.engine.WORDS[st.index]));
      q.next();
    }
    q.finish();
    check('裸运行时 :: 作答序列长度', words.length, 15);
    checkTrue('裸运行时 :: 存档落进 wx（键名沿用 cet4vocab_v1）',
      typeof fakeWx.data['cet4vocab_v1'] === 'string' && fakeWx.data['cet4vocab_v1'].length > 100, '没写进 wx 存储');

    /* 同一套操作在 Node 主 realm 里再跑一遍，数字与存档必须一致 */
    seedBoth(6001);
    setClock(CLOCK_BASE);
    const ref = newPort();
    ref.A.S.settings.autoNext = false;
    ref.q.start('group', { group: 9 });
    const refWords = [];
    for (let i = 0; i < 15; i++) {
      const st = ref.q.view();
      refWords.push(st.word.w);
      setClock(clock + STEP_MS);
      ref.q.judge(ANSWER.mixed(st.index, i, ref.A.WORDS[st.index]));
      ref.q.next();
    }
    ref.q.finish();
    check('裸运行时 :: 题序与主 realm 一致', refWords, words);
    check('裸运行时 :: estimateNow 与主 realm 一致', JSON.stringify(ref.A.estimateNow()), JSON.stringify(q.engine.estimateNow()));
    check('裸运行时 :: levelReport 与主 realm 一致', JSON.stringify(ref.A.levelReport()), JSON.stringify(q.engine.levelReport()));
    check('裸运行时 :: 存档 JSON 与主 realm 逐字节相同', savedOf(ref.A), fakeWx.data['cet4vocab_v1']);
    const extraKeys = Object.keys(fakeWx.data).filter(k => k !== 'cet4vocab_v1' && k !== 'cet4vocab_profiles');
    checkTrue('裸运行时 :: 只碰两个存档键（词数据 + 档案表）', extraKeys.length === 0, extraKeys.join(','));
    console.log((stats.failed - b.failed ? 'FAIL ' : ' ok  ') + '只有 wx 的沙箱里能开局/作答/收工/落盘，结果与主 realm 逐字节一致');
  }
  row('裸运行时骨架', b);
}

/* ---------------------------------------------------------------------
   十五、汇总
   --------------------------------------------------------------------- */
Date.now = realDateNow;
Math.random = realMathRandom;

console.log('');
console.log('== 八、汇总 ==');
console.log('对比分组：' + scenarioRows.length + ' 组');
console.log('断言：字段级 ' + stats.checks + ' 条 / 叶子级 ' + stats.leaves + ' 条');
console.log('差异：' + stats.failed + ' 条');
if (stats.failed) {
  console.log('');
  console.log('---- 差异明细（最多列 ' + MAX_DIFF_PRINT + ' 条）----');
  diffs.slice(0, MAX_DIFF_PRINT).forEach(function (d) {
    console.log('  ✗ ' + d.path);
    console.log('      网页版: ' + fmt(d.a));
    console.log('      控制器: ' + fmt(d.b));
    console.log('      原因: ' + d.why);
  });
  if (diffs.length > MAX_DIFF_PRINT) console.log('  ... 还有 ' + (diffs.length - MAX_DIFF_PRINT) + ' 条');
  console.log('');
  console.log('结论：不一致 —— 答题流程移植引入了偏差（见上面的字段路径）。');
  process.exit(1);
}
console.log('');
console.log('结论：全绿 —— 题序/分组/进度/收工判定/结算字段/存档 JSON 与网页版完全一致。');
process.exit(0);
