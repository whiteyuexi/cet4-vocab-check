// 本地 Ollama 适配器：无需 API Key，完全离线可用
// 注意：Ollama 的函数调用能力取决于具体模型，用不了时会走 mock 的降级路径

export function createOllama({ base, model }) {
  const root = (base || 'http://127.0.0.1:11434').replace(/\/$/, '');

  async function chat(messages, opts = {}) {
    const body = {
      model,
      messages,
      stream: !!opts.stream,
      options: { temperature: opts.temperature ?? 0.3 },
    };
    if (opts.tools && opts.tools.length) body.tools = opts.tools;

    const res = await fetch(root + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok) throw new Error('Ollama 返回 ' + res.status + '（确认 ollama serve 已启动、模型已 pull）');
    return opts.stream ? res.body : res.json();
  }

  return { name: 'ollama', model, chat, supportsTools: true };
}
