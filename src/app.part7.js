/* ============ 第七部分：视效层 ============
   零依赖，只用 CSS 变量 + 一次委托的 pointermove。
   借鉴的是「效果」而不是源码：reactbits 的 Spotlight Card / Magnet / Shiny Text、
   Aceternity 的 Aurora Background 与移动指示器，都是 React + Tailwind 组件，
   在原生单文件项目里直接搬不进来，所以按同样的视觉原理重写。

   三条纪律：
     1) 只动 transform / opacity / CSS 变量，不动布局属性（避免逐帧重排）
     2) 触摸设备与 prefers-reduced-motion 下自动降级
     3) 任何一个效果失效都不能影响主流程 —— 全部包在 try 里 */
(function (A) {
  'use strict';

  var SPOT_SEL = '.card, .mode, .act, .hero';
  var reduce = false;
  try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  var fine = false;
  try { fine = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches); } catch (e) {}

  /* ---------- 1. 卡片聚光：光斑跟着指针走 ---------- */
  var spotOn = false, queued = false, px = 0, py = 0, curEl = null;

  function paintSpot() {
    queued = false;
    var el = document.elementFromPoint(px, py);
    var card = el && el.closest ? el.closest(SPOT_SEL) : null;
    if (card !== curEl) {
      if (curEl) { curEl.style.removeProperty('--mx'); curEl.style.removeProperty('--my'); }
      curEl = card;
    }
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (px - r.left).toFixed(0) + 'px');
    card.style.setProperty('--my', (py - r.top).toFixed(0) + 'px');
  }

  function bindSpot() {
    if (spotOn) return;
    spotOn = true;
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      px = e.clientX; py = e.clientY;
      if (queued) return;
      queued = true;
      requestAnimationFrame(paintSpot);
    }, { passive: true });
    document.addEventListener('pointerleave', function () {
      if (curEl) { curEl.style.removeProperty('--mx'); curEl.style.removeProperty('--my'); curEl = null; }
    }, true);
  }

  /* ---------- 2. 磁吸：主按钮朝指针方向轻微偏移 ---------- */
  function bindMagnet() {
    if (!fine || reduce) return;
    var MAX = 4;
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var t = e.target && e.target.closest ? e.target.closest('.fx-magnet') : null;
      if (!t) return;
      var r = t.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      t.style.setProperty('--mgx', (dx * MAX).toFixed(2) + 'px');
      t.style.setProperty('--mgy', (dy * MAX).toFixed(2) + 'px');
    }, { passive: true });
    document.addEventListener('pointerout', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.fx-magnet') : null;
      if (!t) return;
      t.style.setProperty('--mgx', '0px');
      t.style.setProperty('--mgy', '0px');
    }, true);
  }

  /* ---------- 3. 导航滑块：把选中态做成一块会滑动的指示片 ---------- */
  var navInited = false;
  function syncNavPill() {
    var pill = document.getElementById('navPill');
    var box = document.querySelector('.nav-in');
    if (!pill || !box) return;
    var on = box.querySelector('button.on');
    if (!on) { pill.style.opacity = '0'; return; }

    // 首次定位直接落位，不要从 0 宽滑出来 —— 那会让人以为指示器在乱跑
    if (!navInited) { pill.style.transition = 'none'; }

    var br = box.getBoundingClientRect(), or = on.getBoundingClientRect();
    pill.style.opacity = '1';
    pill.style.width = or.width + 'px';
    pill.style.transform = 'translateX(' + (or.left - br.left) + 'px)';

    if (!navInited) {
      navInited = true;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { pill.style.transition = ''; });
      });
    }
  }

  /* ---------- 4. 一次性高光扫过（报告页等级徽章） ---------- */
  function sweep() {
    var b = document.querySelector('.rpt-badge');
    if (!b) return;
    b.classList.remove('fx-swept');
    void b.offsetWidth;
    b.classList.add('fx-swept');
  }

  /* ---------- 入场页 ----------
     每次打开都出现（不记忆"已看过"），点「进入」才把主界面交出来。
     两个刻意的设计：
       1) 内容其实早就渲染好了，只是被这层盖住 —— 所以退场是纯视觉过渡，
          不会出现"点了进入还要等加载"的空窗。
       2) 入场期间给其它区块加 inert：键盘 Tab 走不进一个看不见的界面里。 */
  var INTRO_DONE = false;

  function introNum(el, target, dur) {
    if (!el) return;
    var t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);                 // easeOutCubic：数字滚动最后收得住
      el.textContent = Math.round(target * e).toLocaleString('en-US');
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  A.initIntro = function () {
    var intro = document.getElementById('intro');
    if (!intro) return;
    // ?intro=0 跳过（自动化测试与录屏调试用）；不影响正常打开
    try {
      if (new URLSearchParams(location.search).get('intro') === '0') { A.enterApp(true); return; }
    } catch (e) {}

    document.documentElement.classList.add('intro-open');
    ['header.topbar', '.nav', '#view', '.pet', '.rail', '.seal'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) { try { el.setAttribute('inert', ''); } catch (e) {} }
    });

    // 立绘：复用内联的那张待机图（离线也有）
    var w = document.getElementById('introWhale');
    if (w) {
      var art = (window.PET_ART && window.PET_ART['idle-cute']) || '';
      if (art) w.src = art; else w.parentNode.style.display = 'none';
    }
    // 数字滚动：用真实词库规模，不写死
    var words = (window.WORDS && window.WORDS.length) || 0;
    // 例句是按词索引的对象（{ word: [句子...] }），不是数组：直接取 .length 会得到 NaN
    var sent = 0;
    if (window.SENTENCES) {
      try { sent = Object.keys(window.SENTENCES).length; } catch (e) { sent = 0; }
    }
    setTimeout(function () {
      introNum(document.querySelector('[data-intro-num=words]'), words, 1100);
      introNum(document.querySelector('[data-intro-num=sent]'), sent, 1200);
    }, 780);

    var btn = document.getElementById('introEnter');
    if (btn) {
      btn.addEventListener('click', function () { A.enterApp(); });
      setTimeout(function () { try { btn.focus({ preventScroll: true }); } catch (e) {} }, 60);
    }
    // 点空白处也进（整屏就是个"点击进入"），但别吞掉焦点交互
    intro.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#introEnter')) return;
      A.enterApp();
    });
    // 键盘：Enter / Space / Esc 都算进入（不做"必须找到按钮"的迷宫）
    document.addEventListener('keydown', function (e) {
      if (INTRO_DONE) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        A.enterApp();
      }
    }, true);
  };

  /* 进入主界面。instant=true 时不做过渡（?intro=0 与自动化测试用） */
  A.enterApp = function (instant) {
    if (INTRO_DONE) return;
    INTRO_DONE = true;
    var intro = document.getElementById('intro');
    var root = document.documentElement;
    var finish = function () {
      if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
      root.classList.remove('intro-open');
      ['header.topbar', '.nav', '#view', '.pet', '.rail', '.seal'].forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) { try { el.removeAttribute('inert'); } catch (e) {} }
      });
      // 主界面卡片错峰升起：只跑一次，之后路由切换不重放
      root.classList.add('boot-anim');
      setTimeout(function () { root.classList.remove('boot-anim'); }, 1100);
      var view = document.getElementById('view');
      if (view) { try { view.focus({ preventScroll: true }); } catch (e) {} }
      if (A.fxUpdate) { try { A.fxUpdate(); } catch (e) {} }
      // 桌宠此刻才"登场"：先给一次落地反馈，让她不是凭空出现的
      if (A.renderPet) { try { A.renderPet(); } catch (e) {} }
    };
    if (instant || !intro) { finish(); return; }
    intro.classList.add('leaving');
    setTimeout(finish, 520);
  };

  A.introDone = function () { return INTRO_DONE; };
  /* ---------- 对外 ---------- */
  A.fxUpdate = function () {
    try { syncNavPill(); } catch (e) {}
    try { sweep(); } catch (e) {}
  };

  A.initFx = function () {
    try { if (fine) bindSpot(); } catch (e) {}
    try { bindMagnet(); } catch (e) {}
    try {
      window.addEventListener('resize', function () { try { syncNavPill(); } catch (e) {} });
      // 等字体/布局稳定后再摆一次，避免首屏位置偏移
      setTimeout(syncNavPill, 60);
      setTimeout(syncNavPill, 400);
    } catch (e) {}
  };

})(window.__APP__ || (window.__APP__ = {}));
