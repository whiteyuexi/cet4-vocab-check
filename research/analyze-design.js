const fs = require('fs');
const path = require('path');
const DIR = path.join(process.env.TEMP, 'design', 'sites');

function analyze(name, html) {
  // 收集内联样式
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  // 字体
  const fonts = {};
  for (const m of styles.matchAll(/font-family\s*:\s*([^;}\n]+)/gi)) {
    const v = m[1].trim().replace(/["']/g, '').slice(0, 90);
    fonts[v] = (fonts[v] || 0) + 1;
  }
  const topFonts = Object.entries(fonts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  // 颜色
  const colors = {};
  for (const m of styles.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const c = '#' + m[1].toLowerCase();
    colors[c] = (colors[c] || 0) + 1;
  }
  const topColors = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 6);
  // 圆角
  const radii = {};
  for (const m of styles.matchAll(/border-radius\s*:\s*([^;}\n]+)/gi)) {
    const v = m[1].trim().slice(0, 24);
    radii[v] = (radii[v] || 0) + 1;
  }
  const topRadii = Object.entries(radii).sort((a, b) => b[1] - a[1]).slice(0, 4);
  // 阴影与渐变
  const shadows = (styles.match(/box-shadow\s*:/gi) || []).length;
  const grads = (styles.match(/linear-gradient|radial-gradient/gi) || []).length;
  const blurs = [...styles.matchAll(/blur\((\d+)px\)/gi)].map(m => +m[1]);
  const maxBlur = blurs.length ? Math.max(...blurs) : 0;
  // emoji
  const emoji = (html.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;

  console.log('=== ' + name + ' ===');
  console.log('  字体  : ' + (topFonts.map(f => f[0].slice(0, 62) + ' ×' + f[1]).join('  |  ') || '（无内联样式）'));
  console.log('  主色  : ' + (topColors.map(c => c[0] + '×' + c[1]).join('  ') || '—'));
  console.log('  圆角  : ' + (topRadii.map(r => r[0] + '×' + r[1]).join('  ') || '—'));
  console.log('  阴影数: ' + shadows + '   渐变数: ' + grads + '   最大模糊: ' + maxBlur + 'px   emoji: ' + emoji);
}

for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.html')) continue;
  const name = f.replace('.html', '');
  try { analyze(name, fs.readFileSync(path.join(DIR, f), 'utf8')); }
  catch (e) { console.log('=== ' + name + ' === 读取失败: ' + e.message); }
}
