# 形象素材署名（必读）

本目录下的 Live2D 模型 **不是本项目的原创作品**，使用与分发必须遵守下述条件。

## 授权

**CC BY-NC-SA 4.0** — 署名 · 非商业性使用 · 相同方式共享
<https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh>

## 版权链

| 环节 | 作者 | 主页 |
|---|---|---|
| 角色形象原作（原创 OC「溟月」） | 上善无形 | <https://www.pixiv.net/users/62155430> |
| 加入 DeepSeek 元素的女仆鲸鱼娘二次设计 | ZipZipPipe | <https://www.pixiv.net/users/18604994> |
| 本模型（Live2D 绑定 / 动作 / 表情） | 氵六青 | <https://space.bilibili.com/11272072> |

## 你可以 / 你必须

- ✅ 分享、改编
- ❗ **署名**：必须标明上述三位作者，并说明是否做过修改
- ❗ **非商业**：不得用于商业用途
- ❗ **相同方式共享**：改编后的作品必须以同一协议分发

**商业使用需分别取得上述版权所有人的授权。**

## 本项目如何使用

- 模型仅用于本项目的界面展示，**未做任何修改**，原样分发（因此「相同方式共享」条款未触发；
  但署名与非商业条款依然有效）
- 页面右下角常驻署名，链接到本协议
- 离线单文件（`index.html`）**不含**这些素材，使用的是本项目原创的内联 SVG 形象；
  只有跑 `node server/index.mjs` 本地服务时才会加载本目录的 Live2D 模型

## 另一个运行时依赖

`../../vendor/live2dcubismcore.min.js` 是 **Live2D Cubism Core**，属于 Live2D Inc. 的
专有软件，不在上述 CC 协议范围内，其使用受
《[Live2D Proprietary Software 使用许可契约书](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_cn.html)》
约束。它不经 npm 分发，需从 Live2D 官方 CDN 获取，见 `scripts/fetch-live2d.mjs`。

## 素材来源

取自 npm 包 `dsh-pet-live2d@3.1.3` 的 `pets/ds-whale-girl/` 目录，该目录的 LICENSE 文件
已原样保留在 `LICENSE`。可用 `node scripts/fetch-live2d.mjs` 重新拉取。
