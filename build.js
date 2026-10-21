// build.js — 把 src 下的模板、样式、脚本和词库打包成单文件 index.html
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const css = fs.readFileSync(path.join(ROOT, 'src', 'app.css'), 'utf8');
const parts = ['app.part1.js', 'app.part2.js', 'app.part3.js', 'app.part4.js', 'app.part6.js', 'app.part5.js', 'app.part7.js'];
const js = parts.map(function (f) {
  return '/* ===== ' + f + ' ===== */\n' + fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
}).join('\n');

const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'words.json'), 'utf8'));
const words = raw.map(function (o) {
  const r = { w: o.w, t: o.t, b: o.b, f: o.f };   // b = 词库掩码，f = 词频段，都不能丢
  if (o.p) r.p = o.p;
  if (o.x) r.x = 1;
  if (o.ph) r.ph = o.ph;
  return r;
});
const wordsJson = JSON.stringify(words);

// 例句：为控制单文件体积，每个词只内联第一条（完整语料留在 sentences.json 供后端检索）
let sentencesJson = '{}';
let sentCount = 0;
try {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'sentences.json'), 'utf8'));
  const slim = {};
  Object.keys(raw).forEach(function (k) {
    const s = raw[k] && raw[k][0];
    // 紧凑格式 [英文, 中文]，比对象数组省约 25% 体积
    if (s && s.e && s.z) { slim[k] = [s.e, s.z]; sentCount++; }
  });
  sentencesJson = JSON.stringify(slim);
} catch (e) {
  console.log('提示：未找到 sentences.json，本次产物不含例句（可运行 node build-corpus.js 生成）');
}

// 桌宠立绘：Sutera-Diffusus 的 MIT 全身立绘（assets/whale-art/*.webp）
//
// 这里曾经只内联「待机」一张，理由是"内联多张会把 index.html 顶到 3 MB"。
// 实测这是个错误权衡：单文件交付时旁边没有 assets/ 目录，其余情绪图一律加载失败，
// 换表情的代码照常执行、图永远回退成待机——用户看到的就是"脸一点没变"。
// 正确做法是先把图压小再内联：scripts/make-pet-art-inline.mjs 用 Chrome 把
// 10 张 320×320 webp 重编码成合计约 272 KB（原图 1.19 MB）的 data URI。
// 读不到 _inline.json 时退回只内联待机图，不影响构建。
let petArt = {};
const inlineJson = path.join(ROOT, 'assets', 'whale-art', '_inline.json');
ty: {
  try {
    petArt = JSON.parse(fs.readFileSync(inlineJson, 'utf8'));
    if (Object.keys(petArt).length) break ty;
  } catch (e) { /* 没生成过，走下面的兜底 */ }
  try {
    const b = fs.readFileSync(path.join(ROOT, 'assets', 'whale-art', 'dsh-whale-state-idle-cute.webp'));
    petArt = { 'idle-cute': 'data:image/webp;base64,' + b.toString('base64') };
    console.log('提示：没有 assets/whale-art/_inline.json，本次只内联待机帧（情绪图将全部不可用）');
    console.log('      需要完整表情请运行 node scripts/make-pet-art-inline.mjs');
  } catch (e) {
    console.log('提示：未找到 assets/whale-art/dsh-whale-state-idle-cute.webp');
    console.log('      离线版桌宠将只显示气泡（可用 npm run art:fetch 拉取立绘）');
  }
}

let html = fs.readFileSync(path.join(ROOT, 'src', 'index.template.html'), 'utf8');
html = html.replace('/*__CSS__*/', function () { return css; });
html = html.replace('/*__PETART__*/', function () { return JSON.stringify(petArt); });
html = html.replace('/*__WORDS__*/', function () { return wordsJson; });
html = html.replace('/*__SENTENCES__*/', function () { return sentencesJson; });
html = html.replace('/*__JS__*/', function () { return js; });
// 刻意不写入生成时间：产物必须可复现，否则每次构建都会让 index.html 产生假改动
html = html.replace('</head>', '<!-- 四六级词汇量检测 · 词库 ' + words.length + ' 词 · 内联例句 ' + sentCount + ' 条 -->\n</head>');

const out = path.join(ROOT, 'index.html');
fs.writeFileSync(out, html);
const pick = core => words.filter(function (w) { return core ? !w.x : true; });
const c4 = core => pick(core).filter(function (w) { return w.b & 1; }).length;
const c6n = core => pick(core).filter(function (w) { return (w.b & 2) && !(w.b & 1); }).length;
console.log('词条总数:', words.length, '（核心', pick(true).length, '/ 拓展', words.filter(function (w) { return w.x; }).length, '）');
console.log('默认词库: 四级', c4(true), '| 六级全量', c4(true) + c6n(true), '（= 四级 + 六级新增', c6n(true) + '）');
console.log('含拓展派生词: 四级', c4(false), '| 六级全量', c4(false) + c6n(false), '| 六级新增', c6n(false));
console.log('内联例句:', sentCount, '条（' + (sentencesJson.length / 1024).toFixed(0) + ' KB）');
console.log('桌宠立绘:', Object.keys(petArt).length, '张内联（' + (Object.values(petArt).reduce((s, v) => s + v.length, 0) / 1024).toFixed(0) + ' KB，情绪立绘离线可用）');
console.log('index.html:', (fs.statSync(out).size / 1024).toFixed(1) + ' KB（构建于 ' + new Date().toISOString() + '，此时间不写入产物）');
