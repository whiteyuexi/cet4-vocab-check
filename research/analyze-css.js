const fs = require('fs');
const path = require('path');
const DIR = path.join(process.env.TEMP, 'design', 'sites');

function counter(re, text, transform) {
  const m = {};
  for (const x of text.matchAll(re)) {
    let k = transform ? transform(x) : x[1];
    if (!k) continue;
    k = k.trim();
    if (!k) continue;
    m[k] = (m[k] || 0) + 1;
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.css'))) {
  const css = fs.readFileSync(path.join(DIR, f), 'utf8');
  const name = f.replace('.css', '');
  console.log('\n===== ' + name + '  (' + Math.round(css.length / 1024) + ' KB) =====');

  const fonts = counter(/font-family\s*:\s*([^;}\n]{5,120})/gi, css).slice(0, 3);
  console.log('字体  : ' + (fonts.map(x => x[0].replace(/\s+/g, ' ').slice(0, 78) + ' ×' + x[1]).join('\n          ') || '—'));

  const radii = counter(/border-radius\s*:\s*([^;}\n]{1,26})/gi, css).slice(0, 5);
  console.log('圆角  : ' + (radii.map(x => x[0] + '×' + x[1]).join('  ') || '—'));

  const sh = counter(/box-shadow\s*:\s*([^;}\n]{5,80})/gi, css).slice(0, 3);
  console.log('阴影  : ' + (sh.map(x => x[0].slice(0, 52) + '×' + x[1]).join('\n          ') || '无'));

  const grads = (css.match(/linear-gradient\([^)]*\)/gi) || []).slice(0, 3);
  console.log('渐变  : ' + (grads.length ? grads.map(g => g.slice(0, 62)).join('\n          ') : '无'));

  // 颜色统计（跳过纯黑/纯白/灰阶）
  const colors = counter(/#[0-9a-f]{6}\b/gi, css, m => m[0].toLowerCase());
  const colorful = colors.filter(([c]) => {
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    return Math.max(r, g, b) - Math.min(r, g, b) > 24;   // 有彩度的才算
  }).slice(0, 6);
  console.log('彩色  : ' + (colorful.map(x => x[0] + '×' + x[1]).join('  ') || '几乎全灰阶'));
  const grayRatio = Math.round((1 - colorful.reduce((s, x) => s + x[1], 0) / Math.max(1, colors.reduce((s, x) => s + x[1], 0))) * 100);
  console.log('灰阶占比: ' + grayRatio + '%');

  // 设计变量
  const vars = [...css.matchAll(/--(color|colour|bg|background|text|ink|surface|border|radius|space|font)[a-z0-9-]*\s*:\s*([^;}\n]{1,40})/gi)]
    .map(m => '--' + m[1].toLowerCase() + '…: ' + m[2].trim().slice(0, 30));
  console.log('设计变量: ' + (vars.length ? vars.slice(0, 6).join(' | ') : '无'));
}
