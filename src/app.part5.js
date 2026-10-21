/* ============ 第五部分：右侧常驻助手（鲸鱼娘） ============
   形象：Sutera-Diffusus 的 512×512 全身立绘（MIT），见 assets/whale-art/ATTRIBUTION.md
   2.5D 的三层做法（平面立绘做出体积感的关键，缺一层就像贴纸）：
     1) 透视倾斜：鼠标位置 → rotateX/rotateY，转轴压在脚底
     2) 接地投影：上下两层椭圆，跟着倾斜偏移、跟着离地缩小变淡
     3) 受光膜：一条跟着倾斜转的斜向反光，暗示光从左上来
   另加呼吸浮动、落地挤压、走路碎步、状态交叉淡入。
   形象拿不到时不画东西（气泡照常工作），绝不留空洞或退回手绘 SVG。 */
(function (A) {
  'use strict';

  /* ---------- 立绘 ---------- */
  var ART_DIR = 'assets/whale-art/';
  var FILE = 'dsh-whale-state-';
  // 情绪 → 立绘。99 张里挑能表达状态的，缺图时沿 FALLBACK 回退
  var MOOD_ART = {
    idle: 'idle-cute', happy: 'celebrate', praise: 'levelup', love: 'blush',
    think: 'curious', warn: 'meme-doubt', sad: 'meme-cry', star: 'achievement'
  };
  var FALLBACK_ART = ['idle-cute', 'greet'];
  // 戳一下会短暂切过去的小动作
  var POKE_ART = ['greet', 'blush', 'celebrate', 'curious', 'angry'];

  function artURL(name) {
    // 单文件离线版把立绘内联成 data URI；联网时直接读目录里的 webp
    var inline = window.PET_ART;
    if (inline && inline[name]) return inline[name];
    return ART_DIR + FILE + name + '.webp';
  }

  /* ---------- 尺寸与几何 ----------
     容器 232×424；立绘盒子 232×232，盒底 = 地面线（距容器底 FIG_BOTTOM）。
     512×512 方图里角色脚底之上还有约 1.6% 的透明留白，用 --art-trim 抵掉，
     这样鞋底正好压在地面线上，投影才不会"浮在半空"。 */
  var NW = 232, NH = 458;
  var FIG_BOTTOM = 16;                       // 立绘盒底距容器底
  var FIG_H = 232;                           // 立绘盒高（和 CSS 里的 .pet-fig height 一致）
  var ART_TRIM = 4;                          // 232 px 显示高度下约 1.6%
  var GROUND_FROM_BOTTOM = FIG_BOTTOM;       // 地面线距容器底

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

    if (r === 'report') {
      var R = A.levelReport ? A.levelReport() : null;
      if (!R) return { mood: 'idle', text: '报告还没准备好。' };
      if (!R.ready) {
        var need = Math.max(0, Math.ceil(R.total * 0.95) - R.tested);
        return { mood: 'idle',
          text: '等级要靠整库实测才站得住。现在已测 ' + R.tested + ' / ' + R.total + ' 词，再测 ' + need + ' 词就能出评级了。',
          acts: [{ label: '继续完整检测', act: 'start', kind: 'all' }] };
      }
      return { mood: R.rank.tone === 'ok' ? 'praise' : R.rank.tone === 'bad' ? 'warn' : 'idle',
        text: '你这次拿下 ' + R.rank.k + ' ' + R.rank.name + '，掌握率 ' + Math.round(R.ratio * 100) +
          '%。' + (R.nextRank ? '再补 ' + R.toNext + ' 词就是 ' + R.nextRank.k + ' 了。' : '已经到顶，接下来是别让它回落。') +
          (R.fuzzyShare >= 0.4 ? ' 注意「模糊」那部分占了 ' + Math.round(R.fuzzyShare * 100) + '%，词汇量有点虚。' : ''),
        acts: [{ label: '让 AI 深读报告', act: 'ai-ask', q: '根据我的词汇等级报告，帮我制定下一步提升计划' },
               { label: '看缺口词表', act: 'go', route: 'stats' }] };
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
    return { mood: 'happy', text: A.myName() + '，第一次来呀。做一次快速摸底就行——约 80 题、3 分钟，我给你一个带误差范围的数字。',
      acts: [{ label: '开始摸底', act: 'start', kind: 'probe', target: 400 },
             { label: '这是什么？', act: 'ai-ask', q: '这个工具是怎么算出我的词汇量的？' }] };
  }


  /* ---------- 桌宠：位置、拖动、重力、自己溜达 ---------- */
  var built = false, hostEl = null, figEl = null, sayEl = null, creditEl = null;
  var shadowEl = null, shadowSoftEl = null, artEl = null, animEl = null, sheenEl = null, hangEl = null;
  var lastText = '', lastMood = '', lastSig = '';
  var P = { x: 0, y: 0, vy: 0, vx: 0, dragging: false, air: false, walking: false, faceL: false };
  var drag = { on: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: 0, lastMove: 0,
               lx: 0, ly: 0, lt: 0, cvx: 0, cvy: 0 };
  var walkTimer = null, rafId = null, lastT = 0;
  // 最后一道保险：按住不动超过这么久才当作松手，正常操作不会碰到
  var DRAG_STALE_MS = 8000;
  var HANDLERS_BOUND = false;

  // 视觉缓动量：透视角、两圈投影的缩放、受光角
  var V = { tx: 0, ty: 0, cs: 1, as: 1, ang: 118 };
  var look = { x: 0, y: 0 };

  /* ---------- 悬空摆动：一个跟手走的弹簧 ----------
     之前用的是 .pet.held + @keyframes petDangle：定时器驱动、摆幅写死 ±6°。
     问题就在于"写死"——不管你手怎么动，她的摆法完全一样，看起来就是一张图在转。
     现在改成状态量 + 每帧积分：
       hx/hxv  身体相对「抓手位置」的横向落后量（手快 → 落后多 → 身体被拖着走）
       sw/swv  摆动角（由 hx 驱动，带过冲与回摆）
       sk      下半身跟不上的一点斜切（次级运动，静态图也能看出"沉")
     三个量都是二阶系统，所以起手会甩、急停会回弹、松手才归零 —— 这才是"被拎着"的物理感。 */
  var HANG = { hx: 0, hy: 0, hxv: 0, hyv: 0, sw: 0, swv: 0, sk: 0, skx: 1, sky: 1 };
  var reduceMo = false;
  try {
    var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq) {
      reduceMo = mq.matches;
      if (mq.addEventListener) mq.addEventListener('change', function (e) { reduceMo = e.matches; });
    }
  } catch (e) {}

  function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  var artState = { name: '', loading: false, want: '', revertTimer: null };

  function wide() {
    try { return !!(window.matchMedia && window.matchMedia('(min-width:820px)').matches); } catch (e) { return false; }
  }
  function navH() {
    var n = document.querySelector('.nav');
    return n ? n.getBoundingClientRect().height : 0;
  }
  // 地面线（= 立绘盒底）正好压到底部导航的上沿：脚踩在导航上，不悬空也不插进去。
  // 上下都夹一道：导航变高、浏览器缩放、窗口极矮时都不会把她顶出视口。
  function groundLine() {
    var g = window.innerHeight - navH();
    var lo = FIG_H + 16;                       // 至少让整只立绘留在视口里
    var hi = window.innerHeight - 12;
    if (g < lo) g = lo;
    if (g > hi) g = Math.max(lo, hi);
    return Math.round(g);
  }
  function feetTop() { return groundLine() - (NH - GROUND_FROM_BOTTOM); }
  function floorY() { return feetTop(); }
  function maxX() { return Math.max(8, window.innerWidth - NW - 8); }

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

  function lift() { return Math.max(0, floorY() - P.y); }

  // 主循环：重力 + 悬空弹簧 + 透视倾斜 + 两圈投影 + 受光角
  function tick(now) {
    rafId = requestAnimationFrame(tick);
    var dt = Math.min(48, now - (lastT || now)); lastT = now;

    // 兜底：拖拽状态卡住时自己解开，否则重力会被永久挡住
    if (P.dragging && now - drag.lastMove > DRAG_STALE_MS) endDrag();

    if (!P.dragging && P.air) {
      P.vy += 0.0022 * dt * dt * 0.5;
      P.y += P.vy * dt * 0.06;
      var fy = floorY();
      if (P.y >= fy) {
        P.y = fy; P.vy = 0; setAir(false);
        // 落地：先压一下再抖两下，像把身上的灰抖掉
        hostEl.classList.add('shake');
        setTimeout(function () { hostEl.classList.remove('shake'); }, 560);
      }
      apply();
    }

    stepHang(now, dt);
    applyDepth();
  }

  function startLoop() {
    if (rafId || !wide()) return;
    lastT = 0; rafId = requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ---------- 悬空弹簧：每帧推进一步 ----------
     不拖拽时目标全为 0，靠阻尼自然归位，所以松手后她还会余摆两下才停。 */
  function stepHang(now, dt) {
    var f = Math.min(3, dt / 16.7);                 // 换算成"多少个 60fps 帧"
    var held = P.dragging;

    // 手停住（没有新的 pointermove）就把手的速度读带回零，
    // 否则她会一直歪着——弹簧的输入是"手的速度"，手不动速度就该归零。
    if (held && now - drag.lastMove > 60) {
      drag.cvx *= Math.pow(0.86, f);
      drag.cvy *= Math.pow(0.86, f);
    }

    // 身体落后于抓手的横向位移：手往右快速拖 → 身体被甩在左边
    // 用平方根响应：慢拖也有明显反应、快拖又不会一路顶到上限。
    // 线性比例试过，750px/s 只有 5°（几乎看不出来），而一味放大就会让"每一下都摆到最大"，
    // 那和写死摆幅是一回事。sqrt 让 300px/s 也能甩到 14°，1500px/s 才到 30° 的顶。
    var avx = Math.abs(drag.cvx), avy = Math.abs(drag.cvy);
    var targX = (held && avx > 2) ? (drag.cvx > 0 ? -1 : 1) * Math.min(30, 30 * Math.sqrt(avx / 1500)) : 0;
    var targY = (held && avy > 2) ? (drag.cvy > 0 ? -1 : 1) * Math.min(12, 12 * Math.sqrt(avy / 1500)) : 0;
    if (held && !reduceMo) targY += Math.sin(now / 380) * 1.8;   // 静止被拎着也在轻轻沉浮，不是雕像

    HANG.hxv += (targX - HANG.hx) * 0.16 * f;
    HANG.hxv *= Math.pow(0.80, f);
    HANG.hx = clampN(HANG.hx + HANG.hxv * f, -34, 34);

    HANG.hyv += (targY - HANG.hy) * 0.18 * f;
    HANG.hyv *= Math.pow(0.78, f);
    HANG.hy = clampN(HANG.hy + HANG.hyv * f, -22, 22);

    // 摆角：主体由横向落后量决定；再叠一层低频的自然晃，静止被拎着也有生气
    var idleAmp = (held && !reduceMo) ? 1.9 : 0;
    var targA = (held ? clampN(HANG.hx * 0.60, -18, 18) : 0) + Math.sin(now / 205) * idleAmp;
    HANG.swv += (targA - HANG.sw) * 0.10 * f;
    HANG.swv *= Math.pow(0.84, f);
    HANG.sw = clampN(HANG.sw + HANG.swv * f, -22, 22);

    // 次级运动：下半身跟不上上半身，给一点反相斜切（静态立绘也能看出"沉"）
    var targSk = held ? clampN(-HANG.sw * 0.20 - HANG.hxv * 0.06, -7, 7) : 0;
    HANG.sk += (targSk - HANG.sk) * 0.22 * f;

    // 拉伸/挤压：动画里的老办法，动作一快就顺着运动方向抻一下，急停再弹回来。
    // 一张静态图只有靠这个才不像"刚性贴图"，幅度必须很小，过了就成橡皮人。
    var spd = Math.sqrt(drag.cvx * drag.cvx + drag.cvy * drag.cvy);
    var sp = (held && !reduceMo) ? Math.min(1, spd / 1600) : 0;
    var horiz = Math.abs(drag.cvx) >= Math.abs(drag.cvy);
    var tsx = 1 + sp * (horiz ? 0.055 : 0.02);
    var tsy = 1 - sp * (horiz ? 0.035 : 0.05);
    HANG.skx += (tsx - HANG.skx) * 0.25 * f;
    HANG.sky += (tsy - HANG.sky) * 0.25 * f;

    writeHang();
  }

  function writeHang() {
    if (!hangEl) return;
    hangEl.style.setProperty('--hx', HANG.hx.toFixed(1) + 'px');
    hangEl.style.setProperty('--hy', HANG.hy.toFixed(1) + 'px');
    hangEl.style.setProperty('--sw', HANG.sw.toFixed(2) + 'deg');
    hangEl.style.setProperty('--sk', HANG.sk.toFixed(2) + 'deg');
    hangEl.style.setProperty('--skx', HANG.skx.toFixed(3));
    hangEl.style.setProperty('--sky', HANG.sky.toFixed(3));
  }

  // 把她送回右下角的老位置（双击桌宠、或 A.petReset() 都能用）
  function resetPos() {
    stopWalk();
    P.dragging = false; drag.on = false;
    P.vy = 0; setAir(false);
    P.x = Math.max(8, window.innerWidth - NW - 26);
    P.y = floorY();
    apply();
    scheduleWalk();
  }

  /* ---------- 被拎起来时的「悬空挣扎」 ----------
     静态立绘要显得活着，得同时给三样东西，缺一样就露馅：
       1) 物理感：转轴从脚底挪到头顶，改成被拎着的摆动（纯 CSS，见 .pet.held）
       2) 表情：换成挣扎的立绘
       3) 台词：气泡里喊一句
     松手后三样一起还原，不能只还原其中一部分。 */
  var HELD_SAY = ['喂——放我下来！', '别拎我耳朵…', '我还没测完呢！', '放开啦，我自己会走。'];
  var STRUGGLE_ART = ['angry', 'meme-doubt'];
  var heldBackup = null;

  function enterHeld() {
    if (!hostEl) return;
    hostEl.classList.add('held');
    showArt(STRUGGLE_ART[Math.floor(Math.random() * STRUGGLE_ART.length)]);
    // 突然被拎起来：给弹簧一个初始角速度，会先甩一下再开始晃，比从 0 匀速开始自然
    HANG.swv += (Math.random() * 2 - 1) * 2.6;
    HANG.hyv -= 1.2;
    if (sayEl && !heldBackup) {
      // 记住原气泡，松手时还原；这里直接改写，避免和 compose() 抢
      heldBackup = true;
      var acts = sayEl.querySelector('.pet-acts');
      if (acts) acts.style.display = 'none';
      sayEl.textContent = HELD_SAY[Math.floor(Math.random() * HELD_SAY.length)];
      sayEl.classList.remove('empty');
    }
  }
  function exitHeld() {
    if (!hostEl) return;
    hostEl.classList.remove('held');
    // 转轴一会儿要挪回脚底，别让残留的摆角突然放大——收一下，剩下的交给阻尼
    HANG.sw = clampN(HANG.sw, -6, 6);
    HANG.swv *= 0.5;
    HANG.hx *= 0.4; HANG.hxv *= 0.4;
    if (artState.revertTimer) { clearTimeout(artState.revertTimer); artState.revertTimer = null; }
    showArt(MOOD_ART[lastMood] || MOOD_ART.idle);      // 恢复情绪立绘
    if (heldBackup) {
      heldBackup = null;
      lastText = ''; lastSig = '';                      // 逼下一帧把气泡和按钮重画出来
      try { if (A.renderPet) A.renderPet(); } catch (e) {}
    }
  }

  function onDown(e) {
    if (!hostEl) return;
    drag.on = true; drag.moved = 0;
    drag.sx = e.clientX; drag.sy = e.clientY;
    drag.ox = P.x; drag.oy = P.y;
    drag.lastMove = performance.now();
    drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = drag.lastMove;
    drag.cvx = 0; drag.cvy = 0;
    P.dragging = true; stopWalk(); setAir(false);
    figEl.classList.add('grabbing');
    enterHeld();
    try { figEl.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag.on) return;
    // 左键已经松开了：说明 pointerup 丢了，就地收尾
    if (e.buttons === 0) { endDrag(); return; }
    var now = performance.now();
    drag.lastMove = now;
    // 手的速度（px/s），做指数平滑：弹簧的输入就是它，不是位移
    var dtm = Math.max(8, now - drag.lt);
    var ivx = (e.clientX - drag.lx) / dtm * 1000;
    var ivy = (e.clientY - drag.ly) / dtm * 1000;
    drag.cvx = drag.cvx * 0.55 + ivx * 0.45;
    drag.cvy = drag.cvy * 0.55 + ivy * 0.45;
    drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = now;

    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    P.x = Math.max(4, Math.min(maxX(), drag.ox + dx));
    P.y = Math.max(4, Math.min(window.innerHeight - 40, drag.oy + dy));
    setFace(dx < -4 ? true : dx > 4 ? false : P.faceL);
    apply();
  }
  /* 结束拖拽。必须幂等、且只认 P.dragging —— 之前这里用 drag.on 提前 return，
     一旦 pointerup 丢在窗口外，drag.on 和 P.dragging 就会不一致，
     而她从此刻起永远停在半空（重力被 P.dragging 挡住）。 */
  function endDrag() {
    if (!P.dragging && !drag.on) return;
    var moved = drag.moved;
    drag.on = false; P.dragging = false;
    if (figEl) figEl.classList.remove('grabbing');
    exitHeld();                                          // 先退出挣扎态，再决定是戳还是落下
    if (moved < 6) {
      // 没怎么动 = 戳一下；顺手把她放回地面，别留在半空
      poke();
      if (P.y > floorY()) { P.y = floorY(); }
      apply();
    } else if (P.y > floorY()) {
      P.y = floorY(); P.vy = 0; setAir(false); apply();
    } else {
      P.vy = 0; setAir(true);                            // 交给重力落下
      apply();
    }
    scheduleWalk();
  }

  // 指针事件挂在 window 上：pointerup 一旦丢在浏览器窗口外，
  // 只绑在立绘上的监听就永远收不到，那她就会卡住不动。
  function bindDragHandlers() {
    if (HANDLERS_BOUND) return;
    HANDLERS_BOUND = true;
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    // 拖到窗口外松手时通常只剩 blur 能收到
    window.addEventListener('blur', function () { if (P.dragging) endDrag(); });
  }

  /* 立体感三件套：透视倾斜 + 接地投影 + 受光膜。
     倾斜角由鼠标位置缓动逼近；投影跟着反向横移、随离地高度缩小变淡。 */
  function applyDepth() {
    var k = Math.min(1, lift() / 260);
    // 被拎着的时候不要再跟着鼠标转头：摆动交给 .pet.held 的动画，两套一起转会打架
    var ttx = P.dragging ? 0 : -look.y * 9;
    var tty = P.dragging ? 0 : look.x * 15;

    V.tx += (ttx - V.tx) * 0.10;
    V.ty += (tty - V.ty) * 0.10;
    V.cs += ((1 - k * 0.55) * (1 + Math.abs(look.y) * 0.06) - V.cs) * 0.12;
    V.as += ((1 - k * 0.42) * (1 + Math.abs(look.y) * 0.05) - V.as) * 0.12;
    V.ang += ((118 + V.ty * 2.2 - V.tx * 1.4) - V.ang) * 0.12;

    if (figEl) {
      figEl.style.setProperty('--tx', V.tx.toFixed(2) + 'deg');
      figEl.style.setProperty('--ty', V.ty.toFixed(2) + 'deg');
    }
    if (sheenEl) sheenEl.style.setProperty('--sang', V.ang.toFixed(1) + 'deg');
    // 离地多少，影子就往下补多少 —— 这样她被拎在半空时，影子还老老实实躺在地面上
    var shy = Math.round(lift()) + 'px';
    if (shadowEl) {
      shadowEl.style.setProperty('--shy', shy);
      shadowEl.style.setProperty('--shs', V.cs.toFixed(3));
      shadowEl.style.setProperty('--shx', (-V.ty * 1.5).toFixed(1) + 'px');
      shadowEl.style.opacity = (0.92 - k * 0.6).toFixed(2);
    }
    if (shadowSoftEl) {
      shadowSoftEl.style.setProperty('--shy', shy);
      shadowSoftEl.style.setProperty('--shs', V.as.toFixed(3));
      shadowSoftEl.style.setProperty('--shx', (-V.ty * 2.4).toFixed(1) + 'px');
      shadowSoftEl.style.opacity = (0.85 - k * 0.5).toFixed(2);
    }
    if (sayEl) sayEl.style.setProperty('--bx', (look.x * -7).toFixed(1) + 'px');
  }

  // 让她跟着鼠标看：平面立绘转不了头，就用整体倾斜 + 气泡反向视差来暗示朝向
  function bindGaze() {
    var queued = false;
    document.addEventListener('pointermove', function (e) {
      look.x = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth - 0.5) * 2));
      look.y = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight - 0.5) * 2));
      if (queued || rafId) return;                        // 主循环在跑就交给它
      queued = true;
      requestAnimationFrame(function () { queued = false; applyDepth(); });
    }, { passive: true });
  }

  function poke() {
    hostEl.classList.remove('poked');
    void hostEl.offsetWidth;
    hostEl.classList.add('poked');
    setTimeout(function () { hostEl.classList.remove('poked'); }, 520);
    // 短暂换个动作，再回到当前情绪对应的立绘
    var pick = POKE_ART[Math.floor(Math.random() * POKE_ART.length)];
    showArt(pick);
    if (artState.revertTimer) clearTimeout(artState.revertTimer);
    artState.revertTimer = setTimeout(function () {
      artState.revertTimer = null;
      showArt(MOOD_ART[lastMood] || MOOD_ART.idle);
    }, 1400);
  }

  /* ---------- 立绘切换：先探针加载，成功才交叉淡入 ---------- */
  function showArt(name, done) {
    if (!name || name === artState.name) { if (done) done(true); return; }
    artState.want = name;
    var url = artURL(name);
    var probe = new Image();
    probe.onload = function () {
      if (artState.want !== name) { if (done) done(true); return; }   // 期间又切了别的
      artState.name = name;
      var next = document.createElement('img');
      next.className = 'pet-art pet-art-in';
      next.alt = '';
      next.src = url;
      animEl.appendChild(next);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          next.style.opacity = '1';
          if (artEl) artEl.style.opacity = '0';
          setTimeout(function () {
            var old = artEl;
            artEl = next;
            next.classList.remove('pet-art-in');
            if (old && old.parentNode) {
              var keep = old.classList.contains('pet-art-fallback');
              old.parentNode.removeChild(old);
              if (keep) next.classList.add('pet-art-fallback');
            }
          }, 280);
        });
      });
      if (done) done(true);
    };
    probe.onerror = function () { if (done) done(false); };
    probe.src = url;
  }

  function showArtWithFallback(name, i, done) {
    i = i || 0;
    showArt(name, function (ok) {
      if (ok) { if (done) done(true); return; }
      while (i < FALLBACK_ART.length && FALLBACK_ART[i] === name) i++;
      if (i >= FALLBACK_ART.length) { if (done) done(false); return; }
      showArtWithFallback(FALLBACK_ART[i], i + 1, done);
    });
  }

  /* 桌宠上方只保留 token 计量那一行。
     立绘署名（DS鲸鱼娘 · Sutera-Diffusus · MIT）按用户要求从这儿去掉了，
     挪到「设置 → 素材来源」长期保留——MIT 要求保留出处，不能直接消失。
     没有投喂记录时整块为空，CSS 里 :empty 会把它隐藏，不占位也不挡点击。 */
  function refreshFeed() {
    if (!creditEl) return;
    creditEl.innerHTML = feedLine();
  }

  // 「白饭」：AI 诊断烧掉的 token。这条既是社区梗，也是真实的 API 成本
  function feedLine() {
    var t = A.S.tokens || 0;
    if (!t) return '';
    return '<span class="fed">已投喂 ' + t.toLocaleString('en-US') + ' token</span>';
  }

  function build(host) {
    host.innerHTML =
      '<div class="pet-bubble empty" id="petSay"></div>' +
      '<div class="pet-fig" id="petFig">' +
        '<div class="pet-hang" id="petHang">' +
          '<div class="pet-anim" id="petAnim">' +
            '<img class="pet-art pet-art-fallback" id="petArt" alt="" draggable="false">' +
          '</div>' +
        '</div>' +
        '<div class="pet-sheen" id="petSheen"></div>' +
      '</div>' +
      '<div class="pet-shadow soft" id="petShadowSoft"></div>' +
      '<div class="pet-shadow" id="petShadow"></div>' +
      '<div class="pet-credit" id="petCredit"></div>';
    figEl = document.getElementById('petFig');
    sayEl = document.getElementById('petSay');
    creditEl = document.getElementById('petCredit');
    shadowEl = document.getElementById('petShadow');
    shadowSoftEl = document.getElementById('petShadowSoft');
    animEl = document.getElementById('petAnim');
    hangEl = document.getElementById('petHang');
    sheenEl = document.getElementById('petSheen');
    artEl = document.getElementById('petArt');
    artEl.style.opacity = '0';

    host.style.setProperty('--art-trim', ART_TRIM + 'px');
    host.style.setProperty('--ground', GROUND_FROM_BOTTOM + 'px');

    figEl.addEventListener('pointerdown', onDown);
    figEl.addEventListener('dblclick', resetPos);           // 双击回到原位，卡住了也有救
    bindDragHandlers();

    refreshFeed();
    bindGaze();

    showArtWithFallback('idle-cute', 0, function (ok) {
      if (ok) {
        document.documentElement.setAttribute('data-pet', 'sprite');
        if (artEl) artEl.classList.add('pet-art-ready');
      } else {
        // 一张都拿不到：不画错形象，桌宠退化成纯气泡助手
        document.documentElement.setAttribute('data-pet', 'none');
        figEl.style.display = 'none';
        if (shadowEl) shadowEl.style.display = 'none';
        if (shadowSoftEl) shadowSoftEl.style.display = 'none';
      }
    });

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
      if (wide()) { hostEl.classList.add('on'); startLoop(); scheduleWalk(); }
      else { hostEl.classList.remove('on'); stopLoop(); }
      P.x = Math.max(8, Math.min(maxX(), P.x));
      // 不在空中就重新站回地面：窗口变大变小都不会把她留在半空或视口外
      if (P.dragging) return;
      P.y = P.air ? Math.min(P.y, floorY()) : floorY();
      apply();
    });

    // 切走再切回来时补排一次溜达，不然回来后她就再也不动了
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (!hostEl || !wide()) return;
      if (!rafId) startLoop();
      scheduleWalk();
    });
  }

  A.renderPet = function () {
    var host = document.getElementById('pet');
    if (!host) return;
    if (!built) { built = true; hostEl = host; build(host); }
    // 兜底：主循环万一没在跑，这里补上，别让她彻底不动
    else if (wide() && !rafId) startLoop();

    if (creditEl) {
      var fedNow = feedLine();
      if (creditEl.getAttribute('data-fed') !== fedNow) {
        creditEl.setAttribute('data-fed', fedNow);
        refreshFeed();
      }
    }

    var d = compose();
    if (d.text !== lastText) {
      sayEl.textContent = '';
      sayEl.appendChild(document.createTextNode(d.text));
      lastText = d.text;
      sayEl.classList.toggle('empty', !d.text);
    }
    if (d.mood !== lastMood) {
      lastMood = d.mood;
      if (!artState.revertTimer) showArtWithFallback(MOOD_ART[d.mood] || MOOD_ART.idle);
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

  /* 供调试：A.petInfo() 看当前形态与位置；A.petReset() 把她送回原位；?pet=none 整只关掉 */
  A.petInfo = function () {
    return {
      sprite: artState.name || '', form: document.documentElement.getAttribute('data-pet') || '',
      x: Math.round(P.x), y: Math.round(P.y), air: P.air, dragging: P.dragging,
      loop: !!rafId, walking: P.walking, floor: floorY(), ground: groundLine(),
      tiltX: +V.tx.toFixed(1), tiltY: +V.ty.toFixed(1),
      swing: +HANG.sw.toFixed(1), hangX: +HANG.hx.toFixed(1), skew: +HANG.sk.toFixed(1)
    };
  };
  A.petReset = function () { resetPos(); return A.petInfo(); };

  // 允许用 ?pet=none 关掉桌宠（录屏或做对比图时用）
  try {
    if (new URLSearchParams(location.search).get('pet') === 'none') {
      var disable = function () {
        var h = document.getElementById('pet');
        if (h) { h.classList.remove('on'); h.style.display = 'none'; }
        stopWalk(); stopLoop();
        built = true;
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', disable);
      else setTimeout(disable, 0);
      A.renderPet = function () {};
    }
  } catch (e) {}

})(window.__APP__ || (window.__APP__ = {}));
