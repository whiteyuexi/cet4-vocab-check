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
let indexPage, quizPage, reportPage, statsPage, settingsPage;
ok('pages/index/index.js 加载', () => { indexPage = loadPage('../pages/index/index.js'); });
ok('pages/quiz/quiz.js 加载', () => { quizPage = loadPage('../pages/quiz/quiz.js'); });
ok('pages/report/report.js 加载', () => { reportPage = loadPage('../pages/report/report.js'); });
ok('pages/stats/stats.js 加载', () => { statsPage = loadPage('../pages/stats/stats.js'); });
ok('pages/settings/settings.js 加载', () => { settingsPage = loadPage('../pages/settings/settings.js'); });

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

/* ---------- 总览页 ---------- */
console.log('=== 七、总览页（频段剖面 / 检测记录） ===');
ok('总览 onShow 填出频段与覆盖', () => {
  statsPage.onShow();
  assert.ok(statsPage.data.ready, 'ready 未置 true');
  assert.ok(statsPage.data.bands.length >= 1, '频段为空');
  assert.ok(statsPage.data.total > 0, '总词数为 0');
  const b = statsPage.data.bands[0];
  assert.ok(b.name && b.N > 0, '频段字段不全: ' + JSON.stringify(b));
  console.log('   ' + statsPage.data.tested + '/' + statsPage.data.total + ' 词 · 覆盖 ' +
    statsPage.data.coveragePct + '% · 频段 ' + statsPage.data.bands.length + ' 条');
});
ok('点频段会起一段复测并跳转', () => {
  nav.length = 0;
  const target = statsPage.data.bands.find(function (b) { return b.p !== null; }) || statsPage.data.bands[0];
  statsPage.onBand({ currentTarget: { dataset: { band: target.band } } });
  assert.deepStrictEqual(nav, ['/pages/quiz/quiz'], '导航异常: ' + JSON.stringify(nav));
  const sess = eng.S.session;
  assert.ok(sess && sess.queue && sess.queue.length > 0, '没有生成复测队列');
  console.log('   复测队列 ' + sess.queue.length + ' 词 · ' + sess.label);
  eng.S.session = null; eng.save();
});

/* ---------- 设置页 ---------- */
console.log('=== 八、设置页（每日时间 / 口径 / 回访开关） ===');
ok('设置 onShow 读数正确', () => {
  settingsPage.onShow();
  const dm = eng.S.settings.dailyMinutes || 30;
  assert.strictEqual(settingsPage.data.dailyMinutes, dm);
  assert.strictEqual(settingsPage.data.perDay, Math.max(5, Math.min(200, Math.round(dm / 1.5))));
  console.log('   ' + dm + ' 分钟/天 ≈ ' + settingsPage.data.perDay + ' 词/天');
});
ok('改每日时间会改换算并落盘', () => {
  settingsPage.setDaily(60);
  assert.strictEqual(eng.S.settings.dailyMinutes, 60);
  assert.strictEqual(settingsPage.data.perDay, 40);
  const stored = JSON.parse(store.get('cet4vocab_v1') || '{}');
  assert.strictEqual(stored.settings.dailyMinutes, 60, '没写进存储');
  settingsPage.setDaily(30);
  assert.strictEqual(eng.S.settings.dailyMinutes, 30);
});
ok('每日时间会被夹在 5–180', () => {
  settingsPage.setDaily(9999);
  assert.strictEqual(eng.S.settings.dailyMinutes, 180);
  settingsPage.setDaily(-10);
  assert.strictEqual(eng.S.settings.dailyMinutes, 5);
  settingsPage.setDaily(30);
});
ok('答题方式与严格口径可切换并落盘', () => {
  settingsPage.onMode({ currentTarget: { dataset: { mode: 'choice' } } });
  assert.strictEqual(eng.S.settings.mode, 'choice');
  settingsPage.onStrict({ detail: { value: true } });
  assert.strictEqual(eng.S.settings.strict, true);
  const stored = JSON.parse(store.get('cet4vocab_v1') || '{}');
  assert.strictEqual(stored.settings.mode, 'choice');
  assert.strictEqual(stored.settings.strict, true);
  settingsPage.onMode({ currentTarget: { dataset: { mode: 'self' } } });
  settingsPage.onStrict({ detail: { value: false } });
});
ok('关掉回访提醒会写 revisitOff', () => {
  settingsPage.onRevisit({ detail: { value: false } });
  assert.strictEqual(eng.S.settings.revisitOff, true);
  assert.strictEqual(settingsPage.data.revisitOff, true);
  settingsPage.onRevisit({ detail: { value: true } });
  assert.strictEqual(eng.S.settings.revisitOff, false);
});

/* ---------- 回访卡 ---------- */
console.log('=== 九、回访卡（首页） ===');
const cardMod = require('../utils/card.js');
ok('没有数据时不显示', () => {
  eng.S.samples = [];
  eng.save();
  indexPage.onShow();
  assert.strictEqual(indexPage.data.cardShow, false, '无数据却显示了');
});
ok('有 5 天前的抽样就显示，且文案齐全', () => {
  eng.addSample({
    n: 64, k: 40, f: 8,
    bands: { 1: { N: 1000, n: 20, k: 8, f: 2 }, 2: { N: 1000, n: 22, k: 18, f: 2 } }
  });
  eng.S.samples[eng.S.samples.length - 1].ts = Date.now() - 5 * 86400000;
  eng.save();
  indexPage.onShow();
  assert.strictEqual(indexPage.data.cardShow, true, '没有显示回访卡');
  assert.ok(indexPage.data.cardLines.length >= 2, '文案不足: ' + indexPage.data.cardLines.length);
  assert.ok(/天前/.test(indexPage.data.cardHead), 'head 异常: ' + indexPage.data.cardHead);
  console.log('   head: ' + indexPage.data.cardHead);
  indexPage.data.cardLines.forEach(function (l) { console.log('   · ' + l.slice(0, 44)); });
});
ok('刚测完（0 天）不打扰', () => {
  eng.S.samples[eng.S.samples.length - 1].ts = Date.now();
  eng.save();
  indexPage.onShow();
  assert.strictEqual(indexPage.data.cardShow, false);
});
ok('收起只影响本次；永久关闭写 revisitOff', () => {
  eng.S.samples[eng.S.samples.length - 1].ts = Date.now() - 5 * 86400000;
  eng.save();
  indexPage.onShow();
  assert.strictEqual(indexPage.data.cardShow, true);
  indexPage.onCardHide();
  assert.strictEqual(indexPage.data.cardShow, false);
  indexPage.onShow();
  assert.strictEqual(indexPage.data.cardShow, false, '收起后 onShow 又出现了');
  eng.S.settings.revisitOff = false;
  indexPage.onCardOff();          // mock 的 showModal 会自动 confirm
  assert.strictEqual(eng.S.settings.revisitOff, true);
  indexPage.onShow();
  assert.strictEqual(indexPage.data.cardShow, false);
  eng.S.settings.revisitOff = false;
  eng.save();
});
ok('回访卡的「开始补这一段」能起复测', () => {
  eng.S.samples[eng.S.samples.length - 1].ts = Date.now() - 5 * 86400000;
  eng.save();
  nav.length = 0;
  indexPage.onCardReview();
  assert.ok(eng.S.session && eng.S.session.queue.length > 0, '没有生成会话');
  assert.deepStrictEqual(nav, ['/pages/quiz/quiz']);
  console.log('   ' + eng.S.session.label);
  eng.S.session = null; eng.save();
});

console.log('=== 汇总 ===');
const fails = results.filter((r) => r[0] === 'FAIL');
results.forEach((r) => console.log((r[0] === 'ok' ? ' ok  ' : ' FAIL ') + r[1]));
console.log('');
console.log(fails.length ? ('失败 ' + fails.length + ' 项') : ('全部通过：' + results.length + ' 项'));
process.exit(fails.length ? 1 : 0);
