const fs = require('fs'), path = require('path');
// jsdom 优先用项目内依赖，找不到时回退到本机已有的副本（保证 clone 下来 npm i 之后能跑）
function requireJsdom() {
  try { return require('jsdom'); }
  catch (e) { return require('C:/Users/27295/deepseek-harness/node_modules/jsdom'); }
}
const { JSDOM, VirtualConsole } = requireJsdom();
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
const win = dom.window, doc = win.document;
const out = [];
const say = (n, v) => out.push('[' + n + '] ' + v);

// 对比度计算（WCAG）
function lum(hex) {
  const c = hex.replace('#', '').match(/../g).map(x => parseInt(x, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) { const l1 = lum(a), l2 = lum(b); return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)); }
say('J 对比度', '--text3 #98a0b8 / 白底 = ' + ratio('98a0b8', 'ffffff').toFixed(2) + ':1（AA 正文需 4.5:1）；--text2 #5b6480 = ' + ratio('5b6480', 'ffffff').toFixed(2) + ':1；.tiny 用的正是 text3');

win.addEventListener('load', () => {
  const A = win.__APP__;
  const q = s => doc.querySelector(s);
  const qa = s => Array.from(doc.querySelectorAll(s));
  const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const vt = () => doc.getElementById('view').textContent;
  A.S.settings.autoNext = false; A.S.settings.includeExt = false;

  // B' 真实双击：每次重新查询元素（模拟浏览器把点击派发给重绘后的新节点）
  A.S.status = {}; A.startSession('quick', { size: 10 });
  const w = q('.qword').textContent;
  click(q('[data-act="judge"][data-v="2"]'));
  const mid = A.S.session.log.length;
  click(q('[data-act="judge"][data-v="2"]'));   // 元素已重绘，重新取一次
  say('B\' 重复评分', '连续两次点「认识」：日志 ' + mid + ' → ' + A.S.session.log.length + '（词 ' + w + '），题号 pos=' + A.S.session.pos);

  // N 一次没答就结束
  A.S.status = {}; A.S.session = null; A.startSession('quick', { size: 10 });
  A.finishSession();
  say('N 零作答结束', '结果页文案片段：' + JSON.stringify(vt().replace(/\s+/g, ' ').slice(0, 90)));

  // Q 术语一致性：「已掌握」在不同页面含义不同
  A.S.status = {}; const pool = A.activePool();
  A.setSt(pool[0], 2); A.setSt(pool[1], 1); A.save(); A.go('home');
  const gtxt = qa('.gbtn')[0].textContent;
  A.go('wrong');
  const wtab = qa('.tabs button')[3].textContent;
  say('Q 术语打架', '分组卡片写「' + gtxt + '」（把模糊也算掌握），生词本页签写「' + wtab + '」（只算认识）');

  // I' 无障碍：设置页开关能否键盘操作
  A.go('settings');
  const tg = qa('.toggle');
  say('I\' 开关可达性', '开关 ' + tg.length + ' 个，标签=' + tg[0].tagName + '，tabindex=' + (tg[0].getAttribute('tabindex') || '无') + '，role=' + (tg[0].getAttribute('role') || '无') + '，aria-checked=' + (tg[0].getAttribute('aria-checked') || '无'));
  const iconBtns = qa('.icon-btn, .spk, .chip').slice(0, 3).map(b => b.tagName + '[aria-label=' + (b.getAttribute('aria-label') || '无') + ']');
  say('I\'2 图标按钮语义', iconBtns.join(' '));
  say('I\'3 动态播报', '作答/翻页后是否有 aria-live 区域：' + (doc.querySelector('[aria-live]') ? '有' : '没有'));

  // R 数据：i. 这条垃圾词条
  const bad = A.WORDS.findIndex(x => x.w === 'i.');
  say('R 垃圾词条', bad >= 0 ? ('词表里存在词条 "' + A.WORDS[bad].w + '"，释义=' + JSON.stringify(A.WORDS[bad].t) + '（把 i.e. 拆错了）') : '未发现');
  say('R2 i.e./e.g.', '词表含 i.e.：' + A.WORDS.some(x => x.w === 'i.e.') + '，含 e.g.：' + A.WORDS.some(x => x.w === 'e.g.'));

  // S 性能：状态字典变大后每次作答的同步写盘开销
  A.S.status = {}; pool.forEach(i => A.setSt(i, 2)); A.save();
  const raw = win.localStorage.getItem(A.KEY) || '';
  const t0 = Date.now(); for (let i = 0; i < 50; i++) A.save(); const t1 = Date.now();
  say('S 存储开销', '满量状态字典 ' + Math.round(raw.length / 1024) + ' KB，单次 save() 约 ' + ((t1 - t0) / 50).toFixed(2) + ' ms（每答一题至少调用一次）');

  console.log(out.join('\n'));
});