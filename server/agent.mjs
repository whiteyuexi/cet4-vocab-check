// 诊断 Agent：带工具调用的多轮循环
// 关键约束：模型只负责解释与规划，所有数字来自 tools.mjs 的返回值，Prompt 中明确禁止自行估算。

const SYSTEM_PROMPT = [
  '你是一位英语词汇学习诊断教练，服务于备考四六级的大学生。',
  '',
  '【硬性规则】',
  '1. 所有数字必须来自工具返回值。禁止自己计算、估算或编造任何数值。',
  '   例外：用户提问里以「界面显示」标注的数字来自他自己的界面统计，是可核对的，可以直接引用。',
  '2. 先调用工具获取数据，再基于数据作答。不要凭印象回答。',
  '3. 绝对不要在回答里提到工具名称（例如 get_profile、get_band_profile、plan_schedule）。用户看不到这些内部函数，提到它们会造成困惑。需要数据时直接调用即可，不要向用户解释你调用了什么。',
  '4. 不要对工具没有提供的信息下判断（例如"应该达到多少分""距理想线还差多少"）。',
  '5. 回答要具体、可执行：指出薄弱在哪一段、建议先做什么、预计需要多少词/多少天。',
  '6. 用中文回答，语气专业但不啰嗦。总长度控制在 300 字以内，除非用户要求展开。',
  '7. 不要使用 Markdown 的代码格式（反引号），可以用加粗和短横线列表。',
  '8. 回答结束后，如果存在明确的下一步，调用 suggest_actions 给出 1-3 个可点击动作（跳页面 / 开一轮摸底 / 复测某频段 / 替用户追问）。没有明确的下一步就不要调用。',
  '',
  '【输出结构】',
  '先用一句话给判断，再用 2-4 条要点给出依据，最后给一条明确可执行的动作建议。',
].join('\n');

/** 执行一次工具调用 */
function execTool(tools, call) {
  const name = call.function && call.function.name;
  let args = {};
  try { args = JSON.parse(call.function.arguments || '{}'); } catch (e) { args = {}; }
  const fn = tools.api[name];
  if (!fn) return { error: '未知工具：' + name };
  try {
    // 工具签名不统一，按名称分派参数
    if (name === 'suggest_actions') return fn(args.actions);
    if (name === 'get_examples') return fn(args.word);
    if (name === 'get_weak_examples') return fn(args.limit);
    if (name === 'plan_schedule') return fn(args.days, args.wordsPerDay);
    if (name === 'get_weak_words') return fn(args.band, args.limit);
    return fn();
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

/**
 * 运行诊断 Agent
 * @param llm     适配器（server/llm/index.mjs 创建）
 * @param tools   buildTools() 的返回值
 * @param question 用户提出的问题
 * @param onEvent 回调：{type:'tool'|'delta'|'done', ...}
 */
export async function runAgent({ llm, tools, question, history, onEvent }) {
  // 多轮对话：把之前几轮带上，但每轮重新调用工具拿最新数据（数据可能已经变了）
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  const hist = Array.isArray(history) ? history.slice(-6) : [];
  for (const h of hist) {
    if (!h || !h.content) continue;
    const role = h.role === 'assistant' ? 'assistant' : 'user';
    // 只保留纯文本，避免把上一轮的工具调用结构带进来干扰
    messages.push({ role, content: String(h.content).slice(0, 2000) });
  }
  messages.push({ role: 'user', content: question });
  const MAX_TOOL_ROUNDS = 3;
  const usedTools = [];
  let tokens = 0;                       // 本次诊断累计消耗的 token，随 done 事件回传前端

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await llm.chat(messages, { stream: false, tools: tools.schema, maxTokens: 1000 });
    if (data.usage && data.usage.total_tokens) tokens += data.usage.total_tokens;
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new Error('模型返回格式异常');
    const calls = msg.tool_calls || [];

    if (!calls.length) {
      // 模型已直接给出答案（没有调工具），按块推给前端
      const text = msg.content || '';
      for (const piece of chunk(text, 18)) onEvent({ type: 'delta', text: piece });
      onEvent({ type: 'done', tools: usedTools, tokens });
      return text;
    }

    // 执行工具并回填结果
    messages.push({ role: 'assistant', content: msg.content || null, tool_calls: calls });
    for (const c of calls) {
      const result = execTool(tools, c);
      usedTools.push({ name: c.function.name, args: c.function.arguments });
      onEvent({ type: 'tool', name: c.function.name, args: c.function.arguments, result });
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }

  // 达到工具轮上限：强制一次不带工具的流式回答
  messages.push({ role: 'user', content: '请基于以上工具返回的数据，直接给出最终诊断与建议。' });
  const stream = await llm.chat(messages, { stream: true, maxTokens: 1000 });
  let full = '';
  for await (const evt of parseSSE(stream)) {
      if (evt.usage && evt.usage.total_tokens) tokens += evt.usage.total_tokens;
    const delta = evt.choices && evt.choices[0] && evt.choices[0].delta;
    if (delta && delta.content) { full += delta.content; onEvent({ type: 'delta', text: delta.content }); }
  }
  onEvent({ type: 'done', tools: usedTools, tokens });
  return full;
}

/** 解析 SSE 流 */
export async function* parseSSE(body) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') return;
      try { yield JSON.parse(payload); } catch (e) { /* 跳过非 JSON 行 */ }
    }
  }
}

/** 把文本切成小块，用于给前端制造逐字出现的效果 */
function chunk(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [''];
}
