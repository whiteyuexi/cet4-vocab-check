// build.js — 把 src 下的模板、样式、脚本和词库打包成单文件 index.html
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const css = fs.readFileSync(path.join(ROOT, 'src', 'app.css'), 'utf8');
const parts = ['app.part1.js', 'app.part2.js', 'app.part3.js'];
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

let html = fs.readFileSync(path.join(ROOT, 'src', 'index.template.html'), 'utf8');
html = html.replace('/*__CSS__*/', function () { return css; });
html = html.replace('/*__WORDS__*/', function () { return wordsJson; });
html = html.replace('/*__JS__*/', function () { return js; });
html = html.replace('</head>', '<!-- 生成时间 ' + new Date().toISOString() + ' · 词库 ' + words.length + ' 词 -->\n</head>');

const out = path.join(ROOT, 'index.html');
fs.writeFileSync(out, html);
const pick = core => words.filter(function (w) { return core ? !w.x : true; });
const c4 = core => pick(core).filter(function (w) { return w.b & 1; }).length;
const c6n = core => pick(core).filter(function (w) { return (w.b & 2) && !(w.b & 1); }).length;
console.log('词条总数:', words.length, '（核心', pick(true).length, '/ 拓展', words.filter(function (w) { return w.x; }).length, '）');
console.log('默认词库: 四级', c4(true), '| 六级全量', c4(true) + c6n(true), '（= 四级 + 六级新增', c6n(true) + '）');
console.log('含拓展派生词: 四级', c4(false), '| 六级全量', c4(false) + c6n(false), '| 六级新增', c6n(false));
console.log('index.html:', (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
