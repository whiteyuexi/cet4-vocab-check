/* 首页：词汇量卡 + 两个入口 + 分组网格 + 继续检测
   数据全部来自引擎（utils/engine.js）；这一页不持有会话，只管"发起"和"接着测"。
   接口说明见 IMPORT-NOTES.md §10.6① */
var engineMod = require('../../utils/engine.js');
var quizMod = require('../../utils/quiz.js');
var cardMod = require('../../utils/card.js');
var eng = engineMod.engine;

/* 本次会话里点过「收起」就记住，刷新小程序后还会出现（与网页版一致：不落盘） */
var cardHiddenThisRun = false;

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
    cardShow: false, cardLines: [], cardHead: '',
    testedShort: '0',
    precision: [], pickTarget: 250, pickNeed: 0, pickMins: '',
    needAll: '', minsAll: '', poolSize: 0, bankName: '',
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
    /* 回访卡：距上次检测满 3 天才出现；内容全部本地算，不调大模型 */
    var cardShow = cardMod.shouldShow(eng, { hidden: cardHiddenThisRun });
    var info = cardShow ? cardMod.info(eng) : null;
    var bandNameFn = function (b) { return '「' + (eng.BAND_NAMES[b] || ('第 ' + b + ' 段')) + '」'; };
    var cardHead = info
      ? ((info.kind === 'full' ? '实测 ' : '上次 ') + fmt(info.vocab) + ' 词' +
         (info.half ? '（±' + info.half + '）' : '') + ' · ' + (info.days === 0 ? '今天' : info.days + ' 天前'))
      : '';
    var pool = eng.curPoolSize();
    /* 精度三档：和网页版一致的 ±400 / ±250 / ±150，题量与耗时由引擎算 */
    var curT = this.data.pickTarget || 250;
    var precision = [400, 250, 150].map(function (tg) {
      var need = eng.needFor(tg);
      return { target: tg, need: need, mins: eng.minsText(need), on: tg === curT };
    });
    var pickNeed = eng.needFor(curT), pickMins = eng.minsText(pickNeed);
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

      minsAll: eng.minsText(pool),
      poolSize: pool,
      bankName: eng.bankName(),
      groups: groupRows(),
      testedShort: fmt(rep.tested),
      precision: precision,
      pickNeed: pickNeed,
      pickMins: pickMins,
      cardShow: cardShow,
      cardLines: info ? cardMod.lines(info, bandNameFn) : [],
      cardHead: cardHead
    });
  },

  /* ---------- 入口 ---------- */
  onQuick: function () {
    var tg = this.data.pickTarget || 250;
    withQuiz(function (q) { return q.start('probe', { target: tg }); });
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
  },

  /* ---------- 精度选择（网页版的三档搬到手机） ---------- */
  onPickPrecision: function (e) {
    var tg = Number(e.currentTarget.dataset.target) || 250;
    if ([400, 250, 150].indexOf(tg) < 0) return;
    this.setData({ pickTarget: tg }, this.refresh.bind(this));
  },
  onAi: function () {
    wx.navigateTo({ url: '/pages/ai/ai' });
  },

  /* ---------- 回访卡 ---------- */
  onCardReview: function () {
    var info = cardMod.info(eng);
    if (!info || !info.target) {
      wx.showToast({ title: '先做一次快速摸底', icon: 'none' });
      return;
    }
    var list = eng.mapCellWords(info.target.band, 'all');
    if (!list.length) {
      wx.showToast({ title: '这一段没有需要复测的词', icon: 'none' });
      return;
    }
    var use = list.slice(0, 400);
    var name = eng.BAND_NAMES[info.target.band] || ('第 ' + info.target.band + ' 段');
    quizMod.quiz.start('list', { list: use, label: '补「' + name + '」段 · ' + use.length + ' 词' });
    wx.navigateTo({ url: '/pages/quiz/quiz' });
  },
  onCardHide: function () {
    cardHiddenThisRun = true;
    this.setData({ cardShow: false });
  },
  onCardOff: function () {
    var self = this;
    wx.showModal({
      title: '以后不再提醒',
      content: '回访卡不会再自动出现。想恢复可以去「设置 → 回访提醒」重新打开。',
      confirmText: '不再提醒',
      success: function (res) {
        if (!res.confirm) return;
        eng.S.settings.revisitOff = true;
        eng.save();
        self.setData({ cardShow: false });
        wx.showToast({ title: '已关闭回访提醒', icon: 'none' });
      }
    });
  },
  onStats: function () {
    wx.switchTab({ url: '/pages/stats/stats' });
  }
});
