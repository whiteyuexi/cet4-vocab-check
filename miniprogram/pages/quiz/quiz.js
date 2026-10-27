/* 答题页：控制器（utils/quiz.js）的纯视图层
   契约（IMPORT-NOTES §10.4）：
     · 渲染只走 onChange(state) → setData
     · 切页只走 onGo(route)
     · 自动跳转的定时器归本页（控制器一次计时都不做），onHide/onUnload 必须清掉
     · 键盘快捷键、退出弹窗也是本页的事 */
var engineMod = require('../../utils/engine.js');
var quizMod = require('../../utils/quiz.js');
var eng = engineMod.engine;

var timer = null;

Page({
  data: {
    s: null,
    bandName: '',
    empty: false,
    quitAsk: false,
    probLine: ''
  },

  onLoad: function () {
    var self = this;
    this.q = quizMod.createQuiz(eng, {
      onChange: function (st) { self.applyState(st); },
      onGo: function (route) {
        if (route === 'result') { wx.redirectTo({ url: '/pages/report/report' }); }
        else if (route === 'home') { wx.reLaunch({ url: '/pages/index/index' }); }
      },
      onToast: function (m) { wx.showToast({ title: String(m), icon: 'none' }); },
      onSpeak: function () { /* MVP 不做发音：小程序需要 TTS 插件或后端，留到二期 */ }
    });
    if (this.q.hasSession()) this.applyState(this.q.view());
    else this.setData({ empty: true });
  },

  /* 唯一渲染入口 */
  applyState: function (st) {
    if (timer) { clearTimeout(timer); timer = null; }
    var band = (st && st.word) ? (eng.BAND_NAMES[st.word.band] || '') : '';
    this.setData({ s: st, bandName: band, empty: false });
    /* 自动跳下一题（自评 850ms / 四选一 750ms 对、1600ms 错）——延时由控制器给出，本页只负责计时 */
    if (st && st.auto && st.auto.pending) {
      var self = this;
      timer = setTimeout(function () {
        timer = null;
        self.q.next();
      }, st.auto.delay);
    }
  },

  onHide: function () { if (timer) { clearTimeout(timer); timer = null; } },
  onUnload: function () { if (timer) { clearTimeout(timer); timer = null; } },

  /* ---------- 作答 ---------- */
  onJudge: function (e) { this.q.judge(Number(e.currentTarget.dataset.v)); },     // 2 认识 / 1 模糊 / 0 不认识
  onRejudge: function (e) { this.q.rejudge(Number(e.currentTarget.dataset.v)); },
  onPick: function (e) { this.q.pick(Number(e.currentTarget.dataset.n)); },
  onNext: function () { this.q.next(); },
  onSkip: function () { this.q.skip(); },
  onUndo: function () {
    if (!this.data.s || !this.data.s.canUndo) return;
    this.q.undo();
  },

  /* 自评 / 四选一 切换：切完必须 revertCurrent()（网页版 part3 也是这么做的） */
  onToggleMode: function () {
    eng.S.settings.mode = (eng.S.settings.mode === 'self') ? 'choice' : 'self';
    eng.save();
    this.q.revertCurrent();          // 与网页版一致：不触发 onChange
    this.applyState(this.q.view());  // 所以这里手动渲染一次
  },

  /* ---------- 退出 / 结算 ---------- */
  onQuitTap: function () { this.setData({ quitAsk: true }); },
  onCancelQuit: function () { this.setData({ quitAsk: false }); },
  onQuitKeep: function () {          // 保存并返回
    this.setData({ quitAsk: false });
    this.q.leave();
    wx.navigateBack({ delta: 1, fail: function () { wx.reLaunch({ url: '/pages/index/index' }); } });
  },
  onQuitFinish: function () {        // 直接结算看报告
    this.setData({ quitAsk: false });
    this.q.finish();                 // 内部会 onGo('result') → redirectTo 报告页
  },
  onQuitDrop: function () {          // 放弃本次
    var self = this;
    wx.showModal({
      title: '放弃本次检测？',
      content: '本轮已作答的记录会被清空，之前轮次归档的报告不受影响。',
      confirmText: '放弃',
      confirmColor: '#B02E22',
      success: function (res) {
        if (!res.confirm) return;
        self.setData({ quitAsk: false });
        self.q.abandon();
        wx.navigateBack({ delta: 1, fail: function () { wx.reLaunch({ url: '/pages/index/index' }); } });
      }
    });
  },
  onBackHome: function () { wx.reLaunch({ url: '/pages/index/index' }); },
  noop: function () { /* 弹窗遮罩挡住滚动 */ }
});
