// 后端服务：诊断 Agent + 静态文件托管（零依赖，仅用 Node 内置模块）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.mjs';
import { createLLM, describeLLM } from './llm/index.mjs';
import { buildTools } from './tools.mjs';
import { runAgent } from './agent.mjs';
import { mockDiagnose } from './mock-diagnose.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = loadEnv();
const PORT = Number(env.PORT || 8787);
const info = describeLLM(env);

let llm = null, llmError = null;
try { llm = createLLM(env); } catch (e) { llmError = e.message; }
const useMock = !llm || llmError || info.needKey || (llm && llm.isMock);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 2e6) reject(new Error('请求体过大')); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(new Error('请求体不是合法 JSON')); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // 统一放行 CORS（本地 file:// 打开前端时也能调用）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ---------- 健康检查 ----------
  if (url.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      provider: info.provider,
      model: info.model,
      mode: useMock ? 'mock' : 'llm',
      reason: useMock ? (llmError || '未配置 API Key，使用本地规则诊断') : '',
      time: new Date().toISOString(),
    });
  }

  // ---------- 诊断 Agent（SSE 流式） ----------
  if (url.pathname === '/api/agent' && req.method === 'POST') {
    let payload;
    try { payload = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }

    const question = String(payload.question || '我现在该怎么提升？').slice(0, 500);
    const tools = buildTools(payload.context || {});

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = obj => res.write('data: ' + JSON.stringify(obj) + '\n\n');

    try {
      if (useMock) {
        send({ type: 'mode', mode: 'mock', note: '本地规则诊断（未调用大模型）' });
        const text = mockDiagnose(tools, question);
        // 分块推送，前端表现与真实模型一致
        for (let i = 0; i < text.length; i += 16) {
          send({ type: 'delta', text: text.slice(i, i + 16) });
          await new Promise(r => setTimeout(r, 12));
        }
        send({ type: 'done', tools: [] });
      } else {
        send({ type: 'mode', mode: 'llm', model: info.model });
        await runAgent({ llm, tools, question, onEvent: send });
      }
    } catch (e) {
      // 模型调用失败时自动降级到本地规则，保证功能不中断
      send({ type: 'error', message: String(e.message || e) });
      try {
        const text = mockDiagnose(tools, question);
        send({ type: 'delta', text: '\n\n（模型调用失败，已自动切换为本地规则诊断）\n\n' + text });
        send({ type: 'done', tools: [], fallback: true });
      } catch (e2) { /* 忽略 */ }
    }
    return res.end();
  }

  // ---------- 静态文件 ----------
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^([.][.][\/\\])+/, ''));
  if (!file.startsWith(ROOT)) return json(res, 403, { error: '禁止访问' });
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  console.log('四六级词汇量检测 · 后端已启动');
  console.log('  地址：http://127.0.0.1:' + PORT);
  console.log('  模型：' + info.provider + ' / ' + info.model);
  console.log('  模式：' + (useMock ? '本地规则诊断（' + (llmError || '未配置 Key') + '）' : '调用大模型'));
  console.log('  健康检查：http://127.0.0.1:' + PORT + '/api/health');
});
