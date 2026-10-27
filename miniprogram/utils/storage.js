/* ======================================================================
   存储适配层 —— 微信小程序 / Node 双端（替掉网页版的 localStorage 调用点）
   ----------------------------------------------------------------------
   接口刻意与浏览器 localStorage 保持一致，只有三个方法：
     getItem(key) -> string | null     缺失返回 null，不是 undefined、不是空串
     setItem(key, value) -> void       可能抛异常（配额写满 / 隐私模式），调用方自己 try
     removeItem(key) -> void
   引擎侧把这层当作 localStorage 的同义替换（见 engine.js 顶部说明），
   因此不要在这里加序列化、加前缀、加缓存——那会改变存档键的语义，
   网页版与小程序版就无法共用同一份存档结构了。

   为什么返回值必须严格是 string | null：
     wx.getStorageSync 读不到键时返回空串，而 localStorage.getItem 返回 null。
     引擎里 if (!raw) return d 这类判断两者等价；但 loadState 用 raw === undefined
     区分「显式传入」与「去存储里读」，这个判断只有 null 能表达，
     所以适配层统一把空串 / 缺失归一成 null。
   ====================================================================== */
'use strict';

/* 内存实现：Node 测试用，也是小程序存储不可用时的兜底。
   用普通对象而不是 Map —— 要的是「最不可能出问题」的实现。 */
function createMemoryStorage() {
  var map = Object.create(null);
  function has(k) {
    return Object.prototype.hasOwnProperty.call(map, k);
  }
  return {
    kind: 'memory',
    getItem: function (k) {
      return has(k) ? map[k] : null;
    },
    setItem: function (k, v) {
      map[k] = String(v);
    },
    removeItem: function (k) {
      if (has(k)) delete map[k];
    },
    keys: function () {
      return Object.keys(map);
    },
    clear: function () {
      map = Object.create(null);
    },
    /* 测试辅助：把整份存储导成普通对象，方便断言存档内容 */
    dump: function () {
      var out = {};
      Object.keys(map).forEach(function (k) { out[k] = map[k]; });
      return out;
    }
  };
}

/* wx 同步存储实现。api 参数允许注入（测试可喂一个假 wx）。
   没有 wx 全局时返回 null，由 createStorage 回退到内存实现。 */
function createWxStorage(api) {
  var w = api || (typeof wx !== 'undefined' ? wx : null);
  if (!w || typeof w.getStorageSync !== 'function' || typeof w.setStorageSync !== 'function') return null;
  return {
    kind: 'wx',
    getItem: function (k) {
      /* wx 读操作极少数情况下会抛（存储被清理 / 内部错误）：这里吞掉并当作「没存过」，
         与网页版 localStorage.getItem 抛错时被调用方 try 住的效果一致 —— 都回退成默认状态。 */
      try {
        var v = w.getStorageSync(k);
        if (v === '' || v === undefined || v === null) return null;
        return typeof v === 'string' ? v : String(v);
      } catch (e) {
        return null;
      }
    },
    /* 刻意不吞异常：网页版 localStorage.setItem 在配额写满时抛，
       引擎靠这个异常置 A.storageBroken 并在界面上提示用户。
       小程序里 wx.setStorageSync 同样会抛（单键 1MB / 单应用 10MB 上限）。 */
    setItem: function (k, v) {
      w.setStorageSync(k, String(v));
    },
    removeItem: function (k) {
      if (typeof w.removeStorageSync === 'function') w.removeStorageSync(k);
    },
    keys: function () {
      try {
        var info = typeof w.getStorageInfoSync === 'function' ? w.getStorageInfoSync() : null;
        return (info && info.keys) ? info.keys.slice() : [];
      } catch (e) {
        return [];
      }
    },
    clear: function () {
      if (typeof w.clearStorageSync === 'function') w.clearStorageSync();
    }
  };
}

/* 优先级：显式要求内存 -> 内存；否则 wx 可用就用 wx，不可用回退内存。 */
function createStorage(options) {
  options = options || {};
  if (options.force === 'memory') return createMemoryStorage();
  if (options.api) {
    var injected = createWxStorage(options.api);
    if (injected) return injected;
  }
  return createWxStorage() || createMemoryStorage();
}

var defaultStorage = createStorage();

module.exports = defaultStorage;
module.exports.createStorage = createStorage;
module.exports.createMemoryStorage = createMemoryStorage;
module.exports.createWxStorage = createWxStorage;
