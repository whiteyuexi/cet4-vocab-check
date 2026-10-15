const fs = require('fs');
const W = JSON.parse(fs.readFileSync('words.json', 'utf8'));
console.log('总词数:', W.length, '| 核心:', W.filter(w => !w.x).length, '| 拓展:', W.filter(w => w.x).length);
console.log('有音标:', W.filter(w => w.p).length, '| 无音标:', W.filter(w => !w.p).length);

// 1) 大小写冲突：程序用小写词做状态 key，若有 China/china 这类会互相覆盖
const byLower = new Map();
W.forEach(w => { const k = w.w.toLowerCase(); if (!byLower.has(k)) byLower.set(k, []); byLower.get(k).push(w.w); });
const caseClash = [...byLower.entries()].filter(([k, v]) => new Set(v).size > 1);
console.log('\n[1] 大小写冲突条目:', caseClash.length ? JSON.stringify(caseClash) : '无');

// 2) 无音标的核心词
const noPhonCore = W.filter(w => !w.x && !w.p).map(w => w.w);
console.log('\n[2] 缺音标的核心词 (' + noPhonCore.length + '):', noPhonCore.join(', '));

// 3) 疑似残缺/异常释义
const odd = [];
W.forEach(w => {
  const t = w.t || '';
  if (!t.trim()) odd.push(['空释义', w.w, t]);
  else if (/[[\]（）()=]/.test(t)) odd.push(['含括号或等号', w.w, t]);
  else if (/^[a-z]{1,4}\.\s*$/.test(t)) odd.push(['只有词性', w.w, t]);
  else if (/^[^a-zA-Z\u4e00-\u9fa5]+$/.test(t)) odd.push(['非文字', w.w, t]);
  else if (t.length <= 2 && /[\u4e00-\u9fa5]/.test(t)) odd.push(['释义过短', w.w, t]);
  else if (/；$|，$|、$/.test(t)) odd.push(['结尾残留分隔符', w.w, t]);
  else if (t.length >= 70) odd.push(['接近截断上限', w.w, t]);
});
console.log('\n[3] 疑似异常释义:', odd.length, '条');
odd.slice(0, 25).forEach(x => console.log('   -', x[0], '|', x[1], '=>', JSON.stringify(x[2])));

// 4) 词形可疑（缩写 / 连字符 / 单字母 / 反义重复）
const weird = W.filter(w => /[.]/.test(w.w) || /-/.test(w.w) || w.w.length <= 2);
console.log('\n[4] 含点号/连字符/超短词 (' + weird.length + '):', weird.map(w => w.w + '=' + (w.p || '无音标')).join(', '));

// 5) 英美拼写重复 / 近形重复
const pairs = [];
const lower = new Set(W.map(w => w.w.toLowerCase()));
for (const w of lower) {
  const rules = [[/our$/, 'or'], [/ise$/, 'ize'], [/re$/, 'er'], [/ll/, 'l'], [/ogue$/, 'og']];
  for (const [a, b] of rules) {
    if (a.test(w)) { const alt = w.replace(a, b); if (alt !== w && lower.has(alt)) pairs.push(w + ' / ' + alt); }
  }
}
console.log('\n[5] 英美拼写重复对 (' + pairs.length + '):', pairs.slice(0, 15).join(', '));

// 6) 拓展词抽查
const ext = W.filter(w => w.x);
console.log('\n[6] 拓展词样例:', ext.slice(0, 14).map(w => w.w + '=' + w.t).join(' | '));
console.log('    拓展词中无音标:', ext.filter(w => !w.p).length, '/', ext.length);

// 7) 释义里是否混入英文词性碎片
const junk = W.filter(w => /[a-z]{2,}\./.test(w.t) && !/^[a-z]+\./.test(w.t));
console.log('\n[7] 释义中段出现疑似词性碎片:', junk.length, junk.slice(0, 6).map(w => w.w + '=>' + w.t).join(' | '));
