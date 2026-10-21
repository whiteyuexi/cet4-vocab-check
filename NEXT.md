# 继续开发须知（新会话请先读这一份）

> 这份文件是为"换一个 AI 会话接着做"准备的。读完它 + `LICENSING.md`，就能接上进度。

---

## 一、项目是什么

**四六级词汇量检测**，参加「筑视界·码绘交互——Web 前端开发创意技能大赛」。
截止 **2026-10-25 23:59**。交付物：公开 GitHub 仓库 + 5–8 分钟演示视频 + ≤30 页技术 PDF。

- 仓库：`https://github.com/whiteyuexi/cet4-vocab-check`
- 本地：`C:\Users\27295\cet4-vocab-check`（**注意：不是 `E:\deepseekharness_project1`，那个目录 ACL 不可写**）
- 成品：`index.html`（单文件约 1.78 MB，双击即用）
- 桌面副本：`C:\Users\27295\Desktop\四六级词汇量检测.html`
- 报告：`C:\Users\27295\Desktop\四六级项目报告\`（01–06 + 技术文档 + 索引）

## 二、技术状态

已完成且稳定，**不要动**：
- 词频分层抽样 + 目标精度自适应停测 + 区间估计三层修正（Agresti-Coull / FPC / 蒙对校正）
- AI 诊断 Agent（工具调用，模型不做算术）
- RAG 例句检索（Tatoeba 语料）
- token 计量（「已投喂 N token」，对应角色"白米饭首席品鉴官"设定）
- 桌宠：可拖动、重力落地、自动溜达、视线跟踪、透视倾斜、动态投影（2026-10-17 换成 2.5D 全身立绘，见 §三）
- 测试：冒烟 164/164、浏览器 44/44、桌宠行为 26/26、离线交付 7/7

## 三、已经做完的事（2026-10-17）

**桌宠换成 2.5D 全身立绘，已接进主程序。**

为什么要换：Live2D 模型（B）**做不了全身**——把取景拉到最大，渲染出来的全部内容就是
头 + 躯干 + 手臂 + 尾巴 + 一张书桌，膝盖以下压根不存在。所以"拉远露出桌子、
拉近像贴纸"不是取景参数没调好，是模型里没这个内容。证据图：`shots/petB-fullbody-desk.png`、
`shots/petB-fullbody-nodesk.png`（用 `scripts/lab.html?hide=desk` 连桌子都能灭掉，腰以下照样是空的）。

现在用的是 **Sutera-Diffusus 的 MIT 全身立绘**（`assets/whale-art/`，93 张 512×512 透明底）。
同一套角色设定（蓝长发 / 深蓝女仆装 / 白围裙鲸鱼刺绣 / 鲸鱼尾），站姿、脚和鞋都在，
2.5D 的接地、投影、跳跃才成立。

2.5D 一共三层，缺一层就像贴纸（实现在 `src/app.part5.js` + `src/app.css`）：

1. **透视倾斜** —— 鼠标位置 → `rotateX/rotateY`，`perspective:620px`，转轴压在脚底（`50% 100%`），
   倾斜时脚不动，只有上半身摆
2. **接地投影** —— `.pet-shadow` 两层：贴脚底的小而深 + 外围的大而淡，
   跟着倾斜反向横移（`--shx`）、跟着离地高度缩小变淡（`--shs`）
3. **受光膜** —— `.pet-sheen` 一条跟着倾斜转的斜向反光（`--sang`），暗示光从左上来

另加：呼吸浮动（`.pet-anim` 单独一层，别和透视抢 transform）、落地挤压、走路碎步、
状态交叉淡入（先探针加载，成功才换，缺图沿 `FALLBACK_ART` 回退）、`?pet=none` 关掉桌宠。

**说话气泡**（`.pet-bubble`）也重做了：圆角卡片用 `::before`、尾巴用 `::after`，
两者在同一个 `drop-shadow` 里合成一个剪影，所以阴影和细描边都顺着尾巴走，
不再是方块 + 一个旋转的小正方形。质感来自四层：底渐变、左下角品牌色微晕、
顶部 1px 高光、细颗粒（`--pet-grain` 是一段 feTurbulence 的 data URI）。
尾巴顶边故意用和卡片底部**完全相同的颜色**（`#E7EFFD`），接缝看不出来——
改颜色时这两处必须一起改。空状态从尾巴根部 `scale(.94)` 弹出来。

情绪 → 立绘的映射在 `MOOD_ART`（idle→idle-cute / happy→celebrate / think→curious / …）。
**本地目前只有 42 张**（`api.github.com` 限流拉不动，见 §七），用到的都在。

单文件离线版只内联「待机」这一张（`window.PET_ART`），其余状态联网时才按需加载；
一张都拿不到时桌宠退化成纯气泡助手，不会画错形象。

**立绘署名不在桌宠上。** 那行「形象：DS鲸鱼娘 · Sutera-Diffusus · MIT」被用户要求去掉了，
现在只保留 token 计量（`已投喂 N token`，没有投喂记录时整块 `:empty` 隐藏）。
MIT 要求保留出处，所以署名挪到了「**设置 → 素材来源**」（`src/app.part3.js` 的 `viewSettings`）——
**别再往桌宠上加回去**，也别以为删掉那行就等于不用署名。

验证：冒烟 142/142、浏览器 39/39、桌宠行为 15/15。截图 `shots/_app_light.png`、`shots/_app_dark.png`。

### 词汇等级评估报告（2026-10-17 新做）

用户提的：「测完整个词库后评估词汇等级，给一份专业提升报告」。做成了两个入口共用一份数据：

- **左侧悬浮信封**（`#mail`，模板里 + `A.renderMail()`）：蜡封未解锁时显示覆盖率、测完后显示等级字母；
  点开进「报告」页。窄于 1160px 不挂出来（`wrap` 只有 1000px，再窄就压正文了）。
- **导航第 6 项「报告」**（`route === 'report'` → `A.viewReport()`）。

数据层全在 `src/app.part1.js`，视图在 `src/app.part6.js`（新文件，已加进 `build.js` 的 parts）：

| 东西 | 说明 |
|---|---|
| `A.RANKS` | S/A/B+/B/C/D 六级，按**掌握率**分级（不是绝对词数），所以四级和六级同一等级对应不同词数 |
| `A.RANK_CAPS` | 地基约束：最高频 1k 段低于 85%/75%/60% → 等级封顶 A/B+/C |
| `A.censusBands()` | 全库逐词数出来，**不走抽样估计**——这是"测完才给等级"的底气 |
| `A.levelReport()` | 一次算完：等级、到下一级的差额、逐频段缺口、提升优先级、模糊占比 |
| `A.levelReportText()` | 纯文本版，供「复制报告文本」用 |

两个设计决定，改之前想清楚：

1. **只在覆盖 ≥95% 时给等级**，否则显示"还差 N 词"。抽样能给词汇量和误差，
   但分不出频段上的洞，拿它评级是虚的。
2. **提升优先级 = 缺口词数 × 词频权重**，不是缺口绝对值。
   一开始按绝对值排，结果把最冷门的 10k-20k 排到了第一——
   那些词一年遇不上几次，补它们收益远不如补最高频段。权重在 `levelReport()` 里，一归一化到最高频段 = 1。

**踩过的坑**：新文件里我把纯文本函数命名成 `A.reportText`，和 part3 里「本次成绩」的
`A.reportText` 撞名，直接把它覆盖了 —— 冒烟测试三条断言当场挂掉。已改名 `A.levelReportText`。
**`A` 是全局共享命名空间，新函数加之前先 grep 一下有没有重名。**

截图用 `scripts/_seed-full.html` 造数据：它读服务端静态暴露的 `/words.json`（含 `b` 词库掩码和 `f` 频段），
按"高频掌握好、低频差"造一份整库作答写进 localStorage 再跳回首页，专供拍「已解锁」的报告页。

### 多轮检测（2026-10-17 新做）

用户提的：「测完整个词库后能点重新测试，开第二轮；之前的作答清空，但保留每一轮的报告和分析」。

- **入口**：首页词库切换那一行的右端，本轮测完（覆盖 ≥95%）才出现「↻ 重新测试 · 开始第 N 轮」。
  没测完不显示，避免误触把作答清掉（真想中途重来用设置里的「清空作答记录」）。
- **归档什么**：每轮存两样东西 —— 聚合报告快照（给历轮清单/趋势）+ **逐词状态位图**。
  位图是 2 bit/词，7175 词约 1.8 KB（base64 后 2392 字符），12 轮也就十几 KB，localStorage 完全放得下。
- **清空什么**：只清当前词库的作答 + `session` / `lastResult` / `samples` / `history`，
  已归档的报告不动。轮次号写进 `S.round`，历史上限 12 轮（超了丢最旧的）。

多轮真正的价值不是"再测一次"，是**逐词对比**（`A.roundDiff()`）：

| 指标 | 含义 |
|---|---|
| 保持率 | 上轮认识的词这轮还记得的比例 |
| 新学会 | 上轮不会 / 模糊 → 这轮认识 |
| 背了又忘 | 上轮认识 → 这轮模糊或不认识 ← **复习第一优先级**，单轮永远算不出来 |

「背了又忘」给出一键复测按钮，直接开一个只含这些词的会话。

两个坑已经踩过并处理：

1. **词表会变**：位图按下标存，词表一改就对不上了。所以每轮连**指纹**一起存（`WORDS.length:hash`），
   指纹不匹配时只做聚合对比，不硬算逐词差异（`roundDiff().stale === true`）。
2. **换了词库不能直接比**：四级 4540 和六级 5716 分母不同，词汇量、掌握率不可比。
   检测到两轮词库不同时，那一块改成提示文案，只保留逐词结论（保持率/新学会/遗忘）。

**踩过的坑**：`A` 是全局命名空间，加字段前一定 grep 一下。这轮我差点又撞名
（上次是把 `A.reportText` 覆盖了）。另外往 part1 插代码块时把下面一段块注释的开头吃掉了，
`node --check` 才抓出来 —— **改完 js 先跑 `node --check`，再 build**。

### 视效层与暗色主题缺陷（2026-10-17 新做）

用户给了六个设计资源站（Anime.js / motion.sites / showreeldesign / reactbits / ui.aceternity / uiverse）。
处理原则写在这里，**下次别再重新纠结**：

- **reactbits / ui.aceternity 是 React + Tailwind 组件，源码搬不进来**（我们是原生单文件），只按视觉原理重写；
- **不引入 Anime.js**：会破坏「0 运行时外部依赖」这条明写在技术文档里的承诺，CSS 关键帧等价；
- uiverse 是纯 CSS 可借鉴，但颗粒度太细、和现有设计系统不匹配，只取"光扫过"这类做法；
- motion.sites / showreeldesign 是灵感站，没有源码。
- **最终一行源码都没复制**，所以不涉及这些库的授权条款。这个结论别丢。

落地六项（`src/app.part7.js` + `src/app.css` 的「视效层」段）：极光缓动 / 纸颗粒 / 卡片聚光 /
标题流光 / 导航滑块 / 按钮流光磁吸。纪律：只动 transform·opacity·CSS 变量；
触摸设备与 `prefers-reduced-motion` 降级；全部入口包 try。

#### 顺带修掉一个用户看得见的暗色缺陷

**运行中切到暗色后，卡片和几十个分组格子仍是浅底浅字，几乎不可读。**

根因：全局重置 `button{… transition: …, background .18s, … }`。多数组件底色是
`background: var(--glass)` 这种**变量驱动的值**，而主题切换只改变量。一旦 `background`
在过渡列表里，Chrome 会保留过渡结束时的旧计算值，变量更新无法重新触发它 → 底色锁死。
修法：把 `background` 从该过渡列表移除。

**为什么之前没发现**：历史截图都是"以暗色启动"（先写 localStorage 再刷新），首次渲染就是暗的。
**主题类功能必须专门测"运行中切换"。** 已加 3 条浏览器断言锁死。

#### 流程问题：`npm run test:browser` 其实不跑测试

它只**生成** `shots/btest.html`，不执行浏览器 —— 之前每次"跑过"浏览器测试都是假的。
现在要真正验证，得再用 DevTools 协议打开那个页面读断言输出：

```
node btest.js
node scripts/cdp-eval.mjs "file:///C:/Users/27295/cet4-vocab-check/shots/btest.html" \
  "(function(){return new Promise(function(r){setTimeout(function(){var p=document.querySelector('pre');r(p?p.textContent:'none');},900);});})()" \
  "document.readyState==='complete'"
```

阶段报告见桌面 `10-2026-10-17-视效层与暗色主题缺陷.html`。

### 词汇地图（2026-10-18 新做）

用户要求「在视觉 / 功能 / 创新上做文章」，选了词汇地图。它**替代**了总览页原来那个
「按首字母的柱状图」——地图是它的超集（字母 × 词频段），而且可交互。

- **编码**：纵轴词频段（越靠上越常用，顺序由 `A.MAP_BANDS` 决定）× 横轴首字母（26 列）。
  颜色 = 掌握率（绿 ≥80 / 黄 50–80 / 红 <50），**浓淡 = 这一格被测过多少**（CSS 变量 `--fa`）。
  所以「一片虚线格」= 整块没测过，「一片深红」= 都测过且都不会。
- **可交互**：点任意格子 → `map-review` → 直接复测该格的缺口词（未测 + 模糊 + 不认识）。
  地图不只是图，是入口。
- 数据层：`A.vocabMap()` / `A.mapCellWords(band, letter)` / `A.untestedWords()`；
  视图：`A.vocabMapHTML()`（part3）。

**一个刻意的区分，改代码前先想清楚**：
`gap`（测过还不会，真正的洞，值得优先补）与 `untested`（压根没测过，不构成结论）**必须分开**。
第一版把它们混成一个 `deficit`，结果「整块没测过」的格子会霸占「缺口最大的三块」——
等于把「不知道」说成「有洞」，是误导。现在 hot 列表只从 `tested > 0 && gap > 0` 的格子里选。

**踩过的坑**：
1. 格子对象上忘了带 `name`（词频段名只挂在行上），结论行会显示成「S（缺 70 词）、S（缺 41 词）」，
   两个 S 分不清是哪一段。现在每个 cell 自带 `name`。
2. `A.untestedWords` 一度漏定义，「复测全部没测过的词」按钮会**静默失效**
   （调用处有存在性守卫，所以不报错、只是点了没反应）。写新接口时记得把调用处的守卫一起去掉，
   否则 bug 会藏起来。

### 使用者档案（2026-10-21 新做）

用户反馈：「发给别人，看到的都是我自己测试的结果」。
**先澄清事实**：作答数据存在浏览器 localStorage 里，**不跟着 index.html 走**——
对方在自己电脑上打开本来就是空的。真正会互相污染的只有一种情况：
**同一台电脑、同一个浏览器换人用**（实验室机器、宿舍共用）。所以只解决「同机多人」。

- 存储：每个档案一份独立数据；**第一个档案沿用老键 cet4vocab_v1**，
  因此老数据、老导出格式、既有测试全部不受影响（这条兼容设计是刻意的，别改）。
- 切换：swapStateInto() 就地换装**同一个 A.S 对象**，其余代码一行不用改。
- 入口：顶栏使用者芯片 + 设置页「切换 / 新建使用者」；
  首次打开是一条**可跳过**的称呼条（S.welcomed），绝不打断第一次检测。
- 边界：至少保留一个档案；删除要二次确认；名字会用在首页与桌宠话术里。

接口在 part1：A.profileList / activeProfile / myName / switchProfile / createProfile / renameProfile / removeProfile / profileSummaries；
面板视图在 part3 的 A.profilesModal()。

### 踩过的坑：拖到窗口外松手 → 她永久卡住（2026-10-17 修）

现象：把她拖到左上角、在浏览器窗口外松手，她就永远停在半空不动了。

原因不是渲染，是拖拽状态没收尾：
- `pointerup` 只绑在立绘元素上。在窗口外松手时事件根本到不了页面，
  `P.dragging` 一直是 `true`，而 `tick()` 里的重力写的是 `if (!P.dragging && P.air)`，
  于是重力被永久挡住，她停在最后那个坐标上。左上角的 `y=4` 正是 `onMove` 的钳位下限。
- `onUp()` 开头还有一句 `if (!drag.on) return`，两个标志一旦不同步就再也解不开。

修法（`src/app.part5.js`）：
1. 指针事件改挂 `window`（外加 `blur`），`pointerup` 丢了也有兜底
2. `onMove` 里发现 `e.buttons === 0` 就当地收尾 —— 丢事件后动一下鼠标即可自愈
3. `endDrag()` 幂等、只认 `P.dragging`，不再因为 `drag.on` 提前 return
4. `tick()` 里加了最后一道保险：按住不动超过 8s 当作松手（正常操作碰不到）
5. `groundLine()` 上下都钳位，导航变高/缩放/窗口极矮都不会把她顶出视口
6. 双击桌宠（或 `A.petReset()`）回到右下角原位，卡住了也有救
7. `renderPet` 会补 `startLoop()`；切标签页回来会重排溜达计时器，不会"再也不动"
8. `A.petInfo()` 多了 `dragging / loop / walking / floor / ground`，下次复现直接看这几项

回归用例已进 `scripts/pet-test.mjs`（"pointerup 丢失也能自己落地"）。

### 抓起后悬空挣扎（2026-10-21 新做，同日返工一次）

用户原话：「就比如抓起来的时候她会悬空假装挣扎这种。」做完第一版后用户回了一句
**「这没啥变化啊，脸部也没，就是那个 2D 人很僵硬的左右晃动而已」** —— 第一版两个根因都在这句话里：

#### 坑一：表情从来没生效过（单文件交付）

构建时**只内联了待机帧**，注释理由是"内联多张会把 index.html 顶到 3 MB"。
但单文件交付时产物旁边没有 `assets/`，`showArt('angry')` 探针加载失败 → 沿回退链退回 `idle-cute`。
于是换表情的代码一路执行、图永远同一张。**功能测试全绿也测不出来**，因为它只测"代码有没有跑"。

修法：先压缩再内联。项目零依赖（没有 node_modules），用 Chrome 的
`canvas.toDataURL('image/webp', q)` 重编码（`scripts/make-pet-art-inline.mjs 384 0.62`）：
10 张 384×384、保留 alpha，1.19 MB → **349 KB**，全部写进 `window.PET_ART`，产物净增约 100 KB。
`build.js` 读 `assets/whale-art/_inline.json`，读不到才退回"只内联待机帧"（并警告）。

**别再为了省体积把情绪图移出内联** —— 那等于让离线版永远只有一张脸。

#### 坑二：摆动是定时器动画，跟手无关

第一版用 `.pet.held` + `@keyframes petDangle`（1.15 s、±6°）。摆幅写死、节奏写死，
不管你手怎么拖都一样 → 看起来就是"一张图在转"。

现在是状态量 + 每帧积分（`src/app.part5.js` 的 `stepHang` + CSS 的 `.pet-hang` 层）：

- `HANG.hx/hxv`：身体相对抓手位置的横向落后量，输入是**指针速度** `drag.cvx`
- `HANG.sw/swv`：摆动角，由 `hx` 驱动，二阶系统 → 有起手甩出、急停回弹、松手余摆
- `HANG.sk/skx/sky`：次级运动（下半身反相斜切 + 沿运动方向拉伸挤压）
- 静止时叠一层 `sin(t/380)*1.8px` 的沉浮，手停住也不是雕像

**调参坑**：线性比例（`hx = -v*0.055`）在 750 px/s 下只有 5.4°，肉眼几乎看不出；
把系数放大，真人随便一拖就顶到上限，"每一下都摆到最大"等于又写死了摆幅。
最后用平方根响应 `30*√(v/1500)`，300 px/s 能到 14°、1500 px/s 才到 30° 的顶。

**两个必须记住的细节**：
1. 手停住就没有 `pointermove` 了，速度读会永远停在最后一个值 → 她一直歪着。
   `stepHang` 里 60 ms 没新事件就把速度读按帧衰减回零。
2. 影子必须留在地面：`applyDepth` 按 `lift()` 反向补偿 `--shy`。
   少了这条，人被拎到半空、脚下还贴着一团影子，一眼就是贴纸。

边界：`enterHeld/exitHeld` 幂等；`endDrag()` 第一句就调 `exitHeld()`，所以"8s 看门狗"和
"`buttons===0` 自愈"两条兜底路径也一定退出挣扎态；`prefers-reduced-motion` 下停掉摆动与拉伸，
只保留静止倾斜（有意取舍，别"修"）。

#### 测试：新增专门盯"离线交付"的脚本

`scripts/check-offline.mjs` 直接打开**桌面上那份孤立 HTML**（旁边无 assets）做 7 项断言：
立绘来自 `data:` URI、抓起后换表情、弹簧在跑、身体落后于抓点、影子留在地面、松手落回地面、摆角归零。
`scripts/pet-test.mjs` 同时从 21 项加到 **26 项**，全是"行为对不对"而不是"有没有跑"。
### 交付形态：把文件发给别人能不能用（2026-10-21 复核）

用户直接问了这个。答案是**能**，但「能」必须靠脚本证明，不能靠感觉。
`scripts/check-recipient.mjs` 构造对方的真实条件再断言 18 项：
只拷 index.html 进空目录（无 assets/data/server）、全新 --user-data-dir、
`Network.setBlockedURLs(['http://*','https://*'])`、桌面 1440×900 与手机 390×844 各跑一遍。

**查出并修掉的产品问题**：AI 面板断网时回的是
「无法连接后端服务。请先在项目目录执行 node server/index.mjs」——给开发者看的话，
发给评委就是点一下撞墙。现在改成本地规则诊断 `A.localDiagnosis(question)`：
开场摆依据块（覆盖率、两口径掌握率、估计值 ± 区间、最弱两段）、按问题类型给侧重
（计划 / 结果 / 方法 / 泛问）、结尾如实标注「离线规则诊断」、支持继续追问；
对话框打开时先 900ms 探一次 `/api/health`，模式标记直接显示「离线 · 本地规则」而不是一直「连接中…」。

**别把联网主路径改坏**：`scripts/check-online-ai.mjs` 专门守这条路（要后端在跑），
断言模式标记为在线、回答是模型生成、带工具调用与依据面板。
另注意服务端自己的降级会推一个 `evt.mode === 'mock'`，那时标签显示「本地规则诊断」。

已知限制（README 里如实写了）：进度只在对方浏览器 localStorage、不跨设备同步、
微信/QQ 内置浏览器可能不保留存储、发音依赖系统语音引擎。
## 四、绝对不要再试的路（都试过并失败了）

1. **手绘 SVG 形象** —— 画了四版，用户评价"怎么长这样"，放弃
2. **three.js 手搓 3D** —— 能做出"可爱潮玩"，做不出精细动漫画风，用户否决，代码已删
3. **收紧取景裁掉桌面道具** —— 越裁越像贴纸，用户说"还不如最初版本"，已回滚
4. **直接改 `baleite/bi/pi/chehui` 这些"道具参数"** —— 名字猜错了。
   `model/c_0120.cdi3.json` 里确实有这些 Id，但它们**不在 moc3 的运行时参数表里**
   （`getParameterCount()=247`，`getParameterIndex('baleite')=247` = 查不到，
   `getParameterValueById` 返回 null），所以改不动，只能靠取景。

   **更正（2026-10-17）**：道具其实有另一条开关——**部件（Part）不透明度**。
   moc3 的 92 个部件可以逐个灭掉，桌面上那套键鼠桌椅就是这些：

   ```
   1 桌子上物体   33 鼠标 副本   34 鼠标垫组1  35 鼠标垫组2  36 键盘桌
   37 桌布        38 按键        46 手柄按键   47 侧键L      48 侧键R
   59 桌布组1     60 桌布组2     61 按键组1    62 按键组2
   85 ABXY        86 上下左右    87 M
   ```

   做法（`scripts/lab.html?hide=desk` 已验证）：包一层 `coreModel.update`，
   在 `origUpdate()` 之后写 `coreModel._partOpacities[i] = 0`，渲染器就跳过这些部件。
   `setPartOpacityByIndex(i, v)` 也可用。代价：灭掉桌子后 B 腰以下是空的，见 §三。

## 五、关键文件

```
index.html              单文件成品
src/app.part1.js        词库/分层抽样/首页/分组/动效层
src/app.part2.js        答题引擎
src/app.part3.js        报告/总览/设置/事件
src/app.part4.js        AI 面板 + token 计量
src/app.part5.js        桌宠（2.5D 全身立绘 + 位置/拖动/重力/透视/投影/话术）
src/app.part6.js        词汇等级评估报告（等级模型视图 + 左侧信封入口）
src/app.css             设计令牌与全部样式
build.js                打包（不写时间戳，保证可复现）
assets/whale-girl/      Live2D 模型（CC BY-NC-SA）—— 已不再被页面加载，见 LICENSING.md
assets/pet-frames/      模型渲染的静态帧 —— 构建已不再引用
assets/whale-art/       93 张 MIT 立绘（gitignore，用 npm run art:fetch 拉；本地现有 42 张）
scripts/pet25d.html     2.5D 原型（独立页面，调参用：?art= 尺寸 / ?look= 视线 / ?state= 状态 / ?dark=1）
scripts/lab.html        Live2D 模型检验台：按内容包围盒自动取景，可灭部件（?hide=desk）
scripts/cdp-shot.mjs    DevTools 协议截图，可等页面条件、可只截一块区域（末位参数 "x,y,w,h[,scale]"）
scripts/cdp-eval.mjs    在真实 Chrome 里求值一段 JS 打回来（查 DOM / 计算样式 / 内部状态）
scripts/html2pdf.mjs    技术文档 HTML → PDF，并打印页数（超 30 页时以退出码 2 报警）
scripts/_theme-dark.html 截图辅助：写好 localStorage 的 theme 再跳回首页，用来拍暗色版
scripts/_seed-full.html 截图辅助：造一份"整库已测完"的作答，用来拍解锁后的报告页
LICENSING.md            素材授权核对（重要）
```

## 六、跑起来

```bash
npm run server     # 启动本地服务 http://127.0.0.1:8787（Live2D 需要）
npm run build      # 打包 index.html
npm test           # 冒烟测试 100 项
npm run test:browser   # 真实浏览器 26 项
npm run test:pet       # 桌宠行为 26 项（需要 Chrome）`r`nnode scripts/check-offline.mjs  # 孤立单文件的离线交付检查（7 项）
node scripts/check-recipient.mjs  # 模拟「别人收到文件」的环境（18 项）
node scripts/check-online-ai.mjs  # 联网 AI 主路径（5 项，需后端在跑）
```

## 七、几个环境坑

- 截图别用 `--virtual-time-budget`，会和 Live2D 的 blob Worker 死锁；用 `scripts/cdp-shot.mjs`（DevTools 协议）
- `headless Chrome` 视口宽度有最小值（约 500px），小窗口截图会被截掉右边
- `npm run art:fetch` 走 `api.github.com`，未认证限流 60 次/小时，很容易 403。
  脚本已改成 raw 优先 + API 兜底，**拿不到远端清单时不再覆盖 `_index.json`**
  （旧版会把已有的 93 条清单清成 `[]`，2026-10-17 踩过一次）
- **改中文文档别用 PowerShell 的 `Get-Content | Set-Content`**：这台机器是 PS 5.1，
  默认按 GBK 读写，会把 UTF-8 里多字节字符的最后一个字节替换成 `?`，
  一次就能把整份文件毁掉（2026-10-17 把 NEXT.md 毁了 196 处）。
  改 md / js / css 一律用文件编辑工具，或者 `[System.IO.File]::WriteAllText($p,$s,(New-Object System.Text.UTF8Encoding($false)))`

## 八、还缺的交付物

- [ ] 演示视频（5–8 分钟 1080P）—— 只能用户自己录，用 `http://127.0.0.1:8787`
- [ ] README 团队成员信息 —— **只有用户能提供，一直空着**
- [ ] 未推送提交
