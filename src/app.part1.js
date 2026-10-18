/* ============ 第一部分：基础、状态、首页、分组 ============ */
(function (A) {
  'use strict';

  var WORDS = A.WORDS = window.WORDS || [];
  var KEY = A.KEY = 'cet4vocab_v1';
  A.GROUP_SIZE = 100;

  /* ---------- 小工具 ---------- */
  function el(id) { return document.getElementById(id); }
  A.el = el;
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  A.esc = esc;
  function tpl(t, d) {
    return t.replace(/\{(\w+)\}/g, function (m, k) {
      var v = d[k];
      return (v === undefined || v === null) ? '' : v;
    });
  }
  A.tpl = tpl;
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  A.pct = pct;
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  A.shuffle = shuffle;
  function fmtDate(ts) {
    var d = new Date(ts);
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  A.fmtDate = fmtDate;

  var toastTimer = null;
  function toast(msg) {
    var t = el('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }
  A.toast = toast;

  /* 读屏播报：把作答结果写进 aria-live 区域 */
  function announce(msg) {
    var l = el('live');
    if (l) l.textContent = msg;
  }
  A.announce = announce;

  function modal(html, wide) {
    var m = el('modal');
    m.innerHTML = tpl('<div class="modal" data-act="modal-bg"><div class="box{w}">{body}</div></div>',
      { body: html, w: wide ? ' wide' : '' });
  }
  function closeModal() { el('modal').innerHTML = ''; }
  A.modal = modal; A.closeModal = closeModal;

  /* ---------- 状态 ---------- */
  function defaultState() {
    return {
      status: {},
      history: [],
      session: null,
      lastResult: null,
      samples: [],
      round: { n: 1, startedAt: Date.now() },   // 当前轮次
      rounds: [],                               // 已完成并归档的历史轮次（报告快照）
      settings: { mode: 'self', autoNext: true, autoDelay: 850, sound: true, includeExt: false, strict: false, bank: 'c4' },
      theme: 'light',
      tokens: 0            // AI 诊断累计消耗的 token（用户视角的「投喂量」）
    };
  }
  function loadState() {
    var d = defaultState();
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return d;
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        d.status = o.status || {};
        d.history = o.history || [];
        d.session = o.session || null;
        d.lastResult = o.lastResult || null;
        d.samples = o.samples || [];
        d.round = o.round || d.round;
        d.rounds = Array.isArray(o.rounds) ? o.rounds : [];
        d.theme = o.theme || 'light';
        d.tokens = o.tokens || 0;
        if (o.settings) for (var k in o.settings) if (o.settings.hasOwnProperty(k)) d.settings[k] = o.settings[k];
      }
    } catch (e) { A.storageBroken = true; }
    return d;
  }
  var S = A.S = loadState();
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
      A.storageBroken = false;
    } catch (e) {
      // 存储被禁用/写满：标记一次并让界面常驻提示，而不是悄悄丢数据
      if (!A.storageBroken) { A.storageBroken = true; if (A.render) A.render(); }
    }
  }
  A.save = save;

  /* ---------- 词库：四级 / 六级 ---------- */
  // b 位掩码：1 = 四级大纲词，2 = 六级大纲新增词，3 = 四六级都有
  var BANKS = {
    c4: { name: '四级', short: '四级', hint: '大学英语四级大纲词汇表', mask: 1 },
    c6: { name: '六级', short: '六级', hint: '大学英语六级大纲词汇表（含四级已覆盖的词）', mask: 3 }
  };
  A.BANKS = BANKS;
  function bankKey() { var k = S.settings.bank; return BANKS[k] ? k : 'c4'; }
  A.bankKey = bankKey;
  A.bankName = function () { return BANKS[bankKey()].name; };
  A.bankShort = function () { return BANKS[bankKey()].short; };
  A.bankHint = function () { return BANKS[bankKey()].hint; };
  function inBank(w) {
    return (w.b & BANKS[bankKey()].mask) !== 0;
  }
  A.inBank = inBank;
  /* 各词库规模（给切换按钮显示） */
  A.bankCounts = function () {
    // c6 = 六级大纲全量（含四级），c6new = 六级新增（只在六级、不含四级）
    // 设置页的「词库说明」三个数都要用，别只给两个
    var c = { c4: 0, c6: 0, c6new: 0 };
    for (var i = 0; i < WORDS.length; i++) {
      var w = WORDS[i];
      if (!S.settings.includeExt && w.x) continue;
      if (w.b & 1) c.c4++;
      if (w.b & 3) c.c6++;
      if ((w.b & 2) && !(w.b & 1)) c.c6new++;
    }
    return c;
  };
  /* ---------- 检测顺序：稳定的伪随机 ----------
     为什么不按字母序：按字母序测就是一路 a、b、c 地走下去，既机械，又容易靠首字母
     提前猜到词义；而且一组 100 词会全挤在同一个字母段上，样本没有代表性。
     为什么不能用 Math.random：分组是「按序位每 100 词切一组」，顺序一旦每次都不一样，
     「第 N 组」就会指向另一批词，进度、历史、跨轮对比全部失真。
     所以用「词本身的哈希」定序位：看起来是随机的，但每次打开、每台机器都完全一致。 */
  var _ordPos = null;
  function ordPos() {
    if (_ordPos) return _ordPos;
    var hash = new Uint32Array(WORDS.length), arr = [];
    for (var i = 0; i < WORDS.length; i++) {
      var s = WORDS[i].w, h = 2166136261;
      for (var k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = (h * 16777619) >>> 0; }
      hash[i] = h;
      arr.push(i);
    }
    // 哈希相同（极少见）时用下标兜底，保证是一个稳定的全序
    arr.sort(function (a, b) { return (hash[a] - hash[b]) || (a - b); });
    var pos = new Int32Array(WORDS.length);
    for (var j = 0; j < arr.length; j++) pos[arr[j]] = j;
    _ordPos = pos;
    return pos;
  }

  var _poolCache = {};
  /* 缓存数组按「词库 + 拓展开关」分键；对外的 activePool() 返回副本，缓存本体只读 */
  function orderedPool() {
    var key = bankKey() + (S.settings.includeExt ? 'E' : 'C');
    if (_poolCache[key]) return _poolCache[key];
    var pos = ordPos(), arr = [];
    for (var i = 0; i < WORDS.length; i++) {
      var w = WORDS[i];
      if (!inBank(w)) continue;
      if (!S.settings.includeExt && w.x) continue;
      arr.push(i);
    }
    arr.sort(function (a, b) { return pos[a] - pos[b]; });
    _poolCache[key] = arr;
    return arr;
  }
  function activePool() { return orderedPool().slice(); }
  A.activePool = activePool;
  A.keyOf = function (i) { return WORDS[i].w.toLowerCase(); };
  A.getSt = function (i) { return S.status[A.keyOf(i)]; };
  A.setSt = function (i, v) { S.status[A.keyOf(i)] = v; };
  A.clearSt = function (i) { delete S.status[A.keyOf(i)]; };
  A.curPoolSize = function () { return orderedPool().length; };

  function chunk(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i += A.GROUP_SIZE) out.push(arr.slice(i, i + A.GROUP_SIZE));
    return out;
  }
  var _bankCache = {};
  function bankIdx(wantExt) {
    var key = bankKey() + (wantExt ? 'e' : 'c');
    if (_bankCache[key]) return _bankCache[key];
    var pos = ordPos(), a = [];
    for (var i = 0; i < WORDS.length; i++) {
      var w = WORDS[i];
      if (!inBank(w)) continue;
      if (wantExt ? !w.x : !!w.x) continue;
      a.push(i);
    }
    a.sort(function (x, y) { return pos[x] - pos[y]; });
    _bankCache[key] = a;
    return a;
  }
  /* 分组固定按当前词库的核心词切分，开启「拓展词」时在末尾追加拓展词组。
     切分依据是稳定的伪随机序位（见 ordPos）——顺序是打乱的，但每次打开都一样，
     所以「第 N 组」永远指向同一批词，进度与历史记录才站得住。 */
  function groups() {
    var g = chunk(bankIdx(false));
    if (S.settings.includeExt) g = g.concat(chunk(bankIdx(true)));
    return g;
  }
  A.groups = groups;
  A.coreGroupsCount = function () { return chunk(bankIdx(false)).length; };

  function tally(pool) {
    var k = 0, f = 0, u = 0, t = 0;
    for (var n = 0; n < pool.length; n++) {
      var s = A.getSt(pool[n]);
      if (s === 2) { k++; t++; } else if (s === 1) { f++; t++; } else if (s === 0) { u++; t++; }
    }
    return { k: k, f: f, u: u, tested: t, total: pool.length, rest: pool.length - t };
  }
  A.tally = tally;

  // 用「认识 + 模糊×0.5」估计掌握比例，并给出 95% 置信区间下的词汇量区间
  /* 由样本比例外推总体，并给出 95% 置信区间。
     抽样是不放回抽样，因此乘上有限总体修正 (N-n)/(N-1)：覆盖率越高，区间收得越紧。 */
  function estimate(tested, score, universe) {
    if (!tested) return null;
    var p = score / tested;
    var fpc = universe > 1 ? Math.max(0, (universe - tested) / (universe - 1)) : 1;
    var se = Math.sqrt(Math.max(p * (1 - p), 0.000001) / tested * fpc);
    return {
      p: p,
      vocab: Math.round(p * universe),
      lo: Math.max(0, Math.round((p - 1.96 * se) * universe)),
      hi: Math.min(universe, Math.round((p + 1.96 * se) * universe))
    };
  }
  /* 两种口径：严格＝只算「认识」；折中＝「认识 + 模糊×0.5」。
     模糊词到底算不算掌握没有标准答案，所以两个数都给出来。 */
  function scoreOf(c, strict) { return strict ? c.k : c.k + 0.5 * c.f; }
  A.scoreOf = scoreOf;

  /* ================= 词频分段与分层抽样 =================
     为什么值得做：四六级词表里既有 the/able 这种最高频词，也有 10k-20k 的冷门词，
     而人对这两类的掌握率天差地别。简单随机抽样的误差主要来自"这一把抽到多少冷门词"，
     按频段等比例分层之后，同样的题量能把区间收窄一截，而且顺手就得到了频段剖面。 */
  A.BAND_NAMES = ['20k 以外', '最高频 1k', '1k-2k', '2k-3k', '3k-5k', '5k-10k', '10k-20k'];
  A.bandOf = function (i) { return WORDS[i].f || 0; };
  A.bandSizes = function () {
    var pool = activePool(), out = {};
    for (var n = 0; n < pool.length; n++) {
      var b = A.bandOf(pool[n]);
      out[b] = (out[b] || 0) + 1;
    }
    return out;
  };
  /* 生成"分层随机顺序"：按各频段词数等比例交错抽取。
     好处是任何一个前缀都仍然是一个合法的等比例分层样本，因此可以边测边看精度、随时喊停。 */
  A.probeQueue = function () {
    var pool = activePool();
    var groups = {};
    for (var i = 0; i < pool.length; i++) {
      var b = A.bandOf(pool[i]);
      (groups[b] || (groups[b] = [])).push(pool[i]);
    }
    var keys = Object.keys(groups).map(Number);
    keys.forEach(function (k) { shuffle(groups[k]); });
    var N = pool.length, taken = {}, pos = {}, order = [];
    keys.forEach(function (k) { taken[k] = 0; pos[k] = 0; });
    while (order.length < N) {
      var best = null, bestGap = -Infinity;
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        if (pos[k] >= groups[k].length) continue;
        var gap = (groups[k].length / N) * (order.length + 1) - taken[k];
        if (gap > bestGap) { bestGap = gap; best = k; }
      }
      if (best === null) break;
      order.push(groups[best][pos[best]++]);
      taken[best]++;
    }
    return order;
  };
  /* 把每层的 {k, f} 折算成分数（严格＝只算认识；折中＝认识 + 模糊×0.5） */
  function scoreBands(bands, strict) {
    var out = {};
    for (var b in bands) {
      var d = bands[b];
      out[b] = { N: d.N, n: d.n, score: strict ? d.k : d.k + 0.5 * d.f };
    }
    return out;
  }
  A.scoreBands = scoreBands;
  /* 四选一有 1/k 的蒙对率，把观测正确率折算回真实掌握率 */
  function unguessBands(bands, choices) {
    var out = {};
    for (var b in bands) {
      var d = bands[b];
      out[b] = { N: d.N, n: d.n, score: Math.max(0, (d.score - d.n / choices) / (1 - 1 / choices)) };
    }
    return out;
  }
  A.unguessBands = unguessBands;
  /* 分层估计：p̂ = Σ (N_i/N)·p̂_i，方差按各层独立累加，并做有限总体修正 */
  function stratEstimate(bandData, universe) {
    if (!universe) return null;
    var p = 0, v = 0, any = false;
    for (var k in bandData) {
      var d = bandData[k];
      if (!d.n || !d.N) continue;
      any = true;
      var w = d.N / universe;
      var pi = d.score / d.n;                       // 点估计保持无偏
      var pa = (d.score + 2) / (d.n + 4);           // Agresti-Coull：全对/全错时区间不再坍缩成 0
      var fpc = d.N > 1 ? Math.max(0, (d.N - d.n) / (d.N - 1)) : 1;
      p += w * pi;
      v += w * w * (pa * (1 - pa) / (d.n + 4)) * fpc;
    }
    if (!any) return null;
    var se = Math.sqrt(v), N = universe;
    return {
      p: p, se: se, universe: N,
      vocab: Math.round(p * N),
      lo: Math.max(0, Math.round((p - 1.96 * se) * N)),
      hi: Math.min(N, Math.round((p + 1.96 * se) * N)),
      half: Math.round(1.96 * se * N)
    };
  }
  A.stratEstimate = stratEstimate;
  /* 频段剖面：优先用最近一次随机抽样的分层结果（无偏）；
     没有抽样时退化成"已测词的描述统计"，并在界面上标明口径。 */
  A.bandProfile = function () {
    var sizes = A.bandSizes();
    var s = latestSample();
    var rows = [];
    if (s && s.bands) {
      for (var b in sizes) {
        var d = s.bands[b] || { n: 0, k: 0, f: 0 };
        rows.push({ band: +b, N: sizes[b], n: d.n, p: d.n ? (d.k + 0.5 * d.f) / d.n : null });
      }
      rows.sort(function (x, y) { return x.band - y.band; });
      return { rows: rows, source: 'sample', n: s.n, ts: s.ts };
    }
    var pool = activePool(), acc = {};
    for (var i = 0; i < pool.length; i++) {
      var st = A.getSt(pool[i]);
      if (st === undefined) continue;
      var bd = A.bandOf(pool[i]);
      if (!acc[bd]) acc[bd] = { n: 0, k: 0, f: 0 };
      acc[bd].n++;
      if (st === 2) acc[bd].k++; else if (st === 1) acc[bd].f++;
    }
    for (var bb in sizes) {
      var a = acc[bb] || { n: 0, k: 0, f: 0 };
      rows.push({ band: +bb, N: sizes[bb], n: a.n, p: a.n ? (a.k + 0.5 * a.f) / a.n : null });
    }
    rows.sort(function (x, y) { return x.band - y.band; });
    return { rows: rows, source: 'tested', n: pool.filter(function (i) { return A.getSt(i) !== undefined; }).length };
  };

  /* ================= 词汇地图 =================
     把「我到底哪儿是空的」变成一眼能看见的东西：
     纵轴是词频段（越靠上越常用），横轴是首字母，每格是这个交叉点上的掌握率。
       颜色 = 掌握程度（绿 / 黄 / 红）
       颜色的浓淡 = 这一格被测过多少
     所以「一片浅色」= 整块没测过，「深红」= 都测过且都不会。
     点任意一格可以直接复测那一块 —— 地图不只是张图，是入口。 */
  A.MAP_BANDS = [1, 2, 3, 4, 5, 6, 0];        // 展示顺序：最高频压顶，20k 以外垫底
  A.MAP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  A.vocabMap = function () {
    var pool = activePool();
    var cell = {};
    A.MAP_BANDS.forEach(function (b) {
      A.MAP_LETTERS.forEach(function (L) {
        cell[b + '|' + L] = { band: b, letter: L, N: 0, tested: 0, k: 0, f: 0, u: 0 };
      });
    });
    for (var n = 0; n < pool.length; n++) {
      var i = pool[n], w = WORDS[i];
      var L = String(w.w).charAt(0).toUpperCase();
      if (L < 'A' || L > 'Z') continue;        // 非字母开头的不进网格，避免撑破 26 列
      var c = cell[A.bandOf(i) + '|' + L];
      if (!c) continue;
      c.N++;
      var s = A.getSt(i);
      if (s === 2) { c.k++; c.tested++; }
      else if (s === 1) { c.f++; c.tested++; }
      else if (s === 0) { c.u++; c.tested++; }
    }

    var rows = [], hot = [], untestedCells = 0, testedCells = 0, cellsWithWords = 0;
    A.MAP_BANDS.forEach(function (b) {
      var bandName = A.BAND_NAMES[b] || ('频段 ' + b);
      var cells = A.MAP_LETTERS.map(function (L) {
        var c = cell[b + '|' + L];
        c.name = bandName;                      // 格子自己要带段名，否则「洞口最大的三块」会只显示字母
        c.score = c.k + 0.5 * c.f;              // 与全站口径一致：模糊算一半
        c.ratio = c.N ? c.score / c.N : 0;
        /* 「缺口」和「没测过」是两件事，必须分开：
             gap      = 测过但没掌握的词（这是真正的洞，值得优先补）
             untested = 压根没测过的词（这是"未知"，不构成结论）
           混在一起会把"整块没测"说成"缺口最大"，那是误导。 */
        c.gap = Math.max(0, Math.round(c.tested - c.score));
        c.untested = Math.max(0, c.N - c.tested);
        c.deficit = Math.max(0, Math.round(c.N - c.score));
        if (c.N) cellsWithWords++;
        if (c.N && !c.tested) untestedCells++;
        if (c.tested) testedCells++;
        if (c.tested > 0 && c.gap > 0) hot.push(c);
        return c;
      });
      rows.push({ band: b, name: bandName, cells: cells });
    });
    hot.sort(function (a, b) { return b.gap - a.gap; });

    return {
      rows: rows, letters: A.MAP_LETTERS,
      testedCells: testedCells, untestedCells: untestedCells, cellsWithWords: cellsWithWords,
      hot: hot.slice(0, 3)
    };
  };

  /* 某格里的「缺口词」（未测 + 模糊 + 不认识），给地图的「点一下复测」用 */
  A.mapCellWords = function (band, letter) {
    var out = [], pool = activePool();
    for (var n = 0; n < pool.length; n++) {
      var i = pool[n];
      if (A.bandOf(i) !== band) continue;
      if (String(WORDS[i].w).charAt(0).toUpperCase() !== letter) continue;
      var s = A.getSt(i);
      if (s === undefined || s === 0 || s === 1) out.push(i);
    }
    return out;
  };

  /* 整库范围内「还没测过」的词 —— 地图上那片浅色区域的合计 */
  A.untestedWords = function () {
    var out = [], pool = activePool();
    for (var n = 0; n < pool.length; n++) if (A.getSt(pool[n]) === undefined) out.push(pool[n]);
    return out;
  };

  /* 用当前会话的作答实时算出分层估计（探测模式边测边用） */
  A.probeStats = function (sess) {
    var sizes = A.bandSizes(), universe = 0, data = {};
    for (var b in sizes) { universe += sizes[b]; data[b] = { N: sizes[b], n: 0, k: 0, f: 0 }; }
    for (var i = 0; i < sess.log.length; i++) {
      var e = sess.log[i], bd = A.bandOf(e.i);
      if (!data[bd]) data[bd] = { N: 0, n: 0, k: 0, f: 0 };
      data[bd].n++;
      if (e.v === 2) data[bd].k++;
      else if (e.v === 1) data[bd].f++;
    }
    var est = stratEstimate(scoreBands(data, false), universe);
    if (!est) return { n: sess.log.length, universe: universe, data: data, half: Infinity, vocab: 0, lo: 0, hi: 0 };
    est.n = sess.log.length;
    est.data = data;
    return est;
  };
  A.estimate = estimate;

  /* 词汇量估算口径（这是整个工具最容易被误读的数字，所以口径写死在这里）：
     1) 已覆盖 95% 以上词库 → 直接数，接近实测；
     2) 否则只认「快速摸底」产生的随机样本——分组检测的词虽然已打乱顺序，但
        「测哪几组」是用户自己挑的（有选择偏差），薄弱词复测更是全是不会的词，
        两者都不能外推到整个词库；
     3) 随机样本不足 20 词时不给数字。 */
  /* 抽样必须和词库对应：四级抽的样不能拿来估六级 */
  /* 抽样样本 → 分层数据（四选一模式先扣除蒙对） */
  function sampleBands(s, strict) {
    var b = scoreBands(s.bands, strict);
    return s.mode === 'choice' ? unguessBands(b, 4) : b;
  }
  function looseBands(s) { return sampleBands(s, false); }
  function strictBands(s) { return sampleBands(s, true); }
  function latestSample() {
    var arr = S.samples || [];
    for (var i = arr.length - 1; i >= 0; i--) if ((arr[i].bank || 'c4') === bankKey()) return arr[i];
    return null;
  }
  A.latestSample = latestSample;
  A.addSample = function (o) {
    if (!S.samples) S.samples = [];
    S.samples.push({
      ts: Date.now(), n: o.n, k: o.k, f: o.f,
      pre: o.pre || 0, bank: o.bank || bankKey(),
      mode: o.mode || 'self', bands: o.bands || null
    });
    while (S.samples.length > 20) S.samples.shift();
  };
  A.estimateNow = function () {
    var pool = activePool();
    var t = tally(pool);
    // 口径由设置决定：默认「折中」（认识 + 模糊×0.5），可切换为「严格」（只算认识）；
    // 两个口径的数值都会返回，界面上同时展示，避免"这个数怎么来的"说不清
    if (t.total && t.tested / t.total >= 0.95) {
      return {
        kind: 'full', tally: t,
        vocab: Math.round(scoreOf(t, S.settings.strict)),
        strictVocab: Math.round(t.k), looseVocab: Math.round(t.k + 0.5 * t.f)
      };
    }
    var s = latestSample();
    if (s && s.n >= 20) {
      // 有分层数据就用分层估计（区间更窄），否则退回简单比例估计
      var useBands = !!s.bands;
      var loose = useBands ? stratEstimate(looseBands(s), t.total) : estimate(s.n, scoreOf(s, false), t.total);
      var strict = useBands ? stratEstimate(strictBands(s), t.total) : estimate(s.n, scoreOf(s, true), t.total);
      if (!loose) return { kind: 'none', tally: t };
      loose.kind = 'sample'; loose.n = s.n; loose.ts = s.ts; loose.tally = t;
      loose.strictVocab = strict ? strict.vocab : loose.vocab;
      loose.looseVocab = loose.vocab;
      loose.strictLo = strict ? strict.lo : loose.lo;
      loose.strictHi = strict ? strict.hi : loose.hi;
      loose.pre = s.pre || 0;                   // 抽样中此前已测过的词数 → 复习效应提示
      loose.unguessed = s.mode === 'choice';    // 该样本是否已扣除蒙对
      loose.stratified = useBands;
      return loose;
    }
    return { kind: 'none', tally: t };
  };

  function levelText(v) {
    if (v >= 4200) return { t: '优秀 · 词汇量已达标', d: '四级大纲词汇基本全覆盖，可以把精力放在真题阅读与写作上。' };
    if (v >= 3500) return { t: '良好 · 接近大纲要求', d: '核心词汇掌握不错，重点补齐「模糊」的那部分词。' };
    if (v >= 2500) return { t: '中等 · 有明显缺口', d: '日常阅读能应付，但高频词仍有漏洞，建议按分组逐组检测，把薄弱词复测到认识。' };
    if (v >= 1500) return { t: '偏弱 · 需要系统背词', d: '建议每天固定 50-100 词，先用「快速摸底 → 分组检测」定位薄弱区间。' };
    return { t: '基础薄弱 · 从高频词开始', d: '先过高中/初中核心词，再来刷四级大纲，效果更好。' };
  }
  A.levelText = levelText;

  /* ================= 多轮检测（轮次 / 快照 / 逐词对比） =================
     为什么要多轮：单轮只能告诉你"现在是多少"。有了两轮完整实测，就能算出
     哪些词是这一轮真正学进来的（上轮不认识→这轮认识）、哪些是背了又忘的
     （上轮认识→这轮不认识）。后者才是复习的第一优先级，单轮永远做不出来。
     每轮归档两样东西：
       1) 聚合报告快照 —— 给"历轮报告"和趋势图用
       2) 逐词状态位图 —— 2 bit/词，7175 词约 1.8 KB，给逐词对比用
     词表可能随版本变化，所以连指纹一起存；指纹对不上就只做聚合对比，不硬算逐词差异。 */
  var ROUNDS_MAX = 12;

  function wordsFingerprint() {
    var h = 2166136261;
    for (var i = 0; i < WORDS.length; i++) {
      var w = WORDS[i].w;
      for (var j = 0; j < w.length; j++) { h ^= w.charCodeAt(j); h = (h * 16777619) >>> 0; }
      h ^= i; h = (h * 16777619) >>> 0;
    }
    return WORDS.length + ':' + h.toString(36);
  }

  // 每词 2 bit：0 未测 / 1 不认识 / 2 模糊 / 3 认识。字段总是 2 bit 且起点落在偶数位，不会跨字节。
  function packStates() {
    var n = WORDS.length, buf = new Uint8Array(Math.ceil(n * 2 / 8));
    for (var i = 0; i < n; i++) {
      var st = A.getSt(i);
      var v = st === undefined ? 0 : (st + 1);
      var pos = i * 2;
      buf[pos >> 3] |= (v << (pos & 7)) & 0xff;
    }
    return buf;
  }
  function unpackStates(buf) {
    var n = Math.min(WORDS.length, buf.length * 4), out = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      var pos = i * 2;
      out[i] = (buf[pos >> 3] >> (pos & 7)) & 3;
    }
    return out;
  }
  function b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return btoa(s); } catch (e) { return ''; }
  }
  function unb64(str) {
    try {
      var s = atob(str), out = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
      return out;
    } catch (e) { return null; }
  }

  A.roundNo = function () { return (S.round && S.round.n) || 1; };
  A.roundHistory = function () { return S.rounds || []; };
  /* 能不能开新一轮：本轮要测完（覆盖 ≥95%，与报告口径一致）才值得归档 */
  A.canRetest = function () { return A.levelReport().ready; };

  function roundSnapshot() {
    var R = A.levelReport();
    return {
      n: A.roundNo(),
      bank: R.bank.key, bankName: R.bank.name,
      startedAt: (S.round && S.round.startedAt) || Date.now(),
      finishedAt: Date.now(),
      bankSize: R.total, tested: R.tested, coverage: +R.coverage.toFixed(4),
      k: R.k, f: R.f, u: R.u,
      loose: R.loose, strict: R.strict, ratio: +R.ratio.toFixed(4),
      rank: R.rank.k, rankName: R.rank.name, rankTone: R.rank.tone,
      capped: !!(R.cap && R.cap !== R.rankByRatio),
      bands: R.bands.map(function (b) { return { band: b.band, N: b.N, k: b.k, f: b.f, u: b.u }; }),
      fp: wordsFingerprint(),
      snap: b64(packStates())
    };
  }

  /* 归档本轮 + 清空作答，开下一轮。
     清的是"工作状态"（作答、会话、样本、历史），不动已归档的报告。 */
  A.startNewRound = function () {
    if (!A.canRetest()) return false;
    if (!S.rounds) S.rounds = [];
    S.rounds.push(roundSnapshot());
    while (S.rounds.length > ROUNDS_MAX) S.rounds.shift();

    var pool = activePool();
    for (var i = 0; i < pool.length; i++) A.clearSt(pool[i]);
    S.session = null;
    S.lastResult = null;
    S.samples = [];
    S.history = [];
    S.round = { n: A.roundNo() + 1, startedAt: Date.now() };
    A.save();
    return true;
  };

  /* 逐词对比：本轮 vs 上一轮归档。
     返回 null = 还没有上一轮；stale = 词表变了，只能做聚合对比。 */
  A.roundDiff = function () {
    var rounds = S.rounds || [];
    if (!rounds.length) return null;
    var prev = rounds[rounds.length - 1];
    if (prev.fp !== wordsFingerprint()) return { stale: true, prev: prev };

    var buf = unb64(prev.snap || '');
    if (!buf) return { stale: true, prev: prev };
    var prevSt = unpackStates(buf);

    var res = {
      prev: prev, stale: false,
      prevKnown: 0, retained: 0, forgotten: [], forgottenIdx: [],
      gained: 0, stuck: 0, compared: 0, byBand: {}
    };
    for (var i = 0; i < prevSt.length; i++) {
      var p = prevSt[i];
      if (p === 0) continue;                     // 上一轮没测过这个位置，不参与比较
      var cur = A.getSt(i);
      if (cur === undefined) continue;           // 本轮还没测到
      var cv = cur + 1;
      res.compared++;
      if (p === 3) {                             // 上轮：认识
        res.prevKnown++;
        if (cv === 3) res.retained++;
        else {
          res.forgottenIdx.push(i);              // 背了又忘 —— 复习第一优先
          var bd = A.bandOf(i);
          res.byBand[bd] = (res.byBand[bd] || 0) + 1;
        }
      } else if (cv === 3) {
        res.gained++;                            // 上轮不会 / 模糊 → 这轮认识
      }
      if (p === 2 && cv === 2) res.stuck++;      // 两轮都模糊，一直没拿下
    }
    res.forgottenCount = res.forgottenIdx.length;
    res.forgotten = res.forgottenIdx.slice(0, 24);   // 卡片上只摆前 24 个
    res.keepRate = res.prevKnown ? res.retained / res.prevKnown : null;
    return res;
  };

  /* ================= 词汇等级评估（完整检测报告用） =================
     口径：等级取决于「当前词库的掌握率」，所以同一套比例在四级（4540 词）和
     六级（5716 词）上会换算成不同的绝对词数 —— 四级 85% 是 3859 词，六级 85% 是 4859 词。
     分级线是本工具自定的，依据两点：
       a) 大纲词汇不是"全认识才及格"，但掌握率过低时阅读会被生词拖住；
       b) 二语阅读研究里 95% / 98% 文字覆盖率分别是"能理解"与"无障碍"的参考线，
          所以把 92% / 95% / 98% 标成阶梯上方的参考刻度，而不是硬性及格线。
     掌握率用「认识 + 模糊×0.5」的折中口径（与全站一致），另给严格口径对照。 */
  A.RANKS = [
    { k: 'S', name: '卓越', min: 0.92, tone: 'ok',
      desc: '大纲词汇几乎全覆盖，阅读基本没有生词障碍，可以直接上真题和写作。',
      next: '保持复现：每周过一遍「模糊」词，防止回落。' },
    { k: 'A', name: '优秀', min: 0.85, tone: 'ok',
      desc: '核心词汇扎实，只剩零散漏洞，属于"能考、能读"的水平。',
      next: '往 92% 顶：重点是把「模糊」那部分词转成确定认识。' },
    { k: 'B+', name: '良好', min: 0.75, tone: 'warn',
      desc: '高频词基本拿下，中低频段还有成片缺口。',
      next: '按频段补：优先填 3k-5k 段的缺口，同样的时间收益最大。' },
    { k: 'B', name: '中等', min: 0.65, tone: 'warn',
      desc: '日常阅读能应付，但写作和长难句会频繁卡词。',
      next: '每天固定 50 词，用「分组检测」一段一段推进。' },
    { k: 'C', name: '偏弱', min: 0.50, tone: 'bad',
      desc: '高频词仍有明显漏洞，阅读速度会被生词拖住。',
      next: '先只练最高频 2k 词，把地基打牢再往上走。' },
    { k: 'D', name: '基础薄弱', min: 0, tone: 'bad',
      desc: '大纲词汇掌握不到一半，直接刷题会一直在查词。',
      next: '从高中/初中核心词补起，再回来刷四六级大纲。' }
  ];
  // 报告里标在阶梯上的参考刻度
  A.RANK_REFS = [
    { p: 0.98, label: '98%', note: '无障碍阅读参考线' },
    { p: 0.95, label: '95%', note: '可理解阅读参考线' }
  ];
  function rankAt(ratio) {
    for (var i = 0; i < A.RANKS.length; i++) if (ratio >= A.RANKS[i].min) return A.RANKS[i];
    return A.RANKS[A.RANKS.length - 1];
  }
  A.rankAt = rankAt;
  function rankByKey(k) {
    for (var i = 0; i < A.RANKS.length; i++) if (A.RANKS[i].k === k) return A.RANKS[i];
    return null;
  }
  /* 地基约束：只看总掌握率会得出荒谬结论——
     把最高频 1k 段整段丢掉，总掌握率还有 85%，按比例照样能评"优秀"，
     可这样的词汇结构读任何一段真实文本都会卡。所以高频段没打好时给等级封顶。 */
  A.RANK_CAPS = [
    { below: 0.60, cap: 'C' },
    { below: 0.75, cap: 'B+' },
    { below: 0.85, cap: 'A' }
  ];

  /* 频段序号 → 频次高低（0 号段是「20k 以外」，最冷门，要排到最后） */
  function freqRank(b) { return b === 0 ? 99 : b; }
  A.freqRank = freqRank;

  /* 一次完整检测的精准统计：不走抽样估计，直接数每个词的作答状态。
     这是"全部测完"才有意义的做法，也是这份报告敢叫"专业"的底气。 */
  function censusBands(pool) {
    var map = {};
    for (var n = 0; n < pool.length; n++) {
      var i = pool[n], s = A.getSt(i), b = A.bandOf(i);
      if (!map[b]) map[b] = { band: b, N: 0, tested: 0, k: 0, f: 0, u: 0 };
      var d = map[b];
      d.N++;
      if (s === 2) { d.k++; d.tested++; } else if (s === 1) { d.f++; d.tested++; } else if (s === 0) { d.u++; d.tested++; }
    }
    var rows = Object.keys(map).map(function (k) { return map[k]; });
    rows.sort(function (a, b) { return freqRank(a.band) - freqRank(b.band); });
    rows.forEach(function (r) {
      r.score = r.k + 0.5 * r.f;
      r.ratio = r.N ? r.score / r.N : 0;
      r.deficit = Math.max(0, Math.round(r.N - r.score));      // 还差多少"词"才算这段全掌握
      r.name = A.BAND_NAMES[r.band] || ('频段 ' + r.band);
    });
    return rows;
  }
  A.censusBands = censusBands;

  /* 完整检测报告的完整数据模型。一处算完，视图只负责排版，
     这样以后要接 AI 或导出 PDF 都不用重算。 */
  A.levelReport = function () {
    var pool = activePool();
    var t = tally(pool);
    var total = t.total || 1;
    var loose = t.k + 0.5 * t.f;
    var strict = t.k;
    var ratio = loose / total;
    var byRatio = rankAt(ratio);

    var bands = censusBands(pool);
    /* 地基约束：最高频 1k 段掌握率太低就封顶（见 A.RANK_CAPS） */
    var topBand = null;
    for (var bi = 0; bi < bands.length; bi++) if (bands[bi].band === 1) { topBand = bands[bi]; break; }
    var cap = null;
    if (topBand && topBand.N > 0) {
      for (var ci = 0; ci < A.RANK_CAPS.length; ci++) {
        if (topBand.ratio < A.RANK_CAPS[ci].below) { cap = rankByKey(A.RANK_CAPS[ci].cap); break; }
      }
    }
    var rank = byRatio;
    if (cap && A.RANKS.indexOf(cap) > A.RANKS.indexOf(byRatio)) rank = cap;

    var ri = A.RANKS.indexOf(rank);
    var nextRank = ri > 0 ? A.RANKS[ri - 1] : null;
    var toNext = nextRank ? Math.max(0, Math.ceil(nextRank.min * total - loose)) : 0;
    var coverage = t.tested / total;

    /* 提升优先级不能只看"哪段缺得多"。一个词的价值大致和它出现的频率成正比，
       10k-20k 段缺 423 词，但那些词你可能一年也遇不到几次；
       最高频段缺 13 词，却每次阅读都会撞上。所以按「缺口 × 词频权重」排序，
       权重大致取该段词频中位数的倒数（以最高频 1k 段 = 1 归一化）。 */
    var BAND_W = { 1: 1, 2: 0.33, 3: 0.20, 4: 0.125, 5: 0.067, 6: 0.033, 0: 0.02 };
    var gainTop = bands.filter(function (r) { return r.deficit > 0; })
      .map(function (r) {
        r.w = BAND_W[r.band] === undefined ? 0.1 : BAND_W[r.band];
        r.gain = r.deficit * r.w;
        return r;
      })
      .sort(function (a, b) { return b.gain - a.gain; })
      .slice(0, 3);
    // 缺口绝对值最大的三段，作为"想快速涨数字"的另一视角
    var deficitTop = bands.filter(function (r) { return r.deficit > 0; })
      .slice().sort(function (a, b) { return b.deficit - a.deficit; }).slice(0, 3);
    // 地基漏洞：最高频 2k 段里还不认识/模糊的词，最影响阅读速度
    var baseRows = bands.filter(function (r) { return freqRank(r.band) <= 2; });
    var baseGap = baseRows.reduce(function (s, r) { return s + Math.round(r.deficit); }, 0);

    var knownish = t.k + t.f;
    return {
      bank: { key: bankKey(), name: A.bankName(), size: total },
      ready: coverage >= 0.95,                 // 与全站估算口径一致：覆盖 95% 以上按实测
      coverage: coverage,
      tested: t.tested, total: total, remaining: total - t.tested,
      k: t.k, f: t.f, u: t.u,
      loose: Math.round(loose), strict: strict,
      ratio: ratio,
      rank: rank, rankByRatio: byRatio, cap: cap, capBandRatio: topBand ? topBand.ratio : null,
      nextRank: nextRank, toNext: toNext,
      bands: bands, gainTop: gainTop, deficitTop: deficitTop, baseGap: baseGap,
      fuzzyShare: knownish ? t.f / knownish : 0,   // 「有印象」里有多少是不确定的
      refs: A.RANK_REFS,
      perDay: 50
    };
  };


  /* ---------- 例句（来自 Tatoeba 英中对照语料，构建期内联） ---------- */
  function examplesOf(word) {
    var bag = window.SENTENCES;
    if (!bag) return [];
    var arr = bag[String(word).toLowerCase()];
    if (!arr || !arr.length) return [];
    // 内联格式是单条 [英文, 中文]；后端接口返回的是 [{en, zh}, ...]，两种都兼容
    if (typeof arr[0] === 'string') return [{ e: arr[0], z: arr[1] }];
    return arr.map(function (it) {
      return { e: it.e || it.en, z: it.z || it.zh };
    });
  }
  A.examplesOf = examplesOf;
  A.hasExamples = function () { return !!window.SENTENCES; };

  /* 把例句里的目标词加粗（按词边界匹配，避免 "art" 命中 "start"） */
  function highlightWord(text, word) {
    var w = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('\\b(' + w + ')(s|es|ed|ing|d)?\\b', 'gi');
    return esc(text).replace(re, function (m) { return '<b>' + m + '</b>'; });
  }
  A.highlightWord = highlightWord;

  /* ---------- 发音 ---------- */
  var voice = null;
  function pickVoice() {
    if (!window.speechSynthesis) return;
    var vs = window.speechSynthesis.getVoices() || [];
    for (var i = 0; i < vs.length; i++) { if (/^en[-_]US/i.test(vs[i].lang)) { voice = vs[i]; return; } }
    for (var j = 0; j < vs.length; j++) { if (/^en/i.test(vs[j].lang)) { voice = vs[j]; return; } }
  }
  if (window.speechSynthesis) { pickVoice(); window.speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(text) {
    if (!S.settings.sound) { toast('发音已在设置中关闭'); return; }
    if (!window.speechSynthesis) { toast('当前浏览器不支持语音朗读'); return; }
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.88;
      if (voice) u.voice = voice;
      window.speechSynthesis.speak(u);
    } catch (e) { toast('发音失败'); }
  }
  A.speak = speak;

  /* ---------- 环形进度 ---------- */
  function ring(percent, big, small) {
    var r = 50, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, percent)) / 100);
    return tpl(
      '<div class="ring"><svg width="118" height="118" viewBox="0 0 118 118">' +
      // 注意：SVG 的 presentation attribute 不支持 var()，CSS 变量必须写在 style 里
      '<circle cx="59" cy="59" r="50" fill="none" style="stroke:var(--line2)" stroke-width="9"/>' +
      '<circle cx="59" cy="59" r="50" fill="none" style="stroke:var(--accent)" stroke-width="9" stroke-linecap="round" ' +
      'stroke-dasharray="{c}" stroke-dashoffset="{off}"/></svg>' +
      '<div class="ring-txt"><div><b>{big}</b><br><i>{small}</i></div></div></div>',
      { c: c.toFixed(1), off: off.toFixed(1), big: big, small: small });
  }
  A.ring = ring;

  /* ---------- 动效层 ----------
     只在切换页面时播放。答题过程中每答一题都会整页重渲染，若每次重播动画会很晃眼。 */
  var motionArmed = false;
  A.armMotion = function () { motionArmed = true; };
  function reduceMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function playMotion(v) {
    if (!v || reduceMotion()) return;
    // 页面进场
    v.classList.remove('enter');
    void v.offsetWidth;
    v.classList.add('enter');
    // 数字滚动
    Array.prototype.forEach.call(v.querySelectorAll('[data-count]'), function (node) {
      var to = parseInt(node.getAttribute('data-count'), 10);
      if (!isFinite(to) || to <= 0) return;
      var pre = node.getAttribute('data-pre') || '';
      var final = pre + to.toLocaleString('en-US');
      var t0 = 0, dur = 640;
      node.textContent = pre + '0';
      requestAnimationFrame(function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        node.textContent = pre + Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('en-US');
        if (p < 1) requestAnimationFrame(step);
      });
      // 兜底：标签页在后台时 rAF 可能被节流，1.2 秒后强制落到终值
      setTimeout(function () { if (node.textContent !== final) node.textContent = final; }, 1200);
    });
    // 条形生长
    var jobs = [];
    Array.prototype.forEach.call(v.querySelectorAll('.bar>i,.gbtn i>em,.bbar>i,.segbar>i,.stack i'), function (b) {
      var w = b.style.width, hh = b.style.height;
      if (w && w !== '0%') { jobs.push([b, 'width', w]); b.style.width = '0%'; }
      else if (hh && hh !== '0%') { jobs.push([b, 'height', hh]); b.style.height = '0%'; }
    });
    if (!jobs.length) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        jobs.forEach(function (j) { j[0].style[j[1]] = j[2]; });
      });
    });
    setTimeout(function () { jobs.forEach(function (j) { j[0].style[j[1]] = j[2]; }); }, 1000);
  }

  /* ---------- 路由 ---------- */
  var route = 'home';
  A.getRoute = function () { return route; };
  function go(r) {
    if (A.clearTimer) A.clearTimer();   // 离开答题页时立刻停掉自动跳转，避免在别的页面被强行推进
    route = r;
    motionArmed = true;
    A.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // 键盘/读屏用户切页后焦点要跟过去，否则还停在原来的导航按钮上
    var v = el('view');
    if (v && v.focus) { try { v.focus({ preventScroll: true }); } catch (e) { v.focus(); } }
  }
  A.go = go;

  A.render = function () {
    var v = el('view');
    var html = '';
    if (route === 'home') html = A.viewHome();
    else if (route === 'groups') html = A.viewGroups();
    else if (route === 'test') html = A.viewTest();
    else if (route === 'result') html = A.viewResult();
    else if (route === 'stats') html = A.viewStats();
    else if (route === 'report') html = A.viewReport ? A.viewReport() : '';
    else if (route === 'settings') html = A.viewSettings();
    var banner = A.storageBroken
      ? '<div class="card" style="border-color:var(--bad);background:var(--bad-soft);color:var(--bad);font-size:13px;line-height:1.7">' +
        '<b>无法保存作答数据</b>：浏览器禁止了本地存储（localStorage），刷新后会丢失。' +
        '可以试试：用 Chrome / Edge 直接打开这个文件、关闭无痕窗口，或在浏览器设置里允许本站保存数据。</div>'
      : '';
    v.innerHTML = banner + html;
    if (A.afterRender) A.afterRender();
    if (A.renderPet) { try { A.renderPet(); } catch (e) { /* 助手只是锦上添花，不能影响主流程 */ } }
    if (A.renderMail) { try { A.renderMail(); } catch (e) { /* 信封同理，出错也不能挡住页面 */ } }
    if (A.renderRail) { try { A.renderRail(); } catch (e) { /* 两侧信息栏，出错了页面照常 */ } }
    if (motionArmed) { motionArmed = false; playMotion(v); }
    // 顶栏与底部导航
    var t = tally(activePool());
    el('tbStat').textContent = A.bankName() + ' · ' + (t.tested ? ('已测 ' + t.tested + ' / ' + t.total) : (t.total + ' 词'));
    // 高亮跟着当前路由走。这里曾经把 groups 映射成 test，
    // 于是停在「分组」页时底部亮的却是「检测」——导航明明有独立的分组按钮，就该亮它。
    var navKey = route;
    var btns = document.querySelectorAll('.nav button');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-nav') === navKey;
      btns[i].className = on ? 'on' : '';
    }
    // 视效层跟着渲染更新（导航滑块 / 报告徽章高光）；失败也不能影响主流程
    if (A.fxUpdate) { try { A.fxUpdate(); } catch (e) {} }
  };

  /* ---------- 词库切换器 ---------- */
  A.bankSwitch = function () {
    var c = A.bankCounts();
    var h = '<div class="bankbar">';
    [['c4', '四级大纲', c.c4], ['c6', '六级大纲', c.c6]].forEach(function (x) {
      h += tpl('<button class="bank{on}" data-act="set-bank" data-bank="{k}" title="{hint}"><b>{name}</b><small>{n} 词</small></button>',
        { on: bankKey() === x[0] ? ' on' : '', k: x[0], name: x[1], n: x[2], hint: BANKS[x[0]].hint });
    });
    h += '</div>';
    return h;
  };

  /* 目标精度 → 大致需要多少题（简单比例 × 分层约省三成），以及按 2.5 秒/题折算的用时 */
  function needFor(half) {
    var p = 0.6, N = activePool().length || 4540;
    return Math.max(20, Math.round(p * (1 - p) * Math.pow(1.96 * N / half, 2) * 0.7 / 10) * 10);
  }
  function minsText(n) { return Math.max(1, Math.round(n * 2.5 / 60)) + ' 分钟'; }
  A.needFor = needFor;
  A.minsText = minsText;

  /* ---------- 首页 ---------- */
  A.viewHome = function () {
    var pool = activePool();
    var t = tally(pool);
    var es = A.estimateNow();
    var title, heroNum, sub;
    var strict = !!S.settings.strict;
    var bs = A.bankShort();
    if (es.kind === 'full') {
      var mainFull = strict ? es.strictVocab : es.looseVocab;
      title = bs + '大纲 · 词汇量估算'; heroNum = '<span data-count="' + mainFull + '">' + mainFull.toLocaleString('en-US') + '</span><i>词</i>';
      sub = '已覆盖 ' + pct(t.tested, t.total) + '% 词库，接近实测值 · 严格口径（只算认识）' + es.strictVocab.toLocaleString('en-US') +
        ' 词 / 折中口径（模糊算一半）' + es.looseVocab.toLocaleString('en-US') + ' 词';
    } else if (es.kind === 'sample') {
      var main = strict ? es.strictVocab : es.looseVocab;
      var lo = strict ? es.strictLo : es.lo, hi = strict ? es.strictHi : es.hi;
      title = bs + '大纲 · 词汇量估算'; heroNum = '<span data-count="' + main + '" data-pre="≈ ">≈ ' + main.toLocaleString('en-US') + '</span><i>词</i>';
      sub = '基于最近一次 ' + es.n + ' 词随机抽样（' + fmtDate(es.ts) + '）· 95% 区间 ' +
        lo.toLocaleString('en-US') + ' ~ ' + hi.toLocaleString('en-US') +
        ' · 另一口径 ' + (strict ? '折中（模糊算一半）' : '严格（只算认识）') + ' ≈ ' +
        (strict ? es.looseVocab : es.strictVocab).toLocaleString('en-US') + ' 词' +
        (es.n < 50 ? ' · 样本偏小，误差较大' : '') +
        (es.pre / es.n > 0.2 ? ' · 注意：本次抽样有 ' + Math.round(es.pre / es.n * 100) + '% 的词此前已测过，受复习效应影响估算可能偏高' : '');
    } else {
      title = '还没有可靠的词汇量估算'; heroNum = '';
      sub = t.tested
        ? ('已测 ' + t.tested + ' 词，但这些数据来自分组检测，不是随机抽样，不能外推成词汇量。做一次「快速摸底」即可得到估算。')
        : '先做一次「快速摸底」（随机抽 100 词，约 3 分钟），就能得到带置信区间的词汇量估算。';
    }

    var h = '';
    h += '<div class="home-toprow">' + A.bankSwitch();
    if (A.roundNo() > 1) {
      h += '<span class="round-badge" title="当前是第 ' + A.roundNo() + ' 轮检测">第 ' + A.roundNo() + ' 轮</span>';
    }
    // 完成整库检测后才出现：多轮对比要两轮都测完才有意义
    if (A.canRetest()) {
      h += '<button class="btn retest-btn" data-act="new-round">重新测试 · 开始第 ' + (A.roundNo() + 1) + ' 轮</button>';
    }
    h += '</div>';
    if (es.kind === 'none') {
      /* 第一次打开时，屏幕上应该是"点哪里"，而不是术语。
         主路径只留一条（快速摸底），第二条是"想更准"的可选项。 */
      var nFast = needFor(400), nStd = needFor(250);
      h += '<div class="hero intro">';
      h += '<h1>几分钟，测出你的' + bs + '词汇量</h1>';
      h += '<p>按词频分层随机抽题，测完给你一个<b>带误差范围</b>的数字，以及各频段的强弱分布。</p>';
      if (t.tested) h += '<p class="hero-note">你已测过 ' + t.tested + ' 词（来自分组检测）——那不是随机抽样，算不出词汇量，补一次摸底就行。</p>';
      h += '<div class="hero-cta">' +
        '<button class="btn primary lg fx-shine fx-magnet" data-act="start" data-kind="probe" data-target="400">快速摸底 · 约 ' + nFast + ' 题 · ' + minsText(nFast) + '</button>' +
        '<button class="btn lg outline-light" data-act="start" data-kind="probe" data-target="250">更准一点 · 约 ' + nStd + ' 题 · ' + minsText(nStd) + '</button>' +
        '</div>';
      h += '<p class="hero-note">中途随时可以停，做题记录会保留；下次打开接着测。</p>';
      h += '</div>';
    } else {
      h += '<div class="hero">';
      h += '<h1><span class="tiny" style="font-family:var(--mono);letter-spacing:.1em;text-transform:uppercase">' +
        esc(title) + '</span><b>' + heroNum + '</b></h1>';
      h += '<p>' + sub + '</p>';
      h += '<div class="hero-main">';
      h += ring(pct(t.tested, t.total), pct(t.tested, t.total) + '%', '已检测');
      h += '<div class="grow">';
      h += '<div class="hero-stat" style="margin-top:0;border-top:none;padding-top:0">';
      h += '<div>认识<b>' + t.k + '</b></div><div>模糊<b>' + t.f + '</b></div><div>不认识<b>' + t.u + '</b></div><div>未检测<b>' + t.rest + '</b></div>';
      h += '</div></div></div></div>';
    }

    if (S.session && S.session.queue && S.session.queue.length) {
      var left = S.session.queue.length - S.session.pos;
      h += '<div class="card" style="margin-top:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
        '<div class="grow"><b>上次检测还没做完</b><div class="tiny">' + esc(S.session.label) + ' · 还剩 ' + left + ' 词</div></div>' +
        '<button class="btn primary" data-act="resume">继续检测</button>' +
        '<button class="btn ghost sm" data-act="drop-session">放弃</button></div>';
    }

    h += '<div class="modes">';
    if (es.kind !== 'none') {           // 已经测过就允许再选一次精度
      h += '<div class="mode probe"><b><em class="badge">01</em>再测一次摸底</b>' +
        '<span>精度越高题越多；测完自动结束</span>' +
        '<div class="presets">' +
        '<button data-act="start" data-kind="probe" data-target="400"><b>±400 词</b><small>约 ' + needFor(400) + ' 题 · ' + minsText(needFor(400)) + '</small></button>' +
        '<button data-act="start" data-kind="probe" data-target="250"><b>±250 词</b><small>约 ' + needFor(250) + ' 题 · ' + minsText(needFor(250)) + '</small></button>' +
        '<button data-act="start" data-kind="probe" data-target="150"><b>±150 词</b><small>约 ' + needFor(150) + ' 题 · ' + minsText(needFor(150)) + '</small></button>' +
        '</div></div>';
    }
    h += '<button class="mode" data-act="start" data-kind="all"><b><em class="badge">02</em>完整检测 · ' + pool.length + ' 词</b>' +
      '<span>从头到尾过一遍' + A.bankName() + '，拿到实测值；随时中断、可分多次；也能在「分组」里按 100 词一组推进</span></button>';
    h += '</div>';

    h += '<div class="sec-title">分组进度<span class="line"></span><span class="tiny">点任意一组开始</span></div>';
    h += A.groupGrid(12);

    var bc = A.bankCounts();
    h += '<details class="card tips"><summary>词库与判定标准（点开看）</summary><div class="tiny" style="line-height:1.9;margin-top:10px">' +
      '当前词库：<b>' + A.bankName() + ' ' + pool.length + ' 词</b>（' + A.bankHint() + '）' +
      (S.settings.includeExt ? '，已含拓展派生词' : '，不含拓展派生词') + '，全部带国际音标。<br>' +
      '两套词库：四级大纲 <b>' + bc.c4 + '</b> 词 ／ 六级大纲 <b>' + bc.c6 + '</b> 词（含四级全部，六级比四级多出 ' + (bc.c6 - bc.c4) + ' 词）。两者共用一份作答记录，四级测过的词切到六级不用重测。<br>' +
      '判定标准：<b>认识</b>=看到词能说出主要意思；<b>模糊</b>=见过但拿不准；<b>不认识</b>=没印象。词汇量按「认识×1 + 模糊×0.5」折算，且只采用随机抽样数据（分组检测的结果不外推）。<br>' +
      '所有作答只保存在你自己的浏览器里（localStorage），不会上传到任何地方。</div></details>';
    return h;
  };

  A.groupGrid = function (limit) {
    var gs = groups();
    var h = '<div class="groups">';
    var n = limit ? Math.min(limit, gs.length) : gs.length;
    for (var i = 0; i < n; i++) {
      var t = tally(gs[i]);
      var cls = t.tested === 0 ? 'gbtn' : (t.tested === t.total ? 'gbtn done' : 'gbtn part');
      var info = t.tested === 0 ? '未开始' : (t.tested + '/' + t.total);
      var pp = t.total ? Math.round(t.tested / t.total * 100) : 0;
      h += tpl('<button class="{cls}" data-act="start" data-kind="group" data-group="{g}" title="第 {n} 组 · {info}">' +
        '<b>第 {n} 组</b><i><em style="width:{pp}%"></em></i><small>{info}</small></button>',
        { cls: cls, g: i, n: (i + 1), info: info, pp: pp });
    }
    if (limit && gs.length > limit) h += '<button class="gbtn all" data-act="go" data-route="groups" title="查看全部 ' + gs.length + ' 组"><b>全部</b><small>' + gs.length + ' 组</small></button>';
    h += '</div>';
    return h;
  };

  A.viewGroups = function () {
    var gs = groups(), t = tally(activePool());
    var h = '';
    h += A.bankSwitch();
    h += '<div class="sec-title">分组检测<span class="line"></span><span class="tiny">共 ' + gs.length + ' 组 · 每组 ' + A.GROUP_SIZE + ' 词' + (S.settings.includeExt ? '（前 ' + A.coreGroupsCount() + ' 组为大纲核心词）' : '') + '</span></div>';
    h += '<div class="card"><div class="row" style="flex-wrap:wrap;gap:14px">' +
      '<div class="grow"><b>总体进度 ' + pct(t.tested, t.total) + '%</b><div class="tiny">' + A.bankName() + '：已检测 ' + t.tested + ' / ' + t.total + ' 词，其中认识 ' + t.k + ' 词</div>' +
      '<div class="bar" style="margin-top:8px"><i style="width:' + pct(t.tested, t.total) + '%"></i></div></div>' +
      '<button class="btn" data-act="start" data-kind="all">从第一个未测词继续</button>' +
      '<button class="btn ghost" data-act="start" data-kind="weak">复测薄弱词</button></div>';
    h += '<div class="legend"><span><i style="background:var(--ok)"></i>已完成</span><span><i style="background:var(--warn)"></i>进行中</span><span><i style="background:var(--line)"></i>未开始</span></div>';
    h += '</div>';
    h += A.groupGrid(0);
    return h;
  };

})(window.__APP__ || (window.__APP__ = {}));
