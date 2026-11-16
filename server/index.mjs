// 后端服务：诊断 Agent + 静态文件托管（零依赖，仅用 Node 内置模块）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.mjs';
import { createLLM, describeLLM } from './llm/index.mjs';
import { buildTools } from './tools.mjs';
import { runAgent } from './agent.mjs';
import { McpClient } from './mcp-client.mjs';
import { createQuota } from './quota.mjs';
import { mockDiagnose } from './mock-diagnose.mjs';
import { corpusStats, examplesFor, searchByText } from './corpus.mjs';

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
      corpus: corpusStats(),
      quota: quota.stats(),
      time: new Date().toISOString(),
    });
  }

  // ---------- 例句检索（RAG 的检索端） ----------
  if (url.pathname === '/api/examples') {
    const word = url.searchParams.get('word');
    const q = url.searchParams.get('q');
    const limit = Math.min(Number(url.searchParams.get('limit') || 2), 10);
    if (word) {
      const ex = examplesFor(word, limit);
      return json(res, 200, { word, count: ex.length, examples: ex, source: 'Tatoeba (CC-BY 2.0 FR)' });
    }
    if (q) {
      const ex = searchByText(q, limit);
      return json(res, 200, { query: q, count: ex.length, examples: ex, source: 'Tatoeba (CC-BY 2.0 FR)' });
    }
    return json(res, 400, { error: '请提供 word 或 q 参数' });
  }

  // ---------- 诊断 Agent（SSE 流式） ----------
  /* 离线路径用的中文标签：和 agent.mjs 里的 TOOL_LABEL 保持一致 */
  const TOOL_LABEL_ZH = {
    get_profile: '读取整体情况（覆盖率与区间）',
    get_band_profile: '读取七段词频的掌握率',
    get_weak_words: '取出未掌握词清单',
    plan_schedule: '按剩余词量与天数排复习计划',
    list_banks: '查看可用词库',
    suggest_actions: '给出可点的下一步动作',
    get_examples: '检索真实例句',
    get_weak_examples: '为薄弱词批量找例句',
  get_listen_profile: '对比听力与阅读的差距'
  };

/* 演示额度：规则与测试在 server/quota.mjs（node scripts/quota-test.mjs 可验） */
const quota = createQuota({
  perIp: Number(process.env.DEMO_PER_IP_DAY || 25),
  total: Number(process.env.DEMO_TOTAL_DAY || 400)
});
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}  if (url.pathname === '/api/agent' && req.method === 'POST') {
    let payload;
    try { payload = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }

    const question = String(payload.question || '我现在该怎么提升？').slice(0, 500);
    const history = Array.isArray(payload.history) ? payload.history : [];
    const tools = buildTools(payload.context || {});

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = obj => res.write('data: ' + JSON.stringify(obj) + '\n\n');

    /* 额度检查放在真正开始之前：超了就直接给一句人话，不花钱、不调模型 */
    /* 只有真调模型的请求才计额度：本地规则诊断不花钱，不该被限 */
    const ip = clientIp(req);
    const gate = quota.check(ip);
    if (!useMock && !gate.ok) {
      send({ type: 'error', message: gate.message + '。演示是为了让评委看到 AI 的真实效果，所以设了上限；本地运行 node server/index.mjs 可以无限次。' });
      send({ type: 'done', tools: [] });
      return res.end();
    }
    if (!useMock) quota.consume(ip);

    try {
      if (useMock) {
        send({ type: 'mode', mode: 'mock', note: '本地规则诊断（未调用大模型）' });
        /* 离线路径也要摊开计划——但步骤必须是真的：包一层 api，
           记录 mockDiagnose 实际调用了哪些工具，再用这些生成计划。 */
        const used = [];
        const origApi = tools.api;
        tools.api = new Proxy(origApi || {}, {
          get(t, k) {
            const fn = t[k];
            if (typeof fn !== 'function') return fn;
            return function () { used.push(k); return fn.apply(t, arguments); };
          }
        });
        let text;
        try { text = mockDiagnose(tools, question); }
        finally { tools.api = origApi; }
        if (used.length) {
          send({ type: 'plan', steps: used.map(function (k) { return TOOL_LABEL_ZH[k] || k; }) });
          used.forEach(function (k, i) { send({ type: 'step', i: i, status: 'done' }); });
        }
        // 分块推送，前端表现与真实模型一致
        for (let i = 0; i < text.length; i += 16) {
          send({ type: 'delta', text: text.slice(i, i + 16) });
          await new Promise(r => setTimeout(r, 12));
        }
        send({ type: 'done', tools: [] });
      } else {
        send({ type: 'mode', mode: 'llm', model: info.model });
        /* USE_MCP=1 时，工具调用改走 MCP 协议：服务器自描述工具，客户端按声明调用 */
        let runner = null, mcp = null;
        if (process.env.USE_MCP === '1') {
          mcp = new McpClient(payload.context || {});
          try {
            await mcp.start();
            const info2 = await mcp.initialize();
            const list = await mcp.listTools();
            send({ type: 'mode', mode: 'llm', model: info2.serverInfo.name + ' · MCP（' + list.length + ' 个工具）' });
            runner = async function (call) {
              var name = call.function.name;
              var args = {};
              try { args = call.function.arguments ? JSON.parse(call.function.arguments) : {}; } catch (e) { args = {}; }
              return await mcp.callTool(name, args);
            };
          } catch (e) {
            send({ type: 'delta', text: '（MCP 未启动，已回退到本地工具：' + e.message + '）\n' });
            mcp = null;
          }
        }
        try {
          await runAgent({ llm, tools, question, history, onEvent: send, runner: runner });
        } finally {
          if (mcp) mcp.close();
        }
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
  const cs = corpusStats();
  console.log('  例句语料：' + (cs.loaded ? (cs.words + ' 词 / ' + cs.sentences + ' 句') : '未加载（运行 node build-corpus.js）'));
  console.log('  健康检查：http://127.0.0.1:' + PORT + '/api/health');
});
