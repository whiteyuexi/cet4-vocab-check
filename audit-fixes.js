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
const say = (id, ok, v) => out.push((ok ? 'FIXED  ' : 'STILL  ') + id + ' | ' + v);

win.addEventListener('load', async () => {
  const A = win.__APP__;
  const q = s => doc.querySelector(s);
  const qa = s => Array.from(doc.querySelectorAll(s));
  const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const vt = () => doc.getElementById('view').textContent;
  A.S.settings.autoNext = false;

  // 1) 单样本不再报数字
  A.S.status = {}; A.S.samples = []; A.setSt(A.activePool()[0], 2); A.save(); A.go('home');
  say('1 样本不足不报词汇量', !/[\d,]{3,}\s*词/.test(q('.hero h1').textContent), q('.hero h1').textContent);
  A.go('stats');
  say('2 统计页同步口径', /数据不足/.test(vt()), (/数据不足[^。]{0,60}/.exec(vt()) || ['未找到'])[0]);

  // 3) 复习/分组等非随机样本不外推
  A.S.status = {}; A.activePool().forEach((i, n) => { if (n % 3 === 0) A.setSt(i, 0); }); A.S.samples = []; A.save(); A.go('home');
  say('3 非随机样本不外推', !/[\d,]{3,}\s*词/.test(q('.hero h1').textContent), q('.hero h1').textContent);

  // 4) 随机样本足够时给出估算，且覆盖 95% 后转为实测
  A.addSample({ n: 100, k: 60, f: 20 }); A.save(); A.go('home');
  say('4 随机样本给出估算', /≈ 3,1\d\d 词/.test(q('.hero h1').textContent), q('.hero h1').textContent);
  A.S.status = {}; A.activePool().forEach(i => A.setSt(i, 2)); A.save(); A.go('home');
  say('5 覆盖 95% 转为实测值', /你的四级词汇量：4,540 词/.test(q('.hero h1').textContent), q('.hero h1').textContent);

  // 6) 重复点击不重复计数
  A.S.status = {}; A.S.session = null; A.save();
  A.startSession('probe', { target: 999999 });
  click(q('[data-act="judge"][data-v="2"]')); click(q('[data-act="judge"][data-v="2"]'));
  say('6 重复评分不重复计数', A.S.session.log.length === 1, 'log=' + A.S.session.log.length);

  // 7) 弹窗拦截快捷键
  A.quitAsk();
  const b7 = A.S.session.log.length;
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
  say('7 弹窗时快捷键被拦截', A.S.session.log.length === b7, b7 + ' -> ' + A.S.session.log.length);
  A.closeModal();

  // 8) 离开答题页后计时器不再推进
  A.S.status = {}; A.S.session = null; A.S.settings.autoNext = true; A.S.settings.autoDelay = 100; A.save();
  A.startSession('probe', { target: 999999 });
  click(q('[data-act="judge"][data-v="2"]'));
  A.go('stats');
  await new Promise(r => setTimeout(r, 400));
  say('8 离开后计时器停摆', A.S.session.pos === 0 && A.getRoute() === 'stats', 'pos=' + A.S.session.pos + ' route=' + A.getRoute());
  A.S.settings.autoNext = false;

  // 9) 零作答不产生空记录
  A.S.status = {}; A.S.session = null; A.S.history = []; A.save();
  A.startSession('probe', { target: 999999 });
  click(q('[data-act="finish"]'));
  say('9 零作答不写历史', A.S.history.length === 0 && A.getRoute() === 'test', 'history=' + A.S.history.length + ' route=' + A.getRoute());
  A.S.session = null;

  // 10) 分组边界稳定
  const g1 = A.groups()[5].map(i => A.WORDS[i].w).join(',');
  A.S.settings.includeExt = true;
  const g2 = A.groups()[5].map(i => A.WORDS[i].w).join(',');
  A.S.settings.includeExt = false;
  say('10 分组边界不漂移', g1 === g2, g1.slice(0, 30) + ' / ' + g2.slice(0, 30));

  // 11) 导出/导入往返：JSON 不带 BOM 且能被导入
  let captured = null;
  const origCreate = win.URL.createObjectURL;
  win.URL.createObjectURL = function (b) { captured = b; return 'blob:test'; };
  A.exportJSON();
  let jsonText = '';
  try { jsonText = await captured.text(); } catch (e) { jsonText = '(无法读取 Blob: ' + e.message + ')'; }
  win.URL.createObjectURL = origCreate;
  say('11 导出的 JSON 不带 BOM', jsonText.charCodeAt(0) !== 0xFEFF, '首字符码点=' + jsonText.charCodeAt(0));
  let roundTrip = false;
  try { const parsed = A.parseBackup(jsonText); roundTrip = !!parsed.status; } catch (e) { roundTrip = false; }
  say('12 导出→导入可往返', roundTrip, roundTrip ? '解析成功' : '解析失败');

  // 13) 无音标词不再显示 //
  const ext0 = A.WORDS.findIndex(w => w.x);
  const rowHtml = A.wordRow(ext0);
  say('13 拓展词也有音标且不显示 //',
    !!A.WORDS[ext0].p && rowHtml.indexOf('/' + A.WORDS[ext0].p + '/') >= 0 && rowHtml.indexOf('//') < 0,
    A.WORDS[ext0].w + ' /' + A.WORDS[ext0].p + '/');

  // 14) 无障碍：开关可键盘操作
  A.go('settings');
  const tg = qa('.toggle');
  say('14 开关语义与可达性', tg.length > 0 && tg.every(b => b.tagName === 'BUTTON' && b.getAttribute('role') === 'switch' && b.hasAttribute('aria-checked')),
    tg.length + ' 个：' + (tg[0] ? tg[0].tagName + ' role=' + tg[0].getAttribute('role') + ' aria-checked=' + tg[0].getAttribute('aria-checked') : '无'));
  say('15 图标按钮有 aria-label', qa('#themeBtn[aria-label], .chip[aria-label]').length > 0, '带标签的图标按钮数=' + qa('[aria-label]').length);
  say('16 有 aria-live 播报区', !!doc.querySelector('[aria-live]'), doc.querySelector('[aria-live]') ? 'role=' + doc.querySelector('[aria-live]').getAttribute('role') : '无');

  // 17) 数据：i. 垃圾词条与缺音标
  say('17 i. 垃圾词条已清除', !A.WORDS.some(w => w.w === 'i.'), 'i.e. 是否在词表：' + A.WORDS.some(w => w.w === 'i.e.'));
  say('18 核心词全部有音标', A.WORDS.filter(w => !w.x).every(w => w.p), '缺音标核心词=' + A.WORDS.filter(w => !w.x && !w.p).length);
  const fuss = (A.WORDS.find(w => w.w === 'fuss') || {}).t || '';
  say('19 fuss 释义不再重复', fuss.split('大惊小怪').length === 2, fuss);
  say('20 全部词条有音标', A.WORDS.every(w => w.p), '无音标 ' + A.WORDS.filter(w => !w.p).length + ' 条');
  say('21 音标无损坏字符', !A.WORDS.some(w => /[\uE000-\uF8FF]/.test(w.p + w.t)), '命中 ' + A.WORDS.filter(w => /[\uE000-\uF8FF]/.test(w.p + w.t)).length + ' 条');
  say('22 统计口径给出双版本', (function () {
    A.S.status = {}; A.S.samples = []; A.addSample({ n: 100, k: 60, f: 20, pre: 5 }); A.save(); A.go('stats');
    const t = doc.getElementById('view').textContent;
    return /严格口径/.test(t) && /折中口径/.test(t);
  })(), '两种口径同时列出');
  A.S.samples = [];

  console.log(out.join('\n'));
});