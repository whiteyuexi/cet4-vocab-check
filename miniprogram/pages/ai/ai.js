/* AI 诊断页（本地方案）
   与网页版的第三档"本地方案"同一套逻辑：结论全部由本机数据算出，不联网、不消耗额度。
   小程序里没有后端，所以这里先把最有用的一档做扎实：
   依据 → 先补哪一段 → 怎么排 → 怎么验证，外加几个常见问题的回答。 */
var engineMod = require('../../utils/engine.js');
var diagnose = require('../../utils/diagnose.js');
var quizMod = require('../../utils/quiz.js');
var eng = engineMod.engine;

Page({
  data: {
    blocks: [],
    empty: true,
    topic: '',
    quick: [
      { q: '最该先补哪一段', topic: '计划' },
      { q: '给个两周计划', topic: '计划' },
      { q: '这个数字可信吗', topic: '可信' },
      { q: '背了又忘怎么办', topic: '背了又忘' }
    ],
    perDay: 20
  },

  onShow: function () { this.run(''); },

  run: function (topic) {
    var r = diagnose.build(eng, topic);
    this.setData({ blocks: r.blocks, empty: !!r.empty, topic: topic || '', perDay: diagnose.perDay(eng) });
  },

  onAsk: function (e) {
    var q = e.currentTarget.dataset.q || '';
    this.run(q);
  },

  onQuick: function () {
    wx.navigateTo({ url: '/pages/quiz/quiz' });
  },

  /* 直接把"最该补的那一段"开成一轮复测 */
  onReviewTop: function () {
    var gaps = diagnose.bandGaps(eng);
    if (!gaps.length) { wx.showToast({ title: '先做一次快速摸底', icon: 'none' }); return; }
    var top = gaps[0];
    var list = eng.mapCellWords(top.band, 'all');
    if (!list.length) { wx.showToast({ title: '这一段没有需要复测的词', icon: 'none' }); return; }
    var use = list.slice(0, 400);
    wx.showModal({
      title: '复测「' + top.name + '」段',
      content: '这一段约有 ' + top.gap + ' 个词还没拿下' + (list.length > 400 ? '（本次先测前 400 个）' : '') + '，现在开始？',
      confirmText: '开始复测',
      success: function (res) {
        if (!res.confirm) return;
        quizMod.quiz.start('list', { list: use, label: '补「' + top.name + '」段 · ' + use.length + ' 词' });
        wx.navigateTo({ url: '/pages/quiz/quiz' });
      }
    });
  },

  onStats: function () { wx.switchTab({ url: '/pages/stats/stats' }); }
});
