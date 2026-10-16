// 本地规则诊断：不依赖任何模型，直接由统计数据生成结论。
// 用途有两个：① 没配 API Key 时也能跑通整条链路；② 模型服务不可用时的降级方案（演示不翻车）。

export function mockDiagnose(tools, question) {
  const p = tools.api.get_profile();
  const bands = tools.api.get_band_profile();
  const withData = bands.filter(b => b.mastery !== null && b.sampled > 0);
  const worst = withData.slice().sort((a, b) => a.mastery - b.mastery)[0];
  const best = withData.slice().sort((a, b) => b.mastery - a.mastery)[0];
  const weak = tools.api.get_weak_words(worst ? worst.band : '', 8);
  const plan = tools.api.plan_schedule(7);

  const L = [];
  if (p.interval) {
    L.push('【判断】你在' + p.bank + '的词汇量约为 ' + (p.looseVocab || '?') + ' 词，95% 区间 ' +
      p.interval[0] + ' ~ ' + p.interval[1] + '，目前覆盖率 ' + p.coverage + '%。');
  } else {
    L.push('【判断】你在' + p.bank + '已测 ' + p.tested + ' / ' + p.bankSize + ' 词，覆盖率 ' + p.coverage +
      '%，还没有随机抽样数据，暂时无法给出带误差范围的词汇量估算。');
  }
  L.push('');
  L.push('【依据】');
  if (best && worst && best.band !== worst.band) {
    L.push('· 最强的是「' + best.band + '」段（' + best.mastery + '%），最弱的是「' + worst.band + '」段（' + worst.mastery + '%）');
  }
  L.push('· 该段共 ' + (worst ? worst.total : 0) + ' 词，抽样覆盖 ' + (worst ? worst.sampled : 0) + ' 词');
  if (weak.count) L.push('· 该段未掌握的词有 ' + weak.count + ' 个，例如：' + weak.words.slice(0, 5).map(w => w.word).join('、'));
  L.push('· 按 ' + plan.days + ' 天计划，每天约 ' + plan.wordsPerDay + ' 词可覆盖剩余 ' + plan.remainingWords + ' 词');
  L.push('');
  L.push('【建议】先把「' + (worst ? worst.band : '最弱') + '」段的词过一遍——报告页有「只复测这一段」的按钮，' +
    '测完再回来看这一段是否补上。');
  L.push('');
  L.push('（当前为本地规则诊断，未调用大模型。配置 API Key 后可获得更细致的分析与对话。）');
  return L.join('\n');
}
