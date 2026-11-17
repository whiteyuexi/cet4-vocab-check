/* 技术文档 A 档改写：只换语气，不动结构与事实。
   目标：把"对读者说话"改成"对评审陈述"——第二人称改指用户、宣言腔改问题定义、删掉讲比赛规则的 0 章。
   用法：node scripts/doc-rewrite-a.mjs [--dry]
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'docs', '技术文档.html');
let s = fs.readFileSync(FILE, 'utf8');
const dry = process.argv.includes('--dry');
const log = [];

function cut(startMarker, endMarker, replacement, label) {
  const i = s.indexOf(startMarker);
  if (i < 0) { log.push('✗ 未找到起点：' + label); return; }
  const j = s.indexOf(endMarker, i);
  if (j < 0) { log.push('✗ 未找到终点：' + label); return; }
  s = s.slice(0, i) + replacement + s.slice(j);
  log.push('✓ ' + label);
}

/* 1) 删掉「0 提交要求对照」整章 —— 这是在讲比赛规则，不是技术内容 */
cut('<h2 id="creq">0 提交要求对照</h2>', '<h2 id="c1">1 项目概述</h2>',
  '<h2 id="c1">1 项目概述</h2>', '删除 0 章');

/* 2) 1.1：宣言腔 → 问题定义 */
cut('<h3>1.1 我们反对什么</h3>', '<h3>1.2', [
  '<h3>1.1 问题定义</h3>',
  '<p>当前市面上以「AI 测词汇量」为卖点的工具，多数采用「把用户描述交给大模型、由模型给出一个数字」的做法。',
  '该做法在测量上存在三个缺陷：</p>',
  '<ul>',
  '<li><b>数字缺乏依据。</b>模型无法从自然语言描述中推断词汇量，输出的是看似合理的估计值。',
  '而词汇量相差 500 词即对应不同等级，估计偏差会直接改变结论。</li>',
  '<li><b>缺少误差范围。</b>没有区间的测量结果，无法判断「两周提升 200 词」是真实进步还是抽样波动。</li>',
  '<li><b>只给结论，不给路径。</b>仅告知缺口词数，不回答「先补哪一段、每天多少词、需要几天」。</li>',
  '</ul>',
  '<p>前两项属于<b>测量问题</b>，第三项属于<b>教学问题</b>。本作品将两者分离：测量由统计方法完成，',
  '解释与教学建议由大模型完成。</p>',
  ''
].join('\n'), '重写 1.1');

/* 3) 1.2：口号式标题 → 设计主张（表内文案同步去第二人称） */
cut('<h3>1.2 一句话主张</h3>', '<h3>1.3', [
  '<h3>1.2 设计主张</h3>',
  '<p><b>测量结果不由语言模型生成。</b></p>',
  '<p>该主张落实为一条硬约束：统计负责数字，模型负责解释。三个环节的分工如下：</p>',
  '<table>',
  '<tr><th style="width:110px">环节</th><th style="width:270px">由谁完成</th><th>这样分工的原因</th></tr>',
  '<tr><td class="k">测量</td><td>分层随机抽样 + Agresti-Coull 区间 + 覆盖率门禁</td><td>数字必须可复算、可证伪，不能由模型生成</td></tr>',
  '<tr><td class="k">解释</td><td>大模型，只通过工具读取数据，不产出任何数字</td><td>把「缺口 1200 词」翻译成「先补哪一段、每天几个、几天补完」</td></tr>',
  '<tr><td class="k">教学</td><td>确定性出题（语料挖空、同频段干扰项）+ AI 点评</td><td>判分不依赖模型，断网也可练习；模型只分析错题模式</td></tr>',
  '</table>',
  '<p>由此得到三项可验证的承诺，验证方式见 1.4 节：<b>每个数字都带 95% 区间</b>；',
  '<b>每条结论都可追溯到数据来源</b>；<b>断网后核心功能完整可用</b>。</p>',
  ''
].join('\n'), '重写 1.2');

/* 4) 附录 D：问答体 → 设计取舍表 */
cut('<h3>附录 D　答辩常见追问</h3>', '</table>', [
  '<h3>附录 D　设计取舍与常见疑问</h3>',
  '<p class="small">下表列出评审过程中最容易被追问的七处设计决策，以及对应的取舍依据。</p>',
  '<table>',
  '<tr><th style="width:180px">问题</th><th>回应</th></tr>',
  '<tr><td class="k">产品定位是背单词工具吗</td><td>不是。作品只做测量与诊断：给出带区间的词汇量与补词清单，不替代单词记忆类工具。</td></tr>',
  '<tr><td class="k">数字凭什么可信</td><td>误差与置信区间直接标在数字旁：分层随机抽样 + 有限总体修正 + 蒙对校正 + 严格/折中双口径；抽样与估计部分由 201 条断言守护。</td></tr>',
  '<tr><td class="k">AI 在系统中承担什么</td><td>只承担解释与规划。所有数字来自 9 个工具的返回值，模型不参与计算；数据不足时输出「无法给出结论」。</td></tr>',
  '<tr><td class="k">为什么不用向量检索</td><td>检索对象是「某个词的例句」，键即词本身；向量方案需引入数十 MB 权重，会破坏单文件交付与断网可用。</td></tr>',
  '<tr><td class="k">断网是否可用</td><td>可用。单文件双击即开，答题、进度、报告与本地规则诊断均在离线状态下完整运行。</td></tr>',
  '<tr><td class="k">为什么同时提供小程序</td><td>同一套引擎的另一种交付形态：主包 1.56 MB，与网页版逐字段一致（1,302 + 34,310 条一致性断言）。</td></tr>',
  '<tr><td class="k">商业化路径如何设计</td><td>不卖课、不导流、不投放广告；AI 消耗用户自带的 Key 或通过完成检测换取的额度，成本可核算。</td></tr>',
  '</table>',
  ''
].join('\n'), '重写附录 D');

/* 5) 其余第二人称：一律改指「用户」 */
const swaps = [
  ['把「你缺 1200 词」翻译成', '把「缺口 1200 词」翻译成'],
  ['告诉你「你缺 1200 词」，然后呢？', '仅告知「缺 1200 词」，不回答下一步怎么做。'],
  ['模型对「你有多少词」没有任何依据', '模型对「用户有多少词」没有任何依据']
];
for (const [from, to] of swaps) {
  if (s.includes(from)) { s = s.replace(from, to); log.push('✓ 改写：' + from.slice(0, 18)); }
}

/* 6) A/B 实验的说明：保留事实，去掉"向评审解释处境"的口吻 */
const abOld = s.indexOf('<p><b>如实说明</b>');
if (abOld >= 0) {
  const abEnd = s.indexOf('</p>', abOld) + 4;
  s = s.slice(0, abOld) +
    '<p><b>当前状态</b>：本机可用的两个 API Key 均已失效（接口返回 401），因此上表 A/B 结果尚未产出。' +
    '脚本在 Key 不可用时会直接报错退出，不生成占位数据；Key 恢复后按上述命令即可复现。</p>' +
    s.slice(abEnd);
  log.push('✓ 改写 A/B 状态说明');
}

if (!dry) fs.writeFileSync(FILE, s);
console.log(log.join('\n'));
console.log(dry ? '\n（--dry 未写入）' : '\n已写入 ' + FILE);
