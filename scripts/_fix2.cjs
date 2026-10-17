const fs=require('fs');const F='scripts/make-whale-sprites.mjs';let s=fs.readFileSync(F,'utf8');
// 先导航到同源页面，否则 canvas 被跨域图片污染，toDataURL 会抛 SecurityError
s=s.replace("await send('Page.enable'); await send('Runtime.enable');",
  "await send('Page.enable'); await send('Runtime.enable');\n  await send('Page.navigate', { url: 'http://127.0.0.1:8787/' });\n  await sleep(2500);");
// 把异常信息带回来，别再显示 [object Object]
s=s.replace('\'(async()=>{const img=new Image();', '\'(async()=>{try{const img=new Image();');
s=s.replace(\"'return c.toDataURL(\\\"image/webp\\\",0.82);})()'\", \"'return c.toDataURL(\\\"image/webp\\\",0.82);}catch(e){return \\\"ERR:\\\"+e.message}})()'\");
fs.writeFileSync(F,s);console.log('已改为同源 + 带回异常');