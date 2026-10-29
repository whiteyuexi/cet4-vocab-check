/* 四六级词汇量检测 · 小程序入口
   这里做两件事：把引擎的提示接到 wx.showToast，并把词库预热提前到启动阶段。
   预热很重要：词库是 843KB 的 JS 字面量模块，首次 activePool() 还要建 7175 词的 FNV 序位表，
   放到答题页里做会在点「开始」时卡一下（见 IMPORT-NOTES 第 5 节真机待确认项）。 */
var engineMod = require('./utils/engine.js');

App({
  onLaunch: function () {
    var eng = engineMod.engine;
    eng.onToast = function (msg) {
      wx.showToast({ title: String(msg), icon: 'none' });
    };
    this.globalData.engine = eng;
    /* 预热：触发词库解析 + 序位表构建。失败不阻断启动（真机上最多是首题慢一点） */
    try {
      eng.activePool();
      eng.curPoolSize();
    } catch (e) {
      console.warn('[warmup] 词库预热失败', e);
    }
  },
  globalData: { engine: null }
});
