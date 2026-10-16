// 端到端验证：调一次真实 AI 诊断，看 done 事件有没有带回 token 用量
const body = JSON.stringify({ question: '我该怎么提升？重点补哪里？', history: [] });
const res = await fetch('http://127.0.0.1:8787/api/agent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
});
console.log('HTTP ' + res.status + '  ' + res.headers.get('content-type'));
const text = await res.text();
const lines = text.split('\n').filter(l => l.startsWith('data:'));
console.log('数据行 ' + lines.length);
let done = null;
for (const l of lines) {
  let e; try { e = JSON.parse(l.slice(5)); } catch { continue; }
  if (e.type === 'mode') console.log('  mode  ' + JSON.stringify(e));
  if (e.type === 'tool') console.log('  tool  ' + e.name);
  if (e.type === 'done') { done = e; console.log('  done  ' + JSON.stringify(e)); }
  if (e.type === 'error') console.log('  error ' + e.message);
}
console.log(done && done.tokens ? '\n结论：token 用量已回流，本次 ' + done.tokens : '\n结论：done 事件里没有 tokens 字段');
