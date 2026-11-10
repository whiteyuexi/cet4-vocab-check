/* ============ 第九部分：语境填空练习 ============
   为什么要有这个：测量只回答"我多少词"，练习才回答"怎么补"。
   出题**不用大模型**——直接从已有的 Tatoeba 英中例句里挖空，配同频段同长度的干扰项。
   于是断网也能练、不烧 token、题库永远和你的词库同步。
   AI 的位置在最后：看你的错题模式，说人话。它不参与判分，判分是确定的。 */
(function (A) {
  'use strict';

  var esc = A.esc;
  var QN = 10;                          // 一轮十题

  /* 把句子里的目标词换成下划线。认词形变化（-s / -ed / -ing），认不出来就返回空串 */
  function blankOut(sentence, word) {
    var w = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('\\b' + w + '(s|es|ed|ing|d)?\\b', 'i');
    if (!re.test(sentence)) return '';
    return esc(String(sentence).replace(re, '＿＿＿＿'));
  }

  /* 干扰项：同频段、长度接近、不是同一个词。三条都满足才收，收不满就少出这一题，
     宁可少出题也不出"一看就不对"的选项——选项质量决定这题有没有诊断价值。 */
  function distractors(idx, word) {
    var band = A.bandOf(idx), pool = A.activePool(), out = [], guard = 0;
    var len = String(word).length;
    while (out.length < 3 && guard < 900) {
      guard++;
      var j = pool[Math.floor(Math.random() * pool.length)];
      if (j === idx) continue;
      if (A.bandOf(j) !== band) continue;
      var ww = String(A.WORDS[j].w);
      if (ww === word || out.indexOf(ww) >= 0) continue;
      if (Math.abs(ww.length - len) > 3) continue;
      out.push(ww);
    }
    return out;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* 出题：只从"缺口词"里挑——没测过的和测过但不认识的，背了又忘的优先 */
  A.buildDrill = function (n) {
    n = n || QN;
    var pool = A.activePool();
    var cand = [];
    for (var i = 0; i < pool.length; i++) {
      var st = A.getSt(pool[i]);
      if (st === 2) continue;                       // 已经稳稳认识的，别浪费时间
      if (!A.hasExamples || !A.examplesOf(A.WORDS[pool[i]].w).length) continue;
      cand.push({ i: pool[i], w: (st === 1 ? 0 : 1) }); // 模糊过的排前面
    }
    if (!cand.length) return 0;
    cand.sort(function (a, b) { return b.w - a.w; });
    // 只在"优先池"和"其余"之间做一次随机，别把确定性排序整个打散
    var head = cand.slice(0, Math.max(20, n * 4));
    shuffle(head);

    var qs = [];
    for (var k = 0; k < head.length && qs.length < n; k++) {
      var idx = head[k].i, word = String(A.WORDS[idx].w);
      var ex = A.examplesOf(word)[0];
      if (!ex || !ex.e) continue;
      var s = blankOut(ex.e, word);
      if (!s) continue;
      var ds = distractors(idx, word);
      if (ds.length < 3) continue;
      var opts = shuffle([word].concat(ds));
      qs.push({ i: idx, s: s, z: esc(ex.z || ''), opts: opts, ans: opts.indexOf(word), pick: -1 });
    }
    if (!qs.length) return 0;
    A.S.drill = { qs: qs, i: 0, right: 0, wrong: [], ts: Date.now() };
    A.save();
    return qs.length;
  };

  A.viewDrill = function () {
    var d = A.S.drill;
    var h = '';

    if (!d || !d.qs || !d.qs.length) {
      h += '<div class="card" style="text-align:center;padding:34px 22px">';
      h += '<div class="res-num" style="font-size:30px">语境里认词</div>';
      h += '<div class="tiny res-sub" style="margin-top:8px">从你已经测出来的缺口词里出题：给一句真实例句，把那个词挖掉，四选一。<br>题目来自语料库，不联网、不烧额度。</div>';
      h += '<button class="btn primary" data-act="drill-start" style="margin-top:18px">出一组（' + QN + ' 题）</button>';
      h += '</div>';
      return h;
    }

    if (d.i >= d.qs.length) return drillSummary(d);
    return drillQuestion(d);
  };

  function drillQuestion(d) {
    var q = d.qs[d.i];
    var answered = q.pick >= 0;
    var h = '';
    h += '<div class="card drill">';
    h += '<div class="drill-top"><span class="tiny">第 ' + (d.i + 1) + ' / ' + d.qs.length + ' 题</span>' +
         '<span class="tiny">' + A.BAND_NAMES[A.bandOf(q.i)] + ' · ' + A.WORDS[q.i].p + '</span></div>';
    h += '<div class="drill-sent">' + q.s + '</div>';
    h += '<div class="drill-opts">';
    for (var k = 0; k < q.opts.length; k++) {
      var cls = 'drill-opt';
      if (answered) {
        if (k === q.ans) cls += ' ok';
        else if (k === q.pick) cls += ' bad';
        else cls += ' dim';
      }
      h += '<button class="' + cls + '" data-act="drill-pick" data-n="' + k + '"' + (answered ? ' disabled' : '') + '>' +
           esc(q.opts[k]) + '</button>';
    }
    h += '</div>';
    if (answered) {
      h += '<div class="drill-fb ' + (q.pick === q.ans ? 'ok' : 'bad') + '">' +
        (q.pick === q.ans ? '对了。' : '正确答案：<b>' + esc(q.opts[q.ans]) + '</b>') +
        '<div class="tiny drill-zh">' + q.z + '</div></div>';
      h += '<button class="btn primary drill-next" data-act="drill-next">' +
        (d.i + 1 >= d.qs.length ? '看这一轮的总结' : '下一题') + '</button>';
    }
    h += '</div>';
    return h;
  }

  function drillSummary(d) {
    var n = d.qs.length, rate = Math.round(d.right / n * 100);
    var h = '';
    h += '<div class="card res-hero">';
    h += '<div class="tiny">语境填空 · 本轮</div>';
    h += '<div class="res-num">' + d.right + ' / ' + n + '</div>';
    h += '<div class="tiny res-sub">答对率 ' + rate + '%' +
      (d.wrong.length ? ' · 错的都是 ' + bandNames(d.wrong) : ' · 全对') + '</div>';
    h += '<button class="btn primary res-cta" data-act="drill-start">再来一组</button>';
    h += '</div>';

    if (d.wrong.length) {
      h += '<div class="sec-title">这轮错的 ' + d.wrong.length + ' 个词<span class="line"></span></div>';
      h += '<div class="card"><div class="wordlist">';
      for (var i = 0; i < d.wrong.length; i++) h += A.wordRow(d.wrong[i]);
      h += '</div></div>';
      h += '<div class="row" style="margin-top:14px;gap:8px;flex-wrap:wrap">' +
        '<button class="btn sm primary" data-act="review-band" data-band="' + A.bandOf(d.wrong[0]) + '">只复测这一段</button>' +
        '<button class="btn sm" data-act="ai-ask" data-q="' + esc('我刚做了一轮语境填空，错了这几个词，帮我看看是词形没记住还是搭配没掌握') + '">让 AI 看看我错在哪</button>' +
        '</div>';
    }
    h += '<div class="row" style="margin-top:18px"><button class="btn sm ghost" data-act="go" data-route="home">回首页</button></div>';
    return h;
  }

  function bandNames(idxs) {
    var seen = {}, out = [];
    for (var i = 0; i < idxs.length; i++) {
      var b = A.bandOf(idxs[i]);
      if (seen[b]) continue;
      seen[b] = 1; out.push(A.BAND_NAMES[b]);
    }
    return out.join(' / ');
  }

  /* 判分完全是确定性的：点了哪个、对不对，这里说了算。AI 不参与。 */
  A.drillPick = function (n) {
    var d = A.S.drill;
    if (!d || d.i >= d.qs.length) return;
    var q = d.qs[d.i];
    if (q.pick >= 0) return;
    q.pick = n;
    if (n === q.ans) d.right++;
    else d.wrong.push(q.i);
    A.save();
    A.render();
  };

  A.drillNext = function () {
    var d = A.S.drill;
    if (!d) return;
    if (d.i < d.qs.length) d.i++;
    A.save();
    A.render();
  };

  /* ================= 听音辨词（只放音，不收音） =================
     为什么加这个：四六级有一条被忽略的真相——"看得懂"和"听得出"是两回事。
     阅读能认出 4500 词的人，听力考试里同一个词放出来常常反应不过来。
     所以这里不是"多一个入口"，是**多一个测量维度**：
       同样的分层抽样队列，只播声音、不给字，让用户在四个中文释义里选。
     算出来的听力词汇量，和阅读词汇量一对比，差的那几百个就是"认得但听不出"。

     技术上：不碰阅读那条链路。抽样队列复用 probeQueue，估计复用 probeStats，
     结果单独存 S.listen，绝不混进 reading 的 sample —— 混了就两边都脏。 */
  var LN = 20;

  /* 释义要能一眼读完。词库里的 t 是词典原文（"pron.准; …的人"），
     直接拿来当选项又长又难看，还会把按钮撑变形。只取第一个义项，超过 14 字截断。 */
  function gloss(t) {
    var s = String(t || '').split(/[;；]/)[0].replace(/^[a-z]+\.\s*/i, '').trim();
    if (s.length > 14) s = s.slice(0, 14) + '…';
    return s || String(t || '');
  }

  function listenOpts(idx) {
    var want = gloss(A.WORDS[idx].t);
    var pool = A.activePool(), out = [], guard = 0;
    while (out.length < 3 && guard < 900) {
      guard++;
      var j = pool[Math.floor(Math.random() * pool.length)];
      if (j === idx) continue;
      var t = gloss(A.WORDS[j].t);
      if (t === want || out.indexOf(t) >= 0) continue;
      out.push(t);
    }
    if (out.length < 3) return null;
    var opts = shuffle([want].concat(out));
    return { opts: opts, ans: opts.indexOf(want) };
  }

  A.startListen = function () {
    var q = A.probeQueue();
    if (!q || !q.length) return 0;
    var qs = [], i = 0;
    while (qs.length < LN && i < q.length) {
      var o = listenOpts(q[i]);
      if (o) qs.push({ i: q[i], opts: o.opts, ans: o.ans });
      i++;
    }
    if (!qs.length) return 0;
    A.S.listen = { qs: qs, pos: 0, log: [], spoken: -1, ts: Date.now() };
    A.save();
    return qs.length;
  };

  A.viewListen = function () {
    var d = A.S.listen;
    if (!d || !d.qs || !d.qs.length) {
      return '<div class="card" style="text-align:center;padding:34px 22px">' +
        '<div class="res-num" style="font-size:30px">听音辨词</div>' +
        '<div class="tiny res-sub" style="margin-top:8px">只放声音、不给字，你从四个中文释义里选一个。<br>' +
        '20 个词，约 2 分钟。测完会给你一个<b>带区间的听力词汇量</b>，并和阅读词汇量对照。</div>' +
        '<button class="btn primary" data-act="listen-start" style="margin-top:18px">开始（20 词）</button>' +
        '</div>';
    }
    if (d.pos >= d.qs.length) return listenResult(d);

    var q = d.qs[d.pos], word = String(A.WORDS[q.i].w);
    var h = '';
    h += '<div class="card listen">';
    h += '<div class="drill-top"><span class="tiny">第 ' + (d.pos + 1) + ' / ' + d.qs.length + ' 词</span>' +
         '<span class="tiny">只播声音 · 不给字幕</span></div>';
    h += '<button class="listen-play" data-act="listen-play">' +
         '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 4V5L9 9H5z"/></svg>' +
         '<span>再听一遍</span></button>';
    h += '<div class="drill-opts listen-opts">';
    for (var k = 0; k < q.opts.length; k++) {
      h += '<button class="drill-opt" data-act="listen-pick" data-n="' + k + '">' + esc(q.opts[k]) + '</button>';
    }
    h += '</div></div>';

    // 进入这一题时自动播一次；用 spoken 标记防止重渲染时反复播
    var want = d.pos;
    setTimeout(function () {
      var cur = A.S.listen;
      if (!cur || cur.pos !== want || cur.spoken === want) return;
      cur.spoken = want;
      if (A.speak) A.speak(word);
    }, 140);
    return h;
  };

  A.listenPlay = function () {
    var d = A.S.listen;
    if (!d || d.pos >= d.qs.length) return;
    if (A.speak) A.speak(String(A.WORDS[d.qs[d.pos].i].w));
  };

  /* 选完立刻记分并进下一题：这是测量，不是练习，不给即时反馈 */
  A.listenPick = function (n) {
    var d = A.S.listen;
    if (!d || d.pos >= d.qs.length) return;
    var q = d.qs[d.pos];
    d.log.push({ i: q.i, v: n === q.ans ? 2 : 0 });
    d.pos++;
    A.save();
    A.render();
  };

  function listenResult(d) {
    var st = A.probeStats({ log: d.log });
    var read = A.estimateNow();
    var hasListen = st && isFinite(st.vocab) && st.n > 0;
    var h = '';
    h += '<div class="card res-hero">';
    h += '<div class="tiny">听音辨词 · 听力词汇量</div>';
    h += '<div class="res-num">' + (hasListen ? '≈ ' + Math.round(st.vocab).toLocaleString('en-US') + ' 词' : '—') + '</div>';
    h += '<div class="tiny res-sub">' + (hasListen
      ? ('基于 ' + st.n + ' 词分层抽样' + (isFinite(st.lo) ? '，95% 区间 ' + Math.round(st.lo).toLocaleString('en-US') + ' ~ ' + Math.round(st.hi).toLocaleString('en-US') : ''))
      : '样本不足，这一轮不算数') + '</div>';
    h += '</div>';

    if (hasListen && read && read.kind === 'sample' && isFinite(read.vocab)) {
      var gap = Math.round(read.vocab - st.vocab);
      h += '<div class="card listen-gap">';
      h += '<div class="tiny">和阅读词汇量对照</div>';
      h += '<div class="listen-compare">' +
           '<div><b>' + Math.round(read.vocab).toLocaleString('en-US') + '</b><span>阅读</span></div>' +
           '<div class="listen-dash">—</div>' +
           '<div><b>' + Math.round(st.vocab).toLocaleString('en-US') + '</b><span>听力</span></div>' +
           '</div>';
      h += '<div class="tiny" style="margin-top:10px">' + (gap > 0
        ? ('差 <b>' + gap.toLocaleString('en-US') + '</b> 个词——这部分你认得，但听不出来。四六级听力考的正是这些。')
        : '听力不低于阅读，这种情况很少见，说明这些词你是真的熟。') + '</div>';
      h += '<div class="row" style="margin-top:14px;gap:8px;flex-wrap:wrap">' +
           '<button class="btn sm primary" data-act="ai-ask" data-q="' + esc('我的听力词汇量和阅读词汇量差了 ' + gap + ' 个词，帮我分析差在哪些词上、怎么练') + '">让 AI 分析这 ' + gap + ' 个词的差距</button>' +
           '<button class="btn sm" data-act="listen-start">再测一次</button>' +
           '</div>';
      h += '</div>';
    } else {
      h += '<div class="row" style="margin-top:16px"><button class="btn sm" data-act="listen-start">再测一次</button></div>';
    }
    h += '<div class="row" style="margin-top:16px"><button class="btn sm ghost" data-act="go" data-route="home">回首页</button></div>';
    return h;
  }
})(window.__APP__ || (window.__APP__ = {}));
