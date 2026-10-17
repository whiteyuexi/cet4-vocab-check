# 形象素材授权核对（2026-10-17 复核）

本文件记录"鲸鱼娘 / 蓝色大肥鱼"相关素材的授权现状，避免重复踩坑。
结论先行：**本项目当前使用的形象是合规的，不需要改动。**

---

## 一、本项目实际在用的素材

| 素材 | 位置 | 授权 | 合规性 |
|---|---|---|---|
| Live2D 模型 DS鲸鱼娘 | `assets/whale-girl/` | **CC BY-NC-SA 4.0** | ✅ 非商业使用允许，已署名三位作者 |
| 模型渲染色静态帧 | `assets/pet-frames/` | 同上（由该模型渲染） | ✅ 同上 |
| 本体原创 SVG 兜底形象 | `src/app.part5.js` | MIT（本项目自有） | ✅ |

CC BY-NC-SA 4.0 原文明确写着「**你可以：分享、改编**」，条件是署名、非商业、改编后以同一协议分发。
学生技能竞赛属非商业用途，页面已常驻署名，**符合条件**。

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

1. **不换素材。** 现有 Live2D（CC BY-NC-SA）+ 已署名 = 合规。
2. **不要从 Treap / whalechan 取图片**，那两个库的图没有授权。
3. 需要额外图片时，唯一授权明确的选择是 **Sutera-Diffusus 那套 MIT 立绘**
   （经 `1TRYOUT/dsh-whale-pixel-pet` 分发）。
4. 引用任何第三方素材，一律保留原作者署名。

## 五、已知的环境限制（记录备查）

- `E:\deepseekharness_project1` 的 NTFS ACL 只给 Administrators 与 SYSTEM 写权限，
  当前账号不可写 → 本项目实际工作目录为 `C:\Users\27295\cet4-vocab-check`
- `github.com:443` 与 `codeload.github.com` 直连超时，无法 `git clone`；
  `api.github.com` 与 `raw.githubusercontent.com` 可用，只能逐文件抓取
- GitHub API 未认证限流 60 次/小时，批量拉取会被 403
