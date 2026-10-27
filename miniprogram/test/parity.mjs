#!/usr/bin/env node
/* ======================================================================
   parity.mjs —— 引擎移植一致性测试（网页版 vs 小程序版）
   ----------------------------------------------------------------------
   做法：在同一进程里同时加载两份实现、喂完全相同的确定性作答序列，
   然后逐字段比较它们吐出来的每一个数字。

     左边（基准）：原始 src/app.part1.js —— 用 vm 沙箱提供 window / document /
                   localStorage / console / btoa / atob 等浏览器环境。
     右边（移植）：miniprogram/utils/engine.js —— createEngine({ words, storage })，
                   storage 用内存实现，保证起点与浏览器空存档一致。

   为什么要这么比：数值不能靠肉眼看，也不能靠「跑一遍没报错」。
   任何一处漏改（比如某个频段权重、某个 |0 取整、某个 fpc 边界）都会在这里显形。

   运行： node miniprogram/test/parity.mjs
   退出码 0 = 全绿；非 0 = 有差异（差异会逐条打印字段路径、两边取值）。
   ====================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MP = path.resolve(HERE, '..');            // miniprogram/
const ROOT = path.resolve(MP, '..');            // 项目根
const SRC_PART1 = path.join(ROOT, 'src', 'app.part1.js');
const WORDS_JSON = path.join(ROOT, 'words.json');
const ENGINE_JS = path.join(MP, 'utils', 'engine.js');
const WORDS_DATA_JS = path.join(MP, 'utils', 'words-data.js');
const STORAGE_JS = path.join(MP, 'utils', 'storage.js');

const engineMod = require(ENGINE_JS);
const storageMod = require(STORAGE_JS);
const wordsData = require(WORDS_DATA_JS);
const createEngine = engineMod.createEngine;
const createMemoryStorage = storageMod.createMemoryStorage;
const createWxStorage = storageMod.createWxStorage;

const FIXED_TS = 1700000000000;      // 时间戳归一用：两边各自 Date.now() 不可比

/* ---------------------------------------------------------------------
   一、断言与逐字段比较的脚手架
   --------------------------------------------------------------------- */
const stats = { checks: 0, leaves: 0, failed: 0 };
const diffs = [];
const MAX_DIFF_PRINT = 80;

function fmt(v) {
  if (typeof v === 'string') return JSON.stringify(v.length > 80 ? v.slice(0, 80) + '...' : v);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) return String(v);
  try { return JSON.stringify(v).slice(0, 160); } catch (e) { return String(v); }
}

function fail(p, a, b, why) {
  stats.failed++;
  diffs.push({ path: p, a: a, b: b, why: why });
}

function kindOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/* 逐字段深比较：数值按 === 比（不做任何容差 —— 要求的就是完全相等）
   两边都是 NaN 视为相等；-0 与 0 视为相等（JSON 里也分不出来）。 */
function cmp(p, a, b) {
  const ka = kindOf(a), kb = kindOf(b);
  if (ka !== kb) { fail(p, a, b, '类型不同 ' + ka + ' vs ' + kb); return; }
  if (ka === 'array') {
    if (a.length !== b.length) { fail(p + '.length', a.length, b.length, '长度不同'); }
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) cmp(p + '[' + i + ']', a[i], b[i]);
    return;
  }
  if (ka === 'object') {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    const onlyA = keysA.filter(function (k) { return keysB.indexOf(k) < 0; });
    const onlyB = keysB.filter(function (k) { return keysA.indexOf(k) < 0; });
    if (onlyA.length) fail(p, onlyA, null, '左边独有字段');
    if (onlyB.length) fail(p, null, onlyB, '右边独有字段');
    keysA.forEach(function (k) { if (keysB.indexOf(k) >= 0) cmp(p + '.' + k, a[k], b[k]); });
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
  if (ka === 'function') return;   // 函数不比内容（引擎对外不暴露回调实现）
  if (a === b) return;
  fail(p, a, b, '取值不等');
}

function check(p, a, b) {
  stats.checks++;
  cmp(p, a, b);
}

function checkTrue(p, cond, detail) {
  stats.checks++;
  stats.leaves++;
  if (!cond) fail(p, true, false, detail || '断言失败');
}

/* ---------------------------------------------------------------------
   二、加载「基准」：原始 src/app.part1.js（在 vm 沙箱里补浏览器环境）
   --------------------------------------------------------------------- */
function readSource() {
  return fs.readFileSync(SRC_PART1, 'utf8');
}

function loadOriginal(words, existingStore) {
  const src = readSource();
  const store = existingStore || new Map();
  const noop = function () {};
  const sandbox = {
    /* 网页版把词库挂在全局；这里直接给同一份数组 */
    window: { WORDS: words },
    document: {
      getElementById: function () { return null; },
      body: { childNodes: [], removeChild: noop },
      querySelectorAll: function () { return []; }
    },
    localStorage: {
      getItem: function (k) { return store.has(k) ? store.get(k) : null; },
      setItem: function (k, v) { store.set(k, String(v)); },
      removeItem: function (k) { store.delete(k); }
    },
    console: { log: noop, warn: noop, error: noop },
    setTimeout: function () { return 0; },
    clearTimeout: noop,
    btoa: function (s) { return Buffer.from(s, 'binary').toString('base64'); },
    atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'src/app.part1.js' });
  const A = sandbox.window.__APP__;
  A.__store = store;         // 测试专用：读原始实现的存档
  A.__sandbox = sandbox;
  return A;
}

/* ---------------------------------------------------------------------
   三、加载「移植版」
   --------------------------------------------------------------------- */
function newPort(options) {
  options = options || {};
  const storage = options.storage || createMemoryStorage();
  const A = createEngine({ words: wordsData, storage: storage });
  A.__storage = storage;
  return A;
}

/* ---------------------------------------------------------------------
   四、作答序列（全部是词本身内容的确定性函数，不含任何随机数）
   --------------------------------------------------------------------- */
function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h >>> 0;
}

const ANSWER = {
  /* 全认识 */
  allKnown: function () { return 2; },
  /* 全不认识 */
  allNone: function () { return 0; },
  /* 不作答（只要样本口径的场景） */
  skip: function () { return undefined; },
  /* 中等掌握：按词的哈希分布 40% 认识 / 20% 模糊 / 40% 不认识 */
  mixed: function (i, n, w) {
    const h = fnv1a(w.w) % 100;
    return h < 40 ? 2 : (h < 60 ? 1 : 0);
  },
  /* 极端低频差：最高频几乎都会，10k-20k 段几乎全不会 */
  lowBandWeak: function (i, n, w) {
    const b = w.f || 0, h = fnv1a(w.w) % 100;
    if (b === 1) return h < 88 ? 2 : 1;
    if (b === 2) return h < 72 ? 2 : (h < 88 ? 1 : 0);
    if (b === 3) return h < 50 ? 2 : (h < 70 ? 1 : 0);
    if (b === 4) return h < 30 ? 2 : (h < 50 ? 1 : 0);
    if (b === 5) return h < 14 ? 2 : (h < 26 ? 1 : 0);
    if (b === 6) return h < 4 ? 1 : 0;
    return h < 2 ? 1 : 0;
  },
  /* 最高频 1k 段全灭：专门打 RANK_CAPS 的封顶分支 */
  topBandCollapse: function (i, n, w) {
    const b = w.f || 0, h = fnv1a(w.w) % 100;
    if (b === 1) return 0;
    return h < 84 ? 2 : 1;
  },
  /* 模糊偏多：让 fuzzyShare 走极端 */
  fuzzyHeavy: function (i, n, w) {
    const h = fnv1a(w.w) % 100;
    return h < 10 ? 2 : (h < 70 ? 1 : 0);
  }
};

/* ---------------------------------------------------------------------
   五、把一个引擎推进到指定场景状态
   --------------------------------------------------------------------- */
function resetState(A, spec) {
  A.S.status = {};
  A.S.samples = [];
  A.S.history = [];
  A.S.session = null;
  A.S.lastResult = null;
  if (!spec.keepRounds) A.S.rounds = [];
  A.S.settings.bank = spec.bank || 'c4';
  A.S.settings.strict = !!spec.strict;
  A.S.settings.includeExt = !!spec.includeExt;
  A.S.settings.mode = spec.mode || 'self';
  A.invalidateWordCaches();
}

/* 确定性的分层样本：每段等距抽 take 个词，用 mixed 判分。
   注意这里**不能**用 A.probeQueue()（它内部有洗牌），否则两边样本不同。 */
function makeSample(A, opt) {
  const pool = A.activePool();
  const byBand = {};
  for (let n = 0; n < pool.length; n++) {
    const i = pool[n], b = A.bandOf(i);
    (byBand[b] || (byBand[b] = [])).push(i);
  }
  const log = [];
  Object.keys(byBand).map(Number).sort(function (x, y) { return x - y; }).forEach(function (b) {
    const arr = byBand[b];
    const take = Math.min(arr.length, opt.perBand);
    for (let k = 0; k < take; k++) {
      const i = arr[Math.floor(k * arr.length / take)];
      log.push({ i: i, v: (opt.answer || ANSWER.mixed)(i, k, A.WORDS[i]) });
    }
  });
  const st = A.probeStats({ log: log });
  let k = 0, f = 0;
  log.forEach(function (e) { if (e.v === 2) k++; else if (e.v === 1) f++; });
  return {
    n: log.length, k: k, f: f, pre: opt.pre || 0,
    bank: opt.bank || A.bankKey(),
    mode: opt.mode || 'self',
    bands: st.data || null
  };
}

function drive(A, spec) {
  resetState(A, spec);
  const pool = A.activePool();
  let limit = pool.length;
  if (typeof spec.limitRatio === 'number') limit = Math.floor(pool.length * spec.limitRatio);
  else if (typeof spec.limit === 'number') limit = Math.min(spec.limit, pool.length);
  const answer = spec.answer || ANSWER.skip;
  for (let n = 0; n < limit; n++) {
    const i = pool[n];
    const v = answer(i, n, A.WORDS[i]);
    if (v !== undefined) A.setSt(i, v);
  }
  (spec.samples || []).forEach(function (o) { A.addSample(makeSample(A, o)); });
  /* 时间戳归一：两边各自 Date.now()，不归一化就无法逐字段比 */
  (A.S.samples || []).forEach(function (s, i) { s.ts = FIXED_TS + i; });
  if (A.S.round) A.S.round.startedAt = FIXED_TS;
  return A;
}

/* ---------------------------------------------------------------------
   六、取一份「引擎快照」：把要对比的东西一次性算出来
   --------------------------------------------------------------------- */
/* 统一读取「存档落盘后的字符串」：网页版走沙箱里的 localStorage，移植版走适配层 */
function readSaved(A) {
  const store = A.storage || (A.__sandbox && A.__sandbox.localStorage);
  return store.getItem(A.KEY);
}

function snapshot(A) {
  const pool = A.activePool();
  const map = A.vocabMap();
  const fixedBands = {
    0: { N: 1000, n: 30, k: 3, f: 6 },
    1: { N: 452, n: 40, k: 30, f: 5 },
    6: { N: 620, n: 25, k: 1, f: 2 }
  };
  const loose = A.scoreBands(fixedBands, false);
  const strict = A.scoreBands(fixedBands, true);
  const unguessed = A.unguessBands(loose, 4);
  return {
    /* --- 词池与定序（FNV-1a 定序的表征） --- */
    poolLen: pool.length,
    poolChecksum: pool.reduce(function (s, x) { return (s + x * (pool.length - x)) % 2147483647; }, 0),
    poolHead: pool.slice(0, 40),
    poolTail: pool.slice(-40),
    curPoolSize: A.curPoolSize(),
    bankKey: A.bankKey(),
    bankName: A.bankName(),
    bankShort: A.bankShort(),
    bankHint: A.bankHint(),
    bankCounts: A.bankCounts(),
    groupsLen: A.groups().length,
    coreGroupsCount: A.coreGroupsCount(),
    firstGroup: A.groups()[0] || null,
    lastGroup: A.groups()[A.groups().length - 1] || null,

    /* --- 频段与描述统计 --- */
    bandSizes: A.bandSizes(),
    tally: A.tally(pool),
    bandOfHead: pool.slice(0, 40).map(function (i) { return A.bandOf(i); }),
    getStHead: pool.slice(0, 40).map(function (i) { return A.getSt(i); }),
    keyOfHead: pool.slice(0, 20).map(function (i) { return A.keyOf(i); }),

    /* --- 统计核心（纯函数，喂固定输入） --- */
    stratMath: {
      loose: loose, strict: strict, unguessed: unguessed,
      estLoose: A.stratEstimate(loose, 4540),
      estStrict: A.stratEstimate(strict, 4540),
      estUnguessed: A.stratEstimate(unguessed, 4540),
      estEmpty: A.stratEstimate({}, 4540),
      estNoUniverse: A.stratEstimate(loose, 0),
      plain: A.estimate(40, 25, 4540),
      plainEmpty: A.estimate(0, 0, 4540),
      plainFpcBoundary: [A.estimate(4540, 2000, 4540), A.estimate(4540, 0, 4540), A.estimate(1, 0, 2)]
    },
    scoreOf: [A.scoreOf({ k: 10, f: 3 }, true), A.scoreOf({ k: 10, f: 3 }, false), A.scoreOf({ k: 0, f: 0 }, false)],

    /* --- 词汇量估计（含区间、两套口径） --- */
    estimateNow: A.estimateNow(),
    latestSample: A.latestSample(),

    /* --- 频段剖面 / 词汇地图 --- */
    bandProfile: A.bandProfile(),
    vocabMap: {
      testedCells: map.testedCells, untestedCells: map.untestedCells,
      cellsWithWords: map.cellsWithWords, letters: map.letters,
      rows: map.rows, hot: map.hot
    },
    mapCellWords_1_A: A.mapCellWords(1, 'A'),
    mapCellWords_6_Z: A.mapCellWords(6, 'Z'),
    untestedCount: A.untestedWords().length,

    /* --- 完整报告 / census / 等级体系 --- */
    censusBands: A.censusBands(pool),
    censusBandsSubset: A.censusBands(pool.slice(0, 137)),
    levelReport: A.levelReport(),
    canRetest: A.canRetest(),
    roundNo: A.roundNo(),
    roundHistory: A.roundHistory(),
    rankAt: [0, 0.49, 0.5, 0.649, 0.65, 0.749, 0.75, 0.849, 0.85, 0.919, 0.92, 1].map(function (r) { return A.rankAt(r); }),
    RANKS: A.RANKS,
    RANK_CAPS: A.RANK_CAPS,
    RANK_REFS: A.RANK_REFS,
    BAND_NAMES: A.BAND_NAMES,
    MAP_BANDS: A.MAP_BANDS,
    freqRank: [0, 1, 2, 3, 4, 5, 6, 9].map(function (b) { return A.freqRank(b); }),
    levelText: [0, 1499, 1500, 2499, 2500, 3499, 3500, 4199, 4200, 7175].map(function (v) { return A.levelText(v); }),

    /* --- 界面要用的纯计算（不该受移植影响） --- */
    needFor: [150, 250, 400].map(function (h) { return A.needFor(h); }),
    minsText: [20, 50, 100, 250].map(function (n) { return A.minsText(n); }),
    aiQuota: A.aiQuota(),

    /* --- 存档落到存储里的样子（存储适配层一致性） --- */
    savedState: (function () {
      A.save();
      const raw = readSaved(A);
      return raw;
    })()
  };
}
/* ---------------------------------------------------------------------
   七、场景表：把「全认识 / 全不认识 / 中等 / 极端低频差 / 不同题量 / 两套口径」
       以及边界（覆盖率刚好在 95% 阈值两侧、样本 n<20、蒙对校正、跨词库样本过滤）全覆盖
   --------------------------------------------------------------------- */
const SCENARIOS = [
  { name: '全认识 · 四级 · 折中口径', bank: 'c4', strict: false, answer: ANSWER.allKnown },
  { name: '全认识 · 四级 · 严格口径', bank: 'c4', strict: true, answer: ANSWER.allKnown },
  { name: '全不认识 · 四级 · 折中口径', bank: 'c4', strict: false, answer: ANSWER.allNone },
  { name: '全不认识 · 四级 · 严格口径', bank: 'c4', strict: true, answer: ANSWER.allNone },
  { name: '中等掌握 · 四级 · 折中口径', bank: 'c4', strict: false, answer: ANSWER.mixed },
  { name: '中等掌握 · 四级 · 严格口径', bank: 'c4', strict: true, answer: ANSWER.mixed },
  { name: '中等掌握 · 六级 · 折中口径', bank: 'c6', strict: false, answer: ANSWER.mixed },
  { name: '中等掌握 · 含拓展派生词 · 折中', bank: 'c4', strict: false, includeExt: true, answer: ANSWER.mixed },
  { name: '极端低频差 · 四级 · 折中口径', bank: 'c4', strict: false, answer: ANSWER.lowBandWeak },
  { name: '极端低频差 · 六级 · 折中口径', bank: 'c6', strict: false, answer: ANSWER.lowBandWeak },
  { name: '地基封顶（最高频 1k 全灭）', bank: 'c4', strict: false, answer: ANSWER.topBandCollapse },
  { name: '模糊偏多（fuzzyShare 极端）', bank: 'c4', strict: false, answer: ANSWER.fuzzyHeavy },
  { name: '题量 300 · 中等（抽样口径 none）', bank: 'c4', strict: false, answer: ANSWER.mixed, limit: 300 },
  { name: '题量 1000 · 中等（抽样口径 none）', bank: 'c4', strict: false, answer: ANSWER.mixed, limit: 1000 },
  { name: '覆盖率 94%（差一点不到 95% 阈值）', bank: 'c4', strict: false, answer: ANSWER.mixed, limitRatio: 0.94 },
  { name: '覆盖率 96%（走实测 full 口径）', bank: 'c4', strict: false, answer: ANSWER.mixed, limitRatio: 0.96 },
  { name: '覆盖率 96% · 严格口径', bank: 'c4', strict: true, answer: ANSWER.mixed, limitRatio: 0.96 },
  { name: '纯随机样本 · 自评模式(self)', bank: 'c4', strict: false, answer: ANSWER.skip,
    samples: [{ perBand: 14 }] },
  { name: '纯随机样本 · 四选一扣蒙对(choice)', bank: 'c4', strict: false, answer: ANSWER.skip,
    samples: [{ perBand: 14, mode: 'choice' }] },
  { name: '纯随机样本 · 严格口径', bank: 'c4', strict: true, answer: ANSWER.skip,
    samples: [{ perBand: 14 }] },
  { name: '随机样本 + 少量分组作答 · 复习效应提示', bank: 'c4', strict: false, answer: ANSWER.mixed,
    limit: 120, samples: [{ perBand: 12, pre: 40 }] },
  { name: '六级 · 随机样本 · choice', bank: 'c6', strict: false, answer: ANSWER.skip,
    samples: [{ perBand: 14, mode: 'choice' }] },
  { name: '样本 n<20（不给数字）', bank: 'c4', strict: false, answer: ANSWER.skip,
    samples: [{ perBand: 1 }] },
  { name: '样本跨词库过滤（六级看不到四级样本）', bank: 'c6', strict: false, answer: ANSWER.skip,
    samples: [{ perBand: 12, bank: 'c4' }] },
  { name: '两条样本取最新（c4 + c6）', bank: 'c6', strict: false, answer: ANSWER.skip,
    samples: [{ perBand: 10, bank: 'c4' }, { perBand: 10, bank: 'c6', mode: 'choice' }] },
  { name: '样本条数上限（>20 条截断）', bank: 'c4', strict: false, answer: ANSWER.skip,
    samples: [
      { perBand: 3 }, { perBand: 3 }, { perBand: 3 }, { perBand: 3 }, { perBand: 3 },
      { perBand: 3 }, { perBand: 3 }, { perBand: 3 }, { perBand: 3 }, { perBand: 3 },
      { perBand: 3 }, { perBand: 3 }, { perBand: 3 }, { perBand: 3 }, { perBand: 3 },
      { perBand: 3 }, { perBand: 3 }, { perBand: 3 }, { perBand: 3 }, { perBand: 3 },
      { perBand: 3 }, { perBand: 3 }
    ] },
  { name: '混合：中等掌握 + 一条 choice 样本', bank: 'c4', strict: false, answer: ANSWER.mixed,
    limit: 800, samples: [{ perBand: 10, mode: 'choice', pre: 25 }] }
];

/* ---------------------------------------------------------------------
   八、跑场景对比
   --------------------------------------------------------------------- */
const scenarioRows = [];

function runScenario(spec) {
  const orig = loadOriginal(wordsData);
  const port = newPort();
  const before = { checks: stats.checks, leaves: stats.leaves, failed: stats.failed };
  drive(orig, spec);
  drive(port, spec);
  const so = snapshot(orig);
  const sp = snapshot(port);
  Object.keys(so).forEach(function (k) {
    /* savedState 里带时间戳，单独在后面归一化比较 */
    if (k === 'savedState') return;
    check(spec.name + ' :: ' + k, so[k], sp[k]);
  });
  /* 存档字符串：把时间戳抹平后要求逐字节相同 */
  const norm = function (raw) {
    return String(raw).replace(/\\d{13}/g, FIXED_TS);
  };
  check(spec.name + ' :: savedState(归一化时间戳)', norm(so.savedState), norm(sp.savedState));
  scenarioRows.push({
    name: spec.name,
    checks: stats.checks - before.checks,
    leaves: stats.leaves - before.leaves,
    failed: stats.failed - before.failed
  });
}

console.log('== 一、逐场景一致性对比（基准 = src/app.part1.js，移植 = miniprogram/utils/engine.js）==');
SCENARIOS.forEach(runScenario);
for (const row of scenarioRows) {
  console.log((row.failed ? 'FAIL ' : ' ok  ') + row.name +
    '   [字段 ' + row.checks + ' / 叶子 ' + row.leaves + (row.failed ? ' / 差异 ' + row.failed : '') + ']');
}

/* ---------------------------------------------------------------------
   九、多轮检测：roundSnapshot（含 2bit 位图 + base64）与逐词对比
      这是 btoa/atob -> 纯 JS base64 那处移植的唯一验金石
   --------------------------------------------------------------------- */
function roundTrip(spec1, spec2) {
  const orig = loadOriginal(wordsData);
  const port = newPort();
  const before = { checks: stats.checks, leaves: stats.leaves, failed: stats.failed };
  const out = {};
  [['orig', orig], ['port', port]].forEach(function (pair) {
    const A = pair[1];
    drive(A, spec1);
    const can = A.canRetest();
    const started = A.startNewRound();
    /* 归档快照里的时间戳由 Date.now() 生成，就地抹平（roundHistory / roundDiff 引用的是同一批对象） */
    if (A.S.rounds[0]) { A.S.rounds[0].startedAt = FIXED_TS; A.S.rounds[0].finishedAt = FIXED_TS + 1; }
    const snap = A.S.rounds[0] ? Object.assign({}, A.S.rounds[0]) : null;
    drive(A, Object.assign({}, spec2, { keepRounds: true }));
    out[pair[0]] = {
      canRetest: can,
      started: started,
      roundSnapshot: snap,
      roundHistory: A.roundHistory(),
      roundNo: A.roundNo(),
      roundDiff: A.roundDiff(),
      levelReport: A.levelReport()
    };
  });
  check('多轮 :: canRetest', out.orig.canRetest, out.port.canRetest);
  check('多轮 :: startNewRound()', out.orig.started, out.port.started);
  check('多轮 :: roundSnapshot（含位图 base64）', out.orig.roundSnapshot, out.port.roundSnapshot);
  check('多轮 :: roundHistory', out.orig.roundHistory, out.port.roundHistory);
  check('多轮 :: roundNo', out.orig.roundNo, out.port.roundNo);
  check('多轮 :: roundDiff（逐词对比）', out.orig.roundDiff, out.port.roundDiff);
  check('多轮 :: 第二轮 levelReport', out.orig.levelReport, out.port.levelReport);
  scenarioRows.push({
    name: '多轮检测（快照/位图/逐词对比）',
    checks: stats.checks - before.checks,
    leaves: stats.leaves - before.leaves,
    failed: stats.failed - before.failed
  });
}
roundTrip(
  { bank: 'c4', strict: false, answer: ANSWER.mixed, limitRatio: 0.97 },
  { bank: 'c4', strict: false, answer: ANSWER.lowBandWeak, limitRatio: 0.97 }
);
const lastRow = scenarioRows[scenarioRows.length - 1];
console.log((lastRow.failed ? 'FAIL ' : ' ok  ') + lastRow.name +
  '   [字段 ' + lastRow.checks + ' / 叶子 ' + lastRow.leaves + (lastRow.failed ? ' / 差异 ' + lastRow.failed : '') + ']');

/* ---------------------------------------------------------------------
   十、词库数据一致性：words-data.js 必须与 build.js 从 words.json 裁出来的完全一致
   --------------------------------------------------------------------- */
function slimWordsJson() {
  const raw = JSON.parse(fs.readFileSync(WORDS_JSON, 'utf8'));
  return raw.map(function (o) {
    const r = { w: o.w, t: o.t, b: o.b, f: o.f };
    if (o.p) r.p = o.p;
    if (o.x) r.x = 1;
    if (o.ph) r.ph = o.ph;
    return r;
  });
}
console.log('');
console.log('== 二、词库数据一致性（words-data.js vs build.js 从 words.json 的裁剪结果）==');
{
  const slim = slimWordsJson();
  check('词库 :: 词条数', slim.length, wordsData.length);
  check('词库 :: 完整内容逐字节', JSON.stringify(slim), JSON.stringify(wordsData));
  const badFields = [];
  for (let i = 0; i < Math.min(slim.length, wordsData.length); i++) {
    const a = slim[i], b = wordsData[i];
    if (a.w !== b.w || a.b !== b.b || a.f !== b.f || !!a.x !== !!b.x) badFields.push(i);
  }
  checkTrue('词库 :: w/b/f/x 字段无偏差', badFields.length === 0, '偏差下标 ' + badFields.slice(0, 10).join(','));
  const before = stats.failed;
  console.log(((stats.failed - before) ? 'FAIL ' : ' ok  ') + '词库数据（' + wordsData.length + ' 词条，含释义/音标/短语）');
}

/* ---------------------------------------------------------------------
   十一、小程序兼容性静态扫描（对移植后的 engine.js 源码）
   --------------------------------------------------------------------- */
console.log('');
console.log('== 三、小程序运行时兼容性静态扫描（miniprogram/utils/engine.js）==');
const ENGINE_SRC = fs.readFileSync(ENGINE_JS, 'utf8');
const ENGINE_LINES = ENGINE_SRC.split('\n');
const FORBIDDEN = [
  ['eval', 'eval 执行字符串（小程序禁用）'],
  ['new Function', '动态函数构造（小程序禁用）'],
  ['document.', 'DOM 访问'],
  ['window.', '浏览器全局'],
  ['localStorage', '浏览器本地存储（应走 storage 适配层）'],
  ['sessionStorage', '浏览器会话存储'],
  ['indexedDB', '浏览器数据库'],
  ['btoa', '浏览器 base64 编码全局函数'],
  ['atob', '浏览器 base64 解码全局函数'],
  ['Intl.', 'Intl 国际化（小程序支持不全）'],
  ['TextEncoder', 'Encoding API'],
  ['TextDecoder', 'Encoding API'],
  ['Blob', 'Blob 构造器'],
  ['URL.', 'URL 构造器'],
  ['Worker', 'Web Worker'],
  ['XMLHttpRequest', '同步 XHR'],
  ['requestAnimationFrame', '浏览器动画帧'],
  ['speechSynthesis', '浏览器语音合成'],
  ['matchMedia', '浏览器媒体查询'],
  ['querySelector', 'DOM 查询'],
  ['addEventListener', 'DOM 事件'],
  ['scrollTo', '浏览器滚动'],
  ['wx.', '小程序 API（引擎不应直接依赖，必须留在适配层）'],
  ['require(', 'require 调用（应只在模块顶层出现）']
];
const scanHits = [];
ENGINE_LINES.forEach(function (line, idx) {
  FORBIDDEN.forEach(function (pair) {
    if (pair[0] === 'require(' && idx < 20) return;   // 模块顶层的 require 是合法的
    if (line.indexOf(pair[0]) >= 0) scanHits.push({ token: pair[0], why: pair[1], line: idx + 1, text: line.trim() });
  });
});
checkTrue('静态扫描 :: 无禁用 API', scanHits.length === 0,
  scanHits.map(function (h) { return 'L' + h.line + ' ' + h.token + ' :: ' + h.text; }).join('; '));
console.log((scanHits.length ? 'FAIL ' : ' ok  ') + '禁用 API 扫描：' + FORBIDDEN.length + ' 个模式，命中 ' + scanHits.length + ' 处');

/* Math.random 出现位置：必须只在 shuffle 与 mkPid，绝不能落到测量路径上 */
const randomLines = [];
ENGINE_LINES.forEach(function (line, idx) { if (line.indexOf('Math.random') >= 0) randomLines.push({ line: idx + 1, text: line.trim() }); });
checkTrue('静态扫描 :: Math.random 仅 2 处', randomLines.length === 2,
  randomLines.map(function (r) { return 'L' + r.line + ' ' + r.text; }).join(' | '));
checkTrue('静态扫描 :: Math.random 落在 shuffle 与 mkPid', randomLines.every(function (r) {
  return r.text.indexOf('shuffle') >= 0 || r.text.indexOf('mkPid') >= 0 ||
    r.text.indexOf('a[j] = t') >= 0 || r.text.indexOf("'p' + Date.now()") >= 0;
}), randomLines.map(function (r) { return 'L' + r.line + ' ' + r.text; }).join(' | '));
console.log((randomLines.length === 2 ? ' ok  ' : 'FAIL ') + 'Math.random 出现 ' + randomLines.length + ' 处：' +
  randomLines.map(function (r) { return 'L' + r.line + ' ' + r.text.slice(0, 60); }).join(' ｜ '));
const fnvLines = ENGINE_LINES.filter(function (l) { return l.indexOf('16777619') >= 0; }).length;
checkTrue('静态扫描 :: FNV-1a 常量仍在（2166136261 / 16777619）',
  ENGINE_SRC.indexOf('2166136261') >= 0 && fnvLines > 0, 'FNV 常量缺失');
console.log((ENGINE_SRC.indexOf('2166136261') >= 0 ? ' ok  ' : 'FAIL ') + 'FNV-1a 定序常量未被动过（16777619 出现 ' + fnvLines + ' 次）');

/* ---------------------------------------------------------------------
   十二、Math.random 是否出现在测量路径上（行为验证，不只靠静态扫描）
   --------------------------------------------------------------------- */
console.log('');
console.log('== 四、Math.random 行为验证（毒化后跑全部测量口径）==');
{
  const orig = loadOriginal(wordsData);
  const port = newPort();
  const spec = { bank: 'c4', strict: false, answer: ANSWER.mixed };
  drive(orig, spec);
  drive(port, spec);
  const realRandom = Math.random;
  const sandbox = orig.__sandbox;
  sandbox.__realRandom = realRandom;          /* 供沙箱内恢复用（函数引用可以跨 realm 传） */
  const poison = function () { throw new Error('测量路径里出现了 Math.random'); };
  Math.random = poison;
  vm.runInContext('Math.random = function () { throw new Error("测量路径里出现了 Math.random"); };', sandbox);
  let threw = null;
  const measured = {};
  try {
    measured.estimateNow = JSON.stringify(port.estimateNow());
    measured.estimateNowOrig = JSON.stringify(orig.estimateNow());
    measured.levelReport = JSON.stringify(port.levelReport());
    measured.levelReportOrig = JSON.stringify(orig.levelReport());
    measured.census = JSON.stringify(port.censusBands(port.activePool()));
    measured.censusOrig = JSON.stringify(orig.censusBands(orig.activePool()));
    measured.bandProfile = JSON.stringify(port.bandProfile());
    measured.bandProfileOrig = JSON.stringify(orig.bandProfile());
    measured.vocabMap = String(port.vocabMap().testedCells);
    measured.vocabMapOrig = String(orig.vocabMap().testedCells);
    /* probeQueue 故意排除：它是抽样队列，本来就该随机。下面单独验证它确实会用到随机。 */
  } catch (e) {
    threw = e.message;
  }
  let queueThrew = false;
  try { port.probeQueue(); } catch (e) { queueThrew = true; }
  Math.random = realRandom;
  vm.runInContext('Math.random = __realRandom;', sandbox);
  checkTrue('Math.random :: 测量路径不调用它（移植版）', threw === null, threw || '');
  checkTrue('Math.random :: 测量路径不调用它（基准版）', threw === null, threw || '');
  checkTrue('Math.random :: probeQueue 确实依赖随机（毒化后会抛）', queueThrew === true, '未抛说明探针队列被固定成了确定性队列');
  console.log((threw === null && queueThrew ? ' ok  ' : 'FAIL ') +
    'measurement 路径无随机数；probeQueue 依赖随机（符合设计）');
}

/* ---------------------------------------------------------------------
   十三、定序确定性：FNV-1a 序位表必须每次都一样，且两份实现完全一致
   --------------------------------------------------------------------- */
console.log('');
console.log('== 五、定序与词池确定性（NEXT.md：排序必须确定性，不能用随机数）==');
{
  const a = newPort(), b = newPort();
  const o = loadOriginal(wordsData);
  const pa = a.activePool(), pb = b.activePool(), po = o.activePool();
  check('定序 :: 两个独立实例词池一致', pa, pb);
  check('定序 :: 移植版与网页版词池一致', pa, po);
  const ga = a.groups(), gb = b.groups();
  check('定序 :: 分组切分一致', ga.length, gb.length);
  check('定序 :: 首组内容一致', ga[0], gb[0]);
  check('定序 :: 末组内容一致', ga[ga.length - 1], gb[gb.length - 1]);
  const order = pa.slice(0, 200);
  const sortedByWord = order.slice().sort(function (x, y) { return a.WORDS[x].w < a.WORDS[y].w ? -1 : 1; });
  checkTrue('定序 :: 词池顺序不是字母序（确实打乱了）', JSON.stringify(order) !== JSON.stringify(sortedByWord), '词池顺序等于字母序，定序失效');
  console.log(' ok  词池 ' + pa.length + ' 词 · 分组 ' + ga.length + ' 组 · 三次加载完全一致');

  /* 换一个洗牌种子：probeQueue 的顺序应当随之改变（说明它是随机抽样），
     但只要种子相同，两份实现就必须抽出完全一样的队列。 */
  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  /* 注意：沙箱在 vm 里是**另一个 realm**，它有自己的 Math。
     所以「同一个种子」必须分别注入：移植版靠外层的 Math.random，
     网页版靠沙箱内的 Math.random（引擎代码取的是自己所在 realm 的那个）。 */
  function seeded(A, seed) {
    if (A && A.__sandbox) {
      A.__sandbox.__rng = makeRng(seed);
      vm.runInContext('Math.random = __rng;', A.__sandbox);
    }
    return A;
  }
  const realRandom = Math.random;
  Math.random = makeRng(20241017);
  const qPort1 = port_probeQueueSnapshot(newPort());
  Math.random = realRandom;
  const qOrig1 = port_probeQueueSnapshot(seeded(loadOriginal(wordsData), 20241017));
  Math.random = makeRng(999983);
  const qPort2 = port_probeQueueSnapshot(newPort());
  Math.random = realRandom;
  check('探针队列 :: 同种子下两份实现完全一致', qOrig1.slice(0, 60), qPort1.slice(0, 60));
  check('探针队列 :: 同种子下长度一致', qOrig1.length, qPort1.length);
  checkTrue('探针队列 :: 换种子后顺序改变（说明是随机抽样）',
    JSON.stringify(qPort1.slice(0, 60)) !== JSON.stringify(qPort2.slice(0, 60)), '换种子后队列没变');
  console.log(' ok  probeQueue 在同种子下与网页版逐词一致；换种子则改变（随机抽样，符合设计）');
}

function port_probeQueueSnapshot(A) {
  return A.probeQueue();
}

/* ---------------------------------------------------------------------
   十四、存储适配层：语义必须与浏览器 localStorage 一模一样
   （写盘内容一致 -> 网页版存档能直接搬到小程序，反之亦然）
   --------------------------------------------------------------------- */
console.log('');
console.log('== 六、存储适配层与存档互通 ==');
{
  /* --- 内存实现的基本语义 --- */
  const mem = createMemoryStorage();
  checkTrue('内存存储 :: 缺键返回 null（不是 undefined）', mem.getItem('nope') === null, String(mem.getItem('nope')));
  mem.setItem('a', '1');
  checkTrue('内存存储 :: 写后读回字符串', mem.getItem('a') === '1', String(mem.getItem('a')));
  mem.removeItem('a');
  checkTrue('内存存储 :: 删除后回到 null', mem.getItem('a') === null, String(mem.getItem('a')));
  console.log(' ok  memory 存储：缺键->null / 读写往返 / 删除');

  /* --- 假 wx API：真机语义（缺键返回空串）--- */
  const fakeWx = {
    data: {},
    getStorageSync: function (k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : ''; },
    setStorageSync: function (k, v) { this.data[k] = v; },
    removeStorageSync: function (k) { delete this.data[k]; },
    getStorageInfoSync: function () { return { keys: Object.keys(this.data) }; }
  };
  const wxStore = createWxStorage(fakeWx);
  checkTrue('wx 适配 :: 未知键归一成 null（wx 原始返回空串）', wxStore.getItem('nope') === null, String(wxStore.getItem('nope')));
  wxStore.setItem('k', 'v');
  checkTrue('wx 适配 :: 写后读回字符串', wxStore.getItem('k') === 'v', String(wxStore.getItem('k')));
  checkTrue('wx 适配 :: 真的落到了 wx.setStorageSync', fakeWx.data.k === 'v', String(fakeWx.data.k));
  wxStore.removeItem('k');
  checkTrue('wx 适配 :: removeItem 调用 removeStorageSync', !Object.prototype.hasOwnProperty.call(fakeWx.data, 'k'), '键仍存在');
  const badWx = {
    getStorageSync: function () { throw new Error('boom'); },
    setStorageSync: function () { throw new Error('exceed storage max size'); }
  };
  const badStore = createWxStorage(badWx);
  checkTrue('wx 适配 :: 读异常退化成 null', badStore.getItem('x') === null, '未退化');
  let writeThrew = false;
  try { badStore.setItem('x', '1'); } catch (e) { writeThrew = true; }
  checkTrue('wx 适配 :: 写异常向上抛（引擎据此置 storageBroken）', writeThrew, '写异常被吞掉了');
  const brokenEngine = createEngine({ words: wordsData, storage: badStore });
  brokenEngine.save();
  checkTrue('wx 适配 :: 写满时引擎置 storageBroken', brokenEngine.storageBroken === true, 'storageBroken 未置位');
  console.log(' ok  wx 适配：空串->null / 读写往返 / 异常语义与 localStorage 对齐');

  /* --- 存档互通：同一套作答，两边写出的 JSON 逐字节相同 --- */
  const persistSpec = { bank: 'c4', strict: false, answer: ANSWER.mixed, limitRatio: 0.4 };
  const origStore = new Map();
  const o1 = loadOriginal(wordsData, origStore);
  drive(o1, persistSpec);
  o1.save();
  const o2 = loadOriginal(wordsData, origStore);   /* 模拟刷新页面 */
  const memStore = createMemoryStorage();
  const p1 = createEngine({ words: wordsData, storage: memStore });
  drive(p1, persistSpec);
  p1.save();
  const p2 = createEngine({ words: wordsData, storage: memStore });  /* 模拟小程序重启 */
  const norm = function (raw) { return String(raw).replace(/\d{13}/g, FIXED_TS); };
  check('存档 :: 刷新后状态一致（网页版）', JSON.stringify(o1.S.status), JSON.stringify(o2.S.status));
  check('存档 :: 重启后状态一致（小程序）', JSON.stringify(p1.S.status), JSON.stringify(p2.S.status));
  check('存档 :: 跨端作答记录一致', JSON.stringify(o1.S.status), JSON.stringify(p2.S.status));
  check('存档 :: 跨端存档字符串逐字节一致', norm(origStore.get(o1.KEY)), norm(memStore.getItem(p1.KEY)));
  check('存档 :: 档案元数据键一致',
    norm(origStore.get('cet4vocab_profiles')), norm(memStore.getItem('cet4vocab_profiles')));
  checkTrue('存档 :: 存档键名沿用网页版（老存档可直接迁移）', memStore.getItem('cet4vocab_v1') !== null, '键名不一致');
  console.log(' ok  内存存储 vs localStorage：同一套作答写出的存档 JSON 逐字节相同，可双向迁移');
}

/* ---------------------------------------------------------------------
   十五、小程序运行时骨架验证
       在只有 wx、没有 window / document / localStorage 的裸沙箱里加载引擎，
       证明它不依赖任何浏览器全局；顺便验证存档真的落进 wx 存储。
   --------------------------------------------------------------------- */
console.log('');
console.log('== 七、小程序运行时骨架验证（只有 wx，无浏览器全局）==');

/* 极简 CommonJS 装载器：在一个没有浏览器全局的 vm 上下文里跑三个文件。
   模块间只允许相对路径 require（小程序也是这个约束）。 */
function loadInMiniRuntime(wxApi) {
  const ctx = vm.createContext({
    console: { log: function () {}, warn: function () {}, error: function () {} },
    wx: wxApi
    /* 刻意不提供：window / document / localStorage / navigator / setTimeout 之外的浏览器 API */
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
  return load(ENGINE_JS);
}

{
  const fakeWx = {
    data: {},
    getStorageSync: function (k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : ''; },
    setStorageSync: function (k, v) {
      if (String(v).length > 1024 * 1024) throw new Error('exceed storage max size');
      this.data[k] = String(v);
    },
    removeStorageSync: function (k) { delete this.data[k]; },
    getStorageInfoSync: function () { return { keys: Object.keys(this.data) }; }
  };
  let mod = null, loadErr = null;
  try { mod = loadInMiniRuntime(fakeWx); } catch (e) { loadErr = e.message; }
  checkTrue('小程序运行时 :: 无浏览器全局也能加载 engine.js', loadErr === null, loadErr || '');
  if (mod) {
    const eng = mod.engine;
    checkTrue('小程序运行时 :: module.exports 形状（createEngine / engine / storage）',
      typeof mod.createEngine === 'function' && !!eng && !!mod.storage, '导出形状不对');
    checkTrue('小程序运行时 :: 默认存储自动走 wx 适配层', mod.storage.kind === 'wx', String(mod.storage.kind));
    checkTrue('小程序运行时 :: 词库随模块一起加载（' + wordsData.length + ' 词）',
      eng.WORDS.length === wordsData.length, String(eng.WORDS.length));

    const spec = { bank: 'c4', strict: false, answer: ANSWER.mixed, limitRatio: 0.5 };
    drive(eng, spec);
    const ref = drive(loadOriginal(wordsData), spec);
    const se = snapshot(eng), sr = snapshot(ref);
    ['estimateNow', 'levelReport', 'censusBands', 'bandProfile', 'tally', 'bandSizes', 'stratMath', 'needFor']
      .forEach(function (k) { check('小程序运行时 :: ' + k + ' 与网页版一致', sr[k], se[k]); });
    eng.save();
    checkTrue('小程序运行时 :: 作答写进 wx 存储（key 沿用网页版 cet4vocab_v1）',
      typeof fakeWx.data['cet4vocab_v1'] === 'string' && fakeWx.data['cet4vocab_v1'].length > 100,
      '没写进 wx 存储');
    const mod2 = loadInMiniRuntime(fakeWx);
    const n1 = Object.keys(eng.S.status).length, n2 = Object.keys(mod2.engine.S.status).length;
    check('小程序运行时 :: 冷启动读回作答（模拟再次进入小程序）', n1, n2);
    checkTrue('小程序运行时 :: 冷启动后作答条数正确', n1 === n2 && n1 > 0, n1 + ' vs ' + n2);
    const wxUsage = fs.readFileSync(ENGINE_JS, 'utf8').split('wx.').length - 1;
    checkTrue('小程序运行时 :: 引擎本身不直接调用 wx（全在 storage.js 里）', wxUsage === 0, 'engine.js 里出现 ' + wxUsage + ' 处 wx.');
    console.log(' ok  裸运行时加载 → 估计值/报告/census 全部与网页版一致 → 存档落盘 → 冷启动读回');
  }
}
/* ---------------------------------------------------------------------
   十六、打包体积（主包 2MB / 总包 20MB）
   --------------------------------------------------------------------- */
console.log('');
console.log('== 八、打包体积（微信小程序：主包 2MB，总包 20MB）==');
{
  const bytes = function (p) { return fs.statSync(p).size; };
  const gz = function (p) { return zlib.gzipSync(fs.readFileSync(p), { level: 9 }).length; };
  const rows = [
    ['utils/engine.js', bytes(ENGINE_JS), gz(ENGINE_JS)],
    ['utils/storage.js', bytes(STORAGE_JS), gz(STORAGE_JS)],
    ['utils/words-data.js（词库）', bytes(WORDS_DATA_JS), gz(WORDS_DATA_JS)],
    ['（参照）words.json 原文件', bytes(WORDS_JSON), gz(WORDS_JSON)]
  ];
  rows.forEach(function (r) {
    console.log('  ' + r[0].padEnd(30) + String(r[1]).padStart(9) + ' B  raw   ' +
      String(r[2]).padStart(8) + ' B  gzip');
  });
  const mainRaw = rows[0][1] + rows[1][1] + rows[2][1];
  const mainGz = rows[0][2] + rows[1][2] + rows[2][2];
  const LIMIT = 2 * 1024 * 1024;
  console.log('  ' + '主包合计（引擎+适配层+词库）'.padEnd(26) + String(mainRaw).padStart(9) + ' B  raw   ' +
    String(mainGz).padStart(8) + ' B  gzip');
  console.log('  ' + '占主包 2MB 上限'.padEnd(30) + (mainRaw / LIMIT * 100).toFixed(1) + '%  raw   ' +
    (mainGz / LIMIT * 100).toFixed(1) + '%  gzip');
  console.log('  ' + '占总包 20MB 上限'.padEnd(29) + (mainRaw / (20 * 1024 * 1024) * 100).toFixed(1) + '%  raw');
  checkTrue('体积 :: 词库+引擎原始字节 < 主包 2MB', mainRaw < LIMIT,
    (mainRaw / LIMIT * 100).toFixed(1) + '% 已超限');
  checkTrue('体积 :: words.json 原文也 < 主包 2MB（不裁剪也能放下）', bytes(WORDS_JSON) < LIMIT,
    String(bytes(WORDS_JSON)));
}

/* ---------------------------------------------------------------------
   十七、汇总
   --------------------------------------------------------------------- */
console.log('');
console.log('== 九、汇总 ==');
console.log('对比分组：' + scenarioRows.length + ' 组' +
  '（其中 ' + SCENARIOS.length + ' 个作答场景 + 多轮检测 1 组）');
console.log('断言：字段级 ' + stats.checks + ' 条 / 叶子级 ' + stats.leaves + ' 条');
console.log('差异：' + stats.failed + ' 条');
if (stats.failed) {
  console.log('');
  console.log('---- 差异明细（最多列 ' + MAX_DIFF_PRINT + ' 条）----');
  diffs.slice(0, MAX_DIFF_PRINT).forEach(function (d) {
    console.log('  ✗ ' + d.path);
    console.log('      基准: ' + fmt(d.a));
    console.log('      移植: ' + fmt(d.b));
    console.log('      原因: ' + d.why);
  });
  if (diffs.length > MAX_DIFF_PRINT) console.log('  ... 还有 ' + (diffs.length - MAX_DIFF_PRINT) + ' 条');
  console.log('');
  console.log('结论：不一致 —— 移植引入了偏差（见上面的字段路径）。');
  process.exit(1);
}
console.log('');
console.log('结论：全绿 —— 移植版与网页版在以上所有场景下逐字段完全相等。');
process.exit(0);

