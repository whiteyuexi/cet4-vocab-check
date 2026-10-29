/* ============ 第四部分：AI 诊断面板 ============ */
(function (A) {
  'use strict';

  var tpl = A.tpl, esc = A.esc, el = A.el, S = A.S;

  /* 打开 index.html 时后端在 127.0.0.1:8787；由后端托管时用同源地址 */
  function apiBase() {
    var p = location.protocol;
    return (p === 'http:' || p === 'https:') ? '' : 'http://127.0.0.1:8787';
  }
  A.apiBase = apiBase;

  /* ---------- 把当前状态整理成诊断上下文（只发汇总数据，不发逐题原始作答） ---------- */
  A.buildAIContext = function () {
    var pool = A.activePool();
    var t = A.tally(pool);
    var es = A.estimateNow();
    var prof = A.bandProfile();

    var bands = prof.rows.filter(function (r) { return r.N > 0; }).map(function (r) {
      return { name: A.BAND_NAMES[r.band] || ('频段 ' + r.band), p: r.p, N: r.N, n: r.n };
    });

    /* 未掌握词：优先取最近一次检测里的，其次取全库的 */
    var weakIdx = [];
    var lg = S.lastResult ? S.lastResult.log : [];
    lg.forEach(function (e) { if (e.v !== 2) weakIdx.push(e.i); });
    if (!weakIdx.length) {
      weakIdx = pool.filter(function (i) { var s = A.getSt(i); return s === 0 || s === 1; }).slice(0, 80);
    }
    var weak = weakIdx.slice(0, 80).map(function (i) {
      var st = A.getSt(i);
      return {
        w: A.WORDS[i].w,
        t: A.WORDS[i].t,
        band: A.BAND_NAMES[A.bandOf(i)] || '',
        status: st === 0 ? '不认识' : st === 1 ? '模糊' : '认识'
      };
    });

    var interval = null;
    if (es.kind === 'sample') interval = [es.lo, es.hi];
    else if (es.kind === 'full') interval = [es.vocab, es.vocab];

    return {
      bankName: A.bankName(),
      bankSize: t.total,
      tested: t.tested,
      looseVocab: es.kind === 'none' ? null : es.looseVocab,
      strictVocab: es.kind === 'none' ? null : es.strictVocab,
      interval: interval,
      sampleSize: es.n || 0,
      estimateNote: es.kind === 'sample'
        ? ('基于最近一次 ' + es.n + ' 词分层抽样，精度 ±' + (es.hi - es.lo) / 2 + ' 词')
        : (es.kind === 'full' ? '词库已覆盖 95% 以上，接近实测值' : '尚无随机抽样，无法给出带误差的估算'),
      bands: bands,
      weakWords: weak,
      availableBanks: Object.keys(A.BANKS).map(function (k) { return A.BANKS[k].name; })
    };
  };

  /* ---------- 轻量 Markdown 渲染（只支持粗体、列表、换行） ---------- */
  function renderMD(text) {
    var s = esc(text);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    var blocks = s.split(/\n{2,}/);
    return blocks.map(function (b) {
      var lines = b.split('\n');
      if (lines.length > 1 && lines.every(function (l) { return /^\s*[-·•]/.test(l) || !l.trim(); })) {
        return '<ul>' + lines.filter(function (l) { return l.trim(); })
          .map(function (l) { return '<li>' + l.replace(/^\s*[-·•]\s*/, '') + '</li>'; }).join('') + '</ul>';
      }
      return '<p>' + lines.join('<br>') + '</p>';
    }).join('');
  }
  A.renderMD = renderMD;

  /* ---------- 面板 HTML ---------- */
  var PRESETS = [
    '我现在该怎么提升？重点补哪里？',
    '帮我排一个 7 天复习计划',
    '我的薄弱点具体在哪？',
    '还剩 20 天考试，来得及吗？'
  ];

  // 鲸鱼娘的「白饭」：这轮诊断烧掉多少 token。既是彩蛋也是 API 成本透明
  function tokensLine() {
    var t = A.S.tokens || 0;
    if (!t) return '跑一次诊断会消耗一些 token —— 这只会算给你看，吃了多少一目了然。';
    return '这只鲸鱼娘累计吃掉 <b>' + t.toLocaleString('en-US') + '</b> 个 token' +
      (A.S.lastTokens ? '（最近一次 ' + A.S.lastTokens.toLocaleString('en-US') + '）' : '') + '。';
  }
  A.tokensLine = tokensLine;

  A.aiCardHTML = function () {
    var h = '';
    h += '<div class="sec-title">AI 诊断教练<span class="line"></span><span class="tiny">基于你的真实数据作答</span></div>';
    h += '<div class="card ai-card">';
    h += '<div class="tiny" style="margin-bottom:10px">把你的检测结果交给 AI 分析，它会指出薄弱频段并给出可执行的补强计划。' +
      '只发送汇总数据（覆盖率、频段掌握率、未掌握词清单），逐题作答记录不出本机。</div>';
    h += '<div class="presets ai-presets">';
    PRESETS.forEach(function (q, i) {
      h += tpl('<button data-act="ai-ask" data-q="{q}">{q}</button>', { q: esc(q) });
    });
    h += '</div>';
    h += '<div class="row" style="margin-top:12px;gap:8px">' +
      '<input class="search" id="aiInput" placeholder="也可以直接输入你的问题，例如：我该怎么安排最后两周？">' +
      '<button class="btn primary" data-act="ai-send">开始诊断</button></div>';
    h += '<div class="tiny" id="aiTokens" style="margin-top:9px">' + tokensLine() + '</div>';
    h += '</div>';
    return h;
  };

  /* ---------- 对话弹层 ---------- */
  /* 对话历史（仅存于内存，关闭即清空；不上传原始作答） */
  var AI_HISTORY = [];
  A.resetAIHistory = function () { AI_HISTORY = []; };

  /* 把工具返回的数据渲染成可读的"依据"面板，让结论可核对 */
  function evidenceHTML(list) {
    if (!list || !list.length) return '';
    var h = '<details class="ai-ev"><summary>查看 AI 依据的原始数据（' + list.length + ' 项）</summary>';
    list.forEach(function (t) {
      var r = t.result || {};
      h += '<div class="ai-ev-item"><b>' + esc(t.label) + '</b>';
      if (t.name === 'get_profile') {
        h += '<table class="ai-ev-tb">';
        h += '<tr><td>词库</td><td>' + esc(r.bank || '') + '（' + (r.bankSize || 0) + ' 词）</td></tr>';
        h += '<tr><td>已测 / 覆盖</td><td>' + (r.tested || 0) + ' 词 / ' + (r.coverage || 0) + '%</td></tr>';
        if (r.interval) h += '<tr><td>词汇量估算</td><td>' + (r.looseVocab || '?') + ' 词（区间 ' + r.interval[0] + '~' + r.interval[1] + '）</td></tr>';
        if (r.strictVocab) h += '<tr><td>严格口径</td><td>' + r.strictVocab + ' 词（只算"认识"）</td></tr>';
        if (r.sampleSize) h += '<tr><td>抽样规模</td><td>' + r.sampleSize + ' 词</td></tr>';
        h += '</table>';
      } else if (t.name === 'get_band_profile') {
        h += '<table class="ai-ev-tb">';
        (r.bands || []).forEach(function (b) {
          h += '<tr><td>' + esc(b.band) + '</td><td>' + (b.mastery === null ? '无数据' : b.mastery + '%') +
            '</td><td class="dim">' + b.total + ' 词 / 抽 ' + b.sampled + '</td></tr>';
        });
        h += '</table>';
      } else if (t.name === 'get_weak_words') {
        h += '<div class="ai-ev-words">' + (r.words || []).map(function (w) {
          return '<span class="ai-word">' + esc(w.word) + '</span>';
        }).join('') + '</div>';
        if (r.count > (r.words || []).length) h += '<div class="dim small">共 ' + r.count + ' 个，此处列出前 ' + (r.words || []).length + ' 个</div>';
      } else {
        h += '<pre class="ai-ev-pre">' + esc(JSON.stringify(r, null, 1)) + '</pre>';
      }
      h += '</div>';
    });
    h += '</details>';
    return h;
  }

  /* ---------- 反向联动：带着"用户正在看的那块图"去问 AI ----------
     地图的一格、某一段频段，本身就是用户眼前的图。让他点一下就能带着这格的真实数字提问，
     比让人自己复述"最高频段那一片"强得多——这也是"AI 分析"与"可视化"真正接上的地方。 */
  var AI_FOCUS = null;          // 当前提问附带的图表上下文
  var AI_ACTIONS = [];          // 当前回答附带的、可点击的下一步
  var PENDING_ACTIONS = null;   // 流式过程中收到的动作，等 done 再渲染

  function bandNameOf(b) { return (A.BAND_NAMES || [])[b] || ('频段 ' + b); }

  A.focusForCell = function (band, letter) {
    var m = null, c = null;
    try { m = A.vocabMap(); } catch (e) { m = null; }
    if (m) {
      for (var r = 0; r < m.rows.length && !c; r++) {
        if (m.rows[r].band !== band) continue;
        for (var i = 0; i < m.rows[r].cells.length; i++) {
          if (m.rows[r].cells[i].letter === letter) { c = m.rows[r].cells[i]; break; }
        }
      }
    }
    var sample = [];
    try {
      sample = (A.mapCellWords ? A.mapCellWords(band, letter) : []).slice(0, 5)
        .map(function (idx) { return A.WORDS[idx].w; });
    } catch (e) {}
    return {
      type: 'cell', band: band, letter: letter,
      label: bandNameOf(band) + ' · 首字母 ' + letter,
      N: c ? c.N : 0, tested: c ? c.tested : 0,
      gap: c ? c.gap : 0, untested: c ? c.untested : 0,
      ratio: c ? Math.round(c.ratio * 100) : null, words: sample
    };
  };

  A.focusForBand = function (band) {
    var row = null;
    try {
      var prof = A.bandProfile();
      prof.rows.forEach(function (r) { if (r.band === band) row = r; });
    } catch (e) {}
    return {
      type: 'band', band: band, label: bandNameOf(band) + ' 段',
      N: row ? row.N : 0, n: row ? row.n : 0,
      p: row && row.p !== null ? Math.round(row.p * 100) : null
    };
  };

  A.focusForMap = function () {
    var m = null;
    try { m = A.vocabMap(); } catch (e) { m = null; }
    return {
      type: 'map',
      label: '整张词汇地图',
      hot: m ? m.hot.map(function (c) {
        return { cell: c.name + ' · ' + c.letter, N: c.N, tested: c.tested, gap: c.gap, untested: c.untested };
      }) : [],
      testedCells: m ? m.testedCells : 0,
      untestedCells: m ? m.untestedCells : 0
    };
  };

  /* 把聚焦对象翻译成"人话说给模型听"的问题。
     里面的数字标注为「界面显示」——它们来自本机统计，是可核对的（Prompt 里也为此开了口子）。 */
  function questionFromFocus(f) {
    if (!f) return '帮我看看我的数据';
    if (f.type === 'cell') {
      return '我想弄明白词汇地图上「' + f.label + '」这一格。界面显示：共 ' + f.N + ' 词，测过 ' + f.tested +
        ' 词，测过却没掌握 ' + f.gap + ' 词，完全没测 ' + f.untested + ' 词' +
        (f.ratio !== null ? '，这一格掌握率 ' + f.ratio + '%' : '') +
        (f.words && f.words.length ? '（缺口词举例：' + f.words.slice(0, 5).join('、') + '）' : '') +
        '。这一格为什么薄？先补哪些词、怎么补？';
    }
    if (f.type === 'band') {
      return '我想弄清「' + f.label + '」。界面显示：全段 ' + f.N + ' 词，抽到 ' + f.n + ' 词' +
        (f.p !== null ? '，掌握率 ' + f.p + '%' : '，还没有抽样数据') + '。这一段该怎么补？';
    }
    if (f.type === 'map') {
      var s = (f.hot || []).map(function (h) {
        return h.cell + '（共 ' + h.N + ' 词，缺口 ' + h.gap + '、未测 ' + h.untested + '）';
      }).join('；');
      return '看我的词汇地图：已测格子 ' + f.testedCells + ' 个，完全没测 ' + f.untestedCells + ' 个。' +
        (s ? '缺口最大的三块是：' + s + '。' : '') + '我该从哪一块开始补？';
    }
    return '帮我看看我的数据';
  }

  /* ---------- 结构化动作：把"AI 的建议"变成"能点的按钮" ----------
     白名单执行：只认 go / start / review / ask 四种，参数一律重新校验，
     模型给出的任何字符串都不会被当成代码或路径执行。 */
  var ACT_OK = { go: 1, start: 1, review: 1, ask: 1 };

  function normAction(a) {
    if (!a || typeof a !== 'object') return null;
    var act = String(a.act || '');
    if (!ACT_OK[act]) return null;
    var label = String(a.label || '').trim().slice(0, 26);
    if (!label) return null;
    var out = { act: act, label: label };
    if (act === 'go') {
      var r = String(a.route || '');
      if (['home', 'test', 'groups', 'stats', 'report', 'settings'].indexOf(r) < 0) return null;
      out.route = r;
    } else if (act === 'start') {
      var tg = parseInt(a.target, 10);
      out.target = [150, 250, 400].indexOf(tg) >= 0 ? tg : 250;
    } else if (act === 'review') {
      var b = parseInt(a.band, 10);
      if (!(b >= 0 && b <= 6)) return null;
      out.band = b;
      out.letter = /^[A-Z]$/.test(String(a.letter || '')) ? a.letter : 'all';
    } else if (act === 'ask') {
      var q = String(a.q || '').trim().slice(0, 120);
      if (!q) return null;
      out.q = q;
    }
    return out;
  }

  A._normAction = normAction;        // 测试钩子：白名单归一化是安全边界，必须能被断言

  /* 每个按钮绑定自己的动作对象（不是全局下标）。
     第一版用全局数组下标，问第二次时上一组按钮还在，点它会执行**新一组**里的动作——
     这类"看起来没事、点了做错事"的 bug 最难发现，所以干脆让按钮自带动作。 */
  var ACTIONS_BY_ID = {};
  var ACTION_SEQ = 0;

  function renderAiActions(list) {
    AI_ACTIONS = (list || []).map(normAction).filter(Boolean).slice(0, 4);
    if (!AI_ACTIONS.length) return;
    var log = el('aiLog');
    if (!log) return;
    // 新一组动作出现时，把旧的收起来（避免同一屏出现两组含义不同的按钮）
    Array.prototype.forEach.call(log.querySelectorAll('.ai-acts'), function (old) {
      if (old.parentNode) old.parentNode.removeChild(old);
    });
    var wrap = document.createElement('div');
    wrap.className = 'ai-msg ai-acts';
    wrap.innerHTML = '<div class="ai-acts-t">可以接着做：</div>' + AI_ACTIONS.map(function (a) {
      var id = 'a' + (++ACTION_SEQ);
      ACTIONS_BY_ID[id] = a;
      return '<button class="ai-act" data-act="ai-do" data-aid="' + id + '">' + esc(a.label) + '</button>';
    }).join('');
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  }

  A.aiRunAction = function (aid) {
    var a = ACTIONS_BY_ID[aid];
    if (!a) return;
    if (a.act === 'go') { A.closeModal(); A.go(a.route); return; }
    if (a.act === 'start') { A.closeModal(); A.startSession('probe', { target: a.target }); return; }
    if (a.act === 'review') { A.closeModal(); if (A.reviewCell) A.reviewCell(a.band, a.letter); return; }
    if (a.act === 'ask') { A.runAI(a.q, true); return; }
  };

  /* 用作者额度直连：先扣 1 次，扣不到就退回本地方案（额度是"完成检测"换来的，不能白给） */
  function spendThenDirect(box, question, cfg) {
    if (!A.spendAiQuota()) {
      localAnswer(box, question);
      var tip = document.createElement('div');
      tip.className = 'tiny';
      tip.style.marginTop = '8px';
      tip.textContent = '（作者额度已用完，以上为本地方案。完成下一轮整库检测可获得新的深度诊断；' +
        '或在「设置 → AI 与额度」里接入你自己的 API Key，之后不再受额度限制。）';
      box.appendChild(tip);
      return;
    }
    runDirect(box, question, cfg);
    updateQuotaBadge();
  }

  function updateQuotaBadge() {
    var b = el('aiQuotaBadge');
    if (b) b.textContent = A.aiTierLabel();
  }
  /* 离线也要有动作：本地规则诊断同样能给出"复测这一段 / 开一轮摸底 / 看剖面" */
  A.localActions = function () {
    var out = [];
    try {
      var prof = A.bandProfile();
      var rows = prof.rows.filter(function (r) { return r.n > 0 && r.p !== null; })
        .sort(function (a, b) { return a.p - b.p; });
      if (rows.length) {
        out.push({ act: 'review', band: rows[0].band, letter: 'all', label: '复测「' + bandNameOf(rows[0].band) + '」段' });
      }
      var un = (A.untestedWords ? A.untestedWords() : []).length;
      if (un > 0) out.push({ act: 'start', target: 250, label: '再测一轮（±250）' });
      out.push({ act: 'go', route: 'stats', label: '看频段剖面' });
    } catch (e) {}
    return out;
  };

  /* ---------- 三档通路 ----------
     ③ 自带 Key（用户自己的 token，无限次）
     ② 作者额度（作者 Key，完成一次检测换一次）—— 只有在评委版构建里才存在
     ① 本地方案（确定性规则引擎，永远可用、无限次）
     顺序不能反：自带 Key 优先，因为那是用户自己付费、且能问最多的形态。 */
  A.aiTier = function () {
    if (A.S.userKey && A.S.userKey.key) return 'user';
    if (AUTHOR_KEY && A.aiQuota().left > 0) return 'author';
    return 'local';
  };
  A.aiTierLabel = function () {
    var t = A.aiTier();
    if (t === 'user') return '自带 Key · 不限次';
    if (t === 'author') return '作者额度 · 剩 ' + A.aiQuota().left + ' 次';
    return '本地方案 · 不限次';
  };
  /* 用户自带 Key 的读写（只存本机；导出备份时会剔除） */
  A.setUserKey = function (cfg) {
    if (!cfg || !cfg.key) { A.S.userKey = null; A.save(); return false; }
    A.S.userKey = {
      key: String(cfg.key).trim(),
      model: String(cfg.model || 'deepseek-chat').trim(),
      base: String(cfg.base || 'https://api.deepseek.com').replace(/\/$/, '')
    };
    A.save();
    return true;
  };
  A.openAIDialog = function (question, focus) {
    A.modal('<div class="ai-head"><b>AI 诊断教练</b>' +
      '<span class="pill brand" id="aiMode">连接中…</span>' +
      '<span class="pill" id="aiQuotaBadge" style="margin-left:6px"></span></div>' +
      '<div id="aiLockBar"></div>' +
      '<div class="ai-log" id="aiLog"></div>' +
      '<div class="row" style="margin-top:12px;gap:8px">' +
      '<input class="search" id="aiInput2" placeholder="继续追问，例如：那 2k-3k 段要管吗？">' +
      '<button class="btn primary" data-act="ai-send2">发送</button>' +
      '<button class="btn ghost" data-act="modal-close">关闭</button></div>', true);
    A.resetAIHistory();
    AI_FOCUS = focus || null;
    AI_ACTIONS = [];
    PENDING_ACTIONS = null;
    renderLockBar();
    updateQuotaBadge();          // 面板一打开就显示当前档位与剩余额度（否则是个空药丸）
    // 带图表上下文进来时，问题可以由上下文自动生成（用户只点了一下格子）
    if (!question && AI_FOCUS) question = questionFromFocus(AI_FOCUS);
    /* 没有明确问题时的默认开场。
       以前这里什么都不做：点「AI 诊断」只弹出一个空白面板，用户以为功能坏了
       （尤其离线时更明显）。现在有数据就自动问一句，没数据就先给引导。 */
    var hasData = false;
    try { hasData = A.tally(A.activePool()).tested > 0; } catch (e) { hasData = false; }
    if (!question && !hasData) {
      logHTML('<div class="ai-a">还没有可以分析的数据。先做一次「快速摸底」（随机抽 100 词，约 3 分钟），' +
        '这里就会给出基于你自己数据的诊断——不联网也能用。</div>', 'bot');
      renderAiActions([
        { act: 'start', target: 400, label: '开一轮快速摸底' },
        { act: 'go', route: 'stats', label: '先看总览' }
      ]);
      var pill0 = el('aiMode');
      if (pill0) { pill0.textContent = '本地方案 · 等待数据'; pill0.className = 'pill warn'; }
      return;
    }
    if (!question) {
      question = '根据我现在这批数据，最该先补哪一段？接下来两周先做哪几件事？';
    }
    // 有授权锁时不要先去探后端：这个文件本来就是给别人用的离线形态，
    // 探了也白探，还会让用户以为"在连什么"。只有无锁版本才走健康检查。
    if (AI_LOCK && !AI_LIVE) {
      // 未解锁：不要停在"连接中…"，如实说清现在是离线规则诊断
      setModePillText('离线 · 本地规则（大模型需授权）', 'warn');
      if (question) A.runAI(question);
      return;
    }
    if (AI_LOCK && AI_LIVE) {
      // 已解锁：先看后端在不在。**后端优先**——它有工具调用、证据面板与可执行动作；
      // 直连厂商只是"没有后端时"的兜底，功能明显更弱，不该当主路径。
      probeBackend(function (online) {
        if (!online) setModePillText('在线 · 直连模型（无工具）', 'brand');
        if (question) A.runAI(question);
      });
      return;
    }
    probeBackend(function (online) {
      setModePill(online);
      if (question) A.runAI(question);
    });
  };

  /* ---------- AI 授权锁 ----------
     作者把 API Key 用「自己设的密码」加密后嵌进产物（scripts/make-ai-lock.mjs），
     HTML 里只有密文。对方输入密码 → PBKDF2 派生密钥 → AES-GCM 解密 → 拿到 Key 调模型。
     要点：解出来的 Key 只放内存（AI_LIVE），刷新即失效，授权是"这一次打开"。
     离线规则诊断不受锁影响，谁都能用、不花钱。 */
  var AI_LOCK = (typeof window !== 'undefined' && window.AI_LOCK) || null;
  /* 作者提供的 Key：**只有评委版构建才会内联**（build.js --with-key）。
     公开仓库里的产物是 null —— 这条纪律由 scripts/check-no-key.mjs 守着。 */
  var AUTHOR_KEY = (typeof window !== 'undefined' && window.AI_AUTHOR_KEY) || null;
  var AI_LIVE = null;                    // { key, model, base } —— 只存在内存里
  var UNLOCKING = false;
  var PBKDF2_MIN_IT = 100000;            // 密文里写了迭代次数，但不接受低到可爆的值

  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function renderLockBar() {
    var bar = el('aiLockBar');
    if (!bar) return;
    if (!AI_LOCK) { bar.innerHTML = ''; return; }
    if (AI_LIVE) {
      bar.innerHTML = '<div class="ai-lock ok">已授权：本次打开可用大模型（' +
        esc(AI_LIVE.model) + '）。刷新页面后需要重新输入密码。</div>';
      return;
    }
    bar.innerHTML = '<div class="ai-lock">' +
      '<b>大模型诊断已锁定</b>' +
      '<span class="tiny">离线诊断随时可用、不消耗任何额度。要用大模型，请输入作者提供的访问密码。</span>' +
      '<div class="row" style="gap:8px;margin-top:8px">' +
      '<input class="search" id="aiLockPass" type="password" placeholder="访问密码" autocomplete="off">' +
      '<button class="btn primary" data-act="ai-unlock" id="aiUnlockBtn">解锁</button>' +
      '</div><div class="tiny" id="aiLockMsg"></div></div>';
  }

  function lockMsg(text, bad) {
    var m = el('aiLockMsg');
    if (!m) return;
    m.textContent = text || '';
    m.style.color = bad ? '#c0392b' : '';
  }

  A.unlockAI = function (password) {
    if (!AI_LOCK) return Promise.resolve(false);
    if (AI_LIVE) return Promise.resolve(true);
    if (!window.crypto || !crypto.subtle) {
      lockMsg('这个浏览器不支持 WebCrypto，无法解锁。换 Chrome / Edge / Firefox 再试。', true);
      return Promise.resolve(false);
    }
    var it = AI_LOCK.it | 0;
    if (it < PBKDF2_MIN_IT) { lockMsg('密文迭代次数异常，已拒绝解锁。', true); return Promise.resolve(false); }
    lockMsg('校验中…');
    UNLOCKING = true;
    var enc = new TextEncoder(), dec = new TextDecoder();
    return crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: b64ToBytes(AI_LOCK.salt), iterations: it, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      })
      .then(function (aesKey) {
        // GCM 的 tag 附在密文尾部
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(AI_LOCK.iv), tagLength: 128 },
          aesKey, b64ToBytes(AI_LOCK.ct));
      })
      .then(function (buf) {
        var obj = JSON.parse(dec.decode(buf));
        if (!obj || !obj.k) throw new Error('解开的内容不完整');
        AI_LIVE = { key: obj.k, model: obj.m || 'deepseek-chat', base: (obj.b || 'https://api.deepseek.com').replace(/\/$/, '') };
        UNLOCKING = false;
        renderLockBar();
        setModePillText('在线 · 直连模型', 'brand');
        return true;
      })
      .catch(function () {
        UNLOCKING = false;
        // AES-GCM 认证失败 = 密码不对（不需要额外的校验值）
        lockMsg('密码不正确。可以再试一次，或直接看下面的离线诊断。', true);
        return false;
      });
  };

  function setModePillText(text, cls) {
    var pill = el('aiMode');
    if (!pill) return;
    pill.textContent = text;
    pill.className = 'pill ' + (cls || 'brand');
  }

  /* 直连模型厂商（DeepSeek 允许跨域，实测 file:// 也能调）：流式渲染复用同一套逻辑 */
  /* 直连厂商：keyCfg 可以是 {key,model,base}（用户自带）或作者 Key。
     走这条路时不经过我们的后端，数据直接到厂商——这一点在界面上要说清。 */
  function runDirect(box, question, keyCfg) {
    var KC = keyCfg || (A.S.userKey && A.S.userKey.key ? A.S.userKey : AUTHOR_KEY) || null;
    if (!KC || !KC.key) { localAnswer(box, question); return; }
    var ctx = '';
    try { ctx = JSON.stringify(A.buildAIContext()); } catch (e) { ctx = '{}'; }
    var sys = '你是「四六级词汇量检测」工具里的诊断教练。规则：\n' +
      '1. 只依据下面这份用户数据说话，禁止编造数字；数据不足就直说"样本太少，现在还不能判断"，并说明缺什么。\n' +
      '2. 回答用中文，结构清晰，先给结论再给依据；能给具体动作就给具体动作（背哪一段、每天多少词、下一轮怎么测）。\n' +
      '3. 这是抽样估计：总掌握率会被高低频段平均掉，判断强弱要看频段剖面；有置信区间时要提醒误差范围。\n' +
      '4. 不要输出代码块以外的表格，篇幅控制在 400 字以内。\n\n用户数据：' + ctx;

    fetch(KC.base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KC.key },
      body: JSON.stringify({
        model: KC.model || 'deepseek-chat',
        stream: true,
        temperature: 0.3,
        max_tokens: 900,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: question }],
      }),
    }).then(function (res) {
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error('授权失效（' + res.status + '）：Key 可能已被轮换');
        throw new Error('模型接口返回 ' + res.status);
      }
      if (!res.body) throw new Error('浏览器不支持流式读取');
      var reader = res.body.getReader(), dec2 = new TextDecoder(), buf = '', text = '';
      setModePillText('在线 · 直连模型', 'brand');
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            box.innerHTML = '<div class="ai-a">' + renderMD(text || '（模型没有返回内容）') +
              sentDataHTML(question) + '</div>';
            AI_HISTORY.push({ role: 'user', content: question });
            AI_HISTORY.push({ role: 'assistant', content: text });
            if (AI_HISTORY.length > 12) AI_HISTORY = AI_HISTORY.slice(-12);
            var lg = el('aiLog'); if (lg) lg.scrollTop = lg.scrollHeight;
            return;
          }
          buf += dec2.decode(r.value, { stream: true });
          var lines = buf.split('\n');
          buf = lines.pop();
          lines.forEach(function (line) {
            line = line.trim();
            if (line.indexOf('data:') !== 0) return;
            var payload = line.slice(5).trim();
            if (payload === '[DONE]') return;
            try {
              var j = JSON.parse(payload);
              var ch = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
              if (ch) {
                text += ch;
                box.innerHTML = '<div class="ai-a">' + renderMD(text) + '</div>';
                var lg2 = el('aiLog'); if (lg2) lg2.scrollTop = lg2.scrollHeight;
              }
            } catch (e) { /* 半行 JSON，等下一块 */ }
          });
          return pump();
        });
      }
      return pump();
    }).catch(function (e) {
      /* 连不上不是错误，是"这一档不可用"：说明原因、自动回落，并把判断依据交给用户 */
      box.innerHTML = '<div class="ai-note">大模型这一档暂时连不上（离线或网络受限），已自动回落到<b>本地方案</b>。</div>' +
        '<div class="ai-a" style="margin-top:8px">' + renderMD(A.localDiagnosis(question)) + '</div>' +
        '<div class="tiny" style="margin-top:8px;color:var(--ink3)">技术细节：' + esc(String(e && e.message || e).slice(0, 120)) + '</div>';
      try { renderAiActions(A.localActions()); } catch (err) {}
    });
  }

  // 透明说明：把哪些数据发给了模型（隐私承诺要能核对）
  // 走直连、走后端都调这一个函数，所以两条路径的"透明度"是一致的。
  function sentDataHTML(question) {
    var ctx = '';
    try {
      var payload = A.buildAIContext();
      if (AI_FOCUS) payload.focus = AI_FOCUS;      // 反向联动带的图表上下文，也一并公示
      ctx = JSON.stringify(payload, null, 1);
    } catch (e) { ctx = '{}'; }
    return '<details class="ai-sent"><summary>本次发送给模型的数据（仅汇总，不含逐题作答）</summary>' +
      '<pre>' + esc(ctx) + '</pre></details>';
  }

  /* ---------- 后端可用性探测 ----------
     单文件是主要交付形态：评委在自己电脑上打开，旁边没有 server/index.mjs。
     以前这里只回一句"请先执行 node server/index.mjs"——那是写给开发者的，
     对只想看结论的人是死胡同。现在断网也能给出基于本机数据的诊断。 */
  var AI_STATE = 'unknown';                    // unknown | online | offline
  var AI_PROBE_MS = 900;

  function setModePill(online) {
    var pill = el('aiMode');
    if (!pill) return;
    pill.textContent = online ? '在线 · 大模型' : '离线 · 本地规则';
    pill.className = 'pill ' + (online ? 'brand' : 'warn');
  }

  function probeBackend(cb) {
    if (AI_STATE !== 'unknown') { cb(AI_STATE === 'online'); return; }
    var settled = false;
    var finish = function (online) {
      if (settled) return;
      settled = true;
      AI_STATE = online ? 'online' : 'offline';
      cb(online);
    };
    var timer = setTimeout(function () { finish(false); }, AI_PROBE_MS);
    try {
      fetch(apiBase() + '/api/health', { method: 'GET' }).then(function (r) {
        clearTimeout(timer);
        finish(!!r && r.ok);
      }).catch(function () {
        clearTimeout(timer);
        finish(false);
      });
    } catch (e) {
      clearTimeout(timer);
      finish(false);
    }
  }

  /* ---------- 离线诊断：用本机数据生成结论 ----------
     不是占位文本：频段短板、缺口最大的一段、具体该背哪些词、下一轮怎么测，全部从真实数据算。
     问题类型不同，回答的侧重也不同（计划 / 结果解读 / 方法原理 / 泛问）。 */
  A.localDiagnosis = function (question) {
    var q = String(question || '');
    var t, est, prof, untested;
    try { t = A.tally(A.activePool()); } catch (e) { t = { tested: 0, total: 0, k: 0, f: 0, u: 0 }; }
    try { est = A.estimateNow(); } catch (e) { est = null; }
    try { prof = A.bandProfile(); } catch (e) { prof = null; }
    try { untested = A.untestedWords(); } catch (e) { untested = []; }

    var pc = function (x) { return Math.round((x || 0) * 100) + '%'; };
    var bankName = A.bankName();
    var out = [];

    if (!t.tested) {
      out.push('### 还没开始测，先给你一条最短路径');
      out.push('点首页的「快速摸底 · 约 80 题 · 3 分钟」。它按词频分层随机抽词，' +
        '不是从 A 背到你认识的第一个词就停——所以三五分钟就能给出一个**带误差范围**的数字，' +
        '而不是"大概几百几千"的猜测。');
      out.push('测完再回来问我，我会直接指出是哪几段拖了后腿、下一步背哪些词最划算。');
      return out.join('\n\n');
    }

    // 依据块：所有结论都必须能追溯到这些数字
    var rows = (prof && prof.rows) ? prof.rows.filter(function (r) { return r.n > 0 && r.p !== null; }) : [];
    var weak = rows.slice().sort(function (a, b) { return a.p - b.p; }).slice(0, 2);
    var strong = rows.slice().sort(function (a, b) { return b.p - a.p; })[0];
    var nameOf = function (b) { return A.BAND_NAMES[b] || ('频段 ' + b); };

    var head = '**依据（全部来自你本机数据，没有上传任何东西）**\n' +
      '- 词库：' + bankName + '，已测 ' + t.tested + ' / ' + t.total + ' 词（覆盖 ' + pc(t.tested / (t.total || 1)) + '）\n' +
      '- 掌握率（折中口径：认识 + 模糊×0.5）：' + pc((t.k + 0.5 * t.f) / (t.tested || 1)) +
      '；严格口径：' + pc(t.k / (t.tested || 1)) +
      (est && est.kind === 'sample' && est.vocab
        ? '\n- 词汇量估计：**≈ ' + est.vocab.toLocaleString('en-US') + ' 词**（±' +
          Math.round((est.hi - est.lo) / 2) + ' 词，95% 置信区间）'
        : (est && est.vocab ? '\n- 整库实测：' + est.vocab.toLocaleString('en-US') + ' 词' : ''));
    if (weak.length) {
      head += '\n- 最弱的两段：' + weak.map(function (r) {
        return nameOf(r.band) + '（' + pc(r.p) + '，抽了 ' + r.n + ' 词）';
      }).join('、');
    }
    out.push(head);

    var wantPlan = /计划|两周|一个月|每天|怎么提升|补哪|复习|背什么/.test(q);
    var wantWhy = /怎么算|原理|可信|误差|准不准|为什么/.test(q);
    var wantResult = /结果|报告|分析|怎么样|多少/.test(q);

    if (wantWhy) {
      out.push('**这个方法凭什么可信**\n' +
        '1. **分层抽样**：词库按词频分 7 段，抽词按各段真实占比分层，不是随便抓——所以低频段不会被高频段淹没。\n' +
        '2. **自适应停测**：边测边算区间宽度，达到你设定的精度（默认 ±250 词）就提示可以收工，没到就继续。\n' +
        '3. **三层修正**：Agresti-Coull 处理小样本、有限总体修正（不放回抽样）、四选一时还扣掉蒙对率。\n' +
        '4. **两个口径**：严格只算"认识"，折中把"模糊"按一半计入，两边都摆出来让你自己判断。');
    }

    if (weak.length) {
      /* 「最弱的一段」和「最该先补的一段」不是同一件事：
         10k-20k 常常掌握率最低，但那些词一年也遇不上几次；最高频段缺几个词却每次阅读都撞上。
         所以先动的那一段按「缺口词数 × 词频权重」挑（与报告页、回访卡同一套口径），
         最弱段只作为"结构上有洞"的说明。 */
      var deficits = rows.map(function (r) {
        var w = (A.BAND_W && A.BAND_W[r.band] !== undefined) ? A.BAND_W[r.band] : 0.1;
        return { band: r.band, p: r.p, n: r.n, N: r.N, gap: Math.max(0, Math.round((1 - r.p) * r.N)), w: w, gain: Math.max(0, Math.round((1 - r.p) * r.N)) * w };
      }).sort(function (a, b) { return b.gain - a.gain; });
      var pri = deficits.length ? deficits[0] : null;
      var w0 = pri || weak[0];
      out.push('**最该先动的地方**\n' +
        nameOf(w0.band) + ' 段（掌握 ' + pc(w0.p) + (pri ? ('，全段约 ' + w0.gap + ' 词还没拿下') : '') + '）。' +
        (pri ? '这一段是「缺口 × 词频权重」算下来收益最高的：' + nameOf(w0.band) + ' 的词在真题里出现得最密，补它最划算。' : '') +
        (strong && strong.band !== w0.band
          ? '对比之下 ' + nameOf(strong.band) + ' 有 ' + pc(strong.p) + '，说明不是"整体不行"，而是**结构上有洞**——' +
            '补洞比从头背一遍划算得多。'
          : '') +
        '这一段是高频词，读真题时出现得最密，先补它的收益最大。');
    }

    if (wantPlan) {
      /* 每天能背多少词 = 每日可投入时间 ÷ 每词约 1.5 分钟（与设置页文案一致）。
       这里必须读用户设置——之前写死 50，导致设置页那个"每日可投入时间"根本没生效。
       换算现在收敛到 A.perDayWords()，回访卡与计划里的词数才会是同一个数。 */
      var perDay = A.perDayWords();
      var days = 14;
      var need = Math.min(untested.length + Math.round(t.f * 0.5), perDay * days);
      out.push('**两周计划（按你的数据算的）**\n' +
        '1. **第 1–4 天：补最弱段**。每天 ' + perDay + ' 词，只取 ' + (weak[0] ? nameOf(weak[0].band) : '最弱段') +
        ' 里你还没测过或不认识的词——那部分现在有 ' + untested.length + ' 个没测过。\n' +
        '2. **第 5–9 天：模糊词转正**。你有 ' + t.f + ' 个词标了"模糊"，这些是**最容易变现**的：' +
        '半个词已经记住了，复习成本最低。\n' +
        '3. **第 10–14 天：复测窄区间**。回到首页再测一轮、目标精度设 ±150，' +
        '然后用「多轮对比」看哪些词是**背了又忘**的，那些才需要换方法（词根 / 例句语境）。\n' +
        '按每天 ' + perDay + ' 词算，两周能覆盖约 ' + need + ' 词。');
    } else if (wantResult) {
      out.push('**这次结果怎么读**\n' +
        '先看**误差范围**再看数字：' + (est && est.kind === 'sample'
          ? '±' + Math.round((est.hi - est.lo) / 2) + ' 词以内的差别不用当真，那是抽样噪声。'
          : '你已经测到整库实测，这个数字不再有抽样误差。') +
        '\n再看**结构**：总掌握率会把高低频段平均掉，真正决定你读文章卡不卡的是最高频那几段。');
    }

    if (untested.length) {
      /* 注意：untestedWords() 返回的是**下标数组**，不是单词。
         这里必须映射成单词再展示（曾经直接把下标列出来，界面上出现 -454、-4829 这种鬼东西）。 */
      var samples = untested.slice(0, 6).map(function (idx) {
        return (A.WORDS && A.WORDS[idx]) ? A.WORDS[idx].w : String(idx);
      });
      out.push('**没测过、可以立刻开始的词**\n' + samples.map(function (w) {
        return '- ' + w;
      }).join('\n') + '\n（共 ' + untested.length + ' 个没测过，去「总览」页的词汇地图能按频段和首字母查。）');
    }

    out.push('——\n以上是**离线规则诊断**：结论全部由本机数据算出，不联网、不上传。' +
      '接上大模型（仓库里的 `server/index.mjs`）后，同一个入口会换成自由追问的诊断 Agent，' +
      '能用工具查数据、能顺着你的追问继续分析。');
    return out.join('\n\n');
  };

  function localAnswer(box, question) {
    /* 离线是常态（单文件交付），所以先说明"这就是本地方案"，而不是让用户以为是故障 */
    if (!el('aiOfflineNote')) {
      var note = document.createElement('div');
      note.className = 'ai-msg';
      note.id = 'aiOfflineNote';
      note.innerHTML = '<div class="ai-note">当前没有网络或没有后端，下面是<b>本地方案</b>：' +
        '结论全部由这台机器上的数据算出，确定性、不联网、不花钱。接上后端（或填入自己的 API Key）后，' +
        '同一个入口会换成能自由追问的大模型 Agent。</div>';
      var lg = el('aiLog'); if (lg) lg.appendChild(note);
    }
    var md;
    try { md = A.localDiagnosis(question); }
    catch (e) { md = '离线诊断生成失败：' + e.message + '\n\n可以先去「总览」页看频段剖面。'; }
    box.innerHTML = '<div class="ai-a">' + renderMD(md) + '</div>';
    try {
      AI_HISTORY.push({ role: 'user', content: question });
      AI_HISTORY.push({ role: 'assistant', content: md });
      if (AI_HISTORY.length > 12) AI_HISTORY = AI_HISTORY.slice(-12);
    } catch (e) {}
    var log = el('aiLog');
    if (log) log.scrollTop = log.scrollHeight;
    // 离线诊断同样给可点击的下一步（和在线形态保持一致的交互）
    try { renderAiActions(A.localActions()); } catch (e) {}
  }

  function logHTML(inner, cls) {
    var log = el('aiLog');
    if (!log) return null;
    var d = document.createElement('div');
    d.className = 'ai-msg ' + (cls || '');
    d.innerHTML = inner;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  /* ---------- 调用后端并流式渲染 ---------- */
  A.runAI = function (question, keepLog) {
    var log = el('aiLog');
    if (!log) return;
    if (!keepLog) log.innerHTML = '';
    logHTML('<div class="ai-q">' + esc(question) + '</div>', 'me');
    var box = logHTML('<div class="ai-a"><span class="ai-dots">正在分析你的数据</span></div>', 'bot');
    var toolBox = null;
    var evidence = [];

    /* ---------- 三档通路（顺序不能反） ----------
       ① 用户自己跑着后端 → 那是他自己的 Key 与额度，不扣作者额度，且质量最好（有工具）
       ② 用户自带 Key    → 直连厂商，不扣作者额度
       ③ 作者额度        → 直连作者 Key，扣 1 次
       ④ 都没有          → 本地方案（确定性规则引擎，永远可用）
       判后端是否在线需要一次探测，所以先探再分流；探不到就走后面几档。 */
    var authorCfg = AI_LIVE || AUTHOR_KEY;
    if (AI_LOCK && !AI_LIVE && !A.S.userKey) {
      // 兼容旧形态：产物启用了授权锁但没解锁
      localAnswer(box, question);
      var hint = document.createElement('div');
      hint.className = 'tiny';
      hint.style.marginTop = '8px';
      hint.textContent = '（以上为本地方案，不消耗任何额度。要用大模型，请在上方输入访问密码后重发这个问题。）';
      box.appendChild(hint);
      lockMsg('要用大模型请先输入访问密码。', false);
      return;
    }
    var hasOwn = !!(A.S.userKey && A.S.userKey.key);
    if (AI_STATE === 'offline' && !hasOwn && !authorCfg) {
      setTimeout(function () { localAnswer(box, question); }, 320);
      return;
    }
    if (AI_STATE === 'offline' && hasOwn) { runDirect(box, question, A.S.userKey); return; }
    if (AI_STATE === 'offline' && !hasOwn && authorCfg) { spendThenDirect(box, question, authorCfg); return; }

    var ctx;
    try { ctx = A.buildAIContext(); }
    catch (e) { box.innerHTML = '<span class="ai-err">构建数据失败：' + esc(e.message) + '</span>'; return; }

    fetch(apiBase() + '/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question, context: ctx, focus: AI_FOCUS, history: AI_HISTORY.slice(-6) })
    }).then(function (res) {
      if (!res.ok || !res.body) throw new Error('后端返回 ' + res.status);
      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = '', text = '';

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            // 走后端 Agent 时也把「本次发送的数据」摆出来：透明度不该取决于走哪条路
            box.innerHTML = '<div class="ai-a">' + renderMD(text) + evidenceHTML(evidence) +
              sentDataHTML(question) + '</div>';
            // 记入对话历史，支持追问时带上文
            AI_HISTORY.push({ role: 'user', content: question });
            AI_HISTORY.push({ role: 'assistant', content: text });
            if (AI_HISTORY.length > 12) AI_HISTORY = AI_HISTORY.slice(-12);
            log.scrollTop = log.scrollHeight;
            return;
          }
          buf += dec.decode(r.value, { stream: true });
          var lines = buf.split('\n');
          buf = lines.pop();
          lines.forEach(function (line) {
            if (line.indexOf('data:') !== 0) return;
            var evt;
            try { evt = JSON.parse(line.slice(5).trim()); } catch (e) { return; }
            if (evt.type === 'mode') {
              var m = el('aiMode');
              if (m) m.textContent = evt.mode === 'mock' ? '本地规则诊断' : ('模型：' + (evt.model || '') );
            } else if (evt.type === 'tool') {
              if (!toolBox) {
                toolBox = document.createElement('div');
                toolBox.className = 'ai-tools';
                box.parentNode.insertBefore(toolBox, box);
              }
              var label = { get_profile: '读取整体情况', get_band_profile: '读取频段数据', get_weak_words: '读取未掌握词', plan_schedule: '生成复习计划', list_banks: '读取词库信息', get_examples: '检索真实例句', get_weak_examples: '检索薄弱词例句', suggest_actions: '给出可执行动作' }[evt.name] || evt.name;
              if (evt.result) evidence.push({ name: evt.name, label: label, result: evt.result });
              // 结构化动作：模型通过 suggest_actions 返回可点击的下一步，前端渲染成按钮
              if (evt.name === 'suggest_actions' && evt.result && evt.result.actions) {
                PENDING_ACTIONS = evt.result.actions;
              }
              var chip = document.createElement('span');
              chip.className = 'ai-tool';
              chip.textContent = label;
              toolBox.appendChild(chip);
              log.scrollTop = log.scrollHeight;
            } else if (evt.type === 'delta') {
              text += evt.text;
              box.innerHTML = '<div class="ai-a">' + renderMD(text) + '</div>';
              log.scrollTop = log.scrollHeight;
            } else if (evt.type === 'done') {
              if (PENDING_ACTIONS && PENDING_ACTIONS.length) {
                renderAiActions(PENDING_ACTIONS);
                PENDING_ACTIONS = null;
              }
              if (evt.tokens) {
                A.S.tokens = (A.S.tokens || 0) + evt.tokens;
                A.S.lastTokens = evt.tokens;
                A.save();
                var tn = el('aiTokens');
                if (tn) tn.innerHTML = tokensLine();
                if (A.renderPet) A.renderPet();
              }
            } else if (evt.type === 'error') {
              text += '\n\n（模型调用出现问题：' + evt.message + '，已尝试降级处理）';
            }
          });
          return pump();
        });
      }
      return pump();
    }).catch(function (e) {
      // 后端不在（单文件交付的常态）：不是报错，而是降级到本地规则诊断。
      // 之前这里吐的是"请先执行 node server/index.mjs"，那是给开发者看的，
      // 对收到文件的同学/评委就是一条死胡同。
      AI_STATE = 'offline';
      setModePill(false);
      if (hasOwn) { runDirect(box, question, A.S.userKey); return; }        // 自带 Key → 直连
      if (authorCfg) { spendThenDirect(box, question, authorCfg); return; } // 作者额度 → 扣一次再直连
      localAnswer(box, question);
      if (e && e.message) {
        var tip = document.createElement('div');
        tip.className = 'tiny';
        tip.style.marginTop = '8px';
        tip.textContent = '（未连接本地后端，以上为离线诊断。原始信息：' + e.message + '）';
        box.appendChild(tip);
      }
    });
  };

  /* ---------- 接入指南（左下角卡片点进来） ----------
     内容只讲"怎么把你自己厂商的 Key 接进来"，并把踩过的坑写在前面：
     浏览器直连要过 CORS，我们实测 DeepSeek 允许、OpenAI/智谱拒绝。 */
  A.openAiGuide = function () {
    var cur = A.aiTier();
    A.modal(
      '<div class="book-head"><b>接入你自己的 AI</b>' +
      '<span class="tiny">用你自己的 Key，不限次数，数据不经过我们</span></div>' +
      '<div class="guide">' +
        '<div class="g-step"><b>为什么建议自带 Key</b>' +
          '作者提供的额度是「完成一次检测换一次诊断」；自带 Key 后不再受此限制，' +
          '而且请求直接发到模型厂商，<b>我们的服务器完全不参与</b>。' +
          '<br>当前状态：<b>' + esc(A.aiTierLabel()) + '</b>' +
          (cur === 'local' ? '（用完作者额度后，本地方案仍然无限可用）' : '') +
        '</div>' +
        '<div class="g-step"><b>支持哪些厂商</b>' +
          '浏览器要直连厂商 API，必须厂商允许跨域（CORS）。我们实测：' +
          '<br>· <b>DeepSeek</b> —— ✅ 允许，<code>file://</code> 打开也能用（推荐）' +
          '<br>· OpenAI / 智谱 —— ❌ 默认拒绝跨域，直连会报 <code>Failed to fetch</code>' +
          '<br>其它兼容 OpenAI 协议的厂商可以试，报错多半就是 CORS。' +
        '</div>' +
        '<div class="g-step"><b>三步接入</b>' +
          '<br>1. 到厂商控制台创建 API Key（DeepSeek 在「API keys」页面）' +
          '<br>2. 回到本应用：<b>设置 → AI 与额度</b>，把 Key 贴进去，点「保存并测试」' +
          '<br>3. 测试通过后，AI 面板右上角会变成「自带 Key · 无限次」' +
        '</div>' +
        '<div class="g-step warn"><b>安全提示（务必看）</b>' +
          '<br>· Key 只存在<b>你自己的浏览器</b>里，不上传、不写进导出的备份文件' +
          '<br>· 公共电脑上用完请点「清除 Key」' +
          '<br>· 别把 Key 发给别人、别贴进截图；泄露了去厂商后台<b>立刻删除重建</b>' +
        '</div>' +
        '<div class="g-step"><b>费用大概多少</b>' +
          '<br>一次深度诊断约 1.5–3 千 token（含工具往返），按 DeepSeek 现价约 <b>几分钱</b>。' +
          '本应用会显示每次消耗的 token，累计值在桌宠旁边能看到。' +
        '</div>' +
        '<div class="g-step"><b>常见报错怎么处理</b>' +
          '<br>· <code>Failed to fetch</code> → 厂商不允许跨域（换 DeepSeek），或网络不通' +
          '<br>· <code>401</code> → Key 错了或已失效' +
          '<br>· <code>402 / 余额不足</code> → 去厂商后台充值' +
          '<br>· 一直"正在分析" → 检查是否开了代理/VPN 拦截' +
        '</div>' +
      '</div>' +
      '<div class="book-row"><button class="btn primary" data-act="modal-close">知道了</button>' +
      '<button class="btn ghost" data-act="ai-guide-settings">去设置里填写</button></div>', true);
  };

  /* 设置页的「测试连接」：真发一次极短请求，不做假绿灯 */
  A.testUserKey = function (cfg) {
    if (!cfg || !cfg.key) return Promise.resolve({ ok: false, msg: '还没填 Key' });
    return fetch(cfg.base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify({
        model: cfg.model, max_tokens: 1, stream: false,
        messages: [{ role: 'user', content: 'ping' }]
      })
    }).then(function (r) {
      if (r.ok) return { ok: true, msg: '连接成功，可以用了' };
      if (r.status === 401 || r.status === 403) return { ok: false, msg: 'Key 无效或已失效（' + r.status + '）' };
      if (r.status === 402 || r.status === 429) return { ok: false, msg: '额度/频率限制（' + r.status + '），去厂商后台看看' };
      return { ok: false, msg: '接口返回 ' + r.status };
    }).catch(function (e) {
      return { ok: false, msg: '连不上：' + (e && e.message ? e.message : e) + '（多半是厂商不允许浏览器跨域）' };
    });
  };
  /* 给设置页用：当前 AI 处在哪一级（有锁/已解锁/模型名）。不要暴露 Key 本身。 */
  A.aiLockInfo = function () {
    return { lock: !!AI_LOCK, live: !!AI_LIVE, model: AI_LIVE ? AI_LIVE.model : '' };
  };

})(window.__APP__ || (window.__APP__ = {}));
