/* MCP 演示：完全离线，不调任何大模型。
   目的是把「协议层」跑通并留下证据——谁在什么时候发了什么帧，一目了然。

   用法：
     node scripts/mcp-demo.mjs            # 打印流程摘要
     node scripts/mcp-demo.mjs --frames   # 连同原始 JSON-RPC 报文一起打印
*/
import { McpClient } from '../server/mcp-client.mjs';

// 一份最小但真实的上下文：七段里两段有数据、一段全空
const ctx = {
  bankName: '四级大纲',
  bankSize: 4540,
  tested: 812,
  estimate: { point: 4380, low: 4120, high: 4640 },
  bands: [
    { name: '最高频 1k', N: 705, n: 260, p: 0.92 },
    { name: '1k-2k', N: 556, n: 210, p: 0.65 },
    { name: '2k-3k', N: 407, n: 160, p: 0.85 },
    { name: '3k-5k', N: 693, n: 120, p: 0.44 },
    { name: '5k-10k', N: 991, n: 62, p: 0.72 },
    { name: '10k-20k', N: 801, n: 0, p: null },
    { name: '20k 以外', N: 387, n: 0, p: null }
  ],
  weakWords: []
};

const showFrames = process.argv.indexOf('--frames') >= 0;

function line() { console.log('─'.repeat(64)); }

const run = async () => {
  const mcp = new McpClient(ctx);
  await mcp.start();
  try {
    line();
    console.log('① initialize —— 握手，确认协议版本与服务器身份');
    const info = await mcp.initialize();
    console.log('   协议版本 ' + info.protocolVersion + ' · 服务器 ' + info.serverInfo.name + ' v' + info.serverInfo.version);
    console.log('   能力：' + JSON.stringify(info.capabilities));

    line();
    console.log('② tools/list —— 工具由服务器自描述，调用方不需要预先知道有哪些');
    const tools = await mcp.listTools();
    tools.forEach(t => {
      const keys = Object.keys((t.inputSchema && t.inputSchema.properties) || {});
      console.log('   · ' + t.name + '（参数：' + (keys.length ? keys.join(', ') : '无') + '）');
    });

    line();
    console.log('③ tools/call —— 按声明调用');
    const profile = await mcp.callTool('get_profile', {});
    console.log('   get_profile → 覆盖率 ' + profile.coverage + '%，估算 ' +
      (profile.estimate ? profile.estimate.point + '（' + profile.estimate.low + '–' + profile.estimate.high + '）' : '暂无'));

    const bands = await mcp.callTool('get_band_profile', {});
    const rows = bands.bands || [];
    const weakest = rows.filter(r => r.mastery !== null).sort((a, b) => a.mastery - b.mastery)[0];
    console.log('   get_band_profile → ' + rows.length + ' 段，最弱的是 ' +
      (weakest ? weakest.band + '（' + weakest.mastery + '%）' : '无'));

    line();
    console.log('④ 错误路径 —— 调一个不存在的工具，服务器返回 isError 而不是崩溃');
    try {
      await mcp.callTool('not_a_tool', {});
      console.log('   ✗ 居然成功了，说明错误处理有问题');
    } catch (e) {
      console.log('   ✓ 捕获到错误：' + e.message);
    }

    line();
    console.log('结论：8 个工具已可被任何 MCP 宿主发现并调用，不依赖本项目的前端。');

    if (showFrames) {
      line();
      console.log('原始报文（out = 客户端发出，in = 服务器返回）');
      mcp.trace.forEach(t => {
        const s = JSON.stringify(t.msg);
        console.log((t.dir === 'out' ? '→ ' : '← ') + (s.length > 300 ? s.slice(0, 300) + '…' : s));
      });
    }
  } finally {
    mcp.close();
  }
};

run().catch(e => {
  console.error('演示失败：', e.message);
  process.exit(1);
});
