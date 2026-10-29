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

  /* 兜底清理：body 下不允许存在游离文本节点。
     历史上出过两次事故——data URI 被正则截断后，残余字符串被浏览器当成正文渲染到页面上
     （一次是 favicon 叠加了三份 data URI）。与其每次追根因，不如启动时统一清掉：
     正常的界面文字都在具体元素里，body 的直接文本子节点一定是残留。 */
  function stripStrayText() {
    try {
      Array.prototype.slice.call(document.body.childNodes).forEach(function (n) {
        if (n.nodeType === 3 && String(n.nodeValue || '').trim()) {
          if (window.console && console.warn) {
            console.warn('[清理游离文本]', JSON.stringify(String(n.nodeValue).slice(0, 60)));
          }
          document.body.removeChild(n);
        }
      });
    } catch (e) {}
  }
  A.stripStrayText = stripStrayText;

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

  /* ---------- 使用者档案 ----------
     为什么要有这个：作答数据存在浏览器 localStorage 里，同一台电脑上换个人用就会互相串
     （实验室机器、宿舍共用一台电脑）。换一台电脑本来就不串，所以只需解决"同机多人"。
     做法：每个档案一份独立数据；第一个档案沿用老的存储键，老数据和老测试都不受影响。 */
  var PROFILES_KEY = 'cet4vocab_profiles';

  function readMeta() {
    try {
      var raw = localStorage.getItem(PROFILES_KEY);
      var o = raw ? JSON.parse(raw) : null;
      if (o && Array.isArray(o.list) && o.list.length && o.active) return o;
    } catch (e) {}
    return null;
  }
  function writeMeta(o) {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(o)); A.storageBroken = false; }
    catch (e) { A.storageBroken = true; }
  }
  function mkPid() { return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36); }

  var META = readMeta();
  function meta() {
    if (META) return META;
    // 老用户：把现有的 cet4vocab_v1 认作第一个档案，数据一条不动
    META = { active: 'p1', list: [{ id: 'p1', name: '本机用户', createdAt: Date.now(), legacy: true }] };
    writeMeta(META);
    return META;
  }
  function activeRec() {
    var m = meta();
    for (var i = 0; i < m.list.length; i++) if (m.list[i].id === m.active) { m.list[i]._idx = i; return m.list[i]; }
    m.active = m.list[0].id;
    return m.list[0];
  }
  function dataKey(rec) { return (rec && rec.legacy) ? KEY : KEY + '::' + (rec ? rec.id : 'x'); }

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
      books: {},                                // 用户导入的自定义词书：{ id: {id,name,indices,...} }
      /* AI 额度：作者提供的 key 按"完成一次检测 = 授予一次诊断"发放。
         纯本地计数（无账号），因此只约束诚实用户；Key 本身也不进公开仓库（见 build --with-key）。 */
      aiQuota: { granted: 0, used: 0 },
      userKey: null,                            // 用户自带的 API Key 配置（只存本机，导出备份时剔除）
      welcomed: false,                          // 是否已过了"怎么称呼"那一步
      settings: { mode: 'self', autoNext: true, autoDelay: 850, sound: true, includeExt: false, strict: false, bank: 'c4', dailyMinutes: 30,
        accent: 'uk',              // 发音口音：uk 英式（默认）/ us 美式
        autoBothAccents: false },  // 揭示后连读两种口音（四六级听力是混合口音）
      theme: 'light',
      tokens: 0            // AI 诊断累计消耗的 token（用户视角的「投喂量」）
    };
  }
  function loadState(rawOverride) {
    var d = defaultState();
    try {
      var raw = rawOverride;
      if (raw === undefined) raw = localStorage.getItem(dataKey(activeRec()));
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
        d.books = (o.books && typeof o.books === 'object') ? o.books : {};
        d.aiQuota = (o.aiQuota && typeof o.aiQuota === 'object') ? o.aiQuota : { granted: 0, used: 0 };
        d.userKey = (o.userKey && typeof o.userKey === 'object' && o.userKey.key) ? o.userKey : null;
        // 老存档里可能残留一个已被删掉的词书 id：退回四级，避免打开就是空词库
        if (typeof d.settings.bank === 'string' && d.settings.bank.indexOf('u:') === 0 &&
            !d.books[d.settings.bank.slice(2)]) {
          d.settings.bank = 'c4';
        }
        d.welcomed = !!o.welcomed;
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
      localStorage.setItem(dataKey(activeRec()), JSON.stringify(S));
      A.storageBroken = false;
    } catch (e) {
      // 存储被禁用/写满：标记一次并让界面常驻提示，而不是悄悄丢数据
      if (!A.storageBroken) { A.storageBroken = true; if (A.render) A.render(); }
    }
  }
  A.save = save;

  /* ---------- 档案对外接口 ---------- */
  A.profileList = function () {
    return meta().list.map(function (r) { return { id: r.id, name: r.name, createdAt: r.createdAt, active: r.id === meta().active }; });
  };
  A.activeProfile = function () {
    var r = activeRec();
    return { id: r.id, name: r.name, createdAt: r.createdAt };
  };
  A.myName = function () { return activeRec().name || '本机用户'; };

  /* 就地换装：保持 A.S 这个对象引用不变，所有已有代码不用改 */
  function swapStateInto(next) {
    Object.keys(S).forEach(function (k) { delete S[k]; });
    Object.keys(next).forEach(function (k) { S[k] = next[k]; });
  }
  A.switchProfile = function (id) {
    var m = meta();
    if (id === m.active) return true;
    var found = false;
    for (var i = 0; i < m.list.length; i++) if (m.list[i].id === id) found = true;
    if (!found) return false;
    save();                        // 先把当前档案落盘
    m.active = id;
    writeMeta(m);
    swapStateInto(loadState());
    if (A.render) A.render();
    return true;
  };
  A.createProfile = function (name) {
    var m = meta();
    save();                        // 先保存当前档案
    var rec = { id: mkPid(), name: (name || '').trim() || ('使用者 ' + (m.list.length + 1)), createdAt: Date.now() };
    m.list.push(rec);
    m.active = rec.id;
    writeMeta(m);
    swapStateInto(loadState());    // 新档案是空的
    if (A.render) A.render();
    return rec;
  };
  A.renameProfile = function (id, name) {
    var m = meta(), n = (name || '').trim();
    if (!n) return false;
    for (var i = 0; i < m.list.length; i++) if (m.list[i].id === id) { m.list[i].name = n; break; }
    writeMeta(m);
    if (A.render) A.render();
    return true;
  };
  A.removeProfile = function (id) {
    var m = meta();
    if (m.list.length <= 1) return false;         // 至少留一个，否则数据无处安放
    var keep = null, removed = null;
    m.list = m.list.filter(function (r) { if (r.id === id) { removed = r; return false; } return true; });
    if (!removed) return false;
    try { localStorage.removeItem(dataKey(removed)); } catch (e) {}
    if (m.active === id) { m.active = m.list[0].id; swapStateInto(loadState()); }
    writeMeta(m);
    if (A.render) A.render();
    return true;
  };
  /* ================= 等级演示档案（给评委看六个等级长什么样） =================
     为什么需要：等级只升级一次，要展示"每个等级各自是什么样子"，靠现场答题是不可能的
     （测到 S 需要把手上的词背到 92%）。这里一次性生成 6 个使用者档案，每个档案的作答
     刚好落在对应等级上，之后在「使用者」面板里点一下就能切换。
     数据是真的让引擎算出来的：先按等级反推每个频段该有多少认识/模糊/不认识，
     再把这些词条写进作答状态，最后 rank 由 rankAt() 现算——不是往报告里贴一个假等级。
     设计上的两个约束：
       ① 高频段掌握率必须高于该等级的封顶线，否则会被地基约束压下去（生成后要校验）；
       ② 每个档案都是 100% 覆盖，这样首页显示"实测"、报告页才有等级与补词清单。 */
  var DEMO_PREFIX = '示例 · ';
  A.DEMO_PREFIX = DEMO_PREFIX;
  A.DEMO_LEVELS = [
    { k: 'S', name: '卓越', ratio: 0.94, top: 0.97, blurb: '大纲几乎全覆盖，可以直接上真题' },
    { k: 'A', name: '优秀', ratio: 0.88, top: 0.93, blurb: '核心扎实，只剩零散漏洞' },
    { k: 'B+', name: '良好', ratio: 0.80, top: 0.86, blurb: '高频词拿下，中低频成片缺口' },
    { k: 'B', name: '中等', ratio: 0.70, top: 0.78, blurb: '阅读能应付，写作长难句卡词' },
    { k: 'C', name: '偏弱', ratio: 0.57, top: 0.52, blurb: '高频词仍有明显漏洞' },
    { k: 'D', name: '基础薄弱', ratio: 0.38, top: 0.33, blurb: '不到一半，直接刷题一直在查词' }
  ];

  /* 给定各频段词数与目标总掌握率，解出一条"高频高、低频低"的等比下降曲线。
     为什么要解：总掌握率是各频段加权平均，只写死一个数会让高频段也掉下去，
     一掉到封顶线以下，等级就被压低了。 */
  function bandRatioCurve(sizes, targetRatio, topRatio) {
    var order = [1, 2, 3, 4, 5, 6, 0];
    var total = 0, b;
    for (b in sizes) total += sizes[b];
    var want = targetRatio * total;
    function sumAt(slope) {
      var s = 0;
      for (var k = 0; k < order.length; k++) {
        var r = topRatio - slope * k;
        if (r > 1) r = 1;
        if (r < 0) r = 0;
        s += (sizes[order[k]] || 0) * r;
      }
      return s;
    }
    var lo = 0, hi = 0.6;
    for (var it = 0; it < 60; it++) {
      var mid = (lo + hi) / 2;
      if (sumAt(mid) > want) lo = mid; else hi = mid;
    }
    var slope = (lo + hi) / 2, out = {};
    for (var k2 = 0; k2 < order.length; k2++) {
      var r2 = topRatio - slope * k2;
      out[order[k2]] = Math.max(0, Math.min(1, r2));
    }
    return out;
  }

  /* 稳定但打散的顺序：同一台机器每次生成的结果一样，方便复现与截图 */
  function demoSorted(list) {
    return list.slice().sort(function (a, b) {
      var ha = (a * 2654435761) % 4294967296, hb = (b * 2654435761) % 4294967296;
      return ha - hb || a - b;
    });
  }

  /* 生成 6 个等级演示档案。返回 [{name, rank, ratio}]，已按等级从高到低排好 */
  A.buildDemoProfiles = function () {
    var keep = A.activeProfile();
    var sizes = {};
    var pool = activePool();
    var byBand = {};
    for (var i = 0; i < pool.length; i++) {
      var b = A.bandOf(pool[i]);
      sizes[b] = (sizes[b] || 0) + 1;
      (byBand[b] = byBand[b] || []).push(pool[i]);
    }

    var made = [];
    A.DEMO_LEVELS.forEach(function (L) {
      var name = DEMO_PREFIX + L.k + ' ' + L.name;          // 例：示例 · S 卓越
      var id = null, list = A.profileList();
      for (var m = 0; m < list.length; m++) if (list[m].name === name) id = list[m].id;
      if (id) A.switchProfile(id); else A.createProfile(name);

      /* 清空这个档案，重新灌数据（可重复生成，不会叠加） */
      S.status = {};
      S.samples = [];
      S.rounds = [];
      S.session = null;
      S.lastResult = null;
      S.history = [];
      S.round = { n: 1, startedAt: Date.now() };

      var curve = bandRatioCurve(sizes, L.ratio, L.top);
      for (var bb in byBand) {
        var words = demoSorted(byBand[bb]);
        var N = words.length;
        var r = curve[bb] === undefined ? L.ratio : curve[bb];
        var score = N * r;
        var fuzzy = Math.round(score * 0.08);          // 8% 落在「模糊」，其余是「认识」
        var known = Math.max(0, Math.round(score - 0.5 * fuzzy));
        if (known + fuzzy > N) { fuzzy = Math.max(0, N - known); }
        for (var w = 0; w < N; w++) {
          A.setSt(words[w], w < known ? 2 : (w < known + fuzzy ? 1 : 0));
        }
      }

      /* 再补一条与作答一致的抽样记录：首页的"最近一次抽样"与回访卡会用到它 */
      var sampleBands = {}, per = 0;
      for (var sb in byBand) {
        var bbWords = demoSorted(byBand[sb]).slice(0, 12);
        var k = 0, f = 0;
        for (var si = 0; si < bbWords.length; si++) {
          var st = A.getSt(bbWords[si]);
          if (st === 2) k++; else if (st === 1) f++;
        }
        sampleBands[sb] = { N: sizes[sb], n: bbWords.length, k: k, f: f };
        per += bbWords.length;
      }
      S.samples = [{ ts: Date.now(), n: per, k: 0, f: 0, pre: 0, bank: bankKey(), mode: 'self', bands: sampleBands }];
      A.save();

      var R = A.levelReport();
      made.push({ id: A.activeProfile().id, name: name, rank: R.rank ? R.rank.k : '?', rankName: R.rank ? R.rank.name : '', ratio: R.ratio });
    });

    /* 回到生成前的档案，别把用户从自己那一页踢走 */
    A.switchProfile(keep.id);
    return made;
  };

  A.markWelcomed = function () { S.welcomed = true; save(); };
  A.needsWelcome = function () { return !S.welcomed; };

  /* 每个档案的进度摘要：直接读各自的存储，不切换、不影响当前状态 */
  /* 面板上要能一眼看出"这个账号词汇量多少"，所以多算一个 loose：认识 + 模糊×0.5。
     直接读各自的存档算，不切换当前档案。 */
  A.profileSummaries = function () {
    var m = meta();
    return m.list.map(function (r) {
      var tested = 0, known = 0, fuzzy = 0;
      try {
        var raw = localStorage.getItem(dataKey(r));
        if (raw) {
          var o = JSON.parse(raw);
          var st = (o && o.status) || {};
          for (var k in st) if (st.hasOwnProperty(k)) {
            tested++;
            if (st[k] === 2) known++; else if (st[k] === 1) fuzzy++;
          }
        }
      } catch (e) {}
      /* loose = 折中口径词汇量（认识 + 模糊×0.5）。面板上直接显示它，
         切账号时一眼就能看出"这个账号是多少词"。 */
      return { id: r.id, name: r.name, tested: tested, known: known, fuzzy: fuzzy,
        loose: Math.round(known + 0.5 * fuzzy), active: r.id === m.active };
    });
  };

  /* ---------- 词库：四级 / 六级 ---------- */
  // b 位掩码：1 = 四级大纲词，2 = 六级大纲新增词，3 = 四六级都有
  var BANKS = {
    c4: { name: '四级', short: '四级', hint: '大学英语四级大纲词汇表', mask: 1 },
    c6: { name: '六级', short: '六级', hint: '大学英语六级大纲词汇表（含四级已覆盖的词）', mask: 3 }
  };
  A.BANKS = BANKS;
  /* ---------- 自定义词书（用户导入） ----------
     存法：S.books = { id: {id,name,createdAt,indices:[...],meta:{...}} }
     indices 指向 WORDS 里的下标；导入时若单词不在内置词库，会**追加**进 WORDS
     （b:0 = 不属于四六级大纲，f:0 = 不在前 20k 词频表里，u:1 = 用户导入）。
     这样抽样、区间估计、词汇地图、跨轮差分全都不用改——它们只认「下标 + 频段 + 单词」。 */
  function userBook(id) { return (S.books && S.books[id]) || null; }
  A.userBook = userBook;
  A.userBooks = function () {
    var out = [], m = S.books || {};
    for (var k in m) if (m[k] && (m[k].words || m[k].indices)) out.push(m[k]);
    out.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    return out;
  };

  function bankKey() {
    var k = S.settings.bank;
    // 自定义词书用 'u:<id>' 形式；书被删掉就退回四级
    if (typeof k === 'string' && k.indexOf('u:') === 0) {
      return userBook(k.slice(2)) ? k : 'c4';
    }
    return BANKS[k] ? k : 'c4';
  }
  A.bankKey = bankKey;
  A.isUserBank = function () { return bankKey().indexOf('u:') === 0; };
  A.bankName = function () {
    var k = bankKey();
    if (k.indexOf('u:') === 0) { var b = userBook(k.slice(2)); return b ? b.name : '自定义词书'; }
    return BANKS[k].name;
  };
  A.bankShort = function () {
    var k = bankKey();
    if (k.indexOf('u:') === 0) return '自定义';
    return BANKS[k].short;
  };
  A.bankHint = function () {
    var k = bankKey();
    if (k.indexOf('u:') === 0) return '你导入的词书：结果只表示对这本书的掌握率，不等同于词汇量';
    return BANKS[k].hint;
  };
  function inBank(w) {
    var B = BANKS[bankKey()];
    // 自定义词书的成员是「书里的词」，不是位掩码 —— 这里一律返回 false，
    // 由 orderedPool / bankIdx 走 bookIndices 那条路
    if (!B) return false;
    return (w.b & B.mask) !== 0;
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
    if (A.isUserBank()) {
      // 自定义词书：向 part8 要下标（它负责把内置词表没有的词补进 WORDS）
      var bk = userBook(bankKey().slice(2));
      var idx = (A.bookIndices && bk) ? A.bookIndices(bk) : [];
      pos = ordPos();                     // 补词会改变序位表，这里重新取一次
      for (var n = 0; n < idx.length; n++) {
        var i2 = idx[n];
        if (i2 >= 0 && i2 < WORDS.length) arr.push(i2);
      }
      arr.sort(function (a, b) { return pos[a] - pos[b]; });
      _poolCache[key] = arr;
      return arr;
    }
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
  /* 导入词书会往 WORDS 里追加词条，序位表与词池缓存必须作废 */
  A.invalidateWordCaches = function () {
    _ordPos = null;
    _poolCache = {};
    _bankCache = {};
  };
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
    if (A.isUserBank()) {
      var bk = userBook(bankKey().slice(2));
      var idx = (A.bookIndices && bk) ? A.bookIndices(bk) : [];
      pos = ordPos();
      for (var u = 0; u < idx.length; u++) {
        var iu = idx[u];
        if (iu < 0 || iu >= WORDS.length) continue;
        if (wantExt ? !WORDS[iu].x : !!WORDS[iu].x) continue;
        a.push(iu);
      }
      a.sort(function (x, y) { return pos[x] - pos[y]; });
      _bankCache[key] = a;
      return a;
    }
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
  /* 频段权重：取该段词频中位数的倒数，以最高频 1k 段 = 1 归一化。
     报告页排序、AI 本地方案、回访卡都必须用这一份，避免"三处各写一套"。 */
  A.BAND_W = { 1: 1, 2: 0.33, 3: 0.20, 4: 0.125, 5: 0.067, 6: 0.033, 0: 0.02 };
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
    /* letter 传 'all' 表示"整段、不限首字母"。
       这里曾经漏了这个判断：'all' 会被当成一个真首字母去比首字母，永远对不上，
       于是 reviewCell(band,'all') 一直返回空 → AI 建议里的「复测某段」点了只弹一句
       "这块没有需要复测的词"。回访卡接上同一条通路时才暴露出来。 */
    var anyLetter = !letter || letter === 'all';
    for (var n = 0; n < pool.length; n++) {
      var i = pool[n];
      if (A.bandOf(i) !== band) continue;
      if (!anyLetter && String(WORDS[i].w).charAt(0).toUpperCase() !== letter) continue;
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
  /* ---------- AI 诊断额度 ----------
     规则：**完成一次有效检测 = 授予一次诊断**。
       有效检测 = 该轮测试过的词数 ≥100 且覆盖率 ≥95%（整库口径），
       或一次达标的随机摸底（达到目标精度且 ≥80 题）。
     为什么要有下限：自定义 5 个词的词书也能 100% 覆盖，不设下限就能无限刷额度。
     纯本地计数，没有账号——所以它只约束诚实用户。这是"数据只在你手里"的代价，写在文档里。 */
  A.aiQuota = function () {
    var q = S.aiQuota || { granted: 0, used: 0 };
    return { granted: q.granted | 0, used: q.used | 0, left: Math.max(0, (q.granted | 0) - (q.used | 0)) };
  };
  A.grantAiQuota = function (why) {
    if (!S.aiQuota) S.aiQuota = { granted: 0, used: 0 };
    S.aiQuota.granted = (S.aiQuota.granted | 0) + 1;
    A.save();
    try { A.toast('获得 1 次 AI 深度诊断（' + (why || '完成检测') + '）'); } catch (e) {}
    return A.aiQuota();
  };
  A.spendAiQuota = function () {
    if (!S.aiQuota) S.aiQuota = { granted: 0, used: 0 };
    if ((S.aiQuota.granted | 0) - (S.aiQuota.used | 0) <= 0) return false;
    S.aiQuota.used = (S.aiQuota.used | 0) + 1;
    A.save();
    return true;
  };
  /* 判定"这次检测够不够格换一次诊断"，并在够格时授予（同一轮只授予一次） */
  A.maybeGrantAiQuota = function (kind) {
    var t = A.tally(activePool());
    if (!t.tested) return false;
    var cov = t.total ? t.tested / t.total : 0;
    var ok = (kind === 'round')
      ? (t.tested >= 100 && cov >= 0.95)
      : false;
    if (kind === 'probe') {
      var es = A.estimateNow();
      var sess = S.session;
      ok = !!(es && es.kind === 'sample' && sess && sess.kind === 'probe' && (sess.log || []).length >= 80);
    }
    if (!ok) return false;
    // 同一轮同一口径只授予一次：用 round + 词库做标记
    var mark = (kind || 'x') + ':' + A.bankKey() + ':' + (S.round && S.round.startedAt ? S.round.startedAt : 0);
    if (!S.aiGranted) S.aiGranted = {};
    if (S.aiGranted[mark]) return false;
    S.aiGranted[mark] = 1;
    A.grantAiQuota(kind === 'round' ? '整库检测完成' : '随机摸底达标');
    return true;
  };
  A.addSample = function (o) {
    if (!S.samples) S.samples = [];
    S.samples.push({
      ts: o.ts || Date.now(), n: o.n, k: o.k, f: o.f,
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
    try { A.maybeGrantAiQuota('round'); } catch (e) {}
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
  /* 等级名字用中性评价词：卓越 → 优秀 → 良好 → 中等 → 偏弱 → 基础薄弱。
     字母（S/A/B+/B/C/D）保留——印章只能放一个字，报告与技术文档也靠字母对照。
     六个名字按掌握率递降排列，不带羞辱性，也不靠比喻，评委一眼就能对上常见评价体系。 */
  A.RANKS = [
    { k: 'S', name: '卓越', min: 0.92, tone: 'ok',
      desc: '大纲词汇几乎全覆盖，阅读基本没有生词障碍，可以直接上真题和写作。',
      next: '保持复现：每周过一遍「模糊」词，防止回落。' },
    { k: 'A', name: '优秀', min: 0.85, tone: 'ok',
      desc: '核心词汇扎实，只剩零散漏洞，属于「能考、能读」的水平。',
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
    var BAND_W = A.BAND_W;
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
      /* 报告页的「还差 X 词（约 N 天 · 每天 M 词）」也用设置里的每日时间。
         这里曾经写死 50，等于设置页那个「每日可投入时间」在报告页完全没生效——
         和 AI 计划里犯过的是同一个错。现在三处（报告 / AI 计划 / 回访卡）共用 A.perDayWords()。 */
      perDay: A.perDayWords()
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

  /* ---------- 发音 ----------
     口音可选：美式（en-US，默认）与英式（en-GB）。
     为什么做成设置项：词库里的音标是教材通用的英式标注（非卷舌、BATH 用 ɑː、保留 juː），
     而浏览器 TTS 默认多半是美式，两者会对不上（比如 student 标 /ˈstjuːdənt/，美音读 /ˈstuːdnt/）。
     四六级听力两种口音都会出现，所以让用户自己选，默认美式（多数系统语音包更全）。 */
  A.ACCENTS = [
    { k: 'us', name: '美式', lang: 'en-US', re: /^en[-_]US/i },
    { k: 'uk', name: '英式', lang: 'en-GB', re: /^en[-_]GB/i }
  ];
  /* 默认口音：四六级听力是英音与美音混合（历史上英音占比更高），
     而词库音标也是教材通用的英式标注，所以默认给英式更贴考试与音标；
     系统缺 en-GB 语音包时会自动退到任意英语音色，不会变成无声。 */
  var DEFAULT_ACCENT = 'uk';
  A.DEFAULT_ACCENT = DEFAULT_ACCENT;
  function accentCfg() {
    var k = (S.settings && S.settings.accent) || DEFAULT_ACCENT;
    for (var i = 0; i < A.ACCENTS.length; i++) if (A.ACCENTS[i].k === k) return A.ACCENTS[i];
    return A.ACCENTS[0];
  }
  A.accentCfg = accentCfg;
  /* 每个口音各自的音色：一个词想听两种读法时，不能共用一个 voice */
  var VOICE_BY = { us: null, uk: null };
  function pickVoiceFor(cfg) {
    var vs = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
    for (var i = 0; i < vs.length; i++) if (cfg.re.test(vs[i].lang)) return vs[i];
    for (var j = 0; j < vs.length; j++) if (/^en/i.test(vs[j].lang)) return vs[j];   // 没有对应口音就退到任意英语音色
    return null;
  }
  function pickVoice() {
    if (!window.speechSynthesis) return;
    for (var i = 0; i < A.ACCENTS.length; i++) VOICE_BY[A.ACCENTS[i].k] = pickVoiceFor(A.ACCENTS[i]);
  }
  if (window.speechSynthesis) { pickVoice(); window.speechSynthesis.onvoiceschanged = pickVoice; }
  /* 切换口音后要重新选音色，否则会继续用上一个口音的 voice */
  A.repickVoice = function () { pickVoice(); };

  function cfgOf(k) {
    for (var i = 0; i < A.ACCENTS.length; i++) if (A.ACCENTS[i].k === k) return A.ACCENTS[i];
    return accentCfg();
  }
  /* 按指定口音念一个词（不传就用设置里的默认口音） */
  function speakAccent(text, k) {
    if (!window.speechSynthesis) return false;
    var cfg = cfgOf(k);
    var u = new SpeechSynthesisUtterance(text);
    u.lang = cfg.lang; u.rate = 0.88;
    var v = VOICE_BY[cfg.k];
    if (v && cfg.re.test(v.lang)) u.voice = v;
    window.speechSynthesis.speak(u);
    return true;
  }
  /* 连读多种口音：只 cancel 一次，然后按顺序排队（浏览器会把它们串起来念）
     四六级听力是英音美音混合，一个词听两遍是最省事的适应方式。 */
  function speakAll(text, ks) {
    if (!S.settings.sound) { toast('发音已在设置中关闭'); return; }
    if (!window.speechSynthesis) { toast('当前浏览器不支持语音朗读'); return; }
    try {
      window.speechSynthesis.cancel();
      (ks && ks.length ? ks : [S.settings.accent || DEFAULT_ACCENT]).forEach(function (k) {
        speakAccent(text, k);
      });
    } catch (e) { toast('发音失败'); }
  }
  A.speakAll = speakAll;
  function speak(text) {
    if (!S.settings.sound) { toast('发音已在设置中关闭'); return; }
    if (!window.speechSynthesis) { toast('当前浏览器不支持语音朗读'); return; }
    try {
      window.speechSynthesis.cancel();
      speakAccent(text, S.settings.accent || DEFAULT_ACCENT);
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
    var whoEl = document.getElementById('whoName');
    if (whoEl) whoEl.textContent = A.myName();
    var whoBtn = document.getElementById('whoBtn');
    if (whoBtn) whoBtn.setAttribute('aria-label', '当前使用者 ' + A.myName() + '，点击切换或新建');
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

  /* ================= 回访卡：打开首页时的一句话分析 =================
     为什么是卡片不是弹窗（取舍写在 NEXT.md）：
       · 不遮挡——首页 hero 已经在说"你有多大词汇量"，这里补的是"下一步动哪里"；
       · 可永久关闭 + 有天数门槛——离"打卡催命"远一点，产品只开处方不卖药；
       · 内容全部本地算——区间、最弱段、补完天数都是算出来的，不调 AI、不烧额度。
     评委场景的特殊处理：全新浏览器没有历史，卡片本来不会出现，
     所以设置页留了「预览这张卡」，用示例数据展示形状（点一下就能讲给评委听）。 */
  var REVISIT_GAP_DAYS = 3;         // 距上次检测不足 3 天不打扰
  A.REVISIT_GAP_DAYS = REVISIT_GAP_DAYS;
  A._revisitHidden = false;         // 本次会话里点过「收起」→ 刷新后还会出现（故意不落盘）
  A._revisitForce = false;          // 设置页「预览这张卡」用：绕过天数门槛与关闭状态

  /* 每天能背多少词 = 每日可投入时间 ÷ 每词约 1.5 分钟（与设置页文案一致）。
     抽成公共函数是因为"计划里的词数"和"回访卡里的词数"必须是同一个数。 */
  A.perDayWords = function () {
    var dm = (S.settings && S.settings.dailyMinutes) || 30;
    return Math.max(5, Math.min(200, Math.round(dm / 1.5)));
  };

  /* 回访卡要用到的全部数据。没有可用估算就返回 null（首次打开、只有分组检测数据）。 */
  A.revisitInfo = function () {
    var es = A.estimateNow();
    if (!es || (es.kind !== 'sample' && es.kind !== 'full')) return null;
    var strict = !!S.settings.strict;
    var now = Date.now();
    var info = {
      kind: es.kind,
      ts: es.ts || now,
      days: Math.max(0, Math.floor((now - (es.ts || now)) / 86400000)),
      vocab: strict ? es.strictVocab : es.looseVocab,
      other: strict ? es.looseVocab : es.strictVocab,
      half: Math.round(es.kind === 'sample' ? ((strict ? es.strictHi - es.strictLo : es.hi - es.lo) / 2) : 0),
      n: es.n || 0,
      perDay: A.perDayWords(),
      weak: null,
      prev: null, delta: null, deltaWithinNoise: false
    };
    /* 最弱段只在"样本 ≥3 词"的段里挑：抽到 1 个词全错就宣布最弱，是假结论。
       再分两个概念：
         weak   = 全库掌握率最低的一段（卡片里如实说"最弱"）
         target = 真正该先补的一段 —— 高频三段（1k/1k-2k/2k-3k）里只要还有洞就优先它们，
                  因为补冷门段对阅读的帮助远不如补高频段。这样"文字说的"和"按钮做的"是同一件事。 */
    var rows = A.bandProfile().rows.filter(function (r) { return r.p !== null && r.n >= 3; })
      .sort(function (a, b) { return a.p - b.p; });
    var weak = rows[0] || null;
    var warm = rows.filter(function (r) { return r.band >= 1 && r.band <= 3; })
      .sort(function (a, b) { return a.p - b.p; })[0];
    var pick = (warm && warm.p < 0.9) ? warm : weak;
    if (pick) {
      var shape = function (r) {
        var o = { band: r.band, p: r.p, N: r.N, n: r.n };
        o.gapWords = Math.max(1, Math.round((1 - r.p) * r.N));
        return o;
      };
      info.weak = weak ? shape(weak) : null;
      info.target = shape(pick);
      info.daysToFill = Math.max(1, Math.ceil(info.target.gapWords / info.perDay));
    }
    /* 有已归档的上一轮就报变化；差值落在抽样误差内时如实说"还看不出来"——
       这正是这个工具和"打分网站"的区别：不把噪声说成进步。 */
    var rounds = S.rounds || [];
    var prev = rounds.length ? rounds[rounds.length - 1] : null;
    if (prev && typeof prev.loose === 'number' && prev.finishedAt) {
      info.prev = { vocab: prev.loose, days: Math.max(0, Math.floor((now - prev.finishedAt) / 86400000)) };
      info.delta = info.vocab - prev.loose;
      info.deltaWithinNoise = info.half > 0 && Math.abs(info.delta) < info.half;
    }
    return info;
  };

  /* 现在要不要显示：所有条件集中在这一处，方便断言与调试 */
  A.revisitShow = function () {
    if (A._revisitForce) return true;
    if (A._revisitHidden) return false;
    if (S.settings && S.settings.revisitOff) return false;
    if (S.session && S.session.queue && S.session.queue.length) return false;   // 未完成的检测由"继续检测"那条负责
    var info = A.revisitInfo();
    if (!info) return false;
    return info.days >= REVISIT_GAP_DAYS;
  };

  A.revisitCardHTML = function () {
    if (!A.revisitShow()) return '';
    var info = A.revisitInfo();
    var demo = !info;
    var head, body, acts;
    if (demo) {
      head = '上次 ≈ 4,449 词（±436）· 5 天前';
      body = '<div>最高频 1k 段只有 <b>69%</b>，是当前最弱的一段——按这个掌握率推算，' +
          '全段 1,000 词里约 <b>320</b> 个还没拿下。</div>' +
        '<div>按每天 30 分钟（约 20 词）算，补完这一段约 <b>16 天</b>。</div>' +
        '<div class="tiny" style="margin-top:6px;color:var(--ink3)">（示例数据：做一次摸底之后，这里会换成你自己的数字）</div>';
      acts = '<button class="btn sm primary" data-act="start" data-kind="probe" data-target="400">先做一次快速摸底</button>';
    } else {
      head = (info.kind === 'full' ? '实测 ' : '上次 ') + info.vocab.toLocaleString('en-US') + ' 词' +
        (info.half ? '（±' + info.half + '）' : '') + ' · ' +
        (info.days === 0 ? '今天' : info.days + ' 天前');
      var lines = [];
      if (info.target) {
        var tg = info.target;
        var tgName = A.BAND_NAMES[tg.band] || ('频段 ' + tg.band);
        lines.push('最该先补的是 <b>' + esc(tgName) + '</b> 段：掌握 <b>' + Math.round(tg.p * 100) + '%</b>' +
          '（该段抽到 ' + tg.n + ' 词' + (tg.n < 10 ? '，样本偏少，结论偏粗' : '') + '）——' +
          '按这个比例推算，全段 ' + tg.N + ' 词里约 <b>' + tg.gapWords + '</b> 个还没拿下。' +
          /* 这一段话必须跟着频段走：曾经把"最高频段的洞最影响阅读"写死，
             结果目标段是 10k-20k 时，卡片在自相矛盾。 */
          (tg.band === 1
            ? '最高频段在真题里出现最密，先补它收益最大。'
            : tg.band === 2 || tg.band === 3
              ? '这一段出现频率仍然很高，补它比补冷门段划算。'
              : '这一段偏冷门——先补高频段更划算。'));
        if (info.weak && info.weak.band !== tg.band) {
          lines.push('全库最弱的是 <b>' + esc(A.BAND_NAMES[info.weak.band] || ('频段 ' + info.weak.band)) +
            '</b> 段（' + Math.round(info.weak.p * 100) + '%），但它偏冷门，收益不如先补上面这一段。');
        }
        lines.push('按每天 ' + info.perDay + ' 词算，补完这一段约 <b>' + info.daysToFill + ' 天</b>（可在设置里改）。');
      } else {
        lines.push('这次抽样覆盖的频段还不够分散，看不出哪一段最弱——再测一轮就能定位。');
      }
      if (info.prev) {
        var d = info.delta;
        var sign = d > 0 ? '+' : '';
        lines.push('与上一轮（' + info.prev.days + ' 天前 ' + info.prev.vocab.toLocaleString('en-US') + ' 词）相比 ' +
          '<b>' + sign + d.toLocaleString('en-US') + ' 词</b>：' +
          (info.deltaWithinNoise
            ? '这个差值还在 ±' + info.half + ' 的抽样误差以内，<b>先别当成进步</b>——想比得出来就再测一轮把区间压小。'
            : '已经超出 ±' + info.half + ' 的抽样误差，可以算真实变化。'));
      }
      body = lines.map(function (x) { return '<div>' + x + '</div>'; }).join('');
      acts = (info.target
          ? '<button class="btn sm primary" data-act="revisit-review">开始补这一段</button>'
          : '') +
        '<button class="btn sm" data-act="revisit-report">看完整报告</button>' +
        (info.target ? '<button class="btn sm ghost" data-act="revisit-ask">让 AI 细说</button>' : '');
    }
    return '<div class="revisit" id="revisitCard">' +
      '<div class="revisit-main">' +
        '<div class="revisit-h"><b>' + head + '</b>' +
          '<span class="pill' + (demo ? '' : ' brand') + '" style="margin-left:8px">' + (demo ? '示例' : '回访') + '</span></div>' +
        '<div class="revisit-b">' + body + '</div>' +
        '<div class="revisit-acts">' + acts +
          '<button class="btn sm ghost" data-act="revisit-off" title="以后不再自动显示这张卡（设置里可重新打开）">以后不再提醒</button>' +
        '</div>' +
      '</div>' +
      '<button class="revisit-x" data-act="revisit-hide" aria-label="收起这条回访卡" title="收起（刷新后还会出现）">×</button>' +
      '</div>';
  };

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
    // 第一次打开时的「怎么称呼」：做成一条可跳过的轻量条，绝不打断第一次检测
    if (A.needsWelcome()) {
      h += '<div class="welcome" id="welcomeBar">' +
        '<div class="welcome-txt"><b>你好，怎么称呼？</b>' +
          '<div class="tiny">留个名字，报告和桌宠会按你的名字说话。名字和作答都只存在这台浏览器里。</div></div>' +
        '<input id="welName" class="welcome-in" maxlength="12" placeholder="例如：李四" ' +
          'aria-label="你的名字">' +
        '<button class="btn sm primary" data-act="save-welcome">保存</button>' +
        '<button class="btn sm ghost" data-act="skip-welcome">先用着</button>' +
        '</div>';
    }
    h += '<div class="home-toprow">' + A.bankSwitch();
    if (A.roundNo() > 1) {
      h += '<span class="round-badge" title="当前是第 ' + A.roundNo() + ' 轮检测">第 ' + A.roundNo() + ' 轮</span>';
    }
    // 完成整库检测后才出现：多轮对比要两轮都测完才有意义
    if (A.canRetest()) {
      h += '<button class="btn retest-btn" data-act="new-round">重新测试 · 开始第 ' + (A.roundNo() + 1) + ' 轮</button>';
    }
    h += '</div>';
    // 自定义词书：导入入口 + 已导入的书（可切换 / 删除）
    if (A.bookBarHTML) h += A.bookBarHTML();
    if (A.isUserBank && A.isUserBank()) {
      h += '<div class="book-banner">当前词书是<b>自定义词书《' + A.esc(A.bankName()) + '》</b>：' +
        '结果只表示<b>对这本书的掌握率</b>，不能换算成词汇量（词书本身是有偏样本）。</div>';
    }
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

    // 回访卡：不遮挡，放在 hero 之后；有未完成的检测时它自己会隐藏
    h += A.revisitCardHTML();

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
