/* 首页：余额卡 + 两个入口 + 分组网格 + 继续检测
   数据全部来自引擎（utils/engine.js）；这一页不持有会话，只管"发起"和"接着测"。
   接口说明见 IMPORT-NOTES.md §10.6① */
var engineMod = require('../../utils/engine.js');
var quizMod = require('../../utils/quiz.js');
var eng = engineMod.engine;

/* 千分位。小程序里 toLocaleString 支持不稳，自己拼 */
function fmt(n) {
  var s = String(Math.round(Number(n) || 0)), out = '';
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s.charAt(i);
  }
  return out;
}

/* 每个分组的已测进度：100 词一组，46 组。只在 onShow 算一次（约 4600 次 getSt，很快） */
function groupRows() {
  var gs = eng.groups(), rows = [];
  for (var g = 0; g < gs.length; g++) {
    var idx = gs[g], tested = 0, known = 0;
    for (var j = 0; j < idx.length; j++) {
      var st = eng.getSt(idx[j]);
      if (st === undefined) continue;
      tested++;
      if (st === 2) known++;
    }
    rows.push({
      g: g,
      label: '第 ' + (g + 1) + ' 组',
      tested: tested,
      total: idx.length,
      pct: idx.length ? Math.round(tested / idx.length * 100) : 0,
      done: tested >= idx.length
    });
  }
  return rows;
}

/* 起一个带导航注入点的控制器实例：start() 内部会走 onGo('test')，我们只负责跳页 */
function withQuiz(fn) {
  var q = quizMod.createQuiz(eng, {
    onGo: function (route) {
      if (route === 'test') wx.navigateTo({ url: '/pages/quiz/quiz' });
      else if (route === 'result') wx.redirectTo({ url: '/pages/report/report' });
    },
    onToast: function (m) { wx.showToast({ title: String(m), icon: 'none' }); }
  });
  var r = fn(q);
  if (r && r.ok === false) wx.showToast({ title: r.reason || '无法开始', icon: 'none' });
}

Page({
  data: {
    ready: false, est: null, rep: null,
    vocabText: '—', rangeText: '', precisionText: '', strictText: '—', looseText: '—',
    rankK: '', rankName: '', rankTone: 'ok', ratioPct: 0, coveragePct: 0,
    testedText: '', remaining: 0, toNext: 0, nextName: '',
    resume: null, canRetest: false, roundNo: 1,
    need250: 0, mins250: '', needAll: '', minsAll: '', poolSize: 0, bankName: '',
    groups: [], showGroups: true
  },

  onShow: function () { this.refresh(); },

  refresh: function () {
    var est = eng.estimateNow();
    var rep = eng.levelReport();
    var q = quizMod.quiz;
    var resume = null;
    if (q.hasSession()) {
      var v = q.view();
      if (v && v.hasSession) {
        resume = {
          label: v.label,
          text: '第 ' + (v.pos + 1) + ' / ' + v.total + ' 词 · 已答 ' + v.counts.answered + ' 题',
          pct: v.total ? Math.round(v.pos / v.total * 100) : 0
        };
      }
    }
    var n250 = eng.needFor(250);
    var pool = eng.curPoolSize();
    this.setData({
      ready: true,
      est: est,
      rep: rep,
      vocabText: est.kind === 'none' ? '—' : fmt(est.vocab),
      rangeText: est.kind === 'sample' ? (fmt(est.lo) + ' – ' + fmt(est.hi)) : (est.kind === 'full' ? '' : ''),
      precisionText: est.kind === 'sample' ? ('±' + est.half + ' 词') : '',
      strictText: est.strictVocab != null ? fmt(est.strictVocab) : '—',
      looseText: est.looseVocab != null ? fmt(est.looseVocab) : '—',
      kind: est.kind || 'none',
      rankK: rep.rank ? rep.rank.k : '',
      rankName: rep.rank ? rep.rank.name : '',
      rankTone: rep.rank ? rep.rank.tone : 'ok',
      ratioPct: Math.round(rep.ratio * 1000) / 10,
      coveragePct: Math.round(rep.coverage * 100),
      testedText: fmt(rep.tested) + ' / ' + fmt(rep.total),
      remaining: rep.remaining,
      toNext: rep.toNext,
      nextName: rep.nextRank ? rep.nextRank.name : '',
      resume: resume,
      canRetest: eng.canRetest(),
      roundNo: eng.roundNo(),
      need250: n250,
      mins250: eng.minsText(n250),
      minsAll: eng.minsText(pool),
      poolSize: pool,
      bankName: eng.bankName(),
      groups: groupRows()
    });
  },

  /* ---------- 入口 ---------- */
  onQuick: function () {
    withQuiz(function (q) { return q.start('probe', { target: 250 }); });
  },
  onAll: function () {
    wx.showModal({
      title: '全量检测',
      content: '一次测完当前词库 ' + eng.curPoolSize() + ' 词，约需 ' + eng.minsText(eng.curPoolSize()) + '。建议先做快速摸底。',
      confirmText: '开始',
      success: function (res) {
        if (!res.confirm) return;
        withQuiz(function (q) { return q.start('all'); });
      }
    });
  },
  onGroup: function (e) {
    var g = Number(e.currentTarget.dataset.g);
    withQuiz(function (q) { return q.start('group', { group: g }); });
  },
  onResume: function () {
    wx.navigateTo({ url: '/pages/quiz/quiz' });
  },
  onRetest: function () {
    var self = this;
    wx.showModal({
      title: '开始第 ' + (eng.roundNo() + 1) + ' 轮',
      content: '本轮作答会清空重来，但每一轮的报告会归档保留，可在报告页做逐词对比。',
      confirmText: '开始新一轮',
      success: function (res) {
        if (!res.confirm) return;
        var ok = quizMod.quiz.startNewRound();
        if (ok) { self.refresh(); wx.showToast({ title: '已开始第 ' + eng.roundNo() + ' 轮', icon: 'none' }); }
        else wx.showToast({ title: '当前不能开新一轮', icon: 'none' });
      }
    });
  },
  onToggleGroups: function () {
    this.setData({ showGroups: !this.data.showGroups });
  },
  onReport: function () {
    wx.navigateTo({ url: '/pages/report/report' });
  }
});
