const fs = require('fs'), path = require('path');
// jsdom 优先用项目内依赖，找不到时回退到本机已有的副本（保证 clone 下来 npm i 之后能跑）
function requireJsdom() {
  try { return require('jsdom'); }
  catch (e) { return require('C:/Users/27295/deepseek-harness/node_modules/jsdom'); }
}
const { JSDOM, VirtualConsole } = requireJsdom();
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const vc = new VirtualConsole();
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', virtualConsole: vc, pretendToBeVisual: true });
const win = dom.window, doc = win.document;

win.addEventListener('load', () => {
  const A = win.__APP__;
  const q = s => doc.querySelector(s);
  const qa = s => Array.from(doc.querySelectorAll(s));
  const click = (s, el) => { const e = el || q(s); if (!e) throw new Error('no el ' + s); e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); };
  const key = k => doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const vt = () => doc.getElementById('view').textContent;
  const out = [];
  const say = (n, v) => out.push('[' + n + '] ' + v);

  A.S.settings.autoNext = false;

  // A. 只测 1 个词，首页就敢报词汇量？
  A.setSt(A.activePool()[0], 2); A.save(); A.go('home');
  say('A 单个词就估算', /你的四级词汇量：([\d,]+) 词/.exec(vt()) ? '首页显示 ' + /你的四级词汇量：([\d,]+) 词/.exec(vt())[1] + ' 词（1 个样本）' : '未显示');
  A.go('stats');
  const estTxt = /≈ ([\d,]+) 词/.exec(vt());
  say('A2 统计页阈值', '已测 1 词时统计页' + (estTxt ? '给出 ≈' + estTxt[1] + ' 词（说明文字却写着「至少测 20 个词才给出估算」，自相矛盾）' : '不给估算'));

  // B. 连点两次「认识」会重复计数吗
  A.S.status = {}; A.S.session = null; A.save();
  A.startSession('quick', { size: 10 });
  const w1 = q('.qword').textContent;
  const btn = q('[data-act="judge"][data-v="2"]');
  click(null, btn); click(null, btn);
  say('B 连点两次评分', '同一个词 ' + w1 + ' 的日志条数 = ' + A.S.session.log.length + '（期望 1）');

  // C. 生词复习模式的数据会污染词汇量估算
  A.S.status = {}; A.S.session = null; A.S.lastResult = null;
  A.activePool().forEach((i, n) => { if (n % 3 === 0) A.setSt(i, 0); });   // 模拟：只复习过错词
  A.save(); A.go('home');
  const heroC = /你的四级词汇量：([\d,]+) 词/.exec(vt());
  say('C 复习模式偏差', '已测 ' + A.activePool().filter(i => A.getSt(i) !== undefined).length + ' 词（全部来自错词复习）时，首页报 ' + (heroC ? heroC[1] : '?') + ' 词');

  // D. 弹窗打开时快捷键还会不会作答
  A.S.status = {}; A.save();
  A.startSession('quick', { size: 10 });
  const wD = q('.qword').textContent;
  A.quitAsk();                       // 打开「要离开吗」弹窗
  const before = A.S.session.log.length;
  key('3');                          // 按 3 = 认识
  say('D 弹窗+快捷键', '弹窗开启时按 3，日志 ' + before + ' → ' + A.S.session.log.length + '，当前词 ' + wD + ' 状态=' + A.getSt(A.S.session.queue[A.S.session.pos]));
  A.closeModal();

  // E. 自动跳转计时器在离开答题页后仍会触发
  A.S.status = {}; A.S.session = null; A.save();
  A.S.settings.autoNext = true; A.S.settings.autoDelay = 120;
  A.startSession('quick', { size: 5 });
  click('[data-act="judge"][data-v="2"]');
  A.go('stats');                     // 立刻离开答题页
  setTimeout(() => {
    say('E 离开后计时器', '离开答题页后 route=' + A.getRoute() + '，会话题号 pos=' + (A.S.session ? A.S.session.pos : 'null') + '（计时器仍在推进/可能把人拽去结果页）');
    A.S.settings.autoNext = false;

    // F. 导入备份时的 BOM 兼容性
    const raw = JSON.stringify(A.S);
    try { JSON.parse('\uFEFF' + raw); say('F 导入备份', 'JSON.parse(BOM+内容) 成功'); }
    catch (e) { say('F 导入备份', 'JSON.parse(BOM+内容) 抛错：' + e.message + '（导出文件带 BOM，导入解析函数里没有剥离）'); }

    // G. 切换拓展词后分组边界变化
    const g1 = A.groups()[5].map(i => A.WORDS[i].w).slice(0, 3).join(',');
    A.S.settings.includeExt = true;
    const g2 = A.groups()[5].map(i => A.WORDS[i].w).slice(0, 3).join(',');
    A.S.settings.includeExt = false;
    say('G 分组边界', '第 6 组开头：核心词库=' + g1 + ' → 含拓展=' + g2 + (g1 === g2 ? '（一致）' : '（边界漂移，历史记录里的「第 N 组」含义会变）'));

    // H. 无音标词的展示
    const noPhon = A.WORDS.findIndex(w => !w.p);
    A.go('wrong');
    A.setSt(noPhon, 0); A.save(); A.go('wrong');
    const row = Array.from(doc.querySelectorAll('.witem')).find(r => r.textContent.indexOf(A.WORDS[noPhon].w) === 0);
    say('H 无音标显示', A.WORDS[noPhon].w + ' 显示为 ' + JSON.stringify(row ? row.querySelector('.tiny').textContent : '未找到'));

    // I. 无障碍：开关是 div，键盘不可达
    const toggles = qa('.toggle').length;
    const focusable = qa('.toggle[tabindex], button.toggle, input.toggle').length;
    say('I 无障碍', '设置页开关 ' + toggles + ' 个，其中可键盘聚焦的 ' + focusable + ' 个');

    console.log(out.join('\n'));
  }, 400);
});