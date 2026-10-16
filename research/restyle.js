const fs=require('fs');
const f=process.argv[2];
let t=fs.readFileSync(f,'utf8');
const eol=t.indexOf('\r\n')>=0?'\r\n':'\n';
const L=t.split(/\r?\n/);
if(L[6].trim()!=='<style>'){console.error('第7行不是 <style>，实际: '+L[6]);process.exit(1);}
const end=L.findIndex((x,i)=>i>6&&x.trim()==='</style>');
if(end<0){console.error('找不到 </style>');process.exit(1);}
const css=fs.readFileSync(process.argv[3],'utf8').split(/\r?\n/);
const out=L.slice(0,7).concat(css, L.slice(end));
fs.writeFileSync(f,out.join(eol));
console.log('已替换样式块：原 '+ (end-7) +' 行 -> 新 '+ css.length +' 行');
