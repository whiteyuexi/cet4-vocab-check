import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'src', 'app.part1.js');
const OUT = path.join(ROOT, 'miniprogram', 'utils', 'engine.js');
/* 用法: node miniprogram/tools/port-engine.mjs   （在项目根目录执行，或直接 node 这个文件） */

let text = fs.readFileSync(SRC, 'utf8');
const log = [];

function removeRange(t, startMarker, endMarker, label) {
  const i = t.indexOf(startMarker);
  if (i < 0) throw new Error('找不到起点: ' + label);
  if (t.indexOf(startMarker, i + 1) >= 0) throw new Error('起点不唯一: ' + label);
  const j = t.indexOf(endMarker, i);
  if (j < 0) throw new Error('找不到终点: ' + label);
  log.push('删除 ' + label + '  (' + (j - i) + ' 字符)');
  return t.slice(0, i) + t.slice(j);
}

function replaceRange(t, startMarker, endMarker, replacement, label) {
  const i = t.indexOf(startMarker);
  if (i < 0) throw new Error('找不到起点: ' + label);
  if (t.indexOf(startMarker, i + 1) >= 0) throw new Error('起点不唯一: ' + label);
  const j = t.indexOf(endMarker, i);
  if (j < 0) throw new Error('找不到终点: ' + label);
  log.push('替换 ' + label + '  (' + (j - i) + ' 字符 -> ' + replacement.length + ' 字符)');
  return t.slice(0, i) + replacement + t.slice(j);
}

function replaceOnce(t, from, to, label) {
  const n = t.split(from).length - 1;
  if (n !== 1) throw new Error('出现 ' + n + ' 次（应为 1）: ' + label);
  log.push('改写 ' + label);
  return t.split(from).join(to);
}

/* ---------- 1. view / DOM 段整段删除 ---------- */

const TOAST_STUB = [
  "  /* 原实现直接操作 #toast 元素（DOM）。小程序里由页面通过 A.onToast 注入提示方式",
  "     （典型实现：小程序 showToast）。引擎本身不认识任何界面 API。 */",
  "  function toast(msg) {",
  "    if (typeof A.onToast === 'function') {",
  "      try { A.onToast(msg); } catch (e) {}",
  "    }",
  "  }",
  "  A.toast = toast;",
  ""
].join('\n');

text = replaceOnce(text,
  "  function el(id) { return document.getElementById(id); }\n  A.el = el;\n",
  "", 'el() 取元素helper（纯 DOM）');

text = replaceRange(text,
  "  var toastTimer = null;\n  function toast(msg) {",
  "  /* 兜底清理",
  TOAST_STUB, 'toast（改回调注入）');

text = removeRange(text, "  /* 兜底清理", "  /* ---------- 使用者档案",
  'stripStrayText + announce + modal/closeModal（纯 DOM）');

text = removeRange(text, "  /* ---------- 例句（来自 Tatoeba", "  /* ---------- 发音 ---------- */",
  'examplesOf/hasExamples/highlightWord（SENTENCES + HTML 渲染）');

text = removeRange(text, "  /* ---------- 发音 ---------- */", "  /* ---------- 环形进度 ---------- */",
  '语音合成 speak/pickVoice（浏览器语音 API）');

text = removeRange(text, "  /* ---------- 环形进度 ---------- */", "  /* ---------- 动效层 ----------",
  'ring（SVG 模板）');

text = removeRange(text, "  /* ---------- 动效层 ----------", "  /* ---------- 路由 ---------- */",
  'armMotion/playMotion/reduceMotion（DOM 动画）');

text = removeRange(text, "  /* ---------- 路由 ---------- */", "  /* 目标精度 → 大致需要多少题",
  '路由 go/getRoute + render + bankSwitch（全部 DOM）');

text = removeRange(text, "  /* ---------- 首页 ---------- */", "})(window.__APP__ || (window.__APP__ = {}));",
  'viewHome/groupGrid/viewGroups（模板字符串视图）');

/* ---------- 2. base64：小程序没有 btoa/atob ---------- */

const B64_NEW = [
  "  /* 小程序运行时没有浏览器那两个 base64 全局函数，所以这里换成等价的",
  "     标准 base64 实现：输出与浏览器原生实现逐字节一致，两端存档位图可以互相解开。",
  "     位图每词占 2 bit，解码结果长度必须与浏览器端完全一致，否则逐词对比会错位。 */",
  "  var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';",
  "  function b64(bytes) {",
  "    var out = '';",
  "    for (var i = 0; i < bytes.length; i += 3) {",
  "      var b0 = bytes[i];",
  "      var b1 = (i + 1 < bytes.length) ? bytes[i + 1] : 0;",
  "      var b2 = (i + 2 < bytes.length) ? bytes[i + 2] : 0;",
  "      out += B64_CHARS.charAt(b0 >> 2);",
  "      out += B64_CHARS.charAt(((b0 & 3) << 4) | (b1 >> 4));",
  "      out += (i + 1 < bytes.length) ? B64_CHARS.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '=';",
  "      out += (i + 2 < bytes.length) ? B64_CHARS.charAt(b2 & 63) : '=';",
  "    }",
  "    return out;",
  "  }",
  "  function unb64(str) {",
  "    if (typeof str !== 'string' || !str) return null;",
  "    var body = str.replace(/=+$/, '');",
  "    var out = new Uint8Array(Math.floor(body.length * 3 / 4));",
  "    var o = 0, buf = 0, bits = 0;",
  "    for (var i = 0; i < body.length; i++) {",
  "      var c = B64_CHARS.indexOf(body.charAt(i));",
  "      if (c < 0) return null;",
  "      buf = (buf << 6) | c;",
  "      bits += 6;",
  "      if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 0xff; }",
  "    }",
  "    return out.subarray(0, o);",
  "  }",
  ""
].join('\n');

const B64_OLD = [
  "  function b64(bytes) {",
  "    var s = '';",
  "    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);",
  "    try { return btoa(s); } catch (e) { return ''; }",
  "  }",
  "  function unb64(str) {",
  "    try {",
  "      var s = atob(str), out = new Uint8Array(s.length);",
  "      for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);",
  "      return out;",
  "    } catch (e) { return null; }",
  "  }",
  ""
].join('\n');

text = replaceOnce(text, B64_OLD, B64_NEW, 'b64/unb64 -> 纯 JS base64');

/* ---------- 3. 切掉 IIFE 头尾，准备包成 CommonJS ---------- */

const HEAD = "(function (A) {\n";
const TAIL = "})(window.__APP__ || (window.__APP__ = {}));";
const hi = text.indexOf(HEAD);
if (hi < 0) throw new Error('找不到 IIFE 头');
if (text.indexOf(HEAD, hi + 1) >= 0) throw new Error('IIFE 头不唯一');
text = text.slice(hi + HEAD.length);
const ti = text.indexOf(TAIL);
if (ti < 0) throw new Error('找不到 IIFE 尾');
if (text.indexOf(TAIL, ti + 1) >= 0) throw new Error('IIFE 尾不唯一');
if (text.slice(ti + TAIL.length).trim() !== '') throw new Error('IIFE 尾之后还有内容');
text = text.slice(0, ti);
log.push('剥离 IIFE 包装 -> engineBody(A)');

/* ---------- 4. 注入存储适配层 + 词库来源 ---------- */

text = replaceOnce(text,
  "  var WORDS = A.WORDS = window.WORDS || [];",
  [
    "  /* 存储适配层（storage.js）：接口与浏览器本地存储一致，由 createEngine 注入。",
    "     网页版这里的 6 处调用原样保留，只把接收者换成了适配层。 */",
    "  var storage = A.storage;",
    "  /* 词库：网页版从全局取，小程序由 createEngine 注入（utils/words-data.js） */",
    "  var WORDS = A.WORDS = A.WORDS || [];"
  ].join('\n'),
  'WORDS 来源 + storage 注入');

/* ---------- 5. 6 处存储调用 ---------- */

const before = (text.match(/localStorage\.(getItem|setItem|removeItem)\(/g) || []).length;
if (before !== 6) throw new Error('存储调用点数量变了：' + before + '（应为 6）');
text = text.replace(/localStorage\.(getItem|setItem|removeItem)\(/g, 'storage.$1(');
log.push('localStorage.get/set/removeItem -> storage.* （6 处）');

/* ---------- 6. 注释里残留的 localStorage / Math.random 字样 ---------- */

const leftStore = (text.match(/localStorage/g) || []).length;
if (leftStore !== 1) throw new Error('剩余 localStorage 字样 ' + leftStore + ' 处（应为 1，只有注释）');
text = replaceOnce(text, '作答数据存在浏览器 localStorage 里', '作答数据存在浏览器本地存储里', '档案注释措辞');
text = replaceOnce(text, '为什么不能用 Math.random：', '为什么不能用真随机数：', '定序注释措辞');

/* ---------- 7. 硬性检查：移植后不允许残留的东西 ---------- */

const FORBIDDEN = ['window.', 'document.', 'localStorage', 'btoa', 'atob', 'speechSynthesis',
  'requestAnimationFrame', 'matchMedia', 'querySelector', 'addEventListener', 'scrollTo',
  'new Function', 'eval(', 'TextEncoder', 'TextDecoder', 'XMLHttpRequest', 'Intl.', 'Blob', 'Worker', 'wx.'];
for (const f of FORBIDDEN) {
  const n = text.split(f).length - 1;
  if (n !== 0) throw new Error('移植后仍残留 ' + f + '（' + n + ' 处）');
}
const mr = (text.match(/Math\.random/g) || []).length;
if (mr !== 2) throw new Error('Math.random 出现 ' + mr + ' 次（应为 2：shuffle + mkPid）');
log.push('硬性检查通过：无 DOM/浏览器 API 残留，Math.random 仅 2 处（shuffle、mkPid）');

/* ---------- 8. 拼装成 CommonJS 模块 ---------- */

const HEADER = [
  '/* ======================================================================',
  '   词汇账户余额查询 · 统计引擎（微信小程序移植版）',
  '   移植自 src/app.part1.js（网页版第 1 部分），只做必要改动：',
  '     · 6 处浏览器本地存储调用 -> storage 适配层（utils/storage.js）',
  '     · 词库来源取全局变量 -> createEngine 注入（utils/words-data.js）',
  '     · 删除纯渲染 / 浏览器专属 API 的段落（视图、语音、动画、路由、例句渲染）',
  '     · 浏览器 base64 全局函数 -> 等价的纯 JS 实现（小程序运行时没有那两个函数）',
  '     · IIFE 挂全局对象的写法 -> engineBody(A) + createEngine() 工厂 + module.exports',
  '   算法、常量、口径一行未改。逐处说明与一致性测试见 IMPORT-NOTES.md、test/parity.mjs。',
  '',
  '   用法：',
  '     var engine = require("../../utils/engine.js").engine;   // 默认单例',
  '     var A = require("../../utils/engine.js").createEngine({ words: 词库, storage: 存储 });',
  '   ====================================================================== */',
  "'use strict';",
  '',
  "var storageAdapter = require('./storage.js');",
  "var wordsData = require('./words-data.js');",
  '',
  '/* 移植过来的引擎主体：与网页版第 1 部分一一对应，A 是引擎对外对象 */',
  'function engineBody(A) {',
  ''
].join('\n');

const FOOTER = [
  '',
  '/* 创建一个独立引擎实例。',
  '   options.words   词库数组（默认 utils/words-data.js）',
  '   options.storage 存储适配层（默认 utils/storage.js：wx 优先，Node 回退内存）',
  '   可选注入：A.onToast(msg) 提示回调；A.render() 状态变化后触发视图刷新。 */',
  'function createEngine(options) {',
  '  options = options || {};',
  '  var A = {};',
  '  A.WORDS = options.words || wordsData;',
  '  A.storage = options.storage || storageAdapter;',
  '  engineBody(A);',
  '  return A;',
  '}',
  '',
  'var defaultEngine = createEngine();',
  '',
  'module.exports = {',
  '  createEngine: createEngine,',
  '  engine: defaultEngine,',
  '  storage: storageAdapter,',
  '  WORDS: defaultEngine.WORDS',
  '};',
  ''
].join('\n');

const out = HEADER + text.replace(/^\n+/, '\n').trimEnd() + '\n}\n' + FOOTER;
fs.writeFileSync(OUT, out, 'utf8');

console.log(log.join('\n'));
console.log('--');
console.log('engine.js 行数:', out.split('\n').length, ' 字节:', Buffer.byteLength(out, 'utf8'));