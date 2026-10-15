// build-data.js — 把四级、六级大纲词表 + 词书合并为 words.json（双词库）
// 输出词条结构：{ w: 单词, p: 音标, t: 释义, b: 词库位掩码(1=四级, 2=六级新增), x: 1 表示拓展派生词, ph: 短语 }
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const D = f => path.join(ROOT, 'data', f);
const OUT = path.join(ROOT, 'words.json');

const POS_MAP = { a: 'adj', adj: 'adj', ad: 'adv', adv: 'adv', n: 'n', v: 'v', vt: 'v', vi: 'v',
  prep: 'prep', conj: 'conj', pron: 'pron', art: 'art', num: 'num', int: 'int', aux: 'aux' };
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const normPos = text => text.replace(/(^|[；;，,\s]|&)(a|ad|adj|adv|n|v|vt|vi|prep|conj|pron|art|num|int|aux)\./g,
  (m, pre, tag) => pre + (POS_MAP[tag] || tag) + '.');
const cleanPhon = p => String(p || '').replace(/[\[\]]/g, '').replace(/∫/g, 'ʃ')
  .replace(/ә/g, 'ə').replace(/\s+/g, ' ').trim();   // 六级源文件用的是西里尔字母 ә

const TYPE_ALIAS = { vt: 'v', vi: 'v', v: 'v', n: 'n', adj: 'adj', a: 'adj', adv: 'adv', ad: 'adv',
  prep: 'prep', conj: 'conj', pron: 'pron', num: 'num', art: 'art', int: 'int', aux: 'aux', abbr: 'abbr' };
const TYPE_ORDER = ['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'num', 'art', 'int', 'aux', 'abbr'];
const SPLIT = /[；;，,、]/;
const cleanSeg = s => {
  s = s.replace(/^[a-zA-Z]+\.\s*/, '').replace(/…/g, ' ').replace(/[（(][^）)]*[）)]/g, ' ');
  s = s.replace(/^[\s的]+|[\s。.]+$/g, '').replace(/\s+/g, '');
  return /[（()）]/.test(s) ? '' : s.trim();
};
/* 把 {type, txt} 列表压成一行释义：按词性分组、每类最多 2 个义项、最多 3 类、跨词性去重 */
function meaningOf(e) {
  const groups = new Map();
  for (const en of e.entries) {
    const g = TYPE_ALIAS[en.type] || en.type || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(en.txt);
  }
  const ordered = [...groups.entries()].sort((a, b) => (b[1].length - a[1].length) || (TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0])));
  const parts = [];
  for (const [g, txts] of ordered.slice(0, 3)) {
    const segs = [];
    for (const txt of txts.slice().sort((a, b) => a.length - b.length)) {
      for (const rawSeg of txt.split(SPLIT)) {
        const s = cleanSeg(rawSeg);
        if (!s || s.length > 18 || segs.includes(s)) continue;
        segs.push(s);
      }
      if (segs.length >= 2) break;
    }
    if (segs.length) parts.push({ g, segs: segs.slice(0, 2) });
  }
  const used = {};
  const kept = [];
  for (const p of parts) {
    const s = p.segs.filter(x => !used[x]);
    s.forEach(x => { used[x] = 1; });
    if (s.length) kept.push((p.g ? p.g + '. ' : '') + s.join('；'));
  }
  return kept.join('；') || cleanSeg(norm(e.entries[0] && e.entries[0].txt)).slice(0, 50);
}

/* ================= 1. 四级大纲 ================= */
const PATCH4 = [
  { match: 'hundred [', w: 'hundred', ph: 'ˈhʌndrid', t: 'num.百，百个；n.许多' },
  { match: 'lightning [', w: 'lightning', ph: 'ˈlaitniŋ', t: 'n.闪电，闪电放电' },
  { match: 'oˈclock [', w: "o'clock", ph: 'əˈklɔk', t: 'adv.…点钟' },
  { match: 'okay [', w: 'okay', ph: 'əuˈkei', t: 'adj.&adv.对，好（缩作 OK）' },
  { match: 'soluble [', w: 'soluble', ph: 'ˈsɔljubl', t: 'adj.可溶的；可以解决的' },
  { match: 'systematic(al) [', w: 'systematic', ph: 'ˌsistiˈmætik', t: 'adj.有系统/计划的' },
  { match: 'toward(s) [', w: 'toward', ph: 'təˈwɔːd', t: 'prep.向；对于；接近' },
  { match: 'until [', w: 'until', ph: 'ʌnˈtil', t: 'prep.&conj.直到…为止' },
  { match: 'i.e. [', w: 'i.e.', ph: 'ˌaiˈiː', t: '(=that is) 那就是，即' },
  { match: 'e.g. [', w: 'e.g.', ph: 'ˌiːˈdʒiː', t: '(=for example) 例如' },
];
const PHON_REPAIR = { playground: 'ˈpleigraund', synthetic: 'sinˈθetik' };   // 源文件含损坏字符
const PHON_FIX = {
  'a': 'ə', 'a.m': 'ˌei ˈem', 'b.c.': 'ˌbiː ˈsiː', 'i': 'ai', 'living-room': 'ˈliviŋ ruːm',
  'p.m.': 'ˌpiː ˈem', 'secondly': 'ˈsekəndli', 'so-called': 'ˌsəu ˈkɔːld',
  'surprisingly': 'səˈpraiziŋli', 'well-known': 'ˌwel ˈnəun'
};

const core = new Map();          // key -> { w, p, t, b, x, ph? }
for (let line of fs.readFileSync(D('mahavivo_cet4.txt'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
  line = line.trim();
  if (!line || /^[A-Z]$/.test(line) || /四级大纲|共\s*\d+\s*词/.test(line)) continue;
  const patched = PATCH4.find(p => line.startsWith(p.match));
  if (patched) {
    const pk = patched.w.toLowerCase();
    if (!core.has(pk)) core.set(pk, { w: patched.w, p: patched.ph, t: patched.t, b: 1, x: 0 });
    continue;
  }
  let m = line.match(/^(.{1,40}?)\s*(?:\[([^\]]*)\])?\s*((?:[a-z]{1,4}\.)+.*)$/);
  let word, phon, rest;
  if (m && !/\s[a-z]{1,4}\.\s*$/.test(m[1])) { word = m[1].trim(); phon = cleanPhon(m[2]); rest = m[3].trim(); }
  else {
    const m2 = line.match(/^([A-Za-z][A-Za-z'\-\.]*(?:\s+[A-Za-z][A-Za-z'\-\.]+){0,2})\s*(?:\[([^\]]*)\])?\s*(.+)$/);
    if (!m2) { console.warn('CET4 SKIP:', line); continue; }
    word = m2[1].trim(); phon = cleanPhon(m2[2]); rest = m2[3].trim();
  }
  if (!/^[A-Za-z][A-Za-z'\-\.]*(?:\s+[A-Za-z][A-Za-z'\-\.]+)*$/.test(word)) { console.warn('CET4 SKIP(bad):', line); continue; }
  const t = normPos(rest).replace(/\s+/g, ' ').trim();
  const key = word.toLowerCase();
  if (/[\uE000-\uF8FF]/.test(phon)) phon = '';
  if (PHON_REPAIR[key]) phon = PHON_REPAIR[key];
  if (!phon && PHON_FIX[key]) phon = PHON_FIX[key];
  if (!core.has(key)) core.set(key, { w: word, p: phon, t, b: 1, x: 0 });
  else if (!core.get(key).p && phon) core.get(key).p = phon;
}
console.log('四级大纲核心词:', core.size);

/* ================= 2. 六级大纲（并集，含四级重叠部分） ================= */
// 六级源文件用的词性是 a. / ad.（不是 adj./adv.），且夹杂 "adj·" 这种错字
const POS_C6 = /(?:^|[\s/])(adj|adv|prep|conj|pron|num|art|int|aux|n|v|vt|vi|a|ad)\.\s*/g;
const POS_ANY = /(?:^|[\s/])(adj|adv|prep|conj|pron|num|art|int|aux|n|v|vt|vi|a|ad)\./;
function splitByPos(text) {
  const parts = []; let last = null, m;
  POS_C6.lastIndex = 0;
  while ((m = POS_C6.exec(text))) {
    if (last) parts.push({ type: last.type, txt: text.slice(last.end, m.index) });
    last = { type: m[1], end: POS_C6.lastIndex };
  }
  if (last) parts.push({ type: last.type, txt: text.slice(last.end) });
  return parts;
}
let c6new = 0, c6overlap = 0;
const c6Only = [];
for (let line of fs.readFileSync(D('mahavivo_cet6.txt'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
  line = line.trim();
  if (!line || /^[A-Z]$/.test(line)) continue;
  const wm = line.match(/^([A-Za-z][A-Za-z'\-.]*)\s+(.*)$/);
  if (!wm) { console.warn('CET6 SKIP:', line); continue; }
  const word = wm[1], key = word.toLowerCase();
  let rest = wm[2];
  // 修源文件里的两处错字写法
  rest = rest.replace(/adj·/g, 'adj. ').replace(/\bh·/g, 'n. ').replace(/·/g, '. ');
  let phon = '';
  const pm = rest.match(/\[([^\]]*)\]/);
  if (pm) { phon = cleanPhon(pm[1]); rest = rest.replace(/\[[^\]]*\]/g, ' '); }
  // 有些行音标没有方括号，形如 "arbitrary ˈɑːbɪtrərɪ /adj. ..."，把第一个词性之前的残留当作音标
  const firstPos = rest.search(POS_ANY);
  if (firstPos > 0) {
    const junk = rest.slice(0, firstPos).replace(/[/\[\]]/g, ' ').trim();
    if (!phon && junk && /[ˈˌ]/.test(junk)) phon = cleanPhon(junk);
    rest = rest.slice(firstPos);
  }
  let ph = null;
  const bar = rest.indexOf('||');
  if (bar >= 0) {
    const phTxt = norm(rest.slice(bar + 2));
    rest = rest.slice(0, bar);
    const phm = phTxt.match(/^([^\u4e00-\u9fa5]*?)\s*([\u4e00-\u9fa5].*)$/);
    if (phm && phm[1].trim() && phm[2].trim()) ph = { p: phm[1].replace(/[,，]$/, '').trim(), t: phm[2].slice(0, 24).trim() };
  }
  const entries = splitByPos(rest).map(p => ({
    type: p.type,
    txt: p.txt.split(/\s*\d+\.\s*/).map(x => norm(x)).filter(Boolean).join('；')
  })).filter(p => p.txt);
  const t = entries.length ? meaningOf({ entries }) : '';
  if (!t) { console.warn('CET6 无释义:', line.slice(0, 40)); continue; }
  if (core.has(key)) {
    const c = core.get(key);
    c.b |= 2;                                   // 同时属于四级与六级大纲
    if (!c.p && phon) c.p = phon;
    if (!c.ph && ph) c.ph = ph;
    c6overlap++;
  } else {
    core.set(key, { w: word, p: phon, t, b: 2, x: 0, ph: ph || undefined });
    c6new++; c6Only.push(word);
  }
}
console.log('六级大纲：新增', c6new, '词，与四级重叠', c6overlap, '词');

/* ================= 3. 词书补充派生词 ================= */
const VARIANTS = [
  [/^(.{3,})our$/, '$1or'], [/^(.{3,})or$/, '$1our'],
  [/^(.{3,})re$/, '$1er'], [/^(.{3,})er$/, '$1re'],
  [/^(.{5,})ogue$/, '$1og'], [/^(.{4,})og$/, '$1ogue'],
  [/^(.{3,})ise$/, '$1ize'], [/^(.{3,})ize$/, '$1ise'],
  [/^(.{4,})ll(ing|ed|s)?$/, '$1l$2'], [/^(.{4,})l(ing|ed|s)?$/, '$1ll$2'],
  [/^(.{4,})yse$/, '$1yze'], [/^(.{4,})yze$/, '$1yse'],
  [/^(.{3,})llous$/, '$1lous'], [/^(.{3,})lous$/, '$1llous'],
  [/^(.{3,})elling$/, '$1eling'], [/^(.{3,})eling$/, '$1elling']
];
const NONSTANDARD = ['accessary', 'adviser', 'enquiry', 'ensure'];
const BOOK_SKIP = ['cigaret'];
const BOOK_RENAME = { reservior: 'reservoir' };
const variantsOf = k => { const s = new Set(); for (const [re, rep] of VARIANTS) if (re.test(k)) s.add(k.replace(re, rep)); return s; };

function loadBook(file) {
  const raw = JSON.parse(fs.readFileSync(D(file), 'utf8'));
  const m = new Map();
  for (const o of raw) {
    const w = norm(o.word); if (!w) continue;
    const key = w.toLowerCase();
    if (!m.has(key)) m.set(key, { word: w, entries: [], phrases: [] });
    const e = m.get(key);
    for (const t of (o.translations || [])) { const txt = norm(t.translation); if (txt) e.entries.push({ type: norm(t.type).replace(/\.$/, '').toLowerCase(), txt }); }
    for (const ph of (o.phrases || [])) {
      const p = norm(ph.phrase), pt = norm(ph.translation);
      if (p && pt && !e.phrases.some(z => z.p.toLowerCase() === p.toLowerCase())) e.phrases.push({ p, t: pt });
    }
  }
  return m;
}
function mergeBook(file, bankBit) {
  const book = loadBook(file);
  let added = 0; const dropped = [];
  for (const [key, e] of book) {
    if (core.has(key)) {
      const c = core.get(key);
      // 只有"词书补进来的派生词"才需要合并词库归属；
      // 大纲词条已经归好类，不能再被词书的收录范围改写（否则六级词会被算进四级）
      if (c.x) c.b |= bankBit;
      if (!c.ph) { const ph = e.phrases[0]; if (ph) c.ph = { p: ph.p, t: ph.t.length > 24 ? ph.t.slice(0, 24) : ph.t }; }
      continue;
    }
    if (NONSTANDARD.indexOf(key) >= 0) {
      const alt = key.replace(/ary$/, 'ory').replace(/iser$/, 'isor');
      if (core.has(alt)) continue;
    }
    let isVariant = false;
    for (const v of variantsOf(key)) {
      if (core.has(v)) { isVariant = true; dropped.push(key + '≈' + v); break; }
      for (const x of variantsOf(v)) if (core.has(x)) { isVariant = true; dropped.push(key + '≈' + x); break; }
      if (isVariant) break;
    }
    if (isVariant || BOOK_SKIP.indexOf(key) >= 0) continue;
    const t = meaningOf(e);
    if (!t) continue;
    const w = { w: BOOK_RENAME[key] || e.word, p: '', t, b: bankBit, x: 1 };
    if (e.phrases.length) { const ph = e.phrases[0]; w.ph = { p: ph.p, t: ph.t.length > 24 ? ph.t.slice(0, 24) : ph.t }; }
    core.set(key, w);
    added++;
  }
  return { added, dropped };
}
const r4 = mergeBook('kylebing_cet4.json', 1);
const r6 = mergeBook('kylebing_cet6.json', 2);
console.log('词书补充：四级', r4.added, '六级', r6.added, '| 英美变体剔除', r4.dropped.length + r6.dropped.length);

/* ================= 4. 补齐音标（ipa-dict） ================= */
const IPA_MANUAL = {
  gaol: 'dʒeil', groundlessly: 'ˈgraundləsli', impermanency: 'imˈpəːmənənsi',
  reframe: 'ˌriːˈfreim', systematical: 'ˌsistəˈmætikəl',
  preindustrial: 'ˌpriːinˈdʌstriəl', immersive: 'iˈməːsiv', proximately: 'ˈprɒksimətli',
  workpiece: 'ˈwəːkpiːs', offence: 'əˈfens'
};
function loadIpa(file) {
  const m = new Map();
  let txt = '';
  try { txt = fs.readFileSync(D(file), 'utf8'); } catch (e) { console.warn('未找到音标词典:', file); return m; }
  for (const line of txt.split('\n')) {
    const i = line.indexOf('\t');
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).split(',')[0].trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (k && v && !m.has(k)) m.set(k, v);
  }
  return m;
}
const ipaUK = loadIpa('ipa_en_UK.txt'), ipaUS = loadIpa('ipa_en_US.txt');
const normIpa = s => String(s).replace(/ɹ/g, 'r').replace(/ɫ/g, 'l').replace(/ɐ/g, 'ə').replace(/ɡ/g, 'g').replace(/\s+/g, ' ').trim();
let ipaFilled = 0;
for (const w of core.values()) {
  if (w.p) continue;
  const k = w.w.toLowerCase();
  if (IPA_MANUAL[k]) { w.p = IPA_MANUAL[k]; ipaFilled++; continue; }
  const v = ipaUK.get(k) || ipaUS.get(k);
  if (v) { w.p = normIpa(v); ipaFilled++; }
}
const noPhon = [...core.values()].filter(w => !w.p);
console.log('补齐音标:', ipaFilled, '| 仍无音标:', noPhon.length, noPhon.map(w => w.w).join(', '));

/* ================= 5. 词频分段（分层抽样 + 频段剖面的基础） ================= */
const freqRank = new Map();
{
  let txt = '';
  try { txt = fs.readFileSync(D('freq_20k.txt'), 'utf8'); } catch (e) { console.warn('未找到词频表'); }
  txt.split(/\r?\n/).forEach((l, i) => {
    const w = l.trim().toLowerCase();
    if (w && !freqRank.has(w)) freqRank.set(w, i + 1);
  });
}
const BAND_EDGES = [1000, 2000, 3000, 5000, 10000, 20000];
const BAND_NAMES = ['未收录', '最高频 1k', '1k-2k', '2k-3k', '3k-5k', '5k-10k', '10k-20k'];
function bandOf(rank) {
  if (!rank) return 0;
  for (let i = 0; i < BAND_EDGES.length; i++) if (rank <= BAND_EDGES[i]) return i + 1;
  return 0;
}
let banded = 0;
for (const w of core.values()) {
  const r = freqRank.get(w.w.toLowerCase());
  w.f = bandOf(r);
  if (w.f) banded++;
}
console.log('词频分段：有频段', banded, '/', core.size, '| 各段词数',
  BAND_NAMES.map((n, i) => n + '=' + [...core.values()].filter(w => w.f === i).length).join(' '));

/* ================= 6. 输出 ================= */
const words = [...core.values()].map(w => {
  const o = { w: w.w, p: w.p || '', t: w.t, b: w.b, f: w.f || 0 };
  if (w.x) o.x = 1;
  if (w.ph) o.ph = w.ph;
  return o;
}).sort((a, b) => a.w.toLowerCase().localeCompare(b.w.toLowerCase()));
fs.writeFileSync(OUT, JSON.stringify(words));

const bank = bit => words.filter(w => w.b & bit);
const core4 = bank(1).filter(w => !w.x), core6 = bank(2).filter(w => !w.x);
console.log('--- 汇总 ---');
console.log('总词条:', words.length, '| 含音标:', words.filter(w => w.p).length);
console.log('四级核心:', core4.length, '| 六级新增核心:', core6.length, '| 六级全量核心(∪):', core4.length + core6.length);
console.log('四级拓展:', bank(1).filter(w => w.x).length, '| 六级拓展:', bank(2).filter(w => w.x).length);
console.log('words.json:', (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB');
console.log('六级新增样例:', c6Only.slice(0, 12).join(', '));
for (const k of ['abolish', 'abortion', 'abrupt', 'adhere', 'aesthetic']) {
  const f = words.find(w => w.w.toLowerCase() === k);
  if (f) console.log('  ', JSON.stringify(f));
}
