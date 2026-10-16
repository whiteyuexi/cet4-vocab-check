// 模型适配器选择器：改 .env 里的 LLM_PROVIDER 一行即可切换
import { createOpenAICompat } from './openai-compat.mjs';
import { createOllama } from './ollama.mjs';

const PRESETS = {
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    keyName: 'DEEPSEEK_API_KEY',
    modelName: 'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-chat',
  },
  qwen: {
    label: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyName: 'QWEN_API_KEY',
    modelName: 'QWEN_MODEL',
    defaultModel: 'qwen-plus',
  },
  zhipu: {
    label: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    keyName: 'ZHIPU_API_KEY',
    modelName: 'ZHIPU_MODEL',
    defaultModel: 'glm-4-flash',
  },
};

export function createLLM(env) {
  const provider = (env.LLM_PROVIDER || 'deepseek').toLowerCase();

  if (provider === 'ollama') {
    return createOllama({ base: env.OLLAMA_BASE, model: env.OLLAMA_MODEL || 'qwen2.5:7b' });
  }
  if (provider === 'mock') {
    return { name: 'mock', model: 'local-rules', chat: null, supportsTools: false, isMock: true };
  }
  const p = PRESETS[provider];
  if (!p) throw new Error('未知的 LLM_PROVIDER：' + provider + '（可选 deepseek / qwen / zhipu / ollama / mock）');
  return createOpenAICompat({
    name: p.label,
    baseURL: p.baseURL,
    apiKey: env[p.keyName],
    model: env[p.modelName] || p.defaultModel,
  });
}

export function describeLLM(env) {
  const provider = (env.LLM_PROVIDER || 'deepseek').toLowerCase();
  if (provider === 'ollama') return { provider, model: env.OLLAMA_MODEL || 'qwen2.5:7b', needKey: false };
  if (provider === 'mock') return { provider, model: 'local-rules', needKey: false };
  const p = PRESETS[provider];
  if (!p) return { provider, model: '(未知)', needKey: true };
  return { provider, model: env[p.modelName] || p.defaultModel, needKey: !env[p.keyName] };
}
