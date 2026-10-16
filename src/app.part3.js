/* ============ 第三部分：结果、总览、设置、事件 ============ */
(function (A) {
  'use strict';

  var tpl = A.tpl, esc = A.esc, el = A.el, S = A.S;


  /* ---------- 结果页 ---------- */
  A.viewResult = function () {
    var r = S.lastResult;
    if (!r) {
      return '<div class="card" style="text-align:center;padding:34px 20px"><div style="font-size:40px">📈</div>' +
        '<b style="font-size:17px">还没有检测结果</b><div class="tiny" style="margin:10px 0 18px">先完成一次检测吧</div>' +
        '<button class="btn primary" data-act="start" data-kind="quick">开始快速摸底</button></div>';
    }
    var total = r.total, score = A.scoreOf(r, !!S.settings.strict);
    var ratio = total ? score / total : 0;
    var universe = A.activePool().length;
    var est = A.estimate(total, score, universe);
    var isQuick = r.kind === 'quick';
    var enoughSample = total >= 20;                 // 少于 20 词的抽样不给数字，避免"一个词就敢报词汇量"

    var h = '';
    h += '<div class="card" style="text-align:center">';
    h += '<div class="tiny">' + esc(r.label) + ' · ' + A.fmtDate(r.ts) + '</div>';
    h += '<div style="display:flex;justify-content:center;margin:14px 0">' + A.ring(A.pct(score, total), A.pct(score, total) + '%', '本次掌握率', false) + '</div>';
    h += '<div style="font-size:30px;font-weight:850">' + (isQuick && est && enoughSample ? '≈ ' + est.vocab.toLocaleString('en-US') + ' 词' : '掌握 ' + (r.k + r.f) + ' / ' + total + ' 词') + '</div>';
    h += '<div class="tiny" style="margin-top:6px">' + (isQuick && est && enoughSample
      ? ('按随机抽样 ' + total + ' 词估算大纲词汇量，95% 置信区间 ' + est.lo.toLocaleString('en-US') + ' ~ ' + est.hi.toLocaleString('en-US') + (total < 50 ? '；样本偏小，误差较大' : ''))
      : isQuick && !enoughSample
        ? ('这轮只答了 ' + total + ' 词，样本太小不给词汇量估算；做完 20 词以上（推荐 100 词）再看结果')
        : '认识 ' + r.k + ' · 模糊 ' + r.f + ' · 不认识 ' + r.u + (r.skipped ? ' · 跳过 ' + r.skipped : '')) + '</div>';
    h += '</div>';

    h += '<div class="card"><div class="segbar">' +
      '<i style="width:' + A.pct(r.k, total) + '%;background:var(--ok)"></i>' +
      '<i style="width:' + A.pct(r.f, total) + '%;background:var(--mid)"></i>' +
      '<i style="width:' + A.pct(r.u, total) + '%;background:var(--no)"></i></div>' +
      '<div class="legend"><span><i style="background:var(--ok)"></i>认识 ' + r.k + ' 词</span>' +
      '<span><i style="background:var(--mid)"></i>模糊 ' + r.f + ' 词</span>' +
      '<span><i style="background:var(--no)"></i>不认识 ' + r.u + ' 词</span></div>';
    var g = A.tally(A.activePool());
    var ge = A.estimateNow();
    h += '<div class="tiny" style="margin-top:14px">累计进度：已测 ' + g.tested + ' / ' + g.total + ' 词' +
      (ge.kind === 'full' ? '，全库累计掌握 <b>' + Math.round(g.k + 0.5 * g.f).toLocaleString('en-US') + '</b> 词（已接近实测）'
        : ge.kind === 'sample' ? '，整体估算词汇量 <b>≈ ' + ge.vocab.toLocaleString('en-US') + '</b> 词（基于 ' + ge.n + ' 词随机抽样）'
          : '') + '</div>';
    h += '<div class="bar" style="margin-top:8px"><i style="width:' + A.pct(g.tested, g.total) + '%"></i></div>';
    h += '</div>';

    var weak = [];
    for (var i = 0; i < r.log.length; i++) if (r.log[i].v !== 2) weak.push(r.log[i].i);

    h += '<div class="sec-title">本次没掌握的 ' + weak.length + ' 个词<span class="line"></span></div>';
    if (!weak.length) {
      h += '<div class="card tiny">全部答对，太强了！可以试试下一组或全量检测。</div>';
    } else {
      h += '<div class="card"><div class="wordlist">';
      for (var n = 0; n < Math.min(weak.length, 300); n++) h += A.wordRow(weak[n]);
      h += '</div>' + (weak.length > 300 ? '<div class="tiny" style="margin-top:8px">仅列出前 300 个，完整清单可用「导出未掌握词表」拿到</div>' : '') + '</div>';
    }

    /* ---------- 下一步：把"然后呢"说清楚，并且点一下就能做 ---------- */
    var wb = {};
    weak.forEach(function (i) { var b = A.bandOf(i); (wb[b] || (wb[b] = [])).push(i); });
    var bandKeys = Object.keys(wb).sort(function (a, b) { return wb[b].length - wb[a].length; });
    var est = A.estimateNow();
    h += '<div class="sec-title">下一步做什么<span class="line"></span></div>';
    h += '<div class="card nextstep">';
    h += '<ol>';
    if (bandKeys.length) {
      var tb = bandKeys[0];
      h += '<li>本次没掌握的词里，<b>' + A.BAND_NAMES[tb] + '</b> 段最多（' + wb[tb].length + ' 个）——先啃这一段最划算。' +
        '<button class="btn sm primary" data-act="review-band" data-band="' + tb + '">只复测这 ' + wb[tb].length + ' 个</button></li>';
    }
    if (est.kind === 'sample') {
      h += '<li>想要更准的数字：再做一次摸底，把目标精度设到 <b>±150 词</b>。' +
        '<button class="btn sm" data-act="start" data-kind="probe" data-target="150">精测一次（约 ' + A.needFor(150) + ' 题）</button></li>';
    } else if (g.tested < g.total * 0.95) {
      h += '<li>现在的数字还是估算。把覆盖率从 <b>' + A.pct(g.tested, g.total) + '%</b> 提到 95% 以上，它就会变成实测值。' +
        '<button class="btn sm" data-act="start" data-kind="all">继续完整检测</button></li>';
    }
    if (!bandKeys.length && est.kind !== 'sample' && g.tested >= g.total * 0.95) {
      h += '<li>词库已经基本测完，成绩可以导出留存，或者切到「' + (A.bankKey() === 'c4' ? '六级' : '四级') + '」再测一轮。' +
        '<button class="btn sm" data-act="set-bank" data-bank="' + (A.bankKey() === 'c4' ? 'c6' : 'c4') + '">切换词库</button></li>';
    }
    h += '</ol>';
    h += '<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:14px;padding-top:14px;border-top:1px dashed var(--line)">' +
      '<button class="btn sm" data-act="copy-report">复制成绩</button>' +
      '<button class="btn sm" data-act="print-report">打印 / 存为 PDF</button>' +
      '<button class="btn sm ghost" data-act="go" data-route="stats">看总体统计</button>' +
      '<button class="btn sm ghost" data-act="start" data-kind="all">再测一轮</button>' +
      '</div>';
    h += '</div>';
    if (A.aiCardHTML) h += A.aiCardHTML();
    return h;
  };

  /* ---------- 成绩文本（复制/打印共用） ---------- */
  A.reportText = function () {
    var r = S.lastResult;
    if (!r) return '';
    var g = A.tally(A.activePool());
    var es = A.estimateNow();
    var L = [];
    L.push('【' + A.bankName() + '词汇量检测】' + A.fmtDate(r.ts));
    L.push('本次：' + esc(r.label));
    L.push('答了 ' + r.total + ' 题 · 认识 ' + r.k + ' · 模糊 ' + r.f + ' · 不认识 ' + r.u +
      ' · 掌握率 ' + A.pct(r.k + 0.5 * r.f, r.total) + '%');
    if (es.kind === 'sample') {
      L.push('词汇量估算：≈ ' + es.vocab + ' 词（95% 区间 ' + es.lo + ' ~ ' + es.hi + '，基于 ' + es.n + ' 词分层抽样）');
      L.push('严格口径（只算认识）：' + es.strictVocab + ' 词');
    } else if (es.kind === 'full') {
      L.push('词汇量（已覆盖 ' + A.pct(g.tested, g.total) + '%，接近实测）：' + Math.round(g.k + 0.5 * g.f) + ' 词');
    }
    L.push('覆盖率：已测 ' + g.tested + ' / ' + g.total + ' 词');
    var prof = A.bandProfile();
    var rows = prof.rows.filter(function (x) { return x.p !== null && x.n > 0; });
    if (rows.length) {
      L.push('频段剖面：' + rows.map(function (x) {
        return A.BAND_NAMES[x.band] + ' ' + Math.round(x.p * 100) + '%';
      }).join(' / '));
    }
    L.push('（由「四六级词汇量检测」生成，数据仅存本机）');
    return L.join('\n');
  };

  A.copyText = function (text) {
    function fallback() {
      A.modal('<b>手动复制</b><div class="tiny" style="margin:8px 0">浏览器不允许直接写剪贴板，请手动复制：</div>' +
        '<textarea style="width:100%;height:200px;font-size:12.5px;border-radius:10px;border:1px solid var(--track);padding:10px;background:var(--card2);color:var(--text)">' +
        esc(text) + '</textarea>' +
        '<div class="row" style="margin-top:10px"><button class="btn primary grow" data-act="modal-close">好</button></div>');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { A.toast('成绩已复制，可直接粘贴分享'); }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  };

  /* ---------- 词条行（结果页用来列出未掌握的词） ---------- */
  A.wordRow = function (i) {
    var w = A.WORDS[i], s = A.getSt(i);
    var tag = s === 0 ? '<span class="pill no">不认识</span>' : s === 1 ? '<span class="pill mid">模糊</span>' : s === 2 ? '<span class="pill ok">认识</span>' : '';
    var phon = w.p ? '<div class="tiny" style="font-weight:400">/' + esc(w.p) + '/</div>' : '';
    return tpl('<div class="witem"><div class="w">{word}{phon}</div>' +
      '<div class="t">{mean}{phrase}</div>' +
      '<div class="acts"><button class="chip" data-act="speak" data-w="{word}" aria-label="朗读 {word}">🔊</button></div>' +
      tag + '</div>',
      {
        i: i, word: esc(w.w), phon: phon, mean: esc(w.t),
        phrase: w.ph ? '<small>短语 ' + esc(w.ph.p) + ' ' + esc(w.ph.t) + '</small>' : ''
      });
  };

  /* ---------- 频段剖面（最有诊断价值的一块） ---------- */
  A.bandProfileHTML = function () {
    var prof = A.bandProfile();
    var rows = prof.rows.filter(function (r) { return r.N > 0; });
    var h = '';
    h += '<div class="sec-title">按词频段的掌握情况<span class="line"></span><span class="tiny">' +
      (prof.source === 'sample'
        ? '来自最近一次分层抽样（' + prof.n + ' 词）'
        : '来自已测的 ' + prof.n + ' 词，非随机样本，仅供参考') + '</span></div>';
    h += '<div class="card">';
    if (!rows.some(function (r) { return r.n > 0; })) {
      h += '<div class="tiny">还没有数据。做一次「摸底检测」就能看到各频段的强弱。</div>';
    } else {
      h += '<div class="bandlist">';
      rows.forEach(function (r) {
        var p = r.p === null ? null : Math.round(r.p * 100);
        var has = p !== null;
        h += A.tpl(
          '<div class="brow"><div class="bl">{name}</div>' +
          '<div class="bbar"><i style="width:{w}%;background:{col}"></i></div>' +
          '<div class="bv">{val}</div></div>',
          {
            name: A.BAND_NAMES[r.band] || ('频段 ' + r.band),
            w: has ? Math.max(2, p) : 0,
            col: p === null ? 'var(--line)' : (p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--mid)' : 'var(--no)'),
            val: has ? (p + '%') : '—'
          });
        h += '<div class="bmeta">全段 ' + r.N + ' 词' + (prof.source === 'sample' ? ' · 抽到 ' + r.n + ' 词' : ' · 已测 ' + r.n + ' 词') + '</div>';
      });
      h += '</div>';
      var worst = rows.filter(function (r) { return r.p !== null && r.n >= 3; })
        .sort(function (a, b) { return a.p - b.p; })[0];
      var best = rows.filter(function (r) { return r.p !== null && r.n >= 3; })
        .sort(function (a, b) { return b.p - a.p; })[0];
      if (worst && best && worst.band !== best.band) {
        h += '<div class="tiny" style="margin-top:12px">最强的是 <b>' + A.BAND_NAMES[best.band] + '</b>（' + Math.round(best.p * 100) +
          '%），最弱的是 <b>' + A.BAND_NAMES[worst.band] + '</b>（' + Math.round(worst.p * 100) + '%）——' +
          '后者才是提分空间所在，建议优先测/背这一段。</div>';
      }
    }
    h += '</div>';
    return h;
  };

  /* ---------- 总览统计 ---------- */
  A.viewStats = function () {
    var pool = A.activePool();
    var t = A.tally(pool);
    var es = A.estimateNow();                       // 与首页同一口径：只认随机抽样 / 95% 覆盖
    var strictOn = !!S.settings.strict;
    var headline = es.kind === 'none' ? '数据不足'
      : '≈ ' + (strictOn ? es.strictVocab : es.looseVocab).toLocaleString('en-US') + ' 词';
    var detail;
    if (es.kind === 'full') {
      detail = '已覆盖 ' + A.pct(t.tested, t.total) + '% 词库，接近实测值：严格口径 ' + es.strictVocab.toLocaleString('en-US') +
        ' 词 / 折中口径 ' + es.looseVocab.toLocaleString('en-US') + ' 词';
    } else if (es.kind === 'sample') {
      detail = '基于最近一次 ' + es.n + ' 词随机抽样（' + A.fmtDate(es.ts) + '）——严格口径 ' + es.strictVocab.toLocaleString('en-US') +
        ' 词（' + es.strictLo.toLocaleString('en-US') + '~' + es.strictHi.toLocaleString('en-US') + '）／折中口径 ' +
        es.looseVocab.toLocaleString('en-US') + ' 词（' + es.lo.toLocaleString('en-US') + '~' + es.hi.toLocaleString('en-US') + '）';
      if (es.pre / es.n > 0.2) detail += '；其中 ' + Math.round(es.pre / es.n * 100) + '% 的词此前已测过，受复习效应影响可能偏高';
    } else {
      detail = '已测 ' + t.tested + ' 词，但这些数据不是随机抽样，无法外推成词汇量；做一次「快速摸底」即可得到估算';
    }
    var lv = es.kind === 'none' ? null : A.levelText(strictOn ? es.strictVocab : es.looseVocab);

    var h = '';
    h += '<div class="sec-title">总体掌握情况<span class="line"></span><span class="tiny">' + (S.settings.includeExt ? '含拓展词' : '仅四级大纲核心词') + '</span></div>';

    h += '<div class="card"><div class="row" style="flex-wrap:wrap;gap:18px">';
    h += A.ring(A.pct(t.tested, t.total), A.pct(t.tested, t.total) + '%', '完成度', false);
    h += '<div class="grow"><div style="font-size:26px;font-weight:850">' + headline + '</div>';
    h += '<div class="tiny">' + detail + '</div>';
    if (lv) h += '<div class="pill brand" style="margin-top:10px">' + lv.t + '</div><div class="tiny" style="margin-top:6px">' + lv.d + '</div>';
    h += '</div></div>';
    h += '<div class="segbar" style="margin-top:16px">' +
      '<i style="width:' + A.pct(t.k, t.total) + '%;background:var(--ok)"></i>' +
      '<i style="width:' + A.pct(t.f, t.total) + '%;background:var(--mid)"></i>' +
      '<i style="width:' + A.pct(t.u, t.total) + '%;background:var(--no)"></i></div>';
    h += '<div class="legend"><span><i style="background:var(--ok)"></i>认识 ' + t.k + '</span>' +
      '<span><i style="background:var(--mid)"></i>模糊 ' + t.f + '</span>' +
      '<span><i style="background:var(--no)"></i>不认识 ' + t.u + '</span>' +
      '<span><i style="background:var(--line)"></i>未测 ' + t.rest + '</span></div>';
    h += '<div class="statgrid" style="margin-top:14px">' +
      '<div class="stat"><b>' + t.total + '</b><span>词库总量</span></div>' +
      '<div class="stat"><b>' + t.tested + '</b><span>已检测</span></div>' +
      '<div class="stat"><b>' + A.pct(t.k + t.f, t.tested) + '%</b><span>已测词掌握率</span></div>' +
      '<div class="stat"><b>' + t.rest + '</b><span>待检测</span></div></div>';
    h += '</div>';

    h += A.bandProfileHTML();

    // 按首字母
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    var data = {}, max = 1;
    letters.forEach(function (L) { data[L] = { k: 0, f: 0, u: 0, t: 0 }; });
    pool.forEach(function (i) {
      var s = A.getSt(i);
      if (s === undefined) return;
      var L = A.WORDS[i].w[0].toUpperCase();
      if (!data[L]) return;
      data[L].t++;
      if (s === 2) data[L].k++; else if (s === 1) data[L].f++; else data[L].u++;
    });
    letters.forEach(function (L) { if (data[L].t > max) max = data[L].t; });
    var anyTested = t.tested > 0;
    h += '<div class="sec-title">按首字母的掌握分布<span class="line"></span></div>';
    h += '<div class="card">';
    if (!anyTested) h += '<div class="tiny">还没有已测词，先去做一次检测。</div>';
    else {
      h += '<div class="bars">';
      letters.forEach(function (L) {
        var d = data[L];
        h += '<div class="barcol" title="' + L + '：认识 ' + d.k + ' / 模糊 ' + d.f + ' / 不认识 ' + d.u + '">' +
          '<div class="stack">' +
          '<i style="height:' + (d.u / max * 100) + '%;background:var(--no)"></i>' +
          '<i style="height:' + (d.f / max * 100) + '%;background:var(--mid)"></i>' +
          '<i style="height:' + (d.k / max * 100) + '%;background:var(--ok)"></i>' +
          '</div><span>' + L + '</span></div>';
      });
      h += '</div>';
      h += '<div class="legend"><span><i style="background:var(--ok)"></i>认识</span><span><i style="background:var(--mid)"></i>模糊</span><span><i style="background:var(--no)"></i>不认识</span></div>';
      var worst = letters.filter(function (L) { return data[L].t >= 10; })
        .sort(function (a, b) { return (data[a].k / data[a].t) - (data[b].k / data[b].t); }).slice(0, 4);
      if (worst.length) h += '<div class="tiny" style="margin-top:10px">掌握率最低的字母段：<b>' + worst.join('、') + '</b>，可以优先刷这些组的词。</div>';
    }
    h += '</div>';

    // 历史
    h += '<div class="sec-title">检测记录<span class="line"></span></div>';
    h += '<div class="card">';
    if (!S.history.length) h += '<div class="tiny">还没有记录。</div>';
    else {
      h += '<div class="hist">';
      S.history.slice(0, 20).forEach(function (x) {
        h += tpl('<div class="h"><b>{label}</b><span class="grow tiny">{date}</span>' +
          '<span class="pill ok">认识 {k}</span><span class="pill mid">模糊 {f}</span><span class="pill no">不认识 {u}</span>' +
          '<b>{rate}%</b></div>', {
          label: esc(x.label), date: A.fmtDate(x.ts), k: x.k, f: x.f, u: x.u,
          rate: A.pct(x.k + 0.5 * x.f, x.total)
        });
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  };

  /* ---------- 设置 ---------- */
  A.viewSettings = function () {
    function sw(key, title, sub) {
      var on = !!S.settings[key];
      return '<div class="switch"><div class="st"><b>' + title + '</b><small>' + sub + '</small></div>' +
        '<button class="toggle' + (on ? ' on' : '') + '" role="switch" aria-checked="' + on + '" aria-label="' + title + '"' +
        ' data-act="toggle" data-key="' + key + '"></button></div>';
    }
    var h = '';
    h += '<div class="sec-title">答题设置<span class="line"></span></div>';
    h += '<div class="card">';
    h += '<div class="switch"><div class="st"><b>答题方式</b><small>自评最快；四选一更能检验真实记忆</small></div>' +
      '<div class="tabs" style="margin:0;width:210px"><button class="' + (S.settings.mode === 'self' ? 'on' : '') + '" data-act="set-mode" data-mode="self">自评</button>' +
      '<button class="' + (S.settings.mode === 'choice' ? 'on' : '') + '" data-act="set-mode" data-mode="choice">四选一</button></div></div>';
    h += sw('autoNext', '自动下一题', '作答后自动跳到下一个词（推荐，速度快）');
    h += '<div class="switch"><div class="st"><b>自动跳转延迟</b><small>当前 ' + S.settings.autoDelay + ' 毫秒</small></div>' +
      '<input type="range" min="300" max="2500" step="50" value="' + S.settings.autoDelay + '" data-act="set-delay" style="width:180px"></div>';
    h += sw('sound', '单词发音', '作答时朗读单词（依赖浏览器语音引擎）');
    h += sw('includeExt', '包含拓展派生词', '除大纲核心词外，再加入 ' + A.WORDS.filter(function (w) { return w.x; }).length + ' 个常见派生词（当前词库 ' + A.activePool().length + ' 词）');
    h += sw('strict', '严格的估算口径', '只把「认识」算作掌握；关闭时「模糊」按一半折算。两种口径的数值都会列在总览页');
    h += '</div>';

    h += '<div class="sec-title">外观<span class="line"></span></div>';
    h += '<div class="card"><div class="switch"><div class="st"><b>深色模式</b><small>夜间刷词更护眼</small></div>' +
      '<button class="toggle' + (S.theme === 'dark' ? ' on' : '') + '" role="switch" aria-checked="' + (S.theme === 'dark') + '"' +
      ' aria-label="深色模式" data-act="toggle-theme"></button></div></div>';

    h += '<div class="sec-title">数据管理<span class="line"></span></div>';
    h += '<div class="card"><div class="row" style="flex-wrap:wrap;gap:10px">' +
      '<button class="btn" data-act="export-json">导出作答备份（JSON）</button>' +
      '<button class="btn" data-act="export-csv">导出未掌握词表（CSV）</button>' +
      '<button class="btn" data-act="import-json">导入备份</button>' +
      '<button class="btn" data-act="clear-answers">清空作答记录</button>' +
      '<button class="btn ghost" data-act="reset-all">恢复出厂设置</button>' +
      '</div>';
    h += '<div class="tiny" style="margin-top:12px">已记录 ' + Object.keys(S.status).length + ' 个词的作答，' + S.history.length + ' 条检测记录。数据保存在本机浏览器中，换浏览器或清理缓存会丢失，建议定期导出备份。</div>';
    h += '</div>';

    h += '<div class="sec-title">使用说明<span class="line"></span></div>';
    h += '<div class="card tiny" style="line-height:1.95">' +
      '<b>1. 先摸底：</b>点「快速摸底」随机抽 100 词，3 分钟就能得到词汇量估算。<br>' +
      '<b>2. 再精测：</b>用「分组检测」按 100 词一组逐组过，进度自动保存，随时中断随时继续。<br>' +
      '<b>3. 补漏洞：</b>用「薄弱词复测」把之前测出「模糊 / 不认识」的词再测一遍，看是否真的补上了。<br>' +
      '<b>判定建议：</b>能在 3 秒内想起主要中文意思算「认识」；见过但不确定算「模糊」；完全没印象算「不认识」。<br>' +
      '<b>词库说明：</b>四级大纲 <b>' + A.bankCounts().c4 + '</b> 词、六级大纲 <b>' + A.bankCounts().c6 + '</b> 词（含四级全部）、六级新增 <b>' + A.bankCounts().c6new + '</b> 词，全部带国际音标；另可选用 ' + A.WORDS.filter(function (w) { return w.x; }).length + ' 个常见派生词（默认不计入）。<br>' +
      '<b>快捷键：</b>自评模式 <span class="kbd">1</span> 不认识 <span class="kbd">2</span> 模糊 <span class="kbd">3</span> 认识；四选一模式 <span class="kbd">1</span>-<span class="kbd">4</span> 选项；<span class="kbd">空格</span> 发音/下一题；<span class="kbd">退格</span> 撤销。' +
      '</div>';
    return h;
  };

  /* ---------- 导出 ---------- */
  function download(name, text, mime, noBom) {
    try {
      // CSV 需要 BOM 才能让 Excel 认出 UTF-8；JSON 则不能带 BOM，否则 JSON.parse 会直接报错
      var blob = new Blob([noBom ? text : '\ufeff' + text], { type: mime || 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      A.toast('已导出：' + name);
    } catch (e) { A.toast('导出失败：' + e.message); }
  }
  A.download = download;

  A.exportCSV = function () {
    var pool = A.activePool();
    var rows = [['单词', '音标', '释义', '短语', '状态']];
    var map = { 0: '不认识', 1: '模糊', 2: '认识' };
    pool.forEach(function (i) {
      var s = A.getSt(i);
      if (s === undefined || s === 2) return;
      var w = A.WORDS[i];
      rows.push([w.w, '/' + (w.p || '') + '/', w.t, w.ph ? (w.ph.p + ' ' + w.ph.t) : '', map[s]]);
    });
    // Excel 会把 = + - @ 开头的单元格当公式执行，导出前统一加前导单引号
    function csvCell(c) {
      var s = String(c === undefined ? '' : c);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }
    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    download(A.bankName() + '_未掌握词表_' + new Date().toISOString().slice(0, 10) + '.csv', csv, 'text/csv;charset=utf-8');
  };

  A.exportJSON = function () {
    download('四六级词汇检测备份_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(S), 'application/json', true);
  };

  /* 备份解析：兼容带 BOM 的文本，并做最基本的格式校验 */
  A.parseBackup = function (text) {
    var o = JSON.parse(String(text).replace(/^\uFEFF/, ''));
    if (!o || typeof o !== 'object' || !o.status) throw new Error('文件格式不对');
    return o;
  };

  A.importJSON = function () {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var o = A.parseBackup(fr.result);
          S.status = o.status || {};
          S.history = o.history || [];
          S.lastResult = o.lastResult || null;
          S.samples = o.samples || [];
          if (o.settings) for (var k in o.settings) if (o.settings.hasOwnProperty(k)) S.settings[k] = o.settings[k];
          A.save(); A.render();
          A.toast('导入成功，共 ' + Object.keys(S.status).length + ' 条作答记录');
        } catch (e) { A.toast('导入失败：' + e.message); }
      };
      fr.readAsText(f);
    };
    inp.click();
  };

  /* ---------- 事件 ---------- */
  A.bind = function () {
    document.addEventListener('click', function (e) {
      var navBtn = e.target.closest ? e.target.closest('[data-nav]') : null;
      if (navBtn) { A.go(navBtn.getAttribute('data-nav')); return; }

      var t = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!t) return;
      var act = t.getAttribute('data-act');
      var d = t.dataset || {};

      switch (act) {
        case 'go': A.go(t.getAttribute('data-route')); break;
        case 'start':
          A.startSession(t.getAttribute('data-kind'), {
            group: t.getAttribute('data-group') !== null ? parseInt(t.getAttribute('data-group'), 10) : undefined,
            size: t.getAttribute('data-size') ? parseInt(t.getAttribute('data-size'), 10) : undefined
          });
          break;
        case 'resume': A.go('test'); break;
        case 'drop-session': A.S.session = null; A.save(); A.render(); A.toast('已放弃上次检测'); break;
        case 'judge': A.judge(parseInt(t.getAttribute('data-v'), 10)); break;
        case 'rejudge': A.rejudge(parseInt(t.getAttribute('data-v'), 10)); break;
        case 'pick': A.pick(parseInt(t.getAttribute('data-n'), 10)); break;
        case 'next': A.nextQ(); break;
        case 'skip': A.skipQ(); break;
        case 'undo': A.undo(); break;
        case 'finish': A.finishSession(); break;
        case 'quit': A.quitAsk(); break;
        case 'quit-keep': A.closeModal(); A.go('home'); break;
        case 'quit-drop': A.closeModal(); A.abandonSession(); break;
        case 'speak': A.speak(t.getAttribute('data-w') || ''); break;
        case 'modal-close': A.closeModal(); break;
        case 'modal-bg': if (e.target === t) A.closeModal(); break;
        case 'set-bank':
          var bk = t.getAttribute('data-bank');
          if (bk && bk !== S.settings.bank) {
            S.settings.bank = bk;
            if (S.session) { S.session = null; A.toast('已切换到' + A.bankName() + '，本次检测已结束'); }
            A.save();
          }
          A.render();
          break;
        case 'review-band':
          var rbBand = parseInt(t.getAttribute('data-band'), 10);
          var lstB = [], lgB = S.lastResult ? S.lastResult.log : [];
          for (var ib = 0; ib < lgB.length; ib++) {
            if (lgB[ib].v !== 2 && A.bandOf(lgB[ib].i) === rbBand) lstB.push(lgB[ib].i);
          }
          if (!lstB.length) { A.toast('这个词段本次没有未掌握的词'); break; }
          A.startSession('list', { list: lstB, label: '复测「' + A.BAND_NAMES[rbBand] + '」段 · ' + lstB.length + ' 词' });
          break;
        case 'ai-ask': A.openAIDialog(t.getAttribute('data-q')); break;
        case 'ai-send': {
          var aiq = el('aiInput');
          A.openAIDialog((aiq && aiq.value.trim()) || '我现在该怎么提升？重点补哪里？');
          break;
        }
        case 'ai-send2': {
          var aiq2 = el('aiInput2');
          var v2 = aiq2 ? aiq2.value.trim() : '';
          if (v2) { aiq2.value = ''; A.runAI(v2, true); }
          break;
        }
        case 'copy-report': A.copyText(A.reportText()); break;
        case 'print-report':
          try { window.print(); } catch (e) { A.toast('当前环境不支持打印'); }
          break;
        case 'review-these':
          var weak = [];
          var lg = S.lastResult ? S.lastResult.log : [];
          for (var i = 0; i < lg.length; i++) if (lg[i].v !== 2) weak.push(lg[i].i);
          A.startSession('list', { list: weak, label: '复测本次未掌握词 · ' + weak.length + ' 词' });
          break;
        case 'export-csv': A.exportCSV(); break;
        case 'export-json': A.exportJSON(); break;
        case 'import-json': A.importJSON(); break;
        case 'clear-answers':
          A.modal('<b>清空所有作答记录？</b><div class="tiny" style="margin:8px 0 16px">会删除每个词的认识/模糊/不认识标记和检测历史，词库本身不受影响。此操作不可撤销。</div>' +
            '<div class="row"><button class="btn primary grow" data-act="do-clear">确认清空</button><button class="btn ghost grow" data-act="modal-close">取消</button></div>');
          break;
        case 'do-clear':
          S.status = {}; S.history = []; S.lastResult = null; S.session = null;
          A.save(); A.closeModal(); A.go('home'); A.toast('已清空');
          break;
        case 'reset-all':
          A.modal('<b>恢复出厂设置？</b><div class="tiny" style="margin:8px 0 16px">会清空全部数据并把设置恢复为默认值。</div>' +
            '<div class="row"><button class="btn primary grow" data-act="do-reset">确认重置</button><button class="btn ghost grow" data-act="modal-close">取消</button></div>');
          break;
        case 'do-reset':
          try { localStorage.removeItem(A.KEY); } catch (err) { }
          location.reload();
          break;
        case 'toggle':
          var key = t.getAttribute('data-key');
          S.settings[key] = !S.settings[key];
          A.save();
          if (key === 'includeExt' && S.session) { S.session = null; A.toast('词库已切换，本次检测已结束'); }
          A.render();
          break;
        case 'toggle-theme': A.setTheme(S.theme === 'dark' ? 'light' : 'dark'); break;
        case 'set-mode':
          // 答题中途换答题方式：把当前这题的作答回滚，避免出现"未作答却显示答错"的状态
          A.clearTimer();
          if (A.RUN.revealed) A.revertCurrent();
          S.settings.mode = t.getAttribute('data-mode');
          A.RUN.opts = null; A.RUN.optsPos = -1; A.RUN.picked = -1; A.RUN.revealed = false;
          A.save(); A.render();
          A.toast(S.settings.mode === 'choice' ? '已切换为四选一模式' : '已切换为自评模式');
          break;
      }
    });

    document.addEventListener('keydown', function (e) { A.onKey(e); });

    var themeBtn = el('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', function () { A.setTheme(S.theme === 'dark' ? 'light' : 'dark'); });

    A.afterRender = function () { };
  };

  A.setTheme = function (t) {
    S.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    var b = el('themeBtn');
    if (b) b.textContent = t === 'dark' ? '☀️' : '🌙';
    A.save();
    var tg = document.querySelector('[data-act="toggle-theme"]');
    if (tg) { tg.className = 'toggle' + (t === 'dark' ? ' on' : ''); tg.setAttribute('aria-checked', t === 'dark' ? 'true' : 'false'); }
  };

  /* ---------- 初始化 ---------- */
  A.init = function () {
    document.documentElement.setAttribute('data-theme', S.theme || 'light');
    A.bind();
    A.setTheme(S.theme || 'light');
    A.render();
    if (A.storageBroken) A.toast('浏览器禁用了本地存储，本次数据无法保存');
    window.addEventListener('beforeunload', function () { A.save(); });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', A.init);
  else A.init();

})(window.__APP__ || (window.__APP__ = {}));