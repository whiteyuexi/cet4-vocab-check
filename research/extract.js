const fs=require('fs'),path=require('path');
const src=process.argv[2], out=process.argv[3];
const t=fs.readFileSync(src,'utf8');
const style=t.slice(t.indexOf('<style>'), t.indexOf('</style>')+8);
const a=t.indexOf('<h3>3.4 界面与交互设计');
const b=t.indexOf('<h2 id="s4">');
if(a<0||b<0){console.error('定位失败 a='+a+' b='+b);process.exit(1);}
const body=t.slice(a,b);
const html='<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">'+style+
 '</head><body><div class="page">'+body+'</div></body></html>';
fs.writeFileSync(out, html);
console.log('抽取 '+body.length+' 字节');
