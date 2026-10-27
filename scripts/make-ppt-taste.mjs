// scripts/make-ppt-taste.mjs — 风格试片：同一段内容、五种视觉语言，各一页
// 目的：让用户在"做完整套之前"先挑风格，避免做完 14 页才发现审美不对路。
// 产出：桌面/PPT-风格试片.pptx（5 页），配合 WPS COM 导出 PNG 即可逐张比对。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';

const OUT = process.argv[2] || path.join(os.homedir(), 'Desktop', 'PPT-风格试片.pptx');
const W = 13.333, H = 7.5, M = 0.9;

// 同一套内容，五种画法
const CONTENT = {
  kicker: '筑视界 · 码绘交互 ／ Web 前端开发创意技能大赛',
  title: '测准，然后告诉你该背哪些词',
  sub: '词汇账户余额查询 —— 一台词汇量测量仪，不是一个背单词 App',
  points: [
    ['带误差的词汇量', '给出 95% 区间与两套口径，而不是一个孤零零的数字'],
    ['落到频段的诊断', '7 个词频段掌握率，按「缺口 × 词频权重」排优先级'],
    ['可带走的补词单', '具体到词、每天多少、几天后复测、什么算过线'],
  ],
  stats: [['7,175', '词条'], ['9,204', '例句'], ['387', '断言'], ['2.08 MB', '单文件']],
};

const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'T', width: W, height: H });
pptx.layout = 'T';
pptx.title = 'PPT 风格试片';

/* ============ A. 瑞士极简：白底、巨型字、细线、单一强调色 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };
  s.addText(CONTENT.kicker, { x: M, y: 0.62, w: 9, h: 0.3, fontFace: '微软雅黑', fontSize: 10.5, color: '8A8A8A', charSpacing: 2 });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 1.24, w: 11.4, h: 0.02, fill: { color: '111111' } });
  s.addText(CONTENT.title, { x: M, y: 1.5, w: 11.4, h: 1.5, fontFace: '微软雅黑', fontSize: 54, bold: true, color: '0A0A0A', charSpacing: -1 });
  s.addText(CONTENT.sub, { x: M, y: 3.0, w: 11.4, h: 0.5, fontFace: '微软雅黑', fontSize: 15, color: '555555' });
  CONTENT.points.forEach((p, i) => {
    const y = 3.85 + i * 0.78;
    s.addText('0' + (i + 1), { x: M, y: y + 0.06, w: 0.6, h: 0.3, fontFace: 'Consolas', fontSize: 12, bold: true, color: 'E2402E' });
    s.addText(p[0], { x: M + 0.75, y, w: 3.2, h: 0.4, fontFace: '微软雅黑', fontSize: 17, bold: true, color: '0A0A0A' });
    s.addText(p[1], { x: M + 4.1, y: y + 0.04, w: 7.2, h: 0.4, fontFace: '微软雅黑', fontSize: 12.5, color: '6A6A6A' });
  });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 6.85, w: 11.4, h: 0.02, fill: { color: 'E0E0E0' } });
  s.addText(CONTENT.stats.map(v => v[0]).join('   ·   '), { x: M, y: 6.98, w: 11.4, h: 0.3, fontFace: 'Consolas', fontSize: 11, color: '8A8A8A' });
}

/* ============ B. 深色发布会：暗底 + 辉光 + 玻璃卡 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: '0A0E17' };
  // 两团辉光（半透明大圆）
  s.addShape(pptx.ShapeType.ellipse, { x: -1.6, y: -2.2, w: 7.4, h: 7.4, fill: { color: '2A5BE0', transparency: 82 }, line: { color: '2A5BE0', transparency: 100 } });
  s.addShape(pptx.ShapeType.ellipse, { x: 8.4, y: 3.4, w: 7.0, h: 7.0, fill: { color: '00A99D', transparency: 88 }, line: { color: '00A99D', transparency: 100 } });
  s.addShape(pptx.ShapeType.roundRect, { x: M, y: 0.95, w: 11.5, h: 5.6, rectRadius: 0.12, fill: { color: '141A28', transparency: 12 }, line: { color: '2E3A55', width: 1 } });
  s.addText(CONTENT.kicker, { x: M + 0.55, y: 1.28, w: 9.5, h: 0.3, fontFace: '微软雅黑', fontSize: 10.5, color: '7FA4FF', charSpacing: 1.5 });
  s.addText(CONTENT.title, { x: M + 0.5, y: 1.62, w: 10.5, h: 1.1, fontFace: '微软雅黑', fontSize: 44, bold: true, color: 'FFFFFF' });
  s.addText(CONTENT.sub, { x: M + 0.55, y: 2.72, w: 10.4, h: 0.42, fontFace: '微软雅黑', fontSize: 14, color: 'A9B6D0' });
  CONTENT.points.forEach((p, i) => {
    const x = M + 0.5 + i * 3.62;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 3.42, w: 3.4, h: 1.85, rectRadius: 0.08, fill: { color: '1B2334', transparency: 8 }, line: { color: '33405C' } });
    s.addText(p[0], { x: x + 0.24, y: 3.62, w: 2.95, h: 0.4, fontFace: '微软雅黑', fontSize: 15, bold: true, color: 'FFFFFF' });
    s.addText(p[1], { x: x + 0.24, y: 4.06, w: 2.95, h: 1.1, fontFace: '微软雅黑', fontSize: 11, color: 'A9B6D0', lineSpacingMultiple: 1.3 });
  });
  s.addText(CONTENT.stats.map(v => v[0]).join('     '), { x: M + 0.55, y: 5.72, w: 10.4, h: 0.4, fontFace: 'Consolas', fontSize: 15, bold: true, color: '7FA4FF' });
}

/* ============ C. 撞色海报：色块、粗黑、远景可读 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: 'F4EFE6' };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 4.55, h: H, fill: { color: '111111' } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.5, w: 4.55, h: 2.0, fill: { color: 'FF5A3C' } });
  s.addText('VOCAB\nMEASURED', { x: 0.55, y: 0.7, w: 3.6, h: 2.2, fontFace: 'Arial Black', fontSize: 30, bold: true, color: 'FFFFFF', lineSpacingMultiple: 0.95 });
  s.addText('不是背单词\n是测准 + 开方', { x: 0.55, y: 5.75, w: 3.6, h: 1.5, fontFace: '微软雅黑', fontSize: 17, bold: true, color: 'FFFFFF', lineSpacingMultiple: 1.2 });
  s.addText(CONTENT.kicker, { x: 4.95, y: 0.62, w: 7.6, h: 0.3, fontFace: '微软雅黑', fontSize: 10, color: '7A7266', charSpacing: 1 });
  s.addText(CONTENT.title, { x: 4.9, y: 1.0, w: 7.7, h: 1.7, fontFace: '微软雅黑', fontSize: 42, bold: true, color: '111111', lineSpacingMultiple: 1.05 });
  s.addShape(pptx.ShapeType.rect, { x: 4.95, y: 2.78, w: 1.5, h: 0.1, fill: { color: 'FF5A3C' } });
  s.addText(CONTENT.sub, { x: 4.95, y: 3.02, w: 7.6, h: 0.45, fontFace: '微软雅黑', fontSize: 13.5, color: '4A443C' });
  CONTENT.points.forEach((p, i) => {
    const y = 3.68 + i * 0.72;
    s.addText('／', { x: 4.95, y, w: 0.3, h: 0.36, fontFace: '微软雅黑', fontSize: 16, bold: true, color: 'FF5A3C' });
    s.addText(p[0], { x: 5.32, y, w: 3.0, h: 0.36, fontFace: '微软雅黑', fontSize: 16.5, bold: true, color: '111111' });
    s.addText(p[1], { x: 8.45, y: y + 0.03, w: 4.2, h: 0.34, fontFace: '微软雅黑', fontSize: 11, color: '5E574E' });
  });
  s.addShape(pptx.ShapeType.rect, { x: 4.95, y: 6.12, w: 7.7, h: 0.9, fill: { color: '1B4DFF' } });
  s.addText(CONTENT.stats.map(v => v[0]).join('  ·  '), { x: 5.2, y: 6.4, w: 7.2, h: 0.35, fontFace: 'Consolas', fontSize: 14, bold: true, color: 'FFFFFF' });
}

/* ============ D. 编辑部：衬线标题、细格线、克制 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: 'FBFAF7' };
  s.addText('CET · VOCABULARY PROFILER', { x: M, y: 0.6, w: 8, h: 0.3, fontFace: 'Consolas', fontSize: 10, color: '9A9488', charSpacing: 3 });
  s.addText(CONTENT.title, { x: M, y: 1.0, w: 11.4, h: 1.2, fontFace: '宋体', fontSize: 46, bold: true, color: '1A1A17' });
  s.addText(CONTENT.sub, { x: M, y: 2.28, w: 11.0, h: 0.5, fontFace: '宋体', fontSize: 15, color: '5F5A50', italic: true });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 3.0, w: 11.4, h: 0.012, fill: { color: '1A1A17' } });
  CONTENT.points.forEach((p, i) => {
    const y = 3.24 + i * 0.92;
    s.addText(['一', '二', '三'][i], { x: M, y, w: 0.5, h: 0.35, fontFace: '宋体', fontSize: 13, color: '0E4D3C' });
    s.addText(p[0], { x: M + 0.55, y, w: 3.4, h: 0.35, fontFace: '宋体', fontSize: 17, bold: true, color: '1A1A17' });
    s.addText(p[1], { x: M + 4.1, y: y + 0.02, w: 7.3, h: 0.5, fontFace: '宋体', fontSize: 12.5, color: '5F5A50' });
    if (i < 2) s.addShape(pptx.ShapeType.rect, { x: M, y: y + 0.72, w: 11.4, h: 0.008, fill: { color: 'DAD5C9' } });
  });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 6.3, w: 11.4, h: 0.9, fill: { color: '0E4D3C' } });
  s.addText('7,175 词条     9,204 例句     387 条断言     2.08 MB 单文件 · 断网可用', {
    x: M + 0.3, y: 6.6, w: 10.8, h: 0.35, fontFace: '宋体', fontSize: 12.5, color: 'FFFFFF',
  });
}

/* ============ E. 与产品同源的玻璃风（当前答辩稿风格） ============ */
{
  const s = pptx.addSlide();
  s.background = { color: 'EDF0F6' };
  s.addShape(pptx.ShapeType.ellipse, { x: 8.6, y: -2.0, w: 6.6, h: 6.6, fill: { color: '2A5BE0', transparency: 92 }, line: { color: '2A5BE0', transparency: 100 } });
  s.addShape(pptx.ShapeType.ellipse, { x: -1.8, y: 3.6, w: 6.0, h: 6.0, fill: { color: '00A99D', transparency: 93 }, line: { color: '00A99D', transparency: 100 } });
  s.addText(CONTENT.kicker, { x: M, y: 0.62, w: 9, h: 0.3, fontFace: '微软雅黑', fontSize: 10.5, bold: true, color: '2A5BE0' });
  s.addText(CONTENT.title, { x: M, y: 0.98, w: 11.4, h: 1.0, fontFace: '微软雅黑', fontSize: 40, bold: true, color: '101319' });
  s.addShape(pptx.ShapeType.rect, { x: M, y: 2.0, w: 0.7, h: 0.055, fill: { color: '2A5BE0' } });
  s.addText(CONTENT.sub, { x: M, y: 2.16, w: 11.2, h: 0.42, fontFace: '微软雅黑', fontSize: 13.5, color: '575E6B' });
  CONTENT.points.forEach((p, i) => {
    const x = M + i * 3.86;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 2.86, w: 3.6, h: 2.25, rectRadius: 0.09, fill: { color: 'FFFFFF', transparency: 6 }, line: { color: 'D5DEEF', width: 1 } });
    s.addText('0' + (i + 1), { x: x + 0.26, y: 3.02, w: 1.0, h: 0.28, fontFace: 'Consolas', fontSize: 11, bold: true, color: '2A5BE0' });
    s.addText(p[0], { x: x + 0.26, y: 3.3, w: 3.1, h: 0.4, fontFace: '微软雅黑', fontSize: 16, bold: true, color: '101319' });
    s.addText(p[1], { x: x + 0.26, y: 3.78, w: 3.1, h: 1.1, fontFace: '微软雅黑', fontSize: 11, color: '575E6B', lineSpacingMultiple: 1.3 });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: M, y: 5.5, w: 11.5, h: 1.0, rectRadius: 0.07, fill: { color: 'FFFFFF', transparency: 12 }, line: { color: 'D5DEEF' } });
  CONTENT.stats.forEach((v, i) => {
    const x = M + 0.35 + i * 2.85;
    s.addText(v[0], { x, y: 5.66, w: 2.5, h: 0.4, fontFace: 'Consolas', fontSize: 19, bold: true, color: '2A5BE0' });
    s.addText(v[1], { x, y: 6.06, w: 2.5, h: 0.3, fontFace: '微软雅黑', fontSize: 10.5, color: '6B7280' });
  });
}

/* ============ F. 撞色但克制（我推荐的那版）：米白 + 顶部深色带 + 橙色高亮 + 底部数据带 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: 'FAF8F4' };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.42, fill: { color: '12130F' } });
  s.addText('CET VOCABULARY PROFILER ／ 词汇量检测', { x: M, y: 0.1, w: 8, h: 0.24, fontFace: 'Consolas', fontSize: 9.5, color: 'F0EDE6', charSpacing: 2 });
  s.addText('筑视界 · 码绘交互 ／ Web 前端开发创意技能大赛', { x: W - M - 6.4, y: 0.1, w: 6.4, h: 0.24, fontFace: '微软雅黑', fontSize: 9.5, color: 'BDB6A8', align: 'right' });
  s.addText(CONTENT.title, { x: M, y: 1.15, w: 11.5, h: 1.35, fontFace: '微软雅黑', fontSize: 58, bold: true, color: '12130F', charSpacing: -1.5, lineSpacingMultiple: 1.0 });
  s.addText(CONTENT.sub, { x: M, y: 2.62, w: 11.2, h: 0.45, fontFace: '微软雅黑', fontSize: 14.5, color: '5E574E' });
  CONTENT.points.forEach((p, i) => {
    const x = M + i * 3.9;
    s.addShape(pptx.ShapeType.rect, { x, y: 3.42, w: 0.85, h: 0.075, fill: { color: 'FF4D2E' } });
    s.addText(p[0], { x, y: 3.62, w: 3.5, h: 0.45, fontFace: '微软雅黑', fontSize: 20, bold: true, color: '12130F' });
    s.addText(p[1], { x, y: 4.16, w: 3.45, h: 1.0, fontFace: '微软雅黑', fontSize: 12.5, color: '625B51', lineSpacingMultiple: 1.35 });
  });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.62, w: W, h: 1.28, fill: { color: '12130F' } });
  CONTENT.stats.forEach((v, i) => {
    const x = M + i * 3.05;
    s.addText(v[0], { x, y: 5.86, w: 2.8, h: 0.5, fontFace: 'Consolas', fontSize: 24, bold: true, color: 'FFFFFF' });
    s.addText(v[1], { x, y: 6.36, w: 2.8, h: 0.3, fontFace: '微软雅黑', fontSize: 10.5, color: 'A29A8C' });
  });
  s.addShape(pptx.ShapeType.rect, { x: W - M - 0.42, y: 1.2, w: 0.42, h: 0.42, fill: { color: 'FF4D2E' } });
}
await pptx.writeFile({ fileName: OUT });
console.log('已生成风格试片:', OUT, '(' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB, 5 页)');
