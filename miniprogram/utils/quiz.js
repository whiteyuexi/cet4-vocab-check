/* ======================================================================
   词汇账户余额查询 · 答题流程控制器（微信小程序移植版）
   移植自 src/app.part2.js（网页版第 2 部分），只做必要改动：
     · 删除 viewTest 里的 HTML 拼装、onKey 键盘、quitAsk 弹窗（全是视图）
     · setTimeout / clearTimeout 的自动跳转 -> 不再自己计时，改为在状态里
       给出 auto{pending,delay}，由视图层用自己的 timer 调 next()
     · A.render() -> 注入点 onChange(state)；A.go(route) -> 注入点 onGo(route)
     · A.announce()（屏幕阅读器）/ A.speak()（浏览器语音合成）
       -> 注入点 onAnnounce(text) / onSpeak(word)，缺省时静默
     · A.toast() -> 沿用引擎的 toast（引擎已有 A.onToast 注入点），可用 options.onToast 覆盖
   题序、分组边界、进度语义、收工判定、结算写入存档的 JSON 结构与键名一行未改。
   逐字段一致性测试见 test/quiz-parity.mjs；说明见 IMPORT-NOTES.md 第 10 节。

   用法：
     var quizMod = require('../../utils/quiz.js');
     var q = quizMod.quiz;                       // 默认单例（绑定引擎默认单例）
     var q2 = quizMod.createQuiz(engine, { onChange: fn, onGo: fn, onToast: fn });
   ====================================================================== */
'use strict';

var engineMod = require('./engine.js');

/* 三种判定对应的分数：认识 = 2 / 模糊 = 1 / 不认识 = 0。
   这是全站唯一的评分口径，存档 S.status[词] 存的就是这三个值。 */
var V_KNOWN = 2, V_FUZZY = 1, V_NONE = 0;

/* 与网页版逐字相同的说法（v 非法时落到「不认识」，网页版的三元表达式也是如此） */
function vText(v) { return v === V_KNOWN ? '认识' : (v === V_FUZZY ? '模糊' : '不认识'); }

/* ---------------------------------------------------------------------
   控制器工厂
   A       引擎实例（utils/engine.js 的 engine 或 createEngine() 的返回值）
   options 注入点（全部可选，缺省时静默/降级）：
     onChange(state)   状态变了、视图该重新 setData —— 取代网页版的 A.render()
     onGo(route)       要切页：'test' | 'result' | 'home' —— 取代网页版的 A.go()
     onToast(msg)      提示文案 —— 缺省走引擎的 A.toast（即 A.onToast）
     onAnnounce(text)  无障碍播报（如 setData 到 aria-live）—— 网页版是 announce()
     onSpeak(word)     发音 —— 网页版是 speechSynthesis，小程序里由视图层决定要不要做
   --------------------------------------------------------------------- */
function createQuiz(A, options) {
  options = options || {};
  if (!A) A = engineMod.engine;

  /* 网页版 part2 顶部的 RUN：属于「一次渲染周期的界面状态」，不是存档的一部分。
     注意它不落盘：刷新后回到未揭示状态（与网页版完全一致）。 */
  var RUN = { revealed: false, opts: null, optsPos: -1, picked: -1, auto: null };
  var route = null;          // 控制器最近一次请求的页面（视图层据此 navigateTo）
  var finishing = false;     // 防重入：网页版在「题号越界 + 一题没答」时 viewTest↔finishSession 会无限递归，
                             // 小程序里栈更浅、崩得更容易，所以这里显式挡住（行为差异仅限这条病态分支）

  function sess() { return A.S.session; }

  /* ---------- 注入点 ---------- */
  function toast(msg) {
    if (typeof options.onToast === 'function') { try { options.onToast(msg); } catch (e) {} return; }
    if (typeof A.toast === 'function') A.toast(msg);
  }
  function announce(msg) {
    if (typeof options.onAnnounce === 'function') { try { options.onAnnounce(msg); } catch (e) {} }
  }
  function speak(word) {
    if (typeof options.onSpeak === 'function') { try { options.onSpeak(word); } catch (e) {} }
  }
  function navigate(r) {
    route = r;
    if (typeof options.onGo === 'function') { try { options.onGo(r); } catch (e) {} }
  }
  function changed() {
    if (typeof options.onChange === 'function') { try { options.onChange(view()); } catch (e) {} }
  }

  /* ---------- 自动跳转（网页版是 setTimeout，这里只描述意图） ---------- */
  function clearAuto() { RUN.auto = null; }                       // 对应网页版 clearTimer()
  function scheduleAuto(delay) {                                  // 对应网页版 RUN.timer = setTimeout(...)
    clearAuto();
    RUN.auto = { pending: true, delay: delay, action: 'next' };
  }

  /* ---------- 创建一次检测 ----------
     kind: 'group' | 'all' | 'probe' | 'list'
     opts: { group, target, list, label } —— 与网页版同名同义
     返回 { ok, reason }：网页版是 toast + return，这里额外把原因返回给页面 */
  function start(kind, opts) {
    opts = opts || {};
    var pool = A.activePool();
    var queue = [], label = '', groupIdx = null, target = 0;

    if (kind === 'group') {
      var gs = A.groups();
      var g = opts.group || 0;
      if (!gs[g]) return { ok: false, reason: 'no-group' };
      queue = gs[g].slice();
      groupIdx = g;
      var from = 0;
      for (var a = 0; a < g; a++) from += gs[a].length;
      label = '第 ' + (g + 1) + ' 组 · 第 ' + (from + 1) + '-' + (from + queue.length) + ' 词';
    } else if (kind === 'all') {
      queue = pool.slice();
      var first = 0;
      for (var i = 0; i < queue.length; i++) { if (A.getSt(queue[i]) === undefined) { first = i; break; } }
      if (first > 0) queue = queue.slice(first).concat(queue.slice(0, first));
      label = '全量检测 · ' + queue.length + ' 词';
    } else if (kind === 'probe') {
      // 分层抽样：按词频段等比例交错，测到目标精度就停
      queue = A.probeQueue();
      target = opts.target || 250;
      label = '摸底检测 · 目标 ±' + target + ' 词';
    } else if (kind === 'list') {
      queue = (opts.list || []).slice();
      if (!queue.length) { toast('没有可检测的词'); return { ok: false, reason: 'empty-list' }; }
      label = opts.label || ('错词重测 · ' + queue.length + ' 词');
    }

    /* 空队列绝不能开测：网页版这里也拦（否则会引发 结束→渲染→结束 的死循环） */
    if (!queue.length) { toast('当前词库里没有可检测的词'); return { ok: false, reason: 'no-words' }; }
    var preTested = 0;
    for (var q = 0; q < queue.length; q++) if (A.getSt(queue[q]) !== undefined) preTested++;
    A.S.session = {
      kind: kind, label: label, group: groupIdx, queue: queue,
      bank: A.bankKey(), preTested: preTested, target: target,
      pos: 0, log: [], skipped: 0, startedAt: Date.now()
    };
    RUN.revealed = false; RUN.picked = -1; RUN.opts = null; RUN.optsPos = -1;
    clearAuto();
    A.save();
    navigate('test');
    changed();
    return { ok: true };
  }

  /* ---------- 本轮已作答的分布 ---------- */
  function counts() {
    var s = sess(), k = 0, f = 0, u = 0;
    if (!s) return { k: k, f: f, u: u, answered: 0 };
    for (var i = 0; i < s.log.length; i++) {
      var v = s.log[i].v;
      if (v === V_KNOWN) k++; else if (v === V_FUZZY) f++; else u++;
    }
    return { k: k, f: f, u: u, answered: s.log.length };
  }

  /* ---------- 选择题选项（四选一模式） ----------
     与网页版逐字一致，包括 Math.random 的取法：先随机取词池下标凑够 4 项，再整体洗牌。
     这 2 处随机只影响「选项顺序」，不影响任何分数与统计口径。 */
  function buildOptions(i) {
    var correct = A.WORDS[i].t;
    var opts = [{ i: i, t: correct, ok: true }];
    var pool = A.activePool();
    var guard = 0;
    while (opts.length < 4 && guard++ < 600) {
      var j = pool[Math.floor(Math.random() * pool.length)];
      if (j === i) continue;
      var tx = A.WORDS[j].t;
      if (!tx || tx === correct) continue;
      var dup = false;
      for (var n = 0; n < opts.length; n++) if (opts[n].t === tx) { dup = true; break; }
      if (dup) continue;
      opts.push({ i: j, t: tx, ok: false });
    }
    return A.shuffle(opts);
  }
  /* 网页版 viewTest 第 324 行：题号变了才重建选项（免得每帧重洗牌） */
  function ensureOptions(i, pos) {
    if (RUN.optsPos !== pos || !RUN.opts) { RUN.opts = buildOptions(i); RUN.optsPos = pos; RUN.picked = -1; }
    return RUN.opts;
  }

  /* ---------- 作答：自评三档 ---------- */
  function judge(v) {
    var s = sess();
    if (!s) return false;
    var i = s.queue[s.pos];
    if (i === undefined) return false;
    var prev = A.getSt(i);
    A.setSt(i, v);
    var last = s.log[s.log.length - 1];
    if (last && last.i === i) {
      last.v = v;                       // 同一题重复点击（双击/手抖）：改判，不再多记一题
    } else {
      s.log.push({ i: i, v: v, prev: prev === undefined ? null : prev });
    }
    RUN.revealed = true;
    RUN.picked = -1;
    A.save();
    changed();
    announce(A.WORDS[i].w + '：已标记为' + vText(v));
    if (A.S.settings.autoNext) scheduleAuto(A.S.settings.autoDelay);
    return true;
  }

  /* ---------- 作答：四选一 ---------- */
  function pick(optIndex) {
    var s = sess();
    if (!s || RUN.revealed) return false;
    var opts = RUN.opts || [];
    var o = opts[optIndex];
    if (!o) return false;
    RUN.picked = optIndex;
    var cur = s.queue[s.pos];
    var prev = A.getSt(cur);
    var v = o.ok ? V_KNOWN : V_NONE;    // 选对 = 认识，选错 = 不认识（没有「模糊」这一档）
    A.setSt(cur, v);
    var lastP = s.log[s.log.length - 1];
    if (lastP && lastP.i === cur) lastP.v = v; else s.log.push({ i: cur, v: v, prev: prev === undefined ? null : prev });
    RUN.revealed = true;
    A.save();
    changed();
    if (!o.ok) speak(A.WORDS[s.queue[s.pos]].w);
    scheduleAuto(o.ok ? 750 : 1600);
    return true;
  }

  /* ---------- 改判：自评后发现记错了 ---------- */
  function rejudge(v) {
    var s = sess();
    if (!s || !s.log.length) return false;
    var last = s.log[s.log.length - 1];
    A.setSt(last.i, v);
    last.v = v;
    clearAuto();
    A.save();
    changed();
    toast('已改判为「' + vText(v) + '」');
    return true;
  }

  /* ---------- 探测模式：精度达标就收工 ---------- */
  function probeReached(s) {
    s = s || sess();
    if (!s || s.kind !== 'probe') return false;
    if (s.log.length < 20) return false;
    var st = A.probeStats(s);
    return st.half <= s.target;
  }

  /* ---------- 下一题 ---------- */
  function next() {
    var s = sess();
    if (!s) return false;
    clearAuto();
    s.pos++;
    RUN.revealed = false; RUN.picked = -1; RUN.opts = null; RUN.optsPos = -1;
    if (s.pos >= s.queue.length) { finish(); return true; }
    if (probeReached(s)) {
      A.save();
      finish();
      toast('已达到目标精度 ±' + s.target + ' 词，检测完成');
      return true;
    }
    A.save();
    changed();
    announce('第 ' + (s.pos + 1) + ' 个词：' + A.WORDS[s.queue[s.pos]].w);
    return true;
  }

  /* ---------- 跳过（不计入作答） ---------- */
  function skip() {
    var s = sess();
    if (!s) return false;
    clearAuto();
    s.skipped++;
    s.pos++;
    RUN.revealed = false; RUN.picked = -1; RUN.opts = null; RUN.optsPos = -1;
    if (s.pos >= s.queue.length) { finish(); return true; }
    A.save();
    changed();
    return true;
  }

  /* ---------- 撤销：若撤销的正是当前这一题，则停留在本题重答；否则回到上一题 ---------- */
  function undo() {
    var s = sess();
    if (!s || !s.log.length) { toast('没有可撤销的作答'); return false; }
    clearAuto();
    var last = s.log[s.log.length - 1];
    var isCurrent = s.queue[s.pos] === last.i;
    s.log.pop();
    if (last.prev === null) A.clearSt(last.i); else A.setSt(last.i, last.prev);
    if (!isCurrent) s.pos = Math.max(0, s.pos - 1);
    RUN.revealed = false; RUN.picked = -1; RUN.opts = null; RUN.optsPos = -1;
    A.save();
    changed();
    toast('已撤销，回到该词');
    return true;
  }

  /* ---------- 悄悄撤销当前题的作答（切换答题方式等场景），不改变题号 ---------- */
  function revertCurrent() {
    var s = sess();
    if (!s || !s.log.length) return false;
    var last = s.log[s.log.length - 1];
    if (s.queue[s.pos] !== last.i) return false;
    s.log.pop();
    if (last.prev === null) A.clearSt(last.i); else A.setSt(last.i, last.prev);
    A.save();
    return true;
  }

  /* ---------- 结束并生成结果（写入 S.lastResult / S.history / probe 样本） ---------- */
  function finish() {
    if (finishing) return { ok: false, reason: 'reentrant' };
    finishing = true;
    try { return finishInner(); } finally { finishing = false; }
  }
  function finishInner() {
    var s = sess();
    if (!s) { navigate('home'); changed(); return { ok: false, reason: 'no-session' }; }
    clearAuto();
    var c = counts();
    if (!c.answered) {                    // 一题没答就「结束」不该产生一条空记录
      if (!s.queue.length) {              // 空会话直接清掉并回首页，否则会来回递归
        A.S.session = null; A.save();
        toast('本次检测没有可测的词');
        navigate('home'); changed();
        return { ok: false, reason: 'no-words' };
      }
      toast('这一轮还没有作答，先做一题再结束吧');
      navigate('test'); changed();
      return { ok: false, reason: 'no-answer' };
    }
    // 只有随机抽样能用于词汇量估算；探测模式额外存下分层明细，便于用分层估计收窄区间
    if (s.kind === 'probe') {
      var st = A.probeStats(s);
      A.addSample({
        n: c.answered, k: c.k, f: c.f, pre: s.preTested, bank: s.bank,
        mode: A.S.settings.mode, bands: st.data || null
      });
    }
    var res = {
      kind: s.kind, label: s.label, bank: s.bank || A.bankKey(), ts: Date.now(),
      total: c.answered, k: c.k, f: c.f, u: c.u, skipped: s.skipped,
      log: s.log.slice()
    };
    A.S.lastResult = res;
    A.S.history.unshift({ ts: res.ts, kind: res.kind, label: res.label, bank: res.bank, total: res.total, k: res.k, f: res.f, u: res.u });
    if (A.S.history.length > 40) A.S.history.length = 40;
    A.S.session = null;
    A.save();
    // 一次达标的随机摸底也算「完成一次检测」，给一次 AI 深度诊断额度
    try { if (A.maybeGrantAiQuota) A.maybeGrantAiQuota('probe'); } catch (e) {}
    RUN.revealed = false;
    navigate('result');
    changed();
    return { ok: true, result: res };
  }

  /* ---------- 放弃本次（作答记录保留） ---------- */
  function abandon() {
    clearAuto();
    A.S.session = null;
    A.save();
    toast('已放弃本次检测，作答记录仍然保留');
    navigate('home');
    changed();
    return true;
  }

  /* ---------- 保存并返回（网页版 part3 的 'quit-keep'：会话原样留着，下次在首页「继续检测」） ----------
     网页版这段是「关掉弹窗 + go('home')」，没有别的状态变化；这里把它显式化成方法，
     免得每个页面各写一遍、写漏 A.save()。 */
  function leave() {
    clearAuto();
    A.save();
    navigate('home');
    changed();
    return true;
  }

  /* ---------- 多轮重测：归档本轮 + 清空工作状态（引擎负责，这里只管界面态） ---------- */
  function startNewRound() {
    var ok = A.startNewRound();
    if (ok) {
      RUN.revealed = false; RUN.picked = -1; RUN.opts = null; RUN.optsPos = -1;
      clearAuto();
      navigate('home');
      changed();
    }
    return ok;
  }
  function canRetest() { return A.canRetest(); }
  function hasSession() { return !!sess(); }

  /* ---------- 最后一个作答的分值（网页版 lastV） ---------- */
  function lastV() {
    var s = sess();
    if (!s || !s.log.length) return -1;
    return s.log[s.log.length - 1].v;
  }

  /* ---------- 「现在该显示什么」：网页版 viewTest 里的全部计算 ----------
     只算数据，不拼 HTML。字段见 IMPORT-NOTES.md 第 10 节的契约表。
     注意：与网页版一样，choice 模式下这次调用可能会懒建选项（唯一的随机源）。 */
  function view() { return buildView(0); }
  function buildView(depth) {
    var s = sess();
    if (!s) {
      return {
        route: route, hasSession: false, auto: autoState(),
        mode: A.S.settings.mode, settings: settingsState()
      };
    }
    var total = s.queue.length, pos = s.pos;
    var i = s.queue[pos];
    if (i === undefined) {
      if (!s.queue.length) {              // 防御：空会话不渲染、不递归
        A.S.session = null; A.save();
        return { route: route, hasSession: false, emptyQueue: true, auto: autoState(), settings: settingsState() };
      }
      if (depth > 0) {                    // 防御：状态坏了又不肯收工时，别递归到底
        return { route: route, hasSession: true, stuck: true, pos: pos, total: total, auto: autoState(), settings: settingsState() };
      }
      finish();                           // 与网页版 viewTest 一致：题号越界就地收工
      return buildView(depth + 1);
    }
    var w = A.WORDS[i];
    var c = counts();
    var acc = A.pct(c.k + 0.5 * c.f, c.answered);
    var mode = A.S.settings.mode;

    var probeLine = '', probeBar = A.pct(pos, total);
    /* 节奏与剩余时间：答满 5 题后按实际速度估算（网页版逐字相同） */
    var elapsed = (Date.now() - s.startedAt) / 1000;
    var pace = c.answered >= 5 ? elapsed / c.answered : 0;
    function eta(n) {
      if (!pace || !n) return '';
      var sec = Math.round(pace * n);
      return sec < 60 ? ' · 约还需 ' + sec + ' 秒' : ' · 约还需 ' + Math.round(sec / 60) + ' 分钟';
    }
    var probe = null;
    if (s.kind === 'probe') {
      var st = A.probeStats(s);
      var need = st.n ? Math.max(0, Math.ceil(st.n * Math.pow(st.half / s.target, 2)) - st.n) : 0;
      var donePct = Math.max(2, Math.min(100, Math.round(st.n / Math.max(st.n + need, 1) * 100)));
      probeBar = st.n ? donePct : 2;
      /* 网页版这里是 "...当前精度 <b>±250 词</b>..."，字符串里带标签；
         控制器不产出 HTML，所以去掉 <b> 后仍是同一段文字（去掉标签即逐字相同） */
      probeLine = '已测 ' + st.n + ' 词 · 当前精度 ±' + (st.half === Infinity ? '—' : st.half) + ' 词' +
        (need > 0 ? ' · 还需约 ' + need + ' 词（目标 ±' + s.target + '）' + eta(need) : ' · 已达标，可以结束了');
      probe = {
        n: st.n, half: st.half === Infinity ? null : st.half,
        universe: st.universe, vocab: st.vocab, lo: st.lo, hi: st.hi, se: st.se,
        target: s.target, need: need, donePct: donePct,
        reached: probeReached(s)
      };
    } else {
      probeLine = '第 ' + (pos + 1) + ' / ' + total + ' 词' + (c.answered ? ' · 本次掌握率 ' + acc + '%' : '') +
        eta(total - pos - 1);
    }

    var opts = null;
    if (mode === 'choice') {
      opts = ensureOptions(i, pos).map(function (o, n) {
        var cls = 'opt';
        if (RUN.revealed) {
          if (o.ok) cls += ' right';
          else if (n === RUN.picked) cls += ' wrong';
        }
        return { i: o.i, t: o.t, ok: o.ok, cls: cls, picked: n === RUN.picked };
      });
    }

    return {
      route: route, hasSession: true,
      kind: s.kind, label: s.label, group: s.group, bank: s.bank, target: s.target,
      pos: pos, total: total, index: i,
      /* 题面：单词 / 音标 / 释义 / 短语（例句源不在小程序包里，见 IMPORT-NOTES） */
      word: { w: w.w, p: w.p || '', t: w.t, ph: w.ph || null, band: A.bandOf(i) },
      counts: c,
      accuracy: acc,
      progressText: probeLine,       // 与网页版那一行 tiny 逐字相同（网页版带 <b>，去掉标签即同）
      barPct: probeBar,
      probe: probe,
      mode: mode,
      opts: opts,
      revealed: RUN.revealed,
      lastV: lastV(),
      picked: RUN.picked,
      canUndo: s.log.length > 0,
      canSkip: !RUN.revealed,
      canNext: RUN.revealed,
      skipped: s.skipped,
      startedAt: s.startedAt,
      auto: autoState(),
      settings: settingsState()
    };
  }

  function autoState() {
    var a = RUN.auto;
    return a ? { pending: true, delay: a.delay, action: a.action } : { pending: false, delay: 0, action: null };
  }
  function settingsState() {
    return { mode: A.S.settings.mode, autoNext: !!A.S.settings.autoNext, autoDelay: A.S.settings.autoDelay };
  }

  return {
    /* 生命周期 */
    start: start, finish: finish, abandon: abandon, leave: leave,
    /* 作答 */
    judge: judge, pick: pick, rejudge: rejudge, skip: skip, undo: undo, revertCurrent: revertCurrent,
    /* 推进 */
    next: next,
    /* 查询 */
    view: view, counts: counts, probeReached: probeReached, lastV: lastV, hasSession: hasSession,
    ensureOptions: ensureOptions,
    /* 多轮 */
    startNewRound: startNewRound, canRetest: canRetest,
    /* 引擎（部分页面会直接用） */
    engine: A
  };
}

module.exports = {
  createQuiz: createQuiz,
  quiz: createQuiz(engineMod.engine),
  vText: vText
};
