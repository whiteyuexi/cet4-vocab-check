/* ============ 第六部分：词汇等级评估报告 ============
   两个入口，共用一份数据（A.levelReport()）：
     1) 左侧悬浮的「信封」——点开就是这份报告
     2) 底部导航的「报告」页
   报告只在词库覆盖 ≥95%（与全站估算口径一致）时才给等级；
   没测完就显示还差多少词，不猜等级。 */
(function (A) {
  'use strict';

  var esc = A.esc, tpl = A.tpl, S = A.S;

  /* ---------- 小工具 ---------- */
  function n(v) { return Number(v).toLocaleString('en-US'); }
  function pct1(r) { return (r * 100).toFixed(1) + '%'; }
  // 掌握率 → 对应词数（四舍五入到整词）
  function wordsFor(ratio, total) { return Math.round(ratio * total); }

  /* ---------- 报告正文 ---------- */
  A.viewReport = function () {
    var R = A.levelReport();
    var h = A.bankSwitch();

    if (!R.ready) return h + lockedHTML(R) + historyHTML();
    return h + heroHTML(R) + compareHTML(R) + ladderHTML(R) + depthHTML(R) +
      bandsHTML(R) + planHTML(R) + historyHTML() + footnoteHTML(R);
  };

  /* 没测完：说清还差多少、怎么继续，绝不猜等级 */
  function lockedHTML(R) {
    var need = Math.max(0, Math.ceil(R.total * 0.95) - R.tested);
    var p = Math.round(R.coverage * 100);
    var hist = A.roundHistory();
    return tpl(
      '<div class="card rpt-locked">' +
        '<div class="rpt-lock-ic">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/>' +
          '<path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/></svg>' +
        '</div>' +
        '<div class="rpt-lock-main">' +
          '<b>第 {round} 轮还没测完，先不给等级</b>' +
          '<p>等级要靠「整库实测」才站得住：抽样能估算词汇量，但分不出你在哪些频段上有洞。' +
          '本轮 {bank} 已测 {tested} / {total} 词（{p}%），<b>再测 {need} 词</b>就能出完整评估。</p>' +
          '{hist}' +
          '<div class="rpt-prog"><i style="width:{p}%"></i></div>' +
          '<div class="row" style="margin-top:14px">' +
            '<button class="btn primary" data-act="start" data-kind="all">继续完整检测</button>' +
            '<button class="btn ghost" data-act="go" data-route="groups">按分组推进</button>' +
          '</div>' +
        '</div>' +
      '</div>',
      {
        round: A.roundNo(), bank: esc(R.bank.name), tested: n(R.tested), total: n(R.total),
        p: p, need: n(need),
        hist: hist.length
          ? '<p class="tiny" style="margin-top:8px">已完成 ' + hist.length + ' 轮，' +
            '「历轮报告」在下面，随时可以回看。</p>'
          : ''
      });
  }

  /* 等级卡：最上面那块，一眼看到结论 */
  function heroHTML(R) {
    var nextLine;
    if (R.nextRank) {
      nextLine = '到 <b>' + R.nextRank.k + ' ' + R.nextRank.name + '</b> 还差 <b>' + n(R.toNext) + ' 词</b>（约 ' +
        Math.ceil(R.toNext / R.perDay) + ' 天 · 每天 ' + R.perDay + ' 词）';
    } else {
      nextLine = '已经是最高一级了，重点转成「保持复现」，别让它回落。';
    }
    return tpl(
      '<div class="card rpt-hero tone-{tone}">' +
        '<div class="rpt-badge"><b>{k}</b><small>{name}</small></div>' +
        '<div class="rpt-hero-main">' +
          '<div class="rpt-hero-num">{loose}<i>词</i></div>' +
          '<div class="rpt-hero-meta">{bank}大纲 {total} 词 · 掌握率 {ratio} · 已测 {tested} 词（{cov}）</div>' +
          '<p class="rpt-hero-desc">{desc}</p>' +
          '<div class="rpt-next">{nextLine}</div>' +
          '{capNote}' +
        '</div>' +
      '</div>',
      {
        tone: R.rank.tone, k: esc(R.rank.k), name: esc(R.rank.name),
        loose: n(R.loose), bank: esc(R.bank.name), total: n(R.total),
        ratio: pct1(R.ratio), tested: n(R.tested), cov: pct1(R.coverage),
        desc: esc(R.rank.desc), nextLine: nextLine,
        capNote: (R.cap && R.cap !== R.rankByRatio)
          ? '<div class="rpt-cap">地基约束：最高频 1k 段只掌握 <b>' + pct1(R.capBandRatio) +
            '</b>，按总掌握率本可评 <b>' + R.rankByRatio.k + ' ' + esc(R.rankByRatio.name) +
            '</b>，但这一段落后面背再多词也读不顺，等级封顶在 <b>' + esc(R.rank.k) + '</b>。' +
            '<b>先把最高频词补齐</b>，等级会立刻上去。</div>'
          : ''
      });
  }

  /* 评级阶梯：把同一套比例换算成当前词库的绝对词数 */
  function ladderHTML(R) {
    var rows = A.RANKS.map(function (r, i) {
      var upper = i === 0 ? null : A.RANKS[i - 1].min;
      var range = upper
        ? pct1(r.min) + ' ~ ' + pct1(upper)
        : '≥ ' + pct1(r.min);
      var wl = wordsFor(r.min, R.total);
      var wh = upper ? wordsFor(upper, R.total) : null;
      var wordRange = wh ? n(wl) + ' ~ ' + n(wh) + ' 词' : '≥ ' + n(wl) + ' 词';
      var cur = r === R.rank;
      var reached = R.ratio >= r.min;
      return tpl(
        '<div class="rpt-rk{tone}">' +
          '<span class="rpt-rk-k">{k}</span>' +
          '<span class="rpt-rk-n">{name}</span>' +
          '<span class="rpt-rk-r">{range}</span>' +
          '<span class="rpt-rk-w">{wordRange}</span>' +
          '<span class="rpt-rk-s">{state}</span>' +
        '</div>',
        {
          tone: (cur ? ' cur tone-' + r.tone : '') + (reached ? ' reached' : ''),
          k: esc(r.k), name: esc(r.name), range: range, wordRange: wordRange,
          state: cur ? '<b>当前</b>' : (reached ? '已过' : '')
        });
    }).join('');

    var refs = R.refs.map(function (x) {
      return tpl('<div class="rpt-ref"><span>{label}</span><small>{note}（{words} 词）</small></div>',
        { label: x.label, note: x.note, words: n(wordsFor(x.p, R.total)) });
    }).join('');

    return '<div class="sec-title">评级阶梯<span class="line"></span><span class="tiny">' +
        '同一套比例，按当前词库 ' + n(R.total) + ' 词换算</span></div>' +
      '<div class="card rpt-ladder">' + rows +
        '<div class="rpt-refs">' + refs + '</div>' +
      '</div>';
  }

  /* 与上一轮对比 —— 多轮检测真正的价值所在：单轮只看得到"现在是多少"，
     两轮才能看出"哪些是真学会了、哪些背了又忘"。 */
  function compareHTML(R) {
    var d = A.roundDiff();
    if (!d) return '';

    if (d.stale) {
      return '<div class="sec-title">与上一轮对比<span class="line"></span></div>' +
        '<div class="card tiny" style="line-height:1.9">上一轮（第 ' + d.prev.n + ' 轮）的逐词快照和当前词表版本对不上，' +
        '只能比总体：那次 <b>' + esc(d.prev.rank) + ' ' + esc(d.prev.rankName) + ' · ' + n(d.prev.loose) + ' 词</b>，' +
        '本轮 <b>' + esc(R.rank.k) + ' ' + esc(R.rank.name) + ' · ' + n(R.loose) + ' 词</b>。</div>';
    }

    var dv = R.loose - d.prev.loose;
    var dvTxt = (dv > 0 ? '+' : '') + n(dv);
    var dvCls = dv > 0 ? 'up' : dv < 0 ? 'down' : 'flat';
    var prevRankObj = null;
    for (var pi = 0; pi < A.RANKS.length; pi++) if (A.RANKS[pi].k === d.prev.rank) prevRankObj = A.RANKS[pi];
    // RANKS 从好到差排列，序号变大 = 退步
    var rankUp = prevRankObj ? A.RANKS.indexOf(prevRankObj) > A.RANKS.indexOf(R.rank) : false;

    var keep = d.keepRate === null ? '—' : pct1(d.keepRate);
    var forgot = d.forgottenCount;
    // 词库换了（四级↔六级）时词汇量/掌握率不可直接比：分母都不一样。
    // 但"保持率 / 新学会 / 背了又忘"是逐词结论，跟词库无关，照样有效。
    var sameBank = d.prev.bank === R.bank.key;
    var chips = d.forgotten.slice(0, 24).map(function (i) {
      var w = A.WORDS[i];
      return '<span class="fc" title="' + esc(w.t) + '">' + esc(w.w) + '</span>';
    }).join('');

    var head = sameBank
      ? '<div class="rpt-cmp-grid">' +
          '<div class="rpt-cmp-cell"><small>等级</small>' +
            '<b>' + esc(d.prev.rank) + '</b><i>→</i><b class="' + (rankUp ? 'up' : 'flat') + '">' + esc(R.rank.k) + '</b>' +
            '<em>' + esc(R.rank.name) + '</em></div>' +
          '<div class="rpt-cmp-cell"><small>词汇量</small>' +
            '<b>' + n(d.prev.loose) + '</b><i>→</i><b class="up">' + n(R.loose) + '</b>' +
            '<em class="' + dvCls + '">' + dvTxt + ' 词</em></div>' +
          '<div class="rpt-cmp-cell"><small>掌握率</small>' +
            '<b>' + pct1(d.prev.ratio) + '</b><i>→</i><b class="up">' + pct1(R.ratio) + '</b>' +
            '<em class="' + dvCls + '">' + (R.ratio - d.prev.ratio >= 0 ? '+' : '') +
            ((R.ratio - d.prev.ratio) * 100).toFixed(1) + ' pt</em></div>' +
        '</div>'
      : '<div class="rpt-cmp-warn">上一轮测的是 <b>' + esc(d.prev.bankName) + '大纲</b>，这一轮是 <b>' +
          esc(R.bank.name) + '大纲</b>，两个词库的分母不同，<b>词汇量和掌握率不能直接比</b>。' +
          '下面的保持率 / 新学会 / 背了又忘是逐词结论，与词库无关，仍然有效。</div>';

    return '<div class="sec-title">与第 ' + d.prev.n + ' 轮对比<span class="line"></span>' +
        '<span class="tiny">上轮完成于 ' + A.fmtDate(d.prev.finishedAt) + '</span></div>' +
      '<div class="card rpt-cmp">' +
        head +
        '<div class="rpt-cmp-stats">' +
          '<span><b>' + keep + '</b>保持率<i>上轮认识的词这轮还记得</i></span>' +
          '<span><b class="up">' + n(d.gained) + '</b>新学会<i>上轮不会 / 模糊 → 这轮认识</i></span>' +
          '<span><b class="' + (forgot ? 'down' : 'flat') + '">' + n(forgot) + '</b>背了又忘<i>上轮认识 → 这轮模糊或不认识</i></span>' +
        '</div>' +
        (forgot
          ? '<div class="rpt-forgot">' +
              '<div class="rpt-forgot-h"><b>复习优先看这些</b>' +
                '<small>上轮认识、这轮却拿不准了 —— 比背新词更该先补</small></div>' +
              '<div class="rpt-fchips">' + chips + (forgot > d.forgotten.length ? '<span class="fc more">+' + (forgot - d.forgotten.length) + '</span>' : '') + '</div>' +
              '<button class="btn sm" data-act="rpt-review-forgot">复测这 ' + n(forgot) + ' 个词</button>' +
            '</div>'
          : '<div class="tiny" style="margin-top:14px">上一轮认识的词这轮都没有退步，保持得很好。</div>') +
      '</div>';
  }

  /* 历轮报告：每轮一行的归档清单，点开看当轮详情 */
  function historyHTML() {
    var rs = A.roundHistory();
    if (!rs.length) return '';
    var rows = rs.slice().reverse().map(function (r, idx) {
      var prev = rs[rs.length - 1 - idx - 1];       // 时间上的上一轮
      var dv = prev ? r.loose - prev.loose : null;
      return tpl(
        '<button class="rpt-hrow tone-{tone}" data-act="round-detail" data-n="{n}" title="{tip}">' +
          '<span class="rpt-hrow-n">第 {n} 轮</span>' +
          '<span class="rpt-hrow-k">{k}</span>' +
          '<span class="rpt-hrow-name">{name}</span>' +
          '<span class="rpt-hrow-v">{loose}<i>词</i></span>' +
          '<span class="rpt-hrow-d">{d}</span>' +
          '<span class="rpt-hrow-t">{date}</span>' +
        '</button>',
        {
          tone: r.rankTone || 'warn', n: r.n, k: esc(r.rank), name: esc(r.rankName),
          loose: n(r.loose),
          d: dv === null ? '' : ((dv > 0 ? '+' : '') + n(dv)),
          date: A.fmtDate(r.finishedAt),
          tip: esc(r.bankName + '大纲 · 完成于 ' + A.fmtDate(r.finishedAt) + ' · 已测 ' + r.tested + ' / ' + r.bankSize + ' 词')
        });
    }).join('');

    return '<div class="sec-title">历轮报告<span class="line"></span>' +
        '<span class="tiny">共 ' + rs.length + ' 轮 · 点开看当轮详情</span></div>' +
      '<div class="card rpt-hlist">' + rows + '</div>';
  }

  /* 归档轮次的详情弹窗 */
  function roundDetail(r) {
    var bands = (r.bands || []).slice().sort(function (a, b) { return A.freqRank(a.band) - A.freqRank(b.band); });
    var rows = bands.map(function (b) {
      var sc = b.k + 0.5 * b.f, p = b.N ? Math.round(sc / b.N * 100) : 0;
      var col = p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--bad)';
      return '<div class="rpt-brow">' +
        '<div class="rpt-bname">' + esc(A.BAND_NAMES[b.band] || ('频段 ' + b.band)) + '</div>' +
        '<div class="rpt-bstat"><div class="rpt-bbar"><i style="width:' + Math.max(2, p) + '%;background:' + col + '"></i></div>' +
        '<span class="rpt-bnum">' + p + '%</span></div>' +
        '<div class="rpt-bgap">缺 ' + Math.round(b.N - sc) + ' 词</div></div>';
    }).join('');

    return '<div class="tiny" style="margin:8px 0 14px">' +
        A.fmtDate(r.finishedAt) + ' · ' + esc(r.bankName) + '大纲 ' + n(r.bankSize) + ' 词 · ' +
        '覆盖 ' + pct1(r.coverage) + '</div>' +
      '<div class="rpt-cmp-grid" style="margin-bottom:14px">' +
        '<div class="rpt-cmp-cell"><small>等级</small><b>' + esc(r.rank) + '</b><em>' + esc(r.rankName) + '</em></div>' +
        '<div class="rpt-cmp-cell"><small>词汇量</small><b>' + n(r.loose) + '</b><em>严格 ' + n(r.strict) + '</em></div>' +
        '<div class="rpt-cmp-cell"><small>掌握率</small><b>' + pct1(r.ratio) + '</b><em>' +
          '认识 ' + n(r.k) + ' · 模糊 ' + n(r.f) + '</em></div>' +
      '</div>' +
      '<div class="rpt-btable" style="padding:0">' + rows + '</div>';
  }
  function depthHTML(R) {
    var k = R.k, f = R.f, u = R.u, tot = R.total || 1;
    var bars = [
      { cls: 'ok', w: k / tot, label: '认识', v: k },
      { cls: 'mid', w: f / tot, label: '模糊', v: f },
      { cls: 'no', w: u / tot, label: '不认识', v: u }
    ].map(function (b) {
      return tpl('<i class="{cls}" style="width:{w}%" title="{label} {v} 词"></i>',
        { cls: b.cls, w: (b.w * 100).toFixed(3), label: b.label, v: n(b.v) });
    }).join('');

    var fs = R.fuzzyShare;
    var note;
    if (fs >= 0.4) {
      note = '你「有印象」的词里有 <b>' + pct1(fs) + '</b> 只是模糊——这是虚高的主要来源。' +
        '这些词在考场上很可能是丢分点，建议优先把它们从「模糊」推到「认识」，比背新词划算。';
    } else if (fs >= 0.2) {
      note = '模糊词占「有印象」的 <b>' + pct1(fs) + '</b>，属于正常范围；' +
        '如果目标是考试，重点看这些词的搭配与词性，别只记中文释义。';
    } else {
      note = '模糊词只占 <b>' + pct1(fs) + '</b>，说明你掌握得比较扎实——这是比词汇量更能说明水平的信号。';
    }

    return '<div class="sec-title">掌握深度<span class="line"></span><span class="tiny">' +
        '「认识」和「模糊」分开算，才看得出词汇量有没有水分</span></div>' +
      '<div class="card">' +
        '<div class="rpt-stack">' + bars + '</div>' +
        '<div class="rpt-stack-legend">' +
          '<span><i class="ok"></i>认识 ' + n(k) + ' 词</span>' +
          '<span><i class="mid"></i>模糊 ' + n(f) + ' 词</span>' +
          '<span><i class="no"></i>不认识 ' + n(u) + ' 词</span>' +
        '</div>' +
        '<div class="rpt-2col">' +
          '<div class="rpt-kv"><b>' + n(R.loose) + '</b><small>折中口径（模糊算一半）</small></div>' +
          '<div class="rpt-kv"><b>' + n(R.strict) + '</b><small>严格口径（只算认识）</small></div>' +
        '</div>' +
        '<div class="tiny" style="margin-top:12px;line-height:1.8">' + note + '</div>' +
      '</div>';
  }

  /* 频段逐段表：这是"提升到哪"的唯一依据 */
  function bandsHTML(R) {
    var rows = R.bands.map(function (r) {
      var p = Math.round(r.ratio * 100);
      var col = p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--bad)';
      var hot = R.gainTop.some(function (g) { return g.band === r.band; });
      return tpl(
        '<div class="rpt-brow{hot}">' +
          '<div class="rpt-bname">{name}{tag}</div>' +
          '<div class="rpt-bstat"><div class="rpt-bbar"><i style="width:{w}%;background:{col}"></i></div>' +
            '<span class="rpt-bnum">{p}%</span></div>' +
          '<div class="rpt-bgap">{gap}</div>' +
          '<div class="rpt-bmeta">全段 {N} 词 · 认识 {k} · 模糊 {f} · 不认识 {u}</div>' +
        '</div>',
        {
          hot: hot ? ' hot' : '', name: esc(r.name),
          tag: hot ? '<em>优先</em>' : '',
          w: Math.max(2, p), col: col, p: p,
          gap: r.deficit > 0 ? ('缺 ' + n(r.deficit) + ' 词') : '已满',
          N: n(r.N), k: n(r.k), f: n(r.f), u: n(r.u)
        });
    }).join('');

    return '<div class="sec-title">逐频段掌握情况<span class="line"></span><span class="tiny">' +
        '全部来自实测作答，不是抽样估计</span></div>' +
      '<div class="card rpt-btable">' +
        '<div class="rpt-bhead"><span>频段</span><span>掌握率</span><span>缺口</span></div>' +
        rows +
      '</div>';
  }

  /* 提升路径：把缺口翻成"补多少、花多久、先补哪" */
  function planHTML(R) {
    var items = R.gainTop.map(function (g, i) {
      var days = Math.ceil(g.deficit / R.perDay);
      return tpl(
        '<li class="rpt-step">' +
          '<span class="rpt-step-n">{i}</span>' +
          '<div class="rpt-step-b">' +
            '<b>{name} 段</b> 还差 <b>{d} 词</b>' +
            '<small>掌握率 {p}% · 每天 {per} 词约需 {days} 天</small>' +
          '</div>' +
          '<button class="btn sm" data-act="rpt-review" data-band="{band}">复测这段</button>' +
        '</li>',
        { i: i + 1, name: esc(g.name), d: n(g.deficit), p: Math.round(g.ratio * 100),
          per: R.perDay, days: days, band: g.band });
    }).join('');

    var baseNote = R.baseGap > 0
      ? '<div class="tiny" style="margin-top:12px">另外：<b>最高频 2k 段</b>里还有 <b>' + n(R.baseGap) +
        ' 词</b>没拿下。这些词出现频率最高，补它们对阅读速度的收益比补冷门词大得多，建议排在最前面。</div>'
      : '<div class="tiny" style="margin-top:12px">最高频 2k 段已经全部拿下，地基是稳的。</div>';

    var why = '<div class="tiny" style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--line2);line-height:1.8">' +
      '<b>为什么不是按缺口大小排？</b>一个词的价值和它出现的频率大致成正比。' +
      '10k-20k 段可能缺得最多，但那些词一年也遇不上几次；最高频段缺几个词，却是每次阅读都会撞上的。' +
      '所以这里按 <b>缺口词数 × 词频权重</b> 排序（最高频 1k 段权重 1，逐段递减到 20k 以外的 0.02）。' +
      '</div>';

    return '<div class="sec-title">提升路径<span class="line"></span><span class="tiny">' +
        '按「缺口 × 词频权重」排序，不是按缺口绝对值</span></div>' +
      '<div class="card">' +
        (items ? '<ol class="rpt-steps">' + items + '</ol>' : '<div class="tiny">各频段都已掌握，暂时没有缺口。</div>') +
        baseNote + why +
        '<div class="row" style="margin-top:14px;flex-wrap:wrap;gap:8px">' +
          '<button class="btn primary" data-act="rpt-review" data-band="all">复测全部缺口词</button>' +
          '<button class="btn" data-act="export-csv">导出缺口词表（CSV）</button>' +
          '<button class="btn ghost" data-act="rpt-copy">复制报告文本</button>' +
        '</div>' +
      '</div>';
  }

  function footnoteHTML(R) {
    return '<div class="card tiny rpt-note" style="line-height:1.9">' +
      '<b>口径说明</b><br>' +
      '· 掌握率 = （认识 + 模糊 × 0.5）÷ 词库词数；严格口径只算「认识」。<br>' +
      '· 等级按<b>当前词库的掌握率</b>换算，所以四级（' + n(R.bank.key === 'c4' ? R.total : A.bankCounts().c4) +
        ' 词）和六级（' + n(R.bank.key === 'c6' ? R.total : A.bankCounts().c6) + ' 词）的同一等级对应不同词数。<br>' +
      '· 阶梯上的 95% / 98% 是二语阅读研究里常用的文字覆盖率参考线，不是及格线；等级线是本工具自定的。<br>' +
      '· 本词库上限 ' + n(R.total) + ' 词，<b>超出部分无法评估</b>——报告不外推到你没词可测的范围。<br>' +
      '· 数据只存在这台浏览器里，换设备不会同步。' +
      '</div>';
  }

  /* ---------- 左侧信息栏 + 右上等级印章 ----------
     两侧放大屏会显得空，但填进去的东西必须有意义：
     左边是「报告入口 + 本轮进度」，右边是「等级印章」，右下是桌宠。
     全部读 A.levelReport()，和报告页同一个数据源，不会出现两套数字。 */
  var railBound = false;
  var RING_LEN = 119.4;      // 2πr，r=19

  A.renderRail = function () {
    var rail = document.getElementById('rail');
    var seal = document.getElementById('seal');
    if (!rail && !seal) return;
    var R = A.levelReport();

    // 进度环
    var ring = document.getElementById('railRing');
    var pct = document.getElementById('railPct');
    var cov = document.getElementById('railCov');
    if (ring) ring.style.strokeDashoffset = (RING_LEN * (1 - Math.min(1, R.coverage))).toFixed(2);
    if (pct) pct.textContent = Math.round(R.coverage * 100) + '%';
    if (cov) cov.textContent = '已测 ' + n(R.tested) + ' 词';

    // 等级印章
    var sealIn = document.getElementById('sealIn');
    var sealNote = document.getElementById('sealNote');
    if (seal) {
      seal.className = 'seal' + (R.ready ? ' ready tone-' + R.rank.tone : ' locked');
      seal.setAttribute('aria-label', R.ready
        ? ('词汇等级 ' + R.rank.k + ' ' + R.rank.name + '，点击查看报告')
        : ('词汇等级待评定，当前完成 ' + Math.round(R.coverage * 100) + '%，点击查看进度'));
    }
    if (sealIn) sealIn.textContent = R.ready ? R.rank.k : Math.round(R.coverage * 100);
    if (sealNote) {
      sealNote.textContent = R.ready
        ? (R.rank.name + (R.nextRank ? ' · 差 ' + n(R.toNext) + ' 词' : ' · 已到顶'))
        : (R.bank.name + ' ' + n(R.tested) + '/' + n(R.total));
    }

    // 报告页上不再显示信封（避免"点开自己在看的东西"）
    var mail = document.getElementById('mail');
    if (mail) mail.style.display = (A.getRoute && A.getRoute() === 'report') ? 'none' : '';

    if (!railBound) {
      railBound = true;
      var goR = function (r) { return function () { A.go(r); }; };
      var rp = document.getElementById('railProg');
      var sl = document.getElementById('seal');
      if (rp) { rp.addEventListener('click', goR('groups')); }
      if (sl) { sl.addEventListener('click', goR('report')); }
    }
  };

  /* ---------- 纯文本版（复制分享用） ----------
     注意：不能叫 A.reportText —— 那是 part3 里「本次成绩」的文本，重名会被覆盖。 */
  A.levelReportText = function () {
    var R = A.levelReport();
    var L = [];
    L.push('【' + R.bank.name + '词汇等级评估】' + A.fmtDate(Date.now()));
    if (!R.ready) {
      L.push('尚未测完：已测 ' + R.tested + ' / ' + R.total + ' 词（' + pct1(R.coverage) + '），暂不评级。');
      return L.join('\n');
    }
    L.push('等级：' + R.rank.k + ' ' + R.rank.name + '（掌握率 ' + pct1(R.ratio) + '）');
    if (R.cap && R.cap !== R.rankByRatio) {
      L.push('（地基约束：最高频 1k 段只掌握 ' + pct1(R.capBandRatio) + '，按比例本可评 ' +
        R.rankByRatio.k + ' ' + R.rankByRatio.name + '，等级已封顶）');
    }
    L.push('词汇量：折中口径 ' + R.loose + ' 词 / 严格口径 ' + R.strict + ' 词（词库 ' + R.total + ' 词）');
    L.push('作答分布：认识 ' + R.k + ' · 模糊 ' + R.f + ' · 不认识 ' + R.u);
    if (R.nextRank) L.push('到 ' + R.nextRank.k + ' ' + R.nextRank.name + ' 还差 ' + R.toNext + ' 词');
    var bands = R.bands.filter(function (r) { return r.N > 0; });
    if (bands.length) {
      L.push('逐频段：' + bands.map(function (r) {
        return r.name + ' ' + Math.round(r.ratio * 100) + '%（缺 ' + r.deficit + ' 词）';
      }).join(' / '));
    }
    if (R.gainTop.length) {
      L.push('优先补：' + R.gainTop.map(function (g) { return g.name + '（' + g.deficit + ' 词）'; }).join('、'));
    }
    L.push('（由「四六级词汇量检测」生成，数据仅存本机）');
    return L.join('\n');
  };

  /* ---------- 左侧悬浮信封 ---------- */
  var mailBound = false;

  A.renderMail = function () {
    var m = document.getElementById('mail');
    if (!m) return;
    var R = A.levelReport();
    var seal = document.getElementById('mailSeal');
    var tag = document.getElementById('mailTag');
    if (seal) {
      // 未解锁时蜡封显示覆盖率，解锁后显示等级字母
      seal.textContent = R.ready ? R.rank.k : Math.round(R.coverage * 100);
      seal.className = 'mail-seal' + (R.ready ? ' tone-' + R.rank.tone : ' locked');
      seal.setAttribute('aria-hidden', 'true');
    }
    if (tag) {
      tag.textContent = R.ready ? (R.rank.name + ' · 看报告') : '等级评估报告';
    }
    m.classList.toggle('ready', R.ready);
    m.setAttribute('aria-label', R.ready
      ? ('词汇等级 ' + R.rank.k + ' ' + R.rank.name + '，点击查看完整报告')
      : ('词汇报告尚未解锁，' + R.bank.name + '已测 ' + Math.round(R.coverage * 100) + '%，点击查看进度'));
    m.style.display = (A.getRoute && A.getRoute() === 'report') ? 'none' : '';

    if (!mailBound) {
      mailBound = true;
      var open = function () { A.go('report'); };
      m.addEventListener('click', open);
      m.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    }
  };

  /* ---------- 报告页专用动作 ----------
     part3 的全局 click 委托只处理它自己认识的 data-act（未知动作静默跳过），
     所以这里单独挂一个，互不干扰。 */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');

    if (act === 'rpt-copy') {
      e.preventDefault();
      A.copyText(A.levelReportText());
      return;
    }
    if (act === 'rpt-review-forgot') {
      e.preventDefault();
      var fd = A.roundDiff();
      if (!fd || fd.stale || !fd.forgottenIdx.length) { A.toast('没有需要复习的词'); return; }
      A.startSession('list', {
        list: fd.forgottenIdx.slice(),
        label: '复测「背了又忘」· ' + fd.forgottenIdx.length + ' 词'
      });
      return;
    }
    if (act === 'round-detail') {
      e.preventDefault();
      var no = +t.getAttribute('data-n');
      var rs = A.roundHistory();
      for (var k = 0; k < rs.length; k++) {
        if (rs[k].n === no) {
          A.modal('<b>第 ' + no + ' 轮报告</b>' + roundDetail(rs[k]) +
            '<div class="row" style="margin-top:14px"><button class="btn primary grow" data-act="modal-close">好</button></div>');
          return;
        }
      }
      return;
    }
    if (act === 'rpt-review') {
      e.preventDefault();
      var band = t.getAttribute('data-band');
      var pool = A.activePool();
      var want = [];
      for (var i = 0; i < pool.length; i++) {
        var s = A.getSt(pool[i]);
        if (s !== 0 && s !== 1) continue;
        if (band !== 'all' && String(A.bandOf(pool[i])) !== String(band)) continue;
        want.push(pool[i]);
      }
      if (!want.length) { A.toast('这段没有缺口词了'); return; }
      // 一次最多 400 词，多了就先测最靠前的（词库本身就是按频段排过的）
      var cap = 400;
      var list = want.slice(0, cap);
      A.startSession('list', {
        list: list,
        label: '复测缺口词 · ' + (band === 'all' ? '全部' : (A.BAND_NAMES[+band] || '该频段')) +
          ' ' + list.length + ' 词' + (want.length > cap ? '（共 ' + want.length + '，先测前 ' + cap + '）' : '')
      });
    }
  });

})(window.__APP__ || (window.__APP__ = {}));
