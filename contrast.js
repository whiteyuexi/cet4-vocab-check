function lum(hex){const c=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];}
function r(a,b){const l1=lum(a),l2=lum(b);return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05));}
console.log('浅色主题（背景 #ffffff / 卡片内 #f4f6fc）');
for(const c of ['98a0b8','7c86a3','6b7590','667090','5f6982']) console.log('  text3 #'+c+' vs 白底 = '+r(c,'ffffff').toFixed(2)+' | vs card2 #f4f6fc = '+r(c,'f4f6fc').toFixed(2));
console.log('深色主题');
for(const c of ['6e7893','8b95b0','949eba','9aa4bf']) console.log('  text3 #'+c+' vs card #191e2e = '+r(c,'191e2e').toFixed(2)+' | vs bg #0e1119 = '+r(c,'0e1119').toFixed(2));
console.log('其他关键色（白底）: text2 #5b6480 =', r('5b6480','ffffff').toFixed(2), '| 主色 #5a67ff =', r('5a67ff','ffffff').toFixed(2), '| ok #16b364 =', r('16b364','ffffff').toFixed(2), '| mid #f5a524 =', r('f5a524','ffffff').toFixed(2), '| no #f04438 =', r('f04438','ffffff').toFixed(2));
