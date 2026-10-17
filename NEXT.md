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
- 桌宠：可拖动、重力落地、自动溜达、视线跟踪、透视倾斜、动态投影
- 测试：冒烟 100/100、浏览器 26/26、桌宠行为 10/10

## 三、正在做、还没定的事

**桌宠形象方向**。上一轮做了 2.5D 原型（`scripts/pet25d.html`，截图在桌面 `2.5D原型.png`）：
全身立绘 + 接地投影 + 柔光 + 鼠标透视倾斜。用户认可这个概念，但要先选素材：

| 方案 | 画风 | 授权 | 状态数 |
|---|---|---|---|
| **A. MIT 立绘**（`assets/whale-art/`，92 张） | Sutera-Diffusus 版 | MIT 干净 | 92 |
| **B. 现有 Live2D**（`assets/whale-girl/`） | 用户认识的那一版 | CC BY-NC-SA | 靠表情组合 |

**用户倾向 B**（画风是他认识的那版），但 B 取景拉全身会带出桌子。下一步就是试 B 的全身取景。

## 四、绝对不要再试的路（都试过并失败了）

1. **手绘 SVG 形象** —— 画了四版，用户评价"怎么长这样"，放弃
2. **three.js 手搓 3D** —— 能做出"可爱潮玩"，做不出精细动漫画风，用户否决，代码已删
3. **收紧取景裁掉桌面道具** —— 越裁越像贴纸，用户说"还不如最初版本"，已回滚
4. **关掉模型道具参数** —— `baleite/bi/pi/chehui` 这些不是标准模型参数，
   `getParameterValueById` 一律返回 null，改不动，只能靠取景

## 五、关键文件

```
index.html              单文件成品
src/app.part1.js        词库/分层抽样/首页/分组/动效层
src/app.part2.js        答题引擎
src/app.part3.js        报告/总览/设置/事件
src/app.part4.js        AI 面板 + token 计量
src/app.part5.js        桌宠（位置/拖动/重力/视线/透视/话术）
src/app.css             设计令牌与全部样式
build.js                打包（不写时间戳，保证可复现）
assets/whale-girl/      Live2D 模型（CC BY-NC-SA，见 ATTRIBUTION.md）
assets/pet-frames/      模型渲染的静态帧（离线版用）
assets/whale-art/       92 张 MIT 立绘（gitignore，用 npm run art:fetch 拉）
scripts/pet25d.html     2.5D 原型
LICENSING.md            素材授权核对（重要）
```

## 六、跑起来

```bash
npm run server     # 启动本地服务 http://127.0.0.1:8787（Live2D 需要）
npm run build      # 打包 index.html
npm test           # 冒烟测试 100 项
npm run test:browser   # 真实浏览器 26 项
npm run test:pet       # 桌宠行为 10 项
```

## 七、两个环境坑

- 截图别用 `--virtual-time-budget`，会和 Live2D 的 blob Worker 死锁；用 `scripts/cdp-shot.mjs`（DevTools 协议）
- `headless Chrome` 视口宽度有最小值（约 500px），小窗口截图会被截掉右边

## 八、还缺的交付物

- [ ] 演示视频（5–8 分钟 1080P）—— 只能用户自己录，用 `http://127.0.0.1:8787`
- [ ] README 团队成员信息 —— **只有用户能提供，一直空着**
- [ ] 未推送提交
