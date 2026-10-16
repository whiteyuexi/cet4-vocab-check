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

  A.openAIDialog = function (question) {
    A.modal('<div class="ai-head"><b>AI 诊断教练</b>' +
      '<span class="pill brand" id="aiMode">连接中…</span></div>' +
      '<div class="ai-log" id="aiLog"></div>' +
      '<div class="row" style="margin-top:12px;gap:8px">' +
      '<input class="search" id="aiInput2" placeholder="继续追问，例如：那 2k-3k 段要管吗？">' +
      '<button class="btn primary" data-act="ai-send2">发送</button>' +
      '<button class="btn ghost" data-act="modal-close">关闭</button></div>', true);
    A.resetAIHistory();
    if (question) A.runAI(question);
  };

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

    var ctx;
    try { ctx = A.buildAIContext(); }
    catch (e) { box.innerHTML = '<span class="ai-err">构建数据失败：' + esc(e.message) + '</span>'; return; }

    fetch(apiBase() + '/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question, context: ctx, history: AI_HISTORY.slice(-6) })
    }).then(function (res) {
      if (!res.ok || !res.body) throw new Error('后端返回 ' + res.status);
      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = '', text = '';

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            box.innerHTML = '<div class="ai-a">' + renderMD(text) + evidenceHTML(evidence) + '</div>';
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
              var label = { get_profile: '读取整体情况', get_band_profile: '读取频段数据', get_weak_words: '读取未掌握词', plan_schedule: '生成复习计划', list_banks: '读取词库信息', get_examples: '检索真实例句', get_weak_examples: '检索薄弱词例句' }[evt.name] || evt.name;
              if (evt.result) evidence.push({ name: evt.name, label: label, result: evt.result });
              var chip = document.createElement('span');
              chip.className = 'ai-tool';
              chip.textContent = '✓ ' + label;
              toolBox.appendChild(chip);
              log.scrollTop = log.scrollHeight;
            } else if (evt.type === 'delta') {
              text += evt.text;
              box.innerHTML = '<div class="ai-a">' + renderMD(text) + '</div>';
              log.scrollTop = log.scrollHeight;
            } else if (evt.type === 'error') {
              text += '\n\n（模型调用出现问题：' + evt.message + '，已尝试降级处理）';
            }
          });
          return pump();
        });
      }
      return pump();
    }).catch(function (e) {
      box.innerHTML = '<div class="ai-err">无法连接后端服务。<br>' +
        '请先在项目目录执行 <code>node server/index.mjs</code> 启动后端，再回来点「开始诊断」。<br>' +
        '<span class="tiny">错误信息：' + esc(e.message) + '</span></div>';
    });
  };

})(window.__APP__ || (window.__APP__ = {}));
