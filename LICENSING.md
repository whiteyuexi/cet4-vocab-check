# 形象素材授权核对（2026-10-17 复核）

本文件记录"鲸鱼娘 / 蓝色大肥鱼"相关素材的授权现状，避免重复踩坑。
结论先行：**页面现在只使用 MIT 立绘，授权链最简单，不需要改动。**

---

## 一、本项目实际在用的素材

| 素材 | 位置 | 授权 | 合规性 |
|---|---|---|---|
| 鲸鱼娘全身立绘 93 张（512×512 透明底） | `assets/whale-art/` | **MIT**（Sutera-Diffusus） | ✅ 已署名，可商用、可改编 |
| 内联待机立绘（构建时转 base64） | `build.js` → `window.PET_ART` | 同上 | ✅ 同上 |
| 单文件产物 `index.html` | 根目录 | 仅含上述 MIT 素材 | ✅ **不再包含任何 CC BY-NC-SA 内容** |

### 已停止使用（素材仍在仓里，但页面不再加载）

| 素材 | 位置 | 授权 | 现状 |
|---|---|---|---|
| Live2D 模型 DS鲸鱼娘 | `assets/whale-girl/` | CC BY-NC-SA 4.0 | 2026-10-17 起桌宠改用立绘，页面不再 fetch 这个模型 |
| 模型渲染静态帧 | `assets/pet-frames/` | 同上（由该模型渲染） | `build.js` 不再引用 |
| Live2D 运行时 | `vendor/live2d-*.js` | Cubism SDK 授权 | 页面不再加载 |
| 手绘 SVG 兜底形象 | 原 `src/app.part5.js` | 本项目自有 | 已删除（用户否决过这个画风） |

> 换掉 Live2D 的直接原因是**模型里没有下半身**：拉全身只会露出书桌，
> 收窄又像贴纸，做不出 2.5D 需要的"站在地上"。详见 `NEXT.md` §三。


## 二、社区资产库的真实授权状况

### TreapGoGo/deepseek-whale-girl（鲸鱼娘开源资产库）

**MIT 徽章只覆盖代码，不覆盖图片。** README「代码、内容与素材许可」三分：

| 内容 | 授权 |
|---|---|
| 网站源代码 | MIT |
| 原创说明文字与生成提示词 | CC BY-SA 4.0（可商用，衍生须同协议） |
| 角色设定图 / 社区投稿 / 外部素材 | **不在任何许可内**，逐张遵循原作者授权 |

`site/assets/gallery/manifest.json` 里每件作品只有 author / source / issueUrl，
**没有 license 字段** —— 署名可查、授权未给，默认等同保留所有权利。

### Neko3000/deepseek-whalechan（深求 鲸鱼娘）

同样收窄了 MIT 的适用范围：

| 内容 | 授权 |
|---|---|
| `skills/*/scripts/`、`skills/*/tests/` 代码 | MIT（可商用） |
| README 文本 / SKILL.md / 提示词模板 / 元数据 | CC BY-NC-SA 4.0（**禁止商用**） |
| 参考图、README 配图、输入截图 | 不在授权内 |

`THIRD-PARTY-NOTICES.md` 明确：*"Attribution alone does not authorize copying,
redistribution, modification, or submission to an image-generation service."*
Issue #3 中作者本人同意了 DSH 集成与 15 张 WebP 的再分发，但**不覆盖第三方原作者的权利**。

### 1TRYOUT/dsh-whale-pixel-pet（本项目曾考虑采用）

这一份是例外：代码 MIT，且**角色立绘明确标注为第三方 MIT 资源**
（来源 Sutera-Diffusus/dsh-whale-musume，92 张 512×512 透明 webp），
`THIRD-PARTY.md` 给出了署名与授权全文。**这是目前找到的唯一图片授权明确的第三方素材。**

## 三、角色 IP 归属

核心设定与二创素材来源：**ZipZipPipe**（space.bilibili.com/4168597）与
**上善无形**（space.bilibili.com/4456176），版权归原作者。

- 非商业二创：受鼓励
- 商业化出图 / 出版 / 周边：须取得版权与品牌方授权
- 引用时建议标注 **DeepSeek Whale-chan**，并保留原作者署名
- 两个仓库均声明不授予商标权、不暗示 DeepSeek 官方背书

> TreapGoGo 的 FAQ 自述「就本项目目前掌握的信息，深度求索公司并未持有鲸鱼娘形象的版权」——
> 这是维护者观点，不是法律结论，仅供参考。

## 四、结论

1. **主程序只用 MIT 立绘。** 单文件产物 `index.html` 里已经没有 CC BY-NC-SA 内容，
   交付授权链最简单。署名不放在桌宠上面（用户要求去掉那行），
   而是保留在应用内「**设置 → 素材来源**」：`DS鲸鱼娘 · Sutera-Diffusus · MIT` + 仓库链接。
2. **不要从 Treap / whalechan 取图片**，那两个库的图没有授权。
3. Live2D 模型仍留在仓里备查，但页面不再加载。若要彻底清掉 CC BY-NC-SA 痕迹，
   可以删 `assets/whale-girl/`、`assets/pet-frames/`、`vendor/live2d-*.js`、
   `scripts/render-pet-frames.mjs` 与 `scripts/fetch-live2d.mjs`。
4. 引用任何第三方素材，一律保留原作者署名。

## 五、已知的环境限制（记录备查）

- `E:\deepseekharness_project1` 的 NTFS ACL 只给 Administrators 与 SYSTEM 写权限，
  当前账号不可写 → 本项目实际工作目录为 `C:\Users\27295\cet4-vocab-check`
- `github.com:443` 与 `codeload.github.com` 直连超时，无法 `git clone`；
  `api.github.com` 与 `raw.githubusercontent.com` 可用，只能逐文件抓取
- GitHub API 未认证限流 60 次/小时，批量拉取会被 403
