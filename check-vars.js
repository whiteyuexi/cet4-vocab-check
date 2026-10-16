const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'src');
const css = fs.readFileSync(path.join(dir, 'app.css'), 'utf8');
const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1].toLowerCase()));
console.log('CSS 定义 (' + defined.size + '): ' + [...defined].sort().join(' '));
const used = {};
const lines = {};
for (const f of fs.readdirSync(dir)) {
  if (!/\.(js|html)$/.test(f)) continue;
  const t = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  t.forEach((ln, i) => {
    for (const m of ln.matchAll(/var\((--[a-z0-9-]+)\)/gi)) {
      const v = m[1].toLowerCase();
      (used[v] = used[v] || new Set()).add(f);
      if (!defined.has(v)) (lines[v] = lines[v] || []).push(f + ':' + (i+1) + '  ' + ln.trim().slice(0,150));
    }
  });
}
const missing = Object.keys(used).filter(v => !defined.has(v));
console.log('\n=== 真正缺失: ' + missing.length + ' 个 ===');
for (const v of missing) {
  console.log('\n' + v + '  (' + [...used[v]].join(',') + ')');
  lines[v].forEach(x => console.log('    ' + x));
}
