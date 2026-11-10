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
})(window.__APP__ || (window.__APP__ = {}));
