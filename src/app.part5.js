/* ============ 第五部分：右侧常驻助手（鲸鱼娘） ============
   两种形态共用一个接口：
     - 离线单文件（file://）→ 内联 SVG，会呼吸/眨眼/变表情
     - 联网或跑本地服务时 → 自动升级为 Live2D 模型（真 2.5D，物理摆动 + 44 个表情）
   资源缺失或加载失败时静默退回 SVG，页面上不能出现空洞。 */
(function (A) {
  'use strict';

  var Q = {};
  try { Q = new URLSearchParams(location.search); } catch (e) { Q = { get: function () { return null; } }; }

  /* ---------- 内联 SVG 形象 ---------- */
  var FLUKE = 'M0 0C-8-2.7-17-8.1-20-15.3C-10-11.2-4-7.6 0-7.6C4-7.6 10-11.2 20-15.3C17-8.1 8-2.7 0 0Z';

  function mascotSVG(mood) {
    var eyes = mood === 'happy' || mood === 'praise' || mood === 'love'
      ? '<g fill="none" stroke="#16233F" stroke-width="2.6" stroke-linecap="round"><path d="M41 63q6-8 12 0"/><path d="M67 63q6-8 12 0"/></g>'
      : '<g class="pt-eye-open"><ellipse cx="47" cy="62" rx="6" ry="7.2" fill="#16233F"/>' +
        '<ellipse cx="73" cy="62" rx="6" ry="7.2" fill="#16233F"/>' +
        '<circle cx="49" cy="59" r="2.1" fill="#FFFFFF"/><circle cx="75" cy="59" r="2.1" fill="#FFFFFF"/></g>';
    var mouth = mood === 'warn' || mood === 'think'
      ? '<path d="M56 74q4-3.5 8 0" fill="none" stroke="#B4644F" stroke-width="2" stroke-linecap="round"/>'
      : '<path d="M56.5 72q3.5 4 7 0" fill="none" stroke="#B4644F" stroke-width="2" stroke-linecap="round"/>';
    return '<svg class="pet-svg" viewBox="0 0 120 136" aria-hidden="true">' +
      '<g transform="translate(86,128) rotate(52) scale(1.25)"><path d="' + FLUKE + '" fill="#2450C8"/></g>' +
      '<path d="M60 14C31 14 16 32 16 57c0 24 8 42 17 52h54c9-10 17-28 17-52C104 32 89 14 60 14z" fill="#2450C8"/>' +
      '<ellipse cx="31" cy="104" rx="6.5" ry="10" fill="#FFE0CE"/><ellipse cx="89" cy="104" rx="6.5" ry="10" fill="#FFE0CE"/>' +
      '<path d="M60 80c-14 0-24 8-27 19l-5 22c-1 4 2 7 6 7h52c4 0 7-3 6-7l-5-22c-3-11-13-19-27-19z" fill="#FFFFFF" stroke="#DAE2F5" stroke-width="1.5"/>' +
      '<path d="M49 82c3 6 7 9 11 9s8-3 11-9c-4-2-7-3-11-3s-7 1-11 3z" fill="#2A5BE0"/>' +
      '<path d="M33 52C19 53 7 62 3 73c11 6 24 5 32-2z" fill="#3B6BE8"/>' +
      '<path d="M87 52c14 1 26 10 30 21-11 6-24 5-32-2z" fill="#3B6BE8"/>' +
      '<ellipse cx="60" cy="58" rx="32" ry="30" fill="#FFE0CE"/>' +
      '<path d="M28 56c0-23 14-33 32-33s32 10 32 33c0 0-4-11-13-11-6 0-8 7-14 7s-6-9-12-9c-8 0-13 9-18 9-4 0-7 4-7 4z" fill="#3B6BE8"/>' +
      '<g transform="translate(60,30) scale(1.2)"><path d="' + FLUKE + '" fill="#5B84EE"/></g>' +
      eyes +
      '<ellipse cx="35" cy="70" rx="7" ry="4" fill="#FF9BA8" opacity=".5"/>' +
      '<ellipse cx="85" cy="70" rx="7" ry="4" fill="#FF9BA8" opacity=".5"/>' + mouth + '</svg>';
  }

  /* ---------- Live2D ---------- */
  var L2D = { base: '', core: 'vendor/live2dcubismcore.min.js', vendor: 'vendor/live2d-vendor.js',
              model: 'assets/whale-girl/c_0120.model3.json', app: null, model3: null, ok: false, tried: false };

  // 模型数据里的头部中心（模型坐标），用于把取景稳定地对到脸上
  var FACE = { x: 2019, y: 1871 };

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = L2D.base + src;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('脚本加载失败：' + src)); };
      document.head.appendChild(s);
    });
  }

  function live2dAllowed() {
    // 测试环境（jsdom）与老浏览器没有 fetch，直接走 SVG
    if (typeof fetch !== 'function' || typeof Promise !== 'function') return false;
    if (typeof location === 'undefined') return false;
    if (location.protocol === 'file:') return false;         // file:// 下 fetch 本地模型会被浏览器拦掉
    var forced = String((Q && Q.get && Q.get('pet')) || '').toLowerCase();
    if (forced === 'svg') return false;
    return true;                                             // pet=live2d 或默认：能试就试
  }

  function mountLive2D(fig) {
    return fetch(L2D.base + L2D.model, { method: 'HEAD' }).then(function (r) {
      if (!r.ok) throw new Error('模型不可达');
      return loadScript(L2D.core);
    }).then(function () {
      return loadScript(L2D.vendor);
    }).then(function () {
      var v = window.__dshLive2dPetVendor;
      if (!v) throw new Error('Live2D 运行时未挂载');
      v.extensions.add(v.Live2DPlugin);
      v.configureCubismSDK({ memorySizeMB: 64 });
      var rect = fig.getBoundingClientRect();
      var W = Math.max(120, Math.round(rect.width));
      var H = Math.max(120, Math.round(rect.height));
      var app = new v.Application();
      return app.init({
        width: W, height: H, backgroundAlpha: 0, antialias: true, autoDensity: false,
        resolution: Math.max(2, window.devicePixelRatio || 1),
        preference: 'webgl', preserveDrawingBuffer: true
      }).then(function () { return { v: v, app: app, W: W, H: H }; });
    }).then(function (o) {
      return o.v.Live2DModel.from(L2D.base + L2D.model, {
        autoUpdate: false, autoHitTest: true, autoFocus: false
      }).then(function (m) { o.model = m; return o; });
    }).then(function (o) {
      var app = o.app, m = o.model;
      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      app.canvas.style.display = 'block';
      fig.innerHTML = '';
      fig.appendChild(app.canvas);
      app.stage.addChild(m);
      // 取景：放大到头部填满侧栏，书桌等道具由容器裁掉
      var s = o.W * 0.00044;
      m.anchor.set(0, 0);
      m.scale.set(s);
      m.x = o.W / 2 - FACE.x * s;
      m.y = o.H * 0.62 - FACE.y * s;
      m.automator.autoUpdate = true;
      L2D.app = app; L2D.model3 = m; L2D.ok = true;
      try { m.motion('Idle'); } catch (e) {}
      fig.classList.add('is-live2d');
      document.documentElement.setAttribute('data-pet', 'live2d');
      return true;
    });
  }

  var EXPR = {
    idle: null, happy: '开心兴奋', praise: '星星眼', love: '爱心眼',
    think: '问号', warn: '流汗', sad: '悲伤', star: '情绪花花'
  };

  /* ---------- 根据当前页面和数据决定说什么 ---------- */
  function compose() {
    var r = A.getRoute();
    var t = A.tally(A.activePool());
    var es = A.estimateNow();
    var pct = A.pct(t.tested, t.total);

    if (r === 'test' && A.S.session) {
      var sess = A.S.session;
      var c = A.sessionCounts(sess);
      if (sess.kind === 'probe') {
        var st = A.probeStats(sess);
        var need = st.n ? Math.max(0, Math.ceil(st.n * Math.pow(st.half / sess.target, 2)) - st.n) : 0;
        if (!st.n) return { mood: 'idle', text: '开始吧。凭第一反应作答，别停下来想——想太久反而不准。' };
        if (need === 0) return { mood: 'praise', text: '已经达到 ±' + sess.target + ' 词的精度了，随时可以结束看结果。' };
        return { mood: 'idle', text: '答了 ' + st.n + ' 题，当前精度 ±' + (st.half === Infinity ? '—' : st.half) +
          ' 词。再答约 ' + need + ' 题就能收到 ±' + sess.target + ' 词。' };
      }
      return { mood: 'idle', text: '本组第 ' + (c.answered) + ' 题，这次掌握率 ' +
        (c.answered ? Math.round((c.k + 0.5 * c.f) / c.answered * 100) : 0) + '%。' };
    }

    if (r === 'result') {
      var lr = A.S.lastResult;
      if (lr && lr.total) {
        var rate = Math.round((lr.k + 0.5 * lr.f) / lr.total * 100);
        return {
          mood: rate >= 80 ? 'praise' : rate >= 50 ? 'idle' : 'warn',
          text: rate >= 80 ? '这次掌握率 ' + rate + '%，很稳。想更准就再来一轮窄区间的。'
            : rate >= 50 ? '这次掌握率 ' + rate + '%。往下看「下一步做什么」，那里有具体的补法。'
              : '这次掌握率只有 ' + rate + '%。先别急着刷，去总览看是哪个频段拖后腿。',
          acts: [{ label: '分析这次结果', act: 'ai-ask', q: '帮我分析这次检测结果，指出最该补的地方' },
                 { label: '看频段分布', act: 'go', route: 'stats' }]
        };
      }
    }

    if (r === 'stats') {
      if (!t.tested) return { mood: 'idle', text: '还没有数据。先做一次快速摸底，3 分钟就能出结果。',
        acts: [{ label: '开始摸底', act: 'start', kind: 'probe', target: 400 }] };
      return { mood: 'idle', text: '已测 ' + t.tested + ' / ' + t.total + ' 词（' + pct + '%）。' +
        (es.kind === 'full' ? '已经接近全库实测，估算值基本就是实际值。'
          : es.kind === 'sample' ? '当前估算 ≈ ' + es.vocab.toLocaleString('en-US') + ' 词，95% 区间 ' +
            es.lo.toLocaleString('en-US') + '~' + es.hi.toLocaleString('en-US') + '。'
            : '分组检测的结果不外推，补一次随机抽样才能算词汇量。'),
        acts: [{ label: '生成复习计划', act: 'ai-ask', q: '根据我的数据生成一个两周复习计划' }] };
    }

    if (r === 'settings') {
      return { mood: 'idle', text: '作答只存在这台浏览器里，换设备看不到。测出满意结果后建议导出备份。',
        acts: [{ label: '导出备份', act: 'export-json' }] };
    }

    if (r === 'groups') {
      return { mood: 'idle', text: '已测 ' + t.tested + ' 词，其中认识 ' + t.k + ' 词。想系统过一遍就从第一组开始，一组 ' + A.GROUP_SIZE + ' 词。',
        acts: [{ label: '从第一组开始', act: 'start', kind: 'group', group: '0' }] };
    }

    // home
    if (es.kind === 'sample') {
      return { mood: 'idle', text: '上次估算 ≈ ' + es.vocab.toLocaleString('en-US') + ' 词（±' +
        Math.round((es.hi - es.lo) / 2) + ' 词）。想收窄误差就再测一轮。',
        acts: [{ label: '让 AI 看看', act: 'ai-ask', q: '我现在该怎么提升？重点补哪里？' },
               { label: '再测一次', act: 'start', kind: 'probe', target: 250 }] };
    }
    if (t.tested) {
      return { mood: 'idle', text: '你已经测过 ' + t.tested + ' 词（来自分组检测）。分组结果不能外推，补一次随机摸底才能算出词汇量。',
        acts: [{ label: '补一次摸底', act: 'start', kind: 'probe', target: 250 }] };
    }
    return { mood: 'happy', text: '第一次来？做一次快速摸底就行——约 80 题、3 分钟，给你一个带误差范围的数字。',
      acts: [{ label: '开始摸底', act: 'start', kind: 'probe', target: 400 },
             { label: '这是什么？', act: 'ai-ask', q: '这个工具是怎么算出我的词汇量的？' }] };
  }

  /* ---------- 渲染 ---------- */
  var built = false, figEl = null, sayEl = null, actsEl = null, creditEl = null, lastText = '', lastMood = '';

  // 署名必须跟着实际用的形象走：Live2D 是第三方素材要署名，SVG 是本项目原创
  function setCredit(kind) {
    if (!creditEl) return;
    creditEl.innerHTML = kind === 'live2d'
      ? '形象：DS鲸鱼娘（Live2D）· <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a><br>原作 上善无形 / 二次设计 ZipZipPipe / 建模 氵六青'
      : '形象：本站原创 SVG · MIT';
  }

  function paint(mood) {
    if (!figEl || L2D.ok) return;
    if (mood === lastMood && figEl.querySelector('svg')) return;
    figEl.innerHTML = mascotSVG(mood);
  }

  A.renderPet = function () {
    var host = document.getElementById('pet');
    if (!host) return;
    if (!built) {
      host.innerHTML = '<div class="pet-card">' +
        '<div class="pet-fig" id="petFig"></div>' +
        '<div class="pet-say" id="petSay"></div>' +
        '<div class="pet-acts" id="petActs"></div>' +
        '<div class="pet-credit" id="petCredit"></div></div>';
      figEl = document.getElementById('petFig');
      sayEl = document.getElementById('petSay');
      actsEl = document.getElementById('petActs');
      creditEl = document.getElementById('petCredit');
      built = true;
      figEl.innerHTML = mascotSVG('happy');
      figEl.addEventListener('click', function () {
        if (L2D.ok) {
          var pool = ['SelfieQuick', 'BubbleGum', 'Hammer'];
          try { L2D.model3.motion(pool[Math.floor(Math.random() * pool.length)]); } catch (e) {}
        } else {
          figEl.classList.remove('is-poked');
          void figEl.offsetWidth;
          figEl.classList.add('is-poked');
        }
      });
      try {
        if (live2dAllowed()) {
          L2D.base = '';
          setCredit('svg');
          mountLive2D(figEl).then(function () {
            document.documentElement.setAttribute('data-pet', 'live2d');
            setCredit('live2d');
          }).catch(function () {
            L2D.reason = 'load-failed';
            document.documentElement.setAttribute('data-pet', 'svg');   // 静默退回 SVG
            setCredit('svg');
          });
        } else {
          L2D.reason = 'not-allowed';
          document.documentElement.setAttribute('data-pet', 'svg');
          setCredit('svg');
        }
      } catch (e) {
        L2D.reason = 'threw:' + e.message;
        document.documentElement.setAttribute('data-pet', 'svg');
        setCredit('svg');
      }
    }

    var d = compose();
    if (d.text !== lastText) { sayEl.textContent = d.text; lastText = d.text; }
    if (d.mood !== lastMood) { lastMood = d.mood; paint(d.mood); }
    if (L2D.ok) {
      var name = EXPR[d.mood];
      if (name) { try { L2D.model3.expression(name); } catch (e) {} }
    }

    var acts = d.acts || [];
    var sig = acts.map(function (x) { return x.label; }).join('|');
    if (actsEl.getAttribute('data-sig') !== sig) {
      actsEl.setAttribute('data-sig', sig);
      actsEl.innerHTML = acts.map(function (x) {
        var attr = 'data-act="' + x.act + '"';
        if (x.kind) attr += ' data-kind="' + x.kind + '"';
        if (x.target) attr += ' data-target="' + x.target + '"';
        if (x.group !== undefined) attr += ' data-group="' + x.group + '"';
        if (x.route) attr += ' data-route="' + x.route + '"';
        if (x.q) attr += ' data-q="' + A.esc(x.q) + '"';
        return '<button class="pet-chip" ' + attr + '>' + A.esc(x.label) + '</button>';
      }).join('');
    }
  };

  /* 供调试：?pet=live2d / ?pet=svg 强制切换 */
  A.petInfo = function () {
    return { live2d: L2D.ok, tried: L2D.tried, reason: L2D.reason || '' };
  };
})(window.__APP__ || (window.__APP__ = {}));
