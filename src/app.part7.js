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
