// 检查 PNG 是否真的带透明（解 IHDR + IDAT，还原扫描线）
import fs from 'node:fs';
import zlib from 'node:zlib';

function decode(file) {
  const b = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p); const type = b.toString('ascii', p + 4, p + 8);
    const data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) return { w, h, ctype, note: 'depth=' + depth + ' interlace=' + interlace };
  const bpp = ctype === 6 ? 4 : ctype === 2 ? 3 : 0;
  if (!bpp) return { w, h, ctype, note: '不是 RGB/RGBA' };
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, bb = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += bb; else if (ft === 3) v += (a + bb) >> 1;
      else if (ft === 4) { const pa = Math.abs(bb - c), pb = Math.abs(a - c), pc = Math.abs(a + bb - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c); }
      cur[i] = v & 255;
    }
    cur.copy(out, y * stride); prev = cur;
  }
  const px = (x, y) => { const o = y * stride + x * bpp; return [out[o], out[o + 1], out[o + 2], bpp === 4 ? out[o + 3] : 255]; };
  let transparent = 0, total = 0;
  for (let y = 0; y < h; y += 7) for (let x = 0; x < w; x += 7) { total++; if (px(x, y)[3] < 16) transparent++; }
  return { w, h, ctype, corner: px(3, 3), center: px(w >> 1, h >> 1), transparentPct: Math.round(transparent / total * 100) };
}

for (const f of process.argv.slice(2)) {
  const r = decode(f);
  console.log(f.split(/[\\/]/).pop().padEnd(12) + r.w + 'x' + r.h +
    '  角落RGBA=[' + r.corner.join(',') + ']  中心RGBA=[' + r.center.join(',') + ']' +
    '  透明像素占比 ' + r.transparentPct + '%' + (r.note ? '  ' + r.note : ''));
}
