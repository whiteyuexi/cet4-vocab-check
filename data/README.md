# data/ 数据来源与授权说明

本目录存放构建词库所需的**第三方原始数据**。它们**不进入 Git 仓库**，原因有二：

1. 体积：合计约 13 MB，而处理后的词库 `words.json` 只有 0.8 MB；
2. 授权：各来源许可不同，统一提交到公开仓库并不合适。

任何人克隆本仓库后，执行下面任一命令即可按**固定 commit SHA** 拉取到完全一致的数据：

```bash
node scripts/fetch-data.mjs   # 只拉数据
npm run data                  # 拉数据 + 重新构建 words.json
```

## 来源清单

| 文件 | 来源仓库 | 版本(commit) | 用途 | 授权 |
| --- | --- | --- | --- | --- |
| `mahavivo_cet4.txt` | [mahavivo/english-wordlists](https://github.com/mahavivo/english-wordlists) | `f2f9fd5` | 四级大纲词表（含音标） | ⚠️ 仓库未声明 license |
| `mahavivo_cet6.txt` | 同上 | `b2031911` | 六级大纲词表（含音标） | ⚠️ 同上 |
| `kylebing_cet4.json` | [KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary) | `81f04585` | 四级词书，补充派生词与短语 | BSD-3-Clause |
| `kylebing_cet6.json` | 同上 | `b8d6fd3b` | 六级词书，补充派生词与短语 | BSD-3-Clause |
| `ipa_en_UK.txt` | [open-dict-data/ipa-dict](https://github.com/open-dict-data/ipa-dict) | `f33a9d08` | 英式音标补齐 | MIT |
| `ipa_en_US.txt` | 同上 | `f7cdfe30` | 美式音标补齐 | MIT |
| `freq_20k.txt` | [first20hours/google-10000-english](https://github.com/first20hours/google-10000-english) | `11432858` | 2 万词频表，用于频段分层抽样 | NOASSERTION |

## 例句语料（Tatoeba）

例句来自 [Tatoeba](https://tatoeba.org) 的英中对照语料，同样**不随仓库分发**，用下面的方式重新生成：

```bash
# 1. 下载三个文件到临时目录（约 26 MB）
#    eng-cmn_links.tsv.bz2  英中对照关系
#    cmn_sentences.tsv.bz2  中文句子
#    eng_sentences.tsv.bz2  英文句子
#    https://downloads.tatoeba.org/exports/per_language/{eng,cmn}/
# 2. 解压（这些是压缩的纯文本，不是 tar 包，需要 bzip2）
py scripts/bz2-extract.py <输入.tsv.bz2> <输出.tsv>
# 3. 索引
node build-corpus.js
```

产物 `sentences.json` 覆盖 5138 个词、共 9204 条例句，构建时每个词内联 1 条到产物中。

| 文件 | 授权 |
| --- | --- |
| Tatoeba 句子数据 | CC-BY 2.0 FR（需署名） |

> 界面上每条例句下方都标注了「例句来源：Tatoeba」，符合署名要求。

## 关于授权的说明（务必阅读）

- **ipa-dict**（MIT）与 **KyleBing/english-vocabulary**（BSD-3-Clause）为宽松许可，可自由使用，本项目已在 README 与本文档中标注来源。
- **mahavivo/english-wordlists 未声明任何 license**。按默认版权规则，未声明即"保留所有权利"。本项目**以「按需拉取、不随仓库分发」的方式使用**，并在此明确标注来源与作者；若你打算将本项目用于商业用途或再分发词库内容，请先联系原作者取得授权。
- **google-10000-english** 的许可状态为 NOASSERTION（未明确）。本项目仅使用其**词序**（第 N 个词作为频段依据），不复制其说明文档。
- 本项目自身代码以 **MIT** 许可发布（见仓库根目录 `LICENSE`）——该许可**不覆盖**上述第三方数据。

## 对外分发时的建议

如果要把成品（`index.html`）发给别人使用，词库内容会随文件一起分发。此时的合规做法是：

1. 在页面或随附说明中保留数据来源与授权信息；
2. 不要移除词条来源标注；
3. 商业用途请先解决 mahavivo 来源的授权问题。