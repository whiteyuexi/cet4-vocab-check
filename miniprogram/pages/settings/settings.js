/* ======================================================================
   设置页
   小程序里能改的东西比网页少（没有桌宠、没有自定义词书导入），但"影响结果的那几项"
   一个都不能少：答题方式、严格/折中口径、是否含派生词、每日可投入时间、回访提醒。
   所有改动都写回引擎的 S.settings 并立刻 eng.save()，首页 onShow 会读到最新值。
   ====================================================================== */
var engineMod = require('../../utils/engine.js');
var cardMod = require('../../utils/card.js');
var eng = engineMod.engine;

var MIN_MIN = 5, MAX_MIN = 180;

Page({
  data: {
    mode: 'self',
    strict: false,
    includeExt: false,
    dailyMinutes: 30,
    perDay: 20,
    revisitOff: false,
    isPreset: true,
    gapDays: cardMod.GAP_DAYS,
    wordCount: 0,
    testedCount: 0,
    version: '1.0.0'
  },

  onShow: function () { this.refresh(); },

  refresh: function () {
    var s = eng.S.settings || {};
    var dm = s.dailyMinutes || 30;
    this.setData({
      mode: s.mode || 'self',
      strict: !!s.strict,
      includeExt: !!s.includeExt,
      dailyMinutes: dm,
      perDay: cardMod.perDayWords(eng),
      revisitOff: !!s.revisitOff,
      isPreset: [15, 30, 60].indexOf(dm) >= 0,
      wordCount: eng.curPoolSize(),
      testedCount: Object.keys(eng.S.status || {}).length
    });
  },

  save: function () { eng.save(); this.refresh(); },

  /* ---------- 答题方式 ---------- */
  onMode: function (e) {
    eng.S.settings.mode = e.currentTarget.dataset.mode;
    this.save();
    wx.showToast({ title: eng.S.settings.mode === 'self' ? '已切换为自评' : '已切换为四选一', icon: 'none' });
  },

  /* ---------- 两个影响口径的开关 ---------- */
  onStrict: function (e) {
    eng.S.settings.strict = e.detail.value;
    this.save();
    wx.showToast({ title: e.detail.value ? '严格口径：只算「认识」' : '折中口径：模糊算一半', icon: 'none' });
  },
  onExt: function (e) {
    eng.S.settings.includeExt = e.detail.value;
    this.save();
    wx.showToast({ title: '词库已按设置重算，需重新检测才生效', icon: 'none' });
  },

  /* ---------- 每日可投入时间 ---------- */
  onDaily: function (e) {
    var v = Number(e.currentTarget.dataset.min);
    if (!isFinite(v)) return;
    this.setDaily(v);
  },
  onDailyStep: function (e) {
    var step = Number(e.currentTarget.dataset.step) || 0;
    this.setDaily((this.data.dailyMinutes || 30) + step);
  },
  setDaily: function (v) {
    var m = Math.max(MIN_MIN, Math.min(MAX_MIN, Math.round(v)));
    eng.S.settings.dailyMinutes = m;
    this.save();
    wx.showToast({ title: '每天 ' + m + ' 分钟 ≈ ' + cardMod.perDayWords(eng) + ' 词', icon: 'none' });
  },

  /* ---------- 回访提醒 ---------- */
  onRevisit: function (e) {
    eng.S.settings.revisitOff = !e.detail.value;
    this.save();
    wx.showToast({ title: e.detail.value ? '已开启回访提醒' : '已关闭回访提醒', icon: 'none' });
  },

  /* ---------- 数据 ---------- */
  onClear: function () {
    var self = this;
    wx.showModal({
      title: '清空作答记录',
      content: '会清掉当前使用者的所有作答、样本与归档轮次，不可恢复。确定要清空吗？',
      confirmText: '清空',
      confirmColor: '#B02E22',
      success: function (res) {
        if (!res.confirm) return;
        eng.S.status = {};
        eng.S.samples = [];
        eng.S.session = null;
        eng.S.rounds = [];
        eng.S.lastResult = null;
        eng.invalidateWordCaches();
        eng.save();
        self.refresh();
        wx.showToast({ title: '已清空', icon: 'success' });
      }
    });
  },

  onExport: function () {
    var lines = [];
    var est = eng.estimateNow();
    var rep = eng.levelReport();
    lines.push('四六级词汇量检测 · 成绩单');
    if (est.kind === 'sample') {
      lines.push('词汇量（折中口径）：' + est.looseVocab + ' 词，95% 区间 ' + est.lo + ' – ' + est.hi);
      lines.push('词汇量（严格口径）：' + est.strictVocab + ' 词');
    } else if (est.kind === 'full') {
      lines.push('词汇量（实测）：' + est.looseVocab + ' 词（严格口径 ' + est.strictVocab + ' 词）');
    } else {
      lines.push('词汇量：暂无（先做一次快速摸底）');
    }
    lines.push('覆盖：已测 ' + rep.tested + ' / ' + rep.total + ' 词（' + Math.round(rep.coverage * 100) + '%）');
    if (rep.rank) lines.push('等级：' + rep.rank.k + ' · ' + rep.rank.name + '（掌握率 ' + Math.round(rep.ratio * 100) + '%）');
    var prof = eng.bandProfile();
    var parts = [];
    for (var i = 0; i < prof.rows.length; i++) {
      var r = prof.rows[i];
      if (r.p === null || !r.n) continue;
      parts.push(eng.BAND_NAMES[r.band] + ' ' + Math.round(r.p * 100) + '%');
    }
    if (parts.length) lines.push('频段剖面：' + parts.join(' / '));
    lines.push('（由「四六级词汇量检测」生成，数据只在本机）');
    wx.setClipboardData({
      data: lines.join('\n'),
      success: function () { wx.showToast({ title: '成绩单已复制', icon: 'success' }); }
    });
  },

  onAbout: function () {
    wx.showModal({
      title: '关于',
      content: '四六级词汇量检测 · 微信小程序版\n\n' +
        '词库 ' + this.data.wordCount + ' 词（四六级大纲，全部带音标）；例句来自 Tatoeba 英中对照语料（CC-BY 2.0 FR）。\n\n' +
        '作答只存在本机（wx storage），不上传、不需要登录。统计口径与网页版完全一致。',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
