/* ============ 第二部分：检测引擎与答题界面 ============ */
(function (A) {
  'use strict';

  var tpl = A.tpl, esc = A.esc, el = A.el;

  var RUN = A.RUN = { timer: null, revealed: false, opts: null, optsPos: -1, picked: -1 };

  function clearTimer() { if (RUN.timer) { clearTimeout(RUN.timer); RUN.timer = null; } }
  A.clearTimer = clearTimer;

  /* ---------- 创建一次检测 ---------- */
  A.startSession = function (kind, opts) {
    opts = opts || {};
    var pool = A.activePool();
    var queue = [], label = '', groupIdx = null, target = 0;

    if (kind === 'group') {
      var gs = A.groups();
      var g = opts.group || 0;
      if (!gs[g]) return;
      queue = gs[g].slice();
      groupIdx = g;
      var start = 0;
      for (var a = 0; a < g; a++) start += gs[a].length;
      label = '第 ' + (g + 1) + ' 组 · 第 ' + (start + 1) + '-' + (start + queue.length) + ' 词';
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
      if (!queue.length) { A.toast('没有可检测的词'); return; }
      label = opts.label || ('错词重测 · ' + queue.length + ' 词');
    }

    if (!queue.length) { A.toast('当前词库里没有可检测的词'); return; }   // 空队列绝不能开测：会引发结束→渲染→结束的死循环
    var preTested = 0;
    for (var q = 0; q < queue.length; q++) if (A.getSt(queue[q]) !== undefined) preTested++;
    A.S.session = {
      kind: kind, label: label, group: groupIdx, queue: queue,
      bank: A.bankKey(), preTested: preTested, target: target,
      pos: 0, log: [], skipped: 0, startedAt: Date.now()
    };
    RUN.revealed = false; RUN.picked = -1; RUN.opts = null; RUN.optsPos = -1;
    clearTimer();
    A.save();
    A.go('test');
  };

  A.sessionCounts = function () {
    var sess = A.S.session, k = 0, f = 0, u = 0;
    if (!sess) return { k: k, f: f, u: u, answered: 0 };
    for (var i = 0; i < sess.log.length; i++) {
      var v = sess.log[i].v;
      if (v === 2) k++; else if (v === 1) f++; else u++;
    }
    return { k: k, f: f, u: u, answered: sess.log.length };
  };

  /* ---------- 选择题选项 ---------- */
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

  /* ---------- 作答 ---------- */
  A.judge = function (v) {
    var sess = A.S.session;
    if (!sess) return;
    var i = sess.queue[sess.pos];
    if (i === undefined) return;
    var prev = A.getSt(i);
    A.setSt(i, v);
    var last = sess.log[sess.log.length - 1];
    if (last && last.i === i) {
      last.v = v;                       // 同一题重复点击（双击/手抖）：改判，不再多记一题
    } else {
      sess.log.push({ i: i, v: v, prev: prev === undefined ? null : prev });
    }
    RUN.revealed = true;
    RUN.picked = -1;
    A.save();
    A.render();
    if (A.S.settings.autoBothAccents && A.S.settings.sound) A.speakAll(A.WORDS[i].w, ['uk', 'us']);
    A.announce(A.WORDS[i].w + '：已标记为' + (v === 2 ? '认识' : v === 1 ? '模糊' : '不认识'));
    if (A.S.settings.autoNext) {
      clearTimer();
      RUN.timer = setTimeout(function () { A.nextQ(); }, A.S.settings.autoDelay);
    }
  };

  A.pick = function (optIndex) {
    var sess = A.S.session;
    if (!sess || RUN.revealed) return;
    var opts = RUN.opts || [];
    var o = opts[optIndex];
    if (!o) return;
    RUN.picked = optIndex;
    var cur = sess.queue[sess.pos];
    var prev = A.getSt(cur);
    var v = o.ok ? 2 : 0;
    A.setSt(cur, v);
    var lastP = sess.log[sess.log.length - 1];
    if (lastP && lastP.i === cur) lastP.v = v; else sess.log.push({ i: cur, v: v, prev: prev === undefined ? null : prev });
    RUN.revealed = true;
    A.save();
    A.render();
    if (!o.ok) {
      var wPicked = A.WORDS[sess.queue[sess.pos]].w;
      if (A.S.settings.autoBothAccents) A.speakAll(wPicked, ['uk', 'us']); else A.speak(wPicked);
    }
    clearTimer();
    RUN.timer = setTimeout(function () { A.nextQ(); }, o.ok ? 750 : 1600);
  };

  /* 改判：自评后发现记错了 */
  A.rejudge = function (v) {
    var sess = A.S.session;
    if (!sess || !sess.log.length) return;
    var last = sess.log[sess.log.length - 1];
    A.setSt(last.i, v);
    last.v = v;
    clearTimer();
    A.save();
    A.render();
    A.toast('已改判为「' + (v === 2 ? '认识' : v === 1 ? '模糊' : '不认识') + '」');
  };

  /* 探测模式：精度达标就收工 */
  A.probeReached = function (sess) {
    if (!sess || sess.kind !== 'probe') return false;
    if (sess.log.length < 20) return false;
    var st = A.probeStats(sess);
    return st.half <= sess.target;
  };
  A.nextQ = function () {
    var sess = A.S.session;
    if (!sess) return;
    clearTimer();
    sess.pos++;
    RUN.revealed = false; RUN.picked = -1; RUN.opts = null; RUN.optsPos = -1;
    if (sess.pos >= sess.queue.length) { A.finishSession(); return; }
    if (A.probeReached(sess)) {
      A.save();
      A.finishSession();
      A.toast('已达到目标精度 ±' + sess.target + ' 词，检测完成');
      return;
    }
    A.save();
    A.render();
    A.announce('第 ' + (sess.pos + 1) + ' 个词：' + A.WORDS[sess.queue[sess.pos]].w);
  };

  A.skipQ = function () {
    var sess = A.S.session;
    if (!sess) return;
    clearTimer();
    sess.skipped++;
    sess.pos++;
    RUN.revealed = false; RUN.picked = -1; RUN.opts = null; RUN.optsPos = -1;
    if (sess.pos >= sess.queue.length) { A.finishSession(); return; }
    A.save();
    A.render();
  };

  /* 撤销答题时：若撤销的正是当前这一题，则停留在本题重答；否则回到上一题 */
  A.undo = function () {
    var sess = A.S.session;
    if (!sess || !sess.log.length) { A.toast('没有可撤销的作答'); return; }
    clearTimer();
    var last = sess.log[sess.log.length - 1];
    var isCurrent = sess.queue[sess.pos] === last.i;
    sess.log.pop();
    if (last.prev === null) A.clearSt(last.i); else A.setSt(last.i, last.prev);
    if (!isCurrent) sess.pos = Math.max(0, sess.pos - 1);
    RUN.revealed = false; RUN.picked = -1; RUN.opts = null; RUN.optsPos = -1;
    A.save();
    A.render();
    A.toast('已撤销，回到该词');
  };

  /* 悄悄撤销当前题的作答（用于切换答题方式等场景），不改变题号 */
  A.revertCurrent = function () {
    var sess = A.S.session;
    if (!sess || !sess.log.length) return false;
    var last = sess.log[sess.log.length - 1];
    if (sess.queue[sess.pos] !== last.i) return false;
    sess.log.pop();
    if (last.prev === null) A.clearSt(last.i); else A.setSt(last.i, last.prev);
    A.save();
    return true;
  };

  /* ---------- 结束并生成结果 ---------- */
  A.finishSession = function () {
    var sess = A.S.session;
    if (!sess) { A.go('home'); return; }
    clearTimer();
    var c = A.sessionCounts();
    if (!c.answered) {                    // 一题没答就「结束」不该产生一条空记录
      if (!sess.queue.length) {           // 空会话直接清掉并回首页，否则会来回递归
        A.S.session = null; A.save();
        A.toast('本次检测没有可测的词');
        A.go('home');
        return;
      }
      A.toast('这一轮还没有作答，先做一题再结束吧');
      A.go('test');
      return;
    }
    // 只有随机抽样能用于词汇量估算；探测模式额外存下分层明细，便于用分层估计收窄区间
    if (sess.kind === 'probe') {
      var st = A.probeStats(sess);
      A.addSample({
        n: c.answered, k: c.k, f: c.f, pre: sess.preTested, bank: sess.bank,
        mode: A.S.settings.mode, bands: st.data || null
      });
    }
    var res = {
      kind: sess.kind, label: sess.label, bank: sess.bank || A.bankKey(), ts: Date.now(),
      total: c.answered, k: c.k, f: c.f, u: c.u, skipped: sess.skipped,
      log: sess.log.slice()
    };
    A.S.lastResult = res;
    A.S.history.unshift({ ts: res.ts, kind: res.kind, label: res.label, bank: res.bank, total: res.total, k: res.k, f: res.f, u: res.u });
    if (A.S.history.length > 40) A.S.history.length = 40;
    A.S.session = null;
    A.save();
    // 一次达标的随机摸底也算「完成一次检测」，给一次 AI 深度诊断额度
    try { if (A.maybeGrantAiQuota) A.maybeGrantAiQuota('probe'); } catch (e) {}
    RUN.revealed = false;
    A.go('result');
  };

  A.abandonSession = function () {
    A.clearTimer();
    A.S.session = null;
    A.save();
    A.toast('已放弃本次检测，作答记录仍然保留');
    A.go('home');
  };

  /* ---------- 答题界面 ---------- */
  A.viewTest = function () {
    var sess = A.S.session;
    if (!sess) {
      return '<div class="card" style="text-align:center;padding:40px 20px">' +
        '<b style="font-size:17px">还没有正在进行的检测</b>' +
        '<div class="tiny" style="margin:8px 0 18px">选择一个模式马上开始</div>' +
        '<div class="row" style="justify-content:center;flex-wrap:wrap">' +
        '<button class="btn primary" data-act="start" data-kind="quick">快速摸底 100 词</button>' +
        '<button class="btn" data-act="go" data-route="groups">分组检测</button>' +
        '<button class="btn" data-act="start" data-kind="all">全量检测</button>' +
        '</div></div>';
    }

    var total = sess.queue.length, pos = sess.pos;
    var i = sess.queue[pos];
    if (i === undefined) {
      if (!sess.queue.length) {           // 防御：空会话不渲染、不递归
        A.S.session = null; A.save();
        return '<div class="card" style="text-align:center;padding:30px"><b>本次检测没有可测的词</b>' +
          '<div class="tiny" style="margin:10px 0 16px">可能是词库为空或设置被改动</div>' +
          '<button class="btn primary" data-act="go" data-route="home">返回首页</button></div>';
      }
      A.finishSession(); return '';
    }
    var w = A.WORDS[i];
    var c = A.sessionCounts();
    var acc = A.pct(c.k + 0.5 * c.f, c.answered);
    var mode = A.S.settings.mode;

    var h = '';
    h += '<div class="test-top">';
    h += '<button class="icon-btn" data-act="quit" title="返回" aria-label="返回">←</button>';
    var probeLine = '', probeBar = A.pct(pos, total);
    // 节奏与剩余时间：答满 5 题后按实际速度估算，让"还要多久"可见
    var elapsed = (Date.now() - sess.startedAt) / 1000;
    var pace = c.answered >= 5 ? elapsed / c.answered : 0;
    function eta(n) {
      if (!pace || !n) return '';
      var sec = Math.round(pace * n);
      return sec < 60 ? ' · 约还需 ' + sec + ' 秒' : ' · 约还需 ' + Math.round(sec / 60) + ' 分钟';
    }
    if (sess.kind === 'probe') {
      var st = A.probeStats(sess);
      var need = st.n ? Math.max(0, Math.ceil(st.n * Math.pow(st.half / sess.target, 2)) - st.n) : 0;
      var donePct = Math.max(2, Math.min(100, Math.round(st.n / Math.max(st.n + need, 1) * 100)));
      probeBar = st.n ? donePct : 2;
      probeLine = '已测 ' + st.n + ' 词 · 当前精度 <b>±' + (st.half === Infinity ? '—' : st.half) + ' 词</b>' +
        (need > 0 ? ' · 还需约 ' + need + ' 词（目标 ±' + sess.target + '）' + eta(need) : ' · 已达标，可以结束了');
    } else {
      probeLine = '第 ' + (pos + 1) + ' / ' + total + ' 词' + (c.answered ? ' · 本次掌握率 ' + acc + '%' : '') +
        eta(total - pos - 1);
    }
    h += '<div class="grow"><b>' + esc(sess.label) + '</b><div class="tiny">' + probeLine + '</div></div>';
    h += '<button class="btn sm" data-act="finish">结束并看结果</button>';
    h += '</div>';
    h += '<div class="bar"><i style="width:' + probeBar + '%"></i></div>';

    h += '<div class="qcard">';
    h += '<div class="qword">' + esc(w.w) + '</div>';
    if (w.p) h += '<div class="qphon">/' + esc(w.p) + '/</div>';
    /* 发音：默认口音 + 英/美各一个按钮 + 连读。四六级听力是英音美音混合，
       同一个词点两下就能听出差别，比来回改设置省事。 */
    h += '<div class="spk-row">' +
      '<button class="spk" data-act="speak" data-w="' + esc(w.w) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>听发音</button>' +
      '<button class="spk acc" data-act="speak-accent" data-accent="uk" data-w="' + esc(w.w) + '" title="英式读音">英</button>' +
      '<button class="spk acc" data-act="speak-accent" data-accent="us" data-w="' + esc(w.w) + '" title="美式读音">美</button>' +
      '<button class="spk acc both" data-act="speak-accent" data-accent="both" data-w="' + esc(w.w) + '" title="先英式、再美式各读一遍">英+美</button>' +
      '</div>';

    if (mode === 'choice') {
      if (RUN.optsPos !== pos || !RUN.opts) { RUN.opts = buildOptions(i); RUN.optsPos = pos; RUN.picked = -1; }
      h += '<div class="opts">';
      var letters = ['A', 'B', 'C', 'D'];
      for (var n = 0; n < RUN.opts.length; n++) {
        var o = RUN.opts[n], cls = 'opt';
        if (RUN.revealed) {
          if (o.ok) cls += ' right';
          else if (n === RUN.picked) cls += ' wrong';
        }
        h += A.tpl('<button class="{cls}" data-act="pick" data-n="{n}"><span class="k">{L}</span><span>{t}</span></button>',
          { cls: cls, n: n, L: letters[n] || '', t: esc(o.t) });
      }
      h += '</div>';
      if (RUN.revealed) {
        var okNow = RUN.opts[RUN.picked] && RUN.opts[RUN.picked].ok;
        h += '<div class="reveal"><div class="mean" style="color:' + (okNow ? 'var(--ok)' : 'var(--bad)') + '">' + (okNow ? '答对了' : '答错了') + '</div>' +
          '<div class="ph">正确释义：<b>' + esc(w.t) + '</b>' + (w.ph ? '　短语 ' + esc(w.ph.p) + ' ' + esc(w.ph.t) : '') + '</div>';
        var exs2 = A.examplesOf(w.w);
        if (exs2.length) {
          h += '<div class="exs">';
          exs2.forEach(function (s) {
            h += '<div class="ex-line"><div class="ex-en">' + A.highlightWord(s.e, w.w) + '</div>' +
              '<div class="ex-zh">' + esc(s.z) + '</div></div>';
          });
          h += '<div class="ex-src">例句来源：Tatoeba（CC-BY 2.0 FR）</div></div>';
        }
        h += '</div>';
      }
    } else {
      h += '<div class="judge">';
      h += '<button class="jbtn u' + (RUN.revealed && lastV() === 0 ? ' on' : '') + '" data-act="judge" data-v="0">不认识<small>按 1</small></button>';
      h += '<button class="jbtn f' + (RUN.revealed && lastV() === 1 ? ' on' : '') + '" data-act="judge" data-v="1">模糊<small>按 2</small></button>';
      h += '<button class="jbtn k' + (RUN.revealed && lastV() === 2 ? ' on' : '') + '" data-act="judge" data-v="2">认识<small>按 3</small></button>';
      h += '</div>';
      if (RUN.revealed) {
        h += '<div class="reveal">';
        h += '<div class="mean">' + esc(w.t) + '</div>';
        if (w.ph) h += '<div class="ph">短语：<b>' + esc(w.ph.p) + '</b> ' + esc(w.ph.t) + '</div>';
        var exs = A.examplesOf(w.w);
        if (exs.length) {
          h += '<div class="exs">';
          exs.forEach(function (s) {
            h += '<div class="ex-line"><div class="ex-en">' + A.highlightWord(s.e, w.w) + '</div>' +
              '<div class="ex-zh">' + esc(s.z) + '</div></div>';
          });
          h += '<div class="ex-src">例句来源：Tatoeba（CC-BY 2.0 FR）</div></div>';
        }
        h += '<div class="ph" style="margin-top:12px">记错了？改判为 ' +
          '<button class="chip" data-act="rejudge" data-v="2">认识</button> ' +
          '<button class="chip" data-act="rejudge" data-v="1">模糊</button> ' +
          '<button class="chip" data-act="rejudge" data-v="0">不认识</button></div>';
        h += '</div>';
      }
    }
    h += '</div>';

    h += '<div class="test-foot">';
    h += '<button class="btn sm" data-act="undo">↩︎ 撤销</button>';
    if (!RUN.revealed) h += '<button class="btn sm" data-act="skip">跳过</button>';
    else h += '<button class="btn sm primary" data-act="next">下一个 →</button>';
    // 节奏控制放在手边：嫌快就当场关掉自动跳转，不用跑去设置页
    h += '<button class="btn sm' + (A.S.settings.autoNext ? '' : ' ghost') + '" data-act="toggle" data-key="autoNext">' +
      (A.S.settings.autoNext ? '⏸ 自动跳转：开' : '▶ 自动跳转：关') + '</button>';
    h += '</div>';
    h += '<div class="tiny" style="text-align:center;margin-top:10px">快捷键：' +
      (mode === 'choice' ? '<span class="kbd">1</span>-<span class="kbd">4</span> 选答案　' : '<span class="kbd">1</span> 不认识　<span class="kbd">2</span> 模糊　<span class="kbd">3</span> 认识　') +
      '<span class="kbd">空格</span> 读音 / 下一题　<span class="kbd">退格</span> 撤销</div>';
    return h;
  };

  function lastV() {
    var sess = A.S.session;
    if (!sess || !sess.log.length) return -1;
    return sess.log[sess.log.length - 1].v;
  }

  /* ---------- 键盘 ---------- */
  A.onKey = function (e) {
    var modal = el('modal');
    if (modal && modal.innerHTML !== '') {          // 弹窗打开时不允许用快捷键作答
      if (e.key === 'Escape') { e.preventDefault(); A.closeModal(); }
      return;
    }
    if (A.getRoute() !== 'test') return;
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    var k = e.key;
    var mode = A.S.settings.mode;
    if (k === '1' || k === '2' || k === '3' || k === '4') {
      var n = parseInt(k, 10) - 1;
      if (mode === 'choice') { if (n < 4) { e.preventDefault(); A.pick(n); } }
      else if (n < 3) { e.preventDefault(); A.judge(n === 0 ? 0 : (n === 1 ? 1 : 2)); }
      return;
    }
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (RUN.revealed) A.nextQ();
      else if (mode !== 'choice') { var s = A.S.session; if (s && s.queue[s.pos] !== undefined) A.speak(A.WORDS[s.queue[s.pos]].w); }
      return;
    }
    if (k === 'Backspace') { e.preventDefault(); A.undo(); return; }
    if (k === 'Escape') { e.preventDefault(); A.quitAsk(); return; }
  };

  A.quitAsk = function () {
    A.modal('<b>要离开本次检测吗？</b><div class="tiny" style="margin:8px 0 16px">已经作答的记录会保存，下次可以在首页「继续检测」。</div>' +
      '<div class="row"><button class="btn primary grow" data-act="quit-keep">保存并返回</button>' +
      '<button class="btn grow" data-act="quit-drop">放弃本次</button>' +
      '<button class="btn ghost" data-act="modal-close">继续答题</button></div>');
  };

})(window.__APP__ || (window.__APP__ = {}));