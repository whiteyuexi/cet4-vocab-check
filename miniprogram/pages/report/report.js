/* 报告页：等级 / 两套口径 / 频段剖面 / 提升优先级 / 多轮对比
   数据全部来自引擎（levelReport / estimateNow / roundDiff），这一页只排版。
   接口说明见 IMPORT-NOTES.md §10.6③ */
var engineMod = require('../../utils/engine.js');
var quizMod = require('../../utils/quiz.js');
var eng = engineMod.engine;

function fmt(n) {
  var s = String(Math.round(Number(n) || 0)), out = '';
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s.charAt(i);
  }
  return out;
}
function toneOf(ratio) {
  if (ratio >= 0.85) return 'ok';
  if (ratio >= 0.60) return 'warn';
  return 'bad';
}

Page({
  data: {
    empty: true,
    rep: null, last: null, diff: null,
    rankK: '', rankName: '', rankTone: 'ok', rankDesc: '', rankNext: '',
    ratioPct: 0, coveragePct: 0, testedText: '',
    looseText: '—', strictText: '—', fuzzyPct: 0,
    bands: [], gainTop: [], deficitTop: [], baseGap: 0,
    canRetest: false, roundNo: 1,
    lastText: '', diffRows: [], diffKeep: '', hasDiff: false,
    needMore: 0, ready: false, weakCount: 0,
    vocabText: '—', rangeText: ''
  },

  onShow: function () { this.refresh(); },

  refresh: function () {
    var rep = eng.levelReport();
    var est = eng.estimateNow();
    if (!rep.tested) { this.setData({ empty: true, rep: rep }); return; }

    var bands = rep.bands.map(function (r) {
      return {
        name: r.name, ratio: Math.round(r.ratio * 100),
        tested: r.tested, N: r.N, deficit: r.deficit,
        tone: toneOf(r.ratio)
      };
    });
    var gain = rep.gainTop.map(function (r) {
      return { name: r.name, deficit: r.deficit, gain: Math.round(r.gain * 10) / 10 };
    });
    var deficit = rep.deficitTop.map(function (r) {
      return { name: r.name, deficit: r.deficit };
    });

    var last = eng.S.lastResult || null;
    var lastText = '';
    var weakCount = 0;
    if (last) {
      var ans = (last.k || 0) + (last.f || 0) + (last.u || 0);
      lastText = '本轮答 ' + ans + ' 题 · 认识 ' + (last.k || 0) + ' · 模糊 ' + (last.f || 0) +
        ' · 不认识 ' + (last.u || 0) + (last.skipped ? (' · 跳过 ' + last.skipped) : '');
      weakCount = (last.log || []).filter(function (e) { return e.v !== 2; }).length;
    }

    /* 多轮对比：指纹对不上时 roundDiff 返回 {stale:true}，只做聚合，不算逐词 */
    var diff = eng.roundDiff();
    var hasDiff = !!(diff && !diff.stale && diff.compared);
    var diffRows = [];
    var diffKeep = '';
    if (hasDiff) {
      diffKeep = diff.keepRate == null ? '—' : Math.round(diff.keepRate * 100) + '%';
      diffRows = [
        { k: '保持率', v: diffKeep, d: '上轮认识的词这轮还记得' },
        { k: '新学进来', v: '+' + diff.gained, d: '上轮不会/模糊 → 这轮认识' },
        { k: '背了又忘', v: String(diff.forgottenCount), d: '复习第一优先级' },
        { k: '两轮都模糊', v: String(diff.stuck), d: '一直没拿下' }
      ];
    }

    this.setData({
      empty: false,
      rep: rep,
      rankK: rep.rank ? rep.rank.k : '',
      rankName: rep.rank ? rep.rank.name : '',
      rankTone: rep.rank ? rep.rank.tone : 'ok',
      rankDesc: rep.rank ? rep.rank.desc : '',
      rankNext: rep.rank ? rep.rank.next : '',
      ratioPct: Math.round(rep.ratio * 1000) / 10,
      coveragePct: Math.round(rep.coverage * 100),
      testedText: fmt(rep.tested) + ' / ' + fmt(rep.total),
      looseText: fmt(rep.loose),
      strictText: fmt(rep.strict),
      fuzzyPct: Math.round(rep.fuzzyShare * 100),
      bands: bands,
      gainTop: gain,
      deficitTop: deficit,
      baseGap: rep.baseGap,
      ready: rep.ready,
      needMore: rep.ready ? 0 : rep.remaining,
      canRetest: eng.canRetest(),
      roundNo: eng.roundNo(),
      last: last,
      lastText: lastText,
      weakCount: weakCount,
      diff: diff,
      hasDiff: hasDiff,
      diffRows: diffRows,
      diffKeep: diffKeep,
      vocabText: est.kind === 'none' ? '—' : fmt(est.vocab),
      rangeText: est.kind === 'sample' ? (fmt(est.lo) + ' – ' + fmt(est.hi)) : ''
    });
  },

  /* 复测本次未掌握的词（list 模式） */
  onReviewWeak: function () {
    var log = (eng.S.lastResult && eng.S.lastResult.log) || [];
    var weak = log.filter(function (e) { return e.v !== 2; }).map(function (e) { return e.i; });
    if (!weak.length) { wx.showToast({ title: '本轮没有需要复测的词', icon: 'none' }); return; }
    var q = quizMod.createQuiz(eng, {
      onGo: function (route) { if (route === 'test') wx.redirectTo({ url: '/pages/quiz/quiz' }); },
      onToast: function (m) { wx.showToast({ title: String(m), icon: 'none' }); }
    });
    var r = q.start('list', { list: weak, label: '复测本轮未掌握词 · ' + weak.length + ' 词' });
    if (r && r.ok === false) wx.showToast({ title: r.reason || '无法开始', icon: 'none' });
  },

  onNewRound: function () {
    var self = this;
    wx.showModal({
      title: '开始第 ' + (eng.roundNo() + 1) + ' 轮',
      content: '本轮作答会清空重来，报告会归档保留，用于逐词对比。',
      confirmText: '开始',
      success: function (res) {
        if (!res.confirm) return;
        if (quizMod.quiz.startNewRound()) wx.reLaunch({ url: '/pages/index/index' });
        else wx.showToast({ title: '当前不能开新一轮', icon: 'none' });
      }
    });
  },

  onHome: function () { wx.reLaunch({ url: '/pages/index/index' }); }
});
