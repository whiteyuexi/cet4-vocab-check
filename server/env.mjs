// 极简 .env 读取器（零依赖）。只解析 KEY=VALUE，忽略注释与空行。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv() {
  const file = path.join(ROOT, '.env');
  const env = {};
  try {
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 0) continue;
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  } catch (e) { /* 没有 .env 时用系统环境变量 */ }
  return Object.assign({}, env, process.env);
}
