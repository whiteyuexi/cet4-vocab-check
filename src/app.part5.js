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
    think: 'curious', warn: 'meme-doubt', sad: 'meme-cry', star: 'achievement',
    /* 第一次见面用"挥手"，不用"撒彩纸"——彩纸屑是"贴纸"最强的视觉信号，
       第一眼就读成表情包，而不是一个在场的小家伙。 */
    greet: 'greet'
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

  /* 悬浮高度。她是鲸鱼，不是站着的小人——素材里腿被裙子盖住、两只鞋并拢，
     "迈腿"永远做不出来（见 NEXT.md §九）。改成浮着走，问题就不存在了。
     这个数不能太大（像漂在半空中断开），也不能太小（还是"贴在地上"）。
     地面线 floorY() 仍然是真实地面：投影、离地高度、守卫都按它算，
     只有"她自己的静止高度"抬起来 —— 于是投影自然变小变淡，浮起来这件事就被读出来了。 */
  var HOVER = 42;
  // 对照用：?hover=0 让她回到"踩在地上"的旧样子，方便 A/B
  try { if (new URLSearchParams(location.search).get('hover') === '0') HOVER = 0; } catch (e) {}

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
        acts: [{ label: '让 AI 深读报告', act: 'ai-ask', q: '根据我的词汇量等级报告，帮我制定下一步提升计划' },
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
    return { mood: 'greet', text: A.myName() + '，第一次来呀。做一次快速摸底就行——约 80 题、3 分钟，我给你一个带误差范围的数字。',
      acts: [{ label: '开始摸底', act: 'start', kind: 'probe', target: 400 },
             { label: '这是什么？', act: 'ai-ask', q: '这个工具是怎么算出我的词汇量的？' }] };
  }


  /* ---------- 桌宠：位置、拖动、重力、自己溜达 ---------- */
  var built = false, hostEl = null, figEl = null, sayEl = null, textEl = null, creditEl = null;
  var shadowEl = null, shadowSoftEl = null, artEl = null, animEl = null, sheenEl = null, hangEl = null;
  var lastText = '', lastMood = '', lastSig = '';
  var P = { x: 0, y: 0, vy: 0, vx: 0, dragging: false, air: false, walking: false, faceL: false };
  /* 悬浮起伏：两个不同周期的正弦叠在一起，读起来不像节拍器。
     只影响 --py 的显示，不影响物理坐标（见 apply） */
  var bobY = 0, bobT = 0;
  var drag = { on: false, armed: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: 0, lastMove: 0,
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
  /* 她的静止高度：离地 HOVER。落地判定、复位、窗口变化后的归位，全用这个 */
  function restY() { return floorY() - HOVER; }
  function maxX() { return Math.max(8, window.innerWidth - NW - 8); }
  /* 左边界：宽屏时左侧有信息栏（rail），她不该走进去——既会挡住卡片，也会让用户点不到她。
     窄屏 rail 不显示，就退回原来的 8px。 */
  function minX() {
    var rail = document.querySelector('.rail');
    if (rail) {
      var r = rail.getBoundingClientRect();
      if (r.width > 0 && r.right > 0) return Math.round(r.right + 10);
    }
    return 8;
  }
  A.petMinX = minX;

  function apply() {
    if (!hostEl) return;
    hostEl.style.setProperty('--px', Math.round(P.x) + 'px');
    // 悬浮起伏只加在"画出来的位置"上，不进 P.y ——
    // 否则重力、落地判定、投影的离地高度全会被这几个像素带偏
    hostEl.style.setProperty('--py', Math.round(P.y + bobY) + 'px');
  }
  function setAir(on) { if (P.air !== on) { P.air = on; hostEl.classList.toggle('air', on); } }
  function setWalk(on) { if (P.walking !== on) { P.walking = on; hostEl.classList.toggle('walk', on); } }
  function setFace(l) { if (P.faceL !== l) { P.faceL = l; hostEl.classList.toggle('face-l', l); } }

  function stopWalk() {
    if (walkTimer) { clearTimeout(walkTimer); walkTimer = null; }
    P.vx = 0; setWalk(false);
  }

  /* ---------- 活动范围：她只在自己的右栏里溜达 ----------
     以前的落点是「当前位置 ± 320px」，于是她会一路走到页面中间，正好压在正文与题目上；
     做大范围检测（几百题）时人本来就容易走神，一只鲸鱼从中间横穿过去非常打扰。
     现在：
       · 溜达落点被限制在右侧安全区（视线右栏），不会跨进正文列；
       · **检测进行中不自己走动**（只在原地呼吸/看鼠标），把注意力留给题目；
       · 被人拖到正文区、或窗口变化把她留在那儿，会自己顺着地面走回右下角。 */
  function safeLeft() {
    // 正文列右边界 + 一点余量：以前只按视口算（W*0.68），根本不知道正文有多宽，
    // 于是在 1280–1366 的笔记本上她会落进正文区，气泡正好压在判词行上。
    var w = window.innerWidth;
    var edge = 0;
    var wrap = document.querySelector('.wrap');
    if (wrap) {
      var r = wrap.getBoundingClientRect();
      if (r.width > 0) edge = r.right;
    }
    var byRatio = w * 0.68;              // 右侧约三分之一
    var byContent = w - NW - 340;        // 离右边缘 340px 以内
    var base = Math.max(byRatio, byContent);
    if (edge > 0) base = Math.max(base, edge + 12);
    return Math.max(NW + 8, Math.min(maxX(), base));
  }
  function inSafeZone() { return P.x >= safeLeft() - 2; }
  function busy() {
    // 检测进行中、或有模态打开时不溜达（前者怕打扰，后者怕挡住操作）
    try {
      if (A.S && A.S.session) return true;
      var md = document.getElementById('modal');
      if (md && md.children.length) return true;
    } catch (e) {}
    return false;
  }

  /* 走回右下角（沿着地面，不瞬移）。
     必须能被"新的拖拽"打断，否则会和 onMove 抢着写 P.x —— 表现是拖拽时的弹簧几乎没速度。
     用一个自增 token 作废上一次归位动画。 */
  var glideSeq = 0;
  function glideHome(done) {
    var tx = Math.max(8, window.innerWidth - NW - 26);
    if (Math.abs(tx - P.x) < 4) { if (done) done(); return; }
    var my = ++glideSeq;
    var from = P.x, t0 = performance.now();
    var dur = Math.max(260, Math.abs(tx - from) / 0.34);     // 约 340 px/s，比溜达快
    setWalk(true); setFace(tx < from);
    (function step(now) {
      if (my !== glideSeq || P.dragging) {          // 被拖拽或新动画接管 → 立刻让位
        if (my === glideSeq) setWalk(false);
        return;
      }
      var k = Math.min(1, (now - t0) / dur);
      P.x = from + (tx - from) * (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      apply();
      if (k < 1) requestAnimationFrame(step);
      else { setWalk(false); if (done) done(); }
    })(t0);
  }
  A.petGlideHome = glideHome;          // 测试钩子

  // 溜达：隔一段时间挑一个附近的落点走过去；拖拽中或页面不可见时不动
  function scheduleWalk() {
    if (walkTimer) clearTimeout(walkTimer);
    if (!wide() || document.hidden) return;
    walkTimer = setTimeout(function () {
      if (P.dragging || document.hidden) return scheduleWalk();
      if (busy()) return scheduleWalk();                  // 检测中不溜达
      // 先在安全区里挑落点；如果她本来就在区外，先走回来
      if (!inSafeZone()) {
        glideHome(function () { scheduleWalk(); });
        return;
      }
      var lo = safeLeft(), hi = maxX();
      var span = Math.min(170, (hi - lo) * 0.6);          // 幅度也收小，别横穿
      var tx = Math.max(lo, Math.min(hi, P.x + (Math.random() * 2 - 1) * span));
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

    /* 悬浮起伏。被拎着的时候归零：她应该老老实实跟手，不能自己上下飘 */
    if (P.dragging || reduceMo) {
      bobY = 0;
    } else {
      bobT += dt / 1000;
      bobY = Math.sin(bobT * 1.15) * 3.4 + Math.sin(bobT * 0.37 + 1.1) * 1.7;
      if (hostEl) hostEl.style.setProperty('--py', Math.round(P.y + bobY) + 'px');
    }

    // 兜底：拖拽状态卡住时自己解开，否则重力会被永久挡住
    if (P.dragging && now - drag.lastMove > DRAG_STALE_MS) endDrag();

    if (!P.dragging && P.air) {
      P.vy += 0.0022 * dt * dt * 0.5;
      P.y += P.vy * dt * 0.06;
      var fy = restY();
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
    rigFrame(now);
    petGuard(now);
  }

  /* ---------- 兜底守卫 ----------
     用户反馈过两次"莫名其妙跑到左上角、还拖不动"。与其猜触发路径，不如让她**不可能留在异常位置**：
       1) 数值卫生：任何一处出现 NaN/Infinity（速度、弹簧、坐标），立刻复位——NaN 会永久污染坐标系；
       2) 极端位置自愈：没在拖拽却连续 1.8s 停在边界（x≤minX+1 且 y≤4）或跑到视口外，复位；
       3) 视口内钳位：任何时候都不许整只离开视口。
     这些检查很便宜（每帧几个比较），只在异常时动手，正常操作完全无感。 */
  var badSince = 0;
  function petGuard(now) {
    if (!hostEl) return;
    var bad = false;
    if (!isFinite(P.x) || !isFinite(P.y) || !isFinite(HANG.hx) || !isFinite(HANG.hy) ||
        !isFinite(HANG.sw) || !isFinite(V.tx) || !isFinite(V.ty)) bad = true;
    if (!bad) {
      var lo = minX(), hi = maxX();
      if (P.x < lo - 40 || P.x > hi + 40) bad = true;                 // 跑到视口外
      if (!P.dragging && P.x <= lo + 1 && P.y <= 6) bad = true;        // 卡在左上角那种死角
    }
    if (!bad) { badSince = 0; return; }
    if (!badSince) badSince = now;
    if (now - badSince < 1800) return;                                 // 给正常拖拽 1.8s 宽限
    badSince = 0;
    if (A.petReset) { try { A.petReset(); } catch (e) {} }              // resetPos 现在会清 NaN
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
    // 兜底复位：坐标、弹簧、透视全部清回干净值（NaN 会永久污染坐标系，必须显式清）
    HANG.hx = HANG.hy = HANG.hxv = HANG.hyv = 0;
    HANG.sw = HANG.swv = HANG.sk = 0; HANG.skx = HANG.sky = 1;
    V.tx = V.ty = 0;
    glideSeq++;
    var fx = restY();
    P.x = Math.max(minX(), window.innerWidth - NW - 26);
    P.y = isFinite(fx) ? fx : 313;
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
      if (textEl) textEl.textContent = HELD_SAY[Math.floor(Math.random() * HELD_SAY.length)];
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
      try { var a0 = sayEl && sayEl.querySelector('.pet-acts'); if (a0) a0.style.display = ''; } catch (e) {}
      try { if (A.renderPet) A.renderPet(); } catch (e) {}
    }
  }

  function onDown(e) {
    if (!hostEl) return;
    /* 两层防护，都是为了一个实际发生过的 bug：入场页退场的 0.5 秒里点击穿透，
       落在右下角的桌宠身上就变成"幽灵拖拽"，她被一路拖到左上角、看着像卡死。 */
    if (document.getElementById('intro')) return;                // 入场页还在
    var md = document.getElementById('modal');
    if (md && md.children.length) return;                        // 有模态开着
    drag.on = true; drag.moved = 0; drag.armed = false;
    glideSeq++;                                        // 抓住她时立刻中止归位动画
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
    // 死区：位移不到 5px 不算"拖动"，只当抖动 —— 否则误触一下就能把她挪出几十像素
    if (!drag.armed) {
      if (Math.abs(dx) + Math.abs(dy) < 5) return;
      drag.armed = true;
    }
    P.x = Math.max(minX(), Math.min(maxX(), drag.ox + dx));
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
      if (P.y > restY()) { P.y = restY(); }
      apply();
    } else if (P.y > restY()) {
      P.y = restY(); P.vy = 0; setAir(false); apply();
    } else {
      P.vy = 0; setAir(true);                            // 交给重力落下
      apply();
    }
    // 被她自己停到正文区（挡内容的地方）时，落地后自己走回右下角
    if (!inSafeZone()) {
      var x0 = P.x;
      var waitLand = setInterval(function () {
        if (P.air || P.dragging) return;
        clearInterval(waitLand);
        if (!inSafeZone()) glideHome(function () { scheduleWalk(); });
        else scheduleWalk();
      }, 120);
      setTimeout(function () { clearInterval(waitLand); }, 4000);
    } else {
      scheduleWalk();
    }
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
    // 兜底：又按下了鼠标/手指，却没按在她身上 —— 上一次拖拽必然是残留状态，收尾
    window.addEventListener('pointerdown', function (e) {
      if (!P.dragging) return;
      if (hostEl && hostEl.contains(e.target)) return;
      endDrag();
    }, true);
  }

  /* 立体感三件套：透视倾斜 + 接地投影 + 受光膜。
     倾斜角由鼠标位置缓动逼近；投影跟着反向横移、随离地高度缩小变淡。 */
  function applyDepth() {
    var k = Math.min(1, lift() / 200);
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

      // 绑骨在跑：只换纹理，形变不断；不跑：走原来的 img 交叉淡入
      if (RIG.on) {
        /* 注意：这里**不能**立刻把 <img> 藏掉。
           曾经这么干过，结果用户的机器上画布一帧都没画出来（原因至今未定位，
           但 reduce-motion / DPR / 未捕获异常都可能），于是桌宠整个变成透明的——
           投影和气泡还在，人没了。现在改成：画布画出第一帧之后才接管。 */
        rigSetArt(url);
        if (done) done(true);
        return;
      }

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

  /* ================= 立绘网格绑骨 =================
     一张静态立绘 + 整张图做刚体变换，看起来就是"贴图在摆"——因为真实生物不是刚体：
     胸腔随呼吸起伏、头会独立地歪、尾巴从根部一段段传出去、头发和裙摆永远慢半拍、
     眼睛会眨、视线跟着你走。这些都没有，剩下的就只有"上下浮 4px"。

     做法：把整张画铺成 12×14 的网格（242 个三角形），每个顶点按
     「区域高斯权重 × 若干通道」算位移，再逐三角形做仿射贴图。
     同一张画，画出了形变。代价是每帧自己重绘，所以：
       · 30fps 上限（这些动作本来就慢，30 帧看不出差别）
       · 减少动效 / ?rig=0 / canvas 不可用时，整个退回原来的 <img>
       · 微动靠**离散小动作 + 弹簧**，不是正弦循环——正弦是可以被眼睛数出来的 */
  var RIG = { on: false, ok: false, cv: null, cx: null, dpr: 1, cols: 12, rows: 14,
              grid: [], tex: [], rt: 0, t: 0, actT: 0, actNext: 1400, lean: 0, swim: 0, shown: false };
  var RS = { tail: 0, tailV: 0, head: 0, headV: 0, sq: 0, sqV: 0 };   // 弹簧状态
  var RB = { on: false, t: 0 };                                       // 眨眼进度

  // 各小动作的出现权重。照大肥鱼那套：小动作占绝对多数，眨眼最频繁
  var RIG_ACTS = [['blink', 46], ['tail', 22], ['head', 18], ['bend', 8], ['twice', 6]];

  function rigReg(nx, ny, cx, cy, rx, ry) {
    var a = (nx - cx) / rx, b = (ny - cy) / ry;
    return Math.exp(-(a * a + b * b));
  }

  function rigInit() {
    if (RIG.ok) return RIG.on;
    var cv, cx2;
    try {
      cv = document.createElement('canvas');
      cx2 = cv.getContext && cv.getContext('2d');
    } catch (e) { cx2 = null; }
    if (!cx2 || !animEl) return false;

    RIG.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(FIG_H * RIG.dpr);
    cv.height = Math.round(FIG_H * RIG.dpr);
    cv.className = 'pet-canvas';
    cv.setAttribute('aria-hidden', 'true');
    cx2.scale(RIG.dpr, RIG.dpr);
    animEl.insertBefore(cv, animEl.firstChild);

    RIG.cv = cv; RIG.cx = cx2;
    var i, j, C = RIG.cols, R = RIG.rows;
    RIG.grid.length = 0;
    for (j = 0; j <= R; j++) {
      for (i = 0; i <= C; i++) {
        var nx = i / C, ny = j / R;
        // sx/sy 是源坐标（512 见方），tx/ty 是每帧算出来的目标坐标
        RIG.grid.push({ nx: nx, ny: ny, sx: nx * 512, sy: ny * 512,
                        tx: nx * FIG_H, ty: ny * FIG_H });
      }
    }
    RIG.ok = true; RIG.on = true;
    return true;
  }

  /* 换图：新纹理淡入、旧纹理淡出。
     关键顺序——**新图加载成功之后**才让旧的淡出，否则中途会有一帧两边都是空的。
     万一新图拿不到（文件损坏、内联缺失），就把这一张丢掉、旧表情继续留着，
     绑骨本身不受影响；只有"一张都没加载成功过"时才退回 <img>。 */
  function rigSetArt(url) {
    if (!RIG.ok) return;
    var e = { img: new Image(), a: 0, dir: 1, ok: false };
    e.img.onload = function () {
      e.ok = true;
      var i;
      for (i = 0; i < RIG.tex.length; i++) if (RIG.tex[i] !== e) RIG.tex[i].dir = -1;
    };
    e.img.onerror = function () {
      var i = RIG.tex.indexOf(e);
      if (i >= 0) RIG.tex.splice(i, 1);
      var any = false;
      for (i = 0; i < RIG.tex.length; i++) if (RIG.tex[i].ok) any = true;
      if (any || !RIG.on) return;
      // 一张都没成功：退回老路。artState.name 要先清掉，否则 showArt 会因为"同名"直接返回
      RIG.on = false;
      artState.name = '';
      showArtWithFallback('idle-cute', 0);
    };
    e.img.src = url;
    RIG.tex.push(e);
    while (RIG.tex.length > 3) RIG.tex.shift();
  }

  function rigSpring(o, key, k, c, dt) {
    var vk = key + 'V';
    o[vk] += (-k * o[key] - c * o[vk]) * dt;
    o[key] += o[vk] * dt;
  }

  function rigPick() {
    var i, tot = 0, r;
    for (i = 0; i < RIG_ACTS.length; i++) tot += RIG_ACTS[i][1];
    r = Math.random() * tot;
    for (i = 0; i < RIG_ACTS.length; i++) {
      r -= RIG_ACTS[i][1];
      if (r <= 0) return RIG_ACTS[i][0];
    }
    return 'blink';
  }

  function rigFire(name) {
    if (name === 'blink') { RB.on = true; RB.t = 0; }
    else if (name === 'tail') { RS.tail = 0.55; RS.tailV = 2.2; }
    else if (name === 'head') { RS.head = (Math.random() < 0.5 ? -1 : 1) * 0.9; RS.headV = 0; }
    else if (name === 'bend') { RS.sq = -0.9; RS.sqV = 0; }
    else if (name === 'twice') {
      RB.on = true; RB.t = 0;                       // 连眨两下：第二下靠 t 回绕触发
      RS.tail = 0.35; RS.tailV = 1.4;
      RS.head = (Math.random() < 0.5 ? -1 : 1) * 0.5;
    }
  }

  /* 逐三角形仿射贴图。目标三角形沿重心外扩 0.35px，避免相邻三角形之间出现发丝级裂缝 */
  function rigTri(cx2, img, s0, s1, s2, s3, s4, s5, u0, v0, u1, v1, u2, v2) {
    var E = 0.35, gx = (u0 + u1 + u2) / 3, gy = (v0 + v1 + v2) / 3, ax, ay, d;
    ax = u0 - gx; ay = v0 - gy; d = Math.sqrt(ax * ax + ay * ay) || 1;
    u0 += ax / d * E; v0 += ay / d * E;
    ax = u1 - gx; ay = v1 - gy; d = Math.sqrt(ax * ax + ay * ay) || 1;
    u1 += ax / d * E; v1 += ay / d * E;
    ax = u2 - gx; ay = v2 - gy; d = Math.sqrt(ax * ax + ay * ay) || 1;
    u2 += ax / d * E; v2 += ay / d * E;

    var dx1 = s2 - s0, dy1 = s3 - s1, dx2 = s4 - s0, dy2 = s5 - s1;
    var den = dx1 * dy2 - dx2 * dy1;
    if (!den) return;
    var du1 = u1 - u0, du2 = u2 - u0, dv1 = v1 - v0, dv2 = v2 - v0;
    var m11 = (du1 * dy2 - du2 * dy1) / den;
    var m21 = (du2 * dx1 - du1 * dx2) / den;
    var m12 = (dv1 * dy2 - dv2 * dy1) / den;
    var m22 = (dv2 * dx1 - dv1 * dx2) / den;
    var e0 = u0 - m11 * s0 - m21 * s1;
    var f0 = v0 - m12 * s0 - m22 * s1;

    cx2.save();
    cx2.beginPath();
    cx2.moveTo(u0, v0); cx2.lineTo(u1, v1); cx2.lineTo(u2, v2);
    cx2.closePath();
    cx2.clip();
    cx2.transform(m11, m12, m21, m22, e0, f0);
    cx2.drawImage(img, 0, 0);
    cx2.restore();
  }

  function rigFrame(now) {
    if (!RIG.on || !RIG.cx) return;
    if (!RIG.rt) RIG.rt = now;
    if (now - RIG.rt < 30) return;                  // 30fps 上限
    var dt = Math.min(0.06, (now - RIG.rt) / 1000);
    RIG.rt = now;
    if (dt <= 0) return;

    RIG.t += dt;
    var t = RIG.t;

    // 弹簧：小动作的能量，起手过冲、自己回摆
    rigSpring(RS, 'tail', 95, 13, dt);
    rigSpring(RS, 'head', 70, 12, dt);
    rigSpring(RS, 'sq', 120, 14, dt);

    if (RB.on) { RB.t += dt / 0.20; if (RB.t >= 1) { RB.on = false; RB.t = 0; } }

    // 调度：不等间隔，下一个动作永远猜不到
    RIG.actT += dt * 1000;
    if (RIG.actT >= RIG.actNext) {
      RIG.actT = 0;
      RIG.actNext = 620 + Math.random() * 1700;
      rigFire(rigPick());
    }

    var b = Math.sin(t * (Math.PI * 2) / 4.2);      // 呼吸 4.2s
    var sway = Math.sin(t * 0.62);                  // 极慢的重心摆动
    var hb = Math.sin(t * 1.13 + 1.7);              // 头部自由微动（和呼吸不同相）
    var ang = RS.head * 0.045 + hb * 0.017;         // 头的倾角（弧度）
    var sq = RS.sq;                                 // 挤压能量
    var lag = Math.sin(t * 1.35 - 0.9);             // 发/裙的滞后

    /* 游动状态：走动时整只往前压、尾巴摆得更凶、身上过一道纵向波。
       这三样一起出现，才读得出"在游"；少一样就退化成"平移的贴图" */
    var leanT = P.walking ? (P.faceL ? -1 : 1) * 4.2 : 0;
    RIG.lean += (leanT - RIG.lean) * Math.min(1, dt * 6);
    RIG.swim += ((P.walking ? 1 : 0) - RIG.swim) * Math.min(1, dt * 4);
    var lean = RIG.lean * Math.PI / 180;
    var lca = Math.cos(lean), lsa = Math.sin(lean);

    var bk = 1;
    if (RB.on) {
      var e2 = RB.t;
      bk = 1 - 0.92 * (e2 < 0.28 ? e2 / 0.28 : e2 < 0.5 ? 1 : (1 - e2) / 0.5);
    }

    var S = FIG_H, ox = 0.5 * S, oy = 0.45 * S;
    var g = RIG.grid, k, v, nx, ny, X, Y, dx, dy;
    var wH, wC, wT, wR, wS, wE, wN, hx, hy, dT, wv, dep;

    for (k = 0; k < g.length; k++) {
      v = g[k]; nx = v.nx; ny = v.ny;
      X = nx * S; Y = ny * S;
      dx = 0; dy = 0;

      // 区域权重场：高斯之间自然融合，不会出现硬边
      wH = rigReg(nx, ny, 0.50, 0.26, 0.30, 0.18);   // 头
      wC = rigReg(nx, ny, 0.50, 0.56, 0.22, 0.13);   // 胸
      wT = rigReg(nx, ny, 0.82, 0.66, 0.20, 0.11);   // 尾
      wR = Math.max(rigReg(nx, ny, 0.23, 0.58, 0.12, 0.20),
                    rigReg(nx, ny, 0.77, 0.56, 0.12, 0.20));        // 两侧头发
      wS = rigReg(nx, ny, 0.50, 0.80, 0.28, 0.12);   // 裙摆
      wN = rigReg(nx, ny, 0.50, 0.52, 0.11, 0.09);   // 合起来的双手
      wE = Math.max(rigReg(nx, ny, 0.385, 0.375, 0.075, 0.05),
                    rigReg(nx, ny, 0.585, 0.375, 0.075, 0.05));     // 两只眼

      /* 1) 呼吸：胸腔起伏、肩膀跟着抬 */
      dy += wC * (-2.6 * b);
      dy += wH * (-0.45 * b);
      dx += wC * (nx - 0.5) * 1.5 * b;

      /* 2) 头：绕脖子转一点，再轻微点头 */
      hx = X - ox; hy = Y - oy;
      dx += wH * (-ang * hy + hb * 0.5);
      dy += wH * (ang * hx - Math.abs(ang) * 1.2);

      /* 3) 尾：从尾根往外传播的波，越靠尖摆得越大（相位延迟 = 布料感） */
      dT = Math.sqrt((nx - 0.66) * (nx - 0.66) + (ny - 0.58) * (ny - 0.58));
      wv = Math.sin(t * 3.4 - dT * 7.5);
      dx += wT * (wv * 3.6 + RS.tail * 15 * dT) * (1 + RIG.swim * 0.9);
      dy += wT * (wv * 0.9 - Math.abs(RS.tail) * 1.4);

      /* 4) 头发与裙摆：比身体慢半拍，永远追不上 */
      dx += (wR * 2.2 + wS * 1.6) * lag;
      dy += (wR * 0.4 + wS * 0.5) * Math.abs(lag);

      /* 5) 视线：眼睛那块整体平移一两个像素 */
      dx += wE * look.x * 1.5;
      dy += wE * look.y * 1.1;

      /* 5c) 分层视差：越靠前的部件跟鼠标动得越多。
         纸片感的根源不是"动得少"，是"全都在同步动"——头、身体、尾巴、头发位移一样，
         大脑立刻判定这是一张平面图。把深度拆开（头/发/手在前、身体在中、尾巴在后），
         位移量差出三倍，同样的鼠标移动就读成了"有厚度"。 */
      dep = Math.min(1.15, wH * 1.05 + wR * 0.95 + wN * 0.90 + wT * 0.50);
      dx += dep * look.x * 4.2;
      dy += dep * look.y * 2.8;

      /* 5b) 合着的双手：浮着的时候跟着一起轻轻沉浮，不是焊在胸口的 */
      dy += wN * (Math.sin(t * 0.9 + 0.6) * 1.3 - b * 0.5) * (1 + RIG.swim * 0.6);

      /* 6) 眨眼：把眼睛区域的点朝眼睛中心压扁 */
      dy += wE * (0.375 - ny) * S * (1 - bk) * 0.92;
      dx += wE * ((nx < 0.5 ? 0.385 : 0.585) - nx) * S * (1 - bk) * 0.10;

      /* 7) 重心：脚不动，越往上摆得越多 */
      dx += sway * 1.7 * (1 - ny);

      /* 8) 下蹲式挤压：脚底为支点，压扁 + 变宽 */
      dx += -sq * (nx - 0.5) * S * 0.030;
      dy += sq * (ny - 1.0) * S * 0.030;

      /* 9) 游动波：一道纵向的波从下往上走。鱼游起来就是这样的 */
      if (RIG.swim > 0.01) dy += RIG.swim * Math.sin(t * 4.0 - ny * 3.2) * 2.2;

      /* 10) 入弯倾斜：绕脚底整只压过去。停下来会自己回正 */
      if (RIG.lean > 0.05 || RIG.lean < -0.05) {
        var rx = X - 0.5 * S + dx, ry = Y - S + dy;
        v.tx = 0.5 * S + rx * lca - ry * lsa;
        v.ty = S + rx * lsa + ry * lca;
      } else {
        v.tx = X + dx; v.ty = Y + dy;
      }
    }

    // 渲染（纹理可能有两层在交叉淡入）
    var cx2 = RIG.cx, C = RIG.cols, R = RIG.rows;
    var i, j, ti, e3, a0, b0, c0, d0, P1, P2, P3, P4;
    cx2.clearRect(0, 0, S, S);
    for (ti = 0; ti < RIG.tex.length; ti++) {
      e3 = RIG.tex[ti];
      if (!e3.ok || e3.a <= 0.004) continue;
      cx2.globalAlpha = e3.a;
      for (j = 0; j < R; j++) {
        for (i = 0; i < C; i++) {
          a0 = j * (C + 1) + i; b0 = a0 + 1; c0 = a0 + C + 1; d0 = c0 + 1;
          P1 = g[a0]; P2 = g[b0]; P3 = g[c0]; P4 = g[d0];
          rigTri(cx2, e3.img, P2.sx, P2.sy, P1.sx, P1.sy, P3.sx, P3.sy,
                 P2.tx, P2.ty, P1.tx, P1.ty, P3.tx, P3.ty);
          rigTri(cx2, e3.img, P4.sx, P4.sy, P2.sx, P2.sy, P3.sx, P3.sy,
                 P4.tx, P4.ty, P2.tx, P2.ty, P3.tx, P3.ty);
        }
      }
    }
    cx2.globalAlpha = 1;

    /* 第一次真正画出东西了，才让 canvas 接管显示 */
    var ready = 0;
    for (i = 0; i < RIG.tex.length; i++) if (RIG.tex[i].ok && RIG.tex[i].a > 0.5) ready = 1;
    if (ready && !RIG.shown) {
      RIG.shown = true;
      if (artEl) artEl.style.opacity = '0';
    }

    // 淡入淡出
    for (i = 0; i < RIG.tex.length; i++) {
      e3 = RIG.tex[i];
      e3.a += (e3.dir > 0 ? 1 : -1) * dt / 0.26;
      if (e3.a > 1) e3.a = 1;
      if (e3.a < 0) e3.a = 0;
    }
    for (i = RIG.tex.length - 1; i >= 0; i--) {
      if (RIG.tex[i].dir < 0 && RIG.tex[i].a <= 0) RIG.tex.splice(i, 1);
    }
  }

  function build(host) {
    host.innerHTML =
      /* 气泡分成两块：.pet-text 只负责文字（内容多时自己滚），.pet-acts 固定在底部。
         以前两者混在一个滚动容器里，按钮会跟着文字一起滚走，且会出现原生滚动条。 */
      '<div class="pet-bubble empty" id="petSay">' +
        '<span class="pet-text" id="petText"></span>' +
      '</div>' +
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
    textEl = document.getElementById('petText');
    creditEl = document.getElementById('petCredit');
    shadowEl = document.getElementById('petShadow');
    shadowSoftEl = document.getElementById('petShadowSoft');
    animEl = document.getElementById('petAnim');
    hangEl = document.getElementById('petHang');
    sheenEl = document.getElementById('petSheen');
    artEl = document.getElementById('petArt');
    artEl.style.opacity = '0';

    // 网格绑骨：能用就上；减少动效、或 ?rig=0 时保持原来的 <img>（退役路径永远留着）
    var rigWant = true;
    try {
      if (new URLSearchParams(location.search).get('rig') === '0') rigWant = false;
    } catch (e) {}
    if (rigWant && !reduceMo) RIG.on = rigInit();

    /* 兜底：2.5 秒还没画出第一帧，就当网格绑骨在这台机器上不可用，整只退回 <img>。
       宁可少一点形变，也不能让人凭空消失——这是上一版踩过的坑。 */
    if (RIG.on) {
      setTimeout(function () {
        if (RIG.on && !RIG.shown) {
          RIG.on = false;
          artState.name = '';
          showArtWithFallback('idle-cute', 0);
        }
      }, 2500);
    }

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
    P.y = restY();
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
      if (!P.dragging && P.x < safeLeft() - 2) glideHome();     // 窗口变窄把她挤进正文区时归位
      // 不在空中就重新站回地面：窗口变大变小都不会把她留在半空或视口外
      if (P.dragging) return;
      P.y = P.air ? Math.min(P.y, restY()) : restY();
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

    /* 答题页把气泡收窄：那是唯一会挡住"认识"按钮的场合。
       她可以继续在旁边，但话不能压到判词行上。 */
    if (hostEl) hostEl.classList.toggle('testing', /^(test|drill|listen)$/.test(A.getRoute()));

    if (creditEl) {
      var fedNow = feedLine();
      if (creditEl.getAttribute('data-fed') !== fedNow) {
        creditEl.setAttribute('data-fed', fedNow);
        refreshFeed();
      }
    }

    var d = compose();
    if (d.text !== lastText) {
      if (textEl) textEl.textContent = d.text;
      lastText = d.text;
      sayEl.classList.toggle('empty', !d.text);
      markMore();
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
      box.style.display = '';          // 抓起时被隐藏过，这里必须清掉，否则按钮再也不出现
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

  /* 气泡文字超出可视高度时加 .more：底部做渐隐提示"还有内容"，
     比让原生滚动条突兀地贴在卡片右边缘好看得多。 */
  function markMore() {
    if (!sayEl || !textEl) return;
    try {
      var over = textEl.scrollHeight > textEl.clientHeight + 2;
      sayEl.classList.toggle('more', over);
    } catch (e) {}
  }
  /* 供调试：A.petInfo() 看当前形态与位置；A.petReset() 把她送回原位；?pet=none 整只关掉 */
  A.petInfo = function () {
    return {
      sprite: artState.name || '', form: document.documentElement.getAttribute('data-pet') || '',
      rig: RIG.on, tex: RIG.tex.length,
      x: Math.round(P.x), y: Math.round(P.y), air: P.air, dragging: P.dragging,
      loop: !!rafId, walking: P.walking, floor: floorY(), ground: groundLine(),
      tiltX: +V.tx.toFixed(1), tiltY: +V.ty.toFixed(1),
      swing: +HANG.sw.toFixed(1), hangX: +HANG.hx.toFixed(1), skew: +HANG.sk.toFixed(1),
      safeLeft: Math.round(safeLeft()), inSafe: inSafeZone(), busy: busy()
    };
  };
  A.petReset = function () { resetPos(); apply(); return A.petInfo(); };
  /* 排查用：绑骨到底有没有在画 */
  A.rigDiag = function () {
    return { on: RIG.on, ok: RIG.ok, shown: RIG.shown, tex: RIG.tex.length,
             loaded: RIG.tex.filter(function (t) { return t.ok; }).length,
             alpha: RIG.tex.map(function (t) { return +t.a.toFixed(2); }),
             dpr: RIG.dpr, canvas: RIG.cv ? (RIG.cv.width + 'x' + RIG.cv.height) : '' };
  };
  /* 排查用：把"坐标系"的原始值都摊开。卡住时先看这里——
       px/py 是容器位置，hx/hy 是悬空层的额外位移，tx/ty 是透视角度。
     任何一个是非有限数（NaN/Infinity），就说明有东西写坏了坐标系。 */
  A.petDebug = function () {
    return {
      P: { x: P.x, y: P.y, vy: P.vy, dragging: P.dragging, air: P.air, walking: P.walking },
      drag: { on: drag.on, moved: drag.moved, cvx: drag.cvx, cvy: drag.cvy },
      hang: { hx: HANG.hx, hy: HANG.hy, sw: HANG.sw, sk: HANG.sk },
      view: { tx: V.tx, ty: V.ty },
      bounds: { minX: minX(), maxX: maxX(), floor: floorY(), ground: groundLine() },
      css: hostEl ? {
        px: hostEl.style.getPropertyValue('--px'),
        py: hostEl.style.getPropertyValue('--py'),
        hx: hangEl ? hangEl.style.getPropertyValue('--hx') : '',
        hy: hangEl ? hangEl.style.getPropertyValue('--hy') : ''
      } : null
    };
  };

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
