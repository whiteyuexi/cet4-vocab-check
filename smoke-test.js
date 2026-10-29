const fs = require('fs');
// jsdom 优先用项目内依赖，找不到时回退到本机已有的副本（保证 clone 下来 npm i 之后能跑）
function requireJsdom() {
  try { return require('jsdom'); }
  catch (e) { return require('C:/Users/27295/deepseek-harness/node_modules/jsdom'); }
}
const path = require('path');
const { JSDOM, VirtualConsole } = requireJsdom();

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const errors = [];
const RESULTS = [];
function check(name, cond, extra) { RESULTS.push((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); }

function makeDom(savedRaw) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { const m = e.message || String(e); if (!/Not implemented/.test(m)) errors.push('jsdomError: ' + m); });
  vc.on('error', (...m) => errors.push('console.error: ' + m.map(String).join(' ')));
  return new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/', virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) { if (savedRaw) w.localStorage.setItem('cet4vocab_v1', savedRaw); }
  });
}

const dom = makeDom(null);
const win = dom.window, doc = win.document;

win.addEventListener('load', () => {
  try {
    const A = win.__APP__;
    const q = s => doc.querySelector(s);
    const qa = s => Array.from(doc.querySelectorAll(s));
    const click = (s) => {
      const e = typeof s === 'string' ? q(s) : s;
      if (!e) throw new Error('找不到元素: ' + s);
      e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    };
    const step = (n, fn) => { try { fn(); } catch (e) { RESULTS.push('FAIL | 步骤异常 [' + n + '] | ' + (e && e.message)); } };

    step('init', () => {
      check('应用加载', !!A);
      check('词库载入', A && A.WORDS.length > 4000, A ? A.WORDS.length + ' 词' : '');
      check('首屏直接给出下一步', /测出你的四级词汇量/.test(q('.hero h1').textContent), q('.hero h1').textContent);
      check('首屏有明确主按钮', qa('.hero-cta button').length >= 2, qa('.hero-cta button').length + ' 个');
      check('首屏主按钮带预计用时', /分钟/.test(q('.hero-cta button').textContent), q('.hero-cta button').textContent);
      check('首页分组按钮', qa('.gbtn').length > 0, qa('.gbtn').length + ' 个');
      A.S.settings.autoNext = false;
    });

    step('自评答题', () => {
      click('[data-act="start"][data-kind="probe"][data-target="400"]');
      check('进入答题界面', !!q('.qword'), q('.qword') && q('.qword').textContent);
      check('进度条存在', !!q('.bar > i'));
      const w1 = q('.qword').textContent;
      click('[data-act="judge"][data-v="2"]');
      check('评分后显示释义', !!q('.reveal'), q('.reveal') ? q('.reveal').textContent.slice(0, 26) : '');
      check('作答写入状态', A.S.status[w1.toLowerCase()] === 2);
      check('写入 localStorage', !!win.localStorage.getItem(A.KEY));
      click('[data-act="next"]');
      check('翻到下一题', q('.qword').textContent !== w1, q('.qword').textContent);
      for (let i = 0; i < 5; i++) { click('[data-act="judge"][data-v="1"]'); click('[data-act="next"]'); }
      check('日志累计 6 条', A.S.session.log.length === 6, String(A.S.session.log.length));
      click('[data-act="undo"]');
      check('撤销生效', A.S.session.log.length === 5, String(A.S.session.log.length));
      check('撤销后回到未作答状态', !q('.reveal'));
      check('撤销上一题后题号回退', A.S.session.pos === 5, 'pos=' + A.S.session.pos);
      click('[data-act="judge"][data-v="2"]');
      check('重新作答', A.S.session.log.length === 6, String(A.S.session.log.length));
      click('[data-act="undo"]');
      check('答完当前题再撤销应停留本题', A.S.session.pos === 5 && A.S.session.log.length === 5, 'pos=' + A.S.session.pos + ' log=' + A.S.session.log.length);
      click('[data-act="judge"][data-v="2"]');
      click('[data-act="rejudge"][data-v="0"]');
      check('改判生效', A.S.session.log[A.S.session.log.length - 1].v === 0, JSON.stringify(A.S.session.log[A.S.session.log.length - 1]));
    });

    step('结果页', () => {
      click('[data-act="finish"]');
      check('跳转结果页', /本次掌握率/.test(doc.getElementById('view').textContent));
      check('生成本次结果', !!A.S.lastResult && A.S.lastResult.total === 6,
        A.S.lastResult ? JSON.stringify({ total: A.S.lastResult.total, k: A.S.lastResult.k, f: A.S.lastResult.f, u: A.S.lastResult.u }) : '');
      check('写入历史记录', A.S.history.length === 1);
      check('结果页列出错词', qa('.witem').length > 0, qa('.witem').length + ' 个');
    });

    step('统计页', () => {
      click('.nav button[data-nav="stats"]');
      check('统计页渲染', /总体掌握情况/.test(doc.getElementById('view').textContent));
      check('词汇地图渲染出 7 段 × 26 字母',
        qa('.vmap-row').length === 8 && qa('.vmap-lt').length === 26,
        qa('.vmap-row').length + ' 行（含表头）/ ' + qa('.vmap-lt').length + ' 列');
      check('词汇地图的格子可点击复测',
        qa('.vmap-c[data-act="map-review"]').length > 0,
        qa('.vmap-c[data-act="map-review"]').length + ' 个可点格子');
      check('无随机样本时不给词汇量', /数据不足/.test(doc.getElementById('view').textContent));
      A.addSample({ n: 100, k: 62, f: 18 }); A.save(); A.go('stats');
      check('有随机样本时给出估算', /3,2\d\d/.test(doc.getElementById('view').textContent), (/≈ [\d,]+ 词/.exec(doc.getElementById('view').textContent) || ['无'])[0]);
      check('body 下的游离文本会被清掉', (function(){
  var d = new JSDOM(fs.readFileSync('index.html','utf8'), { runScripts: 'dangerously' });
  d.window.document.body.appendChild(d.window.document.createTextNode('  >3" >  '));
  d.window.__APP__ && d.window.__APP__.bind && d.window.__APP__.bind();
  var left = Array.prototype.filter.call(d.window.document.body.childNodes, function(n){ return n.nodeType === 3 && n.nodeValue.trim(); });
  return left.length === 0;
})(), '注入的残留应被移除');

check('给出等级评价', /卓越|优秀|良好|中等|偏弱|基础薄弱/.test(doc.getElementById('view').textContent));
// 命名回摆的护栏：等级名必须是中性评价词，界面上不能再出现账本比喻
{
  const names = A.RANKS.map(r => r.name).join('/');
  check('六个等级名是中性评价词', names === '卓越/优秀/良好/中等/偏弱/基础薄弱', names);
  const viewTx = doc.getElementById('view').textContent;
  check('界面不再出现账本比喻', !/词汇账户|资产结构|满仓|够花|见底/.test(viewTx), viewTx.slice(0, 40));
}
      A.S.samples = []; A.save(); A.go('stats');
    });

    step('词库切换（四级 / 六级）', () => {
      A.S.settings.includeExt = false; A.save(); A.go('home');
      const bankBtns = qa('[data-act="set-bank"]');
      check('首页有词库切换器', bankBtns.length === 2, bankBtns.length + ' 个');
      check('默认是四级大纲', A.bankKey() === 'c4' && /四级/.test(A.bankName()));
      const c4 = A.activePool().length;
      check('四级词库规模正确', c4 === 4540, String(c4));
      check('无生词本入口', !doc.querySelector('.nav button[data-nav="wrong"]') && typeof A.viewWrong === 'undefined');

      click('[data-act="set-bank"][data-bank="c6"]');
      check('切到六级大纲', A.bankKey() === 'c6');
      const c6 = A.activePool().length;
      check('六级词库规模正确', c6 === 5716, String(c6));
      check('六级包含四级全部词汇', c4 === A.activePool().filter(i => A.WORDS[i].b & 1).length, String(c4));

      click('[data-act="set-bank"][data-bank="c4"]');
      check('能切回四级', A.bankKey() === 'c4' && A.activePool().length === c4);
      check('切换词库后分组重建', A.coreGroupsCount() === Math.ceil(c4 / 100), String(A.coreGroupsCount()));

      // 抽样不跨词库：六级样本不参与四级估算
      A.S.samples = []; A.addSample({ n: 100, k: 60, f: 20, bank: 'c6' }); A.save();
      A.go('home');
      check('六级样本不用于四级估算', !/≈ \d/.test(q('.hero h1').textContent), q('.hero h1').textContent);
      A.S.samples = [];
    });

    step('设置页', () => {
      click('.nav button[data-nav="settings"]');
      check('设置页渲染', /答题设置/.test(doc.getElementById('view').textContent));
      click('[data-act="set-mode"][data-mode="choice"]');
      check('切换四选一', A.S.settings.mode === 'choice');
      const poolNoExt = A.activePool().length;
      const extInBank = A.WORDS.filter(w => w.x && A.inBank(w)).length;
      click('[data-act="toggle"][data-key="includeExt"]');
      check('开启拓展词池变大', A.activePool().length === poolNoExt + extInBank,
        poolNoExt + ' + ' + extInBank + ' = ' + A.activePool().length);
      click('[data-act="toggle-theme"]');
      check('深色模式切换', doc.documentElement.getAttribute('data-theme') === 'dark');
    });

    step('四选一答题', () => {
      A.startSession('list', { list: A.activePool().slice(0, 8), label: '测试' });
      check('渲染 4 个选项', qa('.opt').length === 4, String(qa('.opt').length));
      const wordNow = q('.qword').textContent;
      const target = A.WORDS.find(w => w.w === wordNow);
      const rightOpt = qa('.opt').find(o => o.textContent.indexOf(target.t) >= 0);
      check('存在正确选项', !!rightOpt);
      click(rightOpt || qa('.opt')[0]);
      check('选项作答记录', A.S.session.log.length === 1, JSON.stringify(A.S.session.log[0]));
      check('判分反馈', /答对|答错/.test(doc.getElementById('view').textContent));
      // 答题中途跑去设置里换答题方式，回到答题页时当前题的作答应被回滚（不能出现"未作答却显示答错"）
      click('.nav button[data-nav="settings"]');
      click('[data-act="set-mode"][data-mode="self"]');
      click('.nav button[data-nav="test"]');
      check('切换答题方式后回滚本题作答', A.S.session.log.length === 0, 'log=' + A.S.session.log.length);
      check('切换后不出现错乱反馈', !/答错了/.test(doc.getElementById('view').textContent));
      check('切到自评模式后显示评分按钮', qa('[data-act="judge"]').length === 3 && A.S.settings.mode === 'self');
    });

    step('持久化', () => {
      const saved = JSON.parse(win.localStorage.getItem(A.KEY));
      check('存档结构完整', !!(saved && saved.status && Object.keys(saved.status).length > 0), Object.keys(saved.status).length + ' 条状态');
      check('存档含未完成会话', !!saved.session && saved.session.queue.length === 8);
      A.addSample({ n: 100, k: 60, f: 20 }); A.save(); A.go('home');
      check('首页显示抽样估算', /词汇量估算/.test(doc.getElementById('view').textContent));
      check('首页显示继续检测', /继续检测/.test(doc.getElementById('view').textContent));
      A.go('groups');
      const colored = qa('.gbtn.done, .gbtn.part').length;
      check('分组页进度着色', colored > 0, colored + ' 组已着色');
      check('分组总数正确', qa('.gbtn').length === A.groups().length, qa('.gbtn').length + ' / ' + A.groups().length);
      // 回归：停在「分组」页时底部导航要亮「分组」，不能亮成「检测」
      const onNav = q('.nav button.on');
      check('分组页高亮的是分组', !!onNav && onNav.getAttribute('data-nav') === 'groups',
        onNav ? onNav.getAttribute('data-nav') : 'n/a');
      check('导航只亮一项', qa('.nav button.on').length === 1, qa('.nav button.on').length + ' 项亮着');

      /* 检测顺序：打乱但稳定。
         打乱是为了不按 a、b、c 一路测下去；稳定是为了「第 N 组」永远指向同一批词，
         否则进度/历史/跨轮对比全部失真。 */
      const poolNow = A.activePool();
      const gsAll = A.groups();
      const flat = [].concat.apply([], gsAll);
      check('分组是词库的一个划分（不重不漏）',
        flat.length === poolNow.length && new Set(flat).size === poolNow.length,
        flat.length + ' vs ' + poolNow.length);
      const rawOrder = A.WORDS.slice(0, 20).map(w => w.w).join(',');
      const poolOrder = poolNow.slice(0, 20).map(i => A.WORDS[i].w).join(',');
      check('检测顺序不是字母序', poolOrder !== rawOrder,
        poolOrder.split(',').slice(0, 4).join(','));
      const lettersInG1 = new Set(gsAll[0].map(i => A.WORDS[i].w[0].toLowerCase()));
      check('第一组覆盖多个首字母（不是同一字母段）', lettersInG1.size >= 12, lettersInG1.size + ' 个首字母');
      global.__g1 = gsAll[0].join(',');
      A.go('home');
      global.__savedRaw = win.localStorage.getItem(A.KEY);
      global.__statusCount = Object.keys(A.S.status).length;
    });

  // ---------- 摸底检测：分层抽样 + 目标精度 ----------
  step('摸底检测（分层抽样）', () => {
    A.S.status = {}; A.S.samples = []; A.S.session = null;
    A.S.settings.bank = 'c4'; A.S.settings.mode = 'self'; A.S.settings.autoNext = false;
    A.save(); A.go('home');
    check('摸底入口清晰可见', qa('[data-act="start"][data-kind="probe"]').length >= 2,
      qa('[data-act="start"][data-kind="probe"]').length + ' 个');
    check('首页模式卡不超过 2 张', qa('.mode').length <= 2, qa('.mode').length + ' 张卡片');

    click('[data-act="start"][data-kind="probe"][data-target="400"]');
    const sess = A.S.session;
    check('进入探测模式', !!sess && sess.kind === 'probe', sess ? sess.kind : 'none');
    const bandsInFirst60 = new Set(sess.queue.slice(0, 60).map(i => A.WORDS[i].f || 0));
    check('队列按频段交错（前 60 词跨多段）', bandsInFirst60.size >= 4, bandsInFirst60.size + ' 个频段');
    const allBands = new Set(sess.queue.map(i => A.WORDS[i].f || 0));
    check('整个队列覆盖全部频段', allBands.size >= 6, allBands.size + ' 个频段');

    // 答「认识为主」，看它是否在达到目标精度后自动停下
    let guard = 0, pattern = 0;
    while (A.S.session && guard++ < 3000) {
      A.judge(pattern % 4 === 3 ? 1 : 2); pattern++;
      A.nextQ();
    }
    check('达到目标精度后自动结束', !A.S.session, '共答 ' + guard + ' 题');
    check('题量远小于整个词库', guard < 4540, guard + ' < 4540');
    check('写入带分层的抽样记录', A.S.samples.length === 1 && !!A.S.samples[0].bands,
      A.S.samples[0] ? Object.keys(A.S.samples[0].bands).length + ' 个频段有数据' : 'none');

    const s0 = A.S.samples[0];
    const strat = A.stratEstimate(A.scoreBands(s0.bands, false), A.activePool().length);
    check('分层估计给出可用区间', strat && strat.half > 0 && strat.half < 4540,
      s0.n + ' 题 → ±' + (strat ? strat.half : '?') + ' 词');
    // 掌握率差异越大，分层越省题：用两组对照数据直接验证数学性质
    const split = { 1: { N: 500, n: 50, k: 48, f: 0 }, 2: { N: 500, n: 50, k: 12, f: 0 } };
    const stSplit = A.stratEstimate(A.scoreBands(split, false), 1000);
    const srsPool = A.estimate(100, 60, 1000);
    check('频段差异大时分层区间明显更窄',
      stSplit.half < Math.abs(srsPool.hi - srsPool.vocab),
      '分层 ±' + stSplit.half + ' 词 vs 简单随机 ±' + Math.abs(srsPool.hi - srsPool.vocab) + ' 词（同样 100 题）');
    // p=1 / p=0 时区间不能坍缩成 0
    const allRight = { 1: { N: 1000, n: 20, k: 20, f: 0 } };
    const stAll = A.stratEstimate(A.scoreBands(allRight, false), 1000);
    check('全对时区间不坍缩', stAll.half > 50, '20 题全对 → ±' + stAll.half + ' 词');
    A.go('home');
    check('首页给出估算与区间', /词汇量估算/.test(q('.hero h1').textContent), q('.hero h1').textContent);
    check('标注抽样来自分层', /随机抽样/.test(doc.getElementById('view').textContent));
    A.S.samples = []; A.S.session = null; A.S.status = {}; A.save();
  });

  // ---------- 回访卡：打开首页时的一句话分析（不遮挡、可永久关闭、不烧额度） ----------
  step('回访卡', () => {
    A.S.status = {}; A.S.samples = []; A.S.session = null; A.S.rounds = []; A.S.lastResult = null;
    A.S.settings.bank = 'c4'; A.S.settings.mode = 'self';
    A.S.settings.revisitOff = false;
    A._revisitHidden = false; A._revisitForce = false;
    A.save(); A.go('home');
    check('没有数据时不显示回访卡', !q('#revisitCard'), q('#revisitCard') ? '出现了' : '没有');

    // 造一份 5 天前、最高频段偏弱的抽样
    const old = Date.now() - 5 * 86400000;
    A.S.samples = [];
    A.addSample({
      n: 64, k: 40, f: 8, ts: old,
      bands: { 1: { N: 1000, n: 20, k: 8, f: 2 }, 2: { N: 1000, n: 22, k: 18, f: 2 }, 3: { N: 1000, n: 22, k: 18, f: 2 } }
    });
    A.save(); A.go('home');
    const info = A.revisitInfo();
    check('有抽样数据且满 3 天才显示', !!q('#revisitCard') && !!info && info.days === 5,
      info ? info.days + ' 天前' : 'no info');
    check('卡片报出区间与目标频段', /±/.test(q('#revisitCard').textContent) &&
      new RegExp(A.BAND_NAMES[info.target.band]).test(q('#revisitCard').textContent),
      q('#revisitCard').textContent.replace(/\s+/g, ' ').slice(0, 46));
    // 缺口词数必须和"段内总量 × (1-掌握率)"一致，不能是随手写的文案
    const expectGap = Math.round((1 - info.target.p) * info.target.N);
    check('缺口词数与频段数据一致', q('#revisitCard').textContent.includes(String(expectGap)) &&
      info.target.gapWords === expectGap, '约 ' + info.target.gapWords + ' 词');
    // 高频段还有洞时优先补高频段：这份数据里 20k 段的 p 更低，但目标段必须是高频段
    const lowest = A.bandProfile().rows.filter(r => r.p !== null && r.n >= 3)
      .sort((a, b) => a.p - b.p)[0];
    check('目标段优先高频段而不是全库最弱段', info.target.band >= 1 && info.target.band <= 3 &&
      info.weak && info.weak.band === lowest.band,
      '最弱 ' + A.BAND_NAMES[info.weak.band] + '（' + Math.round(info.weak.p * 100) + '%）→ 目标 ' +
      A.BAND_NAMES[info.target.band] + '（' + Math.round(info.target.p * 100) + '%）');
    // 上面那组数据里最弱段恰好就是高频段，规则没被真正考验；再造一组"冷门段更弱"的
    A.S.samples = [];
    A.addSample({ n: 60, k: 40, f: 6, ts: old,
      bands: { 1: { N: 1000, n: 20, k: 17, f: 1 }, 2: { N: 1000, n: 20, k: 17, f: 1 }, 0: { N: 1321, n: 20, k: 4, f: 2 } } });
    A.save(); A.go('home');
    const cold = A.revisitInfo();
    check('冷门段更弱时仍先补高频段', cold.weak.band === 0 && cold.target.band === 1,
      '最弱 ' + A.BAND_NAMES[cold.weak.band] + '（' + Math.round(cold.weak.p * 100) + '%）→ 目标 ' +
      A.BAND_NAMES[cold.target.band] + '（' + Math.round(cold.target.p * 100) + '%）');
    check('并如实说明"冷门段最弱但不先补"', /偏冷门/.test(q('#revisitCard').textContent),
      q('#revisitCard').textContent.match(/全库最弱的是[^。]*。/)?.[0] || '没有这句话');
    // 换回原来那组，后面的断言继续用它
    A.S.samples = [];
    A.addSample({
      n: 64, k: 40, f: 8, ts: old,
      bands: { 1: { N: 1000, n: 20, k: 8, f: 2 }, 2: { N: 1000, n: 22, k: 18, f: 2 }, 3: { N: 1000, n: 22, k: 18, f: 2 } }
    });
    A.save(); A.go('home');
    const perDay = A.perDayWords();
    A.S.settings.dailyMinutes = 60; A.save(); A.go('home');
    check('补完天数跟着「每日可投入时间」变', A.perDayWords() === 40 &&
      Math.ceil(A.revisitInfo().target.gapWords / 40) !== Math.ceil(expectGap / perDay),
      perDay + ' 词/天 → ' + Math.ceil(expectGap / perDay) + ' 天；改 60 分钟后 40 词/天');
    // 同一个设置必须同时驱动"报告页的计划"与"回访卡的补完天数"（曾经报告页写死 50）
    check('报告页的每日词数也读这个设置', A.levelReport().perDay === 40,
      '报告 perDay=' + A.levelReport().perDay + '，卡片 perDay=' + A.revisitInfo().perDay);

    // 不足 3 天不该打扰
    A.S.settings.dailyMinutes = 30;
    A.S.samples = [];
    A.addSample({ n: 64, k: 40, f: 8, bands: { 1: { N: 1000, n: 20, k: 8, f: 2 } } });
    A.save(); A.go('home');
    check('刚测完（0 天）不打扰', !q('#revisitCard'));

    // 收起：只影响本次会话，不落盘
    A.S.samples = [];
    A.addSample({ n: 64, k: 40, f: 8, ts: old, bands: { 1: { N: 1000, n: 20, k: 8, f: 2 } } });
    A.save(); A.go('home');
    click('[data-act="revisit-hide"]');
    check('点×收起后本次不再显示', !q('#revisitCard') && A._revisitHidden === true);
    check('收起不写进存储', !JSON.parse(win.localStorage.getItem('cet4vocab_v1')).settings.revisitOff);
    A._revisitHidden = false; A.go('home');
    check('重新渲染后卡片回来', !!q('#revisitCard'));

    // 以后不再提醒：落盘，并且能在设置里重新打开
    click('[data-act="revisit-off"]');
    check('点「以后不再提醒」后不再显示', !q('#revisitCard') &&
      JSON.parse(win.localStorage.getItem('cet4vocab_v1')).settings.revisitOff === true);
    A.go('settings');
    const tg = q('[data-act="revisit-toggle"]');
    check('设置页有回访开关且状态是关', !!tg && tg.getAttribute('aria-checked') === 'false',
      tg ? tg.getAttribute('aria-checked') : 'none');
    click('[data-act="revisit-toggle"]');
    A.go('home');
    check('设置里重新打开后卡片恢复', !!q('#revisitCard') && A.S.settings.revisitOff === false);

    // 按钮要接到真实行为
    const band = A.revisitInfo().target.band;
    click('[data-act="revisit-review"]');
    check('「开始补这一段」真的开了复测会话', !!A.S.session && A.S.session.kind === 'list' &&
      A.S.session.label.indexOf(A.BAND_NAMES[band]) >= 0,
      A.S.session ? A.S.session.label : '没有会话');
    A.S.session = null; A.go('home');
    click('[data-act="revisit-report"]');
    check('「看完整报告」真的切到报告页', /等级|报告/.test(doc.getElementById('view').textContent),
      doc.getElementById('view').textContent.replace(/\s+/g, ' ').slice(0, 24));

    // 预览：绕过天数门槛，让评委在没有历史时也能看到这张卡
    A.go('home');
    A.S.samples = []; A.S.rounds = []; A.save();
    A.go('settings');
    click('[data-act="revisit-preview"]');
    const demoCard = q('#revisitCard');
    check('设置页「预览这张卡」在没有数据时也能展示', !!demoCard && /示例/.test(demoCard.textContent),
      demoCard ? demoCard.textContent.replace(/\s+/g, ' ').slice(0, 30) : '没有卡片');
    check('示例卡片上的按钮是真实可走的下一步',
      !!q('#revisitCard [data-act="start"]'), q('#revisitCard [data-act="start"]') ? '有摸底入口' : '没有');
    A._revisitForce = false;
    A.S.status = {}; A.S.samples = []; A.S.rounds = []; A.S.session = null;
    A.S.settings.revisitOff = false; A.S.settings.dailyMinutes = 30;
    A.save(); A.go('home');
  });

  // ---------- 发音口音（美式 / 英式） ----------
  step('发音口音', () => {
    A.go('settings');
    const btns = qa('[data-act="set-accent"]');
    check('设置页有发音口音开关（美式 / 英式）', btns.length === 2,
      btns.map(b => b.textContent.trim()).join(' / '));

    // 词库音标是教材通用英式标注，TTS 默认美式——两条线都写清楚，别让用户猜
    check('默认口音是英式（贴音标与考试主流口音）', A.accentCfg().k === 'uk' && A.DEFAULT_ACCENT === 'uk',
      A.accentCfg().name);
    check('英式口音对应 en-GB', A.ACCENTS.filter(a => a.k === 'uk')[0].lang === 'en-GB',
      A.ACCENTS.map(a => a.k + '=' + a.lang).join(' '));

    // 切到英式后设置要落盘，且 speak() 不能炸（jsdom 没有 speechSynthesis，应静默降级）
    click('[data-act="set-accent"][data-accent="us"]');
    check('切到美式后写进设置', A.S.settings.accent === 'us' &&
      JSON.parse(win.localStorage.getItem('cet4vocab_v1')).settings.accent === 'us');
    check('无语音引擎时 speak() 不抛错（静默降级）', (() => {
      try { A.speak('vocabulary'); return true; } catch (e) { return false; }
    })());

    click('[data-act="set-accent"][data-accent="uk"]');
    check('切回英式', A.S.settings.accent === 'uk');
    A.go('home');
  });

  // ---------- 一个词听两种口音（四六级听力是英音美音混合） ----------
  step('双口音发音', () => {
    A.S.status = {}; A.S.samples = []; A.S.session = null; A.S.settings.mode = 'self';
    A.S.settings.sound = true; A.S.settings.accent = 'uk'; A.S.settings.autoBothAccents = false;
    A.save();
    A.startSession('list', { list: A.activePool().slice(0, 3), label: '发音测试' });
    if (A.S.session) A.judge(2);
    A.go('test');

    const btns = qa('[data-act="speak-accent"]');
    check('答题页有三个口音按钮（英 / 美 / 英+美）', btns.length === 3,
      btns.map(b => b.textContent.trim()).join(' / '));
    check('按钮分别标了 uk / us / both',
      btns.map(b => b.getAttribute('data-accent')).join(',') === 'uk,us,both',
      btns.map(b => b.getAttribute('data-accent')).join(','));

    // speakAll 要能按给定顺序连读（jsdom 没有语音引擎，这里只验证不抛错 + 参数被接受）
    check('speakAll 可连读两种口音且不抛错', (() => {
      try { A.speakAll('vocabulary', ['uk', 'us']); return true; } catch (e) { return false; }
    })());
    check('口音按钮只接受合法口音（乱传就退回默认）', (() => {
      try { A.speakAll('vocabulary', ['xx']); return A.accentCfg().k === 'uk'; } catch (e) { return false; }
    })());

    // 设置项：揭示后自动连读
    A.go('settings');
    const card = doc.getElementById('view').textContent;
    check('设置页有「揭示后连读两种口音」开关', /揭示后连读两种口音/.test(card));
    A.S.settings.autoBothAccents = true; A.save();
    check('开关值会落盘', JSON.parse(win.localStorage.getItem('cet4vocab_v1')).settings.autoBothAccents === true);
    A.S.settings.autoBothAccents = false; A.S.session = null; A.S.status = {};
    A.save(); A.go('home');
  });

  // ---------- 等级演示档案：六个等级各一个（给评委看数据用） ----------
  step('等级演示档案', () => {
    A.S.status = {}; A.S.samples = []; A.S.session = null; A.S.rounds = []; A.save();
    A.go('settings');
    const btn = q('[data-act="demo-levels"]');
    check('设置页有「生成六个等级的演示档案」入口', !!btn, btn ? btn.textContent.trim() : 'none');

    const made = A.buildDemoProfiles();
    check('一次生成 6 个演示档案', made.length === 6, made.map(m => m.rank).join('/'));

    // 关键：不是贴假等级，而是让引擎按真实作答算出等级，且必须逐个对上
    const want = ['S', 'A', 'B+', 'B', 'C', 'D'];
    const got = made.map(m => m.rank);
    check('六个档案的等级分别是 S/A/B+/B/C/D', JSON.stringify(got) === JSON.stringify(want), got.join(' '));

    // 逐个切换后再验证一次：切过去"当前档案"的等级要和生成时一致
    const list = A.profileList().filter(p => String(p.name).indexOf(A.DEMO_PREFIX) === 0);
    check('六个档案都出现在使用者列表里', list.length === 6, list.length + ' 个');
    let allMatch = true, detail = [];
    list.forEach(row => {
      A.switchProfile(row.id);
      const R = A.levelReport();
      const expect = A.DEMO_LEVELS.filter(L => row.name === A.DEMO_PREFIX + L.k + ' ' + L.name)[0];
      const ok = R.ready && R.rank && R.rank.k === expect.k;
      if (!ok) allMatch = false;
      detail.push(row.name.replace(A.DEMO_PREFIX, '') + '→' + (R.rank ? R.rank.k : '-') + '(' + Math.round(R.ratio * 100) + '%)');
    });
    check('切到每个档案后引擎算出的等级都对', allMatch, detail.join(' '));

    // 高频段必须高于封顶线，否则等级会被地基约束压下来（这是唯一容易出错的地方）
    A.switchProfile(list[list.length - 1].id);              // 拿最弱的那个检查一遍覆盖
    const R2 = A.levelReport();
    check('演示档案是 100% 覆盖（首页显示实测而非抽样）', R2.coverage >= 0.95, Math.round(R2.coverage * 100) + '%');
    check('每个档案都有补词清单可看', R2.bands.filter(b => b.N > 0).length >= 6,
      R2.bands.filter(b => b.N > 0).length + ' 个频段');

    // 重复生成不叠加
    const again = A.buildDemoProfiles();
    const demoCount = A.profileList().filter(p => String(p.name).indexOf(A.DEMO_PREFIX) === 0).length;
    check('重复生成不会叠加档案', demoCount === 6 && again.length === 6, demoCount + ' 个');

    // 清理：删掉演示档案，恢复干净状态
    A.profileList().filter(p => String(p.name).indexOf(A.DEMO_PREFIX) === 0).forEach(p => {
      if (A.profileList().length > 1) A.removeProfile(p.id);
    });
    A.S.status = {}; A.S.samples = []; A.S.session = null; A.S.rounds = []; A.save(); A.go('home');
  });

  // ---------- 好用程度：下一步建议与成绩导出 ----------
  step('结果页的下一步与导出', () => {
    A.S.status = {}; A.S.samples = []; A.S.session = null;
    A.S.settings.bank = 'c4'; A.S.settings.mode = 'self'; A.S.settings.autoNext = false; A.save();
    A.startSession('probe', { target: 999999 });
    for (let i = 0; i < 24; i++) {
      if (!A.S.session) break;                    // 探测模式达标会自动结束
      A.judge(i % 4 === 0 ? 0 : (i % 3 === 0 ? 1 : 2)); A.nextQ();
    }
    if (A.S.session) A.finishSession();
    check('已停在结果页', A.getRoute() === 'result', A.getRoute());
    const vtxt = doc.getElementById('view').textContent;
    check('结果页给出下一步', /下一步做什么/.test(vtxt));
    check('下一步写明最弱词段', /段最多/.test(vtxt), (/[\u4e00-\u9fa5k0-9\-]{2,12}段最多[^。]{0,20}/.exec(vtxt) || ['无'])[0]);
    check('有复制成绩按钮', !!q('[data-act="copy-report"]'));
    check('有打印/PDF 按钮', !!q('[data-act="print-report"]'));

    const rep = A.reportText();
    check('成绩文本含词汇量口径', /词汇量估算|接近实测/.test(rep), rep.split('\n')[2] || '');
    check('成绩文本含频段剖面', /频段剖面/.test(rep), (rep.split('\n').find(l => l.indexOf('频段剖面') === 0) || '').slice(0, 80));
    check('成绩文本含覆盖率', /覆盖率/.test(rep));

    // 按频段复测：应该只为该频段的未掌握词开一轮
    const bandBtn = q('[data-act="review-band"]');
    check('有按频段复测按钮', !!bandBtn, bandBtn ? bandBtn.textContent : '');
    if (bandBtn) {
      const want = parseInt(bandBtn.getAttribute('data-band'), 10);
      bandBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      const sess = A.S.session;
      check('按频段复测只含该段词', !!sess && sess.queue.every(i => A.bandOf(i) === want),
        sess ? sess.queue.length + ' 词，频段 ' + want : '未开始');
      A.S.session = null; A.save();
    }
    A.S.status = {}; A.S.samples = []; A.save();
  });

  // ---------- 四选一的蒙对校正 ----------
  step('四选一蒙对校正', () => {
    const bands = { 1: { N: 1000, n: 100, k: 60, f: 0 } };
    const raw = A.stratEstimate(A.scoreBands(bands, false), 1000);
    const fixed = A.stratEstimate(A.unguessBands(A.scoreBands(bands, false), 4), 1000);
    check('扣除 25% 蒙对后估计下降', fixed.vocab < raw.vocab,
      '原始 ' + raw.vocab + ' 词 → 校正 ' + fixed.vocab + ' 词');
    check('校正公式正确', Math.abs(fixed.p - (0.6 - 0.25) / 0.75) < 0.001, 'p=' + fixed.p.toFixed(3));
    A.S.samples = []; A.addSample({ n: 100, k: 60, f: 0, mode: 'choice', bands: { 1: { N: 1000, n: 100, k: 60, f: 0 } } });
    A.save();
    check('四选一样本标记为已扣蒙对', A.S.samples[0].mode === 'choice');
    A.S.samples = []; A.save();
  });

  // ---------- 回归：本轮修掉的问题 ----------
  step('统计口径与回归', () => {
    A.S.settings.includeExt = false;
    A.S.status = {}; A.S.session = null; A.S.samples = []; A.S.history = []; A.save();

    A.startSession('probe', { target: 999999 });
    click('[data-act="judge"][data-v="2"]');
    click('[data-act="judge"][data-v="2"]');
    check('重复点击不重复计数', A.S.session.log.length === 1, 'log=' + A.S.session.log.length);

    A.quitAsk();
    const beforeM = A.S.session.log.length;
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
    check('弹窗打开时快捷键不生效', A.S.session.log.length === beforeM, beforeM + ' -> ' + A.S.session.log.length);
    A.closeModal();

    A.S.status = {}; A.S.session = null; A.save();
    A.startSession('probe', { target: 999999 });
    click('[data-act="finish"]');
    check('零作答不写入历史', A.S.history.length === 0, 'history=' + A.S.history.length);
    check('零作答后留在答题页', A.getRoute() === 'test', A.getRoute());
    A.S.session = null; A.save();

    const pool2 = A.activePool();
    pool2.forEach((i, n) => { if (n % 4 === 0) A.setSt(i, 0); });
    A.S.samples = []; A.go('home');
    check('非随机样本不外推词汇量', !/≈ \d/.test(q('.hero h1').textContent), q('.hero h1').textContent);

    A.addSample({ n: 100, k: 60, f: 20 }); A.save(); A.go('home');
    const heroTxt = q('.hero h1').textContent;
    check('随机样本足够时给出估算', /词汇量估算/.test(heroTxt), heroTxt);

    const g1 = A.groups()[5].map(i => A.WORDS[i].w).join(',');
    A.S.settings.includeExt = true;
    const g2 = A.groups()[5].map(i => A.WORDS[i].w).join(',');
    check('分组边界不随拓展开关漂移', g1 === g2 && g1.length > 0, g1.slice(0, 40));
    check('开启拓展后组数增加', A.groups().length > A.coreGroupsCount(), A.groups().length + ' vs ' + A.coreGroupsCount());
    A.S.settings.includeExt = false;

    check('全部词条都有音标', A.WORDS.every(w => w.p && w.p.length > 0), '缺音标 ' + A.WORDS.filter(w => !w.p).length + ' 条');
    check('音标里没有损坏字符', !A.WORDS.some(w => /[\uE000-\uF8FF]/.test(w.p + w.t)), '命中 ' + A.WORDS.filter(w => /[\uE000-\uF8FF]/.test(w.p + w.t)).length);
    const extIdx0 = A.WORDS.findIndex(w => w.x);
    const rowHtml = A.wordRow(extIdx0);
    check('拓展词也显示音标、不出现 //',
      A.WORDS[extIdx0].p.length > 0 && rowHtml.indexOf('/' + A.WORDS[extIdx0].p + '/') >= 0 && rowHtml.indexOf('//') < 0,
      A.WORDS[extIdx0].w + ' /' + A.WORDS[extIdx0].p + '/');
    A.addSample({ n: 100, k: 60, f: 20, pre: 30 }); A.save(); A.go('stats');
    const statsTxt = doc.getElementById('view').textContent;
    const U = A.activePool().length;
    const expStrict = Math.round(0.6 * U).toLocaleString('en-US');
    const expLoose = Math.round(0.7 * U).toLocaleString('en-US');
    check('统计页同时给出两种口径',
      statsTxt.indexOf('严格口径 ' + expStrict + ' 词') >= 0 && statsTxt.indexOf('折中口径 ' + expLoose + ' 词') >= 0,
      '词库 ' + U + ' → 严格 ' + expStrict + ' / 折中 ' + expLoose);
    check('提示复习效应', /此前已测过/.test(statsTxt));
    A.S.samples = [];

    check('备份解析兼容 BOM', A.parseBackup('\uFEFF' + JSON.stringify({ status: { x: 2 } })).status.x === 2);
    let rejected = false;
    try { A.parseBackup('{"nope":1}'); } catch (e) { rejected = true; }
    check('备份解析拒绝坏文件', rejected);

    A.setSt(A.activePool()[0], 2);
    A.startSession('list', { list: A.activePool().slice(0, 8), label: '测试' });
  });

    // 模拟刷新
    const dom2 = makeDom(global.__savedRaw);
    win.close();
    setTimeout(() => {
      try {
        const A2 = dom2.window.__APP__;
        check('刷新后状态恢复', !!A2 && Object.keys(A2.S.status).length === global.__statusCount,
          A2 ? Object.keys(A2.S.status).length + ' 条（期望 ' + global.__statusCount + '）' : 'n/a');
        check('刷新后恢复未完成会话', !!A2 && !!A2.S.session);
        const v2 = dom2.window.document.getElementById('view').innerHTML;
        check('刷新后首页渲染', /词汇量估算/.test(v2));
        check('刷新后随机样本仍保留', (A2.S.samples || []).length >= 1, JSON.stringify((A2.S.samples || []).length));
        check('刷新后检测顺序不变（第 1 组仍是同一批词）',
          !!A2 && A2.groups()[0].join(',') === global.__g1,
          A2 ? A2.groups()[0].slice(0, 3).map(i => A2.WORDS[i].w).join(',') : 'n/a');
      } catch (e) { RESULTS.push('FAIL | 刷新测试异常 | ' + e.message); }

      // ---------- 词汇等级评估报告 ----------
      step('level', () => {
        const A2 = dom2.window.__APP__;   // 上面的 A2 是 try 块里的块级变量，这里重新取一次
        const pool = A2.activePool();

        // 极端案例 A：整库都认识 → 必须是最高等级、缺口为 0
        pool.forEach(i => A2.setSt(i, 2));
        let R = A2.levelReport();
        check('整库认识 → 最高等级', R.rank.k === 'S' && Math.abs(R.ratio - 1) < 1e-9, R.rank.k + ' ' + R.ratio);
        check('整库认识 → 无缺口', R.toNext === 0 && R.bands.every(b => b.deficit === 0));
        check('整库认识 → 达到实测口径', R.ready === true && R.coverage > 0.999);

        // 极端案例 B：只把最高频 1k 段全部改成不认识 → 等级必须掉，且"地基漏洞"要被算出来
        const b1 = pool.filter(i => A2.bandOf(i) === 1);
        b1.forEach(i => A2.setSt(i, 0));
        R = A2.levelReport();
        check('高频段全丢 → 等级下降', R.rank.k !== 'S', R.rank.k + ' @ ' + (R.ratio * 100).toFixed(1) + '%');
        check('地基漏洞被单独算出来', R.baseGap > 0, 'baseGap=' + R.baseGap);
        check('最高频段全丢 → 触发地基约束封顶', R.cap !== null && R.cap === R.rank,
          '按比例=' + R.rankByRatio.k + ' 封顶后=' + R.rank.k);
        check('提升优先级里含最高频段', R.gainTop.some(g => g.band === 1),
          '优先级频段=' + R.gainTop.map(g => g.band).join(','));

        /* 词频权重必须真的起作用：
           让 3k-5k（band 4）和 10k-20k（band 6）都全没掌握，其余全认识。
           10k-20k 的词数更多（缺口绝对值更大），但 3k-5k 频率高得多，
           加权后 3k-5k 必须排在前面 —— 这正是"不按缺口绝对值排"的意义。 */
        pool.forEach(i => A2.setSt(i, 2));
        const b4 = pool.filter(i => A2.bandOf(i) === 4);
        const b6 = pool.filter(i => A2.bandOf(i) === 6);
        b4.forEach(i => A2.setSt(i, 0));
        b6.forEach(i => A2.setSt(i, 0));
        R = A2.levelReport();
        const gi4 = R.gainTop.findIndex(g => g.band === 4);
        const gi6 = R.gainTop.findIndex(g => g.band === 6);
        check('缺口加权：高频段排在低频段前面', gi4 >= 0 && gi6 >= 0 && gi4 < gi6,
          '3k-5k 位次=' + gi4 + '（缺' + (R.gainTop[gi4] || {}).deficit + '）' +
          ' 10k-20k 位次=' + gi6 + '（缺' + (R.gainTop[gi6] || {}).deficit + '）');
        check('增益值 = 缺口 × 词频权重', R.gainTop.every(g => Math.abs(g.gain - g.deficit * g.w) < 1e-9));
        check('优先级按增益值降序', R.gainTop.every((g, i) => i === 0 || R.gainTop[i - 1].gain >= g.gain));

        // 等级阶梯必须严格单调，否则 rankAt 会挑错
        const mins = A2.RANKS.map(r => r.min);
        check('评级阶梯单调递减', mins.every((v, i) => i === 0 || v < mins[i - 1]), mins.join(' > '));

        // 报告页渲染 + 纯文本版 + 左侧信封
        A2.go('report');
        const rv = A2.el('view').innerHTML;
        check('报告页渲染出等级卡与阶梯', /rpt-hero/.test(rv) && /rpt-badge/.test(rv) && /rpt-ladder/.test(rv));
        check('报告页列出逐频段实测', /rpt-btable/.test(rv) && /rpt-brow/.test(rv));
        const txt = A2.levelReportText();
        check('报告文本含等级与两种口径', /等级：/.test(txt) && /严格口径/.test(txt) && /逐频段/.test(txt));
        check('左侧信封同步显示等级', !!A2.el('mailSeal') && A2.el('mailSeal').textContent === R.rank.k,
          A2.el('mailSeal') ? A2.el('mailSeal').textContent : 'n/a');

        // 两侧信息栏：进度环与等级印章都要跟着真实状态走
        check('左侧进度环显示 100%', (A2.el('railPct') || {}).textContent === '100%',
          (A2.el('railPct') || {}).textContent);
        check('进度环描边已走满',
          parseFloat((A2.el('railRing') || { style: {} }).style.strokeDashoffset) < 1,
          (A2.el('railRing') || { style: {} }).style.strokeDashoffset);
        check('右上印章显示等级字母', (A2.el('sealIn') || {}).textContent === R.rank.k,
          (A2.el('sealIn') || {}).textContent);
        check('印章带 ready 态与色调',
          /seal ready/.test((A2.el('seal') || {}).className || '') &&
          (A2.el('seal').className || '').indexOf('tone-' + R.rank.tone) > 0,
          (A2.el('seal') || {}).className);

        // 词汇地图：数据层
        const VM = A2.vocabMap();
        check('地图是 7 段 × 26 字母', VM.rows.length === 7 && VM.rows.every(r => r.cells.length === 26),
          VM.rows.length + ' 段 / ' + (VM.rows[0] || { cells: [] }).cells.length + ' 字母');
        check('每个格子自带词频段名（缺口摘要不会只剩字母）',
          VM.rows.every(r => r.cells.every(c => !!c.name)), '');
        const hc = VM.hot[0];
        check('地图能指出洞口最大的格子', !!hc && hc.gap > 0,
          hc ? (hc.name + ' · ' + hc.letter + ' 测过还缺 ' + hc.gap + ' 词') : 'n/a');
        const mw = hc ? A2.mapCellWords(hc.band, hc.letter) : [];
        check('缺口格子里确实有词可复测', mw.length > 0, mw.length + ' 词');
        check('地图格子的词只属于该段该字母',
          mw.every(i => A2.bandOf(i) === hc.band && String(A2.WORDS[i].w).charAt(0).toUpperCase() === hc.letter),
          mw.length + ' 词');
        check('地图格子只收缺口词（未测/模糊/不认识）',
          mw.every(i => { const s = A2.getSt(i); return s === undefined || s < 2; }), '');
        check('全部认识时地图没有未测词', A2.untestedWords().length === 0, String(A2.untestedWords().length));
      });

      // ---------- 多轮检测：轮次归档与逐词对比 ----------
      step('rounds', () => {
        const A3 = dom2.window.__APP__;
        const before = A3.levelReport();

        check('测完整个词库后可以开新一轮', A3.canRetest() === true);
        check('归档前没有历史轮次', A3.roundHistory().length === 0, String(A3.roundHistory().length));

        check('开新一轮成功', A3.startNewRound() === true);
        check('轮次 +1', A3.roundNo() === 2, String(A3.roundNo()));
        check('历史里多了一轮', A3.roundHistory().length === 1);
        check('新一轮作答已清空', Object.keys(A3.S.status).length === 0, Object.keys(A3.S.status).length + ' 条');
        check('会话/样本/历史一并清空', A3.S.session === null &&
          (A3.S.samples || []).length === 0 && (A3.S.history || []).length === 0);
        check('新一轮没测完就不给等级', A3.canRetest() === false);

        const snap = A3.roundHistory()[0];
        check('归档快照记住了上一轮的等级与词汇量',
          snap.rank === before.rank.k && snap.loose === before.loose, snap.rank + ' ' + snap.loose);
        check('归档快照含逐词位图与词表指纹', !!snap.snap && snap.snap.length > 100 && !!snap.fp,
          (snap.snap || '').length + ' 字符');
        check('归档快照含各频段数据', (snap.bands || []).length > 3, String((snap.bands || []).length));

        // 造第二轮：绝大多数认识，少数退步（模拟"背了又忘"）
        const pool2 = A3.activePool();
        pool2.forEach((i, idx) => A3.setSt(i, idx % 97 === 0 ? 0 : 2));
        const dd = A3.roundDiff();
        check('逐词对比可用（指纹匹配）', !!dd && dd.stale === false);
        check('保持率与"保留 + 遗忘"自洽', dd.retained + dd.forgottenCount === dd.prevKnown,
          dd.retained + ' + ' + dd.forgottenCount + ' = ' + dd.prevKnown);
        check('识别出新学会的词', dd.gained > 0, String(dd.gained));
        check('遗忘词给出可复测的索引', dd.forgottenIdx.length === dd.forgottenCount && dd.forgottenCount > 0,
          String(dd.forgottenCount));

        // 第二轮测完后可以再开一轮，历史累积
        check('第二轮也能归档', A3.startNewRound() === true && A3.roundHistory().length === 2,
          String(A3.roundHistory().length));
        check('历史轮次按顺序累积', A3.roundHistory().map(r => r.n).join(',') === '1,2',
          A3.roundHistory().map(r => r.n).join(','));
      });

      // ---------- 使用者档案：同机多人，数据必须完全隔离 ----------
      step('profiles', () => {
        const A3 = dom2.window.__APP__;
        const doc3 = dom2.window.document;
        const list0 = A3.profileList();
        check('默认就有一个使用者档案', list0.length === 1 && !!list0[0].name,
          JSON.stringify(list0.map(p => p.name)));
        check('顶栏名字跟当前档案一致', A3.myName() === list0[0].name, A3.myName());

        // 前面的步骤把作答清空了，这里先造两条，才能验证"档案机制不会弄丢数据"
        const pool3 = A3.activePool();
        A3.setSt(pool3[0], 2); A3.setSt(pool3[1], 1); A3.save();
        const before = Object.keys(A3.S.status).length;
        check('档案机制没有弄丢老数据', before === 2, before + ' 条');

        const rec = A3.createProfile('李四');
        check('新建使用者成功', !!rec && rec.name === '李四', rec && rec.name);
        check('新使用者从零开始', Object.keys(A3.S.status).length === 0,
          Object.keys(A3.S.status).length + ' 条');
        check('新使用者需要走一次称呼引导', A3.needsWelcome() === true, String(A3.needsWelcome()));
        check('档案数 +1', A3.profileList().length === 2, String(A3.profileList().length));
        A3.go('home');
        check('新使用者首页出现称呼引导条', !!doc3.querySelector('.welcome'), '');

        A3.setSt(A3.activePool()[0], 2); A3.save();
        check('新使用者的作答存在自己的档案里', Object.keys(A3.S.status).length === 1,
          Object.keys(A3.S.status).length + ' 条');

        A3.switchProfile(list0[0].id);
        check('切回原使用者后数据原样还原', Object.keys(A3.S.status).length === before,
          Object.keys(A3.S.status).length + ' vs ' + before);

        const sums = A3.profileSummaries();
        check('档案列表能显示各自进度', sums.length === 2 && sums.every(s => typeof s.tested === 'number'),
          sums.map(s => s.name + ':' + s.tested).join(' | '));

        A3.renameProfile(list0[0].id, '张三');
        check('改名生效且不动数据', A3.myName() === '张三' && Object.keys(A3.S.status).length === before,
          A3.myName());

        A3.removeProfile(list0[0].id);
        check('删除使用者后仍保留其余档案', A3.profileList().length === 1, String(A3.profileList().length));
        check('不能把最后一个使用者删掉',
          A3.removeProfile(A3.activeProfile().id) === false && A3.profileList().length === 1,
          String(A3.profileList().length));
      });

      report();
    }, 250);
  } catch (e) {
    RESULTS.push('FAIL | 顶层异常 | ' + (e && e.stack ? e.stack.slice(0, 300) : e));
    report();
  }
});

function report() {
  console.log(RESULTS.join('\n'));
  const f = RESULTS.filter(r => r.indexOf('FAIL') === 0).length;
  console.log('\n通过 ' + (RESULTS.length - f) + ' / ' + RESULTS.length + '，失败 ' + f);
  console.log(errors.length ? ('\n未捕获错误:\n' + errors.slice(0, 8).join('\n')) : '无未捕获错误');
}