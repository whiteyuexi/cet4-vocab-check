const fs=require('fs');const F='scripts/make-whale-sprites.mjs';let s=fs.readFileSync(F,'utf8');
s=s.replace("const f = path.join(process.cwd(), SRC, 'dsh-whale-state-' + st + '.webp').replace(/\\\\/g, '/');",
  "const url = 'http://127.0.0.1:8787/' + SRC + '/dsh-whale-state-' + st + '.webp';");
s=s.replace("img.src=\"file:///' + f + '\"", "img.src=\"' + url + '\"");
fs.writeFileSync(F,s);console.log('已改为走本地 HTTP');