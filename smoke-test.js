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
      check('首字母柱状图 26 列', qa('.barcol').length === 26, String(qa('.barcol').length));
      check('无随机样本时不给词汇量', /数据不足/.test(doc.getElementById('view').textContent));
      A.addSample({ n: 100, k: 62, f: 18 }); A.save(); A.go('stats');
      check('有随机样本时给出估算', /3,2\d\d/.test(doc.getElementById('view').textContent), (/≈ [\d,]+ 词/.exec(doc.getElementById('view').textContent) || ['无'])[0]);
      check('给出等级评价', /基础薄弱|偏弱|中等|良好|优秀/.test(doc.getElementById('view').textContent));
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