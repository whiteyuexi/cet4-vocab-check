// capture.js —— 用法: node capture.js <场景名> <宽x高>
const { execFileSync } = require('child_process');
const path = require('path'), fs = require('fs');
const ROOT = __dirname;
const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const args = process.argv.slice(2);
const list = args.length ? args : ['home', 'groups', 'stats', 'result', 'settings', 'test_self'];
execFileSync(process.execPath, [path.join(ROOT, 'shots.js')], { stdio: 'inherit' });
const H = { home: 1500, home_empty: 1100, home_c6: 1400, home_dark: 1300, groups: 1400, groups_mixed: 1100,
  stats: 2800, result: 3000, settings: 1900, test_self: 1100, test_probe: 1200, test_reveal: 1300,
  test_choice: 1300, test_dark: 1300 };
for (const n of list) {
  const src = path.join(ROOT, 'shots', n + '.html');
  if (!fs.existsSync(src)) { console.log('跳过（无此场景）: ' + n); continue; }
  const out = path.join(ROOT, 'shots', n + '.png');
  if (fs.existsSync(out)) fs.unlinkSync(out);
  execFileSync(CH, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-prefers-reduced-motion',
    '--window-size=1200,' + (H[n] || 1400), '--screenshot=' + out, '--virtual-time-budget=2500',
    'file:///' + src.replace(/\\/g, '/')], { stdio: 'ignore' });
  const sz = fs.existsSync(out) ? fs.statSync(out).size : 0;
  console.log((sz ? 'OK   ' : '失败 ') + n + '  ' + sz + ' bytes');
}
