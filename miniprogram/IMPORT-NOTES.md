# 微信小程序移植说明（第 1 阶段：引擎移植）

> 本文只覆盖**统计引擎**：能不能在小程序运行时里跑、跑出来的数字与网页版是否分毫不差。
> 不含任何 WXML / WXSS / 页面逻辑。UI 一行没动，`src/` 与项目根目录的文件也一个字节没改。

## 0. 一句话结论

**引擎可以在小程序运行时里跑，且数值与网页版完全一致（1302 条字段级断言、104,130 条叶子级比较、0 差异）。**
词库直接放主包：原始 843,634 字节 ≈ 主包 2MB 上限的 **42.9%**（gzip 后 14.4%），放得下，不需要分包或云存储。
引擎本体 51,180 字节，静态扫描 24 类小程序禁用 API 命中 **0** 处，`Math.random` 只在洗牌与生成 ID 两处，
测量路径上没有任何随机数，FNV-1a 定序未受影响。

## 1. 本阶段产物

| 文件 | 行数/字节 | 说明 |
| --- | --- | --- |
| `miniprogram/utils/engine.js` | 1130 行 / 51,180 B | 引擎本体，由 `src/app.part1.js` 定点移植生成 |
| `miniprogram/utils/storage.js` | 111 行 / 4,548 B | 存储适配层：`wx.getStorageSync` 优先，缺失时回退内存实现 |
| `miniprogram/utils/words-data.js` | 843,634 B | 词库（7175 词条），由 `words.json` 按 build.js 同样规则裁剪 |
| `miniprogram/test/parity.mjs` | 914 行 / 45,578 B | 双实现一致性测试，`node miniprogram/test/parity.mjs` |
| `miniprogram/tools/port-engine.mjs` | 252 行 | （可选）engine.js 的生成器，重放结果逐字节一致 |
| `miniprogram/tools/gen-words-data.mjs` | 38 行 | （可选）words-data.js 的生成器 |

`tools/` 下两个脚本**运行时不需要**，删掉不影响小程序；留着是为了以后 `src/app.part1.js` 改动时
能一条命令重新同步（重放已验证与现有产物逐字节相同）。

## 2. 引擎对外导出了什么

`module.exports` 形如：

```js
var engineMod = require('../../utils/engine.js');
var engine = engineMod.engine;                                  // 默认单例（自动接 wx 存储 + 内置词库）
var fresh  = engineMod.createEngine({ words: 词库, storage: 存储 });  // 独立实例（测试/多档并存用）
```

`engineMod` = `{ createEngine, engine, storage, WORDS }`。引擎实例 `A` 上有 81 个导出成员（`Object.keys(engine).length === 81`），按用途分组：

**状态与存档**：`S`（全部状态对象）、`KEY`（存档键 `cet4vocab_v1`）、`save()`、`storageBroken`
**词库**：`WORDS`、`BANKS`、`bankKey()`、`bankName()`、`bankShort()`、`bankHint()`、`bankCounts()`、`inBank()`、`isUserBank()`、`userBook()`、`userBooks()`
**词池与定序**：`activePool()`、`curPoolSize()`、`groups()`、`coreGroupsCount()`、`GROUP_SIZE`、`invalidateWordCaches()`
**作答状态**：`getSt(i)`、`setSt(i,v)`、`clearSt(i)`、`keyOf(i)`、`tally(pool)`
**频段与抽样**：`BAND_NAMES`、`bandOf(i)`、`bandSizes()`、`probeQueue()`、`scoreBands()`、`unguessBands()`、`stratEstimate()`、`bandProfile()`、`probeStats(sess)`、`estimate()`、`scoreOf()`
**词汇量估计**：`estimateNow()`（含 `kind: full/sample/none`、`vocab/lo/hi`、`strictVocab/looseVocab`、`strictLo/Hi`）、`latestSample()`、`addSample(o)`
**词汇地图**：`MAP_BANDS`、`MAP_LETTERS`、`vocabMap()`、`mapCellWords(band,letter)`、`untestedWords()`
**完整报告**：`levelReport()`（等级、区间、各频段、gainTop/deficitTop/baseGap/fuzzyShare/toNext/cap…）、`censusBands(pool)`、`RANKS`、`RANK_CAPS`、`RANK_REFS`、`rankAt()`、`freqRank()`、`levelText()`
**多轮检测**：`roundNo()`、`roundHistory()`、`canRetest()`、`startNewRound()`、`roundDiff()`
**AI 额度**：`aiQuota()`、`grantAiQuota()`、`spendAiQuota()`、`maybeGrantAiQuota()`
**使用者档案**：`profileList()`、`activeProfile()`、`myName()`、`switchProfile()`、`createProfile()`、`renameProfile()`、`removeProfile()`、`profileSummaries()`、`markWelcomed()`、`needsWelcome()`
**界面用纯计算**：`needFor(half)`、`minsText(n)`、`pct()`、`fmtDate()`、`tpl()`、`esc()`
**工具**：`shuffle(a)`（洗牌，只给 `probeQueue` 用）、`toast(msg)`（提示，转给注入的 `A.onToast`）、`storage`（当前存储适配层引用）
**注入点（可选）**：`onToast(msg)`、`render()` —— 引擎内部只在存在时才调用，用于提示与「状态变了请刷新视图」

原文件里属于视图的 `viewHome / viewGroups / groupGrid / bankSwitch / render / go / ring / speak / modal / announce` 等**一律没有移植**。

## 3. 每一处 DOM / 存储依赖怎么处理的

先纠正一下任务书里的计数：`src/app.part1.js` 里 `localStorage` 实际出现 **9 次**（代码 6 处 + 注释 1 处 + 界面文案 2 处），
`document.` 出现 **6 次**，`window.` 出现 **16 次（13 行，其中 1126 / 1159 / 1429 三行各出现 2 次）**。逐条如下，行号为原文件行号。

### 3.1 localStorage（6 处真调用，全部换成 storage 适配层）

| 原行 | 原代码 | 处理 |
| --- | --- | --- |
| 91 | `localStorage.getItem(PROFILES_KEY)` 读档案表 | → `storage.getItem` |
| 98 | `localStorage.setItem(PROFILES_KEY, …)` 写档案表 | → `storage.setItem`（异常仍抛出，置 `storageBroken`） |
| 144 | `localStorage.getItem(dataKey(activeRec()))` 读当前档案作答 | → `storage.getItem` |
| 174 | `localStorage.setItem(dataKey(activeRec()), …)` 保存作答 | → `storage.setItem` |
| 236 | `localStorage.removeItem(dataKey(removed))` 删档案数据 | → `storage.removeItem` |
| 251 | `localStorage.getItem(dataKey(r))` 读各档案摘要 | → `storage.getItem` |

另外 3 处不是调用：**行 84 的注释**（措辞改成「浏览器本地存储」）、**行 1227 / 1391 的界面提示文案**
（「浏览器禁止了 localStorage」「只保存在你的浏览器里（localStorage）」）——后两处所在的 `render()` / `viewHome()` 整段是视图，已随视图删除。

适配层的关键语义（parity 测试里逐条断言过）：

- **缺失键返回 `null`**，不是 `undefined`、不是空串。`loadState()` 用 `raw === undefined` 区分「显式传入」与「去存储里读」，
  而 `wx.getStorageSync` 读不到键时返回**空串**，所以适配层把空串归一成 `null`。
- **`setItem` 不吞异常**。网页版靠 `localStorage.setItem` 在配额写满时抛异常来置 `A.storageBroken` 并在界面常驻提示，
  小程序里 `wx.setStorageSync` 同样会抛（单键 1MB / 单应用 10MB），语义对齐。
- 存档键名、JSON 结构**一个字都没改**，所以网页版存档能直接搬进小程序，反之亦然——parity 测试里比的就是
「同一套作答，两边写出的存档 JSON 去掉时间戳后逐字节相同」。

### 3.2 document.（6 处，全部删除）

| 原行 | 所在函数 | 处理 |
| --- | --- | --- |
| 10 | `el(id)` = `document.getElementById` | 整个 helper 删除（它的调用者 `toast/announce/modal/go/render` 全是视图） |
| 56, 61 | `stripStrayText()`：清理 body 下游离文本节点 | 整段删除，纯兜底渲染事故的 DOM 补丁，小程序没有这个风险 |
| 1239, 1241 | `render()` 里写顶栏「当前使用者」 | 随 `render()` 删除 |
| 1246 | `render()` 里 `querySelectorAll('.nav button')` 高亮导航 | 随 `render()` 删除 |

判断依据：这 6 处**没有一处参与计算**，删掉不影响任何数值。`el` 被 `toast/announce/modal/go/render` 使用，
这几个也都属于界面，所以 `el` 可以一起删——parity 测试里对 `engine.js` 的静态扫描会守住这一点（`document.` 命中必须为 0）。

### 3.3 window.（16 处 / 13 行）

| 原行 | 用途 | 判断 | 处理 |
| --- | --- | --- | --- |
| 5 | `window.WORDS` 取词库 | **逻辑**，必须绕开 | 改为 `A.WORDS || []`，由 `createEngine({words})` 注入 |
| 58 | `window.console`（在 stripStrayText 里） | 渲染 | 随整段删除 |
| 1097, 1108 | `window.SENTENCES` 例句库 | 渲染（RAG 例句，MVP 用不到） | `examplesOf` / `hasExamples` 删除 |
| 1121, 1122, 1126×2, 1129, 1131, 1135（共 7 处） | `window.speechSynthesis` 语音朗读 | 浏览器专属 | `pickVoice` / `speak` / 顶层 `if (speechSynthesis)` 全删 |
| 1159 | `window.matchMedia` 减少动效 | 渲染 | 随动效层删除 |
| 1208 | `window.scrollTo` 切页回顶 | 渲染 | 随 `go()` 删除 |
| 1429 | `window.__APP__` IIFE 挂载 | **结构** | 改成 `engineBody(A)` + `createEngine()` + `module.exports` |

也就是说 16 处里只有 **「词库来源」与「`window.__APP__` 挂载」两种需要改写**，其余全部属于视图/浏览器 API，直接删。

### 3.4 其他浏览器专属（不在上面两个前缀里，但同样必须处理）

| 原行 | 东西 | 处理 |
| --- | --- | --- |
| 849, 853 | `btoa` / `atob`（roundSnapshot 的 2bit 位图转 base64） | **换成等价的纯 JS base64**。小程序运行时没有这两个全局函数；实现要求与浏览器逐字节一致，否则逐词对比会错位 |
| 1132 | `SpeechSynthesisUtterance` | 随 `speak()` 删除 |
| 1175,1179,1192,1193 | `requestAnimationFrame` | 随动效层删除 |
| 1166 | `void v.offsetWidth`（强制回流） | 随动效层删除 |
| 1172,1178,1286,1287,1288,1292,1294,1296 | `toLocaleString('en-US')` 数字千分位（9 处） | 全在动效层与首页视图里，随视图删除。这条算意外收获：小程序对 `Intl`/locale 支持不全，引擎里现在一个都没有 |

`btoa/atob` 是本次移植**唯一带业务风险的改动**，所以专门为它做了断言：多轮检测那一组 compare 了
`roundSnapshot()`（含 base64 位图字符串）、`roundHistory()`、`roundDiff()`（逐词对比结果）三个字段。
变异测试里把 base64 字符表最后两个字符对调，测试立刻报 3 条差异——说明这段确实被守住了。

### 3.5 整段删除的函数（视图与浏览器专属）

`el`、`stripStrayText`、`announce`、`modal`、`closeModal`、`ring`、`armMotion`、`playMotion`、`reduceMotion`、
`getRoute`/`go`/`A.render`、`bankSwitch`、`viewHome`、`groupGrid`、`viewGroups`、`examplesOf`、`hasExamples`、`highlightWord`、
`pickVoice`/`speak`。

改写的只有两处：`toast()`（原来操作 `#toast` 元素，现在改为调用可注入的 `A.onToast`）、`b64/unb64`（见上）。

## 4. 一致性测试（`miniprogram/test/parity.mjs`）

### 4.1 怎么做的

同一个 Node 进程里同时加载两份实现：

- **基准**：原始 `src/app.part1.js`，用 `vm` 沙箱补上 `window / document / localStorage / console / btoa / atob`。
- **移植**：`miniprogram/utils/engine.js`，`createEngine({ words, storage: 内存存储 })`，起点与「浏览器空存档」一致。

然后对两边**喂完全相同的确定性作答序列**（作答判定是「词本身字符串的 FNV 哈希」的函数，不含任何随机数），
再逐字段比较全部输出。时间戳（`Date.now()` 产生的 `ts`/`startedAt`）在比较前统一归一，否则不可比。

`node miniprogram/test/parity.mjs` —— 退出码 0 = 全绿；非 0 且逐条打印「字段路径 / 基准值 / 移植值 / 差多少」。

### 4.2 比了哪些字段

每个场景比 46 个顶层字段（外加存档字符串），涵盖任务要求的全部口径：

- 词汇量估计 `estimateNow()`：`vocab / lo / hi / se / half / p`、`strictVocab / looseVocab`、`strictLo / strictHi`、`kind / n / pre / unguessed / stratified / ts`
- 置信区间：`stratEstimate()` 的 `lo/hi/p/se/half`，以及退化路径 `estimate()`（含 FPC 边界 `tested===universe`、`universe<2`、`score=0`）
- 严格/折中两套口径：`scoreOf()`、`scoreBands()`、`unguessBands()`（四选一蒙对校正）、`S.settings.strict` 两条支路
- 各频段掌握率与缺口：`censusBands()`（band/N/tested/k/f/u/score/ratio/deficit/name）、`bandProfile()`、`bandSizes()`、`tally()`
- `levelReport()` **全部字段**：`bank/ready/coverage/tested/total/remaining/k/f/u/loose/strict/ratio/rank/rankByRatio/cap/capBandRatio/nextRank/toNext/bands/gainTop/deficitTop/baseGap/fuzzyShare/refs/perDay`
- `censusBands()` 全量 + 子集、`RANKS` / `RANK_CAPS` / `RANK_REFS` / `BAND_NAMES` / `rankAt()` / `freqRank()` / `levelText()`
- 词池与定序：`activePool()`（4540 词的完整顺序、首尾各 40、校验和）、`groups()`、`coreGroupsCount()`、`bankCounts()`、`keyOf/getSt/bandOf` 抽样
- 词汇地图：`vocabMap()` 全量 182 格 + `hot` 三块、`mapCellWords()`、`untestedWords()`
- 多轮检测：`roundSnapshot()`（含位图 base64）、`roundHistory()`、`roundDiff()`、`canRetest()`、`startNewRound()`
- 存档：`save()` 后写进存储的 JSON 字符串（时间戳归一后要求逐字节相同）

### 4.3 27 个作答场景 + 1 组多轮检测

全认识（两套口径）、全不认识（两套口径）、中等掌握（四级/六级/含拓展派生词）、极端低频差（四级/六级）、
地基封顶（最高频 1k 段全灭，专打 `RANK_CAPS` 支路）、模糊偏多（`fuzzyShare` 极端）、
题量 300 / 1000、覆盖率 94%（差一点不到 95% 阈值）、覆盖率 96%（走实测 `full` 口径，两套口径）、
纯随机样本（self / choice / 严格口径）、样本 + 少量分组作答（复习效应提示）、六级 choice 样本、
样本 n<20（不给数字）、样本跨词库过滤（六级看不到四级样本）、两条样本取最新、样本 >20 条截断、混合场景。

### 4.4 结果

```
对比分组：28 组（27 个作答场景 + 多轮检测 1 组）
断言：字段级 1302 条 / 叶子级 104130 条
差异：0 条
结论：全绿 —— 移植版与网页版在以上所有场景下逐字段完全相等。
```

另外 6 组结构性检查也全绿：

| 检查 | 结果 |
| --- | --- |
| 词库数据与 build.js 从 words.json 的裁剪结果逐字节相同 | ok（7175 词条） |
| 24 类小程序禁用 API 静态扫描 | ok（0 命中） |
| 毒化 `Math.random` 后跑全部测量口径 | ok（不抛；`probeQueue()` 会抛 → 证明随机数只在抽样队列里） |
| 定序确定性（两次独立加载 + 与网页版对比） | ok（4540 词池、46 组完全一致，且不是字母序） |
| 裸运行时骨架（只有 `wx`，无 `window/document/localStorage`） | ok（能加载、能算、存档进 wx、冷启动读回） |
| 存储适配层语义（内存 / 假 wx / 异常传播 / 存档互通） | ok |

### 4.5 这套测试本身有效吗（变异测试）

「全绿」只有在测试抓得住差异时才有意义。为此故意把移植版改坏三处，看测试是否报警：

| 人为变异（改坏移植版） | 测试反应 |
| --- | --- |
| `stratEstimate` 里的 95% 系数 `1.96` → `1.95` | **失败**，100 条差异 |
| base64 字符表最后两个字符对调 | **失败**，3 条差异（正好是多轮快照/历史/逐词对比三处） |
| 频段权重 `BAND_W` 的 `0.33` → `0.34` | **失败**，102 条差异 |
| 恢复原文件后重跑 | 通过，0 差异 |

### 4.6 测试没覆盖的（诚实清单）

- **真机/开发者工具没跑过**：本机无网络、无微信开发者工具，所有结论来自 Node 与裸 `vm` 沙箱模拟。
- 自定义词书（`bookIndices` 在 part8，未移植）走的分支没测；`invalidateWordCaches` 的另一条路径没测。
- `probeQueue()` 的**顺序**依赖 `Math.random`，属于设计上的随机抽样，只能用同种子比（已比，一致）；
  「两次打开小程序抽到同一批词」本来就不该成立。

## 5. 可行性硬性检查

### 5.1 体积（主包 2MB / 总包 20MB）

| 文件 | 原始字节 | gzip | 占主包 2MB（原始 / gzip） |
| --- | --- | --- | --- |
| `utils/engine.js` | 51,180 | 19,229 | 2.4% / 0.9% |
| `utils/storage.js` | 4,548 | 2,009 | 0.2% / 0.1% |
| `utils/words-data.js` | 843,634 | 281,437 | 40.2% / 13.4% |
| **合计（引擎 + 适配层 + 词库）** | **899,362** | **302,675** | **42.9% / 14.4%** |
| 参照：`words.json` 原文件 | 835,910 | 283,319 | 39.9% / 13.5% |
| 参照：`sentences.json`（例句，MVP 不用） | 1,194,644 | 499,123 | 57.0% / 23.8% |

结论：**主包完全放得下**，即便把 `words.json` 原文直接扔进去也 < 2MB。开发者工具里显示的包体积是压缩后大小，
两种口径都远低于上限（42.9% / 14.4%）。占总包 20MB 的 4.3%。

若哪天要瘦身：引擎只需要 `w/b/f/x` 四个字段，精简版数据是 **209,552 B（gzip 33,974 B）**，能省掉 63%。
但**答题页需要释义 `t`**（四选一模式的选项就是释义），所以 MVP 不能砍 `t`；能砍的是 `p` 音标与 `ph` 短语（约省 1/3）。

### 5.2 小程序不支持的东西：有吗？

对 `engine.js` 全文做了 24 类禁用 API 静态扫描，**命中 0 处**：

| 类别 | 结果 |
| --- | --- |
| `eval` / `new Function`（动态代码，小程序禁止） | 0 |
| 正则后行断言 `(?<=` / `(?<!` | 0（全文只剩 3 个正则字面量：/[&<>"]/g、/\{(\w+)\}/g、/=+$/，全是基础语法；`new RegExp` 出现 0 次） |
| `Intl` / `toLocaleString` | 0（原本用它的只有视图） |
| `TextEncoder` / `TextDecoder` / `Blob` / `URL` / `Worker` / 同步 `XMLHttpRequest` | 0 |
| `document.` / `window.` / `localStorage` / `sessionStorage` / `indexedDB` | 0 |
| `btoa` / `atob` | 0（已换成纯 JS 实现） |
| `requestAnimationFrame` / `matchMedia` / `querySelector` / `addEventListener` / `scrollTo` / `speechSynthesis` | 0（都是视图层的，已删） |
| `wx.` | 0 —— 引擎不直接碰任何小程序 API，`wx` 只在 `storage.js` 里出现 |

语法层面也确认引擎是**纯 ES5**：没有箭头函数、`let/const`、模板字符串、`class`、展开/rest（全文只有 3 处 `...`，都在注释里）。
用到的内建只有 `Math / Date / JSON / Object.keys / Array.isArray` 和三只 typed array（`Uint8Array / Int32Array / Uint32Array`），
小程序全支持。

**仍需真机确认的三件小事**（静态扫描覆盖不到，但都不影响算法）：

1. `require` 一个 843KB 的 `words-data.js` 在低端机上的模块解析耗时（本机 Node 22ms）。
2. 首次 `activePool()` 要建 7175 词的 FNV 序位表并排序（本机 4ms；低端机估 30–60ms），建议放在启动 loading 里。
3. `wx.setStorageSync` 写整份存档（`S.status` 有几千个键的 JSON）体积是否触发单键 1MB 上限——超了就要换成分片或按词库拆键。

### 5.3 `Math.random` 在测量路径上吗？（NEXT.md 说排序必须确定性 FNV-1a）

**不在。** 三重证据：

1. **静态**：`engine.js` 全文只有 2 处 `Math.random` —— `shuffle()`（第 49 行，给 `probeQueue()` 洗牌用）与 `mkPid()`（第 86 行，生成档案 ID）。
2. **行为**：把 `Math.random` 换成「一调就抛」的函数，然后跑 `estimateNow / levelReport / censusBands / bandProfile / vocabMap` —— 两份实现都**不抛**；
   而 `probeQueue()` 会抛，说明随机数确实只出现在抽样队列上（这是设计要求的：摸底要真随机抽题）。
3. **定序**：`ordPos()` 用词本身的 FNV-1a 哈希（常量 `2166136261` / `16777619`）定序位，parity 里比的就是这条链的产物——
   两次独立加载 + 网页版三者得到的 4540 词词池与 46 个分组**完全一致**，且确认不是字母序。

换句话说：**「第 N 组永远是同一批词」这条保证在小程序里依然成立**（进度、历史、跨轮对比都靠它）；
而「摸底抽哪 100 个词」按设计每次不同。

## 6. 词库打包建议

| 方案 | 可行性 | 结论 |
| --- | --- | --- |
| **主包直放**（`utils/words-data.js`） | 843KB / gzip 281KB，占主包 40% / 13% | **推荐**。零延迟、离线可用、与网页版共用同一份数据；`require` 即用，不用管异步加载与失败重试 |
| 分包（如 `package-data`） | 技术上可行，但**主包代码不能 require 分包代码** | **不推荐**：引擎在主包、词库在分包，主包拿不到词库；除非把引擎整个搬进分包，那样每个要用引擎的页面都得在分包里，得不偿失 |
| 云存储 / 云开发 | 需网络与域名白名单 | **不推荐**（至少 MVP 不用）：这个产品的卖点是「数据只在你手里、离线可用」，把词库放云上等于给首屏加一个网络依赖与失败分支 |
| 文件系统（`wx.getFileSystemManager`）异步读 | 可行 | 备选：只有将来词库涨到 1.5MB 以上、主包吃紧时才考虑；代价是启动变成异步，所有页面要处理「词库还没就绪」 |

补充两点：

- **用 `.js` 模块而不是 `.json`**：`module.exports = [...]` 是字面量，免掉 `JSON.parse` 开销，也不依赖基础库对 JSON `require` 的支持。
- **例句（`sentences.json`，1.19MB）不要进主包**。MVP 用不到；真要用，`build.js` 那种「每词只留一句」的精简版是 598,727 B（gzip 267,357 B），
  塞进主包会把主包顶到约 1.5MB（占 71%），更合理的位置是分包或云端按需取。

## 7. 到「能答题的小程序 MVP」还剩多少工作

引擎这一层已经完成且验收。剩下的全是页面与流程：

| # | 工作 | 说明 | 乐观工时 |
| --- | --- | --- | --- |
| 1 | 小程序骨架 | `app.json`（3 个页面 + 分包配置）、`project.config.json`、`app.wxss` 主题变量（抄 `src/app.css` 的色板） | 0.5 天 |
| 2 | 答题流程 | **✅ 已完成（第 2 阶段）**：`utils/quiz.js`（500 行，19+1 个对外成员）+ 一致性测试 `test/quiz-parity.mjs`，详见**第 10 节** | 0（原估 1 天） |
| 3 | 三张页面 | 首页（余额 + 两种入口 + 分组网格）、答题页（词 + 音标 + 三个判定按钮 + 进度）、报告页（等级 + 区间 + 频段条 + 缺口） | 1.5–2 天 |
| 4 | 状态与存档接线 | `A.render` 钩子接 `setData`、`A.onToast` 接 `wx.showToast`、断点续测（引擎已支持） | 0.5 天 |
| 5 | 真机跑通与体感 | 首屏 loading、`setData` 体积（报告页别一次塞 182 格地图）、低端机词库加载耗时、iOS/Android 各一台 | 0.5–1 天 |
| | **合计** | 不含 AI 诊断、桌宠、自定义词书、例句、发音、多档案 UI | **4–5.5 个工作日** |

可以推迟的：AI 诊断（要后端 + 域名白名单，与「纯本地」定位冲突）、发音（`wx.createInnerAudioContext` 或词典音频）、
桌宠与动效（`part5/6/7` 那套纯 DOM 的东西在小程序里要按 `canvas`/CSS 动画重做）、自定义词书、例句。

## 8. 坑与注意事项

1. **不要改存档结构与存档键**（`cet4vocab_v1` + `S` 的字段形状）。两端共用同一份，改一处就断了「网页版存档 ↔ 小程序存档」的迁移。
   新增字段可以（`loadState()` 里有默认值兜底），改字段名/删字段不行。
2. **`engine.js` 是生成物**。要改行为就改 `src/app.part1.js`（网页版优先），然后 `node miniprogram/tools/port-engine.mjs` 重放，
   再跑 `parity.mjs`。反过来「在小程序版上单独改算法」必然导致两端数字漂移。
3. **`Math.random` 只能用在这两处**。任何新逻辑想要「看起来随机但每次一致」的排序，都必须走 FNV 哈希（见 `ordPos()` 的注释）。
4. **`censusBands()` / `levelReport()` 每次调用都要遍历整个词池**（4540 词，本机 2ms）。页面里别在 `onPageScroll` 之类的高频回调里调。
5. **`A.storageBroken` 要有对应的用户提示**。小程序存储写满会抛，引擎只会置这个标志，界面不提示就等于静默丢数据——
   网页版有常驻红色横幅，小程序版也必须有。

## 9. 复现步骤

```bash
# 1) 生成词库模块（words.json 变更后需要重跑）
node miniprogram/tools/gen-words-data.mjs

# 2) 由 src/app.part1.js 重放生成引擎（src 变更后需要重跑）
node miniprogram/tools/port-engine.mjs

# 3) 跑一致性测试（退出码 0 = 全绿）
node miniprogram/test/parity.mjs        # 第 1 阶段：统计引擎（1302 断言）
node miniprogram/test/quiz-parity.mjs   # 第 2 阶段：答题流程控制器（34310 断言，约 21 秒）
```

两个生成器都已验证为**幂等**：重复执行产物逐字节不变。

## 10. 答题流程控制器（第 2 阶段：`utils/quiz.js`）

> 本节起覆盖**答题流程的状态机**：开局 / 取题 / 判分 / 进度 / 跳过 / 撤销 / 提前收工 / 结算 / 断点续测 / 多轮重测，
> 以及它与页面层的契约。同样**不含任何 WXML / WXSS**；`src/` 与项目根目录的文件一个字节没改
> （`git status` 里 miniprogram 仍是 `?? miniprogram/`，没有已跟踪文件被修改）。

### 10.0 一句话结论

**答题流程已在 `utils/quiz.js`（497 行 / 20 个对外成员）里跑通，且与网页版逐题、逐字段、逐字节一致：
`node miniprogram/test/quiz-parity.mjs` → 15 组对比、34,310 条字段级断言 / 168,786 条叶子级比较、
0 差异、退出码 0（约 21 秒）。这一轮是拿 jsdom 真跑网页版（加载构建产物 `index.html`、真点按钮作答）比的，
不是靠模型推演。**

### 10.1 本阶段产物

| 文件 | 行数/字节 | 说明 |
| --- | --- | --- |
| `miniprogram/utils/quiz.js` | 497 行 / 21,377 B | 答题流程控制器（CommonJS），由 `src/app.part2.js` 定点移植 |
| `miniprogram/test/quiz-parity.mjs` | 1,059 行 / 53,285 B | 双实现一致性测试，`node miniprogram/test/quiz-parity.mjs` |
| `miniprogram/utils/engine.js` | 1,052 行 / 51,064 B | **本轮重放过一次**（见 10.8）：逻辑未变，只跟上 src 的文案改动 |

### 10.2 对外 API

`module.exports = { createQuiz, quiz, vText }`；
`createQuiz(engine, options)` 返回一个控制器实例（`quiz` 是绑定默认引擎单例的那一份）。

```js
var engineMod = require('../../utils/engine.js');
var quizMod   = require('../../utils/quiz.js');

var q = quizMod.createQuiz(engineMod.engine, {
  onChange:   function (state) { /* 视图层 setData(state) —— 取代网页版的 A.render() */ },
  onGo:       function (route) { /* 'test' | 'result' | 'home' —— 取代网页版的 A.go() */ },
  onToast:    function (msg)   { /* 缺省走引擎的 A.onToast */ },
  onAnnounce: function (text)  { /* 无障碍播报，可省 */ },
  onSpeak:    function (word)  { /* 发音，可省 */ }
});
```

| 成员 | 对应网页版 | 说明 / 返回值 |
| --- | --- | --- |
| `start(kind, opts)` | `A.startSession` | kind = `'group' / 'all' / 'probe' / 'list'`；opts = `{ group, target, list, label }`。返回 `{ok, reason}`（reason：`no-group / empty-list / no-words`） |
| `judge(v)` | `A.judge` | v：**2 = 认识 / 1 = 模糊 / 0 = 不认识**（就是 `S.status` 里存的值）。返回 bool |
| `pick(optIndex)` | `A.pick` | 四选一：选对 → 2，选错 → 0（没有「模糊」档） |
| `rejudge(v)` | `A.rejudge` | 改判最后一条（自评点错了） |
| `next()` | `A.nextQ` | 翻下一题；越过队尾或摸底达标时**自动收工** |
| `skip()` | `A.skipQ` | 跳过（`sess.skipped++`，不计入作答） |
| `undo()` | `A.undo` | 撤销最后一条作答；撤销的正是当前题就留在本题，否则回退一题 |
| `revertCurrent()` | `A.revertCurrent` | 悄悄撤销当前题（切答题方式用），不改题号、不触发 onChange（与网页版一致） |
| `finish()` | `A.finishSession` | 收工结算：写 `S.lastResult` / `S.history` /（摸底）`S.samples`，清会话，`onGo('result')`。返回 `{ok, reason?/result?}` |
| `abandon()` | `A.abandonSession` | 放弃本次（作答记录保留），`onGo('home')` |
| `leave()` | part3 的 `'quit-keep'` | 保存并返回：会话原样留在存档里（首页可「继续检测」） |
| `view()` | `A.viewTest` 里的计算 | **「现在该显示什么」的全部数据**（见 10.3），不拼 HTML |
| `counts()` | `A.sessionCounts` | `{k,f,u,answered}`，无会话时全 0 |
| `probeReached(sess?)` | `A.probeReached` | 摸底精度是否达标（**至少答满 20 题**才可能为 true） |
| `lastV()` | part2 的 `lastV()` | 最后一条作答的分值，无则 -1 |
| `hasSession()` | `!!A.S.session` | 断点续测入口用它判断要不要显示「继续检测」 |
| `ensureOptions(i, pos)` | viewTest 第 324 行 | 懒建四选一选项（`view()` 内部会自动调，一般不用手动调） |
| `startNewRound()` | `A.startNewRound` | 多轮重测：归档本轮 + 清空工作状态（引擎负责），成功后 `onGo('home')` |
| `canRetest()` | `A.canRetest` | 覆盖率 ≥95% 才允许开新一轮 |
| `engine` | — | 控制器绑定的引擎实例（页面读 estimateNow / levelReport 时用） |

### 10.3 `view()` 的状态字段（视图层照着这张表 setData）

无会话时返回 `{ route, hasSession:false, auto, mode, settings }`；
会话期越界等异常时额外带 `emptyQueue:true` / `stuck:true`。

| 字段 | 类型 | 含义 / 用法 |
| --- | --- | --- |
| `hasSession` | bool | 有没有正在进行的检测（false → 显示空态） |
| `kind` / `label` / `group` / `bank` / `target` | string / string / int / string / int | 会话元信息；`label` 与网页版**逐字相同**（如 `'第 3 组 · 第 201-300 词'`、`'摸底检测 · 目标 ±150 词'`） |
| `pos` / `total` / `index` | int | 当前第几题（0 基）、队列长度、当前词在 `WORDS` 里的下标 |
| `word` | `{w, p, t, ph, band}` | 题面：单词 / 音标 / 释义 / 短语对象 / 词频段。**例句不在包里**（见 10.9） |
| `counts` | `{k,f,u,answered}` | 本轮认识 / 模糊 / 不认识 / 已答 |
| `accuracy` | int | 本轮掌握率百分比（`pct(k + 0.5f, answered)`） |
| `progressText` | string | 进度那一行文案，**与网页版逐字相同**（`'第 12 / 100 词 · 本次掌握率 46% · 约还需 1 分钟'`）。网页版这行里 `±250 词` 带 `<b>`，控制器只去掉标签，文字未改 |
| `barPct` | int | 进度条百分比。**摸底模式不是题号比例**，而是按精度缺口算（`st.n` 为 0 时固定 2%），与网页版同一公式 |
| `probe` | null / object | 仅摸底：`{n, half, universe, vocab, lo, hi, se, target, need, donePct, reached}`（无样本时 `half` 是 `null`，对应网页版的 Infinity + 显示 `±—`） |
| `mode` | `'self' / 'choice'` | 当前答题方式 |
| `opts` | null / array | 仅四选一：`[{i, t, ok, cls, picked}]`；`cls` 已经是 `'opt' / 'opt right' / 'opt wrong'`（与网页版的 class 拼接一致） |
| `revealed` | bool | 是否已揭示答案（决定显示「下一个 →」还是「跳过」） |
| `lastV` | int | 最后一条分值（2/1/0/-1），给三个判定按钮的 `.on` 高亮用 |
| `picked` | int | 四选一里点了第几项（未选 -1） |
| `canUndo` / `canSkip` / `canNext` | bool | 三个按钮的可用性（`canSkip = !revealed`、`canNext = revealed`，与网页版按钮出现条件一致） |
| `skipped` | int | 本轮跳过数（结算写进 `lastResult.skipped`） |
| `startedAt` | int | 会话开始时间戳（存档里同一个字段） |
| `auto` | `{pending, delay, action}` | **自动跳转意图**（见 10.4） |
| `settings` | `{mode, autoNext, autoDelay}` | 页面要用到的三项设置 |
| `route` | string / null | 控制器最近一次请求切到哪个页面（也可以完全靠 `onGo` 切页） |

### 10.4 与视图层的契约（页面必须做 / 必须不做的事）

1. **渲染**：`onChange(state)` 是唯一入口，里面做 `this.setData(...)`。控制器**不碰任何视图 API**，也不知道 `setData` 存在。
2. **切页**：`onGo(route)` → `'test'` 去答题页、`'result'` 去报告页、`'home'` 回首页。
3. **自动跳转的定时器归页面**：判分后若 `state.auto.pending === true`，页面自己
   `setTimeout(function () { q.next(); }, state.auto.delay)`；收到任何 `pending === false` 的新状态（或 `onHide` / `onUnload`）就清掉自己的 timer。
   延时与网页版一致：自评模式 `S.settings.autoDelay`（默认 850ms），四选一选对 750ms / 选错 1600ms。
   **网页版是 setTimeout + clearTimer()，控制器一次计时都不做**——小程序页面被切走时定时器行为与浏览器不同，交给页面的 `onHide` 管才靠谱。
4. **键盘快捷键不在控制器里**：网页版 `A.onKey` 是 DOM 事件（part2 第 400-426 行），小程序页面自己映射即可，键位表与网页版相同
   （`1`/`2`/`3` = 不认识/模糊/认识，`1`-`4` = 四选一，空格 = 下一题/发音，退格 = 撤销，Esc = 退出询问）。
5. **「要离开本次检测吗」弹窗是页面的事**：三个按钮 = `leave()`（保存并返回）/ `abandon()`（放弃本次）/ 关弹窗（继续答题）。
6. **提示与无障碍**：`onToast` → `wx.showToast`；`onAnnounce` → 一个 `aria-live` 区域的 setData（可省）；`onSpeak` → 发音实现（可省）。
7. **断点续测**：会话本身就在存档里（`S.session`），页面 `onLoad` 里 `if (q.hasSession()) this.setData(q.view())` 就能接着答；
   首页显示「继续检测」同样用 `q.hasSession()` + `view().label / pos / total`。
8. **不要跨题缓存 `view()` 的返回值**：`RUN.revealed / opts / picked` 属于「一次渲染周期的界面态」，不落盘
   （与网页版一致：刷新后回到未揭示状态）。

### 10.5 每一处浏览器依赖的处置（part2 共 435 行，逐段）

| 原行 | 原东西 | 处置 |
| --- | --- | --- |
| 5 | `A.tpl / A.esc / A.el`（模板 + 取元素） | **不移植**：控制器不产出 HTML，转义与取元素是视图的事 |
| 7-10 | `RUN = {timer, revealed, opts, optsPos, picked}` + `clearTimer()` | 内部保留 `RUN`（去掉 timer，换成 `auto` 意图）；`revealed/opts/picked` 通过 `view()` 暴露 |
| 108 / 130 | `setTimeout(... A.nextQ, autoDelay / 750 / 1600)` | **改成状态里的 `auto{pending, delay, action}`**，定时器归页面（10.4-3）。延时数值一字未改 |
| 13-56 | `startSession` + `A.save()` + `A.go('test')` | `start()` + `onGo('test')`；队列构造 / 标签文案 / `preTested` / `target` 全原样 |
| 69-85 | `buildOptions`（Math.random 抽干扰项 + `A.shuffle`） | 原样移植。**这是 quiz.js 里唯一的随机源**（静态扫描守着），只影响选项顺序，不影响任何分数 |
| 88-110 | `judge` + `A.announce` + save/render | `judge()` + `onAnnounce` + `save()`/`onChange`；「同一题重复点击改判、不再多记一题」原样保留 |
| 112-131 | `pick` + `A.speak`（选错时读一遍） | `pick()` + `onSpeak` |
| 134-144 | `rejudge` + `A.toast('已改判为「…」')` | `rejudge()` + 提示（文案逐字相同） |
| 147-152 | `probeReached`（`log.length >= 20 && half <= target`） | 原样 |
| 153-169 | `nextQ`（「越界收工」「达标收工」两条分支 + 达标提示） | `next()`，分支顺序与提示文案一字未改 |
| 171-181 | `skipQ` | `skip()` |
| 184-197 | `undo`（`isCurrent` 判断） | `undo()` |
| 200-209 | `revertCurrent`（**网页版不重渲染**） | `revertCurrent()`；同样**不触发 onChange**（保留网页版语义） |
| 212-250 | `finishSession`（`addSample` / `lastResult` / `history` 头插并截 40 / `maybeGrantAiQuota` / `go('result')`） | `finish()`，**写入存档的 JSON 结构与键名一个字没改**（parity 是逐字节比的） |
| 252-258 | `abandonSession` | `abandon()` |
| 261-392 | `viewTest`（约 130 行 HTML 拼装） | 拆成 `view()` 的**纯数据**（10.3 表）。进度 / 精度 / eta 公式原样搬运，`eta()` 文案逐字保留 |
| 394-398 | part2 内部 `lastV()` | `lastV()` |
| 400-426 | `onKey`（键盘） | **不移植**（DOM 事件），键位表见 10.4-4 |
| 428-433 | `quitAsk`（弹窗） | **不移植**；三条路 = `leave()` / `abandon()` / 关弹窗 |
| 全文 | `A.render()` | `onChange(state)`，调用点逐个对齐（判分 / 改判 / 翻页 / 跳过 / 撤销 / 收工 / 放弃 / 开局） |
| 全文 | `A.speak` / `A.announce`（speechSynthesis） | 注入点 `onSpeak` / `onAnnounce`，缺省静默；**quiz.js 里一处 speechSynthesis 调用都没有**（只在注释里说明它被删了） |

补一句：part2 里**没有** localStorage 调用（存档全走 `A.save()` → 引擎 → storage 适配层），所以这一层没有新增存储依赖。

### 10.6 三张页面现在就能照着写的接口说明

**① 首页（`pages/index/index`）**

```js
var eng = require('../../utils/engine.js').engine;
var q   = require('../../utils/quiz.js').quiz;      // 单例即可

Page({
  onShow: function () {
    var t = eng.tally(eng.activePool());
    var r = eng.levelReport();
    this.setData({
      vocab: eng.estimateNow(),                  // kind: full/sample/none + vocab/lo/hi + 两套口径
      rank: r.rank, ratio: r.ratio,              // 等级 + 掌握率
      tested: t.tested, total: t.total,
      resume: q.hasSession() ? q.view() : null   // 有会话就显示「继续检测」（label / pos / total）
    });
  },
  onQuick:  function () { q.start('probe', { target: 250 }); },     // onGo('test') 里切到答题页
  onAll:    function () { q.start('all'); },
  onGroup:  function (e) { q.start('group', { group: e.currentTarget.dataset.g }); },
  onResume: function () { if (q.hasSession()) this.setData(q.view()); }
});
```

入口文案要的数字都在引擎上：`eng.needFor(250)`（预计题量）、`eng.minsText(n)`、`eng.groups().length`、
`eng.canRetest()`（≥95% 才出现「开始第 N+1 轮」）。

**② 答题页（`pages/quiz/quiz`）**

```js
var quizMod = require('../../utils/quiz.js');
var timer = null;

Page({
  onLoad: function () {
    var self = this;
    this.q = quizMod.createQuiz(require('../../utils/engine.js').engine, {
      onChange: function (st) { self.applyState(st); },
      onGo: function (route) {
        if (route === 'result') wx.redirectTo({ url: '/pages/report/report' });
        else if (route === 'home') wx.reLaunch({ url: '/pages/index/index' });
      },
      onToast: function (m) { wx.showToast({ title: m, icon: 'none' }); },
      onSpeak: function (w) { /* 可选 */ }
    });
    if (this.q.hasSession()) this.applyState(this.q.view());   // 断点续测
  },
  applyState: function (st) {
    if (timer) { clearTimeout(timer); timer = null; }          // 契约 10.4-3
    this.setData({ s: st });
    var self = this;
    if (st.auto && st.auto.pending) timer = setTimeout(function () { self.q.next(); }, st.auto.delay);
  },
  onJudge:   function (e) { this.q.judge(Number(e.currentTarget.dataset.v)); },  // 2 认识 / 1 模糊 / 0 不认识
  onPick:    function (e) { this.q.pick(Number(e.currentTarget.dataset.n)); },
  onNext:    function () { this.q.next(); },
  onSkip:    function () { this.q.skip(); },
  onUndo:    function () { this.q.undo(); },
  onRejudge: function (e) { this.q.rejudge(Number(e.currentTarget.dataset.v)); },
  onFinish:  function () { this.q.finish(); },
  onQuit:    function () { /* 弹窗 → leave() / abandon() */ },
  onUnload:  function () { if (timer) clearTimeout(timer); }
  /* WXML 绑的就是 s.word.w / s.word.p / s.progressText / s.barPct / s.counts / s.revealed /
     s.lastV / s.opts（四选一）/ s.canUndo / s.canSkip / s.canNext / s.auto */
});
```

**③ 报告页（`pages/report/report`）**

```js
var eng = require('../../utils/engine.js').engine;
var q   = require('../../utils/quiz.js').quiz;
Page({
  onShow: function () {
    var r = eng.levelReport();      // 等级 / 区间 / 两套口径 / 频段表 / 缺口 / 参考刻度
    this.setData({
      last: eng.S.lastResult,       // 本轮明细（含 log，可做「复测本次未掌握词」）
      est:  eng.estimateNow(),
      bands: r.bands, rank: r.rank, rankByRatio: r.rankByRatio, cap: r.cap,
      gainTop: r.gainTop, deficitTop: r.deficitTop, baseGap: r.baseGap,
      canRetest: eng.canRetest(), roundNo: eng.roundNo(),
      diff: eng.roundDiff()         // 多轮对比（没完成两轮时为 null）
    });
  },
  onNewRound: function () { if (q.startNewRound()) wx.reLaunch({ url: '/pages/index/index' }); },
  onReviewWeak: function () {       // 「复测本次未掌握词」= list 模式
    var weak = (eng.S.lastResult.log || []).filter(function (e) { return e.v !== 2; }).map(function (e) { return e.i; });
    q.start('list', { list: weak, label: '复测本次未掌握词 · ' + weak.length + ' 词' });
  }
});
```

### 10.7 一致性测试（`test/quiz-parity.mjs`）

**做法（真跑网页版，不是推演）**：用仓库已有的 devDependency `jsdom` 加载构建产物 `index.html`
（先用断言确认 `index.html` 里内嵌的 `app.part2.js` 与 `src/app.part2.js` **逐字节相同**，否则比的是两份不同的流程），
然后**真点按钮**：`[data-act=start]` / `[data-act=judge][data-v=N]` / `.opt` / `[data-act=next]` / `[data-act=skip]` /
`[data-act=undo]` / `[data-act=rejudge]` / `[data-act=finish]` / `[data-act=quit]` / `[data-act=quit-keep]` / `[data-act=quit-drop]`；
同一套操作再喂给 `quiz.js`，**每一步（题面 / 判分后 / 翻页后）都做一次全字段对比**。

**时间戳怎么做到逐字节相同**：两边共用一个**虚拟时钟**（网页版在 `beforeParse` 里改 `window.Date.now`，
移植版改主 realm 的 `Date.now`），每个动作前统一 +1300ms。因此 `session.startedAt` / `lastResult.ts` /
`history[].ts` / `samples[].ts` / `round.startedAt` 天然相等，存档 JSON 可以**原样逐字节比**
（第 1 阶段的 parity.mjs 是把时间戳抹平后比的，这一轮更强）。

**比了什么**

| 层面 | 具体字段 |
| --- | --- |
| 题序 / 分组边界 | `S.session.queue` 全量逐词 + 长度 + 校验和 + 首尾各 20 词、`label`、`kind`、`group`、`bank`、`preTested`、`target`、`startedAt` |
| 每题呈现的词条 | 网页版 `.qword` 的 textContent ↔ 控制器 `view().word.w`；外加 `pos / total / index / progressText / barPct` |
| 作答语义 | `S.session.log` 逐条 `{i,v,prev}`、`S.status` 全量、`revealed`、`.reveal .mean`（释义 / 答对答错）、三个判定按钮的 `.on` 态、四选一选项文本与 `opt right/wrong` class、跳过/下一题按钮的出现条件 |
| 结算 | `lastResult`（含 log）、`history`、`samples`、`estimateNow()`、`stratEstimate`（分层 / 严格 / 折中 / 扣蒙对四路）+ `estimate`（简单比例）、`bandProfile()`、`censusBands()`、`levelReport()` 全字段、`tally` |
| 存档 | `cet4vocab_v1` 存档 JSON **逐字节**、`cet4vocab_profiles` 档案元数据 JSON 逐字节 |
| 多轮 | `canRetest`、`startNewRound`、`roundHistory`（含 2bit 位图 base64）、`roundNo`、`roundDiff` 逐词对比、第 2 轮 `levelReport` |

**10 个作答场景 + 5 个专项（共 15 组对比）**

| 场景 | 覆盖点 |
| --- | --- |
| ① 全认识 · 分组第 3 组（**点分组格子开局**，100 题走完） | 分组队列、label、队列边界 |
| ② 全不认识 · 分组第 7 组（100 题） | 同上，另一分组 |
| ③ 中等掌握 · 分组第 13 组（100 题） | 三档混合，进度 / 掌握率 / eta 全程 |
| ④ 摸底 · **未达精度中途收工**（±150，24 题停） | 摸底样本写入（`addSample` + bands）、`estimateNow` 走 `sample` 口径 |
| ⑤ 摸底 · **精度达标自动收工**（±400，全认识，45 题） | `nextQ` 里「达标即收工」分支 + 提示 |
| ⑨ 摸底 · **精度够了但受「至少 20 题」地板约束**（±1000） | `probeReached` 的 `log.length >= 20` 门槛（正好停在 20 题） |
| ⑥ 全量检测 · 只答 12 题收工（预置 30% 已测） | `all` 的「从第一个未测词开始」轮转 |
| ⑦ 错词重测（list）含 **跳过 / 撤销 / 改判 / 悄悄撤销** | 非直线路径：`skip`（不计作答）、`undo`（回滚状态与题号）、`rejudge`、`revertCurrent` |
| ⑧ **四选一模式**（30 题，选对/选错混合） | `buildOptions` + `pick` 的 2/0 映射、选项文本与 class、750/1600ms 意图 |
| 断点续测 | 答到第 20 题存档 → 换一个引擎实例读回 → 继续答完：`lastResult / estimateNow / levelReport / 存档 JSON` 与不中断时一致 |
| 多轮重测 | 覆盖率 96% → `startNewRound` → 快照 / 位图 / roundDiff / 轮次 / 存档 |
| 自动跳转 | autoNext 开：网页版 `A.RUN.timer` 存在 ↔ 控制器 `auto.pending`；关：两边都不排 |
| 离开与放弃 | `quit-keep` → `leave()`（会话保留）、`quit-drop` → `abandon()`（清会话留记录），存档逐字节一致 |
| 静态扫描 | quiz.js **代码**里 21 类禁用 API（DOM / window / localStorage / setTimeout / speechSynthesis / wx. / eval …）命中 **0**；`Math.random` 只有 1 处且在 `buildOptions` 里；不碰 FNV 定序常量 |
| 裸运行时骨架 | 只有 `wx`（没有 window / document / localStorage / setTimeout）的 vm 沙箱里能加载 → 开局 → 15 题 → 收工 → 落盘，结果与主 realm 逐字节一致 |

**结果（原样粘贴）**

```
 ok  答题流程基准 = index.html 里的 app.part2.js（17254 字节逐字节命中，part1 也一致）
 ok  ① 全认识 · 分组第 3 组（点分组格子开局，100 题走完）   [字段 7536 / 叶子 24149 / 99 题（队列走完）]
 ok  ② 全不认识 · 分组第 7 组（100 题走完）                [字段 7536 / 叶子 24149 / 99 题（队列走完）]
 ok  ③ 中等掌握 · 分组第 13 组（100 题走完）               [字段 7536 / 叶子 24149 / 99 题（队列走完）]
 ok  ④ 摸底检测 · 未达精度就中途收工（±150，答 24 题停）    [字段 1862 / 叶子 8108 / 24 题]
 ok  ⑤ 摸底检测 · 精度达标自动收工（±400，全认识）          [字段 3486 / 叶子 12269 / 45 题（probe-精度达标自动停测）]
 ok  ⑨ 摸底检测 · 精度达标但受「至少 20 题」地板约束（±1000）[... 19 题（probe-精度达标自动停测）]
 ok  ⑥ 全量检测 · 只答 12 题就收工（测「从第一个未测词开始」的轮转）[字段 962 / 叶子 60713 / 12 题]
 ok  ⑦ 错词重测（list，含跳过/撤销/改判/悄悄撤销）           [字段 1487 / 叶子 2576 / 18 题]
 ok  ⑧ 四选一模式 · 分组第 1 组（选对/选错混合，30 题）      [字段 2312 / 叶子 4502 / 30 题]
 ok  中途存档 → 冷启动恢复 → 答完：与一口气答完逐字节相同
 ok  归档快照 / 逐词对比 / 轮次 / 存档全部一致
 ok  autoNext 开/关两种情况下，两边的「要不要自动翻页」口径一致
 ok  返回弹窗三条路：保存并返回 / 放弃本次，状态与存档都与网页版一致
 ok  quiz.js：21 类禁用 API 命中 0 · Math.random 1 处（四选一选项） · 无 DOM/定时器/语音依赖
 ok  只有 wx 的沙箱里能开局/作答/收工/落盘，结果与主 realm 逐字节一致

== 八、汇总 ==
对比分组：15 组
断言：字段级 34310 条 / 叶子级 168786 条
差异：0 条

结论：全绿 —— 题序/分组/进度/收工判定/结算字段/存档 JSON 与网页版完全一致。
```

**这套测试抓得住差异吗（变异验证，三次都当场恢复）**

| 人为变异（改坏 quiz.js） | 测试反应 |
| --- | --- |
| `judge()` 里把「模糊」记成「认识」（`A.setSt(i, v===1?2:v)`） | **失败**：③ 2977 条、④ 259 条、⑥ 236 条、⑦ 68 条差异（① 全认识、⑤/⑧ 不涉及模糊，仍绿） |
| 分组队列 `gs[g].slice()` → `slice(0, len-1)` | **失败**：3534 条差异，第一条就是 `① :: 队列长度`，接着是 `队列逐词（题序）` / `队列尾 20 词[…]` |
| `probeReached` 的 `log.length < 20` → `< 10` | **第一次没抓到**：原有摸底场景在 n=10 时精度还不够，改动不可观测。**为此补了场景 ⑨（±1000）**，重跑后**失败**：⑨ 报 20 条差异（`第10题·下一题 · hasSession / log / counts.answered`） |
| 三次恢复后 | `Get-FileHash` 与变异前**完全相同**（SHA256 `F0FF993A…AC806`），重跑全绿 |

### 10.8 并发改动提示（重要）

做这一轮的过程中，**不是我**改的 `src/app.part1.js` 被别人改了一版（21:32，纯文案：`RANKS` 名称
「满仓/厚实/稳健/够花/吃紧/见底」→「卓越/优秀/良好/中等/偏弱/基础薄弱」、`levelText` 文案、首页标题），
`index.html` 也在 21:35 被重新构建。于是第 1 阶段生成的 `miniprogram/utils/engine.js`（20:29）落后于 src，
`parity.mjs` 一度因 `rankAt[].name/desc/next` 文案差异报了 1383 条（**只有文案，没有任何数值差异**）。

按第 8 节第 2 条的规矩处理：**没有在移植版上手改**，而是用文档化的生成器重放——

```bash
node miniprogram/tools/port-engine.mjs      # 只写 miniprogram/utils/engine.js
# 结果：19 insertions / 20 deletions，全是上面那些文案字符串，逻辑零变动
node miniprogram/test/parity.mjs            # 1302 断言 / 0 差异（恢复全绿）
node miniprogram/test/quiz-parity.mjs       # 34310 断言 / 0 差异
```

（顺带说明：§1 与 §5.1 里 `engine.js` 写的是第 1 阶段生成时的 51,180 B / 1,130 行，
重放后是 51,064 B / 1,052 行 —— 差的 116 字节就是上面这些文案字符串，gzip 与主包占比没有实质变化。）

`quiz-parity.mjs` 也为此加了防御：`app.part2.js` 必须逐字节命中（硬失败），`app.part1.js` 若已被改动则**只告警**，
并打印「首个差异在第几行、差多少字节」——因为被比的两边（`index.html` 与 `engine.js`）仍是同一版本，对比结论依然成立。

### 10.9 页面层还需要做什么（以及我判断的三个坑）

| # | 工作 | 说明 |
| --- | --- | --- |
| 1 | 小程序骨架 | `app.json`（3 页）、`project.config.json`、`app.wxss`（把 `src/app.css` 的 CSS 变量色板搬过来） |
| 2 | 三张页面 | 按 10.6 的接口说明直接写。答题页只有 4 个 setData 场景（题面 / 判分后 / 翻页后 / 收工） |
| 3 | 接线三件事 | `onChange → setData`、`onGo → navigateTo/redirectTo`、`auto.pending → 页面自己的 setTimeout` |
| 4 | 必做的用户提示 | `A.storageBroken`（写满/禁用）常驻横幅；`S.session` 存在时首页「继续检测」；`S.history` 的「上次结果」 |
| 5 | 真机验证 | ① 843 KB 词库 `require` 的首屏耗时；② `wx.setStorageSync` 单键 1 MB 上限——**本机实测**：全量作答 4,968 条 + 单轮归档快照 ≈ 58 KB，12 轮归档上限 ≈ +42 KB → 总量约 100 KB，安全；③ 报告页别把 182 格词汇地图一次 setData（分批或只渲染可视区） |
| 6 | 可以推迟 | 发音（`wx.createInnerAudioContext`）、例句（`sentences.json` 1.19 MB 不在主包）、自定义词书 UI（`bookIndices` 在 part8，未移植）、AI 诊断（要后端 + 域名白名单）、桌宠/动效 |

**三个坑**

1. **摸底模式的进度条不是题号比例**：`barPct` 在摸底模式下按「精度缺口」算，`st.n === 0` 时固定 2%。
   照网页版写就好，别改成 `pos/total`，否则和 `progressText` 对不上（这两个字段测试里是逐字节比的）。
2. **摸底永远不会授予 AI 额度**：网页版 `finishSession` 先把 `S.session = null` 再调
   `maybeGrantAiQuota('probe')`，而里面要求 `S.session.kind === 'probe'` → 恒 false。
   **移植版原样保留（没顺手修）**，两端存档里 `aiQuota.granted` 都是 0。页面层别指望摸底盘换额度；
   要修应先改 `src/app.part1.js` 再重放（第 8 节第 2 条）。
3. **切换 `settings.mode` 时网页版会调 `revertCurrent()`**（part3 设置页）：从四选一切回自评时，
   当前题已记的「选对/选错」会被悄悄撤掉，不改进度、也不重渲染。小程序页面切 mode 时要自己调 `q.revertCurrent()`
   （控制器已提供，语义与网页版一致）。

### 10.10 这一节没覆盖的（诚实清单）

- **真机 / 微信开发者工具没跑过**：本机无网络、无开发者工具，所有结论来自 Node + jsdom。
- **jsdom 里做了两处等效设置**（都写进测试注释，且对两边一视同仁）：
  ① 关闭自动跳转（`autoNext=false`，否则真定时器会在后续 await 里异步插进来、破坏 lockstep）；
  自动跳转本身单独用「`A.RUN.timer` ↔ `auto.pending`」验证。
  ② 模拟 `prefers-reduced-motion: reduce` —— 网页版 part1 的条形生长动画会先把 `.bar>i` 的 width 置 `0%`
  再逐帧长回去，同步读 DOM 会读到动画中间态（那是动画，不是进度语义）。
- **四选一的选项顺序依赖 `Math.random`**：测试用同种子 xorshift 给两边各喂一份，只验证「同种子 → 选项内容与顺序完全一致」。
- **未覆盖**：例句渲染（`SENTENCES` 未进小程序包）、发音、键盘快捷键（属视图）、自定义词书（part8 未移植）、AI 诊断面板、桌宠动效。
- **`view()` 在四选一模式下会懒建选项（唯一随机源）**，严格说不是纯函数；页面每次渲染调一次即可，别在循环里反复调。

---

## 11. 页面层（第 3 阶段：三张页面 + 冒烟测试）

本阶段由主会话（前端负责人）直接写，不是子代理产物。只新增文件，**没有改动 utils/ 下任何逻辑**。

### 11.1 新增文件

| 文件 | 说明 |
| --- | --- |
| `app.js` | 启动时注入 `onToast → wx.showToast`，并**预热词库**（`activePool()`），避免点「开始」时才建 7175 词的 FNV 序位表 |
| `app.json` | 三个页面 + 浅色导航栏（`#EDF0F6`）+ `lazyCodeLoading` |
| `app.wxss` | 全局设计令牌与通用类。**刻意去掉了网页版的毛玻璃(backdrop-filter)、feTurbulence 颗粒、多层 drop-shadow 合成** —— 小程序渲染层不支持或代价过高，改用纯色 + 单层阴影 |
| `project.config.json` | `appid` 目前是占位 `touristappid`，**必须换成你自己的 AppID**；`packOptions.ignore` 已排除 test/、tools/、本文件与 README，不计入上传包 |
| `sitemap.json` | 允许全部索引 |
| `pages/index/*` | 首页：余额卡（词汇量 + 95% 区间 + 两套口径 + 覆盖率）、快速摸底 / 全量检测 / 开始第 N+1 轮、46 个分组网格（带每组进度）、继续检测 |
| `pages/quiz/*` | 答题页：题面（词 + 音标 + 频段）、自评三键（不认识/模糊/认识）与四选一、改判、撤销、跳过、下一个、模式切换、退出弹窗（看报告/保存返回/放弃/继续） |
| `pages/report/*` | 报告页：等级卡（含"未达 95% 不给等级"的说明）、频段剖面 7 行、提升优先级 Top3、地基缺口、本轮明细、多轮对比四指标、复测未掌握词、开始新一轮 |
| `test/pages-smoke.mjs` | 页面层冒烟测试（Node + wx mock），12 项 |

### 11.2 与 §10.4 契约的对应

| 契约 | 实现 |
| --- | --- |
| 渲染只走 `onChange → setData` | `quiz.js` 页的 `applyState(st)` 是唯一入口 |
| 切页只走 `onGo` | `onGo('result')` → `redirectTo` 报告页；`'home'` → `reLaunch`；首页/报告页自建实例只为拿 `onGo('test')` 去 `navigateTo` |
| 自动跳转定时器归页面 | `applyState` 里 `clearTimeout` 后按 `st.auto.delay` 重排；`onHide`/`onUnload` 清掉 |
| 键盘快捷键不在控制器 | 小程序无键盘，**不实现**（触屏直接点三个按钮，等价路径） |
| 退出弹窗归页面 | `quitAsk` + 四个动作：`finish()` / `leave()` / `abandon()` / 关闭 |
| 断点续测 | 答题页 `onLoad` 里 `if (q.hasSession()) applyState(q.view())`；首页 `onShow` 读 `hasSession()` 显示「继续 →」 |
| 不跨题缓存 `view()` | 每次渲染都重新调 `view()`；四选一的选项是懒建的（唯一随机源），只在 `applyState` 里调一次 |
| 切 mode 要 `revertCurrent()` | `onToggleMode`：改 `eng.S.settings.mode` → `eng.save()` → `q.revertCurrent()` → **手动** `applyState(q.view())`（因为 revertCurrent 按网页版语义不触发 onChange） |

### 11.3 体积（实测）

主包合计（引擎 + 存储 + 词库 + 三张页面 + 配置）**962,402 B = 2MB 的 45.9%**。
其中页面层 12 个文件仅 35.2 KB。`test/`、`tools/`、`IMPORT-NOTES.md`、`README-MVP.md` 已在 `packOptions.ignore` 里，不进包。

### 11.4 三套测试（现在都能跑）

```bash
node miniprogram/test/parity.mjs        # 引擎：1302 断言 / 0 差异
node miniprogram/test/quiz-parity.mjs   # 答题流程：34310 断言 / 0 差异（真跑网页版对比）
node miniprogram/test/pages-smoke.mjs   # 页面层：12 项（Node + wx mock）
```

`pages-smoke.mjs` 覆盖：三个页面模块能否 `Page()` 成功；首页 `onShow` 是否填出余额/分组/题量；
「快速摸底」是否跳到答题页；**连续作答 244 题直到自动收工**并跳到报告页；报告页字段是否齐全（等级/频段/优先级/本轮明细）；
复测未掌握词能否起 `list` 会话；断点续测能否恢复；自评⇄四选一切换后是否真有 4 个选项；撤销/跳过/改判是否不炸。

**它测不到**：WXML/WXSS 的真实渲染与布局、真机性能、手感。这些必须真机验证。

### 11.5 又发现两个网页版遗留问题（与 §10.9 的三条合计五条，均未在移植版"顺手修"）

1. **摸底第 0 题就显示「已达标，可以结束了」**。`progressText` 的公式是
   `need = st.n ? … : 0`，无样本时 `need=0` → 文案落到"已达标"分支。网页版 `src/app.part2.js:304-308` 完全一样，所以这是**两边共有的原始 bug**，不是移植引入的。
   一句话修法（两边同时改才不破坏一致性）：
   ```js
   (st.n === 0 ? ' · 刚开始，先答几题' : (need > 0 ? ' · 还需约 ' + need + ' 词（目标 ±' + sess.target + '）' + eta(need) : ' · 已达标，可以结束了'))
   ```
2. **首页「全量检测」按钮**在网页版里 `data-target` 不被读取（§10.9 已记）；小程序首页是重新写的，按 `target:250` 显式传参，**不复现这个 bug**（全量检测按钮调的是 `start('all')`，走的是另一条路径）。

### 11.6 真机待确认（按优先级）

1. `appid` 换成真实 AppID 后能否编译通过；
2. 低端机上首屏耗时（`app.js` 已把词库解析与 `activePool()` 预热放到 onLaunch，若仍卡，改成 `wx.nextTick` + loading）；
3. `wx.setStorageSync` 单键 1MB 上限：**全量检测**会把 7175 词的 `S.status` 全部写进一个键，
   实测存档 JSON 体积需在真机上确认（超限时 storage 适配层会抛，引擎有 `storageBroken` 语义兜底，但会丢存档）；
4. 四选一模式下每次 `view()` 会懒建选项 → `setData` 体积小，正常；若出现卡顿，把选项缓存到页面 data 而不是每次重算。

