/* 页面层冒烟测试（Node 环境，不是真机）
   目的：在没有微信开发者工具的机器上，把三张页面的 JS 跑起来，抓拼写错误、
   引擎方法名写错、setData 字段对不上、导航路径写错这类问题。
   它不能替代真机验证（WXML/WXSS 渲染、布局、手感一律测不到），但能挡住"一打开就崩"。

   跑法：node miniprogram/test/pages-smoke.mjs
*/
import { createRequire } from 'node:module';
import assert from 'node:assert';

const require = createRequire(import.meta.url);

/* ---------- 微信运行时 mock ---------- */
const store = new Map();
const nav = [];
const toasts = [];
globalThis.wx = {
  getStorageSync: (k) => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: (k) => { store.delete(k); },
  showToast: (o) => { toasts.push(o.title); },
  navigateTo: (o) => { nav.push(o.url); },
  redirectTo: (o) => { nav.push(o.url); },
  reLaunch: (o) => { nav.push(o.url); },
  navigateBack: () => { nav.push('back'); },
  showModal: (o) => { if (o && o.success) o.success({ confirm: true, cancel: false }); },
  createSelectorQuery: () => ({ select: () => ({ boundingClientRect: () => ({ exec: () => {} }) }), exec: () => {} })
};

let captured = null;
globalThis.Page = (cfg) => { captured = cfg; };
globalThis.App = (cfg) => { captured = cfg; };

/* 极简页面实例：只实现 setData（含 'a.b' 路径） */
function instantiate(cfg) {
  const page = Object.assign({}, cfg);
  page.data = JSON.parse(JSON.stringify(cfg.data || {}));
  page.setData = function (patch, cb) {
    for (const key of Object.keys(patch)) {
      if (key.indexOf('.') > -1) {
        const parts = key.split('.');
        let cur = page.data;
        for (let i = 0; i < parts.length - 1; i++) { cur = cur[parts[i]] = cur[parts[i]] || {}; }
        cur[parts[parts.length - 1]] = patch[key];
      } else {
        page.data[key] = patch[key];
      }
    }
    if (typeof cb === 'function') cb();
  };
  return page;
}

function loadPage(relPath) {
  captured = null;
  const resolved = require.resolve(relPath);
  delete require.cache[resolved];      // 同一页面要能重复实例化
  const mod = require(relPath);
  assert.ok(captured, relPath + ' 没有调用 Page()');
  return instantiate(captured);
}

const results = [];
function ok(name, fn) {
  try { fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', name + ' → ' + (e && e.message)]); }
}

/* ---------- 引擎 & 控制器 ---------- */
const engineMod = require('../utils/engine.js');
const eng = engineMod.engine;
const quizMod = require('../utils/quiz.js');

/* 关掉自动跳转，避免测试里出现定时器；同时保证从干净存档开始 */
eng.S.settings.autoNext = false;
eng.save();

console.log('=== 一、页面模块加载 ===');
let indexPage, quizPage, reportPage;
ok('pages/index/index.js 加载', () => { indexPage = loadPage('../pages/index/index.js'); });
ok('pages/quiz/quiz.js 加载', () => { quizPage = loadPage('../pages/quiz/quiz.js'); });
ok('pages/report/report.js 加载', () => { reportPage = loadPage('../pages/report/report.js'); });

console.log('=== 二、首页渲染 ===');
ok('onShow 不抛错且填出数据', () => {
  indexPage.onShow();
  assert.ok(indexPage.data.ready, 'ready 未置 true');
  assert.ok(indexPage.data.groups.length > 0, '分组为空');
  assert.ok(typeof indexPage.data.need250 === 'number' && indexPage.data.need250 > 0, 'need250 异常: ' + indexPage.data.need250);
  assert.ok(indexPage.data.mins250.indexOf('分钟') > -1, 'mins250 文案异常');
  assert.strictEqual(indexPage.data.groups.length, Math.ceil(engineMod.engine.curPoolSize() / eng.GROUP_SIZE) >= 1 ? indexPage.data.groups.length : -1);
  console.log('   余额=' + indexPage.data.vocabText + ' 状态=' + indexPage.data.kind +
    ' 分组=' + indexPage.data.groups.length + ' 摸底题量=' + indexPage.data.need250 + ' (' + indexPage.data.mins250 + ')');
});

console.log('=== 三、快速摸底 → 答题 → 自动结算 ===');
let sessionAnswers = 0;
ok('首页点快速摸底会跳到答题页', () => {
  nav.length = 0;
  indexPage.onQuick();
  assert.deepStrictEqual(nav, ['/pages/quiz/quiz'], '导航异常: ' + JSON.stringify(nav));
});

ok('答题页 onLoad 能拿到第一题', () => {
  quizPage.onLoad();
  assert.ok(!quizPage.data.empty, '答题页进入空态（hasSession 为 false）');
  assert.ok(quizPage.data.s && quizPage.data.s.word && quizPage.data.s.word.w, '题面为空');
  console.log('   第一题: ' + quizPage.data.s.word.w + ' / ' + quizPage.data.bandName + ' · ' + quizPage.data.s.progressText);
});

ok('连续作答直到自动收工，并跳到报告页', () => {
  nav.length = 0;
  let guard = 0;
  const pattern = [2, 1, 0, 2, 2, 1];   // 混合作答，让掌握率不是 0 或 100
  while (nav.length === 0 && guard++ < 2000) {
    const s = quizPage.data.s;
    if (!s) throw new Error('作答过程中状态丢失');
    if (s.revealed) {
      if (s.canNext) quizPage.onNext();          // 有下一题
      else throw new Error('已揭示但既不 canNext 也没收工');
    } else {
      quizPage.onJudge({ currentTarget: { dataset: { v: pattern[sessionAnswers % pattern.length] } } });
      sessionAnswers++;
    }
  }
  assert.ok(guard < 2000, '循环没在 2000 步内收工');
  assert.deepStrictEqual(nav, ['/pages/report/report'], '收工后导航异常: ' + JSON.stringify(nav));
  console.log('   共答 ' + sessionAnswers + ' 题后自动收工');
});

console.log('=== 四、报告页渲染 ===');
ok('onShow 不抛错且报告字段齐全', () => {
  reportPage.onShow();
  const d = reportPage.data;
  assert.strictEqual(d.empty, false, '报告页进入空态');
  assert.ok(d.rankK && d.rankName, '等级为空: ' + d.rankK + '/' + d.rankName);
  assert.ok(d.bands.length >= 1, '频段表为空');
  assert.ok(d.lastText.length > 0, '本轮明细为空');
  assert.ok(d.looseText !== '—' || d.vocabText !== '—', '两套口径都没算出来');
  console.log('   等级=' + d.rankK + ' ' + d.rankName + ' 掌握率=' + d.ratioPct + '% 覆盖=' + d.coveragePct +
    '% 频段=' + d.bands.length + ' 优先级=' + d.gainTop.length + ' 本轮=' + d.lastText);
  console.log('   频段明细: ' + d.bands.map((b) => b.name + ' ' + b.ratio + '%').join(' | '));
});

ok('报告页「复测未掌握词」能起 list 会话并跳转', () => {
  if (!reportPage.data.weakCount) { console.log('   （本轮全部答对，跳过这条）'); return; }
  nav.length = 0;
  reportPage.onReviewWeak();
  assert.deepStrictEqual(nav, ['/pages/quiz/quiz'], '复测导航异常: ' + JSON.stringify(nav));
});

console.log('=== 五、断点续测 ===');
ok('会话存在时答题页能恢复', () => {
  const p2 = loadPage('../pages/quiz/quiz.js');
  p2.onLoad();
  assert.ok(!p2.data.empty, '恢复失败：进入空态');
  assert.ok(p2.data.s && p2.data.s.word, '恢复后没有题面');
  console.log('   恢复到: ' + p2.data.s.label + ' · ' + p2.data.s.progressText);
});

console.log('=== 六、模式切换 ===');
ok('自评 ⇄ 四选一 切换不抛错且选项齐全', () => {
  const before = quizPage.data.s.mode;
  quizPage.onToggleMode();
  const after = quizPage.data.s.mode;
  assert.notStrictEqual(before, after, '模式没切换');
  assert.ok(Array.isArray(quizPage.data.s.opts) && quizPage.data.s.opts.length === 4, '四选一选项数不是 4');
  quizPage.onToggleMode();   // 切回去
  assert.strictEqual(quizPage.data.s.mode, before, '切不回去');
});

ok('撤销/跳过/改判 三个动作可用', () => {
  const s = quizPage.data.s;
  if (s.canUndo) quizPage.onUndo();
  quizPage.onSkip();
  const s2 = quizPage.data.s;
  if (s2 && s2.revealed) quizPage.onRejudge({ currentTarget: { dataset: { v: 1 } } });
  assert.ok(quizPage.data.s, '动作后状态丢失');
});

console.log('=== 汇总 ===');
const fails = results.filter((r) => r[0] === 'FAIL');
results.forEach((r) => console.log((r[0] === 'ok' ? ' ok  ' : ' FAIL ') + r[1]));
console.log('');
console.log(fails.length ? ('失败 ' + fails.length + ' 项') : ('全部通过：' + results.length + ' 项'));
process.exit(fails.length ? 1 : 0);
