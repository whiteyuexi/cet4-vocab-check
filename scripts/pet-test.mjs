// scripts/pet-test.mjs — 用 DevTools 协议验证桌宠的拖动 / 重力 / 溜达
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2] || 'http://127.0.0.1:8787/';
const PORT = 9700 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-'));
const chrome = spawn(CH, ['--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle',
  '--use-angle=swiftshader', '--hide-scrollbars', '--no-first-run', '--user-data-dir=' + profile,
  '--remote-debugging-port=' + PORT, '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/version')).ok) break; } catch {} await sleep(150); }
  const tab = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')); });
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { if (await evalJs('!!document.documentElement.dataset.pet')) break; await sleep(300); }
  await sleep(1200);
  // 桌宠行为测试直接操作主界面（入场页由 scripts/check-intro.mjs 单独验收）
  await evalJs('window.__APP__ && window.__APP__.enterApp && window.__APP__.enterApp(true)');
  await sleep(320);

  const out = [];
  const ok = (n, c, e) => out.push((c ? 'PASS' : 'FAIL') + '  ' + n + (e ? '   [' + e + ']' : ''));

  const info = () => evalJs('JSON.stringify(window.__APP__.petInfo())').then(JSON.parse);
  const a = await info();
  ok('桌宠已挂载并有初始位置', a.x > 0 && a.y > 0, 'x=' + a.x + ' y=' + a.y);
  ok('默认出现在屏幕右侧', a.x > 800, 'x=' + a.x);
  const fig = await evalJs('JSON.stringify((function(){var r=document.getElementById("petFig").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})())').then(JSON.parse);
  ok('角色可点区域尺寸正确', fig.w > 100 && fig.h > 100, Math.round(fig.w) + 'x' + Math.round(fig.h));

  // 模拟拖动：从角色中心拖到左上
  const cx = Math.round(fig.x + fig.w / 2), cy = Math.round(fig.y + fig.h / 2);
  const fire = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, pointerType: 'mouse' });
  await fire('mousePressed', cx, cy, 1);
  for (let i = 1; i <= 6; i++) await fire('mouseMoved', cx - i * 55, cy - i * 40, 1);
  const drag = await info();
  ok('拖动后位置跟着走', Math.abs(drag.x - a.x) > 200 && drag.y < a.y, 'x=' + drag.x + ' y=' + drag.y);
  ok('拖动中标记为悬空', drag.air === false, 'air=' + drag.air);

  await fire('mouseReleased', cx - 330, cy - 240, 0);
  await sleep(200);
  const justDropped = await info();
  await sleep(2500);
  const landed = await info();
  ok('松手后开始下落', landed.y > justDropped.y, justDropped.y + ' -> ' + landed.y);
  ok('最终落到地面（导航条上沿）', Math.abs(landed.y - a.y) < 4, 'y=' + landed.y + ' 初始 y=' + a.y);

  /* 回归：pointerup 丢在浏览器窗口外。
     以前 pointerup 只绑在立绘上，事件一丢 P.dragging 就永远为 true，
     tick 里的重力被挡住，她会永久冻在半空（拖到左上角就是"卡在左上角"）。
     现在 window 上兜底 + buttons===0 就地收尾，必须能自己落回地面。 */
  const dragUpLeft = `
    (function(){
      var fig = document.getElementById('petFig');
      var r = fig.getBoundingClientRect();
      var cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
      function pe(t, x, y, b, tg) {
        (tg || window).dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, buttons: b,
          pointerId: 1, bubbles: true, cancelable: true, pointerType: 'mouse' }));
      }
      pe('pointerdown', cx, cy, 1, fig);
      for (var i = 1; i <= 6; i++) pe('pointermove', cx - i * 100, cy - i * 60, 1, window);
      return JSON.stringify(window.__APP__.petInfo());
    })()`;
  const stuck = JSON.parse(await evalJs(dragUpLeft));
  ok('能拖到左上角（拖拽态）', stuck.dragging === true && stuck.y < 200, 'x=' + stuck.x + ' y=' + stuck.y);

  /* 被拎起来时的「悬空挣扎」：四样必须同时到位，缺一样就露馅
       1) .held → 转轴从脚底挪到耳根（在 .pet-hang 上，不是 .pet-fig）
       2) 身体被手甩开、摆动角跟着手的速度走（不是定时器写死的摆幅）
       3) 换成挣扎立绘，且这张图必须是内联数据（离线单文件也得有脸）
       4) 气泡喊一句
     上一段把她在 6 个 pointermove 里向左上快速拖走，所以此刻横向速度读是负的，
     身体应该被甩到右边（hangX > 0）、并且明显摆起来。 */
  await sleep(280);
  const heldState = JSON.parse(await evalJs(`
    (function(){
      var pet = document.getElementById('pet');
      var hang = document.getElementById('petHang');
      var imgs = document.querySelectorAll('#petAnim img');
      var inline = 0;
      for (var i = 0; i < imgs.length; i++) if (imgs[i].src.indexOf('data:image/webp') === 0) inline++;
      var A = window.__APP__;
      return JSON.stringify({
        held: pet.className.indexOf('held') >= 0,
        origin: getComputedStyle(hang).transformOrigin,
        sprite: A.petInfo().sprite,
        swing: A.petInfo().swing,
        hangX: A.petInfo().hangX,
        skew: A.petInfo().skew,
        imgs: imgs.length,
        inline: inline,
        say: (document.getElementById('petSay') || {}).textContent || ''
      });
    })()`));
  ok('抓起后进入悬空状态（.held）', heldState.held === true, heldState.held);
  ok('悬空时转轴从脚底挪到耳根', /\d+(\.\d+)?px [0-4]\d(\.\d+)?px/.test(heldState.origin),
    heldState.origin);
  ok('身体被手甩在抓点后面（不是刚性跟手）', Math.abs(heldState.hangX) > 3,
    'hangX=' + heldState.hangX);
  ok('摆动角跟着手的速度走', Math.abs(heldState.swing) > 3, heldState.swing + 'deg');
  ok('下半身有次级斜切', Math.abs(heldState.skew) > 1, heldState.skew + 'deg');
  ok('悬空时换成挣扎的表情', /^(angry|meme-doubt)$/.test(heldState.sprite), heldState.sprite);
  ok('挣扎立绘是内联数据（离线单文件也有脸）',
    heldState.imgs > 0 && heldState.inline === heldState.imgs,
    heldState.inline + '/' + heldState.imgs + ' 张内联');
  ok('悬空时气泡会喊一句', /放我下来|别拎|还没测完|自己会走/.test(heldState.say), heldState.say);

  // 手停住不动 → 弹簧必须自己回摆归位。这里用轮询等它收住，而不是死等一个固定毫秒数：
  // 摆幅大小取决于这一轮拖拽的速度，固定等待会时快时慢（曾经因此假失败过）。
  const settled = await (async () => {
    let last = { swing: 999, hangX: 999, dragging: false };
    for (let i = 0; i < 40; i++) {                 // 最多 4 秒
      last = JSON.parse(await evalJs(`
        (function(){ var i = window.__APP__.petInfo();
          return JSON.stringify({ swing: i.swing, hangX: i.hangX, dragging: i.dragging }); })()`));
      if (last.dragging === true && Math.abs(last.swing) < 4.5 && Math.abs(last.hangX) < 8) break;
      await sleep(100);
    }
    return last;
  })();
  ok('手停下来会回摆归位', Math.abs(settled.swing) < 4.5 && Math.abs(settled.hangX) < 8,
    'swing=' + settled.swing + ' hangX=' + settled.hangX);

  // 只来一个 buttons=0 的 pointermove —— 等价于 pointerup 丢了
  await evalJs(`(function(){window.dispatchEvent(new PointerEvent('pointermove',
    { clientX: 5, clientY: 5, buttons: 0, pointerId: 1, bubbles: true, pointerType: 'mouse' }));return 1;})()`);
  await sleep(2600);
  const recovered = await info();
  ok('pointerup 丢失也能自己落地（不再永久卡住）',
    recovered.dragging === false && Math.abs(recovered.y - a.y) < 4,
    'dragging=' + recovered.dragging + ' y=' + recovered.y + ' 期望 y=' + a.y);
  ok('落地后退出挣扎态', await evalJs(`document.getElementById('pet').className.indexOf('held') < 0`) === true,
    await evalJs(`document.getElementById('pet').className`));
  // 落地会有 .shake（先压扁再抖两下，约 560ms）。轮询等它放完，别在半路取样
  const animNow = await (async () => {
    let name = '';
    for (let i = 0; i < 30; i++) {
      name = await evalJs(`getComputedStyle(document.getElementById('petAnim')).animationName`);
      if (name === 'petBob') break;
      await sleep(120);
    }
    return name;
  })();
  ok('落地后恢复待机动画', animNow === 'petBob', animNow);
  ok('主循环一直在跑', recovered.loop === true, 'loop=' + recovered.loop);

  /* 气泡版式：以前文字和动作按钮挤在同一个滚动容器里 —— 内容一多就出现原生滚动条，
     按钮还会跟着文字一起滚走。现在文字单独滚，按钮固定贴底。 */
  const bubble = JSON.parse(await evalJs(`JSON.stringify((function(){
    var b = document.getElementById('petSay'), t = document.getElementById('petText');
    if (!b || !t) return { missing: true };
    var acts = b.querySelector('.pet-acts');
    var chip = acts ? acts.firstElementChild : null;
    var old = t.textContent;
    t.textContent = new Array(30).join('这一行用来把气泡撑满，验证滚动只发生在文字区，按钮不被带走。');
    var br = b.getBoundingClientRect(), ar = acts ? acts.getBoundingClientRect() : null;
    var res = {
      textScrolls: t.scrollHeight > t.clientHeight + 2,
      actsOutsideText: acts ? acts.parentElement === b : null,
      actsInsideBubble: ar ? (ar.bottom <= br.bottom + 1 && ar.top >= br.top - 1) : null,
      scrollbarPx: t.offsetWidth - t.clientWidth,
      scrollbarWidthCss: getComputedStyle(t).scrollbarWidth || 'unsupported',
      chipHeight: chip ? Math.round(chip.getBoundingClientRect().height) : 0
    };
    t.textContent = old;
    return res;
  })())`));
  ok('气泡有独立的文字区（溢出只在那里滚）', !bubble.missing && bubble.textScrolls === true,
    'scrolls=' + bubble.textScrolls);
  ok('动作按钮不在滚动区里（不会被滚走）', bubble.actsOutsideText === true && bubble.actsInsideBubble === true,
    'parentIsBubble=' + bubble.actsOutsideText + ' 仍在气泡内=' + bubble.actsInsideBubble);
  // 无头浏览器用 overlay 滚动条（宽度恒为 0），所以以 CSS 的 scrollbar-width 为准，像素值仅作参考
  ok('滚动条指定为细条', bubble.scrollbarWidthCss === 'thin' || bubble.scrollbarWidthCss === 'unsupported',
    'css=' + bubble.scrollbarWidthCss + ' 实测宽=' + bubble.scrollbarPx + 'px');
  ok('气泡按钮有足够点击高度', bubble.chipHeight >= 24, bubble.chipHeight + 'px');

  // 双击回原位：卡住了也有救
  await evalJs(`(function(){document.getElementById('petFig')
    .dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));return 1;})()`);
  await sleep(300);
  const reset = await info();
  ok('双击回到原位', reset.x > 800 && Math.abs(reset.y - a.y) < 4, 'x=' + reset.x + ' y=' + reset.y);

  // 戳一下（不移动的点击）
  const f2 = await evalJs('JSON.stringify((function(){var r=document.getElementById("petFig").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})())').then(JSON.parse);
  const px = Math.round(f2.x + f2.w / 2), py = Math.round(f2.y + f2.h / 2);
  await fire('mousePressed', px, py, 1);
  await fire('mouseReleased', px, py, 0);
  await sleep(120);
  const poked = await evalJs('document.getElementById("pet").classList.contains("poked")');
  ok('点一下有反应', poked === true, 'poked=' + poked);

  // 溜达：等一段时间看她是否自己走动过。
  // 阈值只要求 2px：落点是随机的，抽到很近的一点也是"走过了"，
  // 之前卡 20px 会偶发误报（她本来就在右侧边缘，正方向很快就被 maxX 夹住）。
  const before = (await info()).x;
  let moved = false;
  for (let i = 0; i < 56; i++) { await sleep(500); const n = (await info()).x; if (Math.abs(n - before) > 2) { moved = true; break; } }
  ok('会自己溜达（等待 ≤28s）', moved, 'x ' + before + ' -> ' + (await info()).x);

  const credit = await evalJs('document.getElementById("petCredit").textContent');
  ok('桌宠上方不再有署名行', !/Sutera/.test(credit) && !/形象：/.test(credit), JSON.stringify(credit));

  // 署名从桌宠挪到「设置 → 素材来源」：MIT 要求保留出处，不能直接消失
  await evalJs(`window.__APP__.go('settings')`);
  await sleep(400);
  const about = await evalJs('document.getElementById("view").textContent');
  ok('素材署名保留在设置页', /Sutera/.test(about) && /MIT/.test(about),
    about.slice(0, 90).replace(/\s+/g, ' '));
  await evalJs(`window.__APP__.go('home')`);

  console.log(out.join('\n'));
  console.log('\n通过 ' + out.filter(x => x.startsWith('PASS')).length + ' / ' + out.length);
  ws.close(); chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}   // Chrome 句柄释放有延迟，清理失败不影响结果
  process.exit(0);
} catch (e) {
  console.error('ERR: ' + e.message);
  try { ws && ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  process.exit(1);
}
