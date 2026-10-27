// scripts/make-ppt-detail.mjs — 详细版 PPT（约 26 页，每页配一张网页实拍）
//
// 与两版的关系：
//   路演稿（12 页 / 5 分钟）—— 只讲结论，一页一个观点
//   答辩稿（14 页）—— 偏技术深度
//   本文件（26 页 / 15-20 分钟）—— 讲全讲细：每个功能都有一页，配真实界面截图
//
// 视觉语言沿用「撞色但克制」：米白纸 + 顶部深色带 + 橙红点缀 + 底部数据带。
// 图片一律用 docs/screenshots 里的局部特写（2x），投到 10 米外也看得清。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const OUT = process.argv[2] || path.join(os.homedir(), 'Desktop', '词汇账户余额查询-详细版.pptx');

const C = {
  paper: 'FAF8F4', ink: '12130F', ink2: '5E574E', ink3: '8A8378',
  orange: 'FF4D2E', dark: '12130F', cream: 'F0EDE6', dim: 'A29A8C',
  white: 'FFFFFF', blue: '2A5BE0', ok: '0A6B4A', warn: '8A5A10', bad: 'B02E22',
  softBlue: 'EDF2FF', softOrange: 'FFEDE8', softGreen: 'EAF7F1',
};
const F = '微软雅黑', FM = 'Consolas';
const W = 13.333, H = 7.5, M = 0.82, CW = W - M * 2;

const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'DET', width: W, height: H });
pptx.layout = 'DET';
pptx.author = '词汇账户余额查询';
pptx.Company = '广东亚视演艺职业学院 · 信息工程学院';
pptx.title = '词汇账户余额查询 · 详细版';

let page = 0;
const TOTAL = 32;

/* ---------- 版式助手 ---------- */
function slide(opt = {}) {
  page++;
  const s = pptx.addSlide();
  s.background = { color: opt.bg || C.paper };
  if (opt.topBar !== false) {
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.4, fill: { color: C.dark } });
    s.addText('词汇账户余额查询 · CET VOCAB PROFILER', {
      x: M, y: 0.09, w: 7, h: 0.24, fontFace: FM, fontSize: 8.5, color: C.cream, charSpacing: 2,
    });
    s.addText(opt.kicker || '', {
      x: W - M - 6.4, y: 0.09, w: 6.4, h: 0.24, fontFace: F, fontSize: 8.5, color: C.dim, align: 'right',
    });
  }
  if (!opt.noPage) {
    s.addText(page + ' / ' + TOTAL, {
      x: W - M - 1.1, y: H - 0.44, w: 1.1, h: 0.24, fontFace: FM, fontSize: 8.5, color: C.ink3, align: 'right',
    });
  }
  return s;
}
function title(s, text, opt = {}) {
  s.addText(text, {
    x: M, y: opt.y ?? 0.62, w: opt.w ?? CW, h: opt.h ?? 0.85,
    fontFace: F, fontSize: opt.sz ?? 28, bold: true, color: opt.color || C.ink,
    charSpacing: -0.6, lineSpacingMultiple: 1.08, valign: 'top',
  });
  s.addShape(pptx.ShapeType.rect, { x: M, y: (opt.y ?? 0.62) + (opt.h ?? 0.85) + 0.04, w: 0.6, h: 0.05, fill: { color: C.orange } });
}
function lead(s, text, y) {
  s.addText(text, { x: M, y, w: CW, h: 0.42, fontFace: F, fontSize: 13, color: C.ink2 });
}
function bullets(s, items, x, y, w, opt = {}) {
  items.forEach((it, i) => {
    const yy = y + i * (opt.gap ?? 0.62);
    s.addText('·', { x, y: yy, w: 0.22, h: 0.3, fontFace: F, fontSize: opt.sz ?? 13, bold: true, color: C.orange });
    if (typeof it === 'string') {
      s.addText(it, { x: x + 0.24, y: yy - 0.02, w: w - 0.24, h: 0.34, fontFace: F, fontSize: opt.sz ?? 13, color: C.ink });
    } else {
      s.addText(it[0], { x: x + 0.24, y: yy - 0.02, w: w - 0.24, h: 0.32, fontFace: F, fontSize: opt.sz ?? 13, bold: true, color: C.ink });
      s.addText(it[1], { x: x + 0.24, y: yy + 0.28, w: w - 0.24, h: 0.34, fontFace: F, fontSize: (opt.sz ?? 13) - 1.5, color: C.ink2 });
    }
  });
}
function card(s, x, y, w, h, opt = {}) {
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.07,
    fill: { color: opt.fill || C.white },
    line: { color: opt.line || 'E2DBCE', width: opt.lineW || 1 },
  });
}
function pic(s, name, x, y, w, h) {
  const f = path.join(SHOTS, name);
  if (!fs.existsSync(f)) return false;
  s.addImage({ path: f, x, y, w, h, sizing: { type: 'contain', x, y, w, h } });
  return true;
}
// 左图右文（最常用的一页版式）
function imgText(s, img, tw, opt = {}) {
  const iw = opt.iw ?? 7.0;
  card(s, M, 1.72, iw, opt.ih ?? 4.9);
  if (!pic(s, img, M + 0.14, 1.82, iw - 0.28, (opt.ih ?? 4.9) - 0.2)) {
    s.addText('（缺图：' + img + '）', { x: M + 0.3, y: 3.8, w: iw - 0.6, h: 0.4, fontFace: F, fontSize: 11, color: C.ink3 });
  }
  const x2 = M + iw + 0.3, w2 = W - M - x2;
  bullets(s, tw, x2, 1.86, w2, { sz: opt.sz ?? 12.5, gap: opt.gap ?? 0.78 });
  if (opt.note) {
    s.addText(opt.note, { x: x2, y: 6.28, w: w2, h: 0.5, fontFace: F, fontSize: 10.5, color: C.ink3, italic: true });
  }
}
function band(s, items) {
  s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 1.1, w: W, h: 1.1, fill: { color: C.dark } });
  const colW = CW / items.length;
  items.forEach((it, i) => {
    s.addText(it[0], { x: M + i * colW, y: H - 0.92, w: colW - 0.25, h: 0.42, fontFace: FM, fontSize: 20, bold: true, color: C.white });
    s.addText(it[1], { x: M + i * colW, y: H - 0.5, w: colW - 0.25, h: 0.28, fontFace: F, fontSize: 9.5, color: C.dim });
  });
  s.addText(page + ' / ' + TOTAL, { x: W - 0.72, y: H - 0.3, w: 0.6, h: 0.22, fontFace: FM, fontSize: 8, color: C.dim, align: 'right' });
}

/* ============================ 1 封面 ============================ */
{
  const s = slide({ kicker: '详细版 · 功能与界面全解', noPage: true, topBar: false });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.dark } });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 1.35, w: 0.66, h: 0.055, fill: { color: C.orange } });
  s.addText('筑视界 · 码绘交互 ／ Web 前端开发创意技能大赛', {
    x: M, y: 1.52, w: 10, h: 0.32, fontFace: F, fontSize: 11, bold: true, color: 'FF8A6A',
  });
  s.addText('词汇账户余额查询', { x: M, y: 1.95, w: 11.8, h: 1.0, fontFace: F, fontSize: 48, bold: true, color: C.white });
  s.addText('四六级词汇量检测与诊断 · 从"测出一个数"到"知道下一步背哪些词"', {
    x: M, y: 2.95, w: 11.8, h: 0.5, fontFace: F, fontSize: 17, color: 'C9C2B4',
  });
  const stats = [['7,175', '词条'], ['9,204', '例句'], ['387', '断言'], ['2.08 MB', '单文件'], ['26', '页详解']];
  stats.forEach((it, i) => {
    s.addText(it[0], { x: M + i * 2.35, y: 4.0, w: 2.2, h: 0.5, fontFace: FM, fontSize: 22, bold: true, color: C.white });
    s.addText(it[1], { x: M + i * 2.35, y: 4.5, w: 2.2, h: 0.3, fontFace: F, fontSize: 10, color: '8A8378' });
  });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 5.35, w: 11.6, h: 0.015, fill: { color: '2E2A22' } });
  s.addText('全部界面截图取自当前交付版本（词库 7,175 / 例句 9,204 / 断言 387 / 2.08 MB 单文件）', {
    x: M, y: 5.5, w: 11.8, h: 0.35, fontFace: F, fontSize: 10.5, color: '8A8378',
  });
  s.addText('广东亚视演艺职业学院 · 信息工程学院　｜　单人作品', {
    x: M, y: 6.2, w: 11.8, h: 0.32, fontFace: F, fontSize: 10.5, color: '8A8378',
  });
  s.addNotes('这版是"讲全讲细"用的：26 页，每页一个功能点配一张真实界面截图。'
    + '如果时间紧，可只看第 4、6、10、12、14、17、19 页这几张核心页。');
}

/* ============================ 2 名字怎么来的 ============================ */
{
  const s = slide({ kicker: '一 · 产品定位' });
  title(s, '先说名字：为什么叫「词汇账户余额查询」');
  lead(s, '像查账户余额一样查你的词汇——余额是一个数，账户是装这个数的东西。', 1.55);
  const rows = [
    ['查余额', '测词汇量：4,449 词（±436，95% 区间）'],
    ['资产结构', '7 个词频段各占多少：钱都压在哪儿了'],
    ['透支 / 余额不足', '最高频段有洞——最致命的那种'],
    ['充值', '补词单：具体到词、每天多少、几天到账'],
    ['到账', '复测：验证这一笔真的存进去了'],
    ['坏账', '背了又忘的词：钱花了没到账'],
  ];
  rows.forEach((r, i) => {
    const x = M + (i % 2) * (CW / 2 + 0.12);
    const y = 2.15 + Math.floor(i / 2) * 1.32;
    const w = CW / 2 - 0.12;
    card(s, x, y, w, 1.14);
    s.addText(r[0], { x: x + 0.26, y: y + 0.16, w: 2.5, h: 0.36, fontFace: F, fontSize: 14.5, bold: true, color: C.orange });
    s.addText(r[1], { x: x + 0.26, y: y + 0.58, w: w - 0.52, h: 0.44, fontFace: F, fontSize: 11.5, color: C.ink2 });
  });
  s.addText('一个隐喻管住整套语言：用户不用学新词，就能看懂每一步在干什么。', {
    x: M, y: 6.28, w: CW, h: 0.4, fontFace: F, fontSize: 12.5, bold: true, color: C.ink,
  });
  s.addNotes('这页解释命名逻辑。关键一句：余额是指标名、账户是产品名，所以不会出现"余额检测"这种别扭说法。'
    + '账本语言顺带把六个功能串成一条线：查余额→看结构→找透支→充值→复测到账→查坏账。');
}

/* ============================ 3 问题 ============================ */
{
  const s = slide({ kicker: '一 · 产品定位' });
  title(s, '市面上那些"词汇量测试"，到第一个问题就停了');
  const qs = [
    ['误差多大？', '±200 还是 ±1,200？只给一个数字，等于什么都没说。'],
    ['差在哪？', '是高频词有洞，还是冷门词不会？总掌握率会把两者平均掉。'],
    ['该背哪些？', '给个数字然后呢？下一句通常是"购买课程"。'],
    ['什么时候再测？', '两周后到底有没有变好？两个点估计的差异可能只是抽样噪声。'],
  ];
  qs.forEach((q, i) => {
    const y = 1.72 + i * 1.16;
    card(s, M, y, CW, 1.02);
    s.addText('0' + (i + 1), { x: M + 0.28, y: y + 0.3, w: 0.6, h: 0.36, fontFace: FM, fontSize: 14, bold: true, color: C.orange });
    s.addText(q[0], { x: M + 1.0, y: y + 0.24, w: 3.1, h: 0.42, fontFace: F, fontSize: 17, bold: true, color: C.ink });
    s.addText(q[1], { x: M + 4.3, y: y + 0.3, w: CW - 4.6, h: 0.5, fontFace: F, fontSize: 11.5, color: C.ink2 });
  });
  s.addText('所以我们只做一件事：把这四个问题一次答完，并且把过程摊开给你看。', {
    x: M, y: 6.4, w: CW, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: C.orange,
  });
  s.addNotes('四个问题对应产品的四条主线：区间、诊断、词单、复测。后面每一部分都在回答其中一个。');
}

/* ============================ 4 首页：余额长什么样 ============================ */
{
  const s = slide({ kicker: '二 · 检测：把数字测准' });
  title(s, '首页第一眼：余额、区间、口径、进度');
  imgText(s, 'ppt-home.jpg', [
    ['大数字 = 折中口径余额', '≈ 4,449 词。折中口径把「模糊」按一半计入。'],
    ['下面一行 = 严格口径', '3,956 词（3,168–4,540）。两套口径并列，不用一个数字糊过去。'],
    ['±436 是 95% 区间', '不是误差上下限的承诺，而是"重复抽样时约 95% 会覆盖真值"。'],
    ['四个小格 = 逐词状态', '认识 / 模糊 / 不认识 / 未测，加起来就是词库总量。'],
  ], { note: '区间宽度会随题量收窄——下面的"自适应停测"就是这个机制。' });
  s.addNotes('这页配首页实拍：让评委看到"余额"这个词在界面上怎么落地。'
    + '强调两件事：数字旁边永远有区间；两套口径同时给。');
}

/* ============================ 5 分层抽样 ============================ */
{
  const s = slide({ kicker: '二 · 检测：把数字测准' });
  title(s, '抽样的三个决定：分层、稳定乱序、交错抽取');
  const rows = [
    ['按词频分 7 段', '20k 以外 / 最高频 1k / 1k-2k / 2k-3k / 3k-5k / 5k-10k / 10k-20k。低频段不会被高频段淹没。'],
    ['顺序来自单词哈希', 'FNV-1a 决定位置，不是 Math.random()——看起来随机，但每次打开、每台机器完全一致。'],
    ['等比例交错抽取', '按各段真实占比抽，同样题量下区间更窄；代价是要先有词频表（构建期解决）。'],
    ['为什么不按字母序', '一路 a、b、c 下去既机械又能靠首字母猜词义，一组 100 词还会全挤在同一字母段。'],
  ];
  rows.forEach((r, i) => {
    const y = 1.72 + i * 1.2;
    card(s, M, y, CW, 1.05);
    s.addText(r[0], { x: M + 0.28, y: y + 0.16, w: 3.4, h: 0.38, fontFace: F, fontSize: 14, bold: true, color: C.ink });
    s.addText(r[1], { x: M + 0.28, y: y + 0.56, w: CW - 0.56, h: 0.42, fontFace: F, fontSize: 11.5, color: C.ink2 });
  });
  s.addText('稳定乱序这件事很关键：否则"第 N 组"会指向另一批词，进度与跨轮对比全部失真。', {
    x: M, y: 6.5, w: CW, h: 0.38, fontFace: F, fontSize: 11.5, color: C.ink3,
  });
  s.addNotes('这页是方法论。如果评委追问"你们凭什么说比随机抽样好"，答案就是分层 + 交错。'
    + '稳定乱序是自己踩过的坑：早期用 Math.random 排序，导致分组每次都不一样，进度直接废掉。');
}

/* ============================ 6 分组页 ============================ */
{
  const s = slide({ kicker: '二 · 检测：把数字测准' });
  title(s, '把 4,540 词切成 10 组：让"测完"变成可能');
  imgText(s, 'ppt-groups.jpg', [
    ['每组 100 词', '按哈希顺序切分，组内跨频段交错，不是按字母或列表顺序。'],
    ['三种状态色', '未开始 / 部分完成（警示色）/ 已完成（成功色），一眼看出进度。'],
    ['可中断、可分批', '今天的 100 词做完就停，进度写进本地存储，下次接着来。'],
    ['防止半途而废', '长任务拆成小目标，是完成率最有效的设计手段。'],
  ], { iw: 6.6, ih: 4.9, note: '点任意一组直接开始，不需要先看教程。' });
  s.addNotes('分组页解决的是"5000 词怎么测得完"的心理学问题。技术上它就是把乱序词表按 100 切片。');
}

/* ============================ 7 答题页 ============================ */
{
  const s = slide({ kicker: '二 · 检测：把数字测准' });
  title(s, '答题界面：两种作答方式 + 作答后立刻给例句');
  imgText(s, 'ppt-test.jpg', [
    ['自评三档', '不认识 / 模糊 / 认识。最快，一题 2 秒，适合大范围摸底。'],
    ['四选一', '更接近真实记忆，还能靠"蒙对率 1/k"校正掌握率。'],
    ['作答即给依据', '释义 + 常用短语 + 英中对照例句，目标词按词边界加粗。'],
    ['键盘全通', '1-3 自评、1-4 选答案、空格读/下一题、退格撤销。'],
  ], { iw: 6.6, note: '例句来自 Tatoeba 语料（CC-BY 2.0 FR），构建期倒排索引 + 可读性打分。' });
  s.addNotes('这页让评委看到"答题不是干瘪的选择题"。作答后立刻给语境，是低成本高感知的设计。');
}

/* ============================ 8 自适应停测 ============================ */
{
  const s = slide({ kicker: '二 · 检测：把数字测准' });
  title(s, '题量不是拍脑袋：边测边算，达标就停');
  card(s, M, 1.62, CW * 0.52, 2.5, { fill: C.softBlue, line: 'C9D8F8' });
  s.addText('区间半宽', { x: M + 0.3, y: 1.8, w: 3, h: 0.34, fontFace: F, fontSize: 12.5, bold: true, color: C.blue });
  s.addText('half = z · √( p(1−p) / n ) · √( 1 − n/N )', {
    x: M + 0.3, y: 2.16, w: CW * 0.52 - 0.6, h: 0.5, fontFace: FM, fontSize: 15, bold: true, color: C.ink,
  });
  s.addText('p 掌握率 · n 已答题数 · N 词库总量 · z≈1.96（95%）', {
    x: M + 0.3, y: 2.7, w: CW * 0.52 - 0.6, h: 0.4, fontFace: F, fontSize: 10.5, color: C.ink2,
  });
  s.addText('后那个因子是有限总体修正：词库只有几千词，测到后面区间自动收窄。', {
    x: M + 0.3, y: 3.2, w: CW * 0.52 - 0.6, h: 0.7, fontFace: F, fontSize: 11, color: C.ink2,
  });
  bullets(s, [
    ['三档目标精度', '±400 / ±250 / ±150，对应约 80 / 210 / 340 题'],
    ['实时提示', '页面上显示当前精度与"还需约 N 题"'],
    ['达标即提示收工', '不为了凑题量硬让人多做 100 题'],
    ['极端情况不失控', '分层 + 交错让"一把抽到全冷门词"结构上不可能'],
  ], M + CW * 0.56, 1.72, CW * 0.44, { sz: 12.5, gap: 0.95 });
  band(s, [['±400', '快速摸底 ~80 题'], ['±250', '推荐 ~210 题'], ['±150', '精测 ~340 题'], ['95%', '置信水平']]);
  s.addNotes('公式不要念，讲三件事：区间随题量收窄、达标就停、有限总体修正让它比教科书公式更窄。');
}

/* ============================ 9 三层修正 ============================ */
{
  const s = slide({ kicker: '二 · 检测：把数字测准' });
  title(s, '三层统计修正，才敢把区间写在结果旁边');
  const rows = [
    ['Agresti-Coull', '小样本下比例区间不稳（Wald 在 p→0 或 1 时崩）', '加伪计数 ñ = n + z² 再算'],
    ['有限总体修正', '不放回抽样，总体只有几千词，覆盖率越高越该收窄', '乘 √(1 − n/N)'],
    ['蒙对校正', '四选一即使不会也有 1/k 概率答对', '掌握率扣掉猜测基线'],
  ];
  rows.forEach((r, i) => {
    const y = 1.72 + i * 1.18;
    card(s, M, y, CW, 1.04);
    s.addText(r[0], { x: M + 0.28, y: y + 0.14, w: 3.0, h: 0.38, fontFace: F, fontSize: 14.5, bold: true, color: C.blue });
    s.addText(r[1], { x: M + 0.28, y: y + 0.54, w: 6.4, h: 0.42, fontFace: F, fontSize: 11, color: C.ink2 });
    s.addText(r[2], { x: M + 7.0, y: y + 0.34, w: 4.4, h: 0.4, fontFace: FM, fontSize: 12.5, bold: true, color: C.ok });
  });
  card(s, M, 5.4, CW * 0.49, 1.05, { fill: C.softGreen, line: 'BFE6D5' });
  s.addText('两套口径同时给', { x: M + 0.26, y: 5.52, w: 4.4, h: 0.34, fontFace: F, fontSize: 12.5, bold: true, color: C.ok });
  s.addText('严格（只算认识）／折中（模糊算一半）。"模糊"算不算会，不替你决定。', {
    x: M + 0.26, y: 5.86, w: CW * 0.49 - 0.52, h: 0.5, fontFace: F, fontSize: 10.5, color: C.ink2,
  });
  const x2 = M + CW * 0.51;
  card(s, x2, 5.4, CW * 0.49, 1.05, { fill: C.softOrange, line: 'F5C7B8' });
  s.addText('题量与精度绑定', { x: x2 + 0.26, y: 5.52, w: 4.4, h: 0.34, fontFace: F, fontSize: 12.5, bold: true, color: C.orange });
  s.addText('想要更窄的区间就多答几题，想要快就接受更宽的区间——由用户决定。', {
    x: x2 + 0.26, y: 5.86, w: CW * 0.49 - 0.52, h: 0.5, fontFace: F, fontSize: 10.5, color: C.ink2,
  });
  s.addNotes('这页是全篇技术含量最高的。三个修正各一句，重点是"我们把误差摊开了"，而不是"我们更准"。');
}

/* ============================ 10 资产结构 ============================ */
{
  const s = slide({ kicker: '三 · 诊断：知道差在哪' });
  title(s, '总掌握率会骗人，所以拆成资产结构');
  imgText(s, 'ppt-bands.jpg', [
    ['7 个词频段各一行', '每行给出掌握率、全段词数、抽到多少词。'],
    ['每段都有」问「按钮', '带着这一段的真实数字直接问 AI，不用自己复述。'],
    ['结论句自动生成', '比较最弱与最强段，指出"结构上有洞"还是"整体偏低"。'],
    ['缺口 ≠ 未测', '缺口是测过还不会（真正的洞），未测是压根不知道（不构成结论）。'],
  ], { iw: 6.6, ih: 5.0, note: '"缺口 × 词频权重"决定先补哪一段，避免把最冷门的词排在最前。' });
  s.addNotes('这页讲诊断的核心：从"总分"进入"结构"。最高频段有洞，比总分低一点更致命。');
}

/* ============================ 11 词汇地图 ============================ */
{
  const s = slide({ kicker: '三 · 诊断：知道差在哪' });
  title(s, '词汇地图：182 格，图不是装饰，是入口');
  imgText(s, 'ppt-map.jpg', [
    ['7 段 × 26 字母', '纵轴越靠上越常用，横轴是首字母。'],
    ['颜色 = 掌握率', '绿 ≥80% / 黄 50–80% / 红 <50%。'],
    ['浓淡 = 测过多少', '没测过几乎是虚线空格，测满才是实色。'],
    ['两种点击', '点格子 → 复测这一块；Shift+点击 → 带着这一格问 AI。'],
  ], { iw: 7.0, ih: 4.6, note: '看完就知道下一步动哪里——这是"可视化"和"能干活"的区别。' });
  s.addNotes('这页最好现场点一下。很多作品的图表只是展示，我们的图表可以直接触发动作。');
}

/* ============================ 12 等级阶梯 ============================ */
{
  const s = slide({ kicker: '三 · 诊断：知道差在哪' });
  title(s, '六个余额等级：满仓 / 厚实 / 稳健 / 够花 / 吃紧 / 见底');
  imgText(s, 'ppt-ladder.jpg', [
    ['按掌握率分档', '≥92 / ≥85 / ≥75 / ≥65 / ≥50 / <50，字母 S·A·B+·B·C·D 保留做对照。'],
    ['同时换算成词数', '同一套比例按当前词库换算，四级 4,540 词与六级 5,716 词各算各的。'],
    ['标出当前位置与已过档位', '不让用户自己猜"我算哪一档"。'],
    ['跨词库不可直接比', '分母不同时词汇量与掌握率都不可比，界面上会明确提示。'],
  ], { iw: 6.8, ih: 3.4, note: '六个名字是同一条轴上的六个阶段（账户充盈度），都不带羞辱性。' });
  s.addNotes('等级名是新改的：满仓/厚实/稳健/够花/吃紧/见底。字母保留是因为印章只能放一个字。');
}

/* ============================ 13 地基约束 + 报告 ============================ */
{
  const s = slide({ kicker: '三 · 诊断：知道差在哪' });
  title(s, '报告页：等级之外，还有一条"地基约束"');
  card(s, M, 1.66, CW * 0.5, 1.9);
  if (!pic(s, 'ppt-report.jpg', M + 0.12, 1.76, CW * 0.5 - 0.24, 1.7)) {
    s.addText('（缺图）', { x: M + 0.3, y: 2.4, w: 3, h: 0.3, fontFace: F, fontSize: 11, color: C.ink3 });
  }
  const x2 = M + CW * 0.53;
  s.addText('地基约束：防止"高频段空洞却评优"', {
    x: x2, y: 1.7, w: CW * 0.47, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.orange,
  });
  s.addText('把最高频 1k 段整段丢掉，总掌握率还有 85%，按比例照样能评"厚实"——'
    + '可这样的结构读任何真实文本都会卡。所以最高频段过低时对等级封顶。', {
    x: x2, y: 2.14, w: CW * 0.47, h: 1.4, fontFace: F, fontSize: 11.5, color: C.ink2, lineSpacingMultiple: 1.4,
  });
  const rows = [
    ['报告只对整库实测生效', '覆盖率 ≥95% 才给等级，抽样结果不外推成「达标」'],
    ['不给虚假外推', '本词库上限 4,540 词，超出部分无法评估'],
    ['可打印 / 可复制', '报告文本一键复制，或打印为 PDF 留存'],
  ];
  rows.forEach((r, i) => {
    const y = 3.85 + i * 0.86;
    card(s, M, y, CW, 0.76);
    s.addText(r[0], { x: M + 0.26, y: y + 0.1, w: 4.2, h: 0.34, fontFace: F, fontSize: 12, bold: true, color: C.ink });
    s.addText(r[1], { x: M + 4.7, y: y + 0.12, w: CW - 5.0, h: 0.4, fontFace: F, fontSize: 10.5, color: C.ink2 });
  });
  s.addNotes('地基约束是我们的原创设计，也是最能体现"较真"的一处：宁可压低等级，也不给漂亮但误导的结论。');
}

/* ============================ 14 多轮复测 ============================ */
{
  const s = slide({ kicker: '四 · 复测：验证这笔钱有没有到账' });
  title(s, '多轮对比：把"进步"拆成四种状态');
  const kinds = [
    ['背了又忘', '上轮认识、这轮模糊或不认识', '换方法：词根 / 例句语境', C.bad],
    ['新学会', '上轮不认识、这轮认识', '当前方法有效，继续推进', C.ok],
    ['掉档', '连续两轮模糊或不认识', '优先级最高，先确认是不是本来就不会', C.warn],
    ['稳会', '两轮都认识', '不用再花时间，把时间给别处', C.blue],
  ];
  kinds.forEach((k, i) => {
    const x = M + (i % 2) * (CW / 2 + 0.12);
    const y = 1.72 + Math.floor(i / 2) * 1.5;
    const w = CW / 2 - 0.12;
    card(s, x, y, w, 1.34);
    s.addShape(pptx.ShapeType.rect, { x: x + 0.02, y: y + 0.18, w: 0.07, h: 0.98, fill: { color: k[3] } });
    s.addText(k[0], { x: x + 0.32, y: y + 0.16, w: w - 0.6, h: 0.38, fontFace: F, fontSize: 15, bold: true, color: C.ink });
    s.addText(k[1], { x: x + 0.32, y: y + 0.56, w: w - 0.6, h: 0.34, fontFace: F, fontSize: 11, color: C.ink2 });
    s.addText('→ ' + k[2], { x: x + 0.32, y: y + 0.92, w: w - 0.6, h: 0.32, fontFace: F, fontSize: 11, bold: true, color: k[3] });
  });
  card(s, M, 4.75, CW, 1.3, { fill: C.softBlue, line: 'C9D8F8' });
  s.addText('为什么能做到：每轮归档报告快照 + 逐词 2 bit 位图 + 词表指纹', {
    x: M + 0.3, y: 4.88, w: CW - 0.6, h: 0.36, fontFace: F, fontSize: 13, bold: true, color: C.blue,
  });
  s.addText('7,175 词只占约 1.8 KB/轮，localStorage 5 MB 可存约 2,900 轮；'
    + '词表指纹用来判断两个词库/词书是否可比，避免拿四级的分跟六级的分硬比。', {
    x: M + 0.3, y: 5.28, w: CW - 0.6, h: 0.66, fontFace: F, fontSize: 11, color: C.ink2, lineSpacingMultiple: 1.35,
  });
  s.addText('这是大多数产品缺的那一步：它们只安排复习，不验证进步。', {
    x: M, y: 6.35, w: CW, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: C.orange,
  });
  s.addNotes('这页是"闭环"的收口。重点讲"背了又忘"这一类：它才是需要换方法的信号。');
}

/* ============================ 15 词书导入 ============================ */
{
  const s = slide({ kicker: '五 · 自定义词书' });
  title(s, '导入自己的词书：命中复用，不命中记为"20k 以外"');
  const steps = [
    ['1 导入', 'txt / csv / 直接粘贴，一行一词，可选"词,释义"；自动去重、跳过表头与注释。'],
    ['2 强制预览', '多少词命中内置词库、多少是新增、频段分布如何——先看清楚再保存。'],
    ['3 复用全套引擎', '抽样、区间估计、词汇地图、跨轮差分一行未改，直接作用于这本词书。'],
    ['4 口径保护', '只报"对这本书的掌握率"，界面常驻提示不能换算成词汇量。'],
  ];
  steps.forEach((st, i) => {
    const y = 1.72 + i * 1.18;
    card(s, M, y, CW, 1.04);
    s.addText(st[0], { x: M + 0.28, y: y + 0.16, w: 2.2, h: 0.38, fontFace: F, fontSize: 13.5, bold: true, color: C.orange });
    s.addText(st[1], { x: M + 0.28, y: y + 0.56, w: CW - 0.56, h: 0.4, fontFace: F, fontSize: 11.5, color: C.ink2 });
  });
  card(s, M, 6.42, CW, 0.62, { fill: C.softOrange, line: 'F5C7B8' });
  s.addText('词书是人挑出来的有偏样本——所以"这本书我认识 78%"可测且诚实，"所以我词汇量 4,500"不成立。', {
    x: M + 0.26, y: 6.55, w: CW - 0.52, h: 0.38, fontFace: F, fontSize: 11, bold: true, color: C.ink,
  });
  s.addNotes('这条边界主动交代能加分：说明我们知道自己方法的适用条件。');
}

/* ============================ AI 技术全景 ============================ */
{
  const s = slide({ kicker: '六 · AI 融合 ／ 技术全景' });
  title(s, '我们到底用了哪些 AI 技术：五层，各有代码落点');
  const layers = [
    ['① 交互层', '多轮对话 · SSE 流式输出 · 工具调用过程可视化', 'src/app.part4.js'],
    ['② 编排层', 'Function Calling Agent：8 个工具 · 最多 3 轮 · 每轮重新取数', 'server/agent.mjs · tools.mjs'],
    ['③ 检索层', '轻量 RAG：本地语料倒排索引 + 可读性打分 + 工具按需检索', 'server/corpus.mjs · build-corpus.js'],
    ['④ 输出层', '结构化输出驱动界面：模型返回动作 → 前端渲染按钮 → 点击执行', 'tools.mjs · part4 · part3'],
    ['⑤ 治理层', '三级降级 · 只上行汇总 · 密钥隔离 · 模型输出当不可信输入', 'part4.js · build.js · check-no-key'],
  ];
  layers.forEach((l, i) => {
    const y = 1.72 + i * 0.98;
    card(s, M, y, CW, 0.86);
    s.addText(l[0], { x: M + 0.26, y: y + 0.12, w: 1.7, h: 0.36, fontFace: F, fontSize: 13.5, bold: true, color: C.orange });
    s.addText(l[1], { x: M + 2.1, y: y + 0.14, w: 6.9, h: 0.6, fontFace: F, fontSize: 11, color: C.ink2, lineSpacingMultiple: 1.25 });
    s.addText(l[2], { x: M + 9.2, y: y + 0.24, w: 3.0, h: 0.4, fontFace: FM, fontSize: 9, color: C.ink3 });
  });
  s.addText('一句话：不是"接了个聊天框"，而是从检索、编排到输出与治理都有明确落点的五个 AI 环节。', {
    x: M, y: 6.5, w: CW, h: 0.4, fontFace: F, fontSize: 12, bold: true, color: C.ink,
  });
  s.addNotes('这页是全篇 AI 部分的目录：五层技术，每层都给出代码位置，评委可当场翻仓库核对。后面 5 页逐层展开。');
}

/* ============================ 技术①：Function Calling Agent ============================ */
{
  const s = slide({ kicker: '六 · AI 融合 ／ 技术 ①' });
  title(s, 'Function Calling：模型决定调哪个工具，我们不猜');
  card(s, M, 1.66, CW * 0.54, 2.5, { fill: C.softBlue, line: 'C9D8F8' });
  s.addText('一次诊断的循环', { x: M + 0.26, y: 1.78, w: 4, h: 0.32, fontFace: F, fontSize: 12, bold: true, color: C.blue });
  s.addText('模型 → 返回 tool_calls → 我们执行工具 → 结果回灌 → 模型再决定\n（最多 3 轮；每轮重新取数，因为数据可能已经变了）', {
    x: M + 0.26, y: 2.12, w: CW * 0.54 - 0.52, h: 1.9, fontFace: F, fontSize: 11.5, color: C.ink2, lineSpacingMultiple: 1.45,
  });
  card(s, M + CW * 0.57, 1.66, CW * 0.43, 2.5);
  s.addText('8 个工具', { x: M + CW * 0.57 + 0.26, y: 1.78, w: 3, h: 0.32, fontFace: F, fontSize: 12, bold: true, color: C.orange });
  s.addText('整体情况 / 频段明细 / 未掌握词 / 复习计划 /\n词库列表 / 例句检索 / 批量例句 / 给出动作', {
    x: M + CW * 0.57 + 0.26, y: 2.12, w: CW * 0.43 - 0.52, h: 1.9, fontFace: FM, fontSize: 10.5, color: C.ink2, lineSpacingMultiple: 1.7,
  });
  s.addText('防幻觉的三条硬规矩（写进 System Prompt，也用断言守）', {
    x: M, y: 4.35, w: CW, h: 0.36, fontFace: F, fontSize: 12.5, bold: true, color: C.ink,
  });
  const rules = [
    ['数字只来自工具', '禁止自行计算、估算或编造任何数值'],
    ['数据不足要拒绝', '必须明说"样本太少，不能下结论"'],
    ['不许提工具名', '用户看不到内部函数，提了只会困惑'],
  ];
  rules.forEach((r, i) => {
    const x = M + i * (CW / 3 + 0.08);
    card(s, x, 4.8, CW / 3 - 0.16, 1.1);
    s.addText(r[0], { x: x + 0.22, y: 4.94, w: CW / 3 - 0.6, h: 0.34, fontFace: F, fontSize: 11.5, bold: true, color: C.ink });
    s.addText(r[1], { x: x + 0.22, y: 5.3, w: CW / 3 - 0.6, h: 0.5, fontFace: F, fontSize: 10, color: C.ink2 });
  });
  s.addText('验证：check-online-ai.mjs 断言「回答来自模型 + 至少调到工具 + 有依据面板」（实测 tool=3 ev=1）', {
    x: M, y: 6.15, w: CW, h: 0.36, fontFace: F, fontSize: 10.5, color: C.ink3,
  });
  s.addNotes('这页讲第一个也是最核心的 AI 技术：Function Calling。重点不是"我们用了 agent"，而是"模型不做算术"这条纪律怎么落到 Prompt 与断言上。');
}

/* ============================ 技术②：轻量 RAG ============================ */
{
  const s = slide({ kicker: '六 · AI 融合 ／ 技术 ②' });
  title(s, '轻量 RAG：本地语料检索，但不是向量库');
  const steps = [
    ['语料', 'Tatoeba 英中对照 78,203 句对 → 过滤 68,987 → 覆盖 5,138 个词 → 入库 9,204 条'],
    ['构建期', '分词匹配 + 倒排索引 + 可读性打分，每个词保留最优 2 条（首句内联进单文件产物）'],
    ['运行期', '作为工具 get_examples / get_weak_examples 被模型按需检索，不是每次全量塞进上下文'],
    ['离线侧', '单文件版把每词首句内联（5,138 条 / 432 KB），断网答题时也能直接展示'],
  ];
  steps.forEach((st, i) => {
    const y = 1.72 + i * 1.14;
    card(s, M, y, CW, 1.0);
    s.addText(st[0], { x: M + 0.26, y: y + 0.12, w: 1.5, h: 0.34, fontFace: F, fontSize: 13, bold: true, color: C.orange });
    s.addText(st[1], { x: M + 1.9, y: y + 0.14, w: CW - 2.2, h: 0.7, fontFace: F, fontSize: 11, color: C.ink2 });
  });
  card(s, M, 6.35, CW * 0.6, 0.62, { fill: C.softOrange, line: 'F5C7B8' });
  s.addText('主动交代：这是「倒排检索 + 工具调用」，不是 embedding 向量检索。', {
    x: M + 0.24, y: 6.46, w: CW * 0.6 - 0.48, h: 0.36, fontFace: F, fontSize: 10.5, bold: true, color: C.ink,
  });
  s.addText('为什么不用向量：要拖几十 MB 权重，会毁掉「单文件 2 MB + 断网可用」。\n下一步：构建期 int8 量化向量（约 1.1 MB 内联），让语义检索与离线共存。', {
    x: M + CW * 0.63, y: 6.2, w: CW * 0.37, h: 0.9, fontFace: F, fontSize: 9.5, color: C.ink3, lineSpacingMultiple: 1.3,
  });
  s.addNotes('RAG 这页最容易被追问"你们是向量 RAG 吗"。答案是否——并且要主动说清取舍，再给出下一步。');
}

/* ============================ 技术③④：结构化输出 + 上下文注入 ============================ */
{
  const s = slide({ kicker: '六 · AI 融合 ／ 技术 ③④' });
  title(s, '让模型「看见你在指什么」，又「不敢瞎算」');
  const halves = [
    ['技术③ 结构化输出驱动界面',
      '模型调用 suggest_actions 返回动作数组\n→ 后端白名单归一化 → SSE 事件 → 前端渲染按钮\n→ 点击复用 data-act 分发器真正执行\n\n'
      + '白名单：go / start / review / ask\n参数越界自动归一（如 target 999 → 250）\n\n'
      + '关键认知：模型输出是不可信输入，\n绝不把字符串当路径或函数名'],
    ['技术④ 上下文注入 + 单一数据源',
      '反向：图表上下文（focus）进入提问\n——频段条的「问」、地图 Shift+点击、整图解读\n\n'
      + 'Prompt 只开一个口子：「界面显示」标注的数字\n来自本机统计，可直接引用（其余禁止估算）\n\n'
      + '单一数据源：后端工具不重算统计，直接消费\n前端已显示的数 → 两边数字不可能漂'],
  ];
  halves.forEach((h, i) => {
    const x = M + i * (CW / 2 + 0.12);
    const w = CW / 2 - 0.12;
    card(s, x, 1.7, w, 4.5);
    s.addText(h[0], { x: x + 0.26, y: 1.84, w: w - 0.52, h: 0.36, fontFace: F, fontSize: 13.5, bold: true, color: C.orange });
    s.addText(h[1], {
      x: x + 0.26, y: 2.24, w: w - 0.52, h: 3.8, fontFace: F, fontSize: 10.5, color: C.ink2, lineSpacingMultiple: 1.5,
    });
  });
  s.addText('这两件事合起来，才解决「AI 分析」最尴尬的两端：听不懂你指什么 / 一本正经地编数字。', {
    x: M, y: 6.4, w: CW, h: 0.4, fontFace: F, fontSize: 11.5, bold: true, color: C.ink,
  });
  s.addNotes('这页讲两处最能体现工程判断的设计：结构化动作（含注入面防护）与上下文注入（含单一数据源）。');
}

/* ============================ 技术⑤：降级与多厂商 ============================ */
{
  const s = slide({ kicker: '六 · AI 融合 ／ 技术 ⑤' });
  title(s, '三级降级 + 多厂商适配：任何环境下都有答案');
  const tiers = [
    ['① 后端 Agent', '有后端：8 工具 + 证据面板 + 可执行动作，质量最高'],
    ['② 直连厂商', '有 Key 无后端：浏览器直接调厂商 API（仅限允许跨域的厂商）'],
    ['③ 本地规则引擎', '都没有或断网：确定性规则给出补词计划与验收线，不依赖任何模型'],
  ];
  tiers.forEach((t, i) => {
    const y = 1.72 + i * 1.05;
    card(s, M, y, CW * 0.56, 0.92);
    s.addText(t[0], { x: M + 0.26, y: y + 0.1, w: 2.4, h: 0.34, fontFace: F, fontSize: 12.5, bold: true, color: C.blue });
    s.addText(t[1], { x: M + 0.26, y: y + 0.46, w: CW * 0.56 - 0.52, h: 0.4, fontFace: F, fontSize: 10.5, color: C.ink2 });
  });
  const x2 = M + CW * 0.6, w2 = W - M - x2;
  card(s, x2, 1.72, w2, 3.05);
  s.addText('多厂商适配（OpenAI 兼容协议）', { x: x2 + 0.24, y: 1.86, w: w2 - 0.48, h: 0.34, fontFace: F, fontSize: 12, bold: true, color: C.orange });
  s.addText('DeepSeek / 通义千问 / 智谱 / 本地 Ollama\n改 .env 里 LLM_PROVIDER 一行即可切换', {
    x: x2 + 0.24, y: 2.24, w: w2 - 0.48, h: 0.7, fontFace: FM, fontSize: 10.5, color: C.ink2, lineSpacingMultiple: 1.5,
  });
  s.addText('CORS 实测结论', { x: x2 + 0.24, y: 3.0, w: w2 - 0.48, h: 0.32, fontFace: F, fontSize: 11.5, bold: true, color: C.ink });
  s.addText('DeepSeek 允许浏览器直连（file:// 也可）\nOpenAI / 智谱 默认拒绝跨域\n→ 所以「自带 Key」档推荐 DeepSeek', {
    x: x2 + 0.24, y: 3.34, w: w2 - 0.48, h: 1.2, fontFace: F, fontSize: 10, color: C.ink2, lineSpacingMultiple: 1.45,
  });
  s.addText('为什么值得说这条：很多「AI 产品」离开服务器就是白屏；我们的第三级保证任何环境下都有可用结论。', {
    x: M, y: 5.05, w: CW, h: 0.6, fontFace: F, fontSize: 11.5, color: C.ink, bold: true,
  });
  band(s, [['3 级', '降级链路'], ['4 家', '模型厂商'], ['0', '逐题作答上传'], ['不限次', '本地方案']]);
  s.addNotes('降级是工程成熟度的标志。这一页也顺带解释了为什么「自带 Key」推荐 DeepSeek——那是实测出来的。');
}

/* ============================ 赛题 AI 方向对照 ============================ */
{
  const s = slide({ kicker: '六 · AI 融合 ／ 赛题对照' });
  title(s, '对应赛题推荐的 AI 方向：命中四条，其余明确不碰');
  const rows = [
    ['⑤ AI 教育与学习平台', '强命中', '诊断到 7 个频段、等级与地基约束、具体词单与验收线'],
    ['① AI Agent 智能助手', '强命中', 'Function Calling 8 工具 · 3 轮 · 多轮对话 · 过程可见'],
    ['② Agent RAG 知识问答', '中命中', '本地语料 9,204 句 + 倒排索引 + 工具检索（非向量）'],
    ['⑧ AI 数据分析与可视化', '中命中', '对话驱动查询与分析；可视化由前端组件呈现，非 AI 生成图表'],
    ['⑨ AI 安全与内容治理', '部分命中', '只做隐私防护：只上行汇总、可核对发送内容、密钥隔离'],
  ];
  rows.forEach((r, i) => {
    const y = 1.72 + i * 0.86;
    card(s, M, y, CW, 0.76);
    s.addText(r[0], { x: M + 0.26, y: y + 0.1, w: 3.4, h: 0.34, fontFace: F, fontSize: 12, bold: true, color: C.ink });
    s.addText(r[1], { x: M + 3.8, y: y + 0.1, w: 1.3, h: 0.34, fontFace: F, fontSize: 11, bold: true, color: r[1] === '强命中' ? C.ok : (r[1] === '中命中' ? C.blue : C.warn) });
    s.addText(r[2], { x: M + 5.3, y: y + 0.14, w: CW - 5.6, h: 0.5, fontFace: F, fontSize: 10, color: C.ink2 });
  });
  s.addText('未涉及且不硬凑：③ 多模态生成 · ④ 协同办公 · ⑥ 健康生活 · ⑦ 代码辅助 · ⑩ 社交社区', {
    x: M, y: 6.2, w: CW, h: 0.36, fontFace: F, fontSize: 10.5, color: C.ink3,
  });
  s.addText('我们宁愿把四条做深，也不在十类上都「沾一点」。', {
    x: M, y: 6.6, w: CW, h: 0.36, fontFace: F, fontSize: 11.5, bold: true, color: C.orange,
  });
  s.addNotes('这是评委最想看的对照页。老实说哪几类没做，比硬凑十类更能得分。');
}

/* ============================ AI 治理与不夸大 ============================ */
{
  const s = slide({ kicker: '六 · AI 融合 ／ 治理与边界' });
  title(s, 'AI 治理：四条护栏 + 一份不夸大清单');
  const guards = [
    ['隐私', '逐题作答永不出本机；每次回答下方可展开「本次发送给模型的数据」核对'],
    ['密钥', '仓库版恒无 Key（提交前守卫脚本拦截）；评委版内联；赛后立即轮换'],
    ['注入面', '模型输出当不可信输入：动作双白名单、参数重新推导、不执行任何字符串'],
    ['成本', '额度绑定「完成一次有效检测」，防止 5 词词书刷额度；只有直连才扣'],
  ];
  guards.forEach((g, i) => {
    const x = M + (i % 2) * (CW / 2 + 0.12);
    const y = 1.7 + Math.floor(i / 2) * 1.28;
    card(s, x, y, CW / 2 - 0.12, 1.14);
    s.addShape(pptx.ShapeType.rect, { x: x + 0.02, y: y + 0.16, w: 0.07, h: 0.82, fill: { color: C.ok } });
    s.addText(g[0], { x: x + 0.3, y: y + 0.14, w: 1.6, h: 0.34, fontFace: F, fontSize: 13, bold: true, color: C.ok });
    s.addText(g[1], { x: x + 0.3, y: y + 0.5, w: CW / 2 - 0.72, h: 0.56, fontFace: F, fontSize: 10, color: C.ink2 });
  });
  card(s, M, 4.42, CW, 1.95, { fill: C.softOrange, line: 'F5C7B8' });
  s.addText('不夸大清单（写在文档里，也写在答辩里）', { x: M + 0.3, y: 4.54, w: CW - 0.6, h: 0.34, fontFace: F, fontSize: 12.5, bold: true, color: C.orange });
  s.addText('· 不是向量 RAG（没有 embedding、没有向量库）\n'
    + '· 不是通用自主 Agent（工具边界固定，有限自主）\n'
    + '· 可视化由前端组件渲染，不是 AI 画图\n'
    + '· 不做内容安全检测 / AIGC 识别\n'
    + '· 本地方案是确定性规则，不叫「AI 诊断」', {
    x: M + 0.3, y: 4.9, w: CW - 0.6, h: 1.4, fontFace: F, fontSize: 10.5, color: C.ink2, lineSpacingMultiple: 1.5,
  });
  s.addNotes('这页的「不夸大清单」是我特别想讲的：知道自己的边界，比把每件事都说成 AI 更专业。');
}

/* ============================ 16 AI 三档 ============================ */
{
  const s = slide({ kicker: '六 · AI 融合' });
  title(s, 'AI 三档通路：谁付费、谁能用、随时显示');
  imgText(s, 'ppt-settings.jpg', [
    ['自带 Key（不限次）', '用户填自己的 API Key，数据直连厂商，不经过我们。'],
    ['作者额度（换来的）', '完成一次有效检测换 1 次：整库需测过 ≥100 词且覆盖 ≥95%。'],
    ['本地方案（不限次）', '确定性规则引擎，按等级/短板/覆盖状态给方案，断网也能用。'],
    ['顺序不可反', '自带 Key → 作者额度 → 本地方案；只有用作者 Key 直连才扣额度。'],
  ], { iw: 6.4, ih: 2.6, note: '面板右上角永远显示当前档位与剩余次数，不让用户猜。' });
  s.addNotes('三档设计回应一个现实问题：作者不可能给所有人无限额度，但又要保证任何人打开都有东西用。');
}

/* ============================ 18 AI 双向联动 ============================ */
{
  const s = slide({ kicker: '六 · AI 融合' });
  title(s, 'AI 与图表双向联动：图能问，答能点');
  imgText(s, 'ppt-ai.jpg', [
    ['反向：图 → AI', '频段条的「问」、地图 Shift+点击、「让 AI 解读地图」，都会带着该段/该格的真实数字开场。'],
    ['正向：AI → 界面', '模型返回结构化动作（跳页 / 开一轮摸底 / 复测某段 / 追问），前端渲染成按钮。'],
    ['点了真的执行', '复用现有 data-act 分发器，不是装饰按钮。'],
    ['双向白名单', '参数经后端与前端两次校验，非法动作直接丢弃，越界值归一到合法值。'],
  ], { iw: 5.4, ih: 5.0, note: '离线规则诊断同样产出可点击动作——断网也成立。' });
  s.addNotes('这页是全项目"融合感"最强的一页：融合不是把两个功能放同一页，而是让它们互相引用。');
}

/* ============================ 19 入场页 ============================ */
{
  const s = slide({ kicker: '八 · 交互与工艺' });
  title(s, '入场页：每次打开都是一次登场');
  imgText(s, 'ppt-intro.jpg', [
    ['1.1 秒分层到位', '展台框自左画出 → 标题逐字升起 → 规模数字滚动 → 鲸鱼绕场 → 光束扎进按钮。'],
    ['没有加载空窗', '主界面早已渲染完成，入场页只是盖在上面的一层，退场是纯视觉过渡。'],
    ['三种进入方式', '点按钮 / 点空白 / 按 Enter、空格、Esc——不做"必须找到按钮"的迷宫。'],
    ['尊重系统设置', 'prefers-reduced-motion 下关掉动画，但仍要点一下进入。'],
  ], { iw: 6.6, ih: 3.0, note: '?intro=0 可跳过（自动化测试与录屏调试用）。' });
  s.addNotes('入场页是"第一印象"工程：不追求炫，追求"这不像课程作业"。');
}

/* ============================ 20 桌宠 ============================ */
{
  const s = slide({ kicker: '八 · 交互与工艺' });
  title(s, '2.5D 桌宠：会看人、会挣扎、但不打扰');
  card(s, M + 0.4, 1.72, 3.0, 4.9);
  if (!pic(s, 'ppt-pet.jpg', M + 0.5, 1.82, 2.8, 4.7)) {
    s.addText('（缺图）', { x: M + 0.6, y: 3.8, w: 2, h: 0.3, fontFace: F, fontSize: 11, color: C.ink3 });
  }
  const x2 = M + 3.8, w2 = W - M - x2;
  bullets(s, [
    ['三层做出立体感', '透视倾斜（转轴压在脚底）+ 两层接地投影 + 受光膜。'],
    ['悬空物理是真的积分', '抓起后转轴挪到耳根，摆动/落后量/拉伸由指针速度驱动的二阶系统逐帧积分。'],
    ['气泡用真实数据说话', '当前页面、掌握率、下一步建议——不是随机文案。'],
    ['不打扰是硬约束', '只在右侧安全区溜达；检测进行中不自己走动；落到正文区会走回右下角。'],
    ['兜底可自救', '每帧检查异常自动复位；设置页有「叫回右下角」按钮；?pet=none 可关掉。'],
  ], x2, 1.8, w2, { sz: 11.5, gap: 1.02 });
  s.addNotes('桌宠是"记忆点"也是"工程难度"：悬空物理是逐帧积分的弹簧系统，不是 CSS keyframes。'
    + '同时它被刻意限制成"不打扰"：只在右栏、检测中不动、异常自愈。');
}

/* ============================ 21 暗色 + 响应式 + 无障碍 ============================ */
{
  const s = slide({ kicker: '八 · 交互与工艺' });
  title(s, '暗色模式、响应式、无障碍：三条工程底线');
  card(s, M, 1.72, CW * 0.5, 2.5);
  if (!pic(s, 'ppt-dark.jpg', M + 0.12, 1.82, CW * 0.5 - 0.24, 2.3)) {
    s.addText('（缺图）', { x: M + 0.3, y: 2.8, w: 3, h: 0.3, fontFace: F, fontSize: 11, color: C.ink3 });
  }
  const x2 = M + CW * 0.53;
  bullets(s, [
    ['暗色不是第二套样式', '换一组 CSS 令牌值即可，因为颜色全部走变量。'],
    ['三处断点', '≥1280 显示左右两栏；<820 收起桌宠；<640 收紧字号与间距。'],
    ['对比度实测', '辅助文字 4.83:1、开关轨道 5.72:1，浏览器测试里真实计算并断言。'],
    ['键盘全通 + inert', '背景在模态与入场页打开时不可聚焦；焦点逐段交接。'],
  ], x2, 1.8, W - M - x2, { sz: 11.5, gap: 0.95 });
  card(s, M, 4.5, CW, 1.5, { fill: C.softBlue, line: 'C9D8F8' });
  s.addText('所有动效只改 transform / opacity / filter，绝不改布局属性', {
    x: M + 0.3, y: 4.66, w: CW - 0.6, h: 0.36, fontFace: F, fontSize: 13.5, bold: true, color: C.blue,
  });
  s.addText('改 width/height/top/left 会触发重排，页面一卡，"高级感"立刻消失。所以卡片进场、按钮抬起、'
    + '模态缩放全部走合成层。', {
    x: M + 0.3, y: 5.06, w: CW - 0.6, h: 0.8, fontFace: F, fontSize: 11, color: C.ink2, lineSpacingMultiple: 1.35,
  });
  s.addNotes('这页讲"工程底线"，不是功能。评委喜欢看到这种东西：说明作者知道自己在做什么。');
}

/* ============================ 22 工程质量 ============================ */
{
  const s = slide({ kicker: '九 · 工程质量', topBar: false });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.dark } });
  s.addText('九 · 工程质量', { x: M, y: 0.5, w: 8, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: 'FF8A6A' });
  s.addText('387 条断言，守着"看不见的正确性"', { x: M, y: 0.85, w: CW, h: 0.8, fontFace: F, fontSize: 30, bold: true, color: C.white });
  s.addText('抽样与区间估计没法靠肉眼验收，只能靠断言。', { x: M, y: 1.66, w: CW, h: 0.4, fontFace: F, fontSize: 12.5, color: 'A8A296' });
  const stats = [['387', '条自动化断言'], ['11', '个测试套件'], ['2.08 MB', '单文件产物'], ['0', '运行时依赖']];
  const sw = (CW - 0.9) / 4;
  stats.forEach((st, i) => {
    const x = M + i * (sw + 0.3);
    s.addShape(pptx.ShapeType.roundRect, { x, y: 2.25, w: sw, h: 1.2, rectRadius: 0.07, fill: { color: '22201B' }, line: { color: '35322A' } });
    s.addText(st[0], { x: x + 0.2, y: 2.4, w: sw - 0.4, h: 0.5, fontFace: FM, fontSize: 23, bold: true, color: 'FF8A6A' });
    s.addText(st[1], { x: x + 0.2, y: 2.92, w: sw - 0.4, h: 0.32, fontFace: F, fontSize: 9.5, color: 'A8A296' });
  });
  const rows = [
    ['功能测试（jsdom）', '164', '抽样 / 估计 / 等级 / 多轮 / 地图 / 档案'],
    ['真实浏览器', '54', '布局不溢出 / 暗色 / 对比度 / 焦点 / 入口'],
    ['桌宠与入场页', '83', '拖动 / 悬空物理 / 分层浮现 / 退场'],
    ['交付与 AI', '54', '断网可用 / 词书 / 三档额度 / 双向联动'],
  ];
  rows.forEach((r, i) => {
    const y = 3.75 + i * 0.56;
    s.addText(r[0], { x: M, y, w: 4.0, h: 0.32, fontFace: F, fontSize: 11.5, color: 'C9C2B4' });
    s.addText(r[1], { x: M + 4.1, y, w: 1.2, h: 0.32, fontFace: FM, fontSize: 12.5, bold: true, color: C.white });
    s.addText(r[2], { x: M + 5.5, y, w: CW - 5.5, h: 0.32, fontFace: F, fontSize: 9.5, color: '8A8378' });
  });
  s.addText('还有一组专测"发给别人能不能用"：空目录 + 全新浏览器配置 + 屏蔽全部网络，功能照常。', {
    x: M, y: 6.15, w: CW, h: 0.4, fontFace: F, fontSize: 10.5, color: '8B93A3',
  });
  s.addText(page + ' / ' + TOTAL, { x: W - 1.1, y: H - 0.4, w: 1.1, h: 0.24, fontFace: FM, fontSize: 8.5, color: '8A8378', align: 'right' });
  s.addNotes('这页是可信度的落点。数字要背：387 条、11 个套件、2.08 MB、零运行时依赖。');
}

/* ============================ 23 不做清单 ============================ */
{
  const s = slide({ kicker: '十 · 边界' });
  title(s, '明确不做的四件事，以及为什么不后悔');
  const items = [
    ['不做背单词', '背单词 App 比的是内容量与复习算法（重资产）。我们比的是测量与诊断的可信度，进去就是送。'],
    ['不做账号与云同步', '一旦有账号，数据就上服务器，我们要承担存储、隐私与注销责任——和"工具属于自己"的方向相反。'],
    ['不做向量 RAG', '向量方案要拖几十 MB 权重进产物，会毁掉"单文件 2 MB + 断网可用"这条底线。'],
    ['不做广告与课程导流', '一旦有广告，"测量仪"的中立性就没了；这也是用户敢把真实数据填进来的前提。'],
  ];
  items.forEach((it, i) => {
    const y = 1.72 + i * 1.2;
    card(s, M, y, CW, 1.06, { fill: C.white });
    s.addShape(pptx.ShapeType.rect, { x: M + 0.02, y: y + 0.16, w: 0.07, h: 0.74, fill: { color: C.bad } });
    s.addText(it[0], { x: M + 0.32, y: y + 0.14, w: 3.0, h: 0.36, fontFace: F, fontSize: 14, bold: true, color: C.bad });
    s.addText(it[1], { x: M + 0.32, y: y + 0.54, w: CW - 0.64, h: 0.44, fontFace: F, fontSize: 11, color: C.ink2 });
  });
  s.addText('边界写清楚，功能才敢做深。', {
    x: M, y: 6.4, w: CW, h: 0.38, fontFace: F, fontSize: 13, bold: true, color: C.ink,
  });
  s.addNotes('主动交代边界，比被评委问出来要好得多。');
}

/* ============================ 24 已知边界 ============================ */
{
  const s = slide({ kicker: '十 · 边界' });
  title(s, '如实写出来的限制');
  const items = [
    ['自定义词书只报"对本书掌握率"', '词书是有偏样本，不能外推成词汇量——界面上常驻提示，不藏在文档里。'],
    ['作者额度是本地计数', '没有账号，清空存储即可重置。它只约束诚实用户，这一点不隐瞒。'],
    ['发音依赖系统语音引擎', '精简系统可能没声音，不影响答题；不静默失败，会有提示。'],
    ['窄屏无桌宠', '小于 820px 收起，避免遮挡内容；侧栏在 1280px 以下也不显示。'],
    ['评委版内联了作者 Key', '任何拿到文件的人都能解出它——比赛结束后应立即轮换。'],
  ];
  items.forEach((it, i) => {
    const y = 1.75 + i * 1.0;
    card(s, M, y, CW, 0.88);
    s.addText(it[0], { x: M + 0.28, y: y + 0.1, w: 4.6, h: 0.34, fontFace: F, fontSize: 12.5, bold: true, color: C.ink });
    s.addText(it[1], { x: M + 5.0, y: y + 0.12, w: CW - 5.3, h: 0.6, fontFace: F, fontSize: 10.5, color: C.ink2 });
  });
  s.addNotes('这些"不好听但必须写"的话，反而是专业度的体现。');
}

/* ============================ 25 路线图 ============================ */
{
  const s = slide({ kicker: '十一 · 下一步' });
  title(s, '下一步：从"测准"走向"测全"');
  const now = [
    '分层抽样 + 自适应停测 + 三层修正 + 双口径',
    '7 段资产结构 + 182 格地图 + 六档等级',
    '多轮逐词差分（背了又忘 / 新学会 / 掉档）',
    'AI 三档通路 + 8 工具 Agent + 双向联动',
  ];
  const next = [
    ['口语/听力维度', '用语音识别做"说中文→拼英文"，测量从"认得"扩到"用得出"'],
    ['测量学升级 IRT', '每题带难度参数，按信息量自适应选题（正统 CAT 做法）'],
    ['构建期向量检索', 'int8 量化内联，让语义检索与单文件离线共存'],
    ['模拟校准实验', '用已知真值的虚拟用户验证 95% 区间覆盖率'],
  ];
  card(s, M, 1.7, CW * 0.46, 4.4, { fill: C.white });
  s.addText('已经做到', { x: M + 0.3, y: 1.86, w: 3, h: 0.36, fontFace: F, fontSize: 13, bold: true, color: C.ok });
  now.forEach((t, i) => {
    s.addText('· ' + t, { x: M + 0.3, y: 2.3 + i * 0.92, w: CW * 0.46 - 0.6, h: 0.8, fontFace: F, fontSize: 11, color: C.ink2, lineSpacingMultiple: 1.3 });
  });
  const x2 = M + CW * 0.5;
  card(s, x2, 1.7, CW * 0.5, 4.4, { fill: C.white });
  s.addText('规划中', { x: x2 + 0.3, y: 1.86, w: 3, h: 0.36, fontFace: F, fontSize: 13, bold: true, color: C.orange });
  next.forEach((t, i) => {
    s.addText(t[0], { x: x2 + 0.3, y: 2.3 + i * 0.92, w: CW * 0.5 - 0.6, h: 0.3, fontFace: F, fontSize: 11.5, bold: true, color: C.ink });
    s.addText(t[1], { x: x2 + 0.3, y: 2.6 + i * 0.92, w: CW * 0.5 - 0.6, h: 0.56, fontFace: F, fontSize: 10, color: C.ink2, lineSpacingMultiple: 1.25 });
  });
  s.addNotes('路线图不要吹，只讲"这个短板我们知道，也知道怎么补"。');
}

/* ============================ 26 收尾 ============================ */
{
  const s = slide({ kicker: '谢谢 · 欢迎提问', topBar: false, noPage: true });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.dark } });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 1.5, w: 0.66, h: 0.055, fill: { color: C.orange } });
  s.addText('测准只是起点。', { x: M, y: 1.75, w: 11.8, h: 0.9, fontFace: F, fontSize: 42, bold: true, color: C.white });
  s.addText('能看懂自己差在哪、下一步背哪些词，才算真的有用。', { x: M, y: 2.62, w: 11.8, h: 0.6, fontFace: F, fontSize: 20, color: 'C9C2B4' });
  const lines = [
    '测准：带 95% 区间的余额，双口径并列，误差写在结果旁边',
    '诊断：7 段资产结构 + 182 格地图，图即入口',
    '开方：具体到词的补词单 + 验收线，可带走',
    '验证：跨轮逐词差分，进步是真是假有答案',
  ];
  lines.forEach((l, i) => {
    s.addText('· ' + l, { x: M, y: 3.45 + i * 0.5, w: 11.8, h: 0.4, fontFace: F, fontSize: 13.5, color: 'D9D2C6' });
  });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 5.7, w: 11.6, h: 0.015, fill: { color: '2E2A22' } });
  s.addText('项目仓库 github.com/whiteyuexi/cet4-vocab-check　｜　交付物：单文件 HTML · 技术文档 · 演示视频', {
    x: M, y: 5.88, w: 11.8, h: 0.36, fontFace: F, fontSize: 10.5, color: '8A8378',
  });
  s.addNotes('收尾三句话即可，然后停住留白给提问。准备三个必答：为什么不做背单词、误差怎么保证、AI 到底做了什么。');
}

await pptx.writeFile({ fileName: OUT });
console.log('已生成详细版:', OUT);
console.log('  页数:', TOTAL, '| 大小:', (fs.statSync(OUT).size / 1024).toFixed(0), 'KB | 16:9');
const missing = ['ppt-home.jpg','ppt-groups.jpg','ppt-bands.jpg','ppt-map.jpg','ppt-test.jpg','ppt-ladder.jpg','ppt-report.jpg','ppt-ai.jpg','ppt-settings.jpg','ppt-intro.jpg','ppt-pet.jpg','ppt-dark.jpg']
  .filter(f => !fs.existsSync(path.join(SHOTS, f)));
console.log(missing.length ? '  ⚠ 缺图: ' + missing.join(', ') : '  图片齐备（12 张网页实拍）');
