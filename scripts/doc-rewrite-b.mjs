/* 技术文档 B 档改动：
   1) 删掉附录 D（评审常见问答表）——用户判断这条不需要
   2) 8.2 由「商业与社会价值」改写为「运营与商业模式」：以校内私有部署（B）为主，账号制（A）列为未来规划
   3) 社会价值独立成 8.3，其后章节顺延
   用法：node scripts/doc-rewrite-b.mjs [--dry]
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
  if (i < 0) { log.push('✗ 找不到起点：' + label); return; }
  const j = s.indexOf(endMarker, i);
  if (j < 0) { log.push('✗ 找不到终点：' + label); return; }
  s = s.slice(0, i) + replacement + s.slice(j);
  log.push('✓ ' + label);
}

/* 1) 附录 D 保留（用户判断需要留着），只改 8.2 */

/* 2) 8.2 重写 */
cut('<h3>8.2 商业与社会价值</h3>', '<h3>8.3 可改进的方向</h3>', [
  '<h3>8.2 运营与商业模式</h3>',
  '<p>交付形态以<b>校内私有部署</b>为主：把单文件放进学校内网，无需外网、数据不出校；',
  '个人版免费开放用于获客；账号制作为未来版本规划。销售路径走「教师自下而上」，而不是面向学生收费。</p>',

  '<h4>8.2.1 交付形态：B 为主，A 为规划</h4>',
  '<table>',
  '<tr><th style="width:150px">形态</th><th style="width:230px">内容</th><th>定位与理由</th></tr>',
  '<tr><td class="k"><b>B 校内私有部署</b>（主）</td><td>单文件部署到院系内网或机房，浏览器直接访问；不依赖外网</td>',
  '<td><b>主要收入来源</b>。学校的核心诉求是"数据不出校、可导出、可留档"，单文件形态天然满足；且无需服务器与运维，单人可交付</td></tr>',
  '<tr><td class="k">C 定制词书</td><td>按机构自有词表生成一版产物</td><td>补充收入，一次性交付，工作量可控</td></tr>',
  '<tr><td class="k">A 账号制 SaaS（规划）</td><td>统一账号、多端同步、教师看板</td>',
  '<td><b>未来版本</b>。需要后端、账号体系与持续运维，超出当前单人可承担的范围，因此只作为规划列出</td></tr>',
  '</table>',

  '<h4>8.2.2 客户与付费方</h4>',
  '<table>',
  '<tr><th style="width:110px">层</th><th style="width:170px">谁</th><th style="width:230px">需要什么</th><th>是否付费</th></tr>',
  '<tr><td class="k">学生</td><td>备考四六级的学生</td><td>快速知道自己的水平与补词方向</td><td>免费（获客入口，不产生边际成本）</td></tr>',
  '<tr><td class="k">教师</td><td>英语教师、教研室</td><td>一个班的摸底结果、分层名单、补词清单</td><td>使用方与推动方，通常不直接付费</td></tr>',
  '<tr><td class="k">院系</td><td>教务处 / 教研室</td><td>数据不出校、结果可导出、可留档</td><td><b>付费方</b></td></tr>',
  '</table>',

  '<h4>8.2.3 销售路径</h4>',
  '<p>采用教师自下而上的路径，而不是面向学生的订阅制：</p>',
  '<pre>教师自己用一次（免费）',
  '  → 一个班试一次，拿到班级报告',
  '  → 教研组认可「比发卷子快」',
  '  → 院系立项采购',
  '  → 私有部署 + 培训',
  '  → 下一学期续费</pre>',
  '<p>关键角色是<b>教师</b>：一位教师覆盖 2–4 个班，是天然的传播节点与内部推动者；',
  '销售成本主要是沟通时间，而非推广费用。计费方式按<b>班级（学期）</b>或<b>院系（年）</b>两种，',
  '私有部署为一次性费用加年度维护；定价锚点是替代方案的成本——教师手工统计一个年级的成绩需要数个晚上。</p>',

  '<h4>8.2.4 成本结构</h4>',
  '<table>',
  '<tr><th style="width:210px">项</th><th>金额</th></tr>',
  '<tr><td class="k">个人版托管（静态托管）</td><td>0</td></tr>',
  '<tr><td class="k">私有部署（校方内网）</td><td>0（无服务器、无数据库、无运维）</td></tr>',
  '<tr><td class="k">AI 调用</td><td>唯一可变成本：用户自带 Key 或检测换取的额度；服务端设有每设备与全站每日上限</td></tr>',
  '<tr><td class="k">人力</td><td>单人维护</td></tr>',
  '</table>',
  '<p>「单文件 + 无账号」这一技术选择直接决定了上面的成本结构：没有收入时产品也能长期存活，',
  '这是它区别于大多数校园 SaaS 的地方。试用反馈由结果页底部的两按钮卡片采集（只存本机、可导出 JSON），',
  '所以"有多少人觉得有用"是可核对的原始记录，而不是一句写在文档里的形容词。</p>',

  '<h4>8.2.5 明确不做的四件事</h4>',
  '<ul>',
  '<li><b>不卖课、不导流、不投放广告</b>——收入只来自交付形态本身，不来自学习者的焦虑。</li>',
  '<li><b>不做打卡、连续天数、焦虑推送</b>——与「不替用户制造压力」的主张冲突。</li>',
  '<li><b>不转售任何作答数据</b>——逐题作答不出本机，AI 只收到汇总字段。</li>',
  '<li><b>不做无依据的价格承诺</b>——计费方式写入文档，具体报价按院校规模单独核算。</li>',
  '</ul>',

  '<h3>8.3 社会价值</h3>',
  '<p><b>把「测得起」变成「测得准」。</b></p>',
  '<ul>',
  '<li><b>教育公平</b>：单文件、零依赖、断网可用——一台旧笔记本、一个没有稳定网络的机房也能完整使用；不需要账号，不采集身份信息。</li>',
  '<li><b>不让 AI 编数字</b>：词汇量差 500 词就是另一档，编一个数等于误导。本产品把测量锁死给统计，AI 只负责解释。</li>',
  '<li><b>隐私</b>：逐题作答不出本机，AI 只收到汇总数据（上行字段白名单），同机多人靠本机档案隔离。</li>',
  '</ul>',
  '<p class="small">落地节奏：先免费开放个人版积累真实使用记录；再与一所院校完成单班试点，形成可展示的班级报告；',
  '之后才谈院系采购。当前阶段尚无付费客户与正式访谈，8.4 节如实列出了这一约束。</p>',
  ''
].join('\n'), '重写 8.2（运营与商业模式）');

/* 3) 后续章节顺延 */
s = s.replace('<h3>8.3 可改进的方向</h3>', '<h3>8.4 可改进的方向与约束</h3>');
s = s.replace('<h3>8.4 长期展望</h3>', '<h3>8.5 长期展望</h3>');

/* 4) 8.4 里补一条约束：如实写明"尚无付费客户与访谈" */
const anchor = '<h3>8.4 可改进的方向与约束</h3>';
const idx = s.indexOf(anchor);
if (idx >= 0) {
  const pIdx = s.indexOf('<p', idx);
  const insert = '<p class="small"><b>约束说明</b>：本作品为学生单人项目，当前<b>尚无付费客户，也尚未开展正式教师访谈</b>；' +
    '上述销售路径与计费方式均为设计推演，未经市场验证。团队对公发票与售后能力有限，首单更可能以校内试点或学校挂靠的形式完成。</p>\n';
  if (pIdx > 0) { s = s.slice(0, pIdx) + insert + s.slice(pIdx); log.push('✓ 8.4 补约束说明'); }
  else { s = s.slice(0, idx + anchor.length) + '\n' + insert + s.slice(idx + anchor.length); log.push('✓ 8.4 补约束说明（无段落锚点）'); }
}

if (!dry) fs.writeFileSync(FILE, s);
console.log(log.join('\n'));
console.log(dry ? '\n（--dry 未写入）' : '\n已写入 ' + FILE);
