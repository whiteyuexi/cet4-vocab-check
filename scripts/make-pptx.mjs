// scripts/make-pptx.mjs — 生成**可编辑**的答辩 PPT（真 .pptx）
//
// 引擎：pptxgenjs（MIT，仅构建期依赖，不进产物）
// 为什么用它而不是手搓 OOXML：schema 细节多、易写出 PowerPoint/WPS 打不开的文件；
// 这个库产出的是标准 OOXML，每个文本框、色块、表格在 WPS/PowerPoint 里都能直接改。
//
// 用法：node scripts/make-pptx.mjs [输出路径]
//   默认 → ~/Desktop/四六级词汇量检测-答辩.pptx
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const OUT = process.argv[2] || path.join(os.homedir(), 'Desktop', '四六级词汇量检测-答辩.pptx');

/* ---------- 设计令牌（与产品一致） ---------- */
const C = {
  brand: '2A5BE0', brandDark: '1E46C8', brandLight: '7FA4FF', teal: '00A99D',
  ink: '101319', ink2: '575E6B', ink3: '6B7280',
  bg: 'EDF0F6', white: 'FFFFFF', line: 'DCE3F0', line2: 'C6D2E6',
  ok: '0A6B4A', warn: '8A5A10', bad: 'B02E22',
  dk: '0F1116', dk2: '17203A', dkCard: '222A38', dkLine: '303A4E',
  softBlue: 'E8EFFF', softGreen: 'EAF7F1', softAmber: 'FFF6E6',
};
const F = '微软雅黑';
const FM = 'Consolas';

const W = 13.333, H = 7.5, M = 0.82, CW = W - M * 2;

const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'CET16x9', width: W, height: H });
pptx.layout = 'CET16x9';
pptx.author = '四六级词汇量检测';
pptx.company = '广东亚视演艺职业学院 · 信息工程学院';
pptx.title = '四六级词汇量检测 · 答辩';
pptx.subject = '筑视界·码绘交互 Web 前端开发创意技能大赛';

/* ---------- 版式助手 ---------- */
function newSlide(bg) {
  const s = pptx.addSlide();
  s.background = { color: bg };
  return s;
}
function kicker(s, text, dark) {
  s.addText(text, {
    x: M, y: 0.44, w: CW * 0.8, h: 0.3, fontFace: F, fontSize: 11, bold: true,
    color: dark ? C.brandLight : C.brand, charSpacing: 1,
  });
}
function head(s, title, sub, dark) {
  s.addText(title, {
    x: M, y: 0.8, w: CW, h: 0.72, fontFace: F, fontSize: 30, bold: true,
    color: dark ? C.white : C.ink,
  });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 1.56, w: 0.66, h: 0.055, fill: { color: C.brand } });
  if (sub) {
    s.addText(sub, {
      x: M, y: 1.7, w: CW, h: 0.4, fontFace: F, fontSize: 13, color: dark ? 'A8AFBE' : C.ink2,
    });
  }
}
function foot(s, page, total, dark) {
  s.addText('四六级词汇量检测 · CET Vocabulary Checker', {
    x: M, y: H - 0.58, w: CW * 0.7, h: 0.28, fontFace: F, fontSize: 9.5,
    color: dark ? '8B93A3' : C.ink3,
  });
  s.addText(page + ' / ' + total, {
    x: W - M - 1.3, y: H - 0.58, w: 1.3, h: 0.28, fontFace: FM, fontSize: 9.5,
    color: dark ? '8B93A3' : C.ink3, align: 'right',
  });
}
function card(s, x, y, w, h, opt = {}) {
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.07,
    fill: { color: opt.fill || C.white },
    line: { color: opt.line || C.line, width: opt.lineW || 1 },
  });
}
function bar(s, x, y, w, h, color) {
  s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.4, fill: { color } });
}
function txt(s, text, o) {
  const base = { fontFace: F, fontSize: 13, color: C.ink2, valign: 'top', ...o };
  s.addText(text, base);
}
function stat(s, x, y, w, h, value, label, dark, accent) {
  card(s, x, y, w, h, { fill: dark ? C.dkCard : C.white, line: dark ? C.dkLine : C.line });
  s.addText(value, { x: x + 0.18, y: y + 0.14, w: w - 0.36, h: 0.5, fontFace: FM, fontSize: 24, bold: true, color: accent || C.brand });
  s.addText(label, { x: x + 0.18, y: y + h - 0.42, w: w - 0.36, h: 0.3, fontFace: F, fontSize: 10, color: dark ? 'A8AFBE' : C.ink3 });
}
function pic(s, file, x, y, w, h) {
  if (!file || !fs.existsSync(file)) return false;
  /* 用库自带的 contain 缩放。
     不要自己读文件头算比例——我第一版按 PNG 的 IHDR 读宽高，
     换成 JPEG 后读到的是垃圾值，图片被算成 0 尺寸，幻灯片上只剩白框。 */
  s.addImage({ path: file, x, y, w, h, sizing: { type: 'contain', x, y, w, h } });
  return true;
}

const TOTAL = 14;
const shot = n => path.join(SHOTS, n);

/* ============================ 1 封面 ============================ */
{
  const s = newSlide(C.dk);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.dk2 } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.dk }, transparency: 30 });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 1.5, w: 0.66, h: 0.055, fill: { color: C.teal } });
  txt(s, '筑视界 · 码绘交互 ／ Web 前端开发创意技能大赛', { x: M, y: 1.7, w: 11, h: 0.35, fontSize: 12, bold: true, color: C.brandLight });
  s.addText('四六级词汇量检测', { x: M, y: 2.12, w: 11.8, h: 1.0, fontFace: F, fontSize: 52, bold: true, color: C.white });
  s.addText('把一个数字，做成一份能执行的诊断', { x: M, y: 3.08, w: 11.8, h: 0.6, fontFace: F, fontSize: 24, color: 'C9D4EA' });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 4.15, w: 11.7, h: 0.015, fill: { color: '2A3346' } });
  const stats = [['7,175', '词库词条'], ['9,204', '英中例句'], ['387', '自动化断言'], ['2.08 MB', '单文件交付']];
  stats.forEach((it, i) => {
    const x = M + i * 2.95;
    s.addText(it[0], { x, y: 4.4, w: 2.7, h: 0.5, fontFace: FM, fontSize: 22, bold: true, color: C.white });
    s.addText(it[1], { x, y: 4.9, w: 2.7, h: 0.3, fontFace: F, fontSize: 10.5, color: '8B93A3' });
  });
  txt(s, '广东亚视演艺职业学院 · 信息工程学院　｜　单人作品　｜　2026-10', { x: M, y: 6.15, w: 11.8, h: 0.35, fontSize: 11, color: '8B93A3' });
  s.addNotes('开场 15 秒：一句话说清我们是什么——不是背单词 App，是一台词汇量测量仪 + 处方机。\n紧接着给四个数字：词库 7,175、例句 9,204、断言 387、产物 2.08 MB 单文件。');
}

/* ============================ 2 痛点 ============================ */
{
  const s = newSlide(C.bg);
  kicker(s, '问题', false); head(s, '市面上的「词汇量测试」，给你一个数字就完事', '不告诉你这个数字有多大误差，也不知道该怎么用', false);
  card(s, M, 2.45, CW, 1.5);
  s.addText('“你测出来 4,200 词。”', { x: M + 0.32, y: 2.6, w: CW - 0.64, h: 0.55, fontFace: F, fontSize: 25, bold: true, color: C.ink });
  txt(s, '—— 然后呢？误差是 ±200 还是 ±1,200？哪几段最薄？接下来该背哪些词？背多久再测？',
    { x: M + 0.32, y: 3.2, w: CW - 0.64, h: 0.55, fontSize: 14 });
  const cols = [
    ['① 没有误差', '只给点估计，不告诉你这个数字可能是抽样的偶然'],
    ['② 不可解释', '黑箱算法，无法核对抽样与口径，换个网站数字差一千'],
    ['③ 不可执行', '知道「不够」，但不知道该补哪一段、补多少、什么时候复测'],
  ];
  const cw = (CW - 0.44) / 3;
  cols.forEach((c, i) => {
    const x = M + i * (cw + 0.22);
    card(s, x, 4.2, cw, 1.85);
    s.addText(c[0], { x: x + 0.24, y: 4.4, w: cw - 0.48, h: 0.35, fontFace: F, fontSize: 15, bold: true, color: C.bad });
    txt(s, c[1], { x: x + 0.24, y: 4.85, w: cw - 0.48, h: 1.0, fontSize: 12.5, lineSpacingMultiple: 1.25 });
  });
  foot(s, 2, TOTAL, false);
  s.addNotes('这里要讲"三个断点"：不给误差、不可解释、不可执行。评委很容易共鸣——因为大多数人都做过那种测完只得到一个数字的测试。');
}

/* ============================ 3 定位 ============================ */
{
  const s = newSlide(C.bg);
  kicker(s, '定位', false); head(s, '我们生产「处方」，不生产「药」', '不做背单词、不做打卡、不要账号——只专注把数字测准、把方向指清', false);
  const hw = (CW - 0.3) / 2;
  card(s, M, 2.4, hw, 2.6, { line: C.bad, lineW: 1.5 });
  s.addText('不做', { x: M + 0.3, y: 2.58, w: hw - 0.6, h: 0.35, fontFace: F, fontSize: 16, bold: true, color: C.bad });
  s.addText([
    { text: '背单词 / 记忆卡 / 复习队列\n', options: { bullet: true } },
    { text: '社交、排行榜、打卡\n', options: { bullet: true } },
    { text: '账号体系与云端同步\n', options: { bullet: true } },
    { text: '向量库 RAG（会毁掉单文件 2 MB + 断网可用）', options: { bullet: true } },
  ], { x: M + 0.3, y: 3.02, w: hw - 0.6, h: 1.8, fontFace: F, fontSize: 12.5, color: C.ink2, lineSpacingMultiple: 1.3, bullet: { indent: 12 } });
  const x2 = M + hw + 0.3;
  card(s, x2, 2.4, hw, 2.6, { line: C.ok, lineW: 1.5 });
  s.addText('只做', { x: x2 + 0.3, y: 2.58, w: hw - 0.6, h: 0.35, fontFace: F, fontSize: 16, bold: true, color: C.ok });
  s.addText([
    { text: '测准：带误差区间的词汇量\n', options: { bullet: true } },
    { text: '诊断：差在哪几个词频段\n', options: { bullet: true } },
    { text: '规划：具体词单 + 验收线（可带走）\n', options: { bullet: true } },
    { text: '复测：这次的进步是真的吗', options: { bullet: true } },
  ], { x: x2 + 0.3, y: 3.02, w: hw - 0.6, h: 1.8, fontFace: F, fontSize: 12.5, color: C.ink2, lineSpacingMultiple: 1.3, bullet: { indent: 12 } });
  s.addText('一句话：用户拿着我们的词单，去他用惯的任何产品背——我们不抢那个场景。',
    { x: M, y: 5.3, w: CW, h: 0.6, fontFace: F, fontSize: 14.5, bold: true, color: C.brand });
  foot(s, 3, TOTAL, false);
  s.addNotes('这段一定要说清：为什么不加背单词功能。因为背单词 App 比的是内容与复习算法（重资产），我们比的是测量与诊断的可信度。加背单词 = 进入别人的主场。');
}

/* ============================ 4 闭环 ============================ */
{
  const s = newSlide(C.bg);
  kicker(s, '产品闭环', false); head(s, '检测 → 诊断 → 规划 → 复测', '每一步都能用真实数据验证，而不是"感觉好像进步了"', false);
  const steps = [
    ['01', '检测', '分层抽样 + 自适应停测\n给出带 95% 区间的词汇量'],
    ['02', '诊断', '7 个词频段掌握率\n按「缺口 × 词频权重」排优先级'],
    ['03', '规划', '具体到词的补词单\n每天多少词 + 验收线'],
    ['04', '复测', '逐词差分：真学会 / 背了又忘\n判断提升是否显著'],
  ];
  const cw = (CW - 0.36 * 3) / 4;
  steps.forEach((st, i) => {
    const x = M + i * (cw + 0.36);
    card(s, x, 2.55, cw, 2.55);
    s.addText(st[0], { x: x + 0.24, y: 2.7, w: cw - 0.48, h: 0.3, fontFace: FM, fontSize: 13, bold: true, color: C.brand });
    s.addText(st[1], { x: x + 0.24, y: 3.02, w: cw - 0.48, h: 0.45, fontFace: F, fontSize: 19, bold: true, color: C.ink });
    txt(s, st[2], { x: x + 0.24, y: 3.55, w: cw - 0.48, h: 1.2, fontSize: 11.5, lineSpacingMultiple: 1.3 });
    if (i < 3) s.addText('→', { x: x + cw + 0.02, y: 3.5, w: 0.32, h: 0.4, fontFace: F, fontSize: 18, bold: true, color: C.brand, align: 'center' });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: M, y: 5.5, w: CW, h: 0.78, rectRadius: 0.06, fill: { color: C.softBlue }, line: { color: C.line2 } });
  txt(s, '与「背单词 App」的根本差别：那些产品比的是内容与复习算法（重资产赛道）；我们比的是测量与诊断的可信度。',
    { x: M + 0.28, y: 5.66, w: CW - 0.56, h: 0.5, fontSize: 12, color: C.ink2 });
  foot(s, 4, TOTAL, false);
  s.addNotes('四步闭环是全场的骨架，后面每一页都在展开其中一步。讲的时候可以点一下：第 4 步"复测"是多数产品没有的。');
}

/* ============================ 5 测准 ============================ */
{
  const s = newSlide(C.bg);
  kicker(s, '核心能力 1 · 把数字测准', false); head(s, '三层修正，才敢把区间写出来', '同样题量下区间更窄；极端情况也不会失控', false);
  const rows = [
    ['Agresti-Coull', '小样本下比例区间不稳（Wald 在 p→0/1 时崩）', '加伪计数后再算区间'],
    ['有限总体修正', '不放回抽样，总体只有几千词，覆盖率越高越该收窄', '乘 √(1 − n/N)'],
    ['蒙对校正', '四选一即使不会也有 1/k 概率答对', '掌握率扣掉猜测基线'],
  ];
  rows.forEach((r, i) => {
    const y = 2.42 + i * 0.98;
    card(s, M, y, CW, 0.86);
    s.addText(r[0], { x: M + 0.26, y: y + 0.18, w: 2.6, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.brand });
    txt(s, r[1], { x: M + 3.0, y: y + 0.2, w: 5.6, h: 0.5, fontSize: 12 });
    s.addText(r[2], { x: M + 8.7, y: y + 0.2, w: 3.2, h: 0.45, fontFace: FM, fontSize: 12, bold: true, color: C.ok });
  });
  const hw = (CW - 0.24) / 2;
  s.addShape(pptx.ShapeType.roundRect, { x: M, y: 5.42, w: hw, h: 0.95, rectRadius: 0.06, fill: { color: C.softGreen }, line: { color: 'BFE6D5' } });
  s.addText('两套口径同时给', { x: M + 0.24, y: 5.54, w: hw - 0.48, h: 0.3, fontFace: F, fontSize: 13, bold: true, color: C.ok });
  txt(s, '严格（只算「认识」）／折中（「模糊」按一半）——不用一个数字糊过去',
    { x: M + 0.24, y: 5.86, w: hw - 0.48, h: 0.45, fontSize: 11 });
  const x2 = M + hw + 0.24;
  s.addShape(pptx.ShapeType.roundRect, { x: x2, y: 5.42, w: hw, h: 0.95, rectRadius: 0.06, fill: { color: C.softBlue }, line: { color: 'C9D8F8' } });
  s.addText('题量由精度决定，不是拍脑袋', { x: x2 + 0.24, y: 5.54, w: hw - 0.48, h: 0.3, fontFace: F, fontSize: 13, bold: true, color: C.brand });
  txt(s, '边测边算区间宽度，达标就提示收工，没到就说「再答约 N 题」',
    { x: x2 + 0.24, y: 5.86, w: hw - 0.48, h: 0.45, fontSize: 11 });
  foot(s, 5, TOTAL, false);
  s.addNotes('这页是技术深度的核心。评委如果追问"凭什么说准"，答案就是这三层修正 + 双口径。切记不要说"我们比别的产品准"，而要说"我们把误差摊开了"。');
}

/* ============================ 6 诊断 ============================ */
{
  const s = newSlide(C.bg);
  kicker(s, '核心能力 2 · 把结论变成方向', false); head(s, '总掌握率会骗人，所以诊断落到 7 个词频段', '最高频段的洞，才是读文章卡住的原因', false);
  const bands = [['最高频 1k', 70, C.warn], ['1k–2k', 67, C.warn], ['2k–3k', 64, C.warn],
    ['3k–5k', 66, C.warn], ['5k–10k', 71, C.ok], ['10k–20k', 63, C.bad], ['20k 以外', 63, C.bad]];
  const trackW = 6.2;
  bands.forEach((b, i) => {
    const y = 2.42 + i * 0.42;
    s.addText(b[0], { x: M, y: y + 0.03, w: 1.7, h: 0.28, fontFace: F, fontSize: 11.5, color: C.ink2 });
    bar(s, M + 1.8, y + 0.1, trackW, 0.15, 'DDE4F1');
    bar(s, M + 1.8, y + 0.1, trackW * b[1] / 100, 0.15, b[2]);
    s.addText(b[1] + '%', { x: M + 8.1, y: y + 0.02, w: 0.8, h: 0.28, fontFace: FM, fontSize: 11.5, bold: true, color: C.ink });
    s.addText('问 AI', { x: M + 9.0, y: y + 0.02, w: 0.9, h: 0.28, fontFace: F, fontSize: 9.5, color: C.brand, align: 'center' });
  });
  card(s, M, 5.62, CW, 0.95);
  s.addText('优先级 = 缺口词数 × 词频权重', { x: M + 0.28, y: 5.74, w: CW - 0.56, h: 0.3, fontFace: F, fontSize: 13, bold: true, color: C.brand });
  txt(s, '「缺口」（测过还不会，真正的洞）与「未测」（压根不知道，不构成结论）刻意分开统计——混在一起会把「整块没测」说成「缺口最大」。',
    { x: M + 0.28, y: 6.06, w: CW - 0.56, h: 0.42, fontSize: 11 });
  foot(s, 6, TOTAL, false);
  s.addNotes('这页讲"诊断不是给个分数，而是给方向"。缺口 vs 未测的区分是本项目较真的地方之一，值得单独强调。');
}

/* ============================ 7 词汇地图 ============================ */
{
  const s = newSlide(C.bg);
  kicker(s, '核心能力 3 · 可视化即入口', false);
  head(s, '词汇地图：182 格，点一下就在这一块复测', '7 个词频段 × 26 个首字母；颜色 = 掌握率，浓淡 = 测过多少', false);
  card(s, M, 2.28, CW, 4.0);
  // 用局部特写（2 倍分辨率裁切），比整屏截图清楚得多
  const ok = pic(s, shot('ppt-map.jpg'), M + 0.12, 2.38, CW - 0.24, 3.8) ||
             pic(s, shot('04-overview.png'), M + 0.12, 2.38, CW - 0.24, 3.8);
  txt(s, ok ? 'Shift + 点击格子：带着这一格的真实数字去问 AI　｜　点格子：直接复测这一块的缺口词'
    : '（截图缺失：docs/screenshots/ppt-map.jpg）',
    { x: M, y: 6.42, w: CW, h: 0.35, fontSize: 11.5, color: C.ink2 });
  foot(s, 7, TOTAL, false);
  s.addNotes('这页一定要现场演示：点一个格子开始复测，Shift+点另一个格子问 AI。图不是装饰，是入口——这是"可视化"与"可用"的区别。');
}

/* ============================ 8 多轮验证 ============================ */
{
  const s = newSlide(C.bg);
  kicker(s, '核心能力 4 · 验证进步', false); head(s, '「我这两周进步了」——真的吗？', '在 ±250 词的噪声下，两个点估计的差异可能只是抽样波动', false);
  const kinds = [
    ['背了又忘', '上轮认识、这轮模糊或不认识', '→ 才需要换方法（词根 / 例句语境）', C.bad],
    ['新学会', '上轮不认识、这轮认识', '→ 说明当前方法有效，继续推进', C.ok],
    ['掉档', '连续两轮模糊或不认识', '→ 优先级最高，但要看是不是本来就不会', C.warn],
    ['稳会', '两轮都认识', '→ 不用再花时间，把时间给别处', C.brand],
  ];
  const cw = (CW - 0.24) / 2;
  kinds.forEach((k, i) => {
    const x = M + (i % 2) * (cw + 0.24);
    const y = 2.42 + Math.floor(i / 2) * 1.4;
    card(s, x, y, cw, 1.24);
    bar(s, x + 0.02, y + 0.18, 0.07, 0.88, k[3]);
    s.addText(k[0], { x: x + 0.3, y: y + 0.18, w: cw - 0.6, h: 0.35, fontFace: F, fontSize: 16, bold: true, color: C.ink });
    txt(s, k[1], { x: x + 0.3, y: y + 0.56, w: cw - 0.6, h: 0.3, fontSize: 11.5 });
    s.addText(k[2], { x: x + 0.3, y: y + 0.84, w: cw - 0.6, h: 0.3, fontFace: F, fontSize: 11.5, bold: true, color: k[3] });
  });
  txt(s, '每轮归档：报告快照 + 逐词 2 bit 位图 + 词表指纹（7,175 词仅 1.8 KB/轮，localStorage 可存约 2,900 轮）',
    { x: M, y: 5.55, w: CW, h: 0.4, fontSize: 11, color: C.ink3 });
  foot(s, 8, TOTAL, false);
  s.addNotes('这页讲"把进步变成可判断的事"。如果评委问市面为什么没人做，答案是：大多数产品不做复测口径，只做复习曲线。');
}

/* ============================ 9 AI 三档 ============================ */
{
  const s = newSlide(C.bg);
  kicker(s, 'AI 融合 1 · 三档通路', false); head(s, 'AI 不是「接个模型」，是三条可控的通路', '面板右上角永远显示你现在用的是哪一档', false);
  const tiers = [
    ['自带 Key', '用户填自己的 API Key（DeepSeek 等允许浏览器跨域的厂商）', '不限次', '用户自己', C.ok],
    ['作者额度', '完成一次有效检测换 1 次（整库需 ≥100 词且覆盖 ≥95%）', '换来的次数', '作者', C.brand],
    ['本地方案', '确定性规则引擎，按等级 / 短板形态 / 覆盖状态分档', '不限次', '不花钱', C.ink3],
  ];
  tiers.forEach((t, i) => {
    const y = 2.42 + i * 1.14;
    card(s, M, y, CW, 1.0);
    bar(s, M + 0.02, y + 0.16, 0.07, 0.68, t[4]);
    s.addText(t[0], { x: M + 0.3, y: y + 0.3, w: 1.9, h: 0.4, fontFace: F, fontSize: 15, bold: true, color: t[4] });
    txt(s, t[1], { x: M + 2.3, y: y + 0.3, w: 5.4, h: 0.5, fontSize: 11.5 });
    s.addText(t[2], { x: M + 7.9, y: y + 0.3, w: 1.7, h: 0.4, fontFace: FM, fontSize: 12, bold: true, color: C.ink });
    txt(s, t[3], { x: M + 9.7, y: y + 0.32, w: 2.0, h: 0.4, fontSize: 11.5 });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: M, y: 5.95, w: CW, h: 0.62, rectRadius: 0.05, fill: { color: C.softBlue }, line: { color: C.line2 } });
  txt(s, '顺序不能反：自带 Key → 作者额度 → 本地方案。只有「用作者 Key 直连」才扣额度；用户自己跑后端不扣。',
    { x: M + 0.26, y: 6.08, w: CW - 0.52, h: 0.4, fontSize: 11 });
  foot(s, 9, TOTAL, false);
  s.addNotes('现场可以说：评委老师不用准备任何东西，做完一次检测就能换一次真模型的深度诊断；想无限用就填自己的 Key——数据不经过我们。');
}

/* ============================ 10 双向联动 ============================ */
{
  const s = newSlide(C.bg);
  kicker(s, 'AI 融合 2 · 与图表双向联动', false);
  head(s, '图能带着上下文去问，结论能落成可点的动作', '把「分析在左、图在右」的两张皮缝成一张', false);
  const iw = 4.85;
  card(s, M, 2.3, iw, 4.0);
  if (!pic(s, shot('ppt-ai.jpg'), M + 0.1, 2.4, iw - 0.2, 3.8) &&
      !pic(s, shot('05-ai-diagnose.png'), M + 0.1, 2.4, iw - 0.2, 3.8)) {
    txt(s, '（截图缺失：docs/screenshots/ppt-ai.jpg）', { x: M + 0.3, y: 3.9, w: iw - 0.6, h: 0.4, fontSize: 11 });
  }
  const x2 = M + iw + 0.26, w2 = W - M - x2;
  const pts = [
    ['反向：图 → AI', '频段条的「问」、地图 Shift+点击、「让 AI 解读地图」都会带着该段/该格的真实数字（词数、缺口、未测、举例）开场。'],
    ['正向：AI → 界面', '模型返回结构化动作（跳页 / 开一轮摸底 / 复测某段 / 追问），前端渲染成按钮，点击真的执行；参数经前后端两次白名单校验。'],
    ['离线也成立', '本地规则诊断不依赖任何模型，同样产出可点击动作。'],
  ];
  pts.forEach((p, i) => {
    const y = 2.3 + i * 1.18;
    card(s, x2, y, w2, 1.02);
    s.addText(p[0], { x: x2 + 0.22, y: y + 0.14, w: w2 - 0.44, h: 0.32, fontFace: F, fontSize: 12.5, bold: true, color: C.brand });
    txt(s, p[1], { x: x2 + 0.22, y: y + 0.46, w: w2 - 0.44, h: 0.52, fontSize: 10, lineSpacingMultiple: 1.2 });
  });
  foot(s, 10, TOTAL, false);
  s.addNotes('这页是全项目最有"融合感"的一页。可以说：融合不是把两个功能放进同一个页面，而是让它们互相引用。');
}

/* ============================ 11 视觉与桌宠 ============================ */
{
  const s = newSlide(C.bg);
  kicker(s, '界面与交互', false);
  head(s, '入场页一次登场，桌宠会挣扎', '零依赖纯 CSS/JS：所有动效只动 transform / opacity / filter', false);
  const lw = 6.15;
  card(s, M, 2.3, lw, 4.0);
  if (!pic(s, shot('ppt-test.jpg'), M + 0.1, 2.4, lw - 0.2, 3.8) &&
      !pic(s, shot('02-testing.png'), M + 0.1, 2.4, lw - 0.2, 3.8)) {
    txt(s, '（截图缺失：docs/screenshots/ppt-test.jpg）', { x: M + 0.3, y: 3.9, w: lw - 0.6, h: 0.4, fontSize: 11 });
  }
  const x2 = M + lw + 0.26, w2 = W - M - x2;
  const items = [
    ['入场页', '展台框画出 → 标题逐字升起 → 鲸鱼绕场 → 光束扎进按钮；退场是「镜头对焦」。内容早已渲染完，没有加载空窗。'],
    ['2.5D 桌宠', '透视倾斜 + 两层接地投影 + 受光膜；抓起来转轴从脚底挪到耳根，摆动由指针速度驱动的二阶系统积分。'],
    ['不打扰', '只在右侧安全区溜达，检测进行中不自己走动；落在正文区会自己走回右下角。'],
  ];
  items.forEach((p, i) => {
    const y = 2.3 + i * 1.14;
    card(s, x2, y, w2, 0.98);
    s.addText(p[0], { x: x2 + 0.22, y: y + 0.13, w: w2 - 0.44, h: 0.3, fontFace: F, fontSize: 12.5, bold: true, color: C.brand });
    txt(s, p[1], { x: x2 + 0.22, y: y + 0.44, w: w2 - 0.44, h: 0.5, fontSize: 10, lineSpacingMultiple: 1.2 });
  });
  foot(s, 11, TOTAL, false);
  s.addNotes('这页适合放演示视频的片段。讲的时候强调"零依赖"：全部纯 CSS/JS，没有引入任何动效库。');
}

/* ============================ 12 边界 ============================ */
{
  const s = newSlide(C.bg);
  kicker(s, '产品边界', false); head(s, '一条不让步的边界：掌握率 ≠ 词汇量', '自定义词书能测，但只报「对这本书的掌握率」', false);
  s.addShape(pptx.ShapeType.roundRect, { x: M, y: 2.4, w: CW, h: 1.35, rectRadius: 0.06, fill: { color: C.softAmber }, line: { color: 'F0D9A8' } });
  s.addText('「你在《雅思词汇》里认识 78%」—— 这是可测且诚实的。',
    { x: M + 0.3, y: 2.55, w: CW - 0.6, h: 0.4, fontFace: F, fontSize: 15, bold: true, color: C.warn });
  s.addText('「所以你的词汇量是 4,500」—— 这是不可推断的：词书是人挑出来的有偏样本。',
    { x: M + 0.3, y: 3.02, w: CW - 0.6, h: 0.4, fontFace: F, fontSize: 15, bold: true, color: C.bad });
  const two = [
    ['自定义词书怎么接', '导入 txt / csv / 粘贴 → 强制预览（命中率、新增词、频段分布）→ 保存并切换。命中内置词库复用释义/音标/频段；不在其中则补进词表、频段记为「20k 以外」（不在前 20k 词频表，是事实不是猜测）。'],
    ['为什么值得做', '每个人的考试目标不同。抽样、区间估计、词汇地图、跨轮差分全部复用，一行未改；代价是必须把口径写清楚——所以界面上常驻提示，不藏在文档里。'],
  ];
  const cw = (CW - 0.24) / 2;
  two.forEach((p, i) => {
    const x = M + i * (cw + 0.24);
    card(s, x, 3.95, cw, 2.0);
    s.addText(p[0], { x: x + 0.26, y: 4.1, w: cw - 0.52, h: 0.32, fontFace: F, fontSize: 13.5, bold: true, color: C.brand });
    txt(s, p[1], { x: x + 0.26, y: 4.5, w: cw - 0.52, h: 1.3, fontSize: 11, lineSpacingMultiple: 1.3 });
  });
  foot(s, 12, TOTAL, false);
  s.addNotes('主动交代边界能大幅加分：说明我们知道自己方法的适用条件。如果评委问"那这个功能有什么意义"，答：目标是"这本书我要不要背完"。');
}

/* ============================ 13 工程质量 ============================ */
{
  const s = newSlide(C.dk);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.dk2 }, transparency: 55 });
  kicker(s, '工程质量', true);
  head(s, '387 条断言，守着「看不见的正确性」', '抽样与区间估计这类东西没法靠肉眼验收，只能靠断言', true);
  const stats = [['387', '条自动化断言'], ['11', '个测试套件'], ['2.08 MB', '单文件产物'], ['0', '运行时依赖']];
  const sw = (CW - 0.3 * 3) / 4;
  stats.forEach((st, i) => stat(s, M + i * (sw + 0.3), 2.42, sw, 1.15, st[0], st[1], true, C.brandLight));
  const rows = [
    ['冒烟（jsdom）', '164', '抽样 / 估计 / 等级 / 多轮 / 地图 / 档案'],
    ['真实浏览器', '54', '布局不溢出、暗色、对比度、焦点、入口'],
    ['桌宠行为', '40', '拖动 / 悬空物理 / 气泡版式 / 活动范围 / 自愈'],
    ['入场页 + 离线 + 收件人', '43 + 7 + 18', '分层浮现、孤立单文件、断网 + 双视口'],
    ['AI 三档 + 双向联动 + 词书', '17 + 15 + 17', '额度规则、动作白名单、导入与持久化'],
  ];
  rows.forEach((r, i) => {
    const y = 3.9 + i * 0.5;
    s.addText(r[0], { x: M, y, w: 4.4, h: 0.32, fontFace: F, fontSize: 11.5, color: 'C9D4EA' });
    s.addText(r[1], { x: M + 4.5, y, w: 1.9, h: 0.32, fontFace: FM, fontSize: 11.5, bold: true, color: C.white });
    s.addText(r[2], { x: M + 6.6, y, w: CW - 6.6, h: 0.32, fontFace: F, fontSize: 10, color: '8B93A3' });
  });
  s.addText('提交纪律：build.js 产出不含任何 API Key 的仓库版；--with-key 只用于生成给评委的演示版；提交前必跑 check-no-key。',
    { x: M, y: 6.42, w: CW, h: 0.32, fontFace: F, fontSize: 10, color: '8B93A3' });
  foot(s, 13, TOTAL, true);
  s.addNotes('这页是可信度的落点。数字要背下来：387 条断言、11 个套件。如果评委问"你怎么保证统计是对的"，答：抽样和区间估计全部有断言，不是靠肉眼。');
}

/* ============================ 14 收尾 ============================ */
{
  const s = newSlide(C.dk);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.dk2 }, transparency: 40 });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 1.85, w: 0.66, h: 0.055, fill: { color: C.teal } });
  s.addText('测准只是起点。', { x: M, y: 2.1, w: 11.8, h: 0.9, fontFace: F, fontSize: 40, bold: true, color: C.white });
  s.addText('能看懂自己差在哪、下一步做什么，才算有用。', { x: M, y: 3.0, w: 11.8, h: 0.7, fontFace: F, fontSize: 22, color: 'C9D4EA' });
  ['387 条自动化断言 · 11 个套件',
    '单文件 2.08 MB · 断网可用 · 无账号 · 无广告',
    'AI 三档通路：自带 Key / 作者额度 / 本地方案',
  ].forEach((f, i) => {
    s.addText('· ' + f, { x: M, y: 4.1 + i * 0.42, w: 11.8, h: 0.34, fontFace: F, fontSize: 14, color: 'A8B6D0' });
  });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 5.62, w: 11.7, h: 0.015, fill: { color: '2A3346' } });
  txt(s, '项目仓库：github.com/whiteyuexi/cet4-vocab-check　｜　交付物：单文件 HTML + 技术文档 + 演示视频',
    { x: M, y: 5.82, w: 11.8, h: 0.4, fontSize: 11, color: '8B93A3' });
  s.addNotes('收尾 15 秒：回到一句话定位。然后留时间给提问——准备好三个必答题：为什么不做背单词、误差怎么保证、AI 到底做了什么。');
}

await pptx.writeFile({ fileName: OUT });
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log('已生成 PPTX:', OUT);
console.log('  页数:', TOTAL, '| 大小:', kb, 'KB | 布局: 16:9 (13.333 × 7.5 in)');
console.log('  每页均带演讲备注（可编辑）；文字/图形/表格全部为原生对象，可直接改。');
