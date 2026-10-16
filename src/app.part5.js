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
      var s = o.W * 0.000545;   // 取景收紧，把桌面道具裁出画面
      m.anchor.set(0, 0);
      m.scale.set(s);
      m.x = o.W / 2 - FACE.x * s;
      m.y = o.H * 0.277 - FACE.y * s;
      m.automator.autoUpdate = true;
      L2D.app = app; L2D.model3 = m; L2D.ok = true;
      try { m.motion('Idle'); } catch (e) {}
      bindGaze();
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
    var fed = A.S.tokens || 0;

    if (r === 'test' && A.S.session) {
      var sess = A.S.session;
      var c = A.sessionCounts(sess);
      if (sess.kind === 'probe') {
        var st = A.probeStats(sess);
        var need = st.n ? Math.max(0, Math.ceil(st.n * Math.pow(st.half / sess.target, 2)) - st.n) : 0;
        if (!st.n) return { mood: 'idle', text: '开始咯。凭第一反应答就行——想太久反而不准。我在这儿陪着你。' };
        if (need === 0) return { mood: 'praise', text: '精度达标啦，±' + sess.target + ' 词到手，随时可以收工看结果。' };
        return { mood: 'idle', text: '答了 ' + st.n + ' 题，当前精度 ±' + (st.half === Infinity ? '—' : st.half) +
          ' 词。再答约 ' + need + ' 题就能收到 ±' + sess.target + ' —— 快到了，别半途而废嘛。' };
      }
      return { mood: 'idle', text: '本组第 ' + c.answered + ' 题，这次掌握率 ' +
        (c.answered ? Math.round((c.k + 0.5 * c.f) / c.answered * 100) : 0) + '%。一组 ' + A.GROUP_SIZE + ' 词，不着急。' };
    }

    if (r === 'result') {
      var lr = A.S.lastResult;
      if (lr && lr.total) {
        var rate = Math.round((lr.k + 0.5 * lr.f) / lr.total * 100);
        return {
          mood: rate >= 80 ? 'praise' : rate >= 50 ? 'idle' : 'warn',
          text: rate >= 80 ? '这次掌握率 ' + rate + '%，稳的。想更准就再来一轮窄区间的。'
            : rate >= 50 ? '这次掌握率 ' + rate + '%。往下看「下一步做什么」，那儿写着具体怎么补。'
              : '掌握率只有 ' + rate + '%…先别急着背。去总览看是哪个频段拖的后腿——打蛇打七寸。',
          acts: [{ label: '分析这次结果', act: 'ai-ask', q: '帮我分析这次检测结果，指出最该补的地方' },
                 { label: '看频段分布', act: 'go', route: 'stats' }]
        };
      }
    }

    if (r === 'stats') {
      if (!t.tested) return { mood: 'idle', text: '还没有数据呢。先做一次快速摸底，3 分钟就够。',
        acts: [{ label: '开始摸底', act: 'start', kind: 'probe', target: 400 }] };
      return { mood: 'idle', text: '已测 ' + t.tested + ' / ' + t.total + ' 词（' + pct + '%）。' +
        (es.kind === 'full' ? '已经接近全库实测，算出来的基本就是实际值了。'
          : es.kind === 'sample' ? '当前估算 ≈ ' + es.vocab.toLocaleString('en-US') + ' 词，95% 区间 ' +
            es.lo.toLocaleString('en-US') + '~' + es.hi.toLocaleString('en-US') + '。'
            : '分组的结果我不外推——补一次随机抽样才能算出词汇量。'),
        acts: [{ label: '生成复习计划', act: 'ai-ask', q: '根据我的数据生成一个两周复习计划' }] };
    }

    if (r === 'settings') {
      return { mood: 'idle',
        text: '作答只存在这台浏览器里，换台设备就看不见了。测出满意的结果记得导出备份。' +
          (fed ? ' 对了，我已经吃掉你 ' + fed.toLocaleString('en-US') + ' 个 token 了，谢谢投喂～' : ''),
        acts: [{ label: '导出备份', act: 'export-json' }] };
    }

    if (r === 'groups') {
      return { mood: 'idle', text: '已测 ' + t.tested + ' 词，其中认识 ' + t.k + ' 词。想系统过一遍就从第一组开始，一组 ' + A.GROUP_SIZE + ' 词。',
        acts: [{ label: '从第一组开始', act: 'start', kind: 'group', group: 0 }] };
    }

    // home
    if (es.kind === 'sample') {
      return { mood: 'idle', text: '上次估算 ≈ ' + es.vocab.toLocaleString('en-US') + ' 词（±' +
        Math.round((es.hi - es.lo) / 2) + ' 词）。想收窄误差就再测一轮，我陪你。',
        acts: [{ label: '让 AI 看看', act: 'ai-ask', q: '我现在该怎么提升？重点补哪里？' },
               { label: '再测一次', act: 'start', kind: 'probe', target: 250 }] };
    }
    if (t.tested) {
      return { mood: 'idle', text: '你已经测过 ' + t.tested + ' 词了，不过那是分组检测——不能外推。补一次随机摸底才能算出词汇量。',
        acts: [{ label: '补一次摸底', act: 'start', kind: 'probe', target: 250 }] };
    }
    return { mood: 'happy', text: '第一次来呀。做一次快速摸底就行——约 80 题、3 分钟，我给你一个带误差范围的数字。',
      acts: [{ label: '开始摸底', act: 'start', kind: 'probe', target: 400 },
             { label: '这是什么？', act: 'ai-ask', q: '这个工具是怎么算出我的词汇量的？' }] };
  }


  /* ---------- 桌宠：位置、拖动、重力、自己溜达 ---------- */
  var built = false, hostEl = null, figEl = null, sayEl = null, actsEl = null, creditEl = null, shadowEl = null;
  var lastText = '', lastMood = '', lastSig = '';
  var NW = 232, NH = 424, CREDIT_H = 16;   // 容器高度；脚底 = 容器底往上 16px（与 CSS 对应）
  var P = { x: 0, y: 0, vy: 0, vx: 0, dragging: false, air: false, walking: false, faceL: false };
  var drag = { on: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: 0 };
  var walkTimer = null, rafId = null, lastT = 0, gazeBound = false;

  function wide() {
    try { return !!(window.matchMedia && window.matchMedia('(min-width:820px)').matches); } catch (e) { return false; }
  }
  function navH() {
    var n = document.querySelector('.nav');
    return n ? n.getBoundingClientRect().height : 0;
  }
  // 脚底 = 容器底往上 CREDIT_H，让它正好踩在底部导航的上沿
  function feetTop() { return window.innerHeight - navH() + 8 - (NH - CREDIT_H); }
  function floorY() { return feetTop(); }
  function maxX() { return window.innerWidth - NW - 8; }

  function apply() {
    if (!hostEl) return;
    hostEl.style.setProperty('--px', Math.round(P.x) + 'px');
    hostEl.style.setProperty('--py', Math.round(P.y) + 'px');
  }
  function setAir(on) { if (P.air !== on) { P.air = on; hostEl.classList.toggle('air', on); } }
  function setWalk(on) { if (P.walking !== on) { P.walking = on; hostEl.classList.toggle('walk', on); } }
  function setFace(l) { if (P.faceL !== l) { P.faceL = l; hostEl.classList.toggle('face-l', l); } }

  function stopWalk() {
    if (walkTimer) { clearTimeout(walkTimer); walkTimer = null; }
    P.vx = 0; setWalk(false);
  }

  // 溜达：隔一段时间挑一个附近的落点走过去；拖拽中或页面不可见时不动
  function scheduleWalk() {
    if (walkTimer) clearTimeout(walkTimer);
    if (!wide() || document.hidden) return;
    walkTimer = setTimeout(function () {
      if (P.dragging || document.hidden) return scheduleWalk();
      var span = Math.min(320, window.innerWidth * 0.32);
      var tx = Math.max(8, Math.min(maxX(), P.x + (Math.random() * 2 - 1) * span));
      var dur = Math.abs(tx - P.x) / 0.075;            // 约 75 px/s
      var from = P.x, t0 = performance.now();
      setWalk(true); setFace(tx < from);
      (function step(now) {
        if (!P.walking) return;
        var k = Math.min(1, (now - t0) / dur);
        P.x = from + (tx - from) * (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
        apply();
        if (k < 1) requestAnimationFrame(step);
        else { setWalk(false); scheduleWalk(); }
      })(t0);
    }, 9000 + Math.random() * 12000);
  }

  // 物理：只有竖直方向，松手后自由落体到地面
  function tick(now) {
    rafId = requestAnimationFrame(tick);
    var dt = Math.min(48, now - (lastT || now)); lastT = now;
    if (P.dragging) { applyDepth(lastNx, lastNy, Math.max(0, floorY() - P.y)); return; }
    if (P.air) {
      P.vy += 0.0022 * dt * dt * 0.5;
      P.y += P.vy * dt * 0.06;
      var fy = floorY();
      if (P.y >= fy) {
        P.y = fy; P.vy = 0; setAir(false);
        hostEl.classList.add('poked');                     // 落地小弹一下
        setTimeout(function () { hostEl.classList.remove('poked'); }, 500);
      }
      apply();
      applyDepth(lastNx, lastNy, Math.max(0, floorY() - P.y));
    }
  }

  function startLoop() {
    if (rafId || !wide()) return;
    lastT = 0; rafId = requestAnimationFrame(tick);
  }

  function onDown(e) {
    if (!hostEl) return;
    drag.on = true; drag.moved = 0;
    drag.sx = e.clientX; drag.sy = e.clientY;
    drag.ox = P.x; drag.oy = P.y;
    P.dragging = true; stopWalk(); setAir(false);
    figEl.classList.add('grabbing');
    try { figEl.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag.on) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    P.x = Math.max(4, Math.min(maxX(), drag.ox + dx));
    P.y = Math.max(4, Math.min(window.innerHeight - 40, drag.oy + dy));
    setFace(dx < -4 ? true : dx > 4 ? false : P.faceL);
    apply();
  }
  function onUp() {
    if (!drag.on) return;
    drag.on = false; P.dragging = false;
    figEl.classList.remove('grabbing');
    if (drag.moved < 6) { poke(); }                       // 没怎么动就算「戳一下」
    else {
      P.vy = 0; setAir(true);
      if (P.y > floorY()) { P.y = floorY(); setAir(false); }
    }
    scheduleWalk();
  }

  // 立体感三件套：透视倾斜 + 接触投影 + 气泡视差
  var lastNx = 0, lastNy = 0;
  function applyDepth(nx, ny, lift) {
    lastNx = nx; lastNy = ny;
    if (figEl) {
      figEl.style.setProperty('--ty', (nx * 9).toFixed(2) + 'deg');    // 左右转向
      figEl.style.setProperty('--tx', (-ny * 6).toFixed(2) + 'deg');   // 上下俯仰
    }
    if (sayEl) sayEl.style.setProperty('--bx', (nx * -7).toFixed(1) + 'px');  // 气泡反向视差，拉开层次
    if (shadowEl) {
      var k = Math.max(0, Math.min(1, (lift || 0) / 260));
      shadowEl.style.setProperty('--shs', (1 - k * 0.55).toFixed(3));
      shadowEl.style.setProperty('--shx', (nx * -14 * (1 - k)).toFixed(1) + 'px');
      shadowEl.style.opacity = (0.92 - k * 0.62).toFixed(2);
      // 影子锚在地面：她升多高，影子就往下补多少，视觉上留在原地
      shadowEl.style.bottom = (18 - (lift || 0)).toFixed(0) + 'px';
    }
  }

  // 让她看你：Live2D 内置的 focusController 会把焦点换算成转头与转眼参数。
  // 之前完全没驱动这个，所以她永远直视前方 —— 看着就像一张贴纸。
  function bindGaze() {
    if (gazeBound) return;
    gazeBound = true;
    var px = 0, py = 0, queued = false;
    document.addEventListener('pointermove', function (e) {
      px = e.clientX; py = e.clientY;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        var m = L2D.model3;
        if (!L2D.ok || !m || !figEl) return;
        var r = figEl.getBoundingClientRect();
        var dx = (px - (r.left + r.width / 2)) / (window.innerWidth * 0.45);
        var dy = (py - (r.top + r.height * 0.42)) / (window.innerHeight * 0.45);
        dx = Math.max(-1, Math.min(1, dx));
        dy = Math.max(-1, Math.min(1, dy));
        // focus 期望模型内部坐标系，所以映射到模型尺寸上
        try { m.focus(m.width * (0.5 + dx * 0.45), m.height * (0.5 + dy * 0.45)); } catch (e) {}
        applyDepth(dx, dy, P.dragging ? 0 : Math.max(0, floorY() - P.y));
      });
    }, { passive: true });
  }

  function poke() {
    hostEl.classList.remove('poked');
    void hostEl.offsetWidth;
    hostEl.classList.add('poked');
    setTimeout(function () { hostEl.classList.remove('poked'); }, 520);
    if (L2D.ok) {
      var pool = ['SelfieQuick', 'BubbleGum', 'Hammer', 'SprayWater'];
      try { L2D.model3.motion(pool[Math.floor(Math.random() * pool.length)]); } catch (e) {}
    }
  }

  // 署名跟着实际形态走：Live2D 是第三方素材要署名，SVG 是本项目原创
  function setCredit(kind) {
    if (!creditEl) return;
    creditEl.innerHTML = (kind === 'svg'
      ? '形象：本站原创 SVG · MIT'
      : '形象：DS鲸鱼娘 · <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>') +
      feedLine();
  }

  // 「白饭」：AI 诊断烧掉的 token。这条既是社区梗，也是真实的 API 成本
  function feedLine() {
    var t = A.S.tokens || 0;
    if (!t) return '';
    return '<span class="fed">已投喂 ' + t.toLocaleString('en-US') + ' token</span>';
  }

  // 离线形态：优先用 Live2D 模型渲染出的透明 PNG（与联网版同一形象），
  // 拿不到时才退回内置 SVG
  function artHTML() {
    if (window.PET_IMG) return '<img class="pet-art" src="' + window.PET_IMG + '" alt="" draggable="false">';
    return mascotSVG('happy');
  }
  function paint() {
    if (!figEl || L2D.ok) return;
    if (figEl.querySelector('.pet-art') || figEl.querySelector('svg')) return;
    figEl.insertAdjacentHTML('afterbegin', artHTML());
    if (window.PET_IMG) figEl.classList.add('is-static');   // 静态帧同样需要底部渐隐
  }

  function build(host) {
    host.innerHTML =
      '<div class="pet-bubble empty" id="petSay"></div>' +
      '<div class="pet-fig" id="petFig"></div>' +
      '<div class="pet-shadow" id="petShadow"></div>' +
      '<div class="pet-credit" id="petCredit"></div>';
    figEl = document.getElementById('petFig');
    sayEl = document.getElementById('petSay');
    actsEl = null;
    creditEl = document.getElementById('petCredit');
    shadowEl = document.getElementById('petShadow');
    figEl.innerHTML = artHTML();

    figEl.addEventListener('pointerdown', onDown);
    figEl.addEventListener('pointermove', onMove);
    figEl.addEventListener('pointerup', onUp);
    figEl.addEventListener('pointercancel', onUp);

    setCredit(window.PET_IMG ? 'img' : 'svg');
    try {
      if (live2dAllowed()) {
        mountLive2D(figEl).then(function () {
          document.documentElement.setAttribute('data-pet', 'live2d');
          setCredit('live2d');
        }).catch(function () {
          L2D.reason = 'load-failed';
          document.documentElement.setAttribute('data-pet', 'static');
          setCredit(window.PET_IMG ? 'img' : 'svg');
        });
      } else {
        L2D.reason = 'not-allowed';
        document.documentElement.setAttribute('data-pet', 'static');
      }
    } catch (e) {
      L2D.reason = 'threw:' + e.message;
      document.documentElement.setAttribute('data-pet', 'static');
    }

    // 初始位置：右下角，直接站在地面上
    P.x = Math.max(8, window.innerWidth - NW - 26);
    P.y = feetTop();
    apply();
    if (wide()) {
      host.classList.add('on');
      startLoop();
      scheduleWalk();
    }
    window.addEventListener('resize', function () {
      if (!hostEl) return;
      if (wide()) hostEl.classList.add('on'); else hostEl.classList.remove('on');
      P.x = Math.max(8, Math.min(maxX(), P.x));
      P.y = Math.min(P.y, feetTop());
      apply(); startLoop();
    });
  }

  A.renderPet = function () {
    var host = document.getElementById('pet');
    if (!host) return;
    if (!built) { built = true; hostEl = host; build(host); }

    if (creditEl) {
      var fedNow = feedLine();
      if (creditEl.getAttribute('data-fed') !== fedNow) {
        creditEl.setAttribute('data-fed', fedNow);
        setCredit(L2D.ok ? 'live2d' : (window.PET_IMG ? 'img' : 'svg'));
      }
    }

    var d = compose();
    if (d.text !== lastText) {
      sayEl.textContent = '';
      sayEl.appendChild(document.createTextNode(d.text));
      lastText = d.text;
      sayEl.classList.toggle('empty', !d.text);
    }
    if (d.mood !== lastMood) { lastMood = d.mood; paint(); }
    if (L2D.ok) {
      var name = EXPR[d.mood];
      if (name) { try { L2D.model3.expression(name); } catch (e) {} }
    }

    var acts = d.acts || [];
    var sig = acts.map(function (x) { return x.label; }).join('|');
    if (sig !== lastSig) {
      lastSig = sig;
      var box = sayEl.querySelector('.pet-acts');
      if (!box) { box = document.createElement('div'); box.className = 'pet-acts'; sayEl.appendChild(box); }
      box.innerHTML = acts.map(function (x) {
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

  /* 供调试：?pet=live2d / ?pet=svg 强制切换；A.petInfo() 看当前形态 */
  A.petInfo = function () {
    return { live2d: L2D.ok, reason: L2D.reason || '', x: Math.round(P.x), y: Math.round(P.y), air: P.air };
  };

})(window.__APP__ || (window.__APP__ = {}));
