/* ============ 第三部分：结果、总览、设置、事件 ============ */
(function (A) {
  'use strict';

  var tpl = A.tpl, esc = A.esc, el = A.el, S = A.S;


  /* ---------- 结果页 ---------- */
  A.viewResult = function () {
    var r = S.lastResult;
    if (!r) {
      return '<div class="card" style="text-align:center;padding:40px 20px">' +
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
    h += '<div style="display:flex;justify-content:center;margin:14px 0">' + A.ring(A.pct(score, total), A.pct(score, total) + '%', '本次掌握率') + '</div>';
    h += '<div style="font-size:30px;font-weight:850">' + (isQuick && est && enoughSample ? '≈ ' + est.vocab.toLocaleString('en-US') + ' 词' : '掌握 ' + (r.k + r.f) + ' / ' + total + ' 词') + '</div>';
    h += '<div class="tiny" style="margin-top:6px">' + (isQuick && est && enoughSample
      ? ('按随机抽样 ' + total + ' 词估算大纲词汇量，95% 置信区间 ' + est.lo.toLocaleString('en-US') + ' ~ ' + est.hi.toLocaleString('en-US') + (total < 50 ? '；样本偏小，误差较大' : ''))
      : isQuick && !enoughSample
        ? ('这轮只答了 ' + total + ' 词，样本太小不给词汇量估算；做完 20 词以上（推荐 100 词）再看结果')
        : '认识 ' + r.k + ' · 模糊 ' + r.f + ' · 不认识 ' + r.u + (r.skipped ? ' · 跳过 ' + r.skipped : '')) + '</div>';
    h += '</div>';

    h += '<div class="card"><div class="segbar">' +
      '<i style="width:' + A.pct(r.k, total) + '%;background:var(--ok)"></i>' +
      '<i style="width:' + A.pct(r.f, total) + '%;background:var(--warn)"></i>' +
      '<i style="width:' + A.pct(r.u, total) + '%;background:var(--bad)"></i></div>' +
      '<div class="legend"><span><i style="background:var(--ok)"></i>认识 ' + r.k + ' 词</span>' +
      '<span><i style="background:var(--warn)"></i>模糊 ' + r.f + ' 词</span>' +
      '<span><i style="background:var(--bad)"></i>不认识 ' + r.u + ' 词</span></div>';
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
        '<textarea style="width:100%;height:200px;font-size:12.5px;border-radius:10px;border:1px solid var(--line);padding:10px;background:var(--glass-2);color:var(--ink)">' +
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
      '<div class="acts"><button class="chip" data-act="speak" data-w="{word}" aria-label="朗读 {word}">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg></button></div>' +
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
    h += '<div class="sec-title">词频分布 · 按词频段<span class="line"></span><span class="tiny">' +
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
          '<div class="bv">{val}</div>' +
          '<button class="bask" data-act="ai-band" data-band="{b}" title="带着这一段的数据问 AI">问</button></div>',
          {
            name: A.BAND_NAMES[r.band] || ('频段 ' + r.band),
            w: has ? Math.max(2, p) : 0,
            col: p === null ? 'var(--line)' : (p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--bad)'),
            val: has ? (p + '%') : '—',
            b: r.band
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

  /* ---------- 词汇地图 ----------
     纵轴词频段 × 横轴首字母，颜色＝掌握率、浓淡＝测过多少。
     一眼看出「整块没测」和「整块不会」，点格子直接复测那一块。 */
  A.vocabMapHTML = function () {
    var M = A.vocabMap();
    var t = A.tally(A.activePool());
    var h = '';
    h += '<div class="sec-title">词汇地图<span class="line"></span><span class="tiny">' +
      '纵轴越靠上越常用 · 点格子可复测那一块 · Shift+点击可带着这一格问 AI</span>' +
      '<button class="btn sm ghost" data-act="ai-map" style="margin-left:auto" title="把整张地图的缺口交给 AI 分析">' +
      '让 AI 解读这张地图</button></div>';
    h += '<div class="card vmap-card">';

    if (!t.tested) {
      h += '<div class="tiny">还没有已测词。做一次摸底，这张地图就会亮起来——' +
        '哪块是空的、哪块测过还不会，一眼就能看见。</div></div>';
      return h;
    }

    // 表头：A–Z
    h += '<div class="vmap">';
    h += '<div class="vmap-row vmap-head"><span class="vmap-lbl"></span>';
    M.letters.forEach(function (L) { h += '<span class="vmap-lt">' + L + '</span>'; });
    h += '</div>';

    M.rows.forEach(function (row) {
      h += '<div class="vmap-row"><span class="vmap-lbl" title="' + esc(row.name) + '">' + esc(row.name) + '</span>';
      row.cells.forEach(function (c) {
        if (!c.N) { h += '<span class="vmap-c empty"></span>'; return; }
        var p = Math.round(c.ratio * 100);
        var tone = p >= 80 ? 'ok' : p >= 50 ? 'warn' : 'bad';
        // 浓度跟着"测过多少"走：没测过几乎是空的描边，测满了才是实色
        var a = 0.14 + 0.78 * (c.tested / c.N);
        h += '<button class="vmap-c ' + tone + (c.tested ? '' : ' none') + '"' +
          ' style="--fa:' + a.toFixed(3) + '"' +
          ' data-act="map-review" data-band="' + c.band + '" data-letter="' + c.letter + '"' +
          ' title="' + esc(row.name + ' · ' + c.letter + '：共 ' + c.N + ' 词，已测 ' + c.tested +
            '，认识 ' + c.k + '，模糊 ' + c.f + '，不认识 ' + c.u +
            '，掌握率 ' + p + '%' + (c.untested ? '，未测 ' + c.untested + ' 词' : '') +
            '｜点击复测 · Shift+点击问 AI') + '">' +
          '</button>';
      });
      h += '</div>';
    });
    h += '</div>';

    h += '<div class="vmap-legend">' +
      '<span><i class="ok"></i>掌握好</span>' +
      '<span><i class="warn"></i>一般</span>' +
      '<span><i class="bad"></i>有洞</span>' +
      '<span><i class="none"></i>没测过</span>' +
      '<span class="vmap-hint">颜色越浓 = 这一格测得越多</span>' +
      '</div>';

    // 结论：一眼看完还得有一句话总结。「没测过」和「测过还不会」分开说，别混成一句
    var facts = [];
    if (M.untestedCells) facts.push('还有 <b>' + M.untestedCells + '</b> 块一个词都没测过（虚线格）');
    if (M.hot.length) {
      facts.push('测过的里面洞口最大的三块是 ' + M.hot.map(function (c) {
        return '<b>' + esc(c.name) + ' · ' + c.letter + '</b>（测过还缺 ' + c.gap + ' 词）';
      }).join('、') + '，点一下就能复测');
    } else if (M.testedCells) {
      facts.push('已经测过的块里没有明显的洞');
    }
    if (facts.length) h += '<div class="tiny vmap-sum">' + facts.join('；') + '。</div>';

    h += '<div class="row" style="margin-top:12px;flex-wrap:wrap;gap:8px">' +
      '<button class="btn sm primary" data-act="map-review" data-band="all" data-letter="all">复测全部没测过的词</button>' +
      '</div>';

    h += '</div>';
    return h;
  };

  /* ---------- 使用者档案 ----------
     作答数据存在这台浏览器里。同一台电脑换人用就会串，所以按档案隔离。
     这个面板既是切换器，也是「数据到底存在哪」的说明。 */
  A.profilesModal = function () {
    var all = A.profileList();
    var rows = A.profileSummaries().map(function (p) {
      return '<div class="who-row' + (p.active ? ' on' : '') + '">' +
        '<span class="who-nm">' + esc(p.name) + (p.active ? '<em>当前</em>' : '') + '</span>' +
        '<span class="who-meta">' + (p.tested
          ? ('已测 ' + p.tested + ' 词 · 词汇量 ≈ ' + p.loose + ' 词')
          : '还没有作答') + '</span>' +
        '<span class="who-acts">' +
          (p.active ? '' : '<button class="btn sm" data-act="switch-profile" data-id="' + p.id + '">切换</button>') +
          '<button class="btn sm ghost" data-act="rename-profile" data-id="' + p.id + '">改名</button>' +
          (all.length > 1 ? '<button class="btn sm ghost" data-act="del-profile" data-id="' + p.id + '">删除</button>' : '') +
        '</span></div>';
    }).join('');

    A.modal('<b>使用者</b>' +
      '<div class="tiny" style="margin:6px 0 14px;line-height:1.8">每个使用者的作答、抽样与轮次报告都<b>分开存放</b>。' +
      '同一台电脑上换人用，新建一个使用者即可，互不可见。</div>' +
      '<div class="who-list">' + rows + '</div>' +
      '<div class="who-new"><input id="newWho" maxlength="12" placeholder="新使用者的名字" aria-label="新使用者名字">' +
      '<button class="btn primary" data-act="create-profile">新建并切过去</button></div>' +
      '<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">' +
      '<button class="btn sm" data-act="demo-levels">一键生成六个等级的示例账号（S / A / B+ / B / C / D）</button>' +
      '</div>' +
      '<div class="tiny" style="margin-top:14px;line-height:1.85;border-top:1px dashed var(--line2);padding-top:12px">' +
      '<b>把文件发给别人会怎样：</b>作答数据存在浏览器里，<b>不跟着 index.html 走</b>。' +
      '对方在自己电脑上打开，看到的是一份干净的空档案。</div>' +
      '<div class="row" style="margin-top:14px"><button class="btn grow" data-act="modal-close">关闭</button></div>');
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
    h += A.ring(A.pct(t.tested, t.total), A.pct(t.tested, t.total) + '%', '完成度');
    h += '<div class="grow"><div style="font-size:26px;font-weight:850">' + headline + '</div>';
    h += '<div class="tiny">' + detail + '</div>';
    if (lv) h += '<div class="pill brand" style="margin-top:10px">' + lv.t + '</div><div class="tiny" style="margin-top:6px">' + lv.d + '</div>';
    h += '</div></div>';
    h += '<div class="segbar" style="margin-top:16px">' +
      '<i style="width:' + A.pct(t.k, t.total) + '%;background:var(--ok)"></i>' +
      '<i style="width:' + A.pct(t.f, t.total) + '%;background:var(--warn)"></i>' +
      '<i style="width:' + A.pct(t.u, t.total) + '%;background:var(--bad)"></i></div>';
    h += '<div class="legend"><span><i style="background:var(--ok)"></i>认识 ' + t.k + '</span>' +
      '<span><i style="background:var(--warn)"></i>模糊 ' + t.f + '</span>' +
      '<span><i style="background:var(--bad)"></i>不认识 ' + t.u + '</span>' +
      '<span><i style="background:var(--line)"></i>未测 ' + t.rest + '</span></div>';
    h += '<div class="statgrid" style="margin-top:14px">' +
      '<div class="stat"><b>' + t.total + '</b><span>词库总量</span></div>' +
      '<div class="stat"><b>' + t.tested + '</b><span>已检测</span></div>' +
      '<div class="stat"><b>' + A.pct(t.k + t.f, t.tested) + '%</b><span>已测词掌握率</span></div>' +
      '<div class="stat"><b>' + t.rest + '</b><span>待检测</span></div></div>';
    h += '</div>';

    h += A.bandProfileHTML();
    h += A.vocabMapHTML();


    // 历史
    if (A.aiCardHTML) h += A.aiCardHTML();

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
    /* 口音：词库音标是教材通用的英式标注，而系统语音默认多为美式，所以给个开关，
       并把这个差别写在界面上，而不是让用户自己发现"读的和标的不一样"。 */
    var acc = A.accentCfg ? A.accentCfg() : { k: 'us', name: '美式' };
    h += '<div class="switch" style="align-items:flex-start"><div class="st"><b>发音口音</b>' +
      '<small>当前：<b>' + esc(acc.name) + '</b>。四六级听力<b>英音与美音混合</b>（英音历史占比更高，近年也在加入其他口音），' +
      '词库音标是教材通用的英式标注（非卷舌、BATH 用 ɑː、保留 juː）。建议两种都切着听一遍</small></div>' +
      '<div class="tabs" style="margin:0;width:190px">' +
      (A.ACCENTS || []).map(function (a) {
        return '<button class="' + (a.k === acc.k ? 'on' : '') + '" data-act="set-accent" data-accent="' + a.k + '">' + a.name + '</button>';
      }).join('') +
      '</div></div>';
    h += sw('includeExt', '包含拓展派生词', '除大纲核心词外，再加入 ' + A.WORDS.filter(function (w) { return w.x; }).length + ' 个常见派生词（当前词库 ' + A.activePool().length + ' 词）');
    h += sw('strict', '严格的估算口径', '只把「认识」算作掌握；关闭时「模糊」按一半折算。两种口径的数值都会列在总览页');
    h += '</div>';

    h += '<div class="sec-title">外观<span class="line"></span></div>';
    h += '<div class="card"><div class="switch"><div class="st"><b>深色模式</b><small>夜间刷词更护眼</small></div>' +
      '<button class="toggle' + (S.theme === 'dark' ? ' on' : '') + '" role="switch" aria-checked="' + (S.theme === 'dark') + '"' +
      ' aria-label="深色模式" data-act="toggle-theme"></button></div></div>';

    h += '<div class="sec-title">数据管理<span class="line"></span></div>';
    h += '<div class="card"><div class="row" style="flex-wrap:wrap;gap:10px">' +
      '<button class="btn" data-act="profiles">切换 / 新建使用者</button>' +
      '<button class="btn" data-act="demo-levels" title="生成 6 个演示档案，每个档案的作答刚好落在 S/A/B+/B/C/D 六个等级上，方便逐个展示">生成六个等级的演示档案</button>' +
      '<button class="btn" data-act="pet-reset" title="如果桌宠跑到了奇怪的位置、或者拖不动，点这里把她叫回右下角">桌宠跑丢了？叫回右下角</button>' +
      '<button class="btn" data-act="export-json">导出作答备份（JSON）</button>' +
      '<button class="btn" data-act="export-csv">导出未掌握词表（CSV）</button>' +
      '<button class="btn" data-act="import-json">导入备份</button>' +
      '<button class="btn" data-act="clear-answers">清空作答记录</button>' +
      '<button class="btn ghost" data-act="reset-all">恢复出厂设置</button>' +
      '</div>';
    h += '<div class="tiny" style="margin-top:12px">当前使用者：<b>' + esc(A.myName()) + '</b>，已记录 ' +
      Object.keys(S.status).length + ' 个词的作答，' + S.history.length +
      ' 条检测记录。数据保存在本机浏览器中，<b>按使用者分开存放</b>；同一台电脑上换人用请新建使用者。' +
      '换浏览器或清理缓存会丢失，建议定期导出备份。</div>';
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

    /* ---------- AI 与额度 ----------
       三档通路要在这里讲清楚，否则用户分不清"为什么这次能用大模型、那次不能"：
       ① 自带 Key（无限次，直连厂商）② 作者额度（完成一次检测换一次）③ 本地方案（无限次） */
    var q = A.aiQuota ? A.aiQuota() : { granted: 0, used: 0, left: 0 };
    var uk = (A.S.userKey && A.S.userKey.key) ? A.S.userKey : null;
    h += '<div class="sec-title">AI 与额度<span class="line"></span></div>';
    h += '<div class="card" style="line-height:1.9">';
    h += '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
      '<span class="pill brand">' + esc(A.aiTierLabel ? A.aiTierLabel() : '本地方案') + '</span>' +
      '<span class="tiny">作者额度：已授予 <b>' + q.granted + '</b> 次，已用 <b>' + q.used + '</b> 次，剩余 <b>' + q.left + '</b> 次</span>' +
      '</div>';

    // ① 自带 Key
    h += '<div class="tiny" style="margin:12px 0 6px"><b>自带 API Key（推荐，不限次数）</b>' +
      (uk ? ' —— 已填写 <code>' + esc(uk.key.slice(0, 6)) + '…' + esc(uk.key.slice(-4)) + '</code>，模型 ' + esc(uk.model) : '') +
      '</div>';
    h += '<div class="row" style="gap:8px;flex-wrap:wrap">' +
      '<input class="search" id="userKeyInput" type="password" placeholder="sk-…（只存本机，不上传）" value="' + (uk ? esc(uk.key) : '') + '">' +
      '<button class="btn primary" data-act="ai-key-save">保存并测试</button>' +
      (uk ? '<button class="btn ghost" data-act="ai-key-clear">清除 Key</button>' : '') +
      '<button class="btn ghost" data-act="ai-guide">接入指南</button>' +
      '</div>';
    h += '<div class="tiny" id="userKeyMsg" style="margin-top:6px;color:var(--ink3)">' +
      (uk ? 'Key 只保存在这个浏览器里；导出备份时不会包含它。' : '不知道怎么申请？点「接入指南」，里面有厂商对比与常见报错对照。') +
      '</div>';

    h += '<div class="tiny" style="margin-top:14px;color:var(--ink3)">' +
      '<b>作者额度怎么获得：</b>完成一次<b>有效检测</b>换一次深度诊断' +
      '（整库检测要求测过 ≥100 词且覆盖 ≥95%；或一次达标的随机摸底 ≥80 题）。' +
      '<br><b>本地方案：</b>不需要任何 Key、也不限次数——按你的等级、短板形态与覆盖状态给一份确定的补词计划，' +
      '只是不如大模型灵活。' +
      '<br>三种形态都只上行汇总数据（覆盖率、频段掌握率、未掌握词清单），<b>逐题作答不出本机</b>。' +
      '</div></div>';

    /* 每日时间预算：本地方案要用它把"每天多少词"算成具体数量。
       三个预设只是快捷方式，用户还能自己填（5–180 分钟）——
       每个人的通勤/自习时间都不一样，只给三档等于逼人选一个不合适的。 */
    var dm = A.S.settings.dailyMinutes || 30;
    var isPreset = [15, 30, 60].indexOf(dm) >= 0;
    var perDayNow = Math.max(1, Math.round(dm / 1.5));
    h += '<div class="sec-title">每日可投入时间<span class="line"></span></div>';
    h += '<div class="card tiny" style="line-height:1.9">' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
      [15, 30, 60].map(function (m) {
        var on = (dm === m);
        return '<button class="btn sm' + (on ? ' primary' : '') + '" data-act="set-daily" data-min="' + m + '">' + m + ' 分钟</button>';
      }).join('') +
      '<span style="width:10px"></span>' +
      '<input class="search" id="dailyMinInput" type="number" min="5" max="180" step="5" inputmode="numeric" ' +
        'style="width:112px" value="' + dm + '" aria-label="自定义每日分钟数（5–180）">' +
      '<button class="btn sm" data-act="set-daily-custom">应用</button>' +
      (isPreset ? '' : '<span class="pill brand" style="margin-left:2px">自定义 ' + dm + ' 分钟</span>') +
      '</div>' +
      '当前设置：每天 <b>' + dm + '</b> 分钟，换算成约 <b>' + perDayNow + '</b> 个词/天' +
      '（按每词约 1.5 分钟估算）。可填 5–180 之间的任意整数。' +
      '</div>';

    /* 回访提醒：打开首页时用上次结果给一句话分析。
       刻意做成"卡片 + 可永久关闭"而不是开机弹窗——理由写在 NEXT.md（不遮挡、不催打卡）。 */
    h += '<div class="sec-title">回访提醒<span class="line"></span></div>';
    h += '<div class="card tiny" style="line-height:1.9">' +
      '<div class="switch"><div class="st"><b>打开首页时给一句话分析</b>' +
        '<small>用上次的检测结果说明"哪一段最弱、多久能补完"；距上次检测满 ' + A.REVISIT_GAP_DAYS +
        ' 天才出现，不遮挡、不联网、不消耗 AI 额度</small></div>' +
      '<button class="toggle' + (S.settings.revisitOff ? '' : ' on') + '" role="switch" aria-checked="' +
        (S.settings.revisitOff ? 'false' : 'true') + '" aria-label="回访提醒" data-act="revisit-toggle"></button></div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">' +
      '<button class="btn sm" data-act="revisit-preview">预览这张卡</button>' +
      '<span style="color:var(--ink3)">没有历史数据时显示的是示例，测过一次就换成你自己的数字</span>' +
      '</div></div>';

    h += '<div class="sec-title">素材来源<span class="line"></span></div>';
    h += '<div class="card tiny" style="line-height:1.95">' +
      '桌宠立绘：<b>DS鲸鱼娘</b> · Sutera-Diffusus · ' +
      '<a href="https://github.com/Sutera-Diffusus/dsh-whale-musume" target="_blank" rel="noopener">MIT 许可</a>' +
      '（经 1TRYOUT/dsh-whale-pixel-pet 分发，作者署名保留）<br>' +
      '例句语料：Tatoeba 英中对照句库（CC-BY 2.0 FR）<br>' +
      '词库：四六级大纲词表，附国际音标与词频分层；界面与算法为本项目原创（MIT）。' +
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
    if (A.stripStrayText) A.stripStrayText();   // 启动时清掉任何游离文本残留
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
        case 'ai-open': A.openAIDialog(); break;
        /* ---------- 回访卡 ---------- */
        case 'revisit-hide':
          // 只收起，不落盘：关掉浏览器再打开，该提醒还在（用户只是"这次不想看"）
          A._revisitHidden = true; A.render();
          break;
        case 'revisit-off':
          S.settings.revisitOff = true; A._revisitHidden = false;
          A.save(); A.render();
          A.toast('已关闭回访提醒，可在「设置 → 回访提醒」重新打开');
          break;
        case 'revisit-toggle':
          S.settings.revisitOff = !S.settings.revisitOff;
          A._revisitHidden = false;
          A.save(); A.render();
          A.toast(S.settings.revisitOff ? '已关闭回访提醒' : '已开启：距上次检测满 ' + A.REVISIT_GAP_DAYS + ' 天会显示');
          break;
        case 'revisit-preview':
          A._revisitForce = true; A.go('home');
          A.toast('这是回访卡的样子' + (A.revisitInfo() ? '（用你的真实数据）' : '（示例数据，测一次后会换成你的数字）'));
          break;
        case 'revisit-review': {
          var rv = A.revisitInfo();
          if (!rv || !rv.target) { A.toast('还没有足够的抽样数据，先做一次摸底'); break; }
          A.reviewCell(rv.target.band, 'all');
          break;
        }
        case 'revisit-report': A.go('report'); break;
        case 'revisit-ask': {
          var rv2 = A.revisitInfo();
          A.openAIDialog(null, A.focusForBand(rv2 && rv2.target ? rv2.target.band : 1));
          break;
        }
        case 'ai-band': A.openAIDialog(null, A.focusForBand(parseInt(t.getAttribute('data-band'), 10))); break;
        case 'ai-map': A.openAIDialog(null, A.focusForMap()); break;
        case 'ai-do': A.aiRunAction(t.getAttribute('data-aid')); break;
        case 'ai-guide': A.openAiGuide(); break;
        case 'ai-guide-settings': A.closeModal(); A.go('settings'); break;
        case 'set-accent': {
          var ak = t.getAttribute('data-accent');
          S.settings.accent = ak === 'uk' ? 'uk' : 'us';
          A.save();
          if (A.repickVoice) A.repickVoice();          // 换口音要重新选音色
          A.render();
          var nm = A.accentCfg().name;
          A.toast('发音口音：' + nm);
          if (S.settings.sound) A.speak('vocabulary');  // 念一个词让用户立刻听到差别
          break;
        }
        case 'set-daily':
          S.settings.dailyMinutes = parseInt(t.getAttribute('data-min'), 10) || 30;
          A.save(); A.render();
          break;
        case 'set-daily-custom': {
          // 自定义分钟数：夹到 5–180，非数字就退回 30，避免把 0 或 9999 带进计划换算
          var di = el('dailyMinInput');
          var raw = di ? parseInt(di.value, 10) : NaN;
          if (!isFinite(raw) || raw <= 0) { A.toast('请填一个 5–180 之间的数字'); break; }
          var mins = Math.max(5, Math.min(180, Math.round(raw)));
          S.settings.dailyMinutes = mins;
          A.save(); A.render();
          A.toast('已设为每天 ' + mins + ' 分钟（约 ' + Math.max(1, Math.round(mins / 1.5)) + ' 词/天）');
          break;
        }
        case 'ai-key-save': {
          var ki = el('userKeyInput');
          var kv = ki ? ki.value.trim() : '';
          var msg = el('userKeyMsg');
          if (!kv) { if (msg) msg.textContent = '先把 Key 填进来'; break; }
          A.setUserKey({ key: kv });
          if (msg) msg.textContent = '正在测试连接…';
          A.testUserKey(A.S.userKey).then(function (r) {
            var m2 = el('userKeyMsg');
            if (m2) {
              m2.textContent = r.ok ? ('✓ ' + r.msg + '（现在起 AI 走你自己的额度，不限次数）')
                : ('✗ ' + r.msg + '　Key 已保存，但仍会回退到作者额度/本地方案。');
              m2.style.color = r.ok ? 'var(--ok)' : 'var(--bad)';
            }
            A.render();
          });
          break;
        }
        case 'ai-key-clear':
          A.setUserKey(null);
          A.toast('已清除本机保存的 Key');
          A.render();
          break;
        case 'book-import': A.openImportBook(); break;
        case 'book-preview': A.previewImport(); break;
        case 'book-save': A.commitImport(); break;
        case 'book-use': A.useBook(t.getAttribute('data-book')); break;
        case 'book-del': A.removeBook(t.getAttribute('data-book')); break;
        case 'book-del-confirm': A.confirmRemoveBook(t.getAttribute('data-book')); break;
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
        case 'ai-unlock': {
          var pass = el('aiLockPass');
          var pv = pass ? pass.value : '';
          if (!pv) break;
          var ub = el('aiUnlockBtn');
          if (ub) { ub.disabled = true; ub.textContent = '校验中…'; }
          A.unlockAI(pv).then(function (ok) {
            var b2 = el('aiUnlockBtn');
            if (b2) { b2.disabled = false; b2.textContent = '解锁'; }
            if (ok && pass) pass.value = '';
          });
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
        case 'map-review':
          var mb = t.getAttribute('data-band'), ml = t.getAttribute('data-letter');
          // Shift + 点击格子 = 带着这一格的数字去问 AI（反向联动）
          if (e.shiftKey && mb !== 'all' && A.openAIDialog) {
            A.openAIDialog(null, A.focusForCell(+mb, ml));
            break;
          }
          if (mb !== 'all' && A.reviewCell) { A.reviewCell(+mb, ml); break; }
          var mlist = (mb === 'all' && ml === 'all')
            ? (A.untestedWords ? A.untestedWords() : [])
            : A.mapCellWords(+mb, ml);
          if (!mlist.length) { A.toast('这块没有需要复测的词'); break; }
          var mcap = 400;
          var mtake = mlist.slice(0, mcap);
          A.startSession('list', {
            list: mtake,
            label: (mb === 'all' ? '复测全部未测词' : ('复测 ' + (A.BAND_NAMES[+mb] || '') + ' · ' + ml + ' 块')) +
              ' · ' + mtake.length + ' 词' + (mlist.length > mcap ? '（共 ' + mlist.length + '，先测前 ' + mcap + '）' : '')
          });
          break;
        case 'demo-levels': {
          var hasDemo = A.profileList().some(function (p) { return String(p.name).indexOf(A.DEMO_PREFIX) === 0; });
          var run = function () {
            var made = A.buildDemoProfiles();
            var txt = made.map(function (m) { return m.rank + ' ' + m.rankName + '（' + Math.round(m.ratio * 100) + '%）'; }).join(' / ');
            A.render();
            A.profilesModal();
            A.toast('已生成 6 个演示档案：' + txt);
          };
          if (hasDemo) {
            A.modal('<b>重新生成演示档案？</b><div class="tiny" style="margin:8px 0 14px;line-height:1.8">' +
              '会按当前词库重新写一遍这 6 个档案的数据（覆盖它们原有的作答，不影响你自己的档案）。</div>' +
              '<div class="row" style="gap:10px"><button class="btn primary grow" data-act="demo-levels-go">重新生成</button>' +
              '<button class="btn ghost grow" data-act="modal-close">取消</button></div>');
          } else {
            run();
          }
          break;
        }
        case 'demo-levels-go': A.closeModal(); (function () {
          var made = A.buildDemoProfiles();
          A.render();
          A.profilesModal();
          A.toast('已生成 6 个演示档案');
        })(); break;
        case 'profiles': A.profilesModal(); break;
        case 'switch-profile':
          A.switchProfile(t.getAttribute('data-id'));
          A.closeModal(); A.go('home');
          A.toast('已切换到 ' + A.myName());
          break;
        case 'create-profile':
          var newNm = (document.getElementById('newWho') || {}).value || '';
          var rec = A.createProfile(newNm);
          A.closeModal(); A.go('home');
          A.toast('已新建使用者「' + rec.name + '」，数据从零开始');
          break;
        case 'rename-profile':
          var rid = t.getAttribute('data-id');
          var cur = '';
          A.profileList().forEach(function (p) { if (p.id === rid) cur = p.name; });
          A.modal('<b>改名</b><div class="tiny" style="margin:8px 0 12px">只改显示的名字，不会动任何作答数据。</div>' +
            '<input id="renWho" maxlength="12" value="' + A.esc(cur) + '" aria-label="新的名字" ' +
            'style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--line2);background:var(--glass-2);color:var(--ink);font:inherit">' +
            '<div class="row" style="margin-top:14px"><button class="btn primary grow" data-act="do-rename" data-id="' + rid + '">保存</button>' +
            '<button class="btn ghost grow" data-act="modal-close">取消</button></div>');
          break;
        case 'do-rename':
          var nv = (document.getElementById('renWho') || {}).value || '';
          A.renameProfile(t.getAttribute('data-id'), nv);
          A.closeModal(); A.toast('已改名');
          break;
        case 'del-profile':
          var did = t.getAttribute('data-id'), dnm = '';
          A.profileList().forEach(function (p) { if (p.id === did) dnm = p.name; });
          A.modal('<b>删除使用者「' + A.esc(dnm) + '」？</b>' +
            '<div class="tiny" style="margin:8px 0 16px">这个使用者的作答、抽样与轮次报告会一并删除，' +
            '<b>不可恢复</b>。想留个底可以先导出备份。</div>' +
            '<div class="row"><button class="btn primary grow" data-act="do-del-profile" data-id="' + did + '">确认删除</button>' +
            '<button class="btn ghost grow" data-act="modal-close">取消</button></div>');
          break;
        case 'do-del-profile':
          if (A.removeProfile(t.getAttribute('data-id'))) { A.closeModal(); A.toast('已删除'); }
          else { A.closeModal(); A.toast('至少要留一个使用者'); }
          break;
        case 'save-welcome':
          var wn = ((document.getElementById('welName') || {}).value || '').trim();
          if (wn) A.renameProfile(A.activeProfile().id, wn);
          A.markWelcomed(); A.render(); A.toast('好，' + A.myName() + '，开始吧');
          break;
        case 'skip-welcome':
          A.markWelcomed(); A.render();
          break;
        case 'export-csv': A.exportCSV(); break;
        case 'new-round':
          var cur = A.roundNo(), nx = cur + 1;
          var R0 = A.levelReport();
          A.modal('<b>开始第 ' + nx + ' 轮检测？</b>' +
            '<div class="tiny" style="margin:8px 0 16px;line-height:1.9">' +
            '<b>会清空：</b>本轮的每词作答、检测记录、随机抽样样本。<br>' +
            '<b>会保留：</b>第 ' + cur + ' 轮的等级报告（' + R0.rank.k + ' ' + R0.rank.name + ' · ' +
            R0.loose.toLocaleString('en-US') + ' 词）会存进「历轮报告」，随时可查、可和新一轮对比。<br>' +
            '清空后无法恢复本轮的逐题作答。' +
            '</div>' +
            '<div class="row"><button class="btn primary grow" data-act="do-new-round">开始第 ' + nx + ' 轮</button>' +
            '<button class="btn ghost grow" data-act="modal-close">取消</button></div>');
          break;
        case 'do-new-round':
          if (A.startNewRound()) {
            A.closeModal(); A.go('home');
            A.toast('已开始第 ' + A.roundNo() + ' 轮，上一轮的报告在「报告 → 历轮」里');
          } else {
            A.closeModal(); A.toast('本轮还没测完整个词库，先测完再开新一轮');
          }
          break;
        case 'pet-reset':
          // 兜底入口：万一她跑到奇怪的位置（或坐标系被写坏），用户自己能一键叫回来
          if (A.petReset) { A.petReset(); A.toast('桌宠已回到右下角'); }
          break;
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
    // 图标由 CSS 按 data-theme 切换，这里不需要再改内容
    A.save();
    var tg = document.querySelector('[data-act="toggle-theme"]');
    if (tg) { tg.className = 'toggle' + (t === 'dark' ? ' on' : ''); tg.setAttribute('aria-checked', t === 'dark' ? 'true' : 'false'); }
  };

  /* 复测地图某一格（未测 + 模糊 + 不认识）。抽成独立函数，供三处复用：
     点格子 / Shift+点击问 AI 后的动作按钮 / AI 返回的 review 动作。 */
  A.reviewCell = function (band, letter) {
    var list = (letter === 'all')
      ? (A.mapCellWords ? A.mapCellWords(band, 'all') : [])
      : (A.untestedWords && band === 'all' && letter === 'all' ? A.untestedWords() : A.mapCellWords(band, letter));
    if (!list || !list.length) { A.toast('这块没有需要复测的词'); return false; }
    var cap = 400;
    var use = list.slice(0, cap);
    var label = (band === 'all' && letter === 'all')
      ? '复测全部没测过的词'
      : ('复测「' + (A.BAND_NAMES[band] || ('频段 ' + band)) + (letter === 'all' ? '」整段' : ' · ' + letter) + '」的缺口词');
    A.startSession('list', { list: use, label: label });
    return true;
  };
  /* ---------- 初始化 ---------- */
  A.init = function () {
    document.documentElement.setAttribute('data-theme', S.theme || 'light');
    A.bind();
    A.setTheme(S.theme || 'light');
    A.armMotion();          // 首次进入也播一次进场动效
    A.render();
    // 视效层（卡片聚光 / 磁吸 / 导航滑块）。纯装饰，挂了也不能影响主流程
    if (A.initFx) { try { A.initFx(); } catch (e) {} }
    // 入场页：内容已经渲染好了，由它盖在上面，退场纯视觉过渡（不产生加载空窗）
    if (A.initIntro) { try { A.initIntro(); } catch (e) {} }
    if (A.storageBroken) A.toast('浏览器禁用了本地存储，本次数据无法保存');
    window.addEventListener('beforeunload', function () { A.save(); });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', A.init);
  else A.init();

})(window.__APP__ || (window.__APP__ = {}));