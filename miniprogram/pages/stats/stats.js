/* ======================================================================
   总览页：掌握情况 + 七段剖面 + 检测记录
   为什么独立一页：报告页讲的是"这一轮的等级与方案"，总览讲的是"现在整库长什么样"，
   两个问题不一样。频段条可以直接点 → 把该段的缺口词开成一轮复测（和网页版一致）。
   ====================================================================== */
var engineMod = require('../../utils/engine.js');
var quizMod = require('../../utils/quiz.js');
var cardMod = require('../../utils/card.js');
var eng = engineMod.engine;

function fmt(n) {
  var s = String(Math.round(Number(n) || 0)), out = '';
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s.charAt(i);
  }
  return out;
}

Page({
  data: {
    ready: false,
    tested: 0, total: 0, coveragePct: 0, untested: 0,
    k: 0, f: 0, u: 0,
    bands: [],
    mapRows: [], cellsCount: 0,
    sourceNote: '',
    rounds: [],
    perDay: 20
  },

  onShow: function () { this.refresh(); },

  refresh: function () {
    var pool = eng.activePool ? eng.activePool() : null;
    var rep = eng.levelReport();
    var prof = eng.bandProfile();
    var bands = [];
    for (var i = 0; i < prof.rows.length; i++) {
      var r = prof.rows[i];
      if (!r.N) continue;
      bands.push({
        band: r.band,
        name: eng.BAND_NAMES[r.band] || ('第 ' + r.band + ' 段'),
        p: r.p === null ? null : Math.round(r.p * 100),
        N: r.N,
        n: r.n,
        gap: r.p === null ? 0 : Math.max(0, Math.round((1 - r.p) * r.N)),
        w: r.p === null ? 0 : Math.max(2, Math.round(r.p * 100)),
        tone: r.p === null ? 'none' : (r.p >= 0.8 ? 'ok' : (r.p >= 0.5 ? 'warn' : 'bad'))
      });
    }
    bands.sort(function (a, b) {
      var wa = a.band === 0 ? 99 : a.band, wb = b.band === 0 ? 99 : b.band;
      return wa - wb;
    });

    var hist = eng.roundHistory() || [];
    var rounds = hist.slice().reverse().map(function (r) {
      var d = new Date(r.finishedAt || r.startedAt || Date.now());
      return {
        n: r.n,
        when: (d.getMonth() + 1) + '月' + d.getDate() + '日',
        vocab: fmt(r.loose),
        ratio: Math.round((r.ratio || 0) * 100),
        rankName: r.rankName || r.rank || ''
      };
    });

    /* 词汇地图：7 段 × 26 字母。手机上一屏放不下 26 列，所以可横向滑动，
       每格 44rpx（约 22px）保证能点中；颜色只分四档，避免"精确但看不清"。 */
    /* 直接用引擎给的 vocabMap().rows：每行是「一个频段」，cells 里是 26 个字母格，
       每格带 N / tested / ratio / gap / untested。不要自己再算一遍，
       否则口径会和网页版不一致（网页版的地图也是这个结构）。 */
    var mapRows = [], cellsCount = 0;
    try {
      var vm = eng.vocabMap();
      (vm.rows || []).forEach(function (row) {
        var cells = (row.cells || []).map(function (c) {
          var tone = !c.tested ? 'none' : (c.ratio >= 0.8 ? 'ok' : (c.ratio >= 0.5 ? 'warn' : 'bad'));
          return { band: c.band, letter: c.letter, tone: tone, N: c.N, tested: c.tested, gap: c.deficit };
        });
        var any = cells.some(function (c) { return c.N > 0; });
        if (any) { mapRows.push({ band: row.band, name: row.name, cells: cells }); cellsCount += cells.length; }
      });
    } catch (e) { mapRows = []; }
    var tested = rep.tested, total = rep.total;
    this.setData({
      ready: true,
      tested: tested,
      total: total,
      coveragePct: total ? Math.round(tested / total * 100) : 0,
      untested: total - tested,
      k: rep.k, f: rep.f, u: rep.u,
      bands: bands,
      mapRows: mapRows,
      cellsCount: cellsCount,
      sourceNote: prof.source === 'sample'
        ? ('来自最近一次分层抽样（' + prof.n + ' 词）')
        : ('来自已测的 ' + prof.n + ' 词，非随机样本，仅供参考'),
      rounds: rounds,
      perDay: cardMod.perDayWords(eng)
    });
  },

  /* 点频段条：把这一段的缺口词开成一轮复测（未测 + 模糊 + 不认识） */
  onBand: function (e) {
    var band = Number(e.currentTarget.dataset.band);
    var list = eng.mapCellWords(band, 'all');
    if (!list.length) {
      wx.showToast({ title: '这一段没有需要复测的词', icon: 'none' });
      return;
    }
    var cap = 400;
    var use = list.slice(0, cap);
    var name = eng.BAND_NAMES[band] || ('第 ' + band + ' 段');
    wx.showModal({
      title: '复测「' + name + '」段',
      content: '这一段有 ' + list.length + ' 个词还没拿下' +
        (list.length > cap ? '（本次先测前 ' + cap + ' 个）' : '') + '，现在开始吗？',
      confirmText: '开始复测',
      success: function (res) {
        if (!res.confirm) return;
        var q = quizMod.quiz;
        q.start('list', { list: use, label: '复测「' + name + '」段 · ' + use.length + ' 词' });
        wx.navigateTo({ url: '/pages/quiz/quiz' });
      }
    });
  },

  /* 点地图格子：把这一格的缺口词开成复测（与网页版一致：未测 + 模糊 + 不认识） */
  onCell: function (e) {
    var band = Number(e.currentTarget.dataset.band);
    var letter = e.currentTarget.dataset.letter;
    var list = eng.mapCellWords(band, letter);
    var name = (eng.BAND_NAMES[band] || ('第 ' + band + ' 段')) + ' · ' + letter;
    if (!list.length) { wx.showToast({ title: name + ' 这块没有需要复测的词', icon: 'none' }); return; }
    var use = list.slice(0, 400);
    wx.showModal({
      title: '复测 ' + name,
      content: '这一格有 ' + list.length + ' 个词还没拿下（未测 + 模糊 + 不认识），现在开始？',
      confirmText: '开始',
      success: function (res) {
        if (!res.confirm) return;
        var quizMod = require('../../utils/quiz.js');
        quizMod.quiz.start('list', { list: use, label: '复测 ' + name + ' · ' + use.length + ' 词' });
        wx.navigateTo({ url: '/pages/quiz/quiz' });
      }
    });
  },

  onReport: function () { wx.navigateTo({ url: '/pages/report/report' }); }
});
