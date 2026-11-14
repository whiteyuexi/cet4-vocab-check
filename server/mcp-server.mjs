// MCP 服务器：把「词汇量诊断」的 8 个工具按 Model Context Protocol 暴露出去。
//
// 传输：stdio + 换行分隔的 JSON-RPC 2.0（MCP 规定的本地传输方式）。
// 上下文：工具依赖调用者的真实数据，所以启动时通过环境变量 DSH_CTX 传入一段 JSON。
//
// 这样任何兼容 MCP 的宿主（Claude Desktop / Cursor / 自己的 Agent）都能发现并调用这些工具，
// 而不是把工具写死在某一个应用里。
import { buildTools } from './tools.mjs';

const SERVER_INFO = { name: 'cet-vocab-diagnosis', version: '1.0.0' };
const PROTOCOL = '2024-11-05';

let ctx = {};
try {
  ctx = JSON.parse(process.env.DSH_CTX || '{}');
} catch (e) {
  ctx = {};
}
const tools = buildTools(ctx);

// OpenAI 风格的工具定义 → MCP 的 inputSchema
const mcpTools = (tools.schema || []).map(t => ({
  name: t.function.name,
  description: t.function.description,
  inputSchema: t.function.parameters || { type: 'object', properties: {} }
}));

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}
function fail(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function handle(msg) {
  const { id, method, params } = msg;
  // 通知类消息没有 id，不需要回应
  if (method === 'notifications/initialized' || method === 'initialized') return;
  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO
    });
  }
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: mcpTools });
  if (method === 'tools/call') {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    const fn = (tools.api || {})[name];
    if (typeof fn !== 'function') {
      return reply(id, { content: [{ type: 'text', text: '未知工具：' + name }], isError: true });
    }
    try {
      const out = fn(args);
      return reply(id, {
        content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out) }],
        isError: false
      });
    } catch (e) {
      return reply(id, { content: [{ type: 'text', text: '工具执行失败：' + e.message }], isError: true });
    }
  }
  if (id !== undefined) fail(id, -32601, 'Method not found: ' + method);
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    handle(msg);
  }
});
process.stdin.on('end', () => process.exit(0));
