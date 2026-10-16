// Agent 工具层
// 设计原则：模型只负责"把数据翻译成人话和计划"，所有数字一律由这些工具提供。
// 上下文（ctx）由前端在用户点击「AI 诊断」时上传，仅包含汇总数据，不含逐题原始作答。

export function buildTools(ctx) {
  const bands = ctx.bands || [];
  const weak = ctx.weakWords || [];

  const api = {
    get_profile() {
      return {
        bank: ctx.bankName,
        bankSize: ctx.bankSize,
        tested: ctx.tested,
        coverage: ctx.tested && ctx.bankSize ? +(ctx.tested / ctx.bankSize * 100).toFixed(1) : 0,
        estimate: ctx.estimate || null,
        strictVocab: ctx.strictVocab ?? null,
        looseVocab: ctx.looseVocab ?? null,
        interval: ctx.interval || null,
        sampleSize: ctx.sampleSize || 0,
        note: ctx.estimateNote || '',
        untested: Math.max(0, (ctx.bankSize || 0) - (ctx.tested || 0)),
      };
    },
    get_band_profile() {
      const rows = bands.map(b => ({
        band: b.name,
        mastery: b.p === null ? null : Math.round(b.p * 100),
        total: b.N,
        sampled: b.n,
      }));
      // 汇总值由程序算好，避免模型自己做加法
      return {
        bands: rows,
        summary: {
          bandCount: rows.length,
          totalWords: rows.reduce((s, r) => s + r.total, 0),
          weakest: rows.filter(r => r.mastery !== null).sort((a, b) => a.mastery - b.mastery)[0] || null,
          strongest: rows.filter(r => r.mastery !== null).sort((a, b) => b.mastery - a.mastery)[0] || null,
          lowBandsTotal: rows.filter(r => r.mastery !== null && r.mastery < 85).reduce((s, r) => s + r.total, 0),
        },
      };
    },
    get_weak_words(band, limit) {
      let list = weak;
      if (band) list = list.filter(w => w.band === band);
      const n = Math.min(limit || 20, list.length);
      return { count: list.length, words: list.slice(0, n).map(w => ({ word: w.w, meaning: w.t, band: w.band, status: w.status })) };
    },
    plan_schedule(days, wordsPerDay) {
      const remaining = Math.max(0, ctx.bankSize - ctx.tested);
      const d = Math.max(1, days || 7);
      const perDay = wordsPerDay || Math.ceil(remaining / d / 10) * 10;
      return {
        remainingWords: remaining,
        days: d,
        wordsPerDay: perDay,
        feasible: perDay * d >= remaining,
        suggestion: perDay * d >= remaining
          ? '按每天 ' + perDay + ' 词，' + d + ' 天可以过完剩余词库'
          : '每天 ' + perDay + ' 词需要 ' + Math.ceil(remaining / perDay) + ' 天，建议提高每日量或延长时间',
      };
    },
    list_banks() {
      return { current: ctx.bankName, available: ctx.availableBanks || [] };
    },
  };

  // 暴露给模型的函数签名（OpenAI function calling 格式）
  const schema = [
    { name: 'get_profile', description: '获取当前词库的整体情况：规模、已测数量、覆盖率、词汇量估算与置信区间', parameters: { type: 'object', properties: {} } },
    { name: 'get_band_profile', description: '获取按词频段的掌握率明细，用于定位薄弱频段', parameters: { type: 'object', properties: {} } },
    { name: 'get_weak_words', description: '获取未掌握的单词清单，可按词频段筛选', parameters: { type: 'object', properties: { band: { type: 'string', description: '词频段名称，例如 5k-10k；不传则返回全部' }, limit: { type: 'number', description: '最多返回多少个，默认 20' } } } },
    { name: 'plan_schedule', description: '根据剩余词量与天数生成复习计划', parameters: { type: 'object', properties: { days: { type: 'number', description: '计划天数' }, wordsPerDay: { type: 'number', description: '每天词数，不传则自动计算' } } } },
    { name: 'list_banks', description: '列出可用的词库', parameters: { type: 'object', properties: {} } },
  ].map(t => ({ type: 'function', function: t }));

  return { api, schema };
}
