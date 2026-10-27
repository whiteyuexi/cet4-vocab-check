// scripts/make-ppt-roadshow.mjs — 现场路演版（12 页 / 约 5 分钟）
//
// 视觉语言「撞色但克制」：米白 + 顶部深色带 + 橙红点缀 + 底部深色数据带。
// 路演稿的三条硬规矩（与答辩稿的区别）：
//   1. 每页只讲一个观点，正文压缩到 30 字以内，靠口播补细节；
//   2. 关键数字与标题都放大（10 米外可读），不用小字堆信息；
//   3. 每页都写口播稿（演讲备注），现场照着念也不会慌。
//
// 用法：node scripts/make-ppt-roadshow.mjs [输出路径]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const OUT = process.argv[2] || path.join(os.homedir(), 'Desktop', '四六级词汇量检测-路演.pptx');

/* 令牌 */
const C = {
  paper: 'FAF8F4', ink: '12130F', ink2: '5E574E', ink3: '8A8378',
  orange: 'FF4D2E', dark: '12130F', cream: 'F0EDE6', dim: 'A29A8C',
  white: 'FFFFFF', blue: '1B4DFF',
};
const F = '微软雅黑', FM = 'Consolas';
const W = 13.333, H = 7.5, M = 0.9, CW = W - M * 2;

const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'RS', width: W, height: H });
pptx.layout = 'RS';
pptx.author = '四六级词汇量检测';
pptx.company = '广东亚视演艺职业学院 · 信息工程学院';
pptx.title = '四六级词汇量检测 · 路演';

let page = 0;
const TOTAL = 13;

/* ---------- 版式框架 ---------- */
function slide(opts = {}) {
  page++;
  const s = pptx.addSlide();
  s.background = { color: opts.bg || C.paper };
  // 顶部深色带
  if (opts.topBar !== false) {
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.42, fill: { color: opts.topColor || C.dark } });
    s.addText('CET VOCABULARY PROFILER', {
      x: M, y: 0.1, w: 6, h: 0.24, fontFace: FM, fontSize: 9, color: opts.onTop || C.cream, charSpacing: 2.5,
    });
    s.addText(opts.kicker || '', {
      x: W - M - 7.2, y: 0.1, w: 7.2, h: 0.24, fontFace: F, fontSize: 9, color: opts.onTopDim || C.dim, align: 'right',
    });
  }
  // 页码
  if (opts.bottomBand !== true) {
    s.addText(String(page) + ' / ' + TOTAL, {
      x: W - M - 1.2, y: H - 0.5, w: 1.2, h: 0.26, fontFace: FM, fontSize: 9, color: C.ink3, align: 'right',
    });
  }
  return s;
}
function title(s, text, opt = {}) {
  s.addText(text, {
    x: M, y: opt.y ?? 0.95, w: opt.w ?? CW, h: opt.h ?? 1.2,
    fontFace: F, fontSize: opt.sz ?? 38, bold: true, color: opt.color || C.ink,
    charSpacing: -1, lineSpacingMultiple: 1.05, valign: 'top',
  });
}
function sub(s, text, y) {
  s.addText(text, { x: M, y, w: CW, h: 0.45, fontFace: F, fontSize: 14.5, color: C.ink2 });
}
function band(s, items) {           // 底部深色数据带
  s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 1.28, w: W, h: 1.28, fill: { color: C.dark } });
  const n = items.length;
  const colW = CW / n;
  items.forEach((it, i) => {
    const x = M + i * colW;
    s.addText(it[0], { x, y: H - 1.06, w: colW - 0.3, h: 0.5, fontFace: FM, fontSize: 24, bold: true, color: C.white });
    s.addText(it[1], { x, y: H - 0.56, w: colW - 0.3, h: 0.3, fontFace: F, fontSize: 10, color: C.dim });
  });
  s.addText(String(page) + ' / ' + TOTAL, {
    x: W - 0.75, y: H - 0.34, w: 0.6, h: 0.24, fontFace: FM, fontSize: 8.5, color: C.dim, align: 'right',
  });
}
function cols3(s, items, y = 3.0, colW = 3.5, h = 2.1) {
  items.forEach((p, i) => {
    const x = M + i * (colW + 0.45);
    s.addShape(pptx.ShapeType.rect, { x, y, w: 0.85, h: 0.075, fill: { color: C.orange } });
    s.addText(p[0], { x, y: y + 0.2, w: colW, h: 0.5, fontFace: F, fontSize: 20, bold: true, color: C.ink });
    s.addText(p[1], { x, y: y + 0.78, w: colW, h: h - 0.6, fontFace: F, fontSize: 12.5, color: C.ink2, lineSpacingMultiple: 1.35 });
  });
}
function pic(s, file, x, y, w, h) {
  if (!fs.existsSync(file)) return false;
  s.addImage({ path: file, x, y, w, h, sizing: { type: 'contain', x, y, w, h } });
  return true;
}

/* ============================ 01 封面 ============================ */
{
  const s = slide({ kicker: '筑视界 · 码绘交互 ／ Web 前端开发创意技能大赛' });
  s.addShape(pptx.ShapeType.rect, { x: W - M - 0.42, y: 1.2, w: 0.42, h: 0.42, fill: { color: C.orange } });
  title(s, '测准，\n然后告诉你该背哪些词', { y: 1.15, sz: 56, h: 2.2 });
  sub(s, '四六级词汇量检测 —— 一台词汇量测量仪，不是一个背单词 App', 3.35);
  band(s, [['7,175', '词条，全带音标'], ['9,204', '英中对照例句'], ['413', '条离线断言'], ['2.11 MB', '单文件 · 断网可用']]);
  s.addNotes('开场 20 秒：先说结论——我们做的不是背单词 App，是一台词汇量测量仪。'
    + '它测出来的不是一个数字，而是"带误差的词汇量 + 差在哪几段 + 接下来背哪些词"。'
    + '四个数字先给评委一个体量感：词库 7,175，例句 9,204，测试断言 412，整个东西就一个 2 MB 的文件，断网也能跑。');
}

/* ============================ 02 痛点 ============================ */
{
  const s = slide({ kicker: '问题' });
  title(s, '你测出来的那个数字，\n其实什么都没说清', { sz: 40, h: 1.6 });
  const qs = [
    ['误差多大？', '±200 还是 ±1,200？'],
    ['差在哪？', '是高频词有洞，还是冷门词不会？'],
    ['该背哪些？', '给个数字，然后呢？'],
    ['什么时候再测？', '两周后到底有没有变好？'],
  ];
  qs.forEach((q, i) => {
    const y = 2.85 + i * 0.86;
    s.addText('——', { x: M, y, w: 0.5, h: 0.4, fontFace: F, fontSize: 15, color: C.orange, bold: true });
    s.addText(q[0], { x: M + 0.6, y: y - 0.02, w: 3.4, h: 0.45, fontFace: F, fontSize: 21, bold: true, color: C.ink });
    s.addText(q[1], { x: M + 4.3, y: y + 0.03, w: 7.6, h: 0.42, fontFace: F, fontSize: 13, color: C.ink2 });
  });
  s.addText('市面上的词汇量测试，到第一个问题就停了。', {
    x: M, y: 6.35, w: CW, h: 0.4, fontFace: F, fontSize: 15, bold: true, color: C.orange,
  });
  s.addNotes('把痛点讲成四连问，节奏快一点：误差多大？差在哪？该背哪些？什么时候再测？'
    + '每一个问题，现有产品都不回答。最后一句钉住：它们到第一个问题就停了。');
}

/* ============================ 03 定位 ============================ */
{
  const s = slide({ kicker: '我们做什么' });
  title(s, '所以我们只做一件事：\n测准，然后开方', { sz: 40, h: 1.6 });
  sub(s, '我们生产「处方」，不生产「药」。', 2.72);
  const hw = (CW - 0.5) / 2;
  // 不做
  s.addShape(pptx.ShapeType.rect, { x: M, y: 3.28, w: hw, h: 0.075, fill: { color: 'C9C2B4' } });
  s.addText('不做', { x: M, y: 3.48, w: hw, h: 0.4, fontFace: F, fontSize: 17, bold: true, color: C.ink3 });
  s.addText('背单词 · 记忆卡 · 复习队列\n签到打卡 · 排行榜 · 社交\n账号体系 · 云端同步\n广告与课程导流', {
    x: M, y: 3.92, w: hw, h: 1.9, fontFace: F, fontSize: 13, color: C.ink2, lineSpacingMultiple: 1.5,
  });
  // 只做
  const x2 = M + hw + 0.5;
  s.addShape(pptx.ShapeType.rect, { x: x2, y: 3.28, w: hw, h: 0.075, fill: { color: C.orange } });
  s.addText('只做', { x: x2, y: 3.48, w: hw, h: 0.4, fontFace: F, fontSize: 17, bold: true, color: C.orange });
  s.addText('测准：带误差区间的词汇量\n诊断：差在哪几个词频段\n开方：具体到词的补词单 + 验收线\n复测：这次的进步是真的吗', {
    x: x2, y: 3.92, w: hw, h: 1.9, fontFace: F, fontSize: 13, color: C.ink, lineSpacingMultiple: 1.5,
  });
  s.addText('用户拿着我们的词单，去他用惯的任何产品背。', {
    x: M, y: 6.15, w: CW, h: 0.4, fontFace: F, fontSize: 14.5, bold: true, color: C.ink,
  });
  s.addNotes('这一页是定位，也是防守：为什么不加背单词功能。因为背单词 App 比的是内容量和复习算法，'
    + '那是重资产赛道；我们比的是"测量与诊断的可信度"。加背单词等于跑到别人的主场。');
}

/* ============================ 04 闭环 ============================ */
{
  const s = slide({ kicker: '产品闭环' });
  title(s, '四步，每一步都能被验证', { sz: 40 });
  const steps = [
    ['01', '检测', '分层抽样 + 自适应停测\n达标就停，不多问一题'],
    ['02', '诊断', '7 个词频段掌握率\n按缺口×词频权重排优先级'],
    ['03', '开方', '具体到词的补词单\n每天多少、几天后复测'],
    ['04', '复测', '逐词差分\n真学会 / 背了又忘 / 掉档'],
  ];
  steps.forEach((st, i) => {
    const cw = (CW - 0.9) / 4;
    const x = M + i * (cw + 0.3);
    s.addText(st[0], { x, y: 2.55, w: cw, h: 0.35, fontFace: FM, fontSize: 13, bold: true, color: C.orange });
    s.addText(st[1], { x, y: 2.92, w: cw, h: 0.55, fontFace: F, fontSize: 24, bold: true, color: C.ink });
    s.addShape(pptx.ShapeType.rect, { x, y: 3.6, w: cw - 0.15, h: 0.05, fill: { color: 'C9C2B4' } });
    s.addText(st[2], { x, y: 3.78, w: cw - 0.1, h: 1.3, fontFace: F, fontSize: 12, color: C.ink2, lineSpacingMultiple: 1.4 });
    if (i < 3) s.addText('›', { x: x + cw - 0.02, y: 2.9, w: 0.28, h: 0.5, fontFace: F, fontSize: 22, bold: true, color: C.orange, align: 'center' });
  });
  s.addText('第 4 步是大多数产品缺的那一步：它们只安排复习，不验证进步。隔几天再打开，首页有一张「回访卡」把上次的结论接着说下去。', {
    x: M, y: 5.5, w: CW, h: 0.4, fontFace: F, fontSize: 13.5, color: C.ink2,
  });
  s.addNotes('四步一句带过，重点停在第四步：多数产品只安排复习、不验证。'
    + '我们会记录每轮逐词状态，下一轮告诉你哪些是真学会的、哪些是背了又忘的。');
}

/* ============================ 05 测准 ============================ */
{
  const s = slide({ kicker: '核心能力 1 ／ 把数字测准' });
  title(s, '敢把误差写在结果旁边', { sz: 40 });
  s.addText('≈ 4,449 词', { x: M, y: 2.1, w: 5.4, h: 0.9, fontFace: FM, fontSize: 46, bold: true, color: C.ink });
  s.addText('±436 词 · 95% 置信区间', { x: M, y: 2.98, w: 5.6, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: C.orange });
  s.addText('严格口径 3,956（3,168–4,540）\n折中口径 4,449（3,668–4,540）', {
    x: M, y: 3.48, w: 5.6, h: 0.9, fontFace: F, fontSize: 12.5, color: C.ink2, lineSpacingMultiple: 1.4,
  });
  const rows = [
    ['Agresti-Coull', '小样本下区间不再失真'],
    ['有限总体修正', '覆盖率越高，区间越窄'],
    ['蒙对校正', '四选一猜对的，扣掉'],
  ];
  const x2 = M + 6.1;
  rows.forEach((r, i) => {
    const y = 2.12 + i * 1.02;
    s.addShape(pptx.ShapeType.rect, { x: x2, y: y + 0.06, w: 0.06, h: 0.72, fill: { color: C.orange } });
    s.addText(r[0], { x: x2 + 0.24, y, w: 4.6, h: 0.35, fontFace: F, fontSize: 15, bold: true, color: C.ink });
    s.addText(r[1], { x: x2 + 0.24, y: y + 0.36, w: 4.6, h: 0.32, fontFace: F, fontSize: 11.5, color: C.ink2 });
  });
  s.addText('题量不是拍脑袋：边测边算区间宽度，达标就提示收工。', {
    x: M, y: 4.75, w: CW, h: 0.4, fontFace: F, fontSize: 14, color: C.ink,
  });
  band(s, [['±150–400', '可选目标精度'], ['2', '严格 / 折中两套口径'], ['3', '层统计修正'], ['95%', '置信区间']]);
  s.addNotes('这是全场的技术底气。三个修正各一句：小样本用 Agresti-Coull 才不会崩、'
    + '总体只有几千词所以做有限总体修正、四选一要扣掉蒙对。'
    + '并且同时给两套口径——"模糊"算不算会，我们不替你决定，两个数都摆出来。');
}

/* ============================ 06 诊断 ============================ */
{
  const s = slide({ kicker: '核心能力 2 ／ 把结论变成方向' });
  title(s, '总掌握率会骗人，所以拆到 7 个词频段', { sz: 36 });
  const bands = [['最高频 1k', 70, 'C8A24A'], ['1k–2k', 67, 'C8A24A'], ['2k–3k', 64, 'C0503C'],
    ['3k–5k', 66, 'C8A24A'], ['5k–10k', 71, '4E8F6B'], ['10k–20k', 63, 'C0503C'], ['20k 以外', 63, 'C0503C']];
  const trackX = M + 1.85, trackW = 7.4;
  bands.forEach((b, i) => {
    const y = 2.2 + i * 0.5;
    s.addText(b[0], { x: M, y: y + 0.04, w: 1.8, h: 0.3, fontFace: F, fontSize: 12, color: C.ink2 });
    s.addShape(pptx.ShapeType.roundRect, { x: trackX, y: y + 0.11, w: trackW, h: 0.16, rectRadius: 0.4, fill: { color: 'E6E1D6' }, line: { color: 'E6E1D6' } });
    s.addShape(pptx.ShapeType.roundRect, { x: trackX, y: y + 0.11, w: trackW * b[1] / 100, h: 0.16, rectRadius: 0.4, fill: { color: b[2] }, line: { color: b[2] } });
    s.addText(b[1] + '%', { x: trackX + trackW + 0.18, y: y + 0.02, w: 0.9, h: 0.3, fontFace: FM, fontSize: 13, bold: true, color: C.ink });
  });
  s.addText('最高频段有洞，比总掌握率低一点更致命——那是读文章真正会卡的地方。', {
    x: M, y: 5.72, w: CW, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.ink,
  });
  s.addText('优先级 = 缺口词数 × 词频权重　｜　「缺口」（测过还不会）与「未测」（压根不知道）分开统计', {
    x: M, y: 6.18, w: CW, h: 0.4, fontFace: F, fontSize: 12, color: C.ink3,
  });
  s.addNotes('讲一个反直觉的点：总掌握率 77% 听着还行，但最高频 1k 只有 70%、2k-3k 只有 64% —— '
    + '这种"高频段反而不稳"的结构，读任何真实文本都会卡。所以我们诊断到段，并且按缺口×词频权重排优先级。');
}

/* ============================ 07 词汇地图 ============================ */
{
  const s = slide({ kicker: '核心能力 3 ／ 可视化即入口' });
  title(s, '182 格，点一下就在这一块复测', { sz: 38 });
  sub(s, '7 个词频段 × 26 个首字母：颜色 = 掌握率，浓淡 = 这一格测过多少', 1.95);
  pic(s, path.join(SHOTS, 'ppt-map.jpg'), M, 2.5, 9.2, 3.6);
  s.addText('不是一张装饰图。\n\n点格子 → 复测这一块\nShift+点击 → 带着这一格问 AI', {
    x: M + 9.5, y: 2.62, w: 3.5, h: 3.4, fontFace: F, fontSize: 13, color: C.ink, lineSpacingMultiple: 1.5,
  });
  s.addText('看完就知道下一步动哪里，这是"可视化"和"能干活"的区别。', {
    x: M, y: 6.28, w: CW, h: 0.4, fontFace: F, fontSize: 13.5, bold: true, color: C.orange,
  });
  s.addNotes('这一页最好现场点一下：点一个格子立刻开始复测那一块。'
    + '强调"图即入口"——很多作品的图表只是展示，我们的图表可以直接触发动作。');
}

/* ============================ 08 差异对比 ============================ */
{
  const s = slide({ kicker: '和市面上的产品比' });
  title(s, '区别就在这几行', { sz: 40 });
  const head = ['', '在线词汇量测试', '背单词 App', '我们'];
  const rows = [
    ['给不给误差', '只给一个数字', '不测', '给 95% 区间 + 两套口径'],
    ['诊断到不到段', '不到', '只记个人词表', '7 个词频段 + 182 格地图'],
    ['验证进步', '没有', '只有复习曲线', '跨轮逐词差分'],
    ['数据在谁手里', '上传服务器', '绑账号 + 社区', '全在本机，一个文件带走'],
    ['要不要账号', '要', '要', '不要'],
  ];
  const tbl = [head, ...rows].map((r, i) =>
    r.map((cell, j) => ({
      text: cell,
      options: {
        fontFace: F,
        fontSize: i === 0 ? 12.5 : 12,
        bold: i === 0 || j === 3,
        color: i === 0 ? C.cream : (j === 3 ? C.ink : C.ink2),
        fill: i === 0 ? { color: C.dark } : (j === 3 ? { color: 'FBEBE6' } : { color: C.paper }),
        align: j === 0 ? 'left' : 'left',
        valign: 'middle',
      },
    })));
  s.addTable(tbl, {
    x: M, y: 2.0, w: CW, colW: [2.4, 2.9, 2.7, 3.5],
    rowH: 0.62, border: { type: 'solid', color: 'DFD8CB', pt: 0.75 },
  });
  s.addText('我们不做背单词，所以敢说：钱和注意力都花在"测准"这一件事上。', {
    x: M, y: 6.2, w: CW, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.ink,
  });
  s.addNotes('对比表是评委最想看的一页，但要讲得克制：不是贬低别人，而是说明定位不同。'
    + '重点讲最后两行——数据在用户手里、不需要账号，这既是隐私，也是"工具属于自己"的主张。');
}

/* ============================ 09 AI ============================ */
{
  const s = slide({ kicker: 'AI 融合' });
  title(s, 'AI 在这里只做一件事：\n把数据翻译成行动', { sz: 38, h: 1.6 });
  cols3(s, [
    ['模型不做算术', '所有数字来自工具返回值。数据不足时，它会明确说"样本太少，不能下结论"。'],
    ['三档通路', '自带 Key 不限次 / 完成检测换一次作者额度 / 本地方案永远可用。面板常显当前档位。'],
    ['双向联动', '图表能带着那一格的数字去问；回答能落成可点的动作（跳页 / 开一轮 / 复测某段）。'],
  ], 2.75, 3.6, 2.2);
  s.addText('而且断网也有结论：本地规则引擎不依赖任何模型，照样给出补词计划与验收线。', {
    x: M, y: 5.45, w: CW, h: 0.4, fontFace: F, fontSize: 13.5, color: C.ink2,
  });
  band(s, [['8 + 1', '个工具（含动作）'], ['3 轮', '工具调用上限'], ['0', '逐题作答上传'], ['∞', '本地方案不限次']]);
  s.addNotes('AI 这一页要防止两种误解：一是"随便接了个模型"，二是"AI 在瞎编数字"。'
    + '所以我们讲三点：模型不做算术（数字全来自工具）、三档通路（谁付费说清楚）、双向联动（图能问、答能点）。');
}

/* ============================ AI 技术清单（路演版新增） ============================ */
{
  const s = slide({ kicker: 'AI 技术清单' });
  title(s, '我们用了哪些 AI 技术：五条，都能落到代码', { sz: 38 });
  const tech = [
    ['Function Calling Agent', '模型决定调哪个工具：8 个工具、最多 3 轮、每轮重新取数。数字全部来自工具返回。'],
    ['轻量 RAG 检索', '本地 9,204 条英中例句 + 倒排索引，作为工具被按需检索（不是向量库）。'],
    ['结构化输出驱动界面', '模型返回动作 → 前端渲染按钮 → 点击真执行；参数经前后端双白名单校验。'],
    ['上下文注入 + 单一数据源', '图表把"你在看的那一格"带进提问；后端不重算统计，数字结构上不可能漂。'],
    ['三级降级 + 多厂商适配', '后端 Agent → 直连厂商 → 本地规则引擎；支持 DeepSeek/通义/智谱/Ollama。'],
  ];
  tech.forEach((t, i) => {
    const y = 1.95 + i * 0.92;
    s.addShape(pptx.ShapeType.roundRect, { x: M, y, w: 0.42, h: 0.72, rectRadius: 0.1, fill: { color: C.orange } });
    s.addText(String(i + 1), { x: M, y: y + 0.16, w: 0.42, h: 0.4, fontFace: FM, fontSize: 15, bold: true, color: C.white, align: 'center' });
    s.addText(t[0], { x: M + 0.62, y: y + 0.02, w: 4.4, h: 0.34, fontFace: F, fontSize: 13.5, bold: true, color: C.ink });
    s.addText(t[1], { x: M + 0.62, y: y + 0.36, w: 10.6, h: 0.4, fontFace: F, fontSize: 10.5, color: C.ink2 });
  });
  s.addText('对应赛题方向：① AI Agent 智能助手（强）· ⑤ AI 教育与学习平台（强）· ② Agent RAG（中）· ⑧ 数据分析与可视化（中）', {
    x: M, y: 6.62, w: CW, h: 0.36, fontFace: F, fontSize: 10, color: C.ink3,
  });
  s.addNotes('如果评委问"你们的 AI 到底用在哪"，这一页就是答案：五条技术，每条一句话说清落点。'
    + '切记不要吹成向量 RAG 或通用自主 Agent——我们的边界写在下一页的"不夸大清单"里（详细版第 22 页）。');
}

/* ============================ 10 现场演示 ============================ */
{
  const s = slide({ kicker: '现场演示 ／ 30 秒' });
  title(s, '不如直接看它跑一遍', { sz: 40 });
  const demo = [
    ['① 摸底 30 题', '看区间怎么一步步收窄，达标就提示停'],
    ['② 看诊断', '7 个词频段 + 182 格地图，哪块是洞一眼看见'],
    ['③ 问 AI', '点一段问"这块怎么补"，得到一个能点的动作'],
  ];
  demo.forEach((d, i) => {
    const y = 2.05 + i * 1.3;
    s.addShape(pptx.ShapeType.roundRect, { x: M, y, w: CW, h: 1.1, rectRadius: 0.08, fill: { color: C.white }, line: { color: 'E2DBCE' } });
    s.addText(d[0], { x: M + 0.35, y: y + 0.16, w: 4.2, h: 0.4, fontFace: F, fontSize: 18, bold: true, color: C.orange });
    s.addText(d[1], { x: M + 0.35, y: y + 0.6, w: CW - 0.7, h: 0.4, fontFace: F, fontSize: 13, color: C.ink2 });
  });
  s.addText('如果现场不方便演示：这一页可直接换成 30 秒录屏（已备好）。', {
    x: M, y: 6.1, w: CW, h: 0.4, fontFace: F, fontSize: 12.5, color: C.ink3, italic: true,
  });
  s.addNotes('演示的前置动作一定要提前做好：浏览器已打开首页、已完成一小段摸底、AI 额度已就位。'
    + '三步控制在 30 秒内，讲一句点一下，不要边找按钮边讲。演示完立刻回到"所以它到底解决了什么"。');
}

/* ============================ 11 可信度 ============================ */
{
  const s = slide({ kicker: '为什么可信' });
  title(s, '一个 2 MB 的文件，413 条断言守着', { sz: 38 });
  s.addText('抽样与区间估计这类东西，肉眼验收不了。所以全部写成断言：', {
    x: M, y: 2.0, w: CW, h: 0.4, fontFace: F, fontSize: 14, color: C.ink2,
  });
  const rows = [
    ['功能测试（jsdom）', '164', '抽样 / 估计 / 等级 / 多轮 / 档案'],
    ['真实浏览器', '54', '布局不溢出 / 暗色 / 对比度 / 焦点'],
    ['桌宠与入场页', '83', '拖动 / 悬空物理 / 分层浮现 / 退场'],
    ['交付与 AI', '54', '断网可用 / 词书 / 三档额度 / 双向联动'],
  ];
  rows.forEach((r, i) => {
    const y = 2.55 + i * 0.7;
    s.addText(r[0], { x: M, y, w: 3.6, h: 0.35, fontFace: F, fontSize: 13, color: C.ink2 });
    s.addText(r[1], { x: M + 3.7, y, w: 1.1, h: 0.35, fontFace: FM, fontSize: 15, bold: true, color: C.orange });
    s.addText(r[2], { x: M + 5.0, y: y + 0.03, w: 6.4, h: 0.35, fontFace: F, fontSize: 11.5, color: C.ink3 });
  });
  s.addText('断网、空目录、全新浏览器配置下，全部功能照常——这是"发到别人电脑上也能用"的证明。', {
    x: M, y: 5.55, w: CW, h: 0.4, fontFace: F, fontSize: 13, color: C.ink,
  });
  band(s, [['413', '条离线断言'], ['11', '个测试套件'], ['2.11 MB', '单文件'], ['0', '运行时依赖']]);
  s.addNotes('这页解决"是不是课程作业"的疑虑。413 条离线断言（另 7 条联网）、11 个套件，最后一组专门验"发给别人能不能用"：'
    + '空目录 + 全新浏览器配置 + 屏蔽全部网络，功能照常。');
}

/* ============================ 12 收尾 ============================ */
{
  const s = slide({ kicker: '谢谢 · 欢迎提问', bg: C.paper });
  title(s, '测准只是起点。', { y: 1.5, sz: 54 });
  s.addText('能看懂自己差在哪、下一步背哪些词，才算真的有用。', {
    x: M, y: 2.6, w: CW, h: 0.6, fontFace: F, fontSize: 20, color: C.ink2,
  });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 3.5, w: 2.2, h: 0.075, fill: { color: C.orange } });
  const lines = [
    '测准：带 95% 区间的词汇量，双口径并列',
    '诊断：7 个词频段 + 182 格地图，图即入口',
    '开方：具体到词的补词单 + 验收线，可带走',
    '验证：跨轮逐词差分，进步是真是假有答案',
  ];
  lines.forEach((l, i) => {
    s.addText('· ' + l, { x: M, y: 3.85 + i * 0.5, w: CW, h: 0.4, fontFace: F, fontSize: 14, color: C.ink });
  });
  s.addText('项目仓库 github.com/whiteyuexi/cet4-vocab-check　｜　交付物：单文件 HTML · 技术文档 · 演示视频', {
    x: M, y: 6.25, w: CW, h: 0.35, fontFace: F, fontSize: 11.5, color: C.ink3,
  });
  s.addNotes('收尾三句话：测准是起点、看懂差在哪才有用、我们把这件事做成了一个能带走的工具。'
    + '然后停住，留白给评委提问。准备好的三个必答：为什么不做背单词、误差怎么保证、AI 到底做了什么。');
}

await pptx.writeFile({ fileName: OUT });
console.log('已生成路演稿:', OUT);
console.log('  页数:', TOTAL, '| 大小:', (fs.statSync(OUT).size / 1024).toFixed(0), 'KB | 16:9');
console.log('  每页带口播稿（演讲备注），文字与图形全部可编辑。');
