/* ======================================================================
   utils/diagnose.js —— 本地方案诊断（不需要网络、不需要后端）
   为什么要有：网页版的 AI 面板有三档通路（自带 Key / 作者额度 / 本地方案），
   小程序里没法起后端，但「本地方案」这一档是纯计算，完全可以搬过来——
   于是离线也能有一整页诊断：依据 + 先补哪段 + 两周计划 + 怎么验证。
   所有结论都由引擎算出来的数字驱动（缺口 × 词频权重、每日时间折算），不套固定模板。
   ====================================================================== */
'use strict';

var WEIGHT = { 1: 1, 2: 0.33, 3: 0.20, 4: 0.125, 5: 0.067, 6: 0.033, 0: 0.02 };

function pct(x) { return Math.round((x || 0) * 100) + '%'; }
function fmt(n) {
  var s = String(Math.round(Number(n) || 0)), out = '';
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s.charAt(i);
  }
  return out;
}

/* 频段缺口：掌握率 → 缺口词数 → 缺口 × 权重 */
function bandGaps(eng) {
  var prof = eng.bandProfile();
  var rows = (prof.rows || []).filter(function (r) { return r.p !== null && r.N > 0; });
  return rows.map(function (r) {
    var w = WEIGHT[r.band] === undefined ? 0.1 : WEIGHT[r.band];
    var gap = Math.max(0, Math.round((1 - r.p) * r.N));
    return {
      band: r.band,
      name: eng.BAND_NAMES[r.band] || ('第 ' + r.band + ' 段'),
      p: r.p, n: r.n, N: r.N, gap: gap, w: w, gain: gap * w
    };
  }).sort(function (a, b) { return b.gain - a.gain; });
}

function perDay(eng) {
  var dm = (eng.S.settings && eng.S.settings.dailyMinutes) || 30;
  return Math.max(5, Math.min(200, Math.round(dm / 1.5)));
}

/* 主入口：返回 { blocks: [{h, lines}] } */
function build(eng, topic) {
  var t;
  try { t = eng.tally(eng.activePool()); } catch (e) { t = { tested: 0, total: 0, k: 0, f: 0, u: 0, rest: 0 }; }
  var est = null, rep = null, gaps = [];
  try { est = eng.estimateNow(); } catch (e) {}
  try { rep = eng.levelReport(); } catch (e) {}
  try { gaps = bandGaps(eng); } catch (e) {}

  /* 没有数据：只给一条最短路径，不编结论 */
  if (!t.tested) {
    return {
      empty: true,
      blocks: [
        { h: '还没有可以分析的数据', lines: [
          '先做一次「快速摸底」：按词频分层随机抽 100 词，答完就得到带误差范围的词汇量估算。',
          '有了数据再回来，这里会告诉你洞在哪一段、先补哪些词、按你的时间几天能补完。'
        ] }
      ]
    };
  }

  var blocks = [];
  var pd = perDay(eng);

  /* 依据：所有结论都能追溯到这里 */
  var head = [
    '词库：' + eng.bankName() + '，已测 ' + t.tested + ' / ' + t.total + ' 词（覆盖 ' + pct(t.tested / (t.total || 1)) + '）',
    '掌握率（折中口径：认识 + 模糊×0.5）' + pct((t.k + 0.5 * t.f) / (t.tested || 1)) +
      '；严格口径（只算认识）' + pct(t.k / (t.tested || 1))
  ];
  if (est && est.kind === 'sample' && est.vocab) {
    head.push('词汇量估计 ≈ ' + fmt(est.vocab) + ' 词（95% 区间 ' + fmt(est.lo) + ' – ' + fmt(est.hi) + '）');
  } else if (est && est.kind === 'full') {
    head.push('整库实测：' + fmt(est.vocab) + ' 词（已接近实测值，无抽样误差）');
  }
  if (rep && rep.rank) {
    head.push('当前等级：' + rep.rank.k + ' · ' + rep.rank.name + '（掌握率 ' + pct(rep.ratio) + '）' +
      (rep.capped ? '，已被「最高频段掌握率过低」封顶' : ''));
  }
  blocks.push({ h: '依据（全部来自本机数据）', lines: head });

  /* 结构化诊断：先补哪一段 */
  if (gaps.length) {
    var top = gaps[0];
    var weakest = gaps.slice().sort(function (a, b) { return a.p - b.p; })[0];
    var lines = [
      '最该先补：「' + top.name + '」段。掌握 ' + pct(top.p) + '，全段 ' + fmt(top.N) + ' 词里约 ' +
        fmt(top.gap) + ' 个还没拿下；这一段是「缺口 × 词频权重」算下来收益最高的（权重 ' + top.w + '）。'
    ];
    if (weakest && weakest.band !== top.band) {
      lines.push('全库最弱的是「' + weakest.name + '」（' + pct(weakest.p) + '），但它偏冷门，先补上面那一段更划算。');
    }
    if (gaps[1]) {
      lines.push('第二名：「' + gaps[1].name + '」段，约 ' + fmt(gaps[1].gap) + ' 个缺口（权重 ' + gaps[1].w + '）。');
    }
    blocks.push({ h: '先补哪一段', lines: lines });

    /* 计划：用每日可投入时间折算 */
    var days = Math.max(1, Math.ceil(top.gap / pd));
    blocks.push({ h: '接下来怎么排', lines: [
      '按每天 ' + pd + ' 词（设置里的「每日可投入时间」换算而来）算，补完「' + top.name + '」这一段约 ' + days + ' 天。',
      '做法：先「复测这一段」把没掌握的词过一遍，再按「分组检测」推进；每周回来测一次，看掌握率有没有真的动。',
      '想验证提升是不是真的：隔 1–2 周完整测一轮，看「背了又忘」有多少——那部分比新词更该复习。'
    ] });
  }

  /* 按话题给不同的补充块 */
  if (/可信|误差|准|为什么|凭什么/.test(topic || '')) {
    blocks.push({ h: '这个数字凭什么可信', lines: [
      '分层抽样：七段词频各按真实占比抽，同样 100 题，分层比简单随机区间窄约三成。',
      '三层修正：Agresti-Coull 处理全对/全错、有限总体修正（不放回）、四选一还扣掉 25% 蒙对。',
      '两套口径：严格只算「认识」，折中把「模糊」按一半计入，都摆出来让你自己判断。',
      '误差永远写在数字旁边：区间内的小幅涨跌，别当真进步。'
    ] });
  }
  if (/背了又忘|忘|复习|掉档/.test(topic || '')) {
    var fuzzy = t.f || 0;
    blocks.push({ h: '背了又忘怎么处理', lines: [
      '你现在有 ' + fmt(fuzzy) + ' 个词标了「模糊」——这些是复习性价比最高的：半个词已经记住了。',
      '完整测两轮后就能看出「背了又忘」的具体词；这类词别重复读，换成词根 / 例句语境去记。'
    ] });
  }

  blocks.push({ h: '这一档是什么', lines: [
    '你现在看到的是「本地方案」：结论由这台设备上的数据算出，确定性、不联网、不花钱。',
    '网页版还有另外两档（自带 API Key / 作者额度），可以自由追问；小程序端暂时只带本地方案。'
  ] });

  return { empty: false, blocks: blocks };
}

module.exports = { build: build, bandGaps: bandGaps, perDay: perDay };
