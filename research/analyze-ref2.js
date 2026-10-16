const fs = require('fs');
const path = require('path');
const DIR = path.join(process.env.TEMP, 'design', 'ref2');

// showreel：看看它收录了哪些真实网站
const sr = fs.readFileSync(path.join(DIR, 'showreel.html'), 'utf8');
const text = sr.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
console.log('=== showreel 页面文字（前 900 字）===');
console.log(text.slice(0, 900));
const links = [...sr.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1])
  .filter(u => !/showreel|twitter|instagram|linkedin|youtube|facebook|t\.me|discord/i.test(u));
console.log('\n=== 它外链出去的真实网站（去重前 25 个）===');
console.log([...new Set(links)].slice(0, 25).join('\n'));

// aceternity：看它的设计手法
const ac = fs.readFileSync(path.join(DIR, 'aceternity.html'), 'utf8');
const css = [...ac.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
console.log('\n=== aceternity 的 CSS 手法统计 ===');
const cnt = (re, t) => (t.match(re) || []).length;
console.log('  blur 次数      : ' + cnt(/blur\(/g, ac + css));
console.log('  blur 值        : ' + [...new Set([...(ac + css).matchAll(/blur\((\d+)(px|rem)?\)/g)].map(m => m[0]))].slice(0, 8).join(' '));
console.log('  gradient 次数  : ' + cnt(/gradient\(/g, ac + css));
console.log('  gradient 样例  : ' + [...new Set([...(ac + css).matchAll(/linear-gradient\([^)]{0,70}\)/g)].map(m => m[0]))].slice(0, 5).join('\n                   '));
console.log('  backdrop-blur  : ' + cnt(/backdrop-blur/g, ac + css));
console.log('  圆角值         : ' + [...new Set([...(ac + css).matchAll(/rounded-(\w+)|border-radius:\s*([^;]{1,20})/g)].map(m => m[0]))].slice(0, 12).join('  '));
console.log('  阴影样例       : ' + [...new Set([...(ac + css).matchAll(/shadow-\[[^\]]{0,60}\]/g)].map(m => m[0]))].slice(0, 6).join('  '));
console.log('  ring/border    : ' + cnt(/ring-\d|border-white\/|border-neutral-/g, ac + css));
