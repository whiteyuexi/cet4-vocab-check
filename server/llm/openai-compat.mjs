// OpenAI 兼容协议的通用适配器：DeepSeek / 通义千问 / 智谱 都走这里
// 差异只在 baseURL、模型名和少量参数，靠传入的配置区分。

export function createOpenAICompat({ name, baseURL, apiKey, model, extraHeaders = {} }) {
  if (!apiKey) throw new Error(name + ' 缺少 API Key（请在 .env 中配置）');

  async function chat(messages, opts = {}) {
    const body = {
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 1200,
      stream: !!opts.stream,
    };
    if (opts.tools && opts.tools.length) {
      body.tools = opts.tools;
      body.tool_choice = 'auto';
    }

    const res = await fetch(baseURL.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      }, extraHeaders),
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(name + ' 接口返回 ' + res.status + '：' + txt.slice(0, 300));
    }
    return opts.stream ? res.body : res.json();
  }

  return { name, model, chat, supportsTools: true };
}
