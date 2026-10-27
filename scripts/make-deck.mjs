// scripts/make-deck.mjs — 唯一的一套演示稿生成器（路演稿 + 详细资料稿）
//
// 为什么重写：原来有三套（答辩 14 页 / 路演 13 页 / 详细版 33 页）。问题很具体：
//   · 路演稿讲得太少，一半的页没有配图；
//   · 详细版讲得全，但页序是按开发顺序堆的，读起来乱；
//   · 三套的文案各写一遍，还都带着"不是X，而是Y"这类腔调，像 AI 写的。
// 现在换成一份内容表 + 两种渲法：每页都带图（能配图就配），文案按"人说话"重写，
// 详细稿 = 路演稿 + 附录页，讲同一个故事的两个版本。
//
// 用法：
//   node scripts/make-deck.mjs roadshow [输出路径]     # 路演稿（19 页，8–10 分钟）
//   node scripts/make-deck.mjs detail   [输出路径]     # 详细资料稿（28 页，逐页可查）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const MODE = (process.argv[2] || 'roadshow').toLowerCase();
const OUT = process.argv[3] || path.join(os.homedir(), 'Desktop',
  MODE === 'detail' ? '四六级词汇量检测-详细版.pptx' : '四六级词汇量检测-路演.pptx');

const W = 13.333, H = 7.5, M = 0.85, CW = W - M * 2;
const F = '微软雅黑', FM = 'Consolas';
const C = {
  paper: 'FBFAF7', ink: '171712', ink2: '57524A', ink3: '8B8579',
  blue: '2A5BE0', blueSoft: 'EAF0FF', orange: 'E8532B', orangeSoft: 'FCEDE8',
  green: '1B7A57', greenSoft: 'E8F3EE', line: 'E3DED3', white: 'FFFFFF',
};

const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'DECK', width: W, height: H });
pptx.layout = 'DECK';
pptx.author = '四六级词汇量检测';
pptx.title = MODE === 'detail' ? '四六级词汇量检测 · 详细资料稿' : '四六级词汇量检测 · 路演稿';

let page = 0;
let CUR = null;          // 当前页，build() 用它统一挂演讲备注
const PAGES = [];

/* ---------------- 版式积木 ---------------- */
function base() {
  const s = pptx.addSlide();
  s.background = { color: C.paper };
  CUR = s;
  page++;
  return s;
}
function pic(s, name, x, y, w, h) {
  const f = path.join(SHOTS, name);
  if (!fs.existsSync(f)) {
    s.addText('（缺图：' + name + '）', { x, y, w, h, fontFace: F, fontSize: 10, color: C.ink3, align: 'center', valign: 'middle' });
    return false;
  }
  s.addImage({ path: f, x, y, w, h, sizing: { type: 'contain', x, y, w, h } });
  return true;
}
/* 截图大多是白底，底板必须比纸色深一点，不然白色截图和页面糊在一起、看不出边界 */
const PANEL = 'F1EDE4';
function card(s, x, y, w, h, fill) {
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: fill || PANEL }, line: { color: C.line, width: 1 },
  });
}
function head(s, kicker, title, lead) {
  s.addText(kicker, {
    x: M, y: 0.5, w: CW, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: C.blue, charSpacing: 1.2,
  });
  s.addText(title, {
    x: M, y: 0.82, w: CW, h: 0.78, fontFace: F, fontSize: 27, bold: true, color: C.ink,
    charSpacing: -0.4, lineSpacingMultiple: 1.06, valign: 'top',
  });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 1.66, w: 0.52, h: 0.05, fill: { color: C.orange } });
  if (lead) {
    s.addText(lead, { x: M, y: 1.82, w: CW, h: 0.42, fontFace: F, fontSize: 13, color: C.ink2 });
  }
  return lead ? 2.4 : 1.95;
}
function points(s, items, x, y, w, opt = {}) {
  const sz = opt.sz ?? 13, gap = opt.gap ?? 0.72;
  items.forEach((it, i) => {
    const yy = y + i * gap;
    s.addText('·', { x, y: yy - 0.02, w: 0.2, h: 0.3, fontFace: F, fontSize: sz + 2, bold: true, color: C.orange });
    if (typeof it === 'string') {
      s.addText(it, { x: x + 0.22, y: yy, w: w - 0.22, h: 0.34, fontFace: F, fontSize: sz, color: C.ink2, lineSpacingMultiple: 1.2 });
    } else {
      s.addText(it[0], { x: x + 0.22, y: yy - 0.02, w: w - 0.22, h: 0.32, fontFace: F, fontSize: sz, bold: true, color: C.ink });
      s.addText(it[1], { x: x + 0.22, y: yy + 0.29, w: w - 0.22, h: 0.38, fontFace: F, fontSize: sz - 1.5, color: C.ink2, lineSpacingMultiple: 1.18 });
    }
  });
}
function nums(s, items, y, opt = {}) {
  const cw = CW / items.length;
  items.forEach((it, i) => {
    const x = M + i * cw;
    s.addText(it[0], { x, y, w: cw - 0.2, h: 0.55, fontFace: FM, fontSize: opt.sz ?? 30, bold: true, color: opt.color || C.ink });
    s.addText(it[1], { x, y: y + 0.6, w: cw - 0.2, h: 0.34, fontFace: F, fontSize: 11.5, color: C.ink3, lineSpacingMultiple: 1.2 });
  });
}
function table(s, rows, x, y, w, opt = {}) {
  const cols = opt.cols || [3.4, w - 3.4];
  const rh = opt.rh ?? 0.46;
  rows.forEach((r, i) => {
    const yy = y + i * rh;
    if (i % 2 === 0) s.addShape(pptx.ShapeType.rect, { x, y: yy, w, h: rh, fill: { color: C.white } });
    s.addText(r[0], { x: x + 0.16, y: yy + 0.06, w: cols[0], h: rh - 0.1, fontFace: F, fontSize: 11.5, bold: true, color: C.ink, valign: 'middle' });
    s.addText(r[1], { x: x + cols[0] + 0.1, y: yy + 0.06, w: cols[1] - 0.26, h: rh - 0.1, fontFace: F, fontSize: 11.5, color: C.ink2, valign: 'middle', lineSpacingMultiple: 1.15 });
  });
}
function foot(s, note) {
  if (note) s.addText(note, { x: M, y: H - 0.62, w: CW, h: 0.3, fontFace: F, fontSize: 10, color: C.ink3, italic: true });
  s.addText(String(page), { x: W - 0.85, y: H - 0.5, w: 0.45, h: 0.24, fontFace: FM, fontSize: 9, color: C.ink3, align: 'right' });
}
// 右图版式：文字在左、图在右
function imgRight(s, img, imgRatio, items, opt = {}) {
  const top = opt.top ?? 2.28;
  const availH = H - top - 0.9;
  let iw = (availH * imgRatio);
  const iwMax = opt.iwMax ?? 6.3;
  if (iw > iwMax) iw = iwMax;
  const ih = iw / imgRatio;
  const ix = W - M - iw, iy = top + (availH - ih) / 2;
  card(s, ix - 0.14, iy - 0.14, iw + 0.28, ih + 0.28);
  pic(s, img, ix, iy, iw, ih);
  const tw = ix - M - 0.5;
  points(s, items, M, top + 0.1, tw, { sz: opt.sz ?? 13, gap: opt.gap ?? 0.8 });
  if (opt.note) foot(s, opt.note);
  else foot(s);
}
// 下图版式：图铺满整行、要点在下面两列
function imgWide(s, img, imgRatio, items, opt = {}) {
  const top = opt.top ?? 2.3;
  const ih = Math.min(CW / imgRatio, opt.maxH ?? 2.9);
  const iw = ih * imgRatio;                       // 底板贴着图片实际比例，别留一大片空
  const ix = M + (CW - iw) / 2;
  card(s, ix - 0.1, top, iw + 0.2, ih + 0.2);
  pic(s, img, ix, top + 0.1, iw, ih);
  const colW = (CW - 0.5) / 2;
  const half = Math.ceil(items.length / 2);
  const ty = top + ih + 0.5;
  points(s, items.slice(0, half), M, ty, colW, { sz: opt.sz ?? 12.5, gap: opt.gap ?? 0.72 });
  points(s, items.slice(half), M + colW + 0.5, ty, colW, { sz: opt.sz ?? 12.5, gap: opt.gap ?? 0.72 });
  foot(s, opt.note);
}
function page_(o) { PAGES.push(o); }

/* ============================================================
   内容表：一页一条。detail: true 的页只在详细资料稿里出现。
   文案一律按"人在讲"来写：短句、具体数字、不用排比和口号。
   ============================================================ */

page_({ kind: 'cover' });

page_({
  kind: 'imgRight', img: '01-home.png', ratio: 1.77,
  kicker: '做这个的原因', title: '我先给自己测了一次',
  lead: '我高考英语 30 分。想补，但得先知道自己现在到底有多少词量。',
  items: [
    ['搜到的测试只给一个数', '说「你的词汇量是 4000」，可这个数误差多大，没人讲'],
    ['知道了数字也没用', '我不知道是高频词没打牢，还是冷门词压根没见过'],
    ['下一步通常是买课', '我想要的是「先背哪 200 个词」这种能直接执行的东西'],
  ],
  note: '所以这个工具只做两件事：把数字测准，然后告诉你背哪些词。背单词的事交给你习惯用的 App。',
  notes: '开场先讲这句：我高考英语 30 分。然后说三件事：只给数字没用、不知道差在哪、下一步通常是买课。这一页的目的是让评委觉得这人是为自己做的。',
});

page_({
  kind: 'imgWide', img: 'ppt-home.jpg', ratio: 2.61, maxH: 2.5,
  kicker: '测出来的结果', title: '一个数，旁边跟着它的误差',
  items: [
    ['4,449 词，95% 区间 3,668–4,540', '区间不是保证，意思是重复抽样时约 95% 会盖住真值'],
    ['两套口径都写出来', '严格口径只算「认识」3,956 词；折中口径「模糊」算一半 4,449 词'],
    ['题量由你定', '想要窄区间就多答几题，想快就接受更宽的区间'],
    ['四个状态加起来是整库', '认识 425、模糊 106、不认识 89、没测 3,920'],
  ],
  note: '首页上永远同时有数字和区间，不会只甩一个数给你。',
  notes: '把区间念出来，再解释一句：区间不是保证，是重复抽样时大约 95% 会盖住真值。然后点一下两套口径。',
});

page_({
  kind: 'text', kicker: '怎么抽题', title: '按词频分七段抽，不是闭眼随机',
  lead: '随机抽 100 个词，误差主要来自「这次抽到几个冷门词」。先分层，再抽。',
  layout: 'nums-text',
  nums: [['7', '按词频把 4,540 词分成七段，每段等比例抽'], ['±62', '同样 100 题，分层抽样 vs 简单随机 ±91'], ['0.7', '分层后区间宽度的经验折扣（抽样省题约三成）']],
  items: [
    ['顺序是稳定的', 'FNV-1a 哈希定序：看着乱，但每次打开、每台机器都一样'],
    ['抽的时候交错着来', '前 60 题就跨到 5 个以上频段，不会连着考一串冷门词'],
    ['自动停', '每次作答后重算区间宽度，达到你选的目标精度就提示可以收工'],
  ],
  notes: '这页不用讲深。只说三个决定：分层、顺序稳定、交错抽。最后给 ±62 对 ±91 这个对比，说明分层真的省题。',
});

page_({
  kind: 'text', kicker: '误差怎么算', title: '三层修正，算法都写在界面里',
  lead: '这几个修正不是装饰，是为了在极端情况下也不给假精度。',
  layout: 'table',
  rows: [
    ['区间估计', 'Agresti-Coull：抽到全对或全错时，区间不会塌成一个 0 宽的点'],
    ['有限总体修正', '不放回抽样，乘以 (N−n)/(N−1)，题量越接近整库，区间越窄'],
    ['蒙对校正', '四选一有 25% 蒙对，按 (p − 1/k)/(1 − 1/k) 扣掉，再估掌握率'],
    ['方差下限', 'p(1−p) 加 1e-6 下限，避免 0 方差算出「误差为零」的假结论'],
  ],
  note: '抽样和估计这部分有 60 多条断言守着，改一个参数就会挂。',
  notes: '挑两个讲就够：有限总体修正、蒙对校正。蒙对那条最好讲——四选一有 25% 蒙对，不扣就会系统性偏高。',
});

page_({
  kind: 'imgRight', img: 'ppt-bands.jpg', ratio: 2.01,
  kicker: '诊断', title: '七段分开看，才知道洞在哪一段',
  lead: '总掌握率会把高频词和冷门词平均掉，所以拆到频段。',
  items: [
    ['每段都有三个数', '掌握率、这一段总共多少词、这次抽到多少词'],
    ['先补哪段是算出来的', '排序用「缺口词数 × 词频权重」，权重从 1 递减到 0.02'],
    ['举个真实例子', '3k-5k 段缺 737 词，排在 10k-20k 段缺 897 词前面'],
    ['缺口和没测过分开', '缺口是测过还不会；没测过是压根不知道，不算结论'],
  ],
  notes: '重点讲排序规则：缺口大的不等于先补。3k-5k 缺 737 词要排在 10k-20k 缺 897 词前面，这句评委容易记住。',
});

page_({
  kind: 'imgRight', img: 'ppt-map.jpg', ratio: 2.19,
  kicker: '看得见的地图', title: '182 个格子，点一下就复测这一块',
  lead: '七段词频 × 26 个首字母，每格是这个交叉点上的掌握情况。',
  items: [
    ['颜色看掌握率', '绿 ≥ 80%，黄 50–80%，红 < 50%'],
    ['浓淡看测过多少', '没测过几乎是空的，测满才是实色'],
    ['点格子直接开测', '把这一格没掌握的词组成一轮复测'],
    ['Shift + 点去问 AI', '问题里会带上这一格的真实数字，不用你自己复述'],
  ],
  notes: '现场点一个格子更有效。点完说：它直接开一轮复测，图不是装饰。',
});

page_({
  kind: 'imgWide', img: 'ppt-ladder.jpg', ratio: 2.22, maxH: 2.35,
  kicker: '等级', title: '六档等级，外加一条封顶规则',
  items: [
    ['S/A/B+/B/C/D 按掌握率分档', '92 / 85 / 75 / 65 / 50 五条线，字母保留是为了印章和文档对照'],
    ['同一比例在四级和六级不是一个词数', '四级 85% 是 3,859 词，六级 85% 是 4,859 词，各算各的'],
    ['最高频段太差就封顶', '最高频 1k 段低于 60% 时，等级封到 C，总分再高也不给 A'],
    ['为什么要封顶', '高频段空一片，读真题每题都卡，这种结构不该评成优秀'],
  ],
  note: '封顶规则是刻意加的：宁可把等级压低，也不给漂亮但会误导人的结论。',
  notes: '落点是封顶规则：宁可把等级压到 C，也不给"高频段空一片却评优秀"的结论。',
});

page_({
  kind: 'imgRight', img: 'ppt-next.jpg', ratio: 2.25,
  kicker: '下一步', title: '给的不是建议，是能执行的清单',
  lead: '报告页把「差多少、先补哪、几天能补完」写成一句话。',
  items: [
    ['优先级有公式', '缺口词数 × 词频权重，权重写在代码里也写在文档里'],
    ['按你的时间折算天数', '每天能投入多少分钟，除以 1.5 得到每天背多少词'],
    ['可以复测验证', '同一段隔一段时间再测，看掌握率有没有真的动'],
    ['能带走', '报告文本复制、未掌握词表导出 CSV、打印成 PDF'],
  ],
  notes: '指着截图念一行：最高频 1k 段还差 6 词、掌握率 99%、每天 20 词约需 1 天。这就是能执行的清单的样子。',
});

page_({
  kind: 'text', kicker: '复测', title: '两轮之间，每个词会落到三种状态之一',
  lead: '单轮只能告诉你现在是多少。有了两轮完整实测，才知道哪些是真学会了。',
  layout: 'three',
  cols: [
    ['新学会', '上轮不认识，这轮认识', '说明这段时间补的对'],
    ['背了又忘', '上轮认识，这轮不认识', '复习优先级最高，换方法'],
    ['掉档', '上轮模糊，这轮完全不认识', '通常是被近似词干扰'],
  ],
  items: [['每轮存一张状态位图', '每词 2 bit，7,175 词约 1.8 KB，localStorage 存 12 轮没问题']],
  notes: '讲背了又忘这一类。它是最有价值的输出，因为单轮永远算不出来。',
});

page_({
  kind: 'imgWide', img: 'ppt-revisit.png', ratio: 3.84, maxH: 2.45,
  kicker: '隔几天再打开', title: '首页会接着说上次的结论',
  items: [
    ['满 3 天才出现', '测完立刻再打开不会打扰你；有没测完的检测时，它让位给「继续检测」'],
    ['说三件事', '最该先补哪一段、按你的时间要几天、这次涨跌有没有超出抽样误差'],
    ['可以永久关掉', '点「×」只关本次；点「以后不再提醒」永久关闭，设置里能重开'],
    ['不花钱也不联网', '三行结论全部是本机算的，不调大模型，不消耗额度'],
  ],
  note: '它是一张卡片，不是弹窗：不挡内容，也不催你打卡。',
  notes: '用设置页的「预览这张卡」现场展示。强调三点：不弹窗、可永久关闭、全部本地算不花额度。',
});

page_({
  kind: 'imgWide', img: 'ppt-daily.jpg', ratio: 6.6, maxH: 1.75,
  kicker: '一个小设置', title: '「每日可投入时间」改的是四处文案',
  lead: '这一栏只干一件事：把你的时间换算成每天背多少词。',
  items: [
    ['换算只有一处代码', '每天词数 = 分钟 ÷ 1.5，夹在 5–200；15/30/60 是快捷方式，也能自己填'],
    ['四个地方跟着变', '报告页顶部、报告页分段建议、AI 计划、回访卡'],
    ['它不影响出题', '题量由你选的目标精度决定，和每天有多少时间无关'],
    ['曾经有两处写死 50 词', '设置改了却不生效，现在统一走一个函数，并加了断言'],
  ],
  notes: '一句话带过：分钟除以 1.5 就是每天背多少词，报告、AI 计划、回访卡都用这一个数。可以提一句曾经写死 50 词的坑。',
});

page_({
  kind: 'imgRight', img: 'ppt-ai.jpg', ratio: 1.21,
  kicker: 'AI · 三档', title: 'AI 有三档，面板上写明你现在用哪一档',
  lead: '大模型要花钱，所以三条路都摆出来，缺一条也能用。',
  items: [
    ['自带 Key', '走你自己账号的额度，不限次数；Key 只存本机，导出备份时会被剔除'],
    ['作者额度', '完成一次有效检测换一次深度诊断，在设置页能看到剩下几次'],
    ['本地方案', '不联网、不花钱、不限次；按你的真实数据给确定性结论'],
    ['额度用完自动降级', '不会弹错误框，直接回落到本地方案并在回答里说明'],
  ],
  notes: '按顺序讲三档，最后补降级：额度用完自动回落到本地方案，不弹错误框。',
});

page_({
  kind: 'imgRight', img: '05-ai-diagnose.png', ratio: 1.77,
  kicker: 'AI · 怎么用', title: '模型不算数，数字都从工具里取',
  lead: '8 个工具读本机已经算好的数，模型负责解释和排计划。',
  items: [
    ['先查再答', '回答上方标出这次调了哪几个工具、拿到了什么'],
    ['数据不够就直说', '样本太少时它会拒绝下结论，不编一个看起来合理的数'],
    ['建议能点', '给的动作是按钮：复测这一段、开始一轮摸底、看频段剖面'],
    ['图表能反向问', '点频段条或地图格子上的「问」，问题里自动带上那一块的数字'],
  ],
  note: '单文件形态下没有后端，这一档会走本地规则；接下后端就是带工具调用的 Agent。',
  notes: '指一下回答上方的工具标签：这次读了整体情况、读了频段数据。然后说模型不许自己算数。',
});

page_({
  kind: 'text', kicker: '自定义词书', title: '换成你手上的词书，检测引擎一行没改',
  lead: '考研、雅思、专业课词汇都能导入，但要先说清它能说明什么。',
  layout: 'table',
  rows: [
    ['导入', 'txt / csv / 直接粘贴，一行一个词，可选「词,释义」；自动去重、跳表头，上限 2 万词'],
    ['先给预览', '总词数、命中内置词库多少、新增多少、有释义的比例、频段分布'],
    ['复用同一套引擎', '分层抽样、区间估计、词汇地图、跨轮对比全部照旧'],
    ['但只报「对这本书的掌握率」', '自定义词书是有偏样本，不能换算成词汇量，界面上常驻提示'],
  ],
  note: '这条边界写在界面里，不藏在文档里：能测，但不下结论。',
  notes: '这页讲边界：能测，但只报"对这本书的掌握率"。评委常追问这个，主动说出来比被问出来好。',
});

page_({
  kind: 'imgRight', img: 'ppt-dark.jpg', ratio: 2.76,
  kicker: '交付形态', title: '一个 HTML 文件，双击就能用',
  lead: '2.11 MB，词库、例句、立绘、样式、脚本全部在里面。',
  items: [
    ['0 个运行时依赖', '不装环境、不起服务、不需要同目录的素材文件夹'],
    ['断网能用', '屏蔽全部网络后跑 20 项断言：答题、进度、档案、手机布局都正常'],
    ['数据只在本机', '作答存在 localStorage，按使用者分开；导出 JSON 就能带走'],
    ['手机上也能用', '390px 宽度实测无横向溢出，顶栏保持单行，主按钮在屏内'],
  ],
  notes: '念四个数：2.11 MB、7,175 词、9,204 例句、0 依赖，然后说断网也能测。',
});

page_({
  kind: 'imgRight', img: 'ppt-pet.jpg', ratio: 0.56, iwMax: 2.6,
  kicker: '一点趣味', title: '右下角那只鲸鱼，是为了让过程不那么枯燥',
  lead: '测词汇量这件事本身很枯燥，加个会动的东西，人愿意多答几题。',
  items: [
    ['10 张立绘全部内联', '349 KB，断网也有表情；缺图时退化成纯气泡提示'],
    ['可拖动、有重力', '抓起来会挣扎、被甩着晃，松手落地抖两下灰'],
    ['只在右侧安全区活动', '不横穿正文；窄屏自动收起，不挡内容'],
    ['纯 CSS/JS', '只动 transform、opacity、filter，不掉帧'],
  ],
  notes: '这页可以轻松点。抓一下桌宠现场演示，1 秒就够。',
});

page_({
  kind: 'text', kicker: '工程质量', title: '413 条断言，和五个真出过的 bug',
  lead: '抽样和区间估计没法靠肉眼验收，只能写成断言。',
  layout: 'nums-bug',
  nums: [['413', '离线断言，10 个套件；另有 7 条联网断言'], ['11', '测试套件，浏览器那套自动跑分'], ['0', '运行时依赖']],
  rows: [
    ['入场页例句数显示 10,276', '把例句数组当对象数了两遍，改成构建期算好注入'],
    ['报告页「每天 50 词」写死', '设置页改了不生效，改成统一函数并加断言'],
    ['浏览器断言页一条都没跑', '文件里一处语法错误，脚本只打印 ok；补了自动跑分器'],
    ['手机顶栏被品牌名挤成一列竖字', '7 个字的品牌名在 390px 下断行，窄屏改成图标让位'],
    ['游离文本让页面多出一行乱码', 'favicon 的 data URI 被正则截断，加了兜底清理'],
  ],
  notes: '不用逐条念。挑两条：报告页写死 50 词、浏览器断言页一条都没跑。说完补一句这两条现在都有断言守着。',
});

page_({ kind: 'closing' });

/* ---------------- 详细资料稿才有的附录页 ---------------- */
page_({
  detail: true, kind: 'text', kicker: '附录 · 参数', title: '七个频段的规模与权重',
  lead: '这些数字在代码、文档、界面三处一致，改一处就会被断言发现。',
  layout: 'table',
  rows: [
    ['最高频 1k', '四级 738 词 / 六级 738 词，权重 1'],
    ['1k-2k', '610 / 610，权重 0.33'],
    ['2k-3k', '478 / 478，权重 0.20'],
    ['3k-5k', '874 / 1,556，权重 0.125'],
    ['5k-10k', '1,556 / 1,556，权重 0.067'],
    ['10k-20k', '1,598 / 1,598，权重 0.033'],
    ['20k 以外', '1,321 / 1,321，权重 0.02'],
  ],
  note: '四级 4,540 词、六级 5,716 词；含派生词时六级全景 7,175 词。',
});

page_({
  detail: true, kind: 'text', kicker: '附录 · 实现', title: 'estimate() 里那几个容易写错的地方',
  layout: 'code3',
  rows: [
    ['有限总体修正', 'half = z × sqrt(p(1−p)/n) × sqrt((N−n)/(N−1))'],
    ['方差下限', 'v = max(p(1−p), 1e-6)，防止全对/全错时区间宽度变 0'],
    ['区间端点', 'Agresti-Coull 用 (k+z²/2)/(n+z²) 再取 z 区间，n 小于 20 时更稳'],
    ['蒙对校正只在四选一', '样本带 mode 字段，自评模式不扣；两种模式不会混算'],
  ],
});

page_({
  detail: true, kind: 'text', kicker: '附录 · 实现', title: '自适应停测：什么时候提示可以收工',
  layout: 'table',
  rows: [
    ['判定', '每次作答后重算当前区间的半宽，小于等于目标精度就提示'],
    ['最小题量', '低于 20 题不判停，样本太小时区间宽度没有参考价值'],
    ['复习效应提示', '本次抽样里此前测过的词超过 20% 时，结果旁边会标注可能偏高'],
    ['普查口径', '覆盖率到 95% 直接转逐词统计，不再做抽样估计'],
  ],
});

page_({
  detail: true, kind: 'text', kicker: '附录 · 实现', title: '状态位图与词表指纹',
  layout: 'table',
  rows: [
    ['位图', '每词 2 bit（未测 / 不认识 / 模糊 / 认识），7,175 词约 1.8 KB 一轮'],
    ['存什么', '每轮存聚合快照 + 位图，最多留 12 轮'],
    ['指纹', '词表的 FNV-1a 指纹，词表变了就只做聚合对比，不硬算逐词差异'],
    ['为什么', '不做指纹会出现「拿两套词库硬比」的错误结论'],
  ],
});

page_({
  detail: true, kind: 'text', kicker: '附录 · AI', title: 'Agent 循环与 SSE 事件',
  layout: 'table',
  rows: [
    ['循环', '最多 3 轮工具调用；每轮把工具结果回灌给模型，再决定下一步'],
    ['流式', 'SSE 事件：mode / tool / delta / actions / done / error'],
    ['工具白名单', '8 个只读工具 + 1 个动作工具；动作只允许 go / start / review / ask'],
    ['防注入', '模型输出的参数当不可信输入：路由白名单、目标值夹取、文字截断到 120 字'],
  ],
});

page_({
  detail: true, kind: 'text', kicker: '附录 · 隐私', title: '上行什么，不上行什么',
  layout: 'table',
  rows: [
    ['上行', '覆盖率、各频段掌握率、未掌握词清单、区间与口径这类汇总数据'],
    ['不上行', '逐题作答记录、导出的备份文件、你自己的 API Key'],
    ['存哪', 'localStorage，按使用者档案分开；键名带版本，升级不炸旧数据'],
    ['怎么带走', '导出 JSON / CSV / 报告文本 / 打印 PDF，四路都能把数据取出来'],
  ],
});

page_({
  detail: true, kind: 'text', kicker: '附录 · 无障碍', title: '对比度、焦点、减少动效',
  layout: 'table',
  rows: [
    ['对比度', '辅助文字 4.83:1、开关轨道 5.72:1，都是浏览器里真实算出来的'],
    ['焦点', '入场页打开聚焦「进入」，进入后交还主内容区；切页后同样'],
    ['模态', '打开时给底层加 inert，键盘和读屏都进不去不可见的内容'],
    ['减少动效', 'prefers-reduced-motion 下关掉动画，但入场页仍然存在、仍要点击'],
  ],
});

/* ============================================================
   渲染
   ============================================================ */
const LIST = PAGES.filter(p => MODE === 'detail' || !p.detail);
const TOTAL = LIST.length;

function renderCover(p) {
  const s = base();
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.ink } });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 2.35, w: 0.6, h: 0.06, fill: { color: C.orange } });
  s.addText('筑视界 · 码绘交互 ／ Web 前端开发创意技能大赛', {
    x: M, y: 2.52, w: 10, h: 0.32, fontFace: F, fontSize: 11.5, bold: true, color: 'FF8A6A',
  });
  s.addText('四六级词汇量检测', { x: M, y: 2.95, w: CW, h: 1.0, fontFace: F, fontSize: 52, bold: true, color: C.white });
  s.addText('测准一个数，再告诉你背哪些词', { x: M, y: 4.0, w: CW, h: 0.5, fontFace: F, fontSize: 19, color: 'D6D2C6' });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 4.85, w: CW, h: 0.012, fill: { color: '3A362C' } });
  nums(s, [['7,175', '词条，全部带音标'], ['9,204', '英中对照例句'], ['413', '条离线断言'], ['2.11 MB', '单文件，断网可用']], 5.1, { sz: 26, color: C.white });
  s.addText('广东亚视演艺职业学院 · 信息工程学院　｜　单人作品　｜　github.com/whiteyuexi/cet4-vocab-check', {
    x: M, y: 6.55, w: CW, h: 0.32, fontFace: F, fontSize: 10.5, color: '8E887C',
  });
  s.addNotes(MODE === 'detail'
    ? '这是详细资料稿，28 页，按"问题 → 怎么测 → 怎么诊断 → 怎么规划 → 怎么验证 → 工程质量"的顺序排。'
    : '开场 20 秒：我是谁，为什么做这个。不要念标题，直接说"我高考英语 30 分"这句。');
}

function renderClosing(p) {
  const s = base();
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.ink } });
  s.addText('怎么拿到，怎么用', { x: M, y: 1.9, w: CW, h: 0.8, fontFace: F, fontSize: 34, bold: true, color: C.white });
  const rows = [
    ['仓库', 'github.com/whiteyuexi/cet4-vocab-check　源码、构建脚本、测试、文档都在里面'],
    ['直接体验', '双击单个 HTML 文件即可；不需要安装任何东西，断网也能测'],
    ['交付物', '单文件 HTML（仓库版 / 评委版）· 技术文档 PDF · 演示稿 · 产品介绍'],
    ['数据归属', '作答只存在你自己的浏览器里，导出 JSON 就能带走'],
  ];
  rows.forEach((r, i) => {
    const y = 2.95 + i * 0.85;
    s.addText(r[0], { x: M, y, w: 1.9, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: 'FF8A6A' });
    s.addText(r[1], { x: M + 2.0, y, w: CW - 2.0, h: 0.5, fontFace: F, fontSize: 13, color: 'D6D2C6', lineSpacingMultiple: 1.2 });
  });
  s.addText('测准只是起点。知道自己差在哪、下一步做什么，才是这个工具想给的东西。', {
    x: M, y: 6.2, w: CW, h: 0.4, fontFace: F, fontSize: 13, color: C.white, bold: true,
  });
  s.addNotes('收尾 20 秒：告诉大家怎么拿到，然后停在这句话上。不要再加新的信息。');
}

function renderText(p) {
  const s = base();
  const top = head(s, p.kicker, p.title, p.lead);
  if (p.layout === 'nums-text') {
    nums(s, p.nums, top + 0.05, { sz: 30 });
    points(s, p.items, M, top + 1.45, CW, { sz: 12.5, gap: 0.72 });
  } else if (p.layout === 'table') {
    /* 表格页最容易"上半屏满、下半屏空"。按表格实际高度在可用区里居中，视觉上才像一页。 */
    const rh = 0.66, th = p.rows.length * rh;
    const y = top + Math.max(0.05, (H - 1.05 - top - th) / 2);
    table(s, p.rows, M, y, CW, { cols: [3.5, CW - 3.5], rh });
  } else if (p.layout === 'three') {
    const cw = (CW - 0.8) / 3;
    p.cols.forEach((c, i) => {
      const x = M + i * (cw + 0.4);
      card(s, x, top + 0.05, cw, 1.95);
      s.addText(c[0], { x: x + 0.24, y: top + 0.22, w: cw - 0.48, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: C.orange });
      s.addText(c[1], { x: x + 0.24, y: top + 0.68, w: cw - 0.48, h: 0.45, fontFace: F, fontSize: 11.5, color: C.ink2 });
      s.addText(c[2], { x: x + 0.24, y: top + 1.2, w: cw - 0.48, h: 0.55, fontFace: F, fontSize: 10.5, color: C.ink3, italic: true });
    });
    points(s, p.items, M, top + 2.3, CW, { sz: 12.5, gap: 0.7 });
  } else if (p.layout === 'nums-bug') {
    nums(s, p.nums, top + 0.02, { sz: 28 });
    const rh = 0.62, th = p.rows.length * rh;
    const y = top + 1.35 + Math.max(0, (H - 0.95 - (top + 1.35) - th) / 2);
    table(s, p.rows, M, y, CW, { cols: [3.9, CW - 3.9], rh });
  } else if (p.layout === 'code3') {
    const rh = 0.92, th = p.rows.length * rh;
    const y = top + Math.max(0.05, (H - 1.05 - top - th) / 2);
    table(s, p.rows, M, y, CW, { cols: [3.1, CW - 3.1], rh });
  }
  foot(s, p.note);
}

function build() {
  LIST.forEach(p => {
    CUR = null;
    if (p.kind === 'cover') renderCover(p);
    else if (p.kind === 'closing') renderClosing(p);
    else if (p.kind === 'text') renderText(p);
    else if (p.kind === 'imgRight') {
      const s = base();
      const top = head(s, p.kicker, p.title, p.lead);
      imgRight(s, p.img, p.ratio, p.items, { top, iwMax: p.iwMax, note: p.note });
    } else if (p.kind === 'imgWide') {
      const s = base();
      const top = head(s, p.kicker, p.title, p.lead);
      imgWide(s, p.img, p.ratio, p.items, { top, maxH: p.maxH, note: p.note });
    }
    if (p.notes && CUR) CUR.addNotes(p.notes);
  });
}

build();
const missing = fs.existsSync(SHOTS) ? 0 : 1;
if (missing) console.warn('⚠ 找不到 docs/screenshots');
await pptx.writeFile({ fileName: OUT });
console.log((MODE === 'detail' ? '详细资料稿' : '路演稿') + '已生成: ' + OUT);
console.log('  页数: ' + TOTAL + ' | 大小: ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB | 16:9');
console.log('  配图页: ' + LIST.filter(p => p.img).length + ' / ' + TOTAL);
