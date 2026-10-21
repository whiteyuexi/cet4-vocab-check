// scripts/make-ai-lock.mjs — 用「你自己设的密码」把 API Key 加密后嵌进单文件
//
// 需求：文件发给别人时，AI 大模型诊断要花钱（作者的额度），所以必须作者授权。
// 做法：离线规则诊断对所有人免费；要用真模型，对方得输入作者提供的密码。
//      密码正确 → 浏览器用 PBKDF2 派生出密钥、AES-GCM 解出 API Key → 直接调模型厂商。
//
// 为什么这样是安全的（以及它安全的边界）：
//   · 明文 Key 从不进入产物。HTML 里只有密文（salt / iv / ct），有人在文件里搜 "sk-" 搜不到。
//   · 解出来的 Key 只存在内存里，刷新页面即失效——授权是「这一次打开」而不是永久。
//   · 边界：密文是公开的，所以**密码强度就是全部防线**。这是离线加密绕不开的性质，
//     所以脚本会强制要求至少 12 位，并明确提示用长口令而不是 4 位数字。
//   · Key 一旦泄露可去厂商后台轮换，然后重新跑一次本脚本即可。
//
// 用法：
//   node scripts/make-ai-lock.mjs "你的密码"        # 生成密文并内联进 index.html
//   node scripts/make-ai-lock.mjs "你的密码" --no-build   # 只生成密文，不构建
//   node scripts/make-ai-lock.mjs --off             # 清掉授权（产物变回纯离线版）
// 产物：private/ai-lock.json（已 gitignore）→ 由 build.js 内联为 window.AI_LOCK
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTDIR = path.join(ROOT, 'private');
const OUTFILE = path.join(OUTDIR, 'ai-lock.json');
const ITER = 600000;                 // PBKDF2-SHA256 迭代次数（OWASP 2023 建议值）
const MIN_LEN = 12;

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const forceWeak = args.includes('--force-weak');   // 明知弱密码仍要生成（会打印风险估算）
const password = args.find(a => !a.startsWith('--'));

function readEnv() {
  const env = {};
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    txt.split(/\r?\n/).forEach(line => {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    });
  } catch (e) { /* .env 不存在就只认环境变量 */ }
  return { ...env, ...process.env };
}

function deriveKey(pass, salt) {
  return crypto.pbkdf2Sync(Buffer.from(pass, 'utf8'), salt, ITER, 32, 'sha256');
}

if (args.includes('--off')) {
  if (fs.existsSync(OUTFILE)) { fs.unlinkSync(OUTFILE); console.log('已删除 private/ai-lock.json（AI 授权锁已撤销）'); }
  else console.log('本来就没有锁');
  if (!noBuild) execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'inherit', cwd: ROOT });
  console.log('产物已重建：现在发给别人只有离线规则诊断，用不了你的额度。');
  process.exit(0);
}

if (!password) {
  console.error('用法: node scripts/make-ai-lock.mjs "你自己定的密码" [--no-build]');
  console.error('      node scripts/make-ai-lock.mjs --off        # 撤销授权');
  process.exit(1);
}
// 密文是公开的：密码强度就是唯一防线，所以先把代价算给使用者看
function crackClock(len, charset) {
  const combos = Math.pow(charset, len);
  const guessPerSec = 22e9 / (2 * ITER);          // 单张 4090 的粗估：约 1.8 万次/秒
  const s = combos / guessPerSec;
  if (s < 60) return Math.round(s) + ' 秒';
  if (s < 3600) return (s / 60).toFixed(1) + ' 分钟';
  if (s < 86400) return (s / 3600).toFixed(1) + ' 小时';
  if (s < 86400 * 365) return (s / 86400).toFixed(1) + ' 天';
  return (s / 86400 / 365).toExponential(1) + ' 年';
}
const looksNumeric = /^\d+$/.test(password);
const est = crackClock(password.length, looksNumeric ? 10 : 42);
if (password.length < MIN_LEN && !forceWeak) {
  console.error('密码只有 ' + password.length + ' 位，单张显卡离线爆破约 ' + est + '。');
  console.error('密文会公开在 HTML 里（谁拿到文件都能离线跑字典，没有速率限制），');
  console.error('所以密码强度就是唯一防线——太短等于没锁，被爆破后刷的是你自己的额度。');
  console.error('');
  console.error('建议：把 666666 塞进一句长口令里，例如  cet46-666666-whale  （18 位，约 ' +
    crackClock(18, 42) + '）');
  console.error('确实要用短密码，加 --force-weak 明确接受风险。');
  process.exit(1);
}
if (password.length < MIN_LEN) {
  console.log('⚠ 已按 --force-weak 生成：密码 ' + password.length + ' 位，离线爆破约 ' + est + '。');
  console.log('⚠ 这份产物的 Key 等于半公开状态，请自行控制分发范围，事后可轮换 Key。');
}

const env = readEnv();
const key = env.DEEPSEEK_API_KEY || env.OPENAI_API_KEY || '';
if (!key) {
  console.error('没找到 API Key：请在 .env 里设置 DEEPSEEK_API_KEY=sk-...');
  process.exit(1);
}
const model = env.DEEPSEEK_MODEL || 'deepseek-chat';
const base = (env.DEEPSEEK_BASE || 'https://api.deepseek.com').replace(/\/$/, '');

const payload = JSON.stringify({ k: key, m: model, b: base });
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const dk = deriveKey(password, salt);
const cipher = crypto.createCipheriv('aes-256-gcm', dk, iv);
const ct = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();

fs.mkdirSync(OUTDIR, { recursive: true });
const blob = {
  v: 1,
  it: ITER,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  ct: Buffer.concat([ct, tag]).toString('base64'),   // GCM 的认证标签附在密文尾部
  note: '密码错误时 AES-GCM 认证失败，解不出任何东西——不用另外存校验值',
};
fs.writeFileSync(OUTFILE, JSON.stringify(blob, null, 2));

// 自检：用同一密码往返解一次，确认能拿回原文（避免做出一个"谁也解不开"的锁）
{
  const d2 = deriveKey(password, Buffer.from(blob.salt, 'base64'));
  const raw = Buffer.from(blob.ct, 'base64');
  const dec = crypto.createDecipheriv('aes-256-gcm', d2, Buffer.from(blob.iv, 'base64'));
  dec.setAuthTag(raw.subarray(raw.length - 16));
  const back = Buffer.concat([dec.update(raw.subarray(0, raw.length - 16)), dec.final()]).toString('utf8');
  if (back !== payload) { console.error('自检失败：加密后解不回原文，已中止'); process.exit(1); }
  // 再用错密码试一次，必须失败
  let ok = false;
  try {
    const d3 = deriveKey(password + 'x', Buffer.from(blob.salt, 'base64'));
    const bad = crypto.createDecipheriv('aes-256-gcm', d3, Buffer.from(blob.iv, 'base64'));
    bad.setAuthTag(raw.subarray(raw.length - 16));
    Buffer.concat([bad.update(raw.subarray(0, raw.length - 16)), bad.final()]);
    ok = true;
  } catch (e) { /* 期望抛错 */ }
  if (ok) { console.error('自检失败：错误密码竟然解开了，已中止'); process.exit(1); }
}

console.log('已生成加密授权：private/ai-lock.json');
console.log('  模型:', model, '| 迭代:', ITER, '| 密码长度:', password.length, '位');
console.log('  产物里只会有密文；明文 Key 不落盘、不进仓库。');
console.log('  提醒：密码请单独发给要授权的人；改了密码或轮换了 Key 都要重跑本脚本。');

if (!noBuild) {
  execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'inherit', cwd: ROOT });
  console.log('\nindex.html 已重建，锁已内联。记得同步桌面副本。');
}
