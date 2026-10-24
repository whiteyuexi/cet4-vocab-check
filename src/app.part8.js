/* ============ 第八部分：自定义词书（导入外部词书） ============
   需求：用户可以把自己那本词书（雅思、考研、专业课…）放进来，然后按同一套模式做检测。
   设计上的三条底线：
     1) **全部在前端完成**：文件不出本机，不上传（和"作答不出本机"是同一条隐私承诺）。
     2) **复用同一套引擎**：导入词会被映射到内置词表的下标；内置里没有的词追加进词表
        （频段记为「20k 以外」= 不在前 20k 词频表里，这是事实而不是猜测）。
        于是分层抽样、区间估计、词汇地图、跨轮差分一行都不用改。
     3) **口径必须说清**：词书是人挑出来的有偏样本，所以结果只表示
        「对这本书的掌握率」，**不能外推成词汇量**。这一点在界面上明说，不藏在文档里。 */
(function (A) {
  'use strict';

  var MAX_WORDS = 20000;          // 单本词书上限：再多就不该塞进 localStorage 了
  var IMPORTED_BASE = 0;          // 导入词的基线下标（在 init 时确定 = 内置词表长度）

  function wordsArr() { return window.WORDS || []; }
  function lower(s) { return String(s || '').trim().toLowerCase(); }

  /* ---------- 解析：支持 txt / csv / 粘贴 ----------
     认的格式（宽松）：
       abandon            一行一个词
       abandon,放弃        词,释义（都支持逗号 / 制表符 / 分号）
       abandon	放弃
     会跳过：空行、以 # 或 // 开头的注释、明显是表头的行（含"单词/word/释义"且没有拉丁字母组合）。 */
  function parseBookText(text) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [], seen = {}, dup = 0, skipped = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\uFEFF/g, '').trim();
      if (!line) { skipped++; continue; }
      if (/^(#|\/\/)/.test(line)) { skipped++; continue; }
      // 第一列是单词，其余是释义（可选）
      var parts = line.split(/[,;\t]|\s{2,}/);
      var w = String(parts[0] || '').trim();
      // 只接受"看起来像英语单词/短语"的第一列：至少一个拉丁字母，不含全角字符
      if (!/[a-zA-Z]/.test(w) || /[\u4e00-\u9fa5]/.test(w)) { skipped++; continue; }
      w = w.replace(/^["'“”‘’(（\[]+|["'“”‘’()）\]]+$/g, '').replace(/\.$/, '').trim();
      if (!w || w.length > 40) { skipped++; continue; }
      var key = w.toLowerCase();
      if (seen[key]) { dup++; continue; }
      seen[key] = 1;
      var def = parts.slice(1).join(' ').trim().replace(/^["'“”]+|["'“”]+$/g, '');
      out.push({ w: w, t: def });
      if (out.length >= MAX_WORDS) break;
    }
    return { entries: out, dup: dup, skipped: skipped, truncated: out.length >= MAX_WORDS };
  }

  /* ---------- 预览：这段文本换成词书之后会发生什么 ----------
     必须在上传前就把话说清楚：多少词、多少能给出释义、多少会进「20k 以外」段。 */
  function previewBook(entries) {
    var words = wordsArr();
    var map = {};
    for (var i = 0; i < words.length; i++) {
      var k = lower(words[i].w);
      if (map[k] === undefined) map[k] = i;
    }
    var inDict = 0, fresh = 0, withDef = 0;
    var bands = {}, sample = [];
    for (var n = 0; n < entries.length; n++) {
      var e = entries[n], key = lower(e.w);
      if (e.t) withDef++;
      if (map[key] !== undefined) {
        inDict++;
        var b = words[map[key]].f | 0;
        bands[b] = (bands[b] || 0) + 1;
        if (sample.length < 6) sample.push({ w: words[map[key]].w, t: words[map[key]].t, hit: true });
      } else {
        fresh++;
        bands[0] = (bands[0] || 0) + 1;
        if (sample.length < 6) sample.push({ w: e.w, t: e.t || '', hit: false });
      }
    }
    return {
      total: entries.length, inDict: inDict, fresh: fresh, withDef: withDef,
      bands: bands, sample: sample,
      covered: entries.length ? inDict / entries.length : 0
    };
  }

  function dictMap() {
    var words = wordsArr(), map = {};
    for (var i = 0; i < words.length; i++) {
      var k = lower(words[i].w);
      if (map[k] === undefined) map[k] = i;
    }
    return map;
  }

  /* ---------- 词书里存什么 ----------
     存**单词**，不存下标：下标是运行时的，刷新页面后 WORDS 会从内联数据重建，
     存下标就会指向错的位置（第一版就是这么错的：刷新后 5 词的书只剩 3 词）。
     内置词表里没有的词，追加进 WORDS 时顺便带上用户给的释义（没有就空着）。
     b:0 = 不属于四六级大纲；f:0 = 不在前 20k 词频表里（这是事实，不是猜）；
     u:1 标记来源，便于将来排查。 */
  function saveBook(name, entries, meta) {
    var map = dictMap();
    var list = [], defs = {}, fresh = 0;
    for (var n = 0; n < entries.length; n++) {
      var e = entries[n], key = lower(e.w);
      if (!key) continue;
      list.push(key);
      if (map[key] === undefined) {
        fresh++;
        if (e.t) defs[key] = e.t;
      }
    }
    var id = 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    if (!A.S.books) A.S.books = {};
    A.S.books[id] = {
      id: id,
      name: String(name || '我的词书').slice(0, 40),
      createdAt: Date.now(),
      words: list,          // 词书本体：小写单词数组
      defs: defs,           // 仅新增词才有的释义
      added: fresh,
      meta: meta || {}
    };
    A.S.settings.bank = 'u:' + id;
    if (A.S.session) A.S.session = null;         // 换词书就结束当前会话，避免跨库混数据
    RESOLVED = {};
    A.invalidateWordCaches();
    A.save();
    return id;
  }

  /* 把词书解析成 WORDS 下标（结果缓存在内存里，不进存档）。
     解析时把内置词表没有的词**追加**进 WORDS，之后抽样/统计/地图全都照常。 */
  var RESOLVED = {};      // bookId -> Int32Array/Array 下标
  A.bookIndices = function (book) {
    if (!book) return [];
    var cached = RESOLVED[book.id];
    if (cached && cached.length === (book.words || []).length) return cached;
    var words = wordsArr(), map = dictMap();
    var out = [], changed = false;
    var list = book.words || [];
    for (var i = 0; i < list.length; i++) {
      var key = lower(list[i]);
      if (!key) continue;
      if (map[key] === undefined) {
        words.push({ w: key, t: (book.defs && book.defs[key]) || '', p: '', x: 0, b: 0, f: 0, u: 1 });
        map[key] = words.length - 1;
        changed = true;
      }
      out.push(map[key]);
    }
    if (changed) {
      window.WORDS = words;
      A.invalidateWordCaches();
    }
    RESOLVED[book.id] = out;
    return out;
  };

  function deleteBook(id) {
    if (!A.S.books || !A.S.books[id]) return false;
    delete A.S.books[id];
    if (A.S.settings.bank === 'u:' + id) A.S.settings.bank = 'c4';
    A.invalidateWordCaches();
    A.save();
    return true;
  }

  /* ---------- 词书条：首页词库切换旁边的一排 ---------- */
  A.bookBarHTML = function () {
    var books = A.userBooks();
    var on = A.bankKey();
    var h = '<div class="bookbar">';
    h += '<button class="bank book-add" data-act="book-import" title="从文件或粘贴文本导入你自己的词书">' +
      '<b>+ 导入词书</b><small>雅思 / 考研 / 自建</small></button>';
    books.forEach(function (b) {
      h += '<span class="book-chip' + (on === 'u:' + b.id ? ' on' : '') + '">' +
        '<button class="book-use" data-act="book-use" data-book="' + A.esc(b.id) + '" title="' + A.esc(b.name) + '">' +
        A.esc(b.name) + '<small>' + ((b.words || []).length) + ' 词</small></button>' +
        '<button class="book-del" data-act="book-del" data-book="' + A.esc(b.id) + '" title="删除这本词书">×</button>' +
        '</span>';
    });
    h += '</div>';
    return h;
  };

  /* ---------- 导入窗口 ----------
     一次导入分三步：贴/拖进内容 → 看预览（多少词命中、多少会进「20k 以外」）→ 起名保存并切换。
     预览这一步不能省：用户得在看到"这本书里有 38% 的词我们没有释义"之后再决定。 */
  var STAGE = { text: '', parsed: null, preview: null };

  A.openImportBook = function () {
    STAGE = { text: '', parsed: null, preview: null };
    A.modal(
      '<div class="book-head"><b>导入我的词书</b>' +
      '<span class="tiny">文件不出本机 · 支持 .txt / .csv / 直接粘贴</span></div>' +
      '<div class="drop" id="bookDrop">' +
        '<div class="drop-in">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/></svg>' +
          '<b>把词书文件拖到这里</b>' +
          '<span class="tiny">或 <label class="linky">选择文件<input type="file" id="bookFile" accept=".txt,.csv,text/plain" hidden></label>，也可以直接在下面粘贴</span>' +
        '</div>' +
      '</div>' +
      '<textarea class="book-text" id="bookText" rows="5" placeholder="例如：&#10;abandon,放弃&#10;benefit,益处；使受益&#10;curious（只有词也行）"></textarea>' +
      '<div class="book-row">' +
        '<button class="btn primary" data-act="book-preview">看预览</button>' +
        '<button class="btn ghost" data-act="modal-close">取消</button>' +
      '</div>' +
      '<div id="bookPreview"></div>', true);
    if (A.bindBookDrop) A.bindBookDrop();
  };

  /* 拖放与文件选择（都走同一个入口，避免两套解析逻辑） */
  A.bindBookDrop = function () {
    var drop = document.getElementById('bookDrop');
    var file = document.getElementById('bookFile');
    var text = document.getElementById('bookText');
    if (drop) {
      ['dragenter', 'dragover'].forEach(function (t) {
        drop.addEventListener(t, function (e) {
          e.preventDefault();
          drop.classList.add('over');
        });
      });
      ['dragleave', 'drop'].forEach(function (t) {
        drop.addEventListener(t, function (e) {
          e.preventDefault();
          drop.classList.remove('over');
        });
      });
      drop.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) readFileInto(f, text);
      });
      drop.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('label, input')) return;
        if (file) file.click();
      });
    }
    if (file) {
      file.addEventListener('change', function () {
        if (file.files && file.files[0]) readFileInto(file.files[0], text);
      });
    }
  };

  function readFileInto(file, textarea) {
    if (file.size > 4 * 1024 * 1024) { A.toast('文件太大了（>4 MB），只支持词表，不是整个 App 数据'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var txt = String(reader.result || '');
      if (textarea) textarea.value = txt.length > 40000 ? txt.slice(0, 40000) : txt;
      A.toast('已读入 ' + file.name + '（' + (txt.length / 1024).toFixed(1) + ' KB）');
    };
    reader.onerror = function () { A.toast('读取失败，换一个文件或直接粘贴'); };
    reader.readAsText(file, 'utf-8');
  }

  /* 生成预览面板（不落盘，只看不存） */
  A.previewImport = function () {
    var ta = document.getElementById('bookText');
    var txt = ta ? ta.value : '';
    var parsed = parseBookText(txt);
    if (!parsed.entries.length) {
      document.getElementById('bookPreview').innerHTML =
        '<div class="book-note warn">没解析到任何单词。确认文件是「一行一个词」的纯文本（.txt / .csv）。</div>';
      return;
    }
    var pv = previewBook(parsed.entries);
    var BAND_NAMES = A.BAND_NAMES || [];
    var bandRows = Object.keys(pv.bands).sort(function (a, b) { return (+b) - (+a); })
      .filter(function (b) { return pv.bands[b] > 0; })
      .map(function (b) {
        var pct = Math.round(pv.bands[b] / pv.total * 100);
        return '<span class="bk">' + A.esc(BAND_NAMES[+b] || ('频段 ' + b)) + ' · ' + pv.bands[b] + ' 词（' + pct + '%）</span>';
      }).join('');

    var h = '';
    h += '<div class="book-stats">' +
      '<div><b>' + pv.total + '</b><span>总词数</span></div>' +
      '<div><b>' + pv.inDict + '</b><span>内置词库命中</span></div>' +
      '<div><b>' + pv.fresh + '</b><span>新增词条</span></div>' +
      '<div><b>' + Math.round(pv.covered * 100) + '%</b><span>有释义/音标</span></div>' +
      '</div>';
    h += '<div class="book-bands">' + bandRows + '</div>';
    if (parsed.dup || parsed.skipped) {
      h += '<div class="book-note">已去重 ' + parsed.dup + ' 行，跳过 ' + parsed.skipped + ' 行（空行/表头/非单词行）' +
        (parsed.truncated ? '，超过 ' + MAX_WORDS + ' 词的部分未收' : '') + '。</div>';
    }
    h += '<div class="book-note warn">' +
      '<b>先说清口径：</b>词书是人挑出来的有偏样本。结果只表示<b>对这本书的掌握率</b>，' +
      '不能换算成"你的词汇量"——那样会低估或高估，取决于这本书筛了哪些词。' +
      (pv.fresh ? '<br>新增的 ' + pv.fresh + ' 个词不在内置词表里，没有释义与音标，频段记为「20k 以外」（不在前 20k 词频表里）。' : '') +
      '</div>';
    h += '<div class="book-row">' +
      '<input class="search" id="bookName" placeholder="给这本书起个名字，例如：雅思核心词汇" value="' +
        A.esc(nameSuggest(pv)) + '">' +
      '<button class="btn primary" data-act="book-save">保存并开始测这本</button>' +
      '</div>';
    document.getElementById('bookPreview').innerHTML = h;
    STAGE.parsed = parsed;
    STAGE.preview = pv;
  };

  function nameSuggest(pv) {
    var books = A.userBooks();
    return '我的词书 ' + (books.length + 1) + '（' + pv.total + ' 词）';
  }

  A.commitImport = function () {
    if (!STAGE.parsed || !STAGE.preview) { A.toast('先点「看预览」'); return; }
    var nameEl = document.getElementById('bookName');
    var name = nameEl && nameEl.value.trim() ? nameEl.value.trim() : nameSuggest(STAGE.preview);
    var id = saveBook(name, STAGE.parsed.entries, {
      total: STAGE.preview.total, inDict: STAGE.preview.inDict, fresh: STAGE.preview.fresh
    });
    A.closeModal();
    A.toast('已导入《' + name + '》，开始按这本词书检测');
    A.render();
  };

  A.useBook = function (id) {
    if (!A.S.books || !A.S.books[id]) { A.toast('这本词书已经不在了'); return; }
    A.S.settings.bank = 'u:' + id;
    if (A.S.session) { A.S.session = null; A.toast('已切换到《' + A.S.books[id].name + '》，本次检测已结束'); }
    A.save();
    A.render();
  };

  A.removeBook = function (id) {
    var b = A.S.books && A.S.books[id];
    if (!b) return;
    A.modal('<b>删除《' + A.esc(b.name) + '》？</b>' +
      '<div class="tiny" style="margin:8px 0 16px">词书本身会删掉；已经产生的作答记录按单词保存，不受影响。</div>' +
      '<div class="row"><button class="btn danger" data-act="book-del-confirm" data-book="' + A.esc(id) + '">删除</button>' +
      '<button class="btn ghost" data-act="modal-close">取消</button></div>');
  };

  A.confirmRemoveBook = function (id) {
    var b = A.S.books && A.S.books[id];
    if (!b) { A.closeModal(); return; }
    var name = b.name;
    deleteBook(id);
    A.closeModal();
    A.toast('已删除《' + name + '》');
    A.render();
  };

  /* 给外部（自检脚本）用 */
  A.bookParse = parseBookText;
  A.bookPreview = previewBook;

})(window.__APP__ || (window.__APP__ = {}));
