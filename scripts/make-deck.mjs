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

/* ---------- 01 定位：这是什么 ---------- */
page_({
  kind: 'text', kicker: '定位', title: '这是一台测量仪，不是背单词软件',
  lead: '你先花 3 分钟测出自己有多少词量、差在哪一段，再决定背什么。背单词还是用你顺手的那款。',
  layout: 'nums-text',
  nums: [['3 分钟', '快速摸底：随机抽 100 词，得到带误差的数字'], ['7 段', '按词频拆开看，洞在哪一段一眼可见'], ['0 账号', '不用注册、不上传作答、断网也能测']],
  items: [
    ['给谁用', '备考四六级的学生，尤其是不清楚自己水平、也不知道下一步该干什么的人'],
    ['不给谁用', '想找背单词计划表的人。这个工具只负责"测准"和"告诉你背哪些"，不负责催你打卡'],
    ['和课程的区别', '它不卖课、不导流、不弹广告；结果可以导出带走，也可以隔一段时间回来复测'],
  ],
  note: '一句话版本：先量，再开方；药你自己买。',
  notes: '开场 20 秒把定位钉死：测量工具，不是背单词软件。说完这句就进下一页面，别解释太久。',
});

/* ---------- 02 三个亮点 ---------- */
page_({
  kind: 'text', kicker: '亮点', title: '如果只记三件事，记这三件',
  lead: '这三条是这个网页和市面上同类工具最大的不同，后面每一页都在给它们做证据。',
  layout: 'claims',
  cols: [
    ['亮点 1', '结果不是一个数字，是"数字 + 误差 + 两套口径"', '别人固定 20 题给一个数；我们题量由你定，区间宽度跟着题量收窄，抽到全对或全错也不给假精度。'],
    ['亮点 2', '结论能执行到"先补这 200 个词，每天 20 个，18 天"', '别人给完数字就卖课；我们给出频段优先级、具体词单、按你的时间折算天数，还能隔一段回来复测验证。'],
    ['亮点 3', '没有后端、没有网络、没有账号也能用；有 AI 时 AI 也不编数字', '单文件 2.11 MB，断网跑通 20 项断言；AI 只负责翻译数据，所有数字来自 8 个工具。'],
  ],
  note: '这三条也会出现在后面的每一页左上角，方便评委对齐。',
  notes: '这一页是全场最重要的 60 秒。三条各说一句，不要展开——展开在后面的页里。',
});

/* ---------- 03 用户的第 2 页（手改保留） ---------- */
page_({
  kind: 'imgRight', img: '01-home.png', ratio: 1.77,
  kicker: '怎么来的', title: '先给自己测一次',
  lead: '小明同学高考英语 30 分。想补，但得先知道自己现在到底有多少词量。',
  items: [
    ['搜到的测试只给一个数', '说「你的词汇量是 4000」，可这个数误差多大，没人讲'],
    ['知道了数字也没用', '我不知道是高频词没打牢，还是冷门词压根没见过'],
    ['下一步通常是买课', '我想要的是「先背哪 200 个词」这种能直接执行的东西'],
    ['规划焦虑', '很多人都会对自己接下来要做什么产生焦虑，陷入各种陷阱'],
  ],
  note: '所以这个工具只做两件事：把数字测准，然后告诉你背哪些词。背单词的事交给你习惯用的 App。',
  notes: '开场先讲这句：我高考英语 30 分。然后说三件事：只给数字没用、不知道差在哪、下一步通常是买课。最后那条规划焦虑是自己的体会：不知道下一步做什么，比数字低更让人难受。',
});

/* ---------- 04 用户与美观 ---------- */
page_({
  kind: 'imgRight', img: 'ppt-intro.jpg', ratio: 1.18, iwMax: 5.4,
  kicker: '给谁看，为什么长这样', title: '用的人多是年轻人，所以界面得先让人愿意打开',
  lead: '入场是一次登场：细线展台框画出来、标题逐字升起、鲸鱼扎进「进入」按钮，然后整屏对焦退场。',
  items: [
    ['受众', '备考四六级的学生，大多 18–22 岁，对界面粗糙的工具没有耐心'],
    ['玻璃质感 + 低饱和', '浅色纸感底 + 半透明卡片，长时间看不累；深色模式一键切换'],
    ['标识「30」', '数字 30 是我高考英语成绩，0 做成仪表盘——既是起点，也说明这是个测量工具'],
    ['桌宠', '右下角一只会看人、会挣扎的鲸鱼，让重复答题没那么枯燥'],
  ],
  note: '设计不是加分项：界面难看的工具，学生用两次就不打开了。',
  notes: '这页讲审美与受众。可以强调标识里的 30 是自己的起点分，评委容易记住。',
});

/* ---------- 05 与同行对比 ---------- */
page_({
  kind: 'text', kicker: '和同类产品比', title: '差别就这五行，每一行都能现场验',
  layout: 'table',
  rows: [
    ['输出', '别人：一个数字。我们：数字 + 95% 区间 + 严格/折中两套口径，误差永远写在数字旁边'],
    ['题量', '别人：固定 20 题。我们：你定目标精度（±400 / ±250 / ±150），达标自动停，区间宽度自己收窄'],
    ['诊断', '别人：一句"词汇量偏低"。我们：七段词频各给掌握率，并按「缺口 × 词频权重」排出先补哪段'],
    ['下一步', '别人：卖课或推打卡。我们：具体词单 + 每天几个词 + 几天补完，可直接开始复测'],
    ['形态', '别人：要注册、要联网、数据在服务器。我们：单个 HTML 文件，断网可用，作答只存本机'],
  ],
  note: '这五条不是宣传语，都是可以当场点开验证的：断网、看区间、看清单、导出 JSON。',
  notes: '评委爱看对比表。逐行说"别人怎样、我们怎样"，最后一句强调"每条都能现场验"。',
});

/* ---------- 06 功能全景 ---------- */
page_({
  kind: 'text', kicker: '功能全景', title: '七个页面，各干一件明确的事',
  layout: 'table',
  rows: [
    ['首页', '我现在多少词、下一步做什么：大数字 + 区间 + 四态 + 三种检测入口 + 回访卡'],
    ['检测', '三种测法：快速摸底（约 80 题）、高精度（约 210 题）、完整检测（整库 4,540 词）'],
    ['答题页', '自评三档或四选一；作答后展开释义、短语、英中例句；支持撤销与随时中断'],
    ['分组', '把整库切成 100 词一组，逐组推进并显示进度，适合每天一小段'],
    ['总览', '掌握情况 + 七段剖面 + 182 格词汇地图 + 检测记录，点任意格子直接复测'],
    ['报告', '等级评价 → 分析 → 补词方案，方案可导出 CSV / 复制文本 / 打印 PDF'],
    ['设置', '答题设置、外观、数据管理、使用说明、每日可投入时间、AI 与额度'],
  ],
  note: '另有词书页：主打四六级大纲，也能导入自己的词书（txt / csv / 粘贴）。',
  notes: '这页是路线图，快速带过七个页面，让评委知道东西是完整的，再挑重点深讲。',
});

/* ---------- 07 首页 ---------- */
page_({
  kind: 'imgWide', img: 'ppt-home.jpg', ratio: 2.61, maxH: 2.5,
  kicker: '亮点 1 · 首页', title: '打开就是一句话：你现在 4,449 词，误差 ±436',
  items: [
    ['大数字 + 区间', '4,449 词，95% 区间 3,668–4,540；区间不是保证，是重复抽样时约 95% 会盖住真值'],
    ['两套口径并列', '严格口径只算「认识」3,956 词；折中口径「模糊」算一半 4,449 词'],
    ['四态一眼看完', '认识 425、模糊 106、不认识 89、没测 3,920，加起来就是整库'],
    ['下一步就在下面', '三种检测入口按耗时标好题量，另一轮检测按钮与 AI 诊断按钮都在第一屏'],
  ],
  note: '首页不解释原理，只回答"我现在什么水平、我该点哪个"。',
  notes: '指着截图说：数字旁边永远有区间，下面永远有下一步。不要说统计细节，那在后面的页。',
});

/* ---------- 08 检测与题量 ---------- */
page_({
  kind: 'text', kicker: '亮点 1 · 检测', title: '题量不由我们规定，由你要的精度决定',
  lead: '你要 ±150 就多答几题，要快就接受 ±400；中途停掉，记录保留，下次接着测。',
  layout: 'table',
  rows: [
    ['快速摸底', '随机抽 100 词分层抽样，约 80–130 题（3–5 分钟），拿到带区间的估算'],
    ['高精度', '同一套算法，目标误差 ±250 或 ±150，约 210–340 题；每次作答后重算区间，达标自动停'],
    ['完整检测', '把 4,540 词整库过一遍，覆盖率 ≥95% 后切换成逐词统计，不再做抽样估计'],
    ['分组', '每 100 词一组，随时中断随时继续；分组数据只报进度，不外推成词汇量'],
  ],
  note: '同一个词两次都可能抽到，所以样本里会标出"此前测过的词占比"，超过 20% 会提示结果可能偏高。',
  notes: '这页讲四种测法的区别。重点一句：题量是结果，不是设定——你选精度，系统决定需要多少题。',
});

/* ---------- 09 答题页 ---------- */
page_({
  kind: 'imgRight', img: 'ppt-test.jpg', ratio: 1.05, iwMax: 5.2,
  kicker: '亮点 1 · 答题', title: '两种作答方式，四选一会扣掉蒙对的分',
  lead: '自评三档最快；四选一更接近真实记忆，但必须校正蒙对，否则掌握率一定偏高。',
  items: [
    ['自评三档', '认识 / 模糊 / 不认识，键盘 1 2 3 直接选，答完自动下一题'],
    ['四选一', '四个释义选一个；按 (p − 1/k)/(1 − 1/k) 扣掉 25% 的蒙对率再估计'],
    ['作答后展开', '释义、常用短语、英中对照例句（目标词加粗、标注 Tatoeba 来源）'],
    ['随时可退', '退出不丢记录，下次从「继续检测」接着来；也可以撤销上一题'],
  ],
  note: '同样答对 60%，自评模式和四选一模式算出来的掌握率不一样，系统分别记录、分别估计。',
  notes: '这页讲清"为什么四选一要校正"。可以现场答一题，让评委看到做完立刻展开例句。',
});

/* ---------- 10 为什么可信 ---------- */
page_({
  kind: 'text', kicker: '亮点 1 · 为什么敢写区间', title: '三段修正，专门处理"看起来没问题其实错了"的情况',
  lead: '抽样和区间估计没法靠肉眼验收，所以我们把每个边界情况都写成公式和断言。',
  layout: 'table',
  rows: [
    ['分层抽样', '按词频分七段、每段等比例抽；同样 100 题，分层 ±62 词，简单随机 ±91 词'],
    ['有限总体修正', '抽词不放回，乘以 (N−n)/(N−1)；题量越接近整库，区间越窄'],
    ['蒙对校正', '四选一按 (p − 1/k)/(1 − 1/k) 扣掉蒙对，再把掌握率折算回词汇量'],
    ['区间不塌陷', 'Agresti-Coull 处理全对/全错；方差设 1e-6 下限，绝不给"误差为零"的假精度'],
  ],
  note: '这部分有 60 多条断言守着。改一个参数，测试立刻挂——这是我们敢把区间印在结果旁边的底气。',
  notes: '技术页但别说成数学课。挑"全对时区间不会变成 0 宽"这个例子，评委一听就懂为什么要修正。',
});

/* ---------- 11 分组 ---------- */
page_({
  kind: 'imgRight', img: 'ppt-groups.jpg', ratio: 1.41, iwMax: 5.8,
  kicker: '功能 · 分组', title: '整库切成 46 组，每天补一组也能看到进度',
  lead: '完整检测听起来吓人，但拆成每组 100 词之后，每天花 20 分钟就能推进。',
  items: [
    ['按组推进', '每组 100 词，做完即存档；进度环和格子颜色告诉你走到哪了'],
    ['组间可比', '同一组再做一次，能看出这一块的掌握率有没有真的动'],
    ['不影响口径', '分组数据只用于进度与局部诊断，不会被外推成整个词库的词汇量'],
    ['可以停', '随时退出、下次继续；也可以只做当前最该补的那几组'],
  ],
  notes: '讲"降低启动成本"：把大任务拆成 46 个小任务，进度可见，人才愿意开始。',
});

/* ---------- 12 总览与地图 ---------- */
page_({
  kind: 'imgRight', img: 'ppt-map.jpg', ratio: 2.19,
  kicker: '功能 · 总览', title: '182 格地图不是图表，点一下就开测',
  lead: '七段词频 × 26 个首字母，每格是这个交叉点的掌握情况。',
  items: [
    ['颜色看掌握率', '绿 ≥ 80%，黄 50–80%，红 < 50%'],
    ['浓淡看测过多少', '没测过几乎是空的，测满才是实色；缺口和没测过永远分开显示'],
    ['点格子直接复测', '把这一格没掌握的词组成一轮检测，图是入口不是装饰'],
    ['Shift + 点问 AI', '问题里自动带上这一格的真实数字，不用自己复述'],
  ],
  note: '总览页还放着检测记录：每一轮测了什么、什么时候测的、结果怎么变。',
  notes: '这页最好现场点一下格子，让评委看到"点完就进检测"。',
});

/* ---------- 13 报告：等级 ---------- */
page_({
  kind: 'imgWide', img: 'ppt-ladder.jpg', ratio: 2.22, maxH: 2.35,
  kicker: '功能 · 报告', title: '等级不是分数，是"你离下一档还差多少词"',
  items: [
    ['六档，按掌握率分', 'S/A/B+/B/C/D 对应 92 / 85 / 75 / 65 / 50 五条线，字母保留给印章和文档对照'],
    ['换算成词数才看得懂', '四级 85% 是 3,859 词，六级 85% 是 4,859 词；同一比例在不同词库不是一个词数'],
    ['最高频段太差就封顶', '最高频 1k 段低于 60% 时等级封到 C——高频段空一片，读真题每题都卡'],
    ['还差多少、几天能到', '直接写"到 A 优秀还差 1,038 词，约 52 天，每天 20 词"'],
  ],
  note: '封顶规则是刻意加的：宁可把等级压低，也不给漂亮但会误导人的结论。',
  notes: '评委常问"等级怎么定的"。答：按当前词库自身掌握率，并且有地基封顶。',
});

/* ---------- 14 报告：方案 ---------- */
page_({
  kind: 'imgRight', img: 'ppt-next.jpg', ratio: 2.25,
  kicker: '亮点 2 · 报告', title: '方案长这样：先补 6 词、每天 20 个、1 天补完',
  lead: '报告页的最后一块不是建议，是一张能直接执行的清单。',
  items: [
    ['排序有公式', '缺口词数 × 词频权重：3k-5k 缺 737 词排在 10k-20k 缺 897 词前面'],
    ['每天几个词看你的时间', '每天能投入多少分钟 ÷ 1.5，得到每天背多少词，再折算成天数'],
    ['每条都能点', '「复测这段」直接开始这一段的检测，不用自己找词'],
    ['可以带走', '未掌握词表导出 CSV、报告文本复制、打印成 PDF'],
  ],
  note: '可导出是这个工具的边界：我们只给方案，词单交给你，你爱用哪个 App 都行。',
  notes: '指着一行念：「最高频 1k 段还差 6 词、掌握率 99%、每天 20 词约需 1 天」。这就是可执行的样子。',
});

/* ---------- 15 复测 ---------- */
page_({
  kind: 'text', kicker: '功能 · 复测', title: '两周后有没有进步，分三种情况看',
  lead: '单轮只能告诉你现在是多少。两轮完整实测之后，才知道哪些是真学会了。',
  layout: 'three',
  cols: [
    ['新学会', '上轮不认识，这轮认识', '说明这段时间补对了'],
    ['背了又忘', '上轮认识，这轮不认识', '复习优先级最高，要换方法'],
    ['掉档', '上轮模糊，这轮完全不认识', '通常是被近似词干扰'],
  ],
  items: [['每词存 2 bit', '7,175 词约 1.8 KB 一轮，本机最多存 12 轮；词表变了就只做聚合对比，不硬算逐词差异']],
  notes: '讲"背了又忘"这一类，它是最有价值的输出，因为单轮永远算不出来。',
});

/* ---------- 16 回访卡 ---------- */
page_({
  kind: 'imgWide', img: 'ppt-revisit.png', ratio: 3.84, maxH: 2.45,
  kicker: '功能 · 回访', title: '隔几天再打开，它记得你上次差在哪',
  items: [
    ['满 3 天才出现', '刚测完不会再打扰；有没测完的检测时，它让位给「继续检测」'],
    ['说三件事', '最该先补哪一段、按你的时间要几天、这次涨跌有没有超出抽样误差'],
    ['可以永久关掉', '点「×」只关本次；「以后不再提醒」永久关闭，设置里能重开'],
    ['不花钱也不联网', '三行结论全部本机算，不调大模型、不消耗 AI 额度'],
  ],
  note: '它是一张卡片，不是弹窗：不挡内容，也不催你打卡。',
  notes: '用设置页的「预览这张卡」现场展示，15 秒。强调三点：不弹窗、可永久关、全部本地算。',
});

/* ---------- 17 设置 ---------- */
page_({
  kind: 'imgRight', img: 'ppt-daily.jpg', ratio: 6.6, iwMax: 6.4,
  kicker: '功能 · 设置', title: '五块设置里，最有用的是「每天能投入多少时间」',
  lead: '这一栏只干一件事：把你的时间换算成每天背多少词，喂给报告、AI 计划和回访卡。',
  items: [
    ['答题设置', '自评 / 四选一、自动下一题、发音、是否含派生词、严格或折中口径'],
    ['外观与数据', '深色模式；使用者档案、导出备份 JSON、导出未掌握 CSV、清空记录'],
    ['使用说明', '三步上手写在设置页里，不用去翻文档'],
    ['每日时间', '15/30/60 或自己填 5–180；换算成每天几个词，四处文案跟着变'],
  ],
  note: '它不影响出题——题量由你选的目标精度决定，和每天有多少时间无关。',
  notes: '这页一句话带过即可，重点说"同一个数字驱动四处文案"，评委能看出工程上的一致性。',
});

/* ---------- 18 词书 ---------- */
page_({
  kind: 'text', kicker: '功能 · 词书', title: '主打四六级大纲，也能换成你自己的词书',
  lead: '考研、雅思、专业课词汇都能导入，但要先说清它能说明什么、不能说明什么。',
  layout: 'table',
  rows: [
    ['内置两套词库', '四级大纲 4,540 词、六级大纲 5,716 词，全部带音标；含派生词时共 7,175 词'],
    ['导入格式', 'txt / csv / 直接粘贴，一行一个词，可带「词,释义」；自动去重、跳表头，上限 2 万词'],
    ['导入前给预览', '总词数、命中内置词库多少、新增多少、有释义的比例、频段分布'],
    ['但只报掌握率', '自定义词书是有偏样本，不能换算成词汇量——界面上常驻提示，不藏在文档里'],
  ],
  note: '这条边界宁可写清楚：能测，但不下"你的词汇量是多少"这种结论。',
  notes: '评委常追问自定义词书，主动说清边界比被问出来好。',
});

/* ---------- 19 AI 技术总览 ---------- */
page_({
  kind: 'text', kicker: 'AI 技术应用', title: 'AI 用了四层，每一层都能指到具体代码',
  layout: 'table',
  rows: [
    ['① AI Agent 智能助手', '8 个只读工具 + 1 个动作工具，最多 3 轮函数调用；模型决定调哪个、怎么解释'],
    ['② AI 教育与学习平台', '按你的数据生成补词计划；没有额度或没有网络时自动降级为确定性规则方案'],
    ['③ 轻量 RAG（倒排索引 + 工具调用）', '本地 9,204 句英中语料建倒排索引，按可读性打分检索，把真实例句当证据注入'],
    ['④ AI 数据分析与可视化', '图表能把上下文交给 AI（点频段/格子就带数字问）；AI 的建议变成可点的按钮'],
  ],
  note: '共同原则：数字由本机算好，模型只做解释和排序——它在任何情况下都不许自己编数。',
  notes: '这页是评委指定要看的。四层各一句，重点落在最后一句"模型不许自己编数"。',
});

/* ---------- 20 AI Agent ---------- */
page_({
  kind: 'imgRight', img: 'ppt-ai.jpg', ratio: 1.21,
  kicker: 'AI ① · Agent', title: 'AI 助手先查数据再说话',
  lead: '回答上方会标出这次调了哪几个工具、拿到了什么，数字全部来自工具返回值。',
  items: [
    ['工具不是装饰', '取整体情况、取频段数据、取缺口词、算计划、检索例句……模型只能通过它们取数'],
    ['数据不够就直说', '样本太少时它拒绝下结论，不编一个看起来合理的数'],
    ['建议变成按钮', '给的动作是可点的：复测这一段、开始一轮摸底、看频段剖面'],
    ['桌宠也能说话', '桌宠的台词和诊断共用同一套结论，不会出现"界面说东、她说西"'],
  ],
  note: '这一层解决的问题是：让 AI 说人话，但不让它顺手把数字也编了。',
  notes: '指一下回答上方的工具标签。说一句：模型不许自己算数，所以界面上的数和它说的数不可能不一致。',
});

/* ---------- 21 轻量 RAG ---------- */
page_({
  kind: 'imgRight', img: '06-example.png', ratio: 1.77,
  kicker: 'AI ③ · 检索', title: '例句是查出来的，不是模型编的',
  lead: '模型很容易编出一句"看着像"的例句，所以例句一律从本地语料里检索。',
  items: [
    ['语料', '9,204 句英中对照，来自 Tatoeba（CC-BY 2.0 FR），构建期建成倒排索引'],
    ['怎么挑', '同一单词的候选句按可读性打分：词数接近 10–12、长度 60–80 字符、主语开头加分'],
    ['谁在用', '回答里需要举例时，模型调工具取真实例句，界面直接标来源'],
    ['为什么不用向量库', '向量方案要拖几十 MB 权重，会毁掉"单文件 + 断网可用"，所以只做检索'],
  ],
  note: '这是"AI 少说假话"的具体做法：能查到的就查，查不到就不编。',
  notes: '这页讲 RAG 的取舍：有现成语料，倒排索引 + 按需检索就够，不需要向量库。',
});

/* ---------- 22 AI 数据分析与可视化 ---------- */
page_({
  kind: 'imgRight', img: '05-ai-diagnose.png', ratio: 1.77,
  kicker: 'AI ④ · 与图表联动', title: '图和 AI 不是两张皮：点图能问，答完能点',
  lead: '把"分析在左、图在右"缝成一条：图把上下文交给 AI，AI 把结论变回图上的动作。',
  items: [
    ['图 → AI', '点频段条的「问」或 Shift + 点地图格子，问题里自动带上那一块的真实数字'],
    ['AI → 图', '回答末尾给的是可点按钮：复测这一段、开一轮摸底、看频段剖面，点了就执行'],
    ['工具调用可视化', '每个标签写着读了什么数据（整体情况、频段数据、缺口词），可点开看原始返回'],
    ['依据面板', '回答下方能看到"本次发送给模型的数据"，逐项可核对'],
  ],
  notes: '这页是"深度融合"的硬证据。现场点一次「问」最有效：问题里直接出现你刚看的那一段数字。',
});

/* ---------- 23 AI 能否离线的落地 ---------- */
page_({
  kind: 'text', kicker: 'AI ② · 三档通路', title: '没网也能给结论，有网才调大模型',
  lead: '大模型要花钱，所以三条路都铺好：缺哪一条，工具都还能用。',
  layout: 'table',
  rows: [
    ['自带 Key', '用你自己账号的额度，不限次数；Key 只存本机，导出备份时会被剔除'],
    ['作者额度', '完成一次有效检测换一次深度诊断；设置页能看到已授予、已用、剩余'],
    ['本地方案', '不联网、不花钱、不限次：按你的等级、短板形态、覆盖状态给确定性补词计划'],
    ['自动降级', '额度用完或没有后端时直接回落到本地方案，并在回答里说明，不弹错误框'],
  ],
  note: '面板右上角永远显示你现在用的是哪一档，不会让你以为在用大模型。',
  notes: '强调"永远可用"：评委常常担心这类作品离开服务器就废了，这一页正面回答。',
});

/* ---------- 24 工程质量 ---------- */
page_({
  kind: 'text', kicker: '工程质量', title: '421 条断言，和五个真出过的 bug',
  lead: '抽样和区间估计没法靠肉眼验收，只能写成断言。',
  layout: 'nums-bug',
  nums: [['421', '离线断言，10 个套件；另有 7 条联网断言'], ['11', '测试套件，浏览器那套自动跑分'], ['0', '运行时依赖']],
  rows: [
    ['入场页例句数显示 10,276', '把例句数组当对象数了两遍，改成构建期算好注入'],
    ['报告页「每天 50 词」写死', '设置页改了不生效，改成统一函数并加断言'],
    ['浏览器断言页一条都没跑', '文件里一处语法错误，脚本只打印 ok；补了自动跑分器'],
    ['手机顶栏被品牌名挤成一列竖字', '7 个字的品牌名在 390px 下断行，窄屏改成图标让位'],
    ['游离文本让页面多出一行乱码', 'favicon 的 data URI 被正则截断，加了兜底清理'],
  ],
  notes: '不用逐条念。挑两条讲：报告页写死 50 词、浏览器断言页一条都没跑。说完补一句这两条现在都有断言守着。',
});

/* ---------- 25 交付 ---------- */
page_({
  kind: 'imgRight', img: 'ppt-dark.jpg', ratio: 2.76,
  kicker: '交付形态', title: '一个 2.11 MB 的文件，双击就能用',
  lead: '词库、例句、立绘、样式、脚本全部在里面，不需要任何环境。',
  items: [
    ['0 个运行时依赖', '不装环境、不起服务、不需要同目录的素材文件夹'],
    ['断网能用', '屏蔽全部网络后跑 20 项断言：答题、进度、档案、手机布局都正常'],
    ['数据只在本机', '作答存在 localStorage，按使用者分开；导出 JSON 就能带走'],
    ['手机上也能用', '390px 宽度实测无横向溢出，顶栏单行，主按钮在屏内'],
  ],
  notes: '念四个数：2.11 MB、7,175 词、9,204 例句、0 依赖，然后说断网也能测。',
});

/* ---------- 26 趣味（可选，时间紧就跳过） ---------- */
page_({
  kind: 'imgRight', img: 'ppt-pet.jpg', ratio: 0.56, iwMax: 2.6,
  kicker: '一点趣味', title: '右下角那只鲸鱼，是为了让重复答题没那么难熬',
  lead: '测词汇量本身很枯燥，加个会动的东西，人愿意多答几题。',
  items: [
    ['10 张立绘全部内联', '349 KB，断网也有表情；缺图时退化成纯气泡提示'],
    ['可拖动、有重力', '抓起来会挣扎、被甩着晃，松手落地抖两下灰'],
    ['只在右侧安全区活动', '不横穿正文；窄屏自动收起，不挡内容'],
    ['台词来自真实数据', '她会说"帮你算好了：词汇量 4,449 词"，和报告用的是同一套结论'],
  ],
  notes: '时间紧可以跳过；时间够就现场抓一下，1 秒就够。',
});

page_({ kind: 'closing' });

/* 用户自己加的一页：放演示视频。文案保留「视频展示」，做成一张深色分隔页。 */
page_({ kind: 'split', title: '视频展示', note: '演示视频 / 现场播放' });

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
  nums(s, [['7,175', '词条，全部带音标'], ['9,204', '英中对照例句'], ['421', '条离线断言'], ['2.11 MB', '单文件，断网可用']], 5.1, { sz: 26, color: C.white });
  s.addText('广东亚视演艺职业学院 · 人工智能学院　｜　李壹铭　｜　github.com/whiteyuexi/cet4-vocab-check', {
    x: M, y: 6.55, w: CW, h: 0.32, fontFace: F, fontSize: 10.5, color: '8E887C',
  });
  s.addNotes(MODE === 'detail'
    ? '这是详细资料稿，28 页，按"问题 → 怎么测 → 怎么诊断 → 怎么规划 → 怎么验证 → 工程质量"的顺序排。'
    : '开场 20 秒：我是谁，为什么做这个。不要念标题，直接说"我高考英语 30 分"这句。');
}

function renderSplit(p) {
  const s = base();
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.ink } });
  s.addText(p.title, {
    x: 0, y: 3.0, w: W, h: 0.9, fontFace: F, fontSize: 40, bold: true, color: C.white, align: 'center',
  });
  s.addShape(pptx.ShapeType.rect, { x: W / 2 - 0.9, y: 4.02, w: 1.8, h: 0.075, fill: { color: C.orange } });
  if (p.note) s.addText(p.note, {
    x: 0, y: 4.3, w: W, h: 0.4, fontFace: F, fontSize: 13, color: '9A9488', align: 'center',
  });
  s.addNotes('这一页放演示视频：现场播放或提前嵌入。播完直接进收尾，不要再补信息。');
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
  } else if (p.layout === 'claims') {
    /* 三个亮点：三块并排大卡，每块一个编号 + 一句结论 + 一句证据 */
    const cw = (CW - 0.7) / 3;
    p.cols.forEach((c, i) => {
      const x = M + i * (cw + 0.35);
      card(s, x, top + 0.15, cw, 3.5);
      s.addText(c[0], { x: x + 0.3, y: top + 0.4, w: cw - 0.6, h: 0.34, fontFace: FM, fontSize: 12, bold: true, color: C.orange });
      s.addText(c[1], { x: x + 0.3, y: top + 0.82, w: cw - 0.6, h: 1.15, fontFace: F, fontSize: 15, bold: true, color: C.ink, lineSpacingMultiple: 1.25 });
      s.addText(c[2], { x: x + 0.3, y: top + 2.1, w: cw - 0.6, h: 1.3, fontFace: F, fontSize: 10.5, color: C.ink2, lineSpacingMultiple: 1.35 });
    });
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
    else if (p.kind === 'split') renderSplit(p);
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
