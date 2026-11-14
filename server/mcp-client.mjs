// MCP 客户端：启动 mcp-server 子进程，通过 stdio 完成 initialize → tools/list → tools/call。
//
// 和「直接调函数」的区别：工具不再写死在调用方，而是由服务器**自描述**（tools/list），
// 调用方按声明去调（tools/call）。换一个 MCP 服务器，这个客户端不用改。
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'server', 'mcp-server.mjs');

export class McpClient {
  constructor(ctx, serverPath) {
    this.ctx = ctx || {};
    this.serverPath = serverPath || SERVER;
    this.nextId = 1;
    this.pending = new Map();
    this.child = null;
    this.buffer = '';
    this.trace = [];   // 记录真实报文，便于在文档里给出证据
  }

  start() {
    return new Promise((resolve, reject) => {
      this.child = spawn(process.execPath, [this.serverPath], {
        env: Object.assign({}, process.env, { DSH_CTX: JSON.stringify(this.ctx) }),
        stdio: ['pipe', 'pipe', 'inherit']
      });
      this.child.on('error', reject);
      this.child.stdout.setEncoding('utf8');
      this.child.stdout.on('data', chunk => {
        this.buffer += chunk;
        let nl;
        while ((nl = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, nl).trim();
          this.buffer = this.buffer.slice(nl + 1);
          if (!line) continue;
          let msg;
          try { msg = JSON.parse(line); } catch (e) { continue; }
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const { resolve: ok, reject: bad } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) bad(new Error(msg.error.message));
            else ok(msg.result);
          }
        }
      });
      // 给子进程一点时间就绪；MCP 没有就绪握手，第一帧请求会自然排队
      setTimeout(resolve, 60);
    });
  }

  request(method, params) {
    const id = this.nextId++;
    const msg = { jsonrpc: '2.0', id, method };
    if (params !== undefined) msg.params = params;
    this.trace.push({ dir: 'out', msg });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify(msg) + '\n');
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('MCP 请求超时：' + method));
        }
      }, 5000);
    });
  }

  notify(method) {
    const msg = { jsonrpc: '2.0', method };
    this.trace.push({ dir: 'out', msg });
    this.child.stdin.write(JSON.stringify(msg) + '\n');
  }

  async initialize() {
    const res = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cet-vocab-web', version: '1.0.0' }
    });
    this.trace.push({ dir: 'in', msg: res });
    this.notify('notifications/initialized');
    return res;
  }

  async listTools() {
    const res = await this.request('tools/list', {});
    this.trace.push({ dir: 'in', msg: res });
    return res.tools || [];
  }

  async callTool(name, args) {
    const res = await this.request('tools/call', { name, arguments: args || {} });
    this.trace.push({ dir: 'in', msg: res });
    const text = (res.content && res.content[0] && res.content[0].text) || '';
    if (res.isError) throw new Error(text);
    try { return JSON.parse(text); } catch (e) { return text; }
  }

  close() {
    if (this.child) {
      try { this.child.stdin.end(); } catch (e) {}
      try { this.child.kill(); } catch (e) {}
      this.child = null;
    }
  }
}
