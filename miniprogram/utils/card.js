/* ======================================================================
   回访卡（小程序版）
   与网页版 A.revisitInfo / A.revisitShow 同一套规则，只是不渲染 HTML：
     · 距上次检测满 3 天才出现（可永久关闭，开关存在 settings 里）
     · 三行结论全部本地算：最该先补哪一段 / 补完约几天 / 涨跌有没有超出抽样误差
     · target 与 weak 分开：高频三段还有洞就优先它们；冷门段最弱时如实说明"不先补它"
     · 不调大模型、不消耗任何额度
   用法：
     var card = require('../../utils/card.js');
     var info = card.info(eng);            // 没数据返回 null
     var show = card.shouldShow(eng, { hidden: false });
     var lines = card.lines(info);         // 三行文案（字符串数组）
   ====================================================================== */
'use strict';

var GAP_DAYS = 3;
var DAY = 86400000;

/* 每天能背多少词 = 每日可投入时间 ÷ 每词约 1.5 分钟，夹在 5–200（与网页版同一个公式） */
function perDayWords(eng) {
  var s = (eng.S && eng.S.settings) || {};
  var dm = s.dailyMinutes || 30;
  return Math.max(5, Math.min(200, Math.round(dm / 1.5)));
}

/* 最近一次抽样的时间：优先用 estimateNow 带回的 ts，没有就退回最新一条样本 */
function lastTs(eng) {
  var es = eng.estimateNow();
  if (es && es.ts) return es.ts;
  var ss = (eng.S && eng.S.samples) || [];
  return ss.length ? ss[ss.length - 1].ts : 0;
}

function info(eng) {
  var es = eng.estimateNow();
  if (!es || (es.kind !== 'sample' && es.kind !== 'full')) return null;
  var s = (eng.S && eng.S.settings) || {};
  var strict = !!s.strict;
  var now = Date.now();
  var ts = es.ts || lastTs(eng) || now;
  var out = {
    kind: es.kind,
    ts: ts,
    days: Math.max(0, Math.floor((now - ts) / DAY)),
    vocab: strict ? es.strictVocab : es.looseVocab,
    half: es.kind === 'sample'
      ? Math.round(((strict ? es.strictHi - es.strictLo : es.hi - es.lo) || 0) / 2)
      : 0,
    perDay: perDayWords(eng),
    weak: null,
    target: null,
    prev: null,
    delta: null,
    deltaWithinNoise: false
  };

  /* 只在样本 ≥3 词的段里挑最弱段：抽到 1 个词全错就宣布最弱是假结论 */
  var prof = eng.bandProfile();
  var rows = (prof.rows || []).filter(function (r) { return r.p !== null && r.n >= 3; })
    .sort(function (a, b) { return a.p - b.p; });
  var weak = rows.length ? rows[0] : null;
  var warm = rows.filter(function (r) { return r.band >= 1 && r.band <= 3; })
    .sort(function (a, b) { return a.p - b.p; })[0];
  var pick = (warm && warm.p < 0.9) ? warm : weak;

  function shape(r) {
    return {
      band: r.band,
      p: r.p,
      N: r.N,
      n: r.n,
      gapWords: Math.max(1, Math.round((1 - r.p) * r.N))
    };
  }
  if (pick) {
    out.weak = weak ? shape(weak) : null;
    out.target = shape(pick);
    out.daysToFill = Math.max(1, Math.ceil(out.target.gapWords / out.perDay));
  }

  /* 有归档的上一轮就给变化；差值在 ±抽样误差内时如实说"先别当成进步" */
  var rounds = eng.roundHistory ? eng.roundHistory() : [];
  var prev = rounds.length ? rounds[rounds.length - 1] : null;
  if (prev && typeof prev.loose === 'number' && prev.finishedAt) {
    out.prev = { vocab: prev.loose, days: Math.max(0, Math.floor((now - prev.finishedAt) / DAY)) };
    out.delta = out.vocab - prev.loose;
    out.deltaWithinNoise = out.half > 0 && Math.abs(out.delta) < out.half;
  }
  return out;
}

function shouldShow(eng, opt) {
  opt = opt || {};
  var s = (eng.S && eng.S.settings) || {};
  if (opt.force) return true;
  if (opt.hidden) return false;
  if (s.revisitOff) return false;
  var sess = eng.S && eng.S.session;
  if (sess && sess.queue && sess.queue.length) return false;   // 未测完的检测由"继续检测"负责
  var inf = info(eng);
  if (!inf) return false;
  return inf.days >= GAP_DAYS;
}

/* 三行文案：把数字拼成人话，视图层只管渲染 */
function lines(inf, bandName) {
  if (!inf) return [];
  var name = bandName || function (b) { return '第 ' + b + ' 段'; };
  var out = [];
  if (inf.target) {
    var t = inf.target;
    var tail = t.band === 1
      ? '最高频段在真题里出现最密，先补它收益最大。'
      : (t.band === 2 || t.band === 3
        ? '这一段出现频率仍然很高，补它比补冷门段划算。'
        : '这一段偏冷门，先补高频段更划算。');
    out.push('最该先补的是' + name(t.band) + '段：掌握 ' + Math.round(t.p * 100) + '%（该段抽到 ' + t.n + ' 词）——' +
      '全段 ' + t.N + ' 词里约 ' + t.gapWords + ' 个还没拿下。' + tail);
    if (inf.weak && inf.weak.band !== t.band) {
      out.push('全库最弱的是' + name(inf.weak.band) + '段（' + Math.round(inf.weak.p * 100) + '%），但它偏冷门，收益不如先补上面这一段。');
    }
    out.push('按每天 ' + inf.perDay + ' 词算，补完这一段约 ' + inf.daysToFill + ' 天（可在设置里改）。');
  } else {
    out.push('这次抽样覆盖的频段还不够分散，看不出哪一段最弱——再测一轮就能定位。');
  }
  if (inf.prev) {
    var d = inf.delta, sign = d > 0 ? '+' : '';
    out.push('与上一轮（' + inf.prev.days + ' 天前 ' + inf.prev.vocab + ' 词）相比 ' + sign + d + ' 词：' +
      (inf.deltaWithinNoise
        ? '这个差值还在 ±' + inf.half + ' 的抽样误差以内，先别当成进步。'
        : '已经超出 ±' + inf.half + ' 的抽样误差，可以算真实变化。'));
  }
  return out;
}

module.exports = {
  GAP_DAYS: GAP_DAYS,
  perDayWords: perDayWords,
  info: info,
  shouldShow: shouldShow,
  lines: lines
};
