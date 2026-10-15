const fs=require('fs');
const w=JSON.parse(fs.readFileSync('words.json','utf8'));
const bad=[];
const seen=new Set();
for(const x of w){
  const k=x.w.toLowerCase();
  if(seen.has(k)) bad.push('DUP:'+x.w); seen.add(k);
  if(!/^[A-Za-z][A-Za-z'\-\. ]*$/.test(x.w)) bad.push('BADWORD:'+x.w);
  if(!x.t || !x.t.trim()) bad.push('NOMEANING:'+x.w);
  if(/^[a-z]+\.$/.test(x.t.trim())) bad.push('POSONLY:'+x.w+':'+x.t);
  if(/[\[\]{}<>]/.test(x.t)) bad.push('BRACKET:'+x.w+':'+x.t);
}
console.log('problems:', bad.length); console.log(bad.slice(0,20).join('\n'));
console.log('--- core/ext:', w.filter(x=>!x.x).length, w.filter(x=>x.x).length);
console.log('--- ext samples:', w.filter(x=>x.x).slice(0,6).map(x=>x.w+'='+x.t).join(' | '));
const lens=w.map(x=>x.t.length);
console.log('meaning len: avg',(lens.reduce((a,b)=>a+b,0)/lens.length).toFixed(1),'max',Math.max(...lens));
console.log('longest meanings:'); w.slice().sort((a,b)=>b.t.length-a.t.length).slice(0,5).forEach(x=>console.log('  ',x.w,'::',x.t));
console.log('--- group count (100/group):', Math.ceil(w.length/100));
console.log('--- 首字母分布:', Object.entries(w.reduce((m,x)=>{const c=x.w[0].toUpperCase();m[c]=(m[c]||0)+1;return m;},{})).sort().map(([k,v])=>k+v).join(' '));
console.log('--- 20 random ---');
for(let i=0;i<20;i++){const x=w[Math.floor(Math.random()*w.length)];console.log('  ',x.w,'|',x.p||'-','|',x.t);}
